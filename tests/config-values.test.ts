import { describe, expect, it } from 'vitest'
import {
  defaultClassFunctions,
  defaultDebounceMs,
  readBooleanSetting,
  readDebounceSetting,
  readRegexArraySetting,
  readStringArraySetting,
} from '../src/extension/config-values'

describe('configuration value fallbacks', () => {
  it('falls back when a boolean setting has the wrong type', () => {
    expect(readBooleanSetting('false', true)).toBe(true)
    expect(readBooleanSetting(1, false)).toBe(false)
    expect(readBooleanSetting(false, true)).toBe(false)
  })

  it('falls back for malformed string arrays while allowing an intentional empty array', () => {
    expect(readStringArraySetting('typescript', ['html'])).toEqual(['html'])
    expect(readStringArraySetting(['typescript', 3], ['html'])).toEqual(['html'])
    expect(readStringArraySetting([''], ['html'])).toEqual(['html'])
    expect(readStringArraySetting([], ['html'])).toEqual([])
  })

  it('falls back instead of exposing malformed regular expressions to source scanning', () => {
    expect(readRegexArraySetting(['clsx', '('], defaultClassFunctions)).toEqual([
      ...defaultClassFunctions,
    ])
    expect(readRegexArraySetting(['clsx', 'cn'], defaultClassFunctions)).toEqual(['clsx', 'cn'])
  })

  it('falls back for invalid debounce values and clamps valid numbers', () => {
    expect(readDebounceSetting('100')).toBe(defaultDebounceMs)
    expect(readDebounceSetting(Number.NaN)).toBe(defaultDebounceMs)
    expect(readDebounceSetting(Number.POSITIVE_INFINITY)).toBe(defaultDebounceMs)
    expect(readDebounceSetting(-5)).toBe(0)
    expect(readDebounceSetting(500)).toBe(250)
    expect(readDebounceSetting(40)).toBe(40)
  })
})
