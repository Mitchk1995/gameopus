import * as THREE from 'three';
import { frame } from './sitekit.js';
import { LANDMARKS, ABBEY_HILL, roadById, roadDistance } from './map.js';
import { Fire } from './effects.js';
import { Smoke } from './smoke.js';
import { courseGeometry, placeProp } from './props.js';
import { enhance } from '../engine/detail.js';
import { rng } from './buildings.js';
import { findMaterial } from './townkit.js';

// The landmarks you can see from Ashford, each a different shape on its own high ground:
//   the ruined abbey on Abbey Hill (long south wall of lancets, a tall east gable, a broken west tower),
//   the beacon tower on the knoll at the end of Bridge Street (a fire burning on its top),
//   the mine headframe on Mine Hill (timber frame, sheave wheel, winding shed, smoking chimney),
//   the lighthouse on the lake's east shore (white tower, glowing lantern, keeper's hut),
//   and the lantern posts along the dock and the jetty.
// Everything static goes through the SiteKit (batched, world-scale UVs, audit groups, colliders);
// flames and smoke are live objects outside the batch and never block the player or the camera.
// All heights come from the terrain at load time, so the pieces stay seated if the land shifts.

// ------------------------------------------------------------------ shared pieces (fort.js uses them too)
const TAU = Math.PI * 2;

// A box beam between two points (centre line), w wide and h deep.
export function beam(sk, a, b, w, h, mat) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz), hor = Math.hypot(dx, dz);
  const key = `beam${w}|${h}|${L.toFixed(3)}`;
  const g = (sk.geo[key] ??= new THREE.BoxGeometry(w, h, L));
  sk.put(g, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), 1, 1, 1, -Math.atan2(dy, hor), 0);
}

// A round log between two points: r0 at a, r1 at b. Bark runs along it (u round, v along, `tile` m a repeat).
export function logGeometry(r0, r1, L, seg = 8, tile = 1.6) {
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, false);
  const uv = g.attributes.uv, n = g.attributes.normal;
  const round = (TAU * (r0 + r1)) / 2 / tile;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, uv.getX(i) * ((2 * Math.max(r0, r1)) / tile), uv.getY(i) * ((2 * Math.max(r0, r1)) / tile));
    else uv.setXY(i, Math.round(round) * uv.getX(i), (uv.getY(i) * L) / tile);
  }
  g.rotateX(Math.PI / 2);
  g.userData.wuv = true;
  return g;
}
export function log(sk, a, b, r0, r1, mat, seg = 8) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz), hor = Math.hypot(dx, dz);
  const key = `log${r0}|${r1}|${L.toFixed(3)}|${seg}`;
  const g = (sk.geo[key] ??= logGeometry(r0, r1, L, seg));
  sk.put(g, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), 1, 1, 1, -Math.atan2(dy, hor), 0);
}

// The outline of an opening in a wall's elevation: a pointed (equilateral) arch, a round arch or a
// flat head, from the sill up. x is the centre, w the width, `spring` where the arch starts.
export function opening(x, w, sill, spring, kind = 'pointed', segs = 8) {
  const a = w / 2, pts = [[x - a, sill]];
  if (kind === 'pointed') {
    for (let i = 0; i <= segs; i++) { const t = Math.PI - (Math.PI / 3) * (i / segs); pts.push([x + a + w * Math.cos(t), spring + w * Math.sin(t)]); }
    for (let i = 1; i <= segs; i++) { const t = (Math.PI / 3) * (1 - i / segs); pts.push([x - a + w * Math.cos(t), spring + w * Math.sin(t)]); }
  } else if (kind === 'round') {
    for (let i = 0; i <= segs * 2; i++) { const t = Math.PI * (1 - i / (segs * 2)); pts.push([x + a * Math.cos(t), spring + a * Math.sin(t)]); }
  } else pts.push([x - a, spring], [x + a, spring]);
  pts.push([x + a, sill]);
  return pts;
}
export const archTop = (w, spring, kind = 'pointed') => spring + (kind === 'pointed' ? w * 0.866 : kind === 'round' ? w / 2 : 0);

// Every tree whose trunk stands inside `inside(x, z, r)` is taken out of the forest before its
// colliders are made (the world adds tree colliders after the sites are built).
export function clearTrees(world, inside) {
  const f = world.forest;
  if (!f?.trees) return 0;
  const gone = new Set(f.trees.filter((t) => inside(t.x, t.z, t.radius || 0.3, t)));
  if (!gone.size) return 0;
  f.trees = f.trees.filter((t) => !gone.has(t));
  for (const v of f.variants || []) if (v.trees) v.trees = v.trees.filter((t) => !gone.has(t));
  if (f.cells) for (const [k, list] of f.cells) f.cells.set(k, list.filter((t) => !gone.has(t)));
  f.lastUpdate?.set(1e9, 0, 0);
  return gone.size;
}

// Materials the kit and the town kit do not have. Built once per SiteKit.
export async function extraMaterials(sk, assets) {
  if (sk.xm) return sk.xm;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const tex = async (name) => Promise.all(['color', 'normal', 'roughness'].map((k) => assets.texture(`trees/${name}_${k}.webp`, { srgb: k === 'color' })));
  const [pine, oak] = await Promise.all([tex('pine'), tex('oak')]);
  const bark = (t, color, name) => { const m = new THREE.MeshStandardMaterial({ map: t[0], normalMap: t[1], roughnessMap: t[2], color, roughness: 1 }); m.name = name; return enhance(m); };
  const whitewash = sk.m.plaster.clone();
  whitewash.color = new THREE.Color(1.12, 1.12, 1.14);
  enhance(whitewash);
  const ironDouble = sk.m.iron.clone();
  ironDouble.side = THREE.DoubleSide;
  sk.xm = {
    redBrick: findMaterial(sk.kit, 'MI_RedBrick') || sk.m.stone,
    bark: bark(pine, 0xa89c8e, 'Bark'),
    barkDark: bark(oak, 0x8a7a6a, 'BarkDark'),
    whitewash,
    ironDouble,
    dark: new THREE.MeshBasicMaterial({ color: 0x050403 }),
    coal: std(0x1d1a18, { roughness: 1 }),
    ember: new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff5a18, emissiveIntensity: 1.3, roughness: 1 }),
    bone: std(0xd9d0b8, { roughness: 0.8 }),
    rope: std(0x8a7456, { roughness: 1 }),
    red: std(0x8e2a22, { roughness: 0.7 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc870, emissiveIntensity: 2.4, roughness: 0.2 }),
  };
  return sk.xm;
}

// ------------------------------------------------------------------ entry point
export async function buildLandmarks(sk, sites) {
  const xm = await extraMaterials(sk, sites.assets);
  const smoke = (sites.smoke ??= new Smoke(sites.scene));
  if (!sites.updaters.includes(sites.smokeTick)) sites.updaters.push((sites.smokeTick = (dt) => smoke.update(dt)));
  const out = {};
  const keep = [];
  out.abbey = abbey(sk, xm, keep);
  out.beacon = beacon(sk, xm, sites, smoke, keep);
  out.headframe = headframe(sk, xm, smoke, keep);
  out.lighthouse = lighthouse(sk, xm, keep);
  out.dock = dockLamps(sk);
  out.treesCleared = clearTrees(sk.world, (x, z, r, t) => keep.some((k) => k(x, z, r, t)));
  return out;
}

