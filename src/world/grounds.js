import * as THREE from 'three';
import { courseGeometry } from './props.js';
import { canvasTexture, seeded, Builder } from './greens.js';
import { rng } from './buildings.js';

// Furniture for Ashford's square, yards and gardens, each built to a reference and in proportion to a
// 1.8 m person, through a TownKit (batched, world-scale UVs, grouped for the audit, solid):
//   well         a round stone drum with a coping, two oak posts, a windlass with rope and crank,
//                a bucket, and a small steep tiled roof with overhanging eaves
//   marketCross  three round steps, a socket stone, a tapering octagonal shaft and a wheel-head cross
//   ringBench    a round timber bench about a tree's trunk, on stout legs
//   brazier      an iron fire-basket on three legs with glowing coals (by the gates)
//   cooper       the cooper's yard: staves raised in a hoop, barrels finished, fired and on their
//                sides, a rack of hoops, a shaving horse, shavings on the ground
//   shed         a boarded tool shed with a pent roof and a door; compost bays; bee skeps on a stand
//   handcart, basket, ladder, washtub, bleaching linen, flagstones

const TAU = Math.PI * 2;
const pt = ([x, z], y) => [x, y, z];
function frameAt(x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
}

// A surface of revolution in a material cut from a trim sheet: its repeats are tu along and tv up.
function ringGeo(profile, mat, segments = 28) {
  const [tu, tv] = mat.userData?.tile || [2, 2];
  const g = courseGeometry(profile, { segments, tile: tv, repeatsPerTile: tv / tu });
  g.userData.wuv = true;
  return g;
}

// Coopered wood (a cask, a bucket, a tub): a surface of revolution whose planks run up it as staves.
// profile: [[radius, y], ...] bottom to top; `inside` faces the other way (a tub's inner wall).
function staveGeometry(profile, segments = 18, inside = false) {
  const pos = [], uv = [], idx = [];
  const rMax = Math.max(...profile.map((q) => q[0]));
  for (const [r, y] of profile) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, a = t * TAU;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      // Grain (u) up the stave; the band's planks (v) side by side round it.
      uv.push(y / 2.2, (t * TAU * rMax) / 0.645);
    }
  }
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    if (inside) idx.push(a, b, a + 1, b, b + 1, a + 1);
    else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.wuv = true;
  return g;
}

