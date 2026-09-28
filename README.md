# Hollowreach

A Diablo-style loot ARPG built in three.js, made for one player, with Claude as the
dungeon master who keeps expanding it. Everything is procedural: meshes, textures,
effects and all audio are generated in code. No asset files.

- `npm install` then `npm run dev` to play locally
- `npm run build` produces `dist/index.html` (single file) and `dist/hollowreach.html`
  (the claude.ai Artifact version)
- `node scripts/playtest.mjs` drives a headless playtest (see the file for options)

See [DESIGN.md](DESIGN.md) for how the world stays cohesive as it grows.
