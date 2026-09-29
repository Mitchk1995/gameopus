// The Ashford region, laid out by hand. Terrain, water, roads, forests and every placed
// thing read from this file, so the world is the same every time you load it.
// DESIGN.md ("Ashford Vale v2") explains why everything is where it is.
//
// Coordinates are metres: +x is east, +z is south, y is up. Water sits at y = 0.
//
// The order of a height query is: rolling land, hills and the rim wall, the town terrace,
// flattened pads (camps, the fort, points of interest), the lake and the river, then roads
// cut into whatever is there. Roads take their height from the land *before* they are cut
// (`surface0`), so a road profile never depends on itself.

import { TOWN, OUTLINE, polyDistance, riseAt, townGround } from './ashford.js';

export const WORLD = { size: 800, half: 400, water: 0 };

// Ashford's plan lives in ashford.js; VILLAGE is its centre, nominal radius and terrace height.
export const VILLAGE = { x: TOWN.x, z: TOWN.z, r: TOWN.r, y: TOWN.y };
export const LAKE = { x: -70, z: 250, r: 78 };
export const MINE_HILL = { x: -195, z: -205, r: 105, h: 38 };
export const MINE_ENTRANCE = { x: -170, z: -142, facing: 0.35 };
export const BANDIT_CAMP = { x: 262, z: 70, r: 22 };
export const GOBLIN_CAMP = { x: -96, z: -44, r: 9 };
// Just inside the south gate, looking up Lake Street to the market square and the bank.
export const SPAWN = { x: -8, z: 53, facing: Math.PI };

// Hills you can see from the square. Each is a soft dome; the landmark stands on its crown.
export const ABBEY_HILL = { x: -6, z: -204, r: 100, h: 42, crown: 20 };
export const BEACON_KNOLL = { x: 188, z: 4, r: 46, h: 34 };
// The high ground east of the river, running north from the beacon knoll.
const EAST_RIDGE = { pts: [[190, -8], [197, -70], [209, -130], [221, -190], [233, -240]], crest: [0, 1, 1, 0.9, 0.75], h: 26, w: 46 };
// The spot where the river is born: a stream falls down a cleft in the north cliffs into a pool.
export const FALLS = { pool: [152, -286], top: [150, -350], height: 46 };

// ------------------------------------------------------------------ small maths
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// A smooth minimum: the lower of two surfaces with the crease rounded over k metres.
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);

// Catmull-Rom smoothing so rivers and roads curve instead of kinking.
export function curve(pts, steps = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------------ noise
function hash(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, w = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(x, z) * a;
    w += a;
    x = x * 2.03 + 17.1;
    z = z * 2.03 - 9.7;
    a *= 0.5;
  }
  return s / w;
}
// Sharp-crested noise for mountain ridges.
export function ridged(x, z, oct = 5) {
  let s = 0, a = 0.5, w = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise(x, z) * 2 - 1);
    s += n * n * a;
    w += a;
    x = x * 2.1 + 5.3;
    z = z * 2.1 - 3.1;
    a *= 0.5;
  }
  return s / w;
}

// Distance from a point to a polyline, and how far along it (0..1) the nearest point is.
export function polylineDistance(x, z, pts) {
  let best = Infinity, bt = 0, total = 0;
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      bt = (acc + lens[i] * t) / total;
    }
    acc += lens[i];
  }
  return [best, bt];
}

// A soft-edged oval (1 inside, 0 outside) with a noise-wobbled edge, for painting regions.
function blob(x, z, cx, cz, rx, rz, rot = 0, feather = 0.5) {
  const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dz = z - cz;
  const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
  const d = Math.hypot(u, v) + (fbm(x * 0.016 + cx * 0.013, z * 0.016 + cz * 0.011) - 0.5) * 0.4;
  return smooth(1 + feather * 0.5, 1 - feather * 0.5, d);
}

// ------------------------------------------------------------------ the rim
// The foot of the mountain wall, clockwise from the west. Everything inside is the vale; the
// wall rises outside this line (noise only ever moves it inward, so the last 60 m before the
// map edge are always cliff). The lake bites into the south side: its far shore is a sheer wall.
export const RIM = [
  [-296, -10], [-292, -90], [-276, -160], [-250, -220], [-208, -262], [-156, -288], [-100, -294],
  [-40, -290], [30, -294], [100, -298], [152, -308], [212, -292], [258, -256], [292, -212],
  [306, -150], [308, -80], [310, -10], [312, 60], [316, 120], [312, 180], [298, 236], [266, 278],
  [218, 304], [150, 312], [90, 312], [40, 316], [-10, 316], [-70, 316], [-130, 316], [-186, 312],
  [-238, 284], [-278, 236], [-296, 170], [-300, 80],
];

// How far into the mountains a point is (negative inside the vale). The foot is wobbled and
// pushed inward (never outward) by spurs and coves, so the polygon is the outermost it can be.
export function rimDistance(x, z) {
  const d0 = polyDistance(x, z, RIM);
  if (d0 < -190) return d0;
  // Spurs and coves: curved ridges of a warped noise push the foot in and out.
  const wx = x + 46 * (fbm(x * 0.007 + 3, z * 0.007) - 0.5), wz = z + 46 * (fbm(x * 0.007, z * 0.007 + 7) - 0.5);
  const spur = ridged(wx * 0.014 + 4.1, wz * 0.014 + 3.7, 3);
  return d0 + 14 + (1 - spur) * 30 + fbm(x * 0.011 + 7, z * 0.011 - 3) * 18 + (fbm(x * 0.031 + 2, z * 0.031 + 9) - 0.5) * 12;
}

// Named peaks that break the skyline: [x, z, extra height, radius].
const PEAKS = [
  [-70, -372, 120, 62], [40, -384, 150, 60], [150, -368, 90, 52], [-190, -352, 84, 56], [-300, -320, 70, 54],
  [262, -346, 100, 58], [372, -250, 80, 54], [384, -90, 60, 52], [384, 120, 60, 50], [350, 300, 60, 54],
  [220, 372, 34, 54], [-40, 384, 34, 54], [-220, 372, 60, 54], [-376, 200, 70, 54], [-386, 20, 90, 54], [-374, -150, 80, 54],
];

function rimWall(x, z) {
  const d = rimDistance(x, z);
  if (d < -150) return 0;
  // Forested foothills that roll along the wall, then a stepped face: a stony slope, a cliff band,
  // an upper slope; ridges and named peaks behind.
  let h = smooth(-130, 6, d) * (6 + 8 * ridged(x * 0.011 + 1.1, z * 0.011 + 6.6, 3));
  h += 8 * smooth(-4, 12, d) + 40 * smooth(8, 52, d) + 52 * smooth(38, 68, d) + 32 * smooth(60, 110, d);
  if (d > 60) {
    h += smooth(60, 150, d) * (10 + 95 * ridged(x * 0.0075 + 2.7, z * 0.0075 - 8.1));
    for (const [px, pz, ph, pr] of PEAKS) {
      const q = Math.hypot(x - px, z - pz) / pr;
      if (q < 2.4) h += ph * Math.exp(-q * q * 1.15) * smooth(50, 100, d);
    }
  }
  return h;
}

