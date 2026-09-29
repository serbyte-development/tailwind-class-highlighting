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

1. Reject non-filesystem (`file` / `vscode-remote`), disabled, or unsupported-language documents and clear decorations.
2. Resolve Tailwind project for document.
3. Lazy-load Oxide scanner only after project exists.
4. Analyze snapshot and apply decorations.

Document-version and controller-revision checks after each async boundary drop stale results after document edits, configuration changes, or Tailwind project invalidation. Unexpected analysis errors are logged and decorations cleared.

## Configuration and Invalidation

`src/extension/config.ts` reads `tailwindClassHighlighting.*`, including per-style enablement, utility underline style, and optional utility foreground color. It also merges class attributes/functions with Tailwind CSS IntelliSense's `tailwindCSS.classAttributes` and `tailwindCSS.classFunctions`, deduplicating values.

Persisted configuration is normalized at runtime. Wrong-type booleans/arrays/numbers, malformed class-function regexes, invalid underline values, and invalid color values fall back to the extension defaults instead of propagating into analysis or the configurator.

Config changes rebuild decoration types and rescan visible editors. CSS/PCSS/PostCSS events clear document resolution and evict affected loaded design systems, including external stylesheets actually loaded by another package. `package.json` and common package-lock files perform a full Tailwind-resolution reset because they can change ancestor/hoisted dependency resolution. Workspace-folder changes also reset project resolution. Visible editors are then rescanned.

The extension runs as a workspace extension and accepts `file` plus `vscode-remote` documents. `package.json` declares untrusted workspaces and virtual workspaces unsupported: Tailwind project loading can execute workspace-defined `@plugin` / `@config` modules, and the native Oxide/filesystem pipeline requires a real workspace filesystem.

`Tailwind Class Highlighting: Configure Styles` opens a dedicated webview panel implemented in `src/extension/style-configurator.ts`. It is a visual editor over normal User Settings, but edits are staged locally in the webview so preview interaction does not rewrite `settings.json`. **Apply Changes** sends the deduplicated change set to the extension; behavior writes to `tailwindClassHighlighting.styles.*`, colors/opacity are coalesced into one `workbench.colorCustomizations` update, and reset removes those user overrides so contributed light/dark/high-contrast defaults apply again. External settings or color-theme changes refresh the panel only when no local changes are pending.

The webview uses no separate state store or frontend framework. Its controls and live Tailwind examples communicate with the workspace extension through VS Code webview messages. `src/extension/style-registry.ts` owns runtime group defaults, color IDs, labels, and previews; `tests/style-registry.test.ts` prevents those values from drifting from `package.json`. `src/extension/style-color.ts` owns persisted hex/alpha conversion and the derived variant palette.

One **Apply Changes** button stays fixed at the bottom right in a persistent footer. The page reserves bottom space so the footer leaves the last controls reachable on narrow and wide panels.

## Rendering

`src/extension/decorations.ts` creates only enabled decoration groups, maps foreground groups to VS Code theme colors, applies the configured utility underline/color behavior, batches ranges per group, and avoids reapplying unchanged groups. Theme colors are contributed through `package.json`, so themes/users can override them with normal VS Code color customization.

Configure Styles gives every color category, including specialized variant families, the same independent color picker and opacity slider. `src/extension/style-color.ts` derives the shipped specialized defaults from Variant plus fixed accent hues; Environment / Media uses a deeper blue accent. After installation each family behaves like any other theme color and can be overridden independently. Reset removes that category's global and theme-specific User color overrides and restores its contributed default.
