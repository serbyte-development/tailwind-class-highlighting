import * as vscode from 'vscode'
import { HighlightController } from './extension/controller'
import { StyleConfigurator } from './extension/style-configurator'

export function activate(context: vscode.ExtensionContext): void {
  const styleConfigurator = new StyleConfigurator(context)
  context.subscriptions.push(
    new HighlightController(),
    styleConfigurator,
    vscode.commands.registerCommand('tailwindClassHighlighting.configureStyles', () =>
      styleConfigurator.open(),
    ),
  )
}

export function deactivate(): void {}
