import * as THREE from 'three';
import { FARMS, roadDistance } from './map.js';


// The field boundaries: hedgerows round the Farms' wheat and greens, a timber fence round the flax
// field, a dry-stone wall round the ploughland, each with a gate onto the lane standing open. And
// a few more old walls and hedges out in the country, where fields once were. Everything is built
// with the SiteKit, so it is batched, textured at the kit's scale, audited, and solid.

const GATE = 3.4; // the gap left for the gate
const MAT = {};

// A stone material that turns a scanned (warm) texture into the vale's grey rock.
export function greyStone(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))), diffuseColor.rgb, 0.22) * vec3(0.96, 0.97, 1.0);`);
  };
  return mat;
}

// Leaves all over a hedge's lumpy volume (length along x, standing on y = 0): cards turned every
// way, thickest on the top and sides, a few straggling out.
// `open` says which ends of this length are open ([start, end]): those get leafy end faces.
function leafCards(sk, len, h, thick, open, phase) {
  const ends = (open[0] ? 1 : 0) + (open[1] ? 1 : 0);
  const pos = [], uv = [], nrm = [], idx = [];
  const r = () => sk.rnd();
  // The top of the hedge rises and falls along it, so its line against the sky is never ruled.
  const topAt = (x) => h * (0.9 + 0.07 * Math.sin(x * 1.9 + phase) + 0.05 * Math.sin(x * 4.7 + phase * 2.3));
  const n = Math.round(len * 95 + ends * 70);
  for (let i = 0; i < n; i++) {
    // A point on the hedge's skin: its two sides, its rounded top, and its open ends.
    let x = (r() - 0.5) * len;
    const t = r(), top = topAt(x);
    let y, z, nx = 0, ny, nz;
    if (i >= n - ends * 70) {
      // An end: cards over the rounded end face.
      const e = open[0] && open[1] ? (i % 2 ? 1 : -1) : open[0] ? -1 : 1;
      x = e * len / 2 + e * r() * 0.12;
      y = top * (0.08 + r() * 0.85); z = (r() - 0.5) * thick * 0.9; nx = e; ny = 0.2; nz = 0;
    } else if (t < 0.34) { y = top * (0.06 + r() * 0.8); z = -thick / 2; ny = 0; nz = -1; }
    else if (t < 0.68) { y = top * (0.06 + r() * 0.8); z = thick / 2; ny = 0; nz = 1; }
    else { const q = (r() - 0.5) * 2.6; y = top * 0.8 + Math.cos(q) * top * 0.18; z = Math.sin(q) * thick * 0.46; ny = Math.cos(q); nz = Math.sin(q); }
    // A few sprigs stand proud of the clipped face; most lie in it.
    const out = (r() < 0.1 ? 0.12 + r() * 0.22 : (r() - 0.3) * 0.12);
    const cx = x + nx * out, cy = y + ny * out, cz = z * 0.94 + nz * out;
    const s = 0.22 + r() * 0.2;
    // Two edge vectors of the card, turned at random about its outward normal.
    const ang = r() * 6.283, tilt = (r() - 0.5) * 1.2;
    const e1 = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.6 + tilt * 0.3, Math.sin(ang) * 0.3).normalize().multiplyScalar(s);
    const nn = new THREE.Vector3(nx + (r() - 0.5) * 0.6, ny + 0.4, nz).normalize();
    const e2 = new THREE.Vector3().crossVectors(nn, e1).normalize().multiplyScalar(s);
    const base = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(cx + e1.x * u + e2.x * v, cy + e1.y * u + e2.y * v, cz + e1.z * u + e2.z * v);
      uv.push((u + 1) / 2, (v + 1) / 2);
      nrm.push(nn.x * 0.5, 0.8, nn.z * 0.5);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.normalizeNormals();
  g.userData.wuv = true;
  return g;
}

export async function buildFields(sk, assets) {
  const [leaf, cobble] = await Promise.all([assets.texture('trees/leaves_oak.webp', { repeat: false }), assets.texture('ground/cobble_a.webp')]);
  MAT.leaf = new THREE.MeshStandardMaterial({ map: leaf, color: 0x6f8c55, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  // The hedge's heart: dark and shadowed, so gaps between the leaves read as depth, not paint.
  MAT.core = new THREE.MeshStandardMaterial({ color: 0x1f3016, roughness: 1 });
  MAT.leaf.name = 'HedgeLeaf';
  MAT.stone = greyStone(new THREE.MeshStandardMaterial({ map: cobble, color: 0xcdc8bf, roughness: 0.96 }));
  MAT.stone.name = 'DryStone';
  for (const f of FARMS) boundary(sk, f);
  // Old boundaries out in the country: a wall along the heath's edge by the Stones Path, and a
  // hedgerow across the meadow between the town and the river.
  drystone(sk, [[46, -14], [52, -42], [54, -70]]);
  drystone(sk, [[34, 96], [44, 122], [50, 146]]);
  hedgerow(sk, [[132, 40], [140, 60]]);
}

// The four sides of a field, corner to corner, with the gate's gap on its side.
function boundary(sk, f) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  const at = (lx, lz) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
  const hw = f.w / 2 + 0.6, hd = f.d / 2 + 0.6;
  const sides = {
    n: [[-hw, -hd], [hw, -hd]], e: [[hw, -hd], [hw, hd]], s: [[hw, hd], [-hw, hd]], w: [[-hw, hd], [-hw, -hd]],
  };
  const [gSide, gT] = f.gate;
  for (const [name, [a, b]] of Object.entries(sides)) {
    const pa = at(...a), pb = at(...b);
    const runs = [];
    if (name === gSide) {
      // The gate's place along this side, from its middle (gT in -0.5..0.5 of its length).
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const ux = (pb[0] - pa[0]) / len, uz = (pb[1] - pa[1]) / len;
      const mid = len / 2 + gT * len * (name === 'n' || name === 'e' ? 1 : -1);
      const g0 = mid - GATE / 2, g1 = mid + GATE / 2;
      // A hedge stops short of the gate posts (its leaves round over its end), so no post stands buried in it.
      const back = f.edge === 'hedge' ? 0.45 : 0;
      runs.push([pa, [pa[0] + ux * (g0 - back), pa[1] + uz * (g0 - back)]], [[pa[0] + ux * (g1 + back), pa[1] + uz * (g1 + back)], pb]);
      gate(sk, pa[0] + ux * g0, pa[1] + uz * g0, pa[0] + ux * g1, pa[1] + uz * g1, f);
    } else runs.push([pa, pb]);
    for (const [p, q] of runs) {
      if (f.edge === 'hedge') hedgerow(sk, [p, q]);
      else if (f.edge === 'fence') fence(sk, p, q);
      else drystone(sk, [p, q]);
    }
  }
}

// A field hedge: a dense, dark woody core clothed in leaves, shaggy and uneven, about as tall as a
// man (and never across a road: where one runs close, the hedge stops short). In lengths of about
// three metres, each solid.
function hedgerow(sk, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = clipToRoads(pts[i], pts[i + 1], 2.4);
    if (!a) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const k = Math.max(1, Math.round(len / 3)), seg = len / k;
    for (let j = 0; j < k; j++) {
      const cx = a[0] + ux * seg * (j + 0.5), cz = a[1] + uz * seg * (j + 0.5);
      const gy = sk.ground(cx, cz), h = 1.75 + sk.rnd() * 0.35, thick = 1.25;
      sk.begin('hedgerow', cx, cz);
      const ends = [j === 0, j === k - 1], ph = (cx + cz) * 0.37;
      sk.put(sk.hedgeBlock(seg + 0.3, h * 0.86, thick * 0.74, sk.rnd() * 20, true), MAT.core, cx, gy - 0.15, cz, rot);
      sk.put(leafCards(sk, seg + 0.3, h, thick, ends, ph), MAT.leaf, cx, gy - 0.15, cz, rot);
      sk.solidBox(cx, cz, seg / 2 + 0.05, thick / 2 + 0.1, rot, gy - 0.35, h + 0.1);
    }
  }
}

// A post-and-rail fence of the kit's pieces (low enough to hop).
function fence(sk, a, b) {
  const [p, q] = clipToRoads(a, b, 1.8);
  if (p) sk.fence(p, q);
}

// A dry-stone wall: rough stone laid without mortar, a little wider at the foot than the top, its
// coping uneven. Runs in short lengths that follow the ground, each reaching down to the lowest
// ground under it so no gap opens beneath; a collider for each length (knee to waist high, so it
// can be climbed).
function drystone(sk, pts) {
  const m = MAT.stone;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = clipToRoads(pts[i], pts[i + 1], 2.2);
    if (!a) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.round(len / 2.2)), seg = len / n;
    for (let k = 0; k < n; k++) {
      const cx = a[0] + ux * seg * (k + 0.5), cz = a[1] + uz * seg * (k + 0.5);
      const gy = sk.ground(cx, cz);
      let lo = gy;
      for (const t of [-0.5, 0, 0.5]) for (const s of [-1, 1]) lo = Math.min(lo, sk.ground(cx + ux * seg * t - uz * s * 0.35, cz + uz * seg * t + ux * s * 0.35));
      // The run leans with the ground from end to end (no stepped, castle-like top), its foot a hand
      // below the lowest ground under it.
      const g0 = sk.ground(cx - ux * seg / 2, cz - uz * seg / 2), g1 = sk.ground(cx + ux * seg / 2, cz + uz * seg / 2);
      const tilt = Math.atan2(g1 - g0, seg), mid = (g0 + g1) / 2;
      const h = 0.95 + sk.rnd() * 0.12, foot = Math.min(mid, lo + Math.abs(g1 - g0) / 2) - 0.3;
      sk.begin('drystone wall', cx, cz);
      sk.put(stoneRun(seg + 0.06, mid + h - foot, 0.7, 0.46, k * 7.3 + i), m, cx, foot, cz, rot, 1, 1, 1, 0, tilt);
      const sh = sk.colliders.addBox(cx, cz, seg / 2 + 0.03, 0.34, rot, foot - Math.abs(g1 - g0) / 2, mid + h);
      if (h <= 1.02) sh.floor = true;
    }
  }
}

// One length of dry-stone wall: a battered block whose faces and top are knobbled like laid stones.
const RUNS = new Map();
function stoneRun(len, h, foot, top, seed) {
  const key = `${len.toFixed(2)}|${h.toFixed(2)}|${Math.round(seed) % 5}`;
  if (RUNS.has(key)) return RUNS.get(key);
  const g = new THREE.BoxGeometry(len, h, foot, Math.max(2, Math.round(len / 0.28)), Math.max(2, Math.round(h / 0.25)), 2);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  const ph = (Math.round(seed) % 5) * 1.7;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / h;
    // Batter: narrower toward the top.
    z *= 1 - (1 - top / foot) * t;
    // Stones: bumps along the courses; an uneven coping.
    const course = Math.floor(y / 0.24), off = course * 0.37 + ph, fx = ((x + off) / 0.45) % 1, fy = (y / 0.24) % 1;
    const edge = Math.min(Math.abs(fx), 1 - Math.abs(fx), fy * 2, (1 - fy) * 2);
    const bump = (Math.sin(course * 12.9 + Math.floor((x + off) / 0.45) * 78.2) * 0.5 + 0.5) * 0.06 * Math.min(1, edge * 5) + Math.sin(x * 23 + y * 17) * 0.012;
    z += Math.sign(z) * bump * (y > 0.02 ? 1 : 0);
    if (t > 0.98) y += (Math.sin(x * 5.3 + ph) * 0.5 + Math.sin(x * 13.1 + ph * 3) * 0.3) * 0.1;
    // The ends taper a touch so a run's end is not a sawn-off slab.
    p.setXYZ(i, x * (1 - 0.02 * t), y, z);
  }
  g.computeVertexNormals();
  // Stones at their own size: 1.2 m of texture a repeat, on every face.
  const uv = g.attributes.uv, nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
    const x = p.getX(i) + seed * 3.1, y = p.getY(i), z = p.getZ(i);
    if (ay > ax && ay > az) uv.setXY(i, x / 1.2, z / 1.2);
    else if (ax > az) uv.setXY(i, z / 1.2, y / 1.2);
    else uv.setXY(i, x / 1.2, y / 1.2);
  }
  g.userData.wuv = true;
  RUNS.set(key, g);
  return g;
}

// A five-bar gate hung on two stout posts, standing open (swung back into the field) so the way
// in is clear.
function gate(sk, x0, z0, x1, z1, f) {
  const { m } = sk;
  const w = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / w, uz = (z1 - z0) / w;
  const rot = Math.atan2(-uz, ux);
  // Into the field: from the gap's middle toward the field's centre.
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  let ix = f.x - mx, iz = f.z - mz;
  const il = Math.hypot(ix, iz);
  ix /= il; iz /= il;
  const post = (px, pz, label) => {
    const y = sk.ground(px, pz);
    sk.begin(label, px, pz);
    sk.put(sk.timberBox(0.22, 1.75, 0.22, 'y'), m.timber, px, y - 0.4, pz, rot);
    sk.put(sk.timberBox(0.28, 0.06, 0.28, 'x'), m.timber, px, y + 1.35, pz, rot);
    sk.solidCircle(px, pz, 0.15, y, 1.4);
  };
  post(x1, z1, 'gate post');
  // The leaf, hung on the first post and swung back into the field, nearly square to the gap.
  post(x0, z0, 'field gate');
  const hy = sk.ground(x0, z0);
  let dx = ix * 0.98 + ux * 0.17, dz = iz * 0.98 + uz * 0.17;
  const dl = Math.hypot(dx, dz);
  dx /= dl; dz /= dl;
  const sw = Math.atan2(-dz, dx), L = w - 0.35;
  const lx = x0 + dx * (0.13 + L / 2), lz = z0 + dz * (0.13 + L / 2);
  // Sawn timber with its grain along each bar (the kit's wood sheet has a metal strip that showed on thin bars).
  for (let r = 0; r < 5; r++) sk.put(sk.timberBox(L, 0.08, 0.05, 'x'), m.timber, lx, hy + 0.22 + r * 0.22, lz, sw);
  for (const e of [-0.5, 0.5]) sk.put(sk.timberBox(0.09, 1.05, 0.07, 'y'), m.timber, lx + dx * e * L, hy + 0.12, lz + dz * e * L, sw);
  // The brace, corner to corner.
  sk.put(sk.timberBox(Math.hypot(L, 0.85), 0.07, 0.045, 'x'), m.timber, lx, hy + 0.6, lz, sw, 1, 1, 1, 0, Math.atan2(0.85, L));
  const sh = sk.colliders.addBox(lx, lz, L / 2 + 0.05, 0.08, sw, hy, hy + 1.15);
  sh.noCamera = true;
}

// Shortens a run so it stops `gap` metres short of any road it would cross or touch.
function clipToRoads(a, b, gap) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
  const clear = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const [rd, rw] = roadDistance(x, z);
    clear.push(rd > rw + gap);
  }
  // Keep the longest clear stretch.
  let best = [0, -1], s = -1;
  for (let i = 0; i <= n + 1; i++) {
    if (i <= n && clear[i]) { if (s < 0) s = i; }
    else if (s >= 0) { if (i - 1 - s > best[1] - best[0]) best = [s, i - 1]; s = -1; }
  }
  if (best[1] - best[0] < 2) return [null, null];
  const p = (i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
  return [p(best[0]), p(best[1])];
}


