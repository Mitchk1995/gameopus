import { ITEMS } from './items.js';

// Gathering nodes and production recipes. Everything the skill guides show comes
// from here, so adding a tree, a rock or a recipe adds its unlock to the guide too.
//
// Success per 0.6 s tick is rate(level, tool) = base + (level - req) * perLevel +
// (tool tier - 1) * perTool, clamped; that keeps early levels slow but steady and makes
// each level-up and tool upgrade felt.

export const TICK = 0.6;

export const TREES = {
  tree: { name: 'Tree', level: 1, log: 'logs', xp: 25, base: 0.28, perLevel: 0.012, perTool: 0.08, fell: 1, respawn: [12, 22] },
  oak: { name: 'Oak tree', level: 15, log: 'oak_logs', xp: 37.5, base: 0.16, perLevel: 0.009, perTool: 0.06, fell: 1 / 6, respawn: [14, 26] },
  pine: { name: 'Pine tree', level: 30, log: 'pine_logs', xp: 67.5, base: 0.12, perLevel: 0.007, perTool: 0.05, fell: 1 / 8, respawn: [20, 34] },
};
// Which kind each forest species counts as.
export const SPECIES_TREE = { ash: 'tree', aspen: 'tree', oak: 'oak', pine: 'pine' };

export const ROCKS = {
  clay: { name: 'Clay rock', level: 1, ore: 'clay', xp: 5, base: 0.4, perLevel: 0.012, perTool: 0.08, respawn: [2, 3], color: 0x9d6f4c },
  copper: { name: 'Copper rock', level: 1, ore: 'copper_ore', xp: 17.5, base: 0.3, perLevel: 0.012, perTool: 0.08, respawn: [3, 5], color: 0xc2622d },
  tin: { name: 'Tin rock', level: 1, ore: 'tin_ore', xp: 17.5, base: 0.3, perLevel: 0.012, perTool: 0.08, respawn: [3, 5], color: 0xc9c9c0 },
  iron: { name: 'Iron rock', level: 15, ore: 'iron_ore', xp: 35, base: 0.2, perLevel: 0.01, perTool: 0.07, respawn: [6, 9], color: 0x8a3b22 },
  coal: { name: 'Coal rock', level: 30, ore: 'coal', xp: 50, base: 0.12, perLevel: 0.008, perTool: 0.06, respawn: [18, 30], color: 0x1b1b1b },
};

export const FISHING = {
  net: {
    name: 'Fishing spot', verb: 'Net', tool: 'net', bait: null,
    catches: [
      { fish: 'raw_shrimp', level: 1, xp: 10, base: 0.3, perLevel: 0.012 },
      { fish: 'raw_anchovies', level: 15, xp: 40, base: 0.15, perLevel: 0.008 },
    ],
  },
  fly: {
    name: 'Fishing spot', verb: 'Lure', tool: 'rod', bait: 'feather',
    catches: [
      { fish: 'raw_trout', level: 20, xp: 50, base: 0.22, perLevel: 0.009 },
      { fish: 'raw_salmon', level: 30, xp: 70, base: 0.14, perLevel: 0.007 },
    ],
  },
};

// Cooking: burn chance falls from `burn` at the requirement to 0 at `stopBurn`.
export const COOKING = [
  { raw: 'raw_shrimp', out: 'shrimp', level: 1, xp: 30, burn: 0.45, stopBurn: 34 },
  { raw: 'raw_anchovies', out: 'anchovies', level: 1, xp: 30, burn: 0.45, stopBurn: 34 },
  { raw: 'raw_trout', out: 'trout', level: 15, xp: 70, burn: 0.4, stopBurn: 50 },
  { raw: 'raw_salmon', out: 'salmon', level: 25, xp: 90, burn: 0.4, stopBurn: 58 },
];

// Smelting at a furnace.
export const SMELTING = [
  { out: 'bronze_bar', level: 1, xp: 6.25, needs: [['copper_ore', 1], ['tin_ore', 1]] },
  { out: 'iron_bar', level: 15, xp: 12.5, needs: [['iron_ore', 1]], success: 0.5 },
  { out: 'steel_bar', level: 30, xp: 17.5, needs: [['iron_ore', 1], ['coal', 2]] },
];

// Smithing at an anvil: every item with a `smith` entry, plus arrowtips.
export const SMITHING = [];
for (const it of Object.values(ITEMS)) {
  if (!it.smith) continue;
  SMITHING.push({ out: it.id, level: it.smith.level, xp: 12.5 * it.smith.bars * barTier(it.smith.bar), needs: [[it.smith.bar, it.smith.bars]], n: 1 });
}
for (const [metal, lvl] of [['bronze', 5], ['iron', 20], ['steel', 35]]) {
  SMITHING.push({ out: `${metal}_arrowtips`, level: lvl, xp: 12.5 * barTier(`${metal}_bar`), needs: [[`${metal}_bar`, 1]], n: 15 });
}
SMITHING.sort((a, b) => a.level - b.level);
function barTier(bar) {
  return { bronze_bar: 1, iron_bar: 2, steel_bar: 3 }[bar] || 1;
}

