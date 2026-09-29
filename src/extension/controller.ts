// biome-ignore lint/correctness/noUndeclaredDependencies: VS Code provides this module in the extension host.
import * as vscode from 'vscode'
import { analyzeText } from '../core/analyze'
import { getCandidateScanner } from '../core/scanner'
import { TailwindProjectManager } from '../tailwind/project'
import { getConfiguration, type HighlightConfiguration } from './config'
import { DecorationRenderer } from './decorations'

const supportedDocumentSchemes = new Set(['file', 'vscode-remote'])

export class HighlightController implements vscode.Disposable {
  private config: HighlightConfiguration = getConfiguration()
  private renderer = new DecorationRenderer(this.config.styles)
  private tailwindProjects = new TailwindProjectManager()
  private timers = new Map<vscode.TextEditor, NodeJS.Timeout>()
  private subscriptions: vscode.Disposable[] = []
  private revision = 0

  constructor() {
    const tailwindStyles = vscode.workspace.createFileSystemWatcher('**/*.{css,pcss,postcss}')
    const tailwindPackages = vscode.workspace.createFileSystemWatcher('**/package.json')
    const tailwindLocks = vscode.workspace.createFileSystemWatcher(
      '**/{package-lock.json,pnpm-lock.yaml,yarn.lock,bun.lock,bun.lockb}',
    )

    const rescanVisibleEditors = (): void => {
      this.revision++
      for (const editor of vscode.window.visibleTextEditors) {
        this.schedule(editor, 0)
      }
    }

    const invalidateTailwindStyles = (uri: vscode.Uri): void => {
      this.tailwindProjects.invalidatePath(uri.fsPath)
      rescanVisibleEditors()
    }

    const invalidateTailwindPackages = (): void => {
      // package.json can change which ancestor/hoisted Tailwind installation resolves,
      // so package changes require a full project-resolution reset.
      this.tailwindProjects.invalidateAll()
      rescanVisibleEditors()
    }

    this.subscriptions.push(
      tailwindStyles,
      tailwindPackages,
      tailwindLocks,
      tailwindStyles.onDidCreate(invalidateTailwindStyles),
      tailwindStyles.onDidChange(invalidateTailwindStyles),
      tailwindStyles.onDidDelete(invalidateTailwindStyles),
      tailwindPackages.onDidCreate(invalidateTailwindPackages),
      tailwindPackages.onDidChange(invalidateTailwindPackages),
      tailwindPackages.onDidDelete(invalidateTailwindPackages),
      tailwindLocks.onDidCreate(invalidateTailwindPackages),
      tailwindLocks.onDidChange(invalidateTailwindPackages),
      tailwindLocks.onDidDelete(invalidateTailwindPackages),
      vscode.workspace.onDidChangeWorkspaceFolders(invalidateTailwindPackages),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) {
          this.schedule(editor, 0)
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.schedule(editor, 0)
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === event.document) {
            this.schedule(editor)
          }
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
        this.revision++
        this.config = getConfiguration()
        this.renderer.dispose()
        this.renderer = new DecorationRenderer(this.config.styles)
        for (const editor of vscode.window.visibleTextEditors) {
          this.schedule(editor, 0)
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        for (const [editor, timer] of this.timers) {
          if (editor.document !== document) {
            continue
          }
          clearTimeout(timer)
          this.timers.delete(editor)
        }
      }),
    )

    for (const editor of vscode.window.visibleTextEditors) {
      this.schedule(editor, 0)
    }
  }

  private schedule(editor: vscode.TextEditor, delay = this.config.debounceMs): void {
    const previous = this.timers.get(editor)
    if (previous) {
      clearTimeout(previous)
    }

    const timer = setTimeout(() => {
      this.timers.delete(editor)
      void this.update(editor)
    }, delay)
    this.timers.set(editor, timer)
  }

  private async update(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document
    if (
      !supportedDocumentSchemes.has(document.uri.scheme) ||
      !this.config.enabled ||
      !this.config.languages.has(document.languageId) ||
      this.config.styles.enabledGroups.size === 0
    ) {
      this.renderer.clear(editor)
      return
    }

    const version = document.version
    const revision = this.revision
    const config = this.config

    try {
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
      const tailwindProject = await this.tailwindProjects.getProject(
        document.fileName,
        workspaceRoot,
      )
      if (document.version !== version || revision !== this.revision) {
        return
      }
      if (!tailwindProject) {
        this.renderer.clear(editor)
        return
      }

      const scanner = await getCandidateScanner()
      if (document.version !== version || revision !== this.revision) {
        return
      }
      const text = document.getText()

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
      if (document.version !== version || revision !== this.revision) {
        return
      }

      this.renderer.apply(editor, spans)
    } catch (error) {
      console.error('[Tailwind Class Highlighting] Failed to analyze document', error)
      this.renderer.clear(editor)
    }
  }

  dispose(): void {
    this.revision++
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    for (const subscription of this.subscriptions) {
      subscription.dispose()
    }
    this.subscriptions = []
    this.renderer.dispose()
  }
}
