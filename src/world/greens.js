import * as THREE from 'three';

// Growing and soft things for the town's grounds, as geometry and painted textures (no three.js scene
// work here: townkit.js places them). Built to references, in proportion to a 1.8 m person:
//   hedge      a clipped hawthorn hedge: a dark woody heart under two layers of leaf sprigs, its top
//              and faces wandering, rounded where it ends, thinner and stemmy at the foot
//   beans      runner beans up wigwams of five hazel poles tied at 2 m: heart-shaped leaves, scarlet
//              flowers and hanging pods climbing the poles
//   cabbage    a tight blue-green head in a rosette of broad, cupped, veined outer leaves
//   herbs      low bushy clumps: grey sage, dark rosemary, lavender in flower, bright thyme
//   bed        a raised bed: tilled soil mounded between plank edging
//   haystack   a beehive of loose hay round a pole: widest a third of the way up, drooping shaggy
//              skirt, darker weathered crown, roped over with stone weights
//   truss      a bound truss of hay (a soft, bulging block with two bands of twine)
//   cloth      washing that hangs: pegged along a sagging line, folds deepening toward the hem
// Everything is in metres, with world-scale texture coordinates where a texture tiles.

const TAU = Math.PI * 2;

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ painted leaf textures
// A leaf outline (ovate, pointed tip) at (x, y), length L, pointing along `ang`.
function leafPath(g, x, y, L, W, ang, tip = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(W * 0.9, -L * 0.12, W * 0.75, -L * 0.75, 0, -L * tip);
  g.bezierCurveTo(-W * 0.75, -L * 0.75, -W * 0.9, -L * 0.12, 0, 0);
  g.restore();
}
function veins(g, x, y, L, ang, col, n = 4) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = col;
  g.lineWidth = Math.max(1, L * 0.035);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -L * 0.92);
  g.stroke();
  g.lineWidth = Math.max(0.6, L * 0.018);
  for (let i = 1; i <= n; i++) {
    const t = (i / (n + 1)) * 0.85;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -L * t);
      g.quadraticCurveTo(s * L * 0.18, -L * (t + 0.06), s * L * 0.3, -L * (t + 0.16));
      g.stroke();
    }
  }
  g.restore();
}

// Runner bean foliage: a twining stem with heart-shaped leaves in threes, scarlet flower sprays and
// hanging pods. One card, used turned and mirrored all over a wigwam.
export function beanTexture() {
  return canvasTexture(512, 512, (g, W, H) => {
    const r = seeded(51);
    g.clearRect(0, 0, W, H);
    // The stem twines up the middle.
    g.strokeStyle = '#3d5f22';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(W * 0.5, H);
    for (let y = H; y > 0; y -= 16) g.lineTo(W * 0.5 + Math.sin(y * 0.03) * 38, y);
    g.stroke();
    const leaf = (x, y, L, ang) => {
      const shade = 0.8 + r() * 0.35;
      const c = (a, b, k) => Math.round(a + (b - a) * k);
      g.fillStyle = `rgb(${c(30, 58, shade - 0.6)},${c(62, 96, shade - 0.6)},${c(20, 34, shade - 0.6)})`;
      leafPath(g, x, y, L, L * 0.62, ang, 1);
      g.fill();
      g.strokeStyle = 'rgba(20,40,10,0.55)';
      g.lineWidth = 2;
      g.stroke();
      veins(g, x, y, L, ang, 'rgba(170,205,120,0.55)', 4);
    };
    // Leaves in threes on stalks off the stem.
    for (let i = 0; i < 7; i++) {
      const y = H * (0.93 - i * 0.13) + (r() - 0.5) * 20, x = W * 0.5 + Math.sin(y * 0.03) * 38;
      const side = i % 2 ? 1 : -1, base = side * (0.9 + r() * 0.5);
      g.strokeStyle = '#46702a';
      g.lineWidth = 4;
      const sx = x + side * 55, sy = y - 20;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + side * 30, y - 5, sx, sy);
      g.stroke();
      const L = 92 + r() * 40;
      leaf(sx, sy, L, base + side * 0.35);
      leaf(sx, sy, L * 0.8, base + side * 1.25);
      leaf(sx, sy, L * 0.8, base - side * 0.6);
    }
    // Scarlet flower sprays.
    for (let k = 0; k < 4; k++) {
      const fx = W * (0.25 + r() * 0.5), fy = H * (0.1 + r() * 0.7);
      g.strokeStyle = '#3f6a26';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(fx, fy + 50);
      g.lineTo(fx + (r() - 0.5) * 20, fy - 30);
      g.stroke();
      for (let j = 0; j < 7; j++) {
        const px = fx + (r() - 0.5) * 34, py = fy - 30 + j * 11;
        g.fillStyle = j % 3 ? '#d4331c' : '#f0562a';
        g.beginPath();
        g.ellipse(px, py, 9, 7, r() * 3, 0, TAU);
        g.fill();
        g.fillStyle = '#8e1a10';
        g.beginPath();
        g.ellipse(px + 3, py + 2, 3, 3, 0, 0, TAU);
        g.fill();
      }
    }
    // Pods hanging down.
    for (let k = 0; k < 4; k++) {
      const px = W * (0.18 + r() * 0.64), py = H * (0.2 + r() * 0.5), L = 110 + r() * 60, bend = (r() - 0.5) * 30;
      g.strokeStyle = '#4c7a2c';
      g.lineCap = 'round';
      g.lineWidth = 13;
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + bend, py + L * 0.5, px + bend * 0.4, py + L);
      g.stroke();
      g.strokeStyle = 'rgba(160,200,110,0.6)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px - 3, py + 8);
      g.quadraticCurveTo(px + bend - 3, py + L * 0.5, px + bend * 0.4 - 3, py + L - 8);
      g.stroke();
    }
  });
}