// A keep-out test for trees: a circle, or a box in a frame.
const circleOut = (cx, cz, R) => (x, z, r) => Math.hypot(x - cx, z - cz) < R + r;
// Trees near (cx, cz) whose crowns stand in a line of sight from any eye to any target: the view of a
// landmark from the town. A crown is taken as an upright cylinder over the upper two thirds of the tree.
const sightOut = (cx, cz, R, eyes, targets) => (x, z, r, t) => {
  if (!t || Math.hypot(x - cx, z - cz) > R) return false;
  const H = (t.variant?.height || 12) * (t.scale || 1), top = t.y + H, cr = Math.max(2.5, H * 0.3);
  for (const e of eyes) for (const g of targets) {
    const dx = g[0] - e[0], dz = g[2] - e[2], L2 = dx * dx + dz * dz;
    const s = Math.max(0, Math.min(1, ((x - e[0]) * dx + (z - e[2]) * dz) / L2));
    if (Math.hypot(e[0] + dx * s - x, e[2] + dz * s - z) > cr + r) continue;
    if (e[1] + (g[1] - e[1]) * s < top) return true;
  }
  return false;
};
const boxOut = (f, lx0, lx1, lz0, lz1) => (x, z, r) => {
  const dx = x - f.ox, dz = z - f.oz, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
  return lx > lx0 - r && lx < lx1 + r && lz > lz0 - r && lz < lz1 + r;
};

