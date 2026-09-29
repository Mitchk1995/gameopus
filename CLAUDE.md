# Aldermere: notes for Claude

**New session? Read `HANDOFF.md` first** (owner preferences, what's merged and in flight, next steps).

A single-player, OSRS-style world in three.js (r186, Vite). Read `DESIGN.md` for the
player's decisions and pillars; they outrank taste. The player tests by playing and
gives direct feedback on feel and looks. Delegated: git, branches, PRs and merging.

## Run and test

- `npm run dev` for live editing; `npm run build` for `dist/`. `npm run app` opens the built
  game as a desktop window (`desktop/main.cjs`, Electron); `npm run package` makes
  `release/win-unpacked/Aldermere.exe`. npm 11 skips Electron's download step: if
  `npx electron` says it failed to install, unzip the cached zip in
  `%LOCALAPPDATA%\electron\Cache` into `node_modules/electron/dist` and write `electron.exe` to
  `node_modules/electron/path.txt`.
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
- Ashford's plan is data in `src/world/ashford.js` (outline, gates, streets, square, building rows, plots,
  props with reasons, stall/well/fire/kiln spots, where Mirelle, Garrow, Wenna and Hob stand). `village.js`
  builds it, `townkit.js` makes the street furniture the kits lack (lamps, walls, hedges, gates, signs,
  crops, hay), `map.js` grades and paints the ground from it. After editing `ashford.js` or `map.js` run
  `node scripts/bake-world.mjs` (height and ground maps) and `node scripts/town-plan.mjs` (top-down plan),
  then `python tests/playtest/play.py tests/playtest/town.py` (a `# ci` scenario: reachability, overlaps,
  slopes, doors, NPC spots, gates and roads, orphan props).
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
  builds, checks `scripts/balance.mjs`, and plays every headless scenario whose first line is the comment `# ci`
  (add that line to a new scenario; no need to edit the workflow).
  They run in four parallel groups (`scenarios` job), and a final `playtest` job goes green only if all
  groups pass; `look` renders at 640x360 there because software GL is slow.
  A scenario can opt out of unrelated PRs with `# ci paths=src/world/,src/dungeon/` on its first line
  (it then runs only when a PR touches one of those prefixes; everything runs on main). Do this for
  slow scenarios (camera, look, and any large audit sweep).
  Merges are automatic: `.github/workflows/automerge.yml` merges any of the owner's PRs into
  `main` once `build` and `playtest` pass (label a PR `hold` to stop it). Keep PRs based on `main`.
- After opening any PR, turn on Auto-fix for it (the CI monitor switch) so red CI wakes the session;
  the owner wants this on every PR, without asking.
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
- Camera collision (done, v2): the camera collides with the REAL rendered geometry, not hand-placed
  boxes. `src/world/solids.js` indexes the triangles of every static solid mesh (the kit `Batcher`
  flags all its output `camSolid`, dropping decorative parts under 0.5 m and door leaves via a
  per-triangle `camMask`; other meshes join with `world.solids.addObject(obj)`, as the well and cave
  mouth do) and sweeps a lens-sized ball through them (exact sphere-vs-triangle, gathered into a
  small local list once per few frames). `World.lineOfSight(camera=true)` uses it, plus the old
  colliders that have no mesh behind them (trees, villagers via `keepCamera`, mine rocks); colliders
  that sit under solid meshes (walls, roofs, lintels, props) are ignored by the camera
  automatically (`World.cameraIgnores`). So any building or prop added through the batcher works
  with no camera colliders. `World.enclosure()` (rays up and around) gives an "indoors" amount that
  shortens the follow distance to 3 m in closed rooms.
  `camera-rig.js`: hard limit (never inside anything) is instant; the boom looks 0.14 and 0.28 s
  ahead along the player's motion and turn and starts coming in early, waits 0.22 s of clear view
  before easing out (critically damped spring, so no hunting at a threshold); the shoulder slides to
  centre fast and back slowly and follows the boom smoothly; the hero hides with hysteresis
  (`main.js`); shake never carries the lens into a wall.
  Tests: `camera_buildings.py` (every building + cave mouth, camera vs the rendered triangles via
  independent ray tests in `camera_mesh.js`), `camera_doors.py` (scripted doorway walk-throughs and
  door spins scored for flutter, snap, easing and shoulder-slide smoothness), `camera.py` (older
  collider-based checks, dungeon included). Known gaps: forced pulls (walking through a door at
  more than about 20 degrees off its axis, or steering with the mouse while running) can still snap
  the boom in by a couple of metres in one frame, and the shoulder can jump about 0.25 m when a jamb
  edge passes; the camera can hug the head (hero hidden) for about a second after such a pull; thin
  scenery between the head and the camera (a post beside the boom) can still hide the hero a little.
