/**
 * The STOS command database: data/stos-commands.json.
 * One place that lists every command with its help text, used by completion and hover help
 * (and later the grammar and the linter). This file does not use VS Code, so it can be tested
 * with plain Node.
 */
import * as fs from 'fs';

/** How VS Code shows the command in the completion list (the icon). */
export type CommandKind = 'keyword' | 'function' | 'property' | 'operator' | 'constructor' | 'class';

export interface StosCommand {
    name: string;          // as typed in STOS, lower case ("move x", "left$")
    kind: CommandKind;
    category: string;      // group, e.g. "Sprites"
    source: string;        // "STOS" or the extension it comes from, e.g. "GBP Extension"
    doc?: string[];        // help text in Markdown, one item per line (missing = no help yet)
    syntax?: string[];     // the forms of the command, as on the reference card ("SPRITE n,x,y,p")
    manual?: number;       // page of the STOS User Guide PDF where the command is described
    unclear?: string;      // a note for a reviewer: something the OCR left unclear, to check in the PDF
}

const KINDS: CommandKind[] = ['keyword', 'function', 'property', 'operator', 'constructor', 'class'];

/** True if v is a list of strings. */
function isStringList(v: unknown): boolean {
    return Array.isArray(v) && v.every(l => typeof l === 'string');
}

/** Read and check the database. Throws with a clear message if an entry is broken. */
export function loadCommands(file: string): StosCommand[] {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const commands: StosCommand[] = data.commands;
    if (!Array.isArray(commands)) { throw new Error(`${file}: "commands" must be a list`); }
    commands.forEach((c, i) => {
        const where = `${file}: command ${i + 1} (${c?.name ?? '?'})`;
        if (typeof c.name !== 'string' || c.name === '') { throw new Error(`${where}: missing "name"`); }
        if (!KINDS.includes(c.kind)) { throw new Error(`${where}: "kind" must be one of ${KINDS.join(', ')}`); }
        if (typeof c.category !== 'string' || typeof c.source !== 'string') { throw new Error(`${where}: missing "category" or "source"`); }
        if (c.doc !== undefined && !isStringList(c.doc)) {
            throw new Error(`${where}: "doc" must be a list of strings`);
        }
        // syntax and manual are optional here (an extension may have no manual), but must be right if given
        if (c.syntax !== undefined && !(isStringList(c.syntax) && c.syntax.length > 0)) {
            throw new Error(`${where}: "syntax" must be a non-empty list of strings`);
        }
        if (c.manual !== undefined && !(Number.isInteger(c.manual) && c.manual > 0)) {
            throw new Error(`${where}: "manual" must be a page number`);
        }
        if (c.unclear !== undefined && typeof c.unclear !== 'string') {
            throw new Error(`${where}: "unclear" must be a string`);
        }
    });
    return commands;
}

/**
 * The words a statement may start with: the first word of every command name (so "screen copy" allows
 * "screen"), THEN and ELSE, and the user's own extra commands (extension commands the database lacks).
 * Used by the unknown-command check.
 */
export function statementWords(commands: StosCommand[], extra: string[] = []): Set<string> {
    const words = new Set<string>(['then', 'else']);
    for (const name of [...commands.map(c => c.name), ...extra]) {
        const first = name.trim().toLowerCase().split(/\s+/)[0];
        if (first !== '' && isWordName(first)) { words.add(first); }
    }
    return words;
}

/** A command found in a line of code: all database entries with that name, and where it is. */
export interface CommandMatch {
    entries: StosCommand[];   // usually one; "data" has two (DATA statement and bank flag)
    start: number;            // column of the first character
    end: number;              // column after the last character
}

/**
 * Finds commands in lines of code. Matching ignores case, allows several spaces inside
 * two-word names ("move  x"), skips text inside "strings" and never matches part of a longer
 * word, a variable or a @label ("print" is not found in "printer" or "@print").
 * Operators written as symbols ("+", "<>") are not looked up.
 */
export class CommandFinder {
    private patterns: { entries: StosCommand[]; regex: RegExp }[] = [];

    constructor(commands: StosCommand[]) {
        const byName = new Map<string, StosCommand[]>();
        // only word names: hover over symbols like "=" or "+" would pop up on almost every line
        for (const c of commands.filter(c => isWordName(c.name))) {
            byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
        }
        // longest names first, so "def fn" wins over "fn" and "set zone" over "set"
        const names = [...byName.keys()].sort((a, b) => b.length - a.length);
        for (const name of names) {
            const words = name.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            this.patterns.push({
                entries: byName.get(name)!,
                regex: new RegExp(`(?<![\\w@$#])${words.join('\\s+')}(?![\\w$#])`, 'gi'),
            });
        }
    }

    /** The command under the given column (0 = first character), or undefined. */
    at(line: string, column: number): CommandMatch | undefined {
        const code = blankStrings(line);
        for (const { entries, regex } of this.patterns) {
            regex.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = regex.exec(code)) !== null) {
                const start = m.index, end = m.index + m[0].length;
                if (column >= start && column < end) { return { entries, start, end }; }
            }
        }
        return undefined;
    }
}

/** The line with everything inside "..." replaced by spaces (same length, so columns stay right). */
export function blankStrings(line: string): string {
    let inString = false;
    let out = '';
    for (const ch of line) {
        if (ch === '"') { inString = !inString; out += ch; }
        else { out += inString ? ' ' : ch; }
    }
    return out;
}

/** The help shown when the mouse is over a command: every entry with that name. */
export function hoverMarkdown(entries: StosCommand[]): string {
    return entries.map(c => helpMarkdown(c)
        ?? `${heading(c)}\n\n**${c.name}** (${c.category})\n\n_No help text yet._`)
        .join('\n\n---\n\n');
}

/**
 * The help text as Markdown: a heading saying where the command comes from, the syntax forms
 * in a code block, the help text, and the manual page. Undefined if there is neither syntax nor help.
 */
export function helpMarkdown(c: StosCommand): string | undefined {
    const hasDoc = c.doc !== undefined && c.doc.length > 0;
    const hasSyntax = c.syntax !== undefined && c.syntax.length > 0;
    if (!hasDoc && !hasSyntax) { return undefined; }
    const parts = [heading(c)];
    if (hasSyntax) { parts.push('```\n' + c.syntax!.join('\n') + '\n```'); }
    if (hasDoc) { parts.push(c.doc!.join('\n')); }
    if (c.manual) { parts.push(`_Manual page ${c.manual}._`); }
    return parts.join('\n\n');
}

/** "STOS: The Game Creator", or the name of the extension the command comes from, in bold italics. */
function heading(c: StosCommand): string {
    return `_**${c.source === 'STOS' ? 'STOS: The Game Creator' : c.source}**_`;
}

/** True for names typed as words ("print", "x mouse"); false for symbols such as "+" or "<>". */
export function isWordName(name: string): boolean {
    return /^[a-z]/i.test(name);
}
