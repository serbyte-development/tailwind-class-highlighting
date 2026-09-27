# Build Plan

## Goal

Replace the Configure Styles command's native-settings redirect with a focused visual configurator. Users should see each supported Tailwind highlight type, change its behavior, color, and opacity, and immediately understand the result through a live Tailwind example. Changes must continue to use normal VS Code settings and theme-color overrides as the single source of truth.

Representative layout:

```text
Utility
[✓ Enabled]  [■ Color + Alpha]
Underline: [Dotted ▼]
Color text: [ ]

flex items-center gap-4

Breakpoint
[✓ Enabled]  [■ Color + Alpha]

md:flex lg:grid

Unresolved Variant
[✓ Enabled]  [■ Color + Alpha]

active-true:bg-red-500

Non-Tailwind
[ ] Enabled  [■ Color + Alpha]

custom-card
```

## Build

- [x] `Tailwind Class Highlighting: Configure Styles` opens a dedicated editor panel that matches VS Code/Cursor theming and keyboard/accessibility conventions.
- [x] Every supported highlight category has an enabled toggle, reset action, and live example; independent categories have color/alpha controls while specialized variant families derive from Variant.
- [x] Utility additionally controls underline style and whether its selected color is applied to utility text.
- [x] Color and opacity changes update the preview immediately and persist through `workbench.colorCustomizations` without overwriting unrelated color settings.
- [x] Behavioral controls persist through existing `tailwindClassHighlighting.styles.*` settings and reflect external User Settings changes while the panel is open.
- [x] Existing dark, light, and high-contrast defaults remain the reset/fallback values.
- [x] README/wiki explain the visual configurator and the underlying settings source of truth.
- [x] Tests cover color/opacity conversion and color-customization preservation; lint, tests, typecheck, formatting, production build, packaging, and wiki freshness all pass.

## Constraints and Assumptions

- No second configuration store. The panel edits the same VS Code settings users can edit manually.
- The panel is opened explicitly by command and is never shown automatically.
- Opacity is represented by the alpha channel of the configured theme color.
- Utility uses one configurator color for its underline and optional text color; direct JSON customization remains available for advanced overrides.

## Specialized Tailwind Syntax

- [x] Keep the current broad Variant and bracket-only Arbitrary treatments as the default fallback.
- [x] Add opt-in full arbitrary-value and CSS-variable highlighting.
- [x] Add opt-in arbitrary, relationship, attribute, pseudo-element, and environment/media variant families.
- [x] Derive specialized variant colors automatically from the single Variant base color.
- [x] Remove the dedicated opacity slider and use alpha-capable native color pickers, with a compact fallback for older editor runtimes.
- [x] Validate fallback behavior, derived palette updates, tests, lint, build, package, and wiki freshness.
