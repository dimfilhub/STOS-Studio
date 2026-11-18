// For each command in a database file: which manual pages have a heading "NAME (description)".
// Usage: node scripts/find-entries.js <path/to/stos-commands.json> <folder with page-NNN.txt>
// Prints a summary and writes entries.json (name -> ["page:line", ...]) in the current folder.
// The heading test is loose; variants like "ENVEL e (Set envelope)" or "OPEN #" are not found.
const fs = require('fs'), path = require('path');
const db = require(process.argv[2]);
const dir = process.argv[3];
const pages = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()
  .map(f => ({ n: +f.match(/\d+/)[0], lines: fs.readFileSync(path.join(dir, f), 'utf8').split('\n') }));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const result = {};
for (const name of [...new Set(db.commands.map(c => c.name))]) {
  // "=NAME(...)" or "NAME (..." at the start of a line; OCR may add spaces or drop the =
  const re = new RegExp('^=?\\s*' + name.split(' ').map(esc).join('\\s*') + '\\s*\\(', 'i');
  const hits = [];
  for (const p of pages) p.lines.forEach((l, i) => { if (re.test(l.trim()) && /\([A-Za-z ,'-]{4,}\)?\s*$/.test(l)) hits.push(p.n + ':' + (i + 1)); });
  result[name] = hits;
}
const found = Object.entries(result).filter(([, h]) => h.length);
const missing = Object.entries(result).filter(([, h]) => !h.length).map(([n]) => n);
const noHelp = new Set(db.commands.filter(c => !c.doc).map(c => c.name));
console.log('found', found.length, 'of', Object.keys(result).length);
console.log('missing (' + missing.length + '):', missing.join(', '));
console.log('of the commands without help, found:', found.filter(([n]) => noHelp.has(n)).length, 'of', noHelp.size);
fs.writeFileSync('entries.json', JSON.stringify(result, null, 1));
