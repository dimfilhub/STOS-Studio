# Command database (`data/stos-commands.json`)

One JSON file lists every STOS command the extension knows, with its syntax and help text. Completion and
hover read it; the grammar (phase 3) and the linter are meant to be generated from / read the same file.

Written from the STOS User Guide (Mandarin/Jawx 1988) and the STOS reference card (neither is part of this
repository). Help texts are in own words (the manual is copyrighted); syntax lines follow the
card or the manual exactly. Nothing comes from the original extension.

**Contents:** 359 entries: every command of the reference card (234 names, checked by a test) and every
command of the manual's own index (PDF pages 277-279), plus control-flow words (`then`, `else`, `to`, `step`,
`as`), `pi`, `true`/`false` and the operators.

## One entry

```json
{
    "name": "sprite",
    "kind": "keyword",
    "category": "Sprites",
    "source": "STOS",
    "syntax": ["SPRITE n,x,y,p"],
    "doc": [
        "Shows sprite n (1 to 15) at screen position x,y with image p from the sprite bank ...",
        "",
        "```stos",
        "sprite 1,160,100,1",
        "```"
    ],
    "manual": 87
}
```

| Field | Meaning |
|---|---|
| `name` | the command as typed, lower case; may contain spaces (`move x`, `reserve as screen`) or end in `$` |
| `kind` | the icon in the completion list: `keyword` (instruction), `function`, `property` (reserved variable that can also be set, e.g. `timer`, `physic`), `operator`, `constructor` or `class` |
| `category` | group, from the manual's chapters (`Sprites`, `Graphics`, `Screen`, `Text`, `Windows`, `Sound`, ...) |
| `source` | `STOS`, or the extension the command comes from |
| `syntax` | the forms of the command, one string each; `[...]` is optional, `=NAME(...)` marks a function. Optional in the loader (an extension may lack it), required for STOS entries by the tests |
| `doc` | help in Markdown, **one array item per line**; `""` is an empty line; ends with a small example in a `stos` code block |
| `manual` | page of the manual PDF (PDF page number, not the printed one: printed = PDF - 6) |
| `unclear` | optional note: something the OCR left unclear, to be checked in the PDF |

Hover and completion show: the heading (`STOS: The Game Creator`, or the extension name, from `source`), the
syntax in a code block, the help, and `Manual page N`.

**Names:** forms of one command share one entry (`music` has `MUSIC n`, `MUSIC OFF`, ...; `anim` has
`ANIM ON/OFF`). A name may appear twice with different kinds: `colour` (instruction) and `colour` (function),
`mode` likewise; the test allows no other duplicates. `default` is the editor command; the screen addresses are
`default physic`, `default logic`, `default back`. `on` is `ON ... GOTO/GOSUB`, with `on error` and `on menu`
separate. `scroll` covers `SCROLL n` (screen) and `SCROLL ON/OFF` (window); `scroll up` / `scroll down` are
separate. `?` is described under `print`. The music definer's own note instructions (`TREMOLO`, `NOISE ONLY`,
...) are not BASIC commands and are left out.

**Operators** written as symbols (`+`, `<>`, ...) are in the file for the grammar, but completion and hover skip
them (hover would pop up on almost every line).

**Hover:** case does not matter, two-word names work with any number of spaces, the longest name wins
(`def fn`, not `fn`), and nothing is shown inside `"strings"`, for `@labels` or for part of a longer word.

## Highlighting

`scripts/build-grammar.js` (`npm run grammar`) writes `syntaxes/stos.tmLanguage.json` from this file; run it
after every change to the database (a test fails if the grammar is out of date). Scopes, so any colour theme works:

| What | Scope |
|---|---|
| control flow and errors (categories `Control`, `Errors`: `goto`, `if`, `for`, `on error` ...) | `keyword.control.stos` |
| other instructions (`kind: keyword`) | `keyword.other.stos` |
| functions (`kind: function`) | `support.function.stos` |
| reserved variables (`kind: property`: `timer`, `physic` ...) | `variable.language.stos` |
| `true`, `false`, `pi` | `constant.language.stos` |
| `and`, `or`, `xor`, `mod`, `not` / `+`, `<>` ... | `keyword.operator.word.stos` / `keyword.operator.stos` |
| `rem` and the rest of the line (sent to STOS) | `comment.line.rem.stos` |
| a line starting with `'` or `//` (dropped by the converter) | `comment.line.source.stos` |
| `"text"` (no escapes; may run to the end of the line) | `string.quoted.double.stos` |
| `$7F0`, `%1010`, `3.5e-2` | `constant.numeric.hex/binary/decimal.stos` |
| line number at the start of a line | `constant.numeric.line-number.stos` |
| `@label` at the start of a line / elsewhere | `entity.name.function.label.stos` / `entity.name.label.stos` |
| `#include`, `#lineinc` at the start of a line | `keyword.control.directive.stos` |

Hand-written rules (strings, numbers, comments, labels, directives) are in the script; command names are not.
When one name starts another (`default` / `default physic`, `on` / `on menu`), the longer one always wins.

## How it was made

The PDFs are scans; the text came from OCR (Apple Vision) of each page; the card was also read from page
images, as its OCR skipped lines. The reference card scan has 4 pages and looks incomplete: it has no sprite or
screen commands, no `PRINT`, `INKEY$`, `DATA`/`READ`, `RND`, `SIN`/`TAN`, and its graphics section stops after
`INK`. All of those come from the manual. The manual's index (PDF 277-279) was used to check that nothing is missing.

## To check in the PDF (12 entries with `unclear`)

| Command | PDF page | What to check |
|---|---|---|
| `language` | 40 | Only on the reference card; no entry found in the manual OCR. Page 40 is the ENGLISH/FRANCAIS entry. Check the return values. |
| `match` | 49 | The OCR of the not-found result is unclear; check page 49. |
| `change mouse` | 96 | How m maps to a sprite image number is cut off in the OCR; check page 96. |
| `mouse key` | 97 | The value table is garbled in the OCR; check page 97. |
| `joy` | 98 | The bit numbers are missing in the OCR (example uses `joy and 15` for the four directions); check page 99. |
| `psg` | 271 | Described in the appendix on the sound chip; check the register list on page 271. |
| `shift` | 139 | SHIFT OFF is not in the OCR syntax line; check page 139. |
| `pack` | 160 | The syntax line reads `I=PACK scr,bnk` while the example uses `pack(5,6)`; check page 160. |
| `writing` | 165 | The card says OR is the default, the manual says replacement; check page 165. |
| `using` | 202 | The OCR mixes up some format characters (`~`, `;`); check pages 202-203. |
| `swap` | 220 | The syntax line reads `SWAP(X,Y)` but every example uses `swap A,B`; check page 220. |
| `bset` | 227 | The syntax lines say `BSET(x,y)` with x the variable, but the examples put the bit number first; check page 227 (also BCHG, BCLR). |

Not checked at all yet: the help texts against the real behaviour in STOS (Hatari).
