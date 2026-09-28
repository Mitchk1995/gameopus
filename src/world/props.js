import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng.js';

// Set-dressing geometry for the ruins: arches, mourning statues, candles, bone
// piles, grave fences and sarcophagi, plus the floor decal textures. Every prop
// is a single merged geometry drawn instanced by world.js.

const prep = (g) => {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
};
export const merge = (parts) => mergeGeometries(parts.map(prep));
const T = (g, x, y, z) => g.translate(x, y, z);
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));

// A pointed gothic arch on two square piers with plinths and capitals.
export function archGeometry() {
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(T(new THREE.BoxGeometry(0.82, 0.34, 0.82), sx * 1.55, 0.17, 0));
    parts.push(T(new THREE.BoxGeometry(0.62, 2.8, 0.62), sx * 1.55, 1.74, 0));
    parts.push(T(new THREE.BoxGeometry(0.8, 0.24, 0.8), sx * 1.55, 3.26, 0));
  }
  const arc = (s, cx, r, a0, a1, cw) => s.absarc(cx, 0, r, a0, a1, cw);
  const s = new THREE.Shape();
  const wo = 1.86, ro = wo * 1.5, co = wo * 0.5, ao = Math.acos(-co / ro);
  const wi = 1.24, ri = wi * 1.5, ci = wi * 0.5, ai = Math.acos(ci / ri);
  s.moveTo(-wo, 0);
  arc(s, co, ro, Math.PI, ao, true);
  arc(s, -co, ro, Math.PI - ao, 0, true);
  s.lineTo(wi, 0);
  arc(s, -ci, ri, 0, ai, false);
  arc(s, ci, ri, Math.PI - ai, Math.PI, false);
  s.lineTo(-wo, 0);
  const band = new THREE.ExtrudeGeometry(s, { depth: 0.56, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 20 });
  band.translate(0, 3.38, -0.28);
  parts.push(band);
  parts.push(T(new THREE.BoxGeometry(0.3, 0.42, 0.66), 0, 3.38 + Math.sqrt(ro * ro - co * co) - 0.12, 0));
  return merge(parts);
}

function wingShape(sx) {
  const s = new THREE.Shape();
  const P = (x, y) => [x * sx, y];
  s.moveTo(...P(0, 0));
  s.quadraticCurveTo(...P(0.08, 0.62), ...P(0.46, 0.98));
  s.quadraticCurveTo(...P(0.66, 0.92), ...P(0.62, 0.6));
  let x = 0.62, y = 0.6;
  for (let i = 0; i < 6; i++) {
    const nx = x - 0.05, ny = y - 0.34;
    s.quadraticCurveTo(...P(x + 0.12, y - 0.2), ...P(nx, ny));
    x = nx; y = ny;
  }
  s.lineTo(...P(0.1, -1.0));
  s.quadraticCurveTo(...P(0.02, -0.45), ...P(0, 0));
  return s;
}

