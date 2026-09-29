import * as THREE from 'three';
import { BANDIT_CAMP, GOBLIN_CAMP, roadById, roadDistance } from './map.js';
import { beam, log, clearTrees, extraMaterials } from './landmarks.js';
import { Smoke } from './smoke.js';
import { rng } from './buildings.js';

// The bandit fort and the goblin camp's dressing. fight.js owns the camps themselves (their tents,
// fires, crates and the people in them); this builds around them:
//   * the fort: a palisade of sharpened logs round the camp with a gateway where Bridge Street comes
//     in (west) and one where the East Road leaves (east), a fighting walkway with stairs either side
//     of the west gate, a breach in the south side, a timber watch tower, barricades and banners;
//   * the goblins: arcs of crude stakes leaning outwards (the trail in from the north-east left open),
//     skull totems at the way in, painted hides on frames and a rickety lookout.
// Bandits wander within ~13 m of the fire and goblins within ~11 m, so the palisade (19.5 m) and the
// stakes (15.5 m) stand clear of them, and three wide openings keep a chase from pinning anyone.

const TAU = Math.PI * 2;
const polar = (c, a, r) => [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r];
// Angle difference folded to [-pi, pi].
const dAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export async function buildFort(sk, sites) {
  const xm = await extraMaterials(sk, sites.assets);
  const smoke = (sites.smoke ??= new Smoke(sites.scene));
  if (!sites.smokeTick) sites.updaters.push((sites.smokeTick = (dt) => smoke.update(dt)));
  const fort = banditFort(sk, xm);
  const goblins = goblinCamp(sk, xm);
  // Smoke from the two camps' cook fires (fight.js lights them; it makes flames but no smoke).
  for (const c of [BANDIT_CAMP, GOBLIN_CAMP]) smoke.add(c.x, sk.ground(c.x, c.z) + 1.2, c.z, { puffs: 22, life: 14, rise: 26, size: [0.4, 5.5], grey: 0.66, opacity: 0.6, spread: 1.4, seed: c.x });
  const trees = clearTrees(sk.world, (x, z, r) => Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z) < 23 + r || Math.hypot(x - GOBLIN_CAMP.x, z - GOBLIN_CAMP.z) < 18.5 + r);
  return { ...fort, goblins, treesCleared: trees };
}

// Where a road crosses a circle round the camp: the angle of its nearest point to that radius.
function roadAngle(c, id, R) {
  const pts = roadById(id).pts;
  let best = Infinity, ang = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, d = Math.abs(Math.hypot(x - c.x, z - c.z) - R);
      if (d < best) { best = d; ang = Math.atan2(z - c.z, x - c.x); }
    }
  }
  // A road that stops short of the ring points at it along its last few metres.
  if (best > 1.5) {
    const end = Math.hypot(pts[0][0] - c.x, pts[0][1] - c.z) < Math.hypot(pts[pts.length - 1][0] - c.x, pts[pts.length - 1][1] - c.z) ? 0 : pts.length - 1;
    ang = Math.atan2(pts[end][1] - c.z, pts[end][0] - c.x);
  }
  return ang;
}

// ------------------------------------------------------------------ the bandit fort
function banditFort(sk, xm) {
  const C = BANDIT_CAMP, R = 19.5;
  const rnd = rng(9187);
  const west = roadAngle(C, 'bridge', R), east = roadAngle(C, 'eastroad', R);
  const GATE = 3.5 / R; // half the gateway, as an angle
  const south = Math.PI / 2 + 0.05, BREACH = 2.6 / R;
  const gaps = [[west, GATE], [east, GATE], [south, BREACH]];
  const open = (a, pad = 0) => gaps.some(([g, h]) => Math.abs(dAng(a, g)) < h + pad);
  // Palisade runs between the openings, in chunks of about 2.7 m.
  const runs = [];
  const edges = gaps.map(([g, h]) => [g - h, g + h]).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < edges.length; i++) {
    const a0 = edges[i][1], a1 = edges[(i + 1) % edges.length][0] + (i === edges.length - 1 ? TAU : 0);
    runs.push([a0, a1]);
  }
  for (const [a0, a1] of runs) {
    const n = Math.max(1, Math.round(((a1 - a0) * R) / 2.7));
    for (let k = 0; k < n; k++) palisadeChunk(sk, xm, C, R, a0 + ((a1 - a0) * k) / n, a0 + ((a1 - a0) * (k + 1)) / n, rnd, { first: k === 0, last: k === n - 1 });
  }
  const flagTex = bannerTexture('bandit');
  gateway(sk, xm, C, R, west, GATE, rnd, 'west gate', flagTex);
  gateway(sk, xm, C, R, east, GATE, rnd, 'east gate', flagTex);
  breach(sk, xm, C, R, south, BREACH, rnd);
  // Fighting walkways either side of the west gate, each with a stair down at its far end.
  walkway(sk, xm, C, R, west + GATE + 0.12, west + GATE + 0.95, rnd, 'far');
  walkway(sk, xm, C, R, west - GATE - 0.95, west - GATE - 0.12, rnd, 'near');
  // The watch tower on the north side, over the tents, looking down both roads.
  const tAng = -Math.PI / 2 + 0.52;
  const [tx, tz] = polar(C, tAng, 14.6);
  watchTower(sk, xm, tx, tz, Math.PI / 2 - tAng, rnd);
  // Barricades: two out on the road in front of the west gate, one inside the east gate.
  const wOut = polar(C, west, R + 6.5), wDir = west;
  for (const s of [-1, 1]) {
    const x = wOut[0] + Math.cos(wDir + Math.PI / 2) * s * 4.4, z = wOut[1] + Math.sin(wDir + Math.PI / 2) * s * 4.4;
    barricade(sk, xm, x, z, wDir + s * 0.45, rnd);
  }
  const eIn = polar(C, east - 0.36, R - 4.2);
  barricade(sk, xm, eIn[0], eIn[1], east + Math.PI / 2 - 0.5, rnd);
  // Banners on poles by the fire, one each side of the road through the fort.
  for (const a of [west + 0.62, east - 0.75]) {
    const [x, z] = polar(C, a, 9.6);
    bannerPole(sk, xm, x, z, Math.atan2(-Math.cos(a), -Math.sin(a)), flagTex, rnd);
  }
  return { x: C.x, z: C.z, R, west, east, south, tower: [tx, tz] };
}

