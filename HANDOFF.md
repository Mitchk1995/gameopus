# Hand-off (updated 2026-09-29, Opus session "Game continuation")

Read this first, then `CLAUDE.md` (how to work, code map, systems) and `DESIGN.md` (the owner's decisions).
This file is the current state; rewrite it at the end of every session.

## The owner and how to work with them

- Mitchell owns Aldermere: a game designer who does not care about programming or GitHub. Talk only in
  game terms, short, no jargon. They zone out otherwise.
- Standing rules: automate everything git-related and don't ask; turn on Auto-fix for every PR you open
  (per chat, so re-enable it for PRs still open); helper agents in parallel are welcome, but a burst of
  five Opus helpers hit the usage limit once: keep about three running, Sonnet for mechanical work.
- They playtest by playing and send screenshots and notes. Their notes outrank everything below.
- Their bar is high and explicit: "make sure these type of mistakes don't happen again", "we need character
  and originality and great map design", "never use default icons ... custom artwork using painting for
  everything", "model ... using a reference image", "we don't want to copy games ... make our own thing".

## How work is done now (the owner asked for this after sloppy results)

1. Reference first: before building any kind of thing, look at real reference photos (Wikimedia Commons)
   and write down what makes it recognisable; build to match at human scale.
2. A CRITIC agent (Opus) walks the game at eye level and writes findings with ids, severities, locations,
   the fix, the code, and a screenshot; it never fixes anything. Builders fix; the critic re-checks.
   Nothing reaches the owner until it passes. Reviews so far: branch `critic-town-1`
   (`docs/critic/town-2026-09-29.md`, 46 findings) and `critic-world-1`
   (`docs/critic/world-2026-09-29.md`, 54 findings). Use the same prompt shape for later passes.
3. Each recurring kind of mistake gets an automated check (FAIL lines in `town.py`, `geometry.py`,
   `world.py`, `npc_looks.py`, ...) proven by breaking a case on purpose.
4. Before handing the owner a build: `npm run package` in `D:\diablolike` on up-to-date `main`, then
   `node scripts/smoke-app.mjs` (throwaway profile). The game lives at `release\Aldermere\Aldermere.exe`.

## On main (merged today)

Combat aim and flow; the walled market town (Ashford v2) with doors, windows, kiln, solid props and the
geometry audit; camera v2 (collides with real triangles; shut doors block it); per-scenario parallel CI
(repo is public now, Actions minutes are free); stable app folder; old-layout saves start at the gate;
playtest fixes (no text selection, snappier roll, no lunge on swings, shop right-click); animations
(upright guard + hit reaction, clean finisher, tighter roll, from free CC0 clips); cleanup PR #18.

## In flight

- Branch `world-v2` (PR #15, label `hold`) is the integration branch for the next build. It has the new
  valley (river, falls, fields, woods, mood), landmarks and bandit fort, the three sealed ways out with
  notices, signposts and cairns, the bridge, villager looks (no one dresses like the player), and fixes.
  `LAYOUT` in `map.js` is 3 (bump again only after it ships and the land moves again).
- Being built on branches off `world-v2` (merge them in, re-bake with `node scripts/bake-world.mjs`,
  run the full scenario list, then send the critic round again):
  - `town-grounds`: town edge, gardens, square, well, crops, hay, lighting, dock and mine mouth (town
    critic findings E, G, S, O2, O3) plus recurring checks.
  - `town-buildings`: floors, chapel precinct, bank/store/inn/barn/stables with character, forge, house
    variety (no shutters, new windows, varied roofs, a landmark market hall) (findings B1-B13).
  - `vale-polish`: the world critic's findings (mountains, landmark visibility, roads on the finished
    ground, site pads where their stories work, dock, bridge ends, real passes, camps, ground cover,
    waterfall) plus recurring checks.

## Waiting on the owner

- "Make it our own": a proposal to replace RuneScape copies (skill names, 1-99, bronze-to-rune tiers,
  runes, the shrimp-to-shark fish ladder) with our own: Swordplay, Guard, Archery, Weaving (ley stones in
  a focus), Vigour, Forestry, Delving, Angling, Hearthcraft, Bowyery; levels 1-50 with a named rank every
  10 that unlocks something; bronze/iron/steel then blackiron and moonsilver from beyond the passes;
  local fish. Asked in chat; no answer yet. Wave 2 content depends on it.
- Animations: the free Quaternius clips are used up. Recommended: the owner buys Quaternius Universal
  Animation Library 1 Pro ($9.99) + 2 Source ($14.99), CC0, our exact rig (strafes, directional dodges,
  draw/sheathe, more attacks). They drop the zips in `D:\diablolike`. Alternative: Mixamo (their Adobe
  account). `scripts/retarget.mjs` and `tests/playtest/anim_sheet.py` exist for this.
- Blender: not installed. Offered to install it so helpers can model properly; no answer yet.

## Next, in order

1. Integrate the three branches above into `world-v2`; critic re-check of town and world; fix; lift
   `hold`; rebuild the app; tell the owner what to try.
2. Wave 2: give every site a reason (the world critic's table: waystation hub, climbable beacon with a
   view over the wall, Standing Stones altar, sawmill, quarry foreman starting the North Pass quest, cave
   behind the falls, crypt under the abbey, headframe as the Warren's back door, lakeside hamlet with
   boats, barrows on the battlefield, animals and travellers), in the owner's "our own" terms.
3. Parry timing ("split reaction times ... with parries"): a tight perfect-parry window with clear
   feedback, readable enemy tells, stagger and riposte rewards, harsher late blocks.
4. UI and icons: custom painted artwork everywhere (no default icons), better 3D item models built from
   references.
