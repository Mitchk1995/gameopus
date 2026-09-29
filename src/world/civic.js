import * as THREE from 'three';
import { fitUV } from './props.js';
import { grainUV } from './landmarks.js';
import { sweep, roofSection, gableGeometry, bargeGeometry } from './roofs.js';
import { signMaterial, flatNormal } from './looks.js';
import { enhance } from '../engine/detail.js';

// Ashford's buildings that are not houses, and the trades' dressing on the ones that are:
//   the chapel on its rise (nave, chancel, a west tower with a belfry, bell and spire), its
//   churchyard (wall, lych-gate, graves in the grass), the barn, and the hanging signs, toll board
//   and bell that say what a building is for.
// Everything is drawn in a local frame (origin, yaw: +z the front) through the TownKit, so it is
// batched with the town, grouped for the geometry audit, and world-scale textured.

const TILE = { MI_WoodTrim: 2.2, MI_UnevenBrick: 2.1, MI_Brick: 2.2, MI_RedBrick: 2.0, MI_Plaster: 2.2 };
const Y = new THREE.Vector3(0, 1, 0);

// A local frame: origin (x, y, z) and yaw, and a way to put geometry in it.
export function framer(env, x, y, z, yaw = 0) {
  const { tk } = env;
  const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(1, 1, 1));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const f = {
    x, y, z, yaw,
    at: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c],
    M: (lx, ly, lz, rot = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, rot, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)),
    put(geo, mat, local) {
      let g = geo;
      const tile = TILE[mat.name];
      if (tile && !g.userData.wuv) g = Object.assign(fitUV(g, tile), { userData: { wuv: true } });
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.multiplyMatrices(base, local);
      tk.batch.addObject(mesh, new THREE.Matrix4(), tk.cur);
    },
    begin(label, lx, lz, on = true) {
      const [wx, wz] = f.at(lx, lz);
      tk.begin(label, wx, wz, false, on);
    },
    // A solid box collider in the frame (local centre, half sizes, local rotation), heights above y.
    solid(lx, lz, hx, hz, y0, y1, { rot = 0, floor = false } = {}) {
      const [wx, wz] = f.at(lx, lz);
      const sh = tk.colliders.addBox(wx, wz, hx, hz, yaw + rot, y + y0, y + y1);
      if (floor) sh.floor = true;
      return sh;
    },
    post(lx, lz, r, y0, y1) {
      const [wx, wz] = f.at(lx, lz);
      return tk.colliders.addCircle(wx, wz, r, y + y0, y + y1);
    },
  };
  return f;
}

// A timber box with its grain along `along`.
const timber = (L, sx, sy, sz, along, tone = 'oak') => {
  const m = L.timber(tone);
  return [grainUV(new THREE.BoxGeometry(sx, sy, sz), along, m.userData.grain || [2.2, 0.645]), m];
};

// An opening outline in a wall's elevation (x along the wall, y up): 'round' arch or 'flat' head.
function hole(x, w, sill, spring, kind = 'round', segs = 8) {
  const a = w / 2, pts = [new THREE.Vector2(x - a, sill), new THREE.Vector2(x + a, sill), new THREE.Vector2(x + a, spring)];
  if (kind === 'round') for (let i = 1; i < segs; i++) { const t = (Math.PI * i) / segs; pts.push(new THREE.Vector2(x + a * Math.cos(t), spring + a * Math.sin(t))); }
  pts.push(new THREE.Vector2(x - a, spring));
  return new THREE.Path(pts);
}

// A wall of masonry in a frame: from x0 to x1 along local x at depth z (its outer face at z, running
// back t), from y 0 to the top line `top` ([[x, h], ...] or a height), with openings cut through.
function masonry(f, mat, { x0, x1, z = 0, t, top, holes = [], rot = 0 }) {
  const pts = typeof top === 'number' ? [[x1, top], [x0, top]] : top.slice().sort((a, b) => b[0] - a[0]);
  const shape = new THREE.Shape([new THREE.Vector2(x0, 0), new THREE.Vector2(x1, 0), ...pts.map(([x, h]) => new THREE.Vector2(x, h))]);
  for (const h of holes) shape.holes.push(h);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -t);
  return { geo, place: (lx, ly, lz) => f.put(geo, mat, f.M(lx, ly, lz, rot)) };
}

// A lathe-turned bronze bell, mouth down, 2r across.
function bellGeometry(r) {
  const prof = [[0.02, 1.0], [0.3, 0.98], [0.45, 0.9], [0.5, 0.7], [0.56, 0.4], [0.72, 0.15], [0.95, 0.02], [1.0, 0], [0.92, 0.0], [0.7, 0.12], [0.5, 0.38], [0.44, 0.7], [0.38, 0.9], [0.02, 0.94]];
  return new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a * r, b * r * 1.25)), 18);
}

