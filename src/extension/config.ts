// biome-ignore lint/correctness/noUndeclaredDependencies: VS Code provides this module in the extension host.
import * as vscode from 'vscode'
import { type HighlightGroup, highlightGroups } from '../core/types'
import {
  defaultClassAttributes,
  defaultClassFunctions,
  defaultLanguages,
  readBooleanSetting,
  readDebounceSetting,
  readRegexArraySetting,
  readStringArraySetting,
} from './config-values'
import {
  defaultUtilityColorEnabled,
  defaultUtilityUnderlineStyle,
  isUtilityUnderlineStyle,
  styleDefinitions,
  type UtilityUnderlineStyle,
} from './style-registry'

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

function getStyleConfiguration(config: vscode.WorkspaceConfiguration): HighlightStyleConfiguration {
  const enabledGroups = new Set<(typeof highlightGroups)[number]>()

  for (const group of highlightGroups) {
    if (
      readBooleanSetting(
        config.get<unknown>(`styles.${group}.enabled`),
        styleDefinitions[group].enabledByDefault,
      )
    ) {
      enabledGroups.add(group)
    }
  }

  const underlineStyle = config.get<unknown>('styles.utility.underlineStyle')

  return {
    enabledGroups,
    utilityUnderlineStyle: isUtilityUnderlineStyle(underlineStyle)
      ? underlineStyle
      : defaultUtilityUnderlineStyle,
    utilityColorEnabled: readBooleanSetting(
      config.get<unknown>('styles.utility.colorEnabled'),
      defaultUtilityColorEnabled,
    ),
  }
}

export function getConfiguration(): HighlightConfiguration {
  const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
  const tailwindConfig = vscode.workspace.getConfiguration('tailwindCSS')

  const classAttributes = readStringArraySetting(
    config.get<unknown>('classAttributes'),
    defaultClassAttributes,
  )
  const classFunctions = readRegexArraySetting(
    config.get<unknown>('classFunctions'),
    defaultClassFunctions,
  )
  const tailwindClassAttributes = readStringArraySetting(
    tailwindConfig.get<unknown>('classAttributes'),
    [],
  )
  const tailwindClassFunctions = readRegexArraySetting(
    tailwindConfig.get<unknown>('classFunctions'),
    [],
  )

  return {
    enabled: readBooleanSetting(config.get<unknown>('enabled'), true),
    languages: new Set(readStringArraySetting(config.get<unknown>('languages'), defaultLanguages)),
    classAttributes: unique([...classAttributes, ...tailwindClassAttributes]),
    classFunctions: unique([...classFunctions, ...tailwindClassFunctions]),
    debounceMs: readDebounceSetting(config.get<unknown>('debounceMs')),
    styles: getStyleConfiguration(config),
  }
}
