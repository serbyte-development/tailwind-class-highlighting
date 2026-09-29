import { access, readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SpecializedVariantGroup } from '../core/types'
import type { CandidateValidator } from '../core/validator'

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
  __unstable__loadDesignSystem: (
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

interface LoadedTailwindProject {
  project: TailwindProject
  stylesheetDependencies: ReadonlySet<string>
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
const filesystemBatchSize = 32

const stylesheetExtensions = new Set(['.css', '.pcss', '.postcss'])
const breakpointRangePattern = /^(?:min|max)-(.+)$/
const arbitraryContainerPattern = /^@(?:(?:min|max)-)?\[[^\]]+\]$/
const containerVariantPattern = /^@(?:(?:min|max)-)?(.+)$/
const standardBreakpointVariantRoots = new Set(['min', 'max', '@', '@min', '@max'])
const variantRootSeparatorPattern = /[-/]/
const majorVersionPattern = /^(\d+)/
const tailwindImportPattern = /@import\s+(?:url\(\s*)?["']tailwindcss["']/m
const stylesheetImportPattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g
const cssCommentPattern = /\/\*[\s\S]*?\*\//g

const relationshipVariantRoots = new Set(['group', 'peer', 'has', 'in', '*', '**'])
const attributeVariantRoots = new Set(['data', 'aria', 'open', 'rtl', 'ltr', 'inert'])
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
  'details-content',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTailwindModule(value: unknown): value is TailwindModule {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false
  }
  return (
    '__unstable__loadDesignSystem' in value &&
    typeof value.__unstable__loadDesignSystem === 'function'
  )
}

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
        for (const value of variant.values) {
          this.breakpoints.add(value)
        }
      }
      if (variant.name === '@' || variant.name === '@min' || variant.name === '@max') {
        for (const value of variant.values) {
          this.containers.add(value)
        }
      }
    }
  }

  getValidCandidates(candidates: readonly string[]): ReadonlySet<string> {
    const uncached: string[] = []

    for (const candidate of candidates) {
      if (!this.cache.has(candidate)) {
        uncached.push(candidate)
      }
    }

    if (uncached.length > 0) {
      const compiled = this.designSystem.candidatesToCss(uncached)
      for (const [index, candidate] of uncached.entries()) {
        this.cache.set(candidate, compiled[index] != null)
      }
    }

    return new Set(candidates.filter((candidate) => this.cache.get(candidate) === true))
  }

  isBreakpointVariant(variant: string): boolean {
    const parsedRoot = this.designSystem.parseVariant?.(variant)?.root
    if (parsedRoot && standardBreakpointVariantRoots.has(parsedRoot)) {
      return true
    }

    const base = variant.split('/')[0] ?? variant
    if (this.breakpoints.has(base)) {
      return true
    }

    const rangeValue = breakpointRangePattern.exec(base)?.[1]
    if (rangeValue && (rangeValue.startsWith('[') || this.breakpoints.has(rangeValue))) {
      return true
    }

    if (base.startsWith('@')) {
      if (arbitraryContainerPattern.test(base)) {
        return true
      }

      const containerName = containerVariantPattern.exec(base)?.[1]
      if (containerName && this.containers.has(containerName)) {
        return true
      }
    }

    return false
  }

  getPrefix(): string | null {
    return this.designSystem.theme?.prefix ?? null
  }

  classifyVariant(variant: string): SpecializedVariantGroup | null {
    const cached = this.variantClassifications.get(variant)
    if (cached !== undefined) {
      return cached
    }

    const classification = this.classifyUncachedVariant(variant)
    this.variantClassifications.set(variant, classification)
    return classification
  }

  private classifyUncachedVariant(variant: string): SpecializedVariantGroup | null {
    const parsed = this.designSystem.parseVariant?.(variant)
    if (parsed?.kind === 'arbitrary') {
      return 'arbitraryVariant'
    }

    const root = parsed?.root ?? variant.split(variantRootSeparatorPattern, 1)[0] ?? variant
    if (relationshipVariantRoots.has(root)) {
      return 'relationshipVariant'
    }
    if (attributeVariantRoots.has(root)) {
      return 'attributeVariant'
    }
    if (pseudoElementVariantRoots.has(root)) {
      return 'pseudoElementVariant'
    }
    if (environmentVariantRoots.has(root)) {
      return 'environmentVariant'
    }
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
  const major = majorVersionPattern.exec(version)?.[1]
  return major ? Number(major) : null
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')
}

