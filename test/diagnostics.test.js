// Test for the red squiggles (src/diagnostics.ts) with a fake "vscode" module that records what it is given.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const shown = new Map();                       // file -> diagnostics given to the collection
const fakeDocs = [];                            // "open" editor documents: { uri: { fsPath }, getText() }
const fakeVscode = {
    languages: { createDiagnosticCollection: () => ({
        clear: () => shown.clear(), set: (uri, d) => shown.set(uri.fsPath, d), dispose() { } }) },
    workspace: { getConfiguration: () => ({ get: () => undefined }), textDocuments: fakeDocs },
    Range: class { constructor(l1, c1, l2, c2) { Object.assign(this, { l1, c1, l2, c2 }); } },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Uri: { file: fsPath => ({ fsPath }) },
};
const realLoad = Module._load;
Module._load = (request, ...rest) => request === 'vscode' ? fakeVscode : realLoad(request, ...rest);
const { refreshDiagnostics } = require('../out/diagnostics');
Module._load = realLoad;

test('refreshDiagnostics: squiggles in the right file and place, cleared when fixed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-diag-'));
    fs.writeFileSync(path.join(dir, 'main.stos'), 'cls\n#include "lib.stos"\n');
    fs.writeFileSync(path.join(dir, 'lib.stos'), '  goto @boss\n');
    refreshDiagnostics({ uri: { fsPath: dir } });
    const found = shown.get(path.join(dir, 'lib.stos'));
    assert.equal(found.length, 1);
    assert.equal(found[0].message, 'unknown label @boss');
    assert.deepEqual([found[0].range.l1, found[0].range.c1, found[0].range.c2], [0, 7, 12]);
    assert.equal(found[0].source, 'STOS Studio');
    assert.equal(shown.has(path.join(dir, 'main.stos')), false);
    // fix it: the squiggle goes away
    fs.writeFileSync(path.join(dir, 'lib.stos'), '@boss print 1\n');
    refreshDiagnostics({ uri: { fsPath: dir } });
    assert.equal(shown.size, 0);
    // a folder without main.stos is not a STOS project: nothing shown, no error
    refreshDiagnostics({ uri: { fsPath: fs.mkdtempSync(path.join(os.tmpdir(), 'stos-diag-')) } });
    assert.equal(shown.size, 0);
});

test('refreshDiagnostics: a loop without its closer is a warning, not an error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-diag-'));
    fs.writeFileSync(path.join(dir, 'main.stos'), 'for i=1 to 3\nprint i\n');
    refreshDiagnostics({ uri: { fsPath: dir } });
    const found = shown.get(path.join(dir, 'main.stos'));
    assert.equal(found.length, 1);
    assert.equal(found[0].message, 'for without next');
    assert.equal(found[0].severity, 1);
});

test('refreshDiagnostics: reads the unsaved text of open documents', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-diag-'));
    const file = path.join(dir, 'main.stos');
    fs.writeFileSync(file, 'print 1\n');                                    // saved version is fine
    fakeDocs.push({ uri: { fsPath: file }, getText: () => 'while a\nprint 1\n' });   // typed, not saved
    try {
        refreshDiagnostics({ uri: { fsPath: dir } });
        assert.equal(shown.get(file)[0].message, 'while without wend');
    } finally { fakeDocs.length = 0; }
});