- Melee aim and flow (done): every swing turns and tips toward the crosshair (or the lock-on
  target, or else the foe nearest the crosshair ray within reach; `Fight.#aimSwing`) and
  tracks it until the blow lands; `Player.#lean` tips the spine and sword arm (`tiltUpper` in
  `aim.js`, shared with the bow) so the blade passes through that point, solved from the live
  shoulder position. Each move in `PLAYER_MOVES` carries `from` (skips clip lead-in), `hit`
  (blade crossing time), `next` (chain window), `aimPitch`/`aimReach` (where the blade passes at
  `hit`; re-measure by sampling the clip when a clip or hit time changes, see the comment
  above `PLAYER_MOVES`). A light swing starts moving in one frame and lands in about 0.2 s (heavy
  0.38 s, finisher 0.18 s). The chain is A (right to left), B (back to the right), C (low sweep
  to the left, first half of its clip only); a press during a swing cuts in at the chain window,
  and a dodge, block or hit drops the combo and any queued swing. The layered swing subtracts
  the jump/jog pelvis tilt (`#overlay`), which is what used to send airborne swings overhead.
  Swings end through the recovery clip (`Recover` gait) so the blade eases home.
  Gotcha: three's mixer only rewrites a bone whose animated value changed, so any pose laid
  over the animation must call `char.mark(bone)` first (`Character.update` restores marked
  bones); otherwise steady bones accumulate the layer every frame. `tests/playtest/melee_aim.py`
  (`# ci`) measures swing start, blade-through-crosshair (ground, moving, jumping, looking up
  and down), hits on the crosshair target, chain order and sides, pops and resets, and takes
  `jump_swing_*.png`. `play.py` now prints up to 60000 chars so long check lists aren't cut.
- Richer textures (done): the GLB textures were fine, but plaster, skin and cloth are almost
  flat paint. `src/engine/detail.js` patches every normal-mapped GLB material (kits, chars,
  monsters) with a shared noise map: colour grain, tiny bumps in the normal, slow mottling,
  fading out by ~120 m; buildings map it by world position, people by their UVs. GLB textures
  now get anisotropic filtering through `assets.setAnisotropy`. Both follow the graphics setting
  (`aniso`/`detail` in `QUALITY`: High 16x + full, Medium 8x + one read, Low 4x + off).
  `tests/playtest/look.py` takes before/after viewpoints (`LOOK_TAG`, `LOOK_Q`); shots in `docs/look/`.

- Ashford v2 (done): the ring of houses is now a walled market town (see DESIGN.md, 'Ashford v2'):
  Lake Street from the south gate to a rectangular square with the bank at its head, store, inn (with the
  cooking hearth) and open-fronted smithy and potter around it, cottage rows, Wren and Stable lanes, a
  chapel on a rise, three gates. Buildings still come from `buildHouse` untouched. Known gaps: all roofs
  are the same tile colour (kit limit), no bridge over the river yet (the east road stops at the water),
  and the hero's camera is tight in the 5 m streets.
- Building quality (done): `src/world/props.js` holds the real solid shape of every prop that matters
  (`SOLIDS`: a stall is a counter block plus posts, a bench is a jumpable slab, a lantern is a lamp on
  a bracket) and `placeProp` places a prop with its colliders; use it for anything new (walk-through
  props are a bug). Shapes flagged `floor` are standable (tops up to about 1 m are jumpable). Procedural
  meshes get world-scale UVs (`fitUV`, `courseGeometry`, 2 m per repeat like the kit) and call `tag()` so
  the audit sees them. Houses (`buildings.js`) put windows in every other bay, mirrored about the door,
  stacked per floor; shutters only on the front, all alike. Doors (`doors.js`) are scaled to their frame,
  solid when shut, swing on E; bank, store and inn doors start open, private houses stay shut and answer
  a knock. `tests/playtest/geometry.py` (+ `geometry_helpers.js`, in CI via its `# ci` first line) is
  the automatic geometry audit: floating, clipping, door fit, collider coverage both ways, window
  density, texture stretch, plus a canary that must catch deliberately broken pieces. It scans whatever
  the world and dungeon contain (Batcher logs, tagged meshes, `colliders.doors/buildings`), so new
  props are checked for free; a FAIL line names the piece and its position.
  The town (`ashford.js` plan, `townkit.js` street furniture, `village.js`) obeys the same rules:
  kit props go through `#prop`/`placeProp` (solids table, `floor` tops), `Lantern_Wall` and doors come from
  the building rules, stall goods are packed onto the counter by `#goods`, and every `TownKit` method
  calls `begin(label, x, z)` so the audit can group its meshes (soft things such as crops and washing
  are walk-through; pass `on` for a piece resting on another). `TownKit.put` fits UVs to the material's
  kit tile size (`TILE`), so new furniture gets un-stretched brick and wood by default. The audit also
  fails a piece of furniture whose parts don't touch (a hovering lantern or beam) and walls with a gap under
  them on falling ground. Kit props using the page material (`Scroll_*`, `Book_*`) fail `look.py`: leave them out.

## Next

After these, the player picks from: more skills (Prayer, Firemaking, Thieving), a new
region, day/night and weather, more quests.
