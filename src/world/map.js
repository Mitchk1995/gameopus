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
export const BEACON_KNOLL = { x: 188, z: 4, r: 46, h: 25 };
// The knoll's long, gentle side runs out this way from its crown.
const KNOLL_SHOULDER = [0.992, 0.124];
// The high ground east of the river, running north from the beacon knoll.
const EAST_RIDGE = { pts: [[190, -8], [197, -70], [209, -130], [221, -190], [233, -240]], crest: [0, 1, 1, 0.9, 0.75], h: 26, w: 46 };
// The spot where the river is born: a stream comes down a ravine in the north cliffs and falls from
// a notch in the cliff top (the lip, `height` m up) into a plunge pool.
export const FALLS = { pool: [152, -286], lip: [151, -308], top: [149, -346], height: 46 };

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

// The profile of the wall's face by distance into it: a stony slope, a cliff band, an upper slope.
const faceAt = (d) => 8 * smooth(-4, 12, d) + 40 * smooth(8, 52, d) + 52 * smooth(38, 68, d) + 32 * smooth(60, 110, d);

function rimWall(x, z) {
  const d = rimDistance(x, z);
  if (d < -150) return 0;
  // The passes keep the plain wall their gorges were cut from.
  const calm = exitCalm(x, z);
  // Forested foothills that roll along the wall.
  let h = smooth(-130, 6, d) * (6 + 8 * ridged(x * 0.011 + 1.1, z * 0.011 + 6.6, 3));
  // The face is layered rock. Above the foot it follows a smoother line than the foot's little
  // coves (whose wobble, carried all the way up, drew the face as rows of even vertical pleats):
  // broad buttresses and bays instead, stepped by strata into ledges and short cliffs that dip
  // gently across the range, with crags and knobs of every size and direction on top.
  const face0 = faceAt(d);
  let face = face0;
  if (calm > 0 && d > -8) {
    const dFace = d - (fbm(x * 0.031 + 2, z * 0.031 + 9) - 0.5) * 12 + (fbm(x * 0.009 + 4.4, z * 0.009 - 7.3) - 0.5) * 34;
    const d2 = mix(d, dFace, smooth(2, 18, d));
    let f = faceAt(d2);
    const H = 7 + 5 * fbm(x * 0.006 + 5, z * 0.006 - 2);
    const dip = (x * 0.05 + z * 0.03) + 9 * fbm(x * 0.004 + 1, z * 0.004 + 4);
    const k = (f + dip) / H, i = Math.floor(k), t = k - i;
    const stepped = (i + (t < 0.6 ? t * 0.35 : 0.21 + (t - 0.6) * 1.975)) * H - dip;
    f = mix(f, stepped, 0.5 * smooth(6, 24, d2) * smooth(170, 120, d2));
    const crag = ridged(x * 0.024 + 3.3, z * 0.024 - 1.2, 3) * 0.6 + fbm(x * 0.07 + 8, z * 0.07 + 1) * 0.4;
    f += smooth(6, 26, d2) * smooth(150, 90, d2) * (crag - 0.45) * 16;
    face = mix(face0, f, calm);
    // Scree fans spill out of the gullies at the foot of the cliffs.
    h += calm * screeAt(x, z, d);
  }
  h += face;
  if (d > 60) {
    // Ridges behind, jagged against the sky, and the named peaks.
    const jag = ridged(x * 0.021 + 7.3, z * 0.021 - 2.2, 3);
    h += smooth(60, 150, d) * (10 + 95 * ridged(x * 0.0075 + 2.7, z * 0.0075 - 8.1) + 26 * jag * smooth(80, 160, d) * calm);
    for (const [px, pz, ph, pr] of PEAKS) {
      const q = Math.hypot(x - px, z - pz) / pr;
      if (q < 2.4) h += ph * Math.exp(-q * q * 1.15) * smooth(50, 100, d) * (1 + 0.25 * (jag - 0.5) * calm);
    }
  }
  return h;
}

// Scree: fans of broken rock at the foot of the wall, where the gullies above shed stone. Each fan
// is a low cone spreading out into the vale, steepest at its apex against the cliff.
function screeAt(x, z, d) {
  if (d < -34 || d > 14) return 0;
  // Fans sit under gullies: where a slow noise along the wall peaks.
  const g = fbm(x * 0.024 + 11.3, z * 0.024 - 6.1);
  const fan = smooth(0.52, 0.72, g);
  if (fan <= 0) return 0;
  const out = Math.max(0, -d + 4);
  return fan * 7.5 * Math.pow(Math.max(0, 1 - out / 34), 2.2) * smooth(14, 4, d);
}

