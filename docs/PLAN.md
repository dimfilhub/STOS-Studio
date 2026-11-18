# STOS Studio: design and phases

STOS Studio is an independent VS Code extension for STOS BASIC on the Atari ST: write STOS programs in VS Code,
build a numbered `.asc`, run it in the Hatari emulator, get help on every command.

It is inspired by Neil Halliday's "STOS: The Game Creator" extension (https://stoscoders.com/visual-studio-code),
which first showed that this works. Every file here is written from scratch. Things the user supplies: STOS,
Hatari, a TOS image, the STOS manual.

## Ground rules (clean room)
1. **Nothing is copied** from Neil Halliday's extension or from anything derived from it: no code, grammar,
   snippets, theme, language configuration, wizard, project template, images, help texts, command list or
   converter (his `stos2asc` is not reproduced). Reading it to understand behaviour is fine.
2. **The STOS manual is copyrighted:** help texts are written in own words. Syntax lines and tiny examples are
   facts and can follow the manual exactly. Each entry records the manual page.
3. **STOS is not bundled.** Its licence is unclear (source released by François Lionet around 2001, no clear
   licence found). The user points the extension at their own STOS folder; the same for TOS and Hatari.
4. Only one STOS extension should be installed at a time (both claim `.stos` files).

## Phases (all written)
1. **Skeleton:** package, settings, Build / Run tasks, pickers, command database loader, completion, hover.
2. **Command database** from the manual and reference card: `name`, `kind`, `category`, `syntax`, `doc`
   (own words and a small example), `manual` page. Done when every command of the card is in the file with
   syntax, and the tests check it. (`docs/commands.md`)
3. **Language support generated from the database:** grammar written by `scripts/build-grammar.js`, plus hand-
   written rules for strings, numbers, comments, labels and `#` directives; language configuration; snippets;
   no own colour theme. A test checks that every database command is highlighted.
4. **Converter** `.stos` -> `.asc`, written from a specification (`docs/converter.md`): line numbers and
   `#lineinc`, `#include`, whole-name `@labels`, source map, clear errors, Atari ST character set, CR+LF.
5. **Projects and running:** STOS folder setting and picker; Run prepares the emulated drive inside the project
   (copies STOS once, assets, `MAIN.ASC`) and starts Hatari; "New STOS project...".
6. **Finish:** icon, README, user manual, licence. Later additions: red squiggles, machine / memory / resolution
   settings, the optional STOS-Toolkit link.

## Decisions
- Old projects with `hatari/hd/STOS` already inside keep working: Run uses an existing STOS folder on the drive.
- The `.asc` is written in the Atari ST character set (`é` is byte 0x82), not UTF-8 or Latin-1.
- Line numbers start at 10 in steps of 10 (`#lineinc` changes the step); lines starting with `'` or `//` are
  comments for the source only and are dropped.

## What cannot be checked automatically
Anything inside VS Code or Hatari needs a person to try it. OCR text can contain errors, so help texts are
written from the OCR text and checked against the PDF page when something looks wrong.
