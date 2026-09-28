import { SLOT_ICONS } from './icons.js';
import { SLOT_NAMES, RARITY } from '../content/bases.js';
import { UNIQUES, UNIQUE_BY_ID } from '../content/uniques.js';
import { formatStat } from '../content/affixes.js';
import { computeStats } from '../game/stats.js';
import { isUnique, salvageValue } from '../game/items.js';

const BAG_SIZE = 40;
const DOLL = [null, 'helm', 'amulet', 'weapon', 'chest', 'ring', 'gloves', 'boots', null];

// Stat lines shown in the comparison, in priority order.
const DIFF_ROWS = [
  ['dps', 'Damage per second', (v) => Math.round(v).toLocaleString(), 0.5],
  ['life', 'Life', (v) => Math.round(v), 0.5],
  ['armor', 'Armor', (v) => Math.round(v), 0.5],
  ['attacksPerSec', 'Attacks per second', (v) => v.toFixed(2), 0.005],
  ['critChance', 'Critical chance', (v) => `${v}%`, 0.5],
  ['critDmg', 'Critical damage', (v) => `${v}%`, 0.5],
  ['lifeOnHit', 'Life per hit', (v) => Math.round(v), 0.5],
  ['lifeRegen', 'Life per second', (v) => v.toFixed(1), 0.05],
  ['moveSpd', 'Movement speed', (v) => `${v}%`, 0.5],
  ['mana', 'Mana', (v) => Math.round(v), 0.5],
  ['manaRegen', 'Mana per second', (v) => v.toFixed(1), 0.05],
  ['area', 'Area of effect', (v) => `${v}%`, 0.5],
  ['cdr', 'Cooldown reduction', (v) => `${v}%`, 0.5],
  ['chainChance', 'Chain lightning chance', (v) => `${v}%`, 0.5],
  ['extraBolts', 'Extra bolts', (v) => v, 0.5],
  ['magicFind', 'Magic find', (v) => `${v}%`, 0.5],
  ['goldFind', 'Gold find', (v) => `${v}%`, 0.5],
  ['pickupRadius', 'Pickup radius', (v) => `${v}%`, 0.5],
];

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.codexOpen = false;
    this.confirm = null;

    this.panel = el('section', 'panel inv');
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Inventory');
    document.getElementById('app').appendChild(this.panel);

    this.codex = el('section', 'panel codex');
    this.codex.hidden = true;
    document.getElementById('app').appendChild(this.codex);

    this.tip = el('div', 'tip');
    this.tip.hidden = true;
    document.getElementById('app').appendChild(this.tip);

    addEventListener('pointermove', (e) => {
      if (!this.tip.hidden) this.#placeTip(e.clientX, e.clientY);
    });
    addEventListener('blur', () => this.hideTip());
  }

  get save() {
    return this.game.save;
  }

  // Art hook: the item art pass swaps this for rendered icons.
  iconHTML(item) {
    const art = this.game.art?.icon(item);
    if (art) return `<img class="art" src="${art}" alt="" draggable="false">`;
    return SLOT_ICONS[item.slot];
  }

  add(item) {
    const bag = this.save.bag;
    if (bag.length >= BAG_SIZE) return false;
    item.isNew = true;
    bag.push(item);
    const isNew = this.#discover(item);
    this.game.hud.lootToast(item, isNew);
    if (this.open) this.render();
    this.game.persist();
    return true;
  }

  #discover(item) {
    if (!isUnique(item)) return false;
    const c = (this.save.codex[item.uniqueId] ||= { found: 0, asc: 0 });
    const first = c.found === 0;
    c.found++;
    if (item.rarity === 'ascendant') c.asc++;
    return first;
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.panel.hidden = !this.open;
    this.hideTip();
    if (this.open) {
      this.codexOpen = false;
      this.codex.hidden = true;
      this.game.settingsUI?.toggle(false);
      this.render();
    } else {
      for (const it of this.save.bag) it.isNew = false;
    }
    this.game.audio.play('click');
  }

  toggleCodex(force) {
    this.codexOpen = force ?? !this.codexOpen;
    this.codex.hidden = !this.codexOpen;
    this.hideTip();
    if (this.codexOpen) {
      if (this.open) this.toggle(false);
      this.game.settingsUI?.toggle(false);
      this.renderCodex();
    }
  }

  equip(idx) {
    const bag = this.save.bag, eq = this.save.equipment;
    const item = bag[idx];
    const prev = eq[item.slot];
    eq[item.slot] = item;
    item.isNew = false;
    if (prev) bag[idx] = prev;
    else bag.splice(idx, 1);
    this.#changed();
  }

  unequip(slot) {
    const eq = this.save.equipment;
    if (!eq[slot]) return;
    if (this.save.bag.length >= BAG_SIZE) {
      this.game.hud.toast('Your bag is full', 'warn');
      return;
    }
    this.save.bag.push(eq[slot]);
    eq[slot] = null;
    this.#changed();
  }

  salvage(idx) {
    const item = this.save.bag[idx];
    // Uniques ask twice: a second right-click within a few seconds confirms.
    if (isUnique(item)) {
      const now = performance.now();
      if (!this.confirm || this.confirm.uid !== item.uid || now - this.confirm.t > 3000) {
        this.confirm = { uid: item.uid, t: now };
        this.game.hud.toast(`Right-click <b>${esc(item.name)}</b> again to salvage it`, 'warn');
        this.render();
        return;
      }
    }
    this.confirm = null;
    this.save.shards += salvageValue(item);
    this.save.bag.splice(idx, 1);
    this.game.audio.play('salvage');
    this.hideTip();
    this.render();
    this.game.persist();
  }

  salvageMagic() {
    const bag = this.save.bag;
    let n = 0;
    for (let i = bag.length - 1; i >= 0; i--) {
      if (bag[i].rarity === 'magic' && this.upgradeScore(bag[i]) <= 0) {
        this.save.shards += salvageValue(bag[i]);
        bag.splice(i, 1);
        n++;
      }
    }
    if (n) this.game.audio.play('salvage');
    this.game.hud.toast(n ? `Salvaged ${n} Magic item${n > 1 ? 's' : ''}` : 'Nothing to salvage (upgrades are kept)');
    this.render();
    this.game.persist();
  }

  #changed() {
    this.game.player.recompute();
    this.game.audio.play('equip');
    this.hideTip();
    this.render();
    this.game.persist();
  }

  // Comparison ----------------------------------------------------------
  #statsWith(item) {
    const eq = this.save.equipment, lvl = this.game.player.level;
    return { now: computeStats(lvl, eq), after: computeStats(lvl, { ...eq, [item.slot]: item }) };
  }

  // Percent gain in damage plus a share of toughness. Positive = better.
  upgradeScore(item) {
    const cur = this.save.equipment[item.slot];
    if (cur === item) return 0;
    if (!cur) return 100;
    const { now, after } = this.#statsWith(item);
    const ehp = (s) => s.life / (1 - s.dr);
    const dps = (after.dps - now.dps) / Math.max(1, now.dps);
    const tough = (ehp(after) - ehp(now)) / Math.max(1, ehp(now));
    return (dps + tough * 0.6) * 100;
  }

  isUpgrade(item) {
    return this.upgradeScore(item) > 1.5;
  }

  #compareHTML(item) {
    const cur = this.save.equipment[item.slot];
    const { now, after } = this.#statsWith(item);
    const rows = [];
    for (const [key, label, f, eps] of DIFF_ROWS) {
      const d = (after[key] || 0) - (now[key] || 0);
      if (Math.abs(d) < eps) continue;
      rows.push(`<div class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${f(Math.abs(d))} ${label}</div>`);
    }
    const score = this.upgradeScore(item);
    const verdict = !cur ? ['up', 'Empty slot — free upgrade'] : score > 1.5 ? ['up', 'Upgrade'] : score < -1.5 ? ['dn', 'Downgrade'] : ['side', 'Sidegrade'];
    const notes = [];
    if (item.uniqueId && item.uniqueId !== cur?.uniqueId) notes.push('<div class="up">✦ Gains a unique power</div>');
    if (cur?.uniqueId && cur.uniqueId !== item.uniqueId) notes.push(`<div class="dn">✦ Loses ${esc(UNIQUE_BY_ID[cur.uniqueId].name)}'s power</div>`);
    return `<div class="cmp"><div class="verdict ${verdict[0]}">${verdict[1]}</div>${notes.join('')}${rows.slice(0, 9).join('')}</div>`;
  }

  #card(item, { label, compare, hint } = {}) {
    const r = RARITY[item.rarity];
    const lines = [];
    if (label) lines.push(`<div class="badge">${label}</div>`);
    lines.push(`<div class="head"><div class="pic ${item.rarity}">${this.iconHTML(item)}</div><div><div class="nm" style="color:${r.css}">${esc(item.name)}</div>`);
    lines.push(`<div class="ty">${r.label} ${SLOT_NAMES[item.slot]}</div><div class="ty2">${esc(item.base)} · item level ${item.ilvl}</div></div></div>`);
    if (item.rarity === 'ascendant') lines.push('<div class="asc">Ascendant · perfect rolls</div>');
    if (item.implicit?.dmgMin) lines.push(`<div class="imp">${item.implicit.dmgMin}–${item.implicit.dmgMax} Damage</div>`);
    if (item.implicit?.armor) lines.push(`<div class="imp">${item.implicit.armor} Armor</div>`);
    for (const a of item.affixes) lines.push(`<div class="aff">${esc(formatStat(a.id, a.value))}</div>`);
    if (item.uniqueId) {
      const def = UNIQUE_BY_ID[item.uniqueId];
      lines.push(`<div class="pw">${esc(def.power.text(item.rarity === 'ascendant'))}</div>`);
      lines.push(`<div class="fl">“${esc(def.flavor)}”</div>`);
    }
    if (compare) lines.push(this.#compareHTML(item));
    if (hint) lines.push(`<div class="hint">${hint}</div>`);
    return `<div class="card ${item.rarity}">${lines.join('')}</div>`;
  }

  // Show an item tooltip (with comparison against the equipped item) at a screen point.
  showTip(item, x, y, { hint, compare = true } = {}) {
    const cur = this.save.equipment[item.slot];
    const vsEquipped = compare && cur !== item;
    let html = this.#card(item, { compare: vsEquipped, hint, label: cur === item ? 'Equipped' : null });
    if (vsEquipped && cur) html += this.#card(cur, { label: 'Equipped' });
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    this.#placeTip(x, y);
  }

  hideTip() {
    this.tip.hidden = true;
  }

  #hover(node, item, hint) {
    node.addEventListener('pointerenter', (e) => this.showTip(item, e.clientX, e.clientY, { hint }));
    node.addEventListener('pointerleave', () => this.hideTip());
  }

  #placeTip(x, y) {
    const r = this.tip.getBoundingClientRect();
    let tx = x - r.width - 18;
    if (tx < 8) tx = x + 18;
    if (tx + r.width > innerWidth - 8) tx = Math.max(8, innerWidth - r.width - 8);
    const ty = Math.min(y - 20, innerHeight - r.height - 8);
    this.tip.style.left = `${tx}px`;
    this.tip.style.top = `${Math.max(8, ty)}px`;
  }

  // Rendering -----------------------------------------------------------
  #slotEl(item, slotName) {
    const d = el('button', `slot ${item ? item.rarity : 'empty'}`);
    d.type = 'button';
    if (item) {
      const up = slotName ? '' : this.isUpgrade(item) ? '<span class="upg" title="Upgrade">▲</span>' : '';
      const armed = this.confirm?.uid === item.uid ? ' armed' : '';
      d.className += armed;
      d.innerHTML = this.iconHTML(item) + (item.isNew ? '<span class="new"></span>' : '') + up;
      d.style.color = RARITY[item.rarity].css;
      d.setAttribute('aria-label', item.name);
    } else if (slotName) {
      d.innerHTML = `<span class="ghost">${SLOT_ICONS[slotName]}</span>`;
      d.setAttribute('aria-label', `Empty ${slotName} slot`);
    }
    return d;
  }

  render() {
    this.hideTip();
    const eq = this.save.equipment, bag = this.save.bag;
    const s = this.game.player.stats;
    this.panel.innerHTML = '';
    const head = el('header', '', '<h2>Inventory</h2><button class="x" type="button" aria-label="Close inventory">✕</button>');
    head.querySelector('.x').onclick = () => this.toggle(false);
    this.panel.append(head);

    const doll = el('div', 'doll');
    for (const slot of DOLL) {
      if (!slot) { doll.append(el('div')); continue; }
      const item = eq[slot];
      const d = this.#slotEl(item, slot);
      if (item) {
        d.onclick = () => this.unequip(slot);
        this.#hover(d, item, 'Click to unequip');
      }
      doll.append(d);
    }
    this.panel.append(doll);

    const stats = [
      ['Damage per second', Math.round(s.dps).toLocaleString()],
      ['Life', Math.round(s.life)],
      ['Hit damage', `${Math.round(s.dmgMin + s.flatDmg)}–${Math.round(s.dmgMax + s.flatDmg)}`],
      ['Armor', `${Math.round(s.armor)} (${Math.round(this.game.combat.drFor(s.armor) * 100)}% here)`],
      ['Attacks / sec', s.attacksPerSec.toFixed(2)],
      ['Crit', `${s.critChance}% ×${(1 + s.critDmg / 100).toFixed(2)}`],
      ['Magic find', `${s.magicFind}%`],
      ['Gold find', `${s.goldFind}%`],
    ];
    this.panel.append(el('div', 'statgrid', stats.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')));

    const grid = el('div', 'bag');
    for (let i = 0; i < BAG_SIZE; i++) {
      const item = bag[i];
      const d = this.#slotEl(item);
      if (item) {
        d.onclick = (e) => (e.shiftKey ? this.salvage(i) : this.equip(i));
        d.oncontextmenu = (e) => {
          e.preventDefault();
          this.salvage(i);
        };
        this.#hover(d, item, `Left-click to equip · Right-click to salvage (+${salvageValue(item)} shards)`);
      }
      grid.append(d);
    }
    this.panel.append(grid);

    const foot = el('div', 'invfoot', `<span>${bag.length}/${BAG_SIZE} carried · <span class="upg">▲</span> marks upgrades</span><button type="button">Salvage Magic non-upgrades</button>`);
    foot.querySelector('button').onclick = () => this.salvageMagic();
    this.panel.append(foot);
  }

  renderCodex() {
    this.hideTip();
    const c = this.save.codex;
    const found = UNIQUES.filter((u) => c[u.id]?.found).length;
    this.codex.innerHTML = '';
    const head = el('header', '', '<h2>The Codex</h2><button class="x" type="button" aria-label="Close codex">✕</button>');
    head.querySelector('.x').onclick = () => this.toggleCodex(false);
    this.codex.append(head);
    this.codex.append(el('p', 'intro', 'Every unique ever recovered from the Hollowreach. Unfound entries stay sealed. New ones are written into the world as it grows deeper.'));
    this.codex.append(el('div', 'meter', `${found} of ${UNIQUES.length} recovered · deepest depth ${this.save.deepest} · ${this.save.lifetimeKills.toLocaleString()} slain`));
    const cards = el('div', 'cards');
    for (const u of UNIQUES) {
      const e = c[u.id];
      const art = this.game.art?.uniqueIcon(u.id);
      const pic = art ? `<img class="art" src="${art}" alt="" draggable="false">` : SLOT_ICONS[u.slot];
      if (!e?.found) {
        cards.append(el('div', 'entry locked', `<div class="pic">${pic}</div><div class="nm">???</div><div class="sl">${SLOT_NAMES[u.slot]}</div><div class="ct">Not yet found</div>`));
        continue;
      }
      cards.append(el('div', `entry found${e.asc ? ' asc' : ''}`, `<div class="pic">${pic}</div><div class="nm">${esc(u.name)}</div><div class="sl">${SLOT_NAMES[u.slot]}</div><div class="pw">${esc(u.power.text(false))}</div><div class="ct">Found ${e.found}×${e.asc ? ` · <b>Ascendant ×${e.asc}</b>` : ''}</div>`));
    }
    this.codex.append(cards);
  }
}