// Four herbs in a 2 x 2 atlas: sage (grey-green ovals), rosemary (dark needles), lavender (grey
// blades under purple spikes), thyme (a froth of small bright leaves). Each cell is a sprig, base down.
export const HERBS = ['sage', 'rosemary', 'lavender', 'thyme'];
export function herbTexture() {
  return canvasTexture(512, 512, (g) => {
    const r = seeded(77);
    const cell = (i, draw) => { g.save(); g.translate((i % 2) * 256, Math.floor(i / 2) * 256); draw(); g.restore(); };
    cell(0, () => {
      for (let k = 0; k < 16; k++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.4, L = 70 + r() * 50;
        g.fillStyle = `hsl(${88 + r() * 16}, ${14 + r() * 12}%, ${30 + r() * 10}%)`;
        leafPath(g, 128 + (r() - 0.5) * 30, 250, L, L * 0.5, a + Math.PI / 2 * 0 + (a + Math.PI / 2), 1);
        g.fill();
        veins(g, 128, 250, L * 0.9, a + Math.PI / 2, 'rgba(210,220,190,0.35)', 3);
      }
    });
    cell(1, () => {
      for (let k = 0; k < 9; k++) {
        const x0 = 128 + (r() - 0.5) * 60, lean = (r() - 0.5) * 0.7, L = 150 + r() * 80;
        g.strokeStyle = '#4a3a22';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x0, 256);
        g.lineTo(x0 + Math.sin(lean) * L, 256 - Math.cos(lean) * L);
        g.stroke();
        for (let t = 0.15; t < 1; t += 0.05) {
          const x = x0 + Math.sin(lean) * L * t, y = 256 - Math.cos(lean) * L * t;
          for (const s of [-1, 1]) {
            g.strokeStyle = `hsl(${110 + r() * 20}, ${25 + r() * 15}%, ${15 + r() * 10}%)`;
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + s * (12 + r() * 8), y - 8 - r() * 6);
            g.stroke();
          }
        }
      }
    });
    cell(2, () => {
      for (let k = 0; k < 18; k++) {
        const x0 = 128 + (r() - 0.5) * 70, a = (r() - 0.5) * 1.4;
        g.strokeStyle = `hsl(${95 + r() * 20}, 16%, ${32 + r() * 10}%)`;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x0, 256);
        g.lineTo(x0 + Math.sin(a) * 70, 256 - Math.cos(a) * 70);
        g.stroke();
      }
      for (let k = 0; k < 9; k++) {
        const x0 = 128 + (r() - 0.5) * 60, lean = (r() - 0.5) * 0.8, L = 170 + r() * 60;
        const tx = x0 + Math.sin(lean) * L, ty = 250 - Math.cos(lean) * L;
        g.strokeStyle = '#6f7d5a';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x0, 250);
        g.lineTo(tx, ty);
        g.stroke();
        for (let t = 0.7; t <= 1.0; t += 0.025) {
          g.fillStyle = `hsl(${262 + r() * 18}, ${38 + r() * 20}%, ${36 + r() * 14}%)`;
          g.beginPath();
          g.ellipse(x0 + Math.sin(lean) * L * t + (r() - 0.5) * 6, 250 - Math.cos(lean) * L * t, 7, 6, 0, 0, TAU);
          g.fill();
        }
      }
    });
    cell(3, () => {
      for (let k = 0; k < 170; k++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.8, d = r() * 110;
        const x = 128 + Math.cos(a) * d, y = 250 + Math.sin(a) * d * 1.1;
        g.fillStyle = `hsl(${92 + r() * 22}, ${40 + r() * 20}%, ${19 + r() * 12}%)`;
        g.beginPath();
        g.ellipse(x, y, 7 + r() * 5, 5 + r() * 3, r() * 3, 0, TAU);
        g.fill();
      }
    });
  });
}

