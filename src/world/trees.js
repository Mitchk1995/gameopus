import * as THREE from 'three';
import { Tree } from '../vendor/ez-tree/tree.js';
import { loadPreset } from '../vendor/ez-tree/presets/index.js';
import { WORLD, VILLAGE, FARMS, BANDIT_CAMP, LAKE, forestDensity, roadDistance, noise } from './map.js';

// Forests. Each species variant is generated once with ez-tree in two levels of
// detail, plus a flat "impostor" picture of it for far away. Every tree in the world
// is an instance, so a whole forest is a handful of draw calls; which level each tree
// uses is re-sorted a few times a second as you move.

const SPECIES = {
  oak: { presets: ['Oak Medium', 'Oak Large'], scale: [0.16, 0.2], trunk: 0.5 },
  ash: { presets: ['Ash Medium', 'Ash Large'], scale: [0.14, 0.17], trunk: 0.45 },
  aspen: { presets: ['Aspen Medium', 'Aspen Large'], scale: [0.15, 0.18], trunk: 0.35 },
  pine: { presets: ['Pine Medium', 'Pine Large'], scale: [0.2, 0.25], trunk: 0.45 },
  bush: { presets: ['Bush 1', 'Bush 2'], scale: [0.06, 0.08], trunk: 0 },
};
const NEAR = 40, MID = 150;
const BARK = ['oak', 'birch', 'pine', 'willow'];
const LEAVES = ['ash', 'aspen', 'oak', 'pine'];

export class Forest {
  constructor({ scene, assets, terrain, renderer }) {
    this.scene = scene;
    this.assets = assets;
    this.terrain = terrain;
    this.renderer = renderer;
    this.time = { value: 0 };
    this.variants = [];
    this.trees = [];
    this.cells = new Map();
    this.lastUpdate = new THREE.Vector3(1e9, 0, 0);
  }

  async load() {
    const bark = {}, leaves = {};
    await Promise.all([
      ...BARK.map(async (b) => {
        const [map, normalMap, roughnessMap] = await Promise.all(['color', 'normal', 'roughness'].map((k) => this.assets.texture(`trees/${b}_${k}.webp`, { srgb: k === 'color' })));
        bark[b] = { map, normalMap, roughnessMap };
      }),
      ...LEAVES.map(async (l) => { leaves[l] = await this.assets.texture(`trees/leaves_${l}.webp`, { repeat: false }); }),
    ]);
    this.barkTex = bark;
    this.leafTex = leaves;

    let seed = 11;
    for (const [species, def] of Object.entries(SPECIES))
      for (const preset of def.presets) this.variants.push(this.#variant(species, preset, seed++));
    this.#place();
    for (const v of this.variants) this.#instances(v);
    return this;
  }

  #variant(species, preset, seed) {
    const opts = loadPreset(preset);
    opts.seed = seed * 7919;
    // Near detail: the preset, a little lighter.
    for (const k of Object.keys(opts.branch.sections)) opts.branch.sections[k] = Math.max(1, Math.round(opts.branch.sections[k] * 0.65));
    for (const k of Object.keys(opts.branch.segments)) opts.branch.segments[k] = Math.min(opts.branch.segments[k], k === '0' ? 7 : 5);
    opts.leaves.count = Math.max(1, Math.round(opts.leaves.count * 0.75));
    opts.leaves.size *= 1.12;
    const near = new Tree();
    near.loadFromJson(opts);
    // Mid detail: fewer, bigger leaf cards and thinner branch meshes.
    const lite = structuredClone(opts);
    for (const k of Object.keys(lite.branch.sections)) lite.branch.sections[k] = Math.max(1, Math.round(lite.branch.sections[k] * 0.5));
    for (const k of Object.keys(lite.branch.segments)) lite.branch.segments[k] = Math.max(3, Math.round(lite.branch.segments[k] * 0.6));
    lite.leaves.count = Math.max(1, Math.round(lite.leaves.count * 0.45));
    lite.leaves.size *= 1.45;
    const mid = new Tree();
    mid.loadFromJson(lite);

    const barkType = BARK.includes(opts.bark.type) ? opts.bark.type : 'oak';
    const leafType = LEAVES.includes(opts.leaves.type) ? opts.leaves.type : 'oak';
    // Texture clones share the image but keep their own tiling per variant.
    const tex = {};
    for (const [k, t] of Object.entries(this.barkTex[barkType])) {
      tex[k] = t.clone();
      tex[k].repeat.set(opts.bark.textureScale.x, 1 / opts.bark.textureScale.y);
    }
    const barkMat = new THREE.MeshStandardMaterial({ ...tex, color: new THREE.Color(opts.bark.tint), roughness: 1 });
    // Aspen leaves ship in autumn gold; the valley is in summer.
    const leafTint = leafType === 'aspen' ? new THREE.Color().setRGB(0.26, 0.62, 0.42, THREE.LinearSRGBColorSpace) : new THREE.Color(opts.leaves.tint);
    const leafMat = this.#leafMaterial(this.leafTex[leafType], leafTint);
    const box = new THREE.Box3().setFromObject(near);
    const height = box.max.y - box.min.y;
    return {
      species, preset, seed, height, barkMat, leafMat,
      near: { branches: near.branchesMesh.geometry, leaves: near.leavesMesh.geometry },
      mid: { branches: mid.branchesMesh.geometry, leaves: mid.leavesMesh.geometry },
      impostor: this.#impostor(near, box, barkMat, leafMat),
      trees: [],
    };
  }

