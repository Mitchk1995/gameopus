import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { generateItem, rollRarity, isUnique } from './items.js';
import { RARITY } from '../content/bases.js';
import { UNIQUE_BY_ID } from '../content/uniques.js';
import { randInt } from '../core/rng.js';

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv; varying float vFres;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vFres = abs(dot(n, normalize(cameraPosition - wp.xyz)));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime;
  varying vec2 vUv; varying float vFres;
  void main() {
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.8);
    float core = pow(vFres, 3.0);
    float flick = 0.7 + 0.3 * sin(h * 22.0 - uTime * 6.0);
    gl_FragColor = vec4(uColor * core * fade * flick, 1.0);
  }`;

function itemGeometries() {
  const nx = (g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
  const blade = new THREE.BoxGeometry(0.1, 0.02, 0.95); blade.translate(0, 0, 0.35);
  const guard = new THREE.BoxGeometry(0.34, 0.05, 0.06);
  const grip = new THREE.BoxGeometry(0.05, 0.05, 0.25); grip.translate(0, 0, -0.15);
  const helm = new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const chest = new THREE.BoxGeometry(0.5, 0.18, 0.55);
  const glove = new THREE.BoxGeometry(0.24, 0.12, 0.32);
  const boot1 = new THREE.BoxGeometry(0.2, 0.3, 0.18); boot1.translate(0, 0.15, 0);
  const boot2 = new THREE.BoxGeometry(0.2, 0.1, 0.34); boot2.translate(0, 0.05, 0.1);
  const amuletRing = new THREE.TorusGeometry(0.17, 0.02, 6, 20); amuletRing.rotateX(Math.PI / 2);
  const gem = new THREE.OctahedronGeometry(0.09); gem.translate(0, 0.02, 0.18);
  const ring = new THREE.TorusGeometry(0.12, 0.04, 8, 20); ring.rotateX(Math.PI / 2);
  return {
    weapon: mergeGeometries([blade, guard, grip].map(nx)),
    helm: nx(helm),
    chest: nx(chest),
    gloves: nx(glove),
    boots: mergeGeometries([boot1, boot2].map(nx)),
    amulet: mergeGeometries([amuletRing, gem].map(nx)),
    ring: nx(ring),
  };
}

export class Loot {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.pickups = [];
    this.geos = itemGeometries();
    this.mats = {};
    for (const [r, def] of Object.entries(RARITY)) {
      const [cr, cg, cb] = def.hdr;
      const k = r === 'magic' ? 0.12 : r === 'rare' ? 0.15 : 0.35;
      this.mats[r] = new THREE.MeshStandardMaterial({ color: 0x8a8480, metalness: 0.85, roughness: 0.3, envMap: game.gfx.env, emissive: new THREE.Color(cr * k, cg * k, cb * k) });
    }
    this.beamTime = { value: 0 };
    this.beamMats = {};
    for (const [r, def] of Object.entries(RARITY)) {
      if (!def.beam) continue;
      const s = r === 'rare' ? 0.3 : 0.45;
      this.beamMats[r] = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(def.hdr[0] * s, def.hdr[1] * s, def.hdr[2] * s) }, uTime: this.beamTime },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
    }
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    this.beamGeo.translate(0, 0.5, 0);

    // Gold, shards and health orbs are instanced.
    const coin = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12);
    const shard = new THREE.OctahedronGeometry(0.15);
    shard.scale(0.7, 1.3, 0.7);
    const orb = new THREE.SphereGeometry(0.2, 12, 8);
    this.pk = {
      gold: new THREE.InstancedMesh(coin, new THREE.MeshStandardMaterial({ color: 0xffc040, metalness: 1, roughness: 0.25, envMap: game.gfx.env, emissive: new THREE.Color(0.6, 0.35, 0.05) }), 400),
      shard: new THREE.InstancedMesh(shard, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.0, 4.2) }), 200),
      orb: new THREE.InstancedMesh(orb, new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 0.4, 0.35) }), 60),
    };
    for (const m of Object.values(this.pk)) {
      m.count = 0;
      m.frustumCulled = false;
      game.scene.add(m);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  reset() {
    for (const it of [...this.items]) this.#removeItem(it);
    this.pickups.length = 0;
  }

  ilvl() {
    const g = this.game;
    return Math.max(1, (g.depth - 1) * 5 + Math.floor(g.player.level * 0.6) + randInt(0, 3));
  }

  onKill(e) {
    const g = this.game, s = g.player.stats;
    const mf = s.magicFind;
    if (e.elite === 'rare') {
      for (let i = 0; i < 4; i++) this.dropItem(generateItem({ ilvl: this.ilvl() + 2, rarity: i === 0 ? (Math.random() < 0.35 ? 'unique' : 'rare') : rollRarity(mf, 5) }), e.x, e.z);
      this.goldFountain(e.x, e.z);
      for (let i = 0; i < 2; i++) this.spawnPickup('orb', e.x, e.z, 1);
      for (let i = 0; i < 6; i++) this.spawnPickup('shard', e.x, e.z, 1);
      return;
    }
    if (e.elite === 'champion') {
      let rarity = rollRarity(mf, 2.5);
      if (!g.save.firstUnique) {
        g.save.firstUnique = true;
        rarity = 'unique';
      }
      this.dropItem(generateItem({ ilvl: this.ilvl() + 1, rarity }), e.x, e.z);
      if (Math.random() < 0.5) this.dropItem(generateItem({ ilvl: this.ilvl() + 1, rarity: rollRarity(mf, 2.5) }), e.x, e.z);
      for (let i = 0; i < 4; i++) this.spawnPickup('gold', e.x, e.z, this.goldAmount());
      if (Math.random() < 0.5) this.spawnPickup('orb', e.x, e.z, 1);
      return;
    }
    if (Math.random() < 0.045 * (1 + mf / 300)) this.dropItem(generateItem({ ilvl: this.ilvl(), rarity: rollRarity(mf) }), e.x, e.z);
    if (Math.random() < 0.3) this.spawnPickup('gold', e.x, e.z, this.goldAmount());
    if (Math.random() < 0.06) this.spawnPickup('shard', e.x, e.z, 1);
    if (Math.random() < 0.025) this.spawnPickup('orb', e.x, e.z, 1);
  }

  goldAmount() {
    const g = this.game;
    return Math.max(1, Math.round(randInt(2, 6) * (1 + (g.depth - 1) * 0.6) * (1 + g.player.stats.goldFind / 100)));
  }

  goldFountain(x, z) {
    for (let i = 0; i < 28; i++) this.spawnPickup('gold', x, z, this.goldAmount(), 9 + Math.random() * 5, true);
    this.game.audio.play('gold');
  }

  spawnPickup(kind, x, z, amount, up = 5 + Math.random() * 3, fountain = false) {
    if (this.pickups.length > 600) return;
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * (fountain ? 4 : 2.5);
    this.pickups.push({ kind, x, y: 0.8, z, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, amount, t: 0, rot: Math.random() * 6, fountain });
  }

  dropItem(item, x, z) {
    const g = this.game;
    const r = item.rarity;
    const mesh = new THREE.Mesh(this.geos[item.slot], this.mats[r]);
    mesh.scale.setScalar(0.95);
    mesh.castShadow = true;
    g.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const big = isUnique(item);
    const s = 1.5 + Math.random() * 2;
    const it = {
      item, mesh, x, z, y: 1,
      vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: big ? 13 : 7,
      landed: false, t: 0, beam: null, glow: null,
      label: g.hud.createLootLabel(item, () => { g.player.moveTarget = { x: it.x, z: it.z }; }),
    };
    if (RARITY[r].beam) {
      it.beam = new THREE.Mesh(this.beamGeo, this.beamMats[r]);
      const w = r === 'rare' ? 0.22 : 0.42;
      it.beam.scale.set(w, 0.01, w);
      it.beam.renderOrder = 6;
      g.scene.add(it.beam);
    }
    this.items.push(it);
    if (big) {
      const asc = r === 'ascendant';
      g.audio.play('dropUnique', { ascendant: asc });
      g.hitstop(0.05);
      g.flash(asc ? [1, 0.2, 0.5] : [1, 0.55, 0.15], 0.5);
      g.hud.announce(asc ? 'ASCENDANT' : 'Unique', item.name, r);
      g.particles.burst(x, 1.2, z, 70, 10, RARITY[r].hdr.map((v) => v * 0.45), 1.1, 0.4, 5, 8);
    } else if (r === 'rare') g.audio.play('dropRare');
    if (this.items.length > 90) {
      const old = this.items.find((i) => i.item.rarity === 'magic');
      if (old) this.#removeItem(old);
    }
  }

  #removeItem(it) {
    const g = this.game;
    g.scene.remove(it.mesh);
    if (it.beam) g.scene.remove(it.beam);
    it.glow && (it.glow.active = false, it.glow.mesh.visible = false);
    it.label.remove();
    this.items.splice(this.items.indexOf(it), 1);
  }

  update(dt) {
    const g = this.game, p = g.player, P = g.particles;
    this.beamTime.value = g.time;
    const reach = p.stats.pickup;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (!it.landed) {
        it.vy -= 30 * dt;
        it.x += it.vx * dt; it.z += it.vz * dt; it.y += it.vy * dt;
        if (it.y <= 0.12) {
          it.y = 0.12;
          it.landed = true;
          const r = it.item.rarity;
          if (r === 'magic') g.audio.play('dropMagic');
          if (isUnique(it.item)) {
            g.shake(0.3);
            P.ring(it.x, 0.1, it.z, 0.3, 40, RARITY[r].hdr.map((v) => v * 0.5), 0.6, 0.35, 5);
            it.glow = g.fx.glow(it.x, it.z, 2.2, RARITY[r].hdr.map((v) => v * 0.18), 1e9, true);
          }
        }
        if (isUnique(it.item) && Math.random() < 0.8) { const c = RARITY[it.item.rarity].hdr; P.spawn(it.x, it.y, it.z, 0, 0, 0, 0.5, 0.4, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5); }
      }
      it.mesh.position.set(it.x, it.y + (it.landed ? Math.sin(g.time * 2 + i) * 0.04 + 0.08 : 0), it.z);
      it.mesh.rotation.set(it.landed ? 0.25 : it.t * 8, g.time * (it.landed ? 0.8 : 5), 0);
      if (it.beam) {
        it.beam.position.set(it.x, 0, it.z);
        const h = it.landed ? Math.min(1, (it.beam.scale.y + dt * 2.5)) : 0.01;
        it.beam.scale.y = h * (it.item.rarity === 'rare' ? 5 : 11);
      }
      if (it.landed && isUnique(it.item) && Math.random() < dt * 25) {
        const c = RARITY[it.item.rarity].hdr;
        P.spawn(it.x + (Math.random() - 0.5) * 1.2, 0.1, it.z + (Math.random() - 0.5) * 1.2, 0, 1 + Math.random() * 2.5, 0, 1.2, 0.25, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0, 0.3, 0);
      }
      g.hud.placeLabel(it.label, it.x, it.y + 0.9, it.z);

      if (it.landed && !p.dead && Math.hypot(p.x - it.x, p.z - it.z) < Math.max(1.1, reach * 0.7)) {
        if (g.inventory.add(it.item)) {
          this.#removeItem(it);
          g.audio.play('equip');
        } else if (g.time - (this.fullWarnT ?? -99) > 8) {
          this.fullWarnT = g.time;
          g.hud.toast('Your bag is full — press I to salvage', 'warn');
        }
      }
    }

    // Instanced pickups.
    const counts = { gold: 0, shard: 0, orb: 0 };
    const { _m, _q, _e, _v, _s } = this;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      const dx = p.x - k.x, dz = p.z - k.z, d = Math.hypot(dx, dz);
      const magnet = k.t > 0.45 && !p.dead && (k.kind === 'orb' ? d < reach * 1.3 && p.life < p.stats.life : d < reach * 2.4);
      if (magnet) {
        const sp = 6 + k.t * 10;
        k.x += (dx / d) * sp * dt; k.z += (dz / d) * sp * dt;
        k.y += (1 - k.y) * dt * 8;
        if (d < 0.5) {
          this.#collect(k);
          this.pickups[i] = this.pickups[this.pickups.length - 1];
          this.pickups.pop();
          continue;
        }
      } else {
        k.vy -= 25 * dt;
        k.x += k.vx * dt; k.z += k.vz * dt; k.y += k.vy * dt;
        if (k.y < 0.12) { k.y = 0.12; k.vy *= -0.35; k.vx *= 0.5; k.vz *= 0.5; }
      }
      if (k.t > 60) { this.pickups[i] = this.pickups[this.pickups.length - 1]; this.pickups.pop(); continue; }
      const mesh = this.pk[k.kind];
      const n = counts[k.kind]++;
      if (n >= mesh.instanceMatrix.count) continue;
      _e.set(k.kind === 'gold' ? 1.2 : 0, g.time * 3 + k.rot, 0);
      _q.setFromEuler(_e);
      _v.set(k.x, k.y + (k.kind === 'gold' ? 0 : 0.2 + Math.sin(g.time * 3 + k.rot) * 0.08), k.z);
      _s.setScalar(k.kind === 'orb' ? 1 + Math.sin(g.time * 6) * 0.1 : 1);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(n, _m);
      if (k.kind !== 'gold' && Math.random() < dt * 6) {
        const c = k.kind === 'orb' ? [4, 0.4, 0.3] : [2.2, 0.9, 4];
        P.spawn(k.x, k.y + 0.2, k.z, 0, 0.8, 0, 0.6, 0.25, c[0], c[1], c[2]);
      }
    }
    for (const kind in this.pk) {
      this.pk[kind].count = Math.min(counts[kind], this.pk[kind].instanceMatrix.count);
      this.pk[kind].instanceMatrix.needsUpdate = true;
    }
  }

  #collect(k) {
    const g = this.game, p = g.player;
    if (k.kind === 'gold') {
      g.save.gold += k.amount;
      g.audio.play('gold');
      g.particles.burst(p.x, 1.2, p.z, 4, 2, [4, 3, 0.8], 0.3, 0.2, 0, 1);
    } else if (k.kind === 'shard') {
      g.save.shards += k.amount;
      g.audio.play('shard');
    } else if (k.kind === 'orb') {
      p.heal(p.stats.life * 0.2);
      g.audio.play('orb');
      g.particles.burst(p.x, 1.2, p.z, 20, 3, [4, 0.5, 0.4], 0.5, 0.3, -2, 3);
    }
    g.powers.emit('pickup', { kind: k.kind, amount: k.amount, x: p.x, z: p.z, fountain: k.fountain });
  }

  // Debug helper: drop a specific unique at the player's feet.
  debugDrop(id, asc = false) {
    const p = this.game.player;
    this.dropItem(generateItem({ ilvl: this.ilvl(), uniqueId: id || Object.keys(UNIQUE_BY_ID)[0], ascendant: asc }), p.x + 2, p.z + 1);
  }
}
