import { type HighlightGroup, highlightGroups } from '../core/types'
import { deriveVariantPalette } from './style-color'

export type UtilityUnderlineStyle = 'dotted' | 'solid' | 'dashed' | 'double' | 'none'

export interface ColorDefaults {
  dark: string
  light: string
  highContrast: string
  highContrastLight: string
}

export interface HighlightStyleDefinition {
  enabledByDefault: boolean
  colorId: string
  defaults: ColorDefaults
  title: string
  description: string
  preview: string
}

export const defaultUtilityUnderlineStyle: UtilityUnderlineStyle = 'dotted'
export const defaultUtilityColorEnabled = false

const variantDefaults: ColorDefaults = {
  dark: '#2DF3AC',
  light: '#087F5B',
  highContrast: '#66FFC2',
  highContrastLight: '#006644',
}

function derivedVariantDefaults(
  group:
    | 'arbitraryVariant'
    | 'relationshipVariant'
    | 'attributeVariant'
    | 'pseudoElementVariant'
    | 'environmentVariant',
): ColorDefaults {
  return {
    dark: deriveVariantPalette(variantDefaults.dark)[group].slice(0, 7),
    light: deriveVariantPalette(variantDefaults.light)[group].slice(0, 7),
    highContrast: deriveVariantPalette(variantDefaults.highContrast)[group].slice(0, 7),
    highContrastLight: deriveVariantPalette(variantDefaults.highContrastLight)[group].slice(0, 7),
  }
}

