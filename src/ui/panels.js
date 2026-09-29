import './panels.css';
import { ITEMS } from '../game/items.js';
import { SKILLS, SKILL, xpForLevel, MAX_LEVEL } from '../game/skills.js';
import { SLOTS } from '../game/state.js';
import { icon, SKILL_COLOR } from './icons.js';
import { el, fmt, qtyLabel } from './dom.js';

// What the collection log tracks, section by section.
const COLLECTION = [
  { name: 'Grubnak, the Warren King', kill: 'Grubnak, the Warren King', items: ['warren_crown', 'kings_cleaver', 'pet_grubling'] },
  { name: 'Bandit captain', kill: 'Bandit captain', items: ['captains_cutlass', 'pet_magpie'] },
  { name: 'Skilling pets', items: ['pet_sapling', 'pet_golem', 'pet_frogling'] },
];

// The side panel (inventory / worn / skills / quests / collection log), the tooltip and
// right-click menu, the goal tracker with experience drops, the message log and level-up
// banners.
//
// The game supplies behaviour through `actions`:
//   primary(slot)            left click on an inventory slot
//   options(slot) -> [{label, run}]   right-click menu for a slot
//   drop(slot)               shift-click
//   unequip(slotName)        click on a worn slot
//   useOn(fromSlot, toSlot)  "Use" one item on another
//   guide(skillId)           click on a skill
//   pet(itemId)              click on a pet in the collection log
//   quests(pane)             draws the quest tab into pane
//   nextUnlock(skill, level) -> {label, level}   the goal tracker's "Next:" line
//   unlocksAt(skill, level) -> [label]           what a level-up banner lists
export class Panels {
  constructor({ state, studio, actions }) {
    this.state = state;
    this.studio = studio;
    this.actions = actions;
    this.using = -1;
    this.tab = 'inv';

    this.side = el('div', 'side');
    this.side.innerHTML = `
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="inv" aria-selected="true" title="Inventory (Tab)">${icon('bag', 20)}</button>
        <button role="tab" data-tab="worn" aria-selected="false" title="Worn equipment">${icon('worn', 20)}</button>
        <button role="tab" data-tab="skills" aria-selected="false" title="Skills (K)">${icon('stats', 20)}</button>
        <button role="tab" data-tab="quests" aria-selected="false" title="Quests (J)">${icon('quest', 20)}</button>
        <button role="tab" data-tab="log" aria-selected="false" title="Collection log (C)">${icon('log', 20)}</button>
      </div>
      <div class="pane" data-pane="inv"><div class="grid"></div></div>
      <div class="pane" data-pane="worn" hidden><div class="worn"></div><div class="bonuses"></div></div>
      <div class="pane" data-pane="skills" hidden><div class="skills"></div><div class="totals"></div></div>
      <div class="pane" data-pane="quests" hidden><div class="quests"></div></div>
      <div class="pane" data-pane="log" hidden><div class="clog"></div></div>`;
    document.body.append(this.side);
    this.side.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.tab)));
    this.side.addEventListener('contextmenu', (e) => e.preventDefault());

    this.grid = this.side.querySelector('.grid');
    for (let i = 0; i < 28; i++) {
      const s = el('div', 'slot');
      s.dataset.i = i;
      this.grid.append(s);
    }
    this.#bindGrid();

    this.wornEl = this.side.querySelector('.worn');
    for (const name of SLOTS) {
      const s = el('div', 'slot', `<span class="label">${name}</span>`);
      s.style.gridArea = name;
      s.dataset.slot = name;
      s.addEventListener('click', () => this.state.equip[name] && this.actions.unequip(name));
      s.addEventListener('mouseenter', (e) => this.#tipItem(this.state.equip[name], e, 'Remove'));
      s.addEventListener('mouseleave', () => this.hideTip());
      this.wornEl.append(s);
    }
    this.skillsEl = this.side.querySelector('.skills');
    for (const sk of SKILLS) {
      const b = el('button', 'skill', `${icon(sk.id, 20)}<span class="lv"></span><span class="bar"><i></i></span>`);
      b.style.color = SKILL_COLOR[sk.id];
      b.querySelector('.lv').style.color = 'var(--ink)';
      b.dataset.skill = sk.id;
      b.addEventListener('click', () => this.actions.guide(sk.id));
      b.addEventListener('mouseenter', (e) => this.#tipSkill(sk.id, e));
      b.addEventListener('mousemove', (e) => this.#placeTip(e));
      b.addEventListener('mouseleave', () => this.hideTip());
      this.skillsEl.append(b);
    }

    this.tip = el('div', 'tip');
    this.tip.hidden = true;
    this.menu = el('div', 'menu');
    this.menu.hidden = true;
    document.body.append(this.tip, this.menu);
    addEventListener('pointerdown', (e) => {
      if (!this.menu.hidden && !this.menu.contains(e.target)) this.menu.hidden = true;
    }, true);

    this.goalEl = el('div', 'goal');
    this.dropsEl = el('div', 'drops');
    this.logEl = el('div', 'log');
    this.levelEl = el('div', 'levelup');
    document.body.append(this.goalEl, this.dropsEl, this.logEl, this.levelEl);

    state.inv.listeners.add(() => this.renderInv());
    state.skills.listeners.add((e) => this.#onXp(e));
    this.renderInv();
    this.renderWorn();
    this.renderSkills();
  }

  get isOpen() {
    return this.side.classList.contains('open');
  }

  open(tab) {
    if (tab) this.show(tab);
    this.side.classList.add('open');
  }

  close() {
    this.side.classList.remove('open');
    this.menu.hidden = true;
    this.hideTip();
    this.cancelUse();
  }

  show(tab) {
    this.tab = tab;
    this.side.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.side.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.pane !== tab));
    if (tab === 'worn') this.renderWorn();
    if (tab === 'skills') this.renderSkills();
    if (tab === 'log') this.renderLog();
    if (tab === 'quests') this.actions.quests?.(this.side.querySelector('.quests'));
  }

  // ------------------------------------------------------------ collection log
  renderLog() {
    const box = this.side.querySelector('.clog');
    if (!box || this.tab !== 'log') return;
    const log = this.state.collection.log || {}, kills = this.state.collection.kills || {};
    box.innerHTML = '';
    for (const sec of COLLECTION) {
      const got = sec.items.filter((id) => log[id]).length;
      const head = el('div', 'clog-head', `<span>${sec.name}</span><small>${got}/${sec.items.length}</small>`);
      box.append(head);
      if (sec.kill) box.append(el('div', 'clog-kc', `Kills: ${fmt(kills[sec.kill] || 0)}`));
      const grid = el('div', 'grid');
      for (const id of sec.items) {
        const cell = el('div', `slot${log[id] ? ' full' : ''}`);
        cell.innerHTML = `<img alt="" src="${this.studio.icon(id)}" style="${log[id] ? '' : 'filter:grayscale(1) brightness(0.35)'}">${log[id] > 1 ? `<span class="qty">${log[id]}</span>` : ''}`;
        cell.addEventListener('mouseenter', (e) => this.#tipItem(id, e, log[id] ? (ITEMS[id].pet ? 'Summon or dismiss' : '') : 'Not yet found:'));
        cell.addEventListener('mousemove', (e) => this.#placeTip(e));
        cell.addEventListener('mouseleave', () => this.hideTip());
        if (ITEMS[id].pet && log[id]) cell.addEventListener('click', () => this.actions.pet?.(id));
        grid.append(cell);
      }
      box.append(grid);
    }
  }

  // ------------------------------------------------------------ inventory
  renderInv() {
    const slots = this.grid.children;
    this.state.inv.slots.forEach((s, i) => {
      const cell = slots[i];
      cell.classList.toggle('full', !!s);
      cell.classList.toggle('using', i === this.using);
      const key = s ? `${s.id}:${s.n}` : '';
      if (cell.dataset.key === key) return;
      cell.dataset.key = key;
      if (!s) {
        cell.innerHTML = '';
        return;
      }
      const it = ITEMS[s.id];
      const [q, cls] = qtyLabel(s.n);
      cell.innerHTML = `<img alt="${it.name}" src="${this.studio.icon(s.id)}">${it.stack || s.n > 1 ? `<span class="qty ${cls}">${q}</span>` : ''}`;
    });
  }

  #bindGrid() {
    let from = -1, moved = false, startX = 0, startY = 0;
    this.grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.slot');
      if (!cell || e.button !== 0) return;
      from = +cell.dataset.i;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
    });
    addEventListener('pointermove', (e) => {
      if (from < 0 || moved) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6 && this.state.inv.slots[from]) {
        moved = true;
        this.grid.children[from].classList.add('dragging');
      }
    });
    addEventListener('pointerup', (e) => {
      if (from < 0) return;
      const src = from;
      from = -1;
      this.grid.children[src].classList.remove('dragging');
      const cell = e.target.closest?.('.slot');
      if (moved) {
        if (cell && cell.parentElement === this.grid && +cell.dataset.i !== src) this.state.inv.swap(src, +cell.dataset.i);
        return;
      }
      if (!cell || +cell.dataset.i !== src) return;
      this.#click(src, e);
    });
    this.grid.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('.slot');
      if (!cell || !this.state.inv.slots[+cell.dataset.i]) return;
      e.preventDefault();
      this.hideTip();
      this.#menu(e.clientX, e.clientY, this.actions.options(+cell.dataset.i));
    });
    this.grid.addEventListener('mouseover', (e) => {
      const cell = e.target.closest('.slot');
      if (!cell) return;
      const s = this.state.inv.slots[+cell.dataset.i];
      if (s) this.#tipItem(s.id, e);
      else this.hideTip();
    });
    this.grid.addEventListener('mousemove', (e) => this.#placeTip(e));
    this.grid.addEventListener('mouseleave', () => this.hideTip());
  }

  #click(i, e) {
    const s = this.state.inv.slots[i];
    if (this.using >= 0) {
      const a = this.using;
      this.cancelUse();
      if (s && a !== i) this.actions.useOn(a, i);
      return;
    }
    if (!s) return;
    if (e.shiftKey) this.actions.drop(i);
    else this.actions.primary(i);
  }

  beginUse(i) {
    this.using = i;
    this.renderInv();
    const it = ITEMS[this.state.inv.slots[i].id];
    this.message(`Use ${it.name} with...`, 'game');
  }

  cancelUse() {
    if (this.using < 0) return;
    this.using = -1;
    this.renderInv();
  }

  // ------------------------------------------------------------ worn
  renderWorn() {
    for (const cell of this.wornEl.children) {
      const id = this.state.equip[cell.dataset.slot];
      cell.classList.toggle('full', !!id);
      const img = cell.querySelector('img');
      if (!id) {
        img?.remove();
        cell.querySelector('.qty')?.remove();
        continue;
      }
      if (!img || img.dataset.id !== id) {
        img?.remove();
        const im = el('img');
        im.src = this.studio.icon(id);
        im.dataset.id = id;
        cell.prepend(im);
      }
      let q = cell.querySelector('.qty');
      if (cell.dataset.slot === 'ammo') {
        if (!q) cell.append((q = el('span', 'qty')));
        q.textContent = qtyLabel(this.state.ammo)[0];
      } else q?.remove();
    }
    const b = this.state.bonuses();
    this.side.querySelector('.bonuses').innerHTML = [
      ['Melee accuracy', b.acc], ['Melee strength', b.str], ['Ranged accuracy', b.rangedAcc], ['Ranged strength', b.rangedStr], ['Defence', b.def],
    ].map(([k, v]) => `<span>${k}</span><b>${v > 0 ? '+' : ''}${Math.round(v)}</b>`).join('');
  }

  // ------------------------------------------------------------ skills
  renderSkills() {
    const sk = this.state.skills;
    for (const b of this.skillsEl.children) {
      const id = b.dataset.skill;
      b.querySelector('.lv').textContent = sk.level(id);
      b.querySelector('.bar i').style.width = `${Math.round(sk.progress(id) * 100)}%`;
    }
    this.side.querySelector('.totals').innerHTML = `<span>Total <b>${sk.total()}</b></span><span>Combat <b>${sk.combatLevel()}</b></span>`;
  }

  #onXp({ id, amount, after, before }) {
    // Drops, the tracker and the levels grid.
    const d = el('div', 'drop', `${icon(id, 16)}<span>+${fmt(Math.round(amount))}</span>`);
    d.querySelector('svg').style.color = SKILL_COLOR[id];
    this.dropsEl.append(d);
    while (this.dropsEl.children.length > 8) this.dropsEl.firstChild.remove();
    setTimeout(() => d.remove(), 2000);
    this.track(id);
    if (this.tab === 'skills') this.renderSkills();
    if (after > before) this.#levelUp(id, after);
  }

  // The goal tracker follows whichever skill you trained last.
  track(id) {
    this.tracked = id;
    const sk = this.state.skills;
    const lvl = sk.level(id), xp = sk.xp[id];
    const next = lvl >= MAX_LEVEL ? null : xpForLevel(lvl + 1);
    const unlock = this.actions.nextUnlock?.(id, lvl);
    this.goalEl.innerHTML = `
      <div class="head">${icon(id, 18)}<span>${SKILL[id].name}</span><span class="lv">${lvl}</span></div>
      <div class="track"><i style="width:${Math.round(sk.progress(id) * 100)}%;background:${SKILL_COLOR[id]}"></i></div>
      <div class="next">${next ? `<b>${fmt(Math.ceil(next - xp))}</b> xp to level ${lvl + 1}` : 'Mastered'}${unlock ? `<br>Next: <b>${unlock.label}</b> at ${unlock.level}` : ''}</div>`;
    this.goalEl.querySelector('svg').style.color = SKILL_COLOR[id];
    this.goalEl.classList.add('show');
    clearTimeout(this.goalTimer);
    this.goalTimer = setTimeout(() => this.goalEl.classList.remove('show'), 12000);
  }

  #levelUp(id, lvl) {
    const unlocked = this.actions.unlocksAt?.(id, lvl) || [];
    this.levelEl.innerHTML = `<div class="big">${icon(id, 26)} ${SKILL[id].name} level ${lvl}</div>${unlocked.length ? `<div class="small">You can now: ${unlocked.slice(0, 3).join(', ')}</div>` : ''}`;
    this.levelEl.querySelector('svg').style.color = SKILL_COLOR[id];
    this.levelEl.classList.add('show');
    clearTimeout(this.levelTimer);
    this.levelTimer = setTimeout(() => this.levelEl.classList.remove('show'), 4200);
    this.message(`Congratulations, you've reached ${SKILL[id].name} level ${lvl}.`, 'good');
  }

  // ------------------------------------------------------------ messages
  message(text, kind = 'game') {
    const p = el('p', kind);
    p.textContent = text;
    this.logEl.append(p);
    while (this.logEl.children.length > 6) this.logEl.firstChild.remove();
    setTimeout(() => p.classList.add('old'), 9000);
    setTimeout(() => p.remove(), 10500);
  }

  // ------------------------------------------------------------ tooltip + menu
  #tipItem(id, e, verb) {
    if (!id) return this.hideTip();
    const it = ITEMS[id];
    const miss = this.state.unmet(id);
    const heal = it.heal ? `<div class="d">Heals ${it.heal}</div>` : '';
    const req = miss ? `<div class="bad">Needs ${SKILL[miss.skill].name} ${miss.lvl}</div>` : '';
    this.tip.innerHTML = `<div class="t">${verb ? `${verb} ` : ''}${it.name}</div><div class="d">${it.examine || ''}</div>${heal}${req}`;
    this.tip.hidden = false;
    this.#placeTip(e);
  }

  #tipSkill(id, e) {
    const sk = this.state.skills;
    const lvl = sk.level(id), xp = sk.xp[id];
    const next = lvl >= MAX_LEVEL ? null : xpForLevel(lvl + 1);
    this.tip.innerHTML = `<div class="t">${SKILL[id].name} ${lvl}</div><div class="d">${fmt(Math.floor(xp))} xp${next ? `<br>${fmt(next - Math.floor(xp))} to level ${lvl + 1}` : ''}</div><div class="d">${SKILL[id].blurb}</div>`;
    this.tip.hidden = false;
    this.#placeTip(e);
  }

  #placeTip(e) {
    if (this.tip.hidden) return;
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX - r.width - 14, y = e.clientY + 14;
    if (x < 8) x = e.clientX + 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 10;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
  }

  hideTip() {
    this.tip.hidden = true;
  }

  #menu(x, y, options) {
    this.menu.innerHTML = '';
    for (const o of options) {
      const b = el('button', '', o.label);
      b.addEventListener('click', () => {
        this.menu.hidden = true;
        o.run();
      });
      this.menu.append(b);
    }
    this.menu.hidden = false;
    const r = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.min(x - 10, innerWidth - r.width - 8)}px`;
    this.menu.style.top = `${Math.min(y - 8, innerHeight - r.height - 8)}px`;
  }
}