// Fletching with a knife on logs, and stringing.
export const FLETCHING = [
  { out: 'arrow_shaft', level: 1, xp: 5, needs: [['logs', 1]], n: 15, tool: 'knife' },
  { out: 'shortbow_u', level: 5, xp: 5, needs: [['logs', 1]], tool: 'knife' },
  { out: 'longbow_u', level: 10, xp: 10, needs: [['logs', 1]], tool: 'knife' },
  { out: 'arrow_shaft', level: 15, xp: 10, needs: [['oak_logs', 1]], n: 30, tool: 'knife', key: 'oak_shafts' },
  { out: 'oak_shortbow_u', level: 20, xp: 16.5, needs: [['oak_logs', 1]], tool: 'knife' },
  { out: 'oak_longbow_u', level: 25, xp: 25, needs: [['oak_logs', 1]], tool: 'knife' },
  { out: 'arrow_shaft', level: 30, xp: 15, needs: [['pine_logs', 1]], n: 45, tool: 'knife', key: 'pine_shafts' },
  { out: 'pine_shortbow_u', level: 35, xp: 33, needs: [['pine_logs', 1]], tool: 'knife' },
  { out: 'pine_longbow_u', level: 40, xp: 41.5, needs: [['pine_logs', 1]], tool: 'knife' },
  { out: 'headless_arrow', level: 1, xp: 1, needs: [['arrow_shaft', 15], ['feather', 15]], n: 15 },
  { out: 'bronze_arrow', level: 1, xp: 1.3 * 15, needs: [['headless_arrow', 15], ['bronze_arrowtips', 15]], n: 15 },
  { out: 'iron_arrow', level: 15, xp: 2.5 * 15, needs: [['headless_arrow', 15], ['iron_arrowtips', 15]], n: 15 },
  { out: 'steel_arrow', level: 30, xp: 5 * 15, needs: [['headless_arrow', 15], ['steel_arrowtips', 15]], n: 15 },
];
for (const [id, lvl, xp] of [['shortbow', 5, 5], ['longbow', 10, 10], ['oak_shortbow', 20, 16.5], ['oak_longbow', 25, 25], ['pine_shortbow', 35, 33], ['pine_longbow', 40, 41.5]]) {
  FLETCHING.push({ out: id, level: lvl, xp, needs: [[`${id}_u`, 1], ['bow_string', 1]] });
}

// Crafting at the spinning wheel, the potter's wheel and the kiln.
export const CRAFTING = {
  wheel: [{ out: 'bow_string', level: 10, xp: 15, needs: [['flax', 1]] }],
  potter: [
    { out: 'unfired_pot', level: 1, xp: 6.3, needs: [['soft_clay', 1]] },
    { out: 'unfired_bowl', level: 8, xp: 18, needs: [['soft_clay', 1]] },
  ],
  kiln: [
    { out: 'pot', level: 1, xp: 6.3, needs: [['unfired_pot', 1]] },
    { out: 'bowl', level: 8, xp: 15, needs: [['unfired_bowl', 1]] },
  ],
};

export function rate(def, level, toolPower = 1) {
  return Math.min(0.92, Math.max(0.03, def.base + (level - def.level) * def.perLevel + (toolPower - 1) * (def.perTool ?? 0.06)));
}

// Every unlock, per skill, for the skill guides and the "next goal" line.
export function unlocks() {
  const list = [];
  const push = (skill, level, label, icon) => list.push({ skill, level, label, icon });
  for (const t of Object.values(TREES)) push('woodcutting', t.level, t.name, t.log);
  for (const r of Object.values(ROCKS)) push('mining', r.level, r.name, r.ore);
  for (const f of Object.values(FISHING)) for (const c of f.catches) push('fishing', c.level, ITEMS[c.fish].name.replace('Raw ', ''), c.fish);
  for (const c of COOKING) push('cooking', c.level, ITEMS[c.out].name, c.out);
  for (const s of SMELTING) push('smithing', s.level, ITEMS[s.out].name, s.out);
  for (const s of SMITHING) push('smithing', s.level, ITEMS[s.out].name, s.out);
  for (const f of FLETCHING) push('fletching', f.level, `${ITEMS[f.out].name}${f.key ? ` (${ITEMS[f.needs[0][0]].name.toLowerCase()})` : ''}`, f.out);
  for (const list2 of Object.values(CRAFTING)) for (const c of list2) push('crafting', c.level, ITEMS[c.out].name, c.out);
  for (const it of Object.values(ITEMS)) {
    if (!it.req || !it.equip) continue;
    for (const [skill, level] of Object.entries(it.req)) {
      if (['woodcutting', 'mining'].includes(skill)) push(skill, level, `Use ${it.name.toLowerCase()}`, it.id);
      else push(skill, level, `${it.equip === 'weapon' || it.equip === 'ammo' ? 'Wield' : 'Wear'} ${it.name.toLowerCase()}`, it.id);
    }
  }
  return list.sort((a, b) => a.level - b.level);
}
