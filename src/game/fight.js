import * as THREE from 'three';
import { MONSTERS, PLAYER_MOVES, playerMelee, monsterMelee, rollDrops, XP_PER_DAMAGE, HP_XP_PER_DAMAGE } from './combat.js';
import { ITEMS } from './items.js';
import { MonsterFactory, Enemy } from '../actors/enemies.js';
import { CombatUI } from '../ui/combatui.js';
import { buildItem } from '../ui/itemart.js';
import { Fire } from '../world/effects.js';
import { BANDIT_CAMP, SPAWN } from '../world/map.js';

// Fighting: enemy camps, the player's attacks, blocks and parries, lock-on, stamina,
// damage and experience, loot on the ground, and dying (you wake at the village well).

const PARRY_WINDOW = 0.22;     // seconds before a blow lands in which raising your guard parries it
const PERFECT_DODGE = 0.2;     // a roll started this close to a blow is a perfect dodge
const RIPOSTE_WINDOW = 1.4;
const MAX_STAMINA = 100;
const COST = { roll: 18, block: 10 };

const CAMPS = [
  { id: 'goblins', x: -96, z: -44, r: 9, spawns: ['goblin', 'goblin', 'goblin', 'goblin', 'goblin_brute'] },
  { id: 'bandits', x: BANDIT_CAMP.x, z: BANDIT_CAMP.z, r: 11, spawns: ['bandit', 'bandit', 'bandit', 'bandit', 'bandit_captain'] },
];

