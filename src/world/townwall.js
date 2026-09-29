import * as THREE from 'three';
import { courseGeometry } from './props.js';
import { hedgeGeometry, hedgeCore, seeded } from './greens.js';
import { GATEHOUSE_W, TOWER_R, THICK, TOWN } from './ashford.js';

// Ashford's boundary, built to the town-wall and gate references (Chepstow's and Tenby's town gates,
// hawthorn field hedges): a mortared rubble wall a head and a half high on the north and east, with a
// saddleback coping and a base course; a round tower at every angle where it turns or
// ends; a gatehouse of dressed stone over each road (a round arch, battlements, the gate leaves folded
// back inside, lanterns on brackets, the town's name over the arch); and on the south and west a thick
// hawthorn hedge that ends in rounded, leafy ends at its openings, where field gates hang open.

export const WALL = { height: 2.8, thick: THICK.stone };
export const TOWER = { r: TOWER_R, height: 4.9 };
export const GATEHOUSE = { span: 5.6, width: GATEHOUSE_W, depth: 3.4, height: 7.4, spring: 2.6 };

// A run of town wall from a to b. `out` is the outward normal (away from the town). The top runs level
// round the town (a head and a half over the terrace), rising only where the ground inside or out
// does; the foot goes down to the lowest ground on either face.
export function townWall(tk, a, b, out, { height = WALL.height, thick = WALL.thick } = {}) {
  const { m } = tk;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.3) return;
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const rot = Math.atan2(-uz, ux);
  const n = Math.max(1, Math.round(len / 4.2)), seg = len / n;
  for (let i = 0; i < n; i++) {
    const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
    let lo = Infinity, loOut = Infinity, hiIn = -Infinity, hiOut = -Infinity;
    for (const t of [-0.5, -0.25, 0, 0.25, 0.5]) for (const f of [-1, 1]) {
      const h = tk.world.heightAt(cx + ux * seg * t + out[0] * f * (thick / 2 + 0.15), cz + uz * seg * t + out[1] * f * (thick / 2 + 0.15));
      lo = Math.min(lo, h);
      if (f > 0) { loOut = Math.min(loOut, h); hiOut = Math.max(hiOut, h); }
      else hiIn = Math.max(hiIn, h);
    }
    const gin = hiIn;
    const foot = lo - 0.35, top = Math.max(TOWN.y + height, hiIn + 1.6, hiOut + 1.8);
    tk.begin('town wall', cx, cz);
    tk.put(tk.box(+(seg + 0.02).toFixed(3), +(top - foot).toFixed(3), thick, 1.7), m.stone, cx, foot, cz, rot);
    // A base course a hand proud of both faces.
    for (const f of [-1, 1]) {
      const g = f > 0 ? loOut : gin;
      tk.put(tk.box(+(seg + 0.02).toFixed(3), +(g + 0.42 - foot).toFixed(3), 0.14), m.ashlar, cx + out[0] * f * (thick / 2 + 0.05), foot, cz + out[1] * f * (thick / 2 + 0.05), rot);
    }
    const cl = +(seg + 0.03).toFixed(2);
    tk.put((tk.geo[`coping${thick}|${cl}`] ??= copingGeometry(thick, cl)), m.slab, cx, top, cz, rot);
    tk.solidBox(cx, cz, seg / 2 + 0.01, thick / 2 + 0.08, rot, foot + 0.5, top + 0.3 - foot - 0.5);
  }
}

