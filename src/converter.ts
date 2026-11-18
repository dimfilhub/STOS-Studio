/**
 * The converter: a .stos source file (no line numbers, @labels, #include) -> the numbered lines
 * of a STOS .asc file. The rules are in docs/converter.md; the comments below give their numbers.
 *
 * It works in two passes:
 *  1. read the main file and its #includes, drop blank lines, give each code line its number and
 *     note which line every @label marks;
 *  2. replace each @label that is used by its line number and check every character.
 * Problems are collected (up to 20) and reported together at the end; nothing is written then.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Log, StosError } from './errors';
import { atariByte } from './charset';
import { checkStructure } from './structure';
import { checkCommands } from './commandcheck';
import { checkParams, ParamRule } from './paramcheck';

/** Where an output line came from: file and line (1-based). */
export interface SourcePos { file: string; line: number; }

/** The converted program: the .asc lines (without line endings) and, for each one, its source. */
/** Gives the text of a source file; the editor passes the unsaved text of open files. */
export type ReadText = (file: string) => string;

/**
 * Options of the converter. `readText`: where file texts come from (the editor passes unsaved text).
 * `knownCommands`: the words a statement may start with; without it, unknown commands are not checked.
 * `paramRules`: the parameter counts to check (see paramcheck.ts); without them, counts are not checked.
 */
export interface ConvertOptions { readText?: ReadText; knownCommands?: Set<string>; paramRules?: ParamRule[]; }

/** `warnings`: things that are probably wrong but do not stop Build (loops that do not match, unknown commands, parameter counts: see structure.ts, commandcheck.ts, paramcheck.ts). */
export interface ConvertResult { lines: string[]; sourceMap: SourcePos[]; warnings?: Problem[]; }

/** One problem in the source. column is 1-based, if known; length is how many characters it covers. */
export interface Problem { file: string; line: number; column?: number; length?: number; message: string; }

const MAX_PROBLEMS = 20;
const FIRST_LINE = 10;           // rule 2.1
const DEFAULT_STEP = 10;
const MAX_LINE_NUMBER = 65535;   // rule 2.3

/** One or more problems in the source; the message lists them all, one per line. */
export class ConvertError extends StosError {
    constructor(public readonly problems: Problem[], baseDir: string) {
        super(problems.map(p => formatProblem(p, baseDir)).join('\n'));
        this.name = 'ConvertError';
    }
}

/** "levels.stos:12:7: unknown label @boss" (file relative to baseDir). */
export function formatProblem(p: Problem, baseDir: string): string {
    const where = `${path.relative(baseDir, p.file) || p.file}:${p.line}` + (p.column ? `:${p.column}` : '');
    return `${where}: ${p.message}`;
}

