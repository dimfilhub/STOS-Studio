# Changelog

## 0.2.1
- Docs: README and development notes say VSCodium users should install from Open VSX, since a `.vsix` install is never offered updates.

## 0.2.0
- **Changed:** Run puts the program and the assets in `C:\CODE` (`hatari/hd/CODE`) instead of the root of `C:`; new setting `codeFolder` (empty = the old flat layout). Programs that load from `C:\` need the new path, e.g. `load "C:\CODE\SHIP.MBK"`.
- Run prints where the program and the assets are and how to load them in STOS.
- Run creates an empty `AUTO` folder on the drive, so Hatari no longer logs "No GEMDOS dir ... AUTO".
- README: screenshot; Windows and Linux still need testing and feedback.

## 0.1.1
- Release workflow and publishing docs: first release on GitHub Releases (0.1.0 went to Open VSX only).

## 0.1.0
- Parameter-count warnings (`sprite 1,100`); setting `checkParameterCounts`.
- Unknown-command warnings with a "did you mean" suggestion; settings `checkUnknownCommands` and `knownCommands`.
- Loop check: warnings for `for` / `next`, `while` / `wend`, `repeat` / `until` that do not match.
- Command "Open workbench (STOS-Toolkit)": starts the Toolkit's workbench on the project or on a right-clicked file.
- Optional STOS-Toolkit graphics build: Run builds a Toolkit project's graphics (`stos-toolkit.json`) before copying
  `assets` (setting `buildToolkitGraphics`), plus the commands "Build graphics" and "Show graphics status".

## 0.0.1: first release (preview)
- STOS command help: suggestions and hover for about 360 commands, with syntax, example and manual page.
- Highlighting generated from the same command list, language configuration and snippets.
- Source files without line numbers: `@labels`, `#include`, `#lineinc`, `'` and `//` notes.
- Build to a numbered `.asc` in the Atari ST character set; all problems listed at once and shown as red
  squiggles and in the Problems panel.
- Run in Hatari: STOS copied onto the project's emulated drive once, the project's `assets` folder copied on every
  Run, machine / memory / resolution settings.
- New STOS project command.
- Optional link to the separate STOS-Toolkit: open its sprite editor from VS Code.
- Settings that name programs or folders on your computer (`hatariPath`, `tosImage`, `stosFolder`,
  `toolkitFolder`) can only be set in your user settings, not by a project. `outputFile` and `hardDrive` must be
  inside the project folder. Run and the sprite editor are disabled in untrusted workspaces.
- Tested on macOS with Hatari 2.6; Windows and Linux are untested.