// Cabbage leaves, two in an atlas: a healthy blue-green one and an older one gone yellow and eaten.
export function cabbageTexture() {
  return canvasTexture(512, 256, (g) => {
    const r = seeded(9);
    for (const [i, old] of [[0, false], [1, true]]) {
      g.save();
      g.translate(i * 256 + 128, 250);
      // Broad, rounded, wavy-edged leaf narrowing to its stalk at the bottom.
      g.beginPath();
      g.moveTo(0, 0);
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, a = Math.PI * (1 - t);
        const R = 118 * (0.72 + 0.28 * Math.sin(t * Math.PI)) + Math.sin(t * 38) * 5;
        pts.push([Math.cos(a) * R * 0.95, -110 - Math.sin(a) * R * 0.95 + 10]);
      }
      g.lineTo(-20, -40);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(20, -40);
      g.closePath();
      const grad = g.createRadialGradient(0, -60, 10, 0, -120, 140);
      if (old) { grad.addColorStop(0, '#b3ab62'); grad.addColorStop(0.6, '#8f8840'); grad.addColorStop(1, '#6a662c'); }
      else { grad.addColorStop(0, '#93b597'); grad.addColorStop(0.5, '#5f8a6f'); grad.addColorStop(1, '#3d6852'); }
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = old ? 'rgba(90,80,30,0.6)' : 'rgba(40,70,55,0.5)';
      g.lineWidth = 3;
      g.stroke();
      // Pale midrib and veins.
      g.strokeStyle = old ? 'rgba(235,230,170,0.8)' : 'rgba(225,240,215,0.85)';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -200);
      g.stroke();
      g.lineWidth = 3;
      for (let k = 1; k <= 6; k++) for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -30 * k);
        g.quadraticCurveTo(s * 40, -30 * k - 20, s * (60 + k * 5), -30 * k - 55);
        g.stroke();
      }
      if (old) {
        // Caterpillar holes.
        for (let k = 0; k < 5; k++) {
          g.globalCompositeOperation = 'destination-out';
          g.beginPath();
          g.ellipse((r() - 0.5) * 140, -80 - r() * 110, 6 + r() * 10, 5 + r() * 8, r() * 3, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'source-over';
        }
      }
      g.restore();
    }
  });
}

