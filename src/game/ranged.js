import * as THREE from 'three';
import { ITEMS } from './items.js';
import { SPELLS } from './combat.js';
import { arrowMesh } from '../actors/aim.js';

// Bows and staves. Hold the left button to draw (or gather a spell) and let go to
// shoot; the right button steadies your aim. Arrows fly where the crosshair points,
// dropping a little over distance (a half-drawn shot drops more); spells fly straight
// and curve after a locked-on target. What they hit is decided by the same kind of
// roll as melee, and the fight takes it from there.

const G = 9.8;
const ARROW_SPEED = 62;
const SPELL_SPEED = 30;
const RANGE = 90;
const MAX_STUCK = 30;

export class Ranged {
  constructor(game) {
    this.game = game;
    this.shots = [];
    this.stuck = [];
    this.drawing = false;
    this.draw = 0;
    this.cool = 0;
    this.zoom = false;
    this.#particles();
  }

  // 'bow', 'staff' or null for what's in your hands.
  get style() {
    const w = ITEMS[this.game.state.equip.weapon];
    return w?.style === 'bow' || w?.style === 'staff' ? w.style : null;
  }

  get aiming() {
    return !!this.style && (this.drawing || this.zoom || this.cool > 0.05);
  }

  // The best strike spell you have the level and runes for.
  spell() {
    const lvl = this.game.state.skills.level('magic');
    for (let i = SPELLS.length - 1; i >= 0; i--) if (SPELLS[i].level <= lvl && this.#hasRunes(SPELLS[i])) return SPELLS[i];
    return null;
  }

  #staffRune() {
    return ITEMS[this.game.state.equip.weapon]?.staffRune;
  }

