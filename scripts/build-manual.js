// Builds the user manual PDF from docs/manual/manual.html.
// Usage: node scripts/build-manual.js [output.pdf]     (default: ~/Desktop/STOS Studio Manual.pdf)
//
// Steps: the code blocks (<pre class="stos">) are coloured with the extension's own grammar
// (so they look like the editor), the spaceship sample is put in, ⟦marked text⟧ gets a red wavy
// underline (like an error squiggle), and Google Chrome prints the page to PDF. Needs Chrome
// (set CHROME=/path/to/chrome for another place) and `npm install` (for vscode-textmate).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const vsctm = require('vscode-textmate'), onig = require('vscode-oniguruma');

const OUT = path.resolve(process.argv[2] || path.join(os.homedir(), 'Desktop', 'STOS Studio Manual.pdf'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// first matching scope part -> CSS class (see the <style> of manual.html)
const CLASS = [['comment', 'cmt'], ['string', 'str'], ['constant.numeric.line', 'lineno'], ['constant.numeric', 'num'],
  ['constant.language', 'const'], ['entity.name.function.label', 'labeldef'], ['entity.name.label', 'label'],
  ['keyword.control.directive', 'dir'], ['keyword.control', 'k-control'], ['keyword.operator.word', 'opw'],
  ['keyword.operator', 'op'], ['keyword.other', 'k-other'], ['support.function', 'fn'], ['variable.language', 'var']];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma').replace(/main\.js$/, 'onig.wasm'));
  await onig.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({ createOnigScanner: p => new onig.OnigScanner(p), createOnigString: s => new onig.OnigString(s) }),
    loadGrammar: async () => vsctm.parseRawGrammar(fs.readFileSync(path.join(ROOT, 'syntaxes/stos.tmLanguage.json'), 'utf8'), 'g.json'),
  });
  const grammar = await registry.loadGrammar('source.stos');

  let html = fs.readFileSync(path.join(ROOT, 'docs/manual/manual.html'), 'utf8')
    .replace('@@SPACESHIP@@', () => fs.readFileSync(path.join(ROOT, 'samples/spaceship.stos'), 'utf8').trimEnd());
  html = html.replace(/<pre class="(stos(?: long)?)">([\s\S]*?)<\/pre>/g, (_, cls, code) => {
    let state = vsctm.INITIAL;
    const lines = code.split('\n').map(line => {
      const r = grammar.tokenizeLine(line, state); state = r.ruleStack;
      return r.tokens.map(t => {
        const text = esc(line.slice(t.startIndex, t.endIndex));
        const scope = t.scopes.slice(1).join(' ');
        const c = CLASS.find(([s]) => scope.includes(s));
        return c ? `<span class="${c[1]}">${text}</span>` : text;
      }).join('');
    });
    return `<pre class="${cls}">${lines.join('\n').replace(/⟦/g, '<span class="squiggle">').replace(/⟧/g, '</span>')}</pre>`;
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stos-manual-'));
  fs.writeFileSync(path.join(dir, 'manual.html'), html);
  fs.copyFileSync(path.join(ROOT, 'images/icon.png'), path.join(dir, 'icon.png'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${OUT}`,
    'file://' + path.join(dir, 'manual.html')], { stdio: 'ignore' });
  fs.rmSync(dir, { recursive: true });
  console.log('wrote', OUT);
})();
