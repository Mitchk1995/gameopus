// Every stat an item can roll. A new stat = one entry here + reading it in game/stats.js.
// range: base roll range. scale: multiplier per item level for flat stats.
const J = ['ring', 'amulet'];
const OFFENSE = ['weapon', 'gloves', 'ring', 'amulet'];

export const AFFIXES = [
  { id: 'flatDmg', kind: 'prefix', label: 'Jagged', slots: OFFENSE, range: [2, 5], scale: 0.1, fmt: (v) => `+${v} Damage` },
  { id: 'pctDmg', kind: 'prefix', label: 'Cruel', slots: ['weapon', 'amulet', 'gloves', 'helm'], range: [8, 22], fmt: (v) => `+${v}% Damage` },
  { id: 'fireDmg', kind: 'prefix', label: 'Smoldering', slots: OFFENSE, range: [2, 6], scale: 0.1, fmt: (v) => `+${v} Fire Damage` },
  { id: 'coldDmg', kind: 'prefix', label: 'Frigid', slots: OFFENSE, range: [2, 6], scale: 0.1, fmt: (v) => `+${v} Cold Damage` },
  { id: 'lightningDmg', kind: 'prefix', label: 'Crackling', slots: OFFENSE, range: [1, 8], scale: 0.1, fmt: (v) => `+${v} Lightning Damage` },
  { id: 'life', kind: 'prefix', label: 'Stalwart', slots: 'any', range: [10, 22], scale: 0.1, fmt: (v) => `+${v} Maximum Life` },
  { id: 'armor', kind: 'prefix', label: 'Plated', slots: ['helm', 'chest', 'gloves', 'boots'], range: [6, 16], scale: 0.1, fmt: (v) => `+${v} Armor` },
  { id: 'mana', kind: 'prefix', label: "Sage's", slots: ['helm', 'amulet', 'ring', 'weapon'], range: [10, 25], fmt: (v) => `+${v} Maximum Mana` },
  { id: 'magicFind', kind: 'prefix', label: 'Lucky', slots: ['helm', 'amulet', 'ring', 'boots', 'gloves'], range: [6, 18], fmt: (v) => `+${v}% Magic Find` },

  { id: 'atkSpd', kind: 'suffix', label: 'of Haste', slots: ['weapon', 'gloves', 'ring'], range: [5, 12], fmt: (v) => `+${v}% Attack Speed` },
  { id: 'critChance', kind: 'suffix', label: 'of Precision', slots: ['weapon', 'gloves', 'ring', 'amulet', 'helm'], range: [2, 5], fmt: (v) => `+${v}% Critical Chance` },
  { id: 'critDmg', kind: 'suffix', label: 'of Ruin', slots: ['weapon', 'gloves', 'amulet', 'ring'], range: [12, 32], fmt: (v) => `+${v}% Critical Damage` },
  { id: 'lifeRegen', kind: 'suffix', label: 'of the Troll', slots: ['chest', 'helm', 'amulet', 'ring'], range: [1, 4], scale: 0.05, fmt: (v) => `+${v} Life per Second` },
  { id: 'lifeOnHit', kind: 'suffix', label: 'of the Leech', slots: ['weapon', 'gloves', 'ring'], range: [1, 3], scale: 0.08, fmt: (v) => `+${v} Life per Hit` },
  { id: 'manaRegen', kind: 'suffix', label: 'of Focus', slots: ['helm', 'amulet', 'ring', 'weapon'], range: [1, 3], fmt: (v) => `+${v} Mana per Second` },
  { id: 'moveSpd', kind: 'suffix', label: 'of the Wind', slots: ['boots'], range: [6, 15], fmt: (v) => `+${v}% Movement Speed` },
  { id: 'area', kind: 'suffix', label: 'of Expanse', slots: ['weapon', 'helm', 'amulet', 'chest'], range: [8, 20], fmt: (v) => `+${v}% Area of Effect` },
  { id: 'cdr', kind: 'suffix', label: 'of Tempo', slots: ['helm', 'gloves', 'amulet', 'ring'], range: [4, 10], fmt: (v) => `${v}% Cooldown Reduction` },
  { id: 'goldFind', kind: 'suffix', label: 'of Greed', slots: J.concat(['boots', 'gloves']), range: [10, 30], fmt: (v) => `+${v}% Gold Find` },
  { id: 'pickupRadius', kind: 'suffix', label: 'of the Magpie', slots: ['boots', 'amulet', 'ring'], range: [20, 50], fmt: (v) => `+${v}% Pickup Radius` },
  { id: 'chainChance', kind: 'suffix', label: 'of Storms', slots: ['weapon', 'gloves', 'ring'], range: [5, 12], fmt: (v) => `${v}% chance on hit to unleash Chain Lightning` },
  { id: 'extraBolts', kind: 'suffix', label: 'of Multitudes', slots: ['weapon', 'amulet'], range: [1, 1], rare: 0.25, fmt: (v) => `Arcane Bolt fires +${v} projectile${v > 1 ? 's' : ''}` },
];

export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

export function rollAffix(def, ilvl, perfect = false) {
  const t = perfect ? 1 : Math.random();
  let v = def.range[0] + (def.range[1] - def.range[0]) * t;
  if (def.scale) v *= 1 + ilvl * def.scale;
  return Math.max(1, Math.round(v));
}

export const formatStat = (id, v) => AFFIX_BY_ID[id]?.fmt(v) ?? `${id}: ${v}`;
