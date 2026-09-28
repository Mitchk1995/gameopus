import * as THREE from 'three';
import { STEP } from '../world/world.js';
import { WORLD } from '../world/map.js';
import rootMotion from './rootmotion.json';

// The player's body: walking, running, rolling and standing on things. Movement is
// relative to the camera; the character turns to face where it's going. Clips play in
// place and the controller moves the root, using the animator's own root motion for
// rolls so the body and the ground stay in step.

const RADIUS = 0.32, HEIGHT = 1.8, GRAVITY = 24;
export const SPEED = { walk: 1.3, jog: 5.0, sprint: 7.4, aim: 1.7 };
// Natural ground speed of each locomotion clip (from the root-motion versions).
const CLIP_SPEED = { Walk_Loop: 0.97, Jog_Fwd_Loop: 5.36, Sprint_Loop: 8.25 };
const ROLL = { clip: 'Roll', rate: 1.2, scale: 0.8, control: 0.95, iframes: [0.04, 0.55] };

export class Player {
  constructor({ world, character, input }) {
    this.world = world;
    this.char = character;
    this.input = input;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.walking = false;
    this.state = 'move';
    this.stateTime = 0;
    this.action = null;
    this.gait = 'Idle_Loop';
    this.invulnerable = false;
    this.moved = 0;
  }

  spawn(x, z, facing = 0) {
    this.pos.set(x, this.world.groundAt(x, z, 1e4), z);
    this.yaw = facing;
    this.vel.set(0, 0, 0);
    this.state = 'move';
    this.char.play('Idle_Loop', { fade: 0 });
    this.#sync();
  }

