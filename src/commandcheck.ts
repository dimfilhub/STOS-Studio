/**
 * Unknown-command check: a statement that starts with a word STOS Studio does not know, like "scren copy",
 * is reported with a guess of what was meant. Warnings only: the command list may lack commands of an
 * extension, which the user can add in the setting "stosStudio.knownCommands".
 * No VS Code in this file, so it can be tested with plain Node.
 */
import type { Problem } from './converter';
import { StructLine, statementStarts } from './structure';

/** The number of single-letter changes (insert, delete, change) that turn a into b. */
export function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row.push(Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
        }
        previous = row;
    }
    return previous[b.length];
}

/** The known word closest to `word`, if it is close enough to be a typing mistake. */
export function closestWord(word: string, known: Iterable<string>): string | undefined {
    const allowed = word.length >= 5 ? 2 : 1;
    let best: string | undefined;
    let bestDistance = allowed + 1;
    for (const k of known) {
        if (Math.abs(k.length - word.length) > allowed) { continue; }
        const d = editDistance(word, k);
        if (d < bestDistance || (d === bestDistance && best !== undefined && k < best)) { best = k; bestDistance = d; }
    }
    return best;
}

/** True if the text after a name is an assignment: "= ..." or "(...) = ..." (a variable or an array element). */
export function isAssignment(text: string, from: number): boolean {
    let i = from;
    while (text[i] === ' ') { i++; }
    if (text[i] === '(') {
        let depth = 0;
        let inString = false;
        for (; i < text.length; i++) {
            if (text[i] === '"') { inString = !inString; }
            else if (!inString && text[i] === '(') { depth++; }
            else if (!inString && text[i] === ')' && --depth === 0) { i++; break; }
        }
        while (text[i] === ' ') { i++; }
    }
    return text[i] === '=';
}

/** Check all lines of a program; `known` is the set of words a statement may start with (lower case). */
export function checkCommands(lines: StructLine[], known: Set<string>): Problem[] {
    const problems: Problem[] = [];
    for (const line of lines) {
        for (const { word, index } of statementStarts(line.text)) {
            if (/^\d/.test(word)) { continue; }                           // "then 100": a line number
            const letters = /^\p{L}+/u.exec(word)?.[0] ?? word;           // "print#1" starts with "print"
            if (known.has(word) || known.has(letters)) { continue; }
            if (isAssignment(line.text, index + word.length)) { continue; }   // a = 1, a(2) = 3
            const guess = closestWord(letters, known);
            problems.push({ ...line.pos, column: line.offset + index + 1, length: word.length,
                message: guess
                    ? `unknown command "${word}"; did you mean "${guess}"?`
                    : `unknown command "${word}" (from an extension? add it to "stosStudio.knownCommands")` });
        }
    }
    return problems;
}
