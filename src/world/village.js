import * as THREE from 'three';
import { Kit, Batcher } from './kit.js';
import { buildHouse, rng, STOREY } from './buildings.js';
import { VILLAGE } from './map.js';

// Ashford: the village at the heart of the valley. Buildings stand in a ring around
// a cobbled square and face it, leaving gaps where the three roads leave (north-west
// to the mine, east to the bridge, south to the lake). The bank, store, smithy and
// inn have their doors open; the houses are private.

const C = { x: VILLAGE.x, z: VILLAGE.z };
// Around the square: angle (degrees, 0 = east, 90 = south) and distance from its centre.
const RING = [
  { id: 'bank', a: -55, r: 24, w: 8, d: 8, floors: 2, style: 'stone', doors: [{ side: 's', at: 1, open: true }], chimney: 1, windows: 0.7 },
  { id: 'store', a: -152, r: 24, w: 6, d: 8, floors: 2, style: 'plaster', doors: [{ side: 's', at: 1, open: true }], chimney: 2, windows: 0.6 },
  { id: 'inn', a: 47, r: 29, w: 8, d: 12, floors: 2, style: 'plaster', doors: [{ side: 's', at: 1, open: true }], chimney: 1, windows: 0.7 },
  { id: 'house', a: -86, r: 26, w: 6, d: 6, floors: 2, style: 'plaster', doors: [{ side: 's', at: 1 }], chimney: 2 },
  { id: 'house', a: 176, r: 25, w: 4, d: 6, floors: 1, style: 'stone', doors: [{ side: 's', at: 0 }], chimney: 1 },
  { id: 'house', a: 139, r: 26, w: 6, d: 6, floors: 1, style: 'plaster', doors: [{ side: 's', at: 1 }], chimney: 1 },
  { id: 'house', a: 71, r: 27, w: 6, d: 8, floors: 2, style: 'plaster', doors: [{ side: 's', at: 1 }], chimney: 2 },
  { id: 'house', a: -28, r: 40, w: 6, d: 6, floors: 1, style: 'stone', doors: [{ side: 's', at: 1 }], chimney: 1 },
  { id: 'house', a: 118, r: 41, w: 4, d: 6, floors: 2, style: 'plaster', doors: [{ side: 's', at: 0 }], chimney: 2 },
  { id: 'house', a: -136, r: 40, w: 6, d: 8, floors: 1, style: 'plaster', doors: [{ side: 's', at: 1 }], chimney: 1 },
  { id: 'house', a: 200, r: 39, w: 4, d: 4, floors: 1, style: 'stone', doors: [{ side: 's', at: 0 }] },
];

