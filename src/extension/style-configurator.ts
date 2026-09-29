import { randomBytes } from 'node:crypto'
// biome-ignore lint/correctness/noUndeclaredDependencies: VS Code provides this module in the extension host.
import * as vscode from 'vscode'
import { type HighlightGroup, highlightGroups } from '../core/types'
import { readBooleanSetting } from './config-values'
import {
  clearColorCustomizations,
  parseStyleColor,
  type StyleColor,
  setColorCustomizations,
} from './style-color'
import {
  defaultUtilityColorEnabled,
  defaultUtilityUnderlineStyle,
  isUtilityUnderlineStyle,
  styleDefinitionEntries,
  styleDefinitions,
  type UtilityUnderlineStyle,
} from './style-registry'

interface GroupState extends StyleColor {
  enabled: boolean
}

interface ConfiguratorState {
  groups: Partial<Record<HighlightGroup, GroupState>>
  utilityUnderlineStyle: UtilityUnderlineStyle
  utilityColorEnabled: boolean
}

type StyleChange =
  | { type: 'setEnabled'; group: HighlightGroup; value: boolean }
  | { type: 'setColor'; group: HighlightGroup; value: string }
  | { type: 'setUtilityUnderline'; value: UtilityUnderlineStyle }
  | { type: 'setUtilityColorEnabled'; value: boolean }
  | { type: 'resetGroup'; group: HighlightGroup }

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'applyChanges'; changes: StyleChange[] }
  | { type: 'openSettingsJson' }

const highlightGroupSet = new Set<string>(highlightGroups)
const colorValuePattern = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i

function themeDefaultKey(): keyof (typeof styleDefinitions)['utility']['defaults'] {
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
  return typeof value === 'string' && highlightGroupSet.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStyleChange(message: unknown): message is StyleChange {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false
  }

  switch (message.type) {
    case 'setEnabled':
      return isHighlightGroup(message.group) && typeof message.value === 'boolean'
    case 'setColor':
      return (
        isHighlightGroup(message.group) &&
        typeof message.value === 'string' &&
        colorValuePattern.test(message.value)
      )
    case 'setUtilityUnderline':
      return isUtilityUnderlineStyle(message.value)
    case 'setUtilityColorEnabled':
      return typeof message.value === 'boolean'
    case 'resetGroup':
      return isHighlightGroup(message.group)
    default:
      return false
  }
}

