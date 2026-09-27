import {
  findArbitraryBracketRanges,
  findArbitraryValueRanges,
  findCssVariableRanges,
  findImportantModifierRanges,
  findModifierRanges,
  splitCandidate,
} from './candidate'
import { findClassTextRegions, findSourceRegions, type RegionOptions } from './regions'
import type { CandidateScanner } from './scanner'
import {
  specializedVariantGroups,
  type HighlightGroup,
  type HighlightSpan,
  type SourceRegion,
} from './types'
import type { CandidateValidator } from './validator'

export interface AnalyzeOptions extends RegionOptions {
  enabledGroups?: ReadonlySet<HighlightGroup>
}

interface BufferRegion {
  bufferStart: number
  bufferEnd: number
  sourceStart: number
}

interface ClassifiedVariant {
  start: number
  end: number
  group: HighlightSpan['group']
}

interface CandidateSyntax {
  parts: ReturnType<typeof splitCandidate>
  prefixRange: SourceRegion | null
  arbitraryRanges: SourceRegion[]
  arbitraryValueRanges: SourceRegion[]
  cssVariableRanges: SourceRegion[]
  modifierRanges: SourceRegion[]
  important: boolean
}

const defaultDisabledGroups = new Set<HighlightGroup>([
  'nonTailwind',
  'arbitraryValue',
  'cssVariable',
  ...specializedVariantGroups,
])

function isGroupEnabled(options: AnalyzeOptions, group: HighlightGroup): boolean {
  return options.enabledGroups?.has(group) ?? !defaultDisabledGroups.has(group)
}

function classifyVariantGroup(
  validator: CandidateValidator,
  variantName: string,
  options: AnalyzeOptions,
  specializedVariantsEnabled: boolean,
): HighlightGroup {
  if (validator.isBreakpointVariant(variantName)) return 'breakpoint'
  if (!specializedVariantsEnabled) return 'variant'
  const specialized = validator.classifyVariant(variantName)
  return specialized && isGroupEnabled(options, specialized) ? specialized : 'variant'
}

function mergeRegions(regions: SourceRegion[]): SourceRegion[] {
  if (regions.length < 2) return regions

  const merged: SourceRegion[] = [{ ...regions[0]! }]
  for (let i = 1; i < regions.length; i++) {
    const region = regions[i]!
    const previous = merged[merged.length - 1]!

    if (region.start <= previous.end) {
      previous.end = Math.max(previous.end, region.end)
    } else {
      merged.push({ ...region })
    }
  }

  return merged
}

function buildScanBuffer(
  text: string,
  regions: SourceRegion[],
): { content: string; regions: BufferRegion[] } {
  const chunks: string[] = []
  const bufferRegions: BufferRegion[] = []
  let offset = 0

  for (const region of regions) {
    const chunk = text.slice(region.start, region.end)
    const bufferStart = offset
    const bufferEnd = bufferStart + chunk.length

    chunks.push(chunk, '\n')
    bufferRegions.push({ bufferStart, bufferEnd, sourceStart: region.start })
    offset = bufferEnd + 1
  }

  return { content: chunks.join(''), regions: bufferRegions }
}

function mapToSource(regions: BufferRegion[], start: number, end: number): number | null {
  let low = 0
  let high = regions.length - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    const region = regions[mid]!

    if (start < region.bufferStart) high = mid - 1
    else if (start >= region.bufferEnd) low = mid + 1
    else if (end <= region.bufferEnd) return region.sourceStart + (start - region.bufferStart)
    else return null
  }

  return null
}

function isContainedBy(regions: SourceRegion[], start: number, end: number): boolean {
  let low = 0
  let high = regions.length - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    const region = regions[mid]!

    if (start < region.start) high = mid - 1
    else if (start >= region.end) low = mid + 1
    else return end <= region.end
  }

  return false
}

function getPrefixRange(
  candidate: string,
  parts: ReturnType<typeof splitCandidate>,
  prefix: string | null,
): SourceRegion | null {
  if (!prefix) return null
  const first = parts.variantRanges[0]
  if (!first) return null
  return candidate.slice(first.start, first.end - 1) === prefix ? first : null
}

function buildVariantProbe(prefix: string | null, variant: string, utility: string): string {
  return prefix ? `${prefix}:${variant}${utility}` : `${variant}${utility}`
}

function addSpan(
  highlights: Map<string, HighlightSpan>,
  sourceStart: number,
  start: number,
  end: number,
  group: HighlightSpan['group'],
): void {
  const span: HighlightSpan = {
    start: sourceStart + start,
    end: sourceStart + end,
    group,
  }
  highlights.set(`${span.start}:${span.end}:${span.group}`, span)
}