// ------------------------------------------------------------------ roads
// The class of a road sets how it is painted and cut. `width` is the painted half-width
// including shoulders (also how far trees keep back); `half` is the flat carriageway.
//   road   wide dirt road, gate to gate       track  narrower lanes to farms, camps and sites
//   path   footpaths to shrines, huts and viewpoints
const CLASS = {
  road: { width: 3.2, half: 2.5, grade: 0.13, cut: 1.1, fill: 0.75, infl: 24, paint: 1 },
  track: { width: 2.2, half: 1.55, grade: 0.16, cut: 1.2, fill: 0.9, infl: 14, paint: 0.9 },
  path: { width: 1.3, half: 0.85, grade: 0.24, cut: 1.5, fill: 1.1, infl: 8, paint: 0.64 },
};

// Every road is a list of waypoints (smoothed into a curve). `ends` names the place at each end,
// for the signposts. The first six keep their old indexes (the town test and the ledger quest read
// them): 0 Quarry Road, 1 Bridge Street, 2 Lake Street, 3 farm lane, 4 farm gate track, 5 woodcutters' track.
// `zone` deepens the cutting round a pass, so the road runs in a gorge.
const ROAD_DEFS = [
  { id: 'quarry', name: 'Quarry Road', cls: 'road', ends: ['Ashford', 'the Quarry'], way: [[-27, -22], [-29, -36], [-72, -86], [-120, -122], [-160, -140]] },
  { id: 'bridge', name: 'Bridge Street', cls: 'road', ends: ['Ashford', 'Bandit Fort'], way: [[32, 15], [50, 13], [70, 4], [110, 2], [140, 14], [162, 34], [196, 50], [230, 58], [247, 64]] },
  { id: 'lake', name: 'Lake Street', cls: 'road', ends: ['Ashford', 'the Dock'], way: [[-8, 58], [-9, 82], [-34, 140], [-52, 168]] },
  { id: 'farmlane', name: 'Farm Lane', cls: 'track', ends: ['Bridge Street', 'the Farms'], width: 2.2, way: [[158, 32], [150, 80], [132, 140]] },
  { id: 'farmgate', name: 'Farm Track', cls: 'track', ends: ['Ashford', 'the Flax Field'], width: 2.0, way: [[20, 60], [26, 72], [44, 72]] },
  { id: 'woodcutters', name: "Woodcutters' Track", cls: 'track', ends: ['Ashford', 'the Woods'], width: 1.8, way: [[-50, 47], [-72, 58], [-100, 84], [-118, 102]] },
  // --- the ways out
  { id: 'highroad', name: 'The Highroad', cls: 'road', ends: ['the Quarry', 'North Pass'], way: [[-124, -125], [-108, -152], [-94, -182], [-88, -212], [-90, -240], [-98, -258], [-106, -270]], zone: { x: -106, z: -270, r: 22, cut: 3.2, infl: 16 } },
  { id: 'eastroad', name: 'East Road', cls: 'road', ends: ['Bandit Fort', 'East Pass'], way: [[281, 74], [290, 84], [298, 94], [314, 104], [334, 110], [350, 122], [358, 142], [352, 164]] },
  { id: 'harbour', name: 'Harbour Road', cls: 'road', ends: ['the Dock', 'South Pass'], way: [[-46, 160], [-14, 176], [18, 196], [34, 228], [38, 266], [44, 282], [48, 292], [56, 314], [70, 332], [90, 344], [112, 346]] },
  // --- tracks and footpaths to the places worth walking to
  { id: 'abbey', name: 'Pilgrims\' Way', cls: 'track', ends: ['Quarry Road', 'the Abbey'], width: 2.0, way: [[-30, -38], [-24, -76], [-16, -108], [10, -124], [34, -136], [44, -147], [32, -155], [0, -160], [-30, -165], [-42, -174], [-32, -183], [0, -188], [28, -191], [40, -200], [28, -207], [0, -209], [-22, -211], [-12, -216]] },
  { id: 'goblin', name: 'Goblin Trail', cls: 'path', ends: ['Quarry Road', 'Goblin Camp'], way: [[-72, -86], [-84, -64], [-92, -50]] },
  { id: 'headframe', name: 'Yard Path', cls: 'path', ends: ['the Quarry', 'the Headframe'], way: [[-160, -140], [-150, -150], [-152, -162], [-166, -166], [-178, -160], [-184, -170]] },
  { id: 'stones', name: 'Stones Path', cls: 'path', ends: ['Bridge Street', 'the Standing Stones'], way: [[66, 4], [68, -40], [72, -80], [74, -90]] },
  { id: 'sawmill', name: 'Mill Track', cls: 'track', ends: ['Bridge Street', 'the Sawmill'], width: 2.0, way: [[112, 3], [122, -40], [132, -100], [144, -150], [150, -164]] },
  { id: 'ridge', name: 'Ridge Track', cls: 'track', ends: ['the Sawmill', 'the Quarry Ridge'], width: 2.0, way: [[150, -190], [178, -194], [206, -200], [224, -206]] },
  { id: 'beacon', name: 'Beacon Path', cls: 'path', ends: ['Bridge Street', 'the Beacon'], way: [[190, 50], [215, 32], [224, 4], [210, -17], [188, -24], [170, -14], [166, 4], [174, 18], [188, 20], [188, 12]] },
  { id: 'waystation', name: 'Waystation Spur', cls: 'path', ends: ['Bridge Street', 'the Waystation'], way: [[178, 46], [178, 58]] },
  { id: 'battlefield', name: 'Old Battle Road', cls: 'track', ends: ['the Farms', 'the Old Battlefield'], width: 2.0, way: [[132, 140], [160, 164], [186, 184], [196, 190]] },
  { id: 'hermit', name: "Hermit's Path", cls: 'path', ends: ["Woodcutters' Track", "the Hermit's Hut"], way: [[-118, 102], [-150, 92], [-190, 74], [-230, 60], [-256, 54]] },
  { id: 'sunken', name: 'Shoal Path', cls: 'path', ends: ["Woodcutters' Track", 'the Sunken Ruin'], way: [[-118, 102], [-125, 150], [-136, 200], [-140, 238], [-142, 250]] },
  { id: 'hamlet', name: 'Hamlet Lane', cls: 'path', ends: ['Harbour Road', 'the Hamlet'], way: [[27, 213], [36, 213], [44, 214]] },
  { id: 'lighthouse', name: 'Lighthouse Path', cls: 'path', ends: ['Harbour Road', 'the Lighthouse'], way: [[27, 213], [20, 218], [14, 226]] },
];

