---
summary: 'VS Code extension lifecycle, configuration merge, debouncing, stale-result guards, project invalidation, and decoration rendering behavior.'
paths:
  - src/extension.ts
  - src/extension/
  - package.json
---

# Extension Runtime

## Lifecycle

Extension activates on `onStartupFinished` and runs as a workspace extension. `HighlightController` schedules visible editors immediately and debounces document edits per `TextEditor`, so split editors do not cancel each other.

Update order is deliberate:

1. Reject non-file, disabled, or unsupported-language documents and clear decorations.
2. Resolve Tailwind project for document.
3. Lazy-load Oxide scanner only after project exists.
4. Analyze snapshot and apply decorations.

Document-version checks after each async boundary drop stale results. Unexpected analysis errors are logged and decorations cleared.

## Configuration and Invalidation

`src/extension/config.ts` reads `tailwindClassHighlighting.*` and merges class attributes/functions with Tailwind CSS IntelliSense's `tailwindCSS.classAttributes` and `tailwindCSS.classFunctions`, deduplicating values.

Config changes rebuild decoration types and rescan visible editors. CSS/PCSS/PostCSS or `package.json` create/change/delete events clear Tailwind project caches and rescan visible editors.

## Rendering

`src/extension/decorations.ts` maps span groups to VS Code theme colors, batches ranges per group, and avoids reapplying unchanged groups. Theme colors are contributed through `package.json`, so themes/users can override them with normal VS Code color customization.
