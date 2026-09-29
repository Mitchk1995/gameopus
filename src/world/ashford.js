// Ashford, laid out as a town rather than a ring. Pure data and geometry (no three.js), so the
// terrain baker, the village builder, the workstations, the NPC placement and the town test all
// read the same plan. See DESIGN.md, "Ashford v2", for the reasons behind every choice.
//
// Coordinates are metres: +x east, +z south. A building's `rot` turns it about y; its front
// faces (sin rot, cos rot): rot 0 looks south, PI north, PI/2 east, -PI/2 west.

export const TOWN = { x: -8, z: 18, y: 3.2, r: 46 };

// The wall line, clockwise from the north-west. Not a circle: a squarish town with cut corners.
export const OUTLINE = [[-54, -8], [-40, -28], [14, -28], [38, -4], [38, 52], [26, 64], [-44, 64], [-54, 54]];

// Three gates (one per road) and two small gaps for farm and garden paths.
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
const door = (at = 1, open = false, side = 's', o = {}) => [{ side, at, open, ...o }];
const H = (o) => ({ id: 'house', floors: 1, style: 'plaster', chimney: 1, ...o });

// Every building says what it is. `type` picks a kind of building (see TYPES in buildings.js): a
// jettied timber town house with its eaves to the street ('jetty'), a gable-fronted jettied house
// ('gabled'), a tall narrow house ('tall'), a stone cottage ('stone'), a thatched cottage ('thatch'),
// a stone lock-up ('lockup'), and the trades' own. Then its colours: the limewash on the plaster
// (cream, white, ochre, pink, sage, russet), the timbers (kit, oak, black), the stone (grey, honey)
// and the roofing (tile, tile-red, tile-brown, slate, slate-dark, thatch); neighbours never match.
export const BUILDINGS = [
  // ---- the market square's four sides
  // North: a gable-fronted town house, and the bank, which closes the view up Lake Street.
  ...row('S', 2, -21.5, [
    H({ role: 'cottage', type: 'gabled', wash: 'ochre', timber: 'oak', w: 6, d: 6, floors: 2, doors: door(1, false, 's', { paint: 'green' }), boxes: true, gap: 0 }),
    { id: 'bank', type: 'bank', w: 8, d: 8, floors: 2, style: 'stone', doors: door(1, true, 's', { leaf: 4 }), chimney: 1, windows: 0.7, gap: 3.5 },
  ]),
  // West: the store, the kiln alcove, then the potter's open workshop.
  ...row('E', -24, 7, [
    { id: 'store', type: 'shop', wash: 'white', timber: 'black', w: 6, d: 8, floors: 2, style: 'plaster', doors: door(1, true, 's', { shape: 'Flat' }), chimney: 2, windows: 0.6, gap: 0 },
    { id: 'potter', type: 'workshop', wash: 'sage', timber: 'oak', roof: 'tile-red', w: 8, d: 8, floors: 1, style: 'plaster', open: ['s'], chimney: 0, windows: 0.5, gap: 5.5 },
  ]),
  // East: the inn on the corner, the smithy (open front) facing the square.
  ...row('W', 8, 3, [
    { id: 'inn', type: 'inn', wash: 'russet', timber: 'black', dormers: 2, w: 8, d: 12, floors: 2, style: 'plaster', doors: door(1, true), chimney: 1, windows: 0.7, gap: 0 },
    { id: 'smithy', type: 'workshop', walls: 'stone', stone: 'grey', roof: 'slate', barge: false, w: 6, d: 6, floors: 1, style: 'stone', open: ['s'], chimney: 0, gap: 9 },
  ]),

  // ---- Lake Street, the way in from the south: cottages and shops in tight rows
  ...row('E', -10.5, 27.5, [
    H({ role: 'cottage', type: 'jetty', wash: 'ochre', timber: 'oak', roof: 'tile', dormers: 1, boxes: true, w: 6, d: 8, floors: 2, doors: door(1, false, 's', { paint: 'red' }), gap: 0 }),
    H({ role: 'cottage', type: 'thatch', walls: 'stone', stone: 'honey', w: 6, d: 6, floors: 1, style: 'stone', doors: door(1, false, 's', { shape: 'Flat', paint: 'blue' }), ivy: 'n' }),
    H({ role: 'cottage', type: 'stone', stone: 'honey', roof: 'slate', dormers: 2, datestone: '1487', w: 8, d: 8, floors: 2, doors: door(2, false, 's', { shape: 'Flat', leaf: 2 }), gap: 7.6 }),
  ]),
  ...row('W', -5.5, 27.5, [
    H({ role: 'cooper', type: 'jetty', wash: 'pink', timber: 'oak', roof: 'tile-red', w: 8, d: 8, floors: 2, doors: door(1), gap: 0 }),
    H({ role: 'cottage', type: 'tall', wash: 'white', timber: 'black', w: 4, d: 6, floors: 3, style: 'plaster', doors: door(0, false, 's', { shape: 'Flat', paint: 'black' }) }),
    H({ role: 'cottage', type: 'gabled', wash: 'ochre', timber: 'black', roof: 'tile-brown', lean: 0.075, w: 6, d: 8, floors: 2, doors: door(1, false, 's', { paint: 'green' }), gap: 7.4 }),
  ]),

  // ---- Quarry Road, north-west: the toll house at the gate and cottages facing the road
  ...row('E', -29.4, -25, [H({ role: 'toll house', type: 'lockup', stone: 'grey', w: 6, d: 6, floors: 1, style: 'stone', doors: door(1, false, 's', { shape: 'Flat' }), gap: 0 })]),
  ...row('E', -27.6, -16.6, [
    H({ role: 'cottage', type: 'thatch', wash: 'white', timber: 'oak', w: 6, d: 6, floors: 1, doors: door(1, false, 's', { shape: 'Flat', paint: 'green' }), gap: 0 }),
    H({ role: 'cottage', type: 'stone', stone: 'grey', roof: 'slate-dark', w: 6, d: 8, floors: 2, style: 'stone', doors: door(1, false, 's', { shape: 'Flat', paint: 'red' }), ivy: 'e' }),
  ]),
  ...row('W', -22.4, -16.5, [H({ role: 'cottage', type: 'gabled', wash: 'sage', timber: 'black', roof: 'tile', w: 6, d: 6, floors: 2, doors: door(1), gap: 0 })]),

  // ---- Church Lane: the chapel on its rise, with a bell tower
  ...row('S', -14.6, -1.2, [H({ role: 'chapel', w: 6, d: 10, floors: 2, style: 'stone', doors: door(1), chimney: 0, rise: 1.4, gap: 0 })]),
  { ...H({ role: 'tower', w: 4, d: 4, floors: 3, style: 'stone', doors: door(0), chimney: 0, rise: 1.4 }), x: 7.6, z: -18.6, rot: 0, face: 'S' },

  // ---- Bridge Street: stable and watch house on the north side, cottages on the south
  ...row('S', 12.5, 22.6, [
    H({ role: 'stable', type: 'stable', w: 6, d: 8, floors: 1, doors: door(1, false, 's', { shape: 'Flat', leaf: 2 }), chimney: 0, gap: 0 }),
    H({ role: 'watch house', type: 'lockup', stone: 'honey', roof: 'slate-dark', w: 4, d: 6, floors: 1, style: 'stone', doors: door(1, false, 's', { shape: 'Flat', leaf: 4 }) }),
  ]),
  ...row('N', 17.5, 16.4, [
    H({ role: 'cottage', type: 'jetty', wash: 'white', timber: 'black', roof: 'tile-brown', boxes: true, w: 6, d: 8, floors: 2, doors: door(1, false, 's', { paint: 'red' }), gap: 0 }),
    H({ role: 'cottage', type: 'thatch', walls: 'stone', stone: 'grey', w: 4, d: 6, floors: 1, style: 'stone', doors: door(0, false, 's', { shape: 'Flat' }) }),
    H({ role: 'cottage', type: 'cottage', wash: 'pink', timber: 'oak', roof: 'tile-red', w: 4, d: 6, floors: 1, doors: door(1, false, 's', { shape: 'Flat', paint: 'blue' }) }),
  ]),

  // ---- Wren Lane, west: the residential lane, gardens behind
  ...row('S', 45.4, -50, [
    H({ role: 'cottage', type: 'jetty', wash: 'ochre', timber: 'oak', roof: 'tile-red', dormers: 1, w: 6, d: 8, floors: 2, doors: door(1, false, 's', { paint: 'blue' }), gap: 0 }),
    H({ role: 'cottage', type: 'thatch', wash: 'white', timber: 'oak', w: 4, d: 6, floors: 1, style: 'stone', doors: door(0, false, 's', { shape: 'Flat', paint: 'green' }) }),
    H({ role: 'cottage', type: 'gabled', wash: 'pink', timber: 'kit', roof: 'tile-brown', w: 6, d: 8, floors: 2, doors: door(1), ivy: 'w' }),
    H({ role: 'cottage', type: 'stone', stone: 'honey', roof: 'slate', w: 6, d: 6, floors: 1, style: 'stone', doors: door(1, false, 's', { shape: 'Flat', paint: 'red' }) }),
  ]),
  ...row('N', 48.6, -50, [
    H({ role: 'cottage', type: 'cottage', wash: 'sage', timber: 'black', roof: 'tile', w: 4, d: 6, floors: 1, doors: door(1, false, 's', { shape: 'Flat' }), gap: 0 }),
    H({ role: 'cottage', type: 'stone', stone: 'grey', roof: 'slate-dark', dormers: 1, w: 6, d: 8, floors: 2, style: 'stone', doors: door(1, false, 's', { shape: 'Flat', paint: 'green' }) }),
    H({ role: 'cottage', type: 'thatch', wash: 'cream', timber: 'oak', w: 6, d: 6, floors: 1, doors: door(1, false, 's', { shape: 'Flat', paint: 'red' }), ivy: 'e' }),
    H({ role: 'cottage', type: 'jetty', wash: 'sage', timber: 'black', roof: 'tile', boxes: true, w: 6, d: 8, floors: 2, doors: door(1, false, 's', { paint: 'blue' }) }),
  ]),

  // ---- Stable Lane, east: the working edge with a barn and a stable
  ...row('S', 45.3, 3, [H({ role: 'cottage', type: 'stone', stone: 'honey', roof: 'tile-brown', w: 8, d: 8, floors: 2, style: 'stone', doors: door(2, false, 's', { shape: 'Flat', paint: 'blue' }), gap: 0 })]),
  ...row('N', 48.7, 4.4, [
    H({ role: 'barn', w: 8, d: 10, floors: 1, doors: door(2), chimney: 0, gap: 0 }),
    H({ role: 'stable', type: 'stable', w: 4, d: 8, floors: 1, doors: door(1, false, 's', { shape: 'Flat', leaf: 2 }), chimney: 0 }),
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
export function doorways(b) {
  return (b.doors || []).filter((d) => d.side === 's').map((d) => {
    const lx = -b.w / 2 + 1 + d.at * 2;
    return { at: toWorld(b, lx, b.d / 2), out: toWorld(b, lx, b.d / 2 + 1.6), door: d };
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
  return [dirt, cobble];
}

// ---------------------------------------------------------------- the wall around the town
const EDGE_KIND = ['stone', 'stone', 'stone', 'stone', 'hedge', 'hedge', 'hedge', 'hedge'];
export const OPENINGS = [...GATES, ...GAPS];

function buildWalls() {
  const out = [];
  OUTLINE.forEach((a, i) => {
    const b = OUTLINE[(i + 1) % OUTLINE.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const cuts = [];
    for (const o of OPENINGS) {
      const t = (o.x - a[0]) * ux + (o.z - a[1]) * uz;
      const off = Math.abs((o.x - a[0]) * -uz + (o.z - a[1]) * ux);
      if (off < 1.5 && t > 0 && t < len) cuts.push([t - o.width / 2, t + o.width / 2]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let t = 0;
    for (const [c0, c1] of [...cuts, [len, len]]) {
      if (c0 - t > 0.05) out.push({ kind: EDGE_KIND[i], edge: i, a: [a[0] + ux * t, a[1] + uz * t], b: [a[0] + ux * c0, a[1] + uz * c0] });
      t = c1;
    }
  });
  return out;
}
export const WALLS = buildWalls();

// ---------------------------------------------------------------- plots: gardens, paddocks, allotments
// Rectangles with a fence; `crop` says what grows. `gate` is the side ('n','s','e','w') with a gap.
const plot = (id, x0, z0, x1, z1, crop, fence = 'wood', gate = 's') => ({ id, x0, z0, x1, z1, crop, fence, gate });
export const PLOTS = [
  plot('allotment beans', -50, -4, -38, 5, 'beans'),
  plot('allotment cabbages', -50, 9, -38, 18, 'cabbage'),
  plot('allotment herbs', -50, 22, -38, 31, 'flowers', 'wood', 'e'),
  plot('kitchen garden', 22, -8, 34, -1, 'cabbage', 'wood', 's'),
  plot('paddock', 14, 29, 34, 43, 'pen', 'wood', 's'),
  plot('cottage garden a', -49, 33, -43.5, 37, 'none', 'wood', 's'),
  plot('cottage garden b', -35, 34, -29, 37, 'none', 'wood', 's'),
  plot('cottage garden c', -49, 57, -43.5, 62, 'none', 'wood', 'n'),
  plot('cottage garden d', -40, 58, -30, 62, 'cabbage', 'wood', 'n'),
  plot('quarry garden', -50, -22, -38, -8, 'beans', 'wood', 'e'),
];

// ---------------------------------------------------------------- stations and people
export const WELL = { x: -8, z: 14.5 };
export const FIRE = { x: 2.6, z: 9.6 };
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
  wenna: { route: [[-18.5, 6.5], [0.0, 6.5], [0.0, 23.5], [-18.5, 23.5]] },
  hob: { route: [[4.2, 13.6], [4.2, 23.2], [-7.0, 24.2], [-8.4, 19.6], [-6.4, 19.2]], reverse: true },
};

// ---------------------------------------------------------------- props, each with a reason
// type 'kit' places a Quaternius prop by `name`; the rest are built in townkit.js.
export const PROPS = [];
const put = (type, x, z, rot = 0, o = {}) => PROPS.push({ type, x, z, rot, ...o });
const kit = (name, x, z, rot = 0, o = {}) => put('kit', x, z, rot, { name, ...o });
const B = (id, n = 0) => BUILDINGS.filter((b) => b.id === id)[n];
const R = (role, n = 0) => BUILDINGS.filter((b) => b.role === role)[n];
const inFoot = (x, z, pad = 0.5) => BUILDINGS.some((b) => {
  const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
  return Math.abs(dx * c - dz * s) < b.w / 2 + pad && Math.abs(dx * s + dz * c) < b.d / 2 + pad;
});
const doorSpots = BUILDINGS.flatMap((b) => doorways(b).map((d) => d.at));
const nearDoor = (x, z, r = 2) => doorSpots.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < r);
const onStreetJunction = (x, z) => (z > 44.2 && z < 49.8 && x < 0) || (Math.abs(z - 15) < 3.6 && x > 5 && x < 12);

// Lamp posts at regular spacing down each street, alternating sides, never in a doorway or junction.
function lamps(street, list) {
  for (const [x, z] of list) if (!nearDoor(x, z, 1.7) && !inFoot(x, z, 0.3) && !onStreetJunction(x, z)) put('lamp', x, z, 0, { street });
}
{
  const side = (k, a, b) => (k % 2 ? a : b);
  const lake = [], bridge = [], quarry = [];
  for (let k = 0, z = 59.5; z > 28; z -= 6, k++) lake.push([side(k, -6.0, -10.0), z]);
  for (let k = 0, x = 12.5; x < 36; x += 6, k++) bridge.push([x, side(k, 13.2, 16.8)]);
  for (let k = 0, z = 3.5; z > -27; z -= 6, k++) quarry.push([side(k, -22.9, -27.1), z]);
  lamps('lake', lake);
  lamps('bridge', bridge);
  lamps('quarry', quarry);
  // The square: the four corners, and either side of the mouth of Lake Street.
  lamps('square', [[-22.8, 3.4], [6.6, 3.4], [-22.8, 25.0], [6.6, 25.2], [-11.2, 25.2], [-4.8, 25.2]]);
  // Church Lane: a pair at the lych-gate.
  lamps('church', [[-0.2, -9.6], [3.8, -9.6]]);
}

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
// The smithy: a quench trough, a barrel and a crate of coal beside the open front.
{
  const sm = B('smithy');
  const w = (lx, lz) => toWorld(sm, lx, lz);
  put('trough', ...w(2.3, 4.0), sm.rot + Math.PI / 2, { why: 'smithy quench trough' });
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
// The cooper: barrels along his wall.
{
  const co = R('cooper');
  const w = (lx, lz) => toWorld(co, lx, lz);
  for (const [lx, r] of [[1.3, 0], [2.1, 1], [2.9, 2]]) kit('Barrel', ...w(lx, 4.7), r, { r: 0.4, why: 'cooper barrels' });
  kit('Barrel_Holder', ...w(-3.1, 4.8), co.rot, { why: 'cooper cask rack' });
}
// Square: market stalls, a well, benches and a notice board.
for (const s of STALLS) put('stall', s.x, s.z, s.rot, { name: s.name, goods: s.goods });
put('well', WELL.x, WELL.z);
put('notice', -15.4, 4.9, 0, { why: 'notices, by the bank' });
kit('Bench', WELL.x - 3.4, WELL.z + 1.5, -Math.PI / 2, { why: 'well bench' });
kit('Bench', WELL.x + 3.4, WELL.z - 1.5, Math.PI / 2, { why: 'well bench' });
// Behind the stalls: the crates the stallholders sell from.
for (const s of STALLS.filter((t) => t.goods !== 'runes')) {
  const bx = s.x + Math.sin(s.rot) * -1.0, bz = s.z + Math.cos(s.rot) * -1.0;
  kit('Crate_Wooden', bx, bz + 0.6, s.rot, { r: 0.45, why: 'stall stock' });
}

// Signposts at the junctions.
put('sign', -11.9, 27.4, 0.35, { boards: [{ text: 'Bank', dir: [0.15, -1] }, { text: 'Chapel', dir: [0.9, -1] }, { text: 'Inn', dir: [1, -0.2] }, { text: 'Store', dir: [-1, -0.1] }], why: 'square, mouth of Lake Street' });
put('sign', 30.2, 16.5, 0, { boards: [{ text: 'Bridge & farms', dir: [1, 0] }, { text: 'Ashford', dir: [-1, 0] }], why: 'east gate' });
put('sign', -22.0, -21.6, 0, { boards: [{ text: 'Quarry & Warren', dir: [-0.2, -1] }, { text: 'Ashford', dir: [0.15, 1] }], why: 'north gate' });
put('sign', -5.0, 44.0, 0.2, { boards: [{ text: 'Wren Lane', dir: [-1, 0] }, { text: 'Stable Lane', dir: [1, 0] }, { text: 'Lake', dir: [0, 1] }], why: 'Lake Street crossroads' });
put('sign', 5.0, 3.6, 0, { boards: [{ text: 'Chapel', dir: [-0.3, -1] }], why: 'church lane mouth' });

// Churchyard: graves in rows either side of the chapel, a lych-gate at the lane end.
for (const gx of [-1.9, 10.6, 12.1]) for (let gz = -25.2; gz < -15.5; gz += 2.5) if (!(gx > 9 && gz > -21.5)) put('grave', gx, gz, 0.08 * (gz % 3), { why: 'churchyard' });
put('lychgate', 1.8, -11.0, 0, { why: 'churchyard entrance' });
kit('Bench', 6.4, -12.3, 0, { why: 'churchyard bench' });

// Cottages: a woodpile behind a few of them.
{
  const cots = BUILDINGS.filter((b) => b.role === 'cottage');
  for (const b of [cots[1], cots[6], cots[9], cots[12], R('cooper')]) {
    if (!b) continue;
    const [x, z] = toWorld(b, -b.w / 2 + 1.2, -b.d / 2 - 0.9);
    put('woodpile', x, z, b.rot + Math.PI / 2, { why: 'woodpile behind a cottage' });
  }
}
// The farm edge: hay cart, bales, a trough and pump for the animals.
put('cart', 26.4, 52.6, 0.5, { why: 'hay cart at the farm gate' });
put('bale', 24.2, 50.4, 0.3);
put('bale', 25.3, 50.6, -0.2);
put('bale', 24.7, 50.5, 0.1, { level: 1 });
put('haystack', 31.5, 58.5, 0, { r: 1.7, why: 'haystack in the farmyard' });
put('haystack', 33.5, 54.0, 0, { r: 1.3, why: 'haystack in the farmyard' });
put('trough', 24.4, 60.2, 1.57, { why: 'trough by the farm gate' });
put('pump', 23.4, 57.4, 0, { why: 'farmyard pump' });
put('trough', 30.0, 40.4, 0, { why: 'paddock trough' });
put('haystack', 17.4, 31.8, 0, { r: 1.5, why: 'paddock hay' });
put('bale', 20.4, 31.0, 0.4);
put('bale', 21.5, 31.2, 0);
// The stable on Bridge Street: a trough and hay outside.
{
  const st = R('stable');
  const w = (lx, lz) => toWorld(st, lx, lz);
  put('trough', ...w(-2.0, 4.9), st.rot, { why: 'stable trough' });
  put('bale', ...w(2.2, 4.6), st.rot);
}
put('pump', -51.3, 44.6, 0, { why: 'Wren Lane pump' });
// Washing lines in the back gardens.
put('washing', -48.4, 35.0, 0, { to: [-44.2, 35.0], why: 'washing line in a back garden' });
put('washing', -34.4, 35.2, 0, { to: [-29.8, 35.2], why: 'washing line in a back garden' });
put('washing', -48.4, 59.0, 0, { to: [-44.2, 59.0], why: 'washing line in a back garden' });
