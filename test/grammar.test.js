// Tests for the highlighting grammar (syntaxes/stos.tmLanguage.json, made by scripts/build-grammar.js).
// They tokenize lines with vscode-textmate and vscode-oniguruma, the same engine VS Code uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const { grammarText, OUT, DB } = require('../scripts/build-grammar');

const COMMANDS = JSON.parse(fs.readFileSync(DB, 'utf8')).commands;

/** Load the grammar once, with the regex engine VS Code uses. */
const grammarPromise = (async () => {
    const wasm = fs.readFileSync(path.join(path.dirname(require.resolve('vscode-oniguruma')), 'onig.wasm'));
    await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: p => new oniguruma.OnigScanner(p),
            createOnigString: s => new oniguruma.OnigString(s),
        }),
        loadGrammar: async () => vsctm.parseRawGrammar(fs.readFileSync(OUT, 'utf8'), OUT),
    });
    return registry.loadGrammar('source.stos');
})();

/** The tokens of one line: [{ text, scopes }], scopes without the base "source.stos". */
async function tokens(line) {
    const grammar = await grammarPromise;
    return grammar.tokenizeLine(line, vsctm.INITIAL).tokens.map(t => ({
        text: line.slice(t.startIndex, t.endIndex),
        scopes: t.scopes.filter(s => s !== 'source.stos'),
    }));
}

/** The scopes of the token that is exactly `text` (the first one), or undefined if there is none. */
async function scopesOf(line, text) {
    return (await tokens(line)).find(t => t.text === text)?.scopes;
}

test('grammar: the file is up to date with the database (run "npm run grammar" if not)', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), grammarText(COMMANDS));
});

test('grammar: every database command is highlighted as one token', async () => {
    const notHighlighted = [];
    for (const c of COMMANDS) {
        const word = /^[a-z]/.test(c.name);
        // word names are tried in upper case, at the start of a line; symbols between two variables
        const text = word ? c.name.toUpperCase() : c.name;
        const line = word ? `${text} 1` : `A${text}B`;
        const scopes = await scopesOf(line, text);
        if (!scopes || scopes.length === 0) { notHighlighted.push(c.name); }
    }
    assert.deepEqual(notHighlighted, []);
});

test('grammar: commands get the expected kind of scope', async () => {
    assert.deepEqual(await scopesOf('goto 100', 'goto'), ['keyword.control.stos']);
    assert.deepEqual(await scopesOf('sprite 1,10,10,1', 'sprite'), ['keyword.other.stos']);
    assert.deepEqual(await scopesOf('A=sin(X)', 'sin'), ['support.function.stos']);
    assert.deepEqual(await scopesOf('timer=0', 'timer'), ['variable.language.stos']);
    assert.deepEqual(await scopesOf('print pi', 'pi'), ['constant.language.stos']);
    assert.deepEqual(await scopesOf('if A and B then 10', 'and'), ['keyword.operator.word.stos']);
    assert.deepEqual(await scopesOf('if A<=B then 10', '<='), ['keyword.operator.stos']);
    assert.deepEqual(await scopesOf('A$=left$(B$,2)', 'left$'), ['support.function.stos']);
});

test('grammar: two-word names, and the longest name wins', async () => {
    assert.ok(await scopesOf('move   x 1,"(1,2,0)"', 'move   x'));
    assert.deepEqual(await scopesOf('physic=default physic', 'default physic'), ['support.function.stos']);
    assert.deepEqual(await scopesOf('reserve as datascreen 5', 'reserve as datascreen'), ['keyword.other.stos']);
    assert.deepEqual(await scopesOf('on menu goto 100', 'on menu'), ['keyword.other.stos']);
    assert.deepEqual(await scopesOf('on error goto 100', 'on error'), ['keyword.control.stos']);
    assert.deepEqual(await scopesOf('on X goto 100,200', 'on'), ['keyword.control.stos']);
});

test('grammar: no highlighting inside longer words, variables or strings', async () => {
    assert.equal(await scopesOf('printer=1', 'print'), undefined);
    assert.deepEqual(await scopesOf('printer=1', 'printer'), []);
    assert.deepEqual(await scopesOf('SCORE=1', 'SCORE'), []);
    const inString = (await tokens('print "goto sprite"')).find(t => t.text.includes('goto'));
    assert.deepEqual(inString.scopes, ['string.quoted.double.stos']);
});

test('grammar: strings, numbers, comments', async () => {
    assert.deepEqual(await scopesOf('print "hello" : A=1', '"hello"'), ['string.quoted.double.stos']);
    assert.deepEqual(await scopesOf('colour 1,$7F0', '$7F0'), ['constant.numeric.hex.stos']);
    assert.deepEqual(await scopesOf('A=%1010', '%1010'), ['constant.numeric.binary.stos']);
    assert.deepEqual(await scopesOf('A#=3.25e-2', '3.25e-2'), ['constant.numeric.decimal.stos']);
    assert.equal(await scopesOf('A1=2', '1'), undefined);                 // digit inside a variable name
    assert.deepEqual(await scopesOf('A$="x" : rem goto here', ' goto here'), ['comment.line.rem.stos']);
    assert.deepEqual(await scopesOf('rem', 'rem'), ['comment.line.rem.stos', 'keyword.other.rem.stos']);
    assert.deepEqual(await scopesOf('remains=1', 'remains'), []);
    assert.deepEqual(await scopesOf("  ' goto note", "' goto note"), ['comment.line.source.stos']);
    assert.deepEqual(await scopesOf('// print 1', '// print 1'), ['comment.line.source.stos']);
    assert.deepEqual(await scopesOf("@x ' note", '@x '), ['entity.name.function.label.stos']);
    assert.deepEqual(await scopesOf("@x ' note", "' note"), ['comment.line.source.stos']);
});

test('grammar: line numbers, labels and directives', async () => {
    assert.deepEqual(await scopesOf('10 print 1', '10'), ['constant.numeric.line-number.stos']);
    assert.deepEqual(await scopesOf('@loop print X', '@loop'), ['entity.name.function.label.stos']);
    assert.deepEqual(await scopesOf('goto @loop', '@loop'), ['entity.name.label.stos']);
    assert.deepEqual(await scopesOf('goto @αρχή_2', '@αρχή_2'), ['entity.name.label.stos']);   // same names as the converter
    assert.deepEqual(await scopesOf('#include "sprites.stos"', '#include'), ['keyword.control.directive.stos']);
    assert.deepEqual(await scopesOf('#include "sprites.stos"', '"sprites.stos"'), ['string.quoted.double.stos']);
    assert.deepEqual(await scopesOf('#lineinc 5', '5'), ['constant.numeric.decimal.stos']);
});

test('snippets and language configuration are valid JSON', () => {
    const root = path.join(__dirname, '..');
    const snippets = JSON.parse(fs.readFileSync(path.join(root, 'snippets/stos.json'), 'utf8'));
    for (const [name, s] of Object.entries(snippets)) {
        assert.ok(s.prefix && Array.isArray(s.body) && s.description, name);
    }
    const config = JSON.parse(fs.readFileSync(path.join(root, 'language-configuration.json'), 'utf8'));
    const inc = new RegExp(config.indentationRules.increaseIndentPattern);
    assert.ok(inc.test('for I=1 to 10'));
    assert.ok(!inc.test('for I=1 to 10 : print I : next I'));   // a loop on one line does not indent
    assert.ok(new RegExp(config.indentationRules.decreaseIndentPattern).test('  next I'));
});
