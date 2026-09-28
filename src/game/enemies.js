import * as THREE from 'three';
import { MONSTERS, ELITE_FIRST, ELITE_TITLE, ELITE_AFFIXES } from '../content/monsters.js';
import { buildMonster } from './monsterModels.js';
import { enhance } from '../art/enhance.js';
import { SpatialHash } from '../core/spatial.js';
import { pick, randInt, weighted, clamp } from '../core/rng.js';
import { dreadMods } from '../content/dread.js';

const CAP = 420;
const STRIDE = { husk: 1.3, skitter: 0.8, brute: 2.3, wisp: 2 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Surface look per monster family: texture, glow in the texture's cracks/veins, brightness.
const SKINS = {
  husk: { tex: 'skin', glow: [1.6, 0.5, 0.1], boost: 2.3 },
  skitter: { tex: 'chitin', glow: [1.4, 0.5, 0.1], boost: 3.2 },
  brute: { tex: 'hide', glow: [1.8, 0.5, 0.12], boost: 2.6 },
  wisp: { tex: 'robe', glow: null, boost: 1.4 },
};

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.hash = new SpatialHash(2.5);
    this.meshes = {};
    this.nextId = 1;
    for (const [id, def] of Object.entries(MONSTERS)) {
      const { geo, glow, rig } = buildMonster(def.model);
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1));
      geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4));
      const skin = SKINS[id];
      const body = new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(skin.boost), roughness: 1, metalness: 0.05 });
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...glow) });
      enhance(body, { tex: skin.tex, scale: 1.6, bump: 1.2, glow: skin.glow && new THREE.Color(...skin.glow), rim: 0.4, ao: 0.9, aoMin: 0.5, rig, rigId: id });
      enhance(glowMat, { rig, rigId: id });
      const mesh = new THREE.InstancedMesh(geo, [body, glowMat], CAP);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      game.scene.add(mesh);
      this.meshes[id] = mesh;
    }
    this.reset();
  }

  reset() {
    this.list.length = 0;
    this.spawnTimer = 1.5;
    this.eliteTimer = 45;
    this.eliteCount = 0;
    this.boss = null;
  }

  near(x, z, r) {
    const out = [];
    this.hash.query(x, z, r, out);
    for (let i = out.length - 1; i >= 0; i--) if (out[i].dead) out.splice(i, 1);
    return out;
  }

  nearest(x, z, r, exclude) {
    let best = null, bd = r * r;
    for (const e of this.near(x, z, r)) {
      if (exclude && exclude.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  spawn(typeId, x, z, opts = {}) {
    const def = MONSTERS[typeId];
    const g = this.game;
    const depth = g.depth;
    const dm = dreadMods(g.dread);
    const hpMult = Math.pow(1.38, depth - 1) * (1 + g.runTime / 420) * dm.hp;
    const dmgMult = Math.pow(1.22, depth - 1) * dm.dmg;
    const eliteHp = opts.elite === 'rare' ? 12 : opts.elite === 'champion' ? (depth === 1 ? 2.5 : 4) : 1;
    const e = {
      id: this.nextId++,
      typeId,
      def,
      x, z, vx: 0, vz: 0,
      face: Math.random() * Math.PI * 2,
      radius: def.radius * (opts.elite === 'rare' ? 1.4 : opts.elite ? 1.2 : 1),
      scale: (opts.elite === 'rare' ? 1.4 : opts.elite ? 1.22 : 1) * (opts.elite ? 1 : 0.92 + Math.random() * 0.16),
      shade: 0.86 + Math.random() * 0.28,
      walk: Math.random() * 10,
      mv: 0,
      strikeT: 0,
      hitT: 0,
      maxHp: def.hp * hpMult * eliteHp,
      damage: def.damage * dmgMult * (opts.elite === 'rare' ? 1.6 : opts.elite ? 1.4 : 1),
      speed: def.speed * (0.9 + Math.random() * 0.2),
      atkCd: 0.5 + Math.random(),
      windup: 0,
      slowT: 0,
      burnT: 0,
      burnDps: 0,
      flash: 0,
      dead: false,
      dying: 0,
      phase: Math.random() * 100,
      spawnT: 0,
      elite: opts.elite || null,
      name: opts.name || null,
      affix: opts.affix || null,
      affixT: 2,
      tint: opts.elite === 'rare' ? [1.5, 1.2, 0.55] : opts.elite === 'champion' ? [0.65, 0.85, 1.7] : [1, 1, 1],
    };
    if (e.affix === 'frenzied') {
      e.speed *= 1.5;
      e.cooldownMult = 0.6;
    }
    e.hp = e.maxHp;
    this.list.push(e);
    return e;
  }

  #spawnPack() {
    const g = this.game;
    const p = g.player;
    const w = Object.entries(g.world.biome.monsters).filter(([id]) => (id === 'wisp' ? g.runTime > 25 : id === 'brute' ? g.runTime > 50 : true));
    const typeId = weighted(w);
    const size = { husk: randInt(4, 8), skitter: randInt(5, 10), wisp: randInt(1, 2), brute: 1 }[typeId];
    const a = Math.random() * Math.PI * 2;
    const d = 24 + Math.random() * 8;
    const cx = p.x + Math.cos(a) * d, cz = p.z + Math.sin(a) * d;
    for (let i = 0; i < size; i++) this.spawn(typeId, cx + (Math.random() - 0.5) * 4, cz + (Math.random() - 0.5) * 4);
  }

  spawnElitePack(rare = false) {
    const g = this.game;
    const p = g.player;
    const a = Math.random() * Math.PI * 2;
    const cx = p.x + Math.cos(a) * 20, cz = p.z + Math.sin(a) * 20;
    const typeId = weighted(Object.entries(g.world.biome.monsters).filter(([id]) => id !== 'skitter'));
    if (rare) {
      const name = `${pick(ELITE_FIRST)} ${pick(ELITE_TITLE)}`;
      const affix = pick(Object.keys(ELITE_AFFIXES));
      const boss = this.spawn(typeId === 'wisp' ? 'brute' : typeId, cx, cz, { elite: 'rare', name, affix });
      this.boss = boss;
      const minions = g.depth <= 2 ? 3 : 5;
      for (let i = 0; i < minions; i++) this.spawn(typeId, cx + (Math.random() - 0.5) * 5, cz + (Math.random() - 0.5) * 5, { elite: 'champion' });
      g.hud.announce(name, `${ELITE_AFFIXES[affix].name} — ${ELITE_AFFIXES[affix].desc}`, 'rare');
    } else {
      const n = g.depth === 1 ? randInt(2, 3) : randInt(3, 4);
      const affix = g.depth > 1 && Math.random() < 0.5 ? 'frenzied' : null;
      for (let i = 0; i < n; i++) this.spawn(typeId, cx + (Math.random() - 0.5) * 4, cz + (Math.random() - 0.5) * 4, { elite: 'champion', affix });
      g.hud.announce('Champions approach', 'Their blood runs blue with fortune', 'magic');
    }
    g.audio.play('elite');
  }

  update(dt) {
    const g = this.game;
    const p = g.player;

    // Director ---------------------------------------------------------
    const alive = this.list.length;
    const target = Math.min(12 + g.runTime * 0.5 + (g.depth - 1) * 14, 260);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && alive < target && !p.dead) {
      this.#spawnPack();
      this.spawnTimer = 0.5;
    }
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0 && !p.dead) {
      this.eliteCount++;
      // Named elites only once you're past the first depth.
      this.spawnElitePack(this.eliteCount % 3 === 0 && g.depth >= 2);
      this.eliteTimer = 50;
    }

    this.hash.clear();
    for (const e of this.list) if (!e.dead) this.hash.insert(e);

    const nb = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) {
        e.dying += dt;
        if (e.dying > 0.45) {
          this.list[i] = this.list[this.list.length - 1];
          this.list.pop();
        }
        continue;
      }
      const dx = p.x - e.x, dz = p.z - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      if (dist > 50 && !e.elite) {
        e.dead = true;
        e.dying = 1;
        continue;
      }
      e.spawnT = Math.min(1, e.spawnT + dt * 1.8);
      if (e.spawnT < 1) {
        if (Math.random() < 0.3) g.particles.spawn(e.x + (Math.random() - 0.5), 0.1, e.z + (Math.random() - 0.5), 0, 0.8, 0, 0.6, 0.5, 0.5, 0.35, 0.25, 0, 1);
      }
      e.flash = Math.max(0, e.flash - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      e.atkCd -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick = (e.burnTick || 0) + dt;
        if (Math.random() < dt * 20) g.particles.spawn(e.x + (Math.random() - 0.5) * 0.6, 0.6 + Math.random(), e.z + (Math.random() - 0.5) * 0.6, 0, 1.5, 0, 0.4, 0.4, 5, 1.5, 0.2, -1, 1);
        if (e.burnTick > 0.33) {
          g.combat.applyDamage(e, e.burnDps * e.burnTick, { element: 'fire', silent: true });
          e.burnTick = 0;
          if (e.dead) continue;
        }
      }
      const slow = e.slowT > 0 ? 0.45 : 1;
      const def = e.def;
      let mx = 0, mz = 0;
      const nx = dx / dist, nz = dz / dist;

      if (p.dead) {
        mx = -nx * 0.3; mz = -nz * 0.3;
      } else if (e.windup > 0) {
        e.windup -= dt * (e.affix === 'frenzied' ? 1.6 : 1);
        if (e.windup <= 0) this.#strike(e, dist);
      } else if (def.behavior === 'ranged') {
        if (dist > def.range) { mx = nx; mz = nz; }
        else if (dist < def.range * 0.6) { mx = -nx; mz = -nz; }
        else { mx = -nz * 0.6; mz = nx * 0.6; }
        if (e.atkCd <= 0 && dist < def.range * 1.3 && e.spawnT >= 1) {
          e.atkCd = def.cooldown * (0.8 + Math.random() * 0.4);
          e.strikeT = 1;
          g.projectiles.enemyBolt(e, nx, nz);
        }
      } else {
        const reach = def.reach * e.scale + p.radius;
        if (dist < reach + e.radius && e.atkCd <= 0 && e.spawnT >= 1) {
          e.windup = def.windup;
          e.atkCd = def.cooldown * (e.cooldownMult || 1);
          if (def.behavior === 'slam') g.fx.telegraph(e.x + nx * 1.2, e.z + nz * 1.2, def.reach * e.scale, def.windup);
        } else {
          mx = nx; mz = nz;
        }
      }

      // Elite affixes.
      if (e.affix) {
        e.affixT -= dt;
        if (e.affixT <= 0) {
          if (e.affix === 'molten') {
            g.actions.firePatch(e.x, e.z, 1.6, e.damage * 0.9, 5, 'enemy');
            e.affixT = 0.9;
          } else if (e.affix === 'vortex' && dist < 16) {
            p.kx += nx * -26; p.kz += nz * -26;
            g.fx.lightning(e.x, 1.5, e.z, p.x, 1, p.z, [3, 1, 5], 0.2);
            g.audio.play('implode');
            e.affixT = 5;
          } else e.affixT = 1;
        }
      }

      // Separation from neighbors.
      this.hash.query(e.x, e.z, e.radius + 0.3, nb);
      let sx = 0, sz = 0;
      for (let k = 0; k < nb.length; k++) {
        const o = nb[k];
        if (o === e) continue;
        const ox = e.x - o.x, oz = e.z - o.z;
        const d2 = ox * ox + oz * oz;
        const rr = e.radius + o.radius;
        if (d2 < rr * rr && d2 > 1e-5) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / rr;
          sx += (ox / d) * push;
          sz += (oz / d) * push;
        }
      }
      const spd = e.speed * slow * (e.spawnT < 1 ? 0 : 1);
      const ox0 = e.x, oz0 = e.z;
      e.x += (mx * spd + sx * 4 + e.vx) * dt;
      e.z += (mz * spd + sz * 4 + e.vz) * dt;
      // Animation drivers: stride phase from distance walked, smoothed move amount.
      const stepped = Math.hypot(e.x - ox0, e.z - oz0);
      e.walk += (stepped / (STRIDE[e.typeId] * e.scale)) * Math.PI * 2;
      e.mv += (Math.min(1, stepped / dt / Math.max(0.1, def.speed)) - e.mv) * Math.min(1, dt * 8);
      e.strikeT = Math.max(0, e.strikeT - dt * 2.8);
      e.hitT = Math.max(0, e.hitT - dt);
      const kd = Math.exp(-8 * dt);
      e.vx *= kd; e.vz *= kd;
      // Don't overlap the player.
      const pr = e.radius + p.radius;
      const px = e.x - p.x, pz = e.z - p.z, pd = Math.hypot(px, pz);
      if (pd < pr && pd > 1e-4) { e.x = p.x + (px / pd) * pr; e.z = p.z + (pz / pd) * pr; }
      if (e.elite || def.behavior === 'slam') g.world.collide(e, e.radius);
      if (mx || mz) e.face = Math.atan2(mx, mz);
      else if (e.windup > 0) e.face = Math.atan2(nx, nz);

      if (e.elite && Math.random() < dt * (e.elite === 'rare' ? 30 : 12)) {
        const a = Math.random() * Math.PI * 2;
        const c = e.elite === 'rare' ? [4, 3, 0.6] : [0.8, 1.4, 5];
        g.particles.spawn(e.x + Math.cos(a) * e.radius * 1.3, 0.1, e.z + Math.sin(a) * e.radius * 1.3, 0, 1.6, 0, 0.8, 0.35, c[0], c[1], c[2], 0, 0.5, 0.1);
      }
    }
    if (this.boss?.dead) this.boss = null;
    this.#render();
  }

  // Art tools: push the current state to the GPU without simulating.
  debugRender() {
    this.#render();
  }

  #strike(e, dist) {
    const g = this.game, p = g.player;
    e.strikeT = 1;
    if (e.def.behavior === 'slam') {
      const r = e.def.reach * e.scale;
      const cx = e.x + Math.sin(e.face) * 1.2, cz = e.z + Math.cos(e.face) * 1.2;
      g.particles.ring(cx, 0.2, cz, r * 0.5, 40, [3, 1.2, 0.4], 0.5, 0.5, 6);
      g.particles.burst(cx, 0.2, cz, 30, 6, [0.5, 0.4, 0.3], 0.8, 0.35, 12, 5);
      g.audio.play('slam');
      g.shake(0.35);
      if (Math.hypot(p.x - cx, p.z - cz) < r + p.radius) g.combat.hurtPlayer(e.damage, e);
    } else if (dist < e.def.reach * e.scale + p.radius + e.radius + 0.4) {
      g.combat.hurtPlayer(e.damage, e);
    }
  }

  #render() {
    const counts = {};
    const t = this.game.time;
    for (const id in this.meshes) counts[id] = 0;
    for (const e of this.list) {
      const mesh = this.meshes[e.typeId];
      const i = counts[e.typeId]++;
      if (i >= CAP) continue;
      let y = 0, sc = e.scale, lean = 0, tilt = 0;
      if (e.def.float) y = 0.25 + Math.sin(t * 2 + e.phase) * 0.15;
      if (e.spawnT < 1) y -= (1 - e.spawnT) * 2.2 * sc;
      const wind = e.windup > 0 ? 1 - e.windup / e.def.windup : 0;
      lean = -0.18 * wind + 0.3 * e.strikeT - e.hitT * 2.5;
      if (e.typeId === 'skitter') lean = -0.5 * wind + 0.45 * e.strikeT - e.hitT * 2;
      if (e.dead) {
        const k = e.dying / 0.45;
        sc *= 1 - k * 0.5;
        y -= k * 0.6;
        tilt = k * 1.2;
      }
      const roll = e.typeId === 'brute' ? Math.sin(e.walk) * 0.07 * e.mv : Math.sin(t * 5 + e.phase) * 0.03;
      _e.set(lean + tilt, e.face, roll);
      _q.setFromEuler(_e);
      _p.set(e.x, y, e.z);
      _s.set(sc, sc * (1 + Math.sin(t * 6 + e.phase) * 0.03), sc);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const f = (e.flash > 0 ? 1 + e.flash * 25 : 1) * e.shade;
      let r = e.tint[0] * f, gg = e.tint[1] * f, b = e.tint[2] * f;
      if (e.slowT > 0) { r *= 0.6; gg *= 0.9; b *= 1.8; }
      if (e.burnT > 0) { r *= 1.5; gg *= 0.9; b *= 0.6; }
      if (e.dead) { r = gg = b = 0.25; }
      _c.setRGB(r, gg, b);
      mesh.setColorAt(i, _c);
      mesh.geometry.attributes.aPhase.array[i] = e.phase;
      const an = mesh.geometry.attributes.aAnim.array, j = i * 4;
      an[j] = e.walk; an[j + 1] = e.mv; an[j + 2] = wind * wind * (3 - 2 * wind); an[j + 3] = e.strikeT;
    }
    for (const id in this.meshes) {
      const mesh = this.meshes[id];
      mesh.count = clamp(counts[id], 0, CAP);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.attributes.aPhase.needsUpdate = true;
      mesh.geometry.attributes.aAnim.needsUpdate = true;
    }
  }
}