// ------------------------------------------------------------------ walls with openings
// A straight run of masonry in frame f along lx, from lx0 to lx1, centred on lz, t thick: from below the
// ground up to a top line [[lx, h], ...] (h above `base`), with openings cut through it. Colliders are
// boxes per chunk that follow the top line, split around the doorways so you can walk through them.
function masonry(sk, f, { lx0, lx1, lz, t, base, top, holes = [], doors = [], mat, label, turn = 0 }) {
  const g = (lx, lzz) => {
    // Frame positions along this run (turn = a quarter turn swaps the axes).
    return turn ? f.at(lzz, -lx) : f.at(lx, lzz);
  };
  let low = Infinity;
  for (let x = lx0; x <= lx1 + 1e-6; x += Math.max(0.5, (lx1 - lx0) / 24)) for (const o of [-t / 2, t / 2]) { const [wx, wz] = g(x, lz + o); low = Math.min(low, sk.ground(wx, wz)); }
  const y0 = Math.min(low, base) - 0.6;
  const H = (h) => base + h - y0;
  const pts = [[lx0, 0], [lx1, 0], ...top.slice().sort((a, b) => b[0] - a[0]).map(([x, h]) => [x, H(h)])];
  const hole = (o) => o.map(([x, h]) => [x, H(h)]);
  const [cx, cz] = g(0, lz);
  sk.begin(label, ...g((lx0 + lx1) / 2, lz));
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of [...holes, ...doors.map((d) => d.outline)]) shape.holes.push(new THREE.Path(hole(h).map(([x, y]) => new THREE.Vector2(x, y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -t / 2);
  sk.put(geo, mat, cx, y0, cz, f.yaw + (turn ? Math.PI / 2 : 0));
  // Colliders: boxes between the doorways that follow the top line (short pieces merged while the
  // height stays about the same), so a breach down to knee height is a breach and not an invisible wall.
  const s = top.slice().sort((a, b) => a[0] - b[0]);
  const topAt = (x) => {
    for (let i = 0; i < s.length - 1; i++) if (x >= s[i][0] && x <= s[i + 1][0]) return s[i][1] + ((s[i + 1][1] - s[i][1]) * (x - s[i][0])) / (s[i + 1][0] - s[i][0] || 1);
    return x < s[0][0] ? s[0][1] : s[s.length - 1][1];
  };
  const cuts = [[lx0, lx1]];
  for (const d of doors) {
    for (let i = 0; i < cuts.length; i++) {
      const [a, b] = cuts[i];
      if (d.x - d.w / 2 > a && d.x + d.w / 2 < b) { cuts.splice(i, 1, [a, d.x - d.w / 2], [d.x + d.w / 2, b]); break; }
    }
  }
  const shapes = [];
  const rot = f.yaw + (turn ? Math.PI / 2 : 0);
  for (const [a, b] of cuts) {
    const n = Math.max(1, Math.ceil((b - a) / 0.8)), step = (b - a) / n;
    const piece = [];
    for (let i = 0; i < n; i++) {
      let h = 0;
      for (let k = 0; k <= 4; k++) h = Math.max(h, topAt(a + step * (i + k / 4)));
      piece.push(h);
    }
    let i0 = 0;
    for (let i = 1; i <= n; i++) {
      const hmax = Math.max(...piece.slice(i0, i));
      if (i < n && Math.abs(piece[i] - hmax) < 0.35 && Math.abs(piece[i] - Math.min(...piece.slice(i0, i))) < 0.35 && (i - i0 + 1) * step < 4) continue;
      const u0 = a + i0 * step, u1 = a + i * step;
      const [x, z] = g((u0 + u1) / 2, lz);
      const sh = sk.colliders.addBox(x, z, (u1 - u0) / 2 + 0.01, t / 2, rot, y0, base + hmax);
      if (hmax <= 1.02) sh.floor = true;
      shapes.push(sh);
      i0 = i;
    }
  }
  // Over each doorway: the wall above the arch (only the camera and tall jumps meet it).
  for (const d of doors) {
    const [x, z] = g(d.x, lz);
    const topH = topAt(d.x);
    if (topH > d.head + 0.2) shapes.push(sk.colliders.addBox(x, z, d.w / 2 + 0.01, t / 2, rot, base + d.head, base + topH));
  }
  return { y0, shapes };
}

// A ruin's broken top line: from (x0, h0) to (x1, h1), jagged in courses of stone.
function ruinTop(x0, x1, h0, h1, rnd, { step = 0.9, jag = 0.6, dips = [] } = {}) {
  const pts = [];
  const n = Math.max(2, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    let h = h0 + ((h1 - h0) * i) / n;
    if (i > 0 && i < n) h += (rnd() - 0.5) * 2 * jag;
    for (const [dx, dw, dh] of dips) { const k = Math.max(0, 1 - Math.abs(x - dx) / dw); h = h * (1 - k) + Math.min(h, dh) * k; }
    // Stone comes away in whole courses: square the step.
    if (i > 0) pts.push([x - 0.001, pts[pts.length - 1][1]]);
    pts.push([x, Math.round(h / 0.3) * 0.3]);
  }
  return pts;
}

// A heap of fallen dressed stone: a low mound of broken rock with blocks lying on it and around its
// foot. Low heaps are walkable (a floor top).
function rubble(sk, xm, x, z, R, H, rnd, label = 'rubble') {
  const y = sk.ground(x, z);
  sk.begin(label, x, z);
  const m = sk.m;
  let lo = y;
  for (let a = 0; a < TAU; a += TAU / 8) lo = Math.min(lo, sk.ground(x + Math.cos(a) * R, z + Math.sin(a) * R));
  // A footing slab buried under the heap ties the blocks into one pile (it never shows).
  sk.put(sk.box(+(R * 2).toFixed(2), 0.3, +(R * 2).toFixed(2)), m.stone, x, lo - 0.34, z, rnd() * TAU);
  // Fallen blocks in courses: a wide bottom course on the ground, fewer and smaller above, each
  // resting on what is under it, tipped at odd angles; small chips scattered round the foot.
  let top = y;
  const courses = Math.max(1, Math.round(H / 0.3));
  let below = [];
  for (let c = 0; c < courses; c++) {
    const rr = R * (1 - c / (courses + 0.6)), n = Math.max(2, Math.round((rr * rr * 3.2) / (1 + c * 0.4)));
    const here = [];
    for (let i = 0; i < n; i++) {
      const w = 0.42 + rnd() * 0.4 - c * 0.05, h = 0.24 + rnd() * 0.16, dd = 0.3 + rnd() * 0.28;
      let px, pz, py;
      if (c === 0) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * rr * 0.85;
        px = x + Math.cos(a) * d; pz = z + Math.sin(a) * d;
        if (sk.ground(px, pz) > lo + 0.08) continue; // (sloping ground: keep to the low side)
        py = sk.ground(px, pz) - 0.1;
      } else {
        // Every upper block rests on one below it, a little off its centre.
        const b = below[Math.floor(rnd() * below.length)];
        if (!b) break;
        px = b[0] + (rnd() - 0.5) * 0.3; pz = b[1] + (rnd() - 0.5) * 0.3;
        if (Math.hypot(px - x, pz - z) > rr) continue;
        py = b[2] - 0.06;
      }
      top = Math.max(top, py + h);
      here.push([px, pz, py + h]);
      sk.put(sk.box(+w.toFixed(2), +h.toFixed(2), +dd.toFixed(2)), m.stone, px, py, pz, rnd() * TAU, 1, 1, 1, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35);
    }
    below = here;
  }
  for (let i = 0; i < Math.round(R * 6); i++) {
    const a = rnd() * TAU, d = R * (0.8 + rnd() * 0.2);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, s = 0.14 + rnd() * 0.12;
    if (sk.ground(px, pz) > lo + 0.04) continue;
    sk.put(sk.box(+s.toFixed(2), +(s * 0.7).toFixed(2), +(s * 1.2).toFixed(2)), m.stone, px, sk.ground(px, pz) - 0.05, pz, rnd() * TAU, 1, 1, 1, (rnd() - 0.5) * 0.4, 0);
  }
  const sh = sk.colliders.addCircle(x, z, R * 0.9, y - 0.5, top);
  if (top - y <= 1.02) sh.floor = true;
}

// ------------------------------------------------------------------ the ruined abbey
function abbey(sk, xm, keep) {
  const { m } = sk;
  const rnd = rng(1147);
  // The Pilgrims' Way ends at the south door: the nave runs east-west just north of the road's end.
  const road = roadById('abbey').pts;
  const [ex, ez] = road[road.length - 1];
  const DOOR = -5.6; // the south door's bay, along the nave
  const f = frame(ex - DOOR, ez - 6.2, 0); // yaw 0: the front (the south wall) faces the town
  const base = sk.ground(f.ox, f.oz);
  const T = 1.0; // wall thickness
  const HW = 4.5; // half the nave's outside width
  const X0 = -15, X1 = 14; // the nave from the tower's east face to the east gable's inner face
  // --- south wall: five bays of tall lancets, the door in the second, standing nearly whole.
  const bays = [-11.2, -5.6, 0, 5.6, 11.2];
  const holes = [], doors = [];
  for (const b of bays) {
    if (b === DOOR) {
      doors.push({ x: b, w: 2.2, head: archTop(2.2, 3.1), outline: opening(b, 2.2, -0.05, 3.1) });
      holes.push(opening(b, 1.2, 6.6, 8.6));
    } else holes.push(opening(b, 1.7, 3.2, 8.3));
  }
  const southTop = ruinTop(X0, X1, 11.4, 11.4, rnd, { jag: 0.25, dips: [[8.4, 2.2, 10.2], [-13.6, 1.4, 10.6]] });
  masonry(sk, f, { lx0: X0, lx1: X1, lz: HW - T / 2, t: T, base, top: southTop, holes, doors, mat: m.stone, label: 'abbey south wall' });
  // Buttresses between the bays: two stages with sloping weatherings.
  for (const bx of [-8.4, -2.8, 2.8, 8.4]) buttress(sk, f, bx, HW, base, 1.1, rnd);
  // --- north wall: fallen to a jagged stump, with a breach through to the cloister.
  const northTop = ruinTop(X0, X1, 6.5, 3.2, rnd, { jag: 1.1, dips: [[4.2, 1.9, 0.35], [-9, 3, 2.4]] });
  masonry(sk, f, { lx0: X0, lx1: X1, lz: -HW + T / 2, t: T, base, top: northTop, mat: m.stone, label: 'abbey north wall' });
  // --- the east gable: the tallest thing on the hill, a great lancet and an oculus high up.
  const eastTop = [[-HW, 11.4], [-HW + 0.01, 11.4], [-0.35, 21.6], [0.35, 21.6], [HW - 0.01, 11.4], [HW, 11.4]];
  masonry(sk, f, { lx0: -HW, lx1: HW, lz: X1 + T / 2, t: T, base, top: eastTop, holes: [opening(0, 3.2, 3.2, 10.6), circle(0, 17.4, 0.78, 18)], mat: m.stone, label: 'abbey east gable', turn: 1 });
  // Stubs of the lost tracery rising from the great window's sill (resting on the gable).
  sk.begin('abbey mullions', ...f.at(X1 + T / 2, 0), false, true);
  for (const s of [-0.55, 0.55]) {
    const [x, z] = f.at(X1 + T / 2, s);
    sk.put(sk.box(0.62, +(1.3 + rnd() * 0.5).toFixed(2), 0.2), m.rock, x, base + 3.12, z, f.yaw);
  }
  // Clasping buttresses at the gable's corners.
  for (const s of [-1, 1]) {
    sk.begin('abbey corner buttress', ...f.at(X1 + T + 0.55, s * (HW - 0.6)));
    sk.block(f, X1 + T + 0.55, s * (HW - 0.6), 1.1, 1.2, base + 7.5, m.stone);
    sk.block(f, X1 + T + 0.4, s * (HW - 0.6), 0.8, 0.9, base + 10.2, m.stone, { bottom: base + 7.5 });
  }
  // --- the west tower: broken off high, a door in its west face, a tall arch into the nave.
  const TX0 = -22, TX1 = X0, TH = 3.5, TT = 1.2;
  masonry(sk, f, { lx0: -TH, lx1: TH, lz: X0 - TT / 2, t: TT, base, top: ruinTop(-TH, TH, 18.9, 16.2, rnd, { jag: 0.5 }), doors: [{ x: 0, w: 2.8, head: archTop(2.8, 5.0), outline: opening(0, 2.8, -0.05, 5.0) }], mat: m.stone, label: 'abbey tower east wall', turn: 1 });
  masonry(sk, f, { lx0: -TH, lx1: TH, lz: TX0 + TT / 2, t: TT, base, top: ruinTop(-TH, TH, 20.7, 18.3, rnd, { jag: 0.5 }), doors: [{ x: 0, w: 2.0, head: archTop(2.0, 2.9), outline: opening(0, 2.0, -0.05, 2.9) }], holes: [opening(0, 0.9, 7.2, 9.6), opening(0, 1.1, 12.4, 13.9), opening(0, 1.2, 16.2, 17.4)], mat: m.stone, label: 'abbey tower west wall', turn: 1 });
  masonry(sk, f, { lx0: TX0 + TT, lx1: TX1 - TT, lz: TH - TT / 2, t: TT, base, top: ruinTop(TX0 + TT, TX1 - TT, 20.7, 18.9, rnd, { jag: 0.4 }), holes: [opening(-18.5, 0.9, 12.2, 13.8), opening(-18.5, 1.2, 16.2, 17.5)], mat: m.stone, label: 'abbey tower south wall' });
  masonry(sk, f, { lx0: TX0 + TT, lx1: TX1 - TT, lz: -TH + TT / 2, t: TT, base, top: ruinTop(TX0 + TT, TX1 - TT, 18.3, 16.2, rnd, { jag: 0.5 }), holes: [opening(-18.5, 0.9, 10.6, 12.2)], mat: m.stone, label: 'abbey tower north wall' });
  // The tower's corners are clasped by stepped buttresses.
  for (const [bx, bz] of [[TX0 - 0.5, TH - 0.5], [TX0 - 0.5, -TH + 0.5]]) {
    sk.begin('abbey tower buttress', ...f.at(bx, bz));
    sk.block(f, bx, bz, 1.0, 1.1, base + 6.2, m.stone);
    sk.block(f, bx + 0.12, bz, 0.75, 0.85, base + 9.4, m.stone, { bottom: base + 6.2 });
  }
  // --- the cloister: a fragment of its arcade north of the nave, four arches on piers.
  cloister(sk, f, base, -HW - 3.2, 1.2, 12.6, rnd);
  // --- fallen stone, ivy, graves.
  for (const [lx, lz, R, H] of [[4.2, -HW - 1.6, 1.5, 0.9], [4.0, -2.2, 1.2, 0.7], [-9, -HW + 1.7, 1.3, 0.8], [-9.5, -HW - 1.5, 1.1, 0.6], [9.8, -1.2, 0.9, 0.55], [-18.5, -0.6, 1.1, 0.8]]) {
    const [x, z] = f.at(lx, lz);
    rubble(sk, xm, x, z, R, H, rnd, 'abbey rubble');
  }
  fallenDrum(sk, f, base, -1.5, 0.8, 0.5, rnd);
  fallenDrum(sk, f, base, 7.2, -2.6, 2.1, rnd);
  ivy(sk, f, base, HW, southTop, rnd);
  churchyard(sk, f, base, HW, X0, X1, rnd);
  keep.push(boxOut(f, TX0 - 4, X1 + 6, -HW - 8, HW + 3));
  // The ruin is meant to be seen straight up Lake Street over the bank: trees on the hill that stand in
  // that line of sight (to the wall's lancets, the gable and the tower) are not there.
  const targets = [[-13, 9], [-5.6, 9.5], [0, 9], [5.6, 9.5], [11.2, 9], [X1 + T / 2, 20], [-18.5, 19]].map(([lx, h]) => { const [x, z] = f.at(lx, HW); return [x, base + h, z]; });
  const eyes = [[-8, 53], [-8, 66], [-9, 84], [-8, 30]].map(([x, z]) => [x, sk.ground(x, z) + 1.7, z]);
  keep.push(sightOut(ABBEY_HILL.x, ABBEY_HILL.z, 115, eyes, targets));
  return { x: f.ox, z: f.oz, base, frame: f, door: f.at(DOOR, HW) };
}

// A round hole (an oculus) as an opening outline.
function circle(x, y, r, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return pts;
}

// A two-stage buttress standing against the south face at lx.
function buttress(sk, f, lx, face, base, w, rnd) {
  const { m } = sk;
  sk.begin('abbey buttress', ...f.at(lx, face + 0.55));
  const h1 = 4.6 + rnd() * 0.4, h2 = 8.2 + rnd() * 0.6;
  sk.block(f, lx, face + 0.55, w, 1.1, base + h1, m.stone);
  sk.block(f, lx, face + 0.35, w * 0.82, 0.7, base + h2, m.stone, { bottom: base + h1 - 0.02 });
  // Weatherings: stone wedges sloping away from the wall on top of each stage.
  sk.profile(f, lx, face, base + h1 - 0.02, [[0, 0], [1.1, 0], [0.7, 0.35], [0, 0.62]], w, m.stone, { turn: -Math.PI / 2 });
  sk.profile(f, lx, face, base + h2 - 0.02, [[0, 0], [0.7, 0], [0, 0.75]], w * 0.82, m.stone, { turn: -Math.PI / 2 });
}

// The cloister walk's arcade: piers and round arches with a coping, running along lx at lz. Three
// arches still stand; the fourth has fallen, leaving a broken pier and its stones in the grass.
function cloister(sk, f, base, lz, lx0, lx1, rnd) {
  const { m } = sk;
  const n = 4, w = (lx1 - lx0) / n, arch = w - 0.9, pier = 0.9;
  const doors = [];
  for (let i = 0; i < 3; i++) {
    const cx = lx0 + w * (i + 0.5) + pier / 2;
    doors.push({ x: cx, w: arch, head: archTop(arch, 2.1, 'round'), outline: opening(cx, arch, -0.05, 2.1, 'round', 6) });
  }
  const end = lx0 + w * 3 + pier;
  const top = [[lx0, 3.75], [lx0 + w * 1.9, 3.75], [lx0 + w * 2.5, 3.6], [end, 3.45]];
  masonry(sk, f, { lx0, lx1: end, lz, t: 0.6, base, top, doors, mat: m.stone, label: 'abbey cloister' });
  // A coping along the part that still stands (resting on the arcade).
  const [x, z] = f.at(lx0 + w * 0.95, lz);
  sk.begin('abbey cloister coping', x, z, false, true);
  sk.put(sk.box(+(w * 1.9).toFixed(2), 0.16, 0.78, 2.7), m.rock, x, base + 3.74, z, f.yaw);
  // The last pier, broken off low.
  const [px, pz] = f.at(lx1 + pier / 2, lz);
  sk.begin('abbey cloister pier', px, pz);
  sk.block(f, lx1 + pier / 2, lz, pier, 0.6, base + 1.1 + rnd() * 0.3, m.stone);
}

// A fallen column drum lying in the grass.
function fallenDrum(sk, f, base, lx, lz, yaw, rnd) {
  const [x, z] = f.at(lx, lz);
  const y = sk.ground(x, z);
  sk.begin('abbey column drum', x, z);
  const g = (sk.geo.drum ??= new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14).rotateZ(Math.PI / 2));
  sk.put(g, sk.m.stone, x, y + 0.34, z, yaw + rnd() * 0.3);
  const sh = sk.colliders.addBox(x, z, 0.55, 0.4, yaw, y - 0.3, y + 0.76);
  sh.floor = true;
}