// ------------------------------------------------------------------ the well
export function well(tk, x, z, rot = 0) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z), at = frameAt(x, z, rot);
  tk.begin('well', x, z);
  const R = 0.95, H = 0.82;
  // The drum: coursed stone outside and in, a coping of slabs, dark water well down.
  const outer = courseGeometry([[R + 0.05, -0.25], [R, H]], { segments: 28, tile: 1.7 });
  outer.userData.wuv = true;
  tk.put(outer, m.stone, x, y, z, rot);
  const inner = courseGeometry([[R - 0.24, H], [R - 0.24, -0.6]], { segments: 28, tile: 1.7 });
  inner.userData.wuv = true;
  tk.put(inner, m.stone, x, y, z, rot);
  tk.put(ringGeo([[R - 0.3, H], [R - 0.3, H + 0.12], [R + 0.1, H + 0.12], [R + 0.1, H - 0.02]], m.slab), m.slab, x, y, z, rot);
  const water = (tk.geo.wellWater ??= new THREE.CircleGeometry(R - 0.25, 20).rotateX(-Math.PI / 2));
  tk.put(water, m.water, x, y - 0.45, z);
  // Two posts on opposite sides, set in the ground outside the drum, and a crossbeam over the roof line.
  const px = R + 0.16;
  for (const sx of [-1, 1]) tk.put(tk.timberBox(0.18, 2.7, 0.18, 'y'), m.timber, ...pt(at(sx * px, 0), y - 0.3), rot);
  // The windlass: a log turning in the posts, rope wound on it, a crank outside one post.
  const wy = y + 1.55;
  const drum = tk.logGeometry(0.1, 2 * px - 0.18, 10);
  tk.put(drum, [m.barkDark, m.endgrain, m.endgrain], ...pt(at(0, 0), wy), rot + Math.PI / 2);
  for (let k = 0; k < 5; k++) {
    const ring = (tk.geo.wellRope ??= new THREE.TorusGeometry(0.11, 0.018, 5, 14).rotateY(Math.PI / 2));
    tk.put(ring, m.rope, ...pt(at(-0.18 + k * 0.045, 0), wy), rot);
  }
  const axle = at(px + 0.45, 0);
  tk.put(tk.cyl(0.025, 0.025, 0.6, 6), m.iron, axle[0], wy, axle[1], rot, 1, 1, 1, 0, Math.PI / 2);
  const crank = at(px + 0.28, 0.12);
  tk.put(tk.box(0.03, 0.03, 0.32), m.iron, crank[0], wy - 0.015, crank[1], rot);
  const handle = at(px + 0.28, 0.26);
  tk.put(tk.timberBox(0.16, 0.05, 0.05, 'x', m.oak.userData.grain), m.oak, handle[0], wy - 0.025, handle[1], rot);
  // The rope off the windlass down to a wooden bucket hanging over the well mouth by its bail.
  const [bx, bz] = at(-0.09, 0);
  const by = y + H + 0.3;
  tk.put(tk.cyl(0.011, 0.011, +(wy - 0.1 - (by + 0.4)).toFixed(3), 4), m.rope, bx, by + 0.4, bz);
  const bucket = (tk.geo.bucket ??= staveGeometry([[0.12, 0], [0.135, 0.13], [0.15, 0.27]], 14));
  tk.put(bucket, m.timber, bx, by, bz, rot);
  const inside = (tk.geo.bucketIn ??= staveGeometry([[0.14, 0.27], [0.12, 0.03]], 14, false));
  tk.put(inside, m.timber, bx, by, bz, rot);
  const bottom = (tk.geo.bucketBottom ??= new THREE.CircleGeometry(0.125, 14).rotateX(-Math.PI / 2));
  tk.put(bottom, m.endgrain, bx, by + 0.03, bz);
  for (const h of [0.04, 0.22]) tk.put((tk.geo[`hoop${h}`] ??= new THREE.TorusGeometry(0.125 + h * 0.11, 0.008, 4, 16).rotateX(Math.PI / 2)), m.iron, bx, by + h, bz);
  const bail = (tk.geo.bail ??= new THREE.TorusGeometry(0.15, 0.008, 4, 12, Math.PI));
  tk.put(bail, m.iron, bx, by + 0.26, bz, rot + Math.PI / 2);
  // The roof: two steep tiled slopes (ridge along the windlass), boarded gables, a ridge board.
  const ry = y + 2.25, pitch = 0.82, half = 1.22, run = half / Math.cos(pitch), lenR = 2 * px + 0.8;
  for (const sd of [-1, 1]) {
    const [rx, rz] = at(0, sd * half * 0.5);
    tk.put(tk.box(+lenR.toFixed(2), 0.06, +run.toFixed(2)), m.roofTiles, rx, ry + Math.tan(pitch) * half * 0.5 - 0.04, rz, rot, 1, 1, 1, sd * pitch, 0);
    // Barge boards under the tile edge at both gables.
    for (const e of [-1, 1]) {
      const [gx, gz] = at(e * (lenR / 2 - 0.03), sd * half * 0.5);
      tk.put(tk.timberBox(0.04, 0.16, +run.toFixed(2), 'z'), m.timber, gx, ry + Math.tan(pitch) * half * 0.5 - 0.14, gz, rot, 1, 1, 1, sd * pitch, 0);
    }
  }
  tk.put(tk.timberBox(+(lenR + 0.05).toFixed(2), 0.1, 0.12, 'x'), m.timber, x, ry + Math.tan(pitch) * half - 0.06, z, rot);
  // Tie beam under the ridge, tenoned into the post tops, and gable boards between.
  tk.put(tk.timberBox(+(2 * px + 0.18).toFixed(2), 0.16, 0.16, 'x'), m.timber, x, y + 2.26, z, rot);
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape([[-half + 0.12, 0], [half - 0.12, 0], [0, Math.tan(pitch) * (half - 0.12)]].map(([a, b]) => new THREE.Vector2(a, b)));
    const gable = (tk.geo.wellGable ??= new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02).rotateY(Math.PI / 2));
    tk.put(gable, m.timber, ...pt(at(sx * px, 0), y + 2.42), rot);
  }
  // The drum is a wall to walk round, not a step (nobody stands on a well's mouth).
  tk.solidCircle(x, z, R + 0.12, y, H + 0.12).floor = false;
  for (const sx of [-1, 1]) tk.solidBox(...at(sx * px, 0), 0.1, 0.1, rot, y, 2.4);
  return { x, z, R };
}

// ------------------------------------------------------------------ the market cross
export function marketCross(tk, x, z) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('market cross', x, z);
  // Three round steps, each a stone course with a slab tread.
  const steps = [[2.05, 0.3], [1.55, 0.3], [1.08, 0.3]];
  let base = y - 0.12;
  let lo = y;
  for (let a = 0; a < TAU; a += TAU / 12) lo = Math.min(lo, tk.world.heightAt(x + Math.cos(a) * 2.1, z + Math.sin(a) * 2.1));
  const tops = [];
  steps.forEach(([r, h], i) => {
    const y0 = i === 0 ? lo - 0.3 : base;
    tk.put(ringGeo([[r, 0], [r, base + h - y0]], m.ashlar, 32), m.ashlar, x, y0, z);
    const tread = (tk.geo[`crossTread${i}`] ??= new THREE.CircleGeometry(r + 0.04, 32).rotateX(-Math.PI / 2));
    tk.put(tread, m.slab, x, base + h + 0.001, z);
    tk.put(ringGeo([[r + 0.04, 0], [r + 0.04, 0.05]], m.slab, 32), m.slab, x, base + h - 0.05, z);
    base += h;
    tops.push([r, base, y0]);
  });
  // The socket stone, a chamfered block.
  tk.put(tk.box(0.82, 0.62, 0.82), m.ashlar, x, base, z, Math.PI / 4);
  tk.put(tk.box(0.66, 0.12, 0.66), m.ashlar, x, base + 0.62, z, Math.PI / 4);
  // The shaft: octagonal and tapering, with a moulded top.
  const shaft = (tk.geo.crossShaft ??= ringGeo([[0.2, 0], [0.13, 3.3]], m.ashlar, 8));
  tk.put(shaft, m.ashlar, x, base + 0.74, z, Math.PI / 8);
  const top = base + 0.74 + 3.3;
  tk.put(tk.cyl(0.2, 0.15, 0.14, 8), m.ashlar, x, top, z, Math.PI / 8);
  // The head: a wheel cross.
  const hy = top + 0.14;
  tk.put(tk.box(0.14, 0.95, 0.12), m.ashlar, x, hy, z);
  tk.put(tk.box(0.66, 0.14, 0.12), m.ashlar, x, hy + 0.5, z);
  const wheel = (tk.geo.crossWheel ??= new THREE.TorusGeometry(0.22, 0.035, 6, 20));
  tk.put(wheel, m.ashlar, x, hy + 0.57, z);
  // The steps are for sitting and standing on (each a step high); the socket and shaft are solid.
  for (const [r, t, y0] of tops) {
    const sh = tk.colliders.addCircle(x, z, r, y0 - 0.1, t);
    sh.floor = true;
    sh.owner = tk.cur.id;
  }
  tk.solidBox(x, z, 0.42, 0.42, Math.PI / 4, base, top - base + 1.1);
  return { x, z, R: 2.05, top: hy + 0.95 };
}

