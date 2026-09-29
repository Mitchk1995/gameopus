import './menus.css';
import { ITEMS } from '../game/items.js';
import { SKILL } from '../game/skills.js';
import { icon, SKILL_COLOR } from './icons.js';
import { el, fmt, qtyLabel } from './dom.js';

// A centred window with a title, a close button, a scrolling body and a footer.
class Win {
  constructor(onClose) {
    this.root = el('div', 'win');
    this.root.hidden = true;
    this.root.innerHTML = `<header><h2></h2><span class="sub"></span><button class="x" title="Close (Esc)">${icon('close', 18)}</button></header><div class="body"></div><div class="foot"></div>`;
    this.root.querySelector('.x').addEventListener('click', () => onClose());
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.append(this.root);
    this.body = this.root.querySelector('.body');
    this.foot = this.root.querySelector('.foot');
  }
  title(t, sub = '') {
    this.root.querySelector('h2').textContent = t;
    this.root.querySelector('.sub').textContent = sub;
  }
  get open() {
    return !this.root.hidden;
  }
}

// Windows the game opens: bank, make (choose a recipe and how many), shop, skill guide.
// Only one is open at a time. Every window reports closing through onClose.
export class Menus {
  constructor({ state, studio, onClose }) {
    this.state = state;
    this.studio = studio;
    this.onClose = onClose;
    this.win = new Win(() => this.close());
    this.kind = null;
    this.qty = 1;
    addEventListener('keydown', (e) => {
      if (!this.kind || e.target.tagName === 'INPUT') return;
      if (this.kind === 'make' && /^Digit[1-9]$/.test(e.code)) {
        const i = +e.code.slice(5) - 1;
        const b = this.win.body.querySelectorAll('.recipe')[i];
        b?.click();
        e.preventDefault();
      }
      if (this.kind === 'make' && e.code === 'Space') {
        this.win.body.querySelector('.recipe:not(.locked):not(.short)')?.click();
        e.preventDefault();
      }
    });
  }

  get isOpen() {
    return !!this.kind;
  }

  close() {
    if (!this.kind) return;
    const kind = this.kind;
    this.kind = null;
    this.win.root.hidden = true;
    this.onClose?.(kind);
  }

  #qtyButtons(options, onPick) {
    const q = el('div', 'qtys');
    for (const [label, v] of options) {
      const b = el('button', 'btn', label);
      b.setAttribute('aria-pressed', String(this.qty === v));
      b.addEventListener('click', () => {
        this.qty = v;
        q.querySelectorAll('.btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        onPick?.(v);
      });
      q.append(b);
    }
    return q;
  }

