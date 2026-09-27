import { access, readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CandidateValidator } from '../core/validator'
import type { SpecializedVariantGroup } from '../core/types'

interface TailwindVariant {
  kind: string
  root?: string
  variant?: TailwindVariant
}

interface TailwindDesignSystem {
  candidatesToCss(classes: string[]): Array<string | null>
  getVariants?(): Array<{ name: string; values: string[] }>
  theme?: { prefix: string | null }
  parseVariant?(variant: string): TailwindVariant | null
}

interface TailwindModule {
  __unstable__loadDesignSystem?: (
    css: string,
    options: {
      base: string
      from: string
      loadModule: (
        id: string,
        base: string,
        resourceHint: 'plugin' | 'config',
      ) => Promise<{ path: string; base: string; module: unknown }>
      loadStylesheet: (
        id: string,
        base: string,
      ) => Promise<{ path: string; base: string; content: string }>
    },
  ) => Promise<TailwindDesignSystem>
}

interface TailwindInstall {
  root: string
  version: string
  packageRoot: string
  modulePath: string
}

interface StylesheetNode {
  path: string
  imports: string[]
  hasDirectTailwind: boolean
}

export interface TailwindProject {
  root: string
  version: string
  entrypoint: string
  validator: CandidateValidator
}

const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
])

const stylesheetExtensions = new Set(['.css', '.pcss', '.postcss'])

const relationshipVariantRoots = new Set(['group', 'peer', 'has', 'in'])
const attributeVariantRoots = new Set(['data', 'aria'])
const pseudoElementVariantRoots = new Set([
  'before',
  'after',
  'first-letter',
  'first-line',
  'marker',
  'selection',
  'file',
  'placeholder',
  'backdrop',
])
const environmentVariantRoots = new Set([
  'dark',
  'motion-safe',
  'motion-reduce',
  'contrast-more',
  'contrast-less',
  'forced-colors',
  'inverted-colors',
  'portrait',
  'landscape',
  'print',
  'noscript',
  'supports',
  'pointer-fine',
  'pointer-coarse',
  'pointer-none',
  'any-pointer-fine',
  'any-pointer-coarse',
  'any-pointer-none',
])

class DesignSystemValidator implements CandidateValidator {
  private cache = new Map<string, boolean>()
  // A validator belongs to one loaded CSS design system. Project invalidation
  // replaces it, including cached null results for generic/unknown variants.
  private variantClassifications = new Map<string, SpecializedVariantGroup | null>()
  private breakpoints = new Set<string>()
  private containers = new Set<string>()

  constructor(private designSystem: TailwindDesignSystem) {
    for (const variant of designSystem.getVariants?.() ?? []) {
      if (variant.name === 'min' || variant.name === 'max') {
        for (const value of variant.values) this.breakpoints.add(value)
      }
      if (variant.name === '@' || variant.name === '@min' || variant.name === '@max') {
        for (const value of variant.values) this.containers.add(value)
      }
    }
  }

  getValidCandidates(candidates: readonly string[]): ReadonlySet<string> {
    const uncached: string[] = []

    for (const candidate of candidates) {
      if (!this.cache.has(candidate)) uncached.push(candidate)
    }

    if (uncached.length > 0) {
      const compiled = this.designSystem.candidatesToCss(uncached)
      for (let index = 0; index < uncached.length; index++) {
        this.cache.set(uncached[index]!, compiled[index] != null)
      }
    }

    return new Set(candidates.filter((candidate) => this.cache.get(candidate) === true))
  }

  isBreakpointVariant(variant: string): boolean {
    const base = variant.split('/')[0] ?? variant
    if (this.breakpoints.has(base)) return true

    const range = /^(?:min|max)-(.+)$/.exec(base)
    if (range && (range[1]?.startsWith('[') || this.breakpoints.has(range[1]!))) return true

    if (base.startsWith('@')) {
      if (/^@\[[^\]]+\]$/.test(base)) return true

      const container = /^@(?:(?:min|max)-)?(.+)$/.exec(base)
      if (container && this.containers.has(container[1]!)) return true
    }