// Ivy hanging from the south wall's top and over a buttress (the kit's vine pieces).
function ivy(sk, f, base, face, top, rnd) {
  const kit = sk.kit;
  const pieces = ['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine5'];
  const spots = [[-13.2, 0], [-7.2, 1], [3.9, 2], [9.9, 0], [12.4, 1]];
  const topAt = (x) => { let h = 0; for (const [px, ph] of top) if (Math.abs(px - x) < 1.2) h = Math.max(h, ph); return h; };
  for (const [lx, k] of spots) {
    const name = pieces[k];
    if (!kit.has(name)) continue;
    const b = kit.bounds(name);
    const [x, z] = f.at(lx, face - b.min.z + 0.01);
    sk.batch.add(name, x, base + topAt(lx) - b.max.y + 0.05, z, f.yaw);
  }
}

// Old graves in the churchyard between the nave and the road, and a couple of standing crosses.
function churchyard(sk, f, base, face, X0, X1, rnd) {
  const { m } = sk;
  const spots = [];
  for (let lx = -12.5; lx <= 13; lx += 2.3) for (const lz of [face + 2.4, face + 4.1]) spots.push([lx + (rnd() - 0.5) * 0.6, lz + (rnd() - 0.5) * 0.5]);
  for (let lz = -3; lz <= 3; lz += 2.4) spots.push([X1 + 3.4 + (rnd() - 0.5) * 0.5, lz]);
  let n = 0;
  for (const [lx, lz] of spots) {
    const [x, z] = f.at(lx, lz);
    const [rd, rw] = roadDistance(x, z);
    if (rd < rw + 1.2 || Math.abs(lx + 5.6) < 2.2 || rnd() < 0.3) continue; // off the road and the path to the door
    n++;
    const lean = (rnd() - 0.5) * 0.3, roll = (rnd() - 0.5) * 0.18, tall = 0.7 + rnd() * 0.45;
    const y = sk.ground(x, z);
    sk.begin('abbey grave', x, z);
    if (n % 5 === 2) {
      // A standing cross with a ring.
      sk.put(sk.box(0.26, 1.7, 0.2), m.rock, x, y - 0.15, z, f.yaw, 1, 1, 1, lean * 0.3, roll * 0.3);
      sk.put(sk.box(0.9, 0.22, 0.18), m.rock, x, y + 1.05, z, f.yaw, 1, 1, 1, lean * 0.3, roll * 0.3);
      const ring = (sk.geo.ring ??= new THREE.TorusGeometry(0.3, 0.05, 6, 16));
      sk.put(ring, m.rock, x, y + 1.16, z, f.yaw);
      sk.put(sk.box(0.5, 0.25, 0.4), m.rock, x, y - 0.1, z, f.yaw);
    } else {
      const shape = [[-0.27, 0], [0.27, 0], [0.27, tall - 0.27]];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; shape.push([0.27 * Math.cos(a), tall - 0.27 + 0.27 * Math.sin(a)]); }
      shape.push([-0.27, tall - 0.27]);
      const s = new THREE.Shape(shape.map(([px, py]) => new THREE.Vector2(px, py)));
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.07);
      sk.put(g, m.rock, x, y - 0.18, z, f.yaw + (rnd() - 0.5) * 0.2, 1, 1, 1, lean, roll);
    }
    const cross = n % 5 === 2;
    const sh = sk.colliders.addBox(x, z, cross ? 0.5 : 0.36, cross ? 0.28 : 0.22, f.yaw, y - 0.3, y + (cross ? 1.75 : tall + 0.1));
    if (!cross && tall <= 0.92) sh.floor = true;
  }
}