// Saddleback coping along x: a slab a little wider than the wall with a ridge, dripping over both faces.
function copingGeometry(thick, len) {
  const w = thick / 2 + 0.08;
  const s = new THREE.Shape([[-w, -0.02], [w, -0.02], [w, 0.09], [0, 0.26], [-w, 0.09]].map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// A round tower at an angle of the wall: a battered foot, a string course, a parapet with merlons.
export function wallTower(tk, x, z, { r = TOWER.r, height = TOWER.height } = {}) {
  const { m } = tk;
  let lo = Infinity, gin = -Infinity;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const h = tk.world.heightAt(x + Math.cos(a) * (r + 0.3), z + Math.sin(a) * (r + 0.3));
    lo = Math.min(lo, h);
    gin = Math.max(gin, h);
  }
  const foot = lo - 0.4, top = gin + height;
  tk.begin('wall tower', x, z);
  const body = courseGeometry([[r + 0.25, 0], [r + 0.05, 0.9 + (gin - foot) * 0.5], [r, top - foot]], { segments: 36, tile: 1.7 });
  body.userData.wuv = true;
  tk.put(body, m.stone, x, foot, z);
  // String course, then the parapet ring with its merlons.
  const band = courseGeometry([[r + 0.16, 0], [r + 0.16, 0.2]], { segments: 36, tile: 0.74, repeatsPerTile: 0.74 / 2.7 });
  band.userData.wuv = true;
  tk.put(band, m.slab, x, top - 0.2, z);
  const par = courseGeometry([[r + 0.1, 0], [r + 0.1, 0.55]], { segments: 36, tile: 1.7 });
  par.userData.wuv = true;
  tk.put(par, m.stone, x, top, z);
  const cap = (tk.geo.towerCap ??= new THREE.RingGeometry(r - 0.3, r + 0.1, 36, 1).rotateX(-Math.PI / 2));
  tk.put(cap, m.slab, x, top + 0.55, z);
  const disc = (tk.geo.towerDisc ??= new THREE.CircleGeometry(r - 0.28, 24).rotateX(-Math.PI / 2));
  tk.put(disc, m.slab, x, top + 0.3, z);
  const inner = courseGeometry([[r - 0.3, 0.3], [r - 0.3, 0.55]], { segments: 36, tile: 1.7 });
  inner.userData.wuv = true;
  tk.put(inner, m.stone, x, top, z);
  const merlon = tk.box(0.8, 0.7, 0.4, 1.7);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    tk.put(merlon, m.stone, x + Math.sin(a) * (r - 0.1), top + 0.55, z + Math.cos(a) * (r - 0.1), a);
  }
  tk.solidCircle(x, z, r + 0.15, foot + 0.5, top + 1.25 - foot - 0.5);
}

