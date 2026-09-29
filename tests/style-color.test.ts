import { describe, expect, it } from 'vitest'
import {
  clearColorCustomizations,
  colorWithOpacity,
  deriveVariantPalette,
  parseStyleColor,
  setColorCustomizations,
} from '../src/extension/style-color'
import { styleDefinitions } from '../src/extension/style-registry'

describe('style colors', () => {
  it('converts opacity percentages to eight-digit theme colors', () => {
    expect(colorWithOpacity('#e5c07b', 50)).toBe('#E5C07B80')
    expect(colorWithOpacity('#E5C07B', 0)).toBe('#E5C07B00')
    expect(colorWithOpacity('#E5C07B', 100)).toBe('#E5C07BFF')
  })

  it('reads shorthand and alpha colors and falls back for unsupported values', () => {
    expect(parseStyleColor('#abc8', '#000000')).toEqual({
      rgb: '#AABBCC',
      opacity: 53,
      rgba: '#AABBCC87',
    })
    expect(parseStyleColor('var(--unknown)', '#8080805C')).toEqual({
      rgb: '#808080',
      opacity: 36,
      rgba: '#8080805C',
    })
  })

  it('preserves unrelated workbench color customizations when setting and resetting one color', () => {
    const current = {
      'editor.background': '#111111',
      '[My Theme]': { 'editor.foreground': '#EEEEEE' },
    }
    const configured = setColorCustomizations(
      current,
      ['tailwindClassHighlighting.variant'],
      '#12345680',
    )

    expect(configured).toEqual({
      ...current,
      'tailwindClassHighlighting.variant': '#12345680',
    })
    expect(
      setColorCustomizations(configured, ['tailwindClassHighlighting.variant'], undefined),
    ).toEqual(current)
  })

  it('clears style colors from global and theme-specific user color customizations', () => {
    const current = {
      'tailwindClassHighlighting.variant': '#12345680',
      'editor.background': '#111111',
      '[My Theme]': {
        'tailwindClassHighlighting.variant': '#ABCDEF40',
        'editor.foreground': '#EEEEEE',
      },
    }

    expect(clearColorCustomizations(current, ['tailwindClassHighlighting.variant'])).toEqual({
      'editor.background': '#111111',
      '[My Theme]': { 'editor.foreground': '#EEEEEE' },
    })
  })

  it('derives related variant-family colors from one base color and preserves alpha', () => {
    expect(deriveVariantPalette('#2DF3AC80')).toEqual({
      arbitraryVariant: '#6FC1D080',
      relationshipVariant: '#28E5CA80',
      attributeVariant: '#8AC77A80',
      pseudoElementVariant: '#87B9B180',
      environmentVariant: '#1986D180',
    })
  })

  it('keeps contributed specialized defaults aligned with the derived Variant palette', () => {
    for (const theme of ['dark', 'light', 'highContrast', 'highContrastLight'] as const) {
      const palette = deriveVariantPalette(styleDefinitions.variant.defaults[theme])
      const normalizedDefault = (group: keyof typeof palette): string =>
        parseStyleColor(styleDefinitions[group].defaults[theme], '#000000').rgba

      expect(normalizedDefault('arbitraryVariant')).toBe(palette.arbitraryVariant)
      expect(normalizedDefault('relationshipVariant')).toBe(palette.relationshipVariant)
      expect(normalizedDefault('attributeVariant')).toBe(palette.attributeVariant)
      expect(normalizedDefault('pseudoElementVariant')).toBe(palette.pseudoElementVariant)
      expect(normalizedDefault('environmentVariant')).toBe(palette.environmentVariant)
    }
  })
})
