import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Character } from './character.js';
import { buildItem } from '../ui/itemart.js';
import { STEP } from '../world/world.js';

// Enemies: the Bestiary monsters (retargeted to the humans' animation library) and
// armed humans. Each runs a small brain: notice the player, close in, take turns to
// attack (only two at once, the rest circle), telegraph every swing, and leave a gap
// after it for the player to punish.

export class MonsterFactory {
  constructor(assets, people) {
    this.assets = assets;
    this.people = people;
    this.retargeted = new Map();
  }

  async create(def) {
    if (def.model === 'human') {
      const c = await this.people.create({ ...def.look, tintMaterial: def.look.tintMaterial });
      if (def.weapon) {
        const w = buildItem(def.weapon, this.assets);
        const hand = c.bones.hand_r;
        w.position.set(-0.025, 0.075, 0);
        w.rotation.set(Math.PI / 2, Math.PI, 0);
        const s = new THREE.Vector3();
        hand.getWorldScale(s);
        w.scale.setScalar(1 / s.x);
        hand.add(w);
      }
      c.root.scale.setScalar(def.scale || 1);
      return c;
    }
    const gltf = await this.assets.model(`monsters/${def.model}.glb`);
    const root = cloneSkinned(gltf.scene);
    const bones = {};
    root.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
    });
    // Recolour tougher variants.
    if (def.skin && def.skin > 1) {
      const tex = await this.assets.texture(`monsters/${def.model}_${def.skin}.webp`, { repeat: false });
      tex.flipY = false;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.map = tex;
      });
    }
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) {
        o.computeBoundingSphere();
        o.boundingSphere.radius = Math.max(o.boundingSphere.radius * 1.6, 1.2);
      }
    });
    root.scale.setScalar(def.scale || 1);
    return new Character(root, bones, this.#clipsFor(def.model, bones));
  }

  // The humans' clips with hip height rescaled to this creature's legs, and without
  // the tracks for bones it doesn't have (fingers, toes).
  #clipsFor(model, bones) {
    if (this.retargeted.has(model)) return this.retargeted.get(model);
    const human = this.people.restPelvis;
    const k = human ? bones.pelvis.position.y / human : 1;
    const clips = new Map();
    for (const [name, clip] of this.people.clips) {
      const c = clip.clone();
      c.tracks = c.tracks.filter((t) => bones[t.name.slice(0, t.name.lastIndexOf('.'))]);
      for (const t of c.tracks) if (t.name === 'pelvis.position' || t.name === 'root.position') for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
      clips.set(name, c);
    }
    this.retargeted.set(model, clips);
    return clips;
  }
}

export class Enemy {
  constructor(def, char, world, home, id) {
    this.def = def;
    this.id = id;
    this.char = char;
    this.world = world;
    this.home = new THREE.Vector3(home.x, 0, home.z);
    this.pos = new THREE.Vector3(home.x, world.groundAt(home.x, home.z, 1e4), home.z);
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = def.hp;
    this.state = 'idle';
    this.t = 0;
    this.cooldown = 1 + Math.random();
    this.radius = 0.42 * (def.scale || 1);
    this.height = (def.model === 'human' ? 1.9 : 1.35) * (def.scale || 1);
    this.poiseDamage = 0;
    this.clock = 0;
    this.steadyUntil = 0;
    this.wander = null;
    this.engaged = false;
    this.anim = null;
    this.play(def.idle || 'Idle_Loop');
    this.#sync();
  }

  get alive() {
    return this.state !== 'dead' && this.state !== 'gone';
  }

  get target() {
    return { kind: 'enemy', enemy: this, x: this.pos.x, y: this.pos.y + this.height * 0.5, z: this.pos.z, r: this.radius + 0.25, h: this.height, reach: 30 };
  }

  play(name, opts = {}) {
    this.anim = name;
    return this.char.play(name, { fade: 0.15, ...opts });
  }