// One length of palisade: sharpened logs set in the ground, two rails binding them on the inside.
function palisadeChunk(sk, xm, C, R, a0, a1, rnd, { first, last }) {
  const { m } = sk;
  const am = (a0 + a1) / 2, [cx, cz] = polar(C, am, R);
  sk.begin('palisade', cx, cz);
  const n = Math.max(2, Math.round(((a1 - a0) * R) / 0.31));
  let low = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const [x, z] = polar(C, a, R + (rnd() - 0.5) * 0.08);
    const g = sk.ground(x, z);
    low = Math.min(low, g);
    hi = Math.max(hi, g);
    const r = 0.14 + rnd() * 0.035, h = 3.25 + rnd() * 0.55 - ((first && i === 0) || (last && i === n - 1) ? 0.3 : 0);
    const tilt = (rnd() - 0.5) * 0.05;
    const top = [x + Math.cos(a) * tilt * h, g + h, z + Math.sin(a) * tilt * h];
    log(sk, [x, g - 0.45, z], top, r, r * 0.92, xm.bark, 8);
    // The sharpened point, cut fresh.
    const tip = (sk.geo[`tip${r.toFixed(3)}`] ??= new THREE.ConeGeometry(r * 0.92, 0.42, 8).translate(0, 0.21, 0));
    sk.put(tip, m.logEnd, top[0], top[1] - 0.01, top[2], rnd() * TAU, 1, 1, 1, tilt * Math.sin(0), 0);
  }
  // Rails on the inside at knee and shoulder height, one straight chord per chunk.
  const p0 = polar(C, a0 + 0.004, R - 0.24), p1 = polar(C, a1 - 0.004, R - 0.24);
  for (const h of [0.95, 2.55]) log(sk, [p0[0], sk.ground(p0[0], p0[1]) + h, p0[1]], [p1[0], sk.ground(p1[0], p1[1]) + h, p1[1]], 0.075, 0.075, xm.barkDark, 6);
  const len = (a1 - a0) * R;
  // Taller than the logs: a jump from the walkway (deck 2.2 m, jump ~1.1 m) must not carry anyone over.
  sk.colliders.addBox(cx, cz, len / 2 + 0.02, 0.3, -am + Math.PI / 2, low - 0.5, hi + 4.4);
}

