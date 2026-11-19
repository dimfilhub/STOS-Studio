/**
 * Build and run logic that does not depend on VS Code (so it can be tested with plain Node).
 *  - buildProject: .stos -> numbered .asc, through the converter
 *  - prepareRun:   copies the .asc onto the emulated hard drive and works out the Hatari command
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Log, StosError, noLog } from './errors';
import { ConvertResult } from './converter';
import { encodeAtari } from './charset';

/** The "stosStudio.*" settings. */
export interface StosSettings {
    sourceFile: string;   // main .stos file, relative to the project folder
    outputFile: string;   // .asc file to create, relative to the project folder
    hatariPath: string;   // Hatari program ("" = default for this system)
    tosImage: string;     // TOS ROM image file ("" = not chosen yet)
    hardDrive: string;    // folder Hatari uses as drive C:, relative to the project folder
    autoRun: string;      // program Hatari starts, as seen from the Atari
    stosFolder: string;   // the user's own STOS folder (with BASIC2xx.TOS), copied onto the drive once
    codeFolder: string;   // folder on the drive for MAIN.ASC and the assets ("" = the root of C:)
    assetsFolder: string; // project folder whose files (sprite banks, ...) are copied onto the drive on every Run
    machine: string;      // emulated Atari: st, megast, ste or megaste
    memory: number;       // ST RAM in KB: 512, 1024, 2048 or 4096
    resolution: string;   // screen at start: low (colour), medium (colour) or high (monochrome)
}

/** The machines STOS runs on (Hatari also has tt and falcon, but STOS does not work there). */
export const MACHINES = ['st', 'megast', 'ste', 'megaste'];
export const MEMORY_SIZES = [512, 1024, 2048, 4096];
/** Resolution -> Hatari's monitor and TOS resolution. High resolution needs the monochrome monitor. */
const RESOLUTIONS: Record<string, { monitor: string; tosRes: string }> = {
    low: { monitor: 'rgb', tosRes: 'low' },
    medium: { monitor: 'rgb', tosRes: 'med' },
    high: { monitor: 'mono', tosRes: 'high' },
};

export const DEFAULT_SETTINGS: StosSettings = {
    sourceFile: 'main.stos',
    outputFile: 'stos/main.asc',
    hatariPath: '',
    tosImage: '',
    hardDrive: 'hatari/hd',
    autoRun: 'C:\\STOS\\BASIC208.TOS',
    stosFolder: '',
    codeFolder: 'CODE',
    assetsFolder: 'assets',
    machine: 'ste',
    memory: 1024,
    resolution: 'low',
};

/** A function that turns a .stos file into .asc lines (the converter, or a stand-in in tests). */
export type Converter = (sourceFile: string, log: Log) => ConvertResult;

/** Where Hatari usually is, per operating system. */
export function defaultHatariPath(platform: string = process.platform): string {
    if (platform === 'darwin') { return '/Applications/Hatari.app/Contents/MacOS/Hatari'; }
    if (platform === 'win32') { return 'C:\\Program Files\\Hatari\\hatari.exe'; }
    return 'hatari';        // Linux: found through PATH
}

/**
 * The program to start for a file the user picked as "Hatari".
 * On macOS people pick "Hatari.app", which is a folder; the real program is inside it, in
 * Contents/MacOS. Its name is in Contents/Info.plist (CFBundleExecutable); if that cannot be read
 * we take the only file in Contents/MacOS. Anything else is returned unchanged.
 */
export function hatariProgramFor(selected: string): string {
    const isAppBundle = /\.app[\\/]?$/i.test(selected) && fs.existsSync(path.join(selected, 'Contents', 'MacOS'));
    if (!isAppBundle) { return selected; }
    const macos = path.join(selected, 'Contents', 'MacOS');
    try {
        const plist = fs.readFileSync(path.join(selected, 'Contents', 'Info.plist'), 'utf8');
        const name = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
        if (name && fs.existsSync(path.join(macos, name))) { return path.join(macos, name); }
    } catch { /* no readable Info.plist: fall back below */ }
    const files = fs.readdirSync(macos);
    if (files.length === 1) { return path.join(macos, files[0]); }
    throw new StosError(`Cannot find the Hatari program inside ${selected}`);
}

/** "~/x" -> "/Users/you/x" */
export function expandHome(p: string, home: string = os.homedir()): string {
    return p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(home, p.slice(1)) : p;
}

/**
 * A project setting that names something to write (the .asc, the emulated drive) must stay inside the
 * project folder: a project from somewhere else could otherwise make Build or Run overwrite files elsewhere.
 * Returns the full path.
 */
export function inProject(root: string, relative: string, setting: string): string {
    const full = path.resolve(root, relative);
    const rel = path.relative(path.resolve(root), full);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new StosError(`"stosStudio.${setting}" must be inside the project folder (${root}), not ${full}`);
    }
    return full;
}

/**
 * Convert the project's .stos file and write the .asc: CR+LF line endings and the Atari ST character
 * set, as STOS wants. Returns its full path.
 */
