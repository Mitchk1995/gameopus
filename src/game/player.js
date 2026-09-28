import * as THREE from 'three';
import { computeStats } from './stats.js';
import { angleDiff, damp, clamp } from '../core/rng.js';
import { SKILLS, SKILL_BY_ID } from '../content/skills.js';
import { createKit } from '../art/kit.js';
import { buildItemModel, bake, disposeModel, cowl } from '../art/items3d.js';

export const xpForLevel = (L) => Math.floor(70 * Math.pow(1.34, L - 1) + 30 * L);

// A jointed hero: pelvis > spine > chest > neck > head, hips > knees > ankles,
// shoulders > elbows > hands. Animated procedurally every frame in #animate.
function buildModel(kit) {
  const root = new THREE.Group();
  root.scale.setScalar(1.08);
  const mats = {
    armor: kit.metal('steel'),
    dark: kit.metal('iron'),
    trim: kit.metal('bronze'),
    cloth: kit.cloth(0x44120e),
    leather: kit.leather(0x4a2c1a),
  };
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.5, 4.5) });
  const J = (parent, x, y, z, order) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (order) g.rotation.order = order;
    parent.add(g);
    return g;
  };
  const M = (parent, geo, mat, x = 0, y = 0, z = 0, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.r) m.rotation.set(...o.r);
    if (o.s) m.scale.set(...o.s);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 12);
  const dome = (r) => new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);

  const body = J(root, 0, 0, 0);
  const pelvis = J(body, 0, 0.92, 0);

  const legs = [];
  for (const side of [1, -1]) {
    const hip = J(pelvis, side * 0.13, -0.02, 0);
    M(hip, cap(0.1, 0.24), mats.dark, 0, -0.2, 0);
    const knee = J(hip, 0, -0.42, 0);
    M(knee, dome(0.075), mats.armor, 0, 0.0, 0.06, { r: [Math.PI / 2 + 0.3, 0, 0] });
    M(knee, cap(0.085, 0.22), mats.armor, 0, -0.19, 0);
    const ankle = J(knee, 0, -0.4, 0);
    const boot = M(ankle, new THREE.SphereGeometry(0.11, 16, 12), mats.leather, 0, -0.03, 0.05, { s: [0.9, 0.6, 1.5] });
    legs.push({ hip, knee, ankle, boot });
  }
  M(pelvis, new THREE.TorusGeometry(0.26, 0.045, 8, 22), mats.leather, 0, 0.02, 0, { r: [Math.PI / 2, 0, 0], s: [1.05, 0.8, 1] });
  M(pelvis, new THREE.BoxGeometry(0.09, 0.07, 0.03), mats.trim, 0, 0.02, 0.22);
  M(pelvis, new THREE.BoxGeometry(0.1, 0.11, 0.07), mats.leather, 0.2, -0.04, 0.12, { r: [0, -0.5, 0] });
  const tabF = J(pelvis, 0, -0.02, 0.2);
  M(tabF, new THREE.PlaneGeometry(0.24, 0.42), mats.cloth, 0, -0.21, 0);
  const tabB = J(pelvis, 0, -0.02, -0.19);
  M(tabB, new THREE.PlaneGeometry(0.24, 0.42), mats.cloth, 0, -0.21, 0, { r: [0, Math.PI, 0] });

  const spine = J(pelvis, 0, 0.06, 0, 'YXZ');
  const chest = J(spine, 0, 0.28, 0, 'YXZ');
  const torso = M(chest, cap(0.26, 0.28), kit.chain(), 0, -0.02, 0, { s: [1.05, 1, 0.78] });
  const plate = M(chest, new THREE.SphereGeometry(0.3, 22, 14, 0, Math.PI, 0.35, Math.PI * 0.5), mats.armor, 0, 0.0, 0.02, { s: [1, 1.15, 0.72] });
  for (const side of [1, -1]) {
    M(chest, dome(0.2), mats.armor, side * 0.36, 0.2, 0, { r: [0, 0, -side * 0.45], s: [1.1, 0.9, 1] });
    M(chest, dome(0.17), mats.armor, side * 0.41, 0.12, 0, { r: [0, 0, -side * 0.75], s: [1.05, 0.85, 0.95] });
    M(chest, new THREE.TorusGeometry(0.19, 0.015, 6, 20), mats.trim, side * 0.37, 0.19, 0, { r: [Math.PI / 2, -side * 0.45, 0] });
  }

  const neck = J(chest, 0, 0.3, 0, 'YXZ');
  const head = J(neck, 0, 0.14, 0.02, 'YXZ');
  const hood = new THREE.Group();
  head.add(hood);
  const cowlModel = bake(cowl(kit, mats.cloth, kit.cloth(0x2a0c0a)));
  cowlModel.scale.setScalar(0.74);
  cowlModel.position.set(0, -0.03, 0.0);
  hood.add(cowlModel);
  M(head, new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: 0x020203 }), 0, -0.03, 0.04);
  M(head, new THREE.SphereGeometry(0.028, 6, 4), eyeMat, 0.06, -0.01, 0.18);
  M(head, new THREE.SphereGeometry(0.028, 6, 4), eyeMat, -0.06, -0.01, 0.18);
  const helmMount = J(head, 0, 0.0, -0.02);

  const capeGeo = new THREE.PlaneGeometry(0.62, 1.2, 4, 10);
  capeGeo.translate(0, -0.6, 0);
  const cape = M(chest, capeGeo, mats.cloth, 0, 0.24, -0.2);
  const capeBase = Float32Array.from(capeGeo.attributes.position.array);

  // arms[0] = left (+x, casting hand), arms[1] = right (-x, sword hand)
  const arms = [];
  for (const side of [1, -1]) {
    const shoulder = J(chest, side * 0.37, 0.16, 0, 'YXZ');
    M(shoulder, cap(0.075, 0.16), mats.dark, 0, -0.13, 0);
    const elbow = J(shoulder, 0, -0.3, 0, 'YXZ');
    M(elbow, new THREE.CylinderGeometry(0.082, 0.07, 0.2, 12), mats.armor, 0, -0.11, 0);
    const hand = J(elbow, 0, -0.26, 0, 'YXZ');
    M(hand, new THREE.SphereGeometry(0.065, 12, 10), mats.leather, 0, 0, 0, { s: [1, 1.15, 1] });
    arms.push({ shoulder, elbow, hand });
  }
  const weaponMount = J(arms[1].hand, 0, 0, 0.02);
  weaponMount.rotation.x = Math.PI / 2; // item models point +y; this makes the blade point out of the fist
  const handGlow = M(arms[0].hand, new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 5) }), 0, -0.03, 0.04);
  handGlow.visible = false;

  return { root, body, pelvis, spine, chest, neck, head, legs, arms, weaponMount, hood, helmMount, cape, capeBase, tabF, tabB, handGlow, mats, torso, plate, boots: legs.map((l) => l.boot) };
}