// ------------------------------------------------------------------ a round bench about a tree
export function ringBench(tk, x, z, { r0 = 0.72, r1 = 1.18, h = 0.46, sides = 8 } = {}) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('tree bench', x, z);
  const rm = (r0 + r1) / 2, w = r1 - r0;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU, len = 2 * rm * Math.tan(Math.PI / sides) + 0.02;
    const cx = x + Math.sin(a) * rm, cz = z + Math.cos(a) * rm;
    // Two seat boards per side, and a skirt board on the outside.
    for (const o of [-w / 4, w / 4]) tk.put(tk.timberBox(+(len + (o > 0 ? 0.08 : -0.08)).toFixed(3), 0.05, +(w / 2 - 0.02).toFixed(3), 'x'), m.timber, cx + Math.sin(a) * o, y + h - 0.05, cz + Math.cos(a) * o, a);
    tk.put(tk.timberBox(+(len + 0.1).toFixed(3), 0.12, 0.04, 'x'), m.timber, x + Math.sin(a) * (r1 - 0.02), y + h - 0.17, z + Math.cos(a) * (r1 - 0.02), a);
    // A leg at every corner of the ring.
    const b = a + Math.PI / sides;
    for (const rr of [r0 + 0.07, r1 - 0.07]) tk.put(tk.timberBox(0.09, +(h - 0.02).toFixed(2), 0.09, 'y'), m.timber, x + Math.sin(b) * rr / Math.cos(Math.PI / sides), y - 0.03, z + Math.cos(b) * rr / Math.cos(Math.PI / sides), b);
  }
  // A walkable ring (one seat per side) round the trunk, not a disc through it.
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU, len = 2 * rm * Math.tan(Math.PI / sides) + 0.1;
    const sh = tk.colliders.addBox(x + Math.sin(a) * rm, z + Math.cos(a) * rm, len / 2, w / 2, a, y - 0.5, y + h);
    sh.floor = true;
    sh.owner = tk.cur.id;
  }
}

// ------------------------------------------------------------------ brazier
export function brazier(tk, x, z) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('brazier', x, z);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    tk.put(tk.box(0.04, 0.95, 0.04), m.iron, x + Math.sin(a) * 0.22, y, z + Math.cos(a) * 0.22, a, 1, 1, 1, 0.14, 0);
  }
  const bowl = courseGeometry([[0.16, 0], [0.34, 0.3]], { segments: 12, tile: 0.8 });
  bowl.userData.wuv = true;
  tk.put(bowl, m.iron, x, y + 0.82, z);
  const ring = (tk.geo.brazierRing ??= new THREE.TorusGeometry(0.34, 0.02, 4, 16).rotateX(Math.PI / 2));
  tk.put(ring, m.iron, x, y + 1.12, z);
  tk.put(tk.cyl(0.32, 0.3, 0.06, 12), m.coal, x, y + 1.04, z);
  const r = rng(Math.round(Math.abs(x * 7 + z)));
  for (let k = 0; k < 7; k++) {
    const a = r() * TAU, d = r() * 0.22;
    tk.put((tk.geo.coalLump ??= new THREE.DodecahedronGeometry(0.06, 0)), k % 2 ? m.ember : m.coal, x + Math.cos(a) * d, y + 1.1, z + Math.sin(a) * d, r() * 3);
  }
  tk.solidCircle(x, z, 0.36, y, 1.15);
  return { x, y: y + 1.1, z };
}

