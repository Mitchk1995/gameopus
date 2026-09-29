import * as THREE from 'three';
import { STEP } from '../world/world.js';
import { WORLD } from '../world/map.js';
import rootMotion from './rootmotion.json';
import { UPPER, tiltUpper, raySphere } from './aim.js';

// The player's body: walking, running, rolling and standing on things. Movement is
// relative to the camera; the character turns to face where it's going. Clips play in
// place and the controller moves the root, using the animator's own root motion for
// rolls so the body and the ground stay in step.

const RADIUS = 0.32, HEIGHT = 1.8, GRAVITY = 24;
export const SPEED = { walk: 1.3, jog: 5.0, sprint: 7.4, aim: 1.7 };
// Natural ground speed of each locomotion clip (from the root-motion versions).
const CLIP_SPEED = { Walk_Loop: 0.97, Jog_Fwd_Loop: 5.36, Sprint_Loop: 8.25 };
const JUMP_SPEED = 7.2;       // about a metre of height
const SWING_MOVE = 0.7;       // share of jog speed you keep while swinging
// How a swing tips the body to put the blade on the crosshair: the spine takes most of the
// angle, the swinging arm the rest (the shares add up to 1).
const SWING_LEAN = [['spine_01', 0.15], ['spine_02', 0.22], ['spine_03', 0.25], ['clavicle_r', 0.1], ['upperarm_r', 0.28]];
const SWING_BLEND = 0.03;     // seconds for the layered swing to fade in over the legs
// The dodge roll. The clip glides at an even speed, which reads as floaty, so the body instead
// bursts off the mark and eases to a stop: `dist` metres over the clip's first `travel` seconds
// (clip time), half of it an even glide and half an ease-out. Control returns at `control`, and
// `iframes` is the untouchable stretch (both in clip time; the clip plays at `rate`). Roll_Tuck is
// the library's roll with its long flat dive swept through in 0.07 s (scripts/compose-clips.mjs).
const ROLL = { clip: 'Roll_Tuck', rate: 1.5, dist: 3.6, travel: 0.87, control: 0.9, iframes: [0.03, 0.6] };

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
    this.swingMode = 'full';
    this.swingW = 0;
    this.swingIn = 0;
    this.airT = 0;
    this.wasAir = false;
    this.landT = 0;
    this.swingTracks = new Map();
    // Where a swing is aimed, set by the fight code: the crosshair ray, the target's body
    // point if there is one, and the resulting point the body turns toward.
    this.aimPoint = null;
    this.aimOrigin = null;
    this.aimDir = null;
    this.aimTarget = null;
    this.leanW = 0;
    this.recoverT = 0;
    this.settle = 0;
    this.lastMove = null;
    this.sinceSwing = 9;
  }

  spawn(x, z, facing = 0) {
    this.pos.set(x, this.world.groundAt(x, z, 1e4), z);
    this.yaw = facing;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.state = 'move';
    this.stateTime = 0;
    this.invulnerable = false;
    this.action = null;
    this.knock = null;
    this.gait = 'Idle_Loop';
    this.swingW = this.leanW = this.recoverT = this.settle = 0;
    this.wasAir = false;
    this.airT = this.landT = 0;
    this.aimPoint = this.aimTarget = this.aimYaw = null;
    this.lastMove = null;
    this.sinceSwing = 9;
    this._moving = false;
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
    if (this.state === 'dead') return null;
    this.invulnerable = false;
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
  // A swing: the clip plays at the move's speed, in place unless the move has a `lunge` (none
  // do now: the owner wants swings to stay where they are), and onHit fires as the blade connects.
  startAttack(move, onHit) {
    if (this.state === 'dead') return;
    this.invulnerable = false;
    if (this.state === 'act') this.stopAction();
    // Coming out of the finisher (a low, twisted follow-through) the body straightens into
    // the next swing over a little longer, so it doesn't snap.
    const before = this.state === 'attack' ? this.move : this.sinceSwing < 0.3 ? this.lastMove : null;
    const fade = before && before.kind === 'finisher' ? 0.12 : 0.06;
    this.state = 'attack';
    this.stateTime = 0;
    this.move = move;
    this.onHit = onHit;
    this.hitDone = false;
    this.lungeDone = 0;
    this.recoverT = 0;
    this.settle = 0;
    if (this.gait === 'Recover') this.gait = null;
    this.clipLength = this.char.clips.get(move.clip).duration;
    // Swinging while on the move: the legs keep jogging and the swing plays on the upper
    // body. Standing still, the whole body swings and steps in as before.
    if (this._moving || !this.grounded) {
      this.swingMode = 'layered';
      this.swingIn = 0;
    } else {
      this.swingMode = 'full';
      this.vel.set(0, 0, 0);
      const a = this.char.play(move.clip, { loop: false, speed: move.speed, fade, restart: true });
      a.time = move.from ?? 0;
    }
  }

  // Where the swing is in its clip (seconds of clip time, counted from the clip's start).
  get swingClipT() {
    return (this.move.from ?? 0) + this.stateTime * this.move.speed;
  }

  // Starts moving mid-swing (or jumps): the legs take over, the swing carries on above.
  #toLayered() {
    this.swingMode = 'layered';
    this.swingIn = 1;
    this.gait = null;
  }

  // Runs after the animation each frame: lays the swing over the upper body while the
  // legs do their own thing, tips the body so the blade passes through the crosshair, and
  // eases it all out at the end or when a dodge cuts it off.
  applySwing(dt) {
    const m = this.move, attacking = this.state === 'attack';
    if (attacking && this.swingMode === 'layered') {
      this.swingT = this.swingClipT;
      this.swingIn = Math.min(1, this.swingIn + dt / SWING_BLEND);
      const end = m.end ?? this.clipLength * 0.92;
      this.swingW = Math.min(this.swingIn, Math.max(0, (end - this.swingT) / (0.1 * m.speed)));
      this.swingClip = m.clip;
    } else this.swingW = Math.max(0, this.swingW - dt / 0.1);
    this.leanW = attacking ? Math.min(1, this.leanW + dt / 0.06) : Math.max(0, this.leanW - dt / 0.12);
    if (this.swingW >= 0.01 && this.swingClip) this.#overlay();
    if (this.leanW >= 0.01 && this.aimPoint && this.aimDir && m) this.#lean(m);
    else if (!attacking && this.leanW < 0.01) this.aimPoint = null;
  }

  // The swing clip's upper-body rotations, blended over whatever the legs are doing.
  #overlay() {
    const B = this.char.bones;
    const clip = this.char.clips.get(this.swingClip);
    let set = this.swingTracks.get(this.swingClip);
    if (!set) {
      set = { tracks: [], pelvis: null };
      for (const track of clip.tracks) {
        const [name, prop] = track.name.split('.');
        if (prop !== 'quaternion') continue;
        if (name === 'pelvis') set.pelvis = track.createInterpolant();
        else if (UPPER.includes(name) && B[name]) set.tracks.push({ bone: B[name], name, interp: track.createInterpolant() });
      }
      this.swingTracks.set(this.swingClip, set);
    }
    const t = Math.min(this.swingT ?? 0, clip.duration), q = this._q || (this._q = new THREE.Quaternion());
    // The clip's chest orientation assumes the hips were in the clip's own pose. The jump
    // and jog poses tip the hips differently (leaning back in the air, which sent the swing
    // over the head), so the lowest spine bone takes up the difference.
    let hips = null;
    if (set.pelvis) {
      const r = set.pelvis.evaluate(t);
      hips = (this._qh || (this._qh = new THREE.Quaternion())).copy(B.pelvis.quaternion).invert().multiply(q.set(r[0], r[1], r[2], r[3]).normalize());
    }
    for (const { bone, name, interp } of set.tracks) {
      const r = interp.evaluate(t);
      q.set(r[0], r[1], r[2], r[3]).normalize();
      if (hips && name === 'spine_01') q.premultiply(hips);
      this.char.mark(bone);
      bone.quaternion.slerp(q, this.swingW);
    }
  }

  // Tips the body up or down so the blade's path at the moment of the hit runs through the
  // crosshair (or the target's body): the same idea as the bow's chest lean, taken from
  // the aim pitch. Without a target, the aim is where the crosshair ray passes at the
  // blade's reach from the shoulder, so it works the same on the ground and in the air.
  #lean(m) {
    const B = this.char.bones, root = this.char.root;
    const bones = SWING_LEAN.map(([name]) => B[name]);
    const snap = this._snap || (this._snap = bones.map(() => new THREE.Quaternion()));
    bones.forEach((b, i) => snap[i].copy(b.quaternion));
    const sh = this._sh || (this._sh = new THREE.Vector3()), c = this._sc || (this._sc = new THREE.Vector3()), tmp = this._sp || (this._sp = new THREE.Vector3());
    const ahead = this.state === 'attack' ? Math.max(0, (m.lunge || 0) - this.lungeDone) : 0;
    // Tipping the spine moves the shoulder too, so settle on the angle over a few passes:
    // pose with the guess, look where the shoulder ended up, and correct.
    let phi = 0;
    for (let pass = 0; pass < 3; pass++) {
      bones.forEach((b, i) => b.quaternion.copy(snap[i]));
      if (pass) tiltUpper(this.char, this.yaw, phi * this.leanW, SWING_LEAN);
      root.updateMatrixWorld(true);
      B.upperarm_r.getWorldPosition(sh);
      // The shoulder as it will be when the blade lands, after the rest of the lunge.
      c.set(sh.x + Math.sin(this.yaw) * ahead, sh.y, sh.z + Math.cos(this.yaw) * ahead);
      const p = this.aimTarget || raySphere(this.aimOrigin, this.aimDir, c, m.aimReach ?? 1.1, tmp);
      const pitch = Math.atan2(p.y - c.y, Math.max(0.4, Math.hypot(p.x - c.x, p.z - c.z)));
      phi = THREE.MathUtils.clamp(pitch - (m.aimPitch ?? 0), -0.9, 0.9);
    }
    bones.forEach((b, i) => b.quaternion.copy(snap[i]));
    tiltUpper(this.char, this.yaw, phi * this.leanW, SWING_LEAN);
  }

  get attackPhase() {
    if (this.state !== 'attack') return null;
    const t = this.swingClipT;
    return { t, afterHit: this.hitDone, canChain: this.hitDone && t >= this.move.hit + (this.move.next ?? 0.1) };
  }

  // The guard: blade held upright in front, left forearm raised (anims/combat.glb, built by
  // scripts/compose-clips.mjs), with or without a shield. A blow on it jolts it back briefly.
  startBlock() {
    if (this.state === 'dead') return;
    this.invulnerable = false;
    if (this.state === 'act') this.stopAction();
    this.state = 'block';
    this.stateTime = 0;
    this.guardJolt = 0;
    this.char.play('Sword_Guard_Loop', { fade: 0.08, restart: true });
  }

  // A blow landed on the guard (not a parry): the guard rocks back and settles.
  blockHit() {
    if (this.state !== 'block') return;
    this.guardJolt = this.char.play('Sword_Guard_Hit', { loop: false, fade: 0.04, restart: true }).getClip().duration;
  }

  endBlock() {
    if (this.state !== 'block') return;
    this.state = 'move';
    this.gait = null;
  }

  hurt(heavy, fromYaw) {
    if (this.state === 'dead') return;
    this.invulnerable = false;
    if (this.state === 'act') this.stopAction();
    this.state = 'hurt';
    this.stateTime = 0;
    this.hurtFor = heavy ? 0.75 : 0.32;
    this.char.play(heavy ? 'Hit_Knockback' : 'Hit_Chest', { loop: false, fade: 0.05, restart: true, speed: heavy ? 1.1 : 1.2 });
    this.knock = heavy && fromYaw !== undefined ? { dir: new THREE.Vector3(Math.sin(fromYaw), 0, Math.cos(fromYaw)), left: 1.6 } : null;
  }

  die() {
    this.invulnerable = false;
    if (this.state === 'act') this.stopAction();
    this.state = 'dead';
    this.stateTime = 0;
    this.vel.set(0, 0, 0);
    this.char.play('Death01', { loop: false, fade: 0.1, restart: true });
  }

  revive() {
    this.invulnerable = false;
    this.state = 'move';
    this.gait = null;
    this.char.play('Idle_Loop', { fade: 0 });
  }

  #attackStep(dt) {
    const m = this.move, t = this.swingClipT, from = m.from ?? 0;
    // Aim: follow the target or the crosshair until the blow lands.
    if (!this.hitDone && this.aimPoint) {
      const dx = this.aimPoint.x - this.pos.x, dz = this.aimPoint.z - this.pos.z;
      if (dx * dx + dz * dz > 0.09) this.#turnTowards(Math.atan2(dx, dz), dt, 30);
    }
    // Lunge with the clip's root motion, scaled to the move's reach, up to the hit.
    const curve = rootMotion.clips[m.clip];
    if (curve && m.lunge && t <= m.hit + 0.05) {
      const start = travelled(curve, from), total = travelled(curve, m.hit + 0.05) - start;
      const want = total > 0.01 ? ((travelled(curve, t) - start) / total) * m.lunge : 0;
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
    if (t >= end) this.#endSwing();
  }

  // The swing is over: back to moving. Standing, the blade eases home through the
  // recovery clip; either way the pose settles into idle or the jog without a snap.
  #endSwing() {
    const m = this.move;
    this.state = 'move';
    this.gait = null;
    this.settle = 0.22;
    this.lastMove = m;
    this.sinceSwing = 0;
    if (this.swingMode === 'full' && this.grounded && m.recover && this.char.clips.has(m.recover)) {
      const speed = 1.7;
      this.char.play(m.recover, { loop: false, speed, fade: 0.08, restart: true });
      this.gait = 'Recover';
      this.recoverT = 0.6 / speed;
    }
  }

  update(dt, camYaw) {
    this.stateTime += dt;
    this.sinceSwing += dt;
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

    this._moving = moving;
    // Dodge (tap Shift) and jump (Space) can cut in at any time: moving, guarding or mid-swing.
    const free = this.state === 'move' || this.state === 'block' || this.state === 'attack';
    const dodge = input.tapped.has('ShiftLeft') || input.tapped.has('ShiftRight');
    if (free && dodge && this.grounded && (this.canRoll?.() ?? true)) this.#startRoll(moving ? wish : null);
    else if ((this.state === 'move' || this.state === 'attack') && input.hit('Space') && this.grounded) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
      this.gait = null;
      if (this.state === 'attack' && this.swingMode === 'full') this.#toLayered();
    }
    // Start walking mid-swing and the legs pick up the jog.
    if (this.state === 'attack' && this.swingMode === 'full' && moving && this.stateTime * this.move.speed > 0.05) this.#toLayered();
    if (this.state === 'hurt' && this.stateTime >= this.hurtFor) {
      this.state = 'move';
      this.gait = null;
    }

    const prev = this._prev || (this._prev = new THREE.Vector3());
    prev.copy(this.pos);
    let target = 0;
    if (this.state === 'roll') this.#rollStep();
    else if (this.state === 'attack') {
      this.#attackStep(dt);
      // Swinging on the move: keep going at a reduced pace, body still facing the swing.
      if (this.swingMode === 'layered') target = this.#steer(dt, wish, moving, SPEED.jog * SWING_MOVE, false);
    }
    else if (this.state === 'block') {
      // Shuffle while guarding, facing stays put.
      const k = 1 - Math.exp(-14 * dt);
      this.vel.x += (wish.x * 1.4 - this.vel.x) * k;
      this.vel.z += (wish.z * 1.4 - this.vel.z) * k;
      if (this.guardJolt > 0 && (this.guardJolt -= dt) <= 0) this.char.play('Sword_Guard_Loop', { fade: 0.1 });
    } else if (this.state === 'hurt' && this.knock) {
      const step = Math.min(this.knock.left, dt * 4);
      this.pos.addScaledVector(this.knock.dir, step);
      this.knock.left -= step;
      if (this.knock.left <= 0) this.knock = null;
    } else if (this.state === 'move') {
      target = this.#steer(dt, wish, moving, Infinity, true);
    } else {
      this.vel.x *= Math.exp(-20 * dt);
      this.vel.z *= Math.exp(-20 * dt);
    }

    if (this.state === 'move' || this.state === 'block' || this.state === 'act' || this.state === 'attack') {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    this.#collide(prev);
    this.#fall(dt);
    const d = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    if (this.state === 'move' || (this.state === 'attack' && this.swingMode === 'layered')) this.#animate(dt, d / Math.max(dt, 1e-4), target);
    this.#sync();
  }

  // Accelerates toward the wanted direction; returns the speed being aimed for. Starts and
  // stops take a few frames, and the jog-to-run change is a touch softer so it reads as a
  // gear change (the numbers are time constants, in seconds). In the air you steer less.
  #steer(dt, wish, moving, cap, turn) {
    const input = this.input;
    let target = moving ? (this.walking ? SPEED.walk : input.down('ShiftLeft') || input.down('ShiftRight') ? SPEED.sprint : SPEED.jog) : 0;
    // Shallow water slows you down, but only where your feet are in it (not on a bridge deck above it).
    const depth = Math.min(this.world.waterDepth(this.pos.x, this.pos.z), WORLD.water - this.pos.y);
    if (depth > 0.15) target *= 1 - Math.min(0.55, depth * 0.6);
    target = Math.min(target, cap);
    if (this.aimYaw != null) target = Math.min(target, SPEED.aim);
    let tau = !moving ? 0.035 : target > SPEED.jog + 0.1 && this.vel.length() < target ? 0.09 : 0.05;
    if (!this.grounded) tau = Math.max(tau, 0.3);
    const k = 1 - Math.exp(-dt / tau);
    this.vel.x += (wish.x * target - this.vel.x) * k;
    this.vel.z += (wish.z * target - this.vel.z) * k;
    // Aiming: face the crosshair and walk, strafing as needed.
    if (this.aimYaw != null && turn) this.#turnTowards(this.aimYaw, dt, 16);
    else if (moving && turn) this.#turnTowards(Math.atan2(wish.x, wish.z), dt, target > SPEED.jog + 0.1 ? 15 : 22);
    return target;
  }

  #startRoll(dir) {
    this.state = 'roll';
    this.stateTime = 0;
    if (dir) this.yaw = Math.atan2(dir.x, dir.z);
    this.rollDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.rollDone = 0;
    this.char.play(ROLL.clip, { loop: false, speed: ROLL.rate, fade: 0.08, restart: true });
  }

  #rollStep() {
    const t = this.stateTime * ROLL.rate;
    const u = Math.min(1, t / ROLL.travel);
    const dist = ROLL.dist * (0.5 * u + 0.5 * (1 - (1 - u) * (1 - u)));
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

  // Idle, walk, jog (regular) or run (sprint, Shift) by what the player asked for, with
  // each clip's rate matched to the real ground speed so the feet don't skate. Off the
  // ground it's the jump clips; swinging on the move, the legs read your direction
  // relative to where the body is facing (backing away plays the jog in reverse).
  #animate(dt, speed, target) {
    if (!this.grounded) {
      this.airT = this.wasAir ? this.airT + dt : 0;
      this.wasAir = true;
      const gait = this.airT > 0.65 ? 'Jump_Loop' : 'Jump_Start';
      if (gait !== this.gait) {
        this.char.play(gait, { fade: 0.08, loop: gait === 'Jump_Loop', speed: gait === 'Jump_Loop' ? 1 : 2.2 });
        this.gait = gait;
      }
      return;
    }
    if (this.wasAir) {
      this.wasAir = false;
      this.gait = null;
      if (speed < 1.5 && target === 0 && this.state === 'move') {
        this.char.play('Jump_Land', { fade: 0.05, loop: false, speed: 3.2, restart: true });
        this.gait = 'Jump_Land';
        this.landT = 0.16;
        return;
      }
    }
    if (this.gait === 'Jump_Land' && this.landT > 0 && target === 0) {
      this.landT -= dt;
      return;
    }
    // Easing the blade home after a swing: hold the recovery clip unless you move off.
    if (this.gait === 'Recover') {
      this.recoverT -= dt;
      if (target === 0 && this.recoverT > 0) return;
    }
    let gait, dir = 1;
    if (this.state === 'attack') {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      gait = sp < 1.5 ? 'Idle_Loop' : 'Jog_Fwd_Loop';
      if (sp >= 1.5 && (this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw)) / sp < -0.35) dir = -1;
    } else if (target === 0) gait = speed < 1.5 ? 'Idle_Loop' : this.gait || 'Idle_Loop';
    else if (target <= SPEED.walk + 0.01 || this.aimYaw != null) gait = 'Walk_Loop';
    else if (target > SPEED.jog + 0.1 && speed > SPEED.jog - 0.3) gait = 'Sprint_Loop';
    else gait = 'Jog_Fwd_Loop';
    if (!(gait in CLIP_SPEED || gait === 'Idle_Loop')) gait = 'Idle_Loop';
    const rate = gait === 'Idle_Loop' ? 1 : Math.min(1.25, Math.max(0.5, speed / CLIP_SPEED[gait]));
    if (gait !== this.gait) {
      this.char.play(gait, { fade: this.settle || (gait === 'Idle_Loop' ? 0.15 : 0.1), speed: dir * rate });
      this.settle = 0;
      this.gait = gait;
    } else if (gait !== 'Idle_Loop') this.char.current.timeScale = dir * rate;
  }

  #sync() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
  }
}

// Metres a clip's root has moved forward by clip time t, from its sampled root motion.
function travelled(curve, t) {
  const f = Math.min(curve.length - 1, Math.max(0, t * rootMotion.hz)), i = Math.floor(f);
  return curve[i] + (curve[Math.min(i + 1, curve.length - 1)] - curve[i]) * (f - i);
}
