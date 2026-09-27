import { describe, expect, it } from 'vitest'
import {
  findArbitraryBracketRanges,
  findImportantModifierRanges,
  findModifierRanges,
  splitCandidate,
} from '../src/core/candidate'

describe('splitCandidate', () => {
  it('splits normal variants from the utility', () => {
    expect(splitCandidate('md:hover:bg-red-500')).toEqual({
      variantRanges: [
        { start: 0, end: 3 },
        { start: 3, end: 9 },
      ],
      utilityStart: 9,
    })
  })

  it('does not split colons inside arbitrary variants or values', () => {
    const candidate = '[@supports(display:grid)]:bg-[color:oklch(50%_0.2_10)]'
    expect(splitCandidate(candidate)).toEqual({
      variantRanges: [{ start: 0, end: 26 }],
      utilityStart: 26,
    })
  })
})

describe('candidate emphasis ranges', () => {
  it('finds only square bracket characters across variants and utilities', () => {
    const candidate = '[&>svg]:w-[calc(100%-2rem)]'
    expect(findArbitraryBracketRanges(candidate)).toEqual([
      { start: 0, end: 1 },
      { start: 6, end: 7 },
      { start: 10, end: 11 },
      { start: candidate.length - 1, end: candidate.length },
    ])
  })

  it('finds leading and trailing important modifiers', () => {
    expect(findImportantModifierRanges('hover:!mt-4', 6)).toEqual([{ start: 6, end: 7 }])
    expect(findImportantModifierRanges('bg-red-500!', 0)).toEqual([{ start: 10, end: 11 }])
  })

  it('finds top-level slash modifiers while ignoring slashes inside arbitrary syntax', () => {
    const candidate = 'group-hover/item:bg-[url(/x.svg)]/50'
    expect(findModifierRanges(candidate)).toEqual([
      { start: 11, end: 16 },
      { start: 33, end: 36 },
    ])
    expect(findModifierRanges('w-1/2')).toEqual([{ start: 3, end: 5 }])
    expect(findModifierRanges(String.raw`bg-[foo\]bar/baz]`)).toEqual([])
  })
})
