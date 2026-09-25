---
summary: 'Core text-analysis pipeline: source regions, compact Oxide scan, candidate validation, syntax spans, and visual precedence.'
paths:
  - src/core/
  - tests/analyze.test.ts
  - tests/candidate.test.ts
  - tests/regions.test.ts
---

# Highlighting Pipeline

## Flow

1. `src/core/regions.ts` finds configured class attributes and helper/tag patterns. Parser is lightweight textual scanning, not a language AST. Balanced reads understand nested strings/comments, but top-level discovery does not globally parse source syntax.
2. `src/core/analyze.ts` sorts and merges overlapping or adjacent regions, joins them with newlines, and scans that compact buffer once through Oxide. Mapping stays in JS UTF-16 offsets; candidates crossing region boundaries are discarded.
3. Unique candidates are batch-validated through `CandidateValidator`. Only complete accepted candidates can emit spans.
4. `src/core/candidate.ts` splits top-level variants, finds arbitrary brackets, and detects leading/trailing important modifiers.
5. Spans are deduplicated and sorted before rendering.

## Visual Rules

- `utility`: utility portion through candidate end, faint dotted underline.
- `breakpoint`: design-system breakpoint/container names plus syntactic arbitrary `min-[…]`, `max-[…]`, and `@[…]` forms.
- `variant`: other variants such as state/data/aria forms.
- `arbitrary`: individual `[` and `]` characters only.
- `important`: whole candidate when utility has leading or trailing `!`.

Important candidates still get utility underline and suppress breakpoint, variant, and arbitrary foreground spans. Unrecognized candidates emit nothing.

## Scanner Boundary

`src/core/scanner.ts` lazy-imports one Oxide scanner. Failed imports are retryable. Oxide tokenizes candidates; Tailwind project validation decides semantic validity.
