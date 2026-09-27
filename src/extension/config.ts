import * as vscode from 'vscode'
import type { HighlightGroup } from '../core/types'

export type UtilityUnderlineStyle = 'dotted' | 'solid' | 'dashed' | 'double' | 'none'

export interface HighlightStyleConfiguration {
  enabledGroups: ReadonlySet<HighlightGroup>
  utilityUnderlineStyle: UtilityUnderlineStyle
  utilityColorEnabled: boolean
}

export interface HighlightConfiguration {
  enabled: boolean
  languages: Set<string>
  classAttributes: string[]
  classFunctions: string[]
  debounceMs: number
  styles: HighlightStyleConfiguration
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export const highlightStyleDefaults: Readonly<Record<HighlightGroup, boolean>> = {
  utility: true,
  breakpoint: true,
  variant: true,
  arbitraryVariant: false,
  relationshipVariant: false,
  attributeVariant: false,
  pseudoElementVariant: false,
  environmentVariant: false,
  unresolvedVariant: true,
  prefix: true,
  modifier: true,
  arbitrary: true,
  arbitraryValue: false,
  cssVariable: false,
  important: true,
  nonTailwind: false,
}

export const defaultUtilityUnderlineStyle: UtilityUnderlineStyle = 'dotted'
export const defaultUtilityColorEnabled = false

const underlineStyles = new Set<UtilityUnderlineStyle>([
  'dotted',
  'solid',
  'dashed',
  'double',
  'none',
])

function getStyleConfiguration(config: vscode.WorkspaceConfiguration): HighlightStyleConfiguration {
  const enabledGroups = new Set<HighlightGroup>()

  for (const [group, defaultEnabled] of Object.entries(highlightStyleDefaults) as Array<
    [HighlightGroup, boolean]
  >) {
    if (config.get(`styles.${group}.enabled`, defaultEnabled)) enabledGroups.add(group)
  }

  const underlineStyle = config.get<UtilityUnderlineStyle>(
    'styles.utility.underlineStyle',
    defaultUtilityUnderlineStyle,
  )

  return {
    enabledGroups,
    utilityUnderlineStyle: underlineStyles.has(underlineStyle)
      ? underlineStyle
      : defaultUtilityUnderlineStyle,
    utilityColorEnabled: config.get('styles.utility.colorEnabled', defaultUtilityColorEnabled),
  }
}

export function getConfiguration(): HighlightConfiguration {
  const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
  const tailwindConfig = vscode.workspace.getConfiguration('tailwindCSS')

  const classAttributes = config.get<string[]>('classAttributes', [
    'class',
    'className',
    'ngClass',
    'class:list',
    ':class',
    'v-bind:class',
  ])
  const classFunctions = config.get<string[]>('classFunctions', [
    'clsx',
    'classnames',
    'cn',
    'cva',
    'twMerge',
    'tw(?:\\.[A-Za-z_$][\\w$-]*)?',
  ])

  return {
    enabled: config.get('enabled', true),
    languages: new Set(
      config.get('languages', [
        'html',
        'javascript',
        'javascriptreact',
        'typescript',
        'typescriptreact',
        'vue',
        'svelte',
        'astro',
        'php',
        'blade',
      ]),
    ),
    classAttributes: unique([
      ...classAttributes,
      ...tailwindConfig.get<string[]>('classAttributes', []),
    ]),
    classFunctions: unique([
      ...classFunctions,
      ...tailwindConfig.get<string[]>('classFunctions', []),
    ]),
    debounceMs: Math.max(0, Math.min(250, config.get('debounceMs', 25))),
    styles: getStyleConfiguration(config),
  }
}
