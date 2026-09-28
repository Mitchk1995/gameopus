import * as THREE from 'three';
import { MONSTERS, ELITE_FIRST, ELITE_TITLE, ELITE_AFFIXES } from '../content/monsters.js';
import { buildMonster } from './monsterModels.js';
import { SpatialHash } from '../core/spatial.js';
import { pick, randInt, weighted, clamp } from '../core/rng.js';

const CAP = 420;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function gaitMaterial(mat, def, timeU) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = `attribute float aPhase;\nuniform float uTime;\n${sh.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float legW = clamp(1.0 - position.y / ${def.legH.toFixed(2)}, 0.0, 1.0);
        float side = position.x > 0.0 ? 0.0 : 3.14159;
        transformed.z += sin(uTime * ${def.gait.toFixed(2)} + aPhase + side) * legW * ${def.gaitAmt.toFixed(2)};
        transformed.x += sin(uTime * ${(def.gait * 0.5 + 1.3).toFixed(2)} + aPhase) * 0.035 * position.y;
      }`,
    );
  };
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.hash = new SpatialHash(2.5);
    this.timeU = { value: 0 };
    this.meshes = {};
    this.nextId = 1;
    for (const [id, def] of Object.entries(MONSTERS)) {
      const { geo, glow } = buildMonster(def.model);
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1));
      const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...glow) });
      gaitMaterial(body, def, this.timeU);
      gaitMaterial(glowMat, def, this.timeU);
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
    this.eliteTimer = 32;
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
    const hpMult = Math.pow(1.3, depth - 1) * (1 + g.runTime / 400);
    const dmgMult = Math.pow(1.17, depth - 1);
    const eliteHp = opts.elite === 'rare' ? 9 : opts.elite === 'champion' ? 3.2 : 1;
    const e = {
      id: this.nextId++,
      typeId,
      def,
      x, z, vx: 0, vz: 0,
      face: Math.random() * Math.PI * 2,
      radius: def.radius * (opts.elite === 'rare' ? 1.4 : opts.elite ? 1.2 : 1),
      scale: opts.elite === 'rare' ? 1.4 : opts.elite ? 1.22 : 1,
      maxHp: def.hp * hpMult * eliteHp,
      damage: def.damage * dmgMult * (opts.elite ? 1.4 : 1),
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
    const size = { husk: randInt(4, 9), skitter: randInt(5, 11), wisp: randInt(1, 3), brute: randInt(1, 2) }[typeId];
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
      for (let i = 0; i < 5; i++) this.spawn(typeId, cx + (Math.random() - 0.5) * 5, cz + (Math.random() - 0.5) * 5, { elite: 'champion' });
      g.hud.announce(name, `${ELITE_AFFIXES[affix].name} — ${ELITE_AFFIXES[affix].desc}`, 'rare');
    } else {
      const n = randInt(3, 4);
      for (let i = 0; i < n; i++) this.spawn(typeId, cx + (Math.random() - 0.5) * 4, cz + (Math.random() - 0.5) * 4, { elite: 'champion' });
      g.hud.announce('Champions approach', 'Their blood runs blue with fortune', 'magic');
    }
    g.audio.play('elite');
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.timeU.value = g.time;

    // Director ---------------------------------------------------------
    const alive = this.list.length;
    const target = Math.min(22 + g.runTime * 0.9 + (g.depth - 1) * 16, 300);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && alive < target && !p.dead) {
      this.#spawnPack();
      this.spawnTimer = 0.5;
    }
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0 && !p.dead) {
      this.eliteCount++;
      this.spawnElitePack(this.eliteCount % 3 === 0);
      this.eliteTimer = 45;
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
      e.x += (mx * spd + sx * 4 + e.vx) * dt;
      e.z += (mz * spd + sz * 4 + e.vz) * dt;
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

  #strike(e, dist) {
    const g = this.game, p = g.player;
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
      if (e.windup > 0) lean = -0.35 * Math.min(1, e.windup / e.def.windup);
      else if (e.atkCd > e.def.cooldown - 0.2) lean = 0.4;
      if (e.dead) {
        const k = e.dying / 0.45;
        sc *= 1 - k * 0.5;
        y -= k * 0.6;
        tilt = k * 1.2;
      }
      _e.set(lean + tilt, e.face, Math.sin(t * 5 + e.phase) * 0.04);
      _q.setFromEuler(_e);
      _p.set(e.x, y, e.z);
      _s.set(sc, sc * (1 + Math.sin(t * 6 + e.phase) * 0.03), sc);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const f = e.flash > 0 ? 1 + e.flash * 25 : 1;
      let r = e.tint[0] * f, gg = e.tint[1] * f, b = e.tint[2] * f;
      if (e.slowT > 0) { r *= 0.6; gg *= 0.9; b *= 1.8; }
      if (e.burnT > 0) { r *= 1.5; gg *= 0.9; b *= 0.6; }
      if (e.dead) { r = gg = b = 0.25; }
      _c.setRGB(r, gg, b);
      mesh.setColorAt(i, _c);
      mesh.geometry.attributes.aPhase.array[i] = e.phase;
    }
    for (const id in this.meshes) {
      const mesh = this.meshes[id];
      mesh.count = clamp(counts[id], 0, CAP);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.attributes.aPhase.needsUpdate = true;
    }
  }
}
