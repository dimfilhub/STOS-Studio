/**
 * Build and Run as VS Code tasks (type "stosStudio"), so Shift+Cmd+B and the Tasks menu work
 * without any per-project task file; plus the "Select Hatari..." / "Select TOS image..." /
 * "Select STOS folder..." commands and "New STOS project...".
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { buildProject, prepareRun, hatariProgramFor, stosFolderFor, expandHome, DEFAULT_SETTINGS, StosSettings } from './build';
import { createProject, checkProjectName } from './project';
import { convert } from './converter';
import { convertOptionsFor } from './checks';
import { StosError } from './errors';
import { refreshDiagnostics } from './diagnostics';
import { shouldBuildGraphics, toolkitBuildCommand, runToolkitCommand, buildOutcome } from './toolkit';

export const TASK_TYPE = 'stosStudio';
/** Shown when something that starts an external program is used in an untrusted workspace. */
export const UNTRUSTED = 'This workspace is not trusted, so STOS Studio will not start external programs here. ' +
    'Trust the folder first (Command Palette: "Workspaces: Manage Workspace Trust").';
const SECTION = 'stosStudio';          // settings are "stosStudio.<name>"
type Action = 'build' | 'run';

/** Read the "stosStudio.*" settings of a folder, falling back to the defaults. */
export function readSettings(folder: vscode.WorkspaceFolder): StosSettings {
    const c = vscode.workspace.getConfiguration(SECTION, folder.uri);
    const get = <K extends keyof StosSettings>(key: K): StosSettings[K] => c.get(key) ?? DEFAULT_SETTINGS[key];
    return {
        sourceFile: get('sourceFile'), outputFile: get('outputFile'), hatariPath: get('hatariPath'),
        tosImage: get('tosImage'), hardDrive: get('hardDrive'), autoRun: get('autoRun'),
        stosFolder: get('stosFolder'), assetsFolder: get('assetsFolder'), machine: get('machine'), memory: get('memory'),
        resolution: get('resolution'),
    };
}

/** A terminal that runs the build (and for "run", then starts Hatari). */
class StosTerminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<number>();
    onDidWrite = this.writeEmitter.event;
    onDidClose = this.closeEmitter.event;
    private child?: ChildProcess;

    constructor(private folder: vscode.WorkspaceFolder, private action: Action) { }

    open(): void { void this.start(); }

    close(): void { this.child?.kill(); }

    private print(text: string): void {
        this.writeEmitter.fire(text.replace(/\r?\n/g, '\r\n') + '\r\n');   // terminals want CR+LF
    }

    /**
     * Optional step of Run: let the Toolkit build the project's graphics, so the assets are current.
     * Returns false if Run should be cancelled. Without a Toolkit folder or a manifest nothing happens.
     */
    private async buildGraphics(root: string): Promise<boolean> {
        const c = vscode.workspace.getConfiguration(SECTION, this.folder.uri);
        const toolkit = c.get<string>('toolkitFolder') ?? '';
        if (!shouldBuildGraphics(c.get<boolean>('buildToolkitGraphics') ?? true, toolkit, root)) { return true; }
        this.print('Building graphics (STOS-Toolkit)...');
        let code: number | null;
        try {
            code = await runToolkitCommand(toolkitBuildCommand(toolkit, root), l => this.print(l), spawn);
        } catch (e) {
            this.print((e as Error).message);             // e.g. the Toolkit has no .venv
            code = -1;
        }
        if (buildOutcome(code) === 'ok') { return true; }
        // failed or refused (1), or a problem (2, or the program did not start): the output is above
        const choice = await vscode.window.showWarningMessage(
            'The STOS-Toolkit build did not finish cleanly (see the terminal). Run with the existing assets?',
            { modal: true }, 'Run with existing assets');
        return choice !== undefined;
    }

    private async start(): Promise<void> {
        const root = this.folder.uri.fsPath;
        const settings = readSettings(this.folder);
        try {
            if (this.action === 'run' && !vscode.workspace.isTrusted) { throw new StosError(UNTRUSTED); }
            // always build first, so "run" never starts an old program
            refreshDiagnostics(this.folder);       // squiggles for what Build is about to report
            buildProject(root, settings, m => { if (m !== '') { this.print(m); } },
                (file, log) => convert(file, log, convertOptionsFor(this.folder)));
            if (this.action === 'build') { this.print('Done.'); this.closeEmitter.fire(0); return; }

            if (!await this.buildGraphics(root)) { this.print('Run cancelled.'); this.closeEmitter.fire(1); return; }

            const cmd = prepareRun(root, settings, process.platform, m => this.print(m));
            this.print(`Starting ${cmd.command}`);
            this.child = spawn(cmd.command, cmd.args, { cwd: cmd.cwd });
            this.child.stdout?.on('data', d => this.print(String(d).trimEnd()));
            this.child.stderr?.on('data', d => this.print(String(d).trimEnd()));
            this.child.on('error', e => {
                this.print(`Cannot start Hatari: ${e.message} (check "stosStudio.hatariPath")`);
                this.closeEmitter.fire(1);
                void offerSelect(`Cannot start Hatari (${cmd.command}).`, 'Select Hatari...', selectHatari);
            });
            this.child.on('exit', code => this.closeEmitter.fire(code ?? 0));
        } catch (e) {
            const message = (e as Error).message;
            this.print(e instanceof StosError ? message : `Unexpected error: ${message}`);
            this.closeEmitter.fire(1);
            if (/TOS image/.test(message)) {
                void offerSelect(message, 'Select TOS image...', selectTosImage);
            } else if (/STOS folder/.test(message)) {
                void offerSelect(message, 'Select STOS folder...', selectStosFolder);
            }
        }
    }
}