// 1 away from the three ways out, 0 at their closures and along the gorges beyond, so the passes
// keep exactly the ground they were laid out on.
let CALM = null;
export function exitCalm(x, z) {
  CALM ??= EXIT_DEFS.map((e) => {
    const r = roadById(e.road), q = roadAt(e.road, e.at[0], e.at[1]);
    const pts = [[q.x, q.z], ...r.pts.filter((p) => roadAt(e.road, p[0], p[1]).s > q.s + 1)];
    return { x: q.x, z: q.z, pts };
  });
  let k = 1;
  for (const c of CALM) {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > 260 || Math.abs(dz) > 260) continue;
    k = Math.min(k, smooth(55, 95, Math.hypot(dx, dz)));
    if (c.pts.length > 1) k = Math.min(k, smooth(50, 90, polylineDistance(x, z, c.pts)[0]));
  }
  return k;
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
  { id: 'beacon', name: 'Beacon Path', cls: 'path', ends: ['Bridge Street', 'the Beacon'], grade: 0.25, way: [[190, 50], [207, 45], [223, 36], [235, 24], [240, 13], [228, 6], [210, 4], [197, 8], [188, 12]] },
  { id: 'waystation', name: 'Waystation Spur', cls: 'path', ends: ['Bridge Street', 'the Waystation'], way: [[178, 46], [178, 58]] },
  { id: 'battlefield', name: 'Old Battle Road', cls: 'track', ends: ['the Farms', 'the Old Battlefield'], width: 2.0, way: [[132, 140], [160, 164], [186, 184], [196, 190]] },
  { id: 'hermit', name: "Hermit's Path", cls: 'path', ends: ["Woodcutters' Track", "the Hermit's Hut"], way: [[-118, 102], [-150, 92], [-190, 74], [-230, 60], [-256, 54]] },
  { id: 'sunken', name: 'Shoal Path', cls: 'path', ends: ["Woodcutters' Track", 'the Sunken Ruin'], way: [[-118, 102], [-125, 150], [-136, 200], [-140, 238], [-142, 250]] },
  { id: 'hamlet', name: 'Hamlet Lane', cls: 'path', ends: ['Harbour Road', 'the Hamlet'], way: [[27, 213], [36, 213], [44, 214]] },
  { id: 'lighthouse', name: 'Lighthouse Path', cls: 'path', ends: ['Harbour Road', 'the Lighthouse'], way: [[27, 213], [20, 218], [14, 226]] },
];

export const ROADS = ROAD_DEFS.map((d) => {
  const c = CLASS[d.cls];
  return { ...d, width: d.width ?? c.width, half: d.half ?? c.half, grade: d.grade ?? c.grade, cut: c.cut, fill: c.fill, infl: c.infl, paint: c.paint, pts: curve(d.way, d.steps || 6) };
});
export const roadById = (id) => ROADS.find((r) => r.id === id);
// The stone bridge on Bridge Street, where the road crosses the river.
export const BRIDGE = { x: 90, z: 3, along: [1, 0], half: 15 };

// Where the river is born and how it runs to the lake: out of the plunge pool under the falls, a
// quick stony reach down through the heath past the sawmill, a gently winding reach between the
// Stones Path and the Mill Track, under the bridge, then broad meanders through the meadows and
// farms, over the ford where the Harbour Road crosses it, and out into the lake.
const RIVER_WAY = [
  [152, -287], [149, -268], [147, -250], [141, -232], [133, -214], [127, -196], [126, -178], [119, -160],
  [109, -144], [106, -124], [110, -104], [104, -84], [93, -68], [88, -50], [94, -30], [91, -12], [90, 3],
  [91, 20], [98, 36], [104, 52], [100, 68], [91, 82], [80, 96], [73, 113], [78, 131], [73, 149],
  [57, 162], [36, 168], [18, 175], [6, 184], [-8, 196], [-24, 208], [-42, 222],
];
export const RIVER = curve(RIVER_WAY, 5);

// The river's shape sampled every 2 m along its course: position, heading, signed curvature
// (> 0 turning toward +side), and what the water does there. Pools sit on the bends (wide, deep,
// slow), riffles on the straights between (narrow, shallow, quick). It is narrower and deeper
// under the bridge, wide and shallow over the ford, and opens out into the lake.
const RIV = (() => {
  const { xs, zs } = resample(RIVER, 2);
  const n = xs.length;
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  const L = s[n - 1];
  const tx = [], tz = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1;
    tx.push(dx / l);
    tz.push(dz / l);
  }
  const raw = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    let dh = Math.atan2(tz[b], tx[b]) - Math.atan2(tz[a], tx[a]);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    raw.push(dh / Math.max(1, s[b] - s[a]));
  }
  const k = raw.map((_, i) => {
    let sum = 0, c = 0;
    for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) { sum += raw[j]; c++; }
    return sum / c;
  });
  let iB = 0;
  for (let i = 0; i < n; i++) if (Math.hypot(xs[i] - BRIDGE.x, zs[i] - BRIDGE.z) < Math.hypot(xs[iB] - BRIDGE.x, zs[iB] - BRIDGE.z)) iB = i;
  const road = roadById('harbour').pts;
  let iF = -1, fd = 3;
  for (let i = 0; i < n; i++) {
    const d = polylineDistance(xs[i], zs[i], road)[0];
    if (d < fd) { fd = d; iF = i; }
  }
  const hw = [], D = [], F = [], W = [], rough = [], steep = [];
  for (let i = 0; i < n; i++) {
    const t = s[i] / L;
    const bend = clamp(Math.abs(k[i]) * 44, 0, 1);
    const nz = fbm(s[i] * 0.021 + 3.3, 7.1) - 0.5;
    let w = (3.3 + 3.4 * t) * (0.78 + 0.42 * bend + 0.4 * nz);
    let d = 1.28 + 1.05 * bend + 0.3 * t + 0.35 * nz;
    // At the bridge the banks stand firm and high, at the road's level, for the abutments.
    const kb = smooth(30, 10, Math.abs(s[i] - s[iB]));
    w = mix(w, 5.5, kb);
    d = mix(d, 1.9, kb);
    steep.push(smooth(24, 12, Math.abs(s[i] - s[iB])));
    if (iF >= 0) {
      const kf = smooth(24, 10, Math.abs(s[i] - s[iF]));
      w = mix(w, 10.5, kf);
      d = mix(d, 0.42, kf);
    }
    w *= 1 + 1.4 * smooth(0.94, 1, t);
    hw.push(w);
    D.push(d);
    // The floodplain beside it: higher and narrow where it runs in its little valley under the
    // cliffs, low and broad through the meadows.
    F.push(mix(mix(1.9, 1.05, smooth(0.05, 0.45, t)) + 0.3 * (fbm(s[i] * 0.013 + 9, 2.2) - 0.5), 3.2, steep[i]));
    W.push(mix(5, 22, smooth(0.08, 0.5, t)) * (0.7 + 0.6 * fbm(s[i] * 0.017 + 1.7, 5.5)));
    // Riffles (straights) are rough, quick water; pools are glassy.
    rough.push(clamp(1 - bend * 1.6, 0, 1) * smooth(0.97, 0.9, t));
  }
  const CELL = 16, REACH = 112;
  const grid = new Map();
  for (let i = 0; i < n - 1; i++) {
    const x0 = Math.floor((Math.min(xs[i], xs[i + 1]) - REACH) / CELL), x1 = Math.floor((Math.max(xs[i], xs[i + 1]) + REACH) / CELL);
    const z0 = Math.floor((Math.min(zs[i], zs[i + 1]) - REACH) / CELL), z1 = Math.floor((Math.max(zs[i], zs[i + 1]) + REACH) / CELL);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const key = cx * 4096 + cz;
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(i);
      }
  }
  return { n, xs, zs, s, L, tx, tz, k, hw, D, F, W, rough, steep, grid, CELL, iB, iF };
})();