  // Open to punishment: winding down after a swing, staggered or parried.
  get exposed() {
    return this.state === 'recover' || this.state === 'stagger' || this.state === 'parried';
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  // ---------------------------------------------------------------- brain
  update(dt, ctx) {
    const { player, alive: playerAlive } = ctx;
    this.t += dt;
    this.clock = (this.clock || 0) + dt;
    const toP = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toP.length();
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    let move = null, speed = 0, face = null;

    switch (this.state) {
      case 'idle': {
        if (playerAlive && dist < this.def.aggro && Math.abs(player.pos.y - this.pos.y) < 4) {
          this.engaged = true;
          this.setState('chase');
          ctx.onAggro?.(this);
          break;
        }
        // Amble about near home.
        if (!this.wander || this.t > this.wander.until) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
          this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r, until: this.t + 4 + Math.random() * 6 };
        }
        const w = new THREE.Vector3(this.wander.x - this.pos.x, 0, this.wander.z - this.pos.z);
        if (w.length() > 0.5 && this.t % 10 > 5) {
          move = w.normalize();
          speed = 1.0;
        }
        break;
      }
      case 'chase': {
        if (!playerAlive || fromHome > this.def.leash || dist > this.def.leash) {
          this.engaged = false;
          ctx.releaseToken(this);
          this.setState('return');
          break;
        }
        face = toP;
        this.cooldown -= dt;
        const next = this.def.attacks[Math.floor(this.pickSeed ?? 0) % this.def.attacks.length];
        // Claim a turn to attack when close and rested; without one, hang back and circle.
        if (dist < 5 && this.cooldown <= 0 && !ctx.hasToken(this)) ctx.takeToken(this);
        const mine = ctx.hasToken(this);
        const want = mine ? next.range * 0.75 : 3.2;
        if (dist > want) {
          move = toP.clone().normalize();
          speed = dist > 6 ? this.def.speed : this.def.speed * 0.75;
        } else if (!mine) {
          const side = this.id % 2 ? 1 : -1;
          move = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(side).addScaledVector(toP.clone().normalize(), dist < 2.6 ? -0.8 : 0);
          speed = 1.3;
        }
        if (mine && dist < next.range * 0.95 && this.cooldown <= 0) {
          this.#startAttack(next, ctx);
          break;
        }
        this.#maybeBlock(ctx, dist);
        break;
      }
      case 'block': {
        face = toP;
        if (this.t > 0.9) this.setState('chase');
        break;
      }
      case 'windup': {
        face = toP;
        const a = this.attack;
        // Slow creep through the start of the swing, then snap.
        if (this.t >= a.windup) {
          this.setState('attack');
          this.action.timeScale = a.speed ?? 1;
        }
        break;
      }
      case 'attack': {
        const a = this.attack;
        const clipTime = this.action.time;
        if (a.lunge && clipTime < a.hit) {
          move = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          speed = a.lunge / a.hit;
        } else if (clipTime < a.hit) face = toP;
        if (!this.struck && clipTime >= a.hit) {
          this.struck = true;
          ctx.strike(this, a);
        }
        if (this.struck && clipTime >= a.hit + 0.12) {
          if (a.combo && this.state === 'attack') {
            this.#startAttack(a.combo, ctx, 0.18);
            break;
          }
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        if (this.t > 0.55 + (this.attack?.unblockable ? 0.4 : 0)) {
          ctx.releaseToken(this);
          this.cooldown = 0.8 + Math.random() * 1.2;
          this.pickSeed = Math.random() * 100;
          this.setState('chase');
          this.play(this.def.combatIdle || 'Idle_Loop');
        }
        break;
      }
      case 'stagger':
      case 'parried': {
        if (this.t > this.stunFor) {
          ctx.releaseToken(this);
          this.cooldown = 0.5;
          this.setState('chase');
          this.play(this.def.combatIdle || 'Idle_Loop');
        }
        break;
      }
      case 'return': {
        const h = new THREE.Vector3(this.home.x - this.pos.x, 0, this.home.z - this.pos.z);
        if (h.length() < 1) {
          this.setState('idle');
          break;
        }
        move = h.normalize();
        speed = this.def.speed * 0.8;
        this.hp = Math.min(this.def.hp, this.hp + dt * this.def.hp * 0.25);
        break;
      }
      case 'dead': {
        if (this.t > 3.5) this.char.root.position.y -= dt * 0.6;
        if (this.t > 6) {
          this.char.root.visible = false;
          this.setState('gone');
        }
        break;
      }
      case 'gone': {
        if (this.t > this.def.respawn) this.#respawn();
        break;
      }
    }

    if (this.alive) {
      this.#move(dt, move, speed, ctx);
      if (face) this.#turn(Math.atan2(face.x, face.z), dt, this.state === 'windup' ? 10 : 7);
      this.#animate(speed);
    }
    this.char.update(dt);
    this.#sync();
  }

