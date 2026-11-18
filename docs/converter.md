# Converter specification (`.stos` -> `.asc`)

STOS BASIC itself only understands numbered lines (`10 PRINT "HI"`), loaded from an `.asc` text file. In VS Code
we write `.stos` files without line numbers, with `@labels` and `#include`. The converter (`src/converter.ts`)
turns one into the other. The idea of this source format (`@labels`, `#include`, `#lineinc`) comes from Neil
Halliday's STOS extension; the rules below were specified anew and nothing is taken from his tool.
Each rule below has a test in `test/converter.test.js` (the test names start with the rule number).

## 1. Input
1.1 A `.stos` file is UTF-8 text (a byte-order mark is ignored). Lines may end in LF or CR+LF.
1.2 Leading and trailing spaces and tabs of a line are removed (indentation is only for reading). Tabs inside a
    line become spaces.
1.3 Blank lines are dropped; they get no line number.
1.4 `rem` lines are STOS comments and are kept (STOS lists them).
1.6 Lines starting with `'` or `//` are comments for the source only: they are dropped and get no line number
    (good for notes, or to switch off code). A label before them still marks the next code line. Only whole
    lines: a `'` or `//` later in a line is passed to STOS as it is.
1.5 A line must not start with a digit: STOS statements never do, so it is most likely an old line number.
    Error: *line numbers are added by the converter; use @labels*.

## 2. Line numbers
2.1 The first output line is number 10, then 20, 30, ... (step 10).
2.2 `#lineinc n` (on a line of its own) sets the step for the lines that follow, n from 1 to 1000.
2.3 The highest line number is 65535; a bigger one is an error.
2.4 The output is the number, one space, and the code: `120 print X`.

## 3. Labels
3.1 A label is `@` followed by letters, digits and `_` (Unicode letters allowed): `@main_loop`, `@level2`.
    Names are compared without regard to case: `@Loop` and `@loop` are the same label.
3.2 **Definition:** a label at the start of a line marks that line. Text after it is kept as the line's code:
    `@loop print X` becomes `120 print X` and `@loop` means 120.
3.3 A label alone on a line marks the next line that has code. Several labels may mark the same line.
    A label with no code line after it (end of the program) is an error.
3.4 **Use:** everywhere else, `@name` is replaced by the line number of its line, as a whole name: `@a` never
    touches `@ab`. This works wherever STOS takes a line number (`goto`, `gosub`, `then`, `else`,
    `on ... goto`, `restore`, `on error goto`, `on menu goto` ...).
3.5 Not replaced: inside `"strings"`, after `rem` (the rest of the line is a comment), and when `@` follows a
    letter, digit, `_`, `$` or `#` (it is not a label then).
3.6 Errors: a label defined twice (both places are given), and a label used but never defined.

## 4. Directives
Directives start with `#` at the start of a line (after optional spaces) and produce no output line.
4.1 `#include "file"` inserts the lines of another `.stos` file at that point. The path is relative to the
    file containing the `#include`. Included files may include others.
4.2 Errors: a missing file (with the path that was tried), a file that includes itself directly or through
    others (the chain is given), and a `#include` without a quoted file name.
4.3 Labels are shared by all files: a label defined in an included file can be used in the main file and
    the other way round.
4.4 Any other `#word` at the start of a line is an error (*unknown directive*).

## 5. Characters
5.1 STOS uses the Atari ST character set, not UTF-8: `é` is the byte 0x82. The `.asc` is written in that
    character set (table in `src/charset.ts`, from the Atari ST character map).
5.2 A character that does not exist in the Atari ST set (e.g. `€`, an emoji) is an error with its position.
5.3 Control characters other than tab are an error.

## 6. Output
6.1 The `.asc` lines end in CR+LF, also the last one.
6.2 **Source map:** for every output line the converter knows the file and line (1-based) it came from, so an
    error STOS reports in line 230 can be traced back to the `.stos` file.

## 7. Errors
7.1 Every error names the file, the line (1-based) and, where useful, the column: `levels.stos:12:7: unknown
    label @boss`.
7.2 The converter does not stop at the first error: it reports all of them (up to 20), so they can be fixed
    in one go. Nothing is written when there is an error.

## 8. Warnings (loop structure, `src/structure.ts`)
8.1 `FOR ... NEXT`, `WHILE ... WEND` and `REPEAT ... UNTIL` must be closed, and loops must be nested. The words
    count only where a statement starts (line start, after `:`, after `then` / `else`); text in strings and after `rem`
    is ignored. Tests: `test/structure.test.js`.
8.2 Reported: a loop never closed (at its opening word), a closer without an opener, loops that cross.
8.3 These are warnings: they are listed in Build's output and shown as yellow squiggles, but the `.asc` is still
    written (a program may leave a loop with `goto` on purpose). Only checked when there are no errors. The core
    STOS has no block `IF` and no procedures, so those are not checked.
8.4 **Unknown commands** (`src/commandcheck.ts`): a statement that starts with a word that is no command of the
    database (first word of any command name, plus `then` / `else`) is reported with the closest known word if it
    is a likely typo. Not reported: assignments (`a=1`, `t(2)=3`, `mid$(a$,1,1)="x"`), line numbers after `then`,
    text after `rem` and in strings. Words STOS Studio lacks (extension commands) go in the setting
    `stosStudio.knownCommands`; `stosStudio.checkUnknownCommands` switches the check off. Only words that start
    a statement are checked, not words inside expressions. Tests: `test/commandcheck.test.js`.
8.5 **Parameter counts** (`src/paramcheck.ts`): `sprite 1,100` is reported because SPRITE takes four values. The
    allowed counts come from the `syntax` lines of the database, and only for a command whose every line is plain: the
    name, then names separated by commas, optional parts in `[brackets]`. Lines with `TO`, `ON/OFF`, lists, `...`,
    `(`, `-` or `/` are skipped, so such a command is not checked at all (`cls`, `box`, `print`, `dir` ...); `next`,
    `data`, `rem` and `trap` are skipped by hand because real programs give them more values than the reference card
    shows. Commas inside brackets and strings do not count; only the statement itself is counted (up to `:`, `then`,
    `else`). Setting `stosStudio.checkParameterCounts` turns it off. Tests: `test/paramcheck.test.js`.

## Decisions
- Line numbers start at 10 with step 10.
- Lines starting with `'` or `//` are source-only comments (rule 1.6); `rem` lines go to STOS.
- The highest line number is 65535.
- Still unknown: the longest line STOS accepts (no check yet).
