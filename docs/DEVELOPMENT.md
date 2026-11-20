# Developing STOS Studio

Notes for working on the extension (the README is for users and is shown in VS Code's extension page).

## Build, test, install
```sh
npm install
npm test            # compiles and runs the Node tests
npm run grammar     # after changing data/stos-commands.json (a test checks it was done)
npm run package     # creates stos-studio-<version>.vsix
npm run manual      # builds the user manual PDF from docs/manual/manual.html (needs Google Chrome);
                    # default output: STOS Studio Manual.pdf on the Desktop, or: node scripts/build-manual.js out.pdf
code --install-extension stos-studio-0.2.2.vsix --force
```
Install only one STOS extension at a time: two extensions that both handle `.stos` files get in each other's way.
Design and phases are in `docs/PLAN.md`, progress and open points in `TODO.md`, the steps for the Marketplace in
`docs/PUBLISHING.md`.

## Layout
| Path | Contents |
|---|---|
| `src/extension.ts` | activation |
| `src/build.ts`, `src/tasks.ts` | build / run logic (plain Node) and the VS Code tasks and pickers |
| `src/converter.ts`, `src/charset.ts` | the `.stos` -> `.asc` converter (spec: `docs/converter.md`), Atari ST character set |
| `src/commanddb.ts`, `src/completion.ts`, `data/stos-commands.json` | command database, completion, hover |
| `src/errors.ts` | `StosError` (errors a user can fix) |
| `test/` | Node tests (`node --test`) |
| `src/project.ts` | "New STOS project" (plain Node) |
| `syntaxes/`, `language-configuration.json`, `snippets/` | highlighting (generated: `npm run grammar`), editor settings, snippets |
| `scripts/` | `build-grammar.js`, `make-icon.swift` (draws `images/icon.png`), OCR tools used for the manual |
| `docs/` | `PLAN.md` (phases, rules), `commands.md` (database), `converter.md` (converter spec), `SOURCES.md` |

## Releasing
Released as a `.vsix` on GitHub Releases and on Open VSX (not the Microsoft Marketplace).

One-time setup for Open VSX:
1. Sign in at https://open-vsx.org with GitHub and accept the publisher agreement.
2. Create an access token (Settings -> Access Tokens).
3. Create the namespace once: `npx ovsx create-namespace dimfilhub -p <token>` (it must equal `publisher` in `package.json`).
4. In the GitHub repository: Settings -> Secrets and variables -> Actions -> New secret `OVSX_PAT` = the token.

For every release:
1. Update `version` in `package.json` and the heading in `CHANGELOG.md`; run `npm test`; commit and push.
2. `git tag v0.1.0 && git push origin v0.1.0`. The workflow builds, creates the GitHub Release and publishes to Open VSX.

Updates in VSCodium: an extension installed from a `.vsix` is never offered updates ("up to date"). Testers must install
from Open VSX (uninstall the sideloaded copy first); after that new releases appear in the Extensions view on their own.
The `.vsix` install is for VS Code and for trying a build locally.

Manual alternative: `npm run package`, then `npx ovsx publish <file>.vsix -p <token>` and upload the file to a release.
