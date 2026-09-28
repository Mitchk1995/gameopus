import './questui.css';
import { QUESTS } from '../content/quests.js';
import { icon } from './icons.js';

// Quest interface: the journal (the quest tab of the side panel), a small tracker
// in the corner with the step you're on, and the scroll that unrolls when a quest
// is finished.

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class QuestUI {
  constructor({ quests, studio }) {
    this.quests = quests;
    this.studio = studio;
    this.open = null;
    this.tracker = el('div', 'qtrack');
    this.scroll = el('div', 'qscroll');
    this.scroll.hidden = true;
    this.scroll.addEventListener('click', () => this.dismiss());
    document.body.append(this.tracker, this.scroll);
    addEventListener('keydown', (e) => {
      if (!this.scroll.hidden && ['Space', 'Enter', 'Escape', 'KeyE'].includes(e.code)) this.dismiss();
    });
  }

  // The tracker shows the quest you touched last, and where it stands.
  update() {
    const Q = this.quests, id = Q.tracked;
    if (!id || !Q.active(id)) {
      this.tracker.hidden = true;
    } else {
      const q = QUESTS[id], step = q.steps[Q.stage(id)];
      this.tracker.hidden = false;
      this.tracker.innerHTML = `<div class="qn">${icon('quest', 15)}<span>${q.name}</span></div><div class="qs"></div>`;
      this.tracker.querySelector('.qs').textContent = step?.short || step?.text || '';
    }
    if (this.pane && !this.pane.hidden) this.render(this.pane);
  }

  flash() {
    this.tracker.classList.remove('flash');
    void this.tracker.offsetWidth;
    this.tracker.classList.add('flash');
  }

  // ------------------------------------------------------------ journal
  render(pane) {
    this.pane = pane;
    const Q = this.quests;
    pane.innerHTML = '';
    const head = el('div', 'qhead', `<span>Quests</span><small>Quest points: ${Q.points}</small>`);
    pane.append(head);
    const list = el('div', 'qlist');
    for (const [id, q] of Object.entries(QUESTS)) {
      const st = Q.done(id) ? 'done' : Q.active(id) ? 'active' : 'todo';
      const b = el('button', `qitem ${st}`, `<span class="dot"></span><span class="nm"></span>`);
      b.querySelector('.nm').textContent = q.name;
      b.setAttribute('aria-expanded', String(this.open === id));
      b.addEventListener('click', () => {
        this.open = this.open === id ? null : id;
        if (Q.active(id)) Q.tracked = id;
        this.update();
        this.render(pane);
      });
      list.append(b);
      if (this.open === id) list.append(this.#entry(id, q));
    }
    pane.append(list);
  }

  #entry(id, q) {
    const Q = this.quests, box = el('div', 'qentry');
    const meta = el('div', 'qmeta');
    for (const [k, v] of [['Start', q.start], ['Difficulty', q.difficulty], ['Length', q.length], ['Requirements', q.requirements]]) {
      const row = el('div', 'row', '<b></b><span></span>');
      row.querySelector('b').textContent = k;
      row.querySelector('span').textContent = v;
      meta.append(row);
    }
    box.append(meta);
    const steps = Q.journal(id);
    if (!steps.length) box.append(el('p', 'hint', 'Not started yet.'));
    for (const s of steps) {
      const p = el('p', s.past ? 'past' : 'now');
      p.textContent = s.text;
      box.append(p);
    }
    if (Q.done(id)) box.append(el('p', 'fin', 'Quest complete!'));
    return box;
  }

  // ------------------------------------------------------------ the scroll
  complete(q, rewards, itemId) {
    this.queue = { q, rewards, itemId };
    if (!this.hold) this.#showScroll();
  }

  // Held back while someone is still talking, so the scroll doesn't cover them.
  setHold(h) {
    this.hold = h;
    if (!h && this.queue) this.#showScroll();
  }

  #showScroll() {
    const { q, rewards, itemId } = this.queue;
    this.queue = null;
    this.scroll.innerHTML = `<div class="paper">
      <div class="t">Quest complete!</div>
      <div class="n"></div>
      <div class="body">${itemId ? `<img alt="" src="${this.studio.icon(itemId)}">` : ''}<div><div class="aw">You are awarded:</div><ul></ul></div></div>
      <div class="k">Click or press Space to continue</div></div>`;
    this.scroll.querySelector('.n').textContent = q.name;
    const ul = this.scroll.querySelector('ul');
    for (const r of rewards) {
      const li = el('li');
      li.textContent = r;
      ul.append(li);
    }
    this.scroll.hidden = false;
    this.scroll.classList.remove('show');
    void this.scroll.offsetWidth;
    this.scroll.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.dismiss(), 12000);
  }

  dismiss() {
    this.scroll.hidden = true;
    clearTimeout(this.timer);
  }

  // "Strike!" while a fish is on the line.
  strike(on) {
    if (!this.strikeEl) {
      this.strikeEl = el('div', 'strike', 'Strike!<kbd>E</kbd>');
      document.body.append(this.strikeEl);
    }
    this.strikeEl.hidden = !on;
  }
}
