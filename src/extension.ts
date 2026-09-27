import * as vscode from 'vscode'
import { HighlightController } from './extension/controller'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    new HighlightController(),
    vscode.commands.registerCommand('tailwindClassHighlighting.configureStyles', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:serbytedevelopment.tailwind-class-highlighting',
      ),
    ),
  )
}

export function deactivate(): void {}
