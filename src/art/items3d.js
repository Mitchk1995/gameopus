import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASES } from '../content/bases.js';
import { mulberry32 } from '../core/rng.js';

// Procedural 3D models for every item: 7 slots x 6 base designs, rarity accents,
// and a bespoke look for each unique. Used for inventory icons, ground drops
// and the gear the hero visibly wears. Front of every model faces +z.

const GEMS = [0xff2a3a, 0x3a6aff, 0x2adf7a, 0xb04aff, 0xffb020];
const ELEMENT = { fire: 0xff7a30, cold: 0x6ad0ff, lightning: 0xb8c8ff };

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function itemSpec(item) {
  const list = BASES[item.slot] || [];
  const tier = Math.max(0, list.indexOf(item.base));
  const seed = hashStr(String(item.uid || item.name || item.slot));
  const aff = new Set((item.affixes || []).map((a) => a.id));
  const el = aff.has('fireDmg') ? 'fire' : aff.has('coldDmg') ? 'cold' : aff.has('lightningDmg') ? 'lightning' : null;
  return { slot: item.slot, tier, rarity: item.rarity || 'magic', uniqueId: item.uniqueId || null, variant: seed % GEMS.length, el };
}

export const artKey = (item) => {
  const s = itemSpec(item);
  return `${s.slot}|${s.tier}|${s.rarity}|${s.uniqueId || ''}|${s.variant}|${s.el || ''}`;
};

// ------------------------------------------------------------------ helpers
const M = (geo, mat, o = {}) => {
  const m = new THREE.Mesh(geo, mat);
  if (o.p) m.position.set(...o.p);
  if (o.r) m.rotation.set(...o.r);
  if (o.s) m.scale.set(...(Array.isArray(o.s) ? o.s : [o.s, o.s, o.s]));
  return m;
};
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y));
const lathe = (pts, seg = 32, start = 0, len = Math.PI * 2) => new THREE.LatheGeometry(V2(pts), seg, start, len);
// Lathe with an opening centered on the front (+z).
const latheGap = (pts, gap, seg = 32) => lathe(pts, seg, gap / 2, Math.PI * 2 - gap);
// Lathe covering only an arc centered on the front.
const latheFront = (pts, arc, seg = 20) => lathe(pts, seg, -arc / 2, arc);
const tube = (pts, r, mat, seg = 32, closed = false) =>
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, 8, closed), mat);
// Faceted brilliant-cut gem: pavilion, girdle, crown, table.
const gemGeo = (r) => lathe([[0, -r * 1.05], [r, 0], [r * 0.64, r * 0.5], [0, r * 0.52]], 8);
const extrude = (shape, depth, bevel = 0.01, seg = 2) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return g;
};
const star = (outer, inner, n = 5) => {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner : outer;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
};
// Gem in a small bezel cup with prongs.
function setGem(g, k, mat, r, p, facing = [0, 0, 0], metal) {
  const holder = new THREE.Group();
  holder.position.set(...p);
  holder.rotation.set(...facing);
  holder.add(M(new THREE.CylinderGeometry(r * 1.05, r * 0.7, r * 0.5, 16), metal, { p: [0, -r * 0.45, 0] }));
  holder.add(M(gemGeo(r), mat, { p: [0, r * 0.1, 0] }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    holder.add(M(new THREE.CylinderGeometry(r * 0.1, r * 0.14, r * 0.8, 5), metal, { p: [Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] }));
  }
  g.add(holder);
  return holder;
}

function accents(k, s) {
  const rare = s.rarity === 'rare', magic = s.rarity === 'magic';
  const gem = GEMS[s.variant];
  const rune = s.el ? ELEMENT[s.el] : magic ? 0x6f8cff : rare ? 0xffcf5a : 0xff8a2b;
  return {
    trim: rare || s.rarity === 'unique' || s.rarity === 'ascendant' ? k.metal('gold') : null,
    gem: k.gem(rare ? gem : magic ? 0x4a6aff : 0xff6a20, 0.5),
    rune: k.glow(rune, 2.2),
  };
}

// ------------------------------------------------------------------ weapons
function bladeShape(tier, L, w, jag) {
  const h = w / 2, s = new THREE.Shape();
  switch (tier) {
    case 0: // rusted and notched
      s.moveTo(-h, 0); s.lineTo(-h * 0.95, L * 0.82); s.lineTo(0, L); s.lineTo(h * 0.9, L * 0.8);
      s.lineTo(h, L * 0.66); s.lineTo(h - 0.035, L * 0.62); s.lineTo(h, L * 0.58);
      s.lineTo(h, L * 0.42); s.lineTo(h - 0.03, L * 0.39); s.lineTo(h, L * 0.36); s.lineTo(h, 0);
      break;
    case 2: // curved saber
      s.moveTo(-h, 0); s.quadraticCurveTo(-h + 0.03, L * 0.55, 0.12, L); s.quadraticCurveTo(h + 0.1, L * 0.5, h, 0);
      break;
    case 3: // serrated
      s.moveTo(-h, 0); s.lineTo(-h, L * 0.85); s.lineTo(0, L);
      for (let i = 9; i >= 0; i--) s.lineTo(h + (i % 2 ? 0.04 : 0), (L * 0.85 * i) / 9);
      break;
    case 4: // hooked void blade
      s.moveTo(-h, 0); s.lineTo(-h, L * 0.9); s.lineTo(-0.01, L); s.lineTo(h * 2.2, L * 0.92); s.lineTo(h, L * 0.85); s.lineTo(h, 0);
      break;
    case 5: // choirglass leaf
      s.moveTo(-h * 0.5, 0); s.quadraticCurveTo(-h * 1.5, L * 0.45, 0, L); s.quadraticCurveTo(h * 1.5, L * 0.45, h * 0.5, 0);
      break;
    case 6: { // jagged ice (Rimebite)
      s.moveTo(-h, 0);
      for (let i = 1; i <= 6; i++) s.lineTo(-h - (i % 2 ? jag : 0) + i * 0.004, (L * 0.85 * i) / 6);
      s.lineTo(0, L);
      for (let i = 6; i >= 0; i--) s.lineTo(h + (i % 2 ? 0 : jag * 0.8) - i * 0.004, (L * 0.85 * i) / 6);
      break;
    }
    default: // broadsword
      s.moveTo(-h, 0); s.lineTo(-h, L * 0.86); s.lineTo(0, L); s.lineTo(h, L * 0.86); s.lineTo(h, 0);
  }
  return s;
}

// Sharpened blade: a central ridge sloping down to thin edges (diamond cross-section).
function bladeGeo(shape, w) {
  const b = w * 0.34;
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.026, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 12 });
  g.translate(0, 0, -0.006);
  g.computeVertexNormals();
  return g;
}

