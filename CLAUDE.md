# Aldermere: notes for Claude

A single-player, OSRS-style world in three.js (r186, Vite). Read `DESIGN.md` for the
player's decisions and pillars; they outrank taste. The player tests by playing and
gives direct feedback on feel and looks. Delegated: git, branches, PRs and merging.

## Run and test

- `npm run dev` for live editing; `npm run build` for `dist/`.
- `npm run artifact` packs `dist-artifact/` for the claude.ai artifact (published at
  https://claude.ai/artifact/6UupW43rUU5LKTJBJUoyh5 with the `sample` capability, which
  powers typed chat). Republish only the page unless files in `public/assets` changed.
- Headless scenarios: `python3 tests/playtest/play.py tests/playtest/<name>.py` after a
  build. In `#test` mode the game only steps when told: `__game.sim(s)` ticks without
  drawing, `__game.run(s)` ticks then draws one frame (screenshots show the last drawn
  frame). `window.__THREE` is exposed in test mode. `q_helpers.js` has `talk(g, npcId)`,
  `read()`, `click(text)` for dialogue.
- `node scripts/balance.mjs` for combat numbers.

## Map of the code

- `src/world/`: terrain, sky, water, forest, grass, village (modular buildings), mine,
  fishing spots and stations, colliders (2D grid of circles and boxes with height spans;
  only shapes flagged `floor` count as ground, `noCamera` shapes don't block the camera).
- `src/actors/`: player controller (states: move, act, roll, attack, block, hurt, dead),
  camera rig, characters (Quaternius modular outfits on one skeleton), NPCs, enemies,
  `aim.js` (upper-body aim layer + two-bone IK for bows and casting).
- `src/game/`: game loop glue (`game.js`), skills, items, inventory, combat formulas,
  fight (melee, tells, parries, loot), ranged (arrows, spells, particles), quests engine,
  dialogue runner, typed chat, pets.
- `src/content/`: data only: people (look, placement, persona, dialogue tree), quests,
  shops, lore for typed chat. New content should be rows here.
- `src/dungeon/`: layout generator and the Old Warren builder.
- `src/ui/`: panels (pack, worn, skills, quests, collection log), menus, talk box,
  minimap, combat UI, HUD, item art (procedural 3D item models and icons).

## Sync and workflow (read this first each session)

- The repo is https://github.com/Mitchk1995/gameopus and `D:\diablolike` is a clone of it; GitHub
  `main` is the source of truth. Start a session with `npm run sync` (pulls and rebases).
  End it with `npm run sync -- "what changed"` (commits everything, pulls, pushes).
  It never force-pushes; a conflict stops it and it says why.
- Work on a branch and open a PR for anything bigger than a tweak; CI (`.github/workflows/ci.yml`)
  builds, checks `scripts/balance.mjs`, and plays `movement`, `combat_flow`, `melee` and `gathering` headless.
  Merges are automatic: `.github/workflows/automerge.yml` merges any of the owner's PRs into
  `main` once `build` and `playtest` pass (label a PR `hold` to stop it). Keep PRs based on `main`.
- `npm run playtest -- tests/playtest/<name>.py` runs one scenario (`CHANNEL=chrome` locally).
  Scenarios exit non-zero on a `FAIL` line or page error, so CI catches regressions. Add a
  scenario to the CI loop when you add a mechanic.
- Movement (done): plain movement is a jog (5 m/s), holding Shift runs (7.4 m/s), Z/CapsLock
  toggles walk, and aiming walks. Starts and stops settle in about 0.15 s, the gait clip is
  picked by intent and its rate follows real speed. `tests/playtest/movement.py` measures it.
- Fluid combat (done): Space jumps, tapping Shift dodge-rolls, holding Shift runs. Swinging while
  moving keeps you going at 70% jog speed with the swing layered over the upper body (legs keep
  jogging; standing swings stay full-body). A dodge or jump cuts a swing off at any time.
  `tests/playtest/combat_flow.py` checks all of it. Known gap: no strafe clips, so side-steps
  during a swing play the forward jog.

## Open feedback from the player (do these next)

1. **Characters and buildings look textureless.** Every character and village material
   does have base colour, normal and roughness/ORM maps (1024 px), so nothing fails to
   load; they read flat. Try: anisotropic filtering on GLB-embedded textures (only
   `assets.texture()` sets it today), stronger `normalScale`, detail maps (triplanar on
   buildings), checking exposure and the environment light for washed-out contrast, and
   judging on a real GPU at High quality.
2. **The camera clips into buildings.** The rig's line-of-sight test sees wall colliders
   but interiors have no ceiling colliders (the dungeon adds a `noFloor` box under its
   vault for this), so the camera rises through ceilings; also check door jambs and
   corners against the 0.28 m camera padding and the 0.08 m near plane.

After these, the player picks from: more skills (Prayer, Firemaking, Thieving), a new
region, day/night and weather, more quests.