// The river where it passes closest to a point: distance to its centre line, signed side (> 0 on
// the side it turns toward), how far along (m and 0..1), curvature, half-width, depth, floodplain
// level and width, and how rough the water is. Null when the point is far from it. (One shared
// object: copy what you keep.)
const RQ = { d: 0, sd: 0, s: 0, t: 0, k: 0, hw: 0, D: 0, F: 0, W: 0, rough: 0, steep: 0, tx: 0, tz: 0, i: 0 };
export function riverAt(x, z) {
  const R = RIV;
  const list = R.grid.get(Math.floor(x / R.CELL) * 4096 + Math.floor(z / R.CELL));
  if (!list) return null;
  let best = Infinity, bi = -1, bt = 0, side = 1, raw = 0;
  for (const i of list) {
    const ax = R.xs[i], az = R.zs[i], dx = R.xs[i + 1] - ax, dz = R.zs[i + 1] - az;
    const tr = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), t = clamp(tr, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; bi = i; bt = t; raw = tr; side = dx * (z - az) - dz * (x - ax) >= 0 ? 1 : -1; }
  }
  const at = (a) => a[bi] + (a[bi + 1] - a[bi]) * bt;
  // Behind the source the pool and the falls shape the ground, not the river.
  RQ.behind = bi === 0 && raw < 0;
  RQ.d = best; RQ.sd = best * side; RQ.s = at(R.s); RQ.t = RQ.s / R.L; RQ.k = at(R.k);
  RQ.hw = at(R.hw); RQ.D = at(R.D); RQ.F = at(R.F); RQ.W = at(R.W); RQ.rough = at(R.rough); RQ.steep = at(R.steep);
  RQ.tx = at(R.tx); RQ.tz = at(R.tz); RQ.i = bi;
  return RQ;
}
// Where the Harbour Road fords the river (null if it doesn't cross it); the road's crown is FORD_Y
// there, a hand's depth under the water.
export const FORD = RIV.iF >= 0 ? { x: RIV.xs[RIV.iF], z: RIV.zs[RIV.iF], half: RIV.hw[RIV.iF], dir: [RIV.tx[RIV.iF], RIV.tz[RIV.iF]] } : null;
const FORD_Y = -0.42;

// The river's bed and banks. In the channel the bed dips to a deepest line that swings to the outside
// of each bend; out of it the bank depends on the bend: a sand and gravel bar on the inside, a low
// cut bank on the outside, a gentle grassy slope elsewhere. Beyond the bank lies a flat floodplain,
// and past that the valley side climbs back to the land. The river only ever lowers the land.
function riverCarve(h, x, z) {
  const q = riverAt(x, z);
  if (!q || q.behind) return h;
  const e = q.d - q.hw;
  if (e > 62) return h;
  const turn = clamp(q.k * 42, -1, 1), sg = q.sd >= 0 ? 1 : -1;
  const inner = Math.max(0, turn * sg), outer = Math.max(0, -turn * sg);
  if (e < 0) {
    const c = -turn * q.hw * 0.42;
    const a = q.sd > c ? (q.sd - c) / (q.hw - c) : (c - q.sd) / (q.hw + c);
    const bed = -q.D * (1 - Math.pow(clamp(a, 0, 1), 2.3)) - 0.04;
    return Math.min(h, bed);
  }
  const wob = fbm(x * 0.09 + 3, z * 0.09 - 5);
  const gentle = q.F * smooth(-0.4, 4.5 + 5 * wob, e);
  const cut = (q.F + 0.25) * smooth(-0.7, 1.1, e);
  const barW = 1 + 9 * inner * (0.6 + 0.8 * wob);
  const bar = 0.18 * smooth(-0.6, 1.0, e) + (q.F - 0.18) * smooth(barW, barW + 7, e);
  let y = mix(gentle, cut, Math.min(1, outer * 1.15));
  y = mix(y, bar, Math.min(1, inner * 1.5) * (1 - q.steep));
  y = mix(y, cut, q.steep);
  // Up under the cliffs the stream has cut itself a narrow little valley; lower down the valley
  // sides lie back. They wander, nearer on one bank than the other, never a ruled line.
  const vw = q.W * (0.45 + 1.1 * fbm(x * 0.019 + (sg > 0 ? 3.1 : 8.7), z * 0.019 - 4.2));
  const ve = e + (fbm(x * 0.047 + 1.3, z * 0.047 + 7.9) - 0.5) * 9;
  if (ve > vw) {
    const lean = mix(0.85, 0.36, smooth(0.06, 0.3, q.t)) * (0.65 + 0.7 * fbm(x * 0.031 - 2.2, z * 0.031 + 5.5));
    y = Math.max(y, q.F + (ve - vw) * lean + Math.max(0, e - 38) * 4);
  }
  return h > y ? smin(h, y, 1.2) : h;
}