export function buildProject(root: string, s: StosSettings, log: Log, convert: Converter): string {
    const source = path.resolve(root, s.sourceFile);
    const dest = inProject(root, s.outputFile, 'outputFile');
    if (!fs.existsSync(source)) {
        throw new StosError(`${source} not found (set "stosStudio.sourceFile")`);
    }
    const { lines } = convert(source, log);
    log(`Writing ${dest}`);
    try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, encodeAtari(lines.map(l => l + '\r\n').join('')));
    } catch (e) {
        throw new StosError(`Cannot write ${dest}: ${(e as Error).message}`);
    }
    return dest;
}

/** True if the folder holds a STOS interpreter (a file BASIC<number>.TOS, any case). */
export function hasStos(folder: string): boolean {
    try {
        return fs.readdirSync(folder).some(f => /^basic\d*\.tos$/i.test(f));
    } catch {
        return false;      // the folder does not exist
    }
}

/**
 * The STOS folder for a folder the user picked: the folder itself if it holds BASIC2xx.TOS, or a
 * "STOS" folder inside it (people often pick the drive folder that contains STOS).
 */
export function stosFolderFor(selected: string): string {
    if (hasStos(selected)) { return selected; }
    const inside = fs.existsSync(selected) ? fs.readdirSync(selected).find(f => /^stos$/i.test(f)) : undefined;
    if (inside && hasStos(path.join(selected, inside))) { return path.join(selected, inside); }
    throw new StosError(`No STOS found in ${selected}: pick the folder that contains BASIC208.TOS (or BASIC206.TOS ...)`);
}

/**
 * Make sure the emulated drive has STOS in its STOS folder. A drive that already has it (also an older
 * project) is left alone; otherwise the user's STOS folder is copied there once.
 * STOS is never part of this extension: the user points "stosStudio.stosFolder" at their own copy.
 */
export function prepareDrive(hardDrive: string, stosFolder: string, log: Log = noLog): void {
    const target = path.join(hardDrive, 'STOS');
    if (hasStos(target)) { return; }
    if (stosFolder === '') {
        throw new StosError('STOS is not on the emulated drive yet: choose your STOS folder (set "stosStudio.stosFolder")');
    }
    const source = expandHome(stosFolder);
    if (!hasStos(source)) {
        throw new StosError(`No STOS found in the STOS folder ${source} (set "stosStudio.stosFolder")`);
    }
    log(`Copying STOS from ${source} to ${target} (only the first time)`);
    try {
        fs.mkdirSync(hardDrive, { recursive: true });
        fs.cpSync(source, target, { recursive: true });
    } catch (e) {
        throw new StosError(`Cannot copy STOS to ${target}: ${(e as Error).message}`);
    }
}

/** True for a name the Atari can store as it is: up to 8 characters, a dot and up to 3 more. */
function isShortName(name: string): boolean {
    return /^[^.]{1,8}(\.[^.]{0,3})?$/.test(name);
}

/**
 * Copy the files of the project's assets folder (sprite banks, pictures, data ...) onto the emulated
 * drive, so a program can `load "sprites.mbk"`. Sub-folders are copied too; names starting with a dot
 * (.DS_Store) are skipped. Names are written in capitals (ship.mbk becomes SHIP.MBK) because the Atari
 * does not find a lower-case name on the emulated drive. Runs on every Run, so edited files arrive.
 * A missing assets folder is fine. Returns how many files were copied.
 */
export function copyAssets(root: string, hardDrive: string, assetsFolder: string, log: Log = noLog): number {
    if (assetsFolder === '') { return 0; }
    const source = path.resolve(root, assetsFolder);
    if (!fs.existsSync(source)) { return 0; }
    if (!fs.statSync(source).isDirectory()) {
        throw new StosError(`${source} is not a folder (set "stosStudio.assetsFolder")`);
    }
    const target = path.resolve(hardDrive);
    if (target === source || target.startsWith(source + path.sep)) {
        throw new StosError(`The assets folder ${source} contains the emulated drive; choose another "stosStudio.assetsFolder"`);
    }
    let count = 0;
    const longNames: string[] = [];
    const copyFolder = (from: string, to: string, shown: string) => {
        fs.mkdirSync(to, { recursive: true });
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) { continue; }
            const name = shown + entry.name;
            if (!isShortName(entry.name)) { longNames.push(name); }
            const atariName = entry.name.toUpperCase();
            if (entry.isDirectory()) {
                copyFolder(path.join(from, entry.name), path.join(to, atariName), name + '/');
            } else if (entry.isFile()) {
                // an older copy under a lower-case name (from before names were capitalised) would
                // keep its name when overwritten on a case-insensitive disk, so remove it first
                for (const old of fs.existsSync(to) ? fs.readdirSync(to) : []) {
                    if (old !== atariName && old.toUpperCase() === atariName) { fs.rmSync(path.join(to, old)); }
                }
                fs.copyFileSync(path.join(from, entry.name), path.join(to, atariName));
                count++;
            }
        }
    };
    try {
        copyFolder(source, target, '');
    } catch (e) {
        throw new StosError(`Cannot copy the assets to ${target}: ${(e as Error).message}`);
    }
    if (count > 0) { log(`Copied ${count} asset file${count === 1 ? '' : 's'} from ${path.basename(source)} to the emulated drive`); }
    if (longNames.length > 0) {
        log(`Warning: the Atari only has short names (8 letters + 3): ${longNames.join(', ')}`);
    }
    return count;
}

