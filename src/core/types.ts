export const highlightGroups = [
  'utility',
  'breakpoint',
  'variant',
  'arbitraryVariant',
  'relationshipVariant',
  'attributeVariant',
  'pseudoElementVariant',
  'environmentVariant',
  'unresolvedVariant',
  'prefix',
  'modifier',
  'arbitrary',
  'arbitraryValue',
  'cssVariable',
  'important',
  'nonTailwind',
] as const

export type HighlightGroup = (typeof highlightGroups)[number]

export const specializedVariantGroups = [
  'arbitraryVariant',
  'relationshipVariant',
  'attributeVariant',
  'pseudoElementVariant',
  'environmentVariant',
] as const satisfies readonly HighlightGroup[]

export type SpecializedVariantGroup = (typeof specializedVariantGroups)[number]

export interface SourceRegion {
  start: number
  end: number
}

export interface HighlightSpan {
  start: number
  end: number
  group: HighlightGroup
}
