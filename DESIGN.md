# Aldermere — design (working title)

A single-player world you live in: OSRS-style skills and long goals, skill-and-timing
action combat, one designed continent seen over the shoulder. Claude keeps building it
between sessions, carefully.

The earlier prototype (Hollowreach, a top-down Diablo-style loot game) lives in git
history at `b339c22`. Its post-processing, synthesized audio and procedural item-model
code can be reused; its design direction is retired.

## Decisions from the player

| Topic | Decision |
|---|---|
| Camera and controls | Locked third-person over the shoulder. Mouse captured with a crosshair, WASD relative to the view, **E** interacts with what you look at, Esc frees the mouse. |
| Combat | Lots of action combat built on skill and timing: dodges, blocks and parries, perfect hits, readable enemy tells. Free aim plus lock-on. |
| Combat progression | OSRS skills (Attack, Strength, Defence, Ranged, Magic, Hitpoints). Gear tiers are gated by level: bronze, iron, steel and up. |
| Items | No constant swapping and comparing. Gear moves in clear tiers at OSRS pace, and rare drops are events. |
| Rare hunting | Bosses with drop tables (1/100 to 1/5000), a collection log, skilling pets. |
| First skills | Woodcutting, Mining, Fishing, Smithing, Cooking, Crafting, Fletching, plus the combat skills. |
| Grind | OSRS-long: an exponential XP curve to 99, and always a clear next goal. |
| World | One fixed, designed continent that moves through regions (farmland, forest, desert, snow, marsh). Dungeons are procedural with real layouts. The outdoors has to be well made. |
| Mood and look | Cozy and fairly bright, with realistic lighting and textures. |
| Quests | Real written quests plus small everyday jobs. Claude adds more between sessions; it must never feel sloppy, slow or annoying. |
| Talking to NPCs | Dialogue options, plus the option to type freely (Claude answers in character). |
| Death | Respawn at the nearest safe haven (for now). |
| Inventory | 28-slot backpack plus banks, with quality-of-life touches (Claude's call). |
| Character | Whatever free art looks good. |

## Pillars

1. **The grind is great.** Every skill has a visible unlock table, so you always know the next
   milestone (a new tree, a new bar, a new tier of gear). Gathering and making things should
   feel good second to second: sound, animation, the pop of a level-up.
2. **Combat is a skill.** Enemies telegraph, and you answer with dodges, blocks, parries and
   well-timed hits. Levels and gear matter, but a good player beats a bad fight.
3. **A world worth living in.** Towns with banks and specialist NPCs, roads, rivers,
   landmarks, weather and time of day. Walking somewhere should be pleasant.
4. **Rare things are rare.** Few drops, clear tiers, and the jackpots (boss uniques, pets)
   are real events you remember.
5. **It keeps growing, carefully.** New regions, quests and bosses arrive between sessions,
   written in the game's content grammar and playtested before they ship.

## First playable slice

- **Ashford and its surroundings:** a village with a bank, general store, smithy (furnace
  and anvil), cooking range and fishing dock; farmland, a forest (normal, oak and willow
  trees), a river and a lake, a hill mine (copper, tin, iron), a bandit camp and a cave.
- **Skills:** the seven first skills plus the combat skills, with the OSRS XP curve,
  resource nodes that deplete and respawn, and a skill guide per skill.
- **Combat:** sword and shield first (light and heavy attacks, block, parry, dodge roll,
  lock-on), then bows and magic. Three or four enemy types with distinct tells.
- **A procedural dungeon** under the hill with a boss, a drop table and a collection log.
- **People:** dialogue with options and free typing, two quests, shops.

## Content grammar (how Claude adds things without making a mess)

Content is data. People, dialogue, quests, shops and the lore villagers know live in
`src/content/`; items are in `src/game/items.js`, skilling tables in
`src/game/content.js`, and monsters and drop tables in `src/game/combat.js`. Adding
content means adding rows, not new code, unless it needs a new mechanic, and then the
mechanic comes first (quest mechanics live in `src/game/quests.js` and are named by
the quest data).

| Kind | Must define |
|---|---|
| Item | id, name, slot, tier, requirements, stats, model recipe, value |
| Skill action | skill, level, XP, inputs, outputs, tool, node or station, timing |
| Resource node | skill, level, depletion and respawn, drop, visual |
| Enemy | stats, attack patterns with telegraph timings, drop table, model and outfit |
| Drop table | always, weighted main table, rare table with 1/N odds, pet odds |
| NPC | name, role, look, where they stand, persona sheet for typed chat, dialogue tree |
| Shop | owner, stock rows (some unlocked by quests), what it buys |
| Quest | giver, steps (tracker line, journal text, map goal), spots and mechanics it adds, quest drops, rewards |
| Region | map layout, terrain and biome, towns, nodes, spawns |

## Art sources (all free for any use)

- **Quaternius (CC0):** Universal Base Characters, Modular Character Outfits (Fantasy),
  Universal Animation Library 1 and 2 (the free Standard sets: 86 clips on one rig, 56 shipped),
  Medieval Village MegaKit, Fantasy Props MegaKit, Bestiary Dungeon Monsters.
- **Composed clips (CC0, built here):** the sword guard (`Sword_Guard_Loop`), a blow landing on it
  (`Sword_Guard_Hit`) and a tighter dodge roll (`Roll_Tuck`, the library roll without its long flat
  dive) are assembled from pieces of Quaternius clips by `scripts/compose-clips.mjs` into
  `anims/combat.glb` (the library has no holdable sword guard).
- **Poly Haven (CC0):** terrain and building textures, HDRI skies, rocks.
- **ez-tree (MIT):** procedural trees with real bark and leaf textures.

`scripts/fetch-assets.mjs` downloads and optimizes them into `public/assets/`;
`public/assets/CREDITS.md` lists them per folder.

**Animation sources checked (Sept 2026)**, for sword-and-shield combat. The repo is public, so only
licences that allow redistribution qualify.

| Source | Licence, access | Rig | Verdict |
|---|---|---|---|
| Quaternius UAL 1 + 2, Standard | CC0, free, no login | ours | In use. The free set is exhausted for sword work: 3 light slashes (+ recoveries), a heavy, a spinning heavy combo, a dash, one block, shield idle/break/bash, one roll, 3 hit reactions. No strafes, dodges, parry or riposte. |
| Quaternius UAL1 Pro ($9.99) / UAL2 Source ($14.99) | CC0, paid on itch | ours, no retargeting | Best upgrade: side dodges, 8-way jog and walk strafes, hit reactions (shoulder L/R, stomach), sword draw and sheathe, newer Sword_Light combos with recoveries, sword uppercut and ground pound. Needs the owner to buy. |
| KayKit Character Animations 1.1 | CC0, free, no login | KayKit Rig_Medium, retargeted by `scripts/retarget.mjs` | Not shipped. Retargets cleanly (1H attacks, block/block hit, 4 quick dodges, strafe runs, hits), but made for chunky toy proportions: arms held wide and a stiff upright body on our people. `fetch-assets.mjs kaykit` rebuilds it for the lab. |
| Mixamo "Pro Sword and Shield Pack" | free with an Adobe account; may ship inside a game, not as raw files | Mixamo, needs retargeting | Best free-with-account set (slashes, attacks, block and block idle, impacts, strafes, draw/sheathe). Owner's call. |
| Kevin Iglesias, Human Melee Animations FREE | pay-what-you-want; licence not stated | Unity humanoid | Out (unclear licence; one attack per style, no block, parry or dodge in the free part). |
| MoCap Online, T.C. Sword free pack | free; MoCap Online EULA (not open) | UE/FBX mocap | Out unless its EULA allows raw files in a public repo. |
| CMU mocap (RancidMilk conversions), Bandai Namco dataset | free / CC BY-NC-ND | various | Out: no sword combat, or no derivatives allowed. |

## Roadmap

- [x] M1 World and feel: sky and sun, terrain, water, trees and grass, the village, the
      third-person controller, an animated character
- [x] M2 Skills: gathering and production loops, inventory, bank, XP, skill guides
- [x] M3 Combat: melee with tells, lock-on, dodge, block and parry; bows (drawn with an
      aim pose built from IK) and strike spells with runes and staves
- [x] M4 Dungeon and boss: procedural layouts, boss, drop tables, collection log, pets
- [x] M5 People: dialogue (options and typing), two quests, shops
- [ ] Then: more regions, skills and bosses, added between sessions

## Ashford v2 (the town plan)

The owner's note on the first village: buildings on a ring, barrels and crates dotted about, "too
circular". Ashford is now a small walled market town, laid out like one. The plan lives in
`src/world/ashford.js` (pure data, read by the terrain baker, the village builder, the workstations,
the NPCs and `tests/playtest/town.py`); `node scripts/town-plan.mjs` draws it top-down
(`docs/town/plan.jpg`). Coordinates: +x east, +z south; the terrace is level at y 3.2.

**Shape.** A squarish town, about 92 m each way with cut corners, inside a wall: low stone wall on
the north and east (towards the mine road and the river), clipped hedge on the south and west
(towards the farms and the woods). Three gates, one per road, each with stone piers, lanterns and an
"ASHFORD" board: north (Quarry Road, to the mine), east (Bridge Street), south (Lake Street). Two small
gaps: a farm gate (south-east, trodden track to the flax field) and a garden gate (west end of Wren
Lane, woodcutters' track to the forest). The ground is graded to the wall line, not a circle.

**Streets.** The spine is Lake Street, running north from the south gate to the market square and
ending on the bank, so the spawn (just inside the gate) looks up a cobbled street between tight rows of
gable-fronted houses, past a well and stalls, to the bank. Bridge Street leaves the square's east side
to the east gate. Quarry Road enters the square's north-west corner and runs north to the north gate.
Church Lane climbs from the square's north side to the chapel. Two earth lanes cross Lake Street at a
signposted crossroads: Wren Lane (west, houses and gardens) and Stable Lane (east, barn and farmyard).

**Districts, and why.**
- *Market row* (the civic heart): the square is a paved rectangle, 32 x 24 m. Bank on the north side
  on the axis of Lake Street; general store on the west; the Crooked Pike inn on the north-east
  corner. Six stalls stand in two facing rows either side of a wide aisle, with the well between
  them (Mirelle's rune cart is the first stall in the west row). Bank, store and inn are a few steps
  apart, so the trading loop is short.
- *Craft quarter* on the square's south corners, open-fronted so the work is on show: the smithy
  (furnace and anvil) on the south-east corner; the potter's workshop (spinning wheel, potter's wheel,
  workbench) on the west side with the kiln in the alcove between it and the store.
- *Cooking range* is the communal hearth in front of the inn, ringed with benches, where Bess's cooking
  would be done.
- *Residential lanes*: cottages of varied width, depth, height and stone or plaster along Lake
  Street, Quarry Road and Wren Lane, each with a wall lantern at the door, gardens behind with fences,
  washing lines and woodpiles; allotments (beans, cabbages, herbs) west of Quarry Road.
- *Chapel on the rise*: a stone chapel with a bell tower on a gentle 1.4 m rise at the end of Church
  Lane, in a walled churchyard with a lych-gate and graves. It shows above the roofs from the spawn.
- *Working edge*: stable and watch house by the east gate (Garrow's post), toll house by the north
  gate, barn, stable, farmyard, hay cart, haystacks and pump by the farm gate, a hay paddock. The dock is
  outside the wall at the end of the lake road, with its crates and barrels by Old Tam.

**Props with a reason.** Lamp posts every ~12 m per side down Lake Street, Bridge Street, Quarry
Road and at the square's corners; wall lanterns at every door; barrels and cask racks only at the inn,
the cooper's, the smithy and the store; crates and apples at the store; pots at the potter; benches at the
inn, the hearth, the well, the bank, the churchyard; troughs at the smithy, the stables and the farm;
signposts at the square, the crossroads and each gate. Nothing is scattered: `town.py` fails any prop
more than 3.5 m from a building, street, fence, wall or stall.

**People.** Aldwyn in the bank, Maren in the store, Bess in the inn, Brom in the smithy, Ysolde at her
wheel, Mirelle behind her rune cart, Garrow at the east gate, Old Tam at the jetty. Wenna strolls a loop
of the market stalls and Hob shuttles between the hearth and the well.

**Kept.** Roads keep their far endpoints (mine, bandit woods, jetty), the mine and cave did not move,
building generation and colliders are untouched.