// A gateway: two tall posts, a crossbeam, skulls on the posts, a banner hanging from the beam.
function gateway(sk, xm, C, R, a, half, rnd, label, flagTex) {
  const [cx, cz] = polar(C, a, R);
  sk.begin(label, cx, cz);
  const ends = [polar(C, a - half, R), polar(C, a + half, R)];
  const tops = [];
  for (const [x, z] of ends) {
    const g = sk.ground(x, z);
    log(sk, [x, g - 0.6, z], [x, g + 5.1, z], 0.27, 0.24, xm.bark, 10);
    const tip = (sk.geo.gateTip ??= new THREE.ConeGeometry(0.24, 0.5, 10).translate(0, 0.25, 0));
    sk.put(tip, sk.m.logEnd, x, g + 5.09, z);
    tops.push([x, g, z]);
    sk.colliders.addCircle(x, z, 0.3, g - 0.6, g + 5.1);
  }
  // Crossbeam lashed across below the points, overhanging both posts.
  const [[x0, g0, z0], [x1, g1, z1]] = tops;
  const ux = (x1 - x0) / Math.hypot(x1 - x0, z1 - z0), uz = (z1 - z0) / Math.hypot(x1 - x0, z1 - z0);
  // The beam sits against the posts' inner face (towards the camp) so it clears the log points.
  const ix = -Math.cos(a) * 0.36, iz = -Math.sin(a) * 0.36;
  log(sk, [x0 - ux * 0.6 + ix, g0 + 4.5, z0 - uz * 0.6 + iz], [x1 + ux * 0.6 + ix, g1 + 4.5, z1 + uz * 0.6 + iz], 0.19, 0.19, xm.bark, 8);
  for (const [x, g, z] of tops) beam(sk, [x + ix * 0.55, g + 4.36, z + iz * 0.55], [x + ix * 0.55, g + 4.64, z + iz * 0.55], 0.52, 0.52, xm.rope);
  // Skulls stuck on the posts' points.
  for (const [x, g, z] of tops) skull(sk, xm, x, g + 5.45, z, a + Math.PI, 0.85);
  // A banner hanging from the middle of the beam (cloth: walked under, not into).
  const mx = (x0 + x1) / 2 + ix, mz = (z0 + z1) / 2 + iz, my = (g0 + g1) / 2 + 4.3;
  sk.begin(`${label} banner`, mx, mz, true);
  hangCloth(sk, flagTex, mx, my, mz, Math.atan2(Math.cos(a), Math.sin(a)), 1.3, 2.0);
}

// The broken south side: stumps either side, fallen logs lying across the gap.
function breach(sk, xm, C, R, a, half, rnd) {
  const [cx, cz] = polar(C, a, R);
  // The broken ends of the palisade either side of the gap.
  for (const s of [-1, 1]) {
    const [x, z] = polar(C, a + s * (half - 0.04), R);
    const g = sk.ground(x, z);
    sk.begin('palisade stump', x, z);
    log(sk, [x, g - 0.4, z], [x - Math.cos(a) * 0.12, g + 1.2 + rnd() * 0.7, z - Math.sin(a) * 0.12], 0.15, 0.13, xm.bark, 8);
    sk.colliders.addCircle(x, z, 0.26, g - 0.4, g + 1.9);
  }
  // Fallen stakes lying outside the line, each where it came down.
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4 - 0.5;
    const [x, z] = polar(C, a + t * half * 1.6, R + 0.6 + rnd() * 1.4);
    const g = sk.ground(x, z);
    sk.begin('fallen stake', x, z);
    const yaw = a + Math.PI / 2 + (rnd() - 0.5) * 1.2, L = 2.6 + rnd() * 0.8;
    const dx = Math.cos(yaw) * L / 2, dz = Math.sin(yaw) * L / 2;
    log(sk, [x - dx, sk.ground(x - dx, z - dz) + 0.1, z - dz], [x + dx, sk.ground(x + dx, z + dz) + 0.1, z + dz], 0.14, 0.14, xm.bark, 8);
  }
}