// ------------------------------------------------------------------ the beacon tower
function beacon(sk, xm, sites, smoke, keep) {
  const { m } = sk;
  const L = LANDMARKS.beacon;
  // The door faces the end of the Beacon Path, which arrives on the crown from the east.
  const path = roadById('beacon').pts, [px, pz] = path[path.length - 1];
  const yaw = Math.atan2(px - L.x, pz - L.z);
  const f = frame(L.x, L.z, yaw);
  let low = Infinity, high = -Infinity;
  for (let a = 0; a < TAU; a += TAU / 12) { const h = sk.ground(L.x + Math.cos(a) * 4.2, L.z + Math.sin(a) * 4.2); low = Math.min(low, h); high = Math.max(high, h); }
  const base = sk.ground(L.x, L.z);
  const y0 = low - 0.8;
  const R0 = 3.9, R1 = 3.35, BODY = 11.6, TOP = BODY + 0.35;
  // The drum's radius at a height above the base (it batters in from R0 to R1).
  const rAt = (h) => R0 - ((R0 - R1) * Math.max(0, h - 0.3)) / (BODY - 0.3);
  sk.begin('beacon tower', L.x, L.z);
  // A battered round tower: a plinth course, a gently tapering drum, a moulded band, the parapet.
  const body = courseGeometry([[R0 + 0.12, 0], [R0 + 0.12, base - y0 + 0.3], [R0, base - y0 + 0.3], [R1, base - y0 + BODY]], { segments: 40, tile: 2.1 });
  body.userData.wuv = true;
  sk.put(body, m.stone, L.x, y0, L.z);
  const ringGeo = (ri, ro, h, seg = 40, tile = 2.7) => {
    const g = courseGeometry([[ro, 0], [ro, h], [ri, h], [ri, 0], [ro, 0]], { segments: seg, tile });
    g.userData.wuv = true;
    return g;
  };
  // Corbelled band and the deck.
  sk.put(ringGeo(R1 - 0.6, R1 + 0.22, 0.4), m.rock, L.x, base + BODY - 0.05, L.z);
  sk.put(sk.cyl(R1 - 0.1, R1 - 0.1, TOP - BODY, 32), m.stone, L.x, base + BODY, L.z);
  // Parapet with merlons, one crenel facing each way.
  sk.put(ringGeo(R1 - 0.45, R1 + 0.12, 0.95), m.stone, L.x, base + TOP, L.z);
  const nM = 10;
  for (let i = 0; i < nM; i++) {
    const a = ((i + 0.5) / nM) * TAU;
    const r = R1 - 0.16;
    sk.put(sk.box(1.05, 0.9, 0.56), m.stone, L.x + Math.sin(a) * r, base + TOP + 0.93, L.z + Math.cos(a) * r, a);
  }
  // The door: a pointed stone surround standing proud of the drum, a plank door set in it, iron straps.
  const surround = new THREE.Shape([[-1.05, 0], [1.05, 0], [1.05, 2.3], [0, 3.1], [-1.05, 2.3]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path();
  hole.moveTo(-0.62, 0);
  hole.lineTo(0.62, 0);
  hole.lineTo(0.62, 1.95);
  hole.absarc(0, 1.95, 0.62, 0, Math.PI, false);
  hole.lineTo(-0.62, 0);
  surround.holes.push(hole);
  const sg = new THREE.ExtrudeGeometry(surround, { depth: 0.6, bevelEnabled: false, curveSegments: 10 });
  sg.translate(0, 0, -0.6);
  const [dx, dz] = f.at(0, R0 + 0.3);
  sk.put(sg, m.rock, dx, base - 0.05, dz, yaw);
  const leaf = new THREE.Shape([[-0.62, 0], [0.62, 0], [0.62, 1.95]].map(([x, y]) => new THREE.Vector2(x, y)));
  leaf.absarc(0, 1.95, 0.62, 0, Math.PI, false);
  leaf.lineTo(-0.62, 0);
  const lg = new THREE.ExtrudeGeometry(leaf, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
  const [lx, lz] = f.at(0, R0 - 0.02);
  sk.put(lg, m.wood, lx, base - 0.02, lz, yaw);
  for (const h of [0.5, 1.6]) { const [sx, sz] = f.at(0, R0 + 0.1); sk.put(sk.box(1.1, 0.07, 0.04), m.iron, sx, base + h, sz, yaw); }
  // Two arrow slits facing the town.
  for (const [a, h] of [[yaw + Math.PI + 0.5, 5.2], [yaw + Math.PI - 0.4, 8.4]]) {
    const r = rAt(h + 0.75);
    const sx = L.x + Math.sin(a) * r, sz = L.z + Math.cos(a) * r;
    sk.put(sk.box(0.5, 1.5, 0.34), m.rock, sx, base + h, sz, a);
    sk.put(sk.box(0.14, 1.15, 0.06), xm.dark, L.x + Math.sin(a) * (r + 0.16), base + h + 0.17, L.z + Math.cos(a) * (r + 0.16), a);
  }
  // The iron fire basket on the deck: a stem on splayed feet, a bowl, a cage of bars.
  const dy = base + TOP;
  sk.put(sk.cyl(0.09, 0.07, 1.25, 8), m.iron, L.x, dy, L.z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    beam(sk, [L.x + Math.sin(a) * 0.9, dy + 0.02, L.z + Math.cos(a) * 0.9], [L.x + Math.sin(a) * 0.08, dy + 0.7, L.z + Math.cos(a) * 0.08], 0.07, 0.07, m.iron);
  }
  const bowl = (sk.geo.beaconBowl ??= new THREE.CylinderGeometry(0.85, 0.42, 0.5, 14, 1, true).translate(0, 0.25, 0));
  sk.put(bowl, xm.ironDouble, L.x, dy + 1.22, L.z);
  sk.put(sk.cyl(0.44, 0.44, 0.06, 14), m.iron, L.x, dy + 1.2, L.z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    beam(sk, [L.x + Math.sin(a) * 0.84, dy + 1.7, L.z + Math.cos(a) * 0.84], [L.x + Math.sin(a) * 0.98, dy + 2.45, L.z + Math.cos(a) * 0.98], 0.05, 0.05, m.iron);
  }
  const hoop = (sk.geo.beaconHoop ??= new THREE.TorusGeometry(0.98, 0.04, 6, 24).rotateX(Math.PI / 2));
  sk.put(hoop, m.iron, L.x, dy + 2.45, L.z);
  // Glowing coals and a few charred logs in the bowl.
  sk.put(sk.cyl(0.62, 0.66, 0.12, 12), xm.ember, L.x, dy + 1.52, L.z);
  for (let i = 0; i < 4; i++) beam(sk, [L.x + Math.sin(i * 1.6) * 0.5, dy + 1.62, L.z + Math.cos(i * 1.6) * 0.5], [L.x - Math.sin(i * 1.6) * 0.4, dy + 1.78, L.z - Math.cos(i * 1.6) * 0.4], 0.14, 0.14, xm.coal);
  // Solid from the ground to the merlons (a closed tower; nobody climbs it).
  sk.colliders.addCircle(L.x, L.z, R0 + 0.35, y0, base + TOP + 1.85);
  // Fuel for the beacon, stacked by the door.
  const [wx, wz] = f.at(-2.7, R0 + 1.4);
  sk.woodpile(wx, wz, yaw + 0.2);
  // The fire itself, its light (small and warm), and the smoke.
  const fire = new Fire(sites.scene, L.x, dy + 1.6, L.z, { size: 1.15 });
  fire.light.distance = 16;
  fire.light.intensity = 7;
  sites.updaters.push((dt) => fire.update(dt));
  smoke.add(L.x, dy + 2.6, L.z, { puffs: 48, life: 22, rise: 60, size: [1.0, 14], grey: 0.52, opacity: 0.76, spread: 5, seed: 3 });
  keep.push(circleOut(L.x, L.z, 14));
  return { x: L.x, z: L.z, base, top: base + TOP + 1.85, fire };
}

// ------------------------------------------------------------------ the mine headframe
function headframe(sk, xm, smoke, keep) {
  const { m } = sk;
  const L = LANDMARKS.headframe;
  // The frame's side (the triangle of posts and back legs) faces the town; the winding shed stands
  // beside it, at the foot of the back legs; the Yard Path comes in behind, from the west.
  const town = Math.atan2(-8 - L.x, 14 - L.z);
  const f = frame(L.x, L.z, town);
  const base = sk.ground(L.x, L.z);
  const P = (lx, h, lz) => { const [x, z] = f.at(lx, lz); return [x, base + h, z]; };
  const S = 1.8, H = 10.8, SX = -4; // post spread (half), height of the head, shaft centre along lx
  // --- the shaft collar and its railing
  sk.begin('headframe shaft', ...f.at(SX, 0));
  for (const s of [-1, 1]) {
    sk.block(f, SX, s * 1.55, 3.6, 0.5, base + 0.45, m.wood, { bottom: base - 0.5 });
    sk.block(f, SX + s * 1.55, 0, 0.5, 2.6, base + 0.45, m.wood, { bottom: base - 0.5 });
  }
  const [shx, shz] = f.at(SX, 0);
  sk.put(sk.box(2.62, 0.04, 2.62), xm.dark, shx, base + 0.2, shz, f.yaw);
  // A plank apron round the collar that the railing stands on.
  for (const s of [-1, 1]) {
    sk.block(f, SX, s * 2.05, 4.7, 0.5, base + 0.08, m.wood, { bottom: base - 0.3, solid: false });
    sk.block(f, SX + s * 2.05, 0, 0.5, 3.6, base + 0.08, m.wood, { bottom: base - 0.3, solid: false });
  }
  // Railing round the collar (posts and two rails), with a gap on the shed side for the rope.
  for (const [a, b] of [[[-2.1, -2.1], [2.1, -2.1]], [[2.1, -2.1], [2.1, 2.1]], [[2.1, 2.1], [-2.1, 2.1]], [[-2.1, 2.1], [-2.1, -2.1]]]) {
    for (const h of [0.62, 1.08]) beam(sk, P(SX + a[0], h, a[1]), P(SX + b[0], h, b[1]), 0.1, 0.1, m.wood);
    beam(sk, P(SX + a[0], -0.2, a[1]), P(SX + a[0], 1.16, a[1]), 0.14, 0.14, m.wood);
  }
  sk.colliders.addBox(shx, shz, 2.25, 2.25, f.yaw, base - 0.5, base + 1.85);
  // --- the frame: four posts over the shaft (leaning in), girts, cross braces, the head, two back legs.
  sk.begin('headframe', ...f.at(SX, 0));
  const B = [0.72, 1.0], Tt = [0.45, 0.8]; // post positions (x S) at the foot and at the top
  const post = (px, pz, h) => { const t = (h + 0.3) / (H + 0.6); return [SX + px * (B[0] + (Tt[0] - B[0]) * t), pz * (B[1] + (Tt[1] - B[1]) * t)]; };
  const posts = [[-S, -S], [S, -S], [S, S], [-S, S]];
  for (const [px, pz] of posts) { const a = post(px, pz, -0.3), b = post(px, pz, H + 0.3); beam(sk, P(a[0], -0.3, a[1]), P(b[0], H + 0.3, b[1]), 0.34, 0.34, m.wood); }
  for (const h of [3.6, 7.2, H]) {
    for (let i = 0; i < 4; i++) {
      const a = post(...posts[i], h), b = post(...posts[(i + 1) % 4], h);
      beam(sk, P(a[0], h, a[1]), P(b[0], h, b[1]), 0.24, 0.26, m.wood);
    }
  }
  // Cross braces on the two faces the town sees (the lowest start above head height).
  for (const s of [-1, 1]) for (const [h0, h1] of [[1.9, 3.6], [3.6, 7.2], [7.2, H]]) {
    const a = post(-S, s * S, h0), b = post(S, s * S, h1);
    beam(sk, P(a[0], h0, a[1]), P(b[0], h1, b[1]), 0.16, 0.2, m.wood);
    const c = post(S, s * S, h0), d = post(-S, s * S, h1);
    beam(sk, P(c[0], h0, c[1]), P(d[0], h1, d[1]), 0.16, 0.2, m.wood);
  }
  // The head: two headers across the post tops, and on them the pair of bearers carrying the sheave.
  const topY = H + 0.3;
  for (const px of [-S, S]) { const a = post(px, -S, topY), b = post(px, S, topY); beam(sk, P(a[0], topY + 0.13, a[1] - 0.2), P(b[0], topY + 0.13, b[1] + 0.2), 0.3, 0.26, m.wood); }
  const hy = topY + 0.26 + 0.17, hl = post(-S, 0, topY)[0] - 0.35, hr = post(S, 0, topY)[0] + 0.35;
  for (const s of [-1, 1]) beam(sk, P(hl, hy, s * 0.55), P(hr, hy, s * 0.55), 0.3, 0.34, m.wood);
  // Back legs from the rear posts' tops, raking down towards the shed.
  const foot = 3.2;
  for (const s of [-1, 1]) {
    const top = post(S, s * S, H - 0.2);
    beam(sk, P(top[0] + 0.1, H - 0.2, top[1]), P(foot, -0.35, s * 1.9), 0.36, 0.36, m.wood);
    for (const t of [0.35, 0.68]) {
      const bx = top[0] + 0.1 + (foot - top[0] - 0.1) * t, by = H - 0.2 + (-0.35 - H + 0.2) * t;
      const pa = post(S, s * S, by);
      beam(sk, P(pa[0], by, pa[1]), P(bx, by, s * (Math.abs(top[1]) + (1.9 - Math.abs(top[1])) * t)), 0.2, 0.22, m.wood);
    }
  }
  // The sheave wheel turning between the bearers: rim, spokes, hub on an axle. (Heights above the yard.)
  const WR = 1.35, wy = hy + 1.2; // the axle sits on bearing blocks on the bearers, the rim clear of the headers
  const [wx, wz] = f.at(SX, 0);
  const rim = (sk.geo.sheaveRim ??= new THREE.TorusGeometry(WR, 0.09, 8, 36));
  sk.put(rim, m.iron, wx, base + wy, wz, f.yaw);
  const hub = (sk.geo.sheaveHub ??= new THREE.CylinderGeometry(0.2, 0.2, 1.3, 10).rotateX(Math.PI / 2));
  sk.put(hub, m.iron, wx, base + wy, wz, f.yaw);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    beam(sk, P(SX, wy, 0), P(SX + Math.sin(a) * WR, wy + Math.cos(a) * WR, 0), 0.07, 0.07, m.iron);
  }
  // Bearing blocks carrying the axle ends, on the bearers.
  for (const s of [-1, 1]) { const [bx, bz] = f.at(SX, s * 0.55); sk.put(sk.box(0.5, 1.2, 0.34), m.wood, bx, base + hy + 0.15, bz, f.yaw); }
  // The winding rope: off the back of the wheel down into the shed, and off the front down the shaft.
  beam(sk, P(SX + WR * 0.62, wy + WR * 0.78, 0), P(3.95, 3.0, 0), 0.05, 0.05, xm.rope);
  beam(sk, P(SX - WR, wy, 0), P(SX - WR, 0.15, 0), 0.05, 0.05, xm.rope);
  const wheelY = base + wy;
  // Colliders: the posts where a person meets them, and the line of the back legs' feet.
  for (const [px, pz] of posts) { const [a0, a1] = post(px, pz, 1.0); const [x, z] = f.at(a0, a1); sk.colliders.addCircle(x, z, 0.32, base - 0.5, base + 4); }
  { const [x, z] = f.at(foot - 0.3, 0); sk.colliders.addBox(x, z, 0.75, 2.25, f.yaw, base - 0.5, base + 1.85); }
  // --- the winding shed and its boiler chimney
  shed(sk, f, base, 6.1, 0, 4.5, 4.4, xm);
  const [cx, cz] = f.at(7.4, -2.75);
  sk.begin('headframe chimney', cx, cz);
  const chH = 10.6;
  sk.block(f, 7.4, -2.75, 1.05, 1.05, base + 0.9, m.stone);
  sk.put(sk.box(0.82, +(chH - 0.9).toFixed(2), 0.82), xm.redBrick, cx, base + 0.9, cz, f.yaw);
  sk.put(sk.box(1.02, 0.28, 1.02), m.rock, cx, base + chH - 0.3, cz, f.yaw);
  sk.put(sk.box(0.6, 0.02, 0.6), xm.dark, cx, base + chH - 0.01, cz, f.yaw);
  sk.colliders.addBox(cx, cz, 0.55, 0.55, f.yaw, base - 0.5, base + chH);
  smoke.add(cx, base + chH + 0.1, cz, { puffs: 44, life: 22, rise: 56, size: [0.8, 13], grey: 0.58, opacity: 0.76, spread: 4.2, seed: 7 });
  // --- a stack of pit props by the path, and spoil tipped over the yard's edge
  timberStack(sk, f, base, 2.0, 4.2, xm);
  for (const [lx, lz, R, Hh] of [[-1.2, 4.3, 1.2, 1.0], [5.8, 4.6, 1.0, 0.8]]) { const [x, z] = f.at(lx, lz); rubble(sk, xm, x, z, R, Hh, rng(lx * 100 + lz), 'spoil heap'); }
  keep.push(circleOut(L.x, L.z, 12));
  return { x: L.x, z: L.z, base, top: wheelY + WR, chimney: [cx, base + chH, cz] };
}

// A timber shed on a stone footing with a board roof, closed (the winding engine is inside).
function shed(sk, f, base, lx, lz, w, d, xm) {
  const { m } = sk;
  const [x, z] = f.at(lx, lz);
  sk.begin('winding shed', x, z);
  sk.block(f, lx, lz, w + 0.2, d + 0.2, base + 0.55, m.stone, { solid: false });
  sk.block(f, lx, lz, w, d, base + 3.1, m.wood, { bottom: base + 0.5, solid: false });
  // Corner posts and a wall plate.
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) sk.block(f, lx + sx * (w / 2 - 0.06), lz + sz * (d / 2 - 0.06), 0.24, 0.24, base + 3.2, m.wood, { bottom: base + 0.5, solid: false });
  // Doors on the yard side, and a boarded window.
  const [dx, dz] = f.at(lx - 0.6, lz + d / 2 + 0.04);
  sk.put(sk.box(1.5, 2.2, 0.1), m.wood, dx, base + 0.55, dz, f.yaw);
  sk.put(sk.box(1.7, 0.16, 0.14), m.wood, dx, base + 2.75, dz, f.yaw);
  const [wx, wz] = f.at(lx + 1.4, lz + d / 2 + 0.04);
  sk.put(sk.box(0.9, 0.7, 0.08), xm.dark, wx, base + 1.7, wz, f.yaw);
  sk.put(sk.box(1.05, 0.1, 0.12), m.wood, wx, base + 1.62, wz, f.yaw);
  // Pitched board roof, ridge along lx.
  const pitch = 0.5, half = d / 2 + 0.45, run = half / Math.cos(pitch);
  for (const s of [-1, 1]) {
    const [rx, rz] = f.at(lx, lz + s * half * 0.5);
    sk.put(sk.box(w + 0.8, 0.12, +run.toFixed(2)), m.wood, rx, base + 3.1 + Math.tan(pitch) * half * 0.5 - 0.3, rz, f.yaw, 1, 1, 1, s * pitch, 0);
  }
  // Gable ends.
  for (const s of [-1, 1]) sk.profile(f, lx + s * (w / 2 - 0.06), lz, base + 3.1, [[-d / 2, 0], [d / 2, 0], [0, Math.tan(pitch) * d / 2]], 0.12, m.wood, { turn: -Math.PI / 2 });
  sk.colliders.addBox(x, z, w / 2 + 0.1, d / 2 + 0.1, f.yaw, base - 0.5, base + 3.4);
}

// Squared pit props stacked criss-cross on bearers.
function timberStack(sk, f, base, lx, lz, xm) {
  const { m } = sk;
  const [x, z] = f.at(lx, lz);
  const y = sk.ground(x, z);
  sk.begin('pit props', x, z);
  for (let row = 0; row < 4; row++) {
    const along = row % 2 === 0;
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 0.46;
      const [bx, bz] = along ? f.at(lx, lz + o) : f.at(lx + o, lz);
      sk.put(sk.box(along ? 2.2 : 0.3, 0.3, along ? 0.3 : 2.2), m.wood, bx, y - 0.05 + row * 0.3, bz, f.yaw);
    }
  }
  const sh = sk.colliders.addBox(x, z, 1.15, 1.15, f.yaw, y - 0.3, y + 1.15);
  return sh;
}

