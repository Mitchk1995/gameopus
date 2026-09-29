// Draws the vale (src/world/map.js) top-down, for design review: shaded relief, water, ground
// cover and biomes, contours, then the roads by class, exits, points of interest and landmarks.
//   node scripts/vale-plan.mjs [out.png|out.jpg] [--px 1.5] [--box x0,z0,x1,z1] [--plain] [--ascii]
//   --px      pixels per metre (default 1.5)
//   --box     draw just this part of the world (default the whole 800 m square)
//   --plain   terrain only, no overlay
//   --ascii   print a small text sketch of the same data instead of drawing
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import * as M from '../src/world/map.js';

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = path.resolve(args.find((a) => /\.(png|jpg)$/.test(a)) || 'docs/world/plan.png');
const PX = +opt('--px', 1.5);
const half = M.WORLD.half;
const [X0, Z0, X1, Z1] = opt('--box', `${-half},${-half},${half},${half}`).split(',').map(Number);
const SW = Math.round((X1 - X0) * PX), SH = Math.round((Z1 - Z0) * PX);

if (flag('--ascii')) {
  const cols = 72, rows = 36;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const cell = (x, z) => [Math.floor(((x + half) / M.WORLD.size) * cols), Math.floor(((z + half) / M.WORLD.size) * rows)];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = -half + ((i + 0.5) / cols) * M.WORLD.size, z = -half + ((j + 0.5) / rows) * M.WORLD.size;
      const h = M.heightAt(x, z);
      grid[j][i] = h < -0.2 ? '~' : h > 110 ? '^' : h > 55 ? 'n' : h > 30 ? '.' : ' ';
    }
  const put = (x, z, c) => { const [i, j] = cell(x, z); if (grid[j]?.[i] !== undefined) grid[j][i] = c; };
  for (const r of M.ROADS) for (const [x, z] of r.pts) put(x, z, r.cls === 'road' ? '=' : r.cls === 'track' ? '-' : ':');
  for (const e of M.EXITS || []) put(e.x, e.z, e.id[0].toUpperCase());
  for (const p of M.POIS) put(p.x, p.z, 'o');
  put(M.VILLAGE.x, M.VILLAGE.z, '#');
  console.log(grid.map((r) => r.join('')).join('\n'));
  process.exit(0);
}

const t0 = Date.now();
const H = new Float32Array(SW * SH);
for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) H[j * SW + i] = M.heightAt(X0 + (i + 0.5) / PX, Z0 + (j + 0.5) / PX);
console.log(`heights ${SW}x${SH} in ${Date.now() - t0} ms`);
const px = Buffer.alloc(SW * SH * 3);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hAt = (i, j) => H[Math.max(0, Math.min(SH - 1, j)) * SW + Math.max(0, Math.min(SW - 1, i))];
const t1 = Date.now();
const contour = PX >= 2 ? 5 : 10;
for (let j = 0; j < SH; j++)
  for (let i = 0; i < SW; i++) {
    const x = X0 + (i + 0.5) / PX, z = Z0 + (j + 0.5) / PX;
    const h = H[j * SW + i];
    const gx = ((hAt(i + 1, j) - hAt(i - 1, j)) * PX) / 2, gz = ((hAt(i, j + 1) - hAt(i, j - 1)) * PX) / 2;
    const slope = Math.hypot(gx, gz);
    // Light from the north-west.
    const shade = Math.max(0.4, Math.min(1.5, 1 + (gx * 0.55 + gz * 0.55) * -0.5));
    let c;
    if (h < 0) {
      const d = Math.min(1, -h / 4);
      c = mixc([70, 128, 150], [28, 70, 110], d);
    } else {
      const [path, forest, cobble] = M.groundAt(x, z);
      const [meadow, heath, marsh, dry, moss, dust] = M.biomeAt(x, z);
      c = [100, 138, 66];
      c = mixc(c, [128, 160, 70], meadow * 0.7);
      c = mixc(c, [120, 112, 92], heath * 0.7);
      c = mixc(c, [74, 100, 76], marsh * 0.8);
      c = mixc(c, [156, 134, 76], dry * 0.55);
      c = mixc(c, [64, 96, 58], forest * 0.7);
      c = mixc(c, [58, 88, 60], moss * forest * 0.5);
      c = mixc(c, [128, 122, 116], dust * 0.7);
      if (h < 1.4) c = mixc(c, [200, 186, 140], Math.min(1, (1.4 - h) / 0.9));
      if (slope > 0.5) c = mixc(c, [128, 124, 118], Math.min(1, (slope - 0.5) * 1.4));
      if (h > 95) c = mixc(c, [238, 240, 246], Math.min(1, (h - 95) / 30) * (slope < 2.2 ? 1 : 0.4));
      c = mixc(c, [190, 166, 122], Math.min(1, path * 1.2));
      c = mixc(c, [170, 164, 152], cobble);
    }
    const k = Math.floor(h / contour);
    let line = 0;
    if (k !== Math.floor(hAt(i + 1, j) / contour) || k !== Math.floor(hAt(i, j + 1) / contour)) line = k % 5 === 0 ? 0.28 : 0.1;
    const o = (j * SW + i) * 3;
    for (let q = 0; q < 3; q++) px[o + q] = Math.max(0, Math.min(255, c[q] * shade * (1 - line)));
  }