  // Wanted direction on the ground from WASD, relative to the camera's heading.
  wish(camYaw, out = new THREE.Vector3()) {
    const i = this.input;
    const f = (i.down('KeyW') ? 1 : 0) - (i.down('KeyS') ? 1 : 0);
    const r = (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    out.set(-s * f + c * r, 0, -c * f - s * r);
    const l = out.length();
    return l > 0 ? out.divideScalar(l) : out;
  }

  // Plays a one-shot or looping action (chopping, crafting, talking); movement ends it
  // unless it's locked. onEnd runs when a one-shot clip finishes or the action is cut.
  perform(clip, { loop = false, locked = false, speed = 1, fade = 0.2, onEnd = null } = {}) {
    this.state = 'act';
    this.stateTime = 0;
    this.action = { clip, loop, locked, onEnd, ended: false };
    this.vel.set(0, 0, 0);
    const a = this.char.play(clip, { loop, speed, fade, restart: true });
    this.action.duration = a.getClip().duration / speed;
    return this.action;
  }

  stopAction() {
    if (this.state !== 'act') return;
    const a = this.action;
    this.state = 'move';
    this.action = null;
    this.gait = null;
    if (a && !a.ended) {
      a.ended = true;
      a.onEnd?.(false);
    }
  }

  faceTowards(x, z) {
    this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  // ---------------------------------------------------------------- combat
  // A swing: the clip plays at the move's speed, the body lunges forward with the
  // animator's root motion until the blade connects, and onHit fires at that moment.
  startAttack(move, onHit) {
    if (this.state === 'act') this.stopAction();
    this.state = 'attack';
    this.stateTime = 0;
    this.move = move;
    this.onHit = onHit;
    this.hitDone = false;
    this.lungeDone = 0;
    this.vel.set(0, 0, 0);
    const a = this.char.play(move.clip, { loop: false, speed: move.speed, fade: 0.08, restart: true });
    this.clipLength = a.getClip().duration;
  }

  get attackPhase() {
    if (this.state !== 'attack') return null;
    const t = this.stateTime * this.move.speed;
    return { t, afterHit: this.hitDone, canChain: this.hitDone && t >= this.move.hit + (this.move.next ?? 0.1) };
  }

  startBlock(shield) {
    if (this.state === 'act') this.stopAction();
    this.state = 'block';
    this.stateTime = 0;
    this.blockClip = shield ? 'Idle_Shield_Loop' : 'Sword_Block';
    this.char.play(this.blockClip, { loop: !!shield, speed: shield ? 1 : 1.6, fade: 0.08, restart: true });
  }

  endBlock() {
    if (this.state !== 'block') return;
    this.state = 'move';
    this.gait = null;
  }

  hurt(heavy, fromYaw) {
    if (this.state === 'dead') return;
    if (this.state === 'act') this.stopAction();
    this.state = 'hurt';
    this.stateTime = 0;
    this.hurtFor = heavy ? 0.75 : 0.32;
    this.char.play(heavy ? 'Hit_Knockback' : 'Hit_Chest', { loop: false, fade: 0.05, restart: true, speed: heavy ? 1.1 : 1.2 });
    this.knock = heavy && fromYaw !== undefined ? { dir: new THREE.Vector3(Math.sin(fromYaw), 0, Math.cos(fromYaw)), left: 1.6 } : null;
  }

  die() {
    if (this.state === 'act') this.stopAction();
    this.state = 'dead';
    this.stateTime = 0;
    this.vel.set(0, 0, 0);
    this.char.play('Death01', { loop: false, fade: 0.1, restart: true });
  }

  revive() {
    this.state = 'move';
    this.gait = null;
    this.char.play('Idle_Loop', { fade: 0 });
  }

  #attackStep(dt) {
    const m = this.move, t = this.stateTime * m.speed;
    // Lunge with the clip's root motion, scaled to the move's reach, up to the hit.
    const curve = rootMotion.clips[m.clip];
    if (curve && m.lunge && t <= m.hit + 0.05) {
      const total = curve[Math.min(curve.length - 1, Math.round((m.hit + 0.05) * rootMotion.hz))] || 1;
      const f = Math.min(curve.length - 1, t * rootMotion.hz), i = Math.floor(f);
      const at = curve[i] + ((curve[Math.min(i + 1, curve.length - 1)] - curve[i]) * (f - i));
      const want = (at / Math.max(0.01, total)) * m.lunge;
      const step = Math.max(0, want - this.lungeDone);
      this.lungeDone += step;
      this.pos.x += Math.sin(this.yaw) * step;
      this.pos.z += Math.cos(this.yaw) * step;
    }
    if (!this.hitDone && t >= m.hit) {
      this.hitDone = true;
      this.onHit?.(m);
    }
    const end = m.end ?? this.clipLength * 0.92;
    if (t >= end) {
      this.state = 'move';
      this.gait = null;
    }
  }

  update(dt, camYaw) {
    this.stateTime += dt;
    const input = this.input;
    const wish = this.wish(camYaw, this._wish || (this._wish = new THREE.Vector3()));
    const moving = wish.lengthSq() > 0;
    if (input.hit('CapsLock') || input.hit('KeyZ')) this.walking = !this.walking;

    if (this.state === 'act') {
      const a = this.action;
      if (!a.loop && this.stateTime >= a.duration - 0.15 && !a.ended) {
        a.ended = true;
        a.onEnd?.(true);
        if (this.action === a) {
          this.state = 'move';
          this.gait = null;
        }
      } else if (moving && !a.locked) this.stopAction();
    }

    // Rolling is allowed from moving, blocking, and the tail end of a swing.
    const canRoll = this.state === 'move' || this.state === 'block' || (this.state === 'attack' && this.hitDone && this.stateTime * this.move.speed > this.move.hit + 0.08);
    if (canRoll && input.hit('Space') && this.grounded && (this.canRoll?.() ?? true)) this.#startRoll(moving ? wish : null);
    if (this.state === 'attack' && moving && this.hitDone && this.stateTime * this.move.speed > this.move.hit + 0.28) {
      this.state = 'move';
      this.gait = null;
    }
    if (this.state === 'hurt' && this.stateTime >= this.hurtFor) {
      this.state = 'move';
      this.gait = null;
    }

    const prev = this._prev || (this._prev = new THREE.Vector3());
    prev.copy(this.pos);
    let target = 0;
    if (this.state === 'roll') this.#rollStep(dt);
    else if (this.state === 'attack') this.#attackStep(dt);
    else if (this.state === 'block') {
      // Shuffle while guarding, facing stays put.
      const k = 1 - Math.exp(-14 * dt);
      this.vel.x += (wish.x * 1.4 - this.vel.x) * k;
      this.vel.z += (wish.z * 1.4 - this.vel.z) * k;
      if (this.blockClip === 'Sword_Block') {
        const a = this.char.current;
        if (a && a.time > 0.32) a.paused = true;
      }
    } else if (this.state === 'hurt' && this.knock) {
      const step = Math.min(this.knock.left, dt * 4);
      this.pos.addScaledVector(this.knock.dir, step);
      this.knock.left -= step;
      if (this.knock.left <= 0) this.knock = null;
    } else if (this.state === 'move') {
      target = moving ? (this.walking ? SPEED.walk : input.down('ShiftLeft') || input.down('ShiftRight') ? SPEED.sprint : SPEED.jog) : 0;
      // Shallow water slows you down.
      const depth = this.world.waterDepth(this.pos.x, this.pos.z);
      if (depth > 0.15) target *= 1 - Math.min(0.55, depth * 0.6);
      const accel = moving ? 26 : 34;
      const k = 1 - Math.exp(-accel * dt / Math.max(1, target || SPEED.jog));
      if (this.aimYaw != null) target = Math.min(target, SPEED.aim);
      this.vel.x += (wish.x * target - this.vel.x) * k;
      this.vel.z += (wish.z * target - this.vel.z) * k;
      // Aiming: face the crosshair and walk, strafing as needed.
      if (this.aimYaw != null) this.#turnTowards(this.aimYaw, dt, 16);
      else if (moving) this.#turnTowards(Math.atan2(wish.x, wish.z), dt, target > SPEED.jog ? 9 : 12);
    } else {
      this.vel.x *= Math.exp(-20 * dt);
      this.vel.z *= Math.exp(-20 * dt);
    }

    if (this.state === 'move' || this.state === 'block' || this.state === 'act') {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    this.#collide(prev);
    this.#fall(dt);
    const d = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    this.moved += d;
    if (this.state === 'move') this.#animate(d / Math.max(dt, 1e-4), target);
    this.#sync();
  }

  #startRoll(dir) {
    this.state = 'roll';
    this.stateTime = 0;
    if (dir) this.yaw = Math.atan2(dir.x, dir.z);
    this.rollDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.rollDone = 0;
    this.char.play(ROLL.clip, { loop: false, speed: ROLL.rate, fade: 0.08, restart: true });
  }

  #rollStep(dt) {
    const t = this.stateTime * ROLL.rate;
    const curve = rootMotion.clips[ROLL.clip];
    const f = Math.min(curve.length - 1, t * rootMotion.hz);
    const i = Math.floor(f);
    const dist = (curve[i] + ((curve[Math.min(i + 1, curve.length - 1)] - curve[i]) * (f - i))) * ROLL.scale;
    const step = dist - this.rollDone;
    this.rollDone = dist;
    this.pos.x += this.rollDir.x * step;
    this.pos.z += this.rollDir.z * step;
    this.vel.set(0, 0, 0);
    this.invulnerable = t >= ROLL.iframes[0] && t <= ROLL.iframes[1];
    if (t >= ROLL.control) {
      this.invulnerable = false;
      this.state = 'move';
      this.gait = null;
    }
  }