  // ------------------------------------------------------------ bank
  // The inventory panel stays open beside it; clicking there deposits.
  openBank({ onWithdraw, onDepositAll, name = 'Bank of Ashford' }) {
    this.kind = 'bank';
    this.bank = { onWithdraw, filter: '' };
    this.win.title(name, `${this.state.bank.slots.filter(Boolean).length} items`);
    this.win.foot.innerHTML = '';
    const search = el('input', 'search');
    search.id = 'bank-search';
    search.placeholder = 'Search';
    search.addEventListener('input', () => {
      this.bank.filter = search.value.toLowerCase();
      this.renderBank();
    });
    const dep = el('button', 'btn', 'Deposit inventory');
    dep.addEventListener('click', () => onDepositAll());
    this.qty = this.bankQty ?? 1;
    this.win.foot.append(this.#qtyButtons([['1', 1], ['5', 5], ['10', 10], ['All', Infinity]], (v) => (this.bankQty = v)), el('span', 'spacer'), search, dep);
    this.win.root.hidden = false;
    this.renderBank();
    if (!this.bankListener) {
      this.bankListener = () => this.kind === 'bank' && this.renderBank();
      this.state.bank.listeners.add(this.bankListener);
    }
  }

  renderBank() {
    const b = this.state.bank;
    b.compact();
    this.win.title(this.win.root.querySelector('h2').textContent, `${b.slots.filter(Boolean).length} / ${b.size}`);
    const grid = el('div', 'bankgrid');
    const f = this.bank.filter;
    b.slots.forEach((s, i) => {
      if (!s || (f && !ITEMS[s.id].name.toLowerCase().includes(f))) return;
      const cell = el('div', 'slot full');
      const [q, cls] = qtyLabel(s.n);
      cell.innerHTML = `<img alt="${ITEMS[s.id].name}" src="${this.studio.icon(s.id)}"><span class="qty ${cls}">${q}</span>`;
      cell.title = `${ITEMS[s.id].name} (${fmt(s.n)})`;
      cell.addEventListener('click', () => this.bank.onWithdraw(i, this.qty));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.bank.onWithdraw(i, Infinity);
      });
      grid.append(cell);
    });
    this.win.body.innerHTML = '';
    this.win.body.append(grid.children.length ? grid : el('div', 'empty', f ? 'Nothing matches.' : 'Your bank is empty. Click items in your pack to deposit them.'));
  }

  // ------------------------------------------------------------ make
  // recipes: [{ out, n, level, skill, needs: [[id, n]], locked, short }]
  openMake({ title, sub, recipes, onMake }) {
    this.kind = 'make';
    this.win.title(title, sub);
    this.win.body.innerHTML = '';
    const list = el('div', 'recipes');
    recipes.forEach((r, i) => {
      const b = el('button', `recipe${r.locked ? ' locked' : ''}${r.short ? ' short' : ''}`);
      const needs = r.needs.map(([id, n]) => {
        const have = this.state.inv.count(id);
        return `<span class="${have < n ? 'miss' : ''}">${n > 1 ? `${n} ` : ''}${ITEMS[id].name.toLowerCase()}</span>`;
      }).join(', ');
      b.innerHTML = `<img alt="" src="${this.studio.icon(r.out)}"><span class="nm">${r.n > 1 ? `${r.n} ` : ''}${ITEMS[r.out].name}</span><span class="req">${r.locked ? `<span class="miss">${SKILL[r.skill].name} ${r.level}</span>` : `Lv ${r.level} · ${needs}`}</span>`;
      b.title = r.locked ? `Needs ${SKILL[r.skill].name} level ${r.level}` : `${i < 9 ? `Press ${i + 1}` : ''}`;
      b.addEventListener('click', () => {
        if (r.locked) return;
        this.close();
        onMake(r, this.qty);
      });
      list.append(b);
    });
    this.win.body.append(list);
    this.win.foot.innerHTML = '';
    this.qty = this.makeQty ?? Infinity;
    this.win.foot.append(el('span', 'sub', 'How many?'), this.#qtyButtons([['1', 1], ['5', 5], ['10', 10], ['All', Infinity]], (v) => (this.makeQty = v)), el('span', 'spacer'), el('span', 'sub', 'Space makes the first'));
    this.win.foot.querySelector('.sub').style.color = 'var(--ink-dim)';
    this.win.foot.lastChild.style.color = 'var(--ink-dim)';
    this.win.root.hidden = false;
  }

  // ------------------------------------------------------------ shop
  openShop({ name, owner, stock, onBuy }) {
    this.kind = 'shop';
    this.shop = { stock, onBuy };
    this.win.title(name, `${owner} · click to buy, click your pack to sell`);
    this.win.foot.innerHTML = '';
    this.qty = this.shopQty ?? 1;
    this.win.foot.append(el('span', 'sub', 'Buy'), this.#qtyButtons([['1', 1], ['5', 5], ['10', 10]], (v) => (this.shopQty = v)), el('span', 'spacer'));
    this.coinsEl = el('span', 'sub');
    this.win.foot.append(this.coinsEl);
    this.win.root.hidden = false;
    this.renderShop();
  }

  renderShop() {
    if (this.kind !== 'shop') return;
    const grid = el('div', 'bankgrid');
    for (const s of this.shop.stock) {
      const it = ITEMS[s.id];
      const cell = el('div', 'slot full');
      const [q, cls] = qtyLabel(s.n);
      cell.innerHTML = `<img alt="${it.name}" src="${this.studio.icon(s.id)}"><span class="qty ${cls}">${q}</span>`;
      cell.title = `${it.name}: ${fmt(s.price)} coins`;
      cell.addEventListener('click', () => this.shop.onBuy(s, this.qty));
      grid.append(cell);
    }
    this.win.body.innerHTML = '';
    this.win.body.append(grid);
    this.coinsEl.textContent = `You have ${fmt(this.state.inv.count('coins'))} coins`;
  }

  // ------------------------------------------------------------ skill guide
  openGuide(skill, entries) {
    this.kind = 'guide';
    const lvl = this.state.skills.level(skill);
    this.win.title(`${SKILL[skill].name} guide`, `Level ${lvl}`);
    const g = el('div', 'guide');
    let nextMarked = false;
    for (const u of entries) {
      const done = u.level <= lvl;
      const row = el('div', done ? 'done' : !nextMarked ? 'nextup' : 'todo');
      if (!done) nextMarked = true;
      row.innerHTML = `<span class="lvl">${u.level}</span><img alt="" src="${this.studio.icon(u.icon)}"><span class="what">${u.label}</span>`;
      g.append(row);
    }
    this.win.body.innerHTML = `<p style="margin:0 0 12px;color:var(--ink-dim)">${SKILL[skill].blurb}</p>`;
    this.win.body.append(g);
    this.win.foot.innerHTML = '';
    const hdr = this.win.root.querySelector('h2');
    hdr.innerHTML = `${icon(skill, 18)} ${SKILL[skill].name} guide`;
    hdr.querySelector('svg').style.color = SKILL_COLOR[skill];
    hdr.querySelector('svg').style.verticalAlign = '-2px';
    this.win.root.hidden = false;
  }
}

// The dialogue box: who's talking, what they said, numbered replies and a line to type.
export class Talk {
  constructor() {
    this.root = el('div', 'talk');
    this.root.hidden = true;
    this.root.innerHTML = `<div class="who"></div><div class="you" hidden></div><div class="said"></div><div class="opts"></div>
      <form><input id="talk-say" autocomplete="off" maxlength="240" placeholder="Or say something of your own (Enter)"><button class="btn" type="submit">Say</button></form>`;
    document.body.append(this.root);
    this.whoEl = this.root.querySelector('.who');
    this.youEl = this.root.querySelector('.you');
    this.saidEl = this.root.querySelector('.said');
    this.form = this.root.querySelector('form');
    this.input = this.root.querySelector('input');
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text || !this.onSay || this.busy) return;
      this.input.value = '';
      this.onSay(text);
    });
    addEventListener('keydown', (e) => {
      if (this.root.hidden || e.target === this.input) return;
      if (/^Digit[1-9]$/.test(e.code)) {
        const b = this.root.querySelectorAll('.opt')[+e.code.slice(5) - 1];
        if (b) {
          b.click();
          e.preventDefault();
        }
      } else if (e.code === 'Space' || e.code === 'Enter') {
        const opts = this.root.querySelectorAll('.opt');
        if (opts.length === 1) {
          opts[0].click();
          e.preventDefault();
        } else if (e.code === 'Enter' && this.onSay) {
          this.input.focus();
          e.preventDefault();
        }
      }
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  // options: [{ label, run }]. kind: 'say' (the speaker talks), 'narrate' (what
  // happens), 'me' (your own line). onSay(text) shows the typing line.
  show(who, text, options, { onSay = null, kind = 'say', thinking = false } = {}) {
    this.root.hidden = false;
    this.whoEl.textContent = kind === 'me' ? 'You' : who;
    this.youEl.hidden = true;
    this.said(text, { thinking, kind });
    const opts = this.root.querySelector('.opts');
    opts.innerHTML = '';
    options.forEach((o, i) => {
      const b = el('button', 'opt', `<span class="k">${i + 1}.</span>`);
      b.append(document.createTextNode(o.label));
      b.addEventListener('click', () => o.run());
      opts.append(b);
    });
    this.onSay = onSay;
    this.form.hidden = !onSay;
  }

  // Updates just the spoken text (typed chat streams into it).
  said(text, { thinking = false, kind = 'say' } = {}) {
    this.saidEl.textContent = text;
    this.saidEl.classList.toggle('thinking', thinking);
    this.saidEl.classList.toggle('narrate', kind === 'narrate');
  }

  // Your own typed line, shown above the reply.
  you(text) {
    this.youEl.hidden = !text;
    this.youEl.textContent = text ? `You: ${text}` : '';
  }

  setBusy(busy) {
    this.busy = busy;
    this.input.disabled = busy;
    this.root.querySelector('form .btn').disabled = busy;
    if (!busy && !this.root.hidden) this.input.focus();
  }

  hideTyping() {
    this.onSay = null;
    this.form.hidden = true;
  }

  hide() {
    this.root.hidden = true;
    this.onSay = null;
    this.setBusy(false);
    this.input.blur();
  }
}

