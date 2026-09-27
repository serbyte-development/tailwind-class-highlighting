import * as vscode from 'vscode'
import { analyzeText } from '../core/analyze'
import { getCandidateScanner } from '../core/scanner'
import { TailwindProjectManager } from '../tailwind/project'
import { getConfiguration, type HighlightConfiguration } from './config'
import { DecorationRenderer } from './decorations'

export class HighlightController implements vscode.Disposable {
  private config: HighlightConfiguration = getConfiguration()
  private renderer = new DecorationRenderer(this.config.styles)
  private tailwindProjects = new TailwindProjectManager()
  private timers = new Map<vscode.TextEditor, NodeJS.Timeout>()
  private subscriptions: vscode.Disposable[] = []

  constructor() {
    const tailwindStyles = vscode.workspace.createFileSystemWatcher('**/*.{css,pcss,postcss}')
    const tailwindPackages = vscode.workspace.createFileSystemWatcher('**/package.json')

    const invalidateTailwindProjects = (): void => {
      this.tailwindProjects.invalidateAll()
      for (const editor of vscode.window.visibleTextEditors) this.schedule(editor, 0)
    }

    this.subscriptions.push(
      tailwindStyles,
      tailwindPackages,
      tailwindStyles.onDidCreate(invalidateTailwindProjects),
      tailwindStyles.onDidChange(invalidateTailwindProjects),
      tailwindStyles.onDidDelete(invalidateTailwindProjects),
      tailwindPackages.onDidCreate(invalidateTailwindProjects),
      tailwindPackages.onDidChange(invalidateTailwindProjects),
      tailwindPackages.onDidDelete(invalidateTailwindProjects),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) this.schedule(editor, 0)
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.schedule(editor, 0)
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === event.document) this.schedule(editor)
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          !event.affectsConfiguration('tailwindClassHighlighting') &&
          !event.affectsConfiguration('tailwindCSS.classAttributes') &&
          !event.affectsConfiguration('tailwindCSS.classFunctions')
        ) {
          return
        }
        this.config = getConfiguration()
        this.renderer.dispose()
        this.renderer = new DecorationRenderer(this.config.styles)
        for (const editor of vscode.window.visibleTextEditors) this.schedule(editor, 0)
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        for (const [editor, timer] of this.timers) {
          if (editor.document !== document) continue
          clearTimeout(timer)
          this.timers.delete(editor)
        }
      }),
    )

    for (const editor of vscode.window.visibleTextEditors) this.schedule(editor, 0)
  }

  private schedule(editor: vscode.TextEditor, delay = this.config.debounceMs): void {
    const previous = this.timers.get(editor)
    if (previous) clearTimeout(previous)

    const timer = setTimeout(() => {
      this.timers.delete(editor)
      void this.update(editor)
    }, delay)
    this.timers.set(editor, timer)
  }

  private async update(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document
    if (
      document.uri.scheme !== 'file' ||
      !this.config.enabled ||
      !this.config.languages.has(document.languageId) ||
      this.config.styles.enabledGroups.size === 0
    ) {
      this.renderer.clear(editor)
      return
    }

    const version = document.version
    const text = document.getText()
    const config = this.config

    try {
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
      const tailwindProject = await this.tailwindProjects.getProject(
        document.fileName,
        workspaceRoot,
      )
      if (document.version !== version) return
      if (!tailwindProject) {
        this.renderer.clear(editor)
        return
      }

      const scanner = await getCandidateScanner()
      if (document.version !== version) return

      const spans = analyzeText(
        text,
        {
          classAttributes: config.classAttributes,
          classFunctions: config.classFunctions,
          enabledGroups: config.styles.enabledGroups,
        },
        scanner,
        tailwindProject.validator,
      )
      if (document.version !== version) return

      this.renderer.apply(editor, spans)
    } catch (error) {
      console.error('[Tailwind Class Highlighting] Failed to analyze document', error)
      this.renderer.clear(editor)
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    for (const subscription of this.subscriptions) subscription.dispose()
    this.subscriptions = []
    this.renderer.dispose()
  }
}
