# Hollowreach — design bible

A Diablo-style loot ARPG made for one player, with Claude as the dungeon master
who keeps expanding the world between sessions.

## The core promise

1. **Loot is the protagonist.** Every kill is a lottery ticket. Uniques change how you play,
   not just your numbers.
2. **You never know what exists.** The Codex shows `???` for everything you haven't found.
   Discovery is the reward as much as power is.
3. **Number go up, and it leads somewhere.** Every grind (gold, shards, levels, professions)
   feeds a deeper place where newer, stranger content lives.
4. **The world keeps growing.** Claude reads what you did last session and writes new
   regions, monsters, uniques, NPCs and mechanics for next time.

## How it stays cohesive (the rules Claude follows when adding content)

Claude never free-writes content into the game. Everything new is written in the game's
**content grammar**, so it obeys the same rules, power curve and visual language as
everything else:

| Layer | Lives in | What a new entry must define |
|---|---|---|
| Stats | `src/content/affixes.js` | stat id, roll range, ilvl scaling, prefix/suffix name |
| Uniques | `src/content/uniques.js` | slot, fixed stat lines, a **power** built from triggers + actions |
| Triggers | `src/game/powers.js` | `swing`, `attack`, `hit`, `crit`, `kill`, `dash`, `nova`, `pickup`, `hurt`, `tick` |
| Actions | `src/game/actions.js` | `chainLightning`, `nova`, `firePatch`, `shards`, `soul`, `orbit`... |
| Monsters | `src/content/monsters.js` | stats, behavior archetype, procedural model |
| Regions | `src/content/biomes.js` | palette, fog, light, name, monster mix |

Adding a new mechanic means adding a new trigger or action to the engine first, then
content can use it. That keeps weird ideas possible without the game turning to mush.

### World canon (tone guide for all names and text)

- The Hollowreach is a drowned kingdom that fell *upward* into the dark: the deeper you
  go, the older and stranger it gets.
- Tone: grim, a little wry, never goofy. Item names sound like they were found, not designed.
- Colors carry meaning: ember orange = unique, violet = void/arcane, cyan = cold,
  pale blue = storm, magenta-red = **Ascendant** (the rarest tier).

## The two content loops

- **Fast loop (in game, every second):** procedural hordes, affix rolls, drops, elites,
  depth scaling. Endless by construction.
- **Slow loop (between sessions, Claude as DM):** you play, the game logs what happened,
  Claude reads it and ships a content patch: a new region, a boss that counters your
  build, a unique that fits what you've been chasing, an NPC who remembers you.

## Roadmap (to decide together)

- [x] Slice 1: combat feel, hordes, loot rarities, 8 uniques, Codex, depth biomes
- [ ] Persistent cloud save the DM can read (artifact `db`)
- [ ] Town hub + NPCs you can actually talk to (live Claude dialogue, bounded by game tools)
- [ ] Professions: salvaging, crafting and enchanting with shards (the OSRS grind)
- [ ] Session log + "DM patch notes" loop
- [ ] Bosses, rifts, set items, the Ascendant chase