console.log(`shade in ${Date.now() - t1} ms`);

const X = (x) => ((x - X0) * PX).toFixed(1), Z = (z) => ((z - Z0) * PX).toFixed(1);
const inBox = (x, z, m = 0) => x > X0 - m && x < X1 + m && z > Z0 - m && z < Z1 + m;
const el = [];
const poly = (pts, w, col, extra = '') => `<polyline points="${pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${w * PX}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const label = (x, z, text, { size = 12, col = '#fff', dy = -8 } = {}) => (inBox(x, z) ? `<text x="${X(x)}" y="${Number(Z(z)) + dy}" font-size="${size}" font-family="Georgia,serif" font-weight="700" text-anchor="middle" fill="${col}" stroke="#000" stroke-width="3" paint-order="stroke">${text}</text>` : '');
if (!flag('--plain')) {
  const step = PX >= 3 ? 20 : 100;
  for (let g = Math.ceil(X0 / step) * step; g <= X1; g += step) el.push(`<line x1="${X(g)}" y1="0" x2="${X(g)}" y2="${SH}" stroke="#000" stroke-opacity="0.18"/><text x="${X(g)}" y="11" font-size="10" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${g}</text>`);
  for (let g = Math.ceil(Z0 / step) * step; g <= Z1; g += step) el.push(`<line x1="0" y1="${Z(g)}" x2="${SW}" y2="${Z(g)}" stroke="#000" stroke-opacity="0.18"/><text x="2" y="${Z(g)}" font-size="10" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${g}</text>`);
  el.push(poly(M.RIM.concat([M.RIM[0]]), 1, '#ff5', 'stroke-opacity="0.35" stroke-dasharray="6 6"'));
  for (const r of M.ROADS) {
    const w = r.cls === 'road' ? 4.2 : r.cls === 'track' ? 2.6 : 1.5;
    el.push(poly(r.pts, w + 1.4, '#2b1c10', 'stroke-opacity="0.6"'));
    el.push(poly(r.pts, w, r.cls === 'road' ? '#e2c890' : r.cls === 'track' ? '#cfae74' : '#b9955e'));
  }
  for (const j of M.JUNCTIONS || []) if (inBox(j.x, j.z)) el.push(`<rect x="${Number(X(j.x)) - 3}" y="${Number(Z(j.z)) - 3}" width="6" height="6" fill="#fff" stroke="#000"/>`);
  for (const p of M.POIS) {
    if (inBox(p.x, p.z)) el.push(`<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="${p.r * PX}" fill="#ff0" fill-opacity="0.25" stroke="#ff0" stroke-width="2"/>`);
    el.push(label(p.x, p.z + p.r + 2, p.name, { size: 11, col: '#fff3a0' }));
  }
  for (const e of M.EXITS || []) {
    if (inBox(e.x, e.z)) el.push(`<rect x="${Number(X(e.x)) - 9}" y="${Number(Z(e.z)) - 9}" width="18" height="18" fill="#e33" stroke="#fff" stroke-width="2"/>`);
    el.push(label(e.x, e.z - 4, e.name, { size: 15, col: '#ffb0b0', dy: -16 }));
  }
  for (const [k, v] of Object.entries(M.LANDMARKS || {})) {
    if (inBox(v.x, v.z)) el.push(`<polygon points="${X(v.x)},${Number(Z(v.z)) - 12} ${Number(X(v.x)) + 9},${Number(Z(v.z)) + 8} ${Number(X(v.x)) - 9},${Number(Z(v.z)) + 8}" fill="#39f" stroke="#fff" stroke-width="2"/>`);
    el.push(label(v.x, v.z, v.name || k, { size: 12, col: '#bde', dy: 24 }));
  }
  for (const c of [[M.BANDIT_CAMP, 'Bandit fort'], [M.GOBLIN_CAMP, 'Goblin camp'], [{ x: M.MINE_ENTRANCE.x, z: M.MINE_ENTRANCE.z }, 'Old Warren'], [{ x: M.SPAWN.x, z: M.SPAWN.z }, 'Spawn'], [{ x: M.VILLAGE.x, z: M.VILLAGE.z }, 'ASHFORD']]) {
    if (inBox(c[0].x, c[0].z)) el.push(`<circle cx="${X(c[0].x)}" cy="${Z(c[0].z)}" r="6" fill="#f60" stroke="#fff" stroke-width="2"/>`);
    el.push(label(c[0].x, c[0].z, c[1], { size: 13, col: '#ffd' }));
  }
  el.push(label(M.BRIDGE.x, M.BRIDGE.z, 'Bridge', { size: 11, col: '#fff', dy: -10 }));
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}">${el.join('\n')}</svg>`;
await mkdir(path.dirname(out), { recursive: true });
const img = sharp(px, { raw: { width: SW, height: SH, channels: 3 } }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
await (out.endsWith('.jpg') ? img.jpeg({ quality: 82 }) : img.png()).toFile(out);
console.log('plan ->', out);
