/**
 * Squiggles: shows the converter's problems and loop warnings (unknown label, missing include, character the Atari
 * does not have, ...) in the editor and in the Problems panel. They are refreshed when a project is
 * opened, while a .stos file is edited (unsaved text included), when it is saved and when Build or Run starts.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { checkProject, problemSpan } from './converter';
import { convertOptionsFor } from './checks';

const collection = vscode.languages.createDiagnosticCollection('stos');

/** Check the project of a folder and replace the squiggles with the current problems. */
export function refreshDiagnostics(folder: vscode.WorkspaceFolder): void {
    const options = convertOptionsFor(folder);
    const readText = options.readText!;
    const section = vscode.workspace.getConfiguration('stosStudio', folder.uri);
    const source = path.resolve(folder.uri.fsPath, section.get<string>('sourceFile') ?? 'main.stos');
    collection.clear();
    if (!fs.existsSync(source)) { return; }        // not a STOS project folder: nothing to check
    const byFile = new Map<string, vscode.Diagnostic[]>();
    const { errors, warnings } = checkProject(source, options);
    const all = [...errors.map(p => ({ p, severity: vscode.DiagnosticSeverity.Error })),
        ...warnings.map(p => ({ p, severity: vscode.DiagnosticSeverity.Warning }))];
    for (const { p, severity } of all) {
        let text = '';
        try { text = readText(p.file).split(/\r?\n/)[p.line - 1] ?? ''; } catch { /* file missing: line 1 */ }
        const { start, end } = problemSpan(p, text);
        const range = new vscode.Range(p.line - 1, start, p.line - 1, end);
        const diagnostic = new vscode.Diagnostic(range, p.message, severity);
        diagnostic.source = 'STOS Studio';
        byFile.set(p.file, [...(byFile.get(p.file) ?? []), diagnostic]);
    }
    for (const [file, diagnostics] of byFile) { collection.set(vscode.Uri.file(file), diagnostics); }
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function registerDiagnostics(context: vscode.ExtensionContext): void {
    const refreshAll = () => (vscode.workspace.workspaceFolders ?? []).forEach(refreshDiagnostics);
    context.subscriptions.push(
        collection,
        // a saved .stos file or settings change may fix or cause problems anywhere in the project
        vscode.workspace.onDidSaveTextDocument(doc => { if (doc.languageId === 'stos') { refreshAll(); } }),
        // while typing: a short pause after the last key, so the converter does not run on every letter
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId !== 'stos') { return; }
            clearTimeout(timer);
            timer = setTimeout(refreshAll, 400);
        }),
        { dispose: () => clearTimeout(timer) },
        vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('stosStudio')) { refreshAll(); } }),
        vscode.workspace.onDidChangeWorkspaceFolders(refreshAll));
    refreshAll();
}