export function analyzeText(
  text: string,
  options: AnalyzeOptions,
  scanner: CandidateScanner,
  validator: CandidateValidator,
): HighlightSpan[] {
  const discoveredRegions = findSourceRegions(text, options)
  const sourceRegions = mergeRegions(discoveredRegions)
  if (sourceRegions.length === 0) return []
  const nonTailwindEnabled = isGroupEnabled(options, 'nonTailwind')
  const classTextRegions = nonTailwindEnabled ? findClassTextRegions(text, discoveredRegions) : []

  const scanBuffer = buildScanBuffer(text, sourceRegions)
  const candidates = scanner.getCandidatesWithPositions({
    content: scanBuffer.content,
    extension: 'html',
  })
  const uniqueCandidates = [...new Set(candidates.map(({ candidate }) => candidate))]
  const validCandidates = validator.getValidCandidates(uniqueCandidates)
  const prefix = validator.getPrefix()
  const arbitraryEnabled = isGroupEnabled(options, 'arbitrary')
  const arbitraryValueEnabled = isGroupEnabled(options, 'arbitraryValue')
  const cssVariableEnabled = isGroupEnabled(options, 'cssVariable')
  const specializedVariantsEnabled = specializedVariantGroups.some((group) =>
    isGroupEnabled(options, group),
  )
  const modifierEnabled = isGroupEnabled(options, 'modifier')
  const importantEnabled = isGroupEnabled(options, 'important')
  const candidateSyntax = new Map<string, CandidateSyntax>(
    uniqueCandidates.map((candidate) => {
      const parts = splitCandidate(candidate)
      return [
        candidate,
        {
          parts,
          prefixRange: getPrefixRange(candidate, parts, prefix),
          arbitraryRanges: arbitraryEnabled ? findArbitraryBracketRanges(candidate) : [],
          arbitraryValueRanges: arbitraryValueEnabled
            ? findArbitraryValueRanges(candidate, parts.utilityStart)
            : [],
          cssVariableRanges: cssVariableEnabled
            ? findCssVariableRanges(candidate, parts.utilityStart)
            : [],
          modifierRanges: modifierEnabled ? findModifierRanges(candidate, parts) : [],
          important:
            importantEnabled &&
            findImportantModifierRanges(candidate, parts.utilityStart).length > 0,
        },
      ]
    }),
  )
  const probeCandidates = new Set<string>()

  for (const candidate of uniqueCandidates) {
    if (validCandidates.has(candidate)) continue

    const { parts, prefixRange } = candidateSyntax.get(candidate)!
    if (prefix && !prefixRange) continue
    const variants = prefixRange ? parts.variantRanges.slice(1) : parts.variantRanges
    if (variants.length === 0) continue

    const utility = candidate.slice(parts.utilityStart)
    if (!utility) continue

    probeCandidates.add(prefix ? `${prefix}:${utility}` : utility)
    for (const variant of variants) {
      probeCandidates.add(
        buildVariantProbe(prefix, candidate.slice(variant.start, variant.end), utility),
      )
    }
  }

  const validProbeCandidates =
    probeCandidates.size > 0
      ? validator.getValidCandidates([...probeCandidates])
      : new Set<string>()
  const unresolvedCandidates = new Map<string, ClassifiedVariant[]>()

  for (const candidate of uniqueCandidates) {
    if (validCandidates.has(candidate)) continue

    const { parts, prefixRange } = candidateSyntax.get(candidate)!
    if (prefix && !prefixRange) continue
    const variantRanges = prefixRange ? parts.variantRanges.slice(1) : parts.variantRanges
    const utility = candidate.slice(parts.utilityStart)
    const utilityProbe = prefix ? `${prefix}:${utility}` : utility
    if (!validProbeCandidates.has(utilityProbe)) continue

    const variants = variantRanges.map((variant): ClassifiedVariant => {
      const probe = buildVariantProbe(prefix, candidate.slice(variant.start, variant.end), utility)
      if (!validProbeCandidates.has(probe)) return { ...variant, group: 'unresolvedVariant' }

      const variantName = candidate.slice(variant.start, variant.end - 1)
      return {
        ...variant,
        group: classifyVariantGroup(validator, variantName, options, specializedVariantsEnabled),
      }
    })

    if (variants.some(({ group }) => group === 'unresolvedVariant')) {
      unresolvedCandidates.set(candidate, variants)
    }
  }
  const highlights = new Map<string, HighlightSpan>()

  for (const { candidate, position } of candidates) {
    const bufferStart = Number(position)
    const sourceStart = mapToSource(scanBuffer.regions, bufferStart, bufferStart + candidate.length)
    if (sourceStart == null) continue

    const syntax = candidateSyntax.get(candidate)!
    const { parts, prefixRange } = syntax

    if (!validCandidates.has(candidate)) {
      const variants = unresolvedCandidates.get(candidate)
      if (!variants) {
        if (
          nonTailwindEnabled &&
          isContainedBy(classTextRegions, sourceStart, sourceStart + candidate.length)
        ) {
          addSpan(highlights, sourceStart, 0, candidate.length, 'nonTailwind')
        }
        continue
      }

      if (prefixRange && isGroupEnabled(options, 'prefix')) {
        addSpan(highlights, sourceStart, prefixRange.start, prefixRange.end, 'prefix')
      }

      for (const variant of variants) {
        if (isGroupEnabled(options, variant.group)) {
          addSpan(highlights, sourceStart, variant.start, variant.end, variant.group)
        }
      }

      if (arbitraryEnabled) {
        for (const range of syntax.arbitraryRanges) {
          if (
            variants.some(
              (variant) =>
                variant.group !== 'variant' &&
                variant.group !== 'breakpoint' &&
                range.start >= variant.start &&
                range.end <= variant.end,
            )
          ) {
            continue
          }
          if (
            syntax.arbitraryValueRanges.some(
              (value) => range.start >= value.start && range.end <= value.end,
            )
          ) {
            continue
          }
          addSpan(highlights, sourceStart, range.start, range.end, 'arbitrary')
        }
      }

      for (const range of syntax.arbitraryValueRanges) {
        addSpan(highlights, sourceStart, range.start, range.end, 'arbitraryValue')
      }
      for (const range of syntax.cssVariableRanges) {
        addSpan(highlights, sourceStart, range.start, range.end, 'cssVariable')
      }

      if (modifierEnabled) {
        for (const range of syntax.modifierRanges) {
          if (
            variants.some(
              (variant) =>
                variant.group === 'unresolvedVariant' &&
                range.start >= variant.start &&
                range.end <= variant.end,
            )
          ) {
            continue
          }
          addSpan(highlights, sourceStart, range.start, range.end, 'modifier')
        }
      }

      if (isGroupEnabled(options, 'utility')) {
        addSpan(highlights, sourceStart, parts.utilityStart, candidate.length, 'utility')
      }
      continue
    }

    if (!syntax.important) {
      if (prefixRange && isGroupEnabled(options, 'prefix')) {
        addSpan(highlights, sourceStart, prefixRange.start, prefixRange.end, 'prefix')
      }

      for (const variant of prefixRange ? parts.variantRanges.slice(1) : parts.variantRanges) {
        const variantName = candidate.slice(variant.start, variant.end - 1)
        const group = classifyVariantGroup(
          validator,
          variantName,
          options,
          specializedVariantsEnabled,
        )
        if (isGroupEnabled(options, group)) {
          addSpan(highlights, sourceStart, variant.start, variant.end, group)
        }
      }

      if (arbitraryEnabled) {
        for (const range of syntax.arbitraryRanges) {
          const containingVariant = (
            prefixRange ? parts.variantRanges.slice(1) : parts.variantRanges
          ).find((variant) => range.start >= variant.start && range.end <= variant.end)
          if (containingVariant) {
            const variantName = candidate.slice(containingVariant.start, containingVariant.end - 1)
            if (
              classifyVariantGroup(validator, variantName, options, specializedVariantsEnabled) !==
              'variant'
            ) {
              continue
            }
          }
          if (
            syntax.arbitraryValueRanges.some(
              (value) => range.start >= value.start && range.end <= value.end,
            )
          ) {
            continue
          }
          addSpan(highlights, sourceStart, range.start, range.end, 'arbitrary')
        }
      }

      for (const range of syntax.arbitraryValueRanges) {
        addSpan(highlights, sourceStart, range.start, range.end, 'arbitraryValue')
      }
      for (const range of syntax.cssVariableRanges) {
        addSpan(highlights, sourceStart, range.start, range.end, 'cssVariable')
      }

      if (modifierEnabled) {
        for (const range of syntax.modifierRanges) {
          addSpan(highlights, sourceStart, range.start, range.end, 'modifier')
        }
      }
    }

    if (isGroupEnabled(options, 'utility')) {
      addSpan(highlights, sourceStart, parts.utilityStart, candidate.length, 'utility')
    }

    if (syntax.important) {
      addSpan(highlights, sourceStart, 0, candidate.length, 'important')
    }
  }

  return [...highlights.values()].sort((a, b) => a.start - b.start || a.end - b.end)
}
