import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFlagstones } from './textures.js';
import { mulberry32, hash2, lerp } from '../core/rng.js';
import { BIOMES } from '../content/biomes.js';

const CHUNK = 24;
const VIEW = 2; // chunks in each direction
const TILE = 8; // world units per floor texture repeat

const prep = (g) => (g.index ? g.toNonIndexed() : g);
function merge(parts) {
  return mergeGeometries(parts.map((p) => { p = prep(p); p.deleteAttribute('uv'); return p; }));
}

function rockGeometry(seed) {
  const rng = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 0.75 + rng() * 0.5; seen.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function pillarGeometry() {
  const shaft = new THREE.CylinderGeometry(0.42, 0.48, 1, 12, 1);
  shaft.translate(0, 0.5, 0);
  return shaft;
}

function graveGeometry() {
  const slab = new THREE.BoxGeometry(0.7, 0.9, 0.16);
  slab.translate(0, 0.45, 0);
  const top = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 12, 1, false, 0, Math.PI);
  top.rotateX(Math.PI / 2);
  top.rotateZ(Math.PI / 2);
  top.translate(0, 0.9, 0);
  return merge([slab, top]);
}

function treeGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.1, 0.28, 3.4, 7);
  trunk.translate(0, 1.7, 0);
  parts.push(trunk);
  const rng = mulberry32(3);
  for (let i = 0; i < 5; i++) {
    const len = 0.9 + rng() * 1.2;
    const b = new THREE.CylinderGeometry(0.02, 0.09, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(0.6 + rng() * 0.6);
    b.rotateY(rng() * Math.PI * 2);
    b.translate(0, 1.6 + rng() * 1.6, 0);
    parts.push(b);
  }
  return merge(parts);
}

function crystalGeometry() {
  const parts = [];
  const rng = mulberry32(9);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.OctahedronGeometry(0.35, 0);
    const h = 1.2 + rng() * 1.6;
    c.scale(0.6 + rng() * 0.4, h, 0.6 + rng() * 0.4);
    c.rotateZ((rng() - 0.5) * 0.9);
    c.rotateX((rng() - 0.5) * 0.9);
    c.translate((rng() - 0.5) * 0.9, h * 0.3, (rng() - 0.5) * 0.9);
    parts.push(c);
  }
  return merge(parts);
}

function brazierGeometry() {
  const stand = new THREE.CylinderGeometry(0.08, 0.2, 1.1, 8);
  stand.translate(0, 0.55, 0);
  const bowl = new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.translate(0, 1.2, 0);
  const rim = new THREE.TorusGeometry(0.45, 0.05, 6, 16);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 1.2, 0);
  return merge([stand, bowl, rim]);
}

function wallGeometry() {
  const rng = mulberry32(21);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 1.2 + rng() * 1.6;
    const b = new THREE.BoxGeometry(0.62, h, 0.7);
    b.translate(-1.55 + i * 0.62, h / 2, (rng() - 0.5) * 0.08);
    parts.push(b);
  }
  return merge(parts);
}

export class World {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.biome = BIOMES[0];

