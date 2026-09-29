# Decision Log

## 2026-08-11 — Tailwind v4 design system became semantic authority

Project-local Tailwind v4 validation replaced the temporary hand-maintained utility classifier. Reliable v3 support would require a separate config/JIT compatibility subsystem, so v3, missing installs, ambiguous projects, and failed design-system loads intentionally produce no highlighting.

## 2026-08-11 — Project discovery became import anchored

Exact `@import "tailwindcss"` anchors replaced stylesheet scoring and Tailwind-looking heuristics. Relative CSS importers are followed to top-level entrypoints; nearest entrypoint wins and equal-distance entrypoints return no project. Workspace roots bound ancestor resolution when VS Code supplies one.

## 2026-08-11 — Bundled Oxide kept as tokenizer

Extension keeps `@tailwindcss/oxide` as lazy candidate scanner because a user's `tailwindcss` install does not guarantee a directly resolvable Oxide package. Semantic validity and breakpoint metadata still come from user's Tailwind v4 design system.

## 2026-08-11 — Registry publishing remained manual after v0.1.0

Visual Studio Marketplace `v0.1.0` was released as six platform-specific packages. Registry writes remain explicit user-approved actions: approve exact version and registry immediately before publish, submit packages sequentially, inspect each result, and stop on first error. Automatic retries are prohibited.

## 2026-09-26 — Style controls stay native and restrained by default

Per-category behavior lives in normal VS Code settings while colors remain VS Code theme-color contribution points. Utility foreground coloring is opt-in so the default remains a faint underline, and non-Tailwind highlighting is opt-in because Tailwind-rejected classes can be intentional project CSS. The configuration command opens native extension settings instead of introducing a second custom settings system.

## 2026-09-27 — Configure Styles became a visual editor over native settings

The native-settings-only approach did not expose theme colors clearly or show what each Tailwind category affects. `Configure Styles` now opens an explicit webview with live examples, color pickers, opacity, enable/reset controls, and utility underline/text options. The panel remains a view/editor over existing User Settings and `workbench.colorCustomizations`; no second configuration store was introduced.

Configurator edits are staged locally until the user presses **Apply Changes**. This keeps live preview responsive without rewriting `settings.json` for every slider/toggle interaction or repeatedly triggering editor save participants.

## 2026-09-27 — Specialized syntax stays opt-in and variant colors derive from one base

Full arbitrary values, CSS-variable shorthand, and detailed arbitrary/relationship/attribute/pseudo-element/environment variant families are opt-in so existing highlighting does not become noisier. Disabled variant families deliberately emit the normal `variant` group. Configure Styles exposes one Variant base color and derives the optional family palette from it, preserving opacity, instead of adding five unrelated color decisions. Independent colors use a native color picker plus a separate opacity slider.

## 2026-09-28 — Specialized variant colors became independently editable

The derived-only configurator made specialized variant families behave differently from every other style and prevented targeted customization. Their shipped light/dark/high-contrast defaults still derive from the Variant palette, but Configure Styles now exposes the same color and opacity controls for each family. Changing Variant no longer rewrites specialized family colors; Reset restores each family's contributed derived default. The Environment / Media accent moved toward a deeper blue.

## 2026-09-27 — Repository optimization kept one package and reduced shared knowledge

The repository remains one extension package because introducing a workspace/packages hierarchy would add boundaries without an independently useful package. Prettier was replaced by one strict Biome gate, TypeScript moved to 7.x, development/CI moved to Node 24 while the extension bundle kept Node 20 compatibility, and CI validation was separated from the six native packaging jobs while retaining representative macOS/Windows tests. Runtime style metadata moved behind one registry plus a manifest-consistency test. Tailwind invalidation became package/dependency-aware, cold stylesheet discovery uses bounded concurrent I/O, and unsupported documents no longer copy their full text before project resolution succeeds.
