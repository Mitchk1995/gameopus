// Ashford, laid out as a town rather than a ring. Pure data and geometry (no three.js), so the
// terrain baker, the village builder, the workstations, the NPC placement and the town test all
// read the same plan. See DESIGN.md, "Ashford v2", for the reasons behind every choice.
//
// Coordinates are metres: +x east, +z south. A building's `rot` turns it about y; its front
// faces (sin rot, cos rot): rot 0 looks south, PI north, PI/2 east, -PI/2 west.

export const TOWN = { x: -8, z: 18, y: 3.2, r: 46 };

// The wall line, clockwise from the north-west. Not a circle: a squarish town with cut corners.
export const OUTLINE = [[-54, -8], [-40, -28], [14, -28], [38, -4], [38, 52], [26, 64], [-44, 64], [-54, 54]];

// Three gates (one per road), each a stone gatehouse GATEHOUSE_W wide over the road, and two small
// gaps for farm and garden paths, each a field gate between rounded hedge ends. Round towers stand at
// the angles of the stone wall and where it gives way to the hedge.
export const GATEHOUSE_W = 8.8;
export const TOWER_R = 1.9;
export const GATES = [
  { id: 'north', x: -27, z: -28, road: 'quarry', width: 5.6, out: [-0.1, -1] },
  { id: 'east', x: 38, z: 15, road: 'bridge', width: 5.6, out: [1, 0] },
  { id: 'south', x: -8, z: 64, road: 'lake', width: 5.6, out: [0, 1] },
];
export const GAPS = [
  { id: 'garden', x: -54, z: 47, width: 2.8, out: [-1, 0] },
  { id: 'farm', x: 20, z: 64, width: 4.4, out: [0, 1] },
];

// The market square: a paved rectangle.
export const SQUARE = { x0: -24, x1: 8, z0: 2, z1: 26 };

// Streets: centre line, width, and whether they are cobbled (else trodden earth).
export const STREETS = [
  { id: 'lake', name: 'Lake Street', w: 5, paved: true, pts: [[-8, 64], [-8, 26]] },
  { id: 'bridge', name: 'Bridge Street', w: 5, paved: true, pts: [[8, 15], [38, 15]] },
  { id: 'quarry', name: 'Quarry Road', w: 5, paved: true, pts: [[-25, 2], [-25, -18], [-27, -28]] },
  { id: 'church', name: 'Church Lane', w: 3.6, paved: true, pts: [[1.8, 2], [1.8, -11]] },
  { id: 'wren', name: 'Wren Lane', w: 3.2, paved: false, pts: [[-10.5, 47], [-54, 47]] },
  { id: 'stable', name: 'Stable Lane', w: 3.4, paved: false, pts: [[-5.5, 47], [22, 47], [20, 64]] },
];

// Yards and forecourts: paved or trodden rectangles that are not streets.
export const YARDS = [
  { id: 'churchyard', x0: -5, x1: 13, z0: -27, z1: -11, paved: false },
  { id: 'inn yard', x0: 20, x1: 36, z0: 0, z1: 12, paved: false },
  { id: 'farmyard', x0: 22, x1: 36, z0: 47, z1: 63, paved: false },
  { id: 'kiln alcove', x0: -32, x1: -24, z0: 13, z1: 18.5, paved: false },
  { id: 'cooper yard', x0: 2.5, x1: 12.5, z0: 26.5, z1: 36.8, paved: false },
];

const FACE = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

// A run of buildings along a frontage. `face` is the way their fronts look, `line` the street
// edge they stand on (z for S/N, x for E/W), `start` where the first one begins along it.
function row(face, line, start, items, gap = 2.4) {
  const out = [];
  let c = start;
  for (const it of items) {
    c += it.gap ?? gap;
    const { w, d } = it;
    const mid = c + w / 2;
    let x, z;
    if (face === 'S') { x = mid; z = line - d / 2; }
    else if (face === 'N') { x = mid; z = line + d / 2; }
    else if (face === 'E') { x = line - d / 2; z = mid; }
    else { x = line + d / 2; z = mid; }
    out.push({ ...it, gap: undefined, x, z, rot: FACE[face], face });
    c += w;
  }
  return out;
}
const door = (at = 1, open = false, side = 's') => [{ side, at, open }];
const H = (o) => ({ id: 'house', floors: 1, style: 'plaster', chimney: 1, ...o });

