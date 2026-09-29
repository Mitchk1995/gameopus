import * as THREE from 'three';
import { enhance } from '../engine/detail.js';
import { findMaterial } from './townkit.js';
import { extraMaterials } from './landmarks.js';

// The palette Ashford's buildings are drawn from: limewashes for the plaster, tones for the
// timbers and the stone, and the three roofings (weathered clay peg tiles, stone slates and reed
// thatch) in a few tints. Kit walls take these as material swaps (Batcher meta.swap), so a whole
// street of different houses still bakes to a handful of draw calls: one per material in use.

// Multipliers on the kit's own colour.
export const WASH = {
  cream: [1, 1, 1],
  white: [1.14, 1.13, 1.1],
  ochre: [1.12, 0.92, 0.6],
  pink: [1.12, 0.84, 0.76],
  sage: [0.9, 0.98, 0.84],
  russet: [1.08, 0.78, 0.62],
};
export const TIMBER = {
  kit: [0.92, 0.86, 0.8],
  oak: [0.6, 0.5, 0.42],
  black: [0.3, 0.27, 0.25],
};
export const STONE = {
  grey: [1, 1, 1],
  honey: [1.22, 1.06, 0.8],
  dark: [0.82, 0.82, 0.86],
};
// Roofing: texture, tint, metres per repeat across (u, along the ridge) and down the slope (v).
export const ROOFING = {
  tile: { tex: 'tile', tint: [1, 1, 1], tu: 1.9, tv: 1.9 },
  'tile-red': { tex: 'tile', tint: [1.14, 0.88, 0.8], tu: 1.9, tv: 1.9 },
  'tile-brown': { tex: 'tile', tint: [0.8, 0.7, 0.64], tu: 1.9, tv: 1.9 },
  slate: { tex: 'slate', tint: [1, 1, 1], tu: 3.6, tv: 3.6 },
  'slate-dark': { tex: 'slate', tint: [0.78, 0.8, 0.86], tu: 3.6, tv: 3.6 },
  thatch: { tex: 'thatch', tint: [1.12, 1.0, 0.8], tu: 2.6, tv: 0 },
};
// Door leaves: painted or plain oak.
export const PAINT = {
  oak: [0.7, 0.6, 0.52],
  red: [0.85, 0.36, 0.3],
  green: [0.42, 0.58, 0.44],
  blue: [0.42, 0.56, 0.66],
  black: [0.32, 0.3, 0.3],
};

const tinted = (base, rgb, name) => {
  const m = base.clone();
  m.color = base.color.clone().multiply(new THREE.Color(...rgb));
  if (name) m.name = name;
  return enhance(m);
};