// A hooded mourner with folded wings and hands clasped in prayer, on a plinth.
export function statueGeometry() {
  const parts = [];
  parts.push(T(new THREE.BoxGeometry(1.25, 0.5, 1.25), 0, 0.25, 0));
  parts.push(T(new THREE.BoxGeometry(1.02, 0.22, 1.02), 0, 0.61, 0));
  const robe = new THREE.LatheGeometry(V2([[0.47, 0], [0.45, 0.1], [0.4, 0.5], [0.34, 1.0], [0.31, 1.3], [0.3, 1.5], [0.25, 1.66], [0.15, 1.74], [0.001, 1.76]]), 18);
  robe.scale(1, 1, 0.82);
  parts.push(T(robe, 0, 0.72, 0));
  const hood = new THREE.SphereGeometry(0.23, 16, 12);
  hood.scale(1, 1.08, 1.12);
  hood.rotateX(0.45);
  parts.push(T(hood, 0, 2.56, 0.08));
  const drape = new THREE.ConeGeometry(0.3, 0.5, 14, 1, true);
  parts.push(T(drape, 0, 2.3, 0.0));
  for (const sx of [-1, 1]) {
    const upper = new THREE.CylinderGeometry(0.075, 0.09, 0.5, 8);
    upper.rotateZ(sx * 0.2);
    upper.rotateX(0.3);
    parts.push(T(upper, sx * 0.3, 2.12, 0.1));
    const fore = new THREE.CylinderGeometry(0.062, 0.075, 0.4, 8);
    fore.rotateZ(sx * 1.15);
    fore.rotateY(sx * -0.6);
    parts.push(T(fore, sx * 0.16, 1.9, 0.3));
    const wing = new THREE.ExtrudeGeometry(wingShape(sx), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 });
    wing.scale(1.25, 1.25, 1);
    wing.rotateY(sx * 0.95);
    parts.push(T(wing, sx * 0.14, 2.2, -0.2));
  }
  const hands = new THREE.SphereGeometry(0.085, 10, 8);
  hands.scale(0.8, 1.3, 0.9);
  parts.push(T(hands, 0, 2.0, 0.44));
  return merge(parts);
}

// A cluster of candles on a wax puddle; flames are a separate glowing mesh.
export function candleGeometry(seed = 4) {
  const rng = mulberry32(seed);
  const wax = [T(new THREE.CylinderGeometry(0.3, 0.33, 0.025, 18), 0, 0.012, 0)];
  const flame = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 0.09 + rng() * 0.15;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = (i === 0 ? 0.42 : 0.1 + rng() * 0.3), rad = 0.026 + rng() * 0.018;
    wax.push(T(new THREE.CylinderGeometry(rad, rad * 1.12, h, 8), x, h / 2, z));
    wax.push(T(new THREE.TorusGeometry(rad * 0.9, rad * 0.3, 4, 8).rotateX(Math.PI / 2), x, h - rad * 0.2, z));
    const f = new THREE.SphereGeometry(0.02 + rad * 0.2, 8, 6);
    f.scale(1, 2.4, 1);
    flame.push(T(f, x, h + 0.055, z));
  }
  return { wax: merge(wax), flame: merge(flame) };
}

// A skull and a scatter of long bones and ribs.
export function bonesGeometry(seed = 17) {
  const rng = mulberry32(seed);
  const parts = [];
  const cranium = new THREE.SphereGeometry(0.14, 12, 10);
  cranium.scale(1, 0.9, 1.18);
  parts.push(T(cranium, 0, 0.12, 0));
  parts.push(T(new THREE.BoxGeometry(0.15, 0.06, 0.12), 0, 0.04, 0.1));
  for (let i = 0; i < 5; i++) {
    const L = 0.34 + rng() * 0.3;
    const bone = merge([new THREE.CylinderGeometry(0.02, 0.02, L, 6), T(new THREE.SphereGeometry(0.038, 6, 5), 0, L / 2, 0), T(new THREE.SphereGeometry(0.038, 6, 5), 0, -L / 2, 0)]);
    bone.rotateZ(Math.PI / 2);
    bone.rotateY(rng() * Math.PI);
    parts.push(T(bone, (rng() - 0.5) * 0.7, 0.035 + i * 0.012, (rng() - 0.5) * 0.7));
  }
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.TorusGeometry(0.15, 0.014, 5, 10, Math.PI * 0.8);
    rib.rotateX(-Math.PI / 2 + 0.35);
    parts.push(T(rib, 0.32 + i * 0.07, 0.03, -0.22));
  }
  return merge(parts);
}

// Wrought-iron grave fence: spear-tipped bars between two posts.
export function fenceGeometry() {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const x = -1.4 + i * 0.4;
    parts.push(T(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 6), x, 0.65, 0));
    parts.push(T(new THREE.ConeGeometry(0.045, 0.17, 6), x, 1.39, 0));
  }
  for (const y of [0.24, 1.08]) parts.push(T(new THREE.BoxGeometry(3.1, 0.05, 0.04), 0, y, 0));
  for (const x of [-1.6, 1.6]) {
    parts.push(T(new THREE.BoxGeometry(0.11, 1.5, 0.11), x, 0.75, 0));
    parts.push(T(new THREE.SphereGeometry(0.08, 8, 6), x, 1.56, 0));
  }
  return merge(parts);
}

