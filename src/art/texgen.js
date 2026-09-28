import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// Procedural material textures. Every material is a pair of seamless textures:
//   map  - albedo (sRGB)
//   data - R: height (for bump shading), G: roughness, B: glow mask
// Sampled triplanar by art/enhance.js, so they need no UVs and never stretch.

export function tileNoise(size, period, rng) {
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

// Tileable value noise with different lattice periods per axis: streaks along x.
function aniso(size, px, py, rng) {
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  return (x, y) => {
    const fx = (x / size) * px, fy = (y / size) * py;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px;
    const ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
    const a = lat[ya * px + xa], b = lat[ya * px + xb], c = lat[yb * px + xa], d = lat[yb * px + xb];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Tileable cellular noise: distance to nearest and second-nearest feature point.
function tileCells(size, cells, rng) {
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + rng()) / cells, (j + rng()) / cells]);
  return (x, y) => {
    const u = x / size, v = y / size;
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = (((ci + di) % cells) + cells) % cells, jj = (((cj + dj) % cells) + cells) % cells;
        const p = pts[jj * cells + ii];
        // position of the wrapped feature point, shifted into the neighbouring tile copy
        const px = p[0] + (ci + di - ii) / cells;
        const py = p[1] + (cj + dj - jj) / cells;
        const d = Math.hypot(u - px, v - py) * cells;
        if (d < d1) { d2 = d1; d1 = d; id = jj * cells + ii; }
        else if (d < d2) d2 = d;
      }
    return [d1, d2, id];
  };
}

const fbm = (fns) => (x, y) => {
  let s = 0, w = 0, a = 1;
  for (const f of fns) { s += f(x, y) * a; w += a; a *= 0.5; }
  return s / w;
};

function build(size, seed, painter, extra) {
  const rng = mulberry32(seed);
  const cvA = document.createElement('canvas');
  const cvD = document.createElement('canvas');
  cvA.width = cvA.height = cvD.width = cvD.height = size;
  const ctxA = cvA.getContext('2d'), ctxD = cvD.getContext('2d');
  const A = ctxA.createImageData(size, size), D = ctxD.createImageData(size, size);
  const px = { r: 0, g: 0, b: 0, h: 0, rough: 0.5, glow: 0 };
  const P = painter(rng, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      px.r = px.g = px.b = 0.5; px.h = 0.5; px.rough = 0.6; px.glow = 0;
      P(x, y, px);
      const i = (y * size + x) * 4;
      // albedo painted in linear; store as sRGB
      A.data[i] = Math.min(255, Math.pow(Math.max(0, px.r), 1 / 2.2) * 255);
      A.data[i + 1] = Math.min(255, Math.pow(Math.max(0, px.g), 1 / 2.2) * 255);
      A.data[i + 2] = Math.min(255, Math.pow(Math.max(0, px.b), 1 / 2.2) * 255);
      A.data[i + 3] = 255;
      D.data[i] = Math.min(255, Math.max(0, px.h * 255));
      D.data[i + 1] = Math.min(255, Math.max(0, px.rough * 255));
      D.data[i + 2] = Math.min(255, Math.max(0, px.glow * 255));
      D.data[i + 3] = 255;
    }
  ctxA.putImageData(A, 0, 0);
  ctxD.putImageData(D, 0, 0);
  extra?.(ctxA, ctxD, rng, size);
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(cvA, true), data: tex(cvD, false) };
}

// Thin bright scratches drawn on top of metal albedo, darker grooves in height.
function scratches(count, len, alphaA, alphaD) {
  return (ctxA, ctxD, rng, size) => {
    for (let i = 0; i < count; i++) {
      const x = rng() * size, y = rng() * size, a = rng() * Math.PI * 2, l = len * (0.3 + rng());
      for (const [ctx, style, w] of [[ctxA, `rgba(255,255,255,${alphaA * (0.4 + rng())})`, 0.6], [ctxD, `rgba(60,40,0,${alphaD})`, 0.8]]) {
        ctx.strokeStyle = style;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
          ctx.moveTo(x + ox, y + oy);
          ctx.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + (rng() - 0.5) * 4, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        }
        ctx.stroke();
      }
    }
  };
}

