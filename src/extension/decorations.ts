import * as vscode from 'vscode'
import type { HighlightSpan } from '../core/types'

type RenderGroup = HighlightSpan['group']

const renderGroups: RenderGroup[] = [
  'utility',
  'breakpoint',
  'variant',
  'arbitrary',
  'important',
  'unresolvedVariant',
]

function dottedUnderline(): vscode.DecorationRenderOptions {
  return {
    borderColor: new vscode.ThemeColor('tailwindClassHighlighting.utilityUnderline'),
    borderStyle: 'dotted',
    borderWidth: '0 0 1px 0',
  }
}

export class DecorationRenderer implements vscode.Disposable {
  private decorations = new Map<RenderGroup, vscode.TextEditorDecorationType>()
  private signatures = new WeakMap<vscode.TextEditor, Map<RenderGroup, string>>()

  constructor() {
    this.decorations.set('utility', vscode.window.createTextEditorDecorationType(dottedUnderline()))
    this.decorations.set(
      'breakpoint',
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('tailwindClassHighlighting.breakpoint'),
      }),
    )
    this.decorations.set(
      'variant',
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('tailwindClassHighlighting.variant'),
      }),
    )
    this.decorations.set(
      'unresolvedVariant',
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('tailwindClassHighlighting.unresolvedVariant'),
      }),
    )
    this.decorations.set(
      'arbitrary',
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('tailwindClassHighlighting.arbitrary'),
      }),
    )
    this.decorations.set(
      'important',
      vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('tailwindClassHighlighting.important'),
      }),
    )
  }

  apply(editor: vscode.TextEditor, spans: HighlightSpan[]): void {
    const grouped = new Map<RenderGroup, HighlightSpan[]>(renderGroups.map((group) => [group, []]))

    for (const span of spans) grouped.get(span.group)!.push(span)

    let editorSignatures = this.signatures.get(editor)
    if (!editorSignatures) {
      editorSignatures = new Map()
      this.signatures.set(editor, editorSignatures)
    }

    for (const group of renderGroups) {
      const groupSpans = grouped.get(group)!
      const signature = groupSpans.map((span) => `${span.start}:${span.end}`).join(',')
      if (editorSignatures.get(group) === signature) continue

      const ranges = groupSpans.map(
        (span) =>
          new vscode.Range(
            editor.document.positionAt(span.start),
            editor.document.positionAt(span.end),
          ),
      )
      editor.setDecorations(this.decorations.get(group)!, ranges)
      editorSignatures.set(group, signature)
    }
  }

  clear(editor: vscode.TextEditor): void {
    this.apply(editor, [])
  }

  dispose(): void {
    for (const decoration of this.decorations.values()) decoration.dispose()
    this.decorations.clear()
    this.signatures = new WeakMap()
  }
}
