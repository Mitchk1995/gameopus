# Aldermere: notes for Claude

A single-player, OSRS-style world in three.js (r186, Vite). Read `DESIGN.md` for the owner's
decisions and pillars; they outrank taste. `HANDOFF.md` holds the current state: what landed, what
is in flight, and the next steps in order. Read it first, and rewrite it at the end of a session.

## Working with the owner

- Mitchell is a game designer and does not care about programming or GitHub. Talk in game terms
  only: how it plays, what you see, what changed for the player. Keep updates short, with no jargon
  (no "PR", "CI", "merge", "collider" without a plain translation); they zone out otherwise.
- They test by playing and send notes on feel and looks. Their feel notes come before everything
  else. Nothing has been felt with a real mouse on a real GPU unless they say so; everything else is
  measured headless.
- Standing rules: automate everything git-related and don't ask (branches, PRs, merging); turn on
  Auto-fix (the app's CI monitor switch) for every PR you open, and again in a new chat for PRs still
  open; helper agents in parallel are welcome.

## Run and test

- `npm run dev` for live editing; `npm run build` for `dist/`. `npm run app` opens the built
  game as a desktop window (`desktop/main.cjs`, Electron); `npm run package` makes
  `release/Aldermere/Aldermere.exe`, which is how the owner plays (build it in `D:\diablolike` on an
  up-to-date `main`; the app keeps its own saves in `%APPDATA%\Aldermere`). It builds into
  `release/build/` and `scripts/place-app.mjs` swaps the result into `release/Aldermere/`; if that
  folder is in use (the game is open, or the Claude app still holds `app.asar` because a tool read
  inside it; never Glob or Read inside `release/`), the build lands in `release/Aldermere-<time>/`
  instead, and you must tell the owner that path. To check a build, launch it with
  `--user-data-dir=<temp>` so the owner's save isn't touched. npm 11 skips Electron's download step: if
  `npx electron` says it failed to install, unzip the cached zip in
  `%LOCALAPPDATA%\electron\Cache` into `node_modules/electron/dist` and write `electron.exe` to
  `node_modules/electron/path.txt`.
- `npm run artifact` packs `dist-artifact/` for the claude.ai artifact (published at
  https://claude.ai/artifact/6UupW43rUU5LKTJBJUoyh5 with the `sample` capability, which
  powers typed chat). Republish only the page unless files in `public/assets` changed.
- Headless scenarios: `python tests/playtest/play.py tests/playtest/<name>.py` after a build
  (`CHANNEL=chrome` locally). In `#test` mode the game only steps when told: `__game.sim(s)` ticks
  without drawing, `__game.run(s)` ticks then draws one frame (screenshots show the last drawn
  frame). `window.__THREE` is exposed in test mode. `q_helpers.js` has `talk(g, npcId)`, `read()`,
  `click(text)` for dialogue. Scenarios exit non-zero on a `FAIL` line or a page error.
- `node scripts/balance.mjs` for combat numbers.

## Sync, CI and merging

- The repo is https://github.com/Mitchk1995/gameopus (public) and `D:\diablolike` is a clone;
  GitHub `main` is the source of truth. `npm run sync` pulls and rebases; `npm run sync -- "what
  changed"` commits everything, pulls and pushes. It never force-pushes; a conflict stops it.
- Work on a branch and open a PR for anything bigger than a tweak. Keep PRs based on `main`.
- CI (`.github/workflows/ci.yml`) builds, checks `scripts/balance.mjs`, then plays every scenario whose
  first line starts `# ci`, in four parallel groups; a final `playtest` job is the one check that
  sums them up. `look` renders at 640x360 there because software GL is slow. A slow scenario opts out
  of unrelated PRs with `# ci paths=src/world/,src/dungeon/` (it then runs only when a PR touches one
  of those prefixes; everything runs on pushes to `main`). Add a `# ci` scenario for every new mechanic.
- The repo is public (Actions minutes are free), so anyone can read it: never commit keys, tokens
  or anything personal. Still batch fixes into one push, and keep big sweeps behind `paths=` so a
  run stays short.
- `.github/workflows/automerge.yml` merges any of the owner's PRs into `main` once `build` and
  `playtest` are green and there are no conflicts. Label a PR `hold` to stop it (for work that needs
  a look first). `gh api -X PUT repos/Mitchk1995/gameopus/pulls/N/update-branch` re-runs a PR on the
  latest workflow.
- Helpers work in copies under `.claude/worktrees/` (git-ignored). Give each its own `npm ci`; never
  link `node_modules` with a junction (removing a worktree can follow it into the real folder).

## Map of the code

- `src/world/`: terrain, sky, water, forest, grass, the town, mine, fishing spots and stations,
  colliders (2D grid of circles and boxes with height spans; only shapes flagged `floor` count as
  ground; `noCamera`, `cameraOnly` and `keepCamera` flags tune the camera), `solids.js` (the camera's
  index of real triangles), `doors.js`, `props.js` (solid shapes of kit props).
- Ashford's plan is data in `src/world/ashford.js` (outline, gates, streets, square, building rows,
  plots, props with reasons, stall/well/fire/kiln spots, where Mirelle, Garrow, Wenna and Hob stand).
  `village.js` builds it, `townkit.js` makes the street furniture the kits lack (lamps, walls, hedges,
  gates, signs, crops, hay), `map.js` grades and paints the ground from it. After editing `ashford.js`
  or `map.js` run `node scripts/bake-world.mjs` (height and ground maps) and `node scripts/town-plan.mjs`
  (top-down plan), then `tests/playtest/town.py`.
