import * as THREE from 'three';
import { EXITS, PORTAL } from './map.js';
import { frame } from './sitekit.js';
import { Batcher } from './kit.js';
import { rng } from './buildings.js';
import { boardTexture, texturedMaterial } from './townkit.js';

// The three ways out of the vale, each closed for a reason you can read on a notice beside it:
//   North Pass   a masonry portal in the rock at the end of the Highroad, the tunnel behind it fallen in
//   East Pass    a gatehouse of two square towers across the gorge, its gate shut and its portcullis down
//   South Pass   a toll bar across the gorge: a keeper's hut, a striped boom, a stockade to the cliff
// Every closure is a wall of solid shapes at least 2.4 m tall running from cliff to cliff (its ends sunk deep
// in the gorge walls), with one way through it that is shut with a gate, a boom or a heap of rubble. That way
// is what `setLocked(id, false)` opens; the walls stay. Positions, facing and ground come from EXITS in
// map.js; the gorge floors under them are level and made there (notches()).
//
// Everything is built through SiteKit, so it is batched, world-scale textured and audited. The parts that
// move or go away (gate leaves, portcullis, boom, chain, rubble) are built into their own Batchers.

const PI = Math.PI;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ small geometry helpers
// Points along a semicircular arch (centre cx, springing height ys, radius R): left springing over the top to
// the right. `inner` leaves out the two springing points themselves.
function archPts(cx, ys, R, n = 28, inner = false) {
  const out = [];
  for (let i = inner ? 1 : 0; i <= (inner ? n - 1 : n); i++) {
    const a = PI - (PI * i) / n;
    out.push([cx + Math.cos(a) * R, ys + Math.sin(a) * R]);
  }
  return out;
}

const cboxCache = new Map();
// A box centred on its own origin (for struts and timbers set at any angle).
function cbox(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!cboxCache.has(k)) cboxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return cboxCache.get(k);
}

// A square timber (or bar) from point A to point B, [x, y, z] each, `t` thick.
function strut(sk, mat, A, B, t) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const len = Math.hypot(dx, dy, dz), horiz = Math.hypot(dx, dz);
  sk.put(cbox(len, t, t), mat, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2, Math.atan2(-dz, dx), 1, 1, 1, 0, Math.atan2(dy, horiz));
}

// A lumpy, angular rock of about `size` (radius) metres, its size baked in so its texture keeps the kit's scale.
function rockGeo(size, rnd, flat = 0.72) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position;
  const seed = [rnd() * 9, rnd() * 9, rnd() * 9];
  // (The icosahedron is already unindexed, its corners repeated per face: the displacement depends on position
  // alone, so the faces stay joined.)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const jitter = (Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed[0]) * 43758.5453) % 1;
    const n = 1 + 0.3 * (Math.sin(x * 3.7 / size + seed[0]) * Math.sin(y * 3.1 / size + seed[1]) * Math.sin(z * 4.3 / size + seed[2])) + jitter * 0.07;
    p.setXYZ(i, x * n, y * n * flat, z * n);
  }
  g.computeVertexNormals();
  return g;
}

// A dressed block of w x h x d with slightly knocked corners.
function chippedBlock(w, h, d, rnd) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * 0.05, p.getY(i) + (rnd() - 0.5) * 0.05, p.getZ(i) + (rnd() - 0.5) * 0.05);
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  return n;
}

// A banner's cloth: canvas with a swallowtail bottom (the cut-out is the texture's alpha) and a device.
function bannerTexture(field, device) {
  const W = 256, H = 640, notch = 120;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const path = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W / 2, H - notch); g.lineTo(0, H); g.closePath(); };
  path();
  g.fillStyle = field;
  g.fill();
  g.save();
  path();
  g.clip();
  device(g, W, H);
  // Weave and wear.
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 14);
  }
  g.restore();
  g.lineWidth = 9;
  g.strokeStyle = '#d6b25a';
  path();
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A plane that hangs in soft folds (fixed at its top edge).
function wavyPlane(w, h, seed, amp = 0.09) {
  const g = new THREE.PlaneGeometry(w, h, 8, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), k = (h / 2 - y) / h; // 0 at the bar, 1 at the tail
    p.setZ(i, amp * Math.sin(x * 4.2 + y * 1.6 + seed) * (0.25 + k) + Math.sin(y * 2.1 + seed) * 0.03 * k);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ shared builders
function materials(sk) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  return {
    dark: std(0x1a1613, { roughness: 1 }),                    // the inside of the bore, arrow slits
    black: new THREE.MeshBasicMaterial({ color: 0x040302 }),  // where the tunnel goes on
    red: std(0xa5312a, { roughness: 0.65 }),
    white: std(0xe8e2d2, { roughness: 0.65 }),
  };
}

// Builds pieces into their own Batcher and returns the merged group (for things that move or go away).
function dynamic(sk, scene, fn) {
  const main = sk.batch;
  const b = new Batcher(sk.kit);
  sk.batch = b;
  try { fn(); } finally { sk.batch = main; }
  const g = b.build();
  scene.add(g);
  return g;
}

// A node that turns about a vertical axis through (x, z), carrying a group that was built in world coordinates.
function hingeY(scene, g, x, z) {
  const p = new THREE.Group();
  p.position.set(x, 0, z);
  g.position.set(-x, 0, -z);
  p.add(g);
  scene.add(p);
  return p;
}
// A node that turns about the axis through `hinge` that runs front to back in a frame of the given yaw
// (its own z axis), carrying a group built in world coordinates. Rotate the returned node's `.rotation.z`.
function hingeZ(scene, g, hinge, yaw) {
  const A = new THREE.Group(), B = new THREE.Group(), C = new THREE.Group(), D = new THREE.Group();
  A.position.set(hinge[0], hinge[1], hinge[2]);
  A.rotation.y = yaw;
  C.rotation.y = -yaw;
  D.position.set(-hinge[0], -hinge[1], -hinge[2]);
  D.add(g);
  C.add(D);
  B.add(C);
  A.add(B);
  scene.add(A);
  return B;
}

// Fells the trees a closure would stand among (its `clear` distances are metres along the road and across it).
function clearTrees(world, e) {
  const [along, across] = e.clear;
  for (const t of world.forest.trees) {
    const dx = t.x - e.x, dz = t.z - e.z, u = dx * e.tx + dz * e.tz, v = dz * e.tx - dx * e.tz;
    if (Math.abs(u) < along + t.radius && Math.abs(v) < across + t.radius) {
      t.felled = true;
      t.radius = 0;
    }
  }
}

