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
- [ ] M3 Combat: melee with tells, lock-on, dodge, block and parry (done); then ranged
      and magic
- [x] M4 Dungeon and boss: procedural layouts, boss, drop tables, collection log, pets
- [x] M5 People: dialogue (options and typing), two quests, shops
- [ ] Then: more regions, skills and bosses, added between sessions