export const ROADS = ROAD_DEFS.map((d) => {
  const c = CLASS[d.cls];
  return { ...d, width: d.width ?? c.width, half: d.half ?? c.half, grade: c.grade, cut: c.cut, fill: c.fill, infl: c.infl, paint: c.paint, pts: curve(d.way, d.steps || 6) };
});
export const roadById = (id) => ROADS.find((r) => r.id === id);
// The stone bridge on Bridge Street, where the road crosses the river.
export const BRIDGE = { x: 90, z: 3, along: [1, 0], half: 15 };

// Where the river is born and how it runs to the lake.
export const RIVER = curve([
  [152, -286], [150, -262], [152, -232], [132, -190], [104, -136], [88, -76], [90, -22],
  [92, 34], [74, 96], [30, 158], [-18, 198], [-42, 222],
]);
const RIVER_WIDTH = (t) => 4.2 + t * 4.2 + 5 * smooth(0.07, 0, t);

// Tree cover. Density 0..1; kinds are ez-tree species.
export const FORESTS = [
  { x: -230, z: 20, r: 140, density: 0.9, kinds: ['oak', 'ash', 'pine'] },
  { x: -120, z: 110, r: 70, density: 0.55, kinds: ['oak', 'aspen'] },
  { x: 250, z: -120, r: 120, density: 0.8, kinds: ['pine', 'ash'] },
  { x: 285, z: 90, r: 75, density: 0.6, kinds: ['oak', 'ash'] },
  { x: 40, z: -190, r: 90, density: 0.45, kinds: ['aspen', 'oak'] },
  { x: -300, z: -290, r: 90, density: 0.7, kinds: ['pine'] },
];
export const FARMS = [
  { x: 118, z: 118, w: 70, d: 46, rot: 0.2 },
  { x: 62, z: 70, w: 40, d: 30, rot: -0.1 },
];

// ------------------------------------------------------------------ land
function rolling(x, z) {
  // Gently rolling land with some broad swells.
  let h = 4.4 + (fbm(x * 0.0065 + 3.1, z * 0.0065 - 1.7) - 0.5) * 10 + (fbm(x * 0.028, z * 0.028) - 0.5) * 2.2;
  // Only the river and the lake hold water: low ground bottoms out gently above it.
  if (h < 2.4) h = 2.4 - (2.4 - h) * 0.25;
  return h;
}

// A hill with a broad, nearly flat crown and firm flanks (a plain Gaussian is too pointed).
const dome = (d, p = 2.6, k = 2.4) => Math.exp(-Math.pow(d, p) * k);
// The rise the bandit fort stands on.
const FORT_HILL = { x: BANDIT_CAMP.x, z: BANDIT_CAMP.z, r: 56, h: 6 };

function hills(x, z) {
  let h = 0;
  // Mine Hill with a craggy top.
  const dm = Math.hypot(x - MINE_HILL.x, z - MINE_HILL.z) / MINE_HILL.r;
  if (dm < 2) h += MINE_HILL.h * Math.exp(-dm * dm * 2.2) * (0.75 + 0.5 * fbm(x * 0.02, z * 0.02)) + 9 * Math.exp(-dm * dm * 3.2) * ridged(x * 0.035 + 1.3, z * 0.035 - 4.2);
  // Abbey Hill: a broad dome north of the town, nearly flat on the crown for the ruin.
  const da = Math.hypot(x - ABBEY_HILL.x, z - ABBEY_HILL.z) / ABBEY_HILL.r;
  if (da < 2) h += ABBEY_HILL.h * dome(da) * (0.94 + 0.12 * fbm(x * 0.02 + 8, z * 0.02));
  // The beacon knoll and the ridge running north from it.
  const db = Math.hypot(x - BEACON_KNOLL.x, z - BEACON_KNOLL.z) / BEACON_KNOLL.r;
  if (db < 2) h += BEACON_KNOLL.h * dome(db, 2.4, 2.2) * (0.94 + 0.12 * fbm(x * 0.03, z * 0.03));
  const [dr, tr] = polylineDistance(x, z, EAST_RIDGE.pts);
  if (dr < 130) {
    const seg = tr * (EAST_RIDGE.crest.length - 1), i = Math.min(EAST_RIDGE.crest.length - 2, Math.floor(seg));
    const crest = mix(EAST_RIDGE.crest[i], EAST_RIDGE.crest[i + 1], seg - i);
    const q = dr / EAST_RIDGE.w;
    h += EAST_RIDGE.h * crest * Math.exp(-q * q * 1.7) * (0.7 + 0.6 * fbm(x * 0.017 + 5, z * 0.017));
  }
  const df = Math.hypot(x - FORT_HILL.x, z - FORT_HILL.z) / FORT_HILL.r;
  if (df < 2) h += FORT_HILL.h * dome(df, 2.2, 2.0);
  return h;
}

// Rocky heath: small knolls of stone in the north-east of the vale.
function heathBumps(x, z) {
  const m = HEATH_ZONES.reduce((a, [cx, cz, rx, rz]) => Math.max(a, blob(x, z, cx, cz, rx, rz)), 0);
  if (m < 0.02) return 0;
  return m * (1.2 + 4.6 * ridged(x * 0.045 + 3, z * 0.045 + 11, 3));
}