// ------------------------------------------------------------------ the chapel
// A small stone parish chapel on the rise, laid out east and west as churches are: a tower at the
// west end (belfry louvres, a bell you can see, a pyramid spire of stone slate and an iron cross), the
// nave with tall round-headed lights and buttresses, the south door under two arch rings, and a
// lower chancel at the east end with a stepped triple light. `nave`/`tower` are the plan's rows.
export function chapel(env, nave, tower, base) {
  const { tk, looks: L } = env;
  const stone = L.stone('grey'), dressed = L.dressed('grey'), slate = L.roof('slate-dark');
  const R = slate.userData.roofing;
  const f = framer(env, 0, base, 0, 0); // world-aligned frame at the plateau's height
  const out = { parts: [], lancets: 0, belfry: 0, bell: null };
  const n = { x0: nave.x - nave.w / 2, x1: nave.x + nave.w / 2, z0: nave.z - nave.d / 2, z1: nave.z + nave.d / 2 };
  const T = 0.7, WALL = 5.2, PITCH = (52 * Math.PI) / 180;
  const zc = nave.z, half = nave.d / 2;
  const lancet = (x, sill = 1.9, w = 0.5, spring = 3.4) => hole(x, w, sill, spring, 'round', 8);
  // --- nave walls (south face at z1, north face at z0), each running between the gable walls
  const door = nave.doors?.[0] ? { x: n.x0 + 1 + nave.doors[0].at * 2, w: 1.5, spring: 2.25 } : null;
  const southHoles = [lancet(n.x0 + 3.9), lancet(n.x0 + 5.8)];
  if (door) southHoles.push(hole(door.x, door.w, 0, door.spring, 'round', 10));
  f.begin('chapel nave', nave.x, n.z1);
  masonry(f, stone, { x0: n.x0 + T, x1: n.x1 - T, t: T, top: WALL, holes: southHoles }).place(0, 0, n.z1);
  masonry(f, stone, { x0: -(n.x1 - T), x1: -(n.x0 + T), t: T, top: WALL, holes: [lancet(-(n.x0 + 2)), lancet(-(n.x0 + 3.9)), lancet(-(n.x0 + 5.8))], rot: Math.PI }).place(0, 0, n.z0);
  out.lancets += 5;
  // Gable walls: the west one behind the tower, the east one over the chancel arch.
  const rise = half * Math.tan(PITCH);
  const gableTop = [[-half, WALL], [0, WALL + rise], [half, WALL]];
  masonry(f, stone, { x0: -half, x1: half, t: T, top: gableTop, rot: -Math.PI / 2 }).place(n.x0, 0, zc);
  masonry(f, stone, { x0: -half, x1: half, t: T, top: gableTop, holes: [hole(0, 0.45, WALL + 0.4, WALL + 1.2, 'round', 6)], rot: Math.PI / 2 }).place(n.x1, 0, zc);
  // Glass in the lights, set deep in the wall.
  const glassPane = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.5, p.getY(i) / 0.5);
    return g;
  };
  for (const x of [n.x0 + 3.9, n.x0 + 5.8]) f.put(glassPane(0.5, 1.8), L.glassSquare, f.M(x, 2.55, n.z1 - T * 0.6));
  for (const x of [n.x0 + 2, n.x0 + 3.9, n.x0 + 5.8]) f.put(glassPane(0.5, 1.8), L.glassSquare, f.M(x, 2.55, n.z0 + T * 0.6, Math.PI));
  // Buttresses: two-stage, against the long walls between the lights and at the east corners.
  const buttress = (x, zFace, dir) => {
    f.begin('chapel buttress', x, zFace + dir * 0.45);
    f.put(new THREE.BoxGeometry(0.6, 3.2, 0.8).translate(0, 1.6 - 0.3, 0), stone, f.M(x, 0, zFace + dir * 0.4));
    f.put(new THREE.BoxGeometry(0.5, 1.8, 0.5).translate(0, 0.9, 0), stone, f.M(x, 2.9, zFace + dir * 0.25));
    const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 0.55)]);
    f.put(new THREE.ExtrudeGeometry(wedge, { depth: 0.5, bevelEnabled: false }).translate(0, 0, -0.25), dressed, f.M(x, 4.7, zFace, dir > 0 ? -Math.PI / 2 : Math.PI / 2));
    f.solid(x, zFace + dir * 0.4, 0.3, 0.4, -0.5, 4.8);
  };
  for (const x of [n.x0 + 2.95, n.x0 + 4.85]) { buttress(x, n.z1, 1); buttress(x, n.z0, -1); }
  // A string course under the eaves, and the roof: stone slates from the tower's face to past the east gable.
  f.begin('chapel nave', nave.x, n.z1);
  for (const [z, r] of [[n.z1 + 0.06, 0], [n.z0 - 0.06, Math.PI]]) f.put(new THREE.BoxGeometry(nave.w, 0.16, 0.14), dressed, f.M(nave.x, WALL - 0.3, z, r));
  const sec = roofSection({ H: half, y0: WALL + 0.02, pitch: PITCH, over: 0.35, t: 0.14, kind: 'band' });
  const E = half + 0.35, slope = E / Math.cos(PITCH);
  const roofL = nave.w + 0.3;
  const roofGeo = sweep(sec.outline, roofL, { tu: R.tu, vOf: (a) => ((E - Math.abs(a)) / E) * slope / R.tv, capTile: R.tu });
  f.begin('roof', nave.x, zc);
  f.put(roofGeo, slate, f.M(nave.x + 0.15, 0, zc, Math.PI / 2));
  // The ridge: a stone capping.
  const ridgeProf = [[-0.16, sec.ridge - 0.12], [0, sec.ridge + 0.08], [0.16, sec.ridge - 0.12]];
  f.put(sweep(ridgeProf, roofL + 0.04, { tu: R.tu, tv: R.tv, capTile: R.tu }), slate, f.M(nave.x + 0.15, 0, zc, Math.PI / 2));
  // A stone cross on the east gable.
  f.begin('chapel cross', n.x1 + 0.2, zc);
  f.put(new THREE.BoxGeometry(0.16, 1.0, 0.16).translate(0, 0.5, 0), dressed, f.M(n.x1 - T / 2, WALL + rise - 0.05, zc));
  f.put(new THREE.BoxGeometry(0.16, 0.16, 0.6), dressed, f.M(n.x1 - T / 2, WALL + rise + 0.62, zc));
  // --- the south door: two arch rings round a pair of oak doors, shut.
  if (door) {
    f.begin('chapel door', door.x, n.z1);
    const ring = (w0, w1, spring, depth, z) => {
      const s = new THREE.Shape();
      s.moveTo(-w1 / 2, 0); s.lineTo(-w1 / 2, spring); s.absarc(0, spring, w1 / 2, Math.PI, 0, true); s.lineTo(w1 / 2, 0); s.lineTo(w0 / 2, 0); s.lineTo(w0 / 2, spring); s.absarc(0, spring, w0 / 2, 0, Math.PI, false); s.lineTo(-w0 / 2, 0);
      f.put(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -depth), dressed, f.M(door.x, 0, z));
    };
    ring(door.w, door.w + 0.36, door.spring, 0.3, n.z1 + 0.12);
    ring(door.w + 0.36, door.w + 0.66, door.spring, 0.14, n.z1 + 0.16);
    const leaves = new THREE.Shape();
    leaves.moveTo(-door.w / 2, 0); leaves.lineTo(door.w / 2, 0); leaves.lineTo(door.w / 2, door.spring); leaves.absarc(0, door.spring, door.w / 2, 0, Math.PI, false); leaves.lineTo(-door.w / 2, 0);
    const [lg, lm] = [grainUV(new THREE.ExtrudeGeometry(leaves, { depth: 0.08, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -0.04), 'y', L.timber('oak').userData.grain || [2.2, 0.645]), L.timber('oak')];
    f.put(lg, lm, f.M(door.x, 0.01, n.z1 - T * 0.55));
    // The meeting stiles, strap hinges and ring handles.
    f.put(new THREE.BoxGeometry(0.05, door.spring + door.w / 2 - 0.05, 0.1), lm, f.M(door.x, (door.spring + door.w / 2) / 2, n.z1 - T * 0.55));
    for (const y of [0.5, 1.6]) for (const k of [-1, 1]) f.put(new THREE.BoxGeometry(0.6, 0.06, 0.03), L.iron, f.M(door.x + k * (door.w / 2 - 0.33), y, n.z1 - T * 0.55 + 0.055));
    for (const k of [-1, 1]) f.put(new THREE.TorusGeometry(0.07, 0.012, 6, 12), L.iron, f.M(door.x + k * 0.16, 1.05, n.z1 - T * 0.55 + 0.07));
    out.door = { x: door.x, z: n.z1 };
  }
  // Colliders: the nave is shut; a box per wall.
  f.solid(nave.x, n.z1 - T / 2, nave.w / 2, T / 2, -0.6, WALL);
  f.solid(nave.x, n.z0 + T / 2, nave.w / 2, T / 2, -0.6, WALL);
  f.solid(n.x0 + T / 2, zc, T / 2, half, -0.6, WALL + rise * 0.5);
  f.solid(n.x1 - T / 2, zc, T / 2, half, -0.6, WALL + rise * 0.5);
  const roofSlab = f.solid(nave.x, zc, nave.w / 2 + 0.3, half + 0.4, WALL - 0.1, WALL + rise + 1);
  roofSlab.cameraOnly = true;
  // --- the chancel: lower and narrower, east of the nave, with a triple light in its east wall.
  const cw = 2.2, cx0 = n.x1, cx1 = n.x1 + 3.1, CW = 4.2;
  f.begin('chapel chancel', (cx0 + cx1) / 2, zc);
  masonry(f, stone, { x0: cx0, x1: cx1 - 0.6, t: 0.6, top: CW, holes: [lancet(cx0 + 1.6, 1.8, 0.45, 3.0)] }).place(0, 0, zc + cw);
  masonry(f, stone, { x0: -(cx1 - 0.6), x1: -cx0, t: 0.6, top: CW, holes: [lancet(-(cx0 + 1.6), 1.8, 0.45, 3.0)], rot: Math.PI }).place(0, 0, zc - cw);
  const crise = cw * Math.tan(PITCH);
  masonry(f, stone, { x0: -cw, x1: cw, t: 0.6, top: [[-cw, CW], [0, CW + crise], [cw, CW]], holes: [lancet(-0.62, 1.7, 0.36, 3.0), lancet(0, 1.5, 0.4, 3.5), lancet(0.62, 1.7, 0.36, 3.0)], rot: Math.PI / 2 }).place(cx1, 0, zc);
  out.lancets += 5;
  f.put(glassPane(0.45, 1.3), L.glassSquare, f.M(cx0 + 1.6, 2.4, zc + cw - 0.35));
  f.put(glassPane(0.45, 1.3), L.glassSquare, f.M(cx0 + 1.6, 2.4, zc - cw + 0.35, Math.PI));
  for (const [dz, h, sill] of [[-0.62, 1.4, 1.7], [0, 2.1, 1.5], [0.62, 1.4, 1.7]]) f.put(glassPane(0.36, h), L.glassSquare, f.M(cx1 - 0.35, sill + h / 2, zc + dz, Math.PI / 2));
  const csec = roofSection({ H: cw, y0: CW + 0.02, pitch: PITCH, over: 0.3, t: 0.13, kind: 'band' });
  const cE = cw + 0.3, cslope = cE / Math.cos(PITCH);
  f.begin('roof', (cx0 + cx1) / 2, zc);
  f.put(sweep(csec.outline, cx1 - cx0 + 0.25, { tu: R.tu, vOf: (a) => ((cE - Math.abs(a)) / cE) * cslope / R.tv, capTile: R.tu }), slate, f.M((cx0 + cx1) / 2 + 0.12, 0, zc, Math.PI / 2));
  f.solid((cx0 + cx1) / 2, zc + cw - 0.3, (cx1 - cx0) / 2, 0.3, -0.6, CW);
  f.solid((cx0 + cx1) / 2, zc - cw + 0.3, (cx1 - cx0) / 2, 0.3, -0.6, CW);
  f.solid(cx1 - 0.3, zc, 0.3, cw, -0.6, CW + crise * 0.5);
  // --- the tower, at the west end
  const tw = tower.w / 2, tx = tower.x, TT = 0.8, TH = 12.4;
  const tf = { x0: tx - tw, x1: tx + tw, z0: tower.z - tw, z1: tower.z + tw };
  const belfry = (k) => hole(0, 0.9, 9.2, 10.5, 'round', 8);
  f.begin('chapel tower', tx, tf.z1);
  // East and west walls span the full width; north and south walls fit between them.
  const wallsNS = [[tf.z1, 0], [tf.z0, Math.PI]];
  for (const [z, r] of wallsNS) masonry(f, stone, { x0: -(tw - TT), x1: tw - TT, t: TT, top: TH, holes: [belfry(), hole(0, 0.3, 5.4, 6.6, 'round', 6)], rot: r }).place(tx, 0, z);
  masonry(f, stone, { x0: -tw, x1: tw, t: TT, top: TH, holes: [belfry(), hole(0, 0.45, 2.2, 4.0, 'round', 6)], rot: -Math.PI / 2 }).place(tf.x0, 0, tower.z);
  masonry(f, stone, { x0: -tw, x1: tw, t: TT, top: TH, holes: [belfry()], rot: Math.PI / 2 }).place(tf.x1, 0, tower.z);
  out.belfry = 4;
  // String courses dividing the stages, and a plain parapet band at the top.
  for (const y of [4.6, 8.8, TH - 0.2]) {
    f.put(new THREE.BoxGeometry(tower.w + 0.16, 0.18, tower.w + 0.16), dressed, f.M(tx, y, tower.z));
  }
  // Louvres in the belfry openings: slanted boards with gaps, the bell showing between them.
  for (const [x, z, r] of [[tx, tf.z1 - TT / 2, 0], [tx, tf.z0 + TT / 2, Math.PI], [tf.x0 + TT / 2, tower.z, -Math.PI / 2], [tf.x1 - TT / 2, tower.z, Math.PI / 2]]) {
    for (let i = 0; i < 4; i++) {
      const [bg, bm] = timber(L, 0.9, 0.05, 0.28, 'x', 'oak');
      f.put(bg, bm, f.M(x, 9.45 + i * 0.3, z, r, -0.6));
    }
  }
  // The bell on its headstock, and the beam across the tower that carries it.
  f.begin('chapel bell', tx, tower.z);
  const [bg, bm] = timber(L, tower.w - TT * 2, 0.2, 0.22, 'x', 'oak');
  f.put(bg, bm, f.M(tx, 10.7, tower.z));
  const bronze = (L.bronze ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x8a6a36, metalness: 0.75, roughness: 0.4 }), { name: 'Bronze' }));
  f.put(bellGeometry(0.42), bronze, f.M(tx, 10.6 - 0.525, tower.z));
  out.bell = f.at(tx, tower.z);
  // A floor at the belfry, so the bell hangs in a room and not over a shaft.
  const [fg, fm] = timber(L, tower.w - TT * 2, 0.1, tower.w - TT * 2, 'x', 'oak');
  f.put(fg, fm, f.M(tx, 8.9, tower.z));
  // Angle buttresses at the west corners.
  for (const k of [-1, 1]) {
    f.begin('chapel buttress', tf.x0 - 0.35, tower.z + k * (tw - 0.3));
    f.put(new THREE.BoxGeometry(0.7, 4.2, 0.6).translate(0, 2.1 - 0.3, 0), stone, f.M(tf.x0 - 0.35, 0, tower.z + k * (tw - 0.3)));
    f.put(new THREE.BoxGeometry(0.5, 2.4, 0.5).translate(0, 1.2, 0), stone, f.M(tf.x0 - 0.25, 3.9, tower.z + k * (tw - 0.3)));
    f.solid(tf.x0 - 0.35, tower.z + k * (tw - 0.3), 0.35, 0.3, -0.5, 6.3);
  }
  // The spire: a pyramid of stone slates, an iron cross on the top.
  f.begin('roof', tx, tower.z);
  const SP = 4.2;
  // Slates at their own size on each face (projected along the face's own normal).
  const pyr = fitUV(new THREE.ConeGeometry((tw + 0.2) * Math.SQRT2, SP, 4, 1, false).rotateY(Math.PI / 4), R.tu);
  f.put(pyr, slate, f.M(tx, TH + SP / 2 - 0.05, tower.z));
  f.put(new THREE.BoxGeometry(tower.w + 0.1, 0.12, tower.w + 0.1), dressed, f.M(tx, TH - 0.1, tower.z));
  f.begin('chapel cross', tx, tower.z);
  f.put(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6).translate(0, 0.65, 0), L.iron, f.M(tx, TH + SP - 0.15, tower.z));
  f.put(new THREE.BoxGeometry(0.5, 0.05, 0.05), L.iron, f.M(tx, TH + SP + 0.8, tower.z));
  f.solid(tx, tf.z1 - TT / 2, tw, TT / 2, -0.6, TH);
  f.solid(tx, tf.z0 + TT / 2, tw, TT / 2, -0.6, TH);
  f.solid(tf.x0 + TT / 2, tower.z, TT / 2, tw, -0.6, TH);
  f.solid(tf.x1 - TT / 2, tower.z, TT / 2, tw, -0.6, TH);
  const spireSlab = f.solid(tx, tower.z, tw + 0.2, tw + 0.2, TH, TH + SP);
  spireSlab.cameraOnly = true;
  out.top = base + TH + SP;
  out.nave = n;
  return out;
}

