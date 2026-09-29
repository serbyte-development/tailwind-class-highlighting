// biome-ignore lint/correctness/noUndeclaredDependencies: VS Code provides this module in the extension host.
import * as vscode from 'vscode'
import { type HighlightSpan, highlightGroups } from '../core/types'
import type { HighlightStyleConfiguration } from './config'
import { styleDefinitions, type UtilityUnderlineStyle } from './style-registry'

type RenderGroup = HighlightSpan['group']

function utilityDecoration(
  underlineStyle: UtilityUnderlineStyle,
  colorEnabled: boolean,
): vscode.DecorationRenderOptions {
  const options: vscode.DecorationRenderOptions = {}

  if (underlineStyle !== 'none') {
    options.borderColor = new vscode.ThemeColor('tailwindClassHighlighting.utilityUnderline')
    options.borderStyle = underlineStyle
    options.borderWidth = underlineStyle === 'double' ? '0 0 3px 0' : '0 0 1px 0'
  }

  if (colorEnabled) {
    options.color = new vscode.ThemeColor('tailwindClassHighlighting.utilityUnderline')
  }
  return options
}

export class DecorationRenderer implements vscode.Disposable {
  private decorations = new Map<RenderGroup, vscode.TextEditorDecorationType>()
  private signatures = new WeakMap<vscode.TextEditor, Map<RenderGroup, string>>()

  constructor(styles: HighlightStyleConfiguration) {
    for (const group of highlightGroups) {
      if (!styles.enabledGroups.has(group)) {
        continue
      }

      const options =
        group === 'utility'
          ? utilityDecoration(styles.utilityUnderlineStyle, styles.utilityColorEnabled)
          : { color: new vscode.ThemeColor(styleDefinitions[group].colorId) }
      this.decorations.set(group, vscode.window.createTextEditorDecorationType(options))
    }
  }

  apply(editor: vscode.TextEditor, spans: HighlightSpan[]): void {
    const renderGroups = [...this.decorations.keys()]
    const grouped = new Map<RenderGroup, HighlightSpan[]>(renderGroups.map((group) => [group, []]))

    for (const span of spans) {
      grouped.get(span.group)?.push(span)
    }

    let editorSignatures = this.signatures.get(editor)
    if (!editorSignatures) {
      editorSignatures = new Map()
      this.signatures.set(editor, editorSignatures)
    }

    for (const group of renderGroups) {
      const groupSpans = grouped.get(group) ?? []
      const signature = groupSpans.map((span) => `${span.start}:${span.end}`).join(',')
      if (editorSignatures.get(group) === signature) {
        continue
      }

      const ranges = groupSpans.map(
        (span) =>
          new vscode.Range(
            editor.document.positionAt(span.start),
            editor.document.positionAt(span.end),
          ),
      )
      const decoration = this.decorations.get(group)
      if (!decoration) {
        continue
      }
      editor.setDecorations(decoration, ranges)
      editorSignatures.set(group, signature)
    }
  }

  clear(editor: vscode.TextEditor): void {
    this.apply(editor, [])
  }

  dispose(): void {
    for (const decoration of this.decorations.values()) {
      decoration.dispose()
    }
    this.decorations.clear()
    this.signatures = new WeakMap()
  }
}