// A stone sarcophagus with a carved effigy on its lid, the lid knocked askew.
export function sarcophagusGeometry() {
  const parts = [];
  parts.push(T(new THREE.BoxGeometry(1.18, 0.12, 2.36), 0, 0.06, 0));
  parts.push(T(new THREE.BoxGeometry(1.0, 0.62, 2.2), 0, 0.43, 0));
  const lid = merge([
    T(new THREE.BoxGeometry(1.12, 0.14, 2.32), 0, 0, 0),
    T(new THREE.CapsuleGeometry(0.17, 1.1, 4, 10).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0, 0.1, -0.06),
    T(new THREE.SphereGeometry(0.15, 10, 8).scale(1, 0.8, 1), 0, 0.12, 0.78),
    T(new THREE.BoxGeometry(0.34, 0.08, 0.1), 0, 0.14, 0.2),
  ]);
  lid.rotateY(0.14);
  parts.push(T(lid, 0.14, 0.81, 0.12));
  return merge(parts);
}

// Floor decal textures, painted once: a rune circle (glow), a dark stain, and cracks.
function canvas(size, paint) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  paint(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function decalTextures() {
  const rng = mulberry32(5);
  const rune = canvas(512, (c, S) => {
    c.translate(S / 2, S / 2);
    c.strokeStyle = '#fff';
    c.fillStyle = '#fff';
    c.shadowColor = '#fff';
    c.shadowBlur = 6;
    const ring = (r, w) => { c.lineWidth = w; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); };
    ring(236, 5); ring(214, 2); ring(150, 3); ring(132, 1.5);
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2;
      const x = Math.cos(a) * 150, y = Math.sin(a) * 150;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    // procedural glyphs: a few strokes each, set around the outer band
    c.lineWidth = 2.2;
    for (let i = 0; i < 24; i++) {
      c.save();
      c.rotate((i / 24) * Math.PI * 2);
      c.translate(0, -225);
      c.beginPath();
      c.moveTo(0, -11); c.lineTo(0, 11);
      for (let k = 0; k < 2; k++) {
        const y0 = (rng() - 0.5) * 16, dir = rng() < 0.5 ? -1 : 1;
        c.moveTo(0, y0); c.lineTo(dir * 7, y0 + (rng() - 0.5) * 12);
      }
      c.stroke();
      c.restore();
    }
    ring(40, 3);
  });
  const stain = canvas(256, (c, S) => {
    c.translate(S / 2, S / 2);
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, d = i < 6 ? rng() * 30 : 40 + rng() * 70;
      const r = i < 6 ? 40 + rng() * 30 : 4 + rng() * 14;
      const g = c.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2);
      c.fill();
    }
  });
  const crack = canvas(256, (c, S) => {
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineCap = 'round';
    const branch = (x, y, a, len, w, depth) => {
      if (depth > 4 || len < 6) return;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x, y);
      let px = x, py = y;
      for (let i = 0; i < 5; i++) {
        a += (rng() - 0.5) * 0.7;
        px += Math.cos(a) * (len / 5);
        py += Math.sin(a) * (len / 5);
        c.lineTo(px, py);
      }
      c.stroke();
      branch(px, py, a + 0.5 + rng() * 0.4, len * 0.6, w * 0.65, depth + 1);
      if (rng() < 0.7) branch(px, py, a - 0.5 - rng() * 0.4, len * 0.55, w * 0.6, depth + 1);
    };
    for (let i = 0; i < 3; i++) branch(S / 2, S / 2, (i / 3) * Math.PI * 2 + rng(), 70, 4, 0);
  });
  return { rune, stain, crack };
}