// Where a road leaves the vale through the wall it runs in a gorge, and the gorge is built rather than
// left to chance: from `gorge.from` metres along the road to the road's end the floor is level across and
// climbs at the roads' own grade (so the road can follow it), it is `narrow` metres to each side of the
// road and widens to `wide` for `span` metres round the closure (a level floor for towers or a toll
// hut to stand on), and the walls beyond it are a steep, lumpy, stepped rock face on both sides. Where the
// natural wall is lower than that face (the mouth of the East Pass has none on its south side) the
// face is built up to meet it, so a closure always stands between two walls it can be anchored in.
let NOTCHES = null;
function notches() {
  if (NOTCHES) return NOTCHES;
  NOTCHES = []; // while they are being worked out the gorges do not exist yet (the pads are levelled on the land as it was)
  return (NOTCHES = EXITS.filter((e) => e.gorge).map((e, i) => {
    const g = e.gorge, r = roadById(e.road);
    const start = pointAt(r, g.from);
    const pts = [start, ...r.pts.filter((p) => roadAt(e.road, p[0], p[1]).s > g.from + 1)];
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [px, pz] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
    const uc = e.s - g.from;
    // The floor starts where the road would run here without the gorge (its profile over the land as it
    // was) and climbs a hair under the road's own grade, so the road can sit on it.
    const pre = buildProfile(r, (x, z) => surface0(x, z, land0), []);
    const y = pre.ys[clamp(Math.round(g.from / pre.ds), 0, pre.n - 1)];
    return { id: e.id, roadId: e.road, pts, cum, uc, g, seed: 7.3 + i * 31.7, y, climb: r.grade * 0.99, box: [x0 - 90, x1 + 90, z0 - 90, z1 + 90] };
  }));
}
// Half-width of a gorge's flat floor at distance u along it: `narrow`, widening to `wide` round the closure.
function gorgeHalfWidth(n, u) {
  const { narrow, wide, span } = n.g, a = n.uc - span / 2, b = n.uc + span / 2;
  return narrow + (wide - narrow) * smooth(a - 14, a, u) * smooth(b + 14, b, u);
}
// Height of the gorge wall above the floor, s metres out from the floor's edge: a 2.7:1 rock face for the
// first 7 m easing to 1.15:1, lumpy with buttresses and gullies and stepped with ledges. Never flatter than
// about 1.6:1 in the first 7 m, so the foot of a wall cannot be climbed.
function gorgeWall(s, u, seed) {
  if (s <= 0) return 0;
  // Built as a sum of slopes, so the face never leans back on itself: 2.7:1 for the first 6 m easing to 1.2:1
  // by 9 m, each metre's slope varied by the noise (buttresses where the face is steeper, gullies where it eases)
  // and by a ledge rhythm.
  let h = 0;
  const top = Math.min(s, 34);
  for (let t = 0; t < top; t += 1) {
    const d = Math.min(1, top - t), tm = t + d / 2;
    const base = tm < 6 ? 2.7 : tm < 9 ? 2.7 - (tm - 6) * 0.5 : 1.2;
    const n = clamp((fbm(u * 0.075 + seed, tm * 0.12 + seed * 0.5) - 0.5) * 3.4, -1, 1);
    h += d * base * (1 + 0.42 * n + 0.14 * Math.sin(tm * 0.9 + n * 3));
  }
  return s > 34 ? h + (s - 34) * 1.1 : h;
}
// Signed distance behind the start of a gorge along its first segment, and the nearest point's lateral
// distance and distance along it.
function gorgeFrame(n, x, z) {
  let best = Infinity, u = 0;
  for (let i = 0; i < n.pts.length - 1; i++) {
    const [ax, az] = n.pts[i], [bx, bz] = n.pts[i + 1], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; u = n.cum[i] + Math.hypot(dx, dz) * t; }
  }
  const [sx, sz] = n.pts[0];
  const back = ((x - sx) * (n.pts[1][0] - sx) + (z - sz) * (n.pts[1][1] - sz)) / (Math.hypot(n.pts[1][0] - sx, n.pts[1][1] - sz) || 1);
  return { best, u, back };
}
function passNotch(h, x, z) {
  for (const n of notches()) {
    if (x < n.box[0] || x > n.box[1] || z < n.box[2] || z > n.box[3]) continue;
    const { best, u, back } = gorgeFrame(n, x, z);
    const half = gorgeHalfWidth(n, u), s = Math.max(0, best - half);
    const target = n.y + u * n.climb + gorgeWall(s, u, n.seed);
    const along = smooth(-16, 6, back) * smooth(90, 60, best);
    // The floor is exactly level across and exactly on the road's line (nothing to blend); the walls are eased into
    // the land they meet.
    if (best <= half) h = mix(h, target, along);
    else if (target < h) h = mix(h, smin(h, target, 2.5), along);
    else if (s < 30) h = mix(h, smax(h, target, 2), smooth(-8, 26, back) * smooth(30, 16, s));
  }
  return h;
}
// After the roads have been cut, a gorge's floor is put back exactly level: the road runs on the floor, so the
// road's cut and bank (which swing either way by a hair) must not leave ridges and grooves along its edges.
function gorgeFloorSet(h, x, z) {
  for (const n of notches()) {
    if (x < n.box[0] || x > n.box[1] || z < n.box[2] || z > n.box[3]) continue;
    const { best, u, back } = gorgeFrame(n, x, z);
    const half = gorgeHalfWidth(n, u);
    if (best > half + 0.4) continue;
    h = mix(h, n.y + u * n.climb, smooth(-16, 6, back) * smooth(half + 0.4, half - 0.2, best));
  }
  return h;
}
// The level of a gorge's floor at a point along it (metres from its start).
export function gorgeFloor(id, x, z) {
  const n = notches().find((q) => q.id === id);
  if (!n) return null;
  const { best, u } = gorgeFrame(n, x, z);
  return { y: n.y + u * n.climb, half: gorgeHalfWidth(n, u), lateral: best, u };
}
const land = (x, z) => passNotch(land0(x, z), x, z);

// Land before anything is cut or flattened into it: rolling ground, hills, the wall, the town terrace and the fields.
function land0(x, z) {
  let h = rolling(x, z) + hills(x, z) + heathBumps(x, z) + rimWall(x, z);
  // The town sits on a level terrace that follows its wall, grading into the land beyond it;
  // the chapel stands on a gentle rise inside.
  const dv = Math.max(0, polyDistance(x, z, OUTLINE));
  h = mix(h, VILLAGE.y + riseAt(x, z), smooth(30, 0, dv));
  // Farms are flat.
  for (const f of FARMS) {
    const d = Math.max(Math.abs(x - f.x) - f.w / 2, Math.abs(z - f.z) - f.d / 2);
    h = mix(h, 2.4, smooth(14, 0, d) * 0.85);
  }
  return h;
}

// ------------------------------------------------------------------ pads
// Places that are flat and level on purpose: the camps, the fort, the landmarks, the sites the
// next helper will build on. Each has a flat radius `r` (the level ground) and grades out beyond it.
// A POI's `x, z, r, facing` are all its next builder needs; `road` is the road or footpath that joins it.
export const POIS = [
  { id: 'hermit', name: "Hermit's Hut", kind: 'hut', x: -262, z: 52, r: 9, facing: 0.6, road: 'hermit', note: 'A hut in a clearing deep in the goblin woods.' },
  { id: 'stones', name: 'The Standing Stones', kind: 'shrine', x: 74, z: -100, r: 13, facing: 0, road: 'stones', note: 'A ring of old stones on a heath knoll.' },
  { id: 'sunken', name: 'The Sunken Ruin', kind: 'ruin', x: -142, z: 256, r: 12, facing: 0, road: 'sunken', note: 'Old walls in the lake shallows, reached along a shoal.' },
  { id: 'waystation', name: 'Crossroads Waystation', kind: 'inn', x: 178, z: 61, r: 13, facing: 3.14, road: 'waystation', note: 'The last inn before bandit country, on the East Road where the farm lane joins it.' },
  { id: 'quarry', name: 'Greystone Quarry', kind: 'quarry', x: 226, z: -206, r: 16, facing: 3.8, road: 'ridge', note: 'A stone quarry on the north-east ridge.' },
  { id: 'sawmill', name: 'Riverside Sawmill', kind: 'sawmill', x: 150, z: -176, r: 14, facing: -1.6, road: 'sawmill', note: 'A sawmill site on the east bank of the river.' },
  { id: 'hamlet', name: 'Netmender Hamlet', kind: 'hamlet', x: 54, z: 214, r: 17, facing: 3.14, road: 'hamlet', note: 'A fishing hamlet on the lake shore, off the Harbour Road.' },
  { id: 'battlefield', name: 'The Old Battlefield', kind: 'field', x: 196, z: 196, r: 26, facing: 0, road: 'battlefield', note: 'A wide, level plain where an old battle was fought.' },
];