  #startAttack(a, ctx, windup = null) {
    this.attack = a;
    this.struck = false;
    this.setState('windup');
    const w = (windup ?? a.windup) * (this.enraged ? 0.75 : 1);
    // Creep to 40% of the way to the hit during the wind-up, so the pose reads.
    this.action = this.play(a.clip, { loop: false, restart: true, fade: 0.12, speed: (a.hit * 0.4) / w });
    this.attack = { ...a, windup: w };
    ctx.tell(this, a);
  }

  #maybeBlock(ctx, dist) {
    if (!this.def.blocks || dist > 3 || this.state !== 'chase') return;
    if (ctx.playerAttacking && !this.blockRolled) {
      this.blockRolled = true;
      if (Math.random() < this.def.blocks) {
        this.setState('block');
        this.play('Sword_Block', { loop: false, restart: true, speed: 1.4 });
      }
    }
    if (!ctx.playerAttacking) this.blockRolled = false;
  }

  // ---------------------------------------------------------------- being hit
  // Returns how the enemy took it: 'blocked', 'stagger', 'hit' or 'dead'.
  takeHit(result, move, fromYaw) {
    if (!this.alive) return 'dead';
    if (this.state === 'block' && move.kind !== 'heavy' && move.kind !== 'riposte') return 'blocked';
    this.hp -= result.damage;
    this.engaged = true;
    if (this.state === 'idle' || this.state === 'return') this.setState('chase');
    if (this.hp <= 0) {
      this.hp = 0;
      this.setState('dead');
      this.play('Death01', { loop: false, restart: true, fade: 0.1 });
      return 'dead';
    }
    // Glancing misses don't rock them, and a staggered enemy steadies itself for a
    // moment afterwards, so it can't be locked down with quick swings.
    const guardBroken = this.state === 'block' && move.kind === 'heavy';
    if (result.damage <= 0 && !guardBroken) return 'hit';
    if (this.steadyUntil > this.clock && !guardBroken && move.kind !== 'riposte') return 'hit';
    this.poiseDamage += move.kind === 'heavy' ? 2 : move.kind === 'riposte' || move.kind === 'finisher' ? 3 : 1;
    if (this.poiseDamage >= this.def.poise || guardBroken) {
      this.poiseDamage = 0;
      this.stagger(move.kind === 'heavy' || move.kind === 'riposte' ? 'Hit_Knockback' : 'Hit_Chest', move.kind === 'heavy' ? 0.85 : 0.45, fromYaw);
      return 'stagger';
    }
    return 'hit';
  }

  stagger(clip, dur, fromYaw) {
    this.setState('stagger');
    this.stunFor = dur;
    this.steadyUntil = this.clock + dur + 1.4;
    this.play(clip, { loop: false, restart: true, fade: 0.06 });
    if (clip === 'Hit_Knockback' && fromYaw !== undefined) {
      this.knock = { dir: new THREE.Vector3(Math.sin(fromYaw), 0, Math.cos(fromYaw)), left: 1.2 };
    }
  }

  // A perfect parry knocks the enemy off balance.
  parried() {
    this.setState('parried');
    this.stunFor = 1.3;
    this.play('Idle_Shield_Break', { loop: false, restart: true, fade: 0.06, speed: 0.9 });
  }

  #respawn() {
    this.hp = this.def.hp;
    this.pos.set(this.home.x, this.world.groundAt(this.home.x, this.home.z, 1e4), this.home.z);
    this.char.root.visible = true;
    this.engaged = false;
    this.setState('idle');
    this.play(this.def.idle || 'Idle_Loop', { fade: 0 });
  }

  // ---------------------------------------------------------------- body
  #move(dt, dir, speed, ctx) {
    const p = this.pos, prev = p.clone();
    if (this.knock) {
      const step = Math.min(this.knock.left, dt * 3.5);
      p.addScaledVector(this.knock.dir, step);
      this.knock.left -= step;
      if (this.knock.left <= 0) this.knock = null;
    }
    if (dir && speed > 0) p.addScaledVector(dir, speed * dt);
    // Keep apart from the others.
    for (const o of ctx.enemies) {
      if (o === this || !o.alive) continue;
      const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz), min = this.radius + o.radius + 0.2;
      if (d < min && d > 1e-4) {
        p.x += (dx / d) * (min - d) * 0.5;
        p.z += (dz / d) * (min - d) * 0.5;
      }
    }
    // And out of the player.
    const dx = p.x - ctx.player.pos.x, dz = p.z - ctx.player.pos.z, d = Math.hypot(dx, dz), min = this.radius + 0.35;
    if (d < min && d > 1e-4) {
      p.x += (dx / d) * (min - d);
      p.z += (dz / d) * (min - d);
    }
    this.world.colliders.push(p, this.radius, this.height, STEP);
    if (this.world.waterDepth(p.x, p.z) > 0.6) {
      p.x = prev.x;
      p.z = prev.z;
    }
    p.y = this.world.groundAt(p.x, p.z, p.y + 0.3);
    this.moved = Math.hypot(p.x - prev.x, p.z - prev.z) / Math.max(dt, 1e-4);
  }

  #turn(target, dt, rate) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, rate * dt);
  }

  #animate() {
    if (!['idle', 'chase', 'return'].includes(this.state)) return;
    const v = this.moved || 0;
    const clip = v < 0.3 ? (this.engaged ? this.def.combatIdle || 'Idle_Loop' : this.def.idle || 'Idle_Loop') : v < 2.2 ? 'Walk_Loop' : 'Jog_Fwd_Loop';
    if (clip !== this.anim) this.play(clip, { fade: 0.2, speed: clip === 'Walk_Loop' ? Math.max(0.7, v / 0.97) : clip === 'Jog_Fwd_Loop' ? Math.max(0.6, v / 5.36) : 1 });
    else if (clip !== 'Idle_Loop' && this.char.current) this.char.current.timeScale = clip === 'Walk_Loop' ? Math.max(0.7, v / 0.97) : Math.max(0.6, v / 5.36);
  }

  #sync() {
    if (this.state !== 'dead' && this.state !== 'gone') this.char.root.position.copy(this.pos);
    else if (this.state === 'dead' && this.t < 0.05) this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
  }
}