// A fighting walkway along the inside of the palisade from angle a0 to a1, deck at 2 m, with a stair
// down into the fort at one end.
function walkway(sk, xm, C, R, a0, a1, rnd, stairEnd) {
  const { m } = sk;
  const DECK = 2.2, r0 = R - 1.65, r1 = R - 0.3, n = Math.max(2, Math.round(((a1 - a0) * R) / 2.4));
  const deckY = (x, z) => sk.ground(x, z) + DECK;
  for (let k = 0; k < n; k++) {
    const b0 = a0 + ((a1 - a0) * k) / n, b1 = a0 + ((a1 - a0) * (k + 1)) / n, bm = (b0 + b1) / 2;
    const [cx, cz] = polar(C, bm, (r0 + r1) / 2);
    sk.begin('walkway', cx, cz);
    const y = deckY(cx, cz);
    // Posts at this bay's start (and the last bay's end), inner and outer.
    for (const b of k === n - 1 ? [b0, b1] : [b0]) for (const r of [r0 + 0.12, r1 - 0.1]) {
      const [x, z] = polar(C, b, r);
      const g = sk.ground(x, z);
      log(sk, [x, g - 0.4, z], [x, y - 0.1, z], 0.1, 0.1, xm.barkDark, 7);
      sk.colliders.addCircle(x, z, 0.14, g - 0.4, y - 0.1);
    }
    // Bearers across at each end, joists along, then the planks.
    for (const b of [b0, b1]) {
      const p = polar(C, b, r0), q = polar(C, b, r1);
      beam(sk, [p[0], y - 0.19, p[1]], [q[0], y - 0.19, q[1]], 0.16, 0.18, m.wood);
    }
    const len = (b1 - b0) * ((r0 + r1) / 2);
    const [px, pz] = polar(C, bm, (r0 + r1) / 2);
    const yaw = -bm + Math.PI / 2;
    sk.put(sk.box(+(len + 0.06).toFixed(2), 0.09, +(r1 - r0).toFixed(2)), m.wood, px, y - 0.1, pz, yaw);
    const sh = sk.colliders.addBox(px, pz, len / 2 + 0.04, (r1 - r0) / 2, yaw, y - 0.14, y - 0.01);
    sh.floor = true;
  }
  // The stair: steps down towards the middle of the fort from the walkway's inner edge.
  const b = stairEnd === 'far' ? a1 - 0.05 : a0 + 0.05;
  const steps = 8, rise = DECK / steps, run = 0.3;
  const [sx, sz] = polar(C, b, r0 - (steps * run) / 2);
  sk.begin('walkway stair', sx, sz);
  const yaw = -b + Math.PI / 2;
  for (let i = 0; i < steps - 1; i++) {
    const [x, z] = polar(C, b, r0 - run * (steps - 1 - i) + run / 2 - 0.02);
    const g = sk.ground(x, z), top = g + rise * (i + 1);
    sk.put(sk.box(1.05, +(top - g + 0.3).toFixed(2), +(run + 0.02).toFixed(2)), m.wood, x, g - 0.3, z, yaw);
    const st = sk.colliders.addBox(x, z, 0.66, run / 2 + 0.01, yaw, g - 0.3, top);
    st.floor = true;
  }
  // Stringers either side.
  for (const s of [-1, 1]) {
    const off = s * 0.58;
    const pTop = polar(C, b + off / r0, r0 - 0.05), pBot = polar(C, b + off / (r0 - steps * run), r0 - steps * run - 0.1);
    beam(sk, [pBot[0], sk.ground(pBot[0], pBot[1]) + 0.1, pBot[1]], [pTop[0], deckY(pTop[0], pTop[1]) - 0.05, pTop[1]], 0.08, 0.24, m.wood);
  }
}

// A timber watch tower: four leaning log legs, braces, a railed platform with a roof, a ladder.
function watchTower(sk, xm, x, z, face, rnd) {
  const { m } = sk;
  const g = sk.ground(x, z);
  const B = 1.6, T = 1.25, PL = 5.3, ROOF = 2.1; // half-spread at the foot and top, platform height, roof posts
  const c = Math.cos(face), s = Math.sin(face);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const corner = (i, h) => { const k = B + ((T - B) * h) / PL, sx = i & 1 ? 1 : -1, sz = i & 2 ? 1 : -1; return at(sx * k, sz * k); };
  sk.begin('watch tower', x, z);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corner(i, -0.5), [bx, bz] = corner(i, PL + ROOF);
    log(sk, [ax, g - 0.5, az], [bx, g + PL + ROOF, bz], 0.17, 0.14, xm.bark, 8);
  }
  // Girts and X braces on every face up to the platform.
  const order = [0, 1, 3, 2];
  for (let f = 0; f < 4; f++) {
    const i = order[f], j = order[(f + 1) % 4];
    for (const h of [1.9, PL - 0.2]) { const [ax, az] = corner(i, h), [bx, bz] = corner(j, h); log(sk, [ax, g + h, az], [bx, g + h, bz], 0.08, 0.08, xm.barkDark, 6); }
    const [ax, az] = corner(i, 1.9), [bx, bz] = corner(j, PL - 0.2), [cx, cz] = corner(j, 1.9), [dx, dz] = corner(i, PL - 0.2);
    log(sk, [ax, g + 1.9, az], [bx, g + PL - 0.2, bz], 0.07, 0.07, xm.barkDark, 6);
    log(sk, [cx, g + 1.9, cz], [dx, g + PL - 0.2, dz], 0.07, 0.07, xm.barkDark, 6);
  }
  // The platform: planks on bearers, a rail of poles, a board roof on the legs.
  const k = B + ((T - B) * PL) / PL;
  sk.put(sk.box(+(2 * k + 0.7).toFixed(2), 0.12, +(2 * k + 0.7).toFixed(2)), m.wood, x, g + PL - 0.06, z, face);
  for (const h of [0.55, 1.05]) for (let f = 0; f < 4; f++) {
    const i = order[f], j = order[(f + 1) % 4];
    const [ax, az] = corner(i, PL + h), [bx, bz] = corner(j, PL + h);
    log(sk, [ax, g + PL + h, az], [bx, g + PL + h, bz], 0.055, 0.055, xm.barkDark, 6);
  }
  const rk = B + ((T - B) * (PL + ROOF)) / PL;
  for (const sgn of [-1, 1]) {
    const [rx, rz] = at(0, sgn * rk * 0.5);
    sk.put(sk.box(+(2 * rk + 0.9).toFixed(2), 0.1, +(rk * 1.25).toFixed(2)), m.wood, rx, g + PL + ROOF + 0.12, rz, face, 1, 1, 1, sgn * 0.42, 0);
  }
  // The ladder up the front face, leaning out at its foot.
  const [fx, fz] = at(0, -B - 1.2), [tx, tz] = at(0, -T - 0.42);
  for (const sgn of [-1, 1]) {
    const ox = c * sgn * 0.26, oz = -s * sgn * 0.26;
    log(sk, [fx + ox, g - 0.1, fz + oz], [tx + ox, g + PL + 0.9, tz + oz], 0.045, 0.045, xm.barkDark, 6);
  }
  for (let h = 0.35; h < PL + 0.6; h += 0.36) {
    const t = (h + 0.1) / (PL + 1.0);
    const px = fx + (tx - fx) * t, pz = fz + (tz - fz) * t;
    log(sk, [px - c * 0.3, g + h, pz + s * 0.3], [px + c * 0.3, g + h, pz - s * 0.3], 0.025, 0.025, m.wood, 5);
  }
  // Solid under the platform (legs and braces), and the ladder's foot.
  sk.colliders.addBox(x, z, B + 0.2, B + 0.2, face, g - 0.5, g + PL - 0.1);
  const [lx, lz] = at(0, -B - 0.8);
  sk.colliders.addBox(lx, lz, 0.4, 0.62, face, g - 0.5, g + 2.2);
}

