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
2. `src/core/analyze.ts` sorts and merges overlapping or adjacent regions, joins them with newlines, and scans that compact buffer once through Oxide. Mapping stays in JS UTF-16 offsets; candidates crossing region boundaries are discarded. Scanner hits are then filtered back to literal class-text ranges or unquoted object keys, preventing ordinary expression identifiers such as variables named `flex` from being styled.
3. Unique candidates are batch-validated through `CandidateValidator`. Invalid colon candidates get one deduplicated probe batch for their utility and each individual variant+utility pair; cached validator results make repeated scans cheap.
4. `src/core/candidate.ts` splits top-level variants, finds slash modifiers outside balanced arbitrary syntax, finds arbitrary brackets/full utility arbitrary values, recognizes Tailwind v4 `-(...)` CSS-variable shorthand, and detects leading/trailing important modifiers.
5. Spans are deduplicated and sorted before rendering.

## Visual Rules

- `utility`: utility portion through candidate end, faint dotted underline.
- `breakpoint`: design-system breakpoint/container names plus syntactic arbitrary `min-[…]`, `max-[…]`, and `@[…]` forms.
- `variant`: other variants such as state/data/aria forms.
- `arbitraryVariant`, `relationshipVariant`, `attributeVariant`, `pseudoElementVariant`, `environmentVariant`: optional refinements of valid Variant syntax. When their setting is off, analysis emits `variant` instead. Breakpoints keep precedence.
- `unresolvedVariant`: invalid variant segment whose utility validates and whose individual variant+utility probe does not.
- `prefix`: project-configured Tailwind prefix from the loaded design system.
- `modifier`: top-level slash modifier/fraction such as `/50`, `/item`, or `/2`; slashes inside `[]`/`()` remain value syntax.
- `arbitrary`: individual `[` and `]` characters only.
- `arbitraryValue`: opt-in complete `[...]` value in the utility portion; when enabled, its brackets are not also emitted as `arbitrary`.
- `cssVariable`: opt-in Tailwind v4 `(--name)` / `(type:--name)` shorthand range.
- `important`: whole candidate when utility has leading or trailing `!`.
- `nonTailwind`: opt-in whole-token treatment for rejected candidates contained in literal class text. Unquoted object keys can receive normal Tailwind highlighting when valid, but rejected object keys are not labeled non-Tailwind.

Important valid candidates suppress other foreground groups only while important styling is enabled; disabling it reveals enabled constituent styles. Invalid candidates emit unresolved-variant highlighting only when the underlying utility validates and at least one individual variant probe fails. Other rejected literal class tokens emit `nonTailwind` only when that opt-in group is enabled.

Prefixed projects preserve the project prefix in unresolved-variant probes, so a configured prefix is never mistaken for a normal variant.

Specialized variant classification comes from Tailwind's loaded design system via `parseVariant()` where available. Optional family classification is skipped entirely when no specialized variant group is enabled.

The project validator caches each raw variant's family, including generic/unknown `null` results, for the lifetime of its loaded CSS design system. Analysis applies the current enabled-group fallback after that lookup, so changing style toggles keeps its existing behavior.

## Scanner Boundary

`src/core/scanner.ts` lazy-imports one Oxide scanner. Failed imports are retryable. Oxide tokenizes candidates; Tailwind project validation decides semantic validity.
