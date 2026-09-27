---
summary: 'How local Tailwind v4 installs and CSS entrypoints resolve, load design systems, validate candidates, classify breakpoints, and cache results.'
paths:
  - src/tailwind/project.ts
  - tests/project.test.ts
  - tests/variant-cache.test.ts
  - benchmarks/variants.bench.ts
---

# Tailwind Project Resolution

## Resolution

`src/tailwind/project.ts` walks ancestor package boundaries until local `tailwindcss` resolves. When controller supplies a VS Code workspace root, traversal stops there. Files outside a workspace have no supplied boundary, so lookup may continue toward filesystem root.

Only Tailwind v4 loads. CSS entrypoints use exact `@import "tailwindcss"` anchors. Relative CSS importers are followed upward to top-level roots. Nearest entrypoint to document wins; equal-distance entrypoints return no project.

## Design System

Project loader calls Tailwind's `__unstable__loadDesignSystem`, using project-relative stylesheet/module loading. This can execute modules referenced through Tailwind `@plugin` or `@config`, matching Tailwind tooling behavior.

Validator uses `candidatesToCss()` for complete-candidate validity and caches results per loaded design system. It also exposes the design system's configured prefix so analysis can distinguish prefix syntax from variants. Breakpoint/container classification combines design-system variant metadata with supported arbitrary breakpoint syntax. Optional specialized variant families use the loaded design system's `parseVariant()` structure, keeping built-in/custom variant semantics anchored to the project's Tailwind version.

## Caching and Failure

Manager caches document-directory resolution, discovered entrypoints per Tailwind install, and loaded projects per entrypoint. Null resolutions are cached too. `invalidateAll()` clears these project lookup caches; subsequent loads construct new validators.

Each `DesignSystemValidator` memoizes specialized variant classifications by the exact raw variant string, including `null` for generic/unknown results. The cache belongs to that CSS design system and stores semantic classifications independently of user style toggles. Exceptions propagate and leave the key uncached. The installed Tailwind 4.3.3 already memoizes `parseVariant()` internally; this additional map avoids repeated classification work. There is no timer or disk persistence. Cache size follows distinct variants encountered during that validator's lifetime.

`tests/variant-cache.test.ts` verifies hits, cached null, entrypoint isolation, reloads, and exception retry. `tests/project.test.ts` additionally checks real Tailwind custom-variant edits. `benchmarks/variants.bench.ts` compares identical variant-heavy input with default/specialized styles using warm caches; it excludes project loading, debounce, and editor rendering.

Missing installs, v3, ambiguous entrypoints, and design-system load failures return no project. Controller then clears decorations. CSS/PCSS/PostCSS and `package.json` filesystem changes invalidate all projects; local JS/TS modules reached through `@plugin` or `@config` are not individually watched.

Freshness boundaries: CSS is loaded from disk, so unsaved stylesheet edits do not replace a design system. Recursive watchers honor `files.watcherExclude` and do not automatically follow symlinks ([VS Code watcher API](https://code.visualstudio.com/api/references/vscode-api#workspace.createFileSystemWatcher)). Replacing the validator also leaves Node's module caches intact: the current plugin/config loader imports the same file URL, whose module can remain cached after CSS invalidation ([Node ESM cache](https://nodejs.org/api/esm.html#urls)). Plugin/config code changes can therefore require an extension-host reload. These are existing loader/watcher limits.