// A cheval-de-frise: a log on crossed stakes, sharpened both ways.
// (`dir` is the map angle of its long axis.)
function barricade(sk, xm, x, z, dir, rnd) {
  const g = sk.ground(x, z), ux = Math.cos(dir), uz = Math.sin(dir);
  sk.begin('barricade', x, z);
  const L = 3.4;
  log(sk, [x - ux * L / 2, g + 0.62, z - uz * L / 2], [x + ux * L / 2, g + 0.62, z + uz * L / 2], 0.13, 0.13, xm.bark, 8);
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * (L - 0.5);
    const px = x + ux * t, pz = z + uz * t;
    for (const sgn of [-1, 1]) {
      // Crossed stakes through the log, feet on the ground, points up and out.
      const fx = px - uz * sgn * 0.75, fz = pz + ux * sgn * 0.75, hx = px + uz * sgn * 0.62, hz = pz - ux * sgn * 0.62;
      log(sk, [fx, sk.ground(fx, fz) - 0.05, fz], [hx, g + 1.35, hz], 0.06, 0.05, xm.barkDark, 6);
      const tip = (sk.geo.stakeTip ??= new THREE.ConeGeometry(0.05, 0.22, 6).translate(0, 0.11, 0));
      const d = Math.hypot(hx - fx, g + 1.35 - sk.ground(fx, fz), hz - fz);
      const pitch = Math.acos((g + 1.35 - sk.ground(fx, fz)) / d);
      sk.put(tip, sk.m.logEnd, hx, g + 1.35, hz, Math.atan2(hx - fx, hz - fz), 1, 1, 1, pitch, 0);
    }
  }
  const sh = sk.colliders.addBox(x, z, L / 2 + 0.1, 0.8, -dir, g - 0.3, g + 1.3);
  return sh;
}

// A banner on a tall pole with a short crossbar at the top.
function bannerPole(sk, xm, x, z, yaw, tex, rnd) {
  const g = sk.ground(x, z);
  sk.begin('banner pole', x, z);
  log(sk, [x, g - 0.5, z], [x, g + 4.6, z], 0.08, 0.07, xm.barkDark, 7);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  log(sk, [x - c * 0.75, g + 4.25, z + s * 0.75], [x + c * 0.75, g + 4.25, z - s * 0.75], 0.045, 0.045, xm.barkDark, 6);
  sk.colliders.addCircle(x, z, 0.14, g - 0.5, g + 4.6);
  sk.begin('banner', x, z, true);
  hangCloth(sk, tex, x + Math.sin(yaw) * 0.06, g + 4.2, z + Math.cos(yaw) * 0.06, yaw, 1.3, 2.0);
}

// A hanging cloth (double-sided, with a gentle sag), its top edge at y.
function hangCloth(sk, tex, x, y, z, yaw, w, h) {
  const mat = (sk.clothMats ??= new Map()).get(tex) ?? sk.clothMats.set(tex, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 })).get(tex);
  const key = `cloth${w}|${h}`;
  const g = (sk.geo[key] ??= (() => {
    const p = new THREE.PlaneGeometry(w, h, 6, 8).translate(0, -h / 2, 0);
    const pos = p.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i);
      pos.setZ(i, Math.sin((px / w) * Math.PI * 2 + py * 1.3) * 0.05 * (-py / h));
    }
    p.computeVertexNormals();
    p.userData.wuv = true;
    return p;
  })());
  sk.put(g, mat, x, y, z, yaw);
}

