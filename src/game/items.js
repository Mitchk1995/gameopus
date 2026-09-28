// Every item in the game. Items are plain data: what it's called, what it's worth,
// whether it stacks, how it's equipped or eaten, and how to draw its icon (art).
//
// art: { kind, ...params } is read by ui/itemart.js to build a small 3D model that
// is rendered to the inventory icon and, for tools and weapons, held in the hand.

const METALS = {
  bronze: { color: 0xb7773f, tier: 1, level: 1, value: 1 },
  iron: { color: 0x8c8f94, tier: 2, level: 10, value: 3 },
  steel: { color: 0xb9c3cc, tier: 3, level: 20, value: 8 },
};

export const ITEMS = {};
const add = (id, def) => (ITEMS[id] = { id, stack: false, value: 1, ...def });

add('coins', { name: 'Coins', stack: true, value: 1, examine: 'Lovely money.', art: { kind: 'coins' } });

// ---------------------------------------------------------------- gathering
add('logs', { name: 'Logs', value: 4, examine: 'Logs cut from an ordinary tree.', art: { kind: 'logs', bark: 'birch', end: 0xd9b98a } });
add('oak_logs', { name: 'Oak logs', value: 20, examine: 'Logs cut from an oak.', art: { kind: 'logs', bark: 'oak', end: 0xc99c62 } });
add('pine_logs', { name: 'Pine logs', value: 45, examine: 'Resinous logs from a mountain pine.', art: { kind: 'logs', bark: 'pine', end: 0xe0c08c } });

add('copper_ore', { name: 'Copper ore', value: 5, examine: 'Ore with a coppery gleam.', art: { kind: 'ore', fleck: 0xc2622d } });
add('tin_ore', { name: 'Tin ore', value: 5, examine: 'Ore streaked with dull silver.', art: { kind: 'ore', fleck: 0xb8b8b0 } });
add('iron_ore', { name: 'Iron ore', value: 17, examine: 'Rust-red iron ore.', art: { kind: 'ore', fleck: 0x8a3b22 } });
add('coal', { name: 'Coal', value: 45, examine: 'Black, crumbly, burns hot.', art: { kind: 'ore', fleck: 0x151515, base: 0x2a2a2a } });
add('clay', { name: 'Clay', value: 2, examine: 'Some hard, dry clay.', art: { kind: 'clay', color: 0x9d7a5a } });

add('raw_shrimp', { name: 'Raw shrimp', value: 5, examine: 'Needs cooking.', art: { kind: 'shrimp', color: 0x9aa7a0 } });
add('raw_anchovies', { name: 'Raw anchovies', value: 15, examine: 'Tiny silver fish.', art: { kind: 'fish', color: 0x8fa3ad, size: 0.7 } });
add('raw_trout', { name: 'Raw trout', value: 20, examine: 'A speckled river trout.', art: { kind: 'fish', color: 0x7f8f6a, belly: 0xd8c9a6, size: 1 } });
add('raw_salmon', { name: 'Raw salmon', value: 50, examine: 'A fine silver salmon.', art: { kind: 'fish', color: 0x8497a4, belly: 0xe9d9c9, size: 1.15 } });
add('feather', { name: 'Feather', stack: true, value: 2, examine: 'Used for fly fishing and fletching.', art: { kind: 'feather' } });
add('flax', { name: 'Flax', value: 5, examine: 'Stalks of flax, ready for spinning.', art: { kind: 'flax' } });

// ---------------------------------------------------------------- cooking
const cooked = (id, name, heal, value, art) => add(id, { name, value, heal, examine: `Restores ${heal} hitpoints.`, art, food: true });
cooked('shrimp', 'Shrimp', 3, 8, { kind: 'shrimp', color: 0xe38a5c });
cooked('anchovies', 'Anchovies', 1, 20, { kind: 'fish', color: 0xa77e57, size: 0.7, cooked: true });
cooked('trout', 'Trout', 7, 30, { kind: 'fish', color: 0xa77a4c, belly: 0xd9b27d, size: 1, cooked: true });
cooked('salmon', 'Salmon', 9, 60, { kind: 'fish', color: 0xb9794f, belly: 0xe7ad7c, size: 1.15, cooked: true });
add('burnt_fish', { name: 'Burnt fish', value: 1, examine: 'Oops.', art: { kind: 'fish', color: 0x1d1612, belly: 0x2c231d, size: 1, burnt: true } });

// ---------------------------------------------------------------- smithing
for (const [metal, m] of Object.entries(METALS)) {
  add(`${metal}_bar`, { name: `${cap(metal)} bar`, value: 8 * m.value * m.tier, examine: `A bar of ${metal}.`, art: { kind: 'bar', color: m.color } });
}

