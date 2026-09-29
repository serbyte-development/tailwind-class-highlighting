import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { defaultDebounceMs } from '../src/extension/config-values'
import { styleDefinitionEntries } from '../src/extension/style-registry'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${name} to be an object`)
  }
  return value
}

describe('style registry', () => {
  it('stays aligned with contributed colors and style defaults in package.json', async () => {
    const manifest: unknown = JSON.parse(await readFile('package.json', 'utf8'))
    const contributes = requireRecord(
      requireRecord(manifest, 'manifest').contributes,
      'contributes',
    )
    const colors = contributes.colors
    if (!Array.isArray(colors)) {
      throw new Error('Expected contributes.colors to be an array')
    }
    const colorsById = new Map<string, Record<string, unknown>>()
    for (const color of colors) {
      if (!isRecord(color) || typeof color.id !== 'string') {
        continue
      }
      colorsById.set(color.id, color)
    }

    const configuration = requireRecord(contributes.configuration, 'configuration')
    const properties = requireRecord(configuration.properties, 'configuration.properties')

    expect(
      requireRecord(properties['tailwindClassHighlighting.debounceMs'], 'debounceMs setting')
        .default,
    ).toBe(defaultDebounceMs)

    for (const definition of styleDefinitionEntries) {
      const color = colorsById.get(definition.colorId)
      expect(color, `${definition.group} color contribution`).toBeDefined()
      expect(color?.defaults).toEqual(definition.defaults)

      const setting = requireRecord(
        properties[`tailwindClassHighlighting.styles.${definition.group}.enabled`],
        `${definition.group} enabled setting`,
      )
      expect(setting.default).toBe(definition.enabledByDefault)
    }

    const manifestRecord = requireRecord(manifest, 'manifest')
    const capabilities = requireRecord(manifestRecord.capabilities, 'capabilities')
    const untrusted = requireRecord(capabilities.untrustedWorkspaces, 'untrustedWorkspaces')
    const virtual = requireRecord(capabilities.virtualWorkspaces, 'virtualWorkspaces')
    expect(untrusted.supported).toBe(false)
    expect(virtual.supported).toBe(false)
  })
})