  #leafMaterial(map, tint) {
    const mat = new THREE.MeshStandardMaterial({ map, color: tint, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 wBase = instanceMatrix[3].xyz;
          #else
            vec3 wBase = vec3(0.0);
          #endif
          float wPh = wBase.x * 0.21 + wBase.z * 0.17;
          float sway = sin(uTime * 1.3 + wPh) * 0.6 + sin(uTime * 2.7 + wPh * 1.7) * 0.25;
          float heightK = clamp(position.y / 60.0, 0.0, 1.0);
          transformed.x += sway * heightK * 1.4;
          transformed.z += cos(uTime * 1.1 + wPh) * heightK * 0.9;
          transformed += normal * sin(uTime * 6.0 + position.x * 0.9 + position.z * 1.1) * 0.25 * uv.y;`);
      // Leaves glow a little when the sun is behind them.
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.18;`);
    };
    return mat;
  }

  // Renders a variant from two sides into one texture, used on crossed quads far away.
  // Each view gets its own viewport and scissor, so the second render's clear leaves the
  // first alone. No MSAA: resolving a multisampled target discards the other half.
  #impostor(tree, box, barkMat, leafMat) {
    const W = 256, H = 512;
    const rt = new THREE.WebGLRenderTarget(W * 2, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, colorSpace: THREE.SRGBColorSpace });
    rt.scissorTest = true;
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(tree.branchesMesh.geometry, barkMat), new THREE.Mesh(tree.leavesMesh.geometry, leafMat));
    scene.environment = this.scene.environment;
    scene.environmentIntensity = this.scene.environmentIntensity ?? 1;
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(0.5, 1, 0.8);
    scene.add(sun);
    const size = new THREE.Vector3();
    box.getSize(size);
    const half = Math.max(size.x, size.z, size.y * 0.5) * 0.55;
    const cam = new THREE.OrthographicCamera(-half, half, box.max.y, box.min.y, -500, 500);
    const r = this.renderer;
    const prev = { target: r.getRenderTarget(), color: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha() };
    r.setClearColor(0x000000, 0);
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI / 2;
      cam.position.set(Math.sin(a) * 100, 0, Math.cos(a) * 100);
      cam.lookAt(0, 0, 0);
      rt.viewport.set(i * W, 0, W, H);
      rt.scissor.set(i * W, 0, W, H);
      r.setRenderTarget(rt);
      r.render(scene, cam);
    }
    r.setRenderTarget(prev.target);
    r.setClearColor(prev.color, prev.alpha);
    return { texture: rt.texture, target: rt, width: half * 2, bottom: box.min.y, top: box.max.y };
  }

  #place() {
    const rnd = mulberry(4242);
    const T = this.terrain;
    const step = 5.2;
    const ok = (x, z, clearance) => {
      const h = T.heightAt(x, z);
      if (h < 0.9 || h > 72) return false;
      if (T.normalAt(x, z).y < 0.8) return false;
      if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 8) return false;
      if (Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z) < BANDIT_CAMP.r) return false;
      const [rd, rw] = roadDistance(x, z);
      if (rd < rw + clearance) return false;
      for (const f of FARMS) if (Math.abs(x - f.x) < f.w / 2 + 6 && Math.abs(z - f.z) < f.d / 2 + 6) return false;
      return true;
    };
    for (let z = -WORLD.half + 20; z < WORLD.half - 20; z += step)
      for (let x = -WORLD.half + 20; x < WORLD.half - 20; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
        const [d, kinds] = forestDensity(px, pz);
        const clump = noise(px * 0.05, pz * 0.05);
        let species = null;
        if (d > 0 && rnd() < d * (0.45 + clump * 0.7)) species = kinds[Math.floor(rnd() * kinds.length)];
        else if (rnd() < 0.006 + (Math.hypot(px - LAKE.x, pz - LAKE.z) < LAKE.r + 40 ? 0.01 : 0)) species = rnd() < 0.5 ? 'oak' : 'aspen';
        else if (d > 0.2 && rnd() < 0.12) species = 'bush';
        if (!species || !ok(px, pz, species === 'bush' ? 1.5 : 3)) continue;
        const options = this.variants.filter((v) => v.species === species);
        const v = options[Math.floor(rnd() * options.length)];
        const [s0, s1] = SPECIES[species].scale;
        const s = s0 + (s1 - s0) * rnd();
        const tree = { x: px, z: pz, y: T.heightAt(px, pz) - 0.2, rot: rnd() * Math.PI * 2, scale: s, variant: v, radius: SPECIES[species].trunk * s * 5, id: this.trees.length };
        v.trees.push(tree);
        this.trees.push(tree);
        const key = `${Math.floor(px / 16)},${Math.floor(pz / 16)}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(tree);
      }
  }

  #instances(v) {
    const n = v.trees.length;
    const make = (geo, mat, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.count = 0;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    v.meshes = {
      nearB: make(v.near.branches, v.barkMat, false),
      nearL: make(v.near.leaves, v.leafMat, false),
      midB: make(v.mid.branches, v.barkMat, false),
      midL: make(v.mid.leaves, v.leafMat, false),
      // Near trees cast their shadows with the lighter mid-detail geometry: these
      // copies live on layer 1, which only the sun's shadow camera renders.
      shadowB: make(v.mid.branches, v.barkMat, true),
      shadowL: make(v.mid.leaves, v.leafMat, true),
    };
    v.meshes.shadowB.layers.set(1);
    v.meshes.shadowL.layers.set(1);
    const imp = v.impostor;
    const quad = new THREE.PlaneGeometry(imp.width, imp.top - imp.bottom);
    quad.translate(0, (imp.top + imp.bottom) / 2, 0);
    const a = quad.clone(), b = quad.clone().rotateY(Math.PI / 2);
    const uvA = a.attributes.uv, uvB = b.attributes.uv;
    for (let i = 0; i < uvA.count; i++) {
      uvA.setX(i, uvA.getX(i) * 0.5);
      uvB.setX(i, uvB.getX(i) * 0.5 + 0.5);
    }
    const cross = new THREE.BufferGeometry();
    for (const attr of ['position', 'normal', 'uv']) {
      const arr = new Float32Array(a.attributes[attr].array.length * 2);
      arr.set(a.attributes[attr].array);
      arr.set(b.attributes[attr].array, a.attributes[attr].array.length);
      cross.setAttribute(attr, new THREE.BufferAttribute(arr, a.attributes[attr].itemSize));
    }
    const ia = a.index.array, idx = [...ia, ...Array.from(ia, (k) => k + a.attributes.position.count)];
    cross.setIndex(idx);
    // Mipmaps average leaf coverage down, so alpha is boosted to keep far crowns full.
    const farMat = new THREE.MeshBasicMaterial({ map: imp.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    farMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a = clamp(diffuseColor.a * 2.2, 0.0, 1.0);\n#include <alphatest_fragment>');
    };
    v.meshes.far = make(cross, farMat, false);
    this.m4 = new THREE.Matrix4();
  }

  // Sort trees into near / mid / far instance buffers around the camera, leaving out
  // trees outside the view (except close ones, whose shadows can still fall in view).
  // Re-sorted when the camera moves or turns enough to matter.
  update(dt, camera) {
    this.time.value += dt;
    const pos = camera.position;
    this.lastQuat ??= new THREE.Quaternion(0, 0, 0, 0);
    const turned = 1 - Math.abs(this.lastQuat.dot(camera.quaternion)) > 0.0004;
    if (pos.distanceToSquared(this.lastUpdate) < 1 && !turned) return;
    this.lastUpdate.copy(pos);
    this.lastQuat.copy(camera.quaternion);
    camera.updateMatrixWorld();
    this.frustum ??= new THREE.Frustum();
    this.pv ??= new THREE.Matrix4();
    this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sphere = this.sphere ??= new THREE.Sphere();
    for (const v of this.variants) {
      const M = v.meshes;
      M.nearB.count = M.nearL.count = M.midB.count = M.midL.count = M.far.count = M.shadowB.count = M.shadowL.count = 0;
      for (const t of v.trees) {
        if (t.felled) continue;
        const d = Math.hypot(t.x - pos.x, t.z - pos.z);
        t.matrix ??= new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot), new THREE.Vector3().setScalar(t.scale));
        // Close trees throw shadows even when out of view.
        if (d < NEAR * 0.8) {
          M.shadowB.setMatrixAt(M.shadowB.count++, t.matrix);
          M.shadowL.setMatrixAt(M.shadowL.count++, t.matrix);
        }
        if (d > 22) {
          sphere.center.set(t.x, t.y + v.height * t.scale * 0.5, t.z);
          sphere.radius = v.height * t.scale * 0.62;
          if (!this.frustum.intersectsSphere(sphere)) continue;
        }
        if (d < NEAR) {
          M.nearB.setMatrixAt(M.nearB.count++, t.matrix);
          M.nearL.setMatrixAt(M.nearL.count++, t.matrix);
        } else if (d < MID) {
          M.midB.setMatrixAt(M.midB.count++, t.matrix);
          M.midL.setMatrixAt(M.midL.count++, t.matrix);
        } else {
          M.far.setMatrixAt(M.far.count++, t.matrix);
        }
      }
      for (const mesh of Object.values(M)) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Trees whose trunks are near a point (for collision and interaction).
  near(x, z, r = 4) {
    const out = [];
    const c0 = Math.floor((x - r) / 16), c1 = Math.floor((x + r) / 16), r0 = Math.floor((z - r) / 16), r1 = Math.floor((z + r) / 16);
    for (let cz = r0; cz <= r1; cz++)
      for (let cx = c0; cx <= c1; cx++)
        for (const t of this.cells.get(`${cx},${cz}`) || []) if (!t.felled && Math.hypot(t.x - x, t.z - z) < r + t.radius) out.push(t);
    return out;
  }
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