// ------------------------------------------------------------------ cooper's yard
// A cask: staves bulging at the middle and iron hoops. On its side when `lying`.
function caskGeometry(tk) {
  return (tk.geo.cask ??= staveGeometry([[0.26, 0], [0.31, 0.2], [0.33, 0.45], [0.31, 0.7], [0.26, 0.9]], 18));
}
const HOOPS = [[0.08, 0.28], [0.25, 0.318], [0.65, 0.318], [0.82, 0.28]];
function cask(tk, x, y, z, { lying = false, rot = 0, fresh = false } = {}) {
  const { m } = tk;
  const mat = fresh ? m.oak : m.timber;
  if (!lying) {
    tk.put(caskGeometry(tk), mat, x, y, z, rot);
    tk.put((tk.geo.caskHead ??= new THREE.CircleGeometry(0.255, 18).rotateX(-Math.PI / 2)), m.endgrain, x, y + 0.88, z);
    for (const [h, r] of HOOPS) tk.put((tk.geo[`caskHoop${h}`] ??= new THREE.TorusGeometry(r, 0.012, 4, 20).rotateX(Math.PI / 2)), m.iron, x, y + h, z);
    return;
  }
  // Lying on its side along local x, its middle at (x, z), resting on the stillage rails.
  const c = Math.cos(rot), s = Math.sin(rot), cy = y + 0.345;
  tk.put(caskGeometry(tk), mat, x + c * 0.45, cy, z - s * 0.45, rot, 1, 1, 1, 0, Math.PI / 2);
  for (const e of [-1, 1]) tk.put((tk.geo.caskHeadSide ??= new THREE.CircleGeometry(0.255, 18).rotateY(Math.PI / 2)), m.endgrain, x + c * e * 0.445, cy, z - s * e * 0.445, rot + (e < 0 ? Math.PI : 0));
  for (const [h, r] of HOOPS) tk.put((tk.geo[`caskHoopSide${h}`] ??= new THREE.TorusGeometry(r, 0.012, 4, 20).rotateY(Math.PI / 2)), m.iron, x + c * (0.45 - h), cy, z - s * (0.45 - h), rot);
}

export function cooperYard(tk, spots) {
  const { m } = tk;
  const Y = (x, z) => tk.world.heightAt(x, z);
  // A cask being raised: staves gathered in a raising hoop at the top, splayed open at the foot
  // where the windlass and fire have not drawn them in yet.
  {
    const [x, z] = spots.raising;
    const y = Y(x, z);
    tk.begin('raising cask', x, z);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const splay = 0.17 + (i % 3) * 0.025;
      tk.put(tk.timberBox(0.1, 0.92, 0.03, 'y', m.oak.userData.grain), m.oak, x + Math.sin(a) * 0.43, y, z + Math.cos(a) * 0.43, a, 1, 1, 1, -splay, 0);
    }
    tk.put((tk.geo.raiseHoop ??= new THREE.TorusGeometry(0.29, 0.018, 4, 22).rotateX(Math.PI / 2)), m.iron, x, y + 0.8, z);
    tk.put((tk.geo.raiseHoop2 ??= new THREE.TorusGeometry(0.33, 0.014, 4, 22).rotateX(Math.PI / 2)), m.iron, x, y + 0.62, z);
    tk.solidCircle(x, z, 0.46, y, 0.9);
  }
  // Casks: finished ones stacked by the wall, one on its side on a stillage, one fresh.
  for (const [x, z, o] of spots.casks) {
    const y = Y(x, z);
    tk.begin('cask', x, z);
    cask(tk, x, y, z, { lying: !!o.lying, rot: o.rot || 0, fresh: !!o.fresh });
    if (o.lying) {
      // The stillage: two timber rails under it, along it.
      const at = frameAt(x, z, o.rot || 0);
      for (const e of [-0.2, 0.2]) tk.put(tk.timberBox(1.0, 0.08, 0.09, 'x'), m.timber, ...pt(at(0, e), y), o.rot || 0);
      tk.solidBox(x, z, 0.5, 0.34, o.rot || 0, y, 0.68);
    } else tk.solidCircle(x, z, 0.33, y, 0.9);
  }
  // Hoops: a bundle leaning on the wall, and a stack of them on the ground.
  {
    const [x, z, rot] = spots.hoops;
    const y = Y(x, z);
    tk.begin('hoops', x, z);
    for (let k = 0; k < 5; k++) {
      const r = 0.28 + k * 0.025;
      tk.put((tk.geo[`leanHoop${k}`] ??= new THREE.TorusGeometry(r, 0.012, 4, 20)), m.iron, x + Math.sin(rot) * (-0.06 * k), y + r + 0.01, z + Math.cos(rot) * (-0.06 * k), rot, 1, 1, 1, -0.22, 0);
    }
    tk.solidBox(x, z, 0.4, 0.25, rot, y, 0.7);
  }
  // The shaving horse: a bench with a sloping bridge and a foot-worked clamp, a stave on it.
  {
    const [x, z, rot] = spots.horse;
    const y = Y(x, z), at = frameAt(x, z, rot);
    tk.begin('shaving horse', x, z);
    tk.put(tk.timberBox(1.6, 0.08, 0.26, 'x'), m.timber, x, y + 0.5, z, rot);
    for (const [lx, lz] of [[-0.65, -0.1], [-0.65, 0.1], [0.65, -0.1], [0.65, 0.1]]) tk.put(tk.timberBox(0.07, 0.55, 0.07, 'y'), m.timber, ...pt(at(lx, lz * 2.2), y - 0.02), rot, 1, 1, 1, lz * 1.1, lx > 0 ? -0.2 : 0.2);
    const [bx, bz] = at(0.35, 0);
    tk.put(tk.timberBox(0.8, 0.07, 0.2, 'x'), m.timber, bx, y + 0.62, bz, rot, 1, 1, 1, 0, 0.3);
    tk.put(tk.timberBox(0.07, 0.9, 0.1, 'y'), m.timber, ...pt(at(0.55, 0), y + 0.2), rot, 1, 1, 1, 0, -0.1);
    tk.put(tk.timberBox(0.85, 0.03, 0.1, 'x', m.oak.userData.grain), m.oak, ...pt(at(0.4, 0), y + 0.84), rot, 1, 1, 1, 0, 0.3);
    tk.solidBox(x, z, 0.8, 0.2, rot, y, 0.62);
  }
  // Shavings in curls on the ground round the horse and a block for chopping staves.
  {
    const [x, z] = spots.shavings;
    const y = Y(x, z);
    tk.begin('shavings', x, z, true);
    const r = rng(Math.round(Math.abs(x * 13 + z * 5)));
    for (let k = 0; k < 40; k++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 1.1;
      tk.put((tk.geo.curl ??= new THREE.TorusGeometry(0.035, 0.008, 3, 6, 4.2)), m.oak, x + Math.cos(a) * d, y + 0.02, z + Math.sin(a) * d, r() * 6, 1, 1, 1, Math.PI / 2 + (r() - 0.5), 0);
    }
  }
}

