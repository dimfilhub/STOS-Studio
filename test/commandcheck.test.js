// Tests for the unknown-command check (src/commandcheck.ts) with the real command database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkCommands, closestWord, editDistance, isAssignment } = require('../out/commandcheck');
const { loadCommands, statementWords } = require('../out/commanddb');
const { convert } = require('../out/converter');

const commands = loadCommands(path.join(__dirname, '..', 'data', 'stos-commands.json'));
const known = statementWords(commands);

function check(...texts) {
    const lines = texts.map((text, i) => ({ text, pos: { file: 'f.stos', line: i + 1 }, offset: 0 }));
    return checkCommands(lines, known).map(p => `${p.line}:${p.message}`);
}

test('editDistance and closestWord: a typo finds its command, a stranger finds nothing', () => {
    assert.equal(editDistance('scren', 'screen'), 1);
    assert.equal(closestWord('scren', known), 'screen');
    assert.equal(closestWord('prnt', known), 'print');
    assert.equal(closestWord('zzzzzz', known), undefined);
});

test('isAssignment: variables and array elements, not commands', () => {
    assert.ok(isAssignment('a=1', 1));
    assert.ok(isAssignment('a$ = "x"', 2));
    assert.ok(isAssignment('t(1,2) = 5', 1));
    assert.ok(isAssignment('t(f(1),")") = 5', 1));
    assert.ok(!isAssignment('foo 5', 3));
    assert.ok(!isAssignment('foo(1) 5', 3));
});

test('checkCommands: known commands, assignments and line numbers are fine', () => {
    assert.deepEqual(check('print "hi" : cls', 'screen copy 1 to 2', 'sprite 1,100,100,1'), []);
    assert.deepEqual(check('x=1 : a$="b" : t(3)=4 : mid$(a$,1,1)="x"'), []);
    assert.deepEqual(check('if x=1 then print 1 else cls', 'if y then 100', 'print#1,a'), []);
    assert.deepEqual(check('for i=1 to 3 : next i', 'goto @a', 'rem anything at all', "print \"scren\""), []);
    assert.deepEqual(check('PRINT 1 : Screen Copy 1 to 2'), []);
});

test('checkCommands: an unknown word is reported with a guess', () => {
    assert.deepEqual(check('scren copy 1 to 2'), ['1:unknown command "scren"; did you mean "screen"?']);
    assert.deepEqual(check('print 1 : prnt 2'), ['1:unknown command "prnt"; did you mean "print"?']);
    assert.match(check('qqqqqq 1')[0], /unknown command "qqqqqq" \(from an extension\? add it to "stosStudio.knownCommands"\)/);
});

test('checkCommands: extra commands from the setting are accepted', () => {
    const extra = statementWords(commands, ['Wave', 'my cmd']);
    const lines = [{ text: 'wave 1 : my cmd 2', pos: { file: 'f.stos', line: 1 }, offset: 0 }];
    assert.deepEqual(checkCommands(lines, extra), []);
});

test('checkCommands: the squiggle covers the word', () => {
    const [p] = checkCommands([{ text: 'cls : prnt 1', pos: { file: 'f.stos', line: 3 }, offset: 2 }], known);
    assert.deepEqual([p.line, p.column, p.length], [3, 9, 4]);
});

test('convert: unknown commands are warnings only when a known-command list is given', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-cmd-'));
    fs.writeFileSync(path.join(dir, 'main.stos'), 'scren copy 1 to 2\n');
    const file = path.join(dir, 'main.stos');
    assert.equal(convert(file, () => { }).warnings.length, 0);
    const checked = convert(file, () => { }, { knownCommands: known });
    assert.equal(checked.lines.length, 1);
    assert.equal(checked.warnings.length, 1);
});

test('the sample programs raise no unknown-command warnings', () => {
    const samples = path.join(__dirname, '..', 'samples');
    const stack = [samples];
    while (stack.length) {
        const d = stack.pop();
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { stack.push(p); continue; }
            if (!p.endsWith('.stos')) { continue; }
            const w = convert(p, () => { }, { knownCommands: known }).warnings.map(x => `${x.line}:${x.message}`);
            assert.deepEqual(w, [], p);
        }
    }
});
