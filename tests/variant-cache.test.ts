import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TailwindProjectManager } from '../src/tailwind/project'

const temporaryDirectories: string[] = []

interface VariantCacheInstrumentation {
  loads: Array<Map<string, number>>
}

function isVariantCacheInstrumentation(value: unknown): value is VariantCacheInstrumentation {
  if (typeof value !== 'object' || value === null || !('loads' in value)) {
    return false
  }
  const loads = value.loads
  return Array.isArray(loads) && loads.every((calls) => calls instanceof Map)
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

async function createInstrumentedProject() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailwind-variant-cache-'))
  temporaryDirectories.push(root)
  const modulePath = path.join(root, 'node_modules/tailwindcss/index.cjs')
  await mkdir(path.dirname(modulePath), { recursive: true })
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'package.json'), '{"private":true}')
  await writeFile(
    path.join(root, 'node_modules/tailwindcss/package.json'),
    '{"name":"tailwindcss","version":"4.3.3","main":"index.cjs"}',
  )
  // This loader exposes call counts without changing production interfaces or
  // relying on Tailwind's own internal parse cache to make the test pass.
  await writeFile(
    modulePath,
    `exports.loads = []
exports.__unstable__loadDesignSystem = async (css) => {
  const calls = new Map()
  exports.loads.push(calls)
  const overridden = css.includes('@custom-variant group-hover ')
  return {
    candidatesToCss: (classes) => classes.map(() => '.x {}'),
    parseVariant(variant) {
      calls.set(variant, (calls.get(variant) ?? 0) + 1)
      if (variant === 'fail-once' && calls.get(variant) === 1) throw new Error('Parse failed')
      if (variant === 'group-hover') {
        return overridden
          ? { kind: 'static', root: 'group-hover' }
          : { kind: 'compound', root: 'group' }
      }
      if (variant.startsWith('[')) return { kind: 'arbitrary' }
      if (variant === 'hover') return { kind: 'static', root: 'hover' }
      return null
    },
  }
}
`,
  )
  const stylesheet = path.join(root, 'src/app.css')
  await writeFile(stylesheet, '@import "tailwindcss";')
  const instrumentation: unknown = createRequire(path.join(root, 'package.json'))(modulePath)
  if (!isVariantCacheInstrumentation(instrumentation)) {
    throw new Error('Instrumented Tailwind module did not expose call counts')
  }
  const manager = new TailwindProjectManager()
  const document = path.join(root, 'src/component.tsx')
  const project = await manager.getProject(document, root)
  if (!project) {
    throw new Error('Instrumented Tailwind project did not load')
  }
  return { root, manager, document, stylesheet, project, instrumentation }
}

describe('design-system variant classification cache', () => {
  it('caches exact variant strings, including generic and unrecognized results', async () => {
    const { project, instrumentation } = await createInstrumentedProject()
    for (let i = 0; i < 5; i++) {
      expect(project.validator.classifyVariant('group-hover')).toBe('relationshipVariant')
      expect(project.validator.classifyVariant('[&>svg]')).toBe('arbitraryVariant')
      expect(project.validator.classifyVariant('[&>span]')).toBe('arbitraryVariant')
      expect(project.validator.classifyVariant('hover')).toBeNull()
      expect(project.validator.classifyVariant('unknown')).toBeNull()
    }
    expect(instrumentation.loads[0]).toEqual(
      new Map([
        ['group-hover', 1],
        ['[&>svg]', 1],
        ['[&>span]', 1],
        ['hover', 1],
        ['unknown', 1],
      ]),
    )
  })

  it('keeps equal variant names isolated between CSS entrypoints', async () => {
    const { root, manager, project, instrumentation } = await createInstrumentedProject()
    await mkdir(path.join(root, 'src/admin'))
    await writeFile(
      path.join(root, 'src/admin/app.css'),
      '@import "tailwindcss";\n@custom-variant group-hover (&:focus);',
    )
    manager.invalidateAll()
    const site = await manager.getProject(path.join(root, 'src/component.tsx'), root)
    const admin = await manager.getProject(path.join(root, 'src/admin/component.tsx'), root)
    expect(site?.validator).not.toBe(admin?.validator)
    expect(site?.validator).not.toBe(project.validator)
    for (let i = 0; i < 3; i++) {
      expect(site?.validator.classifyVariant('group-hover')).toBe('relationshipVariant')
      expect(admin?.validator.classifyVariant('group-hover')).toBeNull()
    }
    expect(instrumentation.loads[1]?.get('group-hover')).toBe(1)
    expect(instrumentation.loads[2]?.get('group-hover')).toBe(1)
  })

  it('reclassifies cached values and cached null after CSS invalidation', async () => {
    const { root, manager, document, stylesheet, project, instrumentation } =
      await createInstrumentedProject()
    expect(project.validator.classifyVariant('group-hover')).toBe('relationshipVariant')
    await writeFile(stylesheet, '@import "tailwindcss";\n@custom-variant group-hover (&:focus);')
    manager.invalidateAll()
    const overridden = await manager.getProject(document, root)
    expect(overridden?.validator).not.toBe(project.validator)
    expect(overridden?.validator.classifyVariant('group-hover')).toBeNull()
    expect(overridden?.validator.classifyVariant('group-hover')).toBeNull()
    await writeFile(stylesheet, '@import "tailwindcss";')
    manager.invalidateAll()
    const restored = await manager.getProject(document, root)
    expect(restored?.validator).not.toBe(overridden?.validator)
    expect(restored?.validator.classifyVariant('group-hover')).toBe('relationshipVariant')
    expect(instrumentation.loads.map((calls) => calls.get('group-hover'))).toEqual([1, 1, 1])
  })

  it('allows retry after a parser exception', async () => {
    const { project, instrumentation } = await createInstrumentedProject()
    expect(() => project.validator.classifyVariant('fail-once')).toThrow('Parse failed')
    expect(project.validator.classifyVariant('fail-once')).toBeNull()
    expect(project.validator.classifyVariant('fail-once')).toBeNull()
    expect(instrumentation.loads[0]?.get('fail-once')).toBe(2)
  })
})
