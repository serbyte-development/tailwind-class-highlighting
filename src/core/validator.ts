import type { SpecializedVariantGroup } from './types'

export interface CandidateValidator {
  getValidCandidates(candidates: readonly string[]): ReadonlySet<string>
  isBreakpointVariant(variant: string): boolean
  getPrefix(): string | null
  classifyVariant(variant: string): SpecializedVariantGroup | null
}