// ------------------------------------------------------------------ the lighthouse
function lighthouse(sk, xm, keep) {
  const { m } = sk;
  // The tower stands just past the end of the Lighthouse Path, on the bank over the water.
  const path = roadById('lighthouse').pts;
  const [ex, ez] = path[path.length - 1], [qx, qz] = path[path.length - 2];
  const dl = Math.hypot(ex - qx, ez - qz), ux = (ex - qx) / dl, uz = (ez - qz) / dl;
  const R0 = 3.1;
  const tx = ex + ux * (R0 + 0.9), tz = ez + uz * (R0 + 0.9);
  const doorYaw = Math.atan2(-ux, -uz); // the door looks back up the path
  const f = frame(tx, tz, doorYaw);
  const floor = sk.ground(ex, ez) + 0.1;
  let low = Infinity;
  for (let a = 0; a < TAU; a += TAU / 16) low = Math.min(low, sk.ground(tx + Math.cos(a) * (R0 + 0.6), tz + Math.sin(a) * (R0 + 0.6)));
  const y0 = low - 0.7;
  const TOWER = 13.2, R1 = 2.3;
  sk.begin('lighthouse', tx, tz);
  // A plinth of rough stone out of the bank, then the whitewashed tower.
  const plinth = courseGeometry([[R0 + 0.55, 0], [R0 + 0.35, floor - y0 - 0.2], [R0 + 0.35, floor - y0]], { segments: 36, tile: 2.7 });
  plinth.userData.wuv = true;
  sk.put(plinth, m.rock, tx, y0, tz);
  sk.put(sk.cyl(R0 + 0.35, R0 + 0.35, 0.25, 36), m.rock, tx, floor - 0.2, tz);
  const body = courseGeometry([[R0, 0], [R1, TOWER]], { segments: 36, tile: 2.2 });
  body.userData.wuv = true;
  sk.put(body, xm.whitewash, tx, floor, tz);
  // The gallery: a stone ledge on corbels with an iron rail.
  const gy = floor + TOWER;
  const ledge = courseGeometry([[R1 + 0.9, 0], [R1 + 0.9, 0.3], [0.05, 0.3]], { segments: 36, tile: 2.7 });
  ledge.userData.wuv = true;
  sk.put(ledge, m.rock, tx, gy - 0.3, tz);
  const under = courseGeometry([[R1 + 0.02, 0], [R1 + 0.9, 0.55]], { segments: 36, tile: 2.7 });
  under.userData.wuv = true;
  sk.put(under, m.rock, tx, gy - 0.85, tz);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    sk.put(sk.cyl(0.035, 0.035, 1.0, 5), m.iron, tx + Math.sin(a) * (R1 + 0.8), gy, tz + Math.cos(a) * (R1 + 0.8));
  }
  const rail = (sk.geo.lhRail ??= new THREE.TorusGeometry(R1 + 0.8, 0.04, 5, 40).rotateX(Math.PI / 2));
  sk.put(rail, m.iron, tx, gy + 1.0, tz);
  // The lantern room: glazing between iron mullions, a copper-dark dome, a vane.
  const LR = 1.45, LH = 2.0;
  sk.put(sk.cyl(LR + 0.1, LR + 0.1, 0.35, 16), m.stone, tx, gy, tz);
  sk.put(sk.cyl(LR, LR, LH, 16), xm.lantern, tx, gy + 0.35, tz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    sk.put(sk.box(0.08, LH, 0.08), m.iron, tx + Math.sin(a) * (LR + 0.02), gy + 0.35, tz + Math.cos(a) * (LR + 0.02), a);
  }
  const dome = new THREE.SphereGeometry(LR + 0.2, 16, 8, 0, TAU, 0, Math.PI / 2);
  sk.put(dome, xm.red, tx, gy + 0.35 + LH, tz, 0, 1, 0.72, 1);
  sk.put(sk.cyl(0.04, 0.06, 1.0, 6), m.iron, tx, gy + 0.35 + LH + (LR + 0.2) * 0.72 - 0.05, tz);
  sk.put(new THREE.SphereGeometry(0.13, 8, 6), m.iron, tx, gy + 0.35 + LH + (LR + 0.2) * 0.72 + 0.95, tz);
  // The door, at the head of three steps up from the path.
  const [dx, dz] = f.at(0, R0 - 0.02);
  const surround = new THREE.Shape([[-0.85, 0], [0.85, 0], [0.85, 2.55], [-0.85, 2.55]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path([[-0.55, 0], [0.55, 0], [0.55, 2.2], [-0.55, 2.2]].map(([x, y]) => new THREE.Vector2(x, y)));
  surround.holes.push(hole);
  sk.put(new THREE.ExtrudeGeometry(surround, { depth: 0.4, bevelEnabled: false }).translate(0, 0, -0.2), m.rock, dx, floor, dz, doorYaw);
  const [lx, lz] = f.at(0, R0 - 0.12);
  sk.put(sk.box(1.1, 2.2, 0.1), m.wood, lx, floor, lz, doorYaw);
  // Two windows up the tower, facing the lake and the town.
  for (const [a, h] of [[doorYaw + Math.PI, 5.5], [doorYaw + 2.3, 9.2]]) {
    const r = R0 - ((R0 - R1) * (h + 0.5)) / TOWER;
    sk.put(sk.box(0.62, 1.05, 0.34), m.rock, tx + Math.sin(a) * r, floor + h - 0.08, tz + Math.cos(a) * r, a);
    sk.put(sk.box(0.42, 0.85, 0.06), xm.lantern, tx + Math.sin(a) * (r + 0.16), floor + h, tz + Math.cos(a) * (r + 0.16), a);
  }
  sk.colliders.addCircle(tx, tz, R0 + 0.6, y0, gy + 1.2);
  keeperHut(sk, f, tx, tz, doorYaw, R0, xm);
  keep.push(circleOut(tx, tz, 13));
  return { x: tx, z: tz, base: floor, top: gy + 0.35 + LH + (LR + 0.2) * 0.72 + 1.1 };
}

// The keeper's cottage: stone walls, a door, a window, a tiled roof and a chimney, beside the path.
function keeperHut(sk, tf, tx, tz, yaw, R0, xm) {
  const { m } = sk;
  // Upslope of the tower, set back from the path on its left.
  const f = frame(...tf.at(-7.2, R0 + 3.0), yaw);
  const W = 4.4, D = 3.6;
  let low = Infinity, high = -Infinity;
  for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) { const [x, z] = f.at(a * W, b * D); const h = sk.ground(x, z); low = Math.min(low, h); high = Math.max(high, h); }
  const floor = high + 0.12;
  const [x, z] = f.at(0, 0);
  sk.begin("keeper's hut", x, z);
  sk.block(f, 0, 0, W + 0.3, D + 0.3, floor, m.rock, { bottom: low - 0.4, solid: false });
  sk.block(f, 0, 0, W, D, floor + 2.6, xm.whitewash, { bottom: floor - 0.02, solid: false });
  const [dx, dz] = f.at(0.6, D / 2 + 0.03);
  sk.put(sk.box(0.95, 1.95, 0.08), m.wood, dx, floor, dz, yaw);
  sk.put(sk.box(1.15, 0.14, 0.14), m.rock, dx, floor + 1.95, dz, yaw);
  const [wx, wz] = f.at(-1.2, D / 2 + 0.03);
  sk.put(sk.box(0.7, 0.7, 0.06), xm.lantern, wx, floor + 1.0, wz, yaw);
  sk.put(sk.box(0.86, 0.1, 0.14), m.rock, wx, floor + 0.94, wz, yaw);
  // Roof: two tiled slopes, ridge along the front, gables in whitewash.
  const pitch = 0.62, half = D / 2 + 0.35, run = half / Math.cos(pitch);
  for (const s of [-1, 1]) {
    const [rx, rz] = f.at(0, s * half * 0.5);
    sk.put(sk.box(W + 0.7, 0.14, +run.toFixed(2)), m.tiles, rx, floor + 2.6 + Math.tan(pitch) * half * 0.5 - 0.32, rz, yaw, 1, 1, 1, s * pitch, 0);
  }
  for (const s of [-1, 1]) sk.profile(f, s * (W / 2 - 0.05), 0, floor + 2.6, [[-D / 2, 0], [D / 2, 0], [0, Math.tan(pitch) * D / 2]], 0.1, xm.whitewash, { turn: -Math.PI / 2 });
  const [cx, cz] = f.at(W / 2 - 0.5, -0.3);
  sk.put(sk.box(0.6, 3.1, 0.6), m.stone, cx, floor + 1.6, cz, yaw);
  sk.put(sk.box(0.72, 0.14, 0.72), m.rock, cx, floor + 4.7, cz, yaw);
  sk.colliders.addBox(x, z, W / 2 + 0.2, D / 2 + 0.2, yaw, low - 0.5, floor + 2.9);
}

