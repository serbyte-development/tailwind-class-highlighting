# Tailwind Class Highlighting

[![CI](https://github.com/Serbyte-Development/tailwind-class-highlighting/actions/workflows/ci.yml/badge.svg)](https://github.com/Serbyte-Development/tailwind-class-highlighting/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<!--
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/serbytedevelopment.tailwind-class-highlighting)](https://marketplace.visualstudio.com/items?itemName=serbytedevelopment.tailwind-class-highlighting)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/serbytedevelopment.tailwind-class-highlighting)](https://marketplace.visualstudio.com/items?itemName=serbytedevelopment.tailwind-class-highlighting)
[![Open VSX Version](https://img.shields.io/open-vsx/v/serbytedevelopment/tailwind-class-highlighting)](https://open-vsx.org/extension/serbytedevelopment/tailwind-class-highlighting)
-->

Make dense Tailwind CSS v4 class lists easier to read in VS Code, Cursor, and compatible editors.

### With Tailwind Class Highlighting

![Tailwind classes with responsive, state, arbitrary, and important highlighting](images/after.png)

### Before

![Tailwind classes without Tailwind Class Highlighting](images/before.png)

- **See responsive changes immediately.** Breakpoints and container-query variants stand out from normal utilities.
- **Separate behavior from layout.** `hover:`, `focus:`, `dark:`, `data-*`, `aria-*`, and other variants use their own color.
- **Catch inactive custom variants.** Unresolved variants stay visible with a muted warning color when the utility after them is still valid Tailwind.
- **See prefixes and modifiers.** Project prefixes and slash modifiers such as `/50`, `/item`, and fractions get their own optional visual treatment.
- **Spot arbitrary values quickly.** Only the square brackets in values such as `w-[317px]` are colored.
- **Make important classes obvious.** Classes using `!` get one foreground treatment across the whole candidate.
- **Keep normal utilities calm.** Recognized utilities keep the editor's normal text color and receive only a faint dotted underline.
- **Leave ordinary custom classes alone by default.** Optional non-Tailwind highlighting can color literal class text rejected by Tailwind.
- **Follow your actual Tailwind project.** Tailwind v4 utilities, theme values, custom variants, custom breakpoints, and `@utility` definitions are validated by the project's own Tailwind installation.

**Requires Tailwind CSS v4.** Tailwind CSS v3 and earlier are intentionally unsupported.

**Developed & maintained by [Serbyte Development](https://www.serbyte.net/)** · [GitHub](https://github.com/Serbyte-Development)

## Why use it?

Tailwind puts a lot of information inside one string. Once a component has responsive styles, state variants, arbitrary values, container queries, and important modifiers, that string becomes much harder to scan than the JSX around it.

Tailwind Class Highlighting adds just enough visual structure to make those class lists readable without turning every utility into a rainbow.

## Highlighting

- Tailwind utilities get a faint dotted underline.
- Breakpoint variants such as `sm:`, `md:`, `max-lg:`, and container-query breakpoints use a distinct color.
- State and behavior variants such as `hover:`, `focus:`, `dark:`, `data-*`, and `aria-*` use a second color.
- Optional variant families can distinguish arbitrary, relationship (`group-*`/`peer-*`/`has-*`/`in-*`), attribute (`data-*`/`aria-*`), pseudo-element, and environment/media variants. They are disabled by default and fall back to the normal Variant color.
- Unresolved variants such as a removed `@custom-variant` use a muted warning color when their underlying utility still validates.
- Configured Tailwind prefixes such as `tw:` can use their own color.
- Slash modifiers and fractions such as `/50`, `/item`, and `/2` can use their own color.
- Square brackets in arbitrary values and variants such as `w-[317px]` and `[&>svg]:size-4` use a subtle third color.
- Full arbitrary values such as `[317px]` and Tailwind v4 CSS-variable shorthand such as `(--brand-color)` can optionally use their own colors; both are disabled by default.
- Important classes using a leading or trailing `!` use one foreground color across the whole class.
- Literal class text rejected by Tailwind can optionally use a non-Tailwind color; this is disabled by default.

Important styling takes foreground precedence while enabled. Disabling important styling reveals the enabled prefix, variant, modifier, and arbitrary treatments underneath. Theme defaults are provided for light, dark, and high-contrast themes.

### Theme colors

All visual colors are native VS Code theme colors and can be overridden with `workbench.colorCustomizations`:

```json
{
  "workbench.colorCustomizations": {
    "tailwindClassHighlighting.utilityUnderline": "#8080805C",
    "tailwindClassHighlighting.breakpoint": "#51FFFF",
    "tailwindClassHighlighting.variant": "#2DF3AC",
    "tailwindClassHighlighting.arbitraryVariant": "#6FC1D0",
    "tailwindClassHighlighting.relationshipVariant": "#28E5CA",
    "tailwindClassHighlighting.attributeVariant": "#8AC77A",
    "tailwindClassHighlighting.pseudoElementVariant": "#87B9B1",
    "tailwindClassHighlighting.environmentVariant": "#44D0CF",
    "tailwindClassHighlighting.unresolvedVariant": "#E5C07B",
    "tailwindClassHighlighting.prefix": "#7AA2F7",
    "tailwindClassHighlighting.modifier": "#F0A868",
    "tailwindClassHighlighting.arbitrary": "#C4A7E7",
    "tailwindClassHighlighting.arbitraryValue": "#C4A7E7",
    "tailwindClassHighlighting.cssVariable": "#7AA2F7",
    "tailwindClassHighlighting.important": "#FF7AC6",
    "tailwindClassHighlighting.nonTailwind": "#A0A0A0"
  }
}
```

Use **Tailwind Class Highlighting: Configure Styles** from the Command Palette for a live visual editor. Utility and independent categories have color controls; specialized variant-family colors are derived automatically from the single Variant base color. Utility also exposes underline style and optional text coloring. The panel writes the same settings shown below, so manual `settings.json` editing remains fully supported.

On editor runtimes with alpha-capable native color pickers, opacity is selected inside the color picker. Older runtimes get a compact percentage fallback. Opacity is stored in the color alpha channel; for example, `#E5C07B80` is roughly 50% opacity.

The extension is intentionally focused on readability. It does not provide completion, linting, formatting, or class sorting, and is designed to work alongside the official Tailwind CSS IntelliSense extension.

## Supported class contexts

- `class` and `className`
- Vue `:class` / `v-bind:class`
- Angular `ngClass`
- Astro `class:list`
- `clsx`, `classnames`, `cn`, `cva`, `twMerge`
- configurable class functions and tagged templates

Tailwind Class Highlighting also reads custom `tailwindCSS.classFunctions` and `tailwindCSS.classAttributes` settings when Tailwind CSS IntelliSense is installed.

## Tailwind support

Candidate extraction is powered by a bundled, lazy `@tailwindcss/oxide` scanner. Semantic Tailwind v4 validation comes from the workspace project's installed `tailwindcss` package and CSS design system.

This means project-defined Tailwind features such as `@utility`, `@custom-variant`, custom theme values, custom breakpoints, and custom container-query names work without waiting for this extension to add matching utility rules.

For Tailwind v4, `@import "tailwindcss"` is the project anchor. The extension finds those imports within the document's workspace/package boundary, follows relative CSS importers upward to the top-level root, and keeps multiple Tailwind entrypoints isolated. It never searches above the active VS Code workspace folder, and if two roots are equally plausible it leaves the document unchanged rather than guessing.

Tailwind CSS v3 and earlier are intentionally unsupported. If no local Tailwind v4 project can be resolved, or its design system cannot be loaded, the extension leaves the document unchanged rather than guessing which classes are Tailwind.

The bundled Oxide scanner remains intentional: installing `tailwindcss` alone does not guarantee that `@tailwindcss/oxide` exists in the project.

## Platforms

Oxide is a native dependency, so releases are packaged separately for:

- macOS x64 and arm64
- Windows x64 and arm64
- Linux x64 and arm64

## Settings

All settings are under `tailwindClassHighlighting`:

- `enabled` - enable or disable highlighting.
- `languages` - VS Code language IDs to scan.
- `classAttributes` - additional class-bearing attributes.
- `classFunctions` - regular-expression patterns for class helper functions or tagged templates.
- `debounceMs` - edit debounce from 0 to 250 ms.
- `styles.utility.enabled` - enable utility highlighting.
- `styles.utility.underlineStyle` - `dotted`, `solid`, `dashed`, `double`, or `none`.
- `styles.utility.colorEnabled` - optionally apply the utility foreground color; disabled by default.
- `styles.breakpoint.enabled`, `styles.variant.enabled`, `styles.unresolvedVariant.enabled`, `styles.prefix.enabled`, `styles.modifier.enabled`, `styles.arbitrary.enabled`, and `styles.important.enabled` - toggle each Tailwind visual category independently.
- `styles.arbitraryVariant.enabled`, `styles.relationshipVariant.enabled`, `styles.attributeVariant.enabled`, `styles.pseudoElementVariant.enabled`, and `styles.environmentVariant.enabled` - opt into specialized variant families. Each falls back to `variant` when disabled, and Configure Styles derives their palette from the Variant base color.
- `styles.arbitraryValue.enabled` - color the complete arbitrary value such as `[317px]`; disabled by default.
- `styles.cssVariable.enabled` - color Tailwind v4 CSS-variable shorthand such as `(--brand-color)`; disabled by default.
- `styles.nonTailwind.enabled` - opt into highlighting literal class text rejected by Tailwind; disabled by default.

Run **Tailwind Class Highlighting: Configure Styles** from the Command Palette to open the live configurator. Changes are saved to User Settings. Colors remain native theme colors under `workbench.colorCustomizations`, and behavior remains under `tailwindClassHighlighting.styles.*`.

## Performance

The extension scans only class-bearing source regions, performs one Oxide scan per update, caches project/design-system resolution, caches candidate validity inside each loaded design system, batches ranges by visual treatment, and skips decoration calls whose ranges did not change. Unresolved-variant detection adds one deduplicated validation batch only when an invalid candidate contains variants. Literal-range tracking for non-Tailwind classes runs only when that opt-in style is enabled. Oxide and project-local Tailwind loading happen only when a supported editor actually needs highlighting.

The synthetic dense-file benchmark can be run with:

```sh
npm run bench
```

## Development

```sh
npm install
npm test
npm run check
npm run format:check
npm run build
npm run bench
npm run package
```

`npm run package` creates a VSIX for the current operating system and CPU architecture. The Package GitHub Actions workflow builds all six supported release targets.

## Support

For bugs, compatibility issues, or feature requests, open an issue in the GitHub repository. See `SUPPORT.md` for support scope.

## License

MIT. Tailwind CSS Oxide is also MIT licensed; see `THIRD_PARTY_NOTICES.md`.
