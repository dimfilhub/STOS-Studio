// Tests for the optional STOS-Toolkit link (src/toolkit.ts) and for copying assets onto the drive.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const toolkit = require('../out/toolkit');
const build = require('../out/build');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'stos-tk-'));

/** A fake Toolkit folder: just the files STOS Studio looks for (no real Python needed). */
function fakeToolkit(dir = tempDir()) {
    fs.mkdirSync(path.join(dir, 'src', 'stos_toolkit'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'stos_toolkit', 'sprite_editor.py'), '');
    fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.venv', 'bin', 'python'), '');
    return dir;
}

test('spriteEditorCommand: the Toolkit Python runs the sprite editor, with or without a file', { skip: process.platform === 'win32' }, () => {
    const dir = fakeToolkit();
    assert.deepEqual(toolkit.spriteEditorCommand(dir),
        { command: path.join(dir, '.venv', 'bin', 'python'), args: ['-m', 'stos_toolkit.sprite_editor'], cwd: dir });
    const withFile = toolkit.spriteEditorCommand(dir, '/p/assets/SPRITES.MBK');
    assert.deepEqual(withFile.args, ['-m', 'stos_toolkit.sprite_editor', '/p/assets/SPRITES.MBK']);
});

test('checkToolkit: clear errors for every missing piece', () => {
    assert.throws(() => toolkit.checkToolkit(''), /No Toolkit folder chosen/);
    assert.throws(() => toolkit.checkToolkit(path.join(tempDir(), 'nope')), /Toolkit folder not found/);
    assert.throws(() => toolkit.checkToolkit(tempDir()), /does not look like STOS-Toolkit/);
    const noPython = fakeToolkit();
    fs.rmSync(path.join(noPython, '.venv'), { recursive: true });
    assert.throws(() => toolkit.checkToolkit(noPython), /No Python found in the Toolkit folder/);
});

test('SPRITE_FILE: sprite banks only, any case', () => {
    for (const f of ['a.mbk', 'SPRITES.MBK', 'x.Spr']) { assert.ok(toolkit.SPRITE_FILE.test(f), f); }
    for (const f of ['a.mbkx', 'main.stos', 'mbk']) { assert.ok(!toolkit.SPRITE_FILE.test(f), f); }
});

test('copyAssets: files and sub-folders arrive on the drive, dot files stay out, changes are copied again', () => {
    const root = tempDir();
    const drive = path.join(root, 'hatari', 'hd');
    fs.mkdirSync(path.join(root, 'assets', 'PICS'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'SPRITES.MBK'), 'one');
    fs.writeFileSync(path.join(root, 'assets', 'PICS', 'TITLE.PI1'), 'pic');
    fs.writeFileSync(path.join(root, 'assets', '.DS_Store'), 'junk');
    const messages = [];
    assert.equal(build.copyAssets(root, drive, 'assets', m => messages.push(m)), 2);
    assert.equal(fs.readFileSync(path.join(drive, 'SPRITES.MBK'), 'utf8'), 'one');
    assert.equal(fs.readFileSync(path.join(drive, 'PICS', 'TITLE.PI1'), 'utf8'), 'pic');
    assert.equal(fs.existsSync(path.join(drive, '.DS_Store')), false);
    assert.deepEqual(messages, ['Copied 2 asset files from assets to the emulated drive']);
    fs.writeFileSync(path.join(root, 'assets', 'SPRITES.MBK'), 'two');       // edited with the sprite editor
    build.copyAssets(root, drive, 'assets');
    assert.equal(fs.readFileSync(path.join(drive, 'SPRITES.MBK'), 'utf8'), 'two');
});

test('copyAssets: no assets folder or empty setting is fine; long names are warned about; bad setups are errors', () => {
    const root = tempDir();
    const drive = path.join(root, 'hd');
    assert.equal(build.copyAssets(root, drive, 'assets'), 0);               // folder missing
    assert.equal(build.copyAssets(root, drive, ''), 0);                     // switched off
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'verylongname.mbk'), 'x');
    fs.writeFileSync(path.join(root, 'assets', 'OK.MBK'), 'x');
    const messages = [];
    build.copyAssets(root, drive, 'assets', m => messages.push(m));
    assert.deepEqual(messages.slice(1), ['Warning: the Atari only has short names (8 letters + 3): verylongname.mbk']);
    // an assets folder that contains the drive would copy into itself
    assert.throws(() => build.copyAssets(root, path.join(root, 'assets', 'hd'), 'assets'), /contains the emulated drive/);
    assert.throws(() => build.copyAssets(root, drive, 'assets/OK.MBK'), /is not a folder/);
});

test('prepareRun copies the assets folder onto the drive', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'stos'));
    fs.writeFileSync(path.join(dir, 'stos', 'main.asc'), '10 END\n');
    fs.writeFileSync(path.join(dir, 'tos.img'), 'x');
    fs.mkdirSync(path.join(dir, 'my-stos', 'STOS'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'my-stos', 'BASIC208.TOS'), '');
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'SHIP.MBK'), 'bank');
    const s = { ...build.DEFAULT_SETTINGS, tosImage: path.join(dir, 'tos.img'), stosFolder: path.join(dir, 'my-stos') };
    build.prepareRun(dir, s, 'darwin');
    assert.equal(fs.readFileSync(path.join(dir, 'hatari', 'hd', 'SHIP.MBK'), 'utf8'), 'bank');
});

// ---- Toolkit graphics build (Run hook and command) ----
const { EventEmitter } = require('node:events');

