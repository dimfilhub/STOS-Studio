/**
 * The converter options that depend on VS Code: unsaved editor text, and the list of known commands and parameter rules for the
 * unknown-command and parameter-count checks (from the command database plus the setting "stosStudio.knownCommands").
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { loadCommands, statementWords, StosCommand } from './commanddb';
import { ConvertOptions } from './converter';
import { buildParamRules, ParamRule } from './paramcheck';

let databaseFile: string | undefined;
let commands: StosCommand[] | undefined;
let rules: ParamRule[] | undefined;

/** Tell this module where the command database is (called once when the extension starts). */
export function registerChecks(context: vscode.ExtensionContext): void {
    databaseFile = context.asAbsolutePath('data/stos-commands.json');
}

/** The text of a source file: what is on screen if it is open in the editor (saved or not), else the file. */
export function readEditorText(file: string): string {
    return vscode.workspace.textDocuments.find(d => d.uri.fsPath === file)?.getText() ?? fs.readFileSync(file, 'utf8');
}

/** Converter options for a project folder. */
export function convertOptionsFor(folder: vscode.WorkspaceFolder): ConvertOptions {
    const options: ConvertOptions = { readText: readEditorText };
    const section = vscode.workspace.getConfiguration('stosStudio', folder.uri);
    const unknown = section.get<boolean>('checkUnknownCommands') ?? true;
    const counts = section.get<boolean>('checkParameterCounts') ?? true;
    if (databaseFile && (unknown || counts)) {
        try {
            commands ??= loadCommands(databaseFile);
            if (unknown) { options.knownCommands = statementWords(commands, section.get<string[]>('knownCommands') ?? []); }
            if (counts) { options.paramRules = rules ??= buildParamRules(commands); }
        } catch { /* no database: no check */ }
    }
    return options;
}