// ------------------------------------------------------------------ geometry helpers
// Collects quads and triangles into one BufferGeometry.
export class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get n() {
    return this.pos.length / 3;
  }
  vert(p, n, uv, c = [1, 1, 1]) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.col.push(c[0], c[1], c[2]);
    return this.n - 1;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }
  // A card: centre c, edge half-vectors e1 (u) and e2 (v), normal n, uv rect [u0, v0, u1, v1].
  card(c, e1, e2, n, rect = [0, 0, 1, 1], col) {
    const [u0, v0, u1, v1] = rect;
    const a = this.vert([c[0] - e1[0] - e2[0], c[1] - e1[1] - e2[1], c[2] - e1[2] - e2[2]], n, [u0, v0], col);
    const b = this.vert([c[0] + e1[0] - e2[0], c[1] + e1[1] - e2[1], c[2] + e1[2] - e2[2]], n, [u1, v0], col);
    const cc = this.vert([c[0] + e1[0] + e2[0], c[1] + e1[1] + e2[1], c[2] + e1[2] + e2[2]], n, [u1, v1], col);
    const d = this.vert([c[0] - e1[0] + e2[0], c[1] - e1[1] + e2[1], c[2] - e1[2] + e2[2]], n, [u0, v1], col);
    this.quad(a, b, cc, d);
  }
  build({ colors = false, computeNormals = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    if (computeNormals) g.computeVertexNormals();
    g.userData.wuv = true;
    return g;
  }
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

// A card turned to face `n`, spun by `spin`, size s (half-width), stretched by aspect (height/width).
function faceCard(B, c, n, s, spin, rect, aspect = 1, col) {
  const nn = norm(n);
  const ref = Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = norm(cross(ref, nn));
  let e2 = cross(nn, e1);
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const r1 = [e1[0] * cs + e2[0] * sn, e1[1] * cs + e2[1] * sn, e1[2] * cs + e2[2] * sn];
  const r2 = [e2[0] * cs - e1[0] * sn, e2[1] * cs - e1[1] * sn, e2[2] * cs - e1[2] * sn];
  // Lighting: leaves take a normal between the card's and straight up, so both faces read lit.
  const ln = norm([nn[0] * 0.7, nn[1] * 0.7 + 0.45, nn[2] * 0.7]);
  B.card(c, scale(r1, s), scale(r2, s * aspect), ln, rect, col);
}

// ------------------------------------------------------------------ hedge
// Leaf sprigs over a clipped hedge's skin (length along x, standing on y = 0, thickness along z).
// `ends`: [start open, end open] get rounded, leafy ends. The top rises and falls along the run, the
// faces bulge and dip, and the foot is thinner so the woody heart shows there.
export function hedgeGeometry(len, h, thick, ends, seed) {
  const r = seeded(seed);
  const B = new Builder();
  const ph = r() * 20;
  const R = thick / 2;
  const topAt = (x) => h * (0.93 + 0.05 * Math.sin(x * 1.3 + ph) + 0.03 * Math.sin(x * 3.7 + ph * 2.1));
  // Toward an open end the hedge rounds over in plan and in elevation, all within its length.
  const endK = (x) => {
    let k = 0;
    if (ends[1]) k = Math.max(k, (x - (len / 2 - R)) / R);
    if (ends[0]) k = Math.max(k, (-x - (len / 2 - R)) / R);
    return Math.min(1, Math.max(0, k));
  };
  const faceAt = (x, y) => R * (0.9 + 0.08 * Math.sin(x * 2.1 + y * 1.3 + ph) + 0.05 * Math.sin(x * 5.3 + ph)) * (y < 0.35 ? 0.82 + 0.18 * (y / 0.35) : 1) * Math.sqrt(1 - endK(x) ** 2);
  const n = Math.round(len * 150);
  const endCards = 70;
  for (let i = 0; i < n + endCards * ((ends[0] ? 1 : 0) + (ends[1] ? 1 : 0)); i++) {
    let x = (r() - 0.5) * len, y, z, nx = 0, ny = 0, nz = 0;
    let top = topAt(x) * (1 - 0.25 * endK(x) ** 2);
    if (i >= n) {
      // The rounded end itself: cards over a half-dome whose far side is the run's end.
      const e = ends[0] && ends[1] ? (i % 2 ? 1 : -1) : ends[0] ? -1 : 1;
      const a = (r() - 0.5) * Math.PI;
      const cx = e * (len / 2 - R);
      top = topAt(cx) * 0.8;
      y = top * (0.08 + 0.85 * r());
      const rr = R * 0.95 * Math.sqrt(Math.max(0.1, 1 - Math.max(0, (y - top * 0.6) / (top * 0.45)) ** 2));
      z = Math.sin(a) * rr;
      x = cx + e * Math.cos(a) * rr;
      nx = e * Math.cos(a); nz = Math.sin(a); ny = 0.25;
    } else {
      const t = r();
      if (t < 0.36 || t >= 0.72 && t < 0.78) { y = top * (0.05 + r() * 0.8); z = -faceAt(x, y); nz = -1; ny = 0.1; }
      else if (t < 0.72) { y = top * (0.05 + r() * 0.8); z = faceAt(x, y); nz = 1; ny = 0.1; }
      else { const q = (r() - 0.5) * 2.4; y = top * 0.86 + Math.cos(q) * top * 0.12; z = Math.sin(q) * faceAt(x, top) * 0.94; ny = Math.cos(q); nz = Math.sin(q); }
      // Near the foot the leaves thin out.
      if (y < 0.3 && r() < 0.5) continue;
    }
    const out = r() < 0.08 ? 0.1 + r() * 0.2 : (r() - 0.35) * 0.1;
    const c = [x + nx * out, y + ny * out, z + nz * out];
    const s = 0.16 + r() * 0.14;
    const shade = 0.78 + r() * 0.3 - (y < h * 0.4 ? 0.12 : 0);
    faceCard(B, c, [nx + (r() - 0.5) * 0.7, ny + 0.3 + (r() - 0.5) * 0.4, nz + (r() - 0.5) * 0.7], s, r() * TAU, r() < 0.5 ? [0, 0, 1, 1] : [1, 0, 0, 1], 1.2, [shade * 0.95, shade, shade * 0.9]);
  }
  return B.build({ colors: true });
}

// The hedge's dark heart: a lumpy block a little inside the leaves, rounded at open ends.
export function hedgeCore(len, h, thick, ends, seed) {
  const g = new THREE.BoxGeometry(len, h, thick, Math.max(2, Math.round(len / 0.35)), 4, 3);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position, ph = (seed % 97) * 0.37;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.max(0, (y - h * 0.6) / (h * 0.4));
    z *= (1 - 0.35 * t * t) * (1 + 0.06 * Math.sin(x * 2.3 + ph));
    y *= 0.96 + 0.04 * Math.sin(x * 1.7 + ph);
    // Round the open ends over.
    for (const [open, s] of [[ends[0], -1], [ends[1], 1]]) {
      if (!open) continue;
      const d = (x * s - (len / 2 - thick / 2));
      if (d > 0) { const k = Math.min(1, d / (thick / 2)); z *= Math.sqrt(Math.max(0, 1 - k * k)) * 0.9 + 0.1; y *= 1 - 0.3 * k * k; }
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ beans
// One wigwam: five hazel poles leaning in to a tie at 2 m, with bean foliage climbing them.
// Returns { poles, leaves } (two geometries: bark and foliage).
export function beanWigwam(seed, { radius = 0.42, height = 2.0 } = {}) {
  const r = seeded(seed);
  const poles = [], B = new Builder();
  const n = 5, a0 = r() * TAU;
  const top = [0, height, 0];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.3;
    const base = [Math.cos(a) * radius, -0.05, Math.sin(a) * radius];
    // The pole runs through the tie and a hand past it.
    const dir = norm([top[0] - base[0], top[1] - base[1], top[2] - base[2]]);
    const L = Math.hypot(top[0] - base[0], top[1] - base[1], top[2] - base[2]) + 0.22 + r() * 0.12;
    poles.push({ base, dir, L });
    // Foliage climbing the pole: a vine that has got further up some poles than others, thick low
    // down and thinning out toward the tie, so the poles and the tie show at the top.
    const reach = 0.62 + r() * 0.3;
    for (let t = 0.03; t < reach; t += 0.07 + r() * 0.05) {
      if (t > reach - 0.2 && r() < 0.5) continue;
      const p = [base[0] + dir[0] * L * t, base[1] + dir[1] * L * t, base[2] + dir[2] * L * t];
      const outw = norm([Math.cos(a) + (r() - 0.5) * 1.1, 0.1, Math.sin(a) + (r() - 0.5) * 1.1]);
      const s = 0.13 + r() * 0.08;
      const off = 0.03 + r() * 0.1;
      faceCard(B, [p[0] + outw[0] * off, p[1] + s * 0.2, p[2] + outw[2] * off], outw, s, (r() - 0.5) * 1.4, r() < 0.5 ? [0, 0, 1, 1] : [1, 0, 0, 1], 1.25, [0.8 + r() * 0.3, 0.85 + r() * 0.25, 0.8 + r() * 0.2]);
    }
    // A shoot or two reaching across to the next pole, and one flopping out past its tip.
    for (let k = 0; k < 2; k++) {
      const b = a + TAU / n * (0.3 + r() * 0.4), t = 0.2 + r() * 0.4;
      const rr = radius * (1 - t) * 1.08, y = height * t;
      const outw = [Math.cos(b), 0.1, Math.sin(b)];
      faceCard(B, [Math.cos(b) * rr, y, Math.sin(b) * rr], outw, 0.16 + r() * 0.06, (r() - 0.5) * 1.4, r() < 0.5 ? [0, 0, 1, 1] : [1, 0, 0, 1], 1.25, [0.9, 0.95, 0.9]);
    }
  }
  return { poles, leaves: B.build({ colors: true }) };
}

// ------------------------------------------------------------------ cabbage
// A rosette: a tight head (sphere) and eight to ten cupped outer leaves splaying out and down.
// Leaves take the atlas's left (healthy) or right (old, yellowed) half. Head texture: the leaf middle.
export function cabbageGeometry(seed) {
  const r = seeded(seed);
  const B = new Builder();
  const nLeaves = 8 + Math.floor(r() * 3);
  for (let i = 0; i < nLeaves; i++) {
    const a = (i / nLeaves) * TAU + (r() - 0.5) * 0.4;
    const old = i === 0 && r() < 0.6 || r() < 0.12;
    const L = 0.22 + r() * 0.07, W = L * 0.95;
    const lift = 0.55 + r() * 0.35; // how steeply it rises from the stem before bending out
    const ca = Math.cos(a), sa = Math.sin(a);
    const rows = 5, cols = 4;
    const base = B.n;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      // Out along the leaf: rises, then droops toward the tip.
      const out = 0.03 + t * L;
      const y = 0.02 + Math.sin(t * Math.PI * 0.9) * L * 0.45 * lift - t * t * L * 0.25;
      for (let k = 0; k <= cols; k++) {
        const s = k / cols - 0.5, w = s * W * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5));
        const cup = s * s * W * 0.5 * (0.4 + t);
        const px = ca * out - sa * w, pz = sa * out + ca * w;
        // The stalk is at the bottom of the painted leaf (v = 0), the broad top at v = 1.
        const u = (old ? 0.5 : 0) + (0.5 + s) * 0.5 * 0.92 + 0.02, v = 0.02 + t * 0.94;
        B.vert([px, y + cup, pz], [0, 1, 0], [u, v], old ? [1, 1, 1] : [0.92 + r() * 0.1, 1, 0.95]);
      }
    }
    for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
      const q = base + j * (cols + 1) + k;
      B.quad(q, q + 1, q + cols + 2, q + cols + 1);
    }
  }
  const leaves = B.build({ colors: true, computeNormals: true });
  // The head: a squashed ball wrapped in the leaf's pale middle.
  const R = 0.11 + r() * 0.03;
  const head = new THREE.SphereGeometry(R, 12, 8);
  head.scale(1, 0.85, 1);
  head.translate(0, R * 0.78, 0);
  const uv = head.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.12 + uv.getX(i) * 0.26, 1 - (0.25 + uv.getY(i) * 0.5));
  head.userData.wuv = true;
  return { leaves, head };
}