// A skull: a cranium, a brow, a jaw, eye holes. `face` is the way it looks.
function skull(sk, xm, x, y, z, face, s = 1) {
  const cr = (sk.geo.cranium ??= new THREE.SphereGeometry(0.13, 10, 8).scale(1, 0.95, 1.12));
  sk.put(cr, xm.bone, x, y, z, face, s, s, s);
  const jaw = (sk.geo.jaw ??= new THREE.BoxGeometry(0.15, 0.08, 0.12));
  sk.put(jaw, xm.bone, x + Math.sin(face) * 0.05 * s, y - 0.12 * s, z + Math.cos(face) * 0.05 * s, face, s, s, s);
  const eye = (sk.geo.eye ??= new THREE.SphereGeometry(0.035, 6, 4));
  for (const e of [-1, 1]) {
    const ex = Math.cos(face) * e * 0.05 * s, ez = -Math.sin(face) * e * 0.05 * s;
    sk.put(eye, xm.dark, x + ex + Math.sin(face) * 0.115 * s, y + 0.01 * s, z + ez + Math.cos(face) * 0.115 * s, face);
  }
}

// ------------------------------------------------------------------ the goblin camp
function goblinCamp(sk, xm) {
  const C = GOBLIN_CAMP, R = 15.5;
  const rnd = rng(4411);
  // The trail comes in from the north-east: leave it open, and a few gaps elsewhere.
  const trail = roadById('goblin').pts, [ex, ez] = trail[trail.length - 1];
  const inA = Math.atan2(ez - C.z, ex - C.x);
  const arcs = [[inA + 0.42, inA + 1.75], [inA + 2.2, inA + 3.55], [inA + 3.95, inA + 5.05]];
  for (const [a0, a1] of arcs) {
    const n = Math.max(1, Math.round(((a1 - a0) * R) / 3));
    for (let k = 0; k < n; k++) stakeChunk(sk, xm, C, R, a0 + ((a1 - a0) * k) / n, a0 + ((a1 - a0) * (k + 1)) / n, rnd);
  }
  // Skull totems either side of the way in.
  for (const s of [-1, 1]) {
    const [x, z] = polar(C, inA + s * 0.3, R + 1.2);
    totem(sk, xm, x, z, inA, rnd);
  }
  // Painted hides stretched on frames, facing out at the edge of the camp.
  const hide = hideTexture();
  for (const a of [inA + 1.2, inA + 3.0]) {
    const [x, z] = polar(C, a, R - 2.2);
    hideFrame(sk, xm, x, z, a, hide, rnd);
  }
  // The lookout, on the side facing the Quarry Road.
  const lA = inA - 0.95;
  const [lx, lz] = polar(C, lA, R + 1.8);
  lookout(sk, xm, lx, lz, lA, rnd);
  return { x: C.x, z: C.z, R, way: inA };
}

// Crude stakes leaning outwards, lashed to a pole at knee height.
function stakeChunk(sk, xm, C, R, a0, a1, rnd) {
  const am = (a0 + a1) / 2, [cx, cz] = polar(C, am, R + 0.3);
  sk.begin('goblin stakes', cx, cz);
  const n = Math.max(3, Math.round(((a1 - a0) * R) / 0.62));
  let low = Infinity;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n + (rnd() - 0.5) * 0.012;
    const [x, z] = polar(C, a, R + (rnd() - 0.5) * 0.3);
    const g = sk.ground(x, z);
    low = Math.min(low, g);
    const L = 1.9 + rnd() * 0.7, lean = 0.42 + rnd() * 0.18, twist = (rnd() - 0.5) * 0.25;
    const ox = Math.cos(a + twist) * Math.sin(lean) * L, oz = Math.sin(a + twist) * Math.sin(lean) * L;
    const top = [x + ox, g + Math.cos(lean) * L - 0.3, z + oz];
    log(sk, [x - ox * 0.12, g - 0.35, z - oz * 0.12], top, 0.075 + rnd() * 0.03, 0.05, xm.barkDark, 6);
    const tip = (sk.geo.gobTip ??= new THREE.ConeGeometry(0.05, 0.26, 6).translate(0, 0.13, 0));
    sk.put(tip, sk.m.logEnd, top[0], top[1] - 0.02, top[2], Math.atan2(ox, oz), 1, 1, 1, lean, 0);
  }
  // A binding pole along the inside.
  const p0 = polar(C, a0 + 0.01, R + 0.05), p1 = polar(C, a1 - 0.01, R + 0.05);
  log(sk, [p0[0], sk.ground(p0[0], p0[1]) + 0.55, p0[1]], [p1[0], sk.ground(p1[0], p1[1]) + 0.55, p1[1]], 0.05, 0.05, xm.barkDark, 6);
  const [bx, bz] = polar(C, am, R + 0.45);
  sk.colliders.addBox(bx, bz, ((a1 - a0) * R) / 2 + 0.05, 0.62, -am + Math.PI / 2, low - 0.4, low + 1.9);
}

