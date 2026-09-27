import type { SourceRegion } from './types'

export interface RegionOptions {
  classAttributes: string[]
  classFunctions: string[]
}

export interface ClassSourceRegion extends SourceRegion {
  literal: boolean
}

const expressionAttributes = new Set(['ngClass', ':class', 'v-bind:class'])

function skipWhitespace(text: string, offset: number): number {
  while (offset < text.length) {
    const char = text[offset]
    if (!char || !/\s/.test(char)) break
    offset++
  }
  return offset
}

function readQuoted(text: string, start: number): SourceRegion | null {
  const quote = text[start]
  if (quote !== '"' && quote !== "'" && quote !== '`') return null

  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
      const expression = readBalanced(text, i + 1, '{', '}')
      if (!expression) return { start: start + 1, end: text.length }
      i = expression.end
      continue
    }
    if (text[i] === quote) return { start: start + 1, end: i }
  }

  return { start: start + 1, end: text.length }
}

function skipString(text: string, start: number): number {
  const region = readQuoted(text, start)
  return region ? Math.min(region.end + 1, text.length) : text.length
}

function readBalanced(
  text: string,
  start: number,
  open: string,
  close: string,
): SourceRegion | null {
  if (text[start] !== open) return null

  let depth = 1
  for (let i = start + 1; i < text.length; i++) {
    const char = text[i]

    if (char === '"' || char === "'" || char === '`') {
      i = skipString(text, i) - 1
      continue
    }

    if (char === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i + 2)
      if (newline === -1) return { start: start + 1, end: text.length }
      i = newline
      continue
    }

    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) return { start: start + 1, end: text.length }
      i = end + 1
      continue
    }

    if (char === open) depth++
    else if (char === close && --depth === 0) return { start: start + 1, end: i }
  }

  return { start: start + 1, end: text.length }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findAttributeRegions(text: string, attributes: string[]): ClassSourceRegion[] {
  if (attributes.length === 0) return []

  const pattern = attributes
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length)
    .join('|')
  const regex = new RegExp(`(?<![\\w:-])(${pattern})\\s*=`, 'g')
  const regions: ClassSourceRegion[] = []

  for (const match of text.matchAll(regex)) {
    if (match.index == null) continue

    const valueStart = skipWhitespace(text, match.index + match[0].length)
    const char = text[valueStart]
    const region =
      char === '"' || char === "'" || char === '`'
        ? readQuoted(text, valueStart)
        : char === '{'
          ? readBalanced(text, valueStart, '{', '}')
          : null

    if (region && region.end > region.start) {
      regions.push({
        ...region,
        literal:
          (char === '"' || char === "'" || char === '`') &&
          !expressionAttributes.has(match[1] ?? ''),
      })
    }
  }

  return regions
}

function findFunctionRegions(text: string, patterns: string[]): ClassSourceRegion[] {
  if (patterns.length === 0) return []

  const validPatterns = patterns.filter((pattern) => {
    try {
      new RegExp(pattern)
      return true
    } catch {
      return false
    }
  })
  if (validPatterns.length === 0) return []

  const matcher = new RegExp(
    `(?<![\\w$])(?:${validPatterns.join('|')})(?![\\w$])\\s*(?=\\(|\\\`)`,
    'g',
  )

  const regions: ClassSourceRegion[] = []
  for (const match of text.matchAll(matcher)) {
    if (match.index == null) continue

    const cursor = skipWhitespace(text, match.index + match[0].length)
    const char = text[cursor]
    const region =
      char === '('
        ? readBalanced(text, cursor, '(', ')')
        : char === '`'
          ? readQuoted(text, cursor)
          : null

    if (region && region.end > region.start) {
      regions.push({ ...region, literal: char === '`' })
    }
  }

  return regions
}

export function findSourceRegions(text: string, options: RegionOptions): ClassSourceRegion[] {
  const regions = [
    ...findAttributeRegions(text, options.classAttributes),
    ...findFunctionRegions(text, options.classFunctions),
  ]

  regions.sort((a, b) => a.start - b.start || b.end - a.end)

  const deduped: ClassSourceRegion[] = []
  for (const region of regions) {
    const previous = deduped[deduped.length - 1]
    if (previous && previous.start === region.start && previous.end === region.end) continue
    deduped.push(region)
  }

  return deduped
}

