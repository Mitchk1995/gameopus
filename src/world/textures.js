import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// Tileable value noise on a lattice of `period` cells across the texture.
function tileNoise(size, period, rng) {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  return (x, y) => {
    const fx = (x / size) * period, fy = (y / size) * period;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const xa = ((x0 % period) + period) % period, xb = (xa + 1) % period;
    const ya = ((y0 % period) + period) % period, yb = (ya + 1) % period;
    const a = lat[ya * period + xa], b = lat[ya * period + xb], c = lat[yb * period + xa], d = lat[yb * period + xb];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Procedural flagstone floor: albedo, normal and roughness maps, all seamless.
export function makeFlagstones(S = 1024, seed = 11) {
  const rng = mulberry32(seed);
  const nA = tileNoise(S, 6, rng), nB = tileNoise(S, 24, rng), nC = tileNoise(S, 96, rng), nD = tileNoise(S, 256, rng);
  const height = new Float32Array(S * S);
  const albedo = new Float32Array(S * S * 3);
  const rough = new Float32Array(S * S);

  // Split a 4x4 grid of cells into irregular slabs.
  const gap = 5, cell = S / 4;
  const rects = [];
  const split = (x, y, w, h, d) => {
    if (d >= 3 || (w < cell * 0.45 && h < cell * 0.45) || (d > 0 && rng() < 0.28)) return rects.push([x, y, w, h]);
    const vert = w > h * 1.3 ? true : h > w * 1.3 ? false : rng() < 0.5;
    const k = 0.35 + rng() * 0.3;
    if (vert) { const a = Math.round(w * k); split(x, y, a, h, d + 1); split(x + a, y, w - a, h, d + 1); }
    else { const a = Math.round(h * k); split(x, y, w, a, d + 1); split(x, y + a, w, h - a, d + 1); }
  };
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) split(cx * cell, cy * cell, cell, cell, 0);
  {
    for (const [cx, ry, w, rh] of rects) {
      const base = 0.55 + rng() * 0.35;
      const warm = rng();
      const moss = rng() < 0.22 ? 0.5 + rng() * 0.5 : 0;
      const shade = 0.75 + rng() * 0.4;
      const polish = rng() < 0.2;
      for (let py = ry; py < ry + rh; py++) {
        for (let px = cx; px < cx + w; px++) {
          const wx = px;
          const i = py * S + wx;
          let edge = Math.min(px - cx, cx + w - 1 - px, py - ry, ry + rh - 1 - py);
          edge += (nC(wx, py) - 0.5) * 9;
          if (edge < gap) continue;
          const bevel = Math.min(1, (edge - gap) / 12);
          const n = nB(wx, py) * 0.6 + nC(wx, py) * 0.3 + nD(wx, py) * 0.1;
          height[i] = base * Math.sqrt(bevel) * (0.85 + n * 0.3);
          const grime = nA(wx, py);
          let cr = 0.24 + warm * 0.05, cg = 0.22 + warm * 0.02, cb = 0.21 - warm * 0.02;
          const k = shade * (0.6 + n * 0.6) * (0.75 + grime * 0.4) * (0.7 + bevel * 0.3);
          cr *= k; cg *= k; cb *= k;
          if (moss) {
            const m = Math.max(0, nB(wx + 300, py) - 0.45) * 2 * moss;
            cr += (0.06 - cr) * m; cg += (0.11 - cg) * m; cb += (0.07 - cb) * m;
          }
          const j = i * 3;
          albedo[j] = cr; albedo[j + 1] = cg; albedo[j + 2] = cb;
          rough[i] = polish ? 0.45 + n * 0.2 : 0.78 + n * 0.2;
        }
      }
    }
  }

  // Gaps: dark grit.
  for (let i = 0; i < S * S; i++) {
    if (height[i] > 0) continue;
    const x = i % S, y = (i / S) | 0;
    const n = nC(x, y);
    const j = i * 3;
    albedo[j] = 0.05 + n * 0.03; albedo[j + 1] = 0.045 + n * 0.025; albedo[j + 2] = 0.04 + n * 0.02;
    height[i] = 0.02 * n;
    rough[i] = 1;
  }

  // Cracks.
  for (let c = 0; c < 40; c++) {
    let x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2;
    const len = 30 + rng() * 140;
    for (let s = 0; s < len; s++) {
      a += (rng() - 0.5) * 0.7;
      x += Math.cos(a); y += Math.sin(a);
      const i = (((y | 0) + S) % S) * S + (((x | 0) + S) % S);
      if (height[i] <= 0.05) break;
      height[i] *= 0.45;
      albedo[i * 3] *= 0.45; albedo[i * 3 + 1] *= 0.45; albedo[i * 3 + 2] *= 0.45;
    }
  }

  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    return { cv, ctx, img: ctx.createImageData(S, S) };
  };
  const A = mk(), N = mk(), R = mk();
  const H = (x, y) => height[(((y + S) % S) * S) + ((x + S) % S)];
  const strength = 7;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x, p = i * 4;
      // albedo is in linear space; encode to sRGB
      for (let k = 0; k < 3; k++) A.img.data[p + k] = Math.min(255, Math.pow(albedo[i * 3 + k], 1 / 2.2) * 255);
      A.img.data[p + 3] = 255;
      let nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      let ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      N.img.data[p] = (nx * inv * 0.5 + 0.5) * 255;
      N.img.data[p + 1] = (ny * inv * 0.5 + 0.5) * 255;
      N.img.data[p + 2] = (inv * 0.5 + 0.5) * 255;
      N.img.data[p + 3] = 255;
      R.img.data[p] = 255;
      R.img.data[p + 1] = rough[i] * 255;
      R.img.data[p + 2] = 0;
      R.img.data[p + 3] = 255;
    }
  }
  const tex = (o, srgb) => {
    o.ctx.putImageData(o.img, 0, 0);
    const t = new THREE.CanvasTexture(o.cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(A, true), normalMap: tex(N, false), roughnessMap: tex(R, false) };
}