// ------------------------------------------------------------------ herbs
// A low bushy clump: sprig cards all over a dome, from the atlas cell of its kind.
export function herbGeometry(kind, seed, size = 0.35) {
  const r = seeded(seed);
  const B = new Builder();
  const k = HERBS.indexOf(kind);
  const u0 = (k % 2) * 0.5, v0 = Math.floor(k / 2) * 0.5;
  // The atlas's rows run top-down (canvas), textures bottom-up.
  const rect = [u0, 1 - v0 - 0.5, u0 + 0.5, 1 - v0];
  const n = 30 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, el = r() * 1.2;
    const d = size * (0.2 + r() * 0.55);
    const c = [Math.cos(a) * d * Math.cos(el), size * 0.45 * (0.1 + Math.sin(el)) + 0.02, Math.sin(a) * d * Math.cos(el)];
    // Sprigs stand up, leaning outward: the card's up is the sprig's growth.
    const outw = [Math.cos(a), 0, Math.sin(a)];
    const s = size * (0.5 + r() * 0.3);
    const e1 = scale(norm(cross([0, 1, 0], outw)), s * 0.5);
    const up = norm([outw[0] * 0.45 * (0.4 + el), 1, outw[2] * 0.45 * (0.4 + el)]);
    const e2 = scale(up, s * 0.5);
    const sh = 0.75 + r() * 0.35;
    B.card([c[0] + up[0] * s * 0.3, c[1] + s * 0.3, c[2] + up[2] * s * 0.3], e1, e2, norm([outw[0] * 0.6, 0.6, outw[2] * 0.6]), rect, [sh, sh, sh]);
  }
  return B.build({ colors: true });
}