export class Player {
  constructor(game) {
    this.game = game;
    this.kit = createKit(game.gfx.env, { roughAdd: 0.2, metalTint: 0.62 });
    this.model = buildModel(this.kit);
    game.scene.add(this.model.root);
    this.radius = 0.45;
    this.level = game.save.level;
    this.xp = game.save.xp;
    this.recompute();
    this.reset();
  }

  reset() {
    this.x = 0; this.z = 0; this.kx = 0; this.kz = 0;
    this.facing = 0;
    this.life = this.stats.life;
    this.mana = this.stats.mana;
    this.dead = false;
    this.invuln = 1;
    this.dashT = 0; this.dashCd = 0; this.novaCd = 0; this.boltCd = 0; this.potionCd = 0;
    this.attackT = -1;
    this.swingDir = 1;
    this.castT = 0;
    this.walk = 0;
    this.speedNow = 0;
    this.hurtT = 0;
    this.novaT = 0;
    this.deathT = 0;
    this.phase = 0;
    this.moveTarget = null;
    this.model.root.visible = true;
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
  }

  recompute() {
    const eq = this.game.save.equipment;
    const oldLife = this.stats?.life;
    this.stats = computeStats(this.level, eq);
    if (oldLife) this.life = Math.min(this.stats.life, this.life + Math.max(0, this.stats.life - oldLife));
    this.mana = Math.min(this.mana ?? this.stats.mana, this.stats.mana);
    this.#dressGear(eq);
    const el = this.dominantElement();
    this.slashColor = { physical: [1.7, 1.55, 1.4], fire: [3.6, 1.3, 0.25], cold: [0.8, 1.9, 3.6], lightning: [1.9, 2.0, 4.3] }[el];
    this.game.powers.rebuild(eq);
  }