// A pole with a crossbar, a skull on top and two hanging from the bar, feathers tied on.
function totem(sk, xm, x, z, face, rnd) {
  const g = sk.ground(x, z);
  sk.begin('goblin totem', x, z);
  log(sk, [x, g - 0.5, z], [x + (rnd() - 0.5) * 0.15, g + 2.75, z + (rnd() - 0.5) * 0.15], 0.07, 0.055, xm.barkDark, 6);
  const c = Math.cos(face + Math.PI / 2), s = Math.sin(face + Math.PI / 2);
  log(sk, [x - c * 0.6, g + 2.25, z - s * 0.6], [x + c * 0.6, g + 2.32, z + s * 0.6], 0.04, 0.04, xm.barkDark, 5);
  const look = Math.atan2(Math.cos(face), Math.sin(face));
  skull(sk, xm, x, g + 2.88, z, look, 1.0);
  for (const e of [-1, 1]) {
    const hx = x + c * e * 0.5, hz = z + s * e * 0.5;
    beam(sk, [hx, g + 2.28, hz], [hx, g + 1.95, hz], 0.015, 0.015, xm.rope);
    skull(sk, xm, hx, g + 1.87, hz, look + e * 0.4, 0.7);
  }
  for (let i = 0; i < 3; i++) {
    const a = rnd() * TAU;
    beam(sk, [x, g + 2.5 - i * 0.12, z], [x + Math.cos(a) * 0.1, g + 2.08 - i * 0.12, z + Math.sin(a) * 0.1], 0.06, 0.012, i % 2 ? xm.red : xm.coal);
  }
  sk.colliders.addCircle(x, z, 0.14, g - 0.5, g + 2.8);
}

// A hide stretched on an X-frame of sticks, leaning back.
function hideFrame(sk, xm, x, z, a, tex, rnd) {
  const g = sk.ground(x, z);
  const yaw = Math.atan2(Math.cos(a), Math.sin(a)); // faces out of the camp
  const c = Math.cos(yaw), s = Math.sin(yaw), lean = 0.22;
  sk.begin('goblin hide', x, z);
  const bx = Math.sin(yaw) * -Math.sin(lean) * 1.9, bz = Math.cos(yaw) * -Math.sin(lean) * 1.9;
  for (const sg of [-1, 1]) log(sk, [x + c * sg * 0.95, g - 0.3, z - s * sg * 0.95], [x - c * sg * 0.7 + bx, g + 2.05, z + s * sg * 0.7 + bz], 0.04, 0.035, xm.barkDark, 5);
  // A prop behind it.
  log(sk, [x - Math.sin(yaw) * 1.1, g - 0.2, z - Math.cos(yaw) * 1.1], [x + bx * 0.5, g + 1.2, z + bz * 0.5], 0.035, 0.035, xm.barkDark, 5);
  const mat = (sk.hideMat ??= new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 }));
  const geo = (sk.geo.hide ??= (() => { const p = new THREE.PlaneGeometry(1.25, 1.55, 4, 4); p.userData.wuv = true; return p; })());
  sk.put(geo, mat, x + bx * 0.5 + Math.sin(yaw) * 0.05, g + 1.05, z + bz * 0.5 + Math.cos(yaw) * 0.05, yaw, 1, 1, 1, -lean, 0);
  sk.colliders.addBox(x, z, 1.0, 0.45, yaw, g - 0.3, g + 2.0);
}

