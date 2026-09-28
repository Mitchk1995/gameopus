# Aldermere

A single-player, OSRS-style world in the browser, built with three.js: skills with a long
grind to 99, third-person action combat (melee, bows and magic), a procedural dungeon with
a boss, quests, and villagers you can talk to. See [DESIGN.md](DESIGN.md) for the
decisions, pillars and roadmap.

## Play and develop

```sh
npm install
npm run dev          # open the printed URL; edits reload live
```

Click the page to capture the mouse. The controls card on the pause screen lists the keys.
Progress saves in the browser (localStorage).

## Keeping in sync

`npm run sync` pulls from GitHub (rebasing) and pushes local commits; add a message
(`npm run sync -- "did a thing"`) to commit everything first. CI runs on every push and PR.

## Build and publish

- `npm run build` builds `dist/` (a single-file page plus `dist/assets/`).
- `npm run artifact` builds, then packs `dist-artifact/` for the claude.ai artifact host
  (binary assets become base64 text files the loader unpacks; see `scripts/artifact.mjs`).

## Tests and tools

- Headless playtests: `npm run build`, then
  `python3 tests/playtest/play.py tests/playtest/<scenario>.py`. Each scenario drives the
  game in `#test` mode and prints what it checked; screenshots go to `tests/playtest/out/`.
  Needs a Chromium for Playwright (`npx playwright install chromium`, or `CHANNEL=chrome`
  to use an installed Chrome).
- `node scripts/balance.mjs` prints time-to-kill and incoming damage for every monster
  at four stages of the game, straight from the combat formulas.
- `node scripts/fetch-assets.mjs` re-downloads and optimizes the CC0 art packs into
  `public/assets/` (already committed, so you only need it to change the art).

## Art

All free for any use: Quaternius (characters, outfits, animation library, village and
props kits, monsters; CC0), Poly Haven (sky and ground textures; CC0) and ez-tree
(trees; MIT). Item models, effects and sounds are made in code.