// ------------------------------------------------------------------ garden buildings
// A boarded tool shed with a pent (single-slope) roof of boards, a ledged door and a hasp.
export function shed(tk, x, z, rot, { w = 2.4, d = 1.8, h = 2.1 } = {}) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z), at = frameAt(x, z, rot);
  let lo = y;
  for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) lo = Math.min(lo, tk.world.heightAt(...at(a * w, b * d)));
  tk.begin('shed', x, z);
  tk.put(tk.box(w + 0.1, y + 0.18 - (lo - 0.25), d + 0.1, 1.7), m.stone, x, lo - 0.25, z, rot);
  // Walls of upright boards; the front taller than the back so the roof falls away.
  const back = h - 0.3;
  tk.put(tk.timberBox(w, h, 0.06, 'y'), m.timber, ...pt(at(0, d / 2 - 0.03), y + 0.18), rot);
  tk.put(tk.timberBox(w, back, 0.06, 'y'), m.timber, ...pt(at(0, -d / 2 + 0.03), y + 0.18), rot);
  for (const e of [-1, 1]) {
    const side = new THREE.Shape([[-d / 2, 0], [d / 2, 0], [d / 2, h], [-d / 2, back]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = (tk.geo[`shedSide${w}${d}${h}`] ??= new THREE.ExtrudeGeometry(side, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03).rotateY(-Math.PI / 2));
    tk.put(g, m.timber, ...pt(at(e * (w / 2 - 0.03), 0), y + 0.18), rot);
  }
  // Corner posts.
  for (const [a, b, hh] of [[-1, 1, h], [1, 1, h], [-1, -1, back], [1, -1, back]]) tk.put(tk.timberBox(0.1, hh, 0.1, 'y'), m.timber, ...pt(at(a * (w / 2 - 0.05), b * (d / 2 - 0.05)), y + 0.18), rot);
  // The roof: boards falling from front to back, overhanging all round.
  const pitch = Math.atan2(h - back, d), run = (d + 0.5) / Math.cos(pitch);
  tk.put(tk.timberBox(+(w + 0.4).toFixed(2), 0.06, +run.toFixed(2), 'z'), m.timber, ...pt(at(0, 0), y + 0.18 + (h + back) / 2 - 0.02), rot, 1, 1, 1, -pitch, 0);
  // The door: ledged boards with a hasp.
  const [dx, dz] = at(0.3, d / 2 + 0.01);
  tk.put(tk.timberBox(0.8, 1.75, 0.04, 'y', m.oak.userData.grain), m.oak, dx, y + 0.22, dz, rot);
  for (const hh of [0.4, 1.5]) tk.put(tk.timberBox(0.76, 0.11, 0.03, 'x'), m.timber, ...pt(at(0.3, d / 2 + 0.04), y + 0.22 + hh), rot);
  tk.put(tk.box(0.05, 0.12, 0.02), m.iron, ...pt(at(0.62, d / 2 + 0.05), y + 1.1), rot);
  tk.solidBox(x, z, w / 2 + 0.05, d / 2 + 0.05, rot, lo, h + 0.4 + (y - lo));
}

// Compost bays: two open-fronted bins of boards, one heaped with dark rotted matter and straw.
export function compost(tk, x, z, rot) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z), at = frameAt(x, z, rot);
  tk.begin('compost bays', x, z);
  const W = 2.6, D = 1.1, H = 0.8;
  tk.put(tk.timberBox(W, H, 0.05, 'x'), m.timber, ...pt(at(0, -D / 2), y - 0.05), rot);
  for (const lx of [-W / 2, 0, W / 2]) tk.put(tk.timberBox(0.05, H, D, 'z'), m.timber, ...pt(at(lx, 0), y - 0.05), rot);
  for (const lx of [-W / 2, 0, W / 2]) tk.put(tk.timberBox(0.09, H + 0.1, 0.09, 'y'), m.timber, ...pt(at(lx, D / 2 - 0.05), y - 0.05), rot);
  // The heap in the left bay.
  const heap = (tk.geo.compostHeap ??= (() => {
    const g = new THREE.SphereGeometry(0.62, 12, 6, 0, TAU, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.95 + Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * 0.03);
    g.computeVertexNormals();
    return g;
  })());
  tk.put(heap, m.soil, ...pt(at(-W / 4, 0), y - 0.05), rot, 1, 1, 0.85);
  tk.put(heap, m.hay, ...pt(at(W / 4, 0.05), y - 0.1), rot + 1, 0.9, 0.55, 0.8);
  tk.solidBox(x, z, W / 2 + 0.05, D / 2 + 0.05, rot, y, H);
}