// ---------------------------------------------------------------- crafting
add('bow_string', { name: 'Bow string', value: 10, examine: 'Spun from flax. Strings a bow.', art: { kind: 'string' } });
add('soft_clay', { name: 'Soft clay', value: 3, examine: 'Clay softened with water, ready to shape.', art: { kind: 'clay', color: 0x8a6446, soft: true } });
add('unfired_pot', { name: 'Unfired pot', value: 4, examine: 'Needs firing in a kiln.', art: { kind: 'pot', color: 0x9c7a5c } });
add('pot', { name: 'Pot', value: 12, examine: 'A fired clay pot.', art: { kind: 'pot', color: 0xa4563a, fired: true } });
add('unfired_bowl', { name: 'Unfired bowl', value: 4, examine: 'Needs firing in a kiln.', art: { kind: 'bowl', color: 0x9c7a5c } });
add('bowl', { name: 'Bowl', value: 14, examine: 'A fired clay bowl.', art: { kind: 'bowl', color: 0xa4563a, fired: true } });

// ---------------------------------------------------------------- fletching
add('arrow_shaft', { name: 'Arrow shaft', stack: true, value: 1, examine: 'A plain wooden shaft.', art: { kind: 'shafts' } });
add('headless_arrow', { name: 'Headless arrow', stack: true, value: 2, examine: 'A shaft with fletching, but no tip.', art: { kind: 'arrow', tip: null } });
for (const [metal, m] of Object.entries(METALS)) {
  add(`${metal}_arrowtips`, { name: `${cap(metal)} arrowtips`, stack: true, value: 2 * m.tier, examine: 'Arrowtips, ready for fletching.', art: { kind: 'tips', color: m.color } });
  add(`${metal}_arrow`, { name: `${cap(metal)} arrows`, stack: true, value: 3 * m.tier, equip: 'ammo', rangedStr: [7, 10, 16][m.tier - 1], req: { ranged: m.level }, examine: `Arrows with ${metal} tips.`, art: { kind: 'arrow', tip: m.color } });
}
const BOWS = [
  ['shortbow', 'Shortbow', 1, 5, 0xa9855a, 0.8, 8, 'logs'],
  ['longbow', 'Longbow', 1, 10, 0xa9855a, 1.0, 8, 'logs'],
  ['oak_shortbow', 'Oak shortbow', 5, 20, 0x8a6236, 0.8, 14, 'oak_logs'],
  ['oak_longbow', 'Oak longbow', 5, 25, 0x8a6236, 1.0, 14, 'oak_logs'],
  ['pine_shortbow', 'Pine shortbow', 20, 35, 0xc9a66b, 0.8, 29, 'pine_logs'],
  ['pine_longbow', 'Pine longbow', 20, 40, 0xc9a66b, 1.0, 29, 'pine_logs'],
];
for (const [id, name, rangedLvl, fletchLvl, color, len, acc, logs] of BOWS) {
  add(`${id}_u`, { name: `${name} (u)`, value: fletchLvl * 3, examine: 'Needs a string.', fletch: { level: fletchLvl, logs }, art: { kind: 'bow', color, len, strung: false } });
  add(id, { name, value: fletchLvl * 8, equip: 'weapon', twoHanded: true, style: 'bow', req: { ranged: rangedLvl }, bonus: { rangedAcc: acc }, speed: len > 0.9 ? 2.4 : 1.8, examine: `A ${name.toLowerCase()}.`, art: { kind: 'bow', color, len, strung: true } });
}

// ---------------------------------------------------------------- tools
for (const [metal, m] of Object.entries(METALS)) {
  add(`${metal}_axe`, { name: `${cap(metal)} axe`, value: 16 * m.tier * m.value, tool: 'axe', power: m.tier, req: { woodcutting: m.level }, equip: 'weapon', style: 'axe', bonus: { acc: 2 + 4 * m.tier, str: 2 + 3 * m.tier }, speed: 2.2, examine: 'For chopping trees.', art: { kind: 'axe', color: m.color } });
  add(`${metal}_pickaxe`, { name: `${cap(metal)} pickaxe`, value: 16 * m.tier * m.value, tool: 'pickaxe', power: m.tier, req: { mining: m.level }, equip: 'weapon', style: 'pick', bonus: { acc: 2 + 4 * m.tier, str: 2 + 3 * m.tier }, speed: 2.4, examine: 'For mining rock.', art: { kind: 'pickaxe', color: m.color } });
}
add('small_net', { name: 'Small fishing net', value: 5, tool: 'net', examine: 'For catching small fish.', art: { kind: 'net' } });
add('fly_rod', { name: 'Fly fishing rod', value: 5, tool: 'rod', examine: 'Cast with feathers as lures.', art: { kind: 'rod' } });
add('hammer', { name: 'Hammer', value: 1, tool: 'hammer', examine: 'For smithing.', art: { kind: 'hammer' } });
add('knife', { name: 'Knife', value: 1, tool: 'knife', examine: 'For fletching.', art: { kind: 'knife' } });

