import * as THREE from 'three';

// Solid shapes for the kit's props, and one way to place a prop so it always gets them.
//
// A kit part's bounding box lies about hollow things (a stall is mostly air, a bench is a slab
// on legs), so each prop that matters has its real mass here, in the part's own frame:
//   { t: 'b', x, z, hx, hz, y0, y1, floor }   a box centred at (x, z)
//   { t: 'c', x, z, r,      y0, y1, floor }   a round column
// `floor` marks a walkable top: the player can jump on it and stand there (a bench seat, a
// crate lid, a counter). Tops up to about a metre are jumpable (the jump peaks near 1.08 m),
// so those are floors; taller things are plain solids. Anything under a step high (0.45 m)
// with no entry here is small clutter: it has no collider and the player walks over it.
//
// The geometry audit (tests/playtest/geometry.py) measures the real meshes against these, so
// a wrong number here shows up as a FAIL, not as a bug report.

const B = (x, z, hx, hz, y0, y1, floor = y1 <= 1.02) => ({ t: 'b', x, z, hx, hz, y0, y1, floor });
const C = (x, z, r, y0, y1, floor = y1 <= 1.02) => ({ t: 'c', x, z, r, y0, y1, floor });

export const SOLIDS = {
  Barrel: [C(0, 0, 0.35, 0, 0.9)],
  Barrel_Apples: [C(0, 0, 0.35, 0, 0.9)],
  Crate_Wooden: [B(0, 0, 0.43, 0.45, 0, 0.88)],
  Crate_Metal: [B(0, 0, 0.43, 0.43, 0, 0.87)],
  Vase_2: [C(0, 0, 0.35, 0, 0.52)],
  Bench: [B(0, 0, 1.39, 0.27, 0, 0.53)],
  Stool: [C(0, 0, 0.24, 0, 0.58)],
  Chair_1: [B(0, 0, 0.28, 0.27, 0, 1.12, false)],
  Table_Large: [B(0, 0, 1.42, 0.55, 0, 0.81)],
  Workbench: [B(0, 0, 1.01, 0.51, 0, 0.89)],
  Chest_Armature: [B(0, 0, 0.64, 0.38, 0, 0.69)],
  Cabinet: [B(0, 0, 0.68, 0.18, 0, 1.0)],
  Bookcase_2: [B(0, 0, 0.73, 0.21, 0, 2.53, false)],
  Barrel_Holder: [B(0, 0.02, 0.68, 0.37, 0, 1.25, false)],
  WeaponStand: [B(0, 0, 0.69, 0.49, 0, 1.11, false)],
  Whetstone: [B(0, 0.08, 0.57, 0.45, 0, 1.17, false)],
  Anvil_Log: [C(0.05, 0.06, 0.4, 0, 1.07, false)],
  CandleStick_Stand: [C(0, 0, 0.3, 0, 1.3, false)],
  Cage_Small: [B(0, 0.02, 0.43, 0.44, 0, 0.76)],
  Bed_Twin1: [B(0, 0, 0.94, 1.21, 0, 0.81)],
  Bag: [B(0, 0, 0.33, 0.27, 0, 0.8, false)],
  // A stall: the counter is a solid block (goods sit on its top at 0.83), the posts carry the awning.
  Stall_Empty: [B(0, 0, 0.92, 0.42, 0, 0.84), C(-0.85, 0.4, 0.08, 0.84, 2.57, false), C(0.85, 0.4, 0.08, 0.84, 2.57, false), C(-0.85, -0.4, 0.08, 0.84, 2.57, false), C(0.85, -0.4, 0.08, 0.84, 2.57, false)],
  Stall_Cart_Empty: [B(0, 0, 0.91, 0.46, 0, 0.84), B(-1.53, 0.27, 0.58, 0.06, 0.78, 0.9, false), B(-1.53, -0.27, 0.58, 0.06, 0.78, 0.9, false), C(-0.85, 0.4, 0.08, 0.84, 2.57, false), C(0.85, 0.4, 0.08, 0.84, 2.57, false), C(-0.85, -0.4, 0.08, 0.84, 2.57, false), C(0.85, -0.4, 0.08, 0.84, 2.57, false)],
  // The hay wagon: a bed with a heap of hay at the back; the low rails and the shaft up front are step-over.
  Prop_Wagon: [B(0, -1.75, 0.96, 1.4, 0, 1.0), B(0, -2.55, 0.8, 0.6, 1.0, 1.5, false)],
  // A lantern on a bracket: the wall plate and arm are out of reach, the lamp hangs at chest height.
  Lantern_Wall: [C(0, 0.78, 0.22, 0.13, 0.66, false)],
  // Shelves screwed to the wall stick out at head height.
  Shelf_Small_Bottles: [B(0, 0.15, 0.57, 0.15, 0, 0.63, false)],
  Shelf_Simple: [B(0, 0.19, 0.59, 0.15, -0.2, 0.11, false)],
  // Shutters folded back against a wall (two leaves either side of the window) or closed.
  WindowShutters_Wide_Round_Open: [B(-0.9, 0.32, 0.3, 0.24, 1.09, 2.74, false), B(0.85, 0.32, 0.25, 0.24, 1.09, 2.74, false)],
  WindowShutters_Wide_Flat_Open: [B(-0.92, 0.36, 0.32, 0.23, 1.09, 2.52, false), B(0.92, 0.36, 0.32, 0.23, 1.09, 2.52, false)],
  WindowShutters_Thin_Round_Open: [B(-0.6, 0.25, 0.2, 0.19, 1.09, 2.61, false), B(0.6, 0.25, 0.19, 0.19, 1.09, 2.61, false)],
  WindowShutters_Wide_Round_Closed: [B(0, 0.22, 0.67, 0.07, 1.09, 2.74, false)],
  WindowShutters_Wide_Flat_Closed: [B(0, 0.23, 0.67, 0.07, 1.09, 2.52, false)],
  WindowShutters_Thin_Round_Closed: [B(0, 0.22, 0.43, 0.07, 1.09, 2.61, false)],
};