async function resolveTailwindInstall(
  documentPath: string,
  workspaceRoot?: string,
): Promise<TailwindInstall | null> {
  if (!path.isAbsolute(documentPath)) {
    return null
  }

  let directory = path.dirname(documentPath)
  const boundary = workspaceRoot ? path.resolve(workspaceRoot) : null
  if (boundary && !isWithin(boundary, directory)) {
    return null
  }

  while (true) {
    const packageJson = path.join(directory, 'package.json')
    // biome-ignore lint/performance/noAwaitInLoops: nearest package ownership must be checked in order so resolution can stop early.
    if (await exists(packageJson)) {
      try {
        const projectRequire = createRequire(packageJson)
        const tailwindPackageJson = projectRequire.resolve('tailwindcss/package.json')
        const metadata: unknown = JSON.parse(await readFile(tailwindPackageJson, 'utf8'))
        if (!isRecord(metadata) || typeof metadata.version !== 'string') {
          return null
        }
        return {
          root: directory,
          version: metadata.version,
          packageRoot: path.dirname(tailwindPackageJson),
          modulePath: projectRequire.resolve('tailwindcss'),
        }
      } catch {
        // Keep walking. A parent workspace package may own Tailwind.
      }
    }

    if (boundary && directory === boundary) {
      return null
    }
    const parent = path.dirname(directory)
    if (parent === directory || (boundary && !isWithin(boundary, parent))) {
      return null
    }
    directory = parent
  }
}

async function collectStylesheets(root: string): Promise<string[]> {
  const stylesheets: string[] = []
  const directories = [root]

  while (directories.length > 0) {
    const batch = directories.splice(0, filesystemBatchSize)
    // biome-ignore lint/performance/noAwaitInLoops: batching intentionally caps filesystem concurrency for large workspaces.
    const listings = await Promise.all(
      batch.map(async (directory) => ({
        directory,
        entries: await readdir(directory, { withFileTypes: true }).catch(() => []),
      })),
    )

    for (const { directory, entries } of listings) {
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!ignoredDirectories.has(entry.name)) {
            directories.push(entryPath)
          }
        } else if (
          entry.isFile() &&
          stylesheetExtensions.has(path.extname(entry.name).toLowerCase())
        ) {
          stylesheets.push(entryPath)
        }
      }
    }
  }

  return stylesheets
}

function pathDistance(from: string, to: string): number {
  const relative = path.relative(from, to)
  if (!relative) {
    return 0
  }
  return relative.split(path.sep).filter(Boolean).length
}

function importsTailwind(content: string): boolean {
  return tailwindImportPattern.test(content.replace(cssCommentPattern, ' '))
}

function relativeStylesheetImports(
  filePath: string,
  content: string,
  stylesheets: ReadonlySet<string>,
): string[] {
  const imports: string[] = []
  const uncommented = content.replace(cssCommentPattern, ' ')
  for (const match of uncommented.matchAll(stylesheetImportPattern)) {
    const id = match[1]
    if (!id?.startsWith('.')) {
      continue
    }

    const resolved = path.resolve(path.dirname(filePath), id)
    const candidates = path.extname(resolved)
      ? [resolved]
      : [`${resolved}.css`, `${resolved}.pcss`, `${resolved}.postcss`]
    const target = candidates.find((candidate) => stylesheets.has(candidate))
    if (target) {
      imports.push(target)
    }
  }

  return imports
}