// a label name: letters (any language), digits and _ (rule 3.1)
const NAME_CHAR = /[\p{L}\p{N}_]/u;
const LABEL_AT_START = /^@([\p{L}\p{N}_]+)\s*(.*)$/u;
// characters after which "@" or "rem" are part of a longer word, not a label or a comment
const WORD_CHAR = /[\p{L}\p{N}_$#]/u;

/** A line of code after pass 1. `offset`: where its text starts in the source line (for error columns). */
interface CodeLine { number: number; text: string; pos: SourcePos; offset: number; }

/** A label definition: the line it marks, and where it was written. */
interface Label { number: number; pos: SourcePos; }

/** Convert a .stos file. Throws ConvertError (problems in the source) or StosError (cannot read the file). */
export function convert(sourceFile: string, log: Log, options: ConvertOptions = {}): ConvertResult {
    const readText: ReadText = options.readText ?? (file => fs.readFileSync(file, 'utf8'));
    const main = path.resolve(sourceFile);
    const baseDir = path.dirname(main);
    const problems: Problem[] = [];
    const problem = (p: Problem) => { if (problems.length < MAX_PROBLEMS) { problems.push(p); } };

    // ---- pass 1: read the files, number the code lines, collect the labels ----
    const code: CodeLine[] = [];
    const labels = new Map<string, Label>();       // lower-case name -> definition (rule 3.1)
    let pending: { name: string; pos: SourcePos }[] = [];   // labels waiting for their code line (3.3)
    let number = FIRST_LINE;
    let step = DEFAULT_STEP;
    let tooHigh = false;

    /** Read one file; `chain` is the list of files that included it (to find include loops). */
    const readFile = (file: string, chain: string[]) => {
        log(chain.length === 0 ? `Reading ${path.relative(baseDir, file) || file}` : `Including ${path.relative(baseDir, file)}`);
        let text: string;
        try {
            text = readText(file);
        } catch (e) {
            throw new StosError(`Cannot read ${file}: ${(e as Error).message}`);
        }
        text = text.replace(/^﻿/, '');                                    // rule 1.1
        text.split(/\r?\n/).forEach((raw, index) => {
            const pos = { file, line: index + 1 };
            const expanded = raw.replace(/\t/g, ' ');                              // rule 1.2
            let line = expanded.trimStart();
            let offset = expanded.length - line.length;
            line = line.trimEnd();
            if (line === '') { return; }                                         // rule 1.3

            if (line.startsWith('#')) { directive(line, pos, chain.concat(file)); return; }

            // labels at the start of the line (rule 3.2, 3.3); "@a @b print" defines both
            let m: RegExpExecArray | null;
            while ((m = LABEL_AT_START.exec(line)) !== null) {
                pending.push({ name: m[1], pos });
                offset += line.length - m[2].length;
                line = m[2];
            }
            if (line === '') { return; }                                         // label alone: marks the next line
            if (/^('|\/\/)/.test(line)) { return; }                             // rule 1.6: source-only comment

            if (/^\d/.test(line)) {                                              // rule 1.5
                problem({ ...pos, column: offset + 1, length: /^\d+/.exec(line)![0].length,
                    message: 'line numbers are added by the converter; use @labels instead' });
            }
            for (const p of pending) {
                const key = p.name.toLowerCase();
                const earlier = labels.get(key);
                if (earlier) {                                                   // rule 3.6
                    problem({ ...p.pos, message: `label @${p.name} is already defined in ` +
                        `${path.relative(baseDir, earlier.pos.file) || earlier.pos.file}:${earlier.pos.line}` });
                } else {
                    labels.set(key, { number, pos: p.pos });
                }
            }
            pending = [];
            if (number > MAX_LINE_NUMBER && !tooHigh) {                          // rule 2.3
                tooHigh = true;
                problem({ ...pos, message: `line number ${number} is higher than ${MAX_LINE_NUMBER}; use a smaller #lineinc` });
            }
            code.push({ number, text: line, pos, offset });
            number += step;                                                      // rule 2.1, 2.2
        });
    };

    /** A line starting with "#" (rule 4). */
    const directive = (line: string, pos: SourcePos, chain: string[]) => {
        const word = /^#\s*([A-Za-z]*)/.exec(line)![1].toLowerCase();
        const args = line.replace(/^#\s*[A-Za-z]*/, '').trim();
        if (word === 'include') {
            const m = /^"([^"]+)"$/.exec(args);
            if (!m) { problem({ ...pos, message: '#include needs a file name in quotes: #include "file.stos"' }); return; }
            const target = path.resolve(path.dirname(pos.file), m[1]);              // rule 4.1
            if (chain.includes(target)) {                                         // rule 4.2: include loop
                const names = chain.slice(chain.indexOf(target)).concat(target).map(f => path.relative(baseDir, f) || f);
                problem({ ...pos, message: `#include loop: ${names.join(' -> ')}` });
                return;
            }
            if (!fs.existsSync(target)) {
                problem({ ...pos, message: `#include: file not found: ${target}` });
                return;
            }
            readFile(target, chain);
        } else if (word === 'lineinc') {
            const n = Number(args);
            if (!/^\d+$/.test(args) || n < 1 || n > 1000) {
                problem({ ...pos, message: '#lineinc needs a step from 1 to 1000: #lineinc 10' });
            } else {
                step = n;                                                        // rule 2.2
            }
        } else {
            problem({ ...pos, message: `unknown directive #${word} (known: #include, #lineinc)` });  // rule 4.4
        }
    };

    readFile(main, []);
    for (const p of pending) {                                                   // rule 3.3
        problem({ ...p.pos, message: `label @${p.name} has no line of code after it` });
    }

    // ---- pass 2: replace the labels that are used, check the characters ----
    const lines: string[] = [];
    const sourceMap: SourcePos[] = [];
    for (const c of code) {
        // label names may use any letters; the characters are checked with the names blanked out
        checkCharacters(replaceLabels(c.text, name => '@' + '_'.repeat(name.length)), c, problem);
        const text = replaceLabels(c.text, (name, column) => {
            const label = labels.get(name.toLowerCase());
            if (!label) { problem({ ...c.pos, column: c.offset + column + 1, length: name.length + 1, message: `unknown label @${name}` }); }
            return label === undefined ? undefined : String(label.number);
        });
        lines.push(`${c.number} ${text}`);                                       // rule 2.4
        sourceMap.push(c.pos);
    }

    if (problems.length > 0) { throw new ConvertError(problems, baseDir); }
    log(`${lines.length} lines, ${labels.size} labels`);
    const warnings = [...checkStructure(code), ...(options.knownCommands ? checkCommands(code, options.knownCommands) : []),
        ...(options.paramRules ? checkParams(code, options.paramRules) : [])];
    for (const w of warnings) { log(`Warning: ${formatProblem(w, baseDir)}`); }
    return { lines, sourceMap, warnings };
}

/**
 * Replace every used @label in one line of code (rules 3.4, 3.5). `resolve` gets the name and the
 * column (0-based) of the "@" and returns the replacement (the line number), or undefined to keep the text.
 * Not touched: text inside "strings", the rest of the line after REM, and "@" just after a word character.
 */
export function replaceLabels(text: string, resolve: (name: string, column: number) => string | undefined): string {
    let out = '';
    let inString = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        const before = i > 0 ? text[i - 1] : ' ';
        if (ch === '"') { inString = !inString; out += ch; i++; continue; }
        if (inString) { out += ch; i++; continue; }
        // REM: everything after it is a comment
        if (/^rem(?![\p{L}\p{N}_$#])/iu.test(text.slice(i)) && !WORD_CHAR.test(before)) {
            return out + text.slice(i);
        }
        if (ch === '@' && !WORD_CHAR.test(before) && i + 1 < text.length && NAME_CHAR.test(text[i + 1])) {
            let end = i + 1;
            while (end < text.length && NAME_CHAR.test(text[end])) { end++; }    // the whole name (rule 3.4)
            const name = text.slice(i + 1, end);
            out += resolve(name, i) ?? text.slice(i, end);
            i = end;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

/** Every character must exist in the Atari ST character set (rules 5.2, 5.3). */
function checkCharacters(text: string, c: CodeLine, problem: (p: Problem) => void): void {
    let column = c.offset;
    for (const ch of text) {
        column++;
        if (atariByte(ch) === undefined || ch === '\r' || ch === '\n') {
            const code = 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
            problem({ ...c.pos, column, length: ch.length, message: `character "${ch}" (${code}) does not exist in the Atari ST character set` });
        }
    }
}

/**
 * All problems of a project, for showing them in the editor: an empty list if the source is fine.
 * Nothing is written. A file that cannot be read is reported as a problem on line 1 of the main file.
 */
export function findProblems(sourceFile: string): Problem[] {
    return checkProject(sourceFile).errors;
}

/** Errors (Build would fail) and warnings (Build works) of a project, from one run of the converter. */
export function checkProject(sourceFile: string, options?: ConvertOptions): { errors: Problem[]; warnings: Problem[] } {
    try {
        const result = convert(sourceFile, () => { }, options);
        return { errors: [], warnings: result.warnings ?? [] };
    } catch (e) {
        if (e instanceof ConvertError) { return { errors: e.problems, warnings: [] }; }
        if (e instanceof StosError) { return { errors: [{ file: path.resolve(sourceFile), line: 1, message: e.message }], warnings: [] }; }
        throw e;
    }
}

/**
 * The part of a source line a problem points at, as 0-based columns [start, end): the problem's own
 * characters when the converter knows them, else from its column to the end of the line, else the whole
 * line without its indentation.
 */
export function problemSpan(p: Problem, lineText: string): { start: number; end: number } {
    const trimmedEnd = lineText.trimEnd().length;
    const firstChar = lineText.length - lineText.trimStart().length;
    if (p.column === undefined) { return { start: Math.min(firstChar, trimmedEnd), end: trimmedEnd }; }
    const start = Math.min(p.column - 1, lineText.length);
    const end = p.length !== undefined ? start + p.length : Math.max(trimmedEnd, start);
    return { start, end: Math.max(end, start + 1) };
}

/** The .stos position of an .asc line number (e.g. one STOS reported in an error), or undefined. */
export function sourceOfLine(result: ConvertResult, ascLineNumber: number): SourcePos | undefined {
    const index = result.lines.findIndex(l => l.startsWith(`${ascLineNumber} `));
    return index < 0 ? undefined : result.sourceMap[index];
}
