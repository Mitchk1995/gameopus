import * as THREE from 'three';

// Combat readouts drawn over the 3D view: damage splats, health bars over enemies,
// the lock-on marker, the target frame, and a red edge when you're hurt.

const css = `
.splat {
  position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none;
  min-width: 26px; height: 26px; padding: 0 6px; box-sizing: border-box;
  display: grid; place-items: center;
  font: 800 15px/1 var(--sans); color: #fff; text-shadow: 0 1px 2px #000;
  border-radius: 13px 13px 13px 3px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(0,0,0,0.35);
  font-variant-numeric: tabular-nums;
  will-change: transform, opacity;
}
.splat.dmg { background: radial-gradient(circle at 40% 35%, #e24a3c, #9b1a14); }
.splat.zero { background: radial-gradient(circle at 40% 35%, #4d7fe0, #22448f); }
.splat.crit { background: radial-gradient(circle at 40% 35%, #ffd35a, #c07a10); color: #2a1600; text-shadow: none; font-size: 17px; height: 30px; }
.splat.heal { background: radial-gradient(circle at 40% 35%, #58c46a, #1f7a33); }
.splat.me { border-radius: 13px 13px 3px 13px; }
.splat.word { background: rgba(15,12,8,0.85); font: 700 13px/1 var(--serif); letter-spacing: .06em; color: #ffe39a; border-radius: 6px; }
.ebar { position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; width: 46px; height: 6px; margin-left: -23px;
  background: #9c1d1d; box-shadow: 0 0 0 1px rgba(0,0,0,0.7); }
.ebar i { display: block; height: 100%; background: #38c24c; }
.lock { position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; width: 18px; height: 18px; margin: -9px 0 0 -9px;
  border: 2px solid #ffe39a; transform: rotate(45deg); box-shadow: 0 0 8px rgba(255,210,120,0.8); }
.lock[hidden], .ebar[hidden], .tframe[hidden] { display: none; }
.tframe { position: fixed; left: 50%; top: calc(16px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 3;
  width: 260px; padding: 7px 12px 9px; box-sizing: border-box; pointer-events: none;
  background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 8px; box-shadow: var(--shadow); }
.tframe .nm { display: flex; justify-content: space-between; font: 700 14px/1 var(--serif); letter-spacing: .04em; color: #f4e4bf; }
.tframe .nm small { font: 500 13px/1 var(--sans); color: var(--ink-dim); letter-spacing: 0; }
.tframe .hp { margin-top: 6px; height: 7px; border-radius: 4px; background: #5a1414; overflow: hidden; }
.tframe .hp i { display: block; height: 100%; background: linear-gradient(#e0473c, #a11d18); transition: width .2s; }
.hurtfx { position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: 0;
  box-shadow: inset 0 0 120px 40px rgba(170, 20, 10, 0.55); transition: opacity .5s; }
.hurtfx.on { opacity: 1; transition: none; }
.vital.sta i { background: linear-gradient(#d9c25a, #9b7d1f); }
.dead { position: fixed; inset: 0; z-index: 6; display: grid; place-items: center; pointer-events: none;
  background: rgba(10, 0, 0, 0); transition: background 1.2s; }
.dead.on { background: rgba(10, 0, 0, 0.72); }
.dead div { font: 700 40px/1 var(--serif); color: #e8c9a0; letter-spacing: .06em; opacity: 0; transition: opacity 1s .4s; }
.dead.on div { opacity: 1; }
`;

export class CombatUI {
  constructor(camera) {
    this.camera = camera;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    this.splats = [];
    this.bars = new Map();
    this.lockEl = Object.assign(document.createElement('div'), { className: 'lock', hidden: true });
    this.frame = Object.assign(document.createElement('div'), { className: 'tframe', hidden: true });
    this.frame.innerHTML = '<div class="nm"><span></span><small></small></div><div class="hp"><i></i></div>';
    this.hurtEl = Object.assign(document.createElement('div'), { className: 'hurtfx' });
    this.deadEl = Object.assign(document.createElement('div'), { className: 'dead' });
    this.deadEl.innerHTML = '<div>Oh dear, you are dead!</div>';
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
    const el = document.createElement('div');
    el.className = `splat ${kind}`;
    el.textContent = text;
    document.body.append(el);
    this.splats.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 24 });
  }

  hurt() {
    this.hurtEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.hurtEl.classList.remove('on')));
  }

  setDead(on) {
    this.deadEl.classList.toggle('on', on);
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

    // Health bars over enemies that are fighting or hurt.
    for (const e of enemies) {
      let bar = this.bars.get(e);
      const show = e.alive && (e.engaged || e.hp < e.def.hp) && e.pos.distanceTo(focus) < 26;
      const p = show ? this.project(e.pos.x, e.pos.y + e.height + 0.35, e.pos.z) : null;
      if (!p) {
        if (bar) bar.hidden = true;
        continue;
      }
      if (!bar) {
        bar = Object.assign(document.createElement('div'), { className: 'ebar' });
        bar.innerHTML = '<i></i>';
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
    const shown = t || this.recent;
    this.frame.hidden = !shown || !shown.alive;
    if (shown && shown.alive) {
      this.frame.querySelector('.nm span').textContent = shown.def.name;
      this.frame.querySelector('.nm small').textContent = `Level ${shown.def.level}`;
      this.frame.querySelector('.hp i').style.width = `${(shown.hp / shown.def.hp) * 100}%`;
    }
  }
}