function weapon(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const u = s.uniqueId;
  const t = u === 'rimebite' ? 6 : s.tier;
  const L = [0.95, 1.08, 1.12, 1.08, 1.25, 1.15, 1.15][t];
  const w = [0.15, 0.21, 0.13, 0.17, 0.11, 0.22, 0.18][t];
  const bladeMat = [k.metal('rust'), k.metal('blade'), k.metal('silver'), k.metal('iron'), k.metal('void'), k.crystal(0x9fe8ff), k.crystal(0xcff0ff)][t];
  const guardMat = u === 'rimebite' ? k.metal('silver') : A.trim || [k.metal('iron'), k.metal('steel'), k.metal('gold'), k.bone(), k.metal('void'), k.metal('gold')][t];
  const gripMat = t === 4 ? k.leather(0x2a1a30) : k.leather(0x5a3520);

  g.add(M(bladeGeo(bladeShape(t, L, w, 0.035), w), bladeMat, { p: [0, 0.04, 0] }));
  if (t === 1 || t === 3) g.add(M(new THREE.BoxGeometry(w * 0.12, L * 0.6, 0.068), k.metal('iron'), { p: [0, L * 0.38, 0] }));
  if (t === 2 || t === 4 || s.rarity !== 'magic' || s.el) {
    for (let i = 0; i < 5; i++) g.add(M(new THREE.BoxGeometry(0.022, 0.045, 0.07), A.rune, { p: [t === 2 ? 0.012 + i * 0.012 : 0, L * (0.18 + i * 0.1), 0] }));
  }
  if (t === 4) for (const z of [-1, 1]) g.add(M(new THREE.BoxGeometry(0.008, L * 0.82, 0.004), k.glow(0xb070ff, 2.6), { p: [w * 0.42, L * 0.45, z * 0.012] }));
  if (t === 5 || t === 6) g.add(M(new THREE.BoxGeometry(0.018, L * 0.72, 0.03), k.glow(t === 5 ? 0x8fe8ff : 0x9fdcff, 1.8), { p: [0, L * 0.42, 0] }));

  // Crossguards.
  if (t === 0) g.add(M(new THREE.BoxGeometry(0.3, 0.06, 0.08), guardMat));
  else if (t === 1) {
    g.add(M(new THREE.BoxGeometry(0.42, 0.055, 0.075), guardMat));
    for (const sx of [-1, 1]) g.add(M(new THREE.SphereGeometry(0.045, 12, 10), guardMat, { p: [sx * 0.22, 0.012, 0] }));
  } else if (t === 2) {
    g.add(M(new THREE.BoxGeometry(0.34, 0.05, 0.07), guardMat));
    // knuckle bow sweeping from the guard to the pommel
    g.add(M(new THREE.TorusGeometry(0.19, 0.022, 8, 24, Math.PI), guardMat, { p: [0.0, -0.19, 0], r: [0, 0, -Math.PI / 2] }));
  } else if (t === 3) {
    for (const sx of [-1, 1]) {
      const horn = new THREE.Group();
      for (let i = 0; i < 4; i++) horn.add(M(new THREE.CylinderGeometry(0.02 - i * 0.004, 0.026 - i * 0.004, 0.08, 8), guardMat, { p: [sx * (0.05 + i * 0.055), 0.01 + i * i * 0.012, 0], r: [0, 0, -sx * (1.3 - i * 0.2)] }));
      g.add(horn);
    }
    g.add(M(new THREE.SphereGeometry(0.075, 16, 12), guardMat, { s: [1, 0.9, 0.85] }));
    for (const sx of [-1, 1]) g.add(M(new THREE.SphereGeometry(0.02, 8, 6), k.dark(), { p: [sx * 0.028, 0.012, 0.052], s: [1, 0.8, 0.45] }));
  } else if (t === 4) {
    g.add(M(new THREE.BoxGeometry(0.2, 0.055, 0.075), guardMat));
    for (const sx of [-1, 1]) g.add(M(new THREE.ConeGeometry(0.03, 0.26, 6), guardMat, { p: [sx * 0.18, 0.06, 0], r: [0, 0, -sx * 0.9] }));
  } else if (t === 5) {
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const f = new THREE.SphereGeometry(0.1, 12, 8);
      f.scale(1, 0.26, 0.12);
      g.add(M(f, guardMat, { p: [sx * (0.1 + i * 0.03), 0.02 - i * 0.03, 0], r: [0, 0, sx * (0.25 - i * 0.35)] }));
    }
  } else {
    g.add(M(new THREE.BoxGeometry(0.3, 0.05, 0.07), guardMat));
    for (let i = -2; i <= 2; i++) g.add(M(new THREE.ConeGeometry(0.02, 0.16 + Math.abs(i) * 0.03, 6), k.crystal(0xdff6ff), { p: [i * 0.06, -0.08, 0.03], r: [Math.PI, 0, i * 0.2] }));
  }

  // Grip with leather wraps, and a pommel.
  g.add(M(new THREE.CylinderGeometry(0.03, 0.034, 0.3, 12), gripMat, { p: [0, -0.18, 0] }));
  for (let i = 0; i < 5; i++) g.add(M(new THREE.TorusGeometry(0.035, 0.008, 5, 14), gripMat, { p: [0, -0.07 - i * 0.055, 0], r: [Math.PI / 2, 0, 0.3] }));
  if (t >= 2 || s.rarity !== 'magic') setGem(g, k, t === 6 ? k.gem(0x9fdcff, 0.9) : A.gem, 0.045, [0, -0.37, 0], [Math.PI, 0, 0], guardMat);
  else g.add(M(new THREE.SphereGeometry(0.045, 12, 10), guardMat, { p: [0, -0.36, 0] }));
  return g;
}

// ------------------------------------------------------------------ shells
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Resample a lathe profile ([r, y], y ascending) into a smooth, dense curve.
const smoothProfile = (pts, n = 48) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n).map((v) => [v.x, v.y]);
// Radius of a lathe profile at height y.
function radiusAt(pts, y) {
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
    if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
  }
  return pts[pts.length - 1][0];
}
// A smooth lathe shell, optionally warped, with openings cut wherever hole(x, y, z) holds.
function shell(pts, { hole, warp, seg = 80, start = 0, len = Math.PI * 2 } = {}) {
  let geo = new THREE.LatheGeometry(V2(pts), seg, start, len);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-5);
  if (warp) {
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); warp(v); p.setXYZ(i, v.x, v.y, v.z); }
  }
  geo.computeVertexNormals();
  if (!hole) return geo;
  geo = geo.toNonIndexed();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const P = [], N = [];
  for (let t = 0; t < p.count; t += 3) {
    let cut = false;
    for (let j = 0; j < 3 && !cut; j++) cut = hole(p.getX(t + j), p.getY(t + j), p.getZ(t + j));
    if (cut) continue;
    for (let j = 0; j < 3; j++) {
      P.push(p.getX(t + j), p.getY(t + j), p.getZ(t + j));
      N.push(n.getX(t + j), n.getY(t + j), n.getZ(t + j));
    }
  }
  geo.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return out;
}
// Front-view 2D points [x, y] projected onto the front of a lathe shell.
const onShell = (prof, pts2, out = 0.004, warp) => pts2.map(([x, y]) => {
  const R = radiusAt(prof, y) + out;
  const v = new THREE.Vector3(x, y, Math.sqrt(Math.max(0, R * R - x * x)));
  warp?.(v);
  return [v.x, v.y, v.z];
});
// Densify a polyline so a Catmull-Rom tube keeps its corners tight.
function densify(pts, step = 0.02) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 0; j < n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const pathTube = (pts3, r, mat, closed = false) =>
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3.map((p) => new THREE.Vector3(...p)), closed, 'centripetal'), Math.max(16, pts3.length * 3), r, 8, closed), mat);
// A tube whose radius tapers from r0 to r1, with optional ridges (horns, tusks).
function taperTube(pts, r0, r1, mat, ridges = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const segs = 48, radial = 10;
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const r = (r0 + (r1 - r0) * t) * (ridges ? 1 + 0.12 * Math.max(0, Math.sin(t * ridges * Math.PI * 2)) : 1);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return M(geo, mat);
}
// A flat band that follows a lathe profile along one meridian (spangen, center ridges).
const meridianBand = (prof, phi, width, out, mat, y0 = -9, y1 = 9) =>
  M(new THREE.LatheGeometry(V2(prof.filter(([, y]) => y >= y0 && y <= y1).map(([r, y]) => [r + out, y])), 3, phi - width / 2, width), mat);
// A band around a lathe profile between two heights (brow bands, rims).
const girdle = (prof, y0, y1, out, mat, gap = 0) => {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const y = y0 + ((y1 - y0) * i) / 6;
    pts.push([radiusAt(prof, y) + out * Math.sin((i / 6) * Math.PI) + out * 0.35, y]);
  }
  return M(gap ? lathe(pts, 64, gap / 2, Math.PI * 2 - gap) : lathe(pts, 64), mat);
};