// ------------------------------------------------------------------ churchyard
// The lych-gate: two oak frames with arch braces on low stone sleeper walls either side of the path,
// under a steep stone-slate roof whose gables face along the path, with carved bargeboards.
export function lychGate(env, x, z, yaw, y) {
  const { looks: L } = env;
  const f = framer(env, x, y, z, yaw);
  const stone = L.stone('grey'), dressed = L.dressed('grey'), slate = L.roof('slate');
  const R = slate.userData.roofing;
  const HW = 1.3, HD = 0.85, SLEEP = 0.55, POST = 1.75, PITCH = (55 * Math.PI) / 180;
  f.begin('lych-gate', 0, 0, false);
  // Sleeper walls with a coping.
  for (const k of [-1, 1]) {
    f.put(new THREE.BoxGeometry(0.4, SLEEP + 0.3, HD * 2 + 0.3).translate(0, (SLEEP + 0.3) / 2 - 0.3, 0), stone, f.M(k * HW, 0, 0));
    f.put(new THREE.BoxGeometry(0.5, 0.08, HD * 2 + 0.4), dressed, f.M(k * HW, SLEEP + 0.04, 0));
    f.solid(k * HW, 0, 0.22, HD + 0.2, -0.5, SLEEP + 0.08, { floor: true });
  }
  const tim = (sx, sy, sz, along) => timber(L, sx, sy, sz, along, 'oak');
  const top = SLEEP + 0.08 + POST;
  for (const k of [-1, 1]) for (const s of [-1, 1]) {
    const [g, m] = tim(0.2, POST, 0.2, 'y');
    f.put(g, m, f.M(k * HW, SLEEP + 0.08 + POST / 2, s * HD));
    f.post(k * HW, s * HD, 0.14, SLEEP, top);
  }
  // Wall plates along the sides, tie beams across each end with arch braces under them.
  for (const k of [-1, 1]) { const [g, m] = tim(0.2, 0.2, HD * 2 + 0.5, 'z'); f.put(g, m, f.M(k * HW, top + 0.1, 0)); }
  for (const s of [-1, 1]) {
    const [g, m] = tim(HW * 2 + 0.2, 0.22, 0.2, 'x');
    f.put(g, m, f.M(0, top - 0.11, s * HD));
    for (const k of [-1, 1]) {
      const brace = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, -0.12), new THREE.Vector2(0.12, -0.12)]);
      brace.quadraticCurveTo(0.2, -0.62, 0.62, -0.62);
      brace.lineTo(0.62, -0.72);
      brace.quadraticCurveTo(0.1, -0.72, 0, -0.12);
      brace.lineTo(0, 0);
      const bgeo = grainUV(new THREE.ExtrudeGeometry(brace, { depth: 0.12, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.06), 'y', L.timber('oak').userData.grain || [2.2, 0.645]);
      f.put(bgeo, L.timber('oak'), f.M(k * (HW - 0.1), top - 0.22, s * HD, k > 0 ? Math.PI : 0));
    }
  }
  // The roof: its ridge along the path, gables over the way in and out.
  const sec = roofSection({ H: HW + 0.1, y0: top + 0.2, pitch: PITCH, over: 0.3, t: 0.12, kind: 'band' });
  const E = HW + 0.4, slope = E / Math.cos(PITCH), L2 = HD * 2 + 0.9;
  f.put(sweep(sec.outline, L2, { tu: R.tu, vOf: (a) => ((E - Math.abs(a)) / E) * slope / R.tv, capTile: R.tu }), slate, f.M(0, 0, 0));
  f.put(sweep([[-0.12, sec.ridge - 0.1], [0, sec.ridge + 0.07], [0.12, sec.ridge - 0.1]], L2 + 0.04, { tu: R.tu, tv: R.tv, capTile: R.tu }), slate, f.M(0, 0, 0));
  const rise = (HW + 0.1) * Math.tan(PITCH);
  for (const s of [-1, 1]) {
    f.put(gableGeometry(HW + 0.08, rise - 0.03, 0.06), L.plaster('white'), f.M(0, top + 0.2, s * (HD + 0.08), s > 0 ? 0 : Math.PI));
    const [kg, km] = tim(0.14, rise - 0.1, 0.1, 'y');
    f.put(kg, km, f.M(0, top + 0.2 + (rise - 0.1) / 2, s * (HD + 0.12)));
    const barge = grainUV(bargeGeometry(E / Math.cos(PITCH), 0.24, 0.05), 'x', L.timber('oak').userData.grain || [2.2, 0.645]);
    for (const k of [-1, 1]) {
      const X = new THREE.Vector3(-k * Math.cos(PITCH), Math.sin(PITCH), 0), Yv = new THREE.Vector3(k * Math.sin(PITCH), Math.cos(PITCH), 0);
      const m = new THREE.Matrix4().makeBasis(X, Yv, new THREE.Vector3().crossVectors(X, Yv)).setPosition(k * E, sec.under(k * E), s * (L2 / 2 - 0.04));
      f.put(barge, L.timber('oak'), m);
    }
  }
  const slab = f.solid(0, 0, HW + 0.4, HD + 0.45, top, top + rise + 0.6);
  slab.cameraOnly = true;
  return { x, z, width: HW * 2 - 0.4 };
}