/**
 * Save a setting in the user settings, so it is used by every project on this computer.
 * A project's own .vscode/settings.json wins over the user settings, so warn when it has one.
 */
export async function saveUserSetting(key: string, value: string, what: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    const info = config.inspect<string>(key);
    const override = info?.workspaceFolderValue ?? info?.workspaceValue;
    if (override) {
        void vscode.window.showWarningMessage(`${what} set to ${value}, but this project overrides it with ${override} (in .vscode/settings.json).`);
    } else {
        void vscode.window.showInformationMessage(`${what} set to ${value}`);
    }
}

/** The folder a file dialog opens in: where the current file is, if that folder exists. */
export function startFolder(current: string, fallback: string): vscode.Uri {
    const dir = current ? path.dirname(expandHome(current)) : '';
    return vscode.Uri.file(dir && fs.existsSync(dir) ? dir : fallback);
}

/** "Select Hatari...": pick the Hatari program and save it in "stosStudio.hatariPath". */
export async function selectHatari(): Promise<void> {
    const current = vscode.workspace.getConfiguration(SECTION).get<string>('hatariPath') ?? '';
    const picked = await vscode.window.showOpenDialog({
        title: 'Select the Hatari program',
        openLabel: 'Use this Hatari',
        canSelectFiles: true,
        canSelectFolders: process.platform === 'darwin',   // Hatari.app is a folder on macOS
        canSelectMany: false,
        // for a program inside Hatari.app, start next to the .app, not inside it
        defaultUri: startFolder(current.replace(/\.app[\\/].*$/i, '.app'),
            process.platform === 'darwin' ? '/Applications' : os.homedir()),
    });
    if (!picked || picked.length === 0) { return; }       // cancelled
    try {
        await saveUserSetting('hatariPath', hatariProgramFor(picked[0].fsPath), 'Hatari');
    } catch (e) {
        void vscode.window.showErrorMessage((e as Error).message);
    }
}

/** "Select TOS image...": pick the TOS ROM image and save it in "stosStudio.tosImage". */
export async function selectTosImage(): Promise<void> {
    const current = vscode.workspace.getConfiguration(SECTION).get<string>('tosImage') ?? '';
    const picked = await vscode.window.showOpenDialog({
        title: 'Select the TOS ROM image',
        openLabel: 'Use this TOS',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'TOS images': ['img', 'rom', 'tos'], 'All files': ['*'] },
        defaultUri: startFolder(current, os.homedir()),
    });
    if (!picked || picked.length === 0) { return; }       // cancelled
    await saveUserSetting('tosImage', picked[0].fsPath, 'TOS image');
}