export const BUILDINGS = [
  // ---- the market square's four sides
  // North: a cottage, and the bank, which closes the view up Lake Street.
  ...row('S', 2, -21.5, [
    H({ role: 'cottage', w: 6, d: 6, floors: 2, doors: door(1), chimney: 2, gap: 0 }),
    { id: 'bank', w: 8, d: 8, floors: 2, style: 'stone', doors: door(1, true), chimney: 1, windows: 0.7, gap: 3.5 },
  ]),
  // West: the store, the kiln alcove, then the potter's open workshop.
  ...row('E', -24, 7, [
    { id: 'store', w: 6, d: 8, floors: 2, style: 'plaster', doors: door(1, true), chimney: 2, windows: 0.6, gap: 0 },
    { id: 'potter', w: 8, d: 8, floors: 1, style: 'plaster', open: ['s'], chimney: 1, windows: 0.5, gap: 5.5 },
  ]),
  // East: the inn on the corner, the smithy (open front) facing the square.
  ...row('W', 8, 3, [
    { id: 'inn', w: 8, d: 12, floors: 2, style: 'plaster', doors: door(1, true), chimney: 1, windows: 0.7, gap: 0 },
    { id: 'smithy', w: 6, d: 6, floors: 1, style: 'stone', open: ['s'], chimney: 1, gap: 9 },
  ]),

  // ---- Lake Street, the way in from the south: cottages and shops in tight rows
  ...row('E', -10.5, 27.5, [
    H({ role: 'cottage', w: 6, d: 8, floors: 2, doors: door(1), chimney: 2, gap: 0 }),
    H({ role: 'cottage', w: 6, d: 6, floors: 1, style: 'stone', doors: door(1) }),
    H({ role: 'cottage', w: 8, d: 8, floors: 2, doors: door(2), chimney: 2, gap: 7.6 }),
  ]),
  ...row('W', -5.5, 27.5, [
    H({ role: 'cooper', w: 8, d: 8, floors: 2, doors: door(1), chimney: 1, gap: 0 }),
    H({ role: 'cottage', w: 4, d: 6, floors: 1, style: 'stone', doors: door(0) }),
    H({ role: 'cottage', w: 6, d: 8, floors: 2, doors: door(1), chimney: 2, gap: 7.4 }),
  ]),

  // ---- Quarry Road, north-west: the toll house at the gate and cottages facing the road
  ...row('E', -29.4, -25, [H({ role: 'toll house', w: 6, d: 6, floors: 1, style: 'stone', doors: door(1), chimney: 1, gap: 0 })]),
  ...row('E', -27.6, -16.6, [
    H({ role: 'cottage', w: 6, d: 6, floors: 1, doors: door(1), gap: 0 }),
    H({ role: 'cottage', w: 6, d: 8, floors: 2, style: 'stone', doors: door(1), chimney: 2 }),
  ]),
  ...row('W', -22.4, -16.5, [H({ role: 'cottage', w: 6, d: 6, floors: 2, doors: door(1), chimney: 2, gap: 0 })]),

  // ---- Church Lane: the chapel on its rise, with a bell tower
  ...row('S', -14.6, -1.2, [H({ role: 'chapel', w: 6, d: 10, floors: 2, style: 'stone', doors: door(1), chimney: 0, rise: 1.4, gap: 0 })]),
  { ...H({ role: 'tower', w: 4, d: 4, floors: 3, style: 'stone', doors: door(0), chimney: 0, rise: 1.4 }), x: 7.6, z: -18.6, rot: 0, face: 'S' },

  // ---- Bridge Street: stable and watch house on the north side, cottages on the south
  ...row('S', 12.5, 22.6, [
    H({ role: 'stable', w: 6, d: 8, floors: 1, doors: door(1), chimney: 0, gap: 0 }),
    H({ role: 'watch house', w: 4, d: 6, floors: 1, style: 'stone', doors: door(1), chimney: 1 }),
  ]),
  ...row('N', 17.5, 16.4, [
    H({ role: 'cottage', w: 6, d: 8, floors: 2, doors: door(1), chimney: 2, gap: 0 }),
    H({ role: 'cottage', w: 4, d: 6, floors: 1, style: 'stone', doors: door(0) }),
    H({ role: 'cottage', w: 4, d: 6, floors: 1, doors: door(1) }),
  ]),

  // ---- Wren Lane, west: the residential lane, gardens behind
  ...row('S', 45.4, -50, [
    H({ role: 'cottage', w: 6, d: 8, floors: 2, doors: door(1), chimney: 2, gap: 0 }),
    H({ role: 'cottage', w: 4, d: 6, floors: 1, style: 'stone', doors: door(0) }),
    H({ role: 'cottage', w: 6, d: 8, floors: 2, doors: door(1), chimney: 1 }),
    H({ role: 'cottage', w: 6, d: 6, floors: 1, style: 'stone', doors: door(1) }),
  ]),
  ...row('N', 48.6, -50, [
    H({ role: 'cottage', w: 4, d: 6, floors: 1, doors: door(1), gap: 0 }),
    H({ role: 'cottage', w: 6, d: 8, floors: 2, style: 'stone', doors: door(1), chimney: 2 }),
    H({ role: 'cottage', w: 6, d: 6, floors: 1, doors: door(1) }),
    H({ role: 'cottage', w: 6, d: 8, floors: 2, doors: door(1), chimney: 2 }),
  ]),

  // ---- Stable Lane, east: the working edge with a barn and a stable
  ...row('S', 45.3, 3, [H({ role: 'cottage', w: 8, d: 8, floors: 2, doors: door(2), chimney: 2, gap: 0 })]),
  ...row('N', 48.7, 4.4, [
    H({ role: 'barn', w: 8, d: 10, floors: 1, doors: door(2), chimney: 0, gap: 0 }),
    H({ role: 'stable', w: 4, d: 8, floors: 1, doors: door(1), chimney: 0 }),
  ]),
].map((b, i) => ({ ...b, key: i }));