- `src/actors/`: player controller (states: move, act, roll, attack, block, hurt, dead), camera rig,
  characters (Quaternius modular outfits on one skeleton), NPCs, enemies, `aim.js` (upper-body aim
  layer + two-bone IK for bows and casting).
- `src/game/`: game loop glue (`game.js`), skills, items, inventory, combat formulas, fight (melee,
  tells, parries, loot), ranged (arrows, spells, particles), quests engine, dialogue runner, typed
  chat, pets.
- `src/content/`: data only: people (look, placement, persona, dialogue tree), quests, shops, lore
  for typed chat. New content should be rows here.
- `src/dungeon/`: layout generator and the Old Warren builder.
- `src/ui/`: panels (pack, worn, skills, quests, collection log), menus, talk box, minimap, combat
  UI, HUD, item art (procedural 3D item models and icons).

## Systems: how they work, and their gotchas

- **Movement.** Plain movement is a jog (5 m/s), holding Shift runs (7.4 m/s), Z/CapsLock toggles
  walk, and aiming walks. Starts and stops settle in about 0.15 s, the gait clip is picked by intent
  and its rate follows real speed. `tests/playtest/movement.py` measures it.
- **Fluid combat.** Space jumps, tapping Shift dodge-rolls, holding Shift runs (C is the collection
  log). Swinging while moving keeps you going at 70% jog speed with the swing layered over the upper
  body (legs keep jogging; standing swings stay full-body). A dodge or jump cuts a swing off at any
  time. `tests/playtest/combat_flow.py` checks it. Known gap: no strafe clips, so side-steps during a
  swing play the forward jog.