// The hooded cowl, shared by the Leather Cowl helm and the hero's own hood.
export function cowl(k, cloth, trim, { depth = 1, peak = 0.28 } = {}) {
  const g = new THREE.Group();
  const prof = smoothProfile([[0.43, -0.47], [0.37, -0.37], [0.31, -0.25], [0.295, -0.1], [0.3, 0.05], [0.29, 0.18], [0.25, 0.29], [0.17, 0.37], [0.08, 0.415], [0, 0.425]]);
  const rx = 0.185 * depth, ry = 0.25, cy = -0.03;
  const face = (x, y, z) => z > 0 && (x / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
  const warp = (v) => {
    const fold = 1 + 0.045 * Math.sin(Math.atan2(v.x, v.z) * 9) * smoothstep(-0.22, -0.47, v.y);
    v.x *= fold;
    v.z *= fold;
    const t = smoothstep(0.02, 0.42, v.y) * Math.max(0, -v.z / 0.3);
    v.z -= t * peak;
    v.y += t * peak * 0.2;
  };
  g.add(M(shell(prof, { hole: face, warp }), cloth));
  g.add(M(shell(prof.filter(([, y]) => y > -0.3).map(([r, y]) => [r * 0.92, y]), { hole: face, warp }), k.inner()));
  const edge = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    edge.push([Math.cos(a) * (rx + 0.005), cy + Math.sin(a) * (ry + 0.005)]);
  }
  g.add(pathTube(onShell(prof, edge, 0.004), 0.022, trim, true));
  // center seam over the crown to the peak
  const seam = [];
  for (let i = 0; i <= 16; i++) {
    const a = -0.05 + (i / 16) * 2.2;
    const y = cy + ry + 0.02 + Math.sin(a) * 0.2, R = radiusAt(prof, Math.min(0.42, y));
    seam.push([0, y, Math.cos(a) * R + 0.004]);
  }
  const seamPts = seam.map(([x, y, z]) => { const v = new THREE.Vector3(x, y, z); warp(v); return [v.x, v.y, v.z]; });
  g.add(pathTube(seamPts, 0.008, trim));
  return g;
}

// ------------------------------------------------------------------ helms
function helm(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const t = s.tier, u = s.uniqueId;
  const dark = k.inner();
  const add = (m) => { g.add(m); return m; };
  const rivet = (mat, p, r = 0.012) => add(M(new THREE.SphereGeometry(r, 8, 6), mat, { p }));
  const rivetRing = (prof, y, mat, n, skip) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (skip?.(a)) continue;
      const R = radiusAt(prof, y) + 0.012;
      rivet(mat, [Math.sin(a) * R, y, Math.cos(a) * R]);
    }
  };
  if (u === 'orrery') {
    const prof = smoothProfile([[0.285, -0.05], [0.29, 0.06], [0.27, 0.18], [0.21, 0.29], [0.12, 0.36], [0, 0.39]], 32);
    add(M(shell(prof), k.metal('bronze')));
    add(M(shell(prof.map(([x, y]) => [x * 0.94, y])), dark));
    add(girdle(prof, -0.06, 0.0, 0.014, k.metal('gold')));
    for (let i = 0; i < 8; i++) add(meridianBand(prof, (i / 8) * Math.PI * 2, 0.05, 0.004, k.metal('gold'), 0.0, 0.33));
    const cols = [0x9f7aff, 0x7ad0ff, 0xffb86a];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const tilt = [0.35, -0.3, 0.1][i];
      add(M(new THREE.TorusGeometry(0.44, 0.008, 6, 72), k.metal('gold'), { p: [0, 0.17, 0], r: [Math.PI / 2 + tilt, 0, a] }));
      const planet = new THREE.Vector3(Math.cos(a) * 0.44, 0, Math.sin(a) * 0.44).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
      add(M(new THREE.SphereGeometry(0.055, 16, 12), k.glow(cols[i], 2.2), { p: [planet.x, 0.17 + planet.y, planet.z] }));
    }
    add(M(new THREE.SphereGeometry(0.05, 16, 12), k.metal('gold'), { p: [0, 0.4, 0] }));
    add(M(new THREE.SphereGeometry(0.03, 12, 10), k.glow(0xfff0c0, 3), { p: [0, 0.46, 0] }));
    return g;
  }
  switch (t) {
    case 0: { // leather cowl: deep hood with a rolled edge and a mantle over the shoulders
      g.add(cowl(k, k.leather(0x5a3a24), k.leather(0x2e1c10)));
      for (const sx of [-1, 1]) {
        add(pathTube([[sx * 0.08, -0.28, 0.33], [sx * 0.1, -0.36, 0.37], [sx * 0.09, -0.46, 0.39]], 0.009, k.leather(0x2e1c10)));
        add(M(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), k.bone(), { p: [sx * 0.09, -0.48, 0.39] }));
      }
      break;
    }
    case 1: { // spangenhelm: riveted bands, brow band, nasal, mail aventail
      const steel = k.metal('steel'), band = A.trim || k.metal('iron');
      const prof = smoothProfile([[0.285, -0.06], [0.29, 0.05], [0.28, 0.16], [0.245, 0.27], [0.18, 0.36], [0.1, 0.43], [0.035, 0.475], [0, 0.49]], 40);
      add(M(shell(prof), steel));
      add(M(shell(prof.map(([r, y]) => [r * 0.95, y])), dark));
      for (let i = 0; i < 4; i++) {
        const phi = Math.PI / 4 + (i * Math.PI) / 2;
        add(meridianBand(prof, phi, 0.17, 0.006, band, -0.04, 0.47));
        for (const y of [0.08, 0.2, 0.31]) {
          const R = radiusAt(prof, y) + 0.014;
          for (const d of [-0.035, 0.035]) rivet(k.metal('iron'), [Math.sin(phi + d / R) * R, y, Math.cos(phi + d / R) * R], 0.01);
        }
      }
      add(girdle(prof, -0.07, 0.02, 0.012, band));
      rivetRing(prof, -0.025, k.metal('iron'), 16, (a) => Math.abs(Math.sin(a / 2)) < 0.12);
      const nasal = new THREE.Shape();
      nasal.moveTo(-0.03, 0.07); nasal.lineTo(0.03, 0.07); nasal.lineTo(0.022, -0.2); nasal.quadraticCurveTo(0, -0.23, -0.022, -0.2);
      add(M(extrude(nasal, 0.012, 0.006), band, { p: [0, 0, 0.305], r: [-0.08, 0, 0] }));
      add(M(latheGap([[0.293, -0.05], [0.305, -0.17], [0.32, -0.3]], 1.9, 48), k.chain(true)));
      add(M(new THREE.SphereGeometry(0.03, 12, 10), band, { p: [0, 0.49, 0] }));
      break;
    }
    case 2: { // barbute: T-shaped face opening with a rolled rim and a keel ridge
      const steel = k.metal('steel');
      const prof = smoothProfile([[0.225, -0.34], [0.25, -0.26], [0.275, -0.14], [0.288, 0.0], [0.287, 0.12], [0.265, 0.23], [0.21, 0.32], [0.13, 0.385], [0.05, 0.412], [0, 0.416]], 56);
      const T = (x, y, z) => z > 0.05 && ((Math.abs(x) < 0.056 && y < 0.1) || (Math.abs(x) < 0.195 && y > 0.018 && y < 0.1));
      add(M(shell(prof, { hole: T, seg: 96 }), steel));
      add(M(shell(prof.map(([r, y]) => [r * 0.93, y]), { hole: T, seg: 96 }), dark));
      const rim = densify([[-0.058, -0.345], [-0.058, 0.014], [-0.197, 0.014], [-0.197, 0.104], [0.197, 0.104], [0.197, 0.014], [0.058, 0.014], [0.058, -0.345]], 0.015);
      add(pathTube(onShell(prof, rim, 0.002), 0.013, A.trim || steel));
      const keel = [];
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 0.92;
        const y = 0.13 + Math.sin(a) * 0.29, R = radiusAt(prof, Math.min(0.415, y)) + 0.006;
        keel.push([0, Math.min(0.422, y), Math.cos(a) * R]);
      }
      add(pathTube(keel, 0.016, A.trim || steel));
      add(girdle(prof, -0.345, -0.315, 0.008, A.trim || steel, 0.5));
      rivetRing(prof, 0.16, k.metal('iron'), 14, (a) => Math.abs(Math.sin(a / 2)) < 0.25);
      break;
    }
    case 3: { // bellwarden: sugarloaf great helm, eye slits under a brow flange, bell crest and plume
      const steel = k.metal('steel'), bronze = A.trim || k.metal('bronze');
      const prof = smoothProfile([[0.27, -0.33], [0.282, -0.2], [0.29, -0.05], [0.29, 0.08], [0.28, 0.18], [0.245, 0.29], [0.17, 0.385], [0.08, 0.445], [0, 0.465]], 56);
      const slit = (x, y, z) => z > 0.05 && Math.abs(x) > 0.03 && Math.abs(x) < 0.2 && Math.abs(y - 0.085) < 0.019;
      add(M(shell(prof, { hole: slit, seg: 96 }), steel));
      add(M(shell(prof.map(([r, y]) => [r * 0.93, y]), { hole: slit, seg: 96 }), dark));
      for (const [y, h] of [[0.122, 0.018], [0.047, 0.012]]) {
        add(M(new THREE.LatheGeometry(V2([[radiusAt(prof, y - h) + 0.004, y - h], [radiusAt(prof, y) + 0.018, y], [radiusAt(prof, y + h) + 0.004, y + h]]), 24, -0.8, 1.6), steel));
      }
      add(meridianBand(prof, 0, 0.1, 0.008, bronze, -0.33, 0.39));
      add(girdle(prof, -0.335, -0.3, 0.01, bronze));
      add(girdle(prof, 0.17, 0.2, 0.008, bronze));
      for (const sx of [-1, 1]) {
        for (const [cx, cy] of [[0, 0], [0.028, 0], [-0.028, 0], [0, 0.028], [0, -0.028]]) {
          const x = sx * 0.13 + cx, y = -0.12 + cy, R = radiusAt(prof, y);
          const z = Math.sqrt(R * R - x * x);
          const m = add(M(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8), dark, { p: [x, y, z - 0.004] }));
          m.lookAt(x * 2, y, z * 2);
          m.rotateX(Math.PI / 2);
        }
      }
      rivetRing(prof, -0.315, k.metal('iron'), 18, (a) => Math.abs(Math.sin(a / 2)) < 0.1);
      // bell crest
      add(M(new THREE.CylinderGeometry(0.025, 0.04, 0.05, 12), bronze, { p: [0, 0.475, 0] }));
      add(M(lathe(smoothProfile([[0.075, 0.0], [0.07, 0.015], [0.052, 0.04], [0.046, 0.08], [0.04, 0.11], [0.022, 0.125], [0, 0.128]], 20), 28), bronze, { p: [0, 0.49, 0] }));
      add(M(new THREE.TorusGeometry(0.02, 0.006, 6, 16), bronze, { p: [0, 0.63, 0] }));
      for (let i = 0; i < 7; i++) {
        const f = new THREE.SphereGeometry(0.2, 12, 8);
        f.scale(0.18, 0.045, 1);
        add(M(f, k.cloth(0x8a1414), { p: [0, 0.6 - Math.abs(i - 3) * 0.02, -0.19], r: [0.62 + (i - 3) * 0.05, (i - 3) * 0.2, 0] }));
      }
      break;
    }
    case 4: { // crown of thorns: a braided circlet of black iron, thorns and a blood gem
      const metal = k.metal('void');
      const R = 0.27;
      for (const ph of [0, Math.PI]) {
        const pts = [];
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2, w = a * 7 + ph;
          const r = R + Math.cos(w) * 0.018;
          pts.push([Math.sin(a) * r, Math.sin(w) * 0.018, Math.cos(a) * r]);
        }
        add(pathTube(pts, 0.017, metal, true));
      }
      const rng = mulberry32(s.variant * 97 + 13);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + rng() * 0.15;
        const front = Math.cos(a) > 0.85;
        const h = front ? 0.3 : 0.1 + rng() * 0.16;
        const tilt = 0.15 + rng() * 0.5;
        const m = add(M(new THREE.ConeGeometry(0.022 + h * 0.06, h, 6), metal, { p: [Math.sin(a) * R, 0, Math.cos(a) * R] }));
        m.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
        m.translateY(h / 2);
      }
      setGem(g, k, s.rarity === 'rare' ? A.gem : k.gem(0xff2030, 0.7), 0.05, [0, 0.05, R + 0.03], [Math.PI / 2, 0, 0], k.metal('gold'));
      break;
    }
    default: { // hollow visage: a featureless bone mask inside a black hood, with ridged horns
      g.add(cowl(k, k.cloth(0x2c2436), k.cloth(0x141019), { depth: 1.05, peak: 0.16 }));
      const mprof = smoothProfile([[0.02, -0.27], [0.13, -0.23], [0.19, -0.12], [0.215, 0.0], [0.21, 0.12], [0.17, 0.22], [0.09, 0.27], [0, 0.28]], 40);
      const eyes = (x, y, z) => {
        const ex = Math.abs(x) - 0.08, ey = y - 0.025;
        const c = Math.cos(0.5), sn = Math.sin(0.5);
        const lx = ex * c - ey * sn, ly = ex * sn + ey * c;
        return (lx / 0.058) ** 2 + (ly / (lx < 0 ? 0.03 : 0.018)) ** 2 < 1;
      };
      add(M(shell(mprof, { hole: eyes, seg: 96, start: -1.2, len: 2.4 }), k.bone(), { p: [0, -0.02, 0.05] }));
      for (const sx of [-1, 1]) {
        add(M(new THREE.SphereGeometry(0.03, 12, 8), k.glow(0x7ad8ff, 3.5), { p: [sx * 0.08, 0.004, 0.2], r: [0, 0, sx * 0.5], s: [1, 0.3, 0.5] }));
        add(pathTube([[sx * 0.018, 0.058, 0.262], [sx * 0.07, 0.074, 0.254], [sx * 0.135, 0.105, 0.225]], 0.009, k.bone()));
      }
      add(pathTube([[0.105, 0.03, 0.262], [0.088, 0.085, 0.258], [0.104, 0.13, 0.244], [0.082, 0.19, 0.21]], 0.0045, dark));
      for (const sx of [-1, 1]) {
        add(taperTube([[sx * 0.17, 0.26, 0.02], [sx * 0.31, 0.37, -0.02], [sx * 0.43, 0.49, -0.06], [sx * 0.5, 0.64, -0.1], [sx * 0.51, 0.79, -0.12]], 0.058, 0.006, k.metal('iron'), 8));
      }
    }
  }
  if (s.rarity === 'rare' && t < 4) setGem(g, k, A.gem, 0.04, [0, t === 3 ? 0.21 : 0.17, t === 0 ? 0.3 : 0.3], [Math.PI / 2 - 0.3, 0, 0], k.metal('gold'));
  return g;
}