export class Village {
  constructor({ scene, assets, world }) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.places = {};
    this.interactables = [];
  }

  async load() {
    this.kit = await new Kit(this.assets).load();
    const batch = new Batcher(this.kit);
    const y = VILLAGE.y;
    for (const [i, b] of RING.entries()) {
      const a = (b.a * Math.PI) / 180;
      const x = C.x + Math.cos(a) * b.r, z = C.z + Math.sin(a) * b.r;
      // Face the square.
      const rot = Math.atan2(C.x - x, C.z - z);
      const spec = { ...b, x, z, rot, seed: 101 + i * 17 };
      const info = buildHouse(this.kit, batch, this.world.colliders, spec, y);
      const place = { ...spec, ...info };
      if (b.id !== 'house') this.places[b.id] = place;
      if (b.id === 'house') (this.places.houses ??= []).push(place);
    }
    this.#square(batch, y);
    this.#dressing(batch, y);
    this.mesh = batch.build();
    this.scene.add(this.mesh);
    return this;
  }

  // Local-to-world for a building: a point in its footprint frame.
  at(place, lx, lz, out = new THREE.Vector3()) {
    const c = Math.cos(place.rot), s = Math.sin(place.rot);
    return out.set(place.x + lx * c + lz * s, VILLAGE.y, place.z - lx * s + lz * c);
  }

  #prop(batch, name, x, z, rot = 0, { y = VILLAGE.y, solid = true, r = null } = {}) {
    batch.add(name, x, y, z, rot);
    if (!solid) return;
    const b = this.kit.bounds(name);
    const hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
    const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    if (r) this.world.colliders.addCircle(x, z, r, y - 0.5, y + b.max.y);
    else this.world.colliders.addBox(x + cx * c + cz * s, z - cx * s + cz * c, hx, hz, rot, y - 0.5, y + b.max.y);
  }

  // The square: a well at the centre, market stalls, benches and a notice board.
  #square(batch, y) {
    const well = wellMesh(this.kit);
    well.position.set(C.x, y, C.z);
    this.scene.add(well);
    this.world.colliders.addCircle(C.x, C.z, 1.25, y - 0.5, y + 1.0);
    this.places.well = { x: C.x, z: C.z };

    const rnd = rng(77);
    // Stalls along the north-east edge, facing in.
    for (const [a, name] of [[-20, 'Stall_Empty'], [-2, 'Stall_Cart_Empty'], [160, 'Stall_Empty']]) {
      const t = (a * Math.PI) / 180, r = 10.5;
      const x = C.x + Math.cos(t) * r, z = C.z + Math.sin(t) * r;
      const rot = Math.atan2(C.x - x, C.z - z);
      this.#prop(batch, name, x, z, rot);
      // Goods on the counter.
      for (let k = 0; k < 3; k++) {
        const g = ['FarmCrate_Apple', 'FarmCrate_Carrot', 'Barrel_Apples', 'Bag', 'Vase_4'][Math.floor(rnd() * 5)];
        const off = (k - 1) * 0.55;
        batch.add(g, x + Math.cos(rot) * off - Math.sin(rot) * 0.15, y + (g.startsWith('FarmCrate') ? 0.95 : 0), z - Math.sin(rot) * off - Math.cos(rot) * 0.15, rot + (rnd() - 0.5) * 0.4);
      }
    }
    for (const a of [50, 115, -130]) {
      const t = (a * Math.PI) / 180, r = 12.5;
      const x = C.x + Math.cos(t) * r, z = C.z + Math.sin(t) * r;
      this.#prop(batch, 'Bench', x, z, Math.atan2(C.x - x, C.z - z));
    }
    // Barrels and crates by the stalls.
    for (let k = 0; k < 7; k++) {
      const t = (-40 + k * 11 + rnd() * 5) * Math.PI / 180, r = 13 + rnd() * 1.5;
      const x = C.x + Math.cos(t) * r, z = C.z + Math.sin(t) * r;
      this.#prop(batch, rnd() < 0.5 ? 'Barrel' : 'Crate_Wooden', x, z, rnd() * 6, { r: 0.4 });
    }
  }

  // Around the buildings: lanterns, barrels, crates, fences, a cart.
  #dressing(batch, y) {
    const rnd = rng(9);
    for (const h of [...(this.places.houses || []), this.places.store, this.places.inn]) {
      // A barrel or crate beside the door, a bench under a window.
      const side = rnd() < 0.5 ? -1 : 1;
      const p = this.at(h, side * (h.w / 2 - 0.6), h.d / 2 + 0.7);
      this.#prop(batch, rnd() < 0.6 ? 'Barrel' : 'Crate_Wooden', p.x, p.z, rnd() * 6, { r: 0.42 });
      if (rnd() < 0.6) {
        const q = this.at(h, -side * (h.w / 2 - 1.4), h.d / 2 + 0.55);
        this.#prop(batch, 'Bench', q.x, q.z, h.rot + Math.PI);
      }
    }
    // Wall lanterns either side of the public doors.
    for (const id of ['bank', 'store', 'inn']) {
      const h = this.places[id];
      const door = h.openings[0];
      for (const s of [-1, 1]) {
        const p = this.at(h, door.lx + s * 1.0, h.d / 2 + 0.12);
        batch.add('Lantern_Wall', p.x, y + 0.9, p.z, h.rot);
      }
    }
    // A hay cart by the east road.
    this.#prop(batch, 'Prop_Wagon', C.x + 26, C.z + 3, 1.2);
  }

  // Debug: a row of parts, for learning which way pieces face.
  debugRow(names, x0, z0, gap = 4, rot = 0) {
    const b = new Batcher(this.kit);
    names.forEach((n, i) => b.add(n, x0 + i * gap, this.world.heightAt(x0 + i * gap, z0), z0, rot));
    const g = b.build();
    this.scene.add(g);
    return g;
  }
}

// A round stone well with a little roof and a bucket on a rope.
function wellMesh(kit) {
  const g = new THREE.Group();
  const stoneMat = findMaterial(kit, 'MI_UnevenBrick') || new THREE.MeshStandardMaterial({ color: 0x8a8580 });
  const woodMat = findMaterial(kit, 'MI_WoodTrim') || new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.9, 20, 1, true), stoneMat);
  ring.position.y = 0.45;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 20, 1, true), stoneMat);
  inner.position.y = 0.45;
  inner.material = stoneMat.clone();
  inner.material.side = THREE.BackSide;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.16, 8, 24), stoneMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.92;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshStandardMaterial({ color: 0x0b1a1c, roughness: 0.05 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  g.add(ring, inner, lip, water);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), woodMat);
    post.position.set(s * 1.05, 1.05, 0);
    g.add(post);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), woodMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 1.75;
  g.add(axle);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 1.7, 0.8, 4, 1), findMaterial(kit, 'MI_RoundTiles') || woodMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);
  roof.position.y = 2.45;
  g.add(roof);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x9c8a66 }));
  rope.position.set(0.2, 1.25, 0);
  g.add(rope);
  const bucket = kit.instance('Bucket_Wooden_1');
  bucket.position.set(0.2, 0.62, 0);
  g.add(bucket);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function findMaterial(kit, name) {
  let found = null;
  for (const p of kit.parts.values()) {
    p.traverse((o) => {
      if (found || !o.isMesh) return;
      for (const m of [o.material].flat()) if (m.name === name) found = m;
    });
    if (found) break;
  }
  return found;
}

export { STOREY };