// Wall pieces as slabs with the door or window opening left out (the audit checks furniture
// and door leaves against these; the game's own wall colliders live in buildings.js).
const WALL = { z0: -0.26, z1: -0.01 };
function wallSolids(name) {
  const slab = (x0, x1, y0, y1) => B((x0 + x1) / 2, (WALL.z0 + WALL.z1) / 2, (x1 - x0) / 2, (WALL.z1 - WALL.z0) / 2, y0, y1, false);
  const top = 3.12;
  if (/Door_Round/.test(name)) return [slab(-1, -0.64, 0, top), slab(0.64, 1, 0, top), slab(-0.64, 0.64, 2.3, top)];
  if (/Door_Flat/.test(name)) return [slab(-1, -0.63, 0, top), slab(0.63, 1, 0, top), slab(-0.63, 0.63, 2.14, top)];
  if (/Window_Wide_Round/.test(name)) return [slab(-1, -0.6, 0, top), slab(0.6, 1, 0, top), slab(-0.6, 0.6, 0, 1.06), slab(-0.6, 0.6, 2.3, top)];
  if (/Window_Wide_Flat/.test(name)) return [slab(-1, -0.6, 0, top), slab(0.6, 1, 0, top), slab(-0.6, 0.6, 0, 1.06), slab(-0.6, 0.6, 2.3, top)];
  if (/Window_Thin_Round/.test(name)) return [slab(-1, -0.31, 0, top), slab(0.31, 1, 0, top), slab(-0.31, 0.31, 0, 1.06), slab(-0.31, 0.31, 2.3, top)];
  return [slab(-1, 1, 0, top)];
}

export function isWallPiece(name) {
  return /^Wall_(Plaster|UnevenBrick)_/.test(name);
}

// The solid shapes of a part in its own frame. Parts with no entry become one box of their
// bounds if they are at least a step tall, else nothing (clutter).
export function solidsFor(kit, name) {
  if (SOLIDS[name]) return SOLIDS[name];
  if (isWallPiece(name)) return wallSolids(name);
  return [];
}

// Anything a player could bump into at ground level, by name: the props above plus any
// that are taller than a step (used only by the audit to spot missing entries).
export function needsSolids(kit, name) {
  const b = kit.bounds(name);
  return b.max.y - b.min.y >= 0.45 && b.max.y >= 0.45;
}

