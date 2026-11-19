// Tests for the build / run logic (src/build.ts). Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const build = require('../out/build');
const { convert } = require('../out/converter');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'stos-studio-'));

/** A fake STOS folder (just empty files with the right names; no Atari software in the tests). */
function fakeStos(dir, interpreter = 'BASIC208.TOS') {
    fs.mkdirSync(path.join(dir, 'STOS'), { recursive: true });
    fs.writeFileSync(path.join(dir, interpreter), '');
    fs.writeFileSync(path.join(dir, 'STOS', 'SPRIT101.BIN'), '');
    return dir;
}
/** A stand-in converter: numbers the lines 10, 20, ... (the real one is tested in converter.test.js). */
const fakeConvert = (file) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l).map((l, i) => `${(i + 1) * 10} ${l}`);
    return { lines, sourceMap: lines.map((_, i) => ({ file, line: i + 1 })) };
};

test('buildProject writes the .asc with CR+LF inside the project', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'main.stos'), 'PRINT 1\nEND\n');
    const dest = build.buildProject(dir, { ...build.DEFAULT_SETTINGS }, () => { }, fakeConvert);
    assert.equal(dest, path.join(dir, 'stos', 'main.asc'));
    assert.equal(fs.readFileSync(dest, 'utf8'), '10 PRINT 1\r\n20 END\r\n');
});

test('buildProject: missing source file is a clear error', () => {
    assert.throws(() => build.buildProject(tempDir(), { ...build.DEFAULT_SETTINGS }, () => { }, fakeConvert),
        /main\.stos not found/);
});

test('buildProject with the real converter writes Atari ST characters', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'main.stos'), '@top print "café"\ngoto @top\n');
    const dest = build.buildProject(dir, { ...build.DEFAULT_SETTINGS }, () => { }, convert);
    assert.deepEqual(fs.readFileSync(dest), Buffer.from('10 print "caf\x82"\r\n20 goto 10\r\n', 'latin1'));
});

test('prepareRun: MAIN.ASC on the emulated drive and the Hatari command line', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'stos'));
    fs.writeFileSync(path.join(dir, 'stos', 'main.asc'), '10 PRINT 1\n20 END\n');
    const tos = path.join(dir, 'tos.img');
    fs.writeFileSync(tos, 'x');
    const stos = fakeStos(path.join(dir, 'my-stos'));
    const s = { ...build.DEFAULT_SETTINGS, tosImage: tos, hatariPath: '/opt/hatari', stosFolder: stos };
    const cmd = build.prepareRun(dir, s, 'darwin');
    assert.equal(cmd.command, '/opt/hatari');
    assert.equal(fs.readFileSync(path.join(dir, 'hatari', 'hd', 'CODE', 'MAIN.ASC'), 'utf8'), '10 PRINT 1\r\n20 END\r\n');
    // bytes above 127 (Atari ST characters) are copied unchanged
    fs.writeFileSync(path.join(dir, 'stos', 'main.asc'), Buffer.from([0x31, 0x30, 0x20, 0x82, 0x0A]));
    build.prepareRun(dir, s, 'darwin');
    assert.deepEqual(fs.readFileSync(path.join(dir, 'hatari', 'hd', 'CODE', 'MAIN.ASC')), Buffer.from([0x31, 0x30, 0x20, 0x82, 0x0D, 0x0A]));
    const args = cmd.args.join(' ');
    assert.match(args, /^--machine ste --memsize 1024 --monitor rgb --tos-res low --fast-boot true --tos .*tos\.img/);
    assert.match(args, /--harddrive .*hatari[\\/]hd --protect-hd off --auto C:\\STOS\\BASIC208\.TOS$/);
    // errors a user can fix
    assert.throws(() => build.prepareRun(dir, { ...s, tosImage: '' }), /No TOS image chosen/);
    assert.throws(() => build.prepareRun(dir, { ...s, tosImage: path.join(dir, 'nope.img') }), /TOS image not found/);
    fs.rmSync(path.join(dir, 'stos', 'main.asc'));
    assert.throws(() => build.prepareRun(dir, s), /build the project first/);
});

