# Publishing

STOS Studio is released as a `.vsix` on **GitHub Releases** and on **Open VSX** (the registry of VSCodium, Cursor
and similar editors). It is not on the Microsoft Marketplace: that needs an Azure DevOps organization, which in
turn needs an Azure subscription with a payment card for verification. It can be added later (see the end).

The step-by-step release routine is in `docs/DEVELOPMENT.md`, section "Releasing". The workflow is
`.github/workflows/release.yml`: pushing a tag like `v0.1.0` tests, packages, creates the GitHub Release and
publishes to Open VSX.

## One-time setup (done)
- Open VSX: sign in with GitHub, sign the publisher agreement, create the namespace `dimfilhub` (it must equal
  `publisher` in `package.json`). Creating a namespace needs an access token that is allowed to do so; the
  workflow only needs a token that may publish.
- GitHub: the token is stored as the repository secret `OVSX_PAT`. Never commit it or paste it anywhere.
- Open VSX shows "not a verified publisher" until the namespace ownership is claimed with an issue in the
  `EclipseFdn/open-vsx.org` repository. The extension works in the meantime.

## Every release
1. Raise `version` in `package.json`, add a section to `CHANGELOG.md`, run `npm test`, commit and push.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`, then watch the Actions tab.
3. Check the release page and `https://open-vsx.org/extension/dimfilhub/stos-studio` (a new upload is scanned
   first, so it can take a few minutes to appear).

## Later: Microsoft Marketplace (optional)
1. Create an Azure DevOps organization (needs an Azure subscription) and a Personal Access Token with the
   Marketplace scope *Manage*; create a publisher at the Marketplace management page.
2. Make the `publisher` in `package.json` that id (the Open VSX namespace can stay as it is or be created with the
   same name), then `npx vsce login <publisher>` and `npx vsce publish`.
3. Optionally add a step with the token as a second secret to the workflow.

## Things to keep true
- The README says the extension is unaffiliated and includes no STOS, Atari or TOS files.
- Nothing from the STOS manual or from Neil Halliday's extension is copied (see the clean-room rules).
- Windows and Linux are untested: say so until someone has tried them.
- A short courtesy message to Neil Halliday, whose extension handles the same `.stos` files and inspired this
  one. The README tells users to install only one of the two.