/** "Select STOS folder...": pick the user's own STOS folder and save it in "stosStudio.stosFolder". */
export async function selectStosFolder(): Promise<void> {
    const current = vscode.workspace.getConfiguration(SECTION).get<string>('stosFolder') ?? '';
    const picked = await vscode.window.showOpenDialog({
        title: 'Select your STOS folder (the one with BASIC208.TOS)',
        openLabel: 'Use this STOS',
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: startFolder(current, os.homedir()),
    });
    if (!picked || picked.length === 0) { return; }       // cancelled
    try {
        await saveUserSetting('stosFolder', stosFolderFor(picked[0].fsPath), 'STOS folder');
    } catch (e) {
        void vscode.window.showErrorMessage((e as Error).message);
    }
}

/** "New STOS project...": ask where and how to call it, create it, and open it. */
export async function newProject(): Promise<void> {
    const parent = await vscode.window.showOpenDialog({
        title: 'New STOS project: choose the folder to create it in',
        openLabel: 'Create the project here',
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(os.homedir()),
    });
    if (!parent || parent.length === 0) { return; }
    const name = await vscode.window.showInputBox({
        title: 'New STOS project',
        prompt: `Name of the project (a new folder in ${parent[0].fsPath})`,
        value: 'MyStosProgram',
        validateInput: checkProjectName,
    });
    if (name === undefined) { return; }
    try {
        const root = createProject(parent[0].fsPath, name);
        // a window that already has a folder open keeps it; the project opens in a new window
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root),
            { forceNewWindow: (vscode.workspace.workspaceFolders?.length ?? 0) > 0 });
    } catch (e) {
        void vscode.window.showErrorMessage((e as Error).message);
    }
}

/** Show an error with a button that runs a "Select ..." command. */
async function offerSelect(message: string, button: string, select: () => Promise<void>): Promise<void> {
    const choice = await vscode.window.showErrorMessage(message, button);
    if (choice) { await select(); }
}

function makeTask(folder: vscode.WorkspaceFolder, action: Action): vscode.Task {
    const definition = { type: TASK_TYPE, action };
    const label = action === 'build' ? 'Build STOS program' : 'Run STOS program in Hatari';
    const task = new vscode.Task(definition, folder, label, 'STOS Studio',
        new vscode.CustomExecution(async () => new StosTerminal(folder, action)));
    if (action === 'build') { task.group = vscode.TaskGroup.Build; }
    return task;
}

export function registerTasks(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.tasks.registerTaskProvider(TASK_TYPE, {
        provideTasks: () => (vscode.workspace.workspaceFolders ?? []).flatMap(f =>
            (['build', 'run'] as Action[]).map(a => makeTask(f, a))),
        resolveTask: (task: vscode.Task) => {
            const action = task.definition.action as Action;
            const folder = vscode.workspace.workspaceFolders?.[0];
            return folder && (action === 'build' || action === 'run') ? makeTask(folder, action) : undefined;
        },
    }));

    // commands for the buttons at the top right of a .stos file and for the command palette
    const runTask = (action: Action) => async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) { void vscode.window.showErrorMessage('Open a STOS project folder first.'); return; }
        await vscode.tasks.executeTask(makeTask(folder, action));
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('stosStudio.build', runTask('build')),
        vscode.commands.registerCommand('stosStudio.run', runTask('run')),
        vscode.commands.registerCommand('stosStudio.selectHatari', selectHatari),
        vscode.commands.registerCommand('stosStudio.selectTosImage', selectTosImage),
        vscode.commands.registerCommand('stosStudio.selectStosFolder', selectStosFolder),
        vscode.commands.registerCommand('stosStudio.newProject', newProject));
}
