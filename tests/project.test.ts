import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeText } from '../src/core/analyze'
import { getCandidateScanner } from '../src/core/scanner'
import { TailwindProjectManager } from '../src/tailwind/project'

const fixtureRoot = path.resolve('tests/fixtures/tailwind-v4')
const monorepoRoot = path.resolve('tests/fixtures/tailwind-monorepo')
const brokenFixtureRoot = path.resolve('tests/fixtures/tailwind-v4-broken')
const ambiguousFixtureRoot = path.resolve('tests/fixtures/tailwind-v4-ambiguous')
const prefixFixtureRoot = path.resolve('tests/fixtures/tailwind-v4-prefix')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

describe('TailwindProjectManager', () => {
  it('loads the nearest Tailwind v4 project and validates project-defined classes', async () => {
    const manager = new TailwindProjectManager()
    const project = await manager.getProject(path.join(fixtureRoot, 'src/component.js'))

    expect(project?.root).toBe(fixtureRoot)
    expect(project?.version).toMatch(/^4\./)
    expect(project?.entrypoint).toBe(path.join(fixtureRoot, 'src/app.css'))

    const valid = project?.validator?.getValidCandidates([
      'flex',
      'bg-brand',
      'project-card',
      'app-shell',
      'hocus:project-card',
      'tablet:project-card',
      '@card:project-card',
      'w-[317px]',
      'ignored-legacy-anchor',
      'not-a-real-tailwind-class',
    ])

    expect(valid).toEqual(
      new Set([
        'flex',
        'bg-brand',
        'project-card',
        'app-shell',
        'hocus:project-card',
        'tablet:project-card',
        '@card:project-card',
        'w-[317px]',
      ]),
    )
  })

  it('uses @import tailwindcss as the v4 anchor instead of Tailwind-looking CSS heuristics', async () => {
    const manager = new TailwindProjectManager()
    const project = await manager.getProject(path.join(fixtureRoot, 'src/component.js'))

    expect(project?.entrypoint).toBe(path.join(fixtureRoot, 'src/app.css'))
    expect(
      project?.validator?.getValidCandidates(['project-card', 'ignored-legacy-anchor']),
    ).toEqual(new Set(['project-card']))
  })

  it('feeds project-defined Tailwind classes through the normal highlighting pipeline', async () => {
    const manager = new TailwindProjectManager()
    const project = await manager.getProject(path.join(fixtureRoot, 'src/component.js'))
    const scanner = await getCandidateScanner()
    const text = `<div className="project-card hocus:bg-brand tablet:project-card @card:project-card plain-custom" />`
    const spans = analyzeText(
      text,
      { classAttributes: ['className'], classFunctions: [] },
      scanner,
      project!.validator,
    )
    const highlighted = spans.map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: 'project-card', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'hocus:', group: 'variant' })
    expect(highlighted).toContainEqual({ value: 'bg-brand', group: 'utility' })
    expect(highlighted).toContainEqual({ value: 'tablet:', group: 'breakpoint' })
    expect(highlighted).toContainEqual({ value: '@card:', group: 'breakpoint' })
    expect(highlighted.some(({ value }) => value.includes('plain-custom'))).toBe(false)
  })

  it('uses the project prefix as syntax instead of treating it as a variant', async () => {
    const manager = new TailwindProjectManager()
    const project = await manager.getProject(path.join(prefixFixtureRoot, 'src/component.js'))
    const scanner = await getCandidateScanner()

    expect(project?.validator.getPrefix()).toBe('tw')
    expect(
      project?.validator.getValidCandidates(['tw:flex', 'tw:hover:bg-red-500', 'bg-red-500']),
    ).toEqual(new Set(['tw:flex', 'tw:hover:bg-red-500']))

    const text = `<div className="tw:hover:bg-red-500 tw:active-true:bg-red-500 bg-red-500" />`
    const highlighted = analyzeText(
      text,
      { classAttributes: ['className'], classFunctions: [] },
      scanner,
      project!.validator,
    ).map((span) => ({
      value: text.slice(span.start, span.end),
      group: span.group,
    }))

    expect(highlighted).toContainEqual({ value: 'tw:', group: 'prefix' })
    expect(highlighted).toContainEqual({ value: 'hover:', group: 'variant' })
    expect(highlighted).toContainEqual({ value: 'active-true:', group: 'unresolvedVariant' })
    expect(
      highlighted.some(({ value, group }) => value === 'bg-red-500' && group === 'nonTailwind'),
    ).toBe(false)
  })

  it('keeps multiple Tailwind entrypoints in one package isolated', async () => {
    const manager = new TailwindProjectManager()
    const siteProject = await manager.getProject(path.join(fixtureRoot, 'src/component.js'))
    const adminProject = await manager.getProject(path.join(fixtureRoot, 'src/admin/component.js'))

    expect(siteProject?.entrypoint).toBe(path.join(fixtureRoot, 'src/app.css'))
    expect(adminProject?.entrypoint).toBe(path.join(fixtureRoot, 'src/admin/admin.css'))

    expect(siteProject?.validator?.getValidCandidates(['project-card', 'admin-card'])).toEqual(
      new Set(['project-card']),
    )
    expect(adminProject?.validator?.getValidCandidates(['project-card', 'admin-card'])).toEqual(
      new Set(['admin-card']),
    )
  })

  it('returns null instead of guessing between equally close Tailwind roots', async () => {
    const manager = new TailwindProjectManager()
    const project = await manager.getProject(
      path.join(ambiguousFixtureRoot, 'src/shared/component.js'),
      ambiguousFixtureRoot,
    )

    expect(project).toBeNull()
  })

  it('uses the nearest package boundary in a monorepo', async () => {
    const manager = new TailwindProjectManager()
    const siteRoot = path.join(monorepoRoot, 'packages/site')
    const adminRoot = path.join(monorepoRoot, 'packages/admin')
    const siteProject = await manager.getProject(path.join(siteRoot, 'src/component.js'))
    const adminProject = await manager.getProject(path.join(adminRoot, 'src/component.js'))

    expect(siteProject?.root).toBe(siteRoot)
    expect(adminProject?.root).toBe(adminRoot)
    expect(siteProject?.validator?.getValidCandidates(['site-only', 'admin-only'])).toEqual(
      new Set(['site-only']),
    )
    expect(adminProject?.validator?.getValidCandidates(['site-only', 'admin-only'])).toEqual(
      new Set(['admin-only']),
    )
  })

  it('returns null when a Tailwind v4 design system cannot load', async () => {
    const warn = console.warn
    console.warn = () => {}

    try {
      const manager = new TailwindProjectManager()
      const project = await manager.getProject(path.join(brokenFixtureRoot, 'src/component.js'))

      expect(project).toBeNull()
    } finally {
      console.warn = warn
    }
  })

  it('returns null for Tailwind v3 projects', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-class-highlighting-v3-'))
    temporaryDirectories.push(directory)
    const tailwindDirectory = path.join(directory, 'node_modules/tailwindcss')
    await mkdir(tailwindDirectory, { recursive: true })
    await writeFile(path.join(directory, 'package.json'), '{"private":true}')
    await writeFile(
      path.join(tailwindDirectory, 'package.json'),
      '{"name":"tailwindcss","version":"3.4.17","main":"index.js"}',
    )
    await writeFile(path.join(tailwindDirectory, 'index.js'), 'module.exports = {}')
    const documentPath = path.join(directory, 'component.js')
    await writeFile(documentPath, 'export const className = "flex"')

    const manager = new TailwindProjectManager()
    await expect(manager.getProject(documentPath)).resolves.toBeNull()
  })

  it('does not resolve Tailwind from outside the document workspace root', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-class-highlighting-boundary-'))
    temporaryDirectories.push(directory)
    const workspaceRoot = path.join(directory, 'workspace')
    const sourceDirectory = path.join(workspaceRoot, 'src')
    const tailwindDirectory = path.join(directory, 'node_modules/tailwindcss')
    await mkdir(sourceDirectory, { recursive: true })
    await mkdir(tailwindDirectory, { recursive: true })
    await writeFile(path.join(directory, 'package.json'), '{"private":true}')
    await writeFile(path.join(directory, 'app.css'), '@import "tailwindcss";')
    await writeFile(
      path.join(tailwindDirectory, 'package.json'),
      '{"name":"tailwindcss","version":"4.0.0","main":"index.js"}',
    )
    await writeFile(
      path.join(tailwindDirectory, 'index.js'),
      'module.exports.__unstable__loadDesignSystem = async () => ({ candidatesToCss: (classes) => classes.map(() => ".x{}"), getVariants: () => [] })',
    )
    const documentPath = path.join(sourceDirectory, 'component.js')
    await writeFile(documentPath, 'export const className = "flex"')

    const manager = new TailwindProjectManager()
    await expect(manager.getProject(documentPath, workspaceRoot)).resolves.toBeNull()
    await expect(manager.getProject(documentPath)).resolves.not.toBeNull()
  })

  it('loads the README screenshot example through the real Tailwind v4 project', async () => {
    const manager = new TailwindProjectManager()
    const workspaceRoot = path.resolve('.')
    const documentPath = path.resolve('examples/highlighting-preview.tsx')
    const project = await manager.getProject(documentPath, workspaceRoot)

    expect(project?.entrypoint).toBe(path.resolve('examples/highlighting-preview.css'))
    expect(
      project?.validator.getValidCandidates([
        'card-glow',
        'w-[720px]',
        'md:flex-row',
        'tablet:gap-8',
        '@card:flex-row',
        'hover:border-sky-400/70',
        'hocus:bg-brand/10',
        '[&_svg]:size-5',
        '!ring-1',
      ]),
    ).toEqual(
      new Set([
        'card-glow',
        'w-[720px]',
        'md:flex-row',
        'tablet:gap-8',
        '@card:flex-row',
        'hover:border-sky-400/70',
        'hocus:bg-brand/10',
        '[&_svg]:size-5',
        '!ring-1',
      ]),
    )
  })

  it('returns null when no Tailwind installation can be resolved', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-class-highlighting-'))
    temporaryDirectories.push(directory)
    await writeFile(path.join(directory, 'package.json'), '{"private":true}')
    const documentPath = path.join(directory, 'component.tsx')
    await writeFile(documentPath, 'export const Component = () => null')

    const manager = new TailwindProjectManager()
    await expect(manager.getProject(documentPath)).resolves.toBeNull()
  })
})
