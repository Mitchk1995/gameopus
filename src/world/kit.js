import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidsFor } from './props.js';

// The two Quaternius kits (medieval village pieces and fantasy props) as named
// templates, and a batcher that bakes every placed static piece into one mesh per
// material, so a whole village is a few dozen draw calls.

// Kit parts smaller than this in every direction (metres) don't count as solid for the camera.
const TINY = 0.5;
const PASSABLE = /^Door_\d/;

export class Kit {
  constructor(assets) {
    this.assets = assets;
    this.parts = new Map();
  }

  async load() {
    const [village, props] = await Promise.all([this.assets.model('kits/village.glb'), this.assets.model('kits/props.glb')]);
    for (const g of [village, props])
      for (const o of g.scene.children) {
        o.updateMatrixWorld(true);
        this.parts.set(o.name, o);
      }
    return this;
  }

  has(name) {
    return this.parts.has(name);
  }

  // Local bounds of a part, cached.
  bounds(name) {
    const p = this.part(name);
    return (p.userData.box ??= new THREE.Box3().setFromObject(p));
  }

  // Height of the part's top surface at a point in its own frame (-Infinity where there is none).
  topAt(name, x, z) {
    const rc = (this.ray ??= new THREE.Raycaster());
    rc.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
    const hit = rc.intersectObject(this.part(name), true);
    return hit.length ? hit[0].point.y : -Infinity;
  }

  // The prop's solid shapes in its own frame (see props.js).
  solids(name) {
    return solidsFor(this, name);
  }

  part(name) {
    const p = this.parts.get(name);
    if (!p) throw new Error(`kit part ${name} missing`);
    return p;
  }

  // A live copy (for things that move or get removed), wrapped so the wrapper's
  // transform places it.
  instance(name) {
    const o = new THREE.Group();
    o.userData.fromKit = name;
    o.add(this.part(name).clone(true));
    o.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return o;
  }
}

export class Batcher {
  constructor(kit) {
    this.kit = kit;
    this.groups = new Map();
    this.m = new THREE.Matrix4();
    // Every piece placed, kept as data (name, world matrix, optional meta) so the geometry
    // audit (tests/playtest/geometry.py) can check what the world is made of.
    this.log = [];
  }

  // Adds a kit part at a world transform: (name, matrix, meta) or
  // (name, x, y, z, rotationY, scale, meta). Meta is free-form ({ role, ... }); `meta.swap` maps kit
  // material names to replacements ({ MI_Plaster: ochreWash }), how a house gets its own colours.
  add(name, x, y, z, rotY = 0, scale = 1, meta = null) {
    if (typeof x === 'object') meta = y ?? null;
    const matrix = typeof x === 'object' ? x : new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, scale, scale));
    this.addObject(this.kit.part(name), matrix, null, false, meta?.swap);
    this.log.push({ name, m: matrix.elements.slice(), meta });
    return matrix;
  }

  // Parts sit at the kit's origin, and their own node transforms carry the
  // dequantisation from meshopt, so they're kept as part of the piece.
  // `meta` labels a procedural object ({ label, id, soft... }) for the audit; kit parts log
  // themselves in add().
  addObject(root, matrix, meta = null, log = true, swap = null) {
    root.updateMatrixWorld(true);
    // Decorative bits (mugs, bottles, lanterns, candles) are drawn but never hold the camera
    // off, and neither do door leaves: you walk through them, so the camera does too.
    const box = (root.userData.box ??= new THREE.Box3().setFromObject(root));
    // Soft things you walk through (crops, washing) don't hold the camera off either.
    this.tiny = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) < TINY || PASSABLE.test(root.name) || !!meta?.soft;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld);
      if (log && meta) this.log.push({ proc: true, meta, geometry: o.geometry, material: o.material, m: m.elements.slice() });
      let mats = Array.isArray(o.material) ? o.material : [o.material];
      if (swap) mats = mats.map((mt) => swap[mt.name] || mt);
      if (mats.length > 1) {
        // Split multi-material meshes by group.
        for (const grp of o.geometry.groups) this.#push(mats[grp.materialIndex], subGeometry(o.geometry, grp), m);
      } else this.#push(mats[0], o.geometry, m);
    });
  }

  #push(material, geometry, matrix) {
    const key = material.uuid;
    if (!this.groups.has(key)) this.groups.set(key, { material, items: [] });
    this.groups.get(key).items.push({ geometry, matrix, tiny: this.tiny });
  }

  // Bakes everything added so far into merged meshes under a group.
  build({ castShadow = true } = {}) {
    const group = new THREE.Group();
    for (const { material, items } of this.groups.values()) {
      const geos = items.map(({ geometry, matrix }) => {
        // Meshopt stores attributes quantized; unpack to plain floats before merging.
        const g = new THREE.BufferGeometry();
        const n = geometry.attributes.position.count;
        for (const k of ['position', 'normal', 'uv']) {
          const a = geometry.attributes[k];
          g.setAttribute(k, a ? toFloat(a) : new THREE.Float32BufferAttribute(new Float32Array(n * (k === 'uv' ? 2 : 3)), k === 'uv' ? 2 : 3));
        }
        // Props carry (mostly white) vertex colours that their materials multiply in.
        if (material.vertexColors) {
          const a = geometry.attributes.color;
          const out = new Float32Array(n * 4).fill(1);
          if (a) for (let i = 0; i < n; i++) for (let c = 0; c < a.itemSize; c++) out[i * 4 + c] = a.getComponent(i, c);
          g.setAttribute('color', new THREE.Float32BufferAttribute(out, 4));
        }
        g.setIndex(geometry.index ? Array.from(geometry.index.array) : [...Array(geometry.attributes.position.count).keys()]);
        g.applyMatrix4(matrix);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      // Marks the mesh as solid for the camera (see world/solids.js), triangle by triangle:
      // 1 = holds the camera off, 0 = a decorative bit it may pass through.
      const mask = new Uint8Array(merged.index.count / 3);
      let at = 0;
      geos.forEach((g, k) => {
        const tris = g.index.count / 3;
        if (!items[k].tiny) mask.fill(1, at, at + tris);
        at += tris;
      });
      mesh.userData.camSolid = true;
      mesh.userData.camMask = mask;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.groups.clear();
    group.userData.pieces = this.log;
    this.log = [];
    return group;
  }
}

function toFloat(a) {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return new THREE.Float32BufferAttribute(out, a.itemSize);
}

function subGeometry(geo, grp) {
  const g = geo.clone();
  const idx = geo.index.array.slice(grp.start, grp.start + grp.count);
  g.setIndex(Array.from(idx));
  g.clearGroups();
  return g;
}
