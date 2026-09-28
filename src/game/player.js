import * as THREE from 'three';
import { computeStats } from './stats.js';
import { RARITY } from '../content/bases.js';
import { angleDiff, damp, clamp } from '../core/rng.js';

export const xpForLevel = (L) => Math.floor(45 * Math.pow(1.3, L - 1) + 25 * L);

function buildModel(env) {
  const root = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x4a4e5a, metalness: 0.75, roughness: 0.38, envMap: env, envMapIntensity: 0.9 });
  const armorDark = new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.6, roughness: 0.5, envMap: env, envMapIntensity: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5c1a17, roughness: 0.9, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.5, 4.5) });
  const M = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  const body = new THREE.Group();
  root.add(body);

  const legs = [];
  for (const side of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.15, 0.82, 0);
    const leg = M(new THREE.CapsuleGeometry(0.11, 0.52, 3, 8), armorDark, 0, -0.38, 0);
    const boot = M(new THREE.BoxGeometry(0.2, 0.14, 0.32), leather, 0, -0.76, 0.05);
    hip.add(leg, boot);
    body.add(hip);
    legs.push(hip);
  }
  const torso = M(new THREE.CapsuleGeometry(0.28, 0.42, 4, 12), armor, 0, 1.18, 0);
  torso.scale.set(1.05, 1, 0.78);
  const belt = M(new THREE.TorusGeometry(0.27, 0.05, 6, 16), leather, 0, 0.92, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.05, 0.8, 1);
  const shoulderL = M(new THREE.SphereGeometry(0.2, 12, 8), armor, 0.36, 1.45, 0);
  const shoulderR = M(new THREE.SphereGeometry(0.2, 12, 8), armor, -0.36, 1.45, 0);
  shoulderL.scale.set(1.1, 0.75, 1);
  shoulderR.scale.set(1.1, 0.75, 1);
  const hood = M(new THREE.ConeGeometry(0.26, 0.6, 10), cloth, 0, 1.86, -0.03);
  const face = M(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0x020203 }), 0, 1.7, 0.07);
  const eyes = [M(new THREE.SphereGeometry(0.03, 6, 4), eyeMat, 0.06, 1.72, 0.22), M(new THREE.SphereGeometry(0.03, 6, 4), eyeMat, -0.06, 1.72, 0.22)];
  const cloak = M(new THREE.CylinderGeometry(0.3, 0.56, 1.25, 12, 3, true, Math.PI * 0.55, Math.PI * 0.9), cloth, 0, 1.0, -0.02);
  const cloakPivot = new THREE.Group();
  cloakPivot.position.set(0, 1.55, 0);
  cloak.position.set(0, -0.6, 0);
  cloakPivot.add(cloak);
  body.add(torso, belt, shoulderL, shoulderR, hood, face, ...eyes, cloakPivot);

  // Sword arm (character's right = -x when facing +z).
  const armR = new THREE.Group();
  armR.position.set(-0.38, 1.4, 0);
  armR.rotation.order = 'YXZ';
  armR.add(M(new THREE.CapsuleGeometry(0.085, 0.42, 3, 8), armor, 0, -0.3, 0));
  const sword = new THREE.Group();
  sword.position.set(0, -0.6, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb0b6c0, metalness: 0.95, roughness: 0.18, envMap: env, envMapIntensity: 1.2 });
  const runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.6) });
  const blade = M(new THREE.BoxGeometry(0.09, 1.15, 0.025), bladeMat, 0, -0.72, 0);
  const rune = M(new THREE.BoxGeometry(0.022, 0.95, 0.03), runeMat, 0, -0.68, 0);
  const guard = M(new THREE.BoxGeometry(0.32, 0.06, 0.08), armorDark, 0, -0.12, 0);
  const grip = M(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), leather, 0, 0, 0);
  const pommel = M(new THREE.SphereGeometry(0.05, 8, 6), armor, 0, 0.12, 0);
  sword.add(blade, rune, guard, grip, pommel);
  armR.add(sword);

  const armL = new THREE.Group();
  armL.position.set(0.38, 1.4, 0);
  armL.rotation.order = 'YXZ';
  armL.add(M(new THREE.CapsuleGeometry(0.085, 0.42, 3, 8), armor, 0, -0.3, 0));
  const handGlow = M(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 5) }), 0, -0.62, 0);
  handGlow.visible = false;
  armL.add(handGlow);
  body.add(armR, armL);

  return { root, body, legs, armR, armL, sword, runeMat, cloakPivot, handGlow };
}

