export interface CandidateRange {
  start: number
  end: number
}

export interface CandidateParts {
  variantRanges: CandidateRange[]
  utilityStart: number
}

export function splitCandidate(candidate: string): CandidateParts {
  const variantRanges: CandidateRange[] = []
  let squareDepth = 0
  let parenDepth = 0
  let quote: string | null = null
  let segmentStart = 0

  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i]

    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '[') squareDepth++
    else if (char === ']') squareDepth = Math.max(0, squareDepth - 1)
    else if (char === '(') parenDepth++
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1)
    else if (char === ':' && squareDepth === 0 && parenDepth === 0) {
      variantRanges.push({ start: segmentStart, end: i + 1 })
      segmentStart = i + 1
    }
  }

  return { variantRanges, utilityStart: segmentStart }
}

export function findArbitraryBracketRanges(candidate: string): CandidateRange[] {
  const ranges: CandidateRange[] = []
  let quote: string | null = null

  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i]

    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '[' || char === ']') ranges.push({ start: i, end: i + 1 })
  }

  return ranges
}

export function findImportantModifierRanges(
  candidate: string,
  utilityStart: number,
): CandidateRange[] {
  const ranges: CandidateRange[] = []

  if (candidate[utilityStart] === '!') {
    ranges.push({ start: utilityStart, end: utilityStart + 1 })
  }

  const last = candidate.length - 1
  if (last >= utilityStart && candidate[last] === '!' && last !== utilityStart) {
    ranges.push({ start: last, end: last + 1 })
  }

  return ranges
}

export function findModifierRanges(
  candidate: string,
  parts = splitCandidate(candidate),
): CandidateRange[] {
  const ranges: CandidateRange[] = []
  const segments = [
    ...parts.variantRanges.map((range) => ({ start: range.start, end: range.end - 1 })),
    {
      start: parts.utilityStart,
      end: candidate.endsWith('!') ? candidate.length - 1 : candidate.length,
    },
  ]

  for (const segment of segments) {
    let squareDepth = 0
    let parenDepth = 0
    let quote: string | null = null

    for (let i = segment.start; i < segment.end; i++) {
      const char = candidate[i]

      if (quote) {
        if (char === '\\') i++
        else if (char === quote) quote = null
        continue
      }

      if (char === '\\') {
        i++
        continue
      }

      if (char === '"' || char === "'" || char === '`') {
        quote = char
        continue
      }

      if (char === '[') squareDepth++
      else if (char === ']') squareDepth = Math.max(0, squareDepth - 1)
      else if (char === '(') parenDepth++
      else if (char === ')') parenDepth = Math.max(0, parenDepth - 1)
      else if (char === '/' && squareDepth === 0 && parenDepth === 0) {
        ranges.push({ start: i, end: segment.end })
        break
      }
    }
  }

  return ranges
}