// A notice: two posts, a board with a painted header and a few sheets pinned to it, a little roof.
// Returns its interactable (E reads it).
function noticeStand(ctx, f, lx, lz, header, sign, { width = 1.4 } = {}) {
  const { sk, m, w } = ctx;
  const [x, z] = f.at(lx, lz);
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  sk.begin('notice board', x, z);
  // Posts stand on the ground under each of them; the board hangs at one height between them.
  const px = [-1, 1].map((k) => f.at(lx + k * (width / 2 + 0.06), lz));
  const gy = px.map(([qx, qz]) => sk.ground(qx, qz));
  const base = Math.min(...gy), y = Math.max(...gy);
  px.forEach(([qx, qz], i) => sk.put(sk.box(0.14, y + 2.55 - (gy[i] - 0.25), 0.14), m.wood, qx, gy[i] - 0.25, qz, f.yaw));
  const yb = y + 0.95;
  sk.put(sk.box(width, 0.92, 0.07), m.wood, x, yb, z, f.yaw);
  // Header plank with the title painted on.
  sk.put(sk.box(width + 0.24, 0.3, 0.09), m.wood, x, yb + 0.95, z, f.yaw);
  const mat = texturedMaterial(boardTexture(header, { w: 512, h: 112 }), 0.85);
  sk.put(new THREE.PlaneGeometry(width + 0.1, 0.24), mat, x + s * 0.048, yb + 1.1, z + c * 0.048, f.yaw);
  // Sheets pinned to the board.
  const rnd = rng(Math.round(x * 13 + z * 7));
  for (let i = 0; i < 5; i++) {
    const kx = -width / 2 + 0.2 + (i / 4) * (width - 0.4) + (rnd() - 0.5) * 0.08, ky = yb + 0.3 + rnd() * 0.32;
    const [qx, qz] = f.at(lx + kx, lz + 0.045);
    sk.put(sk.box(0.24 + rnd() * 0.1, 0.32 + rnd() * 0.16, 0.012), m.paper, qx, ky, qz, f.yaw + (rnd() - 0.5) * 0.16);
  }
  // A little roof over the lot: two planks meeting at a ridge.
  for (const k of [-1, 1]) {
    const [qx, qz] = f.at(lx, lz + k * 0.2);
    sk.put(sk.box(width + 0.5, 0.05, 0.42), m.wood, qx, y + 2.5 + 0.1, qz, f.yaw, 1, 1, 1, k * 0.42, 0);
  }
  const sh = w.colliders.addBox(x, z, width / 2 + 0.25, 0.22, f.yaw, base - 0.4, y + 2.6);
  return {
    kind: 'station', station: 'sign', name: 'Notice board', verb: 'Read the', title: sign.title, text: sign.text,
    x, y: yb + 0.5, z, r: 1.0, h: 2.6, reach: 3.4, shape: sh,
  };
}

// A scatter of fallen boulders in a frame: [lx, lz, size] each, sunk into the ground and solid.
function boulders(ctx, f, list, seed) {
  const { sk, w } = ctx;
  const rnd = rng(seed);
  for (const [lx, lz, size] of list) {
    const [x, z] = f.at(lx, lz);
    const g0 = sk.ground(x, z), flat = 0.68 + rnd() * 0.2;
    sk.begin('boulder', x, z);
    sk.put(rockGeo(size, rnd, flat), sk.m.rock, x, g0 + size * flat * 0.45, z, rnd() * PI * 2);
    w.colliders.addCircle(x, z, size * 0.82, g0 - 0.3, g0 + size * flat * 1.4);
  }
}

// Solid rock standing in the gorge walls at both ends of a closure: tall boxes from `lx0` to `lx1` on each side,
// sunk in the wall, so nobody can go round the end of the structure by climbing the gorge's foot. They hold
// nothing to see (the rock is the terrain), so the audit is told they are meant.
function seals(ctx, f, y0, lx0, lx1, lz, thick = 1.6, top = 34) {
  const { w } = ctx;
  for (const side of [-1, 1]) {
    const lo = Math.min(side * lx0, side * lx1), hi = Math.max(side * lx0, side * lx1);
    const [x, z] = f.at((lo + hi) / 2, lz);
    const sh = w.colliders.addBox(x, z, (hi - lo) / 2, thick / 2, f.yaw, y0 - 3, y0 + top);
    sh.noCamera = true;
    sh.exempt = true;
  }
}

// ------------------------------------------------------------------ the builder
export function buildExits(sites) {
  const sk = sites.sk, world = sites.world, scene = sites.scene;
  const ctx = { sk, w: world, scene, m: sk.m, kit: sk.kit, X: materials(sk), sites };
  const out = { byId: {}, list: [] };
  for (const e of EXITS) {
    const build = { tunnel: buildTunnel, gatehouse: buildGatehouse, toll: buildToll }[e.kind];
    if (!build) continue;
    clearTrees(world, e);
    const part = build(ctx, e);
    part.id = e.id;
    part.locked = true;
    part.t = 0;            // 0 shut .. 1 open
    part.target = 0;
    part.apply(0);
    sites.interactables.push(part.notice);
    out.byId[e.id] = part;
    out.list.push(part);
  }
  out.isLocked = (id) => out.byId[id]?.target === 0;
  // Opens or shuts a way (`on` = locked). Animated by step(); `instant` skips the animation.
  out.setLocked = (id, on, { instant = false } = {}) => {
    const p = out.byId[id];
    if (!p) throw new Error(`no exit called ${id}`);
    p.target = on ? 0 : 1;
    p.locked = on;
    if (instant) { p.t = p.target; p.apply(p.t); }
  };
  out.step = (dt) => {
    for (const p of out.list) {
      if (p.t === p.target) continue;
      const dir = Math.sign(p.target - p.t);
      p.t = clamp01(p.t + (dir * dt) / p.seconds);
      if ((p.t - p.target) * dir > 0) p.t = p.target;
      p.apply(p.t);
    }
  };
  return out;
}

// Turns the closure's toggled colliders on or off.
const setSolid = (shapes, on) => { for (const sh of shapes) sh.removed = !on; };

