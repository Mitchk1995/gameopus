import { SLOT_ICONS } from './icons.js';
import { SLOTS, SLOT_NAMES, RARITY } from '../content/bases.js';
import { UNIQUES, UNIQUE_BY_ID } from '../content/uniques.js';
import { formatStat } from '../content/affixes.js';
import { computeStats } from '../game/stats.js';
import { isUnique, salvageValue } from '../game/items.js';

const BAG_SIZE = 40;
const DOLL = [null, 'helm', 'amulet', 'weapon', 'chest', 'ring', 'gloves', 'boots', null];

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.codexOpen = false;

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
  }

  get save() {
    return this.game.save;
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
    if (this.open) {
      this.codexOpen = false;
      this.codex.hidden = true;
      this.render();
    } else {
      this.tip.hidden = true;
      for (const it of this.save.bag) it.isNew = false;
    }
    this.game.audio.play('click');
  }

  toggleCodex(force) {
    this.codexOpen = force ?? !this.codexOpen;
    this.codex.hidden = !this.codexOpen;
    if (this.codexOpen) {
      this.toggle(false);
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
    if (!eq[slot] || this.save.bag.length >= BAG_SIZE) return;
    this.save.bag.push(eq[slot]);
    eq[slot] = null;
    this.#changed();
  }

  salvage(idx) {
    const item = this.save.bag[idx];
    this.save.shards += salvageValue(item);
    this.save.bag.splice(idx, 1);
    this.game.audio.play('salvage');
    this.tip.hidden = true;
    this.render();
    this.game.persist();
  }

  salvageMagic() {
    const bag = this.save.bag;
    let n = 0;
    for (let i = bag.length - 1; i >= 0; i--) {
      if (bag[i].rarity === 'magic') {
        this.save.shards += salvageValue(bag[i]);
        bag.splice(i, 1);
        n++;
      }
    }
    if (n) this.game.audio.play('salvage');
    this.render();
    this.game.persist();
  }

  #changed() {
    this.game.player.recompute();
    this.game.audio.play('equip');
    this.tip.hidden = true;
    this.render();
    this.game.persist();
  }

  #slotEl(item, slotName) {
    const d = el('button', `slot ${item ? item.rarity : 'empty'}`);
    d.type = 'button';
    if (item) {
      d.innerHTML = SLOT_ICONS[item.slot] + (item.isNew ? '<span class="new"></span>' : '');
      d.style.color = RARITY[item.rarity].css;
      d.setAttribute('aria-label', item.name);
    } else if (slotName) {
      d.innerHTML = `<span class="ghost">${SLOT_ICONS[slotName]}</span>`;
      d.setAttribute('aria-label', `Empty ${slotName} slot`);
    }
    return d;
  }

  render() {
    const eq = this.save.equipment, bag = this.save.bag;
    const p = this.game.player, s = p.stats;
    this.panel.innerHTML = '';
    const head = el('header', '', '<h2>Inventory</h2><button class="x" aria-label="Close inventory">✕</button>');
    head.querySelector('.x').onclick = () => this.toggle(false);
    this.panel.append(head);

    const doll = el('div', 'doll');
    for (const slot of DOLL) {
      if (!slot) { doll.append(el('div')); continue; }
      const item = eq[slot];
      const d = this.#slotEl(item, slot);
      if (item) {
        d.onclick = () => this.unequip(slot);
        this.#hover(d, item, null, 'Click to unequip');
      }
      doll.append(d);
    }
    this.panel.append(doll);

    const stats = [
      ['Damage per second', Math.round(s.dps).toLocaleString()],
      ['Life', Math.round(s.life)],
      ['Hit damage', `${Math.round(s.dmgMin + s.flatDmg)}–${Math.round(s.dmgMax + s.flatDmg)}`],
      ['Armor', `${Math.round(s.armor)} (${Math.round(s.dr * 100)}%)`],
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
        this.#hover(d, item, eq[item.slot], `Click to equip · Right-click to salvage for ${salvageValue(item)} shards`);
      }
      grid.append(d);
    }
    this.panel.append(grid);

    const foot = el('div', 'invfoot', `<span>${bag.length}/${BAG_SIZE} carried</span><button type="button">Salvage all Magic items</button>`);
    foot.querySelector('button').onclick = () => this.salvageMagic();
    this.panel.append(foot);
  }

  #hover(node, item, compare, hint) {
    node.addEventListener('pointerenter', (e) => {
      this.tip.innerHTML = this.tooltip(item, compare, hint);
      this.tip.className = `tip ${item.rarity}`;
      this.tip.hidden = false;
      this.#placeTip(e.clientX, e.clientY);
    });
    node.addEventListener('pointerleave', () => (this.tip.hidden = true));
  }

  #placeTip(x, y) {
    const r = this.tip.getBoundingClientRect();
    let tx = x - r.width - 18;
    if (tx < 8) tx = x + 18;
    let ty = Math.min(y - 20, innerHeight - r.height - 8);
    this.tip.style.left = `${tx}px`;
    this.tip.style.top = `${Math.max(8, ty)}px`;
  }

  tooltip(item, compare, hint) {
    const r = RARITY[item.rarity];
    const lines = [];
    lines.push(`<div class="nm" style="color:${r.css}">${esc(item.name)}</div>`);
    if (item.rarity === 'ascendant') lines.push('<div class="asc">Ascendant · perfect rolls</div>');
    lines.push(`<div class="ty">${r.label} ${SLOT_NAMES[item.slot]} · ${esc(item.base)} · ilvl ${item.ilvl}</div>`);
    if (item.implicit?.dmgMin) lines.push(`<div class="imp">${item.implicit.dmgMin}–${item.implicit.dmgMax} Damage</div>`);
    if (item.implicit?.armor) lines.push(`<div class="imp">${item.implicit.armor} Armor</div>`);
    for (const a of item.affixes) lines.push(`<div class="aff">${esc(formatStat(a.id, a.value))}</div>`);
    if (item.uniqueId) {
      const def = UNIQUE_BY_ID[item.uniqueId];
      lines.push(`<div class="pw">${esc(def.power.text(item.rarity === 'ascendant'))}</div>`);
      lines.push(`<div class="fl">“${esc(def.flavor)}”</div>`);
    }
    if (compare !== undefined) {
      const eq = this.save.equipment;
      const lvl = this.game.player.level;
      const now = computeStats(lvl, eq);
      const after = computeStats(lvl, { ...eq, [item.slot]: item });
      const rows = [
        ['DPS', after.dps - now.dps, (v) => Math.round(v).toLocaleString()],
        ['Life', after.life - now.life, (v) => Math.round(v)],
        ['Armor', after.armor - now.armor, (v) => Math.round(v)],
        ['Magic find', after.magicFind - now.magicFind, (v) => `${v}%`],
      ].filter(([, d]) => Math.abs(d) >= 0.5);
      if (rows.length)
        lines.push(`<div class="cmp">${rows.map(([k, d, f]) => `<div class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${f(Math.abs(d))} ${k}</div>`).join('')}</div>`);
    }
    if (hint) lines.push(`<div class="hint">${hint}</div>`);
    return lines.join('');
  }

  renderCodex() {
    const c = this.save.codex;
    const found = UNIQUES.filter((u) => c[u.id]?.found).length;
    this.codex.innerHTML = '';
    const head = el('header', '', '<h2>The Codex</h2><button class="x" aria-label="Close codex">✕</button>');
    head.querySelector('.x').onclick = () => this.toggleCodex(false);
    this.codex.append(head);
    this.codex.append(el('p', 'intro', 'Every unique ever recovered from the Hollowreach. Unfound entries stay sealed. New ones are written into the world as it grows deeper.'));
    this.codex.append(el('div', 'meter', `${found} of ${UNIQUES.length} recovered · deepest depth ${this.save.deepest} · ${this.save.lifetimeKills.toLocaleString()} slain`));
    const cards = el('div', 'cards');
    for (const u of UNIQUES) {
      const e = c[u.id];
      if (!e?.found) {
        cards.append(el('div', 'card locked', `${SLOT_ICONS[u.slot]}<div class="nm">???</div><div class="sl">${SLOT_NAMES[u.slot]}</div><div class="ct">Not yet found</div>`));
        continue;
      }
      cards.append(el('div', `card found${e.asc ? ' asc' : ''}`, `<div class="nm">${esc(u.name)}</div><div class="sl">${SLOT_NAMES[u.slot]}</div><div class="pw">${esc(u.power.text(false))}</div><div class="ct">Found ${e.found}×${e.asc ? ` · <b>Ascendant ×${e.asc}</b>` : ''}</div>`));
    }
    this.codex.append(cards);
  }
}