// The plunge pool under Whitespring Falls, and the notch the stream has cut in the cliff top above it.
function fallsCarve(h, x, z) {
  const [px, pz] = FALLS.pool;
  const dp = Math.hypot(x - px, z - pz);
  if (dp < 44) {
    const ang = Math.atan2(z - pz, x - px);
    const R = 12 + 3.2 * (fbm(Math.cos(ang) * 1.6 + 4.2, Math.sin(ang) * 1.6 + 1.1) - 0.5);
    // Rock rises sheer behind the pool (north), the banks lie back toward the river (south).
    const slope = mix(0.6, 4, smooth(0.1, -0.6, (z - pz) / (dp || 1)));
    const y = dp < R ? -3.4 * (1 - Math.pow(dp / R, 2.4)) - 0.05 : 0.35 + (dp - R) * slope + Math.max(0, dp - 30) * 3;
    if (y < h) h = dp < R ? Math.min(h, y) : smin(h, y, 0.8);
  }
  // The notch: a narrow V from the lip back up the ravine the stream comes down.
  const [lx, lz] = FALLS.lip, [ux, uz] = FALLS.top;
  const ax = ux - lx, az = uz - lz, al = Math.hypot(ax, az);
  const u = ((x - lx) * ax + (z - lz) * az) / al, v = Math.abs((x - lx) * az - (z - lz) * ax) / al;
  if (u > -6 && u < al + 20 && v < 40) {
    const floor = FALLS.height - 2 + Math.max(0, u) * 1.9;
    const y = floor + Math.max(0, v - 2.2) * 1.5;
    if (y < h) h = mix(h, smin(h, y, 2), smooth(-6, 2, u));
  }
  return h;
}

// Tree cover. Density 0..1; kinds are ez-tree species.
export const FORESTS = [
  { x: -230, z: 20, r: 140, density: 0.9, kinds: ['oak', 'ash', 'pine'] },
  { x: -120, z: 110, r: 70, density: 0.55, kinds: ['oak', 'aspen'] },
  { x: 250, z: -120, r: 120, density: 0.8, kinds: ['pine', 'ash'] },
  { x: 285, z: 90, r: 75, density: 0.6, kinds: ['pine', 'pine', 'deadpine', 'ash'] },
  { x: 40, z: -190, r: 90, density: 0.45, kinds: ['aspen', 'oak'] },
  { x: -300, z: -290, r: 90, density: 0.7, kinds: ['pine'] },
];
// Fields: a rotated rectangle each (w across, d along; the d axis runs (sin rot, cos rot)), what
// grows there, and which side has the gate. FARMS[1] is the flax field by the town (resources.js
// grows the flax you pick in it). The rest are the Farms at the end of the farm lane.
export const FARMS = [
  { id: 'wheat', x: 119, z: 113, w: 26, d: 44, rot: -0.29, crop: 'wheat', edge: 'hedge', gate: ['e', -0.16] },
  { id: 'flax', x: 56, z: 70, w: 28, d: 28, rot: -0.1, crop: 'flax', edge: 'fence', gate: ['w', 0.12] },
  { id: 'greens', x: 170, z: 112, w: 30, d: 40, rot: -0.29, crop: 'greens', edge: 'hedge', gate: ['w', -0.2] },
  { id: 'plough', x: 110, z: 160, w: 36, d: 28, rot: -0.29, crop: 'plough', edge: 'wall', gate: ['n', 0.3] },
];

// ------------------------------------------------------------------ land
function rolling(x, z) {
  // Gently rolling land with some broad swells.
  let h = 4.4 + (fbm(x * 0.0065 + 3.1, z * 0.0065 - 1.7) - 0.5) * 10 + (fbm(x * 0.028, z * 0.028) - 0.5) * 2.2;
  // Swells and hollows you notice on foot: a rise to walk over, a dip the path runs down into.
  h += exitCalm(x, z) * ((fbm(x * 0.0135 + 7.7, z * 0.0135 + 2.9) - 0.5) * 5 + (ridged(x * 0.0095 + 1.9, z * 0.0095 - 4.4, 2) - 0.5) * 2.4);
  // Only the river and the lake hold water: low ground bottoms out gently above it.
  if (h < 2.2) h = 2.2 - (2.2 - h) * 0.4;
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
  // The beacon knoll: steep and craggy toward the river and the town, with a long shoulder falling
  // away to the east that the Beacon Path climbs; the ridge runs north from it.
  const kx = x - BEACON_KNOLL.x, kz = z - BEACON_KNOLL.z;
  const [ux, uz] = KNOLL_SHOULDER;
  const u = kx * ux + kz * uz, v = kz * ux - kx * uz;
  const qk = Math.hypot(u / (u > 0 ? 76 : 60), v / (v > 0 ? 54 : 50)) + 0.1 * (fbm(x * 0.035 + 2, z * 0.035 - 6) - 0.5);
  if (qk < 2.4) {
    h += BEACON_KNOLL.h * dome(qk, 2.0, 2.4) * (0.95 + 0.1 * fbm(x * 0.03, z * 0.03));
    // Swells and hollows on its steep side, so it never reads as a turned dome.
    h += 2.2 * smooth(0.3, 0.6, qk) * smooth(1.2, 0.8, qk) * (fbm(x * 0.05 + 1.7, z * 0.05 - 3.1) - 0.5);
  }
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

// Where a pass cuts through the wall, the ground beyond its closure climbs as a gorge: a narrow
// floor that keeps rising, with cliffs on both flanks, so the way out reads as a way out and
// the road runs up it without a pit at the end.
let NOTCHES = null;
function notches() {
  return (NOTCHES ??= EXITS.filter((e) => e.kind !== 'tunnel').map((e) => {
    // The gorge follows the road out from the closure.
    const pts = [[e.x, e.z], ...roadById(e.road).pts.filter((p) => roadAt(e.road, p[0], p[1]).s > e.s + 1)];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [px, pz] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
    return { pts, cum, y: land0(e.x, e.z) - 0.4, climb: 0.15, w: 4.6, flank: 2.4, box: [x0 - 100, x1 + 100, z0 - 100, z1 + 100] };
  }));
}
function passNotch(h, x, z) {
  for (const n of notches()) {
    if (x < n.box[0] || x > n.box[1] || z < n.box[2] || z > n.box[3]) continue;
    let best = Infinity, u = 0;
    for (let i = 0; i < n.pts.length - 1; i++) {
      const [ax, az] = n.pts[i], [bx, bz] = n.pts[i + 1], dx = bx - ax, dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) { best = d; u = n.cum[i] + Math.hypot(dx, dz) * t; }
    }
    // Before the closure the road's own cutting does the work; the gorge starts a little short of it.
    const [sx, sz] = n.pts[0];
    const back = ((x - sx) * (n.pts[1][0] - sx) + (z - sz) * (n.pts[1][1] - sz)) / (Math.hypot(n.pts[1][0] - sx, n.pts[1][1] - sz) || 1);
    const floor = n.y + u * n.climb;
    const flank = floor + Math.max(0, best - n.w - u * 0.05) * n.flank;
    const k = smooth(-14, 4, back) * smooth(100, 60, best);
    if (flank < h) h = mix(h, smin(h, flank, 3), k);
  }
  return h;
}
const land = (x, z) => passNotch(land0(x, z), x, z);

