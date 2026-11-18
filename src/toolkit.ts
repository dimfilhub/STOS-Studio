/**
 * The optional link with STOS-Toolkit, the separate Python project with graphic tools (sprite editor, ...).
 * STOS Studio only starts its tools as separate programs; nothing of the Toolkit is part of this extension.
 * No VS Code in this file, so it can be tested with plain Node.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess } from 'child_process';
import { StosError } from './errors';
import { expandHome } from './build';

/** Files the sprite editor can open (STOS sprite banks). */
export const SPRITE_FILE = /\.(mbk|spr)$/i;

/** Files the workbench can open: sprite banks, ST screens and pictures. */
export const WORKBENCH_FILE = /\.(mbk|spr|png|jpe?g|pi1|neo|pac)$/i;

/** The Python program inside the Toolkit's virtual environment (.venv), or undefined if there is none. */
export function toolkitPython(folder: string): string | undefined {
    const candidates = process.platform === 'win32'
        ? [path.join(folder, '.venv', 'Scripts', 'python.exe')]
        : [path.join(folder, '.venv', 'bin', 'python'), path.join(folder, '.venv', 'bin', 'python3')];
    return candidates.find(c => fs.existsSync(c));
}

/**
 * Check a Toolkit folder and return it with "~" expanded. Throws a StosError saying what is missing.
 * The message mentions "Toolkit folder", so the Run / editor code can offer to pick one.
 */
export function checkToolkit(setting: string): string {
    if (setting === '') {
        throw new StosError('No Toolkit folder chosen yet (set "stosStudio.toolkitFolder")');
    }
    const folder = expandHome(setting);
    if (!fs.existsSync(folder)) {
        throw new StosError(`Toolkit folder not found: ${folder} (set "stosStudio.toolkitFolder")`);
    }
    if (!fs.existsSync(path.join(folder, 'src', 'stos_toolkit', 'sprite_editor.py'))) {
        throw new StosError(`${folder} does not look like STOS-Toolkit (no src/stos_toolkit/sprite_editor.py); choose the Toolkit folder`);
    }
    if (!toolkitPython(folder)) {
        throw new StosError(`No Python found in the Toolkit folder: ${folder} has no .venv (see the Toolkit's setup notes)`);
    }
    return folder;
}

export interface ToolCommand { command: string; args: string[]; cwd: string; }

/** The command that starts the sprite editor, with a file to open or (no file) a new bank. */
export function spriteEditorCommand(toolkitSetting: string, file?: string): ToolCommand {
    const folder = checkToolkit(toolkitSetting);
    return {
        command: toolkitPython(folder)!,
        args: ['-m', 'stos_toolkit.sprite_editor', ...(file ? [file] : [])],
        cwd: folder,
    };
}

/**
 * The command that starts the workbench window: "python -m stos_toolkit workbench [--project <folder>]
 * [--assets-folder <name>] [file]". Studio creates nothing; the workbench itself asks before writing
 * the manifest. Without a project folder there is no --project (the workbench reopens its last project).
 * The assets folder is passed only if it is a relative folder inside the project (the Toolkit checks it again).
 */
export function workbenchCommand(toolkitSetting: string, projectRoot?: string, assetsFolder = '', file?: string): ToolCommand {
    const folder = checkToolkit(toolkitSetting);
    const args = ['-m', 'stos_toolkit', 'workbench'];
    if (projectRoot) {
        args.push('--project', projectRoot);
        const rel = assetsFolder === '' ? '' : path.relative(path.resolve(projectRoot), path.resolve(projectRoot, assetsFolder));
        if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) { args.push('--assets-folder', rel); }
    }
    if (file) { args.push(file); }
    return { command: toolkitPython(folder)!, args, cwd: folder };
}

/** The manifest that makes a project folder a Toolkit project (written by the Toolkit's workbench). */
export const MANIFEST = 'stos-toolkit.json';

/**
 * Should Run build the Toolkit graphics first? Only when the setting is on, a Toolkit folder is set and the
 * project has a manifest. Otherwise Run does nothing extra and says nothing.
 */
export function shouldBuildGraphics(enabled: boolean, toolkitSetting: string, projectRoot: string): boolean {
    return enabled && toolkitSetting !== '' && fs.existsSync(path.join(projectRoot, MANIFEST));
}

/**
 * The command for "stos-toolkit build <project>". The project folder is one argument of its own (no shell
 * is involved) and "--force" is never passed: a built file edited by hand is never overwritten.
 * "--status" only lists the items and their state.
 */
export function toolkitBuildCommand(toolkitSetting: string, projectRoot: string, status = false): ToolCommand {
    const folder = checkToolkit(toolkitSetting);
    return {
        command: toolkitPython(folder)!,
        args: ['-m', 'stos_toolkit', 'build', projectRoot, ...(status ? ['--status'] : [])],
        cwd: folder,
    };
}

/** What an exit code of the Toolkit build means: 0 fine, 1 an item failed or was refused, anything else a problem. */
export type BuildOutcome = 'ok' | 'failed' | 'problem';
export function buildOutcome(exitCode: number | null): BuildOutcome {
    if (exitCode === 0) { return 'ok'; }
    return exitCode === 1 ? 'failed' : 'problem';
}

/** The function that starts a program; "child_process.spawn" in the extension, a fake in the tests. */
export type SpawnFn = (command: string, args: string[], options: { cwd: string }) => ChildProcess;

/**
 * Run a Toolkit command, passing its output (stdout and stderr) to `log` line by line.
 * Resolves with the exit code (null if it was stopped by a signal); a program that cannot be started
 * resolves with -1 after logging why.
 */
export function runToolkitCommand(cmd: ToolCommand, log: (line: string) => void, spawnFn: SpawnFn): Promise<number | null> {
    return new Promise(resolve => {
        const child = spawnFn(cmd.command, cmd.args, { cwd: cmd.cwd });
        const forward = (d: Buffer | string) => String(d).split(/\r?\n/).filter(l => l !== '').forEach(log);
        child.stdout?.on('data', forward);
        child.stderr?.on('data', forward);
        child.on('error', e => { log(`Cannot start the Toolkit: ${e.message}`); resolve(-1); });
        child.on('close', code => resolve(code));
    });
}