test('default Hatari path and ~ expansion', () => {
    assert.equal(build.defaultHatariPath('darwin'), '/Applications/Hatari.app/Contents/MacOS/Hatari');
    assert.equal(build.defaultHatariPath('linux'), 'hatari');
    assert.equal(build.expandHome('~/a/b', '/home/me'), path.join('/home/me', 'a/b'));
    assert.equal(build.expandHome('/abs', '/home/me'), '/abs');
});

test('hatariProgramFor: Hatari.app -> program inside, other files unchanged', () => {
    const dir = tempDir();
    const app = path.join(dir, 'Hatari.app');
    fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'Hatari'), '');
    fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'helper'), '');
    fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'),
        '<dict>\n\t<key>CFBundleExecutable</key>\n\t<string>Hatari</string>\n</dict>');
    assert.equal(build.hatariProgramFor(app), path.join(app, 'Contents', 'MacOS', 'Hatari'));
    assert.equal(build.hatariProgramFor(app + '/'), path.join(app, 'Contents', 'MacOS', 'Hatari'));
    // no Info.plist, one program in Contents/MacOS: that one; several: cannot guess
    const app2 = path.join(dir, 'Other.app');
    fs.mkdirSync(path.join(app2, 'Contents', 'MacOS'), { recursive: true });
    fs.writeFileSync(path.join(app2, 'Contents', 'MacOS', 'hatari'), '');
    assert.equal(build.hatariProgramFor(app2), path.join(app2, 'Contents', 'MacOS', 'hatari'));
    fs.writeFileSync(path.join(app2, 'Contents', 'MacOS', 'extra'), '');
    assert.throws(() => build.hatariProgramFor(app2), /Cannot find the Hatari program/);
    assert.equal(build.hatariProgramFor('/usr/bin/hatari'), '/usr/bin/hatari');
});

test('prepareDrive: copies the STOS folder once; a drive with STOS is left alone', () => {
    const dir = tempDir();
    const stos = fakeStos(path.join(dir, 'my-stos'));
    const drive = path.join(dir, 'hd');
    const messages = [];
    build.prepareDrive(drive, stos, m => messages.push(m));
    assert.ok(fs.existsSync(path.join(drive, 'STOS', 'BASIC208.TOS')));
    assert.ok(fs.existsSync(path.join(drive, 'STOS', 'STOS', 'SPRIT101.BIN')));
    assert.equal(messages.length, 1);
    // second time: nothing copied (a file changed on the drive stays changed)
    fs.writeFileSync(path.join(drive, 'STOS', 'STOS', 'SPRIT101.BIN'), 'changed');
    build.prepareDrive(drive, stos, m => messages.push(m));
    assert.equal(messages.length, 1);
    assert.equal(fs.readFileSync(path.join(drive, 'STOS', 'STOS', 'SPRIT101.BIN'), 'utf8'), 'changed');
    // an older project's drive with STOS already in it works without the setting
    build.prepareDrive(drive, '');
});

test('prepareDrive: clear errors without STOS', () => {
    const dir = tempDir();
    assert.throws(() => build.prepareDrive(path.join(dir, 'hd'), ''), /choose your STOS folder/);
    assert.throws(() => build.prepareDrive(path.join(dir, 'hd'), dir), /No STOS found in the STOS folder/);
});

test('stosFolderFor: the folder with BASIC2xx.TOS, or a STOS folder inside the picked one', () => {
    const dir = tempDir();
    const stos = fakeStos(path.join(dir, 'drive', 'STOS'), 'basic206.tos');
    assert.equal(build.stosFolderFor(stos), stos);
    assert.equal(build.stosFolderFor(path.join(dir, 'drive')), stos);
    assert.throws(() => build.stosFolderFor(dir), /No STOS found/);
});

test('driveFile: an Atari path on the drive, case does not matter', () => {
    const dir = tempDir();
    fakeStos(path.join(dir, 'STOS'));
    assert.equal(build.driveFile(dir, 'C:\\STOS\\BASIC208.TOS'), path.join(dir, 'STOS', 'BASIC208.TOS'));
    assert.equal(build.driveFile(dir, 'c:\\stos\\basic208.tos'), path.join(dir, 'STOS', 'BASIC208.TOS'));
    assert.equal(build.driveFile(dir, 'C:\\STOS\\BASIC206.TOS'), undefined);
});

