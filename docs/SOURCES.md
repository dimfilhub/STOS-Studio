# Sources and lessons

## Reference material (not part of this repository; all copyrighted, never commit it)
| What | Notes |
|---|---|
| STOS The Game Creator User Guide (Mandarin/Jawx 1988) | 289 scanned pages, no text layer. The main source for the help texts. Scans are available e.g. from atarimania.com and exxosforum.co.uk (`atari/STOSFLOPPY/STOSDPLANG/STOS_User_Guide.pdf`). |
| STOS Basic reference card | 4 pages with every command's syntax (e.g. from retrogamecoders.com). Its own text layer is garbled; use OCR. The scan looks incomplete: no sprite or screen commands, graphics stop after `INK`. |
| OCR text of both | One `page-NNN.txt` per PDF page (PDF page numbers, not the printed ones; printed = PDF - 6). Made with the tools below; OCR can contain errors, so check the PDF page when something looks wrong. |
| GBP extension manual | https://stoscoders.com/?p=1880, for the GBP extension commands, if they are ever added. |

## Tools
- `scripts/ocr.swift`: OCR of a PDF with Apple's Vision framework (macOS, nothing to install). About a minute
  for the whole manual. The reference card reads better at 4000 pixels.
- `scripts/find-entries.js`: finds manual pages whose heading names a command (`SPRITE (Displays a sprite...)`).
  It finds most commands; the rest use heading variants and are found by hand.

## Lessons
- **Line endings:** `.gitattributes` (`* -text`) stores every file as it is. Some git setups (`core.autocrlf=input`)
  would otherwise turn the CR+LF of Atari files and test fixtures into LF.
- **Character set:** STOS uses the Atari ST character set (`é` is byte 0x82), neither UTF-8 nor Latin-1.
- **STOS licence:** the source was released by François Lionet around 2001, but no clear licence was found: do not
  bundle STOS.
- **Highlighting `@labels`:** use Unicode classes (`@[\p{L}\p{N}_]+`); they mean the same in VS Code's
  Oniguruma and in JavaScript with the `u` flag, so the rule can be tested in Node.
- **Testing without VS Code:** run the compiled code against a fake `vscode` module (a small object with the few
  functions used, which record what they get) to check what VS Code would receive.
- **Existing help texts are not a reference:** other extensions' texts contain errors; the manual is the reference.