// -------------------------------------------------------------------- chests
// A sculpted torso: an elliptical lathe with a chest swell and sloping shoulders.
// surf(angle, y, out) returns a point on it (angle 0 = front center) and
// nrm(angle) the outward direction there, for placing plates, scales and trim.
const TORSO = smoothProfile([[0.275, -0.5], [0.255, -0.4], [0.238, -0.28], [0.245, -0.12], [0.272, 0.04], [0.296, 0.17], [0.305, 0.25], [0.285, 0.32], [0.22, 0.375], [0.15, 0.405], [0.125, 0.42]], 48);
const TSX = 1.22, TSZ = 0.74;
function torsoWarp(v) {
  const front = Math.max(0, v.z / Math.max(0.05, Math.hypot(v.x, v.z)));
  v.x *= TSX;
  v.z *= TSZ * (1 + 0.1 * Math.exp(-(((v.y - 0.14) / 0.13) ** 2)) * front);
  v.y -= smoothstep(0.12, 0.36, Math.abs(v.x)) * 0.05 * smoothstep(0.15, 0.3, v.y);
}
const surf = (ang, y, out = 0, prof = TORSO) => {
  const R = radiusAt(prof, y) + out;
  const v = new THREE.Vector3(Math.sin(ang) * R, y, Math.cos(ang) * R);
  torsoWarp(v);
  return v;
};
const nrm = (ang) => new THREE.Vector3(Math.sin(ang) / TSX, 0, Math.cos(ang) / TSZ).normalize();
// A lathe band hugging the torso between two heights (belts, faulds, breastplates).
const torsoBand = (y0, y1, out, mat, { arc = Math.PI * 2, bulge = 0, rows = 8 } = {}) => {
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    pts.push([radiusAt(TORSO, y) + out + bulge * Math.sin((i / rows) * Math.PI), y]);
  }
  return M(shell(pts, { warp: torsoWarp, seg: arc < 6 ? 48 : 72, start: -arc / 2, len: arc }), mat);
};
const edgeTube = (ang0, ang1, y, out, r, mat, n = 24) => {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(surf(ang0 + ((ang1 - ang0) * i) / n, y, out).toArray());
  return pathTube(pts, r, mat);
};
const vertTube = (ang, y0, y1, out, r, mat, n = 16) => {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(surf(ang, y0 + ((y1 - y0) * i) / n, out).toArray());
  return pathTube(pts, r, mat);
};
// Orient an object so its +z faces outward from the torso at angle ang.
const faceOut = (m, ang, tilt = 0) => {
  const p = m.position.clone().add(nrm(ang));
  m.lookAt(p);
  m.rotateX(tilt);
  return m;
};