// A gravestone in the grass: 'round' or 'shoulder' headstones, a 'cross', or a 'table' tomb.
export function grave(env, x, y, z, yaw, kind, rnd) {
  const { looks: L } = env;
  const f = framer(env, x, y, z, yaw);
  const mat = rnd() < 0.5 ? L.dressed('grey') : (L.moss ??= (() => { const m = L.dressed('grey').clone(); m.color.multiply(new THREE.Color(0.82, 0.9, 0.74)); return m; })());
  const lean = (rnd() - 0.5) * 0.14, roll = (rnd() - 0.5) * 0.08;
  f.begin('grave', 0, 0);
  if (kind === 'table') {
    f.put(new THREE.BoxGeometry(0.9, 0.7, 1.9).translate(0, 0.35 - 0.1, 0), mat, f.M(0, 0, 0));
    f.put(new THREE.BoxGeometry(1.05, 0.1, 2.05), mat, f.M(0, 0.6, 0));
    f.solid(0, 0, 0.53, 1.03, -0.3, 0.7, { floor: true });
    return;
  }
  if (kind === 'cross') {
    f.put(new THREE.BoxGeometry(0.5, 0.2, 0.4).translate(0, 0.1 - 0.12, 0), mat, f.M(0, 0, 0));
    f.put(new THREE.BoxGeometry(0.16, 1.25, 0.14).translate(0, 0.62, 0), mat, f.M(0, 0.06, 0, 0, lean * 0.4, roll * 0.4));
    f.put(new THREE.BoxGeometry(0.6, 0.15, 0.13), mat, f.M(0, 0.95, 0, 0, lean * 0.4, roll * 0.4));
    f.solid(0, 0, 0.26, 0.22, -0.3, 1.35);
    return;
  }
  const tall = 0.7 + rnd() * 0.35, w = 0.46 + rnd() * 0.12;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -0.2);
  s.lineTo(w / 2, -0.2);
  if (kind === 'shoulder') {
    s.lineTo(w / 2, tall - 0.12);
    s.quadraticCurveTo(w / 2, tall - 0.02, w / 2 - 0.1, tall - 0.02);
    s.quadraticCurveTo(0, tall + 0.08, -w / 2 + 0.1, tall - 0.02);
    s.quadraticCurveTo(-w / 2, tall - 0.02, -w / 2, tall - 0.12);
  } else {
    s.lineTo(w / 2, tall - w / 2);
    s.absarc(0, tall - w / 2, w / 2, 0, Math.PI, false);
  }
  s.lineTo(-w / 2, -0.2);
  f.put(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -0.06), mat, f.M(0, 0, 0, 0, lean, roll));
  f.solid(0, 0, w / 2 + 0.02, 0.1, -0.3, tall);
}

