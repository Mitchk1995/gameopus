import * as THREE from 'three';
import { SKILL_ICONS } from './icons.js';
import { xpForLevel } from '../game/player.js';
import { RARITY } from '../content/bases.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString());

export class HUD {
  constructor(game) {
    this.game = game;
    const root = (this.root = el('div', 'hud'));
    document.getElementById('app').appendChild(root);

    this.labels = el('div', 'labels');
    this.numbers = el('div', 'numbers');
    root.append(this.labels, this.numbers);

    const top = el('div', 'top');
    this.zone = el('div', 'zone', '<div class="name"></div><div class="sub"></div>');
    this.purse = el('div', 'purse', `<span class="coin"></span><span class="shard"></span>
      <button data-a="inv">Inventory<kbd>I</kbd></button><button data-a="codex">Codex<kbd>C</kbd></button><button data-a="mute">Sound<kbd>M</kbd></button>`);
    this.purse.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'inv') game.inventory.toggle();
      if (a === 'codex') game.inventory.toggleCodex();
      if (a === 'mute') game.toggleMute();
    });
    top.append(this.zone, this.purse);
    root.append(top);

    this.boss = el('div', 'bossbar', '<div class="n"></div><div class="a"></div><div class="track"><div class="fill"></div></div>');
    this.boss.hidden = true;
    root.append(this.boss);

    this.ann = el('div', 'announce', '<div class="k"></div><div class="t"></div>');
    root.append(this.ann);
    this.toasts = el('div', 'toasts');
    root.append(this.toasts);

    const bottom = el('div', 'bottom');
    this.life = el('div', 'globe life', '<div class="liquid"></div><div class="gloss"></div><div class="v"></div>');
    this.mana = el('div', 'globe mana', '<div class="liquid"></div><div class="gloss"></div><div class="v"></div>');
    const center = el('div', 'center');
    this.rhythm = el('div', 'rhythm');
    this.rhythm.hidden = true;
    this.skills = el('div', 'skills');
    this.skillEls = {};
    for (const [id, key] of [['cleave', 'LMB'], ['bolt', 'RMB'], ['dash', 'SPACE'], ['nova', 'Q'], ['potion', 'R']]) {
      const s = el('div', 'skill', `${SKILL_ICONS[id]}<span class="key">${key}</span><div class="cd"></div>`);
      this.skillEls[id] = s;
      this.skills.append(s);
    }
    this.lvl = el('div', 'lvl');
    this.xp = el('div', 'xp', '<div class="fill"></div>');
    center.append(this.rhythm, this.skills, this.xp, this.lvl);
    bottom.append(this.life, center, this.mana);
    root.append(bottom);

    this.fps = el('div', 'fps');
    this.fps.hidden = true;
    root.append(this.fps);

    this.numPool = [];
    for (let i = 0; i < 90; i++) {
      const d = el('div', 'dmg');
      d.style.opacity = 0;
      this.numbers.append(d);
      this.numPool.push({ el: d, t: 1, life: 1, x: 0, y: 0, z: 0, active: false });
    }
    this.numI = 0;
    this._v = new THREE.Vector3();
    this.annT = 0;
    this.frames = 0;
    this.fpsT = 0;
  }

  project(x, y, z) {
    const v = this._v.set(x, y, z).project(this.game.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z < 1];
  }

  damageNumber(x, y, z, amt, crit, kind) {
    const n = this.numPool[this.numI];
    this.numI = (this.numI + 1) % this.numPool.length;
    n.active = true;
    n.x = x + (Math.random() - 0.5) * 0.6;
    n.y = y;
    n.z = z + (Math.random() - 0.5) * 0.3;
    n.t = 0;
    n.life = crit ? 0.9 : 0.65;
    n.el.className = `dmg ${kind || ''}${crit ? ' crit' : ''}`;
    n.el.textContent = crit ? `${fmt(amt)}!` : fmt(amt);
  }

  createLootLabel(item, onClick) {
    const l = el('div', `loot-label ${item.rarity}`);
    l.textContent = item.name;
    l.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onClick();
    });
    this.labels.append(l);
    return l;
  }

  placeLabel(l, x, y, z) {
    const p = this.game.player;
    const far = (x - p.x) ** 2 + (z - p.z) ** 2 > 26 * 26;
    const [sx, sy, ok] = this.project(x, y, z);
    if (!ok || far || sx < -100 || sx > innerWidth + 100 || sy < -40 || sy > innerHeight + 40) {
      if (!l.hidden) l.hidden = true;
      return;
    }
    if (l.hidden) l.hidden = false;
    l.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
  }

  announce(title, kicker, kind) {
    this.ann.className = `announce show ${kind}`;
    this.ann.querySelector('.k').textContent = kicker || '';
    this.ann.querySelector('.t').textContent = title;
    if (kind === 'unique' || kind === 'ascendant') {
      // The item name is the headline for loot.
      this.ann.querySelector('.k').textContent = kind === 'ascendant' ? 'Ascendant' : 'Unique';
      this.ann.querySelector('.t').textContent = kicker;
    }
    this.annT = kind === 'ascendant' ? 5 : 3.2;
  }

  toast(text, kind = '') {
    const t = el('div', `toast ${kind}`);
    t.innerHTML = text;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 6) this.toasts.lastChild.remove();
    setTimeout(() => t.remove(), 4500);
  }

  lootToast(item, isNew) {
    const r = RARITY[item.rarity];
    this.toast(`<span style="color:${r.css}">${item.name}</span>${isNew ? ' — <b>new discovery</b>' : ''}`, isNew ? 'discover' : '');
  }

  setRhythm(count, n) {
    if (!n) {
      this.rhythm.hidden = true;
      return;
    }
    this.rhythm.hidden = false;
    if (this.rhythm.children.length !== n || n === 1) {
      this.rhythm.innerHTML = '';
      if (n === 1) return;
      for (let i = 0; i < n; i++) this.rhythm.append(el('i', i === n - 1 ? 'last' : ''));
    }
    [...this.rhythm.children].forEach((c, i) => c.classList.toggle('on', i < count));
  }

  update(dt) {
    const g = this.game, p = g.player, s = p.stats;

    for (const n of this.numPool) {
      if (!n.active) continue;
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) {
        n.active = false;
        n.el.style.opacity = 0;
        continue;
      }
      const [sx, sy, ok] = this.project(n.x, n.y + k * 1.2, n.z);
      const sc = n.el.classList.contains('crit') ? 1 + Math.max(0, 0.6 - k * 4) : 1;
      n.el.style.opacity = ok ? (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) : 0;
      n.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${sc})`;
    }

    this.life.querySelector('.liquid').style.transform = `scaleY(${Math.max(0, p.life / s.life)})`;
    this.life.querySelector('.v').textContent = `${Math.max(0, Math.ceil(p.life))}`;
    this.mana.querySelector('.liquid').style.transform = `scaleY(${Math.max(0, p.mana / s.mana)})`;
    this.mana.querySelector('.v').textContent = `${Math.floor(p.mana)}`;
    this.xp.firstChild.style.transform = `scaleX(${p.xp / xpForLevel(p.level)})`;
    this.lvl.textContent = `Level ${p.level}`;

    const cd = (id, v, max) => this.skillEls[id].querySelector('.cd').style.setProperty('--p', `${Math.max(0, v / max) * 100}%`);
    cd('dash', p.dashCd, 1.3 * s.cdrMult);
    cd('nova', p.novaCd, 6 * s.cdrMult);
    cd('potion', p.potionCd, 12);
    this.skillEls.nova.classList.toggle('nomana', p.mana < 16);
    this.skillEls.bolt.classList.toggle('nomana', p.mana < 5);

    const b = g.world.biome;
    const mins = Math.floor(g.runTime / 60), secs = Math.floor(g.runTime % 60).toString().padStart(2, '0');
    this.zone.querySelector('.name').textContent = b.name;
    this.zone.querySelector('.sub').textContent = `Depth ${g.depth} · ${mins}:${secs} · ${g.kills} slain`;
    this.purse.querySelector('.coin').textContent = `${fmt(g.save.gold)} gold`;
    this.purse.querySelector('.shard').textContent = `${fmt(g.save.shards)} shards`;

    const boss = g.enemies.boss;
    this.boss.hidden = !boss;
    if (boss) {
      this.boss.querySelector('.n').textContent = boss.name;
      this.boss.querySelector('.a').textContent = boss.affix || '';
      this.boss.querySelector('.fill').style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
    }

    if (this.annT > 0) {
      this.annT -= dt;
      if (this.annT <= 0) this.ann.classList.remove('show');
    }

    this.frames++;
    this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps · ${g.enemies.list.length} foes · ${g.particles.n} particles`;
      this.frames = 0;
      this.fpsT = 0;
    }
  }
}
