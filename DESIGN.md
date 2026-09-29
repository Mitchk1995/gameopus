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
  Universal Animation Library 1 and 2 (86 clips on one rig), Medieval Village MegaKit,
  Fantasy Props MegaKit, Bestiary Dungeon Monsters.
- **Poly Haven (CC0):** terrain and building textures, HDRI skies, rocks.
- **ez-tree (MIT):** procedural trees with real bark and leaf textures.

`scripts/fetch-assets.mjs` downloads and optimizes them into `public/assets/`.

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

**The buildings, and what they are drawn from.** Ashford is a market town of ash woods under the
mountains, built the way northern European towns were, in its own palette. No two neighbours match.
- *Jettied town houses* (Lavenham, Weobley): timber frames, the upper floor oversailing the street on
  joists and a moulded beam, plaster in limewashes (cream, white, ochre, Suffolk pink, sage, russet),
  eaves or a gable to the street, weathered clay peg tiles in three reds and browns.
- *A tall narrow house and a crooked one* (Rothenburg, Lavenham's Crooked House): three storeys on a
  4 m front; a gable-fronted house whose upper floor leans.
- *Stone cottages* (Cotswolds): honey or grey rubble to the eaves, stone slate roofs, stone-mullioned
  windows under hood moulds, gabled dormers, stacks on the gables, a date stone (1487) over one door.
- *Thatched cottages*: one storey under thick reed thatch with a mossy ridge roll.
- Every house has a painted door, leaded windows (diamond panes in the timber houses, small squares in
  the stone ones), no shutters and no arched windows (the owner's call). Carved bargeboards with an
  ash-leaf motif are Ashford's own.
- *The trades say what they are*: the bank is a barred stone counting house with its name cut over a
  heavy door under a slate canopy; the store lets its windows down as counters with goods; the Crooked
  Pike has a big painted pike on a bracket, a yard arch and a fire in its hearth; the smithy a real forge
  and chimney; the potter's a display of turned pots; the barn weatherboard, big doors and hay; the
  stables half doors; the toll house a board of tolls; the watch house a bell.
- *The chapel* (Heath Chapel, West Itchenor): a small stone church laid east and west, west tower with
  louvred belfry, bell and slate spire, nave with round-headed lights and buttresses, lower chancel; a
  grass churchyard with a lych-gate (oak frames on sleeper walls under a slate roof) and graves in rows.
- *The market hall* (Ledbury): black-and-white on oak posts over an open market floor, cupola and
  weathervane, on the square's east side where the view down Bridge Street ends on it.

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

## Ashford Vale v2 (the region plan)

The owner's note on the first version of the valley: "an area surrounded by trees and mountains in the
distance is not a game lol. It is kind of ridiculous that this is even an area." It was a scenic bowl:
an 800 m valley, a ring of mountain wallpaper, an invisible clamp at the edge, a river with no source, a road
that stopped at the water. Nothing pulled you outward. Vale v2 keeps the town, the mine, the lake, both
camps and every quest spot where they were, and makes the valley the first region of a real map:
**it has walls you can see, three named ways out that are clearly meant to lead somewhere (all sealed for
now), a hierarchy of roads that go places, rings of danger with their own look, and landmarks you
can see from the square that make you want to walk to them.**

Coordinates: +x east, +z south, y up, water at y = 0. The data lives in `src/world/map.js` (`EXITS`,
`POIS`, `ROADS`, `NODES`, the rim, the rings); `node scripts/vale-plan.mjs` draws it top-down
(`docs/world/plan.jpg`), and `node scripts/bake-world.mjs` bakes the height and ground maps from it.

```
                        NORTH  (dwarf mountains, snow)
       . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
     . ^^^^^^^^^^^^^^^^^^^^[N PASS]^^^^^^^^^^^^^^^^^Falls^^^^^^^^^ .
    . ^^^                   ||  Highroad                |  ~ river   ^^^ .
   . ^^^   MINE HILL        ||                     ABBEY      ~        ^^^ .
  . ^^  [headframe+smoke]   ||   .-'-.     ruin on   HILL      ~   [quarry]^ .
  .^^   (Old Warren mouth)--'   /valley\   the crown           ~ BEACON RIDGE ^ .
  .^   .. quarry road ..       col       .. footpath ..        ~   . [sawmill]  ^ .
 W.^   GOBLIN WOODS   [goblin camp]      stones o o o          ~      .  ^
 E.^ dark oak / ash /pine  ..  [Ashford]= = = = = = = = BRIDGE ==~== [beacon tower]
 S.^   [hermit]  woodcutters   (walled  ) Bridge Street          ~  farms  waystation .
 T.^^        track ....... . (  town    )                         ~ fields   |   [fort]== E PASS
  .^^^   birch grove   .   Lake Street                          ~     old      |  BANDIT COUNTRY
   .^^^^        .  .  .  [fishing hamlet]                     ~   battlefield  |    (gatehouse)
    .^^^^^ marsh  [dock][lighthouse]                        ~ ~                  |
     .^^^^^^ (sunken ruin) LAKE ~~~~~ .. Harbour Road ..~ ~                     |
       .^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^[S PASS toll bar]^^^^^^^^^^^^^^^^^^^^^^^^^^
                        SOUTH  (the sea, Saltmere harbour)
```

**The rim.** The mountains are a real wall now: a cliff face, then ridges, then snow. The foot of the
wall is a hand-drawn line (`RIM` in map.js) so the shape is designed, not noise: buttresses and coves, a cove for
the river's falls in the north, a lake that laps against the south cliffs. The last 60 m before the map
edge are always sheer rock or deep water, so the map edge is a place you can't reach, not a wall of air.
Three passes cut through it, each a gorge with cliffs on both sides:
- **North Pass (the Highroad, to the dwarf mountains).** From the quarry the Highroad climbs the valley between Mine
  Hill and Abbey Hill and switchbacks up the wall to a stone tunnel portal. The tunnel has collapsed: rubble fills it
  and the Delvers' notice tells you why. The Old Warren under Mine Hill is the way the goblins got at the props.
- **East Pass (bandit country, to Redwater Keep).** Bridge Street runs over the bridge, through the farms, past the
  waystation and the bandit fort, into a gorge that a barred gatehouse closes. The Warden's notice says it stays shut
  while the bandits hold the road.
- **South Pass (the Harbour Road, to Saltmere).** Lake Street ends at the dock; the Harbour Road follows the
  lakeshore round to a toll bar across a rock shelf. The toll keeper's notice says why the road is shut.
Each exit is a row in `EXITS` (id, position, facing, closure kind, sign text, `locked: true`), so a quest that
sets `locked: false` opens the way (`world.sites.setLocked(id, false)`).

**Roads (a hierarchy you can read on the ground).** Cobbled main streets inside the town; wide dirt roads
gate to gate (Quarry Road and the Highroad, Bridge Street and the East Road, Lake Street and the Harbour Road);
narrower tracks for farm lane, woodcutters' track and the ridge track; footpaths to camps and sites. Roads follow the
contours and climb in switchbacks, they are cut into slopes, and they ford or bridge the river: **the bridge is real**
(a stone arch, walkable deck, parapets, colliders). Every junction has a signpost with destinations and distances,
computed from the road graph, so a sign never lies. Danger boundaries have warning posts.

**Rings of danger.** Each ring has its own ground, plants and light:
1. *Town* (safe): cobbles, lamps, warm light.
2. *Farmland and meadow*: bright grass with flowers, golden fields, hedgerows, lone oaks, birch stands. Clear light.
3. *The woods, goblin country* (west and north-west): dark mossy floor, dense oak, ash and pine, cool green mist.
4. *Bandit country* (east): scorched dry grass, pines and dead snags, a fort with a palisade and a watch tower on a rise, hazy amber light.
5. *Mine Hill and the Old Warren* (north-west): bare grey rock, scree and spoil heaps, a smoking headframe, cold grey light.
Around the edges, *the wall* (cliffs) and *the passes* (bleak, windy, snow on the ridges).

**Landmarks you can see from the square** (each a distinct silhouette, built from kit pieces and procedural geometry):
the **beacon tower** on the knoll at the far end of Bridge Street, the **mine headframe with its smoke plume** on the
north-west hill, the **ruined abbey** on Abbey Hill straight up Lake Street over the bank, and the **lighthouse** and
**lantern-lit dock** on the lake to the south.

**The land tells its story.** The river is born at Whitespring Falls under the north cliffs, runs down the east
side of the vale past a sawmill site, under the bridge, through the farms, into the lake. The lake has a
reed marsh on its west and south-west shores. Inside the vale there is meadow, a birch grove, a rocky heath
with a standing-stone hill, the marsh, farmland, woods and dry scrub, each with its own ground texture and trees.

**Anchors for the points of interest** (`POIS` in map.js: flattened pads with roads or footpaths to them, a cairn or
post on each, no buildings yet): hermit's hut, standing-stones shrine, sunken ruin in the lake shallows,
waystation inn, stone quarry, sawmill on the river, fishing hamlet, old battlefield.

**Deliberately not done here.** No new enemies (the two camps are re-dressed, not moved); no other regions
behind the passes (they are sealed and end in rock); quests only got new geography in their text, no new steps.

The real layout, drawn from the data: `docs/world/plan.jpg` (exits red, points of interest yellow, landmarks
blue, junction posts white squares); a 3D overhead is `docs/world/overhead.jpg`.

### Status (first session; the branch is a work in progress)

Done and checked:
- [x] Terrain shape in `map.js`: the rim wall (`RIM`, stepped face, spurs, named peaks), Abbey Hill, beacon knoll and
      east ridge, fort rise, mine hill, rocky-heath bumps, marsh band; river with a real source pool at the north cliffs
      and a course to the lake; the lake nestled against the south cliffs. Reachability by foot stays inside the wall
      (checked in Node, `.scratch`-style flood; a proper `world.py` check is still to write).
- [x] Road network as data (`ROADS`: 22 roads in three classes) with cut-and-fill profiles that follow the land at a gentle
      grade, junction detection and signpost boards computed from the roads (`JUNCTIONS`), warning posts (`WARNINGS`).
- [x] `EXITS` (north tunnel, east gatehouse, south toll bar, all `locked: true`, with notice text) and the gorge
      carved beyond the east and south closures; `POIS` (the eight pads, flattened, each on a path); `LANDMARKS` positions.
- [x] Biome maps baked (`biome_a.png`, `biome_b.png`) and read by the terrain shader (meadow flowers, heath stone, dark wet
      marsh, scorched dry scrub, mossy woods, sooty mine spoil, cliff strata).
- [x] The stone **bridge** on Bridge Street (arch, humped walkable deck, kerbs, timber rails, lamps), through `SiteKit`
      (`sitekit.js`, `bridge.js`, `sites.js`); passes the geometry audit; `town.py` still passes.
- [x] `scripts/vale-plan.mjs` (top-down plan, `--box`/`--px` for zoomed crops, `--ascii`).

Not done yet (next steps, in this order):
- [ ] **Closures** (`exits.js`): collapsed-tunnel portal with rubble, barred gatehouse, toll bar with hut; colliders at least
      2.4 m tall so they can't be hopped; `world.sites.setLocked(id, on)`; notice interactables (`station: 'sign'` in
      `game.js` `#station`, shown with `talk.show(..., { kind: 'narrate' })` like the wrecked cart). The gorges beyond the
      east and south closures need the `w` (floor half-width) widened to about 11 m at the closure so towers stand on level ground.
- [ ] **Signposts** (`waymarks.js`): one post per `JUNCTIONS` row using `TownKit.sign`, the `WARNINGS` posts, a cairn and name
      board on every POI pad.
- [ ] **Landmarks** (`landmarks.js`): abbey ruin on Abbey Hill (long south wall with pointed windows, tower stump, gable end),
      beacon tower with a fire on the knoll, mine headframe + boiler shed + smoke plume at `LANDMARKS.headframe`,
      lighthouse on the east shore and lantern posts along the jetty. Check by screenshot that three show from the spawn or square.
- [ ] **Bandit fort** (palisade radius ~19 m round `BANDIT_CAMP`, west and east gates open, watch tower; `fight.js` is off limits
      and keeps its tents and fire) and goblin camp re-dress (stake arcs, totems) in a new `fort.js`.
- [ ] **River source** (waterfall ribbon + spray at `FALLS`), reeds in the marsh, tree kinds per ring (`forestDensity`:
      birch groves, willows, dead pines, heath gorse), keep trees off roads/pads/closures, farm fences and fields.
- [ ] **Mood** per ring (fog colour and distance, sun tint, exposure blended by `rings(x, z)` each frame, cheap uniforms only).
- [ ] Minimap: roads by class, exits, POIs. Lore/people/quest text for the new geography (`lore.js`, `people.js`).
- [ ] `tests/playtest/world.py` (first line `# ci paths=src/world/,src/content/,src/game/,public/assets/world,tests/playtest/world`):
      reachability from the spawn to every gate, the bridge, closures, mine mouth, dungeon entrance, camps, dock and POI pads;
      nothing reachable within 60 m of the clamp; river wet from source to lake; nothing inside roads/pads/bridge; a sign at every
      junction; `locked` flags. Then the full regression (every `# ci` scenario, quest_*, bank_fish_cook, mage_shop, chat,
      dungeon, ranged, magic, bow_pose, packed_page, `npm run build`, `npm run artifact`).
- [ ] Street-level and ridge-level screenshots of each exit, landmark and the fort into `docs/world/`.

Known problems to fix on the way: the south end of the lake can be walked to about 5 m past the 326 m line (the lake carve
softens the cliff there), the east and south passes are perfectly smooth V-notches, the mountain faces show vertical
"pleats" (add craggy noise and lean the cliff texture), meadow and dry scrub tints are too bleached in bright light.
