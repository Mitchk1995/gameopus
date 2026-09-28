// Combat numbers. Accuracy and damage use RuneScape's formulas (so levels and gear
// matter the way they do there), and timing adds to them: a perfect parry leaves the
// enemy open to a riposte that always lands for a big hit, a combo's finisher and a
// heavy blow hit harder, and anything hit while recovering from its own swing is
// easier to land on.

export function hitChance(attRoll, defRoll) {
  return attRoll > defRoll ? 1 - (defRoll + 2) / (2 * (attRoll + 1)) : attRoll / (2 * (defRoll + 1));
}

export function maxHit(effStr, strBonus) {
  return Math.floor(0.5 + (effStr * (strBonus + 64)) / 640);
}

// Player swinging at a monster.
// move: { kind: 'light'|'heavy'|'finisher'|'riposte' }
export function playerMelee(skills, bonus, monster, move, { exposed = false } = {}) {
  const effAtt = skills.level('attack') + 8 + (move.kind === 'light' || move.kind === 'finisher' ? 3 : 0);
  const effStr = skills.level('strength') + 8 + (move.kind === 'heavy' ? 3 : 0);
  let att = effAtt * (bonus.acc + 64);
  if (exposed) att *= 1.5;
  if (move.kind === 'heavy') att *= 0.9;
  const def = (monster.def + 9) * (monster.defB + 64);
  let max = maxHit(effStr, bonus.str);
  if (move.kind === 'heavy') max = Math.ceil(max * 1.35);
  if (move.kind === 'finisher') max = Math.ceil(max * 1.25);
  max = Math.max(1, max);
  if (move.kind === 'riposte') return { hit: true, damage: Math.max(1, Math.ceil(max * 1.5)), crit: true, max };
  const hit = Math.random() < hitChance(att, def);
  return { hit, damage: hit ? Math.floor(Math.random() * (max + 1)) : 0, crit: false, max };
}

// Player shooting an arrow; a hasty, half-drawn shot is weaker and less accurate.
export function playerRanged(skills, bonus, monster, { draw = 1, exposed = false } = {}) {
  const eff = skills.level('ranged') + 8;
  let att = eff * (bonus.rangedAcc + 64) * (0.7 + 0.3 * draw);
  if (exposed) att *= 1.5;
  const def = (monster.def + 9) * ((monster.defR ?? monster.defB) + 64);
  const max = Math.max(1, Math.round(maxHit(eff, bonus.rangedStr) * (0.45 + 0.55 * draw)));
  const hit = Math.random() < hitChance(att, def);
  return { hit, damage: hit ? Math.floor(Math.random() * (max + 1)) : 0, crit: false, max };
}

// Player casting a combat spell: the spell sets the max hit; magic level and gear set
// the accuracy, against the monster's defence.
export function playerMagic(skills, bonus, monster, spell, { exposed = false } = {}) {
  const eff = skills.level('magic') + 8;
  let att = eff * ((bonus.magicAcc || 0) + 64);
  if (exposed) att *= 1.5;
  const def = (monster.def + 9) * ((monster.defM ?? monster.defB) + 64);
  const hit = Math.random() < hitChance(att, def);
  return { hit, damage: hit ? Math.floor(Math.random() * (spell.max + 1)) : 0, crit: false, max: spell.max };
}

// Strike spells, cast from the standard spellbook with runes. A staff of an element
// supplies that element's runes.
export const SPELLS = [
  { id: 'wind_strike', name: 'Wind Strike', level: 1, max: 2, xp: 5.5, runes: [['air_rune', 1], ['mind_rune', 1]], color: 0xe6f7ff, glow: 0x9fe4ff },
  { id: 'water_strike', name: 'Water Strike', level: 5, max: 4, xp: 7.5, runes: [['water_rune', 1], ['air_rune', 1], ['mind_rune', 1]], color: 0x7cc4ff, glow: 0x2a7dff },
  { id: 'earth_strike', name: 'Earth Strike', level: 9, max: 6, xp: 9.5, runes: [['earth_rune', 2], ['air_rune', 1], ['mind_rune', 1]], color: 0xc9e27a, glow: 0x6a9a2a },
  { id: 'fire_strike', name: 'Fire Strike', level: 13, max: 8, xp: 11.5, runes: [['fire_rune', 3], ['air_rune', 2], ['mind_rune', 1]], color: 0xffd08a, glow: 0xff5a14 },
];

// A monster swinging at the player.
export function monsterMelee(monster, attack, skills, bonus) {
  const att = (monster.att + 8) * (monster.acc + 64);
  const def = (skills.level('defence') + 8) * (bonus.def + 64);
  const max = Math.max(1, Math.round(maxHit(monster.str + 8, monster.strB) * (attack.dmg ?? 1)));
  const hit = Math.random() < hitChance(att, def);
  return { hit, damage: hit ? 1 + Math.floor(Math.random() * max) : 0, max };
}

