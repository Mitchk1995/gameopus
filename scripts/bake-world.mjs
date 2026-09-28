// Bakes the designed map (src/world/map.js) into data the game loads instantly:
//   public/assets/world/height.bin  Int16 heights in centimetres, 801 x 801 samples (1 m apart)
//   public/assets/world/ground.png  RGB ground-cover weights: path, forest floor, cobble (sand comes from height)
// Run after editing map.js:  node scripts/bake-world.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { WORLD, heightAt, groundAt } from '../src/world/map.js';

const OUT = path.resolve('public/assets/world');
await mkdir(OUT, { recursive: true });

const N = WORLD.size + 1;
const heights = new Int16Array(N * N);
const t0 = Date.now();
for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) heights[j * N + i] = Math.round(heightAt(i - WORLD.half, j - WORLD.half) * 100);
await writeFile(path.join(OUT, 'height.bin'), Buffer.from(heights.buffer));
console.log(`height.bin ${N}x${N} in ${Date.now() - t0} ms`);

const hAt = (x, z) => {
  const fx = Math.min(N - 1.001, Math.max(0, x + WORLD.half)), fz = Math.min(N - 1.001, Math.max(0, z + WORLD.half));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = heights[j * N + i], b = heights[j * N + i + 1], c = heights[(j + 1) * N + i], d = heights[(j + 1) * N + i + 1];
  return (a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz) / 100;
};

const S = 1024;
const px = Buffer.alloc(S * S * 3);
const t1 = Date.now();
for (let j = 0; j < S; j++)
  for (let i = 0; i < S; i++) {
    const x = ((i + 0.5) / S) * WORLD.size - WORLD.half, z = ((j + 0.5) / S) * WORLD.size - WORLD.half;
    const g = groundAt(x, z);
    for (let k = 0; k < 3; k++) px[(j * S + i) * 3 + k] = Math.round(Math.min(1, Math.max(0, g[k])) * 255);
  }
await sharp(px, { raw: { width: S, height: S, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ground.png'));
console.log(`ground.png ${S}x${S} in ${Date.now() - t1} ms`);