    this.hemi = new THREE.HemisphereLight(0x5a5a78, 0x2a1a12, 0.6);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x9aa8ff, 0.9);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 90;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.03;
    scene.add(this.moon, this.moon.target);

    this.torch = new THREE.PointLight(0xff9a50, 48, 20, 1.6);
    this.torch.castShadow = false;
    scene.add(this.torch);
    this.fireLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff7a30, 0, 13, 1.7);
      scene.add(l);
      this.fireLights.push(l);
    }

    // Floor ------------------------------------------------------------
    const tex = makeFlagstones();
    const size = 208;
    const rep = size / TILE;
    for (const t of Object.values(tex)) t.repeat.set(rep, rep);
    this.groundTint = { value: new THREE.Vector3(1, 1, 1) };
    const gmat = new THREE.MeshStandardMaterial({ ...tex, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 1, metalness: 0 });
    gmat.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = this.groundTint;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos;
          uniform vec3 uTint;
          float vhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(vhash(i), vhash(i + vec2(1, 0)), f.x), mix(vhash(i + vec2(0, 1)), vhash(i + vec2(1, 1)), f.x), f.y);
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float gn = vnoise(vWPos.xz * 0.06) * 0.6 + vnoise(vWPos.xz * 0.21) * 0.3 + vnoise(vWPos.xz * 0.9) * 0.1;
          diffuseColor.rgb *= mix(0.45, 1.25, gn) * uTint;
          float ash = smoothstep(0.62, 0.8, vnoise(vWPos.xz * 0.11 + 17.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.085, 0.08), ash * 0.6);`);
    };
    const ggeo = new THREE.PlaneGeometry(size, size);
    ggeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(ggeo, gmat);
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    // Props (instanced per kind) --------------------------------------
    const stone = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.85, flatShading: true });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x3e3a38, roughness: 0.9, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 1, flatShading: true });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.5, metalness: 0.7, envMap: game.gfx.env, envMapIntensity: 0.5 });
    this.crystalMat = new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.2, metalness: 0.2, emissive: new THREE.Color(0.3, 2.6, 3.2), flatShading: true });

    const kinds = {
      pillar: { geo: pillarGeometry(), mat: stone, cap: 220, shadow: true },
      rock: { geo: rockGeometry(5), mat: darkStone, cap: 500, shadow: true },
      grave: { geo: graveGeometry(), mat: stone, cap: 400, shadow: true },
      tree: { geo: treeGeometry(), mat: wood, cap: 150, shadow: true },
      crystal: { geo: crystalGeometry(), mat: this.crystalMat, cap: 120, shadow: false },
      brazier: { geo: brazierGeometry(), mat: iron, cap: 60, shadow: true },
      wall: { geo: wallGeometry(), mat: stone, cap: 120, shadow: true },
      pebble: { geo: rockGeometry(8), mat: darkStone, cap: 1600, shadow: false },
    };
    this.kinds = kinds;
    for (const k of Object.values(kinds)) {
      k.mesh = new THREE.InstancedMesh(k.geo, k.mat, k.cap);
      k.mesh.castShadow = k.shadow;
      k.mesh.receiveShadow = true;
      k.mesh.count = 0;
      k.mesh.frustumCulled = false;
      scene.add(k.mesh);
    }

    this.chunks = new Map();
    this.center = null;
    this.solids = [];
    this.braziers = [];
    this.biomeT = 1;
    this.biomeFrom = null;
  }

  #genChunk(cx, cz) {
    const rng = mulberry32(hash2(cx, cz) ^ 0x9e3779b9);
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const props = [];
    const solids = [];
    const add = (kind, x, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => {
      if (x * x + z * z < 60 && kind !== 'pebble') return false;
      props.push({ kind, x, z, ry, sx, sy, sz, rx, rz });
      return true;
    };
    const rx = () => ox + rng() * CHUNK;
    const rz = () => oz + rng() * CHUNK;

    // Colonnade: a broken row of pillars with a fallen one.
    if (rng() < 0.45) {
      const x0 = rx(), z0 = rz(), a = rng() * Math.PI;
      const n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const x = x0 + Math.cos(a) * i * 3.2, z = z0 + Math.sin(a) * i * 3.2;
        if (rng() < 0.2) {
          add('pillar', x + 1.5, z, rng() * 3, 1, 2.6 + rng() * 2, 1, 0, Math.PI / 2);
          continue;
        }
        const h = rng() < 0.4 ? 1 + rng() * 1.5 : 3.5 + rng() * 2.5;
        if (add('pillar', x, z, rng() * 3, 1, h, 1)) solids.push({ x, z, r: 0.55 });
      }
    }
    if (rng() < 0.35) {
      const x = rx(), z = rz(), a = rng() * Math.PI;
      if (add('wall', x, z, a, 1)) {
        for (let i = -1; i <= 1; i++) solids.push({ x: x + Math.cos(a) * i * 1.2, z: z - Math.sin(a) * i * 1.2, r: 0.7 });
      }
    }
    // Graveyard patch.
    if (rng() < 0.35) {
      const x0 = rx(), z0 = rz(), rows = 2 + Math.floor(rng() * 3), a = rng() * 0.4 - 0.2;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < 4; c++)
          if (rng() < 0.8) add('grave', x0 + c * 1.6 + rng() * 0.3, z0 + r * 2 + rng() * 0.3, a + (rng() - 0.5) * 0.3, 0.8 + rng() * 0.5, 0.8 + rng() * 0.6, 1, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3);
    }
    const nRocks = Math.floor(rng() * 5);
    for (let i = 0; i < nRocks; i++) {
      const s = 0.4 + rng() * 1.3, x = rx(), z = rz();
      if (add('rock', x, z, rng() * 6, s, s, s * (0.8 + rng() * 0.4)) && s > 0.8) solids.push({ x, z, r: s * 0.8 });
    }
    const nTrees = Math.floor(rng() * 3);
    for (let i = 0; i < nTrees; i++) {
      const x = rx(), z = rz();
      if (add('tree', x, z, rng() * 6, 0.8 + rng() * 0.6, 0.8 + rng() * 0.7, 0.8 + rng() * 0.6, (rng() - 0.5) * 0.3)) solids.push({ x, z, r: 0.35 });
    }
    if (rng() < 0.4) {
      const x = rx(), z = rz();
      if (add('crystal', x, z, rng() * 6, 0.8 + rng() * 0.8)) solids.push({ x, z, r: 0.6 });
    }
    const braziers = [];
    if (rng() < 0.4) {
      const x = rx(), z = rz();
      if (add('brazier', x, z, 0, 1)) {
        solids.push({ x, z, r: 0.4 });
        braziers.push({ x, z, phase: rng() * 10 });
      }
    }
    for (let i = 0; i < 40; i++) add('pebble', rx(), rz(), rng() * 6, 0.06 + rng() * 0.18);
    return { props, solids, braziers };
  }

  #refresh(ccx, ccz) {
    const want = new Set();
    for (let dx = -VIEW; dx <= VIEW; dx++)
      for (let dz = -VIEW; dz <= VIEW; dz++) {
        const k = `${ccx + dx},${ccz + dz}`;
        want.add(k);
        if (!this.chunks.has(k)) this.chunks.set(k, this.#genChunk(ccx + dx, ccz + dz));
      }
    for (const k of this.chunks.keys()) if (!want.has(k)) this.chunks.delete(k);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const kind of Object.values(this.kinds)) kind.mesh.count = 0;
    this.solids = [];
    this.braziers = [];
    for (const ch of this.chunks.values()) {
      this.solids.push(...ch.solids);
      this.braziers.push(...ch.braziers);
      for (const pr of ch.props) {
        const kind = this.kinds[pr.kind];
        if (kind.mesh.count >= kind.cap) continue;
        e.set(pr.rx, pr.ry, pr.rz);
        q.setFromEuler(e);
        p.set(pr.x, pr.rz ? 0.45 : 0, pr.z);
        s.set(pr.sx, pr.sy, pr.sz);
        m.compose(p, q, s);
        kind.mesh.setMatrixAt(kind.mesh.count++, m);
      }
    }
    for (const kind of Object.values(this.kinds)) kind.mesh.instanceMatrix.needsUpdate = true;
  }

  // Push a circle out of solid props.
  collide(ent, r) {
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      const dx = ent.x - s.x, dz = ent.z - s.z;
      const rr = r + s.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        ent.x = s.x + (dx / d) * rr;
        ent.z = s.z + (dz / d) * rr;
      }
    }
  }

  setBiome(b, instant = false) {
    this.biomeFrom = this.#snapshot();
    this.biome = b;
    this.biomeT = instant ? 1 : 0;
    if (instant) this.#applyBiome(1);
  }

  #snapshot() {
    const sc = this.game.scene;
    return {
      fog: sc.fog.color.clone(),
      fogD: sc.fog.density,
      sky: this.hemi.color.clone(),
      ground: this.hemi.groundColor.clone(),
      moon: this.moon.color.clone(),
      torch: this.torch.color.clone(),
      crystal: this.crystalMat.emissive.clone(),
      tint: this.groundTint.value.clone(),
    };
  }

  #applyBiome(t) {
    const b = this.biome, f = this.biomeFrom || this.#snapshot();
    const sc = this.game.scene;
    const C = (hex) => new THREE.Color(hex);
    sc.fog.color.copy(f.fog).lerp(C(b.fog), t);
    sc.background.copy(sc.fog.color);
    sc.fog.density = lerp(f.fogD, b.fogDensity, t);
    this.hemi.color.copy(f.sky).lerp(C(b.sky), t);
    this.hemi.groundColor.copy(f.ground).lerp(C(b.ground), t);
    this.moon.color.copy(f.moon).lerp(C(b.moon), t);
    this.torch.color.copy(f.torch).lerp(C(b.torch), t);
    this.crystalMat.emissive.copy(f.crystal).lerp(new THREE.Color(...b.crystal), t);
    this.groundTint.value.copy(f.tint).lerp(new THREE.Vector3(...b.groundTint), t);
  }

  update(dt, px, pz, time) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const key = `${ccx},${ccz}`;
    if (key !== this.center) {
      this.center = key;
      this.#refresh(ccx, ccz);
    }
    this.ground.position.set(Math.round(px / TILE) * TILE, 0, Math.round(pz / TILE) * TILE);

    // Moonlight follows the player, snapped to shadow texels to avoid shimmer.
    const texel = 56 / 2048;
    const sx = Math.round(px / texel) * texel, sz = Math.round(pz / texel) * texel;
    this.moon.target.position.set(sx, 0, sz);
    this.moon.position.set(sx - 14, 30, sz - 12);

    // Braziers: fire particles for the near ones, real lights for the nearest four.
    const near = [];
    for (const b of this.braziers) {
      const d = (b.x - px) ** 2 + (b.z - pz) ** 2;
      if (d < 38 * 38) {
        near.push([d, b]);
        if (Math.random() < dt * 40) {
          const P = this.game.particles;
          P.spawn(b.x + (Math.random() - 0.5) * 0.5, 1.3, b.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4,
            0.6 + Math.random() * 0.5, 0.5 + Math.random() * 0.4, 2.6, 0.75, 0.12, -0.5, 0.5, 0.1);
        }
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.fireLights.length; i++) {
      const l = this.fireLights[i];
      const b = near[i]?.[1];
      if (!b) { l.intensity = 0; continue; }
      l.position.set(b.x, 1.9, b.z);
      l.intensity = 16 + Math.sin(time * 13 + b.phase) * 4 + Math.sin(time * 7.3 + b.phase * 2) * 4;
    }

    if (this.biomeT < 1) {
      this.biomeT = Math.min(1, this.biomeT + dt / 3);
      this.#applyBiome(this.biomeT);
    }
  }
}