function chest(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const t = s.tier, u = s.uniqueId;
  const add = (m) => { g.add(m); return m; };
  const torso = (mat) => {
    add(M(shell(TORSO, { warp: torsoWarp }), mat));
    add(M(shell(TORSO.filter(([, y]) => y > 0.2).map(([r, y]) => [r * 0.95, y - 0.01]), { warp: torsoWarp }), k.inner()));
  };
  const belt = (mat, buckle) => {
    add(torsoBand(-0.33, -0.26, 0.012, mat, { bulge: 0.006, rows: 4 }));
    if (buckle) {
      const b = add(M(extrude(roundRect(0.1, 0.08, 0.015), 0.012, 0.005), buckle, { p: surf(0, -0.295, 0.03).toArray() }));
      faceOut(b, 0);
    }
  };
  const sleeves = (mat, len = 0.24) => {
    for (const sx of [-1, 1]) add(M(new THREE.CylinderGeometry(0.1, 0.125, len, 18, 1, true), mat, { p: [sx * 0.39, 0.22, 0], r: [0, 0, sx * 0.62] }));
  };
  const pauldrons = (mat, { spikes = false, rim = null, layers = 3 } = {}) => {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < layers; i++) {
        const cap = new THREE.SphereGeometry(0.19 - i * 0.022, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
        add(M(cap, mat, { p: [sx * (0.36 + i * 0.045), 0.32 - i * 0.075, 0], r: [0, 0, -sx * (0.3 + i * 0.32)], s: [1.08, 0.8, 1.05] }));
        if (rim) add(M(new THREE.TorusGeometry(0.19 - i * 0.022, 0.011, 6, 32), rim, { p: [sx * (0.36 + i * 0.045), 0.32 - i * 0.075, 0], r: [Math.PI / 2, -sx * (0.3 + i * 0.32), 0], s: [1.08, 1.05, 1] }));
      }
      if (spikes) add(M(new THREE.ConeGeometry(0.035, 0.24, 8), mat, { p: [sx * 0.42, 0.5, 0], r: [0, 0, -sx * 0.45] }));
    }
  };
  const breastplate = (mat, trim, { ridge = true } = {}) => {
    const arc = 2.5;
    add(torsoBand(-0.27, 0.33, 0.022, mat, { arc, rows: 16 }));
    add(edgeTube(-arc / 2, arc / 2, -0.27, 0.026, 0.014, trim));
    for (const sx of [-1, 1]) add(vertTube((sx * arc) / 2, -0.27, 0.3, 0.026, 0.014, trim));
    const neck = [];
    for (let i = 0; i <= 24; i++) {
      const a = -arc / 2 + (arc * i) / 24;
      neck.push(surf(a, 0.33 - Math.cos(a * 1.2) * 0.07, 0.03).toArray());
    }
    add(pathTube(neck, 0.016, trim));
    if (ridge) add(vertTube(0, -0.26, 0.25, 0.03, 0.012, mat));
  };
  const faulds = (mat, trim, n = 3) => {
    for (let i = 0; i < n; i++) {
      const y1 = -0.26 - i * 0.075, y0 = y1 - 0.09;
      add(torsoBand(y0, y1, 0.03 + i * 0.01, mat, { arc: 2.6, rows: 4, bulge: 0.004 }));
      add(edgeTube(-1.3, 1.3, y0, 0.034 + i * 0.01, 0.009, trim));
    }
  };
  const rivets = (mat, ang0, ang1, y, out, n) => {
    for (let i = 0; i < n; i++) add(M(new THREE.SphereGeometry(0.011, 8, 6), mat, { p: surf(ang0 + ((ang1 - ang0) * i) / (n - 1), y, out).toArray() }));
  };

  if (u === 'gravemantle') {
    torso(k.metal('iron'));
    for (let i = 0; i < 5; i++) {
      const y = 0.24 - i * 0.085;
      for (const sx of [-1, 1]) {
        const pts = [];
        for (let j = 0; j <= 8; j++) pts.push(surf(sx * (0.08 + j * 0.13), y - j * j * 0.0025, 0.02).toArray());
        add(pathTube(pts, 0.017 - i * 0.001, k.bone()));
      }
    }
    add(vertTube(0, -0.2, 0.3, 0.025, 0.022, k.bone()));
    add(M(new THREE.SphereGeometry(0.07, 16, 12), k.glow(0x6affb0, 1.6), { p: surf(0, 0.08, 0.0).toArray() }));
    pauldrons(k.bone(), { spikes: true });
    for (let i = 0; i < 7; i++) {
      const a = -1.1 + i * 0.37;
      const strip = add(M(new THREE.PlaneGeometry(0.1, 0.26 + (i % 3) * 0.07), k.cloth(0x24202a), { p: surf(a, -0.58, 0.02).toArray() }));
      faceOut(strip, a, 0.1);
    }
    belt(k.leather(0x1a1410), k.bone());
    return g;
  }
  switch (t) {
    case 0: { // padded gambeson: quilted channels, high collar, belt
      const cloth = k.cloth(0x6e6250), seam = k.cloth(0x3a3024);
      torso(cloth);
      for (let i = -4; i <= 4; i++) add(vertTube(i * 0.23, -0.48, 0.3, 0.004, 0.007, seam));
      add(M(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 24, 1, true), cloth, { p: [0, 0.43, 0], s: [TSX, 1, TSZ * 1.1] }));
      sleeves(cloth);
      belt(k.leather(0x4a2a18), k.metal('iron'));
      break;
    }
    case 1: { // chainmail hauberk with a leather collar and a baldric
      torso(k.chain());
      sleeves(k.chain(true), 0.28);
      add(M(new THREE.TorusGeometry(0.155, 0.03, 8, 32), k.leather(0x3a2416), { p: [0, 0.405, 0], r: [Math.PI / 2, 0, 0], s: [TSX, TSZ * 1.15, 1] }));
      const strap = [];
      for (let i = 0; i <= 20; i++) {
        const f = i / 20;
        strap.push(surf(-0.95 + f * 1.9, 0.3 - f * 0.58, 0.018).toArray());
      }
      add(pathTube(strap, 0.02, k.leather(0x4a2a18)));
      belt(k.leather(0x4a2a18), A.trim || k.metal('iron'));
      break;
    }
    case 2: { // scale hauberk: overlapping bronze scales over leather
      torso(k.leather(0x3a2a20));
      const sm = A.trim || k.metal('bronze');
      const sh = new THREE.Shape();
      sh.moveTo(-0.028, 0.03); sh.lineTo(0.028, 0.03); sh.lineTo(0.028, -0.006); sh.quadraticCurveTo(0.026, -0.04, 0, -0.05); sh.quadraticCurveTo(-0.026, -0.04, -0.028, -0.006);
      const sg = extrude(sh, 0.003, 0.003, 1);
      for (let row = 0; row < 11; row++) {
        const y = 0.27 - row * 0.05;
        const R = radiusAt(TORSO, y);
        const step = 0.05 / (R * 0.95);
        for (let a = -1.95 + (row % 2) * step * 0.5; a <= 1.95; a += step) {
          const m = add(M(sg, sm, { p: surf(a, y, 0.012 + row * 0.0012).toArray() }));
          faceOut(m, a, -0.32);
        }
      }
      sleeves(k.chain(true));
      belt(k.leather(0x2a1a10), sm);
      break;
    }
    case 3: { // wardplate: breastplate with a medial ridge, faulds and layered spaulders
      const steel = k.metal('steel'), trim = A.trim || k.metal('iron');
      torso(k.chain());
      breastplate(steel, trim);
      faulds(steel, trim);
      pauldrons(steel, { rim: trim });
      rivets(k.metal('iron'), -1.1, 1.1, -0.245, 0.034, 9);
      belt(k.leather(0x3a2416), trim);
      break;
    }
    case 4: { // reliquary plate: gilded edges, a relic medallion and a tabard
      const steel = k.metal('steel'), gold = k.metal('gold');
      torso(k.chain());
      breastplate(steel, gold, { ridge: false });
      faulds(steel, gold);
      pauldrons(gold, { rim: steel });
      const c = surf(0, 0.1, 0.03);
      const disc = add(M(new THREE.TorusGeometry(0.075, 0.016, 10, 28), gold, { p: c.toArray() }));
      faceOut(disc, 0);
      setGem(g, k, k.gem(0xffd060, 1.1), 0.055, surf(0, 0.1, 0.04).toArray(), [Math.PI / 2, 0, 0], gold);
      for (const sx of [-1, 1]) add(pathTube([surf(sx * 0.3, 0.02, 0.035).toArray(), surf(sx * 0.2, -0.12, 0.035).toArray(), surf(sx * 0.02, -0.2, 0.035).toArray()], 0.008, gold));
      const tab = add(M(new THREE.PlaneGeometry(0.2, 0.4, 1, 6), k.cloth(0x7a1414), { p: surf(0, -0.62, 0.06).toArray() }));
      faceOut(tab, 0, 0.05);
      belt(gold, gold);
      break;
    }
    default: { // starless cuirass: void plate, a seam of violet light, a field of stars
      const voidm = k.metal('void');
      torso(voidm);
      breastplate(voidm, k.metal('iron'), { ridge: false });
      faulds(voidm, k.metal('iron'));
      pauldrons(voidm, { spikes: true });
      const rng = mulberry32(911);
      for (let i = 0; i < 26; i++) {
        const a = (rng() - 0.5) * 2.2, y = -0.24 + rng() * 0.5;
        add(M(new THREE.SphereGeometry(0.006 + rng() * 0.006, 6, 4), k.glow(0xd0b0ff, 3), { p: surf(a, y, 0.027).toArray() }));
      }
      add(vertTube(0, -0.25, 0.26, 0.03, 0.008, k.glow(0x9a60ff, 2.2)));
      belt(voidm, voidm);
    }
  }
  if (s.rarity === 'rare' && t < 4) setGem(g, k, A.gem, 0.04, surf(0, -0.295, 0.05).toArray(), [Math.PI / 2, 0, 0], k.metal('gold'));
  return g;
}

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// -------------------------------------------------------------------- gloves
function gloves(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const t = s.tier, u = s.uniqueId;
  let main = [k.cloth(0x9a8a70), k.leather(0x6a4228), k.chain(), k.leather(0x3a2a20), k.leather(0x2a2024), k.leather(0x2a1a34)][t];
  let plate = [null, null, k.metal('steel'), k.metal('steel'), k.bone(), k.metal('void')][t];
  let cuff = [k.cloth(0x7a6a50), k.leather(0x4a2a18), k.metal('steel'), k.metal('steel'), k.metal('iron'), k.metal('void')][t];
  if (u === 'metronome') { main = k.leather(0x4a3020); plate = k.metal('bronze'); cuff = k.metal('gold'); }
  if (A.trim && t >= 2) cuff = A.trim;
  g.add(M(new THREE.CylinderGeometry(0.1, 0.135, 0.22, 20, 1, true), cuff, { p: [0, -0.22, 0] }));
  g.add(M(new THREE.TorusGeometry(0.135, 0.016, 6, 24), A.trim || cuff, { p: [0, -0.33, 0], r: [Math.PI / 2, 0, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.085, 0.1, 0.1, 16), main, { p: [0, -0.08, 0] }));
  g.add(M(new THREE.CapsuleGeometry(0.075, 0.07, 4, 14), main, { p: [0, 0.02, 0], s: [1.35, 1, 0.62] }));
  if (plate) {
    const bp = new THREE.Shape();
    bp.moveTo(-0.09, -0.06); bp.lineTo(0.09, -0.06); bp.quadraticCurveTo(0.1, 0.02, 0.09, 0.08); bp.lineTo(-0.09, 0.08); bp.quadraticCurveTo(-0.1, 0.02, -0.09, -0.06);
    g.add(M(extrude(bp, 0.01, 0.012, 2), plate, { p: [0, 0.02, 0.05] }));
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.075 + i * 0.05, len = [0.07, 0.085, 0.08, 0.06][i];
    const f = new THREE.Group();
    f.position.set(x, 0.1, 0.01);
    f.rotation.set(0.15, 0, (i - 1.5) * 0.06);
    f.add(M(new THREE.CapsuleGeometry(0.022, len, 3, 10), main, { p: [0, len / 2, 0] }));
    const tip = new THREE.Group();
    tip.position.set(0, len + 0.01, 0);
    tip.rotation.x = 0.45;
    tip.add(M(new THREE.CapsuleGeometry(0.02, len * 0.8, 3, 10), main, { p: [0, len * 0.4, 0] }));
    if (plate) {
      f.add(M(new THREE.BoxGeometry(0.046, len * 0.8, 0.03), plate, { p: [0, len / 2, 0.012] }));
      tip.add(M(new THREE.BoxGeometry(0.042, len * 0.6, 0.028), plate, { p: [0, len * 0.35, 0.01] }));
    }
    if (t === 5) tip.add(M(new THREE.ConeGeometry(0.016, 0.1, 6), k.metal('void'), { p: [0, len * 0.8 + 0.05, 0.01], r: [0.3, 0, 0] }));
    f.add(tip);
    g.add(f);
  }
  const thumb = new THREE.Group();
  thumb.position.set(0.1, 0.0, 0.02);
  thumb.rotation.set(0.3, 0, -0.9);
  thumb.add(M(new THREE.CapsuleGeometry(0.024, 0.07, 3, 10), main, { p: [0, 0.04, 0] }));
  if (plate) thumb.add(M(new THREE.BoxGeometry(0.046, 0.06, 0.03), plate, { p: [0, 0.04, 0.012] }));
  g.add(thumb);
  if (t === 0) for (let i = 0; i < 4; i++) g.add(M(new THREE.TorusGeometry(0.1, 0.01, 4, 20), k.cloth(0x6a5a40), { p: [0, -0.06 + i * 0.045, 0], r: [Math.PI / 2 + 0.2, 0, 0.3], s: [1.1, 0.62, 1] }));
  if (t === 3) g.add(M(new THREE.BoxGeometry(0.2, 0.04, 0.05), k.metal('steel'), { p: [0, 0.09, 0.035] }));
  if (t === 4) for (let i = 0; i < 4; i++) g.add(M(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 8), k.bone(), { p: [-0.075 + i * 0.05, 0.095, 0.05], r: [Math.PI / 2, 0, 0] }));
  if (t === 5) g.add(M(gemGeo(0.03), k.gem(0xb070ff, 1.1), { p: [0, 0.03, 0.065], r: [Math.PI / 2, 0, 0] }));
  if (u === 'metronome') {
    g.add(M(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 6), k.metal('gold'), { p: [0, 0.0, 0.07], r: [0, 0, 0.35] }));
    g.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 16), k.metal('gold'), { p: [-0.034, -0.09, 0.07], r: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 4; i++) g.add(M(new THREE.SphereGeometry(0.014, 8, 6), k.glow(0xb9c3ff, 3), { p: [-0.07 + i * 0.047, -0.22, 0.13] }));
  } else if (s.rarity === 'rare') setGem(g, k, A.gem, 0.03, [0, -0.22, 0.13], [Math.PI / 2, 0, 0], k.metal('gold'));
  return g;
}

