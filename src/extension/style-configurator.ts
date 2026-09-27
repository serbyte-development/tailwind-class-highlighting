import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import { highlightGroups, specializedVariantGroups, type HighlightGroup } from '../core/types'
import {
  defaultUtilityColorEnabled,
  defaultUtilityUnderlineStyle,
  highlightStyleDefaults,
  type UtilityUnderlineStyle,
} from './config'
import {
  deriveVariantPalette,
  parseStyleColor,
  setColorCustomizations,
  type StyleColor,
  variantAccentColors,
} from './style-color'

interface ColorDefaults {
  dark: string
  light: string
  highContrast: string
  highContrastLight: string
}

interface ColorContribution {
  id: string
  defaults: ColorDefaults
}

interface StyleDescriptor {
  group: HighlightGroup
  title: string
  description: string
  colorId: string
  preview: string
  derivedFromVariant?: boolean
}

interface GroupState extends StyleColor {
  enabled: boolean
}

interface ConfiguratorState {
  groups: Record<HighlightGroup, GroupState>
  utilityUnderlineStyle: UtilityUnderlineStyle
  utilityColorEnabled: boolean
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'setEnabled'; group: HighlightGroup; value: boolean }
  | { type: 'setColor'; group: HighlightGroup; value: string }
  | { type: 'setUtilityUnderline'; value: UtilityUnderlineStyle }
  | { type: 'setUtilityColorEnabled'; value: boolean }
  | { type: 'resetGroup'; group: HighlightGroup }
  | { type: 'openSettingsJson' }

const descriptors: StyleDescriptor[] = [
  {
    group: 'utility',
    title: 'Utility',
    description: 'Recognized Tailwind utility. Underline stays subtle by default.',
    colorId: 'tailwindClassHighlighting.utilityUnderline',
    preview:
      '<span data-highlight="utility">flex</span> <span data-highlight="utility">items-center</span> <span data-highlight="utility">gap-4</span>',
  },
  {
    group: 'breakpoint',
    title: 'Breakpoint',
    description: 'Responsive and container-query variants.',
    colorId: 'tailwindClassHighlighting.breakpoint',
    preview:
      '<span data-highlight="breakpoint">md:</span>flex <span data-highlight="breakpoint">lg:</span>grid',
  },
  {
    group: 'variant',
    title: 'Variant',
    description: 'Base color for state/behavior variants and all optional variant families.',
    colorId: 'tailwindClassHighlighting.variant',
    preview:
      '<span data-highlight="variant">hover:</span>bg-red-500 <span data-highlight="variant">focus:</span>ring-2',
  },
  {
    group: 'arbitraryVariant',
    title: 'Arbitrary Variant',
    description: 'Opt-in family derived from Variant.',
    colorId: 'tailwindClassHighlighting.arbitraryVariant',
    preview: '<span data-highlight="arbitraryVariant">[&>svg]:</span>size-5',
    derivedFromVariant: true,
  },
  {
    group: 'relationshipVariant',
    title: 'Relationship Variant',
    description: 'group-*, peer-*, has-*, and in-* variants.',
    colorId: 'tailwindClassHighlighting.relationshipVariant',
    preview: '<span data-highlight="relationshipVariant">group-hover:</span>bg-red-500',
    derivedFromVariant: true,
  },
  {
    group: 'attributeVariant',
    title: 'Attribute Variant',
    description: 'data-* and aria-* variants.',
    colorId: 'tailwindClassHighlighting.attributeVariant',
    preview: '<span data-highlight="attributeVariant">data-[state=open]:</span>bg-red-500',
    derivedFromVariant: true,
  },
  {
    group: 'pseudoElementVariant',
    title: 'Pseudo-element Variant',
    description: 'before:, after:, placeholder:, selection:, and related variants.',
    colorId: 'tailwindClassHighlighting.pseudoElementVariant',
    preview: '<span data-highlight="pseudoElementVariant">before:</span>content-[\'•\']',
    derivedFromVariant: true,
  },
  {
    group: 'environmentVariant',
    title: 'Environment / Media Variant',
    description:
      'dark:, motion-*, print:, supports-*, orientation, pointer, and contrast variants.',
    colorId: 'tailwindClassHighlighting.environmentVariant',
    preview: '<span data-highlight="environmentVariant">dark:</span>bg-slate-950',
    derivedFromVariant: true,
  },
  {
    group: 'unresolvedVariant',
    title: 'Unresolved Variant',
    description: 'Variant Tailwind rejects while the utility itself remains valid.',
    colorId: 'tailwindClassHighlighting.unresolvedVariant',
    preview: '<span data-highlight="unresolvedVariant">active-true:</span>bg-red-500',
  },
  {
    group: 'prefix',
    title: 'Prefix',
    description: 'Project-configured Tailwind prefix.',
    colorId: 'tailwindClassHighlighting.prefix',
    preview: '<span data-highlight="prefix">tw:</span>flex',
  },
  {
    group: 'modifier',
    title: 'Modifier',
    description: 'Slash modifiers and fractions.',
    colorId: 'tailwindClassHighlighting.modifier',
    preview:
      'bg-red-500<span data-highlight="modifier">/50</span> group-hover<span data-highlight="modifier">/item</span>:flex',
  },
  {
    group: 'arbitrary',
    title: 'Arbitrary',
    description: 'Square brackets around arbitrary values and variants.',
    colorId: 'tailwindClassHighlighting.arbitrary',
    preview:
      'w-<span data-highlight="arbitrary">[</span>317px<span data-highlight="arbitrary">]</span> [&_svg]:size-5',
  },
  {
    group: 'arbitraryValue',
    title: 'Arbitrary Value',
    description: 'Opt-in full arbitrary values instead of bracket-only emphasis.',
    colorId: 'tailwindClassHighlighting.arbitraryValue',
    preview: 'w-<span data-highlight="arbitraryValue">[317px]</span>',
  },
  {
    group: 'cssVariable',
    title: 'CSS Variable',
    description: 'Tailwind v4 CSS-variable shorthand values.',
    colorId: 'tailwindClassHighlighting.cssVariable',
    preview: 'bg-<span data-highlight="cssVariable">(--brand-color)</span>',
  },
  {
    group: 'important',
    title: 'Important',
    description: 'Whole candidate when Tailwind important syntax is present.',
    colorId: 'tailwindClassHighlighting.important',
    preview: '<span data-highlight="important">hover:!mt-4</span>',
  },
  {
    group: 'nonTailwind',
    title: 'Non-Tailwind',
    description: 'Literal class text rejected by Tailwind. Disabled by default.',
    colorId: 'tailwindClassHighlighting.nonTailwind',
    preview: '<span data-highlight="nonTailwind">custom-card</span>',
  },
]

