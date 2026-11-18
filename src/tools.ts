/**
 * Tools from STOS-Toolkit (the separate Python project with graphic tools), started from VS Code:
 * "Select Toolkit folder..." and "Open sprite editor". The commands show up only once a Toolkit
 * folder is set ("stosStudio.toolkitFolder"); STOS Studio works fine without it.
 */
import * as vscode from 'vscode';
import * as os from 'os';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { checkToolkit, spriteEditorCommand, SPRITE_FILE, WORKBENCH_FILE, workbenchCommand, MANIFEST, toolkitBuildCommand, runToolkitCommand, buildOutcome } from './toolkit';
import { saveUserSetting, startFolder, UNTRUSTED } from './tasks';

const SECTION = 'stosStudio';
/** The context key the menus and the palette test (`when` clauses cannot read settings directly). */
const CONTEXT_KEY = 'stosStudio.toolkitConfigured';

function toolkitSetting(): string {
    return vscode.workspace.getConfiguration(SECTION).get<string>('toolkitFolder') ?? '';
}

/** Tell VS Code whether a usable Toolkit folder is set, so the commands appear or disappear. */
function updateContext(): void {
    let ok = false;
    try { checkToolkit(toolkitSetting()); ok = true; } catch { /* not set, or not a Toolkit */ }
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, ok);
}

/** "Select Toolkit folder...": pick the STOS-Toolkit folder and save it in "stosStudio.toolkitFolder". */
export async function selectToolkitFolder(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
        title: 'Select the STOS-Toolkit folder (the one with pyproject.toml and .venv)',
        openLabel: 'Use this Toolkit',
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: startFolder(toolkitSetting(), os.homedir()),
    });
    if (!picked || picked.length === 0) { return; }       // cancelled
    try {
        checkToolkit(picked[0].fsPath);                      // say what is wrong before saving
        await saveUserSetting('toolkitFolder', picked[0].fsPath, 'Toolkit folder');
    } catch (e) {
        void vscode.window.showErrorMessage((e as Error).message);
    }
}

/**
 * "Open sprite editor": starts the Toolkit's sprite editor in its own window. The file is the one
 * right-clicked in the Explorer, else the file open in the editor if it is a sprite bank; with
 * neither, the editor starts with a new bank.
 */