  #turnTowards(target, dt, rate) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, rate * dt);
  }

  // Solid things, steep slopes, deep water and the edge of the map.
  #collide(prev) {
    const p = this.pos, w = this.world;
    // Too steep to climb: cancel the uphill part of the step.
    const gx = (w.heightAt(p.x + 0.5, p.z) - w.heightAt(p.x - 0.5, p.z));
    const gz = (w.heightAt(p.x, p.z + 0.5) - w.heightAt(p.x, p.z - 0.5));
    const slope = Math.hypot(gx, gz);
    const onTerrain = this.pos.y - w.heightAt(p.x, p.z) < 0.3;
    if (slope > 1.05 && onTerrain) {
      const mx = p.x - prev.x, mz = p.z - prev.z;
      const up = (mx * gx + mz * gz) / slope;
      if (up > 0) {
        p.x -= (gx / slope) * up;
        p.z -= (gz / slope) * up;
      }
    }
    w.colliders.push(p, RADIUS, HEIGHT, STEP);
    // Deep water: slide along the shore instead of walking in.
    if (w.waterDepth(p.x, p.z) > 1.05 && w.groundAt(p.x, p.z, p.y) < 0) {
      if (w.waterDepth(p.x, prev.z) <= 1.05) p.z = prev.z;
      else if (w.waterDepth(prev.x, p.z) <= 1.05) p.x = prev.x;
      else { p.x = prev.x; p.z = prev.z; }
    }
    const lim = WORLD.half - 14;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
  }

  #fall(dt) {
    const g = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    // Standing: follow the ground down slopes and up steps (the camera smooths the pop).
    if (this.grounded && this.pos.y - g < 0.6) {
      this.pos.y = g;
      this.vy = 0;
      return;
    }
    this.grounded = false;
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= g) {
      this.pos.y = g;
      this.vy = 0;
      this.grounded = true;
    }
  }

  // Idle, walk, jog or sprint by speed, with each clip's rate matched to the ground speed.
  #animate(speed, target) {
    let gait;
    if (target === 0) gait = speed < 0.8 ? 'Idle_Loop' : this.gait || 'Idle_Loop';
    else if (target <= SPEED.walk + 0.01 || this.aimYaw != null) gait = 'Walk_Loop';
    else if (target > SPEED.jog + 0.1 && speed > 5.8) gait = 'Sprint_Loop';
    else gait = 'Jog_Fwd_Loop';
    if (gait === 'Roll' || !(gait in CLIP_SPEED || gait === 'Idle_Loop')) gait = 'Idle_Loop';
    const rate = gait === 'Idle_Loop' ? 1 : Math.min(1.35, Math.max(0.55, speed / CLIP_SPEED[gait]));
    if (gait !== this.gait) {
      this.char.play(gait, { fade: 0.2, speed: rate });
      this.gait = gait;
    } else if (gait !== 'Idle_Loop') this.char.current.timeScale = rate;
  }

  #sync() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
  }
}