// Bee skeps: domed straw hives on a plank stand under a little board roof.
export function skeps(tk, x, z, rot) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z), at = frameAt(x, z, rot);
  tk.begin('bee skeps', x, z);
  for (const lx of [-0.8, 0.8]) for (const lz of [-0.25, 0.25]) tk.put(tk.timberBox(0.08, 0.62, 0.08, 'y'), m.timber, ...pt(at(lx, lz), y - 0.05), rot);
  tk.put(tk.timberBox(1.9, 0.05, 0.62, 'x'), m.timber, x, y + 0.55, z, rot);
  const skep = (tk.geo.skep ??= (() => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.22 * Math.cos(t * Math.PI * 0.5) * (1 + 0.04 * Math.sin(t * 40)) + 0.001, 0.4 * Math.sin(t * Math.PI * 0.5))); }
    const g = new THREE.LatheGeometry(pts, 16);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, p.getY(i) / 0.12);
    g.userData.wuv = true;
    return g;
  })());
  for (const lx of [-0.55, 0.05, 0.62]) tk.put(skep, m.hay, ...pt(at(lx, 0), y + 0.6), rot);
  // A board roof over the stand.
  tk.put(tk.timberBox(2.1, 0.04, 0.9, 'x'), m.timber, ...pt(at(0, 0), y + 1.28), rot, 1, 1, 1, -0.15, 0);
  for (const lx of [-0.8, 0.8]) tk.put(tk.timberBox(0.06, 0.66, 0.06, 'y'), m.timber, ...pt(at(lx, -0.28), y + 0.6), rot);
  tk.solidBox(x, z, 1.02, 0.46, rot, y, 1.36);
}

// ------------------------------------------------------------------ yard and market bits
// A two-wheeled handcart with its shafts down, a few sacks in it.
export function handcart(tk, x, z, rot) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z), at = frameAt(x, z, rot);
  tk.begin('handcart', x, z);
  const bedY = y + 0.55;
  tk.put(tk.timberBox(1.3, 0.05, 0.9, 'x'), m.timber, x, bedY, z, rot);
  for (const e of [-1, 1]) tk.put(tk.timberBox(1.3, 0.28, 0.04, 'x'), m.timber, ...pt(at(0, e * 0.45), bedY), rot);
  tk.put(tk.timberBox(0.04, 0.28, 0.9, 'z'), m.timber, ...pt(at(-0.65, 0), bedY), rot);
  // Shafts running forward and down to the ground.
  for (const e of [-1, 1]) tk.put(tk.timberBox(1.5, 0.06, 0.06, 'x'), m.timber, ...pt(at(1.2, e * 0.36), y + 0.3), rot, 1, 1, 1, 0, -0.33);
  // Wheels: rims with spokes.
  for (const e of [-1, 1]) {
    const [wx, wz] = at(0, e * 0.52);
    const rim = (tk.geo.cartRim ??= new THREE.TorusGeometry(0.42, 0.035, 5, 18));
    tk.put(rim, m.timber, wx, y + 0.42, wz, rot);
    const spoke = (tk.geo.cartSpoke ??= grainSpoke());
    for (let k = 0; k < 6; k++) tk.put(spoke, m.timber, wx, y + 0.42, wz, rot, 1, 1, 1, 0, (k / 6) * Math.PI);
    const hub = (tk.geo.cartHub ??= new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8).rotateX(Math.PI / 2));
    tk.put(hub, m.timber, wx, y + 0.42, wz, rot);
  }
  for (let k = 0; k < 3; k++) tk.put(sackGeometry(tk), m.hay, ...pt(at(-0.3 + k * 0.32, (k % 2) * 0.1), bedY + 0.05), rot + k);
  tk.solidBox(...at(0.25, 0), 0.95, 0.55, rot, y, 0.9);
}

// A wheel spoke through the hub (centred), its grain along it.
function grainSpoke() {
  const g = new THREE.BoxGeometry(0.035, 0.8, 0.035);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getY(i) / 2.2, (p.getX(i) + p.getZ(i)) / 0.645);
  g.userData.wuv = true;
  return g;
}

// A sack: a soft lumpy bag, tied at the neck (drawn in the hay texture's pale hessian tone).
function sackGeometry(tk) {
  return (tk.geo.sack ??= (() => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.001 + 0.2 * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (t > 0.8 ? 0.6 : 1) + (t > 0.85 ? 0.03 : 0), t * 0.5));
    }
    const g = new THREE.LatheGeometry(pts, 12);
    g.scale(1, 1, 0.8);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, p.getY(i) / 0.7);
    g.userData.wuv = true;
    return g;
  })());
}