// Attacks: clip, when it connects (s, at speed 1), reach (m), arc (degrees either side),
// how long the wind-up tell lasts, and damage relative to max hit. Unblockable attacks
// flash red and must be dodged.
const HOOK = { clip: 'Melee_Hook', hit: 0.23, range: 1.9, arc: 60, windup: 0.55, dmg: 1 };
const SCRATCH = { clip: 'Zombie_Scratch', hit: 0.55, range: 2.1, arc: 80, windup: 0.5, dmg: 1.2 };
const SLASH_A = { clip: 'Sword_Regular_A', hit: 0.22, range: 2.3, arc: 70, windup: 0.5, dmg: 1 };
const SLASH_B = { clip: 'Sword_Regular_B', hit: 0.23, range: 2.3, arc: 70, windup: 0.45, dmg: 1 };
const OVERHEAD = { clip: 'Sword_Attack', hit: 0.37, range: 2.6, arc: 45, windup: 0.9, dmg: 1.6, unblockable: true };
const LUNGE = { clip: 'Sword_Dash', hit: 0.31, range: 3.4, arc: 35, windup: 0.8, dmg: 1.4, lunge: 2.4 };

const SLAM = { clip: 'OverhandThrow', hit: 0.36, range: 3.6, arc: 180, windup: 1.0, dmg: 2.0, unblockable: true, aoe: 3.4 };

export const MONSTERS = {
  goblin: {
    name: 'Goblin', model: 'puglin', skin: 1, scale: 1.0, level: 3, hp: 6, att: 3, str: 3, def: 1, acc: 0, strB: 0, defB: 0,
    speed: 3.6, aggro: 10, leash: 26, poise: 1, attacks: [HOOK, SCRATCH], drops: 'goblin', respawn: 25,
  },
  goblin_brute: {
    name: 'Goblin brute', model: 'puglin', skin: 2, scale: 1.3, level: 13, hp: 22, att: 10, str: 13, def: 9, acc: 5, strB: 6, defB: 8,
    // Slow to rouse, so a new fighter can pick off the goblins at the edge of camp.
    speed: 3.1, aggro: 7, leash: 26, poise: 3, attacks: [SCRATCH, { ...HOOK, dmg: 1.2 }, { ...SCRATCH, windup: 0.95, dmg: 1.8, unblockable: true }], drops: 'goblin_brute', respawn: 40,
  },
  bandit: {
    name: 'Bandit', model: 'human', look: { outfit: 'male_peasant', body: 'male', hair: 'hair_buzzed', eyebrows: 'eyebrows_regular', tint: 0x8a3a30, tintMaterial: 'Peasant' }, weapon: 'iron_sword',
    level: 18, hp: 30, att: 16, str: 15, def: 14, acc: 14, strB: 12, defB: 18, speed: 4.4, aggro: 13, leash: 30, poise: 2,
    attacks: [SLASH_A, SLASH_B, { ...SLASH_A, combo: SLASH_B }, LUNGE], blocks: 0.3, drops: 'bandit', respawn: 45,
  },
  bandit_captain: {
    name: 'Bandit captain', model: 'human', look: { outfit: 'male_ranger', body: 'male', hair: 'hair_long', beard: 'hair_beard', eyebrows: 'eyebrows_regular', tint: 0x6a1a1a }, weapon: 'steel_scimitar', scale: 1.08,
    level: 32, hp: 70, att: 30, str: 28, def: 26, acc: 30, strB: 26, defB: 36, speed: 4.6, aggro: 14, leash: 30, poise: 4,
    attacks: [{ ...SLASH_A, combo: SLASH_B }, OVERHEAD, LUNGE, { ...SLASH_B, combo: { ...SLASH_A, combo: OVERHEAD } }], blocks: 0.35, drops: 'bandit_captain', respawn: 120,
  },
};

Object.assign(MONSTERS, {
  warren_goblin: { ...MONSTERS.goblin, name: 'Warren goblin', skin: 3, level: 8, hp: 12, att: 7, str: 7, def: 5, acc: 4, strB: 3, defB: 4, aggro: 12, leash: 60, drops: 'warren_goblin', respawn: 1e9 },
  warren_brute: { ...MONSTERS.goblin_brute, name: 'Warren brute', level: 16, hp: 28, att: 13, str: 16, def: 12, aggro: 12, leash: 60, drops: 'warren_brute', respawn: 1e9 },
  grubnak: {
    name: 'Grubnak, the Warren King', model: 'puglin', skin: 2, scale: 2.1, level: 26, hp: 90, att: 20, str: 22, def: 17, acc: 14, strB: 16, defB: 20,
    speed: 3.6, aggro: 16, leash: 80, poise: 6, boss: true, drops: 'grubnak', respawn: 1e9,
    attacks: [{ ...SCRATCH, range: 3.2, dmg: 1.3 }, { ...HOOK, range: 3.0, combo: { ...HOOK, range: 3.0, windup: 0.3 } }, SLAM],
  },
});

