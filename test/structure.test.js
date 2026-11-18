// Tests for the loop structure check (src/structure.ts) and its use by the converter and the squiggles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkStructure, loopKeywords } = require('../out/structure');
const { convert, checkProject } = require('../out/converter');

/** Check a program given as lines of code; returns "line:message" for each warning. */
function check(...texts) {
    const lines = texts.map((text, i) => ({ text, pos: { file: 'f.stos', line: i + 1 }, offset: 0 }));
    return checkStructure(lines).map(p => `${p.line}:${p.message}`);
}

test('loopKeywords: only at the start of a statement, not in strings, names or after rem', () => {
    const words = t => loopKeywords(t).map(k => k.word);
    assert.deepEqual(words('for i=1 to 3 : print i : next i'), ['for', 'next']);
    assert.deepEqual(words('FOR I=1 TO 3:NEXT'), ['for', 'next']);
    assert.deepEqual(words('print "for next while":wend'), ['wend']);
    assert.deepEqual(words('rem for i=1 to 3'), []);
    assert.deepEqual(words('print 1 : rem next'), []);
    assert.deepEqual(words('if a=1 then repeat : x=x+1 else until a'), ['repeat', 'until']);
    assert.deepEqual(words('goto @next'), []);
    assert.deepEqual(words('format$="x" : forward=1'), []);
    assert.deepEqual(loopKeywords('  x=1 : next').map(k => k.index), [8]);
});

test('checkStructure: matching loops, nested and on one line, give no warnings', () => {
    assert.deepEqual(check('for i=1 to 3', 'while a', 'repeat', 'until b', 'wend', 'next i'), []);
    assert.deepEqual(check('for i=1 to 3 : print i : next i', 'if a then while b : wend'), []);
    assert.deepEqual(check('print 1'), []);
});

test('checkStructure: a loop that is never closed, at the line where it opens', () => {
    assert.deepEqual(check('for i=1 to 3', 'print i'), ['1:for without next']);
    assert.deepEqual(check('while a', 'repeat', 'until b'), ['1:while without wend']);
});

test('checkStructure: a closer with nothing to close', () => {
    assert.deepEqual(check('print 1', 'next i'), ['2:next without for']);
    assert.deepEqual(check('repeat', 'wend', 'until a'), ['2:wend without while']);
});

test('checkStructure: loops that cross are reported once, at the closer', () => {
    assert.deepEqual(check('for i=1 to 3', 'while a', 'next i', 'wend'),
        ['3:next comes before the wend of the while in line 2; loops must be nested', '4:wend without while']);
});

test('checkStructure: the squiggle covers the keyword', () => {
    const [p] = checkStructure([{ text: 'x=1 : next', pos: { file: 'f.stos', line: 4 }, offset: 2 }]);
    assert.deepEqual([p.line, p.column, p.length], [4, 9, 4]);
});

test('convert: warnings are returned and logged, and do not stop the build', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-struct-'));
    fs.writeFileSync(path.join(dir, 'main.stos'), 'for i=1 to 3\n  print i\n');
    const log = [];
    const result = convert(path.join(dir, 'main.stos'), m => log.push(m));
    assert.equal(result.lines.length, 2);
    assert.equal(result.warnings.length, 1);
    assert.ok(log.some(m => /^Warning: main\.stos:1:1: for without next$/.test(m)), log.join('|'));
    const checked = checkProject(path.join(dir, 'main.stos'));
    assert.equal(checked.errors.length, 0);
    assert.equal(checked.warnings.length, 1);
});

test('checkProject: converter errors win, no warnings then', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-struct-'));
    fs.writeFileSync(path.join(dir, 'main.stos'), 'for i=1 to 3\ngoto @nowhere\n');
    const { errors, warnings } = checkProject(path.join(dir, 'main.stos'));
    assert.equal(errors.length, 1);
    assert.equal(warnings.length, 0);
});