// ------------------------------------------------------------------ signs
// A hanging trade sign: a painted board under an iron bracket that stands out from a wall at `y`,
// the board edge-on to the wall so it reads from up and down the street. (x, z) is the foot of the
// wall under the bracket, yaw the way the wall faces.
export function hangingSign(env, x, y, z, yaw, text, icon, { reach = 1.1, w = 0.8, h = 0.62, colors } = {}) {
  const { looks: L } = env;
  const f = framer(env, x, y, z, yaw);
  const mat = signMaterial(L, text, icon, colors);
  f.begin('sign', 0, reach);
  // Bracket: a wall plate, the arm and a scrolled stay under it.
  f.put(new THREE.BoxGeometry(0.1, 0.5, 0.04), L.iron, f.M(0, -0.1, 0.02));
  f.put(new THREE.BoxGeometry(0.04, 0.05, reach + 0.1).translate(0, 0, (reach + 0.1) / 2), L.iron, f.M(0, 0.12, 0));
  const stay = Math.hypot(reach * 0.55, 0.32);
  f.put(new THREE.BoxGeometry(0.03, stay, 0.03).translate(0, stay / 2, 0), L.iron, f.M(0, -0.2, 0.02, 0, Math.atan2(reach * 0.55, 0.32)));
  const ring = new THREE.TorusGeometry(0.1, 0.012, 6, 14);
  f.put(ring, L.iron, f.M(0, 0.02, reach * 0.32, Math.PI / 2));
  // The board hangs on two rings from the arm, its faces along the street.
  const cz = reach * 0.62;
  for (const k of [-1, 1]) f.put(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 5).translate(0, -0.07, 0), L.iron, f.M(0, 0.12, cz + k * (w / 2 - 0.08)));
  const board = new THREE.BoxGeometry(0.05, h, w);
  // Paint on both faces (x faces), timber on the edges.
  const face = new THREE.PlaneGeometry(w, h);
  const [edge, em] = timber(L, 0.06, h + 0.06, w + 0.06, 'z', 'oak');
  f.put(edge, em, f.M(0, 0.02 - h / 2 - 0.05, cz));
  f.put(face, mat, f.M(0.031, 0.05 - h / 2 - 0.05, cz, Math.PI / 2));
  f.put(face, mat, f.M(-0.031, 0.05 - h / 2 - 0.05, cz, -Math.PI / 2));
  void board;
  return { bottom: y - h - 0.03, x: f.at(0, cz)[0], z: f.at(0, cz)[1] };
}