export class Fight {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.tokens = new Set();
    this.stamina = MAX_STAMINA;
    this.staminaWait = 0;
    this.lock = null;
    this.combo = 0;
    this.queued = null;
    this.ground = [];
    this.riposteUntil = 0;
    this.time = 0;
  }

  async init() {
    const g = this.game;
    this.ui = new CombatUI(g.camera);
    this.factory = new MonsterFactory(g.assets, g.factory);
    g.factory.restPelvis = g.hero.bones.pelvis.position.y;
    let id = 0;
    for (const camp of CAMPS) {
      this.#campDressing(camp);
      for (const [i, kind] of camp.spawns.entries()) {
        const def = MONSTERS[kind];
        const a = (i / camp.spawns.length) * Math.PI * 2, r = kind.endsWith('captain') || kind.endsWith('brute') ? 1.5 : camp.r * 0.7;
        const home = { x: camp.x + Math.cos(a) * r, z: camp.z + Math.sin(a) * r };
        const char = await this.factory.create(def);
        g.scene.add(char.root);
        this.enemies.push(new Enemy(def, char, g.world, home, id++));
      }
    }
    this.#staminaBar();
    g.player.canRoll = () => this.#spend(COST.roll);
  }

  // Tents, a fire and some crates, so a camp reads as a camp.
  #campDressing(camp) {
    const g = this.game, w = g.world, kit = w.village.kit;
    const canvas = new THREE.MeshStandardMaterial({ color: camp.id === 'bandits' ? 0x6a4a3a : 0x5a5a3a, roughness: 0.95, side: THREE.DoubleSide });
    const pole = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6, r = camp.r + 2.5;
      const x = camp.x + Math.cos(a) * r, z = camp.z + Math.sin(a) * r, y = w.heightAt(x, z);
      const tent = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(-1.6, 0);
      shape.lineTo(0, 1.9);
      shape.lineTo(1.6, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false });
      geo.translate(0, 0, -1.6);
      // Hollow it out: keep the two roof faces only by rendering double-sided cloth.
      const body = new THREE.Mesh(geo, canvas);
      body.castShadow = body.receiveShadow = true;
      tent.add(body);
      for (const s of [-1.65, 1.65]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 6), pole);
        p.position.set(0, 1.0, s);
        tent.add(p);
      }
      tent.position.set(x, y - 0.05, z);
      tent.rotation.y = -a;
      g.scene.add(tent);
      w.colliders.addBox(x, z, 1.6, 1.6, -a, y - 1, y + 1.9);
    }
    const fy = w.heightAt(camp.x, camp.z);
    const fire = new Fire(g.scene, camp.x, fy + 0.1, camp.z, { size: 0.7 });
    g.resources.fires.push(fire);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 6, 14), new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 1 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(camp.x, fy + 0.06, camp.z);
    g.scene.add(ring);
    w.colliders.addCircle(camp.x, camp.z, 0.85, fy - 1, fy + 0.5);
    for (const [dx, dz, name] of [[3.2, 2.6, 'Crate_Wooden'], [3.9, 1.8, 'Barrel'], [-3.4, 2.9, 'Crate_Wooden'], [-2.2, -3.6, 'WeaponStand']]) {
      const x = camp.x + dx, z = camp.z + dz;
      const o = kit.instance(name);
      o.position.set(x, w.heightAt(x, z), z);
      o.rotation.y = Math.atan2(dx, dz);
      g.scene.add(o);
      w.colliders.addCircle(x, z, 0.45, o.position.y - 1, o.position.y + 1);
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, P = g.player, input = g.input;
    this.time += dt;
    const alive = P.state !== 'dead';
    const busy = g.uiOpen;

    // Stamina comes back after a short pause.
    if (this.staminaWait > 0) this.staminaWait -= dt;
    else this.stamina = Math.min(MAX_STAMINA, this.stamina + dt * (P.state === 'block' ? 12 : 32));
    if (P.gait === 'Sprint_Loop' && P.state === 'move') {
      this.stamina = Math.max(0, this.stamina - dt * 9);
      this.staminaWait = 0.4;
    }

    if (alive && !busy) this.#input(dt);
    const ctx = {
      player: P, alive, enemies: this.enemies,
      playerAttacking: P.state === 'attack' && !P.hitDone,
      takeToken: (e) => (this.tokens.has(e) || this.tokens.size < 2 ? (this.tokens.add(e), true) : false),
      hasToken: (e) => this.tokens.has(e),
      releaseToken: (e) => this.tokens.delete(e),
      strike: (e, a) => this.#enemyStrike(e, a),
      tell: (e, a) => this.#tell(e, a),
      onAggro: () => {},
    };
    for (const e of this.enemies) {
      if (!e.alive) this.tokens.delete(e);
      if (e.pos.distanceTo(P.pos) < 90 || e.engaged) e.update(dt, ctx);
    }
    if (this.lock && (!this.lock.alive || this.lock.pos.distanceTo(P.pos) > 28)) this.lock = null;
    g.rig.lockTarget = this.lock ? this.lock.pos.clone().setY(this.lock.pos.y + this.lock.height * 0.55) : null;
    this.#updateGround(dt);
    this.#updateTells(dt);
    this.ui.update(dt, this.enemies, this.lock, P.pos);
    this.#drawStamina();
  }

  #input() {
    const g = this.game, P = g.player, input = g.input;
    // Lock on (Q or middle mouse): the nearest enemy near the middle of the screen.
    if (input.hit('KeyQ') || input.clicked.has(1)) this.lock = this.lock ? null : this.#pickLock();
    if (this.lock && Math.abs(input.dx) > 60) {
      const next = this.#pickLock(Math.sign(input.dx));
      if (next) this.lock = next;
    }
    const attackPressed = input.clicked.has(0);
    const heavyPressed = input.hit('KeyF');
    const blocking = input.buttons.has(2);

    // Guard: hold the right button.
    if (blocking && (P.state === 'move' || (P.state === 'attack' && P.hitDone))) {
      P.startBlock(!!g.state.equip.shield);
      this.blockStart = this.time;
      this.#faceFoe();
    } else if (!blocking && P.state === 'block') P.endBlock();

    // Light attacks chain; a press during a swing queues the next one.
    if (attackPressed) this.queued = 'light';
    if (heavyPressed) this.queued = 'heavy';
    if (this.queued && (P.state === 'move' || (P.state === 'attack' && P.attackPhase.canChain))) {
      const kind = this.queued;
      this.queued = null;
      this.#attack(kind);
    } else if (this.queued && P.state !== 'attack') this.queued = null;
    if (P.state !== 'attack' && P.state !== 'block' && this.time - (this.lastSwing || 0) > 1.2) this.combo = 0;
  }

  #attack(kind) {
    const g = this.game, P = g.player;
    const weapon = g.state.equip.weapon && ITEMS[g.state.equip.weapon];
    let move;
    if (kind === 'heavy') move = { ...PLAYER_MOVES.heavy };
    else {
      move = { ...PLAYER_MOVES.light[this.combo % PLAYER_MOVES.light.length] };
      this.combo = (this.combo + 1) % PLAYER_MOVES.light.length;
    }
    if (!weapon) Object.assign(move, kind === 'heavy' ? { clip: 'Punch_Cross', hit: 0.19, speed: 1, range: 1.6, end: 0.7 } : { clip: 'Punch_Jab', hit: 0.16, speed: 1.1, range: 1.5, end: 0.55, recover: null });
    if (this.time < this.riposteUntil && kind === 'light') move.kind = 'riposte';
    if (!this.#spend(move.stamina)) {
      g.panels.message('You are too tired to swing.', 'bad');
      return;
    }
    if (kind === 'heavy') this.combo = 0;
    this.lastSwing = this.time;
    this.#faceFoe(true);
    g.stop();
    P.startAttack(move, (m) => this.#playerHit(m));
    g.audio.play(kind === 'heavy' ? 'heavy' : 'swing', P.pos);
  }

  // Turn toward the locked target, or the nearest foe roughly in front, or the camera.
  #faceFoe(orCamera = false) {
    const g = this.game, P = g.player;
    let t = this.lock;
    if (!t) {
      const fwd = new THREE.Vector3(-Math.sin(g.rig.yaw), 0, -Math.cos(g.rig.yaw));
      let best = 3.4;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
        const dir = new THREE.Vector3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize();
        if (d < best && dir.dot(fwd) > 0.3) {
          best = d;
          t = e;
        }
      }
    }
    if (t) P.faceTowards(t.pos.x, t.pos.z);
    else if (orCamera) P.yaw = g.rig.yaw + Math.PI;
  }

  #pickLock(side = 0) {
    const g = this.game, cam = g.camera;
    const fwd = g.rig.forward(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(g.rig.yaw), 0, -Math.sin(g.rig.yaw));
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e === this.lock) continue;
      const to = new THREE.Vector3(e.pos.x - cam.position.x, e.pos.y + 1 - cam.position.y, e.pos.z - cam.position.z);
      const d = to.length();
      if (d > 26) continue;
      to.normalize();
      const facing = to.dot(fwd);
      if (facing < 0.5) continue;
      if (side && Math.sign(to.dot(right)) !== side) continue;
      const score = (1 - facing) * 40 + d * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  #spend(cost) {
    if (this.stamina < cost * 0.5) return false;
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaWait = 0.7;
    return true;
  }

  // ---------------------------------------------------------------- hits
  #playerHit(move) {
    const g = this.game, P = g.player;
    const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    let landed = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
      const d = to.length() - e.radius;
      if (d > move.range) continue;
      if (to.normalize().dot(fwd) < Math.cos((move.arc * Math.PI) / 180)) continue;
      const kind = move.kind === 'riposte' && e.state !== 'parried' ? 'light' : move.kind;
      const res = playerMelee(g.state.skills, g.state.bonuses(), e.def, { kind }, { exposed: e.exposed });
      const outcome = e.takeHit(res, { ...move, kind }, P.yaw);
      const at = e.pos.clone().setY(e.pos.y + e.height * 0.7);
      landed++;
      this.ui.recent = e;
      if (outcome === 'blocked') {
        g.audio.play('block', e.pos);
        this.ui.splat(at, 'Blocked', 'word');
        continue;
      }
      if (res.damage > 0) {
        g.audio.play(res.crit ? 'crit' : 'hit', e.pos);
        this.ui.splat(at, String(res.damage), res.crit ? 'crit' : 'dmg');
        this.#hitStop(res.crit || kind === 'heavy' ? 0.09 : 0.045);
        const skill = kind === 'heavy' ? 'strength' : 'attack';
        g.state.skills.add(skill, res.damage * XP_PER_DAMAGE);
        g.state.skills.add('hitpoints', res.damage * HP_XP_PER_DAMAGE);
      } else {
        g.audio.play('miss', e.pos);
        this.ui.splat(at, '0', 'zero');
      }
      if (outcome === 'dead') this.#killed(e);
      if (outcome === 'stagger' && kind === 'riposte') this.riposteUntil = 0;
    }
    if (!landed) g.audio.play('miss', P.pos, 0.6);
  }

  #enemyStrike(e, a) {
    const g = this.game, P = g.player;
    if (P.state === 'dead') return;
    const to = new THREE.Vector3(P.pos.x - e.pos.x, 0, P.pos.z - e.pos.z);
    const d = to.length() - 0.35;
    const fwd = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const at = P.pos.clone().setY(P.pos.y + 1.4);
    if (d > a.range || to.normalize().dot(fwd) < Math.cos((a.arc * Math.PI) / 180)) {
      g.audio.play('swing', e.pos, 0.7);
      return;
    }
    if (P.invulnerable) {
      const perfect = P.stateTime < PERFECT_DODGE;
      this.ui.splat(at, perfect ? 'Perfect dodge' : 'Dodged', 'word');
      if (perfect) {
        this.stamina = Math.min(MAX_STAMINA, this.stamina + 25);
        this.#slowMo(0.35, 0.3);
      }
      return;
    }
    const facing = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)).dot(to.clone().negate()) > 0.2;
    const roll = monsterMelee(e.def, a, g.state.skills, g.state.bonuses());
    if (P.state === 'block' && facing && !a.unblockable) {
      if (this.time - this.blockStart <= PARRY_WINDOW) {
        e.parried();
        this.riposteUntil = this.time + RIPOSTE_WINDOW;
        g.audio.play('parry', e.pos);
        this.ui.splat(at, 'Parry', 'word');
        this.#slowMo(0.3, 0.35);
        g.state.skills.add('defence', Math.max(1, roll.max) * XP_PER_DAMAGE);
        return;
      }
      const shield = !!g.state.equip.shield;
      const taken = Math.floor(roll.damage * (shield ? 0.1 : 0.3));
      if (!this.#spend(COST.block + roll.damage * 2)) {
        g.audio.play('block', P.pos);
        P.hurt(true, e.yaw);
        this.ui.splat(at, 'Guard broken', 'word');
        return this.#damagePlayer(roll.damage, at, e, true);
      }
      g.audio.play('block', P.pos);
      if (roll.damage > 0) g.state.skills.add('defence', Math.max(1, roll.damage - taken) * 2);
      if (taken > 0) this.#damagePlayer(taken, at, e, false, true);
      else this.ui.splat(at, '0', 'zero me');
      return;
    }
    if (!roll.hit) {
      g.audio.play('miss', P.pos);
      this.ui.splat(at, '0', 'zero me');
      return;
    }
    this.#damagePlayer(roll.damage, at, e, a.unblockable || (a.dmg ?? 1) >= 1.5);
  }

  #damagePlayer(dmg, at, e, heavy, blocked = false) {
    const g = this.game, P = g.player;
    g.state.hp = Math.max(0, g.state.hp - dmg);
    g.state.changed('hp');
    this.ui.splat(at, String(dmg), 'dmg me');
    this.ui.hurt();
    g.audio.play('hurt', P.pos);
    g.rig.shake = heavy ? 1 : 0.6;
    if (g.state.hp <= 0) return this.#die();
    if (!blocked) P.hurt(heavy, e.yaw);
  }

  #die() {
    const g = this.game, P = g.player;
    P.die();
    this.lock = null;
    this.ui.setDead(true);
    g.audio.play('death');
    g.stop();
    for (const e of this.enemies) if (e.engaged) {
      this.tokens.delete(e);
      e.engaged = false;
      if (e.alive) e.setState('return');
    }
    setTimeout(() => {
      P.spawn(SPAWN.x, SPAWN.z, SPAWN.facing);
      g.rig.yaw = SPAWN.facing + Math.PI;
      g.state.hp = g.state.maxHp;
      g.state.changed('hp');
      P.revive();
      this.stamina = MAX_STAMINA;
      this.ui.setDead(false);
      g.panels.message('You wake by the well in Ashford. Your pack is where you left it.', 'game');
    }, 3800);
  }

  #killed(e) {
    const g = this.game;
    if (this.lock === e) this.lock = null;
    this.tokens.delete(e);
    g.state.collection.kills ??= {};
    g.state.collection.kills[e.def.name] = (g.state.collection.kills[e.def.name] || 0) + 1;
    const drops = rollDrops(e.def.drops);
    drops.forEach(([id, n, rare], i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2;
      this.drop(id, n, e.pos.x + Math.cos(a) * 0.5, e.pos.z + Math.sin(a) * 0.5, rare);
    });
  }

  // ---------------------------------------------------------------- feel
  #hitStop(t) {
    this.game.slow(0.05, t);
  }

  #slowMo(scale, t) {
    this.game.slow(scale, t);
  }

  // A glint at the enemy's weapon hand when it winds up; red means dodge, don't block.
  #tell(e, a) {
    const g = this.game;
    this.tellTex ??= glintTexture();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tellTex, color: a.unblockable ? 0xff3a20 : 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    s.renderOrder = 10;
    const hand = e.char.bones.hand_r || e.char.bones.Head;
    this.tells ??= [];
    this.tells.push({ s, hand, t: 0, dur: Math.max(0.35, a.windup * 0.8) });
    g.scene.add(s);
    g.audio.play('tell', e.pos, a.unblockable ? 1.4 : 0.8);
  }

  #updateTells(dt) {
    if (!this.tells) return;
    for (const t of this.tells) {
      t.t += dt;
      t.hand.getWorldPosition(t.s.position);
      const k = t.t / t.dur;
      const size = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
      t.s.scale.setScalar(size);
      t.s.material.rotation = t.t * 3;
      if (k >= 1) {
        this.game.scene.remove(t.s);
        t.done = true;
      }
    }
    this.tells = this.tells.filter((t) => !t.done);
  }

  // ---------------------------------------------------------------- loot on the ground
  drop(id, n, x, z, rare = false) {
    const g = this.game, w = g.world;
    const y = w.groundAt(x, z, 1e4);
    const model = buildItem(id, g.assets);
    model.scale.setScalar(ITEMS[id].art?.kind === 'bow' ? 1.2 : 1.6);
    model.rotation.y = Math.random() * Math.PI * 2;
    model.position.set(x, y + 0.02, z);
    g.scene.add(model);
    const item = { id, n, x, y, z, model, t: 0, rare };
    if (rare) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 12, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(x, y + 6, z);
      g.scene.add(beam);
      item.beam = beam;
      g.audio.play('levelup', { x, z });
      g.panels.message(`A rare drop: ${ITEMS[id].name}!`, 'good');
    }
    this.ground.push(item);
    return item;
  }

  #updateGround(dt) {
    for (const it of this.ground) {
      it.t += dt;
      if (it.beam) it.beam.material.opacity = 0.25 + Math.sin(it.t * 3) * 0.1;
      if (it.t > 180) this.#removeGround(it);
    }
    this.ground = this.ground.filter((it) => !it.gone);
  }

  #removeGround(it) {
    this.game.scene.remove(it.model);
    if (it.beam) this.game.scene.remove(it.beam);
    it.gone = true;
  }

  groundTargets(x, z, r) {
    return this.ground.filter((it) => !it.gone && Math.hypot(it.x - x, it.z - z) < r).map((it) => ({ kind: 'item', item: it, x: it.x, y: it.y + 0.2, z: it.z, r: 0.45, h: 0.8, reach: 2.2 }));
  }

  take(it) {
    const g = this.game;
    if (!g.state.inv.room(it.id)) return g.panels.message('Your pack is too full to pick that up.', 'bad');
    g.state.inv.add(it.id, it.n);
    g.audio.play(it.id === 'coins' ? 'coins' : 'pickup', it);
    this.#removeGround(it);
    this.ground = this.ground.filter((x) => !x.gone);
  }

  // ---------------------------------------------------------------- stamina bar
  #staminaBar() {
    const v = document.querySelector('.vitals');
    const el = document.createElement('div');
    el.className = 'vital sta';
    el.innerHTML = '<i></i><span><b>Stamina</b></span>';
    v.append(el);
    this.staEl = el.querySelector('i');
  }

  #drawStamina() {
    const w = `${(this.stamina / MAX_STAMINA) * 100}%`;
    if (this.staEl.style.width !== w) this.staEl.style.width = w;
  }
}

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [w, h] of [[2.5, 30], [30, 2.5]]) g.fillRect(32 - w, 32 - h, w * 2, h * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