// A rickety lookout: four crooked poles, a platform of lashed poles, a ladder.
function lookout(sk, xm, x, z, a, rnd) {
  const g = sk.ground(x, z), face = Math.atan2(-Math.cos(a), -Math.sin(a));
  const c = Math.cos(face), s = Math.sin(face), PL = 3.1, H = 0.95;
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  sk.begin('goblin lookout', x, z);
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) {
    const [bx, bz] = at(sx * 1.05, sz * 1.05), [tx, tz] = at(sx * 0.82 + (rnd() - 0.5) * 0.12, sz * 0.82);
    log(sk, [bx, sk.ground(bx, bz) - 0.4, bz], [tx, g + PL + H + 0.25, tz], 0.075, 0.06, xm.barkDark, 6);
  }
  // Platform poles laid side by side.
  for (let i = 0; i < 9; i++) {
    const o = -0.92 + i * 0.23;
    const [p, q] = [at(-1.05, o), at(1.05, o)];
    log(sk, [p[0], g + PL, p[1]], [q[0], g + PL + (rnd() - 0.5) * 0.06, q[1]], 0.06, 0.06, xm.barkDark, 5);
  }
  for (const sz of [-1, 1]) { const [p, q] = [at(-1.0, sz * 0.9), at(1.0, sz * 0.9)]; log(sk, [p[0], g + PL - 0.13, p[1]], [q[0], g + PL - 0.13, q[1]], 0.07, 0.07, xm.barkDark, 5); }
  // A rail on three sides, and X-lashings below.
  for (const [i, j] of [[3, 0], [0, 1], [1, 2]]) {
    const [p, q] = [at(legs[i][0] * 0.84, legs[i][1] * 0.84), at(legs[j][0] * 0.84, legs[j][1] * 0.84)];
    log(sk, [p[0], g + PL + H, p[1]], [q[0], g + PL + H - 0.05, q[1]], 0.04, 0.04, xm.barkDark, 5);
  }
  for (const [i, j] of [[0, 1], [1, 2]]) {
    const [p, q] = [at(legs[i][0] * 1.0, legs[i][1] * 1.0), at(legs[j][0] * 0.9, legs[j][1] * 0.9)];
    log(sk, [p[0], g + 0.9, p[1]], [q[0], g + PL - 0.25, q[1]], 0.035, 0.035, xm.barkDark, 5);
  }
  // Ladder on the open side.
  const [fx, fz] = at(0, 1.95), [tx, tz] = at(0, 1.12);
  for (const sg of [-1, 1]) log(sk, [fx + c * sg * 0.22, g - 0.1, fz - s * sg * 0.22], [tx + c * sg * 0.22, g + PL + 0.5, tz - s * sg * 0.22], 0.035, 0.035, xm.barkDark, 5);
  for (let h = 0.4; h < PL; h += 0.4) {
    const t = (h + 0.1) / (PL + 0.6), px = fx + (tx - fx) * t, pz = fz + (tz - fz) * t;
    log(sk, [px - c * 0.26, g + h, pz + s * 0.26], [px + c * 0.26, g + h, pz - s * 0.26], 0.022, 0.022, xm.barkDark, 5);
  }
  sk.colliders.addBox(x, z, 1.2, 1.2, face, g - 0.4, g + PL);
  const [lx, lz] = at(0, 1.6);
  sk.colliders.addBox(lx, lz, 0.34, 0.5, face, g - 0.4, g + 2.0);
}

// ------------------------------------------------------------------ painted cloth
function bannerTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  // Faded red cloth, a ragged swallowtail foot, a black skull over crossed blades.
  g.fillStyle = '#6e1f18';
  g.fillRect(0, 0, 128, 256);
  let seed = 31;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${20 + r() * 40},${r() * 12},${r() * 10},${0.05 + r() * 0.1})`; g.fillRect(r() * 128, r() * 256, 1 + r() * 3, 1 + r() * 6); }
  g.fillStyle = '#1a1414';
  g.fillRect(0, 0, 128, 14);
  g.save();
  g.translate(64, 112);
  g.strokeStyle = '#141010';
  g.lineWidth = 9;
  g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-34 * s, -40); g.lineTo(34 * s, 44); g.stroke(); }
  g.fillStyle = '#141010';
  g.beginPath();
  g.arc(0, -6, 26, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-15, 12, 30, 20);
  g.fillStyle = '#6e1f18';
  for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 10, -6, 7, 0, Math.PI * 2); g.fill(); }
  g.beginPath();
  g.moveTo(0, 4); g.lineTo(-4, 12); g.lineTo(4, 12); g.fill();
  for (let i = -2; i <= 2; i++) g.fillRect(i * 6 - 1.5, 22, 3, 10);
  g.restore();
  // Ragged swallowtail: cut the foot away.
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(0, 256); g.lineTo(64, 206); g.lineTo(128, 256);
  g.fill();
  for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(r() * 128, 236 + r() * 20, 3 + r() * 5, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function hideTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  // A tan hide with an irregular edge, a red painted eye and handprints.
  g.fillStyle = '#9c7b55';
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2, rr = 56 + Math.sin(i * 2.7) * 6;
    g.lineTo(64 + Math.cos(a) * rr * 0.92, 64 + Math.sin(a) * rr);
  }
  g.fill();
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,40,20,${r() * 0.12})`; g.fillRect(20 + r() * 88, 14 + r() * 100, 2, 2 + r() * 4); }
  g.strokeStyle = '#8a1a12';
  g.fillStyle = '#8a1a12';
  g.lineWidth = 5;
  g.beginPath(); g.ellipse(64, 58, 28, 14, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(64, 58, 8, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64 + s * 30, 58); g.lineTo(64 + s * 44, 50); g.stroke(); }
  for (const [hx, hy] of [[40, 96], [86, 94]]) {
    g.beginPath(); g.arc(hx, hy, 7, 0, Math.PI * 2); g.fill();
    for (let f = -2; f <= 2; f++) g.fillRect(hx + f * 3.5 - 1.2, hy - 16, 2.4, 9);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