// A shop window opened for trade: the lower shutter let down as a stall board on iron stays (the
// counter, with goods on it) and the upper one propped up as a canopy. In a wall piece's frame
// (opening x +-0.6, y 1.06..2.3, the wall's face at z = 0); returns the counter top and extent.
export function shopWindow(env, wallMatrix, rnd) {
  const { tk, looks: L, kit } = env;
  const f = { put: (geo, mat, local) => { const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.multiplyMatrices(wallMatrix, local); tk.batch.addObject(mesh, new THREE.Matrix4(), tk.cur); } };
  const M = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));
  const [board, bm] = timber(L, 1.36, 0.06, 0.62, 'x', 'oak');
  f.put(board, bm, M(0, 0.95, 0.3));
  for (const k of [-1, 1]) f.put(new THREE.BoxGeometry(0.03, 0.03, Math.hypot(0.5, 0.55)), L.iron, M(k * 0.6, 1.22, 0.27, -0.83));
  // The canopy, propped out and up above the opening.
  const [cano, cm] = timber(L, 1.4, 0.05, 0.8, 'x', 'oak');
  f.put(cano, cm, M(0, 2.5, 0.34, -0.36));
  for (const k of [-1, 1]) f.put(new THREE.BoxGeometry(0.035, 0.66, 0.035), cm, M(k * 0.62, 2.08, 0.62, 0.55));
  // Dark inside the opening, so the counter reads as a shop and not a hole through the house.
  L.shade ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 }), { name: 'Shade' });
  f.put(new THREE.PlaneGeometry(1.2, 1.24), L.shade, M(0, 1.68, -0.3));
  return { top: 0.98, x0: -0.62, x1: 0.62, z: 0.3 };
}