// The lie of the land: rolling ground, hills and the wall, with the town's terrace.
function rawLand(x, z) {
  let h = rolling(x, z) + hills(x, z) + heathBumps(x, z) + rimWall(x, z);
  // The river's own broad valley: from well off, the land leans gently down toward it, so it runs
  // through an open vale of its own rather than a trench (not up under the cliffs, where it has
  // cut its little gorge, nor out at the lake).
  const q = riverAt(x, z);
  if (q && !q.behind) {
    const e = q.d - q.hw, k = smooth(0.1, 0.2, q.t) * smooth(0.97, 0.9, q.t) * smooth(-70, -110, rimDistance(x, z));
    // (By a few metres at most, so the hills and knolls keep their shape.)
    if (k > 0 && e < 110) h -= Math.min(Math.max(0, h - (1.9 + Math.max(0, e - 6) * 0.065)), 3.5) * smooth(110, 50, e) * k;
  }
  // The town sits on a level terrace that follows its wall, grading into the land beyond it;
  // the chapel stands on a gentle rise inside.
  const dv = Math.max(0, polyDistance(x, z, OUTLINE));
  return mix(h, VILLAGE.y + riseAt(x, z), smooth(30, 0, dv));
}

// Land before anything is cut or flattened into it: rolling ground, hills, the wall, the town terrace and the fields.
function land0(x, z) {
  let h = rawLand(x, z);
  // Fields are ploughed smooth: each lies on an even plane through its own ground.
  for (const f of FARMS) {
    const d = fieldDistance(f, x, z);
    if (d < 14) h = mix(h, fieldPlane(f, x, z), smooth(14, 0, d) * 0.88);
  }
  return h;
}

// Distance outside a field's edge (negative inside), and where a point is in its frame.
export function fieldLocal(f, x, z) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.x, dz = z - f.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
export function fieldDistance(f, x, z) {
  const [lx, lz] = fieldLocal(f, x, z);
  return Math.max(Math.abs(lx) - f.w / 2, Math.abs(lz) - f.d / 2);
}
// The even plane a field is graded to: the mean of the land under it, tilted with it.
function fieldPlane(f, x, z) {
  if (!f.plane) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    const at = (lx, lz) => rawLand(f.x + lx * c + lz * s, f.z - lx * s + lz * c);
    const m = (at(0, 0) * 2 + at(-f.w / 3, 0) + at(f.w / 3, 0) + at(0, -f.d / 3) + at(0, f.d / 3)) / 6;
    f.plane = { m, gx: (at(f.w / 3, 0) - at(-f.w / 3, 0)) / (f.w * 2 / 3), gz: (at(0, f.d / 3) - at(0, -f.d / 3)) / (f.d * 2 / 3) };
  }
  const [lx, lz] = fieldLocal(f, x, z), p = f.plane;
  return p.m + clamp(lx, -f.w / 2 - 14, f.w / 2 + 14) * p.gx + clamp(lz, -f.d / 2 - 14, f.d / 2 + 14) * p.gz;
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
export function surface0(x, z) {
  let h = land(x, z);
  for (let i = 0; i < PADS.length; i++) {
    const [px, pz, r, b] = PADS[i];
    const d = Math.hypot(x - px, z - pz);
    if (d < r + b) h = mix(h, padY(i), smooth(r + b, r, d));
  }
  return h;
}

// How much a point belongs to a level pad (1 on the level ground, fading out over 5 m), so the
// river and the ford never undercut a site someone will build on.
function padGuard(x, z) {
  let k = 0;
  for (const [px, pz, r] of PADS) {
    const d = Math.hypot(x - px, z - pz);
    if (d < r + 5) k = Math.max(k, smooth(r + 5, r, d));
  }
  for (const f of FARMS) {
    const d = fieldDistance(f, x, z);
    if (d < 6) k = Math.max(k, smooth(6, -1, d));
  }
  return k;
}

