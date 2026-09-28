// Skills and experience. The curve is RuneScape's: each level needs about 10% more
// experience than the last, so 99 takes around thirteen million, and every skill
// always has a nearby unlock to aim for.

export const MAX_LEVEL = 99;

const TABLE = [0, 0];
{
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    TABLE.push(Math.floor(points / 4));
  }
}

// Experience needed to reach a level.
export function xpForLevel(level) {
  return TABLE[Math.max(1, Math.min(MAX_LEVEL, level))];
}

export function levelForXp(xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TABLE[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const SKILLS = [
  { id: 'attack', name: 'Attack', group: 'combat', blurb: 'Accuracy with melee weapons, and which weapons you can wield.' },
  { id: 'strength', name: 'Strength', group: 'combat', blurb: 'How hard your melee blows land.' },
  { id: 'defence', name: 'Defence', group: 'combat', blurb: 'Avoiding hits, and which armour you can wear.' },
  { id: 'ranged', name: 'Ranged', group: 'combat', blurb: 'Bows and arrows: accuracy, damage and which bows you can draw.' },
  { id: 'magic', name: 'Magic', group: 'combat', blurb: 'Spells: which you know and how well they land.' },
  { id: 'hitpoints', name: 'Hitpoints', group: 'combat', blurb: 'How much punishment you can take.' },
  { id: 'woodcutting', name: 'Woodcutting', group: 'gathering', blurb: 'Felling trees for logs.' },
  { id: 'mining', name: 'Mining', group: 'gathering', blurb: 'Breaking ore and clay out of rock.' },
  { id: 'fishing', name: 'Fishing', group: 'gathering', blurb: 'Netting and fly-fishing the river and lake.' },
  { id: 'smithing', name: 'Smithing', group: 'production', blurb: 'Smelting ore into bars, and hammering bars into tools, weapons and armour.' },
  { id: 'cooking', name: 'Cooking', group: 'production', blurb: 'Turning raw food into meals. Burn less as you improve.' },
  { id: 'crafting', name: 'Crafting', group: 'production', blurb: 'Spinning, pottery and leatherwork.' },
  { id: 'fletching', name: 'Fletching', group: 'production', blurb: 'Carving bows and arrows from logs.' },
];
export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// A character's skills: experience per skill, with levels derived from it.
export class Skills {
  constructor(saved = null) {
    this.xp = Object.fromEntries(SKILLS.map((s) => [s.id, s.id === 'hitpoints' ? xpForLevel(10) : 0]));
    if (saved) for (const [k, v] of Object.entries(saved)) if (k in this.xp) this.xp[k] = v;
    this.listeners = new Set();
  }

  level(id) {
    return levelForXp(this.xp[id]);
  }

  // Adds experience; returns the new level if it went up.
  add(id, amount) {
    const before = this.level(id);
    this.xp[id] = Math.min(200_000_000, this.xp[id] + amount);
    const after = this.level(id);
    for (const l of this.listeners) l({ id, amount, before, after });
    return after > before ? after : null;
  }

  // Progress through the current level, 0..1.
  progress(id) {
    const lvl = this.level(id);
    if (lvl >= MAX_LEVEL) return 1;
    const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
    return (this.xp[id] - a) / (b - a);
  }

  total() {
    return SKILLS.reduce((t, s) => t + this.level(s.id), 0);
  }

  combatLevel() {
    const L = (id) => this.level(id);
    const base = 0.25 * (L('defence') + L('hitpoints'));
    const melee = 0.325 * (L('attack') + L('strength'));
    const range = 0.325 * Math.floor(L('ranged') * 1.5);
    const mage = 0.325 * Math.floor(L('magic') * 1.5);
    return Math.floor(base + Math.max(melee, range, mage));
  }

  toJSON() {
    return { ...this.xp };
  }
}