// --------------------------------------------------------------------- boots
function footOutline() {
  const s = new THREE.Shape();
  s.moveTo(-0.13, 0); s.quadraticCurveTo(-0.15, 0.08, -0.12, 0.1); s.lineTo(0.15, 0.115); s.quadraticCurveTo(0.3, 0.1, 0.3, 0); s.quadraticCurveTo(0.3, -0.1, 0.15, -0.105); s.lineTo(-0.12, -0.09); s.quadraticCurveTo(-0.15, -0.07, -0.13, 0);
  return s;
}
// Boot shaft (a lathe around y, slightly oval) and a sculpted foot (a lathe
// turned onto the x axis and flattened underneath). Built with +x forward.
const SHAFT = smoothProfile([[0.1, 0.06], [0.097, 0.16], [0.1, 0.3], [0.107, 0.42], [0.114, 0.52], [0.117, 0.56]], 24);
const SHAFT_X = -0.035;
const shaftWarp = (v) => { v.x = v.x * 1.1 + SHAFT_X; v.z *= 0.96; };
const shaftAt = (ang, y, out = 0) => {
  const R = radiusAt(SHAFT, y) + out;
  const v = new THREE.Vector3(Math.cos(ang) * R, y, Math.sin(ang) * R);
  shaftWarp(v);
  return v;
};
function footGeo(toe = 1) {
  const prof = smoothProfile([[0.0, -0.14], [0.07, -0.132], [0.094, -0.07], [0.1, 0.02], [0.097, 0.12], [0.087, 0.2 * toe], [0.062, 0.26 * toe], [0.024, 0.29 * toe], [0, 0.297 * toe]], 32);
  return shell(prof, {
    seg: 40,
    warp: (v) => {
      const X = v.y, Y = -v.x * 0.86, Z = v.z * 1.02;
      v.set(X, (Y < -0.045 ? -0.045 + (Y + 0.045) * 0.2 : Y) + 0.095, Z);
    },
  });
}
const shaftBand = (y0, y1, out, mat, rows = 4) => {
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    pts.push([radiusAt(SHAFT, y) + out + out * 0.6 * Math.sin((i / rows) * Math.PI), y]);
  }
  return M(shell(pts, { warp: shaftWarp, seg: 40 }), mat);
};

