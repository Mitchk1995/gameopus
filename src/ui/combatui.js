import * as THREE from 'three';
import './combatui.css';
import { el } from './dom.js';

// Combat readouts drawn over the 3D view: damage splats, health bars over enemies,
// the lock-on marker, the target frame, and a red edge when you're hurt.
export class CombatUI {
  constructor(camera) {
    this.camera = camera;
    this.splats = [];
    this.bars = new Map();
    this.lockEl = el('div', 'lock');
    this.lockEl.hidden = true;
    this.frame = el('div', 'tframe', '<div class="nm"><span></span><small></small></div><div class="hp"><i></i></div>');
    this.frame.hidden = true;
    this.hurtEl = el('div', 'hurtfx');
    this.deadEl = el('div', 'dead', '<div>Oh dear, you are dead!</div>');
    document.body.append(this.lockEl, this.frame, this.hurtEl, this.deadEl);
    this.v = new THREE.Vector3();
  }

  // Screen position of a world point, or null when behind the camera.
  project(x, y, z) {
    this.v.set(x, y, z).project(this.camera);
    if (this.v.z > 1 || this.v.z < -1) return null;
    return [(this.v.x * 0.5 + 0.5) * innerWidth, (-this.v.y * 0.5 + 0.5) * innerHeight];
  }

  splat(pos, text, kind) {
    const e = el('div', `splat ${kind}`);
    e.textContent = text;
    document.body.append(e);
    this.splats.push({ el: e, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 24 });
  }

  hurt() {
    this.hurtEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.hurtEl.classList.remove('on')));
  }

  setDead(on) {
    this.deadEl.classList.toggle('on', on);
  }

  // Drops the health bar of an enemy that is gone for good.
  forget(e) {
    this.bars.get(e)?.remove();
    this.bars.delete(e);
  }

  clearSplats() {
    for (const s of this.splats) s.el.remove();
    this.splats = [];
  }

  update(dt, enemies, lock, focus) {
    // Splats rise and fade over a second.
    for (const s of this.splats) {
      s.t += dt;
      const p = this.project(s.pos.x, s.pos.y + s.t * 0.6, s.pos.z);
      if (!p || s.t > 1.1) {
        s.el.remove();
        s.done = true;
        continue;
      }
      s.el.style.transform = `translate(${p[0] + s.dx - 13}px, ${p[1] - 13}px) scale(${s.t < 0.08 ? 1.4 - s.t * 5 : 1})`;
      s.el.style.opacity = String(s.t > 0.8 ? 1 - (s.t - 0.8) / 0.3 : 1);
    }
    this.splats = this.splats.filter((s) => !s.done);

    // Health bars over enemies that are fighting or hurt (and none for ones elsewhere).
    for (const [e, bar] of this.bars) if (!enemies.includes(e)) bar.hidden = true;
    for (const e of enemies) {
      let bar = this.bars.get(e);
      const show = e.alive && (e.engaged || e.hp < e.def.hp) && e.pos.distanceTo(focus) < 26;
      const p = show ? this.project(e.pos.x, e.pos.y + e.height + 0.35, e.pos.z) : null;
      if (!p) {
        if (bar) bar.hidden = true;
        continue;
      }
      if (!bar) {
        bar = el('div', 'ebar', '<i></i>');
        document.body.append(bar);
        this.bars.set(e, bar);
      }
      bar.hidden = false;
      bar.style.transform = `translate(${p[0]}px, ${p[1]}px)`;
      bar.firstChild.style.width = `${(e.hp / e.def.hp) * 100}%`;
    }

    // Lock-on marker and target frame.
    const t = lock && lock.alive ? lock : null;
    const p = t && this.project(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z);
    this.lockEl.hidden = !p;
    if (p) this.lockEl.style.transform = `translate(${p[0]}px, ${p[1]}px) rotate(45deg)`;
    // The last enemy you hit stays in the frame for a while, while it's near.
    if (this.recent && (!this.recent.alive || this.recent.pos.distanceTo(focus) > 24)) this.recent = null;
    const shown = this.boss || t || this.recent;
    this.frame.classList.toggle('boss', !!this.boss && shown === this.boss);
    this.frame.hidden = !shown || !shown.alive;
    const mode = this.frame.hidden ? '' : this.frame.classList.contains('boss') ? 'bossfight' : 'targeting';
    if (mode !== this.mode) {
      document.body.classList.remove('bossfight', 'targeting');
      if (mode) document.body.classList.add(mode);
      this.mode = mode;
    }
    if (shown && shown.alive) {
      this.frame.querySelector('.nm span').textContent = shown.def.name;
      this.frame.querySelector('.nm small').textContent = `Level ${shown.def.level}`;
      this.frame.querySelector('.hp i').style.width = `${(shown.hp / shown.def.hp) * 100}%`;
    }
  }
}
