// Tests for "New STOS project" (src/project.ts) and that its program converts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createProject, checkProjectName } = require('../out/project');
const { convert } = require('../out/converter');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'stos-project-'));

test('createProject writes main.stos, settings and .gitignore', () => {
    const root = createProject(tempDir(), 'Space Game');
    assert.equal(path.basename(root), 'Space Game');
    assert.deepEqual(fs.readdirSync(root).sort(), ['.gitignore', '.vscode', 'main.stos']);
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'));
    assert.equal(settings['stosStudio.sourceFile'], 'main.stos');
    assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\/hatari\/hd\/$/m);
});

test('the new program converts without problems', () => {
    const root = createProject(tempDir(), 'Hello');
    const { lines } = convert(path.join(root, 'main.stos'), () => { });
    assert.equal(lines[0], '10 mode 0 : cls : curs off : hide on');
    assert.ok(lines.includes('30 gosub 70'));        // @title is line 70
    assert.equal(lines.at(-1), '90 return');
});

test('createProject refuses bad names and a folder that is not empty', () => {
    const parent = tempDir();
    assert.equal(checkProjectName('My Game'), undefined);
    assert.match(checkProjectName(''), /enter a name/);
    assert.match(checkProjectName('a/b'), /cannot contain/);
    assert.match(checkProjectName('.hidden'), /dot/);
    fs.mkdirSync(path.join(parent, 'Taken'));
    fs.writeFileSync(path.join(parent, 'Taken', 'x'), '');
    assert.throws(() => createProject(parent, 'Taken'), /already exists and is not empty/);
    fs.mkdirSync(path.join(parent, 'Empty'));
    assert.ok(createProject(parent, 'Empty'));       // an empty folder is fine
});