// ------------------------------------------------------------------ raised bed
// Tilled soil mounded along the bed with shallow furrows (length along x), sitting h high at the edge.
export function soilGeometry(L, W, h = 0.14, tile = 1.2, furrows = 0) {
  const nx = Math.max(2, Math.round(L / 0.12)), nz = 6;
  const g = new THREE.PlaneGeometry(L, W, nx, nz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const across = z / (W / 2);
    let y = h + 0.05 * Math.cos(across * Math.PI / 2) - 0.02;
    if (furrows) y += 0.018 * Math.cos(across * Math.PI * furrows);
    y += 0.01 * Math.sin(x * 9.1 + z * 5.3) + 0.006 * Math.sin(x * 23 + z * 17);
    p.setY(i, y);
    uv.setXY(i, x / tile, z / tile);
  }
  g.computeVertexNormals();
  g.userData.wuv = true;
  return g;
}

// ------------------------------------------------------------------ hay
// A haystack: a revolved beehive profile (40 segments), noise-displaced into a shaggy outline with
// vertical streaks of hanging hay, the hem drooping unevenly. Vertex colours darken the weathered crown.
export function haystackGeometry(R, H, seed) {
  const r = seeded(seed);
  const prof = [[0.93, 0], [1.0, 0.1], [1.03, 0.3], [0.98, 0.48], [0.86, 0.63], [0.66, 0.77], [0.44, 0.87], [0.22, 0.95], [0.06, 1.0]];
  const seg = 44, rings = 26;
  const B = new Builder();
  const ph = r() * 50;
  const at = (t) => {
    // Interpolate the profile at t (0..1 along it).
    const f = t * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(f)), k = f - i;
    return [prof[i][0] + (prof[i + 1][0] - prof[i][0]) * k, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * k];
  };
  const hem = [];
  for (let s = 0; s <= seg; s++) hem.push(0.04 + 0.12 * Math.abs(Math.sin(s * 1.7 + ph)) * r());
  let v = 0, prev = null;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const [pr, py] = at(t);
    const y0 = py * H;
    if (prev) v += Math.hypot((pr - prev[0]) * R, (py - prev[1]) * H);
    prev = [pr, py];
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU;
      // Streaks: noise that varies fast round the stack and slowly down it (hay hangs in locks).
      const streak = Math.sin(a * 13 + ph + Math.sin(y0 * 1.3 + a * 3) * 0.8) * 0.5 + Math.sin(a * 29 + ph * 1.7 + y0 * 0.6) * 0.3 + Math.sin(a * 5 + ph * 0.3) * 0.4;
      let rr = pr * R * (1 + 0.035 * streak * (1 - t * 0.6)) + (t < 0.12 ? hem[s] * (1 - t / 0.12) : 0);
      let y = y0 - (j === 0 ? 0.06 : 0) + (j === 0 ? hem[s] * 0.5 - 0.02 : 0);
      if (j === rings) rr = 0.02;
      const px = Math.sin(a) * rr, pz = Math.cos(a) * rr;
      // Weathered crown: greyer and darker above two thirds of the height; the foot stays golden.
      const wk = Math.max(0, Math.min(1, (t - 0.55) / 0.35));
      const c = [1 - 0.38 * wk, 1 - 0.4 * wk, 1 - 0.3 * wk];
      B.vert([px, y, pz], [Math.sin(a), 0.3, Math.cos(a)], [(s / seg) * Math.round((TAU * R) / 1.4), v / 1.4], c);
    }
  }
  for (let j = 0; j < rings; j++) for (let s = 0; s < seg; s++) {
    const a = j * (seg + 1) + s;
    B.quad(a, a + 1, a + seg + 2, a + seg + 1);
  }
  const g = B.build({ colors: true, computeNormals: true });
  return g;
}