- **Melee aim and flow.** Every swing turns and tips toward the crosshair (or the lock-on target, or
  else the foe nearest the crosshair ray within reach; `Fight.#aimSwing`) and tracks it until the
  blow lands; `Player.#lean` tips the spine and sword arm (`tiltUpper` in `aim.js`, shared with the
  bow) so the blade passes through that point, solved from the live shoulder position. Each move in
  `PLAYER_MOVES` carries `from` (skips clip lead-in), `hit` (blade crossing time), `next` (chain
  window), `aimPitch`/`aimReach` (where the blade passes at `hit`; re-measure by sampling the clip
  when a clip or hit time changes, see the comment above `PLAYER_MOVES`). A light swing starts moving
  in one frame and lands in about 0.2 s (heavy 0.38 s, finisher 0.18 s). The chain is A (right to
  left), B (back to the right), C (low sweep to the left, first half of its clip only); a press
  during a swing cuts in at the chain window, and a dodge, block or hit drops the combo and any
  queued swing. The layered swing subtracts the jump/jog pelvis tilt (`#overlay`), which is what used
  to send airborne swings overhead. Swings end through the recovery clip (`Recover` gait).
  Gotcha: three's mixer only rewrites a bone whose animated value changed, so any pose laid over the
  animation must call `char.mark(bone)` first (`Character.update` restores marked bones); otherwise
  steady bones accumulate the layer every frame. `tests/playtest/melee_aim.py` measures swing start,
  blade-through-crosshair (ground, moving, jumping, looking up and down), hits on the crosshair
  target, chain order and sides, pops and resets. Open questions for the owner: the finisher arches
  the back up to about 50 degrees at chest-height aim, and it lost its old second spin.
- **Camera.** The camera collides with the real rendered geometry, not hand-placed boxes.
  `src/world/solids.js` indexes the triangles of every static solid mesh (the kit `Batcher` flags
  all its output `camSolid`, dropping decorative parts under 0.5 m and door leaves via a
  per-triangle `camMask`; other meshes join with `world.solids.addObject(obj)`, as the well and cave
  mouth do) and sweeps a lens-sized ball through them (exact sphere-vs-triangle, gathered into a
  small local list once per few frames). `World.lineOfSight(camera=true)` uses it, plus the colliders
  that have no mesh behind them (trees, mine rocks, villagers and shut doors via `keepCamera`);
  colliders that sit under solid meshes (walls, roofs, lintels, props) are ignored by the camera
  automatically (`World.cameraIgnores`), so anything built through a Batcher needs no camera
  colliders. Anything that moves (door leaves, animated effects) must stay out of the index: give it
  a `keepCamera` collider if it should still block the lens. `World.enclosure()` (rays up and around)
  gives an "indoors" amount that shortens the follow distance to 3 m in closed rooms.
  `camera-rig.js`: the hard limit (never inside anything) is instant; the boom looks 0.14 and 0.28 s
  ahead along the player's motion and turn and starts coming in early, waits 0.22 s of clear view
  before easing out (a critically damped spring, so no hunting at a threshold); the shoulder slides
  to centre fast and back slowly and follows the boom smoothly; the hero hides with hysteresis
  (`main.js`); shake never carries the lens into a wall.
  Tests: `camera_buildings.py` (every building and the cave mouth, camera vs the rendered triangles
  via independent ray tests in `camera_mesh.js`), `camera_doors.py` (scripted doorway walk-throughs
  and turns scored for flutter, snap, easing and shoulder-slide smoothness), `camera.py` (older
  collider-based checks, dungeon included). Known gaps: forced pulls (walking through a door more
  than about 20 degrees off its axis, steering with the mouse while running, turning on the spot in
  a doorway) can still snap the boom in by a couple of metres in one frame; the camera can hug the
  head (hero hidden) for about a second after such a pull; the dungeon still uses its old boxes.
- **Textures.** The GLB textures were fine, but plaster, skin and cloth read as flat paint.
  `src/engine/detail.js` patches every normal-mapped GLB material (kits, characters, monsters) with a
  shared noise map: colour grain, tiny bumps in the normal, slow mottling, fading out by ~120 m;
  buildings map it by world position, people by their UVs. GLB textures get anisotropic filtering
  through `assets.setAnisotropy`. Both follow the graphics setting (`aniso`/`detail` in `QUALITY`:
  High 16x + full, Medium 8x + one read, Low 4x + off). `tests/playtest/look.py` takes before/after
  viewpoints (`LOOK_TAG`, `LOOK_Q`); shots in `docs/look/`.