// Buildings that get a named place (the rest are `houses`).
export const PUBLIC = ['bank', 'store', 'inn', 'smithy', 'potter'];

// ---------------------------------------------------------------- geometry helpers
// Signed distance to a polygon: negative inside, positive outside.
export function polyDistance(x, z, poly = OUTLINE) {
  let best = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? -best : best;
}

// Distance from a point to a polyline (metres), and to the nearest segment.
export function lineDistance(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

// Distance from a point to an axis-aligned rectangle (0 inside).
export const rectDistance = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

// Local-to-world for a building footprint (origin at its centre, +z the front).
export function toWorld(b, lx, lz) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

// Corners of a building footprint in world space.
export function footprint(b, pad = 0) {
  const hw = b.w / 2 + pad, hd = b.d / 2 + pad;
  return [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]].map(([lx, lz]) => toWorld(b, lx, lz));
}

// The doorway (centre of the wall segment) of each door of a building, in world space, and the
// point one and a half metres outside it.
// Every door counts, on whichever wall it is (a back door onto a garden or a yard too): `normal` is
// the way the door looks out, `side` its wall.
export function doorways(b) {
  const hw = b.w / 2, hd = b.d / 2;
  const SIDE = {
    s: (i) => [[-hw + 1 + i * 2, hd], [0, 1]],
    n: (i) => [[hw - 1 - i * 2, -hd], [0, -1]],
    e: (i) => [[hw, hd - 1 - i * 2], [1, 0]],
    w: (i) => [[-hw, -hd + 1 + i * 2], [-1, 0]],
  };
  return (b.doors || []).filter((d) => SIDE[d.side]).map((d) => {
    const [[lx, lz], [nx, nz]] = SIDE[d.side](d.at ?? 0);
    const at = toWorld(b, lx, lz), out = toWorld(b, lx + nx * 1.6, lz + nz * 1.6);
    return { at, out, door: d, side: d.side, normal: [(out[0] - at[0]) / 1.6, (out[1] - at[1]) / 1.6] };
  });
}

// ---------------------------------------------------------------- terrain and ground
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How much higher than the terrace the chapel's rise stands at a point (metres): Church Lane
// climbs gently to a plateau behind the lych-gate.
export function riseAt(x, z) {
  return 1.4 * sm(-5, -13, z) * sm(-8, -5.5, x) * sm(15.5, 12.5, x);
}

// Painted ground inside the town: [dirt, cobble] weights, 0..1.
export function townGround(x, z) {
  let dirt = 0, cobble = 0;
  for (const s of STREETS) {
    const v = sm(s.w / 2 + 0.45, s.w / 2 - 0.45, lineDistance(x, z, s.pts));
    if (s.paved) cobble = Math.max(cobble, v);
    else dirt = Math.max(dirt, v * 0.92);
  }
  const dx = Math.max(SQUARE.x0 - x, x - SQUARE.x1), dz = Math.max(SQUARE.z0 - z, z - SQUARE.z1);
  const sd = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  cobble = Math.max(cobble, sm(0.5, -0.5, sd));
  for (const y of YARDS) {
    const ex = Math.max(y.x0 - x, x - y.x1), ez = Math.max(y.z0 - z, z - y.z1);
    const d = Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0);
    const v = sm(0.6, -0.6, d);
    if (y.paved) cobble = Math.max(cobble, v);
    else dirt = Math.max(dirt, v * 0.85);
  }
  // Worked ground in the vegetable plots: no grass between the beds, trodden earth.
  for (const p of PLOTS) {
    if (!BEDS.has(p.crop)) continue;
    const ex = Math.max(p.x0 + 0.5 - x, x - p.x1 + 0.5), ez = Math.max(p.z0 + 0.5 - z, z - p.z1 + 0.5);
    const d = Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0);
    dirt = Math.max(dirt, sm(0.5, -0.4, d) * 0.95);
  }
  return [dirt, cobble];
}