// ------------------------------------------------------------------ regions and biomes
const HEATH_ZONES = [[74, -104, 70, 64], [130, -150, 54, 100], [40, -160, 62, 40]];
const BIRCH_ZONES = [[-118, 108, 64, 54], [44, -196, 88, 64], [-30, 160, 40, 30]];
const MEADOW_ZONES = [[70, 84, 130, 84], [-6, 132, 120, 52], [120, 6, 80, 60]];
const WOODS_ZONES = [[-220, 6, 150, 210], [-120, 110, 76, 62]];
const BANDIT_ZONES = [[292, 0, 124, 214, 0]];
const MINE_ZONES = [[MINE_HILL.x, MINE_HILL.z, 118, 112]];

const max = (a, f) => a.reduce((m, z) => Math.max(m, f(z)), 0);
// Birch groves (0..1).
export const groveAt = (x, z) => max(BIRCH_ZONES, ([cx, cz, rx, rz]) => blob(x, z, cx, cz, rx, rz));
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
  // Mine spoil, and the scree fans at the foot of the wall.
  const rd = rimDistance(x, z);
  const dust = Math.max(R.mine, rd > -36 && rd < 16 ? Math.min(1, screeAt(x, z, rd) / 2.2) * exitCalm(x, z) : 0);
  return [meadow, heath, marsh, dry, moss, dust];
}

// ------------------------------------------------------------------ water, shore and fields (baked)
// The lake's shore radius toward a point (the same wobble heightAt uses).
function lakeShore(x, z) {
  const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
  return lakeShoreAt(Math.cos(ang), Math.sin(ang));
}
// The shore's radius in a direction (cos, sin) from the lake's centre.
export const lakeShoreAt = (c, s) => LAKE.r * (0.86 + 0.28 * fbm(c * 2 + 9, s * 2));

// How the water moves: [x, z] of the current (unit direction times speed 0..1) and how broken the
// surface is (0 glassy .. 1 white water). The river runs quick in its narrows and slow in its pools,
// slower at the edges than mid-stream; the plunge pool churns under the falls; the lake is still.
export function flowAt(x, z) {
  let fx = 0, fz = 0, rough = 0;
  const q = riverAt(x, z);
  if (q && !q.behind) {
    const e = q.d - q.hw;
    if (e < 3) {
      const across = clamp(Math.abs(q.sd) / q.hw, 0, 1);
      const speed = clamp(5.6 / q.hw, 0.3, 1) * (1 - 0.65 * across * across) * smooth(1, 0.9, q.t) * smooth(3, -1, e);
      fx = q.tx * speed;
      fz = q.tz * speed;
      rough = q.rough * smooth(2, -1.5, e) * (0.55 + 0.45 * fbm(x * 0.2, z * 0.2));
    }
  }
  // Under the falls: white water where it lands, pushing out across the pool.
  const [lx, lz] = FALLS.pool;
  const cx = FALLS.lip[0], cz = lz - 9;
  const dl = Math.hypot(x - cx, z - cz);
  if (dl < 22) {
    const k = smooth(22, 3, dl);
    const ox = (x - cx) / (dl || 1), oz = (z - cz) / (dl || 1);
    fx = mix(fx, ox * 0.8, k);
    fz = mix(fz, oz * 0.8, k);
    rough = Math.max(rough, smooth(13, 2, dl));
  }
  // Riffles over the ford.
  if (FORD) rough = Math.max(rough, smooth(16, 6, Math.hypot(x - FORD.x, z - FORD.z)) * 0.7);
  return [fx, fz, rough];
}

// Bare shore and wet ground: [sand and gravel, reeds, the flax field's rows]. Bars of sand and gravel
// lie on the inside of the river's bends and along its stony upper reach, and the lake has beaches on
// its north and east shores. Reeds stand in the marsh shallows and at the river's slow bends.
export function shoreAt(x, z) {
  let bar = 0, reeds = 0;
  const q = riverAt(x, z);
  if (q && !q.behind) {
    const e = q.d - q.hw;
    const turn = clamp(q.k * 42, -1, 1), inner = Math.max(0, turn * (q.sd >= 0 ? 1 : -1)), outer = Math.max(0, -turn * (q.sd >= 0 ? 1 : -1));
    const barW = 1 + 9 * inner * (0.6 + 0.8 * fbm(x * 0.09 + 3, z * 0.09 - 5));
    bar = smooth(-3, -0.8, e) * smooth(barW + 2.5, barW, e) * Math.min(1, inner * 1.8) * (1 - q.steep);
    bar = Math.max(bar, smooth(-2.5, -0.5, e) * smooth(2.5, 0.4, e) * smooth(0.32, 0.14, q.t));
    // Reeds on the slow side of the lower river: the edges of pools and the tail of each bar.
    const slow = smooth(0.35, 0.55, q.t) * (1 - q.rough) * (1 - q.steep);
    reeds = slow * smooth(-2.2, -0.6, e) * smooth(2.5, 0.2, e) * Math.max(inner * 0.6, 1 - outer) * smooth(0.45, 0.7, fbm(x * 0.07 + 5, z * 0.07));
  }
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 1.4 + 20) {
    const lr = lakeShore(x, z), ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const side = smooth(0.35, 1.25, Math.cos(ang - 2.55) * 0.5 + 0.5 + (fbm(x * 0.02, z * 0.02) - 0.5) * 0.3);
    const wall = smooth(-34, -14, rimDistance(x, z));
    // Beaches where the marsh is not.
    bar = Math.max(bar, smooth(lr - 7, lr - 3, dl) * smooth(lr + 7, lr + 2, dl) * (1 - side) * (1 - wall) * smooth(0.3, 0.55, fbm(x * 0.05 + 1, z * 0.05 + 2) + 0.2));
    // Reed beds in the marsh shallows and along its wet edge.
    reeds = Math.max(reeds, smooth(lr - 16, lr - 6, dl) * smooth(lr + 16, lr + 3, dl) * side * (1 - wall) * smooth(0.36, 0.56, fbm(x * 0.045 + 7, z * 0.045 - 3)));
  }
  // The falls pool: a rim of rounded stones.
  const dp = Math.hypot(x - FALLS.pool[0], z - FALLS.pool[1]);
  bar = Math.max(bar, smooth(8, 11, dp) * smooth(17, 13, dp));
  let flax = 0;
  const f = FARMS[1];
  flax = smooth(0.5, -1.5, fieldDistance(f, x, z));
  return [bar, reeds, flax];
}