export async function houseLooks(kit, assets, tk) {
  const xm = await extraMaterials(tk, assets);
  const load = (id) => Promise.all([
    assets.texture(`build/${id}_a.webp`, { anisotropy: 16 }),
    assets.texture(`build/${id}_n.webp`, { srgb: false, anisotropy: 16 }),
    assets.texture(`build/${id}_r.webp`, { srgb: false }),
  ]);
  const [tile, slate, thatch] = await Promise.all([load('tile'), load('slate'), load('thatch')]);
  const tex = { tile, slate, thatch };
  const base = {
    plaster: findMaterial(kit, 'MI_Plaster'),
    wood: findMaterial(kit, 'MI_WoodTrim'),
    stone: findMaterial(kit, 'MI_UnevenBrick'),
    brick: findMaterial(kit, 'MI_RedBrick'),
  };
  const cache = new Map();
  const once = (key, make) => (cache.has(key) ? cache.get(key) : cache.set(key, make()).get(key));
  const L = {
    xm,
    base,
    plaster: (k = 'cream') => (k === 'cream' ? base.plaster : once('p' + k, () => tinted(base.plaster, WASH[k] || WASH.cream))),
    wood: (k = 'kit') => once('w' + k, () => tinted(base.wood, TIMBER[k] || TIMBER.kit)),
    // Sawn timber with the grain along each piece (bargeboards, frames, posts, boards), in the same tones.
    timber: (k = 'kit') => once('t' + k, () => { const m = tinted(xm.timber, TIMBER[k] || TIMBER.kit); m.userData = { ...xm.timber.userData }; return m; }),
    stone: (k = 'grey') => (k === 'grey' ? base.stone : once('s' + k, () => tinted(base.stone, STONE[k] || STONE.grey))),
    // Dressed stone for sills, mullions and hood moulds: the plaster's fine grain in a stone colour.
    dressed: (k = 'grey') => once('d' + k, () => tinted(base.plaster, k === 'honey' ? [1.02, 0.9, 0.7] : [0.8, 0.78, 0.74], 'MI_Plaster')),
    roof: (k = 'tile') => once('r' + k, () => {
      const R = ROOFING[k] || ROOFING.tile;
      const [a, n, r] = tex[R.tex];
      const m = new THREE.MeshStandardMaterial({ map: a, normalMap: n, roughnessMap: r, roughness: 1, color: new THREE.Color(...R.tint) });
      m.name = R.tex === 'thatch' ? 'Roof_Thatch' : R.tex === 'slate' ? 'Roof_Slate' : 'Roof_Tile';
      m.userData.roofing = { ...R, key: k };
      return enhance(m);
    }),
    // The kit's own swaps for a house: its plaster wash, timber tone and stone. On stone walls the kit's
    // timber band at each floor becomes a dressed-stone string course.
    swap: ({ wash = 'cream', timber = 'kit', stone = 'grey' } = {}, masonry = false) => once(`x${wash}|${timber}|${stone}|${masonry}`, () => {
      const out = {};
      if (wash !== 'cream') out.MI_Plaster = L.plaster(wash);
      out.MI_WoodTrim = masonry ? L.dressed(stone) : L.wood(timber);
      if (stone !== 'grey') out.MI_UnevenBrick = L.stone(stone);
      return out;
    }),
    // Paint on boards: the kit wood's grain in grey under the colour, so red reads as red.
    paint: (k = 'oak') => once('paint' + k, () => {
      if (k === 'oak') return tinted(base.wood, PAINT.oak);
      const m = base.wood.clone();
      m.map = greyTexture(base.wood.map);
      m.color = new THREE.Color(...(PAINT[k] || PAINT.oak)).multiplyScalar(1.25);
      m.name = 'MI_WoodTrim';
      return enhance(m);
    }),
    brick: base.brick,
    pot: new THREE.MeshStandardMaterial({ color: 0xa4553a, roughness: 0.85 }),
    iron: tk.m.iron,
    glass: glassMaterial('diamond'),
    glassSquare: glassMaterial('square'),
    lead: new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.6, metalness: 0.4 }),
    signs: new Map(),
    // Letters cut into a stone tablet (a date stone, the bank's name over its door).
    carved: (text, { w = 256, h = 140 } = {}) => once('c' + text, () => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      g.fillStyle = '#b9ab8c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '60,50,40' : '240,230,210'},0.08)`; g.fillRect(Math.random() * w, Math.random() * h, 3, 2); }
      g.strokeStyle = 'rgba(70,60,45,0.8)';
      g.lineWidth = 4;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.font = `bold ${Math.round(h * (text.length > 6 ? 0.34 : 0.5))}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // Cut letters: a dark fill with a light lower lip, as a chisel leaves them.
      g.fillStyle = 'rgba(245,235,215,0.7)';
      g.fillText(text, w / 2 + 1.5, h / 2 + 3);
      g.fillStyle = '#3e3326';
      g.fillText(text, w / 2, h / 2 + 1);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      m.name = 'Stone_Carved';
      m.normalMap = flatNormal();
      return enhance(m);
    }),
  };
  return L;
}

// Leaded lights: dark old glass with a soft sheen, held in lead cames laid in diamonds (casements) or
// in small squares (the stone houses' mullioned windows). One texture repeat is 0.5 m of window.
function glassMaterial(kind) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, '#46585a');
  grd.addColorStop(0.5, '#2b393c');
  grd.addColorStop(1, '#3a4a4a');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // Each pane a touch different: old glass is never even.
  let seed = kind === 'diamond' ? 11 : 23;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = '#1d1f20';
  g.lineWidth = 5;
  g.lineCap = 'round';
  if (kind === 'diamond') {
    // Diamonds four across and three up per repeat (taller than wide, like real quarries): lead
    // lines of slope h/w that land back on the lattice at the far edge, so the texture tiles.
    const nx = 4, ny = 3, w = S / nx, h = S / ny;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${150 + r() * 60},${170 + r() * 50},${160 + r() * 40},${0.04 + r() * 0.07})`;
      g.beginPath(); g.arc(r() * S, r() * S, 8 + r() * 26, 0, Math.PI * 2); g.fill();
    }
    const run = (S / h) * w;
    for (let k = -8; k <= nx + 8; k++) {
      g.beginPath(); g.moveTo(k * w, 0); g.lineTo(k * w + run, S); g.stroke();
      g.beginPath(); g.moveTo(k * w, 0); g.lineTo(k * w - run, S); g.stroke();
    }
    void ny;
  } else {
    const nx = 4, ny = 5;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      g.fillStyle = `rgba(${150 + r() * 60},${170 + r() * 50},${160 + r() * 40},${0.05 + r() * 0.08})`;
      g.fillRect((i * S) / nx, (j * S) / ny, S / nx, S / ny);
    }
    for (let i = 0; i <= nx; i++) { g.beginPath(); g.moveTo((i * S) / nx, 0); g.lineTo((i * S) / nx, S); g.stroke(); }
    for (let j = 0; j <= ny; j++) { g.beginPath(); g.moveTo(0, (j * S) / ny); g.lineTo(S, (j * S) / ny); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.4 });
  m.name = 'Glass_Leaded';
  m.normalMap = flatNormal();
  return enhance(m);
}