// A basket of wicker with a rim, filled (apples, greens) or empty.
export function basket(tk, x, z, { fill = null, y = null } = {}) {
  const { m } = tk;
  const gy = y ?? tk.world.heightAt(x, z);
  tk.begin('basket', x, z, false, y !== null);
  const body = (tk.geo.basket ??= (() => {
    const g = courseGeometry([[0.17, 0], [0.24, 0.3]], { segments: 14, tile: 0.4 });
    g.userData.wuv = true;
    return g;
  })());
  tk.put(body, m.hay, x, gy, z);
  tk.put((tk.geo.basketRim ??= new THREE.TorusGeometry(0.24, 0.02, 4, 16).rotateX(Math.PI / 2)), m.timber, x, gy + 0.3, z);
  if (fill) {
    const r = rng(Math.round(Math.abs(x * 17 + z * 3)));
    for (let k = 0; k < 9; k++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.16;
      tk.put((tk.geo.apple ??= new THREE.SphereGeometry(0.045, 8, 6)), fill, x + Math.cos(a) * d, gy + 0.27 + r() * 0.04, z + Math.sin(a) * d);
    }
  }
}

// A ladder leaning against something: rails and rungs, `len` long, its foot at (x, z), leaning
// toward `rot` at `lean` radians off upright.
export function ladder(tk, x, z, rot, { len = 3.2, lean = 0.3 } = {}) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('ladder', x, z, true);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const e of [-0.22, 0.22]) tk.put(tk.poleGeometry(0.03, 0.03, len, 6), m.bark, x + c * e, y, z - s * e, rot, 1, 1, 1, lean, 0);
  for (let k = 1; k < len / 0.3; k++) {
    const t = k * 0.3;
    tk.put(tk.poleGeometry(0.018, 0.018, 0.44, 5), m.bark, x + Math.sin(rot) * Math.sin(lean) * t - c * 0.22, y + Math.cos(lean) * t, z + Math.cos(rot) * Math.sin(lean) * t + s * 0.22, rot, 1, 1, 1, 0, -Math.PI / 2);
  }
}

// A wash tub (a half barrel) on the grass, with a washboard in it.
export function washtub(tk, x, z) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('wash tub', x, z);
  const tub = (tk.geo.tub ??= staveGeometry([[0.36, 0], [0.4, 0.42]], 18));
  tk.put(tub, m.timber, x, y, z);
  const inside = (tk.geo.tubIn ??= staveGeometry([[0.37, 0.42], [0.34, 0.06]], 18));
  tk.put(inside, m.timber, x, y, z);
  tk.put((tk.geo.tubWater ??= new THREE.CircleGeometry(0.36, 18).rotateX(-Math.PI / 2)), m.water, x, y + 0.34, z);
  for (const h of [0.08, 0.34]) tk.put((tk.geo[`tubHoop${h}`] ??= new THREE.TorusGeometry(0.37 + h * 0.1, 0.012, 4, 20).rotateX(Math.PI / 2)), m.iron, x, y + h, z);
  tk.put(tk.timberBox(0.34, 0.62, 0.03, 'y'), m.oak, x + 0.1, y + 0.1, z, 0.3, 1, 1, 1, -0.3, 0);
  const tubSh = tk.solidCircle(x, z, 0.42, y, 0.75);
  tubSh.floor = false;
}

// Linen laid out on the grass to bleach in the sun: a sheet in soft folds.
export function bleachingSheet(tk, x, z, rot, w = 2.2, d = 1.4) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('bleaching linen', x, z, true);
  const g = new THREE.PlaneGeometry(w, d, 10, 6).rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const sd = x * 3 + z;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i);
    p.setY(i, 0.03 + 0.025 * Math.sin(px * 4 + sd) * Math.sin(pz * 3 + sd * 0.7) + 0.02 * Math.abs(Math.sin(px * 2.3 + pz + sd)));
    // Only the sheet's rect of the garment atlas.
    uv.setXY(i, 0.02 + ((px / w) + 0.5) * 0.46, 0.52 + ((pz / d) + 0.5) * 0.46);
  }
  g.computeVertexNormals();
  g.userData.wuv = true;
  const col = new Float32Array(p.count * 3).fill(0.97);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tk.put(g, m.linen, x, y, z, rot);
}

// Flagstones: an apron of irregular slabs laid flush with the ground round a point (a ring from r0
// to r1), or a rectangle of them.
export function flagRing(tk, x, z, r0, r1) {
  const { m } = tk;
  const y = tk.world.heightAt(x, z);
  tk.begin('flagstones', x, z, true);
  const B = new Builder();
  const rings = Math.max(1, Math.round((r1 - r0) / 0.55));
  const r = seeded(Math.round(Math.abs(x * 7 + z * 13)) + 3);
  for (let i = 0; i < rings; i++) {
    const a0r = r0 + ((r1 - r0) * i) / rings, a1r = r0 + ((r1 - r0) * (i + 1)) / rings;
    const n = Math.max(6, Math.round((TAU * (a0r + a1r)) / 2 / 0.7));
    const off = r() * TAU;
    for (let k = 0; k < n; k++) {
      const t0 = off + (k / n) * TAU + 0.012, t1 = off + ((k + 1) / n) * TAU - 0.012;
      const ri = a0r + 0.015, ro = a1r - 0.015, h = 0.015 + r() * 0.012;
      const P = (rr, t) => [Math.cos(t) * rr, h, Math.sin(t) * rr];
      const q = [P(ri, t0), P(ro, t0), P(ro, t1), P(ri, t1)];
      const us = r() * 3, vs = r() * 3;
      const ids = q.map((p) => B.vert(p, [0, 1, 0], [p[0] / 1.35 + us, p[2] / 0.74 + vs]));
      B.quad(ids[0], ids[3], ids[2], ids[1]);
    }
  }
  tk.put(B.build(), m.slab, x, y, z);
}