    return false
  }

  getPrefix(): string | null {
    return this.designSystem.theme?.prefix ?? null
  }

  classifyVariant(variant: string): SpecializedVariantGroup | null {
    const cached = this.variantClassifications.get(variant)
    if (cached !== undefined) return cached

    const classification = this.classifyUncachedVariant(variant)
    this.variantClassifications.set(variant, classification)
    return classification
  }

  private classifyUncachedVariant(variant: string): SpecializedVariantGroup | null {
    const parsed = this.designSystem.parseVariant?.(variant)
    if (parsed?.kind === 'arbitrary') return 'arbitraryVariant'

    const root = parsed?.root ?? variant.split(/[-/]/, 1)[0] ?? variant
    if (relationshipVariantRoots.has(root)) return 'relationshipVariant'
    if (attributeVariantRoots.has(root)) return 'attributeVariant'
    if (pseudoElementVariantRoots.has(root)) return 'pseudoElementVariant'
    if (environmentVariantRoots.has(root)) return 'environmentVariant'
    return null
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function majorVersion(version: string): number | null {
  const match = /^(\d+)/.exec(version)
  return match ? Number(match[1]) : null
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')
}

async function resolveTailwindInstall(
  documentPath: string,
  workspaceRoot?: string,
): Promise<TailwindInstall | null> {
  if (!path.isAbsolute(documentPath)) return null

  let directory = path.dirname(documentPath)
  const boundary = workspaceRoot ? path.resolve(workspaceRoot) : null
  if (boundary && !isWithin(boundary, directory)) return null

  while (true) {
    const packageJson = path.join(directory, 'package.json')
    if (await exists(packageJson)) {
      try {
        const projectRequire = createRequire(packageJson)
        const tailwindPackageJson = projectRequire.resolve('tailwindcss/package.json')
        const metadata = JSON.parse(await readFile(tailwindPackageJson, 'utf8')) as {
          version?: unknown
        }

        if (typeof metadata.version === 'string') {
          return {
            root: directory,
            version: metadata.version,
            packageRoot: path.dirname(tailwindPackageJson),
            modulePath: projectRequire.resolve('tailwindcss'),
          }
        }
      } catch {
        // Keep walking. A parent workspace package may own Tailwind.
      }
    }

    if (boundary && directory === boundary) return null
    const parent = path.dirname(directory)
    if (parent === directory) return null
    if (boundary && !isWithin(boundary, parent)) return null
    directory = parent
  }
}

async function collectStylesheets(root: string): Promise<string[]> {
  const stylesheets: string[] = []
  const queue = [root]

  while (queue.length > 0) {
    const directory = queue.shift()!
    let entries

    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) queue.push(entryPath)
        continue
      }

      if (entry.isFile() && stylesheetExtensions.has(path.extname(entry.name).toLowerCase())) {
        stylesheets.push(entryPath)
      }
    }
  }

  return stylesheets
}

function pathDistance(from: string, to: string): number {
  const relative = path.relative(from, to)
  if (!relative) return 0
  return relative.split(path.sep).filter(Boolean).length
}

function importsTailwind(content: string): boolean {
  return /@import\s+(?:url\(\s*)?["']tailwindcss["']/m.test(content)
}

function relativeStylesheetImports(
  filePath: string,
  content: string,
  stylesheets: ReadonlySet<string>,
): string[] {
  const imports: string[] = []
  const pattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g

  for (const match of content.matchAll(pattern)) {
    const id = match[1]
    if (!id?.startsWith('.')) continue

    const resolved = path.resolve(path.dirname(filePath), id)
    const candidates = path.extname(resolved)
      ? [resolved]
      : [`${resolved}.css`, `${resolved}.pcss`, `${resolved}.postcss`]
    const target = candidates.find((candidate) => stylesheets.has(candidate))
    if (target) imports.push(target)
  }

  return imports
}

async function discoverV4Entrypoints(root: string): Promise<string[]> {
  const stylesheets = await collectStylesheets(root)
  const stylesheetSet = new Set(stylesheets)
  const nodes = new Map<string, StylesheetNode>()

  for (const stylesheet of stylesheets) {
    let content: string
    try {
      content = await readFile(stylesheet, 'utf8')
    } catch {
      continue
    }

    nodes.set(stylesheet, {
      path: stylesheet,
      imports: relativeStylesheetImports(stylesheet, content, stylesheetSet),
      hasDirectTailwind: importsTailwind(content),
    })
  }

  const tailwindMemo = new Map<string, boolean>()
  const reachesTailwind = (filePath: string, visiting = new Set<string>()): boolean => {
    const memoized = tailwindMemo.get(filePath)
    if (memoized != null) return memoized
    if (visiting.has(filePath)) return false

    const node = nodes.get(filePath)
    if (!node) return false
    if (node.hasDirectTailwind) {
      tailwindMemo.set(filePath, true)
      return true
    }

    visiting.add(filePath)
    const result = node.imports.some((imported) => reachesTailwind(imported, visiting))
    visiting.delete(filePath)
    tailwindMemo.set(filePath, result)
    return result
  }

  const importers = new Map<string, string[]>()
  for (const node of nodes.values()) {
    for (const imported of node.imports) {
      const current = importers.get(imported) ?? []
      current.push(node.path)
      importers.set(imported, current)
    }
  }

  const tailwindStylesheets = [...nodes.values()].filter((node) => reachesTailwind(node.path))
  const roots = tailwindStylesheets.filter(
    (node) => !(importers.get(node.path) ?? []).some((importer) => reachesTailwind(importer)),
  )
  return (roots.length > 0 ? roots : tailwindStylesheets).map((node) => node.path)
}

function selectV4Entrypoint(candidates: readonly string[], documentPath: string): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let ambiguous = false

  for (const candidate of candidates) {
    const distance = pathDistance(path.dirname(candidate), path.dirname(documentPath))
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      ambiguous = false
    } else if (distance === bestDistance) {
      ambiguous = true
    }
  }

  return ambiguous ? null : best
}

