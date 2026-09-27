---
summary: 'Mandatory startup context: product mental model, project-wide invariants, and routing cues for Tailwind Class Highlighting.'
---

# Project Overview

Tailwind Class Highlighting is a VS Code/Cursor workspace extension that adds restrained visual structure to valid Tailwind classes while leaving ordinary custom classes untouched.

## Mental Model

Core flow: find configured class-bearing source regions → resolve local Tailwind v4 project → lazy-load Oxide scanner → scan one compact buffer → validate complete candidates through that project's design system → emit visual spans → render VS Code decorations.

Tailwind owns semantics. Core analysis accepts an injected validator and contains no utility-family fallback. Missing Tailwind, v3, ambiguous CSS entrypoints, and design-system load failures produce no highlighting.

## Global Invariants

- Visual contract stays restrained by default: utility gets faint dotted underline with normal editor foreground; breakpoint/state/unresolved variants, configured prefix, slash modifiers, arbitrary brackets, and important candidates have separate treatments. Optional full arbitrary values, CSS-variable shorthand, and specialized arbitrary/relationship/attribute/pseudo-element/environment variant families are disabled by default. Disabled specialized variants fall back to normal `variant`. Configure Styles derives specialized variant colors from the single Variant base color and remains a visual editor over native VS Code settings/theme-color overrides.
- Project-local Tailwind v4 design system is sole authority for candidate validity and project breakpoint/container names.
- Extension runs in workspace host because runtime loads project-local packages and CSS. Project resolution happens before native scanner loading.
- Correctness wins over coverage. Ambiguous or unsupported project state clears decorations instead of guessing or falling back.

Use `index.md` to route into pipeline, Tailwind project resolution, extension runtime, build/release, or current risks.
