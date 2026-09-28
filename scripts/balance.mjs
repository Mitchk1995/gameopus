// Balance table from the real combat formulas: for a player at a few stages of the
// game (levels and the gear that goes with them), how long each monster takes to
// kill with sword, bow and spell, and how hard it hits back. Timing skills (parries,
// dodges, ripostes) come on top of these numbers.
//   node scripts/balance.mjs
import { MONSTERS, SPELLS, hitChance, maxHit, monsterMelee } from '../src/game/combat.js';
import { ITEMS } from '../src/game/items.js';

const STAGES = [
  { name: 'Fresh (1)', lvl: 1, hp: 10, weapon: 'bronze_sword', armour: [], bow: 'shortbow', arrow: 'bronze_arrow', magic: 1 },
  { name: 'Early (10)', lvl: 10, hp: 12, weapon: 'iron_sword', armour: ['bronze_full_helm', 'bronze_chainbody', 'bronze_kiteshield'], bow: 'oak_shortbow', arrow: 'bronze_arrow', magic: 9 },
  { name: 'Mid (20)', lvl: 20, hp: 22, weapon: 'steel_sword', armour: ['iron_full_helm', 'iron_platebody', 'iron_platelegs', 'iron_kiteshield'], bow: 'oak_longbow', arrow: 'iron_arrow', magic: 13 },
  { name: 'Late (30)', lvl: 30, hp: 32, weapon: 'steel_scimitar', armour: ['steel_full_helm', 'steel_platebody', 'steel_platelegs', 'steel_kiteshield'], bow: 'pine_longbow', arrow: 'steel_arrow', magic: 13 },
];

const skills = (lvl, magic) => ({ level: (s) => (s === 'magic' ? magic : lvl) });
const bonus = (ids) => ids.reduce((b, id) => {
  const it = ITEMS[id];
  for (const [k, v] of Object.entries(it.bonus || {})) b[k] = (b[k] || 0) + v;
  if (it.rangedStr) b.rangedStr = (b.rangedStr || 0) + it.rangedStr;
  return b;
}, { acc: 0, str: 0, def: 0, rangedAcc: 0, rangedStr: 0, magicAcc: 0 });

function melee(st, m) {
  const b = bonus([st.weapon, ...st.armour]);
  const att = (st.lvl + 8 + 3) * (b.acc + 64), def = (m.def + 9) * (m.defB + 64);
  const max = Math.max(1, maxHit(st.lvl + 8, b.str));
  const p = hitChance(att, def), speed = ITEMS[st.weapon].speed;
  return { p, max, dps: (p * max / 2) / (speed * 0.45) };
}
function ranged(st, m) {
  const b = bonus([st.bow, st.arrow]);
  const eff = st.lvl + 8;
  const p = hitChance(eff * (b.rangedAcc + 64), (m.def + 9) * ((m.defR ?? m.defB) + 64));
  const max = Math.max(1, maxHit(eff, b.rangedStr));
  return { p, max, dps: (p * max / 2) / (ITEMS[st.bow].speed * 0.33 + 0.35) };
}
function magic(st, m) {
  const spell = [...SPELLS].reverse().find((s) => s.level <= st.magic);
  const p = hitChance((st.magic + 8) * (8 + 64), (m.def + 9) * ((m.defM ?? m.defB) + 64));
  return { p, max: spell.max, dps: (p * spell.max / 2) / (0.45 + 0.35), spell: spell.name };
}
function incoming(st, m) {
  const b = bonus(st.armour);
  let hits = 0, dmg = 0;
  const N = 4000;
  const s = skills(st.lvl, st.magic);
  for (let i = 0; i < N; i++) {
    const a = m.attacks[i % m.attacks.length];
    const r = monsterMelee(m, a, s, b);
    hits += r.hit;
    dmg += r.damage;
  }
  return { p: hits / N, avg: dmg / N };
}

const pad = (s, n) => String(s).padEnd(n);
for (const st of STAGES) {
  console.log(`\n${st.name}: ${st.weapon}, ${st.armour.length ? st.armour.join(', ') : 'no armour'}; ${st.bow} + ${st.arrow}; magic ${st.magic}; ${st.hp} hp`);
  console.log(pad('monster', 26), pad('sword: hit/max/ttk', 22), pad('bow: hit/max/ttk', 20), pad('spell: hit/max/ttk', 22), 'it hits you: chance/avg per swing');
  for (const [id, m] of Object.entries(MONSTERS)) {
    const a = melee(st, m), r = ranged(st, m), g = magic(st, m), inc = incoming(st, m);
    const ttk = (x) => `${(m.hp / x.dps).toFixed(0)}s`;
    console.log(
      pad(`${m.name} (${m.level}, ${m.hp}hp)`, 26),
      pad(`${(a.p * 100).toFixed(0)}% ${a.max} ${ttk(a)}`, 22),
      pad(`${(r.p * 100).toFixed(0)}% ${r.max} ${ttk(r)}`, 20),
      pad(`${(g.p * 100).toFixed(0)}% ${g.max} ${ttk(g)}`, 22),
      `${(inc.p * 100).toFixed(0)}% ${inc.avg.toFixed(1)}`,
    );
  }
}
