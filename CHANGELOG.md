# Changelog

## Unreleased

- Highlight unresolved Tailwind variants with a muted warning color when the underlying utility remains valid, including removed project `@custom-variant` definitions.
- Add configurable enable/disable settings for every visual category.
- Add configurable utility underline styles and optional utility foreground coloring while keeping the default dotted underline with normal editor text color.
- Add project-aware Tailwind prefix highlighting and slash modifier/fraction highlighting.
- Add optional non-Tailwind class highlighting, disabled by default and constrained to literal class text so surrounding expression identifiers stay untouched.
- Add `Tailwind Class Highlighting: Configure Styles` to open the extension's normal VS Code settings.

## 0.1.0

- Initial release as Tailwind Class Highlighting.
- Tailwind Oxide candidate extraction with UTF-16 editor positions.
- Lazy Oxide loading so unsupported editor sessions do not load the native scanner.
- Tailwind v4 project discovery and validation through the workspace project's own installed `tailwindcss` design system.
- Tailwind v4 discovery anchors on `@import "tailwindcss"` and follows relative CSS importers upward instead of guessing from filenames or Tailwind-looking directives.
- Project-defined `@utility`, `@custom-variant`, theme values, breakpoints, and container-query names are understood from the project configuration.
- Multiple Tailwind CSS entrypoints and monorepo package boundaries are isolated during project resolution.
- Project resolution stays inside the document's VS Code workspace folder and refuses ambiguous equal-distance Tailwind roots rather than guessing.
- Faint dotted underlines for recognized Tailwind utilities.
- Separate breakpoint and state/behavior variant colors.
- Colored square brackets for arbitrary values and variants.
- Whole-class foreground coloring for important (`!`) utilities.
- Native VS Code theme colors for every visual treatment.
- Custom classes remain visually unchanged.
- Support for class attributes, `clsx`, `classnames`, `cn`, `cva`, `twMerge`, and tagged templates.
- Tailwind CSS v4 only; unsupported, missing, or broken Tailwind projects are left unchanged rather than using heuristic utility recognition.
- Batched decoration updates with unchanged-range suppression.
- Native release packaging for macOS, Windows, and Linux on x64 and arm64.
