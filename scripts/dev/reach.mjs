// Terrain-only reachability: flood from the spawn over a 2 m grid using the game's own walking rules
// (slope over a metre below 1.05, water shallower than 1.05). Reports the reachable extent and the
// most distant reachable cells per side; optionally blocks the exits at given points.
import * as M from '../../src/world/map.js';
const CELL = 2, N = Math.round(800 / CELL);
const H = new Float32Array((N + 1) * (N + 1));
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = M.heightAt(-400 + i * CELL, -400 + j * CELL);
const h = (x, z) => {
  const fx = Math.min(N - 0.001, Math.max(0, (x + 400) / CELL)), fz = Math.min(N - 0.001, Math.max(0, (z + 400) / CELL));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, W = N + 1;
  const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
};
const free = (x, z) => {
  const gx = M.heightAt(x + 0.5, z) - M.heightAt(x - 0.5, z), gz = M.heightAt(x, z + 0.5) - M.heightAt(x, z - 0.5);
  if (Math.hypot(gx, gz) > 1.05) return false;
  return -M.heightAt(x, z) <= 1.05;
};
const ok = new Uint8Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) ok[j * N + i] = free(-400 + (i + 0.5) * CELL, -400 + (j + 0.5) * CELL) ? 1 : 0;
const blocks = (process.argv[2] ? JSON.parse(process.argv[2]) : (M.EXITS || []).map((e) => [e.x, e.z, 5]));
for (const [bx, bz, br] of blocks) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (Math.hypot(-400 + (i + 0.5) * CELL - bx, -400 + (j + 0.5) * CELL - bz) < br) ok[j * N + i] = 0;
const seen = new Uint8Array(N * N);
const si = Math.floor((M.SPAWN.x + 400) / CELL), sj = Math.floor((M.SPAWN.z + 400) / CELL);
const q = [sj * N + si];
seen[q[0]] = 1;
for (let k = 0; k < q.length; k++) {
  const c = q[k], i = c % N, j = (c - i) / N;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = i + di, b = j + dj;
    if (a < 0 || b < 0 || a >= N || b >= N) continue;
    const n = b * N + a;
    if (seen[n] || !ok[n]) continue;
    seen[n] = 1;
    q.push(n);
  }
}
let maxE = 0, at = null;
const extent = { W: 0, E: 0, N: 0, S: 0 };
let outer = [];
for (let c = 0; c < N * N; c++) if (seen[c]) {
  const i = c % N, j = (c - i) / N, x = -400 + (i + 0.5) * CELL, z = -400 + (j + 0.5) * CELL;
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > maxE) { maxE = e; at = [x, z]; }
  extent.W = Math.min(extent.W, x); extent.E = Math.max(extent.E, x); extent.N = Math.min(extent.N, z); extent.S = Math.max(extent.S, z);
  if (e > 326) outer.push([x, z, e]);
}
console.log('reachable cells', q.length, 'max chebyshev', maxE.toFixed(0), 'at', at.map((v) => v.toFixed(0)).join(','), 'extent', JSON.stringify(extent));
console.log('cells beyond 326:', outer.length, outer.slice(0, 10).map((p) => p.map((v) => v.toFixed(0)).join(',')).join(' | '));
// where the reachable region comes closest to the edge, per octant
const bins = {};
for (const [x, z, e] of outer) { const k = `${Math.round(x / 40) * 40},${Math.round(z / 40) * 40}`; bins[k] = Math.max(bins[k] || 0, e); }
console.log(JSON.stringify(bins));
