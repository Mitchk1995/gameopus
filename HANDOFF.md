# Hand-off (written 2026-09-29 at the end of a long Sonnet 5.5 session)

Read this first, then `CLAUDE.md` (code map, how to test) and `DESIGN.md` (the owner's decisions).
Some "Open feedback" lists in CLAUDE.md are stale after many merges; trust this file for what's
current and clean CLAUDE.md up when the open PRs below have landed.

## The owner and how to work with them

- Mitchell owns Aldermere. They are a game designer and **do not care about programming or
  GitHub**. Talk to them only in game terms: how it plays, what you see, what changed for the
  player. Short updates, no jargon (no "PR", "CI", "merge", "collider", "shard" without a plain
  translation). They said they zone out otherwise.
- **Standing rules from the owner:** automate everything git-related and don't ask (branches, PRs,
  merging); turn on **Auto-fix** for every PR you open (the app's CI-monitor switch; it is per chat
  session, so re-enable it in a new chat for the open PRs); they are happy for you to run teams of
  helper agents in parallel. If the safety layer blocks a merge as "merge without review", the owner
  has already said in chat, "yes merge, always automate it, don't ask me"; the automation below
  normally does merging so you rarely need to.
- They playtest by playing and take notes; after "everything on the docket" is done they will
  playtest and send notes. Ask them how jog, run, jump and swing-while-moving feel (nobody has felt
  them in a real window yet, everything was verified headless).
- Their machine: Windows 11, project at `D:\diablolike`, repo `Mitchk1995/gameopus` (private),
  `gh` logged in with repo and workflow scopes. npm 11 skips Electron's download step (see the
  Run section of CLAUDE.md for the manual fix).

## Controls decided this session

WASD jog, hold Shift to run, tap Shift to dodge-roll, Space to jump, Z/CapsLock toggles walk, C is
the collection log (so dodge is not C). Swinging while moving keeps you going at 70% jog speed.

## Automation that exists

- `.github/workflows/ci.yml`: builds, checks combat numbers, then plays every headless scenario whose
  first line is `# ci` in four parallel groups. `# ci paths=a/,b/` makes a slow scenario run only when
  a PR touches those prefixes (camera and look use this). A final job named `playtest` is the
  one check that summarises them.
- `.github/workflows/automerge.yml`: merges any open PR from the owner into `main` when `build` and
  `playtest` are green and it has no conflicts (hourly, and whenever CI finishes). **Label a PR
  `hold` to stop it** (world-v2 is meant to carry `hold` until someone has looked at its screenshots).
- `npm run sync` pulls/pushes; `npm run app` opens the game in its own window;
  `npm run package` builds `release/Aldermere/Aldermere.exe`.
- To make an open PR re-run CI on the latest workflow: `gh api -X PUT repos/Mitchk1995/gameopus/pulls/N/update-branch`.
- Helpers' scratch copies live under `.claude/worktrees/` (git-ignored). On Windows, a temporary
  worktree can't be deleted while a shell is inside it; `cd` out first, remove a junction before the
  folder that contains it, then `git worktree prune`.

## What is on main (merged)

Snappy jog and run; jump; tap-Shift dodge; fluid combat (swing while moving, cancel with jump or
dodge); richer textures on buildings and people; a first camera fix (no more going through
ceilings and walls); the desktop app; the sync script; parallel, path-aware CI; automerge.
Check `git log origin/main` for the truth.

## In flight when this session ended (check `gh pr list`)

- **Combat aim and flow** (`combat-aim`, PR #10): every swing starts in ~0.05 s, aims at the
  crosshair (also while jumping, which used to swing over his head), left-right-left chain, clean
  resets, plus a fix for poses piling up on bones. Waiting only for CI.
- **Building quality** (`building-quality`, PR #12) **already contains the town redesign**
  (`town-redesign`, PR #11 is the same work and will show as merged or can be closed): walled market
  town (Lake Street, rectangular square, districts, gates, chapel, lanes), real doors that fit and
  open with E, sane windows, solid props (jump on benches; lanterns collide), a brick kiln, market
  goods on counters, and the automatic geometry audit (`tests/playtest/geometry.py`).
- **Camera v2** (helper `camera-v2`): smoother doorways and a universal roof fix (Maren's house).
  See the PR or branch `camera-v2` for status; the helper was asked to wrap up and report.
- **World v2** (helper `world-v2`, PR opens with label `hold`): the Vale as the start of a real map.
  Three sealed exits (North, East, South passes), a bridge on the east road, road hierarchy with
  switchbacks and signposts, danger rings, four landmarks (beacon tower, mine headframe with smoke,
  lantern dock, ruined abbey), a real bandit fort, river source, biome variety, and a `POIS` list of
  empty pads for wave 2. The design is written in DESIGN.md ("Ashford Vale v2") with a done/not-done
  checklist; the helper was asked to wrap up early, so expect it to be partly built.

## Next steps, in order

1. Make sure every open PR merged (or fix what CI says). Then clean up CLAUDE.md into one current
   list and drop stale "Open feedback" sections.
2. Rebuild the desktop app from main (`npm run package`) and tell the owner to double-click
   `release\Aldermere\Aldermere.exe`. Saves in the app are separate from the browser's. The exe that
   exists now is older (movement, combat, textures, camera v1; no town, buildings or combat aim).
3. Review world-v2 yourself with screenshots (top-down of the whole vale, each exit, bridge, landmarks,
   fort, spawn view); lift `hold` when it reads as a place with places to go.
4. Wave 2 of the world: fill the `POIS` pads with sites that each have a reason (skill node, quest
   hook, loot, or lore): hermit's hut, standing-stones shrine, sunken ruin in the lake shallows,
   waystation inn, quarry, sawmill on the river, fishing hamlet, old battlefield. Use the content
   grammar in DESIGN.md; add a scenario marked `# ci paths=...`.
5. Polish list found in QA: wall lanterns overlap shutters on some house fronts (extend the audit to
   check lantern vs window/shutter); every roof is the same orange (vary tint per building in
   `buildings.js`); 5 m streets are tight for the camera; no animals anywhere; the camera jumps in to
   the head when you back into a wall; the finisher arches his back up to 50 degrees (tune, or bring
   back the two-part spin); no strafe animations, so side-steps during swings use the forward jog.
6. Playtest notes from the owner come next; prioritize their feel feedback over everything above.

## Owner feedback from this session and where each item stands

| Owner said | Status |
|---|---|
| Jog for regular, run for sprint | done (main) |
| An attack doesn't swing immediately | done (PR #10) |
| Jump attack swings above his head; attacks should hit the crosshair | done (PR #10) |
| Attacks should flow side to side and reset properly | done (PR #10) |
| Pottery kiln stretched textures / weird shape | done (PR #12) |
| Can't jump on a bench, lanterns don't collide, collision missing on props | done (PR #12) |
| Camera jitters in doorways | camera v2 (see above) |
| Maren's house roof clips the camera; wants a universal fix | camera v2 |
| Market stall items clip through geometry | done (PR #12) |
| Auto checks for clipping and floating geometry | done (PR #12, `geometry.py`) |
| Town is circular with random barrels and crates | done (town redesign, in PR #12) |
| Too many windows and shutters, odd placement | done (PR #12) |
| Doors clip, don't fit frames, no interaction or collision | done (PR #12) |
| "An area surrounded by trees and mountains is not a game" | world v2 (in progress), then wave 2 |
| Wants a standalone app, no browser UI | done (Electron, `npm run app` / `package`) |