  #hasRunes(s) {
    const inv = this.game.state.inv, free = this.#staffRune();
    return s.runes.every(([id, n]) => id === free || inv.count(id) >= n);
  }

  // Casts left of the current spell with the runes you carry (Infinity if the staff pays).
  casts(s = this.spell()) {
    if (!s) return 0;
    const inv = this.game.state.inv, free = this.#staffRune();
    return Math.min(...s.runes.map(([id, n]) => (id === free ? Infinity : Math.floor(inv.count(id) / n))));
  }

  // ------------------------------------------------------------ input
  input(dt) {
    const g = this.game, P = g.player, input = g.input;
    const held = input.buttons.has(0);
    this.zoom = input.buttons.has(2);
    this.cool = Math.max(0, this.cool - dt);
    const free = P.state === 'move';
    if (input.clicked.has(0) && !this.drawing && free && this.cool <= 0) {
      if (this.#ready()) {
        this.drawing = true;
        this.draw = 0;
        g.audio.play(this.style === 'bow' ? 'draw' : 'charge', P.pos, 0.7);
      }
    }
    if (this.drawing) {
      if (!free) return this.#cancel();
      this.draw = Math.min(1, this.draw + dt / this.#drawTime());
      if (!held) {
        if (this.draw >= 0.3) this.#release();
        else this.#cancel();
      }
    }
    P.aimYaw = this.aiming ? g.rig.yaw + Math.PI + (this.style === 'bow' ? 0.32 : 0.15) : null;
  }

  reset() {
    this.#cancel();
    this.zoom = false;
    this.cool = 0;
    this.game.player.aimYaw = null;
  }

  #cancel() {
    this.drawing = false;
    this.draw = 0;
  }

  #drawTime() {
    const w = ITEMS[this.game.state.equip.weapon];
    if (this.style === 'staff') return 0.45;
    return (w?.speed || 2) * 0.33;
  }

  #ready() {
    const g = this.game, st = g.state;
    const nag = (text) => {
      if (g.time - (this.naggedAt ?? -9) > 2.5) g.panels.message(text, 'bad');
      this.naggedAt = g.time;
      return false;
    };
    if (this.style === 'bow') {
      const ammo = st.equip.ammo && ITEMS[st.equip.ammo];
      if (!ammo || st.ammo <= 0) return nag('You have no arrows equipped.');
      if (!/_arrow$/.test(st.equip.ammo)) return nag("You can't fire that from a bow.");
      return true;
    }
    if (!this.spell()) {
      const lvl = st.skills.level('magic');
      return nag(SPELLS.some((s) => s.level <= lvl) ? 'You do not have enough runes to cast a spell.' : 'You need a higher Magic level.');
    }
    return true;
  }

  // ------------------------------------------------------------ shooting
  #release() {
    const g = this.game, st = g.state, P = g.player;
    const draw = this.draw;
    this.#cancel();
    this.cool = 0.3;
    const aim = this.#aimPoint();
    if (this.style === 'bow') {
      const ammo = st.equip.ammo;
      st.ammo -= 1;
      if (st.ammo <= 0) {
        st.equip.ammo = null;
        st.ammo = 0;
        g.panels.message('You have run out of arrows.', 'bad');
      }
      st.changed('equip');
      g.panels.renderWorn?.();
      const from = g.aim.nock.clone();
      const speed = ARROW_SPEED * (0.55 + 0.45 * draw);
      const to = aim.clone().sub(from);
      // Aim a touch high to meet the crosshair at full draw; a weak shot falls short.
      const tf = to.length() / ARROW_SPEED;
      to.y += 0.5 * G * tf * tf;
      const vel = to.normalize().multiplyScalar(speed);
      const mesh = arrowMesh(ITEMS[ammo].art.tip);
      mesh.position.copy(from);
      g.activeScene.add(mesh);
      this.shots.push({ kind: 'arrow', ammo, pos: from, vel, draw, life: 3, mesh, yaw: P.yaw });
      g.audio.play('bow', P.pos);
    } else {
      const s = this.spell();
      if (!s) return;
      const free = this.#staffRune();
      for (const [id, n] of s.runes) if (id !== free) st.inv.remove(id, n);
      const from = g.aim.castPoint(new THREE.Vector3());
      const vel = aim.clone().sub(from).normalize().multiplyScalar(SPELL_SPEED);
      const lock = g.fight.lock?.alive ? g.fight.lock : null;
      this.shots.push({ kind: 'spell', spell: s, pos: from, vel, life: 2.5, homing: lock, yaw: P.yaw, color: new THREE.Color(s.glow), core: new THREE.Color(s.color) });
      this.#burst(from, s.glow, 8, 1.5);
      g.audio.play('cast', P.pos);
      g.player.flick?.();
    }
  }

  // Where the crosshair meets something: an enemy, a wall, the ground, or far away.
  aimPoint() {
    return this.#aimPoint();
  }

  #aimPoint() {
    const g = this.game, f = g.fight;
    if (f.lock?.alive) return f.lock.pos.clone().setY(f.lock.pos.y + f.lock.height * 0.6);
    const cam = g.camera.position.clone(), fwd = g.rig.forward(new THREE.Vector3());
    const far = cam.clone().addScaledVector(fwd, RANGE);
    const t = g.activeWorld.lineOfSight(cam, far, 0.01);
    const end = cam.clone().lerp(far, t);
    const hit = this.#enemyOnSegment(cam, end, 0.15);
    return hit ? cam.lerp(end, hit.t) : end;
  }

  #enemyOnSegment(a, b, pad = 0.1) {
    const g = this.game;
    let best = null;
    for (const e of g.fight.enemies) {
      if (!e.alive || e.realm !== g.realm) continue;
      const t = segCylinder(a, b, e.pos, e.radius + pad, e.height);
      if (t !== null && (!best || t < best.t)) best = { e, t };
    }
    return best;
  }

  // ------------------------------------------------------------ flight
  update(dt) {
    const g = this.game, w = g.activeWorld;
    for (const s of this.shots) {
      s.life -= dt;
      const prev = s.pos.clone();
      if (s.kind === 'arrow') s.vel.y -= G * dt;
      else if (s.homing?.alive) {
        // Spells curve after a locked target.
        const want = s.homing.pos.clone().setY(s.homing.pos.y + s.homing.height * 0.6).sub(s.pos).normalize();
        const cur = s.vel.clone().normalize();
        cur.lerp(want, Math.min(1, dt * 7)).normalize();
        s.vel.copy(cur.multiplyScalar(SPELL_SPEED));
      }
      s.pos.addScaledVector(s.vel, dt);
      const hit = this.#enemyOnSegment(prev, s.pos);
      const t = w.lineOfSight(prev, s.pos, 0.01);
      const floor = w.groundAt(s.pos.x, s.pos.z, s.pos.y + 0.5);
      if (hit && hit.t <= t) {
        s.pos.lerpVectors(prev, s.pos, hit.t);
        this.#land(s, hit.e);
      } else if (t < 1 || s.pos.y < floor) {
        if (t < 1) s.pos.lerpVectors(prev, s.pos, t);
        else s.pos.y = floor;
        this.#land(s, null);
      } else if (s.life <= 0) this.#land(s, null, true);
      if (s.mesh && !s.done) {
        s.mesh.position.copy(s.pos);
        s.mesh.quaternion.setFromUnitVectors(UP, s.vel.clone().normalize());
      }
      if (s.kind === 'spell' && !s.done) this.#trail(s, dt);
    }
    this.shots = this.shots.filter((s) => !s.done);
    for (const a of this.stuck) {
      a.t -= dt;
      if (a.t <= 0) {
        a.mesh.parent?.remove(a.mesh);
        a.done = true;
      }
    }
    this.stuck = this.stuck.filter((a) => !a.done);
    this.#updateParticles(dt);
  }

  #land(s, enemy, fizzle = false) {
    const g = this.game;
    s.done = true;
    if (s.kind === 'arrow') {
      if (enemy) {
        g.fight.projectileHit(enemy, s);
        // It sticks in them for a moment; some arrows can be picked up afterwards.
        s.mesh.position.copy(s.pos).addScaledVector(s.vel.clone().normalize(), 0.18);
        enemy.char.root.attach(s.mesh);
        this.#stick(s.mesh, 3);
        if (Math.random() < 0.5) g.fight.dropArrow(s.ammo, enemy.pos.x, enemy.pos.z);
      } else if (!fizzle) {
        s.mesh.position.copy(s.pos).addScaledVector(s.vel.clone().normalize(), 0.22);
        this.#stick(s.mesh, 10);
        g.audio.play('thunk', s.pos, 0.6);
      } else s.mesh.parent?.remove(s.mesh);
    } else {
      if (enemy) g.fight.projectileHit(enemy, s);
      this.#burst(s.pos, s.spell.glow, fizzle ? 6 : 22, fizzle ? 1.5 : 4);
      if (!enemy) g.audio.play('zap', s.pos, 0.6);
    }
  }

  #stick(mesh, t) {
    this.stuck.push({ mesh, t });
    while (this.stuck.length > MAX_STUCK) {
      const old = this.stuck.shift();
      old.mesh.parent?.remove(old.mesh);
    }
  }

  // Leaving the realm: arrows in flight and in the ground go with it.
  clear() {
    for (const s of this.shots) s.mesh?.parent?.remove(s.mesh);
    for (const a of this.stuck) a.mesh.parent?.remove(a.mesh);
    this.shots = [];
    this.stuck = [];
    this.parts.fill(null);
    this.reset();
  }

  // ------------------------------------------------------------ sparkle
  // One point cloud for all spell light: trails, bursts and the glow in your hand.
  #particles() {
    const N = 320;
    this.parts = new Array(N).fill(null);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.34, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.next = 0;
  }

  attach(scene) {
    scene.add(this.points);
  }

  #spark(pos, color, life, vel = null, size = 1) {
    this.parts[this.next] = { p: pos.clone(), v: vel || new THREE.Vector3(), c: color.clone ? color.clone() : new THREE.Color(color), life, max: life, size };
    this.next = (this.next + 1) % this.parts.length;
  }

  #trail(s, dt) {
    s.acc = (s.acc || 0) + dt;
    this.#spark(s.pos, s.core, 0.12, null, 1.4);
    while (s.acc > 1 / 90) {
      s.acc -= 1 / 90;
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
      this.#spark(s.pos.clone().add(jitter), s.color, 0.32, jitter.multiplyScalar(4));
    }
  }

  #burst(pos, color, n, speed) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.#spark(pos, c, 0.35 + Math.random() * 0.25, d);
    }
  }

  // The gathering glow in your casting hand while you charge a spell.
  handGlow(pos, spell, k) {
    if (!spell || Math.random() > 0.6) return;
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25 * (1 - k));
    this.#spark(pos.clone().add(d), spell.glow, 0.18, d.multiplyScalar(-4));
  }

  #updateParticles(dt) {
    const pos = this.points.geometry.attributes.position, col = this.points.geometry.attributes.color;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p) {
        p.life -= dt;
        if (p.life <= 0) this.parts[i] = null;
      }
      const q = this.parts[i];
      if (!q) {
        col.setXYZ(i, 0, 0, 0);
        pos.setXYZ(i, 0, -999, 0);
        continue;
      }
      q.p.addScaledVector(q.v, dt);
      q.v.multiplyScalar(Math.exp(-3 * dt));
      const k = q.life / q.max;
      pos.setXYZ(i, q.p.x, q.p.y, q.p.z);
      col.setXYZ(i, q.c.r * k * q.size, q.c.g * k * q.size, q.c.b * k * q.size);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

// Fraction along a->b where it enters a standing cylinder (feet at c, radius r,
// height h), or null.
function segCylinder(a, b, c, r, h) {
  const dx = b.x - a.x, dz = b.z - a.z, ox = a.x - c.x, oz = a.z - c.z;
  const A = dx * dx + dz * dz, B = ox * dx + oz * dz, C = ox * ox + oz * oz - r * r;
  let t;
  if (C <= 0) t = 0;
  else {
    if (A < 1e-9) return null;
    const disc = B * B - A * C;
    if (disc < 0) return null;
    t = (-B - Math.sqrt(disc)) / A;
    if (t < 0 || t > 1) return null;
  }
  const y = a.y + (b.y - a.y) * t;
  return y >= c.y - 0.1 && y <= c.y + h ? t : null;
}

let glow = null;
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}
