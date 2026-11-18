/**
 * STOS Studio: entry point. VS Code calls activate() when a .stos file or a folder with .stos
 * files is opened.
 */
import * as vscode from 'vscode';
import { registerCompletionAndHover } from './completion';
import { registerTasks } from './tasks';
import { registerDiagnostics } from './diagnostics';
import { registerTools } from './tools';
import { registerChecks } from './checks';

export function activate(context: vscode.ExtensionContext): void {
    registerChecks(context);               // where the converter's checks find the command list
    registerCompletionAndHover(context);   // suggestions and help, from data/stos-commands.json
    registerTasks(context);                // Build / Run buttons and tasks, Select Hatari / TOS
    registerDiagnostics(context);          // red squiggles for problems the converter finds
    registerTools(context);                // optional: STOS-Toolkit tools (sprite editor)
}

export function deactivate(): void { }