// ---------------------------------------------------------------- weapons and armour
const ARMOUR = [
  // id, name, slot, bars, smith level offset, defence per tier, art
  ['dagger', 'dagger', 'weapon', 1, 0, null],
  ['sword', 'sword', 'weapon', 1, 4, null],
  ['scimitar', 'scimitar', 'weapon', 2, 5, null],
  ['med_helm', 'med helm', 'head', 1, 3, 3],
  ['full_helm', 'full helm', 'head', 2, 7, 5],
  ['kiteshield', 'kiteshield', 'shield', 3, 12, 8],
  ['chainbody', 'chainbody', 'body', 3, 11, 9],
  ['platelegs', 'platelegs', 'legs', 3, 16, 8],
  ['platebody', 'platebody', 'body', 5, 18, 14],
];
const WEAPON = {
  dagger: { acc: 4, str: 3, speed: 1.2, style: 'stab' },
  sword: { acc: 6, str: 5, speed: 1.6, style: 'slash' },
  scimitar: { acc: 7, str: 6, speed: 1.5, style: 'slash' },
};
for (const [metal, m] of Object.entries(METALS)) {
  for (const [kind, label, slot, bars, off, def] of ARMOUR) {
    const id = `${metal}_${kind}`;
    const smith = { bars, level: Math.max(1, Math.round(m.level * 1.5 - (m.tier === 1 ? 1.5 : 0) + off)), bar: `${metal}_bar` };
    const base = { name: `${cap(metal)} ${label}`, value: Math.round(bars * 12 * m.tier * m.value), equip: slot, smith, art: { kind, color: m.color } };
    if (slot === 'weapon') {
      const w = WEAPON[kind];
      add(id, { ...base, req: { attack: m.level }, style: w.style, speed: w.speed, bonus: { acc: w.acc * (1 + (m.tier - 1) * 0.9), str: w.str * (1 + (m.tier - 1) * 0.9) }, examine: `A ${metal} ${label}.` });
    } else {
      add(id, { ...base, req: { defence: m.level }, bonus: { def: Math.round(def * (1 + (m.tier - 1) * 0.8)) }, examine: `${cap(metal)} armour.` });
    }
  }
}

// ---------------------------------------------------------------- uniques (collection log)
add('warren_crown', { name: 'Warren crown', value: 900, equip: 'head', req: { defence: 20 }, bonus: { def: 9, str: 2 }, unique: 'Grubnak', examine: "The Warren King's crown. Dented, greasy, magnificent.", art: { kind: 'crown', color: 0xc9a13a } });
add('kings_cleaver', { name: "King's cleaver", value: 1400, equip: 'weapon', style: 'slash', speed: 1.7, req: { attack: 20 }, bonus: { acc: 16, str: 19 }, unique: 'Grubnak', examine: "Grubnak's cleaver. Heavy enough to split a door.", art: { kind: 'cleaver', color: 0x9aa3ab } });
add('captains_cutlass', { name: "Captain's cutlass", value: 1200, equip: 'weapon', style: 'slash', speed: 1.4, req: { attack: 25 }, bonus: { acc: 22, str: 17 }, unique: 'Bandit captain', examine: 'Light, quick and very sharp.', art: { kind: 'scimitar', color: 0xc9d2da } });
add('pet_grubling', { name: 'Grubling', value: 0, pet: 'grubling', unique: 'Grubnak', examine: 'A very small warren king. It follows you now.', art: { kind: 'petgob' } });
add('pet_magpie', { name: 'Magpie', value: 0, pet: 'magpie', unique: 'Bandit captain', examine: 'It stole a coin from the captain and decided it liked you better.', art: { kind: 'petbird' } });
add('pet_golem', { name: 'Rock golem', value: 0, pet: 'golem', unique: 'Mining', examine: 'A pebble that wanted to see the world.', art: { kind: 'petgolem' } });
add('pet_sapling', { name: 'Sapling', value: 0, pet: 'sapling', unique: 'Woodcutting', examine: 'A stump with ideas.', art: { kind: 'petsapling' } });
add('pet_frogling', { name: 'Frogling', value: 0, pet: 'frogling', unique: 'Fishing', examine: 'It was in your net. Now it is in your life.', art: { kind: 'petfrog' } });

// ---------------------------------------------------------------- odds and ends
add('bones', { name: 'Bones', value: 1, examine: 'Bones are for burying.', art: { kind: 'bones' } });

export function item(id) {
  const it = ITEMS[id];
  if (!it) throw new Error(`unknown item ${id}`);
  return it;
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

export { METALS };