// [x, z, level radius, blend radius, how the level is chosen: 'top' = the land at the middle, 'mean' = its average nearby]
const PADS = [
  [BANDIT_CAMP.x, BANDIT_CAMP.z, 27, 18, 'mean'],
  [GOBLIN_CAMP.x, GOBLIN_CAMP.z, 14, 12, 'mean'],
  [ABBEY_HILL.x, ABBEY_HILL.z, 16, 22, 'top'],
  [BEACON_KNOLL.x, BEACON_KNOLL.z, 9, 14, 'top'],
  [MINE_ENTRANCE.x + 16, MINE_ENTRANCE.z + 10, 20, 16, 'mean'],
  ...POIS.map((p) => [p.x, p.z, p.r, p.r * 0.9 + 6, 'mean']),
];
const padHeight = new Map();
function padY(i) {
  if (!padHeight.has(i)) {
    const [px, pz, r, , mode] = PADS[i];
    let s = land(px, pz), n = 1;
    if (mode === 'mean') for (let k = 0; k < 8; k++) { s += land(px + Math.cos(k * 0.785) * r * 0.8, pz + Math.sin(k * 0.785) * r * 0.8); n++; }
    padHeight.set(i, s / n);
  }
  return padHeight.get(i);
}
export function padLevel(id) {
  const k = POIS.findIndex((p) => p.id === id);
  return k < 0 ? null : padY(5 + k);
}
export const BANDIT_LEVEL = () => padY(0);

// The land with the pads flattened into it (what roads follow, and what the water and roads then cut).
// `ground` is the land to flatten them into (`land0` gives the land before the gorges are built).
export function surface0(x, z, ground = land) {
  let h = ground(x, z);
  for (let i = 0; i < PADS.length; i++) {
    const [px, pz, r, b] = PADS[i];
    const d = Math.hypot(x - px, z - pz);
    if (d < r + b) h = mix(h, padY(i), smooth(r + b, r, d));
  }
  return h;
}

// ------------------------------------------------------------------ regions and biomes
const HEATH_ZONES = [[74, -104, 70, 64], [130, -150, 54, 100], [40, -160, 62, 40]];
const BIRCH_ZONES = [[-118, 108, 64, 54], [44, -196, 88, 64], [-30, 160, 40, 30]];
const MEADOW_ZONES = [[70, 84, 130, 84], [-6, 132, 120, 52], [120, 6, 80, 60]];
const WOODS_ZONES = [[-220, 6, 150, 210], [-120, 110, 76, 62]];
const BANDIT_ZONES = [[292, 0, 124, 214, 0]];
const MINE_ZONES = [[MINE_HILL.x, MINE_HILL.z, 118, 112]];

const max = (a, f) => a.reduce((m, z) => Math.max(m, f(z)), 0);
// How much of each ring a point belongs to (0..1 each, not normalised).
export function rings(x, z) {
  const dv = polyDistance(x, z, OUTLINE);
  const town = smooth(20, -4, dv);
  const woods = max(WOODS_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz));
  const bandit = max(BANDIT_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz));
  const mine = max(MINE_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz));
  const farm = max(MEADOW_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz)) * (1 - town);
  const wall = smooth(-30, 40, rimDistance(x, z));
  return { town, farm, woods, bandit, mine, wall };
}

// Painted biome weights: [meadow, heath, marsh, dry, moss, dust], each 0..1.
export function biomeAt(x, z) {
  const R = rings(x, z);
  const meadow = Math.max(R.farm, max(BIRCH_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz)) * 0.4, blob(x, z, ABBEY_HILL.x, ABBEY_HILL.z, 118, 108) * 0.9) * (1 - R.woods * 0.7);
  const heath = max(HEATH_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz)) * (1 - R.town) * (1 - R.farm * 0.6);
  // The marsh: the lake's west, south-west and south shores, low and wet.
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z), ang = Math.atan2(z - LAKE.z, x - LAKE.x);
  const side = smooth(0.35, 1.25, Math.cos(ang - 2.55) * 0.5 + 0.5 + (fbm(x * 0.02, z * 0.02) - 0.5) * 0.3);
  const marsh = smooth(LAKE.r + 62, LAKE.r + 8, dl) * side;
  const dry = R.bandit;
  const moss = R.woods;
  const dust = R.mine;
  return [meadow, heath, marsh, dry, moss, dust];
}

// ------------------------------------------------------------------ roads: profiles and stamps
// A road's height is the land's height under it, smoothed and limited to a gentle grade, pinned where
// it joins another road or a fixed place. Built on first use.
let PROFILES = false;
const PIN = new Map(); // road id -> [y at start, y at end] (numbers or null)

function resample(pts, ds) {
  const xs = [pts[0][0]], zs = [pts[0][1]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    let t = ds - carry;
    while (t < l) {
      xs.push(ax + ((bx - ax) * t) / l);
      zs.push(az + ((bz - az) * t) / l);
      t += ds;
    }
    carry = l - (t - ds);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(xs[xs.length - 1] - last[0], zs[zs.length - 1] - last[1]) > ds * 0.25) { xs.push(last[0]); zs.push(last[1]); }
  else { xs[xs.length - 1] = last[0]; zs[zs.length - 1] = last[1]; }
  return { xs, zs };
}

function nearestOnRoad(r, x, z) {
  const p = r.prof;
  let best = Infinity, by = 0, bi = 0;
  for (let i = 0; i < p.n - 1; i++) {
    const dx = p.xs[i + 1] - p.xs[i], dz = p.zs[i + 1] - p.zs[i];
    const t = clamp(((x - p.xs[i]) * dx + (z - p.zs[i]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = Math.hypot(x - (p.xs[i] + dx * t), z - (p.zs[i] + dz * t));
    if (d < best) { best = d; by = mix(p.ys[i], p.ys[i + 1], t); bi = i; }
  }
  return { d: best, y: by, i: bi };
}

// One road's profile: the height of `surf` along it, smoothed, pinned to the roads it joins and limited to
// its grade. `gorge` (a row of notches()) puts the road on its gorge's floor instead of on the land.
function buildProfile(r, surf, built, gorge = null) {
  const DS = 2;
  const { xs, zs } = resample(r.pts, DS);
  const n = xs.length;
  const raw = xs.map((x, i) => surf(x, zs[i]));
  // Smooth over about 30 m.
  const W = 7;
  const y = raw.map((_, i) => {
    let s = 0, k = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += raw[j]; k++; }
    return s / k;
  });
  // Join other roads at the same height, or at a pinned height.
  const pin = PIN.get(r.id) || [null, null];
  const joinY = (x, z) => {
    let best = 3.5, yy = null;
    for (const o of built) {
      const q = nearestOnRoad(o, x, z);
      if (q.d < best) { best = q.d; yy = q.y; }
    }
    return yy;
  };
  const y0 = pin[0] ?? joinY(xs[0], zs[0]), y1 = pin[1] ?? joinY(xs[n - 1], zs[n - 1]);
  // Carry the pinned offsets along the road, fading over 60 m.
  if (y0 != null) { const off = y0 - y[0]; for (let i = 0; i < n; i++) y[i] += off * smooth(30, 0, i); }
  if (y1 != null) { const off = y1 - y[n - 1]; for (let i = 0; i < n; i++) y[i] += off * smooth(30, 0, n - 1 - i); }
  // Limit the grade, both ways round, holding the pinned ends.
  const g = r.grade * DS;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - g, y[i - 1] + g);
    for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - g, y[i + 1] + g);
  }
  // In a gorge the road runs exactly on the gorge's floor (see notches()), which climbs at a hair under the
  // road's grade; before the gorge it eases onto it.
  if (gorge) for (let i = 0; i < n; i++) {
    const u = i * DS - gorge.g.from;
    y[i] = mix(y[i], gorge.y + Math.max(0, u) * gorge.climb, smooth(-14, 0, u));
  }
  return { n, xs, zs, ys: y, ds: DS, y0, y1 };
}