/**
 * The file on the emulated drive that an Atari path like C:\STOS\BASIC208.TOS refers to, or undefined
 * if it does not exist. Each part of the path is matched without regard to case, as on the Atari.
 */
export function driveFile(hardDrive: string, atariPath: string): string | undefined {
    const parts = atariPath.replace(/^[A-Za-z]:/, '').split(/[\\/]/).filter(p => p !== '');
    let current = hardDrive;
    for (const part of parts) {
        let names: string[];
        try { names = fs.readdirSync(current); } catch { return undefined; }
        const match = names.find(n => n.toLowerCase() === part.toLowerCase());
        if (!match) { return undefined; }
        current = path.join(current, match);
    }
    return current;
}

export interface RunCommand { command: string; args: string[]; cwd: string; }

/**
 * Get the emulated drive ready (STOS copied once, the .asc as MAIN.ASC) and work out the Hatari command.
 */
export function prepareRun(root: string, s: StosSettings, platform: string = process.platform, log: Log = noLog): RunCommand {
    const asc = inProject(root, s.outputFile, 'outputFile');
    const hardDrive = inProject(root, s.hardDrive, 'hardDrive');
    if (s.tosImage === '') {
        throw new StosError('No TOS image chosen yet (set "stosStudio.tosImage")');
    }
    const tos = expandHome(s.tosImage);
    if (!fs.existsSync(tos)) {
        throw new StosError(`TOS image not found: ${tos} (set "stosStudio.tosImage")`);
    }
    if (!fs.existsSync(asc)) {
        throw new StosError(`${asc} is missing - build the project first`);
    }
    prepareDrive(hardDrive, s.stosFolder, log);
    // the program and the assets go into their own folder (C:\CODE) so the root of C: stays tidy
    const codeDir = s.codeFolder === '' ? hardDrive : path.join(hardDrive, s.codeFolder.toUpperCase());
    const assetCount = copyAssets(root, codeDir, s.assetsFolder, log);
    if (!driveFile(hardDrive, s.autoRun)) {
        throw new StosError(`${s.autoRun} is not on the emulated drive (${hardDrive}); check "stosStudio.autoRun"`);
    }
    // STOS wants CR+LF; make sure of it even for an .asc written by another tool. The file is handled
    // as bytes ("latin1" maps each byte to one character and back), so Atari ST characters stay as they are.
    const text = fs.readFileSync(asc, 'latin1').replace(/\r?\n/g, '\r\n');
    fs.mkdirSync(codeDir, { recursive: true });
    // TOS looks for an AUTO folder on drive C: at boot; without one Hatari logs "No GEMDOS dir .../AUTO".
    // An empty folder is enough and silences the warning.
    fs.mkdirSync(path.join(hardDrive, 'AUTO'), { recursive: true });
    fs.writeFileSync(path.join(codeDir, 'MAIN.ASC'), text, 'latin1');
    // tell the user where things are, as the file system and as STOS sees them
    const atariDir = s.codeFolder === '' ? 'C:\\' : `C:\\${s.codeFolder.toUpperCase()}\\`;
    log(`Program: ${path.join(codeDir, 'MAIN.ASC')}  (in STOS: load "${atariDir}MAIN.ASC")`);
    if (assetCount > 0) { log(`Assets:  ${codeDir}  (in STOS: load "${atariDir}<NAME>.MBK")`); }
    return {
        command: expandHome(s.hatariPath || defaultHatariPath(platform)),
        args: [...machineArgs(s), '--fast-boot', 'true', '--tos', tos, '--confirm-quit', 'false',
            '--harddrive', hardDrive, '--protect-hd', 'off', '--auto', s.autoRun],
        cwd: root,
    };
}

/**
 * Hatari options for the emulated machine, memory and resolution, checked first (the settings can be
 * typed by hand in settings.json). --memsize takes KB here: Hatari reads values above 14 as KiB.
 */
export function machineArgs(s: StosSettings): string[] {
    if (!MACHINES.includes(s.machine)) {
        throw new StosError(`"stosStudio.machine" is "${s.machine}"; use one of ${MACHINES.join(', ')}`);
    }
    if (!MEMORY_SIZES.includes(s.memory)) {
        throw new StosError(`"stosStudio.memory" is ${s.memory}; use one of ${MEMORY_SIZES.join(', ')} (KB)`);
    }
    const screen = RESOLUTIONS[s.resolution];
    if (!screen) {
        throw new StosError(`"stosStudio.resolution" is "${s.resolution}"; use low, medium or high`);
    }
    return ['--machine', s.machine, '--memsize', String(s.memory),
        '--monitor', screen.monitor, '--tos-res', screen.tosRes];
}