async function discoverV4Entrypoints(root: string): Promise<string[]> {
  const stylesheets = await collectStylesheets(root)
  const stylesheetSet = new Set(stylesheets)
  const nodes = new Map<string, StylesheetNode>()

  for (let index = 0; index < stylesheets.length; index += filesystemBatchSize) {
    const batch = stylesheets.slice(index, index + filesystemBatchSize)
    // biome-ignore lint/performance/noAwaitInLoops: bounded batches prevent unbounded readFile fan-out in stylesheet-heavy workspaces.
    const discoveredNodes = await Promise.all(
      batch.map(async (stylesheet): Promise<StylesheetNode | null> => {
        try {
          const content = await readFile(stylesheet, 'utf8')
          return {
            path: stylesheet,
            imports: relativeStylesheetImports(stylesheet, content, stylesheetSet),
            hasDirectTailwind: importsTailwind(content),
          }
        } catch {
          return null
        }
      }),
    )
    for (const node of discoveredNodes) {
      if (node) {
        nodes.set(node.path, node)
      }
    }
  }

  const tailwindMemo = new Map<string, boolean>()
  const reachesTailwind = (filePath: string, visiting = new Set<string>()): boolean => {
    const memoized = tailwindMemo.get(filePath)
    if (memoized != null) {
      return memoized
    }
    if (visiting.has(filePath)) {
      return false
    }

    const node = nodes.get(filePath)
    if (!node) {
      return false
    }
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
  if (id === 'tailwindcss') {
    return path.join(install.packageRoot, 'index.css')
  }

  if (id.startsWith('tailwindcss/')) {
    const subpath = id.slice('tailwindcss/'.length)
    const fileName = subpath.endsWith('.css') ? subpath : `${subpath}.css`
    return path.join(install.packageRoot, fileName)
  }

  if (id.startsWith('.') || path.isAbsolute(id)) {
    const resolved = path.isAbsolute(id) ? id : path.resolve(base, id)
    if (await exists(resolved)) {
      return resolved
    }
    if (!path.extname(resolved)) {
      const candidates = [...stylesheetExtensions].map((extension) => `${resolved}${extension}`)
      const availability = await Promise.all(candidates.map((candidate) => exists(candidate)))
      const match = candidates.find((_, index) => availability[index])
      if (match) {
        return match
      }
    }
    throw new Error(`Unable to resolve stylesheet '${id}' from '${base}'`)
  }

  const baseRequire = createRequire(path.join(base, '__tailwind-class-highlighting__.cjs'))
  return baseRequire.resolve(id)
}

async function loadV4Project(
  install: TailwindInstall,
  entrypoint: string,
): Promise<LoadedTailwindProject> {
  const projectRequire = createRequire(path.join(install.root, 'package.json'))
  const tailwind: unknown = projectRequire(install.modulePath)
  if (!isTailwindModule(tailwind)) {
    throw new Error(`Tailwind ${install.version} module has an unexpected shape`)
  }

  const css = await readFile(entrypoint, 'utf8')
  const stylesheetDependencies = new Set<string>([entrypoint])
  const designSystem = await tailwind.__unstable__loadDesignSystem(css, {
    base: path.dirname(entrypoint),
    from: entrypoint,
    async loadStylesheet(id, base) {
      const stylesheetPath = await resolveStylesheetPath(id, base, install)
      stylesheetDependencies.add(stylesheetPath)
      return {
        path: stylesheetPath,
        base: path.dirname(stylesheetPath),
        content: await readFile(stylesheetPath, 'utf8'),
      }
    },
    async loadModule(id, base) {
      const baseRequire = createRequire(path.join(base, '__tailwind-class-highlighting__.cjs'))
      const modulePath = baseRequire.resolve(id)
      const loaded: unknown = await import(pathToFileURL(modulePath).href)
      return {
        path: modulePath,
        base: path.dirname(modulePath),
        module: isRecord(loaded) && 'default' in loaded ? loaded.default : loaded,
      }
    },
  })

  return {
    project: {
      root: install.root,
      version: install.version,
      entrypoint,
      validator: new DesignSystemValidator(designSystem),
    },
    stylesheetDependencies,
  }
}

export class TailwindProjectManager {
  private documents = new Map<string, Promise<TailwindProject | null>>()
  private projects = new Map<string, Promise<TailwindProject | null>>()
  private entrypoints = new Map<string, Promise<string[]>>()
  private projectStylesheets = new Map<string, ReadonlySet<string>>()
  private projectLoads = new Map<string, symbol>()
  private failedProjects = new Set<string>()
  private generation = 0

  getProject(documentPath: string, workspaceRoot?: string): Promise<TailwindProject | null> {
    const key = `${workspaceRoot ?? ''}\0${path.dirname(documentPath)}`
    let project = this.documents.get(key)
    if (!project) {
      project = this.resolveProject(documentPath, workspaceRoot, this.generation)
      this.documents.set(key, project)
    }
    return project
  }

  invalidateAll(): void {
    this.generation++
    this.documents.clear()
    this.projects.clear()
    this.entrypoints.clear()
    this.projectStylesheets.clear()
    this.projectLoads.clear()
    this.failedProjects.clear()
  }

  invalidatePath(changedPath: string): void {
    this.generation++
    this.documents.clear()

    for (const entrypoint of this.projectLoads.keys()) {
      this.projects.delete(entrypoint)
      this.projectStylesheets.delete(entrypoint)
    }
    this.projectLoads.clear()

    const affectedRoots: string[] = []
    for (const root of this.entrypoints.keys()) {
      if (!isWithin(root, changedPath)) {
        continue
      }
      this.entrypoints.delete(root)
      affectedRoots.push(root)
    }

    for (const entrypoint of this.projects.keys()) {
      const insideAffectedRoot = affectedRoots.some((root) => isWithin(root, entrypoint))
      const loadedStylesheets = this.projectStylesheets.get(entrypoint)
      if (insideAffectedRoot || loadedStylesheets?.has(changedPath)) {
        this.projects.delete(entrypoint)
        this.projectStylesheets.delete(entrypoint)
        this.projectLoads.delete(entrypoint)
        this.failedProjects.delete(entrypoint)
      }
    }

    if (this.failedProjects.size > 0) {
      for (const entrypoint of this.failedProjects) {
        this.projects.delete(entrypoint)
        this.projectStylesheets.delete(entrypoint)
        this.projectLoads.delete(entrypoint)
      }
      this.failedProjects.clear()
    }
  }

  private async resolveProject(
    documentPath: string,
    workspaceRoot?: string,
    generation = this.generation,
  ): Promise<TailwindProject | null> {
    const install = await resolveTailwindInstall(documentPath, workspaceRoot)
    if (generation !== this.generation || !install) {
      return null
    }
    if (majorVersion(install.version) !== 4) {
      return null
    }

    let entrypoints = this.entrypoints.get(install.root)
    if (!entrypoints) {
      entrypoints = discoverV4Entrypoints(install.root)
      this.entrypoints.set(install.root, entrypoints)
    }

    const discoveredEntrypoints = await entrypoints
    if (generation !== this.generation) {
      return null
    }
    const entrypoint = selectV4Entrypoint(discoveredEntrypoints, documentPath)
    if (!entrypoint) {
      return null
    }

    const key = entrypoint
    let project = this.projects.get(key)
    if (!project) {
      const loadId = Symbol(entrypoint)
      this.projectLoads.set(entrypoint, loadId)
      project = this.loadProject(install, entrypoint, loadId)
      this.projects.set(key, project)
    }
    const resolvedProject = await project
    return generation === this.generation ? resolvedProject : null
  }

  private async loadProject(
    install: TailwindInstall,
    entrypoint: string,
    loadId: symbol,
  ): Promise<TailwindProject | null> {
    try {
      const loaded = await loadV4Project(install, entrypoint)
      if (this.projectLoads.get(entrypoint) === loadId) {
        this.projectStylesheets.set(entrypoint, loaded.stylesheetDependencies)
        this.failedProjects.delete(entrypoint)
        this.projectLoads.delete(entrypoint)
      }
      return loaded.project
    } catch (error) {
      if (this.projectLoads.get(entrypoint) === loadId) {
        this.failedProjects.add(entrypoint)
        this.projectLoads.delete(entrypoint)
      }
      console.warn(
        `[Tailwind Class Highlighting] Failed to load Tailwind ${install.version} project at ${install.root}`,
        error,
      )
      return null
    }
  }
}
