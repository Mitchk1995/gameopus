// The Ashford region, laid out by hand. Terrain, water, paths, forests and every placed
// thing read from this file, so the world is the same every time you load it.
//
// Coordinates are metres: +x is east, +z is south, y is up. Water sits at y = 0.

export const WORLD = { size: 800, half: 400, water: 0 };

export const VILLAGE = { x: -8, z: 18, r: 46, y: 3.2 };
export const LAKE = { x: -70, z: 250, r: 78 };
export const MINE_HILL = { x: -195, z: -205, r: 105, h: 36 };
export const MINE_ENTRANCE = { x: -170, z: -142, facing: 0.35 };
export const BANDIT_CAMP = { x: 262, z: 70, r: 22 };
export const SPAWN = { x: -8, z: 40, facing: Math.PI };

// Catmull-Rom smoothing so rivers and roads curve instead of kinking.
function curve(pts, steps = 6) {
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

// River from the northern mountains, east of the village, into the lake.
export const RIVER = curve([
  [150, -430], [138, -340], [158, -262], [126, -182], [100, -112], [86, -46],
  [92, 22], [74, 96], [30, 158], [-18, 198], [-42, 222],
]);
const RIVER_WIDTH = (t) => 4.5 + t * 4;

export const ROADS = [
  // village to the mine, north-west
  { width: 3.2, pts: curve([[-8, 18], [-30, -30], [-72, -86], [-120, -122], [-160, -140]]) },
  // village east over the bridge, then to the farms and the bandit woods
  { width: 3.2, pts: curve([[-8, 18], [30, 10], [70, 2], [110, 0], [160, 16], [214, 40], [250, 62]]) },
  // village south to the lake dock
  { width: 2.6, pts: curve([[-8, 18], [-16, 80], [-34, 140], [-52, 168]]) },
  // farm lane
  { width: 2.2, pts: curve([[160, 16], [150, 80], [132, 140]]) },
];
export const BRIDGE = { x: 89, z: 1, along: [1, 0] };

// Tree cover. Density 0..1; kinds are ez-tree presets.
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
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

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

export function roadDistance(x, z) {
  let best = Infinity, width = 3;
  for (const r of ROADS) {
    const [d] = polylineDistance(x, z, r.pts);
    if (d - r.width < best - width) {
      best = d;
      width = r.width;
    }
  }
  return [best, width];
}

// ------------------------------------------------------------------ height
export function heightAt(x, z) {
  // Gently rolling land with some broad swells.
  let h = 4.4 + (fbm(x * 0.0065 + 3.1, z * 0.0065 - 1.7) - 0.5) * 10 + (fbm(x * 0.028, z * 0.028) - 0.5) * 2.2;
  // Only the river and the lake hold water: low ground bottoms out gently above it.
  if (h < 2.4) h = 2.4 - (2.4 - h) * 0.25;

  // The mine hill with a craggy top, and a lower ridge in the north-east.
  const dm = Math.hypot(x - MINE_HILL.x, z - MINE_HILL.z) / MINE_HILL.r;
  h += MINE_HILL.h * Math.exp(-dm * dm * 2.2) * (0.75 + 0.5 * fbm(x * 0.02, z * 0.02));
  const dr = Math.hypot(x - 230, z + 250) / 120;
  h += 18 * Math.exp(-dr * dr * 2.5) * fbm(x * 0.015 + 5, z * 0.015);

  // Mountains ring the region: ridged peaks rising from foothills.
  const edge = Math.max(Math.abs(x), Math.abs(z)) + (fbm(x * 0.01, z * 0.01) - 0.5) * 70;
  const foot = smooth(270, 330, edge), peak = smooth(310, 395, edge);
  h += foot * 14 * fbm(x * 0.02 + 4, z * 0.02) + peak * (40 + ridged(x * 0.009, z * 0.009) * 105);

  // Roads flatten their surroundings a little.
  const [rd, rw] = roadDistance(x, z);
  if (rd < rw + 10) h = mix(h, Math.max(2.4, 4.0 + (fbm(x * 0.0065 + 3.1, z * 0.0065 - 1.7) - 0.5) * 6), smooth(rw + 10, rw, rd) * 0.55);

  // The village sits on a level terrace.
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  h = mix(h, VILLAGE.y, smooth(VILLAGE.r + 34, VILLAGE.r, dv));

  // Farms are flat.
  for (const f of FARMS) {
    const d = Math.max(Math.abs(x - f.x) - f.w / 2, Math.abs(z - f.z) - f.d / 2);
    h = mix(h, 2.4, smooth(14, 0, d) * 0.85);
  }

  // Bandit camp clearing.
  const db = Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z);
  h = mix(h, 4.5, smooth(BANDIT_CAMP.r + 16, BANDIT_CAMP.r, db) * 0.8);

  // The river cuts a channel with sloped banks, widening downstream.
  const [dRiver, t] = polylineDistance(x, z, RIVER);
  const w = RIVER_WIDTH(t);
  h = mix(h, Math.min(h, 1.1), smooth(w + 18, w + 3, dRiver));
  h = mix(h, -1.6 - t * 0.8, smooth(w + 3, w - 1.5, dRiver));

  // The lake basin, with an irregular shore.
  const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
  const lr = LAKE.r * (0.86 + 0.28 * fbm(Math.cos(ang) * 2 + 9, Math.sin(ang) * 2));
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = mix(h, Math.min(h, 1.0), smooth(lr + 22, lr + 4, dl));
  h = mix(h, -4.5 + (dl / lr) * 3, smooth(lr + 4, lr - 6, dl));
  return h;
}

// ------------------------------------------------------------------ ground cover
// Weights for the painted ground layers at a point: [path, forest floor, cobble].
export function groundAt(x, z) {
  const [rd, rw] = roadDistance(x, z);
  const n = fbm(x * 0.15, z * 0.15);
  let path = smooth(rw + 0.9, rw - 0.6, rd + (n - 0.5) * 1.6);
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  const cobble = smooth(15, 12, dv + (n - 0.5) * 2.5);
  path = Math.max(path, smooth(VILLAGE.r - 6, VILLAGE.r - 22, dv) * 0.6 * (0.6 + n));
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
  let d = 0, kinds = null;
  for (const f of FORESTS) {
    const k = smooth(1.0, 0.55, Math.hypot(x - f.x, z - f.z) / f.r) * f.density;
    if (k > d) {
      d = k;
      kinds = f.kinds;
    }
  }
  return [d, kinds];
}