// Loose hay fallen round the foot of a stack: a low ragged ring.
export function hayApron(R, seed) {
  const r = seeded(seed);
  const seg = 36, B = new Builder();
  const inner = [], outer = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * TAU;
    const ro = R + 0.25 + r() * 0.35, ri = R * 0.85;
    inner.push(B.vert([Math.sin(a) * ri, 0.18, Math.cos(a) * ri], [0, 1, 0], [Math.sin(a) * ri / 1.4, Math.cos(a) * ri / 1.4]));
    outer.push(B.vert([Math.sin(a) * ro, 0.0, Math.cos(a) * ro], [0, 1, 0], [Math.sin(a) * ro / 1.4, Math.cos(a) * ro / 1.4]));
  }
  for (let s = 0; s < seg; s++) B.quad(inner[s], outer[s], outer[s + 1], inner[s + 1]);
  return B.build({ computeNormals: true });
}

// A truss of hay: a block (length along x) bulging at the faces, edges rounded, a little shaggy.
export function trussGeometry(L = 0.9, W = 0.46, H = 0.42, seed = 1) {
  const r = seeded(seed);
  const g = new THREE.BoxGeometry(L, H, W, 8, 5, 5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ux = x / (L / 2), uy = y / (H / 2), uz = z / (W / 2);
    // Round the edges: pull corners in (a superellipse-ish block), bulge the faces a little.
    const k = 1 - 0.1 * (ux * ux * uy * uy + uy * uy * uz * uz + ux * ux * uz * uz);
    x *= k * (1 + 0.03 * (1 - uy * uy));
    z *= k * (1 + 0.06 * (1 - uy * uy)) * (1 + 0.02 * Math.sin(x * 20 + seed));
    y = y * k + H / 2 + 0.008 * Math.sin(x * 31 + z * 17 + seed);
    p.setXYZ(i, x + (r() - 0.5) * 0.012, y, z);
  }
  g.computeVertexNormals();
  // Straw runs along the truss.
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.7) uv.setXY(i, p.getZ(i) / 0.9, p.getY(i) / 0.9);
    else if (ay > 0.7) uv.setXY(i, p.getZ(i) / 0.9, p.getX(i) / 0.9);
    else uv.setXY(i, p.getY(i) / 0.9, p.getX(i) / 0.9);
  }
  g.userData.wuv = true;
  return g;
}

