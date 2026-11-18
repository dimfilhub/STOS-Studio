# STOS Studio

A VS Code extension for writing STOS BASIC (Atari ST) programs: command help, build to a numbered `.asc`, run
in the Hatari emulator.

Written from scratch, inspired by Neil Halliday's
[STOS: The Game Creator extension](https://stoscoders.com/visual-studio-code). It contains no code or text from
it (see Credits below).

You provide yourself: STOS, Hatari, a TOS ROM image. Nothing of those is included.

## Install
Download the latest `.vsix` from the [Releases page](https://github.com/dimfilhub/STOS-Studio/releases), then run
`code --install-extension stos-studio-<version>.vsix`, or in VS Code: Extensions -> ... -> Install from VSIX.
It is also on [Open VSX](https://open-vsx.org) for VSCodium and similar editors.

## Requirements
- VS Code 1.74 or newer.
- [Hatari](https://hatari-emu.org), a TOS ROM image that fits the emulated machine, and your own copy of STOS.
- Tested on macOS with Hatari 2.6. Windows and Linux are untested: the file handling and Hatari paths are written
  for them, but nobody has tried them yet.

## Features
- **Write** `.stos` files without line numbers: `@labels` instead of numbers, `#include` for more files,
  indentation, `'` and `//` notes that STOS never sees.
- **Help on every STOS command** (about 360, written new from the STOS manual): completion while typing, and
  hover help with the syntax, an example and the manual page.
- **Highlighting** made from the same command list, plus a few snippets (`for`, `while`, `repeat`, `sub`,
  `gameloop`, `windopen`).
- **Build** (Shift+Cmd+B, or Ctrl+Shift+B): `.stos` -> a numbered `.asc` in the Atari ST character set. All
  mistakes are listed at once with file and line (unknown or duplicate labels, missing includes, characters the
  Atari lacks).
- **Loop check:** a `for` without `next`, a `while` without `wend`, a `repeat` without `until` (or a closer with no
  opener, or loops that cross) get a yellow warning squiggle and a line in Build's output; Build still works.
- **Unknown commands:** a statement starting with a word STOS does not have (a typo like `scren copy`) gets a yellow
  warning with a suggestion. Commands of an extension that Studio does not know can be listed in
  `stosStudio.knownCommands`; `stosStudio.checkUnknownCommands` turns the check off.
- **Parameter counts:** `sprite 1,100` gets a yellow warning saying SPRITE takes four values. Only commands with a
  plain syntax line are checked; `stosStudio.checkParameterCounts` turns it off.
- **Red squiggles:** the same mistakes are underlined in the editor and listed in the Problems panel, refreshed
  whenever you save a `.stos` file.
- **Run**: builds, puts your STOS and the program on the project's emulated drive, starts Hatari.
- **Your own files:** everything in the project's `assets` folder (sprite banks, pictures, data) is copied onto
  the emulated drive on every Run, so a program can `load "\SPRITES.MBK"` (names are copied in capitals, as the Atari needs).
- **Optional: STOS-Toolkit.** If you have the separate STOS-Toolkit (graphic tools in Python), choose its folder
  once and open its **sprite editor** from VS Code: from the Command Palette, or by right-clicking a `.mbk` or
  `.spr` file.
- **Optional: workbench.** **Open workbench (STOS-Toolkit)** starts the Toolkit's workbench window on your project (or
  on a picture or bank you right-click in the Explorer). If the project is not a Toolkit project yet, the workbench
  itself asks before creating anything; Studio writes nothing.
- **Optional: build graphics before Run.** If your project is a Toolkit project (it has a `stos-toolkit.json`, made
  by the Toolkit's workbench) and a Toolkit folder is set, Run first lets the Toolkit build what is missing or out
  of date into `assets`, then copies `assets` as usual. The Toolkit's output appears in the Run terminal. If the
  build fails (or refuses to overwrite a file you edited by hand), you are asked whether to run with the existing
  assets; the default is to cancel. Studio never forces an overwrite. Projects without a manifest run as before.

## Getting started
1. Install the `.vsix` file: in VS Code open the Extensions view, click the `...` menu at the top and choose
   *Install from VSIX...* (or run `code --install-extension stos-studio-0.1.1.vsix`). Uninstall any other STOS
   extension first: both would claim `.stos` files.
2. Command palette (Shift+Cmd+P), **STOS Studio: Select Hatari...** (on macOS pick `Hatari.app`), then
   **Select TOS image...** and **Select STOS folder...** (the folder with `BASIC208.TOS`). These are saved once
   for all projects.
3. **STOS Studio: New STOS project...**: choose a folder and a name. The project opens with a small `main.stos`.
4. Press the play button at the top right of the editor (**Build and run in Hatari**). The first Run copies your
   STOS onto the project's drive (`hatari/hd/STOS`); later Runs only copy the program (`MAIN.ASC`).

## Writing .stos files
```stos
' a note for you: lines starting with ' or // never reach STOS
#include "sprites.stos"
mode 0 : cls
@loop
   print "Hello"
   if inkey$="" then goto @loop
```
- No line numbers: Build numbers the lines 10, 20, 30, ... `#lineinc 5` changes the step for the lines after it.
- A `@label` at the start of a line marks that line (the text after it stays the line's code); everywhere else
  `@label` is replaced by that line's number: `goto @loop`, `gosub @title`, `restore @levels`, ...
  Labels are not replaced inside strings or after `rem`, and upper and lower case do not matter.
- `#include "file.stos"` inserts another file (path relative to the file that includes it); labels work across
  files.
- Indentation and blank lines are only for you. `rem` lines are kept: STOS lists them.
- Text is written in the Atari ST character set, so accents like `é` work; characters the Atari does not have
  (such as `€`) are reported.

## Commands (palette: "STOS Studio: ...")
| Command | What it does |
|---|---|
| Build (also Shift+Cmd+B) | `.stos` -> numbered `.asc` |
| Build and run in Hatari | builds; the first time copies your STOS folder to `hatari/hd/STOS`; copies the program to `hatari/hd/MAIN.ASC` (CR+LF); starts Hatari with STOS |
| New STOS project... | asks for a folder and a name; writes `main.stos`, `.vscode/settings.json`, `.gitignore`; opens it |
| Select Hatari... | file picker; on macOS pick `Hatari.app`; saved in your user settings |
| Select TOS image... | file picker for the TOS ROM; saved in your user settings |
| Open sprite editor (STOS-Toolkit) | starts the Toolkit's sprite editor on the file you right-clicked (or the open `.mbk` / `.spr`, or a new bank); only shown once a Toolkit folder is set |
| Open workbench (STOS-Toolkit) | starts the Toolkit's workbench on the project (with your `assetsFolder` setting if it is a folder inside the project); on the Explorer menu of banks and pictures it opens that file; shown once a Toolkit folder is set |
| Build graphics (STOS-Toolkit) | runs only the Toolkit build for the project (output in the "STOS Studio" output); shown once a Toolkit folder is set and the project has `stos-toolkit.json` |
| Show graphics status (STOS-Toolkit) | lists the manifest's items and whether each is built or out of date, without building |
| Select Toolkit folder... | folder picker for the optional STOS-Toolkit; saved in your user settings |
| Select STOS folder... | folder picker for your STOS (with `BASIC208.TOS`, or the folder around it); saved in your user settings |

## Settings
`hatariPath`, `tosImage`, `stosFolder` and `toolkitFolder` can only be set in your user settings (use the Select
commands above), never by a project's `.vscode/settings.json`; `outputFile` and `hardDrive` must stay inside the
project folder. Run, the graphics build and the sprite editor start external programs, so they are disabled in untrusted workspaces.

| Setting | Default | Meaning |
|---|---|---|
| `stosStudio.sourceFile` | `main.stos` | main source file, relative to the project |
| `stosStudio.outputFile` | `stos/main.asc` | the `.asc` that is created |
| `stosStudio.hatariPath` | empty = system default | Hatari program |
| `stosStudio.tosImage` | empty | TOS ROM image (required to run) |
| `stosStudio.hardDrive` | `hatari/hd` | folder Hatari uses as drive C: |
| `stosStudio.autoRun` | `C:\STOS\BASIC208.TOS` | program Hatari starts (must be on the drive) |
| `stosStudio.machine` | `ste` | emulated Atari: `st`, `megast`, `ste`, `megaste` (pick a TOS that fits: 1.02/1.04 for ST, 1.62/2.06 for STE) |
| `stosStudio.memory` | `1024` | ST RAM in KB: 512, 1024, 2048, 4096 |
| `stosStudio.resolution` | `low` | `low` (320x200, 16 colours), `medium` (640x200, 4 colours), `high` (640x400 mono monitor) |
| `stosStudio.assetsFolder` | `assets` | project folder whose files are copied onto the drive on every Run (empty = none); Atari names are 8 letters + 3 |
| `stosStudio.toolkitFolder` | empty | optional: your STOS-Toolkit folder (needs its `.venv`) |
| `stosStudio.buildToolkitGraphics` | `true` | build the Toolkit graphics before Run (needs a Toolkit folder and `stos-toolkit.json`) |
| `stosStudio.checkUnknownCommands` | `true` | warn about statements that start with an unknown word |
| `stosStudio.checkParameterCounts` | `true` | warn about too few or too many values for commands with a plain syntax line |
| `stosStudio.knownCommands` | empty | extra command words (for example from an extension) that are not reported as unknown |
| `stosStudio.stosFolder` | empty | your STOS folder, copied onto a project's drive once (a drive that already has STOS is left alone); STOS is not bundled |

## Credits
- **Neil Halliday** wrote the [STOS: The Game Creator extension for VS Code](https://stoscoders.com/visual-studio-code).
  It showed that STOS BASIC can be written in a modern editor and inspired this project, including the idea of
  writing source without line numbers and using `@labels`, `#include` and `#lineinc`. STOS Studio is an
  independent implementation written from scratch: it contains no code, text or other files from his extension.
  It is not affiliated with or endorsed by him.
- **STOS BASIC** and **STOS: The Game Creator** were created by François Lionet and Constantin Sotiropoulos
  (Mandarin Software / Jawx, 1988). The help texts in this extension are written from the STOS User Guide and
  reference card in the author's own words.
- **Hatari** is the open-source Atari ST emulator that runs the programs.

STOS, Atari and TOS belong to their respective owners. This project includes none of them: you provide your own
copy of STOS, a TOS ROM image and Hatari.

## Licence
MIT, see the `LICENSE` file. Copyright (c) 2026 Dimitris Filios.
