// Difficulty tiers. Each one makes monsters much tougher and pays out in better loot.
// A tier unlocks by reaching Depth 5 on the tier before it.
export const DREAD_TIERS = 6;
export const DREAD_UNLOCK_DEPTH = 5;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
export const dreadName = (d) => (d === 0 ? 'Normal' : `Dread ${NUMERALS[d - 1]}`);
export const dreadMods = (d) => ({
  hp: Math.pow(2.3, d),
  dmg: Math.pow(1.6, d),
  items: 1 + 0.25 * d,
  unique: 1 + 0.4 * d,
  gold: 1 + 0.5 * d,
  xp: 1 + 0.5 * d,
  ilvl: 3 * d,
});
