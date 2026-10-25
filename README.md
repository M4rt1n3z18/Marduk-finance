# Nexora

Personal finance on your own computer: spending, budgets, investments, salary and goals.
Each profile is encrypted with its owner's password before it's saved — one file per
profile in a `Nexora` folder in your Google Drive (or the app's local folder when there's
no Google Drive), so it syncs between your computers and stays unreadable to anyone else.

Nexora was called **Marduk** until version 2.0. Marduk's data is moved into a Nexora
profile the first time 2.0 opens (see "Upgrade from Marduk" in `CLAUDE.md`).

## Run it

```bash
npm install
npm start
```

## Build and release

```bash
# bump "version" in package.json and the top entry of js/changelog.js, then:
GH_TOKEN=$(gh auth token) npm run release
git push
```

`npm run release` builds for macOS, Windows and Linux and publishes to GitHub Releases
(`M4rt1n3z18/Nexora-finance`). Installed copies update themselves from there.

`CLAUDE.md` is the codebase reference.