function boots(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const t = s.tier, u = s.uniqueId;
  const inner = new THREE.Group(); // built with +x forward, turned to +z at the end
  const add = (m) => { inner.add(m); return m; };
  const sole = k.leather(0x201510);
  let main = [k.leather(0x7a5436), k.leather(0x5a3a22), k.leather(0x4a3020), k.leather(0x4a4440), k.metal('steel'), k.metal('void')][t];
  if (u === 'emberwake') main = k.charred();
  if (t === 0) {
    add(M(extrude(footOutline(), 0.02, 0.012), sole, { r: [Math.PI / 2, 0, 0], p: [0, 0.02, 0] }));
    for (let i = 0; i < 3; i++) add(M(new THREE.TorusGeometry(0.1, 0.014, 5, 20, Math.PI), main, { p: [0.14 - i * 0.08, 0.03, 0], r: [0, Math.PI / 2, 0], s: [1, 0.55, 1] }));
    add(M(new THREE.TorusGeometry(0.075, 0.013, 5, 20), main, { p: [-0.06, 0.2, 0], r: [Math.PI / 2 - 0.2, 0, 0] }));
    for (const sz of [-1, 1]) add(M(new THREE.BoxGeometry(0.018, 0.18, 0.012), main, { p: [-0.05, 0.1, sz * 0.07], r: [sz * 0.2, 0, -0.3] }));
  } else {
    const trim = A.trim || (t === 4 ? k.metal('steel') : t === 5 ? k.metal('void') : k.leather(0x2a1a10));
    add(M(shell(SHAFT, { warp: shaftWarp, seg: 48 }), main));
    add(M(footGeo(t === 4 ? 1.12 : 1), main));
    add(M(extrude(footOutline(), 0.03, 0.01), sole, { r: [Math.PI / 2, 0, 0], p: [0, 0.018, 0], s: [1.03, 1.1, 1] }));
    add(M(new THREE.BoxGeometry(0.09, 0.05, 0.18), sole, { p: [-0.08, 0.02, 0] }));
    // turned-down cuff and the dark opening
    add(shaftBand(0.49, 0.575, 0.014, trim));
    add(M(new THREE.CircleGeometry(0.11, 24), k.inner(), { p: [SHAFT_X, 0.572, 0], r: [-Math.PI / 2, 0, 0], s: [1.1, 0.96, 1] }));
    if (t === 1) { // strapped leather boots
      for (const y of [0.22, 0.36]) {
        add(shaftBand(y, y + 0.035, 0.008, k.leather(0x2a1a10), 3));
        const b = add(M(new THREE.TorusGeometry(0.018, 0.005, 6, 12), k.metal('iron'), { p: shaftAt(Math.PI / 2, y + 0.018, 0.018).toArray() }));
        b.lookAt(shaftAt(Math.PI / 2, y + 0.018, 1));
      }
      add(M(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), k.leather(0x2a1a10), { p: [0.14, 0.14, 0], r: [0, Math.PI / 2, 0], s: [1, 0.8, 1] }));
    }
    if (t === 2 || t === 4) { // steel shin guard and knee cop
      const steel = k.metal('steel');
      add(M(shell(SHAFT.filter(([, y]) => y > 0.16 && y < 0.53).map(([r, y]) => [r + 0.018, y]), { warp: shaftWarp, seg: 24, start: Math.PI / 2 - 1.2, len: 2.4 }), steel));
      for (const y of [0.24, 0.44]) add(shaftBand(y, y + 0.03, 0.03, k.leather(0x2a1a10), 3));
      add(M(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI), steel, { p: [0.07, 0.6, 0], r: [0, Math.PI / 2, 0], s: [1, 1.1, 0.8] }));
      add(M(new THREE.SphereGeometry(0.02, 8, 6), A.trim || k.metal('iron'), { p: [0.13, 0.6, 0] }));
    }
    if (t === 3) { // ashwalkers: ash-gray leather wound with linen wraps
      const wrap = [];
      for (let i = 0; i <= 60; i++) {
        const f = i / 60;
        wrap.push(shaftAt(f * Math.PI * 2 * 4.5, 0.12 + f * 0.36, 0.006).toArray());
      }
      add(pathTube(wrap, 0.013, k.cloth(0x8a8070)));
    }
    if (t === 4) { // sabaton lames over the foot
      for (let i = 0; i < 4; i++) {
        const x = 0.02 + i * 0.06;
        add(M(new THREE.TorusGeometry(0.1 - i * 0.01, 0.009, 6, 24, Math.PI), k.metal('steel'), { p: [x, 0.07, 0], r: [0, Math.PI / 2, 0], s: [1, 1 - i * 0.12, 1.05] }));
      }
    }
    if (t === 3 || u === 'emberwake') add(M(extrude(footOutline(), 0.006, 0.004), k.glow(0xff7a2a, 2.2), { r: [Math.PI / 2, 0, 0], p: [0, 0.002, 0], s: [1.06, 1.14, 1] }));
    if (u === 'emberwake') for (let i = 0; i < 6; i++) add(M(new THREE.ConeGeometry(0.028, 0.12 + (i % 2) * 0.05, 6), k.glow(0xff9a40, 2), { p: [SHAFT_X + Math.sin(i * 1.05) * 0.1, 0.6, Math.cos(i * 1.05) * 0.1] }));
    if (t === 5) for (const sz of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(-0.08, 0.36, sz * 0.1);
      wing.rotation.set(sz * 0.25, 0, 0.9);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.SphereGeometry(0.09, 10, 6);
        f.scale(1, 0.22, 0.1);
        wing.add(M(f, k.metal('void'), { p: [0.06 + i * 0.03, -i * 0.035, 0], r: [0, 0, -i * 0.3] }));
      }
      inner.add(wing);
      add(pathTube([shaftAt(0, 0.14, 0.006).toArray(), shaftAt(0, 0.3, 0.006).toArray(), shaftAt(0, 0.46, 0.006).toArray()], 0.007, k.glow(0xb070ff, 2.5)));
    }
    if (s.rarity === 'rare') setGem(inner, k, A.gem, 0.028, shaftAt(0, 0.44, 0.02).toArray(), [0, 0, -Math.PI / 2], k.metal('gold'));
  }
  inner.rotation.y = -Math.PI / 2;
  g.add(inner);
  return g;
}

