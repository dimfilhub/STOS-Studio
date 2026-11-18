/**
 * Parameter-count check: "sprite 1,100" is reported because SPRITE takes four values.
 * The allowed counts come from the `syntax` lines of the command database, but only for commands whose
 * every syntax line is plain: the command name followed by names separated by commas, with optional parts
 * in [brackets] ("PLAY [voice,]pitch,duration"). Anything fancier (TO, ON/OFF, lists, "...") is skipped,
 * because then the line does not say how many values are allowed. Warnings only.
 * No VS Code in this file, so it can be tested with plain Node.
 */
import type { Problem } from './converter';
import type { StosCommand } from './commanddb';
import { StructLine, statementStarts } from './structure';

/** How many values a form accepts: from `min` to `max`. */
export interface Count { min: number; max: number; }

/** A command that is checked: its name words, the counts of its forms and the syntax lines (for the message). */
export interface ParamRule { words: string[]; counts: Count[]; syntax: string[]; }

/**
 * Commands that real programs use with more values than their syntax line shows (the line is from the
 * reference card). Add a name here when a correct program gets a false warning.
 */
const NOT_CHECKED = new Set(['next', 'data', 'rem', 'trap']);

/** The counts of one syntax line, or undefined if the line is not plain (see above). */
export function countsOfSyntax(name: string, syntax: string): Count | undefined {
    const text = syntax.trim();
    if (!text.toLowerCase().startsWith(name.toLowerCase())) { return undefined; }
    const rest = text.slice(name.length);
    if (/\b(list|parameters)\b/.test(rest)) { return undefined; }                      // a list: any number of values
    if (rest !== '' && !/^\s/.test(rest) && rest[0] !== '[') { return undefined; }   // "DIR/W": not this command
    // every name (starting with a lower-case letter, like n, x1, file$) becomes "I"; what is left must be a
    // plain pattern of I , [ ]: no keywords, no "...", and no two names without a comma between them
    const shape = rest.replace(/[a-z][a-z0-9$#]*/g, 'I').replace(/\s+/g, '');
    if (!/^[I,[\]]*$/.test(shape) || /II/.test(shape)) { return undefined; }
    let depth = 0;
    let outside = 0;
    let inside = 0;
    for (const ch of shape) {
        if (ch === '[') { depth++; }
        else if (ch === ']') { if (--depth < 0) { return undefined; } }
        else if (ch === 'I') { if (depth === 0) { outside++; } else { inside++; } }
    }
    if (depth !== 0) { return undefined; }
    return { min: outside, max: outside + inside };
}

/** The rules for all commands of the database that can be checked, longest names first. */
export function buildParamRules(commands: StosCommand[]): ParamRule[] {
    const byName = new Map<string, StosCommand[]>();
    for (const c of commands.filter(c => c.kind === 'keyword')) {
        byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
    }
    const rules: ParamRule[] = [];
    for (const [name, entries] of byName) {
        if (NOT_CHECKED.has(name) || !/^[a-z]+( [a-z]+)*$/.test(name)) { continue; }
        const lines = entries.flatMap(e => e.syntax ?? []);
        const counts = lines.map(l => countsOfSyntax(name, l));
        if (lines.length === 0 || counts.some(c => c === undefined)) { continue; }   // some form is not plain
        rules.push({ words: name.split(' '), counts: counts as Count[], syntax: lines });
    }
    return rules.sort((a, b) => b.words.length - a.words.length);
}

/** The number of values in the text after a command: pieces between commas outside brackets and strings. */
export function countValues(args: string): number {
    if (args.trim() === '') { return 0; }
    let depth = 0;
    let inString = false;
    let count = 1;
    for (const ch of args) {
        if (ch === '"') { inString = !inString; }
        else if (inString) { continue; }
        else if (ch === '(') { depth++; }
        else if (ch === ')') { depth--; }
        else if (ch === ',' && depth === 0) { count++; }
    }
    return count;
}

/** Say how many values a rule allows: "no values", "4 values", "2 to 3 values", "0 or 1 values". */
function describe(counts: Count[]): string {
    const options = new Set<string>();
    for (const c of counts) { options.add(c.min === c.max ? String(c.min) : c.max === c.min + 1 ? `${c.min} or ${c.max}` : `${c.min} to ${c.max}`); }
    const text = [...options].join(' or ');
    return text === '0' ? 'no values' : `${text} ${text === '1' ? 'value' : 'values'}`;
}

/** Check all lines of a program against the rules. */
export function checkParams(lines: StructLine[], rules: ParamRule[]): Problem[] {
    const problems: Problem[] = [];
    for (const line of lines) {
        for (const { index, end } of statementStarts(line.text)) {
            const statement = line.text.slice(index, end);
            for (const rule of rules) {
                const m = new RegExp(`^${rule.words.join('\\s+')}(?![\\p{L}\\p{N}_$#])`, 'iu').exec(statement);
                if (!m) { continue; }
                const found = countValues(statement.slice(m[0].length));
                if (!rule.counts.some(c => found >= c.min && found <= c.max)) {
                    problems.push({ ...line.pos, column: line.offset + index + 1, length: statement.trimEnd().length,
                        message: `${rule.words.join(' ').toUpperCase()} takes ${describe(rule.counts)}, found ${found} (${rule.syntax.join(' or ')})` });
                }
                break;                                           // the longest matching name decides
            }
        }
    }
    return problems;
}
