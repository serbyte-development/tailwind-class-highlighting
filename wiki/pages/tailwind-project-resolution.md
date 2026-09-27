---
summary: 'How local Tailwind v4 installs and CSS entrypoints resolve, load design systems, validate candidates, classify breakpoints, and cache results.'
paths:
  - src/tailwind/project.ts
  - tests/project.test.ts
---

# Tailwind Project Resolution

## Resolution

`src/tailwind/project.ts` walks ancestor package boundaries until local `tailwindcss` resolves. When controller supplies a VS Code workspace root, traversal stops there. Files outside a workspace have no supplied boundary, so lookup may continue toward filesystem root.

Only Tailwind v4 loads. CSS entrypoints use exact `@import "tailwindcss"` anchors. Relative CSS importers are followed upward to top-level roots. Nearest entrypoint to document wins; equal-distance entrypoints return no project.

## Design System

Project loader calls Tailwind's `__unstable__loadDesignSystem`, using project-relative stylesheet/module loading. This can execute modules referenced through Tailwind `@plugin` or `@config`, matching Tailwind tooling behavior.

Validator uses `candidatesToCss()` for complete-candidate validity and caches results per loaded design system. It also exposes the design system's configured prefix so analysis can distinguish prefix syntax from variants. Breakpoint/container classification combines design-system variant metadata with supported arbitrary breakpoint syntax.

## Caching and Failure

Manager caches document-directory resolution, discovered entrypoints per Tailwind install, and loaded projects per entrypoint. Null resolutions are cached too. `invalidateAll()` clears all caches.

Missing installs, v3, ambiguous entrypoints, and design-system load failures return no project. Controller then clears decorations. CSS/PCSS/PostCSS and `package.json` filesystem changes invalidate all projects; local JS/TS modules reached through `@plugin` or `@config` are not individually watched.
