export const defaultLanguages = [
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
] as const

export const defaultClassAttributes = [
  'class',
  'className',
  'ngClass',
  '[ngClass]',
  'class:list',
  ':class',
  'v-bind:class',
] as const

export const defaultClassFunctions = [
  'clsx',
  'classnames',
  'cn',
  'cva',
  'twMerge',
  'tw(?:\\.[A-Za-z_$][\\w$-]*)?',
] as const

export const defaultDebounceMs = 100

export function readBooleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function readStringArraySetting(value: unknown, fallback: readonly string[]): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string' && entry.length > 0)
  ) {
    return [...fallback]
  }
  return value
}

export function readRegexArraySetting(value: unknown, fallback: readonly string[]): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string' && entry.length > 0)
  ) {
    return [...fallback]
  }

  try {
    for (const pattern of value) {
      new RegExp(pattern)
    }
  } catch {
    return [...fallback]
  }
  return value
}

export function readDebounceSetting(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultDebounceMs
  }
  return Math.max(0, Math.min(250, value))
}
