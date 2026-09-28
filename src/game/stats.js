// Turns level + equipment into the numbers combat reads.
export function computeStats(level, equipment) {
  const s = {
    life: 100 + 12 * (level - 1),
    mana: 60 + 3 * (level - 1),
    lifeRegen: 0.6 + 0.12 * level,
    manaRegen: 7,
    armor: 0,
    dmgMin: 3,
    dmgMax: 6,
    flatDmg: 0,
    pctDmg: 6 * (level - 1),
    atkSpd: 0,
    critChance: 5,
    critDmg: 50,
    lifeOnHit: 0,
    moveSpd: 0,
    area: 0,
    cdr: 0,
    fireDmg: 0,
    coldDmg: 0,
    lightningDmg: 0,
    magicFind: 0,
    goldFind: 0,
    pickupRadius: 0,
    extraBolts: 0,
    chainChance: 0,
  };
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    if (item.implicit?.dmgMin) {
      s.dmgMin = item.implicit.dmgMin;
      s.dmgMax = item.implicit.dmgMax;
    }
    if (item.implicit?.armor) s.armor += item.implicit.armor;
    for (const a of item.affixes || []) s[a.id] = (s[a.id] || 0) + a.value;
  }
  s.attacksPerSec = 1.6 * (1 + s.atkSpd / 100);
  s.dr = Math.min(0.7, s.armor / (s.armor + 90)); // at depth 1; see Combat.drFor
  s.moveSpeed = 6.8 * (1 + s.moveSpd / 100);
  s.cdrMult = 1 - Math.min(0.5, s.cdr / 100);
  s.areaMult = 1 + s.area / 100;
  s.pickup = 1.7 * (1 + s.pickupRadius / 100);
  s.avgHit = ((s.dmgMin + s.dmgMax) / 2 + s.flatDmg + s.fireDmg + s.coldDmg + s.lightningDmg) * (1 + s.pctDmg / 100);
  s.dps = s.avgHit * s.attacksPerSec * (1 + (Math.min(100, s.critChance) / 100) * (s.critDmg / 100));
  return s;
}