// A light grey copy of a texture (its grain and knots kept, its colour gone), for paint to colour.
const greys = new Map();
function greyTexture(tex) {
  if (!tex?.image) return tex;
  if (greys.has(tex)) return greys.get(tex);
  const img = tex.image, W = img.width, H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    const v = Math.min(255, 70 + l * 0.9);
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.colorSpace = tex.colorSpace;
  t.anisotropy = Math.max(8, tex.anisotropy || 1);
  t.channel = tex.channel;
  greys.set(tex, t);
  return t;
}

let flat = null;
export function flatNormal() {
  if (!flat) {
    flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
    flat.anisotropy = 16;
    flat.needsUpdate = true;
  }
  return flat;
}

// A hanging sign: a painted board with a picture and a name, the way trades were signed. The picture
// is drawn in paths (a pike, coins, a sack, an anvil, a jug, a barrel...), so no image files are needed.
export function signMaterial(L, text, icon, { bg = '#23402e', fg = '#e9d9a8', w = 320, h = 256 } = {}) {
  const key = `${text}|${icon}|${bg}`;
  if (L.signs.has(key)) return L.signs.get(key);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  // Weathered paint on boards.
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.18;
  for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect(0, (i * h) / 9, w, 2); }
  g.globalAlpha = 1;
  g.strokeStyle = fg;
  g.lineWidth = 7;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.lineWidth = 2;
  g.strokeRect(20, 20, w - 40, h - 40);
  g.fillStyle = fg;
  g.strokeStyle = fg;
  drawIcon(g, icon, w / 2, h * 0.43, Math.min(w, h) * 0.3);
  g.font = `bold ${Math.round(h * 0.13)}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fg;
  g.fillText(text, w / 2, h * 0.8);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  m.name = 'Sign_' + text;
  m.normalMap = flatNormal();
  enhance(m);
  L.signs.set(key, m);
  return m;
}

function drawIcon(g, icon, x, y, s) {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const P = (pts, fill = true) => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a * s, b * s) : g.moveTo(a * s, b * s))); g.closePath(); fill ? g.fill() : g.stroke(); };
  if (icon === 'pike') {
    // A long pike fish with its jaw open, the Crooked Pike's own.
    g.beginPath();
    g.moveTo(-1.1 * s, 0);
    g.quadraticCurveTo(-0.4 * s, -0.42 * s, 0.6 * s, -0.12 * s);
    g.lineTo(1.05 * s, -0.08 * s);
    g.lineTo(0.72 * s, 0.02 * s);
    g.lineTo(1.0 * s, 0.1 * s);
    g.lineTo(0.6 * s, 0.14 * s);
    g.quadraticCurveTo(-0.4 * s, 0.36 * s, -1.1 * s, 0);
    g.fill();
    P([[-1.05, 0], [-1.45, -0.35], [-1.3, 0], [-1.45, 0.35]]);
    P([[-0.2, -0.25], [0.05, -0.5], [0.15, -0.2]]);
    g.fillStyle = '#23402e';
    g.beginPath(); g.arc(0.62 * s, -0.04 * s, 0.05 * s, 0, Math.PI * 2); g.fill();
  } else if (icon === 'coins') {
    for (const [cx, cy, r] of [[-0.45, 0.2, 0.34], [0.35, 0.25, 0.34], [-0.05, -0.2, 0.36]]) {
      g.beginPath(); g.arc(cx * s, cy * s, r * s, 0, Math.PI * 2); g.fill();
      g.save(); g.fillStyle = '#23402e'; g.beginPath(); g.arc(cx * s, cy * s, r * s * 0.7, 0, Math.PI * 2); g.fill(); g.restore();
      g.beginPath(); g.arc(cx * s, cy * s, r * s * 0.45, 0, Math.PI * 2); g.fill();
    }
  } else if (icon === 'sack') {
    P([[-0.55, 0.6], [0.55, 0.6], [0.62, 0.1], [0.3, -0.35], [0.12, -0.45], [0.2, -0.62], [-0.2, -0.62], [-0.12, -0.45], [-0.3, -0.35], [-0.62, 0.1]]);
  } else if (icon === 'anvil') {
    P([[-0.9, -0.35], [0.7, -0.35], [0.7, -0.1], [0.3, 0.05], [0.25, 0.3], [0.5, 0.45], [0.5, 0.6], [-0.5, 0.6], [-0.5, 0.45], [-0.25, 0.3], [-0.3, 0.05], [-0.6, -0.05]]);
    P([[0.1, -0.95], [0.35, -0.95], [0.35, -0.72], [0.1, -0.72]]);
    g.lineWidth = s * 0.1; g.beginPath(); g.moveTo(0.22 * s, -0.72 * s); g.lineTo(-0.3 * s, -0.45 * s); g.stroke();
  } else if (icon === 'jug') {
    g.beginPath();
    g.moveTo(-0.3 * s, -0.7 * s);
    g.lineTo(0.3 * s, -0.7 * s);
    g.quadraticCurveTo(0.2 * s, -0.4 * s, 0.5 * s, 0.05 * s);
    g.quadraticCurveTo(0.6 * s, 0.55 * s, 0.25 * s, 0.7 * s);
    g.lineTo(-0.25 * s, 0.7 * s);
    g.quadraticCurveTo(-0.6 * s, 0.55 * s, -0.5 * s, 0.05 * s);
    g.quadraticCurveTo(-0.2 * s, -0.4 * s, -0.3 * s, -0.7 * s);
    g.fill();
    g.lineWidth = s * 0.1; g.beginPath(); g.arc(0.55 * s, -0.1 * s, 0.25 * s, -1.4, 1.2); g.stroke();
  } else if (icon === 'barrel') {
    g.beginPath(); g.ellipse(0, 0, 0.55 * s, 0.75 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#23402e';
    for (const yy of [-0.45, 0.45]) g.fillRect(-0.6 * s, yy * s - 0.05 * s, 1.2 * s, 0.1 * s);
  } else if (icon === 'horse') {
    P([[-0.8, 0.6], [-0.7, -0.1], [-0.2, -0.2], [0.35, -0.3], [0.55, -0.75], [0.8, -0.6], [0.75, -0.35], [0.5, -0.1], [0.45, 0.6], [0.3, 0.6], [0.25, 0.1], [-0.45, 0.1], [-0.55, 0.6]]);
  } else if (icon === 'key') {
    g.lineWidth = s * 0.14;
    g.beginPath(); g.arc(-0.5 * s, 0, 0.3 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-0.2 * s, 0); g.lineTo(0.8 * s, 0); g.lineTo(0.8 * s, 0.3 * s); g.moveTo(0.5 * s, 0); g.lineTo(0.5 * s, 0.25 * s); g.stroke();
  } else if (icon === 'bell') {
    g.beginPath();
    g.moveTo(-0.15 * s, -0.7 * s);
    g.quadraticCurveTo(-0.5 * s, -0.5 * s, -0.5 * s, 0.2 * s);
    g.lineTo(-0.7 * s, 0.5 * s);
    g.lineTo(0.7 * s, 0.5 * s);
    g.lineTo(0.5 * s, 0.2 * s);
    g.quadraticCurveTo(0.5 * s, -0.5 * s, 0.15 * s, -0.7 * s);
    g.fill();
    g.beginPath(); g.arc(0, 0.62 * s, 0.14 * s, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