export async function openSpriteEditor(uri?: vscode.Uri): Promise<void> {
    if (!vscode.workspace.isTrusted) { void vscode.window.showErrorMessage(UNTRUSTED); return; }
    let file = uri?.fsPath;
    if (!file) {
        const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
        const open = input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom ? input.uri.fsPath : undefined;
        if (open && SPRITE_FILE.test(open)) { file = open; }
    }
    let run;
    try {
        run = spriteEditorCommand(toolkitSetting(), file);
    } catch (e) {
        const choice = await vscode.window.showErrorMessage((e as Error).message, 'Select Toolkit folder...');
        if (choice) { await selectToolkitFolder(); }
        return;
    }
    const child = spawn(run.command, run.args, { cwd: run.cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr?.on('data', d => { errors = (errors + String(d)).slice(-600); });
    child.on('error', e => void vscode.window.showErrorMessage(`Cannot start the sprite editor: ${e.message}`));
    // a window that closes normally exits with 0; anything else is shown with the end of its error output
    child.on('exit', code => {
        if (code) { void vscode.window.showErrorMessage(`The sprite editor stopped with an error (${code}): ${errors.trim()}`); }
    });
}

/**
 * "Open workbench": starts the Toolkit's workbench window on the open project (it asks there before creating
 * anything) and does not wait for it. A file right-clicked in the Explorer is opened in it.
 */
export async function openWorkbench(uri?: vscode.Uri): Promise<void> {
    if (!vscode.workspace.isTrusted) { void vscode.window.showErrorMessage(UNTRUSTED); return; }
    const folder = vscode.workspace.workspaceFolders?.[0];
    const assets = folder ? vscode.workspace.getConfiguration(SECTION, folder.uri).get<string>('assetsFolder') ?? '' : '';
    const file = uri && WORKBENCH_FILE.test(uri.fsPath) ? uri.fsPath : undefined;
    let run;
    try {
        run = workbenchCommand(toolkitSetting(), folder?.uri.fsPath, assets, file);
    } catch (e) {
        const choice = await vscode.window.showErrorMessage((e as Error).message, 'Select Toolkit folder...');
        if (choice) { await selectToolkitFolder(); }
        return;
    }
    const child = spawn(run.command, run.args, { cwd: run.cwd, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    let errors = '';
    child.stderr?.on('data', d => { errors = (errors + String(d)).slice(-600); });
    child.on('error', e => void vscode.window.showErrorMessage(`Cannot start the workbench: ${e.message}`));
    // a window that closes normally exits with 0; a bad argument or a crash is shown with its message
    child.on('exit', code => {
        if (code) { void vscode.window.showErrorMessage(`The workbench stopped with an error (${code}): ${errors.trim()}`); }
    });
}

let output: vscode.OutputChannel | undefined;

/** Tell VS Code whether the open project has a Toolkit manifest, for the build commands. */
function updateProjectContext(): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    void vscode.commands.executeCommand('setContext', 'stosStudio.hasToolkitManifest',
        !!root && fs.existsSync(path.join(root, MANIFEST)));
}

/** "Build graphics (STOS-Toolkit)" or, with status = true, "Show graphics status": output in the "STOS Studio" channel. */
async function buildGraphics(status: boolean): Promise<void> {
    if (!vscode.workspace.isTrusted) { void vscode.window.showErrorMessage(UNTRUSTED); return; }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root || !fs.existsSync(path.join(root, MANIFEST))) {
        void vscode.window.showErrorMessage(`This project has no ${MANIFEST} (make one with the Toolkit's workbench).`);
        return;
    }
    let cmd;
    try {
        cmd = toolkitBuildCommand(toolkitSetting(), root, status);
    } catch (e) {
        const choice = await vscode.window.showErrorMessage((e as Error).message, 'Select Toolkit folder...');
        if (choice) { await selectToolkitFolder(); }
        return;
    }
    output ??= vscode.window.createOutputChannel('STOS Studio');
    output.show(true);
    output.appendLine(status ? 'Graphics status (STOS-Toolkit):' : 'Building graphics (STOS-Toolkit)...');
    const code = await runToolkitCommand(cmd, l => output!.appendLine(l), spawn);
    const outcome = buildOutcome(code);
    if (outcome === 'ok') {
        output.appendLine('Done.');
    } else {
        output.appendLine(`The Toolkit stopped with ${code} (${outcome === 'failed' ? 'an item failed or was refused' : 'a usage or manifest problem'}).`);
        void vscode.window.showWarningMessage('The STOS-Toolkit build did not finish cleanly; see the "STOS Studio" output.');
    }
}

export function registerTools(context: vscode.ExtensionContext): void {
    updateContext();
    updateProjectContext();
    const watcher = vscode.workspace.createFileSystemWatcher('**/' + MANIFEST);
    watcher.onDidCreate(updateProjectContext); watcher.onDidDelete(updateProjectContext);
    context.subscriptions.push(watcher,
        vscode.workspace.onDidChangeWorkspaceFolders(updateProjectContext),
        vscode.commands.registerCommand('stosStudio.openWorkbench', openWorkbench),
        vscode.commands.registerCommand('stosStudio.buildGraphics', () => buildGraphics(false)),
        vscode.commands.registerCommand('stosStudio.graphicsStatus', () => buildGraphics(true)),
        vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration(`${SECTION}.toolkitFolder`)) { updateContext(); } }),
        vscode.commands.registerCommand('stosStudio.selectToolkitFolder', selectToolkitFolder),
        vscode.commands.registerCommand('stosStudio.openSpriteEditor', openSpriteEditor));
}