function isWebviewMessage(message: unknown): message is WebviewMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false
  }
  if (message.type === 'ready' || message.type === 'openSettingsJson') {
    return true
  }
  return (
    message.type === 'applyChanges' &&
    Array.isArray(message.changes) &&
    message.changes.length <= 100 &&
    message.changes.every(isStyleChange)
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
  private internalWrites = 0
  constructor() {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('tailwindClassHighlighting.styles') ||
          event.affectsConfiguration('workbench.colorCustomizations')
        ) {
          if (this.internalWrites > 0) {
            return
          }
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
          await this.panel?.webview.postMessage({ type: 'applyFailed' })
        })
    })
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isWebviewMessage(message)) {
      return
    }
    const value = message

    if (value.type === 'ready') {
      await this.postState()
      return
    }
    if (value.type === 'openSettingsJson') {
      await vscode.commands.executeCommand('workbench.action.openSettingsJson')
      return
    }

    if (value.type !== 'applyChanges') {
      return
    }

    this.internalWrites++
    try {
      await this.applyChanges(value.changes)
    } finally {
      this.internalWrites--
    }

    await this.postState('applied')
  }

  private getGlobalColorCustomizations(): Record<string, unknown> {
    const inspected = vscode.workspace
      .getConfiguration('workbench')
      .inspect<unknown>('colorCustomizations')
    return isRecord(inspected?.globalValue) ? { ...inspected.globalValue } : {}
  }

  private getActiveThemeKey(): string | null {
    const theme = vscode.workspace.getConfiguration('workbench').get<unknown>('colorTheme')
    return typeof theme === 'string' && theme.length > 0 ? `[${theme}]` : null
  }

  private getConfiguredColor(
    customizations: Readonly<Record<string, unknown>>,
    colorId: string,
  ): unknown {
    const themeKey = this.getActiveThemeKey()
    const themeValues = themeKey ? customizations[themeKey] : undefined
    if (isRecord(themeValues)) {
      const themed = themeValues[colorId]
      if (typeof themed === 'string') {
        return themed
      }
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
    if (!themeKey) {
      return next
    }

    const themeValues = next[themeKey]
    if (!isRecord(themeValues)) {
      return next
    }
    const themed = { ...themeValues }
    if (!Object.hasOwn(themed, colorId)) {
      return next
    }

    if (value === undefined) {
      delete themed[colorId]
    } else {
      themed[colorId] = value
    }
    next[themeKey] = themed
    return next
  }

  private getDefaultColor(group: HighlightGroup): string {
    return styleDefinitions[group].defaults[themeDefaultKey()]
  }

  private getDefaultState(): ConfiguratorState {
    const groups: Partial<Record<HighlightGroup, GroupState>> = Object.fromEntries(
      styleDefinitionEntries.map((descriptor): [HighlightGroup, GroupState] => [
        descriptor.group,
        {
          ...parseStyleColor(
            this.getDefaultColor(descriptor.group),
            this.getDefaultColor(descriptor.group),
          ),
          enabled: descriptor.enabledByDefault,
        },
      ]),
    )
    return {
      groups,
      utilityUnderlineStyle: defaultUtilityUnderlineStyle,
      utilityColorEnabled: defaultUtilityColorEnabled,
    }
  }

  private getState(): ConfiguratorState {
    const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
    const customizations = this.getGlobalColorCustomizations()
    const groups: Partial<Record<HighlightGroup, GroupState>> = Object.fromEntries(
      styleDefinitionEntries.map((descriptor): [HighlightGroup, GroupState] => [
        descriptor.group,
        {
          ...parseStyleColor(
            this.getConfiguredColor(customizations, descriptor.colorId),
            this.getDefaultColor(descriptor.group),
          ),
          enabled: readBooleanSetting(
            config.inspect<unknown>(`styles.${descriptor.group}.enabled`)?.globalValue,
            descriptor.enabledByDefault,
          ),
        },
      ]),
    )

    const underlineStyle =
      config.inspect<UtilityUnderlineStyle>('styles.utility.underlineStyle')?.globalValue ??
      defaultUtilityUnderlineStyle
    const colorEnabled = readBooleanSetting(
      config.inspect<unknown>('styles.utility.colorEnabled')?.globalValue,
      defaultUtilityColorEnabled,
    )

    return {
      groups,
      utilityUnderlineStyle: isUtilityUnderlineStyle(underlineStyle)
        ? underlineStyle
        : defaultUtilityUnderlineStyle,
      utilityColorEnabled: colorEnabled,
    }
  }

  private setGroupColor(
    customizations: Readonly<Record<string, unknown>>,
    group: HighlightGroup,
    value: string,
  ): Record<string, unknown> {
    const color = parseStyleColor(value, this.getDefaultColor(group)).rgba
    return this.setConfiguredColor(customizations, styleDefinitions[group].colorId, color)
  }

  private async applyChanges(changes: readonly StyleChange[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('tailwindClassHighlighting')
    const settingChanges = new Map<string, boolean | UtilityUnderlineStyle | undefined>()
    let customizations = this.getGlobalColorCustomizations()
    let colorsChanged = false

    for (const change of changes) {
      switch (change.type) {
        case 'setEnabled':
          settingChanges.set(`styles.${change.group}.enabled`, change.value)
          break
        case 'setUtilityUnderline':
          settingChanges.set('styles.utility.underlineStyle', change.value)
          break
        case 'setUtilityColorEnabled':
          settingChanges.set('styles.utility.colorEnabled', change.value)
          break
        case 'setColor':
          customizations = this.setGroupColor(customizations, change.group, change.value)
          colorsChanged = true
          break
        case 'resetGroup': {
          settingChanges.set(`styles.${change.group}.enabled`, undefined)
          if (change.group === 'utility') {
            settingChanges.set('styles.utility.underlineStyle', undefined)
            settingChanges.set('styles.utility.colorEnabled', undefined)
          }
          customizations = clearColorCustomizations(customizations, [
            styleDefinitions[change.group].colorId,
          ])
          colorsChanged = true
          break
        }
      }
    }

    await Promise.all(
      [...settingChanges].map(([setting, settingValue]) =>
        config.update(setting, settingValue, vscode.ConfigurationTarget.Global),
      ),
    )
    if (colorsChanged) {
      await vscode.workspace
        .getConfiguration('workbench')
        .update('colorCustomizations', customizations, vscode.ConfigurationTarget.Global)
    }
  }

  private async postState(type: 'state' | 'applied' = 'state'): Promise<void> {
    if (!this.panel) {
      return
    }
    await this.panel.webview.postMessage({ type, state: this.getState() })
  }

  private getHtml(): string {
    const nonce = randomBytes(16).toString('base64')
    const defaultState = JSON.stringify(this.getDefaultState())
    const cards = styleDefinitionEntries
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
            <label class="color-control">
              <span>Color</span>
              <input class="color" type="color" aria-label="${htmlEscape(descriptor.title)} color">
            </label>
            <label class="opacity-control">
              <span>Opacity</span>
              <input class="alpha-value" type="range" min="0" max="100" step="1" aria-label="${htmlEscape(descriptor.title)} opacity percentage">
              <output class="alpha-output">100%</output>
            </label>
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
      padding: 28px 32px 112px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    body:not(.ready) .style-card { opacity: 0.55; pointer-events: none; }
    .page { max-width: 940px; margin: 0 auto; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .apply-actions {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      padding: 16px 24px;
      background: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-panel-border);
    }
    #apply-changes { min-width: 160px; min-height: 40px; padding: 10px 20px; font-weight: 600; }
    #apply-changes:disabled { opacity: 0.65; cursor: default; }
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
    .toggle-control, .color-control, .opacity-control { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
    input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--vscode-focusBorder); }
    input[type="color"] { width: 36px; height: 28px; padding: 1px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); cursor: pointer; }
    input[type="range"] { width: 140px; accent-color: var(--vscode-focusBorder); }
    .alpha-output { color: var(--vscode-descriptionForeground); text-align: right; font-variant-numeric: tabular-nums; }
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
      body { padding: 20px 16px 112px; }
      .apply-actions { padding: 16px; }
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
        <p>Preview Tailwind highlighting changes locally, then apply them to your User Settings in one batch. Workspace overrides can still take precedence.</p>
      </div>
      <button id="open-settings" class="secondary" type="button">Open Settings JSON</button>
    </header>
    <div class="style-grid" inert>${cards}</div>
    <div class="footer">Color and opacity are configured separately. Reset restores the current theme's extension defaults.</div>
  </main>
  <footer class="apply-actions">
    <button id="apply-changes" type="button" disabled>Apply Changes</button>
  </footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state;
    const defaults = ${defaultState};
    const pendingChanges = new Map();
    const applyButton = document.getElementById('apply-changes');
    const openSettingsButton = document.getElementById('open-settings');
    const styleGrid = document.querySelector('.style-grid');
    let applying = false;

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

    function changeKey(change) {
      switch (change.type) {
        case 'setEnabled': return change.group + ':enabled';
        case 'setColor': return change.group + ':color';
        case 'setUtilityUnderline': return 'utility:underline';
        case 'setUtilityColorEnabled': return 'utility:color-enabled';
        case 'resetGroup': return change.group + ':reset';
      }
    }

    function queueChange(change) {
      pendingChanges.set(changeKey(change), change);
      if (!applying) applyButton.disabled = false;
    }

    function resetPendingGroup(group) {
      for (const key of [...pendingChanges.keys()]) {
        if (key.startsWith(group + ':')) pendingChanges.delete(key);
      }
    }

    function setApplying(nextApplying) {
      applying = nextApplying;
      styleGrid.toggleAttribute('inert', nextApplying);
      openSettingsButton.disabled = nextApplying;
      applyButton.disabled = nextApplying || pendingChanges.size === 0;
      applyButton.textContent = nextApplying ? 'Applying…' : 'Apply Changes';
      document.body.toggleAttribute('aria-busy', nextApplying);
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
        const alphaValue = card.querySelector('.alpha-value');
        const alphaOutput = card.querySelector('.alpha-output');
        if (color) {
          color.value = groupState.rgb;
        }
        if (alphaValue) alphaValue.value = String(groupState.opacity);
        if (alphaOutput) alphaOutput.textContent = groupState.opacity + '%';

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
      const alphaOutput = card.querySelector('.alpha-output');

      enabled.addEventListener('change', () => {
        state.groups[group].enabled = enabled.checked;
        applyPreview(card, state.groups[group]);
        queueChange({ type: 'setEnabled', group, value: enabled.checked });
      });

      if (color) {
        color.addEventListener('input', () => {
          const parsed = parseColor(color.value, state.groups[group].opacity);
          if (!parsed) return;
          state.groups[group] = { ...state.groups[group], ...parsed };
          applyPreview(card, state.groups[group]);
        });
        color.addEventListener('change', () => {
          queueChange({ type: 'setColor', group, value: state.groups[group].rgba });
        });
      }

      if (alphaValue) {
        alphaValue.addEventListener('input', () => {
          const opacity = Math.max(0, Math.min(100, Number(alphaValue.value)));
          state.groups[group].opacity = opacity;
          state.groups[group].rgba = colorWithOpacity(state.groups[group].rgb, opacity);
          if (alphaOutput) alphaOutput.textContent = opacity + '%';
          applyPreview(card, state.groups[group]);
        });
        alphaValue.addEventListener('change', () => {
          queueChange({ type: 'setColor', group, value: state.groups[group].rgba });
        });
      }

      card.querySelector('.reset').addEventListener('click', () => {
        resetPendingGroup(group);
        queueChange({ type: 'resetGroup', group });
        if (group === 'utility') {
          state.utilityUnderlineStyle = defaults.utilityUnderlineStyle;
          state.utilityColorEnabled = defaults.utilityColorEnabled;
        }
        if (group in defaults.groups) {
          state.groups[group] = { ...defaults.groups[group] };
        }
        render(state);
      });

      if (group === 'utility') {
        const underline = card.querySelector('.underline-style');
        const colorText = card.querySelector('.color-text');
        underline.addEventListener('change', () => {
          state.utilityUnderlineStyle = underline.value;
          applyPreview(card, state.groups.utility);
          queueChange({ type: 'setUtilityUnderline', value: underline.value });
        });
        colorText.addEventListener('change', () => {
          state.utilityColorEnabled = colorText.checked;
          applyPreview(card, state.groups.utility);
          queueChange({ type: 'setUtilityColorEnabled', value: colorText.checked });
        });
      }
    }

    applyButton.addEventListener('click', () => {
      if (applying || pendingChanges.size === 0) return;
      setApplying(true);
      vscode.postMessage({ type: 'applyChanges', changes: [...pendingChanges.values()] });
    });
    document.getElementById('open-settings').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettingsJson' });
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'applied') {
        pendingChanges.clear();
        setApplying(false);
        render(event.data.state);
      } else if (event.data?.type === 'applyFailed') {
        setApplying(false);
      } else if (event.data?.type === 'state' && pendingChanges.size === 0) {
        render(event.data.state);
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`
  }

  dispose(): void {
    this.panel?.dispose()
    this.panel = undefined
    for (const subscription of this.subscriptions) {
      subscription.dispose()
    }
    this.subscriptions.length = 0
  }
}