// ================================================================== NORTH: the tunnel portal
function buildTunnel(ctx, e) {
  const { sk, w, m, X, scene } = ctx;
  const P = PORTAL;
  const f = frame(e.x, e.z, e.facing);
  const y0 = w.heightAt(e.x, e.z);                       // the floor of the porch = the end of the road
  const HALF = P.half, TOP = P.top, R = 2.3, YS = 2.75;  // half the block's width, its height, the arch radius and springing
  const lzF = -P.front, lzB = -(P.front + P.depth), lzM = (lzF + lzB) / 2;
  const at = (lx, lz) => f.at(lx, lz);
  const [cx, cz] = at(0, lzM);
  const rnd = rng(9931);

  // --- the porch: one block of dressed stone with the arch cut through it
  sk.begin('tunnel portal', cx, cz);
  const block = [[-HALF, -1.4], [-R, -1.4], [-R, YS], ...archPts(0, YS, R, 32, true), [R, YS], [R, -1.4], [HALF, -1.4], [HALF, TOP], [-HALF, TOP]];
  sk.profile(f, 0, lzM, y0, block, P.depth, m.stone);
  // Solid: a pier each side of the mouth, and the roof over the arch.
  for (const s of [-1, 1]) {
    const [x, z] = at((s * (R + HALF)) / 2, lzM);
    w.colliders.addBox(x, z, (HALF - R) / 2, P.depth / 2, f.yaw, y0 - 1.5, y0 + TOP);
  }
  w.colliders.addBox(cx, cz, R, P.depth / 2, f.yaw, y0 + YS + R - 0.05, y0 + TOP);
  // Voussoirs round the mouth with a keystone, imposts and dressed jambs, all in the paler stone.
  const N = 17, Ro = R + 0.62;
  for (let i = 0; i < N; i++) {
    const a0 = PI - (PI * i) / N + 0.012, a1 = PI - (PI * (i + 1)) / N - 0.012, key = i === (N - 1) / 2;
    const ro = key ? Ro + 0.26 : Ro, depth = key ? 0.36 : 0.22;
    const q = (a, r) => [Math.cos(a) * r, YS + Math.sin(a) * r];
    sk.profile(f, 0, lzF + depth / 2 - 0.02, y0, [q(a0, R), q(a0, ro), q(a1, ro), q(a1, R)], depth, m.rock);
  }
  for (const s of [-1, 1]) {
    const [ix, iz] = at(s * (R + 0.34), lzF + 0.11);
    sk.put(sk.box(1.0, 0.34, 0.26), m.rock, ix, y0 + YS - 0.34, iz, f.yaw);
    for (let k = 0, y = 0; y < YS - 0.34; k++, y += 0.5) {
      const len = k % 2 ? 0.55 : 0.95;
      const [jx, jz] = at(s * (R + len / 2 - 0.02), lzF + 0.1);
      sk.put(sk.box(len, 0.46, 0.2), m.rock, jx, y0 + y, jz, f.yaw);
    }
  }
  // A plinth band, a string course under the parapet, and the coping.
  const [bx, bz] = at(0, lzF + 0.13);
  sk.put(sk.box(2 * HALF + 0.3, 0.62, 0.3), m.rock, bx, y0 - 0.1, bz, f.yaw);
  const [sx, sz] = at(0, lzF + 0.1);
  sk.put(sk.box(2 * HALF + 0.2, 0.26, 0.26), m.rock, sx, y0 + TOP - 1.35, sz, f.yaw);
  sk.put(sk.box(2 * HALF + 0.5, 0.3, P.depth + 0.5), m.rock, cx, y0 + TOP - 0.02, cz, f.yaw);
  wings(ctx, f, y0, lzF, lzB, HALF, TOP, 4);

  // --- the timber sets in the mouth: two frames of posts and a cap, the first just inside the face
  for (const [lz, sag] of [[lzF - 0.85, 0], [lzF - 2.5, 0.06]]) {
    const [tx, tz] = at(0, lz);
    sk.begin('timber set', tx, tz);
    for (const s of [-1, 1]) {
      const [qx, qz] = at(s * (R - 0.3), lz);
      sk.put(sk.box(0.34, YS + 0.5, 0.34), m.wood, qx, y0 - 0.1, qz, f.yaw);
      w.colliders.addBox(qx, qz, 0.17, 0.17, f.yaw, y0 - 0.2, y0 + YS + 0.4);
    }
    sk.put(sk.box(2 * R + 0.1, 0.38, 0.4), m.wood, tx, y0 + YS + 0.35 - sag, tz, f.yaw);
  }
  // --- where the bore goes on: a dark lining, a black end, a solid stop
  sk.begin('bore', cx, cz);
  {
    const ri = R - 0.03, ro = R + 0.3;
    const lining = [[-ro, -1.4], [-ri, -1.4], [-ri, YS], ...archPts(0, YS, ri, 24, true), [ri, YS], [ri, -1.4], [ro, -1.4], [ro, YS + ri + 0.3], [-ro, YS + ri + 0.3]];
    const z0 = lzF - 0.55, z1 = lzB + 0.12;
    sk.profile(f, 0, (z0 + z1) / 2, y0, lining, z0 - z1, X.dark);
    const [ex, ez] = at(0, lzB + 0.3);
    sk.put(sk.box(2 * R + 0.2, YS + R + 0.4, 0.14), X.black, ex, y0 - 0.2, ez, f.yaw);
    w.colliders.addBox(ex, ez, R + 0.1, 0.2, f.yaw, y0 - 1, y0 + YS + R);
  }

  // --- the choke: a heap of fallen stone and broken timber filling the mouth and spilling onto the road
  const HEAP = { a: 4.1, b: 6.7, h: 4.55 };
  const hh = (lx, lz) => {
    const q = (lx / HEAP.a) ** 2 + ((lz - lzF) / HEAP.b) ** 2;
    if (q >= 1) return 0;
    const n = 0.5 * Math.sin(lx * 1.9 + 1.3) * Math.sin(lz * 1.3 + 0.4) + 0.3 * Math.sin(lx * 4.1 + lz * 3.3);
    return Math.max(0, HEAP.h * Math.pow(1 - q, 1.2) + n * Math.min(1, (1 - q) * 3));
  };
  const surf = (lx, lz) => { const [x, z] = at(lx, lz); return sk.ground(x, z) + hh(lx, lz) * 0.93 - 0.05; };
  const heap = dynamic(sk, scene, () => {
    const [hx, hz] = at(0, lzF + 2.2);
    sk.begin('rubble', hx, hz);
    // The mound itself: a lumpy shell, so there is no daylight between the stones.
    const NX = 30, NZ = 26, ax = 4.3, az0 = lzF - 0.4, az1 = lzF + 7.0;
    const pos = [], idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const lx = -ax + (2 * ax * i) / NX, lz = az0 + ((az1 - az0) * j) / NZ;
      const [x, z] = at(lx, lz);
      pos.push(x, surf(lx, lz), z);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2); }
    const shell = new THREE.BufferGeometry();
    shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shell.setIndex(idx);
    const sg = shell.toNonIndexed();
    sg.computeVertexNormals();
    sk.put(sg, m.rock, 0, 0, 0, 0);
    // Rocks on it, big ones inside and small ones toward the road.
    for (let n = 0; n < 150; n++) {
      const lx = (rnd() * 2 - 1) * 4.0, lz = lzF - 0.2 + rnd() * 6.6, h = hh(lx, lz);
      if (h < 0.12) continue;
      const size = (0.22 + rnd() * rnd() * 0.85) * (0.6 + Math.min(1, h / 3) * 0.75), flat = 0.6 + rnd() * 0.3;
      const [x, z] = at(lx, lz);
      sk.put(rockGeo(size, rnd, flat), m.rock, x, surf(lx, lz) + size * flat * 0.25, z, rnd() * PI * 2, 1, 1, 1, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
    }
    // Blocks of the arch's own dressed stone, tumbled.
    for (let n = 0; n < 16; n++) {
      const lx = (rnd() * 2 - 1) * 3.4, lz = lzF + 0.1 + rnd() * 5.0, h = hh(lx, lz);
      if (h < 0.3) continue;
      const [x, z] = at(lx, lz);
      sk.put(chippedBlock(0.5 + rnd() * 0.5, 0.32 + rnd() * 0.2, 0.36 + rnd() * 0.2, rnd), m.stone, x, surf(lx, lz) + 0.05, z, rnd() * PI * 2, 1, 1, 1, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9);
    }
    // Broken timbers: props jammed under the arch, a split beam slanting out of the heap, planks on the road.
    const pt = (lx, lz, dy) => { const [x, z] = at(lx, lz); return [x, surf(lx, lz) + dy, z]; };
    const top = (lx, lz, y) => { const [x, z] = at(lx, lz); return [x, y0 + y, z]; };
    strut(sk, m.wood, pt(-1.5, lzF + 3.3, -0.5), top(-1.1, lzF - 0.15, YS + 2.0), 0.3);
    strut(sk, m.wood, pt(1.3, lzF + 2.9, -0.5), top(0.9, lzF - 0.15, YS + 2.3), 0.28);
    strut(sk, m.wood, pt(0.2, lzF + 5.0, -0.2), pt(-0.6, lzF + 0.9, 1.7), 0.24);
    strut(sk, m.wood, pt(2.0, lzF + 2.0, 0.1), pt(3.3, lzF + 4.6, 0.55), 0.2);
    strut(sk, m.wood, pt(-3.2, lzF + 3.0, 0.05), pt(-2.4, lzF + 6.1, 0.25), 0.22);
    strut(sk, m.wood, pt(-0.2, lzF + 1.1, 1.2), pt(1.9, lzF + 3.6, 0.5), 0.2);
  });
  // Pebbles and splinters spilled beyond the heap: soft, walked over.
  const spill = dynamic(sk, scene, () => {
    for (let n = 0; n < 14; n++) {
      const lx = (rnd() * 2 - 1) * 3.6, lz = lzF + 6.2 + rnd() * 2.6, [x, z] = at(lx, lz);
      sk.begin('pebbles', x, z, true);
      const size = 0.09 + rnd() * 0.16;
      sk.put(rockGeo(size, rnd, 0.6), m.rock, x, sk.ground(x, z) + size * 0.1, z, rnd() * PI * 2);
    }
  });
  // The colliders that shut the way: a plug in the arch and a stepped block over the heap.
  const shapes = [];
  const [plx, plz] = at(0, lzF);
  shapes.push(w.colliders.addBox(plx, plz, R + 0.15, 0.7, f.yaw, y0 - 1.5, y0 + YS + R + 0.4));
  for (const [lx0, lx1, lz0, lz1, top] of [[-3.5, 3.5, lzF, lzF + 1.6, 4.4], [-3.3, 3.3, lzF + 1.6, lzF + 3.2, 3.2], [-2.8, 2.8, lzF + 3.2, lzF + 4.8, 2.4], [-2.0, 2.0, lzF + 4.8, lzF + 6.0, 1.7]]) {
    const [x, z] = at((lx0 + lx1) / 2, (lz0 + lz1) / 2);
    shapes.push(w.colliders.addBox(x, z, (lx1 - lx0) / 2, (lz1 - lz0) / 2, f.yaw, y0 - 1.5, y0 + top));
  }
  seals(ctx, f, y0, HALF + 1.5, HALF + 26, lzM, 2.0, 40);

  boulders(ctx, f, [[-6.6, 8.5, 1.15], [6.8, 6.2, 1.45], [7.6, 13.5, 0.95], [-7.0, 14.5, 1.3], [5.2, 21, 1.0]], 51);
  const notice = noticeStand(ctx, f, 5.2, 12.2, 'CLOSED', e.sign);
  return {
    seconds: 1.8, notice, front: { x: at(0, 9)[0], z: at(0, 9)[1] },
    apply(t) {
      heap.position.y = -6.4 * ease(t);
      spill.position.y = -1.2 * ease(t);
      heap.visible = spill.visible = t < 0.999;
      setSolid(shapes, t < 0.25);
    },
  };
}

