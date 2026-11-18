/**
 * Structure check: do the loops of a program open and close properly?
 *   FOR ... NEXT      WHILE ... WEND      REPEAT ... UNTIL
 * STOS only finds a missing NEXT or WEND when the program runs on the Atari; here it is shown while
 * you type. The results are warnings, not errors: Build still works, because a program can do odd but
 * valid things (for example leave a loop with GOTO).
 * No VS Code in this file, so it can be tested with plain Node.
 */
import type { Problem, SourcePos } from './converter';

/** A line of code as the converter has it: its text, where it came from, and where the text starts in that line. */
export interface StructLine { text: string; pos: SourcePos; offset: number; }

/** Loop keywords that open a loop, and the keyword that closes each. */
const CLOSER: Record<string, string> = { for: 'next', while: 'wend', repeat: 'until' };
const OPENER: Record<string, string> = { next: 'for', wend: 'while', until: 'repeat' };

// characters of a word (a name, a keyword, a number): the same as the converter uses for labels, plus $ and #
const WORD_CHAR = /[\p{L}\p{N}_$#]/u;

/** A word at the start of a statement; `end` is where that statement ends (at ":", THEN, ELSE or the end of the line). */
export interface Keyword { word: string; index: number; end: number; }

/** The loop keywords of one line of code (see statementStarts). */
export function loopKeywords(text: string): Keyword[] {
    return statementStarts(text).filter(k => k.word in CLOSER || k.word in OPENER);
}

/**
 * The first word of every statement of one line of code, in lower case, with its 0-based position in the
 * text. A statement starts at the start of the line, after ":" and after THEN or ELSE. Text inside
 * "strings" is skipped, and so is everything after REM.
 */
export function statementStarts(text: string): Keyword[] {
    const found: Keyword[] = [];
    let inString = false;
    let statementStart = true;
    let open: Keyword | undefined;                    // the statement whose end is not known yet
    const close = (at: number) => { if (open) { open.end = at; open = undefined; } };
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') { inString = !inString; statementStart = false; i++; continue; }
        if (inString) { i++; continue; }
        if (ch === ':') { close(i); statementStart = true; i++; continue; }
        if (WORD_CHAR.test(ch)) {
            let end = i;
            while (end < text.length && WORD_CHAR.test(text[end])) { end++; }
            const word = text.slice(i, end).toLowerCase();
            if (statementStart && word === 'rem') { break; }                 // the rest is a comment
            if (word === 'then' || word === 'else') { close(i); }
            if (statementStart) { open = { word, index: i, end: text.length }; found.push(open); }
            statementStart = word === 'then' || word === 'else';
            i = end;
            continue;
        }
        if (ch !== ' ') { statementStart = false; }
        i++;
    }
    return found;
}

/** Check all lines of a program (in order, included files already inserted) and list what does not match. */
export function checkStructure(lines: StructLine[]): Problem[] {
    const problems: Problem[] = [];
    const open: { word: string; line: StructLine; index: number }[] = [];
    const where = (l: StructLine) => `${l.pos.line}`;
    const report = (line: StructLine, index: number, word: string, message: string) =>
        problems.push({ ...line.pos, column: line.offset + index + 1, length: word.length, message });

    for (const line of lines) {
        for (const { word, index } of loopKeywords(line.text)) {
            if (word in CLOSER) { open.push({ word, line, index }); continue; }
            const wanted = OPENER[word];
            const top = open[open.length - 1];
            if (top && top.word === wanted) { open.pop(); continue; }
            const deeper = open.map(o => o.word).lastIndexOf(wanted);
            if (deeper < 0) {
                report(line, index, word, `${word} without ${wanted}`);
                continue;
            }
            // loops are not nested: what is still open above the matching one never got its closer
            while (open.length - 1 > deeper) {
                const lost = open.pop()!;
                report(line, index, word, `${word} comes before the ${CLOSER[lost.word]} of the ${lost.word} in line ${where(lost.line)}; loops must be nested`);
            }
            open.pop();
        }
    }
    for (const o of open) {
        report(o.line, o.index, o.word, `${o.word} without ${CLOSER[o.word]}`);
    }
    return problems;
}