function computeProfiles() {
  if (PROFILES) return;
  PROFILES = true;
  const built = [];
  for (const r of ROADS) {
    r.prof = buildProfile(r, surface0, built, notches().find((q) => q.roadId === r.id));
    built.push(r);
  }
  // Index the segments in cells, each listed in every cell its influence reaches.
  const CELL = 24;
  const grid = new Map();
  ROADS.forEach((r, ri) => {
    const p = r.prof;
    for (let i = 0; i < p.n - 1; i++) {
      const zone = r.zone && Math.hypot(p.xs[i] - r.zone.x, p.zs[i] - r.zone.z) < r.zone.r ? r.zone : null;
      const infl = (zone ? zone.infl : r.infl) + r.width;
      const x0 = Math.floor((Math.min(p.xs[i], p.xs[i + 1]) - infl) / CELL), x1 = Math.floor((Math.max(p.xs[i], p.xs[i + 1]) + infl) / CELL);
      const z0 = Math.floor((Math.min(p.zs[i], p.zs[i + 1]) - infl) / CELL), z1 = Math.floor((Math.max(p.zs[i], p.zs[i + 1]) + infl) / CELL);
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) {
          const k = cx * 4096 + cz;
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(ri, i, zone ? 1 : 0);
        }
    }
  });
  ROAD_GRID = { CELL, grid };
}
let ROAD_GRID = null;

// The roads near a point: for each road its nearest segment (distance, height, zone).
const NEAR = [];
function nearRoads(x, z) {
  computeProfiles();
  NEAR.length = 0;
  const { CELL, grid } = ROAD_GRID;
  const list = grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!list) return NEAR;
  const seen = {};
  for (let q = 0; q < list.length; q += 3) {
    const ri = list[q], i = list[q + 1], r = ROADS[ri], p = r.prof;
    const ax = p.xs[i], az = p.zs[i], dx = p.xs[i + 1] - ax, dz = p.zs[i + 1] - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    const cur = seen[ri];
    if (cur && cur.d <= d) continue;
    const e = cur || { r, ri };
    e.d = d;
    e.y = mix(p.ys[i], p.ys[i + 1], t);
    e.zone = list[q + 2] ? r.zone : null;
    e.i = i;
    if (!cur) { seen[ri] = e; NEAR.push(e); }
  }
  return NEAR;
}

// Whether the road here is a bridge (no cutting: the river passes under).
function onBridge(x, z) {
  return Math.abs(x - BRIDGE.x) < BRIDGE.half && Math.abs(z - BRIDGE.z) < 9;
}

function roadStamp(h, x, z) {
  const list = nearRoads(x, z);
  if (!list.length) return h;
  // The town terrace is level and carries its own streets: roads only start to cut outside the walls.
  const outside = smooth(0, 12, polyDistance(x, z, OUTLINE));
  if (outside <= 0) return h;
  for (const e of list) {
    const r = e.r;
    if (r.id === 'bridge' && onBridge(x, z)) continue;
    const cut = e.zone ? e.zone.cut : r.cut, infl = e.zone ? e.zone.infl : r.infl;
    const dd = Math.max(0, e.d - r.half);
    if (dd > infl) continue;
    // Above the road the ground is cut back; below it, banked up.
    const target = h > e.y ? smin(h, e.y + dd * cut, 1.6) : smax(h, e.y - dd * r.fill, 1.2);
    const k = outside * smooth(infl, infl * 0.6, dd);
    h = mix(h, dd < 0.01 ? e.y : target, k);
    if (dd < 0.01) h = mix(h, e.y, outside);
  }
  return h;
}

// Painted road cover: [distance to the road's edge, painted half-width, paint strength] of the closest road.
export function roadDistance(x, z) {
  let best = Infinity, width = 3, paint = 1;
  for (const e of nearRoads(x, z)) {
    if (e.r.id === 'bridge' && onBridge(x, z)) continue;
    if (e.d - e.r.width < best - width) { best = e.d; width = e.r.width; paint = e.r.paint; }
  }
  roadDistance.paint = paint;
  return [best, width];
}
roadDistance.paint = 1;

// ------------------------------------------------------------------ height
export function heightAt(x, z) {
  let h = surface0(x, z);

  // The river cuts a channel with sloped banks, widening downstream.
  const [dRiver, t] = polylineDistance(x, z, RIVER);
  const w = RIVER_WIDTH(t);
  if (dRiver < w + 26) {
    h = mix(h, Math.min(h, 1.9), smooth(w + 16, w + 3, dRiver));
    h = mix(h, -1.7 - t * 0.9, smooth(w + 3, w - 1.5, dRiver));
  }

  // The lake basin, with an irregular shore.
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 1.4 + 40) {
    const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const lr = LAKE.r * (0.86 + 0.28 * fbm(Math.cos(ang) * 2 + 9, Math.sin(ang) * 2));
    h = mix(h, Math.min(h, 1.6), smooth(lr + 22, lr + 4, dl));
    h = mix(h, -4.5 + (dl / lr) * 3, smooth(lr + 4, lr - 6, dl));
  }

  // Roads are cut into the land (and hold themselves above the marsh).
  h = roadStamp(h, x, z);
  h = gorgeFloorSet(h, x, z);
  // The North Pass's porch is set into the rock at the end of the Highroad.
  h = portalFace(h, x, z);
  return Math.min(h, 320);
}

// ------------------------------------------------------------------ ground cover
// Weights for the painted ground layers at a point: [path, forest floor, cobble].
export function groundAt(x, z) {
  const [rd, rw] = roadDistance(x, z);
  const paintK = roadDistance.paint;
  const n = fbm(x * 0.15, z * 0.15);
  let path = smooth(rw + 0.9, rw - 0.6, rd + (n - 0.5) * 1.6) * paintK;
  // Ashford's streets and square are cobbled; lanes and yards are trodden earth.
  const [tDirt, tCobble] = townGround(x, z);
  // The forecourts of the gatehouse and the toll bar are paved.
  const cobble = Math.min(1, Math.max(tCobble, exitApron(x, z, n)) * (0.86 + 0.28 * n));
  path = Math.max(path, tDirt * (0.8 + 0.4 * n));
  let forest = 0;
  for (const f of FORESTS) {
    const d = Math.hypot(x - f.x, z - f.z) / f.r;
    forest = Math.max(forest, smooth(1.05, 0.7, d + (fbm(x * 0.03, z * 0.03) - 0.5) * 0.5) * f.density);
  }
  const db = Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z);
  path = Math.max(path, smooth(BANDIT_CAMP.r, BANDIT_CAMP.r - 8, db) * 0.8);
  // (No forest floor under paving: whatever grows on the forest floor keeps off the forecourts.)
  return [path, forest * (1 - path) * (1 - cobble), cobble];
}

