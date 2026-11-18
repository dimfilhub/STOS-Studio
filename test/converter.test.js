// Tests for the converter (src/converter.ts), one or more per rule of docs/converter.md.
// Each test writes small .stos files into a fresh temporary folder and converts them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { convert, replaceLabels, sourceOfLine, ConvertError } = require('../out/converter');
const charset = require('../out/charset');

/** Write files ({ 'main.stos': 'text', 'lib/x.stos': '...' }) into a new folder; returns the folder. */
function project(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-conv-'));
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

/** Convert main.stos of these files; returns the .asc lines. */
function asc(files) {
    return convert(path.join(project(files), 'main.stos'), () => { }).lines;
}

/** Convert and expect a ConvertError; returns its message lines. */
function problems(files) {
    try {
        convert(path.join(project(files), 'main.stos'), () => { });
    } catch (e) {
        assert.ok(e instanceof ConvertError, `expected a ConvertError, got ${e}`);
        return e.message.split('\n');
    }
    assert.fail('expected the conversion to fail');
}

test('1.1-1.4 input: CR+LF or LF, BOM, indentation, tabs, blank lines dropped, rem kept', () => {
    assert.deepEqual(asc({ 'main.stos': '﻿rem Title\r\n\r\n   print 1\r\n\tif A then\tprint 2  \n\n' }),
        ['10 rem Title', '20 print 1', '30 if A then print 2']);
});

test("1.6 lines starting with ' or // are dropped; a label before them marks the next code line", () => {
    assert.deepEqual(asc({ 'main.stos': "' notes\n  // more notes\ncls\n@x ' the loop\nprint 1 : rem kept\n'goto @x\ngoto @x" }),
        ['10 cls', '20 print 1 : rem kept', '30 goto 20']);
    // only whole lines: later in a line it goes to STOS unchanged
    assert.deepEqual(asc({ 'main.stos': "print \"it's\" // x" }), ["10 print \"it's\" // x"]);
});

test('1.5 a line starting with a digit is an error', () => {
    assert.deepEqual(problems({ 'main.stos': 'print 1\n  100 print 2\n' }),
        ['main.stos:2:3: line numbers are added by the converter; use @labels instead']);
});

test('2.1 line numbers start at 10, step 10', () => {
    assert.deepEqual(asc({ 'main.stos': 'cls\nprint 1\nend' }), ['10 cls', '20 print 1', '30 end']);
});

test('2.2 #lineinc changes the step for the following lines', () => {
    assert.deepEqual(asc({ 'main.stos': 'cls\n#lineinc 5\nprint 1\nprint 2\n#lineinc 100\nend' }),
        ['10 cls', '20 print 1', '25 print 2', '30 end']);
    assert.deepEqual(problems({ 'main.stos': '#lineinc 0\n#lineinc ten\nend' }), [
        'main.stos:1: #lineinc needs a step from 1 to 1000: #lineinc 10',
        'main.stos:2: #lineinc needs a step from 1 to 1000: #lineinc 10',
    ]);
});

test('2.3 a line number above 65535 is an error (reported once)', () => {
    const lines = Array.from({ length: 70 }, (_, i) => `print ${i}`).join('\n');
    const p = problems({ 'main.stos': '#lineinc 1000\n' + lines });
    assert.equal(p.length, 1);
    assert.match(p[0], /^main\.stos:68: line number 66010 is higher than 65535/);
});

test('3.2 a label at the start of a line marks that line; the text after it is kept', () => {
    assert.deepEqual(asc({ 'main.stos': 'cls\n@loop print X : goto @loop' }), ['10 cls', '20 print X : goto 20']);
});

test('3.3 a label alone marks the next code line; several labels may mark one line', () => {
    assert.deepEqual(asc({ 'main.stos': 'goto @b\n@a\n\n@b\n   print 1\ngoto @a' }),
        ['10 goto 20', '20 print 1', '30 goto 20']);
    assert.deepEqual(asc({ 'main.stos': '@a @b print 1\ngosub @a : gosub @b' }), ['10 print 1', '20 gosub 10 : gosub 10']);
    assert.deepEqual(problems({ 'main.stos': 'print 1\n@end\n' }),
        ['main.stos:2: label @end has no line of code after it']);
});

test('3.1 label names: letters, digits, _, any language, case does not matter', () => {
    assert.deepEqual(asc({ 'main.stos': '@Main_Loop2 cls\n@αρχή print 1\ngoto @main_loop2 : goto @ΑΡΧΉ' }),
        ['10 cls', '20 print 1', '30 goto 10 : goto 20']);
});

test('3.4 labels are replaced as whole names, wherever a line number goes', () => {
    const src = [
        '@a print "A"', '@ab print "AB"', '@abc print "ABC"',
        'goto @ab', 'gosub @abc', 'if X then @a else @abc',
        'on N goto @a,@ab,@abc', 'restore @ab', 'on error goto @a',
    ].join('\n');
    assert.deepEqual(asc({ 'main.stos': src }).slice(3), [
        '40 goto 20', '50 gosub 30', '60 if X then 10 else 30',
        '70 on N goto 10,20,30', '80 restore 20', '90 on error goto 10',
    ]);
});

test('3.5 not replaced: in strings, after rem, after a word character', () => {
    assert.deepEqual(asc({ 'main.stos': '@x cls\nprint "mail @x" : goto @x : rem goto @x\nA$="@x"+B$ : rem @nowhere\nprint A@x' }),
        ['10 cls', '20 print "mail @x" : goto 10 : rem goto @x', '30 A$="@x"+B$ : rem @nowhere', '40 print A@x']);
    // "rem" inside a longer word is not a comment
    assert.deepEqual(asc({ 'main.stos': '@x cls\nREMAIN=1 : goto @x' }), ['10 cls', '20 REMAIN=1 : goto 10']);
});

test('3.6 a duplicate label and an unknown label are errors, all reported together', () => {
    assert.deepEqual(problems({ 'main.stos': '@a cls\n@A print 1\ngoto @boss : gosub @b' }), [
        'main.stos:2: label @A is already defined in main.stos:1',
        'main.stos:3:6: unknown label @boss',
        'main.stos:3:20: unknown label @b',
    ]);
});

test('4.1 #include inserts a file, relative to the including file, also nested', () => {
    const files = {
        'main.stos': 'cls\n#include "lib/sound.stos"\nend',
        'lib/sound.stos': 'boom\n#include "more.stos"',
        'lib/more.stos': 'shoot',
    };
    assert.deepEqual(asc(files), ['10 cls', '20 boom', '30 shoot', '40 end']);
});

test('4.2 #include errors: missing file, loop, no quotes', () => {
    const dir = project({ 'main.stos': '#include "a.stos"\n#include "gone.stos"\n#include b.stos\nend', 'a.stos': '#include "main.stos"\nprint 1' });
    try { convert(path.join(dir, 'main.stos'), () => { }); assert.fail('should fail'); } catch (e) {
        assert.deepEqual(e.message.split('\n'), [
            'a.stos:1: #include loop: main.stos -> a.stos -> main.stos',
            `main.stos:2: #include: file not found: ${path.join(dir, 'gone.stos')}`,
            'main.stos:3: #include needs a file name in quotes: #include "file.stos"',
        ]);
    }
});

test('4.3 labels are shared between files', () => {
    const files = {
        'main.stos': 'gosub @beep\nend\n#include "sub.stos"',
        'sub.stos': '@beep bell : goto @back\n@back return',
    };
    assert.deepEqual(asc(files), ['10 gosub 30', '20 end', '30 bell : goto 40', '40 return']);
});

test('4.4 an unknown directive is an error', () => {
    assert.deepEqual(problems({ 'main.stos': '#define X 1\nend' }),
        ['main.stos:1: unknown directive #define (known: #include, #lineinc)']);
});

test('5.1 the character set table has 128 entries and é is 0x82', () => {
    assert.equal(charset.encodeAtari('é')[0], 0x82);
    assert.equal(charset.encodeAtari('Ç')[0], 0x80);
    assert.equal(charset.encodeAtari('ß')[0], 0x9E);
    assert.equal(charset.encodeAtari('¯')[0], 0xFF);
    const all = Buffer.from(Array.from({ length: 128 }, (_, i) => 0x80 + i));
    assert.deepEqual(charset.encodeAtari(charset.decodeAtari(all)), all);
    assert.equal(new Set(charset.decodeAtari(all)).size, 128);
});

test('5.2-5.3 characters outside the Atari ST set are errors with their column', () => {
    assert.deepEqual(asc({ 'main.stos': 'print "café £5"' }), ['10 print "café £5"']);
    assert.deepEqual(problems({ 'main.stos': '  print "5€"\nprint "a\u0007"' }), [
        'main.stos:1:11: character "€" (U+20AC) does not exist in the Atari ST character set',
        'main.stos:2:9: character "\u0007" (U+0007) does not exist in the Atari ST character set',
    ]);
});

test('6.2 the source map gives file and line of every .asc line', () => {
    const dir = project({ 'main.stos': 'rem main\n\n#include "b.stos"\nend', 'b.stos': '\nprint 1' });
    const result = convert(path.join(dir, 'main.stos'), () => { });
    assert.deepEqual(result.sourceMap.map(p => `${path.basename(p.file)}:${p.line}`), ['main.stos:1', 'b.stos:2', 'main.stos:4']);
    assert.deepEqual(sourceOfLine(result, 20), { file: path.join(dir, 'b.stos'), line: 2 });
    assert.equal(sourceOfLine(result, 25), undefined);
});

test('7.2 at most 20 problems are reported', () => {
    const src = Array.from({ length: 30 }, (_, i) => `goto @missing${i}`).join('\n');
    assert.equal(problems({ 'main.stos': src }).length, 20);
});

test('replaceLabels on its own', () => {
    assert.equal(replaceLabels('goto @a : print "@a"', () => '99'), 'goto 99 : print "@a"');
    assert.equal(replaceLabels('x@a @ a @', () => '1'), 'x@a @ a @');
});

test('findProblems: an empty list for good source, the problems (with length) for bad source', () => {
    const { findProblems } = require('../out/converter');
    const good = project({ 'main.stos': '@a print 1\ngoto @a' });
    assert.deepEqual(findProblems(path.join(good, 'main.stos')), []);
    const bad = project({ 'main.stos': '  goto @boss\nprint "5€"\n100 end' });
    const found = findProblems(path.join(bad, 'main.stos'));
    assert.deepEqual(found.map(p => [p.line, p.column, p.length]), [[3, 1, 3], [1, 8, 5], [2, 9, 1]]);
    // (the line-number problem comes first: it is found while reading, the others afterwards)
    // a main file that does not exist is one problem on line 1, not a crash
    const missing = findProblems(path.join(bad, 'nope.stos'));
    assert.equal(missing.length, 1);
    assert.match(missing[0].message, /Cannot read/);
});

test('problemSpan: the problem\'s own characters, else to the end of the line, else the whole line', () => {
    const { problemSpan } = require('../out/converter');
    const line = '  goto @boss : print 1  ';
    assert.deepEqual(problemSpan({ line: 1, column: 8, length: 5, message: '' }, line), { start: 7, end: 12 });
    assert.deepEqual(problemSpan({ line: 1, column: 8, message: '' }, line), { start: 7, end: 22 });
    assert.deepEqual(problemSpan({ line: 1, message: '' }, line), { start: 2, end: 22 });
    assert.deepEqual(problemSpan({ line: 1, message: '' }, ''), { start: 0, end: 0 });
    assert.deepEqual(problemSpan({ line: 1, column: 5, length: 1, message: '' }, 'abc'), { start: 3, end: 4 });
});