// ------------------------------------------------------------------ notices
// The notices on the square's board, one atlas: a proclamation in a crabbed hand with a seal, a wanted
// poster with a face, a torn sheet, a list, a small bill and a scrap.
export function noticeTexture() {
  return canvasTexture(512, 512, (g, W, H) => {
    const r = seeded(33);
    g.clearRect(0, 0, W, H);
    const paper = (x, y, w, h, tone, torn = false) => {
      g.save();
      g.beginPath();
      if (!torn) g.rect(x + 3, y + 3, w - 6, h - 6);
      else {
        g.moveTo(x + 3, y + 3);
        g.lineTo(x + w - 3, y + 3);
        g.lineTo(x + w - 3, y + h * 0.55);
        for (let k = 0; k <= 12; k++) g.lineTo(x + w - 3 - (k / 12) * (w - 6), y + h * (0.62 + 0.1 * Math.sin(k * 2.1) + r() * 0.08));
        g.closePath();
      }
      g.clip();
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, tone[0]);
      grad.addColorStop(1, tone[1]);
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(120,90,50,${r() * 0.08})`; g.fillRect(x + r() * w, y + r() * h, 4 + r() * 10, 3 + r() * 8); }
      g.restore();
    };
    const scribble = (x, y, w, lines, gap = 11, ink = 'rgba(40,25,15,0.8)') => {
      g.strokeStyle = ink;
      g.lineWidth = 1.6;
      for (let l = 0; l < lines; l++) {
        const ly = y + l * gap, lw = w * (l === lines - 1 ? 0.5 + r() * 0.3 : 0.85 + r() * 0.15);
        g.beginPath();
        g.moveTo(x, ly);
        for (let t = 0; t < lw; t += 3) g.lineTo(x + t, ly + Math.sin(t * 0.9 + l) * 2 + (r() - 0.5) * 2.2);
        g.stroke();
      }
    };
    const nail = (x, y) => { g.fillStyle = '#2b2622'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); };
    // 0: proclamation (top-left quarter of the top half), with a heading and a red seal.
    paper(0, 0, 128, 256, ['#efe3c4', '#d9c79c']);
    g.fillStyle = '#3a2210';
    g.font = 'bold 20px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('HEAR YE', 64, 34);
    scribble(14, 56, 100, 13, 12);
    g.fillStyle = '#8e1f16';
    g.beginPath(); g.arc(96, 226, 12, 0, TAU); g.fill();
    nail(64, 12);
    // 1: wanted, with a face.
    paper(128, 0, 128, 256, ['#e8d7a8', '#cdb682']);
    g.fillStyle = '#2a170b';
    g.font = 'bold 22px Georgia, serif';
    g.fillText('WANTED', 192, 32);
    g.strokeStyle = '#2a170b';
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(192, 100, 30, 38, 0, 0, TAU); g.stroke();
    g.beginPath(); g.arc(181, 92, 4, 0, TAU); g.arc(203, 92, 4, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(192, 96); g.lineTo(188, 112); g.lineTo(194, 112); g.stroke();
    g.beginPath(); g.moveTo(180, 124); g.quadraticCurveTo(192, 118, 204, 124); g.stroke();
    for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(166 + k * 4, 128 + (k % 3) * 2); g.lineTo(168 + k * 4, 140); g.stroke(); }
    g.font = 'bold 16px Georgia, serif';
    g.fillText('10 GOLD', 192, 172);
    scribble(142, 190, 100, 5, 11);
    nail(192, 12);
    // 2: a torn sheet, a hand-written list.
    paper(256, 0, 128, 256, ['#f1e8d0', '#dccfae'], true);
    scribble(270, 30, 96, 11, 12);
    nail(320, 14);
    // 3: a small bill.
    paper(384, 0, 128, 256, ['#e6dcc0', '#c9b98e']);
    g.fillStyle = '#3a2210';
    g.font = 'bold 18px Georgia, serif';
    g.fillText('FAIR', 448, 40);
    scribble(398, 64, 100, 14, 12);
    nail(400, 14); nail(496, 14);
    // 4: a long notice across the bottom-left half.
    paper(0, 256, 256, 256, ['#efe6cd', '#d4c49b']);
    g.fillStyle = '#3a2210';
    g.font = 'bold 20px Georgia, serif';
    g.fillText('TOLLS', 128, 290);
    scribble(20, 314, 216, 14, 12);
    nail(20, 270); nail(236, 270);
    // 5: a scrap.
    paper(256, 256, 128, 256, ['#e9dfc3', '#cbb98c'], true);
    scribble(268, 290, 100, 8, 12);
    nail(320, 268);
  });
}
