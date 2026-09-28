import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFlagstones } from './textures.js';
import { mulberry32, hash2, lerp } from '../core/rng.js';
import { BIOMES } from '../content/biomes.js';
import { enhance } from '../art/enhance.js';
import { archGeometry, statueGeometry, candleGeometry, bonesGeometry, fenceGeometry, sarcophagusGeometry, decalTextures } from './props.js';

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

// A fixed shrine around the descent point, framing the hero on the title screen.
const SHRINE = [
  ['arch', -3.5, -10, 0, 1.1],
  ['statue', -9, -8.5, 0.35, 1],
  ['statue', 2.2, -9.5, -0.3, 1],
  ['candles', -8, -7, 0, 1], ['candles', 1.2, -8, 1, 0.9], ['candles', -5.4, -9.2, 2, 0.8], ['candles', -1.6, -9.4, 3, 0.7],
  ['brazier', -12.5, -4, 0, 1], ['brazier', 5.5, -5, 0, 1],
  ['bones', -11, -1.5, 1, 1], ['bones', 6, -1, 2.4, 0.9],
  ['rune', 0, 0, 0, 7.5],
  ['stain', -6, 3, 1, 3], ['crack', 3.5, 4.5, 2, 3.5],
];

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
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.085, 0.08), ash * 0.6);
          // standing water: darker, glossy patches that catch the torchlight
          float wetK = smoothstep(0.66, 0.76, vnoise(vWPos.xz * 0.075 + 31.0) * 0.8 + vnoise(vWPos.xz * 0.4) * 0.2);
          diffuseColor.rgb *= 1.0 - wetK * 0.5;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.32, wetK);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(mix(normal, nonPerturbedNormal, wetK));`);
    };
    const ggeo = new THREE.PlaneGeometry(size, size);
    ggeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(ggeo, gmat);
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    // Props (instanced per kind) --------------------------------------
    // Textured, world-space triplanar stone so ruins never show seams or stretching.
    const stoneOpts = { tex: 'stone', space: 'world', scale: 0.45, bump: 1.4, ao: 1.6, aoMin: 0.3, texSize: 512 };
    const stone = enhance(new THREE.MeshStandardMaterial({ color: 0xd8d0c4, roughness: 1 }), stoneOpts);
    const darkStone = enhance(new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 1, flatShading: true }), stoneOpts);
    const wood = enhance(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), { tex: 'bark', scale: 1.5, bump: 1.5, ao: 1.2, aoMin: 0.4 });
    const iron = enhance(new THREE.MeshStandardMaterial({ color: 0xa0a0a8, roughness: 1, metalness: 0.8, envMap: game.gfx.env, envMapIntensity: 0.6 }), { tex: 'iron', scale: 2, bump: 1, ao: 1, aoMin: 0.4 });
    this.crystalMat = new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.2, metalness: 0.2, emissive: new THREE.Color(0.3, 2.6, 3.2), flatShading: true });
    const bone = enhance(new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 1 }), { tex: 'bone', scale: 3, bump: 1, ao: 1.2, aoMin: 0.5 });
    const wax = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6, emissive: new THREE.Color(0.16, 0.08, 0.02) });
    this.time = { value: 0 };
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.1, 0.7) });
    flameMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fph = dot(instanceMatrix[3].xz, vec2(1.37, 2.11)) + position.x * 40.0;
          transformed.y *= 1.0 + 0.22 * sin(uTime * 13.0 + fph) + 0.12 * sin(uTime * 23.0 + fph * 1.7);`);
    };
    const decals = decalTextures();
    this.runeMat = new THREE.MeshBasicMaterial({ map: decals.rune, color: new THREE.Color(0.3, 2.6, 3.2).multiplyScalar(0.26), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const decal = (map, color) => new THREE.MeshStandardMaterial({ map, color, roughness: 0.7, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const candles = candleGeometry();

    const kinds = {
      pillar: { geo: pillarGeometry(), mat: stone, cap: 220, shadow: true },
      rock: { geo: rockGeometry(5), mat: darkStone, cap: 500, shadow: true },
      grave: { geo: graveGeometry(), mat: stone, cap: 400, shadow: true },
      tree: { geo: treeGeometry(), mat: wood, cap: 150, shadow: true },
      crystal: { geo: crystalGeometry(), mat: this.crystalMat, cap: 120, shadow: false },
      brazier: { geo: brazierGeometry(), mat: iron, cap: 60, shadow: true },
      wall: { geo: wallGeometry(), mat: stone, cap: 120, shadow: true },
      pebble: { geo: rockGeometry(8), mat: darkStone, cap: 1600, shadow: false },
      arch: { geo: archGeometry(), mat: stone, cap: 60, shadow: true },
      statue: { geo: statueGeometry(), mat: stone, cap: 60, shadow: true },
      sarcophagus: { geo: sarcophagusGeometry(), mat: stone, cap: 60, shadow: true },
      fence: { geo: fenceGeometry(), mat: iron, cap: 160, shadow: true },
      bones: { geo: bonesGeometry(), mat: bone, cap: 300, shadow: false },
      candles: { geo: candles.wax, mat: wax, cap: 300, shadow: false, extra: [[candles.flame, flameMat]] },
      rune: { geo: flat, mat: this.runeMat, cap: 40, shadow: false, y: 0.02 },
      stain: { geo: flat, mat: decal(decals.stain, new THREE.Color(0.09, 0.02, 0.015)), cap: 300, shadow: false, y: 0.012 },
      crack: { geo: flat, mat: decal(decals.crack, new THREE.Color(0.02, 0.018, 0.016)), cap: 300, shadow: false, y: 0.014 },
    };
    this.kinds = kinds;
    for (const k of Object.values(kinds)) {
      k.meshes = [[k.geo, k.mat], ...(k.extra || [])].map(([geo, mat]) => {
        const mesh = new THREE.InstancedMesh(geo, mat, k.cap);
        mesh.castShadow = k.shadow;
        mesh.receiveShadow = !k.y;
        mesh.count = 0;
        mesh.frustumCulled = false;
        scene.add(mesh);
        return mesh;
      });
      k.mesh = k.meshes[0];
    }
    this.#atmosphere(game);

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
    // Gothic arch, sometimes with candles at its feet.
    if (rng() < 0.3) {
      const x = rx(), z = rz(), a = rng() * Math.PI;
      if (add('arch', x, z, a, 0.9 + rng() * 0.3)) {
        for (const sx of [-1, 1]) solids.push({ x: x + Math.cos(a) * sx * 1.55, z: z - Math.sin(a) * sx * 1.55, r: 0.55 });
        if (rng() < 0.5) add('candles', x + Math.cos(a) * 1.55 + Math.sin(a) * 0.8, z - Math.sin(a) * 1.55 + Math.cos(a) * 0.8, rng() * 6, 0.8 + rng() * 0.3);
      }
    }
    // Mourning statue with candles and bones at its plinth.
    if (rng() < 0.28) {
      const x = rx(), z = rz(), a = rng() * Math.PI * 2;
      if (add('statue', x, z, a, 0.9 + rng() * 0.25)) {
        solids.push({ x, z, r: 0.8 });
        for (let i = 0; i < 2; i++) {
          const b = a + (i ? 0.9 : -0.9);
          add('candles', x + Math.sin(b) * 1.1, z + Math.cos(b) * 1.1, rng() * 6, 0.7 + rng() * 0.4);
        }
        if (rng() < 0.5) add('bones', x + Math.sin(a) * 1.4, z + Math.cos(a) * 1.4, rng() * 6, 1);
      }
    }
    if (rng() < 0.22) {
      const x = rx(), z = rz(), a = rng() * Math.PI;
      if (add('sarcophagus', x, z, a, 1)) {
        solids.push({ x, z, r: 0.9 }, { x: x + Math.sin(a) * 0.8, z: z + Math.cos(a) * 0.8, r: 0.7 }, { x: x - Math.sin(a) * 0.8, z: z - Math.cos(a) * 0.8, r: 0.7 });
        add('candles', x + Math.cos(a) * 0.9, z - Math.sin(a) * 0.9, rng() * 6, 0.8);
      }
    }
    if (rng() < 0.3) {
      const x = rx(), z = rz(), a = rng() * Math.PI;
      if (add('fence', x, z, a, 1)) for (const sx of [-1, 0, 1]) solids.push({ x: x + Math.cos(a) * sx * 1.2, z: z - Math.sin(a) * sx * 1.2, r: 0.3 });
    }
    const nBones = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < nBones; i++) add('bones', rx(), rz(), rng() * 6, 0.8 + rng() * 0.5);
    // Floor decals: stains, cracks and the occasional rune circle.
    const nStains = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < nStains; i++) add(rng() < 0.55 ? 'stain' : 'crack', rx(), rz(), rng() * 6, 1.5 + rng() * 2.5);
    if (rng() < 0.1) add('rune', rx(), rz(), rng() * 6, 4 + rng() * 3);
    for (let i = 0; i < 40; i++) add('pebble', rx(), rz(), rng() * 6, 0.06 + rng() * 0.18);
    // The spawn shrine.
    for (const [kind, x, z, ry, sc] of SHRINE) {
      if (Math.floor(x / CHUNK) !== cx || Math.floor(z / CHUNK) !== cz) continue;
      props.push({ kind, x, z, ry, sx: sc, sy: sc, sz: sc, rx: 0, rz: 0 });
      if (kind === 'statue') solids.push({ x, z, r: 0.8 });
      if (kind === 'brazier') { solids.push({ x, z, r: 0.4 }); braziers.push({ x, z, phase: x }); }
      if (kind === 'arch') for (const sx of [-1, 1]) solids.push({ x: x + sx * 1.7, z, r: 0.6 });
    }
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
    for (const kind of Object.values(this.kinds)) for (const mesh of kind.meshes) mesh.count = 0;
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
        p.set(pr.x, kind.y ?? (pr.rz ? 0.45 : 0), pr.z);
        s.set(pr.sx, pr.sy, pr.sz);
        m.compose(p, q, s);
        for (const mesh of kind.meshes) mesh.setMatrixAt(mesh.count++, m);
      }
    }
    for (const kind of Object.values(this.kinds)) for (const mesh of kind.meshes) mesh.instanceMatrix.needsUpdate = true;
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
      motes: this.motes.material.uniforms.uColor.value.clone(),
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
    this.runeMat.color.copy(this.crystalMat.emissive).multiplyScalar(0.26);
    this.motes.material.uniforms.uColor.value.copy(f.motes).lerp(new THREE.Color(...b.motes), t);
    this.mist.material.uniforms.uColor.value.copy(this.torch.color).multiplyScalar(0.16).lerp(sc.fog.color, 0.5);
  }

  // Drifting embers (or snow, or sparks) and a thin ground mist that follow the player.
  #atmosphere(game) {
    const N = 480;
    const geo = new THREE.BufferGeometry();
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.motes = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uCenter: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(...this.biome.motes) }, uSize: { value: 70 * Math.min(2, devicePixelRatio) } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform vec3 uCenter; uniform float uSize; varying float vA;
        void main() {
          vec3 box = vec3(40.0, 7.0, 40.0);
          vec3 p = aSeed.xyz * box;
          p += vec3(sin(uTime * 0.31 + aSeed.w * 6.28) * 0.9 + uTime * 0.22, uTime * (0.18 + aSeed.w * 0.3), cos(uTime * 0.23 + aSeed.w * 9.0) * 0.9);
          vec3 lo = uCenter - vec3(box.x * 0.5, 0.0, box.z * 0.5);
          p = mod(p - lo, box) + lo;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = (0.55 + 0.45 * sin(uTime * 2.7 + aSeed.w * 40.0)) * smoothstep(0.0, 1.2, p.y) * (1.0 - smoothstep(4.5, 7.0, p.y));
          gl_PointSize = uSize * (0.4 + aSeed.w * 0.8) / -mv.z;
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          gl_FragColor = vec4(uColor * vA * (1.0 - r), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.motes.frustumCulled = false;
    game.scene.add(this.motes);

    const mgeo = new THREE.PlaneGeometry(64, 64).rotateX(-Math.PI / 2);
    this.mist = new THREE.Mesh(mgeo, new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uColor: { value: new THREE.Color(0.2, 0.15, 0.12) }, uCenter: { value: new THREE.Vector2() } },
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform vec2 uCenter; varying vec3 vW;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vW.xz * 0.11;
          float m = n(p + vec2(uTime * 0.06, uTime * 0.025)) * 0.6 + n(p * 2.3 - vec2(uTime * 0.08, -uTime * 0.035)) * 0.4;
          m = smoothstep(0.42, 0.9, m);
          float d = distance(vW.xz, uCenter);
          float fade = 1.0 - smoothstep(16.0, 30.0, d);
          float lit = 0.5 + 1.6 * exp(-d * d / 60.0);
          gl_FragColor = vec4(uColor * lit, m * fade * 0.3);
        }`,
      transparent: true, depthWrite: false,
    }));
    this.mist.position.y = 0.3;
    this.mist.renderOrder = 1;
    game.scene.add(this.mist);
  }

  update(dt, px, pz, time) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const key = `${ccx},${ccz}`;
    if (key !== this.center) {
      this.center = key;
      this.#refresh(ccx, ccz);
    }
    this.ground.position.set(Math.round(px / TILE) * TILE, 0, Math.round(pz / TILE) * TILE);
    this.time.value = time;
    this.motes.material.uniforms.uCenter.value.set(px, 0, pz);
    this.mist.position.x = px;
    this.mist.position.z = pz;
    this.mist.material.uniforms.uCenter.value.set(px, pz);

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