function collectTemplateLiteralRegions(
  text: string,
  quoteStart: number,
  limit: number,
  regions: SourceRegion[],
): number {
  let segmentStart = quoteStart + 1

  for (let i = segmentStart; i < limit; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }

    if (text[i] === '$' && text[i + 1] === '{') {
      if (i > segmentStart) regions.push({ start: segmentStart, end: i })
      const expression = readBalanced(text, i + 1, '{', '}')
      if (!expression || expression.end >= limit) return limit
      collectQuotedLiteralRegions(text, expression.start, expression.end, regions)
      i = expression.end
      segmentStart = i + 1
      continue
    }

    if (text[i] === '`') {
      if (i > segmentStart) regions.push({ start: segmentStart, end: i })
      return i
    }
  }

  if (segmentStart < limit) regions.push({ start: segmentStart, end: limit })
  return limit
}

function collectQuotedLiteralRegions(
  text: string,
  start: number,
  end: number,
  regions: SourceRegion[],
): void {
  const isComparisonOperand = (quoteStart: number, quoteEnd: number): boolean => {
    const readOperator = (cursor: number, step: -1 | 1): string => {
      while (cursor >= start && cursor < end && /\s/.test(text[cursor] ?? '')) cursor += step

      let operator = ''
      while (
        cursor >= start &&
        cursor < end &&
        (text[cursor] === '=' ||
          text[cursor] === '!' ||
          text[cursor] === '<' ||
          text[cursor] === '>')
      ) {
        operator = step < 0 ? (text[cursor] ?? '') + operator : operator + (text[cursor] ?? '')
        cursor += step
      }
      return operator
    }

    const comparison = /^(?:===?|!==?|<=?|>=?)$/
    return (
      comparison.test(readOperator(quoteStart - 1, -1)) ||
      comparison.test(readOperator(quoteEnd + 1, 1))
    )
  }

  for (let i = start; i < end; i++) {
    const char = text[i]

    if (char === '"' || char === "'") {
      const region = readQuoted(text, i)
      if (!region) continue
      const boundedEnd = Math.min(region.end, end)
      if (boundedEnd > region.start && !isComparisonOperand(i, boundedEnd)) {
        regions.push({ start: region.start, end: boundedEnd })
      }
      i = boundedEnd
      continue
    }

    if (char === '`') {
      i = collectTemplateLiteralRegions(text, i, end, regions)
      continue
    }

    if (char === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i + 2)
      if (newline === -1 || newline >= end) return
      i = newline
      continue
    }

    if (char === '/' && text[i + 1] === '*') {
      const commentEnd = text.indexOf('*/', i + 2)
      if (commentEnd === -1 || commentEnd >= end) return
      i = commentEnd + 1
    }
  }
}

export function findClassTextRegions(
  text: string,
  sourceRegions: ClassSourceRegion[],
): SourceRegion[] {
  const regions: SourceRegion[] = []

  for (const sourceRegion of sourceRegions) {
    const outerQuote = text[sourceRegion.start - 1]
    const closesWithOuterQuote = outerQuote != null && text[sourceRegion.end] === outerQuote

    if (
      sourceRegion.literal &&
      (outerQuote === '"' || outerQuote === "'") &&
      closesWithOuterQuote
    ) {
      regions.push({ ...sourceRegion })
      continue
    }

    if (sourceRegion.literal && outerQuote === '`' && closesWithOuterQuote) {
      collectTemplateLiteralRegions(text, sourceRegion.start - 1, sourceRegion.end + 1, regions)
      continue
    }

    collectQuotedLiteralRegions(text, sourceRegion.start, sourceRegion.end, regions)
  }

  regions.sort((a, b) => a.start - b.start || a.end - b.end)
  return regions.filter(
    (region, index) =>
      index === 0 ||
      region.start !== regions[index - 1]!.start ||
      region.end !== regions[index - 1]!.end,
  )
}