  // Show equipped gear on the character: the real weapon and helm models, armor tinted by chest.
  #dressGear(eq) {
    const m = this.model;
    const key = (it) => (it ? `${it.uid}` : '-');
    const sig = `${key(eq.weapon)}|${key(eq.helm)}|${key(eq.chest)}|${key(eq.boots)}`;
    if (sig === this.gearSig) return;
    this.gearSig = sig;
    for (const holder of [m.weaponMount, m.helmMount]) {
      for (const c of [...holder.children]) { holder.remove(c); disposeModel(c); }
    }
    const weapon = eq.weapon || { slot: 'weapon', base: 'Rusted Blade', rarity: 'magic', uid: 'fists', affixes: [] };
    const w = bake(buildItemModel(weapon, this.kit));
    w.position.y = 0.17; // grip in the fist
    w.scale.setScalar(1.0);
    m.weaponMount.add(w);
    // A crown is worn over the hood; every other helm replaces it.
    const crown = eq.helm?.base === 'Crown of Thorns' && !eq.helm.uniqueId;
    m.hood.visible = !eq.helm || crown;
    if (eq.helm) {
      const h = bake(buildItemModel(eq.helm, this.kit));
      h.scale.setScalar(crown ? 0.84 : 0.74);
      h.position.set(0, crown ? 0.15 : -0.03, crown ? -0.02 : 0.01);
      m.helmMount.add(h);
    }
    const k = this.kit;
    const tier = (it, list) => (it ? Math.max(0, list.indexOf(it.base)) : -1);
    const ct = tier(eq.chest, ['Padded Tunic', 'Chainmail', 'Scale Hauberk', 'Wardplate', 'Reliquary Plate', 'Starless Cuirass']);
    const plateMat = [k.cloth(0x8a7654), k.metal('steel'), k.metal('bronze'), k.metal('steel'), k.metal('gold'), k.metal('void')][ct] || k.metal('steel');
    m.plate.material = plateMat;
    m.torso.material = ct === 0 ? k.cloth(0x6a5a40) : ct === 5 ? k.metal('void') : k.chain();
    const bt = tier(eq.boots, ['Sandals', 'Leather Boots', 'Greaves', 'Ashwalkers', 'Tomb Sabatons', 'Voidtreads']);
    const bootMat = [k.leather(0x7a5436), k.leather(0x5a3a22), k.metal('steel'), k.leather(0x1c1614), k.metal('steel'), k.metal('void')][bt] || m.mats.leather;
    for (const b of m.boots) b.material = bootMat;
  }

  dominantElement() {
    const s = this.stats;
    const phys = (s.dmgMin + s.dmgMax) / 2 + s.flatDmg;
    const m = Math.max(s.fireDmg, s.coldDmg, s.lightningDmg);
    if (m < phys * 0.35) return 'physical';
    return m === s.fireDmg ? 'fire' : m === s.coldDmg ? 'cold' : 'lightning';
  }

  heal(v) {
    if (!this.dead) this.life = Math.min(this.stats.life, this.life + v);
  }

  gainXp(v) {
    const g = this.game;
    this.xp += v;
    let leveled = false;
    const before = this.level;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      leveled = true;
    }
    if (leveled) {
      this.recompute();
      this.life = this.stats.life;
      this.mana = this.stats.mana;
      g.audio.play('levelUp');
      const learned = SKILLS.find((s) => s.level > before && s.level <= this.level);
      if (learned) {
        g.hud.announce(learned.name, `New skill · ${learned.desc}`, 'level');
        g.hud.toast(`<b>${learned.name}</b> learned — ${learned.desc}`, 'discover');
      } else g.hud.announce(`Level ${this.level}`, 'Your strength grows', 'level');
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
        g.particles.spawn(this.x + Math.cos(a) * r, Math.random() * 0.5, this.z + Math.sin(a) * r, 0, 3 + Math.random() * 5, 0, 1.2, 0.4, 4, 3.2, 1.2, 0, 1.5);
      }
    }
    g.save.level = this.level;
    g.save.xp = this.xp;
  }

  can(id) {
    return this.level >= SKILL_BY_ID[id].level;
  }

  #lockedHint(id) {
    const g = this.game;
    if (g.time - (this.hintT ?? -9) < 2) return;
    this.hintT = g.time;
    const s = SKILL_BY_ID[id];
    g.hud.toast(`${s.name} unlocks at level ${s.level}`, 'warn');
  }

  aimAngle() {
    return Math.atan2(this.game.aim.x - this.x, this.game.aim.z - this.z);
  }

  update(dt) {
    const g = this.game, inp = g.input, s = this.stats;
    if (this.dead) {
      this.deathT = (this.deathT || 0) + dt;
      this.speedNow = 0;
      this.#animate(dt);
      return;
    }
    this.invuln -= dt; this.dashCd -= dt; this.novaCd -= dt; this.boltCd -= dt; this.potionCd -= dt; this.castT -= dt; this.hurtT -= dt;

    // Movement input (screen-up is world -z).
    let mx = 0, mz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) mz -= 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) mz += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
    if (mx || mz) this.moveTarget = null;
    else if (this.moveTarget) {
      const dx = this.moveTarget.x - this.x, dz = this.moveTarget.z - this.z;
      if (dx * dx + dz * dz < 0.2) this.moveTarget = null;
      else { mx = dx; mz = dz; }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    // Skills.
    if (inp.hit('KeyQ') && !this.can('nova')) this.#lockedHint('nova');
    if (inp.mouse.right && !this.can('bolt')) this.#lockedHint('bolt');
    if (inp.hit('Space') && this.dashCd <= 0) {
      const a = ml > 0 ? Math.atan2(mx, mz) : this.aimAngle();
      this.dashDir = [Math.sin(a), Math.cos(a)];
      this.dashT = 0.17;
      this.invuln = 0.3;
      this.dashCd = 1.6 * s.cdrMult;
      this.facing = a;
      g.audio.play('dash');
      g.powers.emit('dash', { x: this.x, z: this.z });
    }
    if (inp.hit('KeyQ') && this.can('nova') && this.novaCd <= 0 && this.mana >= 25) {
      this.mana -= 25;
      this.novaCd = 9 * s.cdrMult;
      g.actions.nova(this.x, this.z, 6 * s.areaMult, 1.3, 'cold', { chill: 2.5, frost: true });
      this.novaT = 0.5;
      g.audio.play('nova');
      g.shake(0.2);
      g.powers.emit('nova', { x: this.x, z: this.z });
    }
    if (inp.hit('KeyR') && this.potionCd <= 0 && this.life < s.life) {
      this.potionCd = 15;
      this.heal(s.life * 0.4);
      g.audio.play('potion');
      for (let i = 0; i < 40; i++) g.particles.spawn(this.x + (Math.random() - 0.5), Math.random() * 2, this.z + (Math.random() - 0.5), 0, 2 + Math.random() * 2, 0, 0.8, 0.35, 5, 0.6, 0.6, 0, 1);
    }
    if (inp.mouse.right && this.can('bolt') && this.boltCd <= 0 && this.mana >= 8 && this.dashT <= 0) {
      this.mana -= 8;
      this.boltCd = 0.34 / (1 + s.atkSpd / 100);
      this.castT = 0.2;
      const a = this.aimAngle();
      this.facing = a;
      const n = 1 + s.extraBolts;
      for (let i = 0; i < n; i++) g.projectiles.bolt(this.x, this.z, a + (i - (n - 1) / 2) * 0.16);
      g.audio.play('bolt');
    }
    if (inp.mouse.left && this.attackT < 0 && this.dashT <= 0) {
      this.attackT = 0;
      this.attackDur = 1 / s.attacksPerSec;
      this.hitDone = false;
      this.swingDir *= -1;
      this.attackAngle = this.aimAngle();
      this.moveTarget = null;
    }
    if (this.attackT >= 0) {
      this.attackT += dt / this.attackDur;
      this.facing = this.attackAngle;
      if (!this.hitDone && this.attackT > 0.3) {
        this.hitDone = true;
        this.#cleave();
      }
      if (this.attackT >= 1) this.attackT = -1;
    }

    // Integrate.
    let vx, vz;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const sp = 38 * (s.moveSpeed / 6.8);
      vx = this.dashDir[0] * sp; vz = this.dashDir[1] * sp;
      for (let i = 0; i < 4; i++) g.particles.spawn(this.x + (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 1.4, this.z + (Math.random() - 0.5) * 0.5, 0, 0.3, 0, 0.35, 0.5, 1.2, 1.6, 3.5, 0, 2, 0.1);
    } else {
      const slow = this.attackT >= 0 ? 0.6 : 1;
      vx = mx * s.moveSpeed * slow; vz = mz * s.moveSpeed * slow;
      if (ml > 0 && this.attackT < 0 && this.castT <= 0) this.facing = Math.atan2(mx, mz);
      if (this.castT > 0) this.facing = this.aimAngle();
    }
    this.x += (vx + this.kx) * dt;
    this.z += (vz + this.kz) * dt;
    const kd = Math.exp(-6 * dt);
    this.kx *= kd; this.kz *= kd;
    g.world.collide(this, this.radius);
    this.speedNow = Math.hypot(vx, vz);

    this.life = Math.min(s.life, this.life + s.lifeRegen * dt);
    this.mana = Math.min(s.mana, this.mana + s.manaRegen * dt);

    this.#animate(dt);
  }

  #cleave() {
    const g = this.game, s = this.stats;
    const ev = { angle: this.attackAngle, areaMult: s.areaMult, forceCrit: false, dmgMult: 1, thunderclap: false };
    g.powers.emit('swing', ev);
    const range = 2.6 * ev.areaMult;
    const half = 1.0;
    g.fx.slash(this.x, this.z, ev.angle, range, ev.thunderclap ? [3, 3.2, 7] : this.slashColor, this.swingDir);
    g.audio.play('swing');
    let hits = 0, crit = false;
    for (const e of g.enemies.near(this.x, this.z, range)) {
      const dx = e.x - this.x, dz = e.z - this.z;
      const d = Math.hypot(dx, dz);
      const slack = Math.atan2(e.radius, Math.max(d, 0.01));
      if (d > e.radius + 0.6 && Math.abs(angleDiff(Math.atan2(dx, dz), ev.angle)) > half + slack) continue;
      const before = e.hp;
      g.combat.playerHit(e, ev.dmgMult, { kind: 'melee', forceCrit: ev.forceCrit, knock: 2 });
      hits++;
      if (e.lastCrit && before !== e.hp) crit = true;
    }
    if (hits) {
      g.audio.play('hit', { crit });
      g.shake(crit ? 0.14 : 0.07);
    }
    g.powers.emit('attack', ev);
  }

  // Cheap cloth: bend the cape back with speed and ripple it along its length.
  #cloth(dt) {
    const m = this.model, t = this.game.time;
    const pos = m.cape.geometry.attributes.position, base = m.capeBase;
    this.capeLift = damp(this.capeLift ?? 0, Math.min(1, this.speedNow / 7) + (this.dashT > 0 ? 0.8 : 0), 5, dt);
    const lift = this.capeLift;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const d = -y / 1.2; // 0 at the shoulders, 1 at the hem
      const wave = Math.sin(t * (4 + lift * 6) - d * 5 + x * 3) * (0.03 + lift * 0.05) * d;
      pos.setXYZ(i, x * (1 + d * 0.25), y + lift * d * d * 0.35, -d * d * (0.12 + lift * 0.55) - wave);
    }
    pos.needsUpdate = true;
    m.cape.geometry.computeVertexNormals();
  }

  // Title screen: idle animation only.
  idle(dt) {
    this.speedNow = 0;
    this.#animate(dt);
  }

  #animate(dt) {
    const m = this.model, g = this.game, t = g.time;
    m.root.position.set(this.x, 0, this.z);
    let rot = m.root.rotation.y;
    rot += angleDiff(this.facing, rot) * (1 - Math.exp(-18 * dt));
    m.root.rotation.y = rot;
    this.novaT = Math.max(0, (this.novaT || 0) - dt);

    // Locomotion phase advances with distance so feet don't slide.
    const amp = clamp(this.speedNow / 6.8, 0, 1);
    this.phase = (this.phase || 0) + this.speedNow * dt * ((Math.PI * 2) / 2.1);
    const ph = this.phase;
    const P = {
      pelvisY: 0.92 + 0.035 * amp * Math.cos(2 * ph) + (amp < 0.1 ? Math.sin(t * 2.2) * 0.006 : 0),
      pelvisYaw: Math.sin(ph) * 0.12 * amp,
      pelvisZ: 0,
      spineX: 0.1 * amp + Math.sin(t * 2.2) * 0.012 * (1 - amp),
      spineYaw: -Math.sin(ph) * 0.16 * amp,
      headYaw: (1 - amp) * Math.sin(t * 0.35) * 0.3,
      headX: 0,
      hip: [-Math.sin(ph) * 0.6 * amp, Math.sin(ph) * 0.6 * amp],
      knee: [0.08 + Math.pow(Math.max(0, Math.cos(ph)), 1.3) * 1.0 * amp, 0.08 + Math.pow(Math.max(0, -Math.cos(ph)), 1.3) * 1.0 * amp],
      sh: [[Math.sin(ph) * 0.5 * amp + 0.05, 0, 0.1], [-Math.sin(ph) * 0.3 * amp - 0.15, 0, -0.12]],
      el: [-0.25 - amp * 0.3, -0.45],
      wr: [0, 0.95],
    };

    // Sword swing: wind-up, whip through, recover.
    if (this.attackT >= 0) {
      const k = this.attackT, d = this.swingDir;
      const ease = (x) => 1 - Math.pow(1 - x, 3);
      let yaw, pitch, elbow, wrist, twist;
      if (k < 0.3) {
        const e = ease(k / 0.3);
        yaw = 1.55 * d * e; pitch = -0.2 - 1.1 * e; elbow = -0.45 - 0.5 * e; wrist = 0.45 + 0.5 * e; twist = 0.4 * d * e;
      } else if (k < 0.52) {
        const e = ease((k - 0.3) / 0.22);
        yaw = 1.55 * d + (-1.45 * d - 1.55 * d) * e; pitch = -1.3 - 0.2 * e; elbow = -0.95 + 0.9 * e; wrist = 0.95 + 0.55 * e; twist = 0.4 * d - 0.85 * d * e;
        P.pelvisZ = 0.12 * e;
      } else {
        const e = ease((k - 0.52) / 0.48);
        yaw = -1.45 * d * (1 - e); pitch = -1.5 + 1.35 * e; elbow = -0.05 - 0.4 * e; wrist = 1.5 - 1.05 * e; twist = -0.45 * d * (1 - e);
        P.pelvisZ = 0.12 * (1 - e);
      }
      P.sh[1] = [pitch, yaw, -0.1];
      P.el[1] = elbow;
      P.wr[1] = wrist;
      P.spineYaw += twist;
      P.pelvisY -= 0.04;
    }
    // Casting: left arm thrusts toward the aim point.
    if (this.castT > 0) {
      P.sh[0] = [-1.45, -0.15, 0.1];
      P.el[0] = -0.05;
      P.spineYaw += 0.15;
    }
    // Frost nova: crouch, arms flung wide.
    if (this.novaT > 0) {
      const k = this.novaT / 0.5;
      P.sh[0] = [-0.3, 0, 1.3 * k];
      P.sh[1] = [-0.3, 0, -1.3 * k];
      P.el[0] = P.el[1] = -0.1;
      P.pelvisY -= 0.16 * k;
      P.spineX -= 0.2 * k;
    }
    // Dash: tuck and lean.
    if (this.dashT > 0) {
      P.spineX = 0.55;
      P.hip = [-0.7, 0.3];
      P.knee = [1.2, 0.9];
      P.sh[0][0] = 0.7;
      P.sh[1] = [0.7, 0, -0.2];
    }
    // Flinch when struck.
    if (this.hurtT > 0) {
      const k = this.hurtT / 0.25;
      P.spineX -= 0.3 * k;
      P.headX -= 0.25 * k;
    }
    // Death: knees buckle, then the body pitches forward.
    let bodyPitch = 0, bodyDrop = 0;
    if (this.dead) {
      const d = this.deathT || 0;
      const kneel = clamp(d / 0.45, 0, 1);
      const fall = clamp((d - 0.45) / 0.55, 0, 1);
      P.hip = [-1.4 * kneel, -1.1 * kneel];
      P.knee = [1.9 * kneel, 1.6 * kneel];
      P.pelvisY = 0.92 - 0.45 * kneel;
      P.spineX = 0.35 * kneel;
      P.sh = [[0.2, 0, 0.3], [0.2, 0, -0.3]];
      bodyPitch = fall * fall * 1.35;
      bodyDrop = fall * 0.12;
    }

    // Apply with smoothing (fast for the sword arm so swings stay snappy).
    const S = (cur, target, rate) => damp(cur, target, rate, dt);
    const fast = this.attackT >= 0 ? 40 : 14;
    m.pelvis.position.y = S(m.pelvis.position.y, P.pelvisY, 16);
    m.pelvis.position.z = S(m.pelvis.position.z, P.pelvisZ, 16);
    m.pelvis.rotation.y = S(m.pelvis.rotation.y, P.pelvisYaw, 12);
    m.spine.rotation.x = S(m.spine.rotation.x, P.spineX, 12);
    m.spine.rotation.y = S(m.spine.rotation.y, P.spineYaw, fast);
    m.head.rotation.y = S(m.head.rotation.y, P.headYaw, 5);
    m.head.rotation.x = S(m.head.rotation.x, P.headX, 12);
    m.chest.scale.y = 1 + Math.sin(t * 2.2) * 0.012 * (1 - amp);
    for (let i = 0; i < 2; i++) {
      const L = m.legs[i];
      L.hip.rotation.x = S(L.hip.rotation.x, P.hip[i], 20);
      L.knee.rotation.x = S(L.knee.rotation.x, P.knee[i], 20);
      L.ankle.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.6;
      const A = m.arms[i], sh = P.sh[i];
      const rate = i === 1 ? fast : 16;
      A.shoulder.rotation.x = S(A.shoulder.rotation.x, sh[0], rate);
      A.shoulder.rotation.y = S(A.shoulder.rotation.y, sh[1], rate);
      A.shoulder.rotation.z = S(A.shoulder.rotation.z, sh[2], rate);
      A.elbow.rotation.x = S(A.elbow.rotation.x, P.el[i], rate);
      A.hand.rotation.x = S(A.hand.rotation.x, P.wr[i], rate);
    }
    m.body.rotation.x = S(m.body.rotation.x, bodyPitch, 10);
    m.body.position.y = S(m.body.position.y, -bodyDrop, 10);
    // Tabard panels trail the legs.
    m.tabF.rotation.x = Math.min(0, m.legs[0].hip.rotation.x, m.legs[1].hip.rotation.x) * 0.7 - amp * 0.1;
    m.tabB.rotation.x = Math.max(0, m.legs[0].hip.rotation.x, m.legs[1].hip.rotation.x) * 0.7 + amp * 0.15;

    m.handGlow.visible = this.castT > 0;
    this.#cloth(dt);

    const flick = this.hurtT > 0 && Math.sin(t * 60) > 0;
    m.body.visible = !flick;

    const torch = g.world.torch;
    torch.position.set(this.x, 4.6, this.z + 0.9);
    torch.intensity = 80 + Math.sin(t * 11) * 5 + Math.sin(t * 17.3) * 3.5;
  }
}
