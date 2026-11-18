/**
 * "New STOS project": creates a project folder with a small program and the files VS Code needs.
 * No VS Code here, so it can be tested with plain Node; the command in tasks.ts asks for the folder
 * and the name and then calls createProject.
 */
import * as fs from 'fs';
import * as path from 'path';
import { StosError } from './errors';

/** The first program of a new project (written for STOS Studio; shows labels, gosub and comments). */
const MAIN_STOS = `' main.stos - a new STOS Studio project
' Lines starting with ' are notes for you: STOS never sees them.
' Build: Shift+Cmd+B (Ctrl+Shift+B).  Run in Hatari: the play button at the top right.

mode 0 : cls : curs off : hide on
colour 0,$000 : colour 1,$777 : pen 1 : paper 0
gosub @title
wait key
default
end

' prints the title in the middle of the screen
@title
locate 0,10 : centre "Hello from STOS Studio!"
locate 0,12 : centre "Press a key"
return
`;

/** Project settings: the defaults written out, so they are easy to find and change. */
const SETTINGS = {
    'stosStudio.sourceFile': 'main.stos',
    'stosStudio.outputFile': 'stos/main.asc',
    'stosStudio.hardDrive': 'hatari/hd',
};

/** Files git should not keep: the built .asc and the emulated drive (it holds a copy of STOS). */
const GITIGNORE = `# made by Build
/stos/
# the emulated drive: a copy of your STOS and the program to run
/hatari/hd/
.DS_Store
`;

/** A project name that works as a folder name everywhere (also on the Atari side, which does not care). */
export function checkProjectName(name: string): string | undefined {
    if (name.trim() === '') { return 'Please enter a name.'; }
    if (/[\\/:*?"<>|]/.test(name)) { return 'A name cannot contain \\ / : * ? " < > |'; }
    if (name.startsWith('.')) { return 'A name cannot start with a dot.'; }
    return undefined;
}

/**
 * Create the project folder `parent/name` with main.stos, .vscode/settings.json and .gitignore.
 * Returns the new folder. Refuses a folder that already exists and is not empty.
 */
export function createProject(parent: string, name: string): string {
    const problem = checkProjectName(name);
    if (problem) { throw new StosError(problem); }
    const root = path.join(parent, name.trim());
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
        throw new StosError(`${root} already exists and is not empty`);
    }
    fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(root, 'main.stos'), MAIN_STOS);
    fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), JSON.stringify(SETTINGS, null, '\t') + '\n');
    fs.writeFileSync(path.join(root, '.gitignore'), GITIGNORE);
    return root;
}
