// Tests for the command database loader and the hover lookup (src/commanddb.ts).
// Most tests use a small test database; the last ones check the real data/stos-commands.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../out/commanddb');

const REAL = path.join(__dirname, '../data/stos-commands.json');
const CARD = require('./reference-card.json');   // every command on the STOS reference card
const SAMPLE = [
    { name: 'print', kind: 'keyword', category: 'Text', source: 'STOS', doc: ['**print** _list_', '', 'Prints a list.'] },
    { name: 'sin', kind: 'function', category: 'Maths', source: 'STOS' },
    { name: 'left$', kind: 'function', category: 'Strings', source: 'STOS' },
    { name: 'move x', kind: 'keyword', category: 'Sprites', source: 'STOS' },
    { name: 'move', kind: 'keyword', category: 'Sprites', source: 'STOS' },
    { name: 'def fn', kind: 'keyword', category: 'Maths', source: 'STOS' },
    { name: 'fn', kind: 'function', category: 'Maths', source: 'STOS' },
    { name: 'data', kind: 'keyword', category: 'Data', source: 'STOS', doc: ['DATA statement'] },
    { name: 'data', kind: 'class', category: 'Banks', source: 'STOS', doc: ['bank flag'] },
];

/** Write a database file with these commands, return its path. */
function writeDb(commands) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stos-studio-')), 'db.json');
    fs.writeFileSync(f, JSON.stringify({ commands }));
    return f;
}

test('commanddb: the real database file loads', () => {
    assert.ok(Array.isArray(db.loadCommands(REAL)));
});

test('commanddb: broken entries are reported clearly', () => {
    const ok = SAMPLE[0];
    assert.equal(db.loadCommands(writeDb([ok])).length, 1);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, kind: 'verb' }])), /command 1 \(print\): "kind" must be/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, name: '' }])), /missing "name"/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, doc: 'not a list' }])), /"doc" must be a list/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, syntax: [] }])), /"syntax" must be a non-empty list/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, syntax: 'PRINT' }])), /"syntax" must be/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, manual: '201' }])), /"manual" must be a page number/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, manual: 0 }])), /"manual" must be a page number/);
    assert.throws(() => db.loadCommands(writeDb([{ ...ok, unclear: true }])), /"unclear" must be a string/);
    assert.equal(db.loadCommands(writeDb([{ ...ok, syntax: ['PRINT list'], manual: 201, unclear: 'check' }])).length, 1);
});

test('commanddb: help has a heading from its source', () => {
    assert.equal(db.helpMarkdown(SAMPLE[0]), '_**STOS: The Game Creator**_\n\n**print** _list_\n\nPrints a list.');
    assert.equal(db.helpMarkdown({ ...SAMPLE[0], source: 'GBP Extension' }).split('\n')[0], '_**GBP Extension**_');
    assert.equal(db.helpMarkdown(SAMPLE[1]), undefined);
});

test('commanddb: help shows syntax, text and manual page', () => {
    const c = { ...SAMPLE[0], syntax: ['PRINT list', '? list'], doc: ['Prints a list.'], manual: 201 };
    assert.equal(db.helpMarkdown(c),
        '_**STOS: The Game Creator**_\n\n```\nPRINT list\n? list\n```\n\nPrints a list.\n\n_Manual page 201._');
    // syntax alone is already help
    assert.match(db.helpMarkdown({ ...SAMPLE[1], syntax: ['=SIN(angle)'] }), /```\n=SIN\(angle\)\n```$/);
});

test('hover: finds the command under the cursor', () => {
    const finder = new db.CommandFinder(db.loadCommands(writeDb(SAMPLE)));
    const at = (line, word, offset = 0) => {
        const m = finder.at(line, line.indexOf(word) + offset);
        return m && line.slice(m.start, m.end);
    };
    assert.equal(at('PRINT "hello"', 'PRINT'), 'PRINT');
    assert.equal(at('X#=sin(pi/2)', 'sin'), 'sin');
    assert.equal(at('A$=left$(B$,2)', 'left$'), 'left$');
    assert.equal(at('move x 1,"L"', 'x'), 'move x');
    assert.equal(at('move   x 1', 'move'), 'move   x');
    assert.equal(at('def fn A(X)=X*2', 'fn'), 'def fn');
    assert.equal(at('print "sin of"', 'sin'), undefined);
    assert.equal(at('goto @print', 'print'), undefined);
    assert.equal(at('printer=1', 'printer'), undefined);
    assert.equal(at('PRINT 1', 'PRINT', 5), undefined);
});

test('hover: several entries with one name, and no help yet', () => {
    const finder = new db.CommandFinder(db.loadCommands(writeDb(SAMPLE)));
    const data = finder.at('data 1,2,3', 0);
    assert.equal(data.entries.length, 2);
    assert.equal(db.hoverMarkdown(data.entries).split('\n\n---\n\n').length, 2);
    assert.match(db.hoverMarkdown([SAMPLE[1]]), /\*\*sin\*\* \(Maths\)[\s\S]*No help text yet/);
});

test('blankStrings keeps columns', () => {
    assert.equal(db.blankStrings('print "a b" : x'), 'print "   " : x');
    assert.equal(db.blankStrings('print "open'), 'print "    ');
});

// ---- the real database ----

const REAL_COMMANDS = db.loadCommands(REAL);

test('real database: every command of the reference card is there', () => {
    const names = new Set(REAL_COMMANDS.map(c => c.name));
    const missing = Object.values(CARD.groups).flat().filter(n => !names.has(n));
    assert.deepEqual(missing, []);
});

test('real database: no name is listed twice with the same kind', () => {
    const seen = new Set();
    const twice = [];
    for (const c of REAL_COMMANDS) {
        const key = `${c.name} (${c.kind})`;
        if (seen.has(key)) { twice.push(key); }
        seen.add(key);
    }
    assert.deepEqual(twice, []);
});

test('real database: every entry has syntax, help and a manual page', () => {
    const incomplete = REAL_COMMANDS
        .filter(c => !(c.syntax?.length && c.doc?.length && c.manual && c.source === 'STOS'))
        .map(c => c.name);
    assert.deepEqual(incomplete, []);
    // names are lower case, as the hover lookup and completion expect
    assert.deepEqual(REAL_COMMANDS.filter(c => c.name !== c.name.toLowerCase()).map(c => c.name), []);
});

test('real database: hover finds two-word names and skips symbols', () => {
    const finder = new db.CommandFinder(REAL_COMMANDS);
    const at = (line, word) => { const m = finder.at(line, line.indexOf(word)); return m && line.slice(m.start, m.end); };
    assert.equal(at('move x 1,"(1,4,0)"', 'move'), 'move x');
    assert.equal(at('X=x sprite(1)', 'sprite'), 'x sprite');
    assert.equal(at('reserve as screen 5', 'screen'), 'reserve as screen');
    assert.equal(at('on error goto 1000', 'error'), 'on error');
    assert.equal(at('A=B+C', '+'), undefined);
    // "colour" is both an instruction and a function: hover shows both
    assert.equal(finder.at('colour 1,$700', 0).entries.length, 2);
});