export function forestDensity(x, z) {
  // Woods climb the foothills and thin out where the slopes turn to rock.
  const e = rimDistance(x, z);
  const band = smooth(-100, -50, e) * smooth(12, -8, e) * smooth(0.35, 0.6, fbm(x * 0.02 + 2, z * 0.02 + 8));
  let d = band * 0.75, kinds = band > 0 ? (fbm(x * 0.004, z * 0.004) > 0.5 ? ['pine', 'pine', 'ash'] : ['pine', 'oak', 'ash']) : null;
  for (const f of FORESTS) {
    const k = smooth(1.0, 0.55, Math.hypot(x - f.x, z - f.z) / f.r) * f.density;
    if (k > d) {
      d = k;
      kinds = f.kinds;
    }
  }
  return [d, kinds];
}

// ------------------------------------------------------------------ the ways out
// Three passes lead out of the vale, and all three are sealed. Each is a row of data: a quest that
// sets `locked: false` (world.sites.setLocked(id, false)) opens the way. `at` is where the closure
// stands on its road; the position, facing (the way it looks into the vale) and height come from
// the road there. `kind` picks how it is built (exits.js): a collapsed tunnel portal, a barred
// gatehouse, a toll bar. `gorge` shapes the ground round the two that stand in a gorge (see
// notches()); `portal` sizes the North Pass's masonry porch (see portalFace()); `apron` paves a forecourt (metres
// from the closure along the road, negative in front of it, and half-width across; see exitApron()). `clear` is how
// far trees and props must keep from the closure: [metres along the road each way, metres across each way].
const EXIT_DEFS = [
  {
    id: 'north', name: 'North Pass', kind: 'tunnel', road: 'highroad', at: [-106, -270], locked: true,
    leads: 'the dwarf mountains',
    portal: { front: 2.0, depth: 3.6, half: 4.9, top: 7.6 },
    clear: [16, 14],
    sign: {
      title: 'The Highroad is closed',
      text: [
        "NOTICE OF THE DELVERS' GUILD.\nThe Highroad tunnel fell in with the spring quakes. The roof came down in the night and took the timbers with it. Nobody was under it, which is the only good news.",
        'The Guild will not send a crew to shore it while goblins from the Old Warren gnaw at the props from below. Beyond the tunnel lie the dwarf holds of the high mountains, and no caravan has come through from them since.',
        'The way north opens when the Warren is cleared and the tunnel is shored. Ask at the smithy in Ashford: Brom knows the Guild.',
      ],
    },
  },
  {
    id: 'east', name: 'East Pass', kind: 'gatehouse', road: 'eastroad', at: [318.5, 105.4], locked: true,
    leads: 'Redwater Keep',
    gorge: { from: 12, narrow: 5.2, wide: 11.5, span: 22 },
    apron: { from: -13, to: 4, half: 9 },
    clear: [14, 16],
    sign: {
      title: 'The East Gate is barred',
      text: [
        'BY ORDER OF THE WARDEN OF REDWATER KEEP.\nThe East Pass is shut to all traffic while the road through the bandit country is unsafe. No carts, no travellers, no exceptions.',
        'Redwater Keep lies three days east of this gate, on the far side of the mountains. Its patrols have not been seen on this road since the bandits took the old fort.',
        "The gate will open for whoever can show that the bandit captain has been beaten. Ask Garrow, the guard at Ashford's east gate.",
      ],
    },
  },
  {
    id: 'south', name: 'South Pass', kind: 'toll', road: 'harbour', at: [55.5, 313.5], locked: true,
    leads: 'Saltmere Harbour',
    gorge: { from: 180, narrow: 5.2, wide: 9.6, span: 16 },
    apron: { from: -8, to: 1.5, half: 7.2 },
    clear: [12, 12],
    sign: {
      title: 'The toll bar is shut',
      text: [
        "SALTMERE HARBOUR ROAD. TOLL BAR.\nShut until the harbourmaster's men have mended the road that washed out beyond the pass. Tolls are paid to the keeper at the bar. The keeper is away.",
        "Saltmere is a day's walk on, where the road meets the sea and the fishing boats land. Ashford's catch goes there by this road when it is open.",
        "They say the bar goes up for anyone carrying the harbourmaster's seal. Old Tam at the jetty may know who saw it last.",
      ],
    },
  },
];

// The point on a road nearest (x, z), with the direction of travel there (unit) and its distance along the road.
export function roadAt(id, x, z) {
  const r = roadById(id), pts = r.pts;
  let best = Infinity, out = null, acc = 0;
  const total = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (l * l || 1), 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; out = { x: ax + dx * t, z: az + dz * t, tx: dx / (l || 1), tz: dz / (l || 1), d, s: acc + l * t, length: total }; }
    acc += l;
  }
  return out;
}

export const EXITS = EXIT_DEFS.map((e) => {
  const q = roadAt(e.road, e.at[0], e.at[1]);
  // Faces back down the road, into the vale. (tx, tz) is the way the road runs on, out of the vale.
  return { ...e, x: q.x, z: q.z, tx: q.tx, tz: q.tz, facing: Math.atan2(-q.tx, -q.tz), s: q.s };
});