// A gatehouse over a road: a block of rubble with dressed quoins, a round arch through it, merlons
// on both parapets, the gate leaves folded back against the passage walls, lanterns on brackets beside
// the arch on the outer face, and the town's board over it. g: { x, z, out: [ox, oz] }.
export function gatehouse(tk, g, signMat) {
  const { m } = tk;
  const G = GATEHOUSE;
  // Local x along the wall (across the road), local +z out of town.
  const rot = Math.atan2(g.out[0], g.out[1]);
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [g.x + lx * c + lz * s, g.z - lx * s + lz * c];
  let lo = Infinity, road = -Infinity;
  for (const lx of [-G.width / 2, -G.span / 2, 0, G.span / 2, G.width / 2]) for (const lz of [-G.depth / 2 - 0.3, 0, G.depth / 2 + 0.3]) {
    const h = tk.world.heightAt(...at(lx, lz));
    lo = Math.min(lo, h);
  }
  for (const lz of [-G.depth / 2, G.depth / 2]) road = Math.max(road, tk.world.heightAt(...at(0, lz)));
  const base = tk.world.heightAt(g.x, g.z);
  const foot = lo - 0.6, top = base + G.height;
  const half = G.span / 2;
  tk.begin('gatehouse', g.x, g.z);
  // The block: an inverted U in the wall's plane, extruded through the depth.
  const pts = [[-G.width / 2, foot], [-half, foot], [-half, base + G.spring]];
  for (let i = 1; i < 16; i++) { const t = Math.PI * (1 - i / 16); pts.push([Math.cos(t) * half, base + G.spring + Math.sin(t) * half]); }
  pts.push([half, base + G.spring], [half, foot], [G.width / 2, foot], [G.width / 2, top], [-G.width / 2, top]);
  const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py - foot)));
  const block = new THREE.ExtrudeGeometry(shape, { depth: G.depth, bevelEnabled: false, curveSegments: 1 });
  block.translate(0, 0, -G.depth / 2);
  tk.put(block, m.stone, g.x, foot, g.z, rot);
  // Dressed stone: the arch ring on both faces and quoins up the corners.
  const ring = [];
  for (let i = 0; i <= 16; i++) { const t = Math.PI * (1 - i / 16); ring.push([Math.cos(t) * (half + 0.5), Math.sin(t) * (half + 0.5)]); }
  for (let i = 16; i >= 0; i--) { const t = Math.PI * (1 - i / 16); ring.push([Math.cos(t) * half, Math.sin(t) * half]); }
  const ringGeo = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([px, py]) => new THREE.Vector2(px, py))), { depth: 0.14, bevelEnabled: false, curveSegments: 1 });
  for (const f of [-1, 1]) {
    const [rx, rz] = at(0, f * (G.depth / 2 + 0.02));
    tk.put(ringGeo, m.ashlar, rx, base + G.spring, rz, rot + (f > 0 ? 0 : Math.PI));
    // Jambs of dressed stone below the springing.
    for (const sx of [-1, 1]) {
      const [jx, jz] = at(sx * (half + 0.25), f * (G.depth / 2 + 0.02));
      tk.put(tk.box(0.5, +(base + G.spring - road + 0.2).toFixed(3), 0.14), m.ashlar, jx, road - 0.2, jz, rot);
    }
    // Quoins at the four outer corners.
    for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) {
      const y = foot + 0.6 + k * 0.7;
      if (y > top - 0.4) break;
      const long = k % 2 === 0;
      const [qx, qz] = at(sx * (G.width / 2 - (long ? 0.35 : 0.22) + 0.03), f * (G.depth / 2 + 0.03));
      tk.put(tk.box(long ? 0.7 : 0.44, 0.34, 0.08), m.ashlar, qx, y, qz, rot);
    }
  }
  // String course under the parapet and merlons along both faces.
  tk.put(tk.box(G.width + 0.24, 0.18, G.depth + 0.24), m.slab, g.x, top - 0.18, g.z, rot);
  const merlon = tk.box(0.9, 0.8, 0.45, 1.7);
  for (const f of [-1, 1]) for (let k = 0; k < 5; k++) {
    const lx = -G.width / 2 + 0.45 + k * ((G.width - 0.9) / 4);
    const [mx, mz] = at(lx, f * (G.depth / 2 - 0.2));
    tk.put(merlon, m.stone, mx, top, mz, rot);
  }
  for (const sx of [-1, 1]) for (const k of [1, 2]) {
    const [mx, mz] = at(sx * (G.width / 2 - 0.2), -G.depth / 2 + k * (G.depth / 3));
    tk.put(merlon, m.stone, mx, top, mz, rot + Math.PI / 2);
  }
  // Arrow slits either side of the arch on the outer face, in dressed surrounds.
  for (const sx of [-1, 1]) {
    const [wx, wz] = at(sx * 3.5, G.depth / 2 + 0.01);
    tk.put(tk.box(0.46, 1.2, 0.08), m.ashlar, wx, base + 3.9, wz, rot);
    tk.put(tk.box(0.14, 0.92, 0.09), tk.m.dark, wx, base + 4.04, wz, rot);
  }
  // The gate leaves, open: planked, ledged and strapped, folded back against the passage walls.
  const leafH = G.spring - 0.1, leafW = half - 0.05;
  for (const sx of [-1, 1]) {
    const [lx, lz] = at(sx * (half - 0.07), 0);
    tk.put(tk.timberBox(0.1, leafH, leafW, 'y'), m.timber, lx, road + 0.03, lz, rot);
    for (const y of [0.35, leafH / 2, leafH - 0.4]) {
      const [bx, bz] = at(sx * (half - 0.135), 0);
      tk.put(tk.timberBox(0.04, 0.16, leafW - 0.1, 'z'), m.timber, bx, road + 0.03 + y, bz, rot);
      const [ix, iz] = at(sx * (half - 0.162), -leafW * 0.08);
      tk.put(tk.box(0.02, 0.07, +(leafW * 0.8).toFixed(3)), m.iron, ix, road + 0.08 + y, iz, rot);
    }
    tk.solidBox(...at(sx * (half - 0.07), 0), 0.06, leafW / 2, rot, road, leafH + 0.1);
  }
  // Lanterns on brackets either side of the arch, on the outer face, and the town's board over it.
  for (const sx of [-1, 1]) {
    const [bx, bz] = at(sx * (half + 0.95), G.depth / 2 + 0.02);
    tk.bracketLantern(bx, base + 3.1, bz, rot);
  }
  if (signMat) {
    const [sx2, sz2] = at(0, G.depth / 2 + 0.03);
    tk.put(tk.timberBox(2.9, 0.8, 0.06, 'x'), m.timber, sx2, base + G.spring + half + 0.6, sz2, rot);
    const board = (tk.geo.gateBoard ??= new THREE.PlaneGeometry(2.6, 0.62).translate(0, 0.4, 0));
    const [px, pz] = at(0, G.depth / 2 + 0.065);
    tk.put(board, signMat, px, base + G.spring + half + 0.6, pz, rot);
  }
  // Colliders: the two masses either side of the passage, and the walls above it for tall jumps.
  for (const sx of [-1, 1]) {
    const w = (G.width / 2 - half) / 2;
    tk.solidBox(...at(sx * (half + w), 0), w, G.depth / 2, rot, foot + 0.5, top + 0.8 - foot - 0.5);
  }
  const over = tk.colliders.addBox(g.x, g.z, half, G.depth / 2, rot, base + G.spring + half * 0.7, top + 0.8);
  over.noCamera = true;
  return { x: g.x, z: g.z, rot, half, width: G.width, top };
}