// Drop tables: always-drops, then one roll on the weighted table (null = nothing),
// then an independent roll for each rare (1 in n).
export const DROPS = {
  goblin: {
    always: [['bones', 1]],
    table: [[30, 'coins', [3, 16]], [8, 'bronze_dagger'], [6, 'bronze_med_helm'], [10, 'raw_shrimp'], [8, 'copper_ore'], [8, 'tin_ore'], [6, 'feather', [5, 15]], [24, null]],
    rare: [],
  },
  goblin_brute: {
    always: [['bones', 1]],
    table: [[30, 'coins', [12, 45]], [8, 'bronze_sword'], [7, 'bronze_full_helm'], [6, 'iron_dagger'], [8, 'iron_ore'], [6, 'bronze_arrowtips', [5, 15]], [10, 'raw_trout'], [25, null]],
    rare: [],
  },
  bandit: {
    always: [['bones', 1]],
    table: [[34, 'coins', [20, 80]], [8, 'iron_sword'], [6, 'iron_med_helm'], [5, 'iron_chainbody'], [8, 'iron_arrow', [5, 20]], [8, 'trout'], [6, 'iron_bar'], [25, null]],
    rare: [],
  },
  warren_goblin: {
    always: [['bones', 1]],
    table: [[32, 'coins', [8, 30]], [8, 'iron_dagger'], [8, 'bronze_full_helm'], [10, 'iron_ore'], [8, 'coal'], [8, 'bronze_arrowtips', [8, 20]], [26, null]],
    rare: [],
  },
  warren_brute: {
    always: [['bones', 1]],
    table: [[30, 'coins', [25, 70]], [8, 'iron_sword'], [7, 'iron_full_helm'], [6, 'iron_kiteshield'], [8, 'iron_bar', [1, 3]], [8, 'coal', [2, 4]], [8, 'trout', [1, 2]], [25, null]],
    rare: [],
  },
  grubnak: {
    always: [['bones', 1], ['coins', [150, 400]]],
    table: [[18, 'steel_bar', [2, 5]], [16, 'iron_platebody'], [14, 'steel_med_helm'], [14, 'iron_platelegs'], [18, 'salmon', [2, 5]], [20, 'coal', [8, 16]]],
    rare: [[16, 'warren_crown'], [32, 'kings_cleaver'], [80, 'pet_grubling']],
  },
  bandit_captain: {
    always: [['bones', 1], ['coins', [120, 300]]],
    table: [[20, 'steel_scimitar'], [15, 'steel_full_helm'], [15, 'steel_kiteshield'], [12, 'steel_bar', [2, 4]], [20, 'salmon', [2, 4]], [18, 'iron_platebody']],
    rare: [[24, 'captains_cutlass'], [60, 'pet_magpie']],
  },
};

export function rollDrops(tableId) {
  const t = DROPS[tableId];
  if (!t) return [];
  const out = [];
  const qty = (q) => (Array.isArray(q) ? q[0] + Math.floor(Math.random() * (q[1] - q[0] + 1)) : q ?? 1);
  for (const [id, q] of t.always) out.push([id, qty(q)]);
  const total = t.table.reduce((s, e) => s + e[0], 0);
  let r = Math.random() * total;
  for (const [w, id, q] of t.table) {
    r -= w;
    if (r <= 0) {
      if (id) out.push([id, qty(q)]);
      break;
    }
  }
  for (const [n, id, q] of t.rare) if (Math.random() < 1 / n) out.push([id, qty(q), true]);
  return out;
}

// Experience for damage dealt (per style) and hitpoints, as in RuneScape.
export const XP_PER_DAMAGE = 4;
export const HP_XP_PER_DAMAGE = 4 / 3;

// Player attacks: light chain A -> B -> C (finisher), and a heavy blow.
export const PLAYER_MOVES = {
  light: [
    { clip: 'Sword_Regular_A', hit: 0.22, speed: 1.15, range: 2.3, arc: 70, stamina: 10, kind: 'light', lunge: 0.6, next: 0.14, recover: 'Sword_Regular_A_Rec' },
    { clip: 'Sword_Regular_B', hit: 0.23, speed: 1.15, range: 2.3, arc: 70, stamina: 10, kind: 'light', lunge: 0.4, next: 0.14, recover: 'Sword_Regular_B_Rec' },
    { clip: 'Sword_Regular_C', hit: 0.63, speed: 1.3, range: 2.5, arc: 110, stamina: 16, kind: 'finisher', lunge: 0.9, end: 1.05 },
  ],
  heavy: { clip: 'Sword_Attack', hit: 0.37, speed: 0.8, range: 2.6, arc: 60, stamina: 24, kind: 'heavy', lunge: 0.8, end: 1.0 },
};