const descriptorByGroup = new Map(descriptors.map((descriptor) => [descriptor.group, descriptor]))
const specializedVariantGroupSet = new Set<HighlightGroup>(specializedVariantGroups)

function themeDefaultKey(): keyof ColorDefaults {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light:
      return 'light'
    case vscode.ColorThemeKind.HighContrast:
      return 'highContrast'
    case vscode.ColorThemeKind.HighContrastLight:
      return 'highContrastLight'
    default:
      return 'dark'
  }
}

function isHighlightGroup(value: unknown): value is HighlightGroup {
  return typeof value === 'string' && (highlightGroups as readonly string[]).includes(value)
}

function isUnderlineStyle(value: unknown): value is UtilityUnderlineStyle {
  return (
    value === 'dotted' ||
    value === 'solid' ||
    value === 'dashed' ||
    value === 'double' ||
    value === 'none'
  )
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export class StyleConfigurator implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined
  private writeQueue = Promise.resolve()
  private readonly subscriptions: vscode.Disposable[] = []
  private readonly colorDefaults = new Map<string, ColorDefaults>()

  constructor(private readonly context: vscode.ExtensionContext) {
    const colors = (context.extension.packageJSON?.contributes?.colors ?? []) as ColorContribution[]
    for (const color of colors) this.colorDefaults.set(color.id, color.defaults)

    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('tailwindClassHighlighting.styles') ||
          event.affectsConfiguration('workbench.colorCustomizations')
        ) {
          void this.postState()
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => void this.postState()),
    )
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'tailwindClassHighlighting.configureStyles',
      'Tailwind Class Highlighting: Configure Styles',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    )
    this.panel = panel
    panel.webview.html = this.getHtml()

    panel.onDidDispose(() => {
      this.panel = undefined
    })
    panel.webview.onDidReceiveMessage((message: unknown) => {
      this.writeQueue = this.writeQueue
        .then(() => this.handleMessage(message))
        .catch(async (error) => {
          console.error('[Tailwind Class Highlighting] Style UI error', error)
          void vscode.window.showErrorMessage(
            'Tailwind Class Highlighting could not save that style.',
          )
          await this.postState()
        })
    })
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) return
    const value = message as WebviewMessage

    if (value.type === 'ready') {
      await this.postState()
      return
    }
    if (value.type === 'openSettingsJson') {
      await vscode.commands.executeCommand('workbench.action.openSettingsJson')
      return
    }

    const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
    if (value.type === 'setEnabled' && isHighlightGroup(value.group)) {
      await config.update(
        `styles.${value.group}.enabled`,
        Boolean(value.value),
        vscode.ConfigurationTarget.Global,
      )
    } else if (value.type === 'setUtilityUnderline' && isUnderlineStyle(value.value)) {
      await config.update(
        'styles.utility.underlineStyle',
        value.value,
        vscode.ConfigurationTarget.Global,
      )
    } else if (value.type === 'setUtilityColorEnabled') {
      await config.update(
        'styles.utility.colorEnabled',
        Boolean(value.value),
        vscode.ConfigurationTarget.Global,
      )
    } else if (
      value.type === 'setColor' &&
      isHighlightGroup(value.group) &&
      !specializedVariantGroupSet.has(value.group) &&
      /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value.value)
    ) {
      await this.updateColor(value.group, value.value)
    } else if (value.type === 'resetGroup' && isHighlightGroup(value.group)) {
      await this.resetGroup(value.group)
    }

    await this.postState()
  }

  private getGlobalColorCustomizations(): Record<string, unknown> {
    const inspected = vscode.workspace
      .getConfiguration('workbench')
      .inspect<Record<string, unknown>>('colorCustomizations')
    return { ...(inspected?.globalValue ?? {}) }
  }

  private getActiveThemeKey(): string | null {
    const theme = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme')
    return theme ? `[${theme}]` : null
  }

  private getConfiguredColor(
    customizations: Readonly<Record<string, unknown>>,
    colorId: string,
  ): unknown {
    const themeKey = this.getActiveThemeKey()
    const themeValues = themeKey ? customizations[themeKey] : undefined
    if (themeValues && typeof themeValues === 'object' && !Array.isArray(themeValues)) {
      const themed = (themeValues as Record<string, unknown>)[colorId]
      if (typeof themed === 'string') return themed
    }
    return customizations[colorId]
  }

  private setConfiguredColor(
    customizations: Readonly<Record<string, unknown>>,
    colorId: string,
    value: string | undefined,
  ): Record<string, unknown> {
    const next = setColorCustomizations(customizations, [colorId], value)
    const themeKey = this.getActiveThemeKey()
    if (!themeKey) return next

    const themeValues = next[themeKey]
    if (!themeValues || typeof themeValues !== 'object' || Array.isArray(themeValues)) return next
    const themed = { ...(themeValues as Record<string, unknown>) }
    if (!Object.prototype.hasOwnProperty.call(themed, colorId)) return next

    if (value === undefined) delete themed[colorId]
    else themed[colorId] = value
    next[themeKey] = themed
    return next
  }

  private getDefaultColor(colorId: string): string {
    const defaults = this.colorDefaults.get(colorId)
    return defaults?.[themeDefaultKey()] ?? '#FFFFFF'
  }

  private getState(): ConfiguratorState {
    const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
    const customizations = this.getGlobalColorCustomizations()
    const groups = {} as Record<HighlightGroup, GroupState>

    for (const descriptor of descriptors) {
      const configured = this.getConfiguredColor(customizations, descriptor.colorId)
      const color = parseStyleColor(configured, this.getDefaultColor(descriptor.colorId))
      groups[descriptor.group] = {
        ...color,
        enabled:
          config.inspect<boolean>(`styles.${descriptor.group}.enabled`)?.globalValue ??
          highlightStyleDefaults[descriptor.group],
      }
    }

    const variantPalette = deriveVariantPalette(groups.variant.rgba)
    for (const group of specializedVariantGroups) {
      const color = parseStyleColor(variantPalette[group], variantPalette[group])
      groups[group] = { ...groups[group], ...color }
    }

    const underlineStyle =
      config.inspect<UtilityUnderlineStyle>('styles.utility.underlineStyle')?.globalValue ??
      defaultUtilityUnderlineStyle
    const colorEnabled =
      config.inspect<boolean>('styles.utility.colorEnabled')?.globalValue ??
      defaultUtilityColorEnabled

    return {
      groups,
      utilityUnderlineStyle: isUnderlineStyle(underlineStyle)
        ? underlineStyle
        : defaultUtilityUnderlineStyle,
      utilityColorEnabled: colorEnabled,
    }
  }

  private async updateColor(group: HighlightGroup, value: string): Promise<void> {
    const descriptor = descriptorByGroup.get(group)
    if (!descriptor) return

    const color = parseStyleColor(value, this.getDefaultColor(descriptor.colorId)).rgba
    let customizations = this.setConfiguredColor(
      this.getGlobalColorCustomizations(),
      descriptor.colorId,
      color,
    )

    if (group === 'variant') {
      const palette = deriveVariantPalette(color)
      for (const specializedGroup of specializedVariantGroups) {
        const specializedDescriptor = descriptorByGroup.get(specializedGroup)!
        customizations = this.setConfiguredColor(
          customizations,
          specializedDescriptor.colorId,
          palette[specializedGroup],
        )
      }
    }

    await vscode.workspace
      .getConfiguration('workbench')
      .update('colorCustomizations', customizations, vscode.ConfigurationTarget.Global)
  }

  private async resetGroup(group: HighlightGroup): Promise<void> {
    const descriptor = descriptorByGroup.get(group)
    if (!descriptor) return

    const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
    await config.update(`styles.${group}.enabled`, undefined, vscode.ConfigurationTarget.Global)
    if (group === 'utility') {
      await config.update(
        'styles.utility.underlineStyle',
        undefined,
        vscode.ConfigurationTarget.Global,
      )
      await config.update(
        'styles.utility.colorEnabled',
        undefined,
        vscode.ConfigurationTarget.Global,
      )
    }

    let customizations = this.getGlobalColorCustomizations()
    if (!specializedVariantGroupSet.has(group)) {
      customizations = this.setConfiguredColor(customizations, descriptor.colorId, undefined)
    }
    if (group === 'variant') {
      for (const specializedGroup of specializedVariantGroups) {
        customizations = this.setConfiguredColor(
          customizations,
          descriptorByGroup.get(specializedGroup)!.colorId,
          undefined,
        )
      }
    }
    await vscode.workspace
      .getConfiguration('workbench')
      .update('colorCustomizations', customizations, vscode.ConfigurationTarget.Global)
  }

  private async postState(): Promise<void> {
    if (!this.panel) return
    await this.panel.webview.postMessage({ type: 'state', state: this.getState() })
  }

  private getHtml(): string {
    const nonce = randomBytes(16).toString('base64')
    const variantAccents = JSON.stringify(variantAccentColors)
    const cards = descriptors
      .map(
        (descriptor) => `
        <section class="style-card" data-group="${descriptor.group}">
          <div class="card-heading">
            <div>
              <h2>${htmlEscape(descriptor.title)}</h2>
              <p>${htmlEscape(descriptor.description)}</p>
            </div>
            <button class="reset secondary" type="button">Reset</button>
          </div>
          <div class="controls">
            <label class="toggle-control">
              <input class="enabled" type="checkbox">
              <span>Enabled</span>
            </label>
            ${
              descriptor.derivedFromVariant
                ? `<div class="derived-color" title="Automatically derived from the Variant base color">
                    <span>Color</span>
                    <span class="derived-swatch" aria-hidden="true"></span>
                    <span class="muted">Derived from Variant</span>
                  </div>`
                : `<label class="color-control">
                    <span>Color</span>
                    <input class="color" type="color" alpha colorspace="limited-srgb" aria-label="${htmlEscape(descriptor.title)} color and opacity">
                  </label>
                  <label class="alpha-fallback" hidden>
                    <span>Opacity</span>
                    <input class="alpha-value" type="number" min="0" max="100" step="1" inputmode="numeric" aria-label="${htmlEscape(descriptor.title)} opacity percentage">
                    <span>%</span>
                  </label>`
            }
          </div>
          ${
            descriptor.group === 'utility'
              ? `<div class="utility-controls">
                  <label>Underline
                    <select class="underline-style">
                      <option value="dotted">Dotted</option>
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="double">Double</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  <label class="toggle-control">
                    <input class="color-text" type="checkbox">
                    <span>Color text</span>
                  </label>
                </div>`
              : ''
          }
          <div class="preview" aria-label="${htmlEscape(descriptor.title)} preview">${descriptor.preview}</div>
        </section>`,
      )
      .join('')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Configure Styles</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 32px 48px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    body:not(.ready) .style-card { opacity: 0.55; pointer-events: none; }
    .page { max-width: 940px; margin: 0 auto; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    h1 { font-size: 24px; line-height: 1.25; margin: 0 0 8px; font-weight: 600; }
    header p { margin: 0; color: var(--vscode-descriptionForeground); max-width: 680px; line-height: 1.5; }
    button, select, input { font: inherit; }
    button {
      border: 1px solid transparent;
      border-radius: 2px;
      padding: 5px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .style-card {
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      border-radius: 6px;
      padding: 16px;
      min-width: 0;
    }
    .style-card.disabled .preview { opacity: 0.62; }
    .card-heading { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
    h2 { font-size: 15px; margin: 0 0 5px; font-weight: 600; }
    .card-heading p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.4; min-height: 38px; }
    .controls { display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: center; margin-top: 16px; }
    label { color: var(--vscode-foreground); }
    .toggle-control, .color-control, .derived-color, .alpha-fallback { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
    input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--vscode-focusBorder); }
    input[type="color"] { width: 36px; height: 28px; padding: 1px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); cursor: pointer; }
    input[type="number"] { width: 58px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 4px 6px; }
    .derived-swatch { width: 28px; height: 20px; border-radius: 3px; border: 1px solid var(--vscode-input-border); }
    .muted { color: var(--vscode-descriptionForeground); }
    .utility-controls { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; margin-top: 12px; }
    .utility-controls > label:first-child { display: inline-flex; gap: 8px; align-items: center; }
    select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); padding: 4px 24px 4px 7px; }
    .preview {
      margin-top: 16px;
      padding: 14px;
      border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.7;
      white-space: nowrap;
      overflow-x: auto;
    }
    .footer { margin-top: 20px; display: flex; align-items: center; gap: 12px; color: var(--vscode-descriptionForeground); }
    @media (max-width: 780px) {
      body { padding: 20px 16px 36px; }
      header { flex-direction: column; }
      .style-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>Configure Styles</h1>
        <p>Preview and change Tailwind highlighting. Changes save to your User Settings and apply immediately in open editors. Workspace overrides can still take precedence.</p>
      </div>
      <button id="open-settings" class="secondary" type="button">Open Settings JSON</button>
    </header>
    <div class="style-grid" inert>${cards}</div>
    <div class="footer">Variant-family colors are derived automatically from Variant. Transparency is stored in the color alpha channel. Reset restores the current theme's extension defaults.</div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state;
    const alphaProbe = document.createElement('input');
    alphaProbe.type = 'color';
    alphaProbe.setAttribute('alpha', '');
    alphaProbe.value = '#12345680';
    const supportsAlphaColor = 'alpha' in alphaProbe && alphaProbe.value.toLowerCase() === '#12345680';
    const variantAccents = ${variantAccents};

    function colorWithOpacity(rgb, opacity) {
      const alpha = Math.round((Math.max(0, Math.min(100, Number(opacity))) / 100) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
      return rgb.toUpperCase() + alpha;
    }

    function parseColor(value, fallbackOpacity) {
      const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
      if (!match) return null;
      const rgb = '#' + match[1].toUpperCase();
      const opacity = match[2]
        ? Math.round((parseInt(match[2], 16) / 255) * 100)
        : fallbackOpacity;
      return { rgb, opacity, rgba: colorWithOpacity(rgb, opacity) };
    }

    function mixColor(baseRgba, accentRgb, accentWeight = 0.45) {
      const base = parseColor(baseRgba, 100);
      const accent = parseColor(accentRgb, 100);
      if (!base || !accent) return baseRgba;
      const offsets = [1, 3, 5];
      const rgb = '#' + offsets.map((offset) => {
        const left = parseInt(base.rgb.slice(offset, offset + 2), 16);
        const right = parseInt(accent.rgb.slice(offset, offset + 2), 16);
        return Math.round(left * (1 - accentWeight) + right * accentWeight)
          .toString(16)
          .padStart(2, '0');
      }).join('').toUpperCase();
      return colorWithOpacity(rgb, base.opacity);
    }

    function refreshDerivedVariantPreviews() {
      if (!state?.groups?.variant) return;
      for (const [group, accent] of Object.entries(variantAccents)) {
        const parsed = parseColor(mixColor(state.groups.variant.rgba, accent), 100);
        if (!parsed || !state.groups[group]) continue;
        state.groups[group] = { ...state.groups[group], ...parsed };
        const card = document.querySelector('.style-card[data-group="' + group + '"]');
        if (!card) continue;
        const swatch = card.querySelector('.derived-swatch');
        if (swatch) swatch.style.backgroundColor = parsed.rgba;
        applyPreview(card, state.groups[group]);
      }
    }

    function applyPreview(card, groupState) {
      const group = card.dataset.group;
      const targets = card.querySelectorAll('[data-highlight]');
      const color = groupState.rgba;
      card.classList.toggle('disabled', !groupState.enabled);

      for (const target of targets) {
        target.style.color = '';
        target.style.borderBottom = '';
        if (!groupState.enabled) continue;

        if (group === 'utility') {
          const underline = state.utilityUnderlineStyle;
          if (underline !== 'none') {
            const width = underline === 'double' ? '3px' : '1px';
            target.style.borderBottom = width + ' ' + underline + ' ' + color;
          }
          if (state.utilityColorEnabled) target.style.color = color;
        } else {
          target.style.color = color;
        }
      }
    }

    function render(nextState) {
      state = nextState;
      for (const card of document.querySelectorAll('.style-card')) {
        const group = card.dataset.group;
        const groupState = state.groups[group];
        if (!groupState) continue;

        card.querySelector('.enabled').checked = groupState.enabled;
        const color = card.querySelector('.color');
        const alphaFallback = card.querySelector('.alpha-fallback');
        const alphaValue = card.querySelector('.alpha-value');
        const derivedSwatch = card.querySelector('.derived-swatch');
        if (derivedSwatch) derivedSwatch.style.backgroundColor = groupState.rgba;
        if (color) {
          color.value = supportsAlphaColor ? groupState.rgba : groupState.rgb;
          if (alphaFallback) alphaFallback.hidden = supportsAlphaColor;
          if (alphaValue) alphaValue.value = String(groupState.opacity);
        }

        if (group === 'utility') {
          card.querySelector('.underline-style').value = state.utilityUnderlineStyle;
          card.querySelector('.color-text').checked = state.utilityColorEnabled;
        }
        applyPreview(card, groupState);
      }
      document.querySelector('.style-grid').removeAttribute('inert');
      document.body.classList.add('ready');
    }

    for (const card of document.querySelectorAll('.style-card')) {
      const group = card.dataset.group;
      const enabled = card.querySelector('.enabled');
      const color = card.querySelector('.color');
      const alphaValue = card.querySelector('.alpha-value');

      enabled.addEventListener('change', () => {
        state.groups[group].enabled = enabled.checked;
        applyPreview(card, state.groups[group]);
        vscode.postMessage({ type: 'setEnabled', group, value: enabled.checked });
      });

      if (color) {
        color.addEventListener('input', () => {
          const parsed = parseColor(color.value, state.groups[group].opacity);
          if (!parsed) return;
          state.groups[group] = { ...state.groups[group], ...parsed };
          applyPreview(card, state.groups[group]);
          if (group === 'variant') refreshDerivedVariantPreviews();
        });
        color.addEventListener('change', () => {
          vscode.postMessage({ type: 'setColor', group, value: state.groups[group].rgba });
        });
      }

      if (alphaValue) {
        alphaValue.addEventListener('input', () => {
          const opacity = Math.max(0, Math.min(100, Number(alphaValue.value)));
          state.groups[group].opacity = opacity;
          state.groups[group].rgba = colorWithOpacity(state.groups[group].rgb, opacity);
          applyPreview(card, state.groups[group]);
          if (group === 'variant') refreshDerivedVariantPreviews();
        });
        alphaValue.addEventListener('change', () => {
          vscode.postMessage({ type: 'setColor', group, value: state.groups[group].rgba });
        });
      }

      card.querySelector('.reset').addEventListener('click', () => {
        vscode.postMessage({ type: 'resetGroup', group });
      });

      if (group === 'utility') {
        const underline = card.querySelector('.underline-style');
        const colorText = card.querySelector('.color-text');
        underline.addEventListener('change', () => {
          state.utilityUnderlineStyle = underline.value;
          applyPreview(card, state.groups.utility);
          vscode.postMessage({ type: 'setUtilityUnderline', value: underline.value });
        });
        colorText.addEventListener('change', () => {
          state.utilityColorEnabled = colorText.checked;
          applyPreview(card, state.groups.utility);
          vscode.postMessage({ type: 'setUtilityColorEnabled', value: colorText.checked });
        });
      }
    }

    document.getElementById('open-settings').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettingsJson' });
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') render(event.data.state);
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`
  }

  dispose(): void {
    this.panel?.dispose()
    this.panel = undefined
    for (const subscription of this.subscriptions) subscription.dispose()
    this.subscriptions.length = 0
  }
}