export const styleDefinitions = {
  utility: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.utilityUnderline',
    defaults: {
      dark: '#8080805C',
      light: '#8080805C',
      highContrast: '#FFFFFF99',
      highContrastLight: '#00000099',
    },
    title: 'Utility',
    description: 'Recognized Tailwind utility. Underline stays subtle by default.',
    preview:
      '<span data-highlight="utility">flex</span> <span data-highlight="utility">items-center</span> <span data-highlight="utility">gap-4</span>',
  },
  breakpoint: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.breakpoint',
    defaults: {
      dark: '#51FFFF',
      light: '#007C91',
      highContrast: '#66FFFF',
      highContrastLight: '#005F73',
    },
    title: 'Breakpoint',
    description: 'Responsive and container-query variants.',
    preview:
      '<span data-highlight="breakpoint">md:</span>flex <span data-highlight="breakpoint">lg:</span>grid',
  },
  variant: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.variant',
    defaults: variantDefaults,
    title: 'Variant',
    description: 'State and behavior variants.',
    preview:
      '<span data-highlight="variant">hover:</span>bg-red-500 <span data-highlight="variant">focus:</span>ring-2',
  },
  arbitraryVariant: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.arbitraryVariant',
    defaults: derivedVariantDefaults('arbitraryVariant'),
    title: 'Arbitrary Variant',
    description: 'Arbitrary selectors such as [&>svg]:.',
    preview: '<span data-highlight="arbitraryVariant">[&>svg]:</span>size-5',
  },
  relationshipVariant: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.relationshipVariant',
    defaults: derivedVariantDefaults('relationshipVariant'),
    title: 'Relationship Variant',
    description: 'group-*, peer-*, has-*, in-*, and child-selector variants.',
    preview: '<span data-highlight="relationshipVariant">group-hover:</span>bg-red-500',
  },
  attributeVariant: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.attributeVariant',
    defaults: derivedVariantDefaults('attributeVariant'),
    title: 'Attribute Variant',
    description: 'data-*, aria-*, open, direction, and inert variants.',
    preview: '<span data-highlight="attributeVariant">data-[state=open]:</span>bg-red-500',
  },
  pseudoElementVariant: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.pseudoElementVariant',
    defaults: derivedVariantDefaults('pseudoElementVariant'),
    title: 'Pseudo-element Variant',
    description: 'before:, after:, placeholder:, selection:, and related variants.',
    preview: '<span data-highlight="pseudoElementVariant">before:</span>content-[\'•\']',
  },
  environmentVariant: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.environmentVariant',
    defaults: derivedVariantDefaults('environmentVariant'),
    title: 'Environment / Media Variant',
    description:
      'dark:, motion-*, print:, supports-*, orientation, pointer, and contrast variants.',
    preview: '<span data-highlight="environmentVariant">dark:</span>bg-slate-950',
  },
  unresolvedVariant: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.unresolvedVariant',
    defaults: {
      dark: '#E5C07B',
      light: '#9A6700',
      highContrast: '#FFFF66',
      highContrastLight: '#7A5200',
    },
    title: 'Unresolved Variant',
    description: 'Variant Tailwind rejects while the utility itself remains valid.',
    preview: '<span data-highlight="unresolvedVariant">active-true:</span>bg-red-500',
  },
  prefix: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.prefix',
    defaults: {
      dark: '#7AA2F7',
      light: '#315BB5',
      highContrast: '#8FB3FF',
      highContrastLight: '#24478F',
    },
    title: 'Prefix',
    description: 'Project-configured Tailwind prefix.',
    preview: '<span data-highlight="prefix">tw:</span>flex',
  },
  modifier: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.modifier',
    defaults: {
      dark: '#F0A868',
      light: '#9A4D00',
      highContrast: '#FFD166',
      highContrastLight: '#7A3D00',
    },
    title: 'Modifier',
    description: 'Slash modifiers and fractions.',
    preview:
      'bg-red-500<span data-highlight="modifier">/50</span> group-hover<span data-highlight="modifier">/item</span>:flex',
  },
  arbitrary: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.arbitrary',
    defaults: {
      dark: '#C4A7E7',
      light: '#6F42A1',
      highContrast: '#D8C2FF',
      highContrastLight: '#5B2C83',
    },
    title: 'Arbitrary',
    description: 'Square brackets around arbitrary values and variants.',
    preview:
      'w-<span data-highlight="arbitrary">[</span>317px<span data-highlight="arbitrary">]</span> [&_svg]:size-5',
  },
  arbitraryValue: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.arbitraryValue',
    defaults: {
      dark: '#C4A7E7',
      light: '#6F42A1',
      highContrast: '#D8C2FF',
      highContrastLight: '#5B2C83',
    },
    title: 'Arbitrary Value',
    description: 'Opt-in full arbitrary values instead of bracket-only emphasis.',
    preview: 'w-<span data-highlight="arbitraryValue">[317px]</span>',
  },
  cssVariable: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.cssVariable',
    defaults: {
      dark: '#7AA2F7',
      light: '#315BB5',
      highContrast: '#8FB3FF',
      highContrastLight: '#24478F',
    },
    title: 'CSS Variable',
    description: 'Tailwind v4 CSS-variable shorthand values.',
    preview: 'bg-<span data-highlight="cssVariable">(--brand-color)</span>',
  },
  important: {
    enabledByDefault: true,
    colorId: 'tailwindClassHighlighting.important',
    defaults: {
      dark: '#FF7AC6',
      light: '#A6005A',
      highContrast: '#FF9ED6',
      highContrastLight: '#8A004A',
    },
    title: 'Important',
    description: 'Whole candidate when Tailwind important syntax is present.',
    preview: '<span data-highlight="important">hover:!mt-4</span>',
  },
  nonTailwind: {
    enabledByDefault: false,
    colorId: 'tailwindClassHighlighting.nonTailwind',
    defaults: {
      dark: '#A0A0A0',
      light: '#6B7280',
      highContrast: '#CCCCCC',
      highContrastLight: '#555555',
    },
    title: 'Non-Tailwind',
    description: 'Literal class text rejected by Tailwind. Disabled by default.',
    preview: '<span data-highlight="nonTailwind">custom-card</span>',
  },
} satisfies Record<HighlightGroup, HighlightStyleDefinition>

export const styleDefinitionEntries: Array<HighlightStyleDefinition & { group: HighlightGroup }> =
  highlightGroups.map((group) => ({
    group,
    ...styleDefinitions[group],
  }))

export function isUtilityUnderlineStyle(value: unknown): value is UtilityUnderlineStyle {
  return (
    value === 'dotted' ||
    value === 'solid' ||
    value === 'dashed' ||
    value === 'double' ||
    value === 'none'
  )
}