// The North Pass's portal is a masonry porch built into the rock at the end of the Highroad: a block
// `depth` m thick whose front face stands `front` m beyond the road's end, `half` m to either side of
// the road, `top` m above its floor, with an arch through it. The rock behind it rises well above
// the roof, and the ground under it is level: heightAt() takes care of both (portalFace).
export const PORTAL = (() => {
  const e = EXITS.find((q) => q.kind === 'tunnel');
  return { ...e.portal, x: e.x, z: e.z, tx: e.tx, tz: e.tz };
})();
// How much a paved forecourt covers (x, z): 1 in the yard in front of (and under) a closure, fading over a couple of
// metres and ragged at the edge. `apron` on an EXITS row gives its length along the road (from / to, metres from the
// closure, negative in front of it) and its half-width across.
function exitApron(x, z, n) {
  let k = 0;
  for (const e of EXITS) {
    if (!e.apron) continue;
    const dx = x - e.x, dz = z - e.z;
    if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
    const u = dx * e.tx + dz * e.tz, v = dz * e.tx - dx * e.tz, j = (n - 0.5) * 2.4;
    k = Math.max(k, smooth(e.apron.from - 1.5, e.apron.from + 1.5, u + j) * smooth(e.apron.to + 1.5, e.apron.to - 1.5, u + j) * smooth(e.apron.half + 1.4, e.apron.half - 1.4, Math.abs(v) + j));
  }
  return k;
}
function portalFace(h, x, z) {
  const P = PORTAL, dx = x - P.x, dz = z - P.z;
  const u = dx * P.tx + dz * P.tz, v = dz * P.tx - dx * P.tz;
  const u1 = P.front + P.depth;
  if (u < P.front - 2 || u > u1 + 40 || Math.abs(v) > P.half + 8) return h;
  computeProfiles();
  const r = roadById('highroad'), y = r.prof.ys[r.prof.n - 1];
  // The floor under the porch stays level, wall to wall, and runs on a little way behind it.
  const pad = smooth(P.half + 1.2, P.half - 0.2, Math.abs(v)) * smooth(P.front - 0.8, P.front + 0.2, u) * smooth(u1 + 1.0, u1 - 0.2, u);
  h = mix(h, y, pad);
  // Behind it the rock stands well above the roof, so the porch is set into the mountain.
  const rise = smooth(u1 - 0.4, u1 + 0.8, u) * smooth(P.half + 8, P.half + 2, Math.abs(v));
  return mix(h, Math.max(h, y + P.top + 2.4 + 0.7 * (u - u1)), rise);
}

// ------------------------------------------------------------------ landmarks
// Things you can see from the square, each on high ground and each a different shape.
export const LANDMARKS = {
  abbey: { name: 'Ruined Abbey', x: ABBEY_HILL.x, z: ABBEY_HILL.z, facing: Math.PI },
  beacon: { name: 'Beacon Tower', x: BEACON_KNOLL.x, z: BEACON_KNOLL.z, facing: -1.2 },
  headframe: { name: 'Mine Headframe', x: -186, z: -174, facing: 0.35 },
  lighthouse: { name: 'Lighthouse', x: 14, z: 226, facing: -2.1 },
  dock: { name: 'Dock', x: -52, z: 168 },
};

// ------------------------------------------------------------------ junctions and signposts
// Wherever a road ends on another road, a signpost points the ways out with distances read off the
// roads themselves, so a sign never lies. Posts stand in the crook of the junction, off the road.
function roadLength(r) {
  return r.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]) : 0), 0);
}
function buildJunctions() {
  // A junction is a point where a road ends on (or at the end of) another road. Endpoints that
  // touch another road within 5 m are gathered into one junction per 9 m.
  const spots = [];
  for (const r of ROADS) {
    for (const atEnd of [false, true]) {
      const p = atEnd ? r.pts[r.pts.length - 1] : r.pts[0];
      if (polyDistance(p[0], p[1], OUTLINE) < 1) continue; // the town's own gates have their own signs
      for (const q of ROADS) {
        if (q === r || roadAt(q.id, p[0], p[1]).d > 5) continue;
        if (!spots.some((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) < 9)) spots.push([p[0], p[1]]);
      }
    }
  }
  return spots;
}
const fmt = (m) => `${Math.max(10, Math.round(m / 10) * 10)} m`;
export const JUNCTIONS = buildJunctions().map((spot, i) => {
  const boards = [];
  // Every road that passes within 6 m of the spot points away from it, each way it can go.
  for (const r of ROADS) {
    const q = roadAt(r.id, spot[0], spot[1]);
    if (q.d > 6) continue;
    const len = roadLength(r);
    const dirAlong = (sign) => {
      const [bx, bz] = pointAt(r, clamp(q.s + sign * 15, 0, len));
      const dx = bx - q.x, dz = bz - q.z, l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    };
    if (q.s > 5) boards.push({ text: `${r.ends[0]} ${fmt(q.s)}`, dir: dirAlong(-1), road: r.id, to: r.ends[0] });
    if (len - q.s > 5) boards.push({ text: `${r.ends[1]} ${fmt(len - q.s)}`, dir: dirAlong(1), road: r.id, to: r.ends[1] });
  }
  const dirs = boards.map((b) => b.dir);
  const mx = dirs.reduce((s, d) => s + d[0], 0) / dirs.length, mz = dirs.reduce((s, d) => s + d[1], 0) / dirs.length;
  const ml = Math.hypot(mx, mz);
  // Stand the post in the crook: away from the mean direction of the roads (or beside the first road).
  const ox = ml > 0.25 ? -mx / ml : -dirs[0][1], oz = ml > 0.25 ? -mz / ml : dirs[0][0];
  const [px, pz] = postSpot(spot, ox, oz);
  return { id: `junction${i}`, x: px, z: pz, at: spot, boards, roads: [...new Set(boards.map((b) => b.road))] };
});
// A spot near a junction for its post: in the crook if it can be, and always a road's painted width plus a metre and
// a bit off every road, so the post stands beside the roads and never on one.
function postSpot(spot, ox, oz) {
  const clear = (x, z) => ROADS.every((r) => roadAt(r.id, x, z).d > r.width + 1.2) && polyDistance(x, z, OUTLINE) > 3;
  for (const d of [4.6, 5.8, 7.0, 8.4])
    for (const a of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3, Math.PI]) {
      const c = Math.cos(a), s = Math.sin(a), x = spot[0] + (ox * c - oz * s) * d, z = spot[1] + (ox * s + oz * c) * d;
      if (clear(x, z)) return [x, z];
    }
  return [spot[0] + ox * 4.6, spot[1] + oz * 4.6];
}
function pointAt(r, s) {
  let acc = 0;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const l = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
    if (acc + l >= s) {
      const t = (s - acc) / l;
      return [r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * t, r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * t];
    }
    acc += l;
  }
  return r.pts[r.pts.length - 1];
}
export { roadLength, pointAt as pointAtRoad };

// Warning posts where one ring of danger begins: [x, z, board text, what the traveller reads, facing (yaw the board faces)].
export const WARNINGS = [
  { id: 'warn_woods', x: -90, z: 76, board: 'GOBLIN WOODS', text: ['Goblins in the woods ahead. They have taken chickens, tools and, some say, a cart or two. Travel armed, or not at all.'], face: 2.2 },
  { id: 'warn_trail', x: -76, z: -82, board: 'GOBLINS: KEEP OUT', text: ['A camp of goblins is dug in beyond the trees to the west. Their brute does not like visitors.'], face: 0.6 },
  { id: 'warn_warren', x: -152, z: -130, board: 'THE OLD WARREN', text: ['The shaft below leads into the goblin warren. Their king holds the deep chambers. Nobody has come back with his treasure yet.'], face: 3.0 },
  { id: 'warn_bandits', x: 218, z: 51, board: 'BANDIT COUNTRY', text: ['Bandits hold the road east of here. The tolls they take are paid in blood. Turn back unless you can fight.'], face: 1.7 },
  { id: 'warn_highroad', x: -90, z: -226, board: 'HIGHROAD CLOSED', text: ['The Highroad is closed ahead at the fallen tunnel. There is nothing beyond but rock.'], face: -1.4 },
];