// ------------------------------------------------------------------ dock and jetty lanterns
// Iron lamp posts like the town's: two at the head of the dock, and three along the jetty on piles.
function dockLamps(sk) {
  const D = LANDMARKS.dock;
  // The jetty runs from the dock toward the middle of the lake (see resources.js).
  const jx = -70 - D.x, jz = 250 - D.z, jl = Math.hypot(jx, jz), ux = jx / jl, uz = jz / jl;
  const out = [];
  for (const s of [-1, 1]) {
    const x = D.x - ux * 1.6 + uz * s * 2.2, z = D.z - uz * 1.6 - ux * s * 2.2;
    sk.lamp(x, z, sk.ground(x, z));
    out.push([x, z]);
  }
  const deck = 0.55;
  for (const [t, s] of [[6, -1], [10, 1], [13.4, -1]]) {
    const x = D.x + ux * t + uz * s * 1.2, z = D.z + uz * t - ux * s * 1.2;
    pileLamp(sk, x, z, deck);
    out.push([x, z]);
  }
  return out;
}

// A lamp standard on a timber pile beside the jetty deck.
function pileLamp(sk, x, z, deck) {
  const { m } = sk;
  const bed = sk.ground(x, z) - 0.3;
  const top = deck + 0.2;
  sk.begin('jetty lamp', x, z);
  sk.put(sk.cyl(0.13, 0.15, top - bed, 8), m.wood, x, bed, z);
  const y = top;
  sk.put(sk.cyl(0.11, 0.14, 0.3, 8), m.iron, x, y, z);
  sk.put(sk.cyl(0.055, 0.075, 2.5, 8), m.iron, x, y + 0.28, z);
  sk.put(sk.box(0.34, 0.06, 0.34), m.iron, x, y + 2.75, z);
  sk.put(sk.box(0.26, 0.42, 0.26), m.glass, x, y + 2.8, z);
  sk.put(sk.cyl(0.005, 0.25, 0.22, 4), m.iron, x, y + 3.22, z, Math.PI / 4);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) sk.put(sk.box(0.03, 0.42, 0.03), m.iron, x + dx * 0.14, y + 2.8, z + dz * 0.14);
  sk.colliders.addCircle(x, z, 0.17, bed, y + 3.3);
}