test('prepareRun: the autoRun program must be on the drive', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'stos'));
    fs.writeFileSync(path.join(dir, 'stos', 'main.asc'), '10 END\n');
    fs.writeFileSync(path.join(dir, 'tos.img'), 'x');
    const stos = fakeStos(path.join(dir, 'my-stos'), 'BASIC206.TOS');
    const s = { ...build.DEFAULT_SETTINGS, tosImage: path.join(dir, 'tos.img'), stosFolder: stos };
    assert.throws(() => build.prepareRun(dir, s), /BASIC208\.TOS is not on the emulated drive/);
    assert.ok(build.prepareRun(dir, { ...s, autoRun: 'C:\\STOS\\BASIC206.TOS' }));
});

test('machineArgs: machine, memory and resolution settings become Hatari options', () => {
    const d = build.DEFAULT_SETTINGS;
    assert.deepEqual(build.machineArgs(d), ['--machine', 'ste', '--memsize', '1024', '--monitor', 'rgb', '--tos-res', 'low']);
    assert.deepEqual(build.machineArgs({ ...d, machine: 'st', memory: 512, resolution: 'medium' }),
        ['--machine', 'st', '--memsize', '512', '--monitor', 'rgb', '--tos-res', 'med']);
    // high resolution needs the monochrome monitor
    assert.deepEqual(build.machineArgs({ ...d, machine: 'megaste', memory: 4096, resolution: 'high' }),
        ['--machine', 'megaste', '--memsize', '4096', '--monitor', 'mono', '--tos-res', 'high']);
    // values typed by hand in settings.json are checked
    assert.throws(() => build.machineArgs({ ...d, machine: 'falcon' }), /"stosStudio\.machine" is "falcon"/);
    assert.throws(() => build.machineArgs({ ...d, memory: 3000 }), /"stosStudio\.memory" is 3000/);
    assert.throws(() => build.machineArgs({ ...d, resolution: 'med' }), /"stosStudio\.resolution" is "med"/);
});

test('inProject: output and drive must stay inside the project folder', () => {
    const root = tempDir();
    assert.equal(build.inProject(root, 'stos/main.asc', 'outputFile'), path.join(root, 'stos', 'main.asc'));
    assert.equal(build.inProject(root, './hatari/../hatari/hd', 'hardDrive'), path.join(root, 'hatari', 'hd'));
    for (const bad of ['../outside.asc', '/etc/passwd', '..', '.', 'a/../../b']) {
        assert.throws(() => build.inProject(root, bad, 'outputFile'), /"stosStudio\.outputFile" must be inside the project folder/, bad);
    }
});

test('buildProject and prepareRun refuse an output file or drive outside the project', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'main.stos'), 'END\n');
    const outside = path.join(tempDir(), 'x.asc');
    assert.throws(() => build.buildProject(dir, { ...build.DEFAULT_SETTINGS, outputFile: outside }, () => { }, () => ({ lines: [], sourceMap: [] })),
        /must be inside the project folder/);
    assert.equal(fs.existsSync(outside), false);
    assert.throws(() => build.prepareRun(dir, { ...build.DEFAULT_SETTINGS, hardDrive: tempDir(), tosImage: 'x' }, 'darwin'),
        /"stosStudio\.hardDrive" must be inside the project folder/);
});

test('copyAssets writes the names in capitals, sub-folders too, and replaces a lower-case old copy', () => {
    const dir = tempDir();
    const drive = path.join(dir, 'hd');
    fs.mkdirSync(path.join(dir, 'assets', 'pics'), { recursive: true });
    fs.mkdirSync(drive);
    fs.writeFileSync(path.join(dir, 'assets', 'ship.mbk'), 'new');
    fs.writeFileSync(path.join(dir, 'assets', 'pics', 'bg.neo'), 'x');
    fs.writeFileSync(path.join(dir, 'assets', '.DS_Store'), 'x');
    fs.writeFileSync(path.join(drive, 'ship.mbk'), 'old');
    assert.equal(build.copyAssets(dir, drive, 'assets'), 2);
    assert.deepEqual(fs.readdirSync(drive).sort(), ['PICS', 'SHIP.MBK']);
    assert.equal(fs.readFileSync(path.join(drive, 'SHIP.MBK'), 'utf8'), 'new');
    assert.deepEqual(fs.readdirSync(path.join(drive, 'PICS')), ['BG.NEO']);
});