// A run of stepped wall either side of a block, following the ground out into the rock: each step's top is a
// little above the ground at its outer end (and never above the block), so the last ones vanish into the slope.
function wings(ctx, f, y0, frontLz, backLz, half, top, steps) {
  const { sk, m } = ctx;
  const len = 2.2, depth = frontLz - backLz, lz = (frontLz + backLz) / 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const lx0 = half + i * len, lx1 = lx0 + len, lx = (side * (lx0 + lx1)) / 2;
      const [ox, oz] = f.at(side * lx1, lz);
      const t = Math.min(y0 + top - 1.3 * (i + 1), Math.max(y0 + 1.0, sk.ground(ox, oz) + 0.5));
      const [cx, cz] = f.at(lx, lz);
      sk.begin('portal wing', cx, cz);
      sk.block(f, lx, lz, len, depth, t, m.stone);
      sk.put(sk.box(len + 0.02, 0.24, depth + 0.4), m.rock, cx, t - 0.02, cz, f.yaw);
    }
  }
}

// ================================================================== EAST: the gatehouse
function buildGatehouse(ctx, e) {
  const { sk, w, m, X, scene } = ctx;
  const f = frame(e.x, e.z, e.facing);
  const yF = w.heightAt(e.x, e.z);
  const at = (lx, lz) => f.at(lx, lz);
  const at3 = (lx, lz, y) => { const [x, z] = f.at(lx, lz); return [x, y, z]; };
  const PW = 4.4, R = PW / 2, YS = 3.1;          // passage width, arch radius, springing height
  const TW = 5.4, TD = 6.6, HD = TD / 2;         // tower width across the road and depth along it
  const TOWER = 8.9, DECK = 7.3;                 // tower top and the wall-walk between and beside them, above yF
  const gy = (lx, lz) => sk.ground(...at(lx, lz));

  // --- the towers
  for (const side of [-1, 1]) {
    const tx = side * (R + TW / 2);
    const [cx, cz] = at(tx, 0);
    sk.begin('gatehouse tower', cx, cz);
    const lowest = Math.min(gy(tx, HD), gy(tx, -HD), gy(tx - TW / 2, HD), gy(tx + TW / 2, HD)) - 0.4;
    // Plinth (the collider takes its footprint), shaft, quoins, arrow slits, the corbelled top and its parapet.
    sk.put(sk.box(TW + 0.5, yF + 0.95 - lowest, TD + 0.5), m.rock, cx, lowest, cz, f.yaw);
    sk.put(sk.box(TW, yF + TOWER - lowest, TD), m.stone, cx, lowest, cz, f.yaw);
    w.colliders.addBox(cx, cz, (TW + 0.5) / 2, (TD + 0.5) / 2, f.yaw, lowest, yF + TOWER + 1.4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let k = 0, y = yF + 0.95; y < yF + TOWER - 0.4; k++, y += 0.5) {
        const long = k % 2 ? 0.55 : 1.0, short = k % 2 ? 1.0 : 0.55;
        const [fx, fz] = at(tx + sx * (TW / 2 - long / 2 + 0.005), sz * (HD + 0.055));
        sk.put(sk.box(long, 0.47, 0.12), m.rock, fx, y, fz, f.yaw);
        const [gx, gz] = at(tx + sx * (TW / 2 + 0.055), sz * (HD - short / 2 + 0.005));
        sk.put(sk.box(0.12, 0.47, short), m.rock, gx, y, gz, f.yaw);
      }
    }
    const slit = (lx, lz, turn, y) => {
      const [qx, qz] = at(lx, lz);
      sk.put(sk.box(0.42, 1.55, 0.1), m.rock, qx, y - 0.16, qz, f.yaw + turn);
      sk.put(sk.box(0.14, 1.15, 0.12), X.dark, qx, y + 0.04, qz, f.yaw + turn);
    };
    slit(tx, HD + 0.05, 0, yF + 4.3);
    slit(tx + side * (TW / 2 + 0.05), 0, PI / 2, yF + 4.3);
    slit(tx + side * (TW / 2 + 0.05), 0, PI / 2, yF + 6.2);
    sk.put(sk.box(TW + 0.7, 0.34, TD + 0.7), m.rock, cx, yF + TOWER - 0.34, cz, f.yaw);
    sk.put(sk.box(TW + 0.5, 0.3, TD + 0.5), m.rock, cx, yF + TOWER, cz, f.yaw);
    const top = yF + TOWER + 0.3, mer = { thick: 0.6, height: 1.0, gap: 0.85, mat: m.stone };
    sk.merlons(f, tx, HD + 0.15, TW + 0.2, top, mer);
    sk.merlons(f, tx, -HD - 0.15, TW + 0.2, top, mer);
    sk.merlons(f, tx + side * (TW / 2 + 0.15), 0, TD + 0.2, top, { ...mer, along: 'z' });
    sk.merlons(f, tx - side * (TW / 2 + 0.15), 0, TD + 0.2, top, { ...mer, along: 'z' });
  }

  // --- the block between the towers: one extrusion with the arch cut through it, the vault as its underside
  {
    const [cx, cz] = at(0, 0);
    sk.begin('gatehouse arch', cx, cz);
    sk.profile(f, 0, 0, yF, [[-R, YS], ...archPts(0, YS, R, 32, true), [R, YS], [R, DECK], [-R, DECK]], TD, m.stone);
    // Its own solid, over the crown (the passage under it stays open), and the coping and parapet on top.
    w.colliders.addBox(cx, cz, R, HD, f.yaw, yF + YS + R - 0.05, yF + DECK + 1.2);
    sk.put(sk.box(PW + 0.4, 0.3, TD + 0.5), m.rock, cx, yF + DECK - 0.02, cz, f.yaw);
    sk.merlons(f, 0, HD + 0.15, PW + 0.5, yF + DECK + 0.28, { thick: 0.55, height: 0.9, gap: 0.8, mat: m.stone });
    sk.merlons(f, 0, -HD - 0.15, PW + 0.5, yF + DECK + 0.28, { thick: 0.55, height: 0.9, gap: 0.8, mat: m.stone });
    // Voussoir rings on both faces with keystones and imposts, and dressed jambs, in the paler stone.
    for (const face of [1, -1]) {
      const N = 15, ro = R + 0.62;
      for (let i = 0; i < N; i++) {
        const a0 = PI - (PI * i) / N + 0.012, a1 = PI - (PI * (i + 1)) / N - 0.012, key = i === (N - 1) / 2;
        const o = key ? ro + 0.24 : ro, depth = key ? 0.32 : 0.2;
        const q = (a, r) => [Math.cos(a) * r, YS + Math.sin(a) * r];
        sk.profile(f, 0, face * (HD + depth / 2 - 0.02), yF, [q(a0, R), q(a0, o), q(a1, o), q(a1, R)], depth, m.rock);
      }
      for (const s of [-1, 1]) {
        const [ix, iz] = at(s * (R + 0.36), face * (HD + 0.12));
        sk.put(sk.box(1.05, 0.34, 0.28), m.rock, ix, yF + YS - 0.34, iz, f.yaw);
        for (let k = 0, y = 0; y < YS - 0.34; k++, y += 0.5) {
          const len = k % 2 ? 0.55 : 0.95;
          const [jx, jz] = at(s * (R + len / 2 - 0.03), face * (HD + 0.1));
          sk.put(sk.box(len, 0.46, 0.2), m.rock, jx, yF + y, jz, f.yaw);
        }
      }
      const [qx, qz] = at(0, face * (HD + 0.06));
      sk.put(sk.box(PW + 0.2, 0.22, 0.14), m.rock, qx, yF + DECK - 1.0, qz, f.yaw);
    }
  }
  // Two lanterns on brackets flank the mouth.
  for (const s of [-1, 1]) {
    const [bx, bz] = at(s * (R + 1.05), HD + 0.02), [lx, lz] = at(s * (R + 1.05), HD + 0.38);
    sk.begin('lantern bracket', bx, bz, false, true);
    sk.put(sk.box(0.07, 0.07, 0.44), m.iron, (bx + lx) / 2, yF + 2.6, (bz + lz) / 2, f.yaw);
    sk.put(sk.box(0.26, 0.4, 0.26), m.glass, lx, yF + 2.14, lz, f.yaw);
    sk.put(sk.box(0.32, 0.05, 0.32), m.iron, lx, yF + 2.54, lz, f.yaw);
  }

  // --- the curtain walls across the rest of the gorge floor, sunk into the flanks
  const wallEnd = 17;
  for (const side of [-1, 1]) {
    const lx0 = R + TW, len = wallEnd - lx0, lx = (side * (lx0 + wallEnd)) / 2, lz = 2.0, d = 2.6;
    const [cx, cz] = at(lx, lz);
    sk.begin('gatehouse wall', cx, cz);
    const top = yF + 6.6;
    sk.block(f, lx, lz, len, d, top, m.stone, { colliderTop: top + 1.2 });
    sk.put(sk.box(len, 0.28, d + 0.4), m.rock, cx, top - 0.02, cz, f.yaw);
    sk.merlons(f, lx, lz + d / 2 + 0.05, len, top + 0.26, { thick: 0.5, height: 0.85, gap: 0.85, mat: m.stone });
  }
  seals(ctx, f, yF, wallEnd - 2, wallEnd + 24, 0, 2.2, 44);

  // --- the way through: a portcullis in the front of the arch and a pair of timber gates behind it
  const portH = YS + R + 0.35, portAt = HD - 1.25, gateAt = -0.7;
  const portcullis = dynamic(sk, scene, () => {
    const [cx, cz] = at(0, portAt);
    sk.begin('portcullis', cx, cz);
    const bars = Math.round(PW / 0.34), step = (PW - 0.16) / bars;
    for (let i = 0; i <= bars; i++) {
      const lx = -PW / 2 + 0.08 + i * step;
      const top = YS + Math.sqrt(Math.max(0, R * R - lx * lx)) - 0.05;
      const [qx, qz] = at(lx, portAt);
      sk.put(sk.box(0.085, top + 0.35, 0.085), m.iron, qx, yF - 0.28, qz, f.yaw);
      sk.put(sk.cyl(0.003, 0.06, 0.28, 4), m.iron, qx, yF - 0.34, qz, f.yaw + PI / 4);
    }
    for (const y of [0.4, 1.15, 1.9, 2.6, 3.2, 3.75, 4.25, 4.7]) {
      if (y > YS + R - 0.25) continue;
      const half = y < YS ? R : Math.sqrt(Math.max(0.01, R * R - (y - YS) * (y - YS)));
      const [qx, qz] = at(0, portAt + 0.02);
      sk.put(sk.box(2 * half - 0.05, 0.1, 0.075), m.iron, qx, yF + y, qz, f.yaw);
    }
    for (const y of [1.2, 2.85]) {
      const [qx, qz] = at(0, portAt - 0.05);
      sk.put(sk.box(PW - 0.05, 0.2, 0.12), m.wood, qx, yF + y, qz, f.yaw);
    }
  });
  // One leaf of the gate: planks in a frame that follows the arch, iron straps, studs and a ring. `d` runs from
  // the middle of the passage (0) out to the hinge (R).
  const leafGroup = (side) => dynamic(sk, scene, () => {
    const [cx, cz] = at(side * R / 2, gateAt);
    sk.begin('gate leaf', cx, cz);
    const curve = [];
    for (let i = 0; i <= 12; i++) { const d = ((R - 0.03) * i) / 12; curve.push([d, YS + Math.sqrt(Math.max(0, R * R - d * d)) - 0.05]); }
    const outline = [[0, -0.02], ...curve, [R - 0.03, -0.02]];
    sk.profile(f, 0, gateAt, yF, outline.map(([d, y]) => [side * d, y]), 0.24, m.wood);
    const topAt = (d) => YS + Math.sqrt(Math.max(0, R * R - d * d)) - 0.05;
    for (const y of [0.55, 1.6, 2.6]) {
      const d0 = 0.03, d1 = R - 0.08;
      const [sx, sz] = at(side * (d0 + d1) / 2, gateAt + 0.14);
      sk.put(sk.box(d1 - d0, 0.16, 0.05), m.iron, sx, yF + y - 0.08, sz, f.yaw);
      for (let d = d0 + 0.2; d < d1 - 0.05; d += 0.28) {
        const [tx, tz] = at(side * d, gateAt + 0.175);
        sk.put(sk.cyl(0.035, 0.04, 0.03, 6), m.iron, tx, yF + y - 0.02, tz, f.yaw, 1, 1, 1, PI / 2, 0);
      }
    }
    const [dx, dz] = at(side * 0.05, gateAt + 0.145);
    sk.put(sk.box(0.09, topAt(0.05) - 0.3, 0.05), m.iron, dx, yF, dz, f.yaw);
    const [rx, rz] = at(side * 0.5, gateAt + 0.18);
    sk.put(sk.box(0.22, 0.22, 0.03), m.iron, rx, yF + 1.04, rz, f.yaw);
    sk.put(new THREE.TorusGeometry(0.17, 0.025, 6, 12), m.iron, rx, yF + 1.15, rz + 0.0, f.yaw);
  });
  const leaves = [-1, 1].map((side) => {
    const [hx, hz] = at(side * R, gateAt);
    return { side, node: hingeY(scene, leafGroup(side), hx, hz) };
  });
  // The colliders that shut the passage.
  const shapes = [];
  for (const [lz, thick] of [[portAt, 0.4], [gateAt, 0.5]]) {
    const [x, z] = at(0, lz);
    shapes.push(w.colliders.addBox(x, z, R + 0.06, thick / 2, f.yaw, yF - 0.6, yF + YS + R + 0.4));
  }

  // --- a banner from a bar on each tower front
  const redField = '#7d1e1e';
  const tex = bannerTexture(redField, (g, W) => {
    g.strokeStyle = '#efe4c4';
    g.lineWidth = 16;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = 200 + k * 62 + Math.sin(x / 28 + k) * 16; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = '#d6b25a';
    g.beginPath(); g.arc(W / 2, 92, 34, 0, PI * 2); g.fill();
    g.fillStyle = redField;
    g.beginPath(); g.arc(W / 2 + 12, 92, 30, 0, PI * 2); g.fill();
  });
  const cloth = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 1 });
  for (const side of [-1, 1]) {
    const tx = side * (R + TW / 2), by = yF + 7.45;
    const [cx, cz] = at(tx, HD + 0.36);
    sk.begin('banner', cx, cz, true, true);
    strut(sk, m.wood, at3(tx - 0.95, HD + 0.36, by), at3(tx + 0.95, HD + 0.36, by), 0.09);
    for (const k of [-0.7, 0.7]) strut(sk, m.iron, at3(tx + k, HD + 0.02, by), at3(tx + k, HD + 0.36, by), 0.05);
    const [qx, qz] = at(tx, HD + 0.45);
    sk.put(wavyPlane(1.65, 3.5, side * 1.7 + 0.4), cloth, qx, by - 1.85, qz, f.yaw);
  }

  // --- the fallen rock in the approach, and the Warden's notice
  boulders(ctx, f, [[-9.1, 11.5, 1.35], [8.9, 8.4, 1.05], [-8.7, 19, 1.7], [9.3, 24, 1.25], [-5.6, 33, 0.95], [7.2, 41, 1.5]], 52);
  const notice = noticeStand(ctx, f, 6.4, 10.2, 'BY ORDER', e.sign);

  return {
    seconds: 3.4, notice, front: { x: at(0, 12)[0], z: at(0, 12)[1] },
    apply(t) {
      portcullis.position.y = (portH + 0.5) * ease(t / 0.75);
      for (const { side, node } of leaves) node.rotation.y = -side * (PI / 2 + 0.06) * ease((t - 0.3) / 0.7);
      setSolid(shapes, t < 0.85);
    },
  };
}