- **Ashford, the town.** A walled market town (DESIGN.md, "Ashford v2"): Lake Street from the south
  gate to a rectangular square with the bank at its head, store, inn (with the cooking hearth) and
  open-fronted smithy and potter around it, cottage rows, Wren and Stable lanes, a chapel on a rise,
  three gates. Buildings come from `buildHouse`. Known gaps: all roofs are the same tile colour, the
  5 m streets are tight for the camera, no animals.
- **Building and prop quality.** `src/world/props.js` holds the real solid shape of every prop that
  matters (`SOLIDS`: a stall is a counter block plus posts, a bench is a jumpable slab, a lantern is a
  lamp on a bracket) and `placeProp` places a prop with its colliders; use it for anything new
  (walk-through props are a bug). Shapes flagged `floor` are standable (tops up to about 1 m are
  jumpable). Procedural meshes get world-scale UVs (`fitUV`, `courseGeometry`, 2 m per repeat like the
  kit) and call `tag()` so the audit sees them. Houses (`buildings.js`) put windows in every other bay,
  mirrored about the door, stacked per floor; shutters only on the front, all alike. Doors (`doors.js`)
  are scaled to their frame, solid when shut, swing on E; bank, store and inn doors start open, private
  houses stay shut and answer a knock. The town (`ashford.js`, `townkit.js`, `village.js`) obeys the
  same rules: kit props go through `#prop`/`placeProp`, `Lantern_Wall` and doors come from the building
  rules, stall goods are packed onto the counter by `#goods`, and every `TownKit` method calls
  `begin(label, x, z)` so the audit can group its meshes (soft things such as crops and washing are
  walk-through; pass `on` for a piece resting on another). `TownKit.put` fits UVs to the material's
  kit tile size (`TILE`), so new furniture gets un-stretched brick and wood by default. Kit props
  using the page material (`Scroll_*`, `Book_*`) fail `look.py`: leave them out.
  `tests/playtest/geometry.py` (+ `geometry_helpers.js`) is the automatic geometry audit: floating,
  clipping, door fit, collider coverage both ways, window density, texture stretch, furniture whose
  parts don't touch, walls with a gap under them on falling ground, plus a canary that must catch
  deliberately broken pieces. It scans whatever the world and dungeon contain (Batcher logs, tagged
  meshes, `colliders.doors/buildings`), so new props are checked for free; a FAIL line names the
  piece and its position. `tests/playtest/town.py` checks the town's layout: reachability, overlaps,
  slopes, doors, NPC spots, gates and roads, orphan props.

- **Ashford Vale v2 (in progress, branch `world-v2`, PR #15 held with `hold`).** DESIGN.md "Ashford
  Vale v2" has the plan and a done/not-done checklist. `src/world/map.js` is the whole region as data:
  `RIM` (foot of the mountain wall), hills, `ROADS` (roads in classes road/track/path, each with a
  cut-and-fill profile made on first use), `JUNCTIONS` (signpost boards computed from the road graph),
  `EXITS` (three sealed passes, `locked: true`), `POIS` (flattened pads for sites), `LANDMARKS`,
  `WARNINGS`, `rings(x, z)` and `biomeAt(x, z)`. `node scripts/bake-world.mjs` writes `height.bin`,
  `ground.png` and the biome maps; `node scripts/vale-plan.mjs out.jpg [--px 4 --box x0,z0,x1,z1]`
  draws the plan. Structures go through `SiteKit` (`sitekit.js`, a `TownKit` with frames, blocks and
  profiles; its audit ids start at 1e6 so they never clash with the village's) and `Sites` (`sites.js`,
  built after the village, in its own Batcher so the camera collides with it). Roads follow
  `surface0` (land plus pads, before roads, river and lake), so a road that climbs faster than its
  grade shows as a deep cutting: check profile deviations after moving waypoints. The town terrace is
  never cut by roads (they only cut beyond 12 m outside the wall).

## Next

After the world work in `HANDOFF.md`, the owner picks from: more skills (Prayer, Firemaking,
Thieving), a new region, day/night and weather, more quests.