// What grows in the fields: [wheat, green crops, ploughed soil], each 1 inside its field.
export function fieldsAt(x, z) {
  const out = [0, 0, 0];
  for (const f of FARMS) {
    const k = { wheat: 0, greens: 1, plough: 2 }[f.crop];
    if (k === undefined) continue;
    out[k] = Math.max(out[k], smooth(0.5, -1.5, fieldDistance(f, x, z)));
  }
  return out;
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

function computeProfiles() {
  if (PROFILES) return;
  PROFILES = true;
  const DS = 2;
  const built = [];
  for (const r of ROADS) {
    const { xs, zs } = resample(r.pts, DS);
    const n = xs.length;
    const raw = xs.map((x, i) => surface0(x, zs[i]));
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
    // Where a road fords the river it runs down into the water, over the gravel and out again.
    if (FORD && r.id === 'harbour') {
      let fi = -1, fd = 6;
      for (let i = 0; i < n; i++) { const d = Math.hypot(xs[i] - FORD.x, zs[i] - FORD.z); if (d < fd) { fd = d; fi = i; } }
      if (fi >= 0) for (let i = 0; i < n; i++) y[i] = Math.min(y[i], FORD_Y + Math.max(0, Math.abs(i - fi) * DS - FORD.half - 2) * (r.grade - 0.02));
    }
    r.prof = { n, xs, zs, ys: y, ds: DS, y0, y1 };
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

  // The river's bed, banks and floodplain (kept off the level pads), and the falls it is born from.
  const keep = padGuard(x, z);
  if (keep < 1) h = mix(fallsCarve(riverCarve(h, x, z), x, z), h, keep);

  // The lake basin, with an irregular shore.
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 1.4 + 40) {
    const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const lr = LAKE.r * (0.86 + 0.28 * fbm(Math.cos(ang) * 2 + 9, Math.sin(ang) * 2));
    // Where the lake laps against the mountain wall there is no shore: the cliff drops sheer into
    // deep water.
    const rd = rimDistance(x, z), wall = smooth(-34, -14, rd);
    h = mix(h, Math.min(h, 1.6), smooth(lr + 22, lr + 4, dl) * (1 - wall));
    if (wall > 0) h = mix(h, Math.max(h, 34 * smooth(-16, 2, rd)), wall * smooth(lr + 30, lr - 4, dl));
    h = mix(h, -4.5 + (dl / lr) * 3 - wall * 1.5, smooth(lr + 4, lr - 6, dl));
  }

  // Roads are cut into the land (and hold themselves above the marsh).
  h = roadStamp(h, x, z);
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
  const cobble = Math.min(1, tCobble * (0.86 + 0.28 * n));
  path = Math.max(path, tDirt * (0.8 + 0.4 * n));
  let forest = 0;
  for (const f of FORESTS) {
    const d = Math.hypot(x - f.x, z - f.z) / f.r;
    forest = Math.max(forest, smooth(1.05, 0.7, d + (fbm(x * 0.03, z * 0.03) - 0.5) * 0.5) * f.density);
  }
  const db = Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z);
  path = Math.max(path, smooth(BANDIT_CAMP.r, BANDIT_CAMP.r - 8, db) * 0.8);
  return [path, forest * (1 - path), cobble];
}

