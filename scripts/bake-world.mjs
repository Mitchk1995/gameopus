// Bakes the designed map (src/world/map.js) into data the game loads instantly:
//   public/assets/world/height.bin  Int16 heights in centimetres, 801 x 801 samples (1 m apart)
//   public/assets/world/ground.png  RGB ground-cover weights: path, forest floor, cobble (sand comes from height)
//   public/assets/world/biome_a.png RGB biome weights: meadow, rocky heath, marsh   (512 x 512, 1.56 m a pixel)
//   public/assets/world/biome_b.png RGB biome weights: dry scrub, woodland moss, mine dust
// Run after editing map.js (or ashford.js):  node scripts/bake-world.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { WORLD, heightAt, groundAt, biomeAt } from '../src/world/map.js';

const OUT = path.resolve('public/assets/world');
await mkdir(OUT, { recursive: true });

const N = WORLD.size + 1;
const heights = new Int16Array(N * N);
const t0 = Date.now();
for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) heights[j * N + i] = Math.round(heightAt(i - WORLD.half, j - WORLD.half) * 100);
await writeFile(path.join(OUT, 'height.bin'), Buffer.from(heights.buffer));
console.log(`height.bin ${N}x${N} in ${Date.now() - t0} ms`);

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

const B = 512;
const a = Buffer.alloc(B * B * 3), b = Buffer.alloc(B * B * 3);
const t2 = Date.now();
for (let j = 0; j < B; j++)
  for (let i = 0; i < B; i++) {
    const x = ((i + 0.5) / B) * WORLD.size - WORLD.half, z = ((j + 0.5) / B) * WORLD.size - WORLD.half;
    const w = biomeAt(x, z).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
    for (let k = 0; k < 3; k++) {
      a[(j * B + i) * 3 + k] = w[k];
      b[(j * B + i) * 3 + k] = w[3 + k];
    }
  }
await sharp(a, { raw: { width: B, height: B, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'biome_a.png'));
await sharp(b, { raw: { width: B, height: B, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'biome_b.png'));
console.log(`biome_a.png / biome_b.png ${B}x${B} in ${Date.now() - t2} ms`);