// A carriage arch over the way into a yard: oak posts on stone pads, a tie beam with arch braces,
// a small tiled roof, and the yard's name painted on a board along the beam.
export function yardArch(env, x, z, yaw, y, width, text) {
  const { looks: L } = env;
  const f = framer(env, x, y, z, yaw);
  const tile = L.roof('tile-brown'), R = tile.userData.roofing;
  const hw = width / 2, H = 3.3;
  f.begin('yard arch', 0, 0, false);
  for (const k of [-1, 1]) {
    f.put(new THREE.BoxGeometry(0.45, 0.4, 0.45).translate(0, 0.1, 0), L.dressed('grey'), f.M(k * hw, 0, 0));
    const [pg, pm] = timber(L, 0.28, H - 0.3, 0.28, 'y', 'black');
    f.put(pg, pm, f.M(k * hw, 0.3 + (H - 0.3) / 2, 0));
    f.post(k * hw, 0, 0.2, -0.5, H);
    const [bg, bm] = timber(L, 0.12, Math.hypot(0.8, 0.8), 0.14, 'y', 'black');
    f.put(bg, bm, f.M(k * (hw - 0.4), H - 0.4, 0, 0, 0, k * Math.PI / 4));
  }
  const [tg, tm] = timber(L, width + 0.5, 0.3, 0.3, 'x', 'black');
  f.put(tg, tm, f.M(0, H + 0.15, 0));
  const sec = roofSection({ H: 0.55, y0: H + 0.3, pitch: (45 * Math.PI) / 180, over: 0.15, t: 0.1, kind: 'band' });
  const E = 0.7, slope = E / Math.cos(Math.PI / 4);
  f.put(sweep(sec.outline, width + 0.9, { tu: R.tu, vOf: (a) => ((E - Math.abs(a)) / E) * slope / R.tv, capTile: R.tu }), tile, f.M(0, 0, 0, Math.PI / 2));
  f.put(gableGeometry(0.53, 0.53, 0.04), L.plaster('white'), f.M(hw + 0.3, H + 0.3, 0, Math.PI / 2));
  f.put(gableGeometry(0.53, 0.53, 0.04), L.plaster('white'), f.M(-hw - 0.3, H + 0.3, 0, -Math.PI / 2));
  const mat = signMaterial(L, text, 'horse', { w: 512, h: 128, bg: '#2a2217' });
  f.put(new THREE.PlaneGeometry(Math.min(width + 0.3, 3.2), 0.5), mat, f.M(0, H + 0.02 - 0.3, 0.16));
  const slab = f.solid(0, 0, hw + 0.5, 0.8, H - 0.4, H + 1.2);
  slab.cameraOnly = true;
}

// A bell on an iron bracket by a door: the watch's alarm.
export function wallBell(env, x, y, z, yaw) {
  const { looks: L } = env;
  const f = framer(env, x, y, z, yaw);
  f.begin('watch bell', 0, 0.5);
  f.put(new THREE.BoxGeometry(0.1, 0.44, 0.04), L.iron, f.M(0, 0, 0.02));
  f.put(new THREE.BoxGeometry(0.04, 0.05, 0.62).translate(0, 0, 0.31), L.iron, f.M(0, 0.18, 0));
  const bronze = (L.bronze ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x8a6a36, metalness: 0.75, roughness: 0.4 }), { name: 'Bronze' }));
  f.put(bellGeometry(0.17), bronze, f.M(0, 0.18 - 0.21, 0.48));
  f.put(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 5).translate(0, -0.25, 0), L.iron, f.M(0.1, 0.0, 0.48));
}