const PAINTERS = {
  steel: (rng, S) => {
    // brushed steel: long fine streaks, soft smudges, a little grime in the low spots
    const n1 = tileNoise(S, 3, rng), n2 = tileNoise(S, 12, rng), n3 = tileNoise(S, 40, rng);
    const b1 = aniso(S, 5, 160, rng), b2 = aniso(S, 3, 70, rng);
    return (x, y, p) => {
      const brush = b1(x, y) * 0.6 + b2(x, y) * 0.4;
      const smudge = n1(x, y) * 0.6 + n2(x, y) * 0.4;
      const grime = Math.max(0, n2(x + 50, y + 9) * 0.7 + n3(x, y) * 0.3 - 0.64) * 2.4;
      const v = 0.62 + (brush - 0.5) * 0.14 + (smudge - 0.5) * 0.08 - grime * 0.2;
      p.r = v * 0.97; p.g = v * 0.985; p.b = v * 1.02;
      p.h = 0.5 + (brush - 0.5) * 0.16 + (n3(x, y) - 0.5) * 0.08 - grime * 0.1;
      p.rough = 0.2 + (brush - 0.5) * 0.14 + smudge * 0.12 + grime * 0.3;
    };
  },
  iron: (rng, S) => {
    const n1 = tileNoise(S, 5, rng), n2 = tileNoise(S, 20, rng), n3 = tileNoise(S, 80, rng);
    return (x, y, p) => {
      const rust = Math.max(0, fbm([n1, n2, n3])(x, y) - 0.6) * 2.4;
      const k = 0.16 + n2(x, y) * 0.06;
      p.r = k + rust * 0.28; p.g = k + rust * 0.1; p.b = k * 1.05 + rust * 0.02;
      p.h = 0.5 + rust * 0.35 + (n3(x, y) - 0.5) * 0.3;
      p.rough = 0.45 + rust * 0.45 + n3(x, y) * 0.1;
    };
  },
  gold: (rng, S) => {
    // polished gold: fine brushing, soft tarnish in the low spots, faint scrollwork
    const n1 = tileNoise(S, 4, rng), n2 = aniso(S, 12, 128, rng), n3 = tileNoise(S, 12, rng);
    return (x, y, p) => {
      const u = x / S, v = y / S;
      const w = Math.sin((u * 3 + Math.sin(v * Math.PI * 6) * 0.15) * Math.PI * 2) * Math.sin((v * 3 + Math.sin(u * Math.PI * 6) * 0.15) * Math.PI * 2);
      const groove = Math.max(0, 1 - Math.abs(w) * 14) * 0.5;
      const brush = n2(x, y);
      const tarnish = Math.max(0, n1(x, y) - 0.62) * 1.2 + groove * 0.35;
      p.r = 1.0 - tarnish * 0.4; p.g = 0.66 - tarnish * 0.3; p.b = 0.22 - tarnish * 0.12;
      p.h = 0.6 - groove * 0.3 + (brush - 0.5) * 0.06 + (n3(x, y) - 0.5) * 0.05;
      p.rough = 0.16 + tarnish * 0.3 + brush * 0.08;
    };
  },
  leather: (rng, S) => {
    const n1 = tileNoise(S, 6, rng), n2 = tileNoise(S, 24, rng), n3 = tileNoise(S, 128, rng), n4 = tileNoise(S, 12, rng);
    return (x, y, p) => {
      const crease = Math.pow(1 - Math.abs(n4(x, y) * 2 - 1), 8);
      const pores = n3(x, y);
      const k = 0.55 + n1(x, y) * 0.35 - crease * 0.25;
      p.r = 0.36 * k; p.g = 0.2 * k; p.b = 0.11 * k;
      p.h = 0.55 + (pores - 0.5) * 0.25 - crease * 0.3 + (n2(x, y) - 0.5) * 0.2;
      p.rough = 0.62 + pores * 0.2 + crease * 0.1;
    };
  },
  cloth: (rng, S) => {
    const n1 = tileNoise(S, 8, rng), n2 = tileNoise(S, 64, rng);
    return (x, y, p) => {
      const f = (Math.PI * 2 * 48) / S;
      const warp = Math.sin(x * f) * 0.5 + 0.5, weft = Math.sin(y * f + Math.PI * 0.5 * (Math.floor(x * 48 / S) % 2)) * 0.5 + 0.5;
      const weave = (warp * 0.5 + weft * 0.5);
      const k = 0.62 + weave * 0.18 + (n1(x, y) - 0.5) * 0.3 + (n2(x, y) - 0.5) * 0.1;
      p.r = p.g = p.b = k; // tinted by material color
      p.h = 0.4 + weave * 0.35;
      p.rough = 0.88 + n2(x, y) * 0.1;
    };
  },
  chain: (rng, S) => {
    const n1 = tileNoise(S, 8, rng);
    const R = S / 16;
    return (x, y, p) => {
      // interlocking rings on a staggered grid
      let best = 9;
      const cx = Math.floor(x / (R * 2)), cy = Math.floor(y / (R * 1.6));
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const gy = cy + dy, off = (gy % 2) * R;
          const ox = (cx + dx) * R * 2 + R + off, oy = gy * R * 1.6 + R * 0.8;
          const d = Math.abs(Math.hypot(x - ox, (y - oy) * 1.1) - R * 0.75) / (R * 0.28);
          best = Math.min(best, d);
        }
      const ring = Math.max(0, 1 - best);
      const k = 0.08 + ring * (0.5 + n1(x, y) * 0.2);
      p.r = k * 0.95; p.g = k * 0.95; p.b = k;
      p.h = ring * 0.9;
      p.rough = 0.35 + (1 - ring) * 0.5;
    };
  },
  bone: (rng, S) => {
    const n1 = tileNoise(S, 5, rng), n2 = tileNoise(S, 40, rng);
    const cells = tileCells(S, 10, rng);
    return (x, y, p) => {
      const [d1, d2] = cells(x, y);
      const crack = Math.max(0, 1 - (d2 - d1) * 14) * (n1(x, y) > 0.45 ? 1 : 0);
      const k = 0.7 + n1(x, y) * 0.2 - crack * 0.35 + (n2(x, y) - 0.5) * 0.08;
      p.r = 0.86 * k; p.g = 0.8 * k; p.b = 0.66 * k;
      p.h = 0.6 - crack * 0.5 + (n2(x, y) - 0.5) * 0.2;
      p.rough = 0.55 + crack * 0.3 + n2(x, y) * 0.1;
    };
  },
  stone: (rng, S) => {
    const n1 = tileNoise(S, 4, rng), n2 = tileNoise(S, 16, rng), n3 = tileNoise(S, 96, rng);
    const cells = tileCells(S, 6, rng);
    return (x, y, p) => {
      const [d1, d2] = cells(x, y);
      const crack = Math.max(0, 1 - (d2 - d1) * 9) * Math.max(0, n2(x, y) - 0.35) * 2;
      const speck = n3(x, y) > 0.72 ? 0.12 : n3(x, y) < 0.2 ? -0.08 : 0;
      const moss = Math.max(0, n1(x + 40, y) - 0.62) * 2.2;
      const k = 0.36 + n1(x, y) * 0.16 + (n2(x, y) - 0.5) * 0.12 + speck - crack * 0.25;
      p.r = k * 1.0 - moss * 0.1; p.g = k * 0.96 + moss * 0.05; p.b = k * 0.9 - moss * 0.08;
      p.h = 0.55 + (n2(x, y) - 0.5) * 0.4 + (n3(x, y) - 0.5) * 0.15 - crack * 0.45;
      p.rough = 0.78 + n3(x, y) * 0.15;
    };
  },
  bark: (rng, S) => {
    const n1 = tileNoise(S, 4, rng), n2 = tileNoise(S, 32, rng);
    return (x, y, p) => {
      const streak = n2(x * 0.15, y * 2) * 0.7 + n1(x, y) * 0.3;
      const ridge = Math.pow(Math.abs(Math.sin((x / S) * Math.PI * 22 + streak * 6)), 3);
      const k = 0.1 + ridge * 0.08 + streak * 0.08;
      p.r = k * 1.2; p.g = k * 0.9; p.b = k * 0.7;
      p.h = 0.3 + ridge * 0.6;
      p.rough = 0.92;
    };
  },
  skin: (rng, S) => {
    // dry, cracked husk skin; the cracks smoulder
    const n1 = tileNoise(S, 5, rng), n2 = tileNoise(S, 30, rng);
    const cells = tileCells(S, 9, rng);
    return (x, y, p) => {
      const [d1, d2] = cells(x, y);
      const crack = Math.max(0, 1 - (d2 - d1) * 7);
      const k = 0.36 + n1(x, y) * 0.2 + (n2(x, y) - 0.5) * 0.12 - crack * 0.2;
      p.r = k * 1.02; p.g = k * 0.92; p.b = k * 0.82;
      p.h = 0.6 - crack * 0.55 + (n2(x, y) - 0.5) * 0.2;
      p.rough = 0.8;
      p.glow = Math.pow(crack, 4) * (n1(x + 50, y) > 0.58 ? 1 : 0);
    };
  },
  chitin: (rng, S) => {
    const n1 = tileNoise(S, 6, rng);
    const cells = tileCells(S, 7, rng);
    return (x, y, p) => {
      const [d1, d2, id] = cells(x, y);
      const plate = Math.min(1, (d2 - d1) * 3);
      const tone = ((id * 37) % 10) / 10;
      const k = 0.07 + plate * 0.08 + tone * 0.03;
      p.r = k * 1.3; p.g = k * 0.9; p.b = k * 0.8;
      p.h = plate * 0.8 + n1(x, y) * 0.1;
      p.rough = 0.22 + (1 - plate) * 0.5;
      p.glow = 0;
    };
  },
  hide: (rng, S) => {
    // brute hide with glowing lava veins
    const n1 = tileNoise(S, 5, rng), n2 = tileNoise(S, 20, rng), n3 = tileNoise(S, 4, rng), n4 = tileNoise(S, 8, rng);
    return (x, y, p) => {
      const vein = Math.pow(1 - Math.abs(n3(x, y) * 2 - 1), 40) * (n4(x, y) > 0.45 ? 1 : 0);
      const k = 0.24 + n1(x, y) * 0.14 + (n2(x, y) - 0.5) * 0.1;
      p.r = k * 1.1; p.g = k * 0.8; p.b = k * 0.7;
      p.h = 0.5 + (n2(x, y) - 0.5) * 0.4 + vein * 0.2;
      p.rough = 0.75;
      p.glow = vein;
    };
  },
  robe: (rng, S) => {
    const n1 = tileNoise(S, 6, rng), n2 = tileNoise(S, 48, rng);
    return (x, y, p) => {
      const fold = Math.pow(Math.abs(Math.sin((x / S) * Math.PI * 6 + n1(x, y) * 3)), 2);
      const k = 0.5 + fold * 0.3 + (n2(x, y) - 0.5) * 0.15;
      p.r = p.g = p.b = k;
      p.h = 0.3 + fold * 0.5;
      p.rough = 0.9;
    };
  },
};

const EXTRAS = {
  steel: scratches(140, 30, 0.18, 0.35),
  iron: scratches(60, 20, 0.08, 0.3),
  gold: scratches(40, 16, 0.1, 0.2),
};

const cache = new Map();
export function materialTextures(kind, size = 256) {
  const key = `${kind}:${size}`;
  if (!cache.has(key)) cache.set(key, build(size, kind.length * 7919 + size, PAINTERS[kind], EXTRAS[kind]));
  return cache.get(key);
}
