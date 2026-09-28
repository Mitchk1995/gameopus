import { AFFIXES, AFFIX_BY_ID, rollAffix } from '../content/affixes.js';
import { BASES, ARMOR_WEIGHT, RARE_FIRST, RARE_SECOND, SLOTS } from '../content/bases.js';
import { UNIQUES, UNIQUE_BY_ID } from '../content/uniques.js';
import { pick, randInt, weighted } from '../core/rng.js';

let uidCounter = Date.now() % 1e9;
const nextUid = () => (uidCounter++).toString(36);

function baseFor(slot, ilvl) {
  const list = BASES[slot];
  const tier = Math.min(list.length - 1, Math.floor(ilvl / 7));
  return list[Math.max(0, tier - (Math.random() < 0.3 ? 1 : 0))];
}

function implicitFor(slot, ilvl, mult = 1, perfect = false) {
  const r = perfect ? 1 : 0.85 + Math.random() * 0.3;
  if (slot === 'weapon') {
    const min = Math.round((4 + ilvl * 1.5) * r * mult);
    return { dmgMin: min, dmgMax: Math.round(min * 1.9) };
  }
  if (ARMOR_WEIGHT[slot]) return { armor: Math.round((5 + ilvl * 1.4) * ARMOR_WEIGHT[slot] * r * mult) };
  return null;
}

function rollAffixes(slot, ilvl, count, taken = new Set()) {
  const out = [];
  const pool = AFFIXES.filter((a) => (a.slots === 'any' || a.slots.includes(slot)) && !taken.has(a.id));
  while (out.length < count && pool.length) {
    const def = weighted(pool.map((a) => [a, a.rare ?? 1]));
    pool.splice(pool.indexOf(def), 1);
    out.push({ id: def.id, value: rollAffix(def, ilvl) });
  }
  return out;
}

export function rollRarity(mf = 0, uniqueBonus = 1) {
  const u = 0.016 * uniqueBonus * (1 + mf / 100);
  const r = 0.24 * (1 + mf / 250);
  const x = Math.random();
  if (x < u) return 'unique';
  if (x < u + r) return 'rare';
  return 'magic';
}

export function generateItem({ ilvl = 1, rarity = 'magic', slot, uniqueId, ascendant } = {}) {
  if (rarity === 'unique' || uniqueId) return generateUnique(ilvl, uniqueId, ascendant);
  slot ||= pick(SLOTS);
  const item = { uid: nextUid(), slot, rarity, ilvl, base: baseFor(slot, ilvl), implicit: implicitFor(slot, ilvl) };
  if (rarity === 'magic') {
    const n = Math.random() < 0.5 ? 1 : 2;
    item.affixes = rollAffixes(slot, ilvl, n);
    const pre = item.affixes.find((a) => AFFIX_BY_ID[a.id].kind === 'prefix');
    const suf = item.affixes.find((a) => AFFIX_BY_ID[a.id].kind === 'suffix');
    item.name = [pre && AFFIX_BY_ID[pre.id].label, item.base, suf && AFFIX_BY_ID[suf.id].label].filter(Boolean).join(' ');
  } else {
    item.affixes = rollAffixes(slot, ilvl, randInt(3, 5));
    item.name = `${pick(RARE_FIRST)} ${pick(RARE_SECOND[slot])}`;
  }
  return item;
}

export function generateUnique(ilvl, uniqueId, ascendant) {
  const def = uniqueId ? UNIQUE_BY_ID[uniqueId] : pick(UNIQUES);
  const asc = ascendant ?? Math.random() < 1 / 14;
  const item = {
    uid: nextUid(),
    slot: def.slot,
    rarity: asc ? 'ascendant' : 'unique',
    ilvl,
    uniqueId: def.id,
    name: def.name,
    base: baseFor(def.slot, ilvl),
    implicit: implicitFor(def.slot, ilvl, (def.implicitMult || 1) * (asc ? 1.2 : 1), asc),
    affixes: def.stats.map(([id, lo, hi]) => {
      const t = asc ? 1 : Math.random();
      const v = lo + (hi - lo) * t;
      return { id, value: Math.round(asc ? v * 1.25 : v), fixed: true };
    }),
  };
  // Uniques also roll one random line, so two copies are never quite the same.
  item.affixes.push(...rollAffixes(def.slot, ilvl, 1, new Set(def.stats.map((s) => s[0]))));
  return item;
}

export const isUnique = (item) => item.rarity === 'unique' || item.rarity === 'ascendant';

export function salvageValue(item) {
  return { magic: 1, rare: 4, unique: 20, ascendant: 80 }[item.rarity] ?? 1;
}