async function resolveStylesheetPath(
  id: string,
  base: string,
  install: TailwindInstall,
): Promise<string> {
  if (id === 'tailwindcss') return path.join(install.packageRoot, 'index.css')

  if (id.startsWith('tailwindcss/')) {
    const subpath = id.slice('tailwindcss/'.length)
    const fileName = subpath.endsWith('.css') ? subpath : `${subpath}.css`
    return path.join(install.packageRoot, fileName)
  }

  if (id.startsWith('.') || path.isAbsolute(id)) {
    const resolved = path.isAbsolute(id) ? id : path.resolve(base, id)
    if (await exists(resolved)) return resolved
    if (!path.extname(resolved) && (await exists(`${resolved}.css`))) return `${resolved}.css`
    throw new Error(`Unable to resolve stylesheet '${id}' from '${base}'`)
  }

  const baseRequire = createRequire(path.join(base, '__tailwind-class-highlighting__.cjs'))
  return baseRequire.resolve(id)
}

async function loadV4Project(
  install: TailwindInstall,
  entrypoint: string,
): Promise<TailwindProject> {
  const projectRequire = createRequire(path.join(install.root, 'package.json'))
  const tailwind = projectRequire(install.modulePath) as TailwindModule
  if (typeof tailwind.__unstable__loadDesignSystem !== 'function') {
    throw new Error(`Tailwind ${install.version} does not expose __unstable__loadDesignSystem`)
  }

  const css = await readFile(entrypoint, 'utf8')
  const designSystem = await tailwind.__unstable__loadDesignSystem(css, {
    base: path.dirname(entrypoint),
    from: entrypoint,
    async loadStylesheet(id, base) {
      const stylesheetPath = await resolveStylesheetPath(id, base, install)
      return {
        path: stylesheetPath,
        base: path.dirname(stylesheetPath),
        content: await readFile(stylesheetPath, 'utf8'),
      }
    },
    async loadModule(id, base) {
      const baseRequire = createRequire(path.join(base, '__tailwind-class-highlighting__.cjs'))
      const modulePath = baseRequire.resolve(id)
      const loaded = (await import(pathToFileURL(modulePath).href)) as { default?: unknown }
      return {
        path: modulePath,
        base: path.dirname(modulePath),
        module: loaded.default ?? loaded,
      }
    },
  })

  return {
    root: install.root,
    version: install.version,
    entrypoint,
    validator: new DesignSystemValidator(designSystem),
  }
}

export class TailwindProjectManager {
  private documents = new Map<string, Promise<TailwindProject | null>>()
  private projects = new Map<string, Promise<TailwindProject | null>>()
  private entrypoints = new Map<string, Promise<string[]>>()

  getProject(documentPath: string, workspaceRoot?: string): Promise<TailwindProject | null> {
    const key = `${workspaceRoot ?? ''}\0${path.dirname(documentPath)}`
    let project = this.documents.get(key)
    if (!project) {
      project = this.resolveProject(documentPath, workspaceRoot)
      this.documents.set(key, project)
    }
    return project
  }

  invalidateAll(): void {
    this.documents.clear()
    this.projects.clear()
    this.entrypoints.clear()
  }

  private async resolveProject(
    documentPath: string,
    workspaceRoot?: string,
  ): Promise<TailwindProject | null> {
    const install = await resolveTailwindInstall(documentPath, workspaceRoot)
    if (!install) return null
    if (majorVersion(install.version) !== 4) return null

    let entrypoints = this.entrypoints.get(install.root)
    if (!entrypoints) {
      entrypoints = discoverV4Entrypoints(install.root)
      this.entrypoints.set(install.root, entrypoints)
    }

    const entrypoint = selectV4Entrypoint(await entrypoints, documentPath)
    if (!entrypoint) return null

    const key = entrypoint
    let project = this.projects.get(key)
    if (!project) {
      project = this.loadProject(install, entrypoint)
      this.projects.set(key, project)
    }
    return project
  }

  private async loadProject(
    install: TailwindInstall,
    entrypoint: string,
  ): Promise<TailwindProject | null> {
    try {
      return await loadV4Project(install, entrypoint)
    } catch (error) {
      console.warn(
        `[Tailwind Class Highlighting] Failed to load Tailwind ${install.version} project at ${install.root}`,
        error,
      )
      return null
    }
  }
}
