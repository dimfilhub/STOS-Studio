// Tests for the parameter-count check (src/paramcheck.ts), with the real command database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { countsOfSyntax, countValues, buildParamRules, checkParams } = require('../out/paramcheck');
const { loadCommands } = require('../out/commanddb');
const { convert } = require('../out/converter');

const commands = loadCommands(path.join(__dirname, '..', 'data', 'stos-commands.json'));
const rules = buildParamRules(commands);

function check(...texts) {
    const lines = texts.map((text, i) => ({ text, pos: { file: 'f.stos', line: i + 1 }, offset: 0 }));
    return checkParams(lines, rules).map(p => `${p.line}:${p.message}`);
}

test('countsOfSyntax: plain lines give counts, anything fancier gives nothing', () => {
    assert.deepEqual(countsOfSyntax('sprite', 'SPRITE n,x,y,p'), { min: 4, max: 4 });
    assert.deepEqual(countsOfSyntax('play', 'PLAY [voice,]pitch,duration'), { min: 2, max: 3 });
    assert.deepEqual(countsOfSyntax('plot', 'PLOT x,y [,index]'), { min: 2, max: 3 });
    assert.deepEqual(countsOfSyntax('windopen', 'WINDOPEN n,x1,y1,w,h[,border[,set]]'), { min: 5, max: 7 });
    assert.deepEqual(countsOfSyntax('auto', 'AUTO [start][,inc]'), { min: 0, max: 2 });
    assert.deepEqual(countsOfSyntax('home', 'HOME'), { min: 0, max: 0 });
    for (const [name, line] of [['box', 'BOX x1,y1 TO x2,y2'], ['hexa', 'HEXA ON/OFF'], ['print', 'PRINT list of variables'],
        ['read', 'READ list of variables'], ['trap', 'TRAP n[,parameters]'], ['dir', 'DIR/W [path$]'], ['rol', 'ROL[.B/.W/.L] n,var'],
        ['polyline', 'POLYLINE x1,y1 TO x2,y2 ...'], ['sort', 'SORT A$(0)']]) {
        assert.equal(countsOfSyntax(name, line), undefined, line);
    }
});

test('countValues: commas inside brackets and strings do not count', () => {
    assert.equal(countValues(''), 0);
    assert.equal(countValues(' 5 '), 1);
    assert.equal(countValues('1,2,3'), 3);
    assert.equal(countValues('f(1,2),"a,b",c'), 3);
});

test('buildParamRules: a command with one odd syntax line is not checked at all', () => {
    const names = rules.map(r => r.words.join(' '));
    for (const n of ['sprite', 'locate', 'screen swap', 'wait vbl']) { assert.ok(names.includes(n), n); }
    for (const n of ['cls', 'box', 'print', 'data', 'rem', 'trap', 'next', 'for', 'dir']) { assert.ok(!names.includes(n), n); }
});

test('checkParams: the right number of values is fine', () => {
    assert.deepEqual(check('sprite 1,100,100,1', 'locate 5,5', 'plot 1,2 : plot 1,2,3', 'home', 'play 1,2,3'), []);
    assert.deepEqual(check('sprite f(1,2),x,y,p', 'centre "a,b,c"', 'wait vbl', 'wait 50'), []);
    assert.deepEqual(check('if a then locate 1,2 else locate 3,4'), []);
});

test('checkParams: too few and too many values are reported with the syntax', () => {
    assert.deepEqual(check('sprite 1,100'), ['1:SPRITE takes 4 values, found 2 (SPRITE n,x,y,p)']);
    assert.deepEqual(check('locate 1,2,3'), ['1:LOCATE takes 2 values, found 3 (LOCATE x,y)']);
    assert.deepEqual(check('home 5'), ['1:HOME takes no values, found 1 (HOME)']);
    assert.deepEqual(check('plot 1'), ['1:PLOT takes 2 or 3 values, found 1 (PLOT x,y [,index])']);
    assert.deepEqual(check('windopen 1,2'), ['1:WINDOPEN takes 5 to 7 values, found 2 (WINDOPEN n,x1,y1,w,h[,border[,set]])']);
    assert.deepEqual(check('load'), ['1:LOAD takes 1 or 2 values, found 0 (LOAD file$ or LOAD file$,bank)']);
    assert.deepEqual(check('cls : screen swap 1'), ['1:SCREEN SWAP takes no values, found 1 (SCREEN SWAP)']);
});

test('checkParams: only the statement itself is counted', () => {
    assert.deepEqual(check('locate 1,2 : print 1,2,3', 'if x then sprite 1,2,3,4 : locate 1'),
        ['2:LOCATE takes 2 values, found 1 (LOCATE x,y)']);
});

test('checkParams: the squiggle covers the statement', () => {
    const [p] = checkParams([{ text: 'cls : sprite 1,2 : cls', pos: { file: 'f.stos', line: 1 }, offset: 3 }], rules);
    assert.deepEqual([p.column, p.length], [3 + 6 + 1, 'sprite 1,2'.length]);
});

test('convert: counts are checked only when rules are given; the sample program is clean', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-par-'));
    const file = path.join(dir, 'main.stos');
    fs.writeFileSync(file, 'sprite 1,100\n');
    assert.equal(convert(file, () => { }).warnings.length, 0);
    assert.equal(convert(file, () => { }, { paramRules: rules }).warnings.length, 1);
    const sample = path.join(__dirname, '..', 'samples', 'spaceship.stos');
    assert.deepEqual(convert(sample, () => { }, { paramRules: rules }).warnings, []);
});