// ------------------------------------------------------------------ washing
// The garments, cut from one sheet of linen in an atlas (alpha outside each shape):
//   0 sheet, 1 shirt (with sleeves), 2 smock, 3 a pair of stockings, 4 apron, 5 cloth
export const GARMENTS = [
  { name: 'sheet', w: 1.3, h: 1.1, rect: [0, 0.5, 0.5, 1] },
  { name: 'shirt', w: 0.78, h: 0.72, rect: [0.5, 0.5, 0.75, 0.75] },
  { name: 'smock', w: 0.62, h: 0.95, rect: [0.75, 0.5, 1, 0.8] },
  { name: 'stockings', w: 0.4, h: 0.62, rect: [0.5, 0.75, 0.625, 1] },
  { name: 'apron', w: 0.55, h: 0.62, rect: [0.625, 0.8, 0.8, 1] },
  { name: 'cloth', w: 0.5, h: 0.45, rect: [0.8, 0.8, 1, 1] },
];
export function garmentTexture(linenImage) {
  return canvasTexture(1024, 1024, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const fill = (draw) => {
      g.save();
      g.beginPath();
      draw();
      g.clip();
      if (linenImage) { for (let y = 0; y < H; y += 256) for (let x = 0; x < W; x += 256) g.drawImage(linenImage, x, y, 256, 256); }
      else { g.fillStyle = '#e8e4da'; g.fillRect(0, 0, W, H); }
      // Hems and seams, a little darker.
      g.strokeStyle = 'rgba(80,70,60,0.35)';
      g.lineWidth = 5;
      g.stroke();
      g.restore();
    };
    // The atlas rect [u0, v0, u1, v1] (v up) to canvas pixels.
    const px = (rect) => { const [u0, v0, u1, v1] = rect; return [u0 * W, (1 - v1) * H, (u1 - u0) * W, (v1 - v0) * H]; };
    // Sheet: a plain rectangle, the top hem folded over the line.
    { const [x, y, w, h] = px(GARMENTS[0].rect); fill(() => g.rect(x + 4, y + 4, w - 8, h - 8)); }
    // Shirt: body and sleeves, hung by its hem (upside down, as washing is), sleeves drooping.
    { const [x, y, w, h] = px(GARMENTS[1].rect); fill(() => {
      g.moveTo(x + w * 0.02, y + h * 0.02); g.lineTo(x + w * 0.98, y + h * 0.02);
      g.lineTo(x + w * 0.98, y + h * 0.36); g.lineTo(x + w * 0.8, y + h * 0.38); g.lineTo(x + w * 0.8, y + h * 0.84);
      g.lineTo(x + w * 0.6, y + h * 0.98); g.lineTo(x + w * 0.5, y + h * 0.9); g.lineTo(x + w * 0.4, y + h * 0.98);
      g.lineTo(x + w * 0.2, y + h * 0.84); g.lineTo(x + w * 0.2, y + h * 0.38); g.lineTo(x + w * 0.02, y + h * 0.36); g.closePath();
    }); }
    // Smock: widening to the hem, hung from the shoulders.
    { const [x, y, w, h] = px(GARMENTS[2].rect); fill(() => {
      g.moveTo(x + w * 0.22, y + h * 0.02); g.lineTo(x + w * 0.78, y + h * 0.02); g.lineTo(x + w * 0.98, y + h * 0.2);
      g.lineTo(x + w * 0.86, y + h * 0.3); g.lineTo(x + w * 0.96, y + h * 0.98); g.lineTo(x + w * 0.04, y + h * 0.98);
      g.lineTo(x + w * 0.14, y + h * 0.3); g.lineTo(x + w * 0.02, y + h * 0.2); g.closePath();
    }); }
    // Stockings: two long narrow legs with feet.
    { const [x, y, w, h] = px(GARMENTS[3].rect); fill(() => {
      for (const o of [0.05, 0.55]) {
        g.moveTo(x + w * o, y + h * 0.02); g.lineTo(x + w * (o + 0.36), y + h * 0.02); g.lineTo(x + w * (o + 0.34), y + h * 0.78);
        g.quadraticCurveTo(x + w * (o + 0.44), y + h * 0.98, x + w * (o + 0.16), y + h * 0.98); g.lineTo(x + w * (o + 0.02), y + h * 0.8); g.closePath();
      }
    }); }
    // Apron: a bib and a skirt.
    { const [x, y, w, h] = px(GARMENTS[4].rect); fill(() => {
      g.moveTo(x + w * 0.02, y + h * 0.02); g.lineTo(x + w * 0.98, y + h * 0.02); g.lineTo(x + w * 0.96, y + h * 0.98); g.lineTo(x + w * 0.04, y + h * 0.98); g.closePath();
    }); }
    // A cloth.
    { const [x, y, w, h] = px(GARMENTS[5].rect); fill(() => g.rect(x + 4, y + 4, w - 8, h - 8)); }
  });
}

// One garment hanging from a line: its top edge follows the line (pegged, sagging a touch between the
// pegs), vertical folds deepen toward the hem, the hem lifts where the wind catches it.
// Local frame: the line runs along x, y up, the garment hangs from y = 0.
export function garmentGeometry(gar, seed, sag = (x) => 0) {
  const r = seeded(seed);
  const nx = 10, ny = 8;
  const B = new Builder();
  const folds = 3 + Math.floor(r() * 3), ph = r() * 6, lift = (r() - 0.3) * 0.12;
  const [u0, v0, u1, v1] = gar.rect;
  for (let j = 0; j <= ny; j++) {
    const t = j / ny;
    for (let i = 0; i <= nx; i++) {
      const s = i / nx;
      const x = (s - 0.5) * gar.w;
      // Between the pegs (the corners and middle of a wide one) the top dips.
      const pegs = gar.w > 0.9 ? 3 : 2;
      const between = Math.abs(Math.sin(s * Math.PI * (pegs - 1)));
      const dip = t === 0 ? between * 0.025 : 0;
      const z = Math.sin(s * Math.PI * folds * 2 + ph) * 0.035 * (0.25 + t) + lift * t * t;
      const y = sag(x) - dip - t * gar.h * (1 - 0.03 * between);
      B.vert([x, y, z], [0, 0, 1], [u0 + s * (u1 - u0), v1 - t * (v1 - v0)]);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i;
    B.quad(a, a + 1, a + nx + 2, a + nx + 1);
  }
  return B.build({ computeNormals: true });
}

// A rope between two points sagging by `sag` in the middle (a thin tube along a parabola).
export function ropeGeometry(a, b, sag, radius = 0.007, seg = 18) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, radius, 4, false);
  return g;
}