/** A fake child process: prints the given lines on stdout / stderr, then closes with the exit code. */
function fakeSpawn(record, { out = [], err = [], code = 0, fail } = {}) {
    return (command, args, options) => {
        record.push({ command, args, options });
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setImmediate(() => {
            if (fail) { child.emit('error', new Error(fail)); return; }
            out.forEach(l => child.stdout.emit('data', Buffer.from(l + '\n')));
            err.forEach(l => child.stderr.emit('data', Buffer.from(l + '\n')));
            child.emit('close', code);
        });
        return child;
    };
}

test('shouldBuildGraphics: only with the setting on, a Toolkit folder and a manifest', () => {
    const project = tempDir();
    assert.equal(toolkit.shouldBuildGraphics(true, '/tk', project), false, 'no manifest');
    fs.writeFileSync(path.join(project, 'stos-toolkit.json'), '{}');
    assert.equal(toolkit.shouldBuildGraphics(true, '/tk', project), true);
    assert.equal(toolkit.shouldBuildGraphics(false, '/tk', project), false, 'setting off');
    assert.equal(toolkit.shouldBuildGraphics(true, '', project), false, 'no Toolkit folder');
});

test('toolkitBuildCommand: argument array with the project folder, never --force', { skip: process.platform === 'win32' }, () => {
    const dir = fakeToolkit();
    const project = '/p/my project; rm -rf $HOME';       // odd characters stay one plain argument
    const cmd = toolkit.toolkitBuildCommand(dir, project);
    assert.deepEqual(cmd, { command: path.join(dir, '.venv', 'bin', 'python'), args: ['-m', 'stos_toolkit', 'build', project], cwd: dir });
    assert.ok(!cmd.args.includes('--force'));
    assert.deepEqual(toolkit.toolkitBuildCommand(dir, project, true).args, ['-m', 'stos_toolkit', 'build', project, '--status']);
    assert.throws(() => toolkit.toolkitBuildCommand('', project), /No Toolkit folder chosen/);
});

test('buildOutcome: 0 ok, 1 failed or refused, anything else a problem', () => {
    assert.equal(toolkit.buildOutcome(0), 'ok');
    assert.equal(toolkit.buildOutcome(1), 'failed');
    for (const c of [2, 127, -1, null]) { assert.equal(toolkit.buildOutcome(c), 'problem', String(c)); }
});

test('runToolkitCommand: logs stdout and stderr lines, returns the exit code', async () => {
    const calls = [], lines = [];
    const cmd = { command: 'py', args: ['-m', 'x'], cwd: '/tk' };
    const code = await toolkit.runToolkitCommand(cmd, l => lines.push(l),
        fakeSpawn(calls, { out: ['built A', 'ok B'], err: ['EDITED C'], code: 1 }));
    assert.equal(code, 1);
    assert.deepEqual(lines, ['built A', 'ok B', 'EDITED C']);
    assert.deepEqual(calls, [{ command: 'py', args: ['-m', 'x'], options: { cwd: '/tk' } }]);
});

test('runToolkitCommand: a program that cannot start gives -1 and a message', async () => {
    const lines = [];
    const code = await toolkit.runToolkitCommand({ command: 'nope', args: [], cwd: '.' }, l => lines.push(l),
        fakeSpawn([], { fail: 'ENOENT' }));
    assert.equal(code, -1);
    assert.match(lines[0], /Cannot start the Toolkit: ENOENT/);
    assert.equal(toolkit.buildOutcome(code), 'problem');
});

// ---- workbench command ----
test('workbenchCommand: project, assets folder and file become separate arguments', { skip: process.platform === 'win32' }, () => {
    const dir = fakeToolkit();
    const py = path.join(dir, '.venv', 'bin', 'python');
    const base = ['-m', 'stos_toolkit', 'workbench'];
    assert.deepEqual(toolkit.workbenchCommand(dir), { command: py, args: base, cwd: dir }, 'no project: reopens the last one');
    assert.deepEqual(toolkit.workbenchCommand(dir, '/p').args, [...base, '--project', '/p'], 'assets setting empty');
    assert.deepEqual(toolkit.workbenchCommand(dir, '/p', 'gfx').args, [...base, '--project', '/p', '--assets-folder', 'gfx']);
    assert.deepEqual(toolkit.workbenchCommand(dir, '/p', 'a/../out/data').args, [...base, '--project', '/p', '--assets-folder', path.join('out', 'data')]);
    for (const bad of ['../outside', '/elsewhere', '.']) {
        assert.deepEqual(toolkit.workbenchCommand(dir, '/p', bad).args, [...base, '--project', '/p'], bad);
    }
    assert.deepEqual(toolkit.workbenchCommand(dir, '/p', 'assets', '/p/art/my ball.png').args,
        [...base, '--project', '/p', '--assets-folder', 'assets', '/p/art/my ball.png'], 'file after the options');
    assert.deepEqual(toolkit.workbenchCommand(dir, undefined, 'assets', '/x/a.mbk').args, [...base, '/x/a.mbk'], 'assets ignored without a project');
    assert.throws(() => toolkit.workbenchCommand(''), /No Toolkit folder chosen/);
});

test('WORKBENCH_FILE: banks, screens and pictures, any case', () => {
    for (const f of ['a.mbk', 'B.PNG', 'x.jpg', 'x.jpeg', 'a.pi1', 'a.NEO', 'a.pac', 'a.spr']) { assert.ok(toolkit.WORKBENCH_FILE.test(f), f); }
    for (const f of ['main.stos', 'a.pngx', 'png']) { assert.ok(!toolkit.WORKBENCH_FILE.test(f), f); }
});
