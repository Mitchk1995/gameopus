import { Skills } from './skills.js';
import { Container } from './inventory.js';
import { ITEMS } from './items.js';

// Everything about the character that lasts: skills, what they carry, what's in the
// bank, what they wear, quests and the collection log. Saved in this browser.

const KEY = 'aldermere.save.v1';
export const SLOTS = ['head', 'weapon', 'body', 'shield', 'legs', 'ammo'];

const STARTER = [
  ['bronze_axe', 1], ['bronze_pickaxe', 1], ['small_net', 1], ['knife', 1], ['hammer', 1], ['coins', 25],
];

export class GameState {
  constructor(saved = null) {
    this.skills = new Skills(saved?.skills);
    this.inv = new Container(28, saved?.inv);
    this.bank = new Container(360, saved?.bank, { alwaysStack: true });
    this.equip = Object.fromEntries(SLOTS.map((s) => [s, saved?.equip?.[s] ?? null]));
    this.ammo = saved?.ammo ?? 0;
    this.hp = saved?.hp ?? this.skills.level('hitpoints');
    this.quests = saved?.quests ?? {};
    this.flags = saved?.flags ?? {};
    this.collection = saved?.collection ?? {};
    this.pos = saved?.pos ?? null;
    this.played = saved?.played ?? 0;
    this.listeners = new Set();
    if (!saved) {
      for (const [id, n] of STARTER) this.inv.add(id, n);
      this.equip.weapon = 'bronze_sword';
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return new GameState(JSON.parse(raw));
    } catch {
      // No storage (private window) or a damaged save: start fresh.
    }
    return new GameState();
  }

  save(extra = {}) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.toJSON(), ...extra }));
      return true;
    } catch {
      return false;
    }
  }

  static wipe() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to wipe
    }
  }

  changed(what) {
    for (const l of this.listeners) l(what);
  }

  get maxHp() {
    return this.skills.level('hitpoints');
  }

  // Equipment bonuses summed over everything worn.
  bonuses() {
    const b = { acc: 0, str: 0, def: 0, rangedAcc: 0, rangedStr: 0 };
    for (const id of Object.values(this.equip)) {
      const it = id && ITEMS[id];
      if (!it) continue;
      for (const [k, v] of Object.entries(it.bonus || {})) b[k] += v;
      if (it.rangedStr) b.rangedStr += it.rangedStr;
    }
    return b;
  }

  // Whether the requirements to wear or use an item are met; returns the first unmet one.
  unmet(id) {
    const req = ITEMS[id]?.req;
    if (!req) return null;
    for (const [skill, lvl] of Object.entries(req)) if (this.skills.level(skill) < lvl) return { skill, lvl };
    return null;
  }

  // Best tool of a kind the character has on hand (worn or carried) and can use.
  bestTool(kind) {
    let best = null;
    const consider = (id) => {
      const it = id && ITEMS[id];
      if (it?.tool !== kind || this.unmet(id)) return;
      if (!best || (it.power || 0) > (ITEMS[best].power || 0)) best = id;
    };
    consider(this.equip.weapon);
    for (const s of this.inv.slots) consider(s?.id);
    return best;
  }

  toJSON() {
    return {
      skills: this.skills.toJSON(), inv: this.inv.toJSON(), bank: this.bank.toJSON(), equip: this.equip, ammo: this.ammo,
      hp: this.hp, quests: this.quests, flags: this.flags, collection: this.collection, pos: this.pos, played: this.played,
    };
  }
}
