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

`src/extension/config.ts` reads `tailwindClassHighlighting.*`, including per-style enablement, utility underline style, and optional utility foreground color. It also merges class attributes/functions with Tailwind CSS IntelliSense's `tailwindCSS.classAttributes` and `tailwindCSS.classFunctions`, deduplicating values.

Config changes rebuild decoration types and rescan visible editors. CSS/PCSS/PostCSS or `package.json` create/change/delete events clear Tailwind project caches and rescan visible editors.

`Tailwind Class Highlighting: Configure Styles` opens a dedicated webview panel implemented in `src/extension/style-configurator.ts`. It is a visual editor over normal User Settings: behavior writes to `tailwindClassHighlighting.styles.*`, colors/opacity write to `workbench.colorCustomizations`, and reset removes those user overrides so contributed light/dark/high-contrast defaults apply again. External settings or color-theme changes refresh the open panel.

The webview uses no separate state store or frontend framework. Its controls and live Tailwind examples communicate with the workspace extension through VS Code webview messages. `src/extension/style-color.ts` owns hex/alpha conversion and preservation of unrelated workbench color customizations.

## Rendering

`src/extension/decorations.ts` creates only enabled decoration groups, maps foreground groups to VS Code theme colors, applies the configured utility underline/color behavior, batches ranges per group, and avoids reapplying unchanged groups. Theme colors are contributed through `package.json`, so themes/users can override them with normal VS Code color customization.

Configure Styles gives only the base `variant` an independent color picker. Optional variant-family swatches are derived by mixing that base with fixed accent hues while preserving alpha, and changing Variant writes the derived theme-color overrides together. Native color inputs use their alpha channel when the editor runtime supports it; older runtimes expose a small numeric opacity fallback rather than a separate slider.