// A clipped hawthorn hedge from a to b, in lengths of about three metres; `ends` [start, end] say
// which ends are open (at a gate or gap) and so rounded over.
export function townHedge(tk, a, b, { height = 1.8, thick = 1.25, ends = [false, false], seed = 1 } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.4) return;
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const rot = Math.atan2(-uz, ux);
  const k = Math.max(1, Math.round(len / 3)), seg = len / k;
  const r = seeded(seed * 97 + 13);
  for (let j = 0; j < k; j++) {
    const cx = a[0] + ux * seg * (j + 0.5), cz = a[1] + uz * seg * (j + 0.5);
    const gy = tk.world.heightAt(cx, cz);
    const h = height * (0.86 + r() * 0.24);
    const open = [ends[0] && j === 0, ends[1] && j === k - 1];
    // Closed joins overlap a little so the run reads as one hedge.
    const L = seg + (open[0] ? 0 : 0.25) + (open[1] ? 0 : 0.25);
    const shift = (open[0] ? 0.125 : 0) - (open[1] ? 0.125 : 0);
    const px = cx + ux * shift, pz = cz + uz * shift;
    tk.begin('hedge', px, pz);
    const sd = Math.round(seed * 1000 + j * 31);
    tk.put(hedgeCore(L - 0.3, h * 0.8, thick * 0.7, open, sd), tk.m.hedgeCore, px, gy - 0.12, pz, rot);
    tk.put(hedgeGeometry(L, h, thick, open, sd), tk.m.hedgeLeaf, px, gy - 0.12, pz, rot);
    // Woody stems at the foot, where the leaves thin out.
    for (let q = 0; q < Math.round(L * 2.2); q++) {
      const t = (r() - 0.5) * (L - 0.3), f = r() < 0.5 ? -1 : 1;
      const sx = px + ux * t + -uz * f * thick * (0.28 + r() * 0.08), sz = pz + uz * t + ux * f * thick * (0.28 + r() * 0.08);
      tk.put(tk.cyl(0.018, 0.03, 0.7, 5), tk.m.bark, sx, gy - 0.1, sz, r() * 6, 1, 1, 1, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
    }
    tk.solidBox(px, pz, L / 2 - (open[0] || open[1] ? 0.1 : 0), thick / 2 * 0.92, rot, gy - 0.3, h + 0.2);
  }
}

// A field gate in a gap: two round oak posts beside the hedge ends, a five-bar gate hung on one and
// swung back open along the hedge. g: { x, z, width, out }.
export function fieldGate(tk, g) {
  const { m } = tk;
  const ax = -g.out[1], az = g.out[0];
  const rot = Math.atan2(-az, ax);
  const posts = [-1, 1].map((sd) => [g.x + ax * sd * (g.width / 2), g.z + az * sd * (g.width / 2)]);
  for (const [px, pz] of posts) {
    const y = tk.world.heightAt(px, pz);
    tk.begin('gate post', px, pz);
    tk.put(tk.poleGeometry(0.11, 0.1, 1.55), m.bark, px, y - 0.3, pz, 0);
    tk.put(tk.cyl(0.115, 0.03, 0.08, 10), m.bark, px, y + 1.25, pz);
    tk.solidCircle(px, pz, 0.12, y, 1.3);
  }
  // The leaf hangs on the first post and stands swung wide open, into the town, at the gap's edge.
  const [hx, hz] = posts[0];
  const y = tk.world.heightAt(hx, hz);
  const L = Math.min(2.6, g.width - 0.4);
  const dx = -g.out[0] * 0.996 - ax * 0.087, dz = -g.out[1] * 0.996 - az * 0.087;
  const sw = Math.atan2(-dz, dx);
  const lx = hx + dx * (0.14 + L / 2), lz = hz + dz * (0.14 + L / 2);
  tk.begin('field gate', lx, lz, false, true); // hung on its post, clear of the ground
  for (let k = 0; k < 5; k++) tk.put(tk.timberBox(L, 0.08, 0.05, 'x'), m.timber, lx, y + 0.18 + k * 0.23, lz, sw);
  for (const e of [-0.5, 0.5]) tk.put(tk.timberBox(0.1, 1.1, 0.07, 'y'), m.timber, lx + dx * e * L, y + 0.1, lz + dz * e * L, sw);
  tk.put(tk.timberBox(Math.hypot(L, 0.9), 0.07, 0.045, 'x'), m.timber, lx, y + 0.63, lz, sw, 1, 1, 1, 0, Math.atan2(0.9, L));
  const sh = tk.colliders.addBox(lx, lz, L / 2 + 0.05, 0.08, sw, y, y + 1.2);
  sh.noCamera = true;
}