export function forestDensity(x, z) {
  // Woods climb the foothills and thin out where the slopes turn to rock.
  const e = rimDistance(x, z);
  const band = smooth(-100, -50, e) * smooth(24, 2, e) * smooth(0.35, 0.6, fbm(x * 0.02 + 2, z * 0.02 + 8));
  let d = band * 0.75, kinds = band > 0 ? (fbm(x * 0.004, z * 0.004) > 0.5 ? ['pine', 'pine', 'ash'] : ['pine', 'oak', 'ash']) : null;
  // Under the wall in bandit country the pines stand among dead ones.
  if (band > 0 && x > 150 && rings(x, z).bandit > 0.5) kinds = ['pine', 'deadpine', 'pine', 'snag'];
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
// the road there. `kind` picks how it is built (see sites.js): a collapsed tunnel, a barred
// gatehouse, a toll bar.
const EXIT_DEFS = [
  {
    id: 'north', name: 'North Pass', kind: 'tunnel', road: 'highroad', at: [-106, -270], locked: true,
    leads: 'the dwarf mountains',
    sign: {
      title: 'The Highroad is closed',
      text: [
        "NOTICE OF THE DELVERS' GUILD.",
        'The Highroad tunnel fell in with the spring quakes. The Guild will not send a crew while goblins from the Old Warren gnaw at its props from below.',
        'The way north opens when the Warren is cleared and the tunnel is shored. Ask at the smithy in Ashford: Brom knows the Guild.',
      ],
    },
  },
  {
    id: 'east', name: 'East Pass', kind: 'gatehouse', road: 'eastroad', at: [298, 94], locked: true,
    leads: 'Redwater Keep',
    sign: {
      title: 'The East Gate is barred',
      text: [
        'BY ORDER OF THE WARDEN OF REDWATER KEEP.',
        'The East Pass is shut to all traffic while the road through the bandit country is unsafe. No carts, no travellers, no exceptions.',
        'The gate will open for whoever can show that the bandit captain has been beaten. Ask Garrow, the guard at Ashford\'s east gate.',
      ],
    },
  },
  {
    id: 'south', name: 'South Pass', kind: 'toll', road: 'harbour', at: [48, 292], locked: true,
    leads: 'Saltmere Harbour',
    sign: {
      title: 'The toll bar is shut',
      text: [
        'SALTMERE HARBOUR ROAD. TOLL BAR.',
        'Shut until the harbourmaster\'s men have mended the road that washed out beyond the pass. Tolls are paid to the keeper at the bar. The keeper is away.',
        'They say the bar goes up for anyone carrying the harbourmaster\'s seal. Old Tam at the jetty may know who saw it last.',
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
  // Faces back down the road, into the vale.
  return { ...e, x: q.x, z: q.z, facing: Math.atan2(-q.tx, -q.tz), s: q.s };
});

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
  return { id: `junction${i}`, x: spot[0] + ox * 4.6, z: spot[1] + oz * 4.6, at: spot, boards, roads: [...new Set(boards.map((b) => b.road))] };
});
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
export { roadLength };

// Warning posts where one ring of danger begins: [x, z, board text, what the traveller reads, facing (yaw the board faces)].
export const WARNINGS = [
  { id: 'warn_woods', x: -90, z: 76, board: 'GOBLIN WOODS', text: ['Goblins in the woods ahead. They have taken chickens, tools and, some say, a cart or two. Travel armed, or not at all.'], face: 2.2 },
  { id: 'warn_trail', x: -76, z: -82, board: 'GOBLINS: KEEP OUT', text: ['A camp of goblins is dug in beyond the trees to the west. Their brute does not like visitors.'], face: 0.6 },
  { id: 'warn_warren', x: -152, z: -130, board: 'THE OLD WARREN', text: ['The shaft below leads into the goblin warren. Their king holds the deep chambers. Nobody has come back with his treasure yet.'], face: 3.0 },
  { id: 'warn_bandits', x: 218, z: 51, board: 'BANDIT COUNTRY', text: ['Bandits hold the road east of here. The tolls they take are paid in blood. Turn back unless you can fight.'], face: 1.7 },
  { id: 'warn_highroad', x: -90, z: -226, board: 'HIGHROAD CLOSED', text: ['The Highroad is closed ahead at the fallen tunnel. There is nothing beyond but rock.'], face: -1.4 },
];

// ------------------------------------------------------------------ keeping clear
// Where the cart was wrecked on Bridge Street (quests.js puts it 4.5 m off the road near x = 196).
const WRECK = (() => {
  const road = ROADS[1].pts;
  let b = 0;
  for (let i = 1; i < road.length; i++) if (Math.abs(road[i][0] - 196) < Math.abs(road[b][0] - 196)) b = i;
  const [ax, az] = road[b], [bx, bz] = road[Math.min(road.length - 1, b + 1)];
  const l = Math.hypot(bx - ax, bz - az) || 1;
  return [ax - ((bz - az) / l) * 4.5, az + ((bx - ax) / l) * 4.5];
})();

// How far a point is from the nearest place things must not be scattered on (negative inside it):
// the level pads (camps, sites, landmarks), the fields, the ways out, the landmarks, the bridge, the
// ford, the falls pool, every signpost and warning post, the wrecked cart and the town. Trees, rocks
// and bushes keep a few metres more than this from them; roads are checked with roadDistance.
export function siteClearance(x, z) {
  let d = Infinity;
  for (const [px, pz, r] of PADS) d = Math.min(d, Math.hypot(x - px, z - pz) - r);
  for (const f of FARMS) d = Math.min(d, fieldDistance(f, x, z) - 1.5);
  for (const e of EXITS) d = Math.min(d, Math.hypot(x - e.x, z - e.z) - 18);
  for (const k of Object.values(LANDMARKS)) d = Math.min(d, Math.hypot(x - k.x, z - k.z) - 10);
  for (const j of JUNCTIONS) d = Math.min(d, Math.hypot(x - j.x, z - j.z) - 1.5);
  for (const w of WARNINGS) d = Math.min(d, Math.hypot(x - w.x, z - w.z) - 1.5);
  d = Math.min(d, Math.max(Math.abs(x - BRIDGE.x) - BRIDGE.half - 4, Math.abs(z - BRIDGE.z) - 8));
  if (FORD) d = Math.min(d, Math.hypot(x - FORD.x, z - FORD.z) - FORD.half - 6);
  d = Math.min(d, Math.hypot(x - FALLS.pool[0], z - FALLS.pool[1]) - 14);
  d = Math.min(d, Math.hypot(x - WRECK[0], z - WRECK[1]) - 5);
  d = Math.min(d, polyDistance(x, z, OUTLINE) - 8);
  return d;
}

// Fly-fishing swims: the river's pools, on the bends, spaced out along it (not by the bridge or the
// ford), each marked a couple of metres out from the gravel bar on the bend's inside, where an
// angler can stand. resources.js puts the fishing spots here.
export const SWIMS = (() => {
  const R = RIV, out = [];
  const idx = [...Array(R.n).keys()].filter((i) => {
    const t = R.s[i] / R.L;
    return t > 0.3 && t < 0.9 && Math.abs(R.s[i] - R.s[R.iB]) > 45 && (R.iF < 0 || Math.abs(R.s[i] - R.s[R.iF]) > 45);
  }).sort((a, b) => Math.abs(R.k[b]) - Math.abs(R.k[a]));
  for (const i of idx) {
    if (out.length >= 5) break;
    if (out.some((o) => Math.abs(o.s - R.s[i]) < 55)) continue;
    const side = R.k[i] > 0 ? 1 : -1, off = side * (R.hw[i] - 2.4);
    out.push({ s: R.s[i], x: R.xs[i] - R.tz[i] * off, z: R.zs[i] + R.tx[i] * off });
  }
  return out.sort((a, b) => a.s - b.s).map(({ x, z }) => [x, z]);
})();
