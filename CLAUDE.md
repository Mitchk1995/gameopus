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

## Open feedback from the player (do these next)

1. **Movement feels floaty and "walking looks like running."** In `player.js` the
   default gait is a 5 m/s jog; velocity eases in with a ~0.2 s time constant
   (`accel` 26/34 divided by the target speed); the clip rate is clamped to 0.55-1.35 of
   the clip's natural speed so feet slide while speeding up and slowing down, and idle
   only kicks in below 0.8 m/s; the body turns slower (rate 12) than the velocity
   changes. Make starts and stops near-instant, match clip rate to actual speed (blend
   walk and jog by speed), and ask the player whether plain movement should walk or run.
2. **Combat must be fluid: move, jump, attack and dodge freely.** Attacks put the player
   in the `attack` state, which drives a root-motion lunge and ignores movement until
   after the hit; rolls are only allowed late in a swing. Plan: play attack clips on the
   upper body only over the legs' locomotion (the approach in `aim.js`: sample the clip's
   bone rotations and slerp the upper-body bones), keep moving (about 70% speed) while
   swinging with a small lunge, let dodges and jumps cancel attacks at any time, and add a
   jump (clips `Jump_Start`, `Jump_Loop`, `Jump_Land` are loaded; the controller already
   has gravity). Proposed keys: Space jumps, tap Shift (or C) dodges, hold Shift sprints.
3. **Characters and buildings look textureless.** Every character and village material
   does have base colour, normal and roughness/ORM maps (1024 px), so nothing fails to
   load; they read flat. Try: anisotropic filtering on GLB-embedded textures (only
   `assets.texture()` sets it today), stronger `normalScale`, detail maps (triplanar on
   buildings), checking exposure and the environment light for washed-out contrast, and
   judging on a real GPU at High quality.
4. **The camera clips into buildings.** The rig's line-of-sight test sees wall colliders
   but interiors have no ceiling colliders (the dungeon adds a `noFloor` box under its
   vault for this), so the camera rises through ceilings; also check door jambs and
   corners against the 0.28 m camera padding and the 0.08 m near plane.

After these, the player picks from: more skills (Prayer, Firemaking, Thieving), a new
region, day/night and weather, more quests.