// ------------------------------------------------------------------ the barn
// A threshing barn: tarred weatherboarding on a stone plinth, a big roof, wide double doors standing
// open in the gable to the lane (hay inside), a hayloft door in the gable above with a hoist beam, and
// slatted vents in the long walls instead of windows. Built from its plan row (front = +z).
export function barn(env, b, y) {
  const { tk, looks: L } = env;
  const f = framer(env, b.x, y, b.z, b.rot);
  const hw = b.w / 2, hd = b.d / 2, PL = 0.55, WH = 3.7, T = 0.24;
  const boards = L.timber('black'), g = boards.userData.grain || [2.2, 0.645];
  const stone = L.stone('grey');
  const DW = 3.6, DH = 3.4; // the doorway in the front gable
  const wallBox = (w, h, along) => grainUV(new THREE.BoxGeometry(w, h, T).translate(0, h / 2, 0), 'h', g);
  f.begin('barn', 0, hd);
  // Plinth and weatherboarded walls: back and sides whole, the front either side of the doorway.
  for (const [x, z, w, r] of [[0, -hd + T / 2, b.w, 0], [hw - T / 2, 0, b.d - 2 * T, Math.PI / 2], [-hw + T / 2, 0, b.d - 2 * T, Math.PI / 2]]) {
    f.put(new THREE.BoxGeometry(w + (r ? 0 : 0), PL + 0.3, T + 0.1).translate(0, (PL + 0.3) / 2 - 0.3, 0), stone, f.M(x, 0, z, r));
    f.put(wallBox(w, WH - PL, r ? 'z' : 'x'), boards, f.M(x, PL, z, r));
  }
  const side = (b.w - DW) / 2;
  for (const k of [-1, 1]) {
    const x = k * (DW / 2 + side / 2);
    f.put(new THREE.BoxGeometry(side, PL + 0.3, T + 0.1).translate(0, (PL + 0.3) / 2 - 0.3, 0), stone, f.M(x, 0, hd - T / 2));
    f.put(wallBox(side, WH - PL, 'x'), boards, f.M(x, PL, hd - T / 2));
  }
  // Over the doorway, up to the wall plate.
  f.put(wallBox(DW, WH - DH, 'x'), boards, f.M(0, DH, hd - T / 2));
  const [lint, lm] = timber(L, DW + 0.3, 0.25, 0.3, 'x', 'oak');
  f.put(lint, lm, f.M(0, DH - 0.12, hd - T / 2));
  for (const k of [-1, 1]) { const [pg, pm] = timber(L, 0.25, DH, 0.3, 'y', 'oak'); f.put(pg, pm, f.M(k * (DW / 2 + 0.12), DH / 2, hd - T / 2)); }
  // Doors: two ledged leaves standing open against the front wall.
  for (const k of [-1, 1]) {
    const [dg, dm] = timber(L, DW / 2 - 0.05, DH - 0.1, 0.08, 'y', 'oak');
    f.put(dg, dm, f.M(k * (DW / 2 + 0.2 + (DW / 2 - 0.05) / 2), DH / 2 - 0.02, hd + 0.08));
    for (const yy of [0.5, DH / 2, DH - 0.6]) { const [rg, rm] = timber(L, DW / 2 - 0.1, 0.14, 0.05, 'x', 'oak'); f.put(rg, rm, f.M(k * (DW / 2 + 0.2 + (DW / 2 - 0.05) / 2), yy, hd + 0.14)); }
    f.solid(k * (DW / 2 + 0.2 + (DW / 2 - 0.05) / 2), hd + 0.1, (DW / 2 - 0.05) / 2, 0.06, -0.5, DH);
  }
  // Slatted vents in the long walls: tall narrow dark slits between the boards.
  L.shade ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 }), { name: 'Shade' });
  for (const s of [-1, 1]) for (const zz of [-hd * 0.5, 0, hd * 0.5]) f.put(new THREE.PlaneGeometry(0.16, 1.3), L.shade, f.M(s * (hw + 0.005), 2.0, zz, s * Math.PI / 2));
  // The roof: a big steep tiled roof, gable to the lane, weatherboarded gables.
  const tile = L.roof('tile-brown'), R = tile.userData.roofing;
  const pitch = (54 * Math.PI) / 180;
  const sec = roofSection({ H: hw, y0: WH + 0.02, pitch, over: 0.45, t: 0.13, kind: 'band' });
  const E = hw + 0.45, slope = E / Math.cos(pitch);
  f.begin('roof', 0, 0);
  f.put(sweep(sec.outline, b.d + 0.7, { tu: R.tu, vOf: (a) => ((E - Math.abs(a)) / E) * slope / R.tv, capTile: R.tu }), tile, f.M(0, 0, 0));
  const r = 0.13, prof = [];
  for (let k = 0; k <= 8; k++) { const th = (Math.PI * k) / 8; prof.push([Math.cos(th) * r, sec.ridge - 0.05 + Math.sin(th) * r * 0.8]); }
  f.put(sweep(prof, b.d + 0.74, { tu: R.tu, tv: R.tv, capTile: R.tu, crease: 80 }), tile, f.M(0, 0, 0));
  const rise = hw * Math.tan(pitch);
  for (const s of [-1, 1]) {
    const gg = grainUV(gableGeometry(hw - 0.02, rise - 0.03, T), 'h', g);
    f.begin('gable', 0, s * hd);
    f.put(gg, boards, f.M(0, WH, s * hd, s > 0 ? 0 : Math.PI));
  }
  // The hayloft door in the front gable and the hoist beam over it, with its rope and hook.
  f.begin('hayloft', 0, hd);
  const [hl, hm] = timber(L, 1.1, 1.1, 0.08, 'y', 'oak');
  f.put(hl, hm, f.M(0, WH + 0.35 + 0.55, hd + 0.04));
  const [hb, hbm] = timber(L, 0.22, 0.22, 1.5, 'z', 'oak');
  f.put(hb, hbm, f.M(0, WH + 1.85, hd + 0.5));
  f.put(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2), L.iron, f.M(0, WH + 1.68, hd + 1.1));
  f.put(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 5), L.xm.rope, f.M(0.1, WH + 0.9, hd + 1.1));
  // Colliders: the walls (the doorway open), and the roof for the camera.
  f.solid(0, -hd + T / 2, hw, T / 2, -0.5, WH + 1);
  for (const s of [-1, 1]) f.solid(s * (hw - T / 2), 0, T / 2, hd, -0.5, WH + 1);
  for (const k of [-1, 1]) f.solid(k * (DW / 2 + side / 2), hd - T / 2, side / 2, T / 2, -0.5, WH + 1);
  f.solid(0, hd - T / 2, DW / 2, T / 2, DH, WH + 1).cameraOnly = true;
  f.solid(0, 0, hw + 0.4, hd + 0.4, WH, WH + rise + 0.6).cameraOnly = true;
  // Hay stacked inside, where you can see it through the open doors.
  const hay = [];
  for (const [lx, lz, lv, rot] of [[-2.2, -2.8, 0, 0], [-1.1, -2.8, 0, 0.05], [0.0, -2.8, 0, -0.04], [1.1, -2.9, 0, 0.02], [-1.6, -2.8, 1, 0.03], [-0.5, -2.85, 1, 0], [0.6, -2.8, 1, -0.05], [-1.0, -2.8, 2, 0.02], [2.4, -0.6, 0, 1.57], [2.4, 0.5, 0, 1.6]]) {
    const [wx, wz] = f.at(lx, lz);
    hay.push([wx, wz, lv, b.rot + rot]);
  }
  return { hay, door: f.at(0, hd), width: DW };
}

// A painted board on a wall: a title and lines of text (the toll board, the watch's notice).
export function wallBoard(env, x, y, z, yaw, lines, { w = 1.1, h = 0.8 } = {}) {
  const { looks: L } = env;
  const f = framer(env, x, y, z, yaw);
  const key = 'board|' + lines.join('|');
  let mat = L.signs.get(key);
  if (!mat) {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = Math.round((320 * h) / w);
    const g = cv.getContext('2d');
    g.fillStyle = '#2f2a22';
    g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#d8c79a';
    g.lineWidth = 5;
    g.strokeRect(8, 8, cv.width - 16, cv.height - 16);
    g.fillStyle = '#e6d8ae';
    g.textAlign = 'center';
    g.font = 'bold 30px Georgia, serif';
    g.fillText(lines[0], cv.width / 2, 46);
    g.font = '21px Georgia, serif';
    lines.slice(1).forEach((t, i) => g.fillText(t, cv.width / 2, 82 + i * 28));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    mat.name = 'Sign_Board';
    mat.normalMap = flatNormal();
    enhance(mat);
    L.signs.set(key, mat);
  }
  f.begin('notice', 0, 0.05);
  const [bg, bm] = timber(L, w + 0.08, h + 0.08, 0.05, 'x', 'oak');
  f.put(bg, bm, f.M(0, 0, 0.025));
  f.put(new THREE.PlaneGeometry(w, h), mat, f.M(0, 0, 0.052));
}