// ================================================================== SOUTH: the toll bar
function buildToll(ctx, e) {
  const { sk, w, m, X, scene } = ctx;
  const f = frame(e.x, e.z, e.facing);
  const yF = w.heightAt(e.x, e.z);
  const at = (lx, lz) => f.at(lx, lz);
  const at3 = (lx, lz, y) => { const [x, z] = f.at(lx, lz); return [x, y, z]; };
  const gy = (lx, lz) => sk.ground(...at(lx, lz));
  const rnd = rng(6113);
  const POST = 3.35;                                 // the boom's posts stand this far either side of the road's middle
  const FENCE = 2.9;                                 // the stockade's height
  const BOOM_Y = yF + 1.6, POLE_Z = 0.27;

  // --- the keeper's hut on the west side, its back to the cliff: half-timbered, roofed with tiles
  {
    const HX = 6.0, HW = 3.4, HDp = 3.6, WALL = 2.55, RIDGE = 1.05; // centre across, width across, depth along, wall height, roof rise
    const [cx, cz] = at(HX, 0);
    const low = Math.min(gy(HX - HW / 2, HDp / 2), gy(HX + HW / 2, HDp / 2), gy(HX, HDp / 2), gy(HX - HW / 2, -HDp / 2)) - 0.4;
    sk.begin('toll hut', cx, cz);
    // Stone footing, plaster walls, timber frame.
    sk.put(sk.box(HW + 0.3, yF + 0.5 - low, HDp + 0.3), m.rock, cx, low, cz, f.yaw);
    sk.put(sk.box(HW, WALL - 0.5, HDp), m.plaster, cx, yF + 0.5, cz, f.yaw);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [x, z] = at(HX + sx * (HW / 2 + 0.02), sz * (HDp / 2 + 0.02));
      sk.put(sk.box(0.2, WALL - 0.4, 0.2), m.wood, x, yF + 0.5, z, f.yaw);
    }
    // Plate, sill and mid rails round the walls.
    for (const sz of [-1, 1]) {
      const [x, z] = at(HX, sz * (HDp / 2 + 0.05));
      sk.put(sk.box(HW + 0.3, 0.2, 0.16), m.wood, x, yF + WALL - 0.02, z, f.yaw);
      sk.put(sk.box(HW + 0.1, 0.16, 0.14), m.wood, x, yF + 0.45, z, f.yaw);
      sk.put(sk.box(HW + 0.1, 0.14, 0.12), m.wood, x, yF + 1.55, z, f.yaw);
    }
    for (const sx of [-1, 1]) {
      const [x, z] = at(HX + sx * (HW / 2 + 0.05), 0);
      sk.put(sk.box(0.16, 0.2, HDp + 0.3), m.wood, x, yF + WALL - 0.02, z, f.yaw);
      sk.put(sk.box(0.14, 0.16, HDp + 0.1), m.wood, x, yF + 0.45, z, f.yaw);
      sk.put(sk.box(0.12, 0.14, HDp + 0.1), m.wood, x, yF + 1.55, z, f.yaw);
    }
    // Gable ends: plaster triangles with a timber barge board and a king post.
    for (const sz of [-1, 1]) {
      const tri = [[-HW / 2 - 0.02, 0], [HW / 2 + 0.02, 0], [0, RIDGE]];
      sk.profile(f, HX, sz * (HDp / 2 - 0.1), yF + WALL, tri, 0.2, m.plaster);
      const [x, z] = at(HX, sz * (HDp / 2 + 0.03));
      sk.put(sk.box(0.12, RIDGE, 0.1), m.wood, x, yF + WALL, z, f.yaw);
    }
    // The door on the road side, closed, with a lantern beside it and a hanging sign over it.
    {
      const dx = HX - HW / 2 - 0.05;
      const [x, z] = at(dx, -0.4);
      sk.put(sk.box(0.09, 2.0, 1.0), m.wood, x, yF + 0.5, z, f.yaw);
      for (const y of [0.75, 1.6]) { const [sx, sz] = at(dx - 0.05, -0.4); sk.put(sk.box(0.03, 0.14, 1.0), m.iron, sx, yF + y, sz, f.yaw); }
      const [lx1, lz1] = at(dx - 0.42, 0.7);
      strut(sk, m.iron, at3(dx, 0.7, yF + 2.2), at3(dx - 0.42, 0.7, yF + 2.2), 0.06);
      sk.put(sk.box(0.25, 0.36, 0.25), m.glass, lx1, yF + 1.84, lz1, f.yaw);
      sk.put(sk.box(0.31, 0.05, 0.31), m.iron, lx1, yF + 2.2, lz1, f.yaw);
      sk.put(sk.box(0.05, 0.2, 0.05), m.iron, lx1, yF + 2.2, lz1, f.yaw);
      // The toll board over the door.
      const [bx, bz] = at(dx - 0.12, -0.4);
      const mat = texturedMaterial(boardTexture('TOLL', { w: 256, h: 112 }), 0.85);
      sk.put(sk.box(0.06, 0.34, 1.1), m.wood, bx, yF + 2.12, bz, f.yaw);
      sk.put(new THREE.PlaneGeometry(1.0, 0.28), mat, bx - Math.cos(f.yaw) * 0.04, yF + 2.15, bz + Math.sin(f.yaw) * 0.04, f.yaw - PI / 2);
    }
    // A shuttered window in the gable that looks up the road.
    {
      const [x, z] = at(HX, HDp / 2 + 0.06);
      sk.put(sk.box(1.0, 0.95, 0.07), m.wood, x, yF + 1.0, z, f.yaw);
      sk.put(sk.box(1.14, 0.1, 0.16), m.rock, x, yF + 0.9, z, f.yaw);
      for (const s of [-1, 1]) { const [sx, sz] = at(HX + s * 0.25, HDp / 2 + 0.11); sk.put(sk.box(0.46, 0.85, 0.04), m.wood, sx, yF + 1.05, sz, f.yaw); }
    }
    // Roof: two tile slopes meeting at a ridge along the road, overhanging, with a ridge beam.
    {
      // Each slope's underside runs from the ridge out past the wall's top edge; the plane's middle sits on that line.
      const tilt = Math.atan2(RIDGE, HW / 2), L = HW / 2 / Math.cos(tilt) + 0.7, mid = L / 2 - 0.1;
      for (const s of [-1, 1]) {
        const [x, z] = at(HX + s * Math.cos(tilt) * mid, 0);
        sk.put(sk.box(L, 0.14, HDp + 1.0), m.tiles, x, yF + WALL + RIDGE - Math.sin(tilt) * mid, z, f.yaw, 1, 1, 1, 0, -s * tilt);
      }
      const [rx, rz] = at(HX, 0);
      sk.put(sk.box(0.2, 0.2, HDp + 1.05), m.wood, rx, yF + WALL + RIDGE + 0.06, rz, f.yaw);
    }
    // A stone chimney on the cliff side.
    const [kx, kz] = at(HX + 0.9, -1.0);
    sk.put(sk.box(0.55, 2.4, 0.55), m.stone, kx, yF + WALL - 0.4, kz, f.yaw);
    sk.put(sk.box(0.75, 0.14, 0.75), m.rock, kx, yF + WALL + 1.98, kz, f.yaw);
    w.colliders.addBox(cx, cz, (HW + 0.3) / 2, (HDp + 0.3) / 2, f.yaw, low, yF + WALL + RIDGE + 0.4);
  }

  // --- the posts, the stockade to the cliff on the east, and a short one from the hut to the cliff on the west
  const post = (lx, top) => {
    const [x, z] = at(lx, 0);
    sk.begin('toll post', x, z);
    const g = sk.ground(x, z);
    sk.put(sk.box(0.34, top - g + 0.3, 0.34), m.wood, x, g - 0.3, z, f.yaw);
    sk.put(sk.box(0.5, 0.12, 0.5), m.rock, x, top - 0.02, z, f.yaw);
    sk.put(sk.cyl(0.005, 0.36, 0.3, 4), m.wood, x, top + 0.1, z, f.yaw + PI / 4);
    w.colliders.addBox(x, z, 0.25, 0.25, f.yaw, g - 0.3, top + 0.4);
  };
  post(-POST, yF + 2.75);
  post(POST, yF + 2.75);
  const stockade = (lxA, lxB) => {
    const lo = Math.min(lxA, lxB), hi = Math.max(lxA, lxB), len = hi - lo, lx = (lo + hi) / 2;
    const [cx, cz] = at(lx, 0);
    sk.begin('stockade', cx, cz);
    const n = Math.round(len / 0.36);
    for (let i = 0; i < n; i++) {
      const l = lo + (i + 0.5) * (len / n);
      const [x, z] = at(l, i % 2 ? 0.07 : -0.07);
      const g = sk.ground(x, z), top = yF + FENCE + (rnd() - 0.5) * 0.3;
      if (top < g + 0.2) continue;
      const r = 0.15 + rnd() * 0.02;
      sk.put(sk.cyl(r, r, top - g + 0.4, 7), m.wood, x, g - 0.4, z, rnd() * 3);
      sk.put(sk.cyl(0.004, r, 0.36, 7), m.wood, x, top, z, rnd() * 3);
    }
    for (const y of [0.7, 1.9]) { const [x, z] = at(lx, -0.28); sk.put(sk.box(len, 0.13, 0.12), m.wood, x, yF + y, z, f.yaw); }
    w.colliders.addBox(cx, cz, len / 2, 0.3, f.yaw, yF - 1.2, yF + FENCE + 0.4);
  };
  stockade(-POST + 0.15, -14);
  stockade(9.6, 14);
  seals(ctx, f, yF, 13, 38, 0, 2.0, 44);

  // --- the boom: a striped pole on the hut-side post with a counterweight, lifting to open the way
  const boomGroup = dynamic(sk, scene, () => {
    const [cx, cz] = at(0, POLE_Z);
    sk.begin('toll boom', cx, cz);
    const segs = 10, seg = (2 * POST + 0.8) / segs;
    for (let i = 0; i < segs; i++) {
      // The pole runs from the tail (past the hinge on the hut side) across the road to the far post.
      const [x, z] = at(POST + 0.75 - seg * i, POLE_Z);
      sk.put(sk.cyl(0.085, 0.085, seg + 0.005, 10), i % 2 ? X.white : X.red, x, BOOM_Y, z, f.yaw, 1, 1, 1, 0, PI / 2);
    }
    const [tx, tz] = at(POST + 0.6, POLE_Z);
    sk.put(sk.box(0.36, 0.44, 0.3), m.rock, tx, BOOM_Y - 0.5, tz, f.yaw);
    sk.put(sk.box(0.05, 0.4, 0.05), m.iron, tx, BOOM_Y - 0.24, tz, f.yaw);
  });
  const boom = hingeZ(scene, boomGroup, at3(POST, POLE_Z, BOOM_Y), f.yaw);
  // The hinge plate on the hut-side post and the rest on the far one.
  {
    const [x, z] = at(POST, POLE_Z - 0.1);
    sk.begin('boom hinge', x, z, false, true);
    sk.put(sk.box(0.42, 0.26, 0.1), m.iron, x, BOOM_Y - 0.13, z, f.yaw);
    const [fx, fz] = at(-POST, POLE_Z - 0.1);
    sk.begin('boom rest', fx, fz, false, true);
    sk.put(sk.box(0.42, 0.1, 0.1), m.iron, fx, BOOM_Y - 0.11, fz, f.yaw);
  }
  // The chain that locks the pole down: from a staple in the far post to the pole.
  const chain = dynamic(sk, scene, () => {
    const [ax, az] = at(-POST + 0.02, 0.22), [bx, bz] = at(-POST + 0.62, POLE_Z + 0.02);
    sk.begin('boom chain', ax, az);
    const links = 8;
    for (let i = 0; i < links; i++) {
      const t = i / (links - 1), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = BOOM_Y - 0.56 + 0.5 * t - 0.09 * Math.sin(t * PI);
      sk.put(new THREE.TorusGeometry(0.045, 0.011, 5, 8), m.iron, x, y, z, f.yaw + (i % 2 ? 0 : PI / 2));
    }
    sk.put(sk.box(0.11, 0.14, 0.05), m.iron, ax, BOOM_Y - 0.66, az, f.yaw);
  });
  // The notice board, beside the road in front of the hut.
  const notice = noticeStand(ctx, f, POST + 1.0, 3.6, 'TOLL BAR', e.sign, { width: 1.3 });

  // The collider that shuts the way: the pole's whole span, floor to well above a jump.
  const shapes = [];
  {
    const [x, z] = at(0, POLE_Z);
    shapes.push(w.colliders.addBox(x, z, POST + 0.25, 0.22, f.yaw, yF - 0.8, yF + 2.6));
  }
  boulders(ctx, f, [[-7.6, 8, 1.2], [7.9, 12, 1.5], [-8.4, 20, 1.0], [8.2, 26, 1.3], [-4.2, 31, 0.9]], 53);

  return {
    seconds: 1.5, notice, front: { x: at(0, 9)[0], z: at(0, 9)[1] },
    apply(t) {
      boom.rotation.z = -(PI / 2 - 0.12) * ease(t);
      chain.visible = t < 0.08;
      setSolid(shapes, t < 0.7);
    },
  };
}