// Plot crops that are grown in beds of worked soil (the rest are grass: lawns, an orchard, a green).
export const BEDS = new Set(['beans', 'cabbage', 'flowers', 'herbs']);

// ---------------------------------------------------------------- the wall around the town
export const EDGE_KIND = ['stone', 'stone', 'stone', 'stone', 'hedge', 'hedge', 'hedge', 'hedge'];
export const OPENINGS = [...GATES, ...GAPS];
// How thick the boundary is: the town wall, and the hedge.
export const THICK = { stone: 0.9, hedge: 1.25 };

// The outward normal of outline edge i (pointing away from the town).
export function edgeOut(i) {
  const a = OUTLINE[i], b = OUTLINE[(i + 1) % OUTLINE.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  return polyDistance(mx - uz, mz + ux) > 0 ? [-uz, ux] : [uz, -ux];
}

// Round towers at every angle of the outline where the stone wall turns or ends, pushed out along the
// corner's bisector so they stand proud of the wall's face (as real wall towers do).
export const TOWERS = OUTLINE.map((v, i) => {
  const prev = (i + OUTLINE.length - 1) % OUTLINE.length;
  if (EDGE_KIND[i] !== 'stone' && EDGE_KIND[prev] !== 'stone') return null;
  const n0 = edgeOut(prev), n1 = edgeOut(i);
  const bx = n0[0] + n1[0], bz = n0[1] + n1[1], bl = Math.hypot(bx, bz);
  return { x: v[0] + (bx / bl) * 0.9, z: v[1] + (bz / bl) * 0.9, r: TOWER_R, vertex: i };
}).filter(Boolean);

// How far along a run from vertex v a boundary `thick` thick must stop so that its end (both faces)
// lies inside the tower there: the run butts into the tower, nothing pokes past it.
function towerTrim(v, ux, uz, thick, tower) {
  let best = 0;
  for (let t = 0; t <= 3; t += 0.02) {
    const inside = [-1, 1].every((f) => Math.hypot(v[0] + ux * t - uz * f * thick / 2 - tower.x, v[1] + uz * t + ux * f * thick / 2 - tower.z) < tower.r - 0.06);
    if (inside) best = t;
    else if (t > 0.3) break;
  }
  return best;
}

// The runs of wall and hedge between the openings and the towers. Each run knows its outward normal
// and whether its ends are open (a hedge ends rounded at a field gate; it butts a gatehouse or tower).
function buildWalls() {
  const out = [];
  OUTLINE.forEach((a, i) => {
    const b = OUTLINE[(i + 1) % OUTLINE.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const kind = EDGE_KIND[i], n = edgeOut(i);
    const cuts = [];
    for (const o of OPENINGS) {
      const t = (o.x - a[0]) * ux + (o.z - a[1]) * uz;
      const off = Math.abs((o.x - a[0]) * -uz + (o.z - a[1]) * ux);
      if (off < 1.5 && t > 0 && t < len) {
        const gate = GATES.includes(o);
        // A gatehouse is the wall's end (the wall runs a hand into its side); a field gate's posts stand
        // just clear of the rounded hedge ends.
        const half = gate ? GATEHOUSE_W / 2 - (kind === 'stone' ? 0.05 : 0.1) : o.width / 2 + 0.45;
        cuts.push([t - half, t + half, !gate]);
        o.wallOut = n;
        o.edge = i;
      }
    }
    const t0 = TOWERS.find((tw) => tw.vertex === i), t1 = TOWERS.find((tw) => tw.vertex === (i + 1) % OUTLINE.length);
    const start = t0 ? towerTrim(a, ux, uz, THICK[kind], t0) : 0;
    const end = t1 ? towerTrim(b, -ux, -uz, THICK[kind], t1) : 0;
    cuts.sort((p, q) => p[0] - q[0]);
    let t = start, openA = false;
    for (const [c0, c1, soft] of [...cuts, [len - end, len, false]]) {
      if (c0 - t > 0.05) out.push({ kind, edge: i, a: [a[0] + ux * t, a[1] + uz * t], b: [a[0] + ux * c0, a[1] + uz * c0], open: [openA, soft], out: n });
      t = c1;
      openA = soft;
    }
  });
  return out;
}
export const WALLS = buildWalls();

// ---------------------------------------------------------------- plots: gardens, allotments, orchard
// Rectangles with a fence and a gate; `crop` says what grows (beds of beans, cabbages or herbs; a lawn;
// an orchard; a drying green). `gate` is the side ('n','s','e','w') with the gate, `gateAt` where along
// it (0..1, default the middle). `back` is a side formed by a house's back wall (no fence there: the
// house has a back door into the garden instead).
const plot = (id, x0, z0, x1, z1, crop, gate = 's', o = {}) => ({ id, x0, z0, x1, z1, crop, fence: 'wood', gate, gateAt: 0.5, ...o });
export const PLOTS = [
  plot('allotment beans', -50, -4, -38, 5, 'beans', 's', { gateAt: 0.66 }),
  plot('allotment cabbages', -50, 9, -38, 18, 'cabbage', 's', { gateAt: 0.66 }),
  plot('allotment herbs', -50, 22, -38, 31, 'herbs', 'e'),
  plot('quarry garden', -44, -16, -38, -8, 'beans', 'e'),
  plot('kitchen garden', 22.5, -6, 32.5, -1.5, 'cabbage', 's'),
  plot('drying green', 16, -10.5, 22, -1.2, 'green', 'w'),
  plot('orchard', 14, 29, 34, 43, 'orchard', 's', { gateAt: 0.45 }),
  plot('cottage garden a', -50, 32.6, -44, 37.4, 'lawn', 'e', { back: 's', gateAt: 0.45 }),
  plot('cottage garden b', -35.2, 32.6, -29.2, 37.4, 'lawn', 'w', { back: 's', gateAt: 0.3 }),
  plot('cottage garden d', -41, 58.7, -29, 62.2, 'cabbage', 'n', { gateAt: 0.55 }),
];

// Back doors: from a house into its back garden or yard. Data for the building rules (buildHouse makes a
// door on any wall); the plan's own rows stay as they are.
export const BACK_DOORS = [
  { near: [-47, 41.4], side: 'n', at: 0, into: 'cottage garden a' },
  { near: [-32.2, 41.4], side: 'n', at: 0, into: 'cottage garden b' },
  { near: [-1.5, 31.5], side: 'n', at: 1, into: "the cooper's yard" },
  { near: [14, 7], side: 'n', at: 1, into: 'the inn yard' },
];
for (const bd of BACK_DOORS) {
  const b = BUILDINGS.find((q) => Math.hypot(q.x - bd.near[0], q.z - bd.near[1]) < 0.5);
  if (!b) continue;
  bd.key = b.key;
  if (!(b.doors || []).some((d) => d.side === bd.side)) b.doors = [...(b.doors || []), { side: bd.side, at: bd.at, back: true }];
}

// Trees inside the wall: the great old ash the town is named for, at the square's north-west corner
// with a bench round it, and the orchard's apple trees in rows.
export const TOWN_TREES = [{ species: 'ash', x: -19.6, z: 4.8, scale: 0.2, id: 'great ash' }];
for (const x of [17, 21.6, 26.2, 30.8]) for (const z of [31.9, 36.1, 40.3]) TOWN_TREES.push({ species: 'apple', x: x + ((z * 7) % 3) * 0.25, z, id: 'orchard' });

// ---------------------------------------------------------------- stations and people
export const WELL = { x: -8, z: 14.5 };
export const FIRE = { x: 2.6, z: 9.6 };
// The market cross stands on the square's axis between the bank and the well.
export const CROSS = { x: -8, z: 7.4 };
// Kiln stands in the alcove between the store and the potter's workshop, mouth to the square.
export const KILN = { x: -28.4, z: 15.8, rot: FACE.E };

// Market stalls: two facing rows either side of the aisle from Lake Street up to the bank.
export const STALLS = [
  { x: -13.5, z: 9.4, rot: FACE.E, name: 'Stall_Cart_Empty', goods: 'runes' },
  { x: -13.5, z: 14.6, rot: FACE.E, name: 'Stall_Empty', goods: 'veg' },
  { x: -13.5, z: 19.6, rot: FACE.E, name: 'Stall_Empty', goods: 'veg' },
  { x: -2.5, z: 9.4, rot: FACE.W, name: 'Stall_Empty', goods: 'veg' },
  { x: -2.5, z: 14.6, rot: FACE.W, name: 'Stall_Cart_Empty', goods: 'veg' },
  { x: -2.5, z: 19.6, rot: FACE.W, name: 'Stall_Empty', goods: 'veg' },
];

export const PEOPLE_AT = {
  mirelle: { x: -15.2, z: 9.4, facing: Math.PI / 2 },
  garrow: { x: 35.4, z: 13.4, facing: 1.2 },
  // Round the stalls, clear of the market cross and the ash's bench.
  wenna: { route: [[-17.2, 4.6], [-0.1, 4.6], [-0.1, 23.2], [-17.2, 23.2]] },
  hob: { route: [[4.2, 13.6], [4.2, 23.2], [-7.0, 24.2], [-8.4, 19.6], [-6.4, 19.2]], reverse: true },
};

// ---------------------------------------------------------------- props, each with a reason
// type 'kit' places a Quaternius prop by `name`; the rest are built in townkit.js and grounds.js.
export const PROPS = [];
const put = (type, x, z, rot = 0, o = {}) => PROPS.push({ type, x, z, rot, ...o });
const kit = (name, x, z, rot = 0, o = {}) => put('kit', x, z, rot, { name, ...o });
const B = (id, n = 0) => BUILDINGS.filter((b) => b.id === id)[n];
const R = (role, n = 0) => BUILDINGS.filter((b) => b.role === role)[n];

// Light: no street lamps (a medieval town had none). Lanterns on brackets at the gatehouses (built with
// them), a brazier by each gate where the watch keeps warm, and a few lanterns on oak posts where people
// gather after dark: the inn's corner, the foot of the square by the smithy, the Lake Street crossroads,
// and Bridge Street between the stable and the watch house.
put('lantern', 6.6, 1.2, Math.PI * 0.75, { why: "lantern at the inn's corner, lighting Church Lane" });
put('lantern', 5.9, 25.2, -2.4, { why: 'lantern at the foot of the square by the smithy' });
put('lantern', -11.3, 44.4, Math.PI / 4, { why: 'lantern at the Lake Street crossroads' });
put('lantern', 29.8, 11.9, 0, { why: 'lantern on Bridge Street by the watch house' });
put('brazier', -22.2, -31.0, 0, { why: 'the watch fire outside the north gate' });
put('brazier', 41.2, 10.8, 0, { why: 'the watch fire outside the east gate, by Garrow' });
put('brazier', -3.9, 60.6, 0, { why: 'the watch fire inside the south gate' });

// The inn: barrels by the door, benches under the eaves, a communal hearth in front.
{
  const inn = B('inn');
  const w = (lx, lz) => toWorld(inn, lx, lz);
  // Along the front: cask rack, door (lanterns either side), bench, then two barrels at the end.
  kit('Barrel_Holder', ...w(-3.15, 6.75), inn.rot, { why: 'inn cask rack' });
  kit('Bench', ...w(1.9, 6.55), inn.rot, { why: 'inn bench' });
  kit('Barrel', ...w(3.7, 6.5), 0, { r: 0.4, why: 'inn barrels' });
  kit('Barrel', ...w(3.7, 7.3), 1, { r: 0.4, why: 'inn barrels' });
  kit('Bench', FIRE.x, FIRE.z - 2.6, 0, { why: 'hearth bench' });
  kit('Bench', FIRE.x + 3, FIRE.z, -Math.PI / 2, { why: 'hearth bench' });
  kit('Bench', FIRE.x, FIRE.z + 2.6, Math.PI, { why: 'hearth bench' });
}
// The inn yard, behind the inn (its back door opens onto it): the brewer's casks by the back wall,
// a cart, the yard pump and trough, the inn's firewood.
kit('Barrel', 20.75, 3.7, 0.4, { r: 0.4, why: 'ale casks by the inn back wall' });
kit('Barrel', 21.55, 3.75, 1.3, { r: 0.4, why: 'ale casks by the inn back wall' });
kit('Barrel', 20.8, 2.9, 2.1, { r: 0.4, why: 'ale casks by the inn back wall' });
put('wagon', 30.8, 2.4, Math.PI / 2, { load: 'casks', why: "the brewer's dray in the inn yard" });
put('pump', 34.3, 1.7, 0, { why: 'the inn yard pump' });
put('trough', 34.3, 3.55, Math.PI / 2, { len: 1.4, stone: true, why: 'trough under the inn yard pump' });
put('woodpile', 24.6, 0.9, 0, { why: "the inn's firewood" });
// The store: crates and apples outside, where shoppers browse.
{
  const st = B('store');
  const w = (lx, lz) => toWorld(st, lx, lz);
  kit('Barrel_Apples', ...w(-2.2, 4.7), 0, { r: 0.4, why: 'store display' });
  kit('Crate_Wooden', ...w(2.2, 4.6), 0.3, { r: 0.45, why: 'store display' });
  kit('Crate_Wooden', ...w(3.3, 4.7), 1.2, { r: 0.45, why: 'store display' });
}
// The bank: a bench for waiting, nothing else. Banks do not have barrels.
kit('Bench', -5.4, 2.65, 0, { why: 'bank bench' });
// The smithy: a barrel and a crate of coal beside the open front, and a stone horse trough against its
// south wall (out of the way of the forge, at a hand's breadth from the wall).
{
  const sm = B('smithy');
  const w = (lx, lz) => toWorld(sm, lx, lz);
  put('trough', 11.2, 26.85, 0, { stone: true, why: "the farrier's trough by the smithy" });
  kit('Barrel', ...w(-2.6, 3.9), 0, { r: 0.4, why: 'smithy barrel' });
  kit('Crate_Metal', ...w(-2.6, 4.9), 0.2, { r: 0.45, why: 'smithy coal' });
}
// The potter: finished pots by the workshop front.
{
  const po = B('potter');
  const w = (lx, lz) => toWorld(po, lx, lz);
  kit('Vase_2', ...w(-3.2, 4.7), 0, { r: 0.35, why: 'pots for sale' });
  kit('Pot_1', ...w(-2.4, 4.6), 0.5, { r: 0.3, why: 'pots for sale' });
  kit('Vase_4', ...w(3.3, 4.7), 0, { r: 0.28, why: 'pots for sale' });
  kit('Pot_1_Lid', ...w(2.5, 4.6), 0.2, { r: 0.3, why: 'pots for sale' });
}
// The cooper: his yard behind the workshop (the back door opens onto it): a cask being raised in its
// hoop, finished casks, one on a stillage, a fresh one, hoops against the wall, the shaving horse
// and its shavings, and a rack of cask heads in the making.
put('cooper', 5.2, 30.4, 0, {
  why: "the cooper's yard",
  spots: {
    raising: [5.4, 29.6],
    casks: [[3.25, 27.4, {}], [3.25, 28.15, {}], [4.0, 27.5, {}], [6.8, 35.2, { lying: true, rot: 0.35 }], [8.3, 29.2, { fresh: true }]],
    hoops: [3.05, 35.4, Math.PI / 2],
    horse: [9.3, 32.6, 0.45],
    shavings: [9.2, 33.1],
  },
});
kit('Barrel_Holder', ...toWorld(R('cooper'), -3.1, 4.8), R('cooper').rot, { why: 'cooper cask rack by his street door' });
// Square: the market cross on the axis, the stalls either side, the well between them, flagstones
// round the cross and the well, the great ash with its bench in the north-west corner, the notice
// board by it, and the bits of a market between the stalls (a handcart, baskets, sacks).
for (const s of STALLS) put('stall', s.x, s.z, s.rot, { name: s.name, goods: s.goods });
put('cross', CROSS.x, CROSS.z, 0, { why: 'the market cross, where the market is proclaimed' });
put('flags', CROSS.x, CROSS.z, 0, { r0: 2.1, r1: 3.3, why: 'flagstones round the cross' });
put('well', WELL.x, WELL.z);
put('flags', WELL.x, WELL.z, 0, { r0: 1.12, r1: 2.3, why: 'flagstones round the well' });
put('treeBench', TOWN_TREES[0].x, TOWN_TREES[0].z, 0, { why: 'the bench round the great ash' });
put('notice', -15.0, 3.2, 0, { why: 'notices, by the great ash' });
put('handcart', -19.6, 12.2, 0.2, { why: 'a stallholder handcart by the west stalls' });
put('basket', -11.9, 15.8, 0, { fill: 'apples', why: 'apples by the veg stall' });
put('basket', -11.95, 16.5, 0, { fill: 'greens', why: 'greens by the veg stall' });
put('basket', -4.1, 20.8, 0, { fill: 'apples', why: 'apples by the veg stall' });
// Behind the stalls: the crates the stallholders sell from.
for (const s of STALLS.filter((t) => t.goods !== 'runes')) {
  const bx = s.x + Math.sin(s.rot) * -1.0, bz = s.z + Math.cos(s.rot) * -1.0;
  kit('Crate_Wooden', bx, bz + 0.6, s.rot, { r: 0.45, why: 'stall stock' });
}

// Signposts at the junctions, free of walls, lamps and doors.
put('sign', -12.2, 24.3, 0.35, { boards: [{ text: 'Bank', dir: [0.15, -1] }, { text: 'Chapel', dir: [0.9, -1] }, { text: 'Inn', dir: [1, -0.2] }, { text: 'Store', dir: [-1, -0.1] }], why: 'square, mouth of Lake Street' });
put('sign', -22.0, -21.6, 0, { boards: [{ text: 'Quarry & Warren', dir: [-0.2, -1] }, { text: 'Ashford', dir: [0.15, 1] }], why: 'north gate' });
put('sign', -5.0, 44.0, 0.2, { boards: [{ text: 'Wren Lane', dir: [-1, 0] }, { text: 'Stable Lane', dir: [1, 0] }, { text: 'Lake', dir: [0, 1] }], why: 'Lake Street crossroads' });
put('sign', 5.0, 3.6, 0, { boards: [{ text: 'Chapel', dir: [-0.3, -1] }], why: 'church lane mouth' });

// Churchyard: graves in rows either side of the chapel, a lych-gate at the lane end.
for (const gx of [-1.9, 10.6, 12.1]) for (let gz = -25.2; gz < -15.5; gz += 2.5) if (!(gx > 9 && gz > -21.5)) put('grave', gx, gz, 0.08 * (gz % 3), { why: 'churchyard' });
put('lychgate', 1.8, -11.0, 0, { why: 'churchyard entrance' });
kit('Bench', 6.4, -12.3, 0, { why: 'churchyard bench' });

// Back gardens: woodpiles against the house wall (clear of the back door and the fence), washing on a
// line across the lawn, a pump for Wren Lane at the garden gap.
put('woodpile', -48.75, 36.85, 0, { block: false, why: 'woodpile against the house, in garden a' });
put('woodpile', -33.5, 36.85, 0, { block: false, why: 'woodpile against the house, in garden b' });
put('washing', -49.4, 33.5, 0, { to: [-44.6, 33.5], why: 'washing line in garden a' });
put('washing', -34.4, 35.2, 0, { to: [-29.9, 35.2], why: 'washing line in garden b' });
put('pump', -51.9, 43.8, 0, { why: 'Wren Lane pump' });
// The allotments: a tool shed and a water butt between the beans and the cabbages, compost bays
// between the cabbages and the herbs.
put('shed', -48.75, 7.1, Math.PI / 2, { w: 2.2, d: 1.5, why: 'the allotment tool shed' });
kit('Barrel', -47.35, 6.0, 0.5, { r: 0.4, why: 'water butt by the allotment shed' });
put('compost', -47.5, 20.0, 0, { why: 'the allotment compost bays' });
// The drying green, north of the inn: lines of washing, linen bleaching on the grass, a wash tub.
put('washing', 17.3, -9.6, 0, { to: [17.3, -2.6], why: 'washing on the drying green' });
put('washing', 20.7, -9.6, 0, { to: [20.7, -2.6], why: 'washing on the drying green' });
put('bleach', 19.0, -7.4, Math.PI / 2 + 0.06, { why: 'linen bleaching on the green' });
put('bleach', 19.0, -4.4, Math.PI / 2 - 0.08, { why: 'linen bleaching on the green' });
put('washtub', 21.1, -2.15, 0, { why: 'the wash tub on the drying green' });
// The orchard (the old paddock): apple trees in rows, a ladder against one, baskets of picked apples,
// bee skeps on their stand along the east fence.
put('ladder', 21.9, 35.3, -0.6, { why: 'a ladder against an apple tree' });
put('basket', 22.6, 36.9, 0, { fill: 'apples', why: 'picked apples in the orchard' });
put('basket', 26.9, 32.9, 0, { fill: 'apples', why: 'picked apples in the orchard' });
put('skeps', 32.9, 34.4, -Math.PI / 2, { why: 'bee skeps in the orchard' });
// The stable on Bridge Street: a stone trough and a truss of hay outside.
{
  const st = R('stable');
  put('trough', st.x - 2.0, st.z + st.d / 2 + 0.66, 0, { stone: true, why: 'stable trough' });
  put('bale', st.x + 2.1, st.z + st.d / 2 + 0.52, 0.1, { why: 'hay for the stable' });
}
// The farmyard by the farm gate: the hay wagon (loaded), two haystacks clear of the hedge, the pump
// and a plank trough for the beasts.
put('wagon', 26.4, 52.6, 0.5, { load: 'hay', why: 'hay wagon at the farm gate' });
put('haystack', 29.4, 55.6, 0, { r: 1.35, why: 'haystack in the farmyard' });
put('haystack', 32.3, 51.8, 0, { r: 1.1, why: 'haystack in the farmyard' });
put('pump', 23.8, 57.2, 0, { why: 'farmyard pump' });
put('trough', 24.4, 60.2, Math.PI / 2, { why: 'trough by the farm gate' });

// ---------------------------------------------------------------- promised
// What the lore, the people and DESIGN.md promise the player will find: each must be built (a piece with
// this label or kit name, near where it should be) and reachable on foot (town.py checks). `owner` marks
// a promise that another part of the build keeps (reported, not failed, until it lands).
export const PROMISED = [
  { id: 'three town gates', label: 'gatehouse', count: 3, reach: 5, why: 'lore: "a stone or hedge wall round it and three gates"' },
  { id: 'the well in the square', label: 'well', at: WELL, r: 1.5, why: 'lore: "the well in the middle"' },
  { id: 'the stone bridge', label: 'bridge', at: { x: 90, z: 3 }, r: 25, reach: 6, why: 'lore: "over the stone bridge across the river"' },
  { id: 'crates and barrels by Old Tam', kit: /^(Crate|Barrel)/, near: 'tam', r: 16, count: 2, why: 'DESIGN.md: the dock "with its crates and barrels by Old Tam"' },
  { id: 'the hearth before the inn', station: 'fire', why: 'lore: the Crooked Pike "with a cooking fire and benches out front"' },
  { id: 'the Crooked Pike sign', label: /inn sign|Crooked Pike/i, at: { x: 8, z: 6 }, r: 6, owner: 'buildings', why: 'lore: "the Crooked Pike inn"' },
];
