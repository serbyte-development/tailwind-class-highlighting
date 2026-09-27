export interface StyleColor {
  rgb: string
  opacity: number
  rgba: string
}

function expandShortHex(value: string): string {
  return value
    .split('')
    .map((character) => character + character)
    .join('')
}

function parseHex(value: string): { rgb: string; alpha: number } | null {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())
  if (!match) return null

  const raw = match[1]!
  const expanded = raw.length <= 4 ? expandShortHex(raw) : raw
  const rgb = `#${expanded.slice(0, 6).toUpperCase()}`
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255
  return { rgb, alpha }
}

export function colorWithOpacity(rgb: string, opacity: number): string {
  const parsed = parseHex(rgb)
  if (!parsed) throw new Error(`Invalid RGB color: ${rgb}`)

  const clamped = Math.max(0, Math.min(100, Math.round(opacity)))
  const alpha = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
  return `${parsed.rgb}${alpha}`
}

export function parseStyleColor(value: unknown, fallback: string): StyleColor {
  const parsed = typeof value === 'string' ? parseHex(value) : null
  const fallbackParsed = parseHex(fallback)
  if (!fallbackParsed) throw new Error(`Invalid fallback color: ${fallback}`)

  const color = parsed ?? fallbackParsed
  const opacity = Math.round((color.alpha / 255) * 100)
  return {
    rgb: color.rgb,
    opacity,
    rgba: colorWithOpacity(color.rgb, opacity),
  }
}

export function setColorCustomizations(
  current: Readonly<Record<string, unknown>>,
  colorIds: readonly string[],
  value: string | undefined,
): Record<string, unknown> {
  const next = { ...current }
  for (const colorId of colorIds) {
    if (value === undefined) delete next[colorId]
    else next[colorId] = value
  }
  return next
}
import type { SpecializedVariantGroup } from '../core/types'

export const variantAccentColors: Readonly<Record<SpecializedVariantGroup, string>> = {
  arbitraryVariant: '#C084FC',
  relationshipVariant: '#22D3EE',
  attributeVariant: '#FB923C',
  pseudoElementVariant: '#F472B6',
  environmentVariant: '#60A5FA',
}

function mixRgb(base: string, accent: string, accentWeight = 0.45): string {
  const baseColor = parseHex(base)
  const accentColor = parseHex(accent)
  if (!baseColor || !accentColor) throw new Error('Invalid color for variant palette')

  const channel = (value: string, offset: number): number =>
    Number.parseInt(value.slice(offset, offset + 2), 16)
  const values = [1, 3, 5].map((offset) =>
    Math.round(
      channel(baseColor.rgb, offset) * (1 - accentWeight) +
        channel(accentColor.rgb, offset) * accentWeight,
    ),
  )
  return `#${values
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

export function deriveVariantPalette(base: string): Record<SpecializedVariantGroup, string> {
  const parsed = parseStyleColor(base, '#2DF3AC')
  return Object.fromEntries(
    Object.entries(variantAccentColors).map(([group, accent]) => [
      group,
      colorWithOpacity(mixRgb(parsed.rgb, accent), parsed.opacity),
    ]),
  ) as Record<SpecializedVariantGroup, string>
}