// ------------------------------------------------------------------- amulets
function amulet(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const t = s.tier, u = s.uniqueId;
  const chainMat = t === 0 ? k.leather(0x3a2616) : t === 1 ? k.metal('copper') : t >= 4 || A.trim || u ? k.metal('gold') : k.metal('silver');
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI * (0.18 + (i / 18) * 0.64);
    pts.push([Math.cos(a) * 0.22, 0.3 - Math.sin(a) * 0.3, 0]);
  }
  g.add(tube(pts, t === 0 ? 0.012 : 0.008, chainMat, 48));
  // bail: the loop that ties the pendant to the chain
  g.add(M(new THREE.TorusGeometry(0.026, 0.008, 6, 16), chainMat, { p: [0, -0.025, 0], r: [0, Math.PI / 2, 0] }));
  const P = [0, -0.13, 0];
  if (u === 'hollowstar') {
    g.add(M(extrude(star(0.13, 0.055), 0.04, 0.012), k.crystal(0xb07aff), { p: [0, -0.16, 0] }));
    g.add(M(new THREE.SphereGeometry(0.04, 14, 10), k.dark(), { p: [0, -0.16, 0.035] }));
    g.add(M(new THREE.SphereGeometry(0.016, 8, 6), k.glow(0xd0a0ff, 3), { p: [0, -0.16, 0.07] }));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(M(gemGeo(0.02), k.crystal(0xd0a0ff), { p: [Math.cos(a) * 0.2, -0.16 + Math.sin(a) * 0.2, 0.02], r: [0, 0, a] })); }
    return g;
  }
  if (u === 'greedmaw') {
    for (const sy of [1, -1]) {
      g.add(M(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), k.metal('gold'), { p: [0, -0.14 + sy * 0.022, 0], r: [sy > 0 ? -0.45 : Math.PI + 0.45, 0, 0] }));
      for (let i = 0; i < 6; i++) g.add(M(new THREE.ConeGeometry(0.01, 0.042, 5), k.bone(), { p: [-0.062 + i * 0.025, -0.14 + sy * 0.028, 0.075], r: [sy > 0 ? Math.PI : 0, 0, 0] }));
    }
    g.add(M(new THREE.CylinderGeometry(0.038, 0.038, 0.01, 20), k.metal('gold'), { p: [0, -0.14, 0.03], r: [Math.PI / 2, 0, 0] }));
    return g;
  }
  switch (t) {
    case 0:
      g.add(M(new THREE.ConeGeometry(0.035, 0.2, 10), k.bone(), { p: [0.01, -0.15, 0], r: [0, 0, Math.PI + 0.2] }));
      g.add(M(new THREE.TorusGeometry(0.03, 0.01, 6, 14), k.leather(0x3a2616), { p: [0, -0.05, 0] }));
      break;
    case 1:
      g.add(M(new THREE.CylinderGeometry(0.085, 0.085, 0.018, 28), k.metal('copper'), { p: P, r: [Math.PI / 2, 0, 0] }));
      g.add(M(new THREE.TorusGeometry(0.085, 0.01, 6, 28), k.metal('copper'), { p: P }));
      g.add(M(extrude(star(0.045, 0.02, 4), 0.006, 0.003), k.metal('copper'), { p: [0, P[1], 0.012] }));
      break;
    case 2:
      g.add(M(new THREE.TorusGeometry(0.07, 0.016, 10, 28), k.metal('silver'), { p: P }));
      g.add(M(gemGeo(0.055), s.rarity === 'rare' ? A.gem : k.gem(0x3a6aff, 0.5), { p: P, r: [Math.PI / 2, 0, 0] }));
      break;
    case 3:
      setGem(g, k, k.gem(0x120a18, 0.1), 0.06, P, [Math.PI / 2, 0, 0], k.metal('silver'));
      break;
    case 4: {
      g.add(M(lathe([[0, 0.07], [0.035, 0.065], [0.05, 0.02], [0.065, -0.05], [0.08, -0.075]], 24), k.metal('gold'), { p: [0, -0.11, 0] }));
      g.add(M(new THREE.SphereGeometry(0.018, 10, 8), k.metal('bronze'), { p: [0, -0.19, 0] }));
      break;
    }
    default:
      g.add(M(extrude(star(0.11, 0.05), 0.03, 0.01), k.metal('gold'), { p: [0, -0.16, 0] }));
      g.add(M(new THREE.SphereGeometry(0.03, 14, 10), k.glow(0xffe6a0, 2.5), { p: [0, -0.16, 0.03] }));
  }
  if (s.rarity === 'rare' && t !== 2 && t !== 3) setGem(g, k, A.gem, 0.025, [0, -0.06, 0.02], [Math.PI / 2, 0, 0], chainMat);
  return g;
}

// --------------------------------------------------------------------- rings
function ring(k, s) {
  const g = new THREE.Group();
  const A = accents(k, s);
  const t = s.tier, u = s.uniqueId;
  let band = [k.metal('iron'), k.metal('copper'), k.metal('gold'), k.metal('void'), k.metal('bronze'), k.metal('void')][t];
  if (A.trim && t < 2) band = A.trim;
  if (u === 'stormcaller') band = k.metal('silver');
  g.add(M(new THREE.TorusGeometry(0.14, 0.03, 16, 48), band));
  // shoulders that rise to meet the setting
  for (const sx of [-1, 1]) g.add(M(new THREE.CylinderGeometry(0.018, 0.03, 0.06, 10), band, { p: [sx * 0.035, 0.155, 0], r: [0, 0, sx * 0.9] }));
  if (u === 'stormcaller') {
    setGem(g, k, k.gem(0x6a9aff, 0.75), 0.055, [0, 0.19, 0], [0, 0, 0], band);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; g.add(M(new THREE.BoxGeometry(0.01, 0.08, 0.01), k.glow(0xd0e0ff, 3), { p: [Math.cos(a) * 0.075, 0.2, Math.sin(a) * 0.075], r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] })); }
    return g;
  }
  switch (t) {
    case 0: g.add(M(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), band, { p: [0, 0.172, 0] })); break;
    case 1: setGem(g, k, k.gem(0x8a5a30, 0.1), 0.035, [0, 0.18, 0], [0, 0, 0], band); break;
    case 2: setGem(g, k, k.gem(s.rarity === 'rare' ? GEMS[s.variant] : 0xc01830, 0.5), 0.05, [0, 0.185, 0], [0, 0, 0], k.metal('gold')); break;
    case 3: setGem(g, k, k.gem(0x120a18, 0.15), 0.05, [0, 0.185, 0], [0, 0, 0], band); break;
    case 4:
      g.add(M(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), band, { p: [0, 0.172, 0] }));
      g.add(M(lathe([[0, 0.045], [0.025, 0.04], [0.035, 0.0], [0.045, -0.03]], 16), k.metal('gold'), { p: [0, -0.2, 0] }));
      break;
    default:
      g.add(M(new THREE.TorusGeometry(0.14, 0.008, 6, 48), k.glow(0xb070ff, 2.4), { p: [0, 0, 0.026] }));
      g.add(M(new THREE.TorusGeometry(0.14, 0.008, 6, 48), k.glow(0xb070ff, 2.4), { p: [0, 0, -0.026] }));
  }
  if ((s.rarity === 'rare' || s.rarity === 'magic') && (t === 0 || t === 4 || t === 5)) setGem(g, k, A.gem, 0.035, [0, 0.19, 0], [0, 0, 0], band);
  return g;
}

const BUILDERS = { weapon, helm, chest, gloves, boots, amulet, ring };

export function buildItemModel(item, kit) {
  return BUILDERS[item.slot](kit, itemSpec(item));
}

// Collapse a model into one mesh per material (few draw calls for ground drops and gear).
export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((m) => {
    if (!m.isMesh) return;
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = true;
    out.add(mesh);
  }
  return out;
}

export function disposeModel(g) {
  g.traverse((m) => m.isMesh && m.geometry.dispose());
}