const tmp = new THREE.Vector3();
// Local (x, z) of a prop's shape into world coordinates for a placement.
function toWorld(x, z, s, c, sc, px, pz, out) {
  return out.set(px + (x * c + z * s) * sc, 0, pz + (-x * s + z * c) * sc);
}

// Adds a prop's colliders for a placement (position, yaw, uniform scale) and returns them.
export function addSolids(kit, colliders, name, px, py, pz, rot = 0, scale = 1) {
  const out = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const sh of solidsFor(kit, name)) {
    toWorld(sh.x, sh.z, s, c, scale, px, pz, tmp);
    const y0 = py + sh.y0 * scale, y1 = py + sh.y1 * scale;
    const shape = sh.t === 'c' ? colliders.addCircle(tmp.x, tmp.z, sh.r * scale, y0, y1) : colliders.addBox(tmp.x, tmp.z, sh.hx * scale, sh.hz * scale, rot, y0, y1);
    if (sh.floor) shape.floor = true;
    shape.prop = name;
    out.push(shape);
  }
  return out;
}

// Places a kit prop: into a batch (baked into the village mesh) or, with `live`, as its own
// object in the scene (things that get moved or removed). Adds its colliders unless `solid` is
// false, and returns { shapes, object }.
export function placeProp(env, name, x, y, z, rot = 0, { scale = 1, solid = true, live = false, meta = null } = {}) {
  const { kit, batch, scene, colliders } = env;
  let object = null;
  if (live) {
    object = kit.instance(name);
    object.position.set(x, y, z);
    object.rotation.y = rot;
    object.scale.setScalar(scale);
    object.userData.audit = { kit: name, ...meta };
    scene.add(object);
  } else batch.add(name, x, y, z, rot, scale, meta);
  const shapes = solid && colliders ? addSolids(kit, colliders, name, x, y, z, rot, scale) : [];
  return { shapes, object };
}

// World-scale texture coordinates for a procedural mesh: each triangle is projected along its
// dominant axis at `tile` metres per texture repeat, so bricks and planks keep the kit's size
// wherever the geometry curves (a sphere's or cylinder's own UVs stretch one tile over the
// whole surface). Uses the object-space positions, so the mesh's placement doesn't matter.
export function fitUV(geometry, tile = 2.0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; }
      else if (ax >= az) { u = v.z; w = v.y; }
      else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u / tile;
      uv[(i + k) * 2 + 1] = w / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// A surface of revolution built in horizontal courses (a beehive kiln, a well shaft, a
// chimney), with texture coordinates in metres: every course wraps a whole number of texture
// repeats, and v follows the slant distance, so brick size is the same everywhere on it.
//   profile: [[radius, y], ...] from bottom to top;  tile: metres per repeat
export function courseGeometry(profile, { segments = 32, tile = 2.0, repeatsPerTile = 1 } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  let v = 0;
  for (let j = 0; j < profile.length - 1; j++) {
    const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
    const slant = Math.hypot(r1 - r0, y1 - y0);
    // Outward normal of this band (in the r, y plane).
    const nr = (y1 - y0) / slant, ny = -(r1 - r0) / slant;
    const repeats = Math.max(1, Math.round((2 * Math.PI * (r0 + r1) / 2) / (tile / repeatsPerTile)));
    const base = pos.length / 3;
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
      pos.push(s * r0, y0, c * r0, s * r1, y1, c * r1);
      nor.push(s * nr, ny, c * nr, s * nr, ny, c * nr);
      uv.push((i / segments) * repeats, v / tile, (i / segments) * repeats, (v + slant) / tile);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, c2, b, b, c2, d);
    }
    v += slant;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Where a prop of footprint radius r rests on uneven ground: the lowest point under it, so
// no side hovers (the uphill side sinks a little, out of sight).
export function restY(heightAt, x, z, r = 0.4) {
  let y = heightAt(x, z);
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) y = Math.min(y, heightAt(x + dx, z + dz));
  return y - 0.01;
}

export function tag(object, name, extra = {}) {
  object.userData.audit = { name, ...extra };
  return object;
}