export class Player {
  constructor(game) {
    this.game = game;
    this.model = buildModel(game.gfx.env);
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
    this.moveTarget = null;
    this.model.root.visible = true;
  }

  recompute() {
    const eq = this.game.save.equipment;
    const oldLife = this.stats?.life;
    this.stats = computeStats(this.level, eq);
    if (oldLife) this.life = Math.min(this.stats.life, this.life + Math.max(0, this.stats.life - oldLife));
    this.mana = Math.min(this.mana ?? this.stats.mana, this.stats.mana);
    const w = eq.weapon;
    const c = w ? RARITY[w.rarity].hdr : [1.5, 1.5, 1.6];
    this.model.runeMat.color.setRGB(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
    const el = this.dominantElement();
    this.slashColor = { physical: [1.7, 1.55, 1.4], fire: [3.6, 1.3, 0.25], cold: [0.8, 1.9, 3.6], lightning: [1.9, 2.0, 4.3] }[el];
    this.game.powers.rebuild(eq);
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
      g.hud.announce(`Level ${this.level}`, 'Your strength grows', 'level');
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
        g.particles.spawn(this.x + Math.cos(a) * r, Math.random() * 0.5, this.z + Math.sin(a) * r, 0, 3 + Math.random() * 5, 0, 1.2, 0.4, 4, 3.2, 1.2, 0, 1.5);
      }
    }
    g.save.level = this.level;
    g.save.xp = this.xp;
  }

  aimAngle() {
    return Math.atan2(this.game.aim.x - this.x, this.game.aim.z - this.z);
  }

  update(dt) {
    const g = this.game, inp = g.input, s = this.stats;
    if (this.dead) {
      this.model.body.rotation.x = damp(this.model.body.rotation.x, -Math.PI / 2, 6, dt);
      this.model.body.position.y = damp(this.model.body.position.y, 0.2, 6, dt);
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
    if (inp.hit('Space') && this.dashCd <= 0) {
      const a = ml > 0 ? Math.atan2(mx, mz) : this.aimAngle();
      this.dashDir = [Math.sin(a), Math.cos(a)];
      this.dashT = 0.17;
      this.invuln = 0.3;
      this.dashCd = 1.3 * s.cdrMult;
      this.facing = a;
      g.audio.play('dash');
      g.powers.emit('dash', { x: this.x, z: this.z });
    }
    if (inp.hit('KeyQ') && this.novaCd <= 0 && this.mana >= 16) {
      this.mana -= 16;
      this.novaCd = 6 * s.cdrMult;
      g.actions.nova(this.x, this.z, 6 * s.areaMult, 1.3, 'cold', { chill: 2.5, frost: true });
      g.audio.play('nova');
      g.shake(0.2);
      g.powers.emit('nova', { x: this.x, z: this.z });
    }
    if (inp.hit('KeyR') && this.potionCd <= 0 && this.life < s.life) {
      this.potionCd = 12;
      this.heal(s.life * 0.45);
      g.audio.play('potion');
      for (let i = 0; i < 40; i++) g.particles.spawn(this.x + (Math.random() - 0.5), Math.random() * 2, this.z + (Math.random() - 0.5), 0, 2 + Math.random() * 2, 0, 0.8, 0.35, 5, 0.6, 0.6, 0, 1);
    }
    if (inp.mouse.right && this.boltCd <= 0 && this.mana >= 5 && this.dashT <= 0) {
      this.mana -= 5;
      this.boltCd = 0.3 / (1 + s.atkSpd / 100);
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
    const range = 2.8 * ev.areaMult;
    const half = 1.15;
    g.fx.slash(this.x, this.z, ev.angle, range, ev.thunderclap ? [3, 3.2, 7] : this.slashColor, this.swingDir);
    g.audio.play('swing');
    let hits = 0, crit = false;
    for (const e of g.enemies.near(this.x, this.z, range)) {
      const dx = e.x - this.x, dz = e.z - this.z;
      const d = Math.hypot(dx, dz);
      const slack = Math.atan2(e.radius, Math.max(d, 0.01));
      if (d > e.radius + 0.6 && Math.abs(angleDiff(Math.atan2(dx, dz), ev.angle)) > half + slack) continue;
      const before = e.hp;
      g.combat.playerHit(e, ev.dmgMult, { kind: 'melee', forceCrit: ev.forceCrit, knock: 3.5 });
      hits++;
      if (e.lastCrit && before !== e.hp) crit = true;
    }
    if (hits) {
      g.audio.play('hit', { crit });
      g.shake(crit ? 0.14 : 0.07);
    }
    g.powers.emit('attack', ev);
  }

  #animate(dt) {
    const m = this.model, t = this.game.time;
    m.root.position.set(this.x, 0, this.z);
    let rot = m.root.rotation.y;
    rot += angleDiff(this.facing, rot) * (1 - Math.exp(-18 * dt));
    m.root.rotation.y = rot;

    const moving = this.speedNow > 0.5;
    this.walk += dt * this.speedNow * 1.6;
    const sw = moving ? Math.sin(this.walk) : 0;
    m.legs[0].rotation.x = damp(m.legs[0].rotation.x, sw * 0.75, 20, dt);
    m.legs[1].rotation.x = damp(m.legs[1].rotation.x, -sw * 0.75, 20, dt);
    m.body.position.y = moving ? Math.abs(Math.cos(this.walk)) * 0.06 : Math.sin(t * 2) * 0.012;
    m.body.rotation.x = damp(m.body.rotation.x, this.dashT > 0 ? 0.5 : moving ? 0.12 : 0, 12, dt);
    m.cloakPivot.rotation.x = damp(m.cloakPivot.rotation.x, -Math.min(0.9, this.speedNow * 0.06) - (this.dashT > 0 ? 0.6 : 0) + Math.sin(t * 3) * 0.04, 8, dt);

    // Sword arm: idle low guard, or a horizontal sweep during a cleave.
    if (this.attackT >= 0) {
      const k = clamp(this.attackT / 0.55, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const from = 1.7 * this.swingDir, to = -1.5 * this.swingDir;
      m.armR.rotation.y = from + (to - from) * e;
      m.armR.rotation.x = -1.45;
      m.body.rotation.y = (from + (to - from) * e) * 0.25;
    } else {
      m.armR.rotation.y = damp(m.armR.rotation.y, 0.2, 10, dt);
      m.armR.rotation.x = damp(m.armR.rotation.x, moving ? -0.35 - sw * 0.2 : -0.25, 10, dt);
      m.body.rotation.y = damp(m.body.rotation.y, 0, 10, dt);
    }
    const casting = this.castT > 0;
    m.armL.rotation.x = damp(m.armL.rotation.x, casting ? -1.5 : moving ? sw * 0.5 : 0.05, 18, dt);
    m.handGlow.visible = casting;

    const flick = this.hurtT > 0 && Math.sin(t * 60) > 0;
    m.body.visible = !flick;

    const torch = this.game.world.torch;
    torch.position.set(this.x, 3.4, this.z + 0.6);
    torch.intensity = 48 + Math.sin(t * 11) * 3 + Math.sin(t * 17.3) * 2;
  }
}
