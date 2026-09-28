import { UNIQUE_BY_ID } from '../content/uniques.js';

// Unique powers listen to game events. Triggers emitted by the engine:
//   swing (before a cleave resolves; can set forceCrit / areaMult / dmgMult)
//   attack (after a cleave resolves)   hit   crit   kill   dash   nova
//   pickup   hurt
export class PowerSystem {
  constructor(game) {
    this.game = game;
    this.active = [];
  }

  rebuild(equipment) {
    const prev = new Map(this.active.map((a) => [a.item.uid, a]));
    this.active = [];
    for (const item of Object.values(equipment)) {
      if (!item?.uniqueId) continue;
      const def = UNIQUE_BY_ID[item.uniqueId];
      if (!def) continue;
      this.active.push(prev.get(item.uid) || { def, item, asc: item.rarity === 'ascendant', state: {} });
    }
    this.game.hud?.setRhythm(0, this.active.some((a) => a.def.power.hud) ? 1 : 0);
  }

  emit(trigger, ev) {
    for (let i = 0; i < this.active.length; i++) {
      const inst = this.active[i];
      const fn = inst.def.power.on?.[trigger];
      if (fn) fn(this.game, ev, inst);
    }
    return ev;
  }

  update(dt) {
    for (const inst of this.active) inst.def.power.update?.(this.game, dt, inst);
  }
}
