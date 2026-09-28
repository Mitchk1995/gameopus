import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS } from '../game/items.js';

// Small 3D models for items, built from primitives with PBR materials. The same
// model is rendered into the inventory icon (by a little renderer of its own) and,
// for tools and weapons, held in the character's hand. Models are built at real
// scale in metres, with the grip at the origin for held things.

const mats = new Map();
function mat(key, make) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key);
}
const metal = (color) => mat(`metal${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.32 }));
const wood = (color = 0x6b4a2c) => mat(`wood${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.7, map: grainTexture() }));
const leather = () => mat('leather', () => new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.8 }));
const plain = (color, roughness = 0.8, metalness = 0) => mat(`p${color}${roughness}${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));

// Streaky grain for handles and shafts.
let grain = null;
function grainTexture() {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c8a27a';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 64, w = 0.6 + Math.random() * 2.2, a = 0.08 + Math.random() * 0.18;
    g.fillStyle = `rgba(70,40,20,${a})`;
    g.fillRect(x, 0, w, 256);
  }
  grain = new THREE.CanvasTexture(c);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  return grain;
}

function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.setScalar(s);
  return m;
}

// Seeded noise-ish displacement for lumps.
function lumpy(radius, detail, amount, seed, squash = [1, 1, 1]) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(radius, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 17 + seed) * Math.cos(v.y * 13 - seed * 0.7) * Math.sin(v.z * 19 + seed * 1.3);
    const n2 = Math.sin(v.x * 41 + seed * 2) * Math.sin(v.z * 37 - seed);
    v.multiplyScalar(1 + n * amount + n2 * amount * 0.35);
    p.setXYZ(i, v.x * squash[0], v.y * squash[1], v.z * squash[2]);
  }
  g.computeVertexNormals();
  return g;
}

// A lathe from a profile of [radius, height] points.
function lathe(points, segs = 28) {
  return new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segs);
}

// ------------------------------------------------------------------ builders
const PIKE_SPOT = new THREE.Color(0xe6dc98);

// Rune glyphs, drawn in a 5 cm square: air a ring, mind an eye, water a drop,
// earth a mountain, fire a flame.
function runeGlyph(kind) {
  const s = new THREE.Shape(), r = 0.022;
  const circle = (path, cx, cy, rad, ccw = false) => path.absarc(cx, cy, rad, 0, Math.PI * 2, ccw);
  if (kind === 'air') {
    circle(s, 0, 0, r);
    const h = new THREE.Path();
    circle(h, 0, 0, r * 0.55, true);
    s.holes.push(h);
  } else if (kind === 'mind') {
    s.absellipse(0, 0, r * 1.15, r * 0.7, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    circle(h, 0, 0, r * 0.35, true);
    s.holes.push(h);
  } else if (kind === 'water') {
    s.moveTo(0, r * 1.2);
    s.quadraticCurveTo(r * 0.95, -r * 0.1, r * 0.7, -r * 0.55);
    s.absarc(0, -r * 0.45, r * 0.72, -0.1, Math.PI + 0.1, true);
    s.quadraticCurveTo(-r * 0.95, -r * 0.1, 0, r * 1.2);
  } else if (kind === 'earth') {
    s.moveTo(-r * 1.1, -r * 0.8);
    s.lineTo(-r * 0.2, r * 0.9);
    s.lineTo(r * 0.25, r * 0.1);
    s.lineTo(r * 0.5, r * 0.45);
    s.lineTo(r * 1.1, -r * 0.8);
    s.closePath();
  } else {
    s.moveTo(0, r * 1.2);
    s.quadraticCurveTo(r * 0.4, r * 0.5, r * 0.8, r * 0.3);
    s.quadraticCurveTo(r * 1.0, -r * 0.9, 0, -r * 0.95);
    s.quadraticCurveTo(-r * 1.0, -r * 0.9, -r * 0.8, r * 0.1);
    s.quadraticCurveTo(-r * 0.3, r * 0.2, 0, r * 1.2);
  }
  return s;
}

const BUILD = {
  coins(a) {
    const g = new THREE.Group();
    const gold = metal(0xd8a93c);
    const coin = new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24);
    let seed = 1;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let s = 0; s < 3; s++)
      for (let k = 0; k < 4 - s; k++) g.add(mesh(coin, gold, { x: (s - 1) * 0.055 + (r() - 0.5) * 0.006, y: 0.003 + k * 0.0065, z: (r() - 0.5) * 0.012, ry: r() }));
    g.add(mesh(coin, gold, { x: 0.02, y: 0.012, z: 0.045, rx: 0.35, rz: 0.2 }));
    return g;
  },

  logs(a, assets) {
    const g = new THREE.Group();
    const bark = barkMaterial(a.bark, assets);
    const end = ringsMaterial(a.end);
    const geo = new THREE.CylinderGeometry(0.075, 0.08, 0.5, 14, 1);
    for (const [x, y, z, ry] of [[-0.08, 0.08, 0, 0.1], [0.08, 0.08, 0.01, -0.08], [0, 0.215, -0.005, 0.03]]) {
      const log = mesh(geo, [bark, end, end], { x, y, z, rx: Math.PI / 2, rz: ry });
      g.add(log);
    }
    return g;
  },

  ore(a) {
    const geo = lumpy(0.11, 3, 0.16, (a.fleck % 97) + 3, [1.15, 0.85, 1]);
    const col = new Float32Array(geo.attributes.position.count * 3);
    const base = new THREE.Color(a.base ?? 0x5b5650), fleck = new THREE.Color(a.fleck), v = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < geo.attributes.position.count; i++) {
      v.fromBufferAttribute(geo.attributes.position, i);
      const n = Math.sin(v.x * 60) * Math.sin(v.y * 55 + 1) * Math.sin(v.z * 58 + 2);
      c.copy(base).lerp(fleck, n > 0.2 ? 0.95 : n > 0.05 ? 0.4 : 0).multiplyScalar(0.8 + 0.4 * Math.abs(Math.sin(v.x * 23 + v.z * 19)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: a.fleck === 0x151515 ? 0 : 0.35 });
    return mesh(geo, m, { y: 0.09 });
  },

  clay(a) {
    return mesh(lumpy(0.09, 3, a.soft ? 0.05 : 0.1, 5, [1.2, 0.8, 1]), plain(a.color, a.soft ? 0.45 : 0.9), { y: 0.07 });
  },

  bar(a) {
    // An ingot: wider at the base, bevelled top.
    const shape = new THREE.Shape();
    shape.moveTo(-0.13, 0);
    shape.lineTo(0.13, 0);
    shape.lineTo(0.105, 0.06);
    shape.lineTo(-0.105, 0.06);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
    geo.translate(0, 0, -0.035);
    const m = new THREE.MeshStandardMaterial({ color: a.color, metalness: 1, roughness: 0.38 });
    return mesh(geo, m, { y: 0.005 });
  },

  fish(a) {
    const g = new THREE.Group();
    const L = 0.34 * (a.size || 1), k = a.girth || 1;
    const cy = 0.06 * k;
    // Body: a lathe along x, flattened sideways.
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      prof.push([Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.055 * k * (1 - t * 0.35) + 0.002, (t - 0.5) * L]);
    }
    const body = lathe(prof, 20);
    body.rotateZ(-Math.PI / 2);
    body.scale(1, 1, 0.55);
    // Colour: darker back, lighter belly, speckles for trout, pale spots for pike.
    const n = body.attributes.position.count, col = new Float32Array(n * 3);
    const back = new THREE.Color(a.color), belly = new THREE.Color(a.belly ?? 0xdedcd0), c = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(body.attributes.position, i);
      c.copy(belly).lerp(back, THREE.MathUtils.smoothstep(v.y / k, -0.02, 0.03));
      if (a.pike) {
        if (Math.sin((v.x / k) * 95) * Math.sin((v.y / k) * 120 + (v.z / k) * 40) > 0.55 && v.y > -0.01 * k) c.lerp(PIKE_SPOT, 0.6);
      } else if (!a.cooked && !a.burnt && Math.sin(v.x * 190) * Math.sin(v.y * 170 + v.z * 90) > 0.85) c.multiplyScalar(0.5);
      if (a.cooked) c.multiplyScalar(0.85 + 0.25 * Math.max(0, Math.sin(v.x * 70)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: a.cooked ? 0.7 : a.burnt ? 0.95 : 0.3, metalness: a.cooked || a.burnt ? 0 : 0.25 });
    g.add(mesh(body, skin, { y: cy }));
    // Tail and fins.
    const fin = new THREE.MeshStandardMaterial({ color: new THREE.Color(a.color).multiplyScalar(0.8), roughness: 0.6, side: THREE.DoubleSide });
    const tail = new THREE.Shape();
    const tw = 0.07 * (a.size || 1), th = 0.045 * k;
    tail.moveTo(0, 0);
    tail.lineTo(-tw, th);
    tail.quadraticCurveTo(-tw * 0.7, 0, -tw, -th);
    tail.closePath();
    g.add(mesh(new THREE.ShapeGeometry(tail), fin, { x: -L / 2 + 0.01, y: cy }));
    const dorsal = new THREE.Shape();
    dorsal.moveTo(-0.04 * k, 0);
    dorsal.quadraticCurveTo(0, 0.05 * k, 0.03 * k, 0);
    dorsal.closePath();
    // A pike's dorsal fin sits far back, near the tail.
    g.add(mesh(new THREE.ShapeGeometry(dorsal), fin, { x: a.pike ? -L * 0.3 : -0.01, y: cy + 0.045 * k }));
    if (a.pike) {
      // The long duck-bill jaw, with teeth.
      const jaw = new THREE.ConeGeometry(0.03 * k, 0.12 * k, 10);
      jaw.rotateZ(-Math.PI / 2);
      jaw.scale(1, 0.45, 0.8);
      g.add(mesh(jaw, skin, { x: L / 2 + 0.03 * k, y: cy - 0.008 * k }));
      const tooth = plain(0xf4f0e0, 0.4);
      for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.0045 * k, 0.014 * k, 4), tooth, { x: L / 2 + (0.0 + i * 0.016) * k, y: cy - 0.012 * k, z: sz * (0.016 - i * 0.0022) * k, rx: Math.PI }));
    }
    // Eye.
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.008 * k, 8, 6), plain(0x111111, 0.2), { x: L / 2 - 0.045 * k, y: cy + 0.01 * k, z: s * 0.024 * k }));
    return g;
  },

  shrimp(a) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, ang = t * Math.PI * 1.1;
      pts.push(new THREE.Vector3(Math.cos(ang) * 0.07, 0.02 + Math.sin(ang) * 0.07, 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 24, 0.024, 10, false);
    // Taper toward the tail.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const seg = Math.floor(i / 11) / 24;
      const k = 1 - seg * 0.55;
      const c = curve.getPoint(seg);
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, plain(a.color, 0.4), { y: 0.02 }));
    return g;
  },

  feather() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.035, 0.08, 0.012, 0.2);
    shape.quadraticCurveTo(0.0, 0.215, -0.012, 0.2);
    shape.quadraticCurveTo(-0.03, 0.08, 0, 0);
    const g = new THREE.Group();
    const vane = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.9, side: THREE.DoubleSide });
    for (const [x, rz] of [[-0.03, 0.5], [0.02, -0.25], [0.06, 0.15]]) {
      const f = new THREE.Group();
      f.add(mesh(new THREE.ShapeGeometry(shape, 8), vane));
      f.add(mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.24, 5), plain(0xcfc6b5, 0.6), { y: 0.1 }));
      f.position.set(x, 0.005, 0);
      f.rotation.set(-Math.PI / 2 + 0.15, 0, rz);
      g.add(f);
    }
    return g;
  },

  flax() {
    const g = new THREE.Group();
    const stalk = plain(0x8a9a4a, 0.8), flower = plain(0x6f8fd8, 0.6);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = 0.012 * (i % 3);
      const s = new THREE.Group();
      s.add(mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.32, 5), stalk, { y: 0.16 }));
      s.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), flower, { y: 0.325 }));
      s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      s.rotation.set(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12);
      g.add(s);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), plain(0xb09a6a, 0.9), { y: 0.1 }));
    g.rotation.z = Math.PI / 2.3;
    g.position.y = 0.03;
    return g;
  },

  string() {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, a = t * Math.PI * 2 * 5;
      const r = 0.07 + Math.sin(t * 40) * 0.004;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.01 + t * 0.03 + Math.sin(a * 3) * 0.003, Math.sin(a) * r));
    }
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.0045, 5, false), plain(0xe6dcc0, 0.75));
  },

  pot(a) {
    const geo = lathe([[0.001, 0], [0.06, 0], [0.085, 0.04], [0.095, 0.09], [0.08, 0.14], [0.055, 0.17], [0.06, 0.19], [0.064, 0.195], [0.052, 0.195], [0.05, 0.175], [0.07, 0.14], [0.084, 0.09], [0.075, 0.04], [0.05, 0.01], [0.001, 0.01]]);
    return mesh(geo, plain(a.color, a.fired ? 0.55 : 0.95));
  },

  bowl(a) {
    const geo = lathe([[0.001, 0], [0.05, 0], [0.055, 0.008], [0.1, 0.05], [0.115, 0.075], [0.108, 0.078], [0.093, 0.05], [0.05, 0.016], [0.001, 0.016]]);
    return mesh(geo, plain(a.color, a.fired ? 0.55 : 0.95));
  },

  shafts() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.007, 0.007, 0.36, 6);
    for (let i = 0; i < 6; i++) g.add(mesh(geo, wood(0xc8a57a), { x: (i % 3 - 1) * 0.012, y: 0.008 + Math.floor(i / 3) * 0.009, z: (i % 2) * 0.004, rz: Math.PI / 2, ry: (i - 3) * 0.03 }));
    return g;
  },

  arrow(a) {
    const g = new THREE.Group();
    const one = () => {
      const r = new THREE.Group();
      r.add(mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.42, 6), wood(0xc8a57a), { y: 0.21 }));
      const vane = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.9, side: THREE.DoubleSide });
      const fl = new THREE.Shape();
      fl.moveTo(0, 0);
      fl.lineTo(0.026, 0.02);
      fl.lineTo(0.026, 0.085);
      fl.lineTo(0, 0.1);
      for (let k = 0; k < 3; k++) r.add(mesh(new THREE.ShapeGeometry(fl), vane, { y: 0.015, ry: (k / 3) * Math.PI * 2 }));
      if (a.tip) r.add(mesh(new THREE.ConeGeometry(0.017, 0.055, 4), metal(a.tip), { y: 0.445 }));
      return r;
    };
    for (let i = 0; i < 3; i++) {
      const r = one();
      r.rotation.set(0, 0, -Math.PI / 2);
      r.position.set(-0.21, 0.012 + i * 0.004, (i - 1) * 0.03);
      r.rotation.y = (i - 1) * 0.12;
      g.add(r);
    }
    return g;
  },

  tips(a) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.ConeGeometry(0.014, 0.05, 4), metal(a.color), { x: Math.cos(i * 2.4) * 0.03, y: 0.012, z: Math.sin(i * 2.4) * 0.03, rz: Math.PI / 2, ry: i * 1.3 }));
    return g;
  },

  bow(a) {
    // Grip at the origin, limbs up and down (y), curving back.
    const L = 0.62 * (a.len || 1);
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20 * 2 - 1;
      pts.push(new THREE.Vector3(0, t * L, -(t * t) * 0.11 * (a.strung ? 1 : 0.35) + Math.abs(t) * 0.0));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.017, 7, false);
    // Taper toward the tips.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), k = 1 - Math.abs(y / L) * 0.55;
      const cz = -Math.pow(y / L, 2) * 0.11 * (a.strung ? 1 : 0.35);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, cz + (p.getZ(i) - cz) * k);
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, wood(a.color)));
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), leather(), {}));
    if (a.strung) g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, L * 2 - 0.02, 4), plain(0xefe8d2, 0.7), { z: -0.108 }));
    return g;
  },

  axe(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.62, 8), wood(0x6b4a2c), { y: 0.2 }));
    const head = new THREE.Shape();
    head.moveTo(-0.02, -0.03);
    head.lineTo(0.05, -0.03);
    head.quadraticCurveTo(0.13, -0.08, 0.14, -0.09);
    head.quadraticCurveTo(0.12, 0.02, 0.14, 0.11);
    head.quadraticCurveTo(0.12, 0.09, 0.05, 0.04);
    head.lineTo(-0.02, 0.04);
    head.lineTo(-0.035, 0.005);
    head.closePath();
    const hg = new THREE.ExtrudeGeometry(head, { depth: 0.024, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
    hg.translate(0, 0, -0.012);
    hg.scale(1.35, 1.35, 1);
    g.add(mesh(hg, metal(a.color), { y: 0.46 }));
    return g;
  },

  pickaxe(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.64, 8), wood(0x6b4a2c), { y: 0.21 }));
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12 * 2 - 1;
      pts.push(new THREE.Vector3(t * 0.2, -t * t * 0.05, 0));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.026, 6, false);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), k = 1 - Math.pow(Math.abs(x) / 0.2, 2) * 0.8;
      const cy = -Math.pow(x / 0.2, 2) * 0.05;
      p.setY(i, cy + (p.getY(i) - cy) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    g.add(mesh(geo, metal(a.color), { y: 0.5 }));
    g.add(mesh(new THREE.BoxGeometry(0.045, 0.05, 0.04), metal(a.color), { y: 0.5 }));
    return g;
  },

  hammer() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.34, 8), wood(0x6b4a2c), { y: 0.1 }));
    g.add(mesh(new THREE.BoxGeometry(0.11, 0.045, 0.045), metal(0x7c7f86), { y: 0.28 }));
    return g;
  },

  knife() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.1, 8), wood(0x5a3a22), { y: 0.02 }));
    const b = new THREE.Shape();
    b.moveTo(-0.012, 0);
    b.lineTo(0.012, 0);
    b.lineTo(0.01, 0.11);
    b.quadraticCurveTo(0.0, 0.14, -0.012, 0.15);
    b.closePath();
    const bg = new THREE.ExtrudeGeometry(b, { depth: 0.003, bevelEnabled: false });
    bg.translate(0, 0, -0.0015);
    g.add(mesh(bg, metal(0xb9c0c6), { y: 0.07 }));
    return g;
  },

  net() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.5, 8), wood(0x7a5634), { y: 0.1 }));
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 24), wood(0x7a5634), { y: 0.47, rx: Math.PI / 2 }));
    const net = new THREE.MeshStandardMaterial({ color: 0xd8ceb0, roughness: 0.9, wireframe: true });
    g.add(mesh(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), net, { y: 0.47 }));
    return g;
  },

  rod() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.007, 0.016, 1.1, 8), wood(0x8a6a3e), { y: 0.45 }));
    g.add(mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.9, 3), plain(0xdedad0, 0.6), { y: 0.55, z: 0.02, rx: 0.03 }));
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), leather(), { y: 0.02 }));
    g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14), metal(0x8c8f94), { y: 0.14, z: 0.03, rx: Math.PI / 2 }));
    return g;
  },

  dagger(a) {
    return blade(a, 0.2, 0.024, 0.09, false);
  },
  sword(a) {
    return blade(a, 0.62, 0.028, 0.16, false);
  },
  scimitar(a) {
    return blade(a, 0.58, 0.034, 0.15, true);
  },

  med_helm(a) {
    // A nasal helm: a slightly pointed skull cap raised on a riveted brow band, with a
    // ridge from brow to nape and a long nose guard.
    const g = new THREE.Group();
    const m = metal(a.color), dark = metal(new THREE.Color(a.color).multiplyScalar(0.72).getHex());
    const cap = lathe([[0.001, 0.25], [0.012, 0.247], [0.04, 0.228], [0.07, 0.2], [0.095, 0.162], [0.11, 0.12], [0.117, 0.08], [0.119, 0.045]], 40);
    cap.scale(1, 1, 1.13);
    g.add(mesh(cap, m));
    const band = lathe([[0.121, 0.012], [0.125, 0.016], [0.126, 0.05], [0.123, 0.056], [0.119, 0.056]], 40);
    band.scale(1, 1, 1.13);
    g.add(mesh(band, dark));
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.0065, 6, 4), m, { x: Math.cos(t) * 0.127, y: 0.034, z: Math.sin(t) * 0.1435 }));
    }
    // Ridge over the crown.
    const ridge = new THREE.TorusGeometry(0.2, 0.009, 5, 30, Math.PI);
    g.add(mesh(ridge, dark, { y: 0.045, ry: Math.PI / 2, s: 1 }));
    g.children[g.children.length - 1].scale.set(0.62, 1.02, 0.7);
    // Nose guard, flaring at the end.
    const nasal = new THREE.Shape();
    nasal.moveTo(-0.012, 0.05);
    nasal.lineTo(0.012, 0.05);
    nasal.lineTo(0.009, -0.045);
    nasal.lineTo(0.016, -0.07);
    nasal.lineTo(-0.016, -0.07);
    nasal.lineTo(-0.009, -0.045);
    nasal.closePath();
    const ng = new THREE.ExtrudeGeometry(nasal, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    g.add(mesh(ng, m, { y: 0.0, z: 0.139, rx: -0.08 }));
    return g;
  },

  full_helm(a) {
    // A great helm: flat-sided with a domed top, an eye slit, breaths on the right
    // cheek, a reinforcing cross over the face and banded edges.
    const g = new THREE.Group();
    const m = metal(a.color), dark = metal(new THREE.Color(a.color).multiplyScalar(0.72).getHex());
    const shell = lathe([[0.001, 0.25], [0.04, 0.246], [0.08, 0.23], [0.108, 0.2], [0.121, 0.16], [0.124, 0.1], [0.124, -0.06], [0.121, -0.12], [0.117, -0.15], [0.112, -0.15], [0.116, -0.12], [0.119, -0.06], [0.119, 0.1], [0.116, 0.16], [0.103, 0.195], [0.001, 0.2]], 44);
    shell.scale(1, 1, 1.1);
    g.add(mesh(shell, m));
    for (const [y0, y1] of [[0.085, 0.105], [-0.155, -0.13]]) {
      const b = lathe([[0.125, y0], [0.129, y0 + 0.004], [0.129, y1 - 0.004], [0.125, y1]], 44);
      b.scale(1, 1, 1.1);
      g.add(mesh(b, dark));
    }
    // Eye slit: a dark band across the front, broken by the cross.
    const slitMat = plain(0x050505, 0.95);
    for (const side of [-1, 1]) {
      const slit = new THREE.CylinderGeometry(0.1255, 0.1255, 0.02, 20, 1, true, side > 0 ? 0.08 : -1.1, 1.02);
      slit.scale(1, 1, 1.1);
      g.add(mesh(slit, slitMat, { y: 0.058 }));
    }
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.29, 0.012), dark, { y: -0.005, z: 0.137 }));
    // Breaths.
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const t = -0.35 - c * 0.13;
        g.add(mesh(new THREE.SphereGeometry(0.0055, 6, 4), slitMat, { x: Math.sin(t) * -0.126, y: -0.02 - r * 0.028, z: Math.cos(t) * 0.1375 }));
      }
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.0055, 6, 4), m, { x: Math.cos(t) * 0.13, y: 0.095, z: Math.sin(t) * 0.143 }));
    }
    return g;
  },

  kiteshield(a) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.32);
    s.quadraticCurveTo(0.2, -0.05, 0.19, 0.2);
    s.quadraticCurveTo(0.1, 0.25, 0, 0.26);
    s.quadraticCurveTo(-0.1, 0.25, -0.19, 0.2);
    s.quadraticCurveTo(-0.2, -0.05, 0, -0.32);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 });
    // Curve it around the arm.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - Math.pow(p.getX(i) / 0.2, 2) * 0.05);
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, metal(a.color)));
    g.add(mesh(new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal(new THREE.Color(a.color).multiplyScalar(0.85).getHex()), { y: 0.02, z: 0.02, rx: Math.PI / 2 }));
    return g;
  },

  chainbody(a) {
    return torso(a, chainMaterial(a.color));
  },
  platebody(a) {
    const g = torso(a, metal(a.color));
    const m = metal(new THREE.Color(a.color).multiplyScalar(0.76).getHex());
    // Lames around the belly and a raised centre ridge.
    for (const [y, r] of [[0.04, 0.143], [0.1, 0.147], [0.16, 0.157]]) {
      const lame = new THREE.TorusGeometry(r, 0.007, 5, 32);
      lame.scale(1, 0.68, 1);
      g.add(mesh(lame, m, { y, rx: Math.PI / 2 }));
    }
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.3, 0.02), m, { y: 0.24, z: 0.122, rx: -0.12 }));
    return g;
  },
  platelegs(a) {
    const g = new THREE.Group();
    const m = metal(a.color);
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.add(mesh(lathe([[0.06, 0], [0.058, 0.18], [0.07, 0.27], [0.082, 0.42], [0.09, 0.5]], 18), m));
      leg.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), metal(new THREE.Color(a.color).multiplyScalar(0.82).getHex()), { y: 0.24, z: 0.035 }));
      for (const y of [0.1, 0.36]) leg.add(mesh(new THREE.TorusGeometry(y < 0.2 ? 0.061 : 0.078, 0.006, 5, 20), metal(new THREE.Color(a.color).multiplyScalar(0.75).getHex()), { y, rx: Math.PI / 2 }));
      leg.position.x = s * 0.1;
      leg.rotation.z = s * 0.05;
      g.add(leg);
    }
    const waist = lathe([[0.2, 0.47], [0.205, 0.53], [0.19, 0.58], [0.001, 0.58]], 24);
    waist.scale(1, 1, 0.7);
    g.add(mesh(waist, m));
    return g;
  },

  crown(a) {
    const g = new THREE.Group();
    const gold = metal(a.color);
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.115, 0.07, 32, 1, true), gold, { y: 0.035 }));
    g.children[0].material = gold.clone();
    g.children[0].material.side = THREE.DoubleSide;
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.022, 0.07, 6), gold, { x: Math.cos(t) * 0.11, y: 0.1, z: Math.sin(t) * 0.11 }));
      g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), plain([0xc2302a, 0x2a7ac2, 0x2ac25a][i % 3], 0.2, 0), { x: Math.cos(t) * 0.116, y: 0.035, z: Math.sin(t) * 0.116 }));
    }
    return g;
  },

  cleaver(a) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.2, 8), leather(), { y: 0.0 }));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.025, 0.04), metal(0x4a4a4a), { y: 0.1 }));
    const s = new THREE.Shape();
    s.moveTo(-0.02, 0);
    s.lineTo(0.13, 0);
    s.lineTo(0.15, 0.5);
    s.quadraticCurveTo(0.08, 0.56, -0.03, 0.52);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 });
    geo.translate(-0.04, 0, -0.005);
    g.add(mesh(geo, metal(a.color), { y: 0.11 }));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10), metal(0x2a2a2a), { x: 0.02, y: 0.55, z: 0.0, rx: Math.PI / 2 }));
    return g;
  },

  petgob() {
    const g = new THREE.Group();
    const skin = plain(0xa8443a, 0.7);
    g.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), skin, { y: 0.1, s: 1 }));
    g.add(mesh(new THREE.SphereGeometry(0.09, 20, 14), skin, { y: 0.22 }));
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 8), skin, { x: s * 0.1, y: 0.26, rz: -s * 1.2 }));
      g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), plain(0xfff4c0, 0.3), { x: s * 0.035, y: 0.24, z: 0.075 }));
      g.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), plain(0x111111, 0.2), { x: s * 0.035, y: 0.24, z: 0.09 }));
    }
    const crown = BUILD.crown({ color: 0xc9a13a });
    crown.scale.setScalar(0.55);
    crown.position.y = 0.29;
    g.add(crown);
    return g;
  },

  petbird() {
    // A magpie: black head, breast and back, white flanks and wing patches, and a
    // long blue-green tail.
    const g = new THREE.Group();
    const black = plain(0x14161c, 0.45, 0.2), white = plain(0xf2f2ee, 0.6), sheen = plain(0x1d4452, 0.3, 0.5);
    const body = mesh(new THREE.SphereGeometry(0.08, 20, 14), black, { y: 0.1 });
    body.scale.set(0.8, 0.8, 1.3);
    g.add(body);
    const belly = mesh(new THREE.SphereGeometry(0.06, 18, 12), white, { y: 0.083, z: -0.012 });
    belly.scale.set(1.12, 0.82, 1.08);
    g.add(belly);
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.SphereGeometry(0.06, 14, 10), black, { x: s * 0.052, y: 0.118, z: -0.03, ry: s * 0.12 });
      wing.scale.set(0.36, 0.62, 1.35);
      g.add(wing);
      const patch = mesh(new THREE.SphereGeometry(0.026, 12, 8), white, { x: s * 0.062, y: 0.132, z: 0.012 });
      patch.scale.set(0.5, 0.62, 1.25);
      g.add(patch);
      const tip = mesh(new THREE.SphereGeometry(0.03, 10, 8), sheen, { x: s * 0.05, y: 0.125, z: -0.1 });
      tip.scale.set(0.35, 0.4, 1.3);
      g.add(tip);
    }
    g.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), black, { y: 0.172, z: 0.082 }));
    g.add(mesh(new THREE.ConeGeometry(0.015, 0.055, 8), black, { y: 0.166, z: 0.148, rx: Math.PI / 2 }));
    const tail = mesh(new THREE.ConeGeometry(0.036, 0.24, 4), sheen, { y: 0.13, z: -0.21, rx: Math.PI / 2 + 0.25 });
    tail.scale.set(1, 1, 0.22);
    g.add(tail);
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.SphereGeometry(0.01, 8, 6), plain(0x050505, 0.05), { x: s * 0.032, y: 0.186, z: 0.112 }));
      g.add(mesh(new THREE.SphereGeometry(0.0035, 6, 4), plain(0xffffff, 0.2), { x: s * 0.035, y: 0.19, z: 0.121 }));
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4), plain(0x222222, 0.6), { x: s * 0.025, y: 0.03 }));
    }
    return g;
  },

  petgolem() {
    const g = new THREE.Group();
    g.add(mesh(lumpy(0.12, 2, 0.15, 11, [1.1, 0.9, 1]), plain(0x8a857c, 0.9), { y: 0.12 }));
    const glow = new THREE.MeshStandardMaterial({ color: 0x8ff0ff, emissive: 0x4ad8ff, emissiveIntensity: 2 });
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), glow, { x: s * 0.045, y: 0.15, z: 0.11 }));
    for (const s of [-1, 1]) g.add(mesh(lumpy(0.04, 1, 0.2, 3 + s, [1, 1, 1]), plain(0x7a756c, 0.9), { x: s * 0.13, y: 0.08 }));
    return g;
  },

  petsapling() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.14, 12), plain(0x5a3d26, 0.9), { y: 0.07 }));
    g.add(mesh(new THREE.CircleGeometry(0.068, 12), plain(0xc9a476, 0.8), { y: 0.141, rx: -Math.PI / 2 }));
    g.add(mesh(lumpy(0.09, 2, 0.2, 5, [1, 0.9, 1]), plain(0x4f8a2a, 0.8), { y: 0.24 }));
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), plain(0xfff4c0, 0.3), { x: s * 0.03, y: 0.09, z: 0.075 }));
      g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), plain(0x111111, 0.2), { x: s * 0.03, y: 0.09, z: 0.089 }));
    }
    return g;
  },

  petfrog() {
    const g = new THREE.Group();
    const skin = plain(0x5aa33a, 0.45);
    const body = mesh(new THREE.SphereGeometry(0.09, 20, 14), skin, { y: 0.07 });
    body.scale.set(1.15, 0.75, 1);
    g.add(body);
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), skin, { x: s * 0.05, y: 0.13, z: 0.04 }));
      g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), plain(0x111111, 0.1), { x: s * 0.052, y: 0.14, z: 0.064 }));
      g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), skin, { x: s * 0.085, y: 0.03, z: -0.02, s: 1 }));
    }
    g.add(mesh(new THREE.SphereGeometry(0.06, 14, 10), plain(0xd8e8a0, 0.5), { y: 0.05, z: 0.035, s: 1 }));
    return g;
  },

  rune(a) {
    // A small grey stone with its element's glyph cut in and glowing.
    const g = new THREE.Group();
    g.add(mesh(lumpy(0.05, 2, 0.08, a.glow % 97, [1, 0.45, 0.9]), plain(a.color, 0.8), { y: 0.022 }));
    const glyph = new THREE.MeshStandardMaterial({ color: a.glow, emissive: a.glow, emissiveIntensity: 0.9, roughness: 0.4 });
    g.add(mesh(new THREE.ShapeGeometry(runeGlyph(a.glyph), 12), glyph, { y: 0.047, rx: -Math.PI / 2 }));
    return g;
  },

  staff(a) {
    // Grip at the origin, shaft along +Y, a gem held in a forked head.
    const g = new THREE.Group();
    const w = wood(0x6b4a2c);
    g.add(mesh(new THREE.CylinderGeometry(0.021, 0.026, 1.55, 8), w, { y: 0.3 }));
    // Three prongs lean out around the gem.
    for (let k = 0; k < 3; k++) {
      const a3 = (k / 3) * Math.PI * 2, r = new THREE.Vector3(Math.cos(a3), 0, Math.sin(a3));
      const prong = mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.11, 5), w, { x: r.x * 0.026, y: 1.12, z: r.z * 0.026 });
      prong.quaternion.setFromAxisAngle(new THREE.Vector3(-r.z, 0, r.x), -0.45);
      g.add(prong);
    }
    const gem = new THREE.MeshStandardMaterial({ color: a.orb, emissive: a.glow ? a.orb : 0x000000, emissiveIntensity: a.glow ? 1.2 : 0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
    g.add(mesh(new THREE.IcosahedronGeometry(0.052, 1), gem, { y: 1.14 }));
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8), metal(0x8a7a5a), { y: 1.06 }));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 8), metal(0x8a7a5a), { y: -0.46 }));
    return g;
  },

  hook(a) {
    // A heavy fish hook: an eye to tie on, the shank, the bend, and a barbed point.
    const g = new THREE.Group();
    const m = metal(a.color), r = 0.011;
    g.add(mesh(new THREE.TorusGeometry(0.014, 0.005, 8, 16), m, { y: 0.176 }));
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.13, 10), m, { y: 0.1 }));
    g.add(mesh(new THREE.TorusGeometry(0.036, r, 8, 24, Math.PI + 0.35), m, { x: 0.036, y: 0.036, rz: Math.PI }));
    const tipX = 0.036 + Math.cos(0.35) * 0.036, tipY = 0.036 + Math.sin(0.35) * 0.036;
    g.add(mesh(new THREE.ConeGeometry(r * 1.1, 0.045, 10), m, { x: tipX, y: tipY + 0.02, rz: 0.12 }));
    g.add(mesh(new THREE.ConeGeometry(0.006, 0.02, 6), m, { x: tipX - 0.009, y: tipY + 0.012, rz: 0.9 }));
    return g;
  },

  book(a) {
    // A leather-bound ledger with a strap and a brass buckle.
    const g = new THREE.Group();
    const cover = plain(a.color, 0.75), pages = plain(0xe6d9b8, 0.9);
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.27), cover, { y: 0.006 }));
    g.add(mesh(new THREE.BoxGeometry(0.188, 0.042, 0.256), pages, { x: 0.005, y: 0.033 }));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.27), cover, { y: 0.06 }));
    g.add(mesh(new THREE.BoxGeometry(0.016, 0.066, 0.27), cover, { x: -0.098, y: 0.033 }));
    g.add(mesh(new THREE.BoxGeometry(0.212, 0.07, 0.032), leather(), { x: 0.003, y: 0.033, z: 0.05 }));
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.03, 0.04), metal(0xc9a13a), { x: 0.11, y: 0.036, z: 0.05 }));
    return g;
  },

  strongbox() {
    // A small iron-bound box with a brass lock plate.
    const g = new THREE.Group();
    const box = wood(0x5a3d26), iron = metal(0x3b3b3e);
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), box, { y: 0.07 }));
    g.add(mesh(new THREE.BoxGeometry(0.266, 0.045, 0.186), box, { y: 0.162 }));
    for (const x of [-0.092, 0.092]) g.add(mesh(new THREE.BoxGeometry(0.024, 0.19, 0.192), iron, { x, y: 0.094 }));
    g.add(mesh(new THREE.BoxGeometry(0.27, 0.02, 0.19), iron, { y: 0.01 }));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.056, 0.012), metal(0xc9a13a), { y: 0.125, z: 0.094 }));
    g.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 8), plain(0x111111, 0.5), { y: 0.12, z: 0.1, rx: Math.PI / 2 }));
    return g;
  },

  bread() {
    // A round loaf: golden crust, darker on top, with pale scoring.
    const geo = lumpy(0.1, 3, 0.035, 7, [1.2, 0.62, 0.85]);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
    const top = new THREE.Color(0x9a5a22), side = new THREE.Color(0xd49a55), score = new THREE.Color(0xf0d6a0), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.copy(side).lerp(top, THREE.MathUtils.smoothstep(v.y, 0.0, 0.06));
      if (v.y > 0.035 && Math.abs(Math.sin((v.x + v.z * 0.5) * 42)) > 0.94) c.copy(score);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const g = new THREE.Group();
    g.add(mesh(geo, mat('bread', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })), { y: 0.055 }));
    return g;
  },

  mug() {
    // A wooden tankard with iron bands, full of ale with a head of foam.
    const g = new THREE.Group();
    const w = wood(0x7a5230), band = metal(0x55504a);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.12, 18, 1, true), w, { y: 0.06 }));
    g.add(mesh(new THREE.CircleGeometry(0.056, 18), w, { y: 0.001, rx: Math.PI / 2 }));
    for (const y of [0.018, 0.1]) g.add(mesh(new THREE.TorusGeometry(0.054 - y * 0.05, 0.004, 6, 24), band, { y, rx: Math.PI / 2 }));
    g.add(mesh(new THREE.TorusGeometry(0.032, 0.009, 8, 14, Math.PI), w, { x: 0.052, y: 0.062, rz: -Math.PI / 2 }));
    g.add(mesh(new THREE.CircleGeometry(0.049, 18), plain(0x7a4a14, 0.25), { y: 0.108, rx: -Math.PI / 2 }));
    g.add(mesh(lumpy(0.05, 2, 0.14, 3, [1, 0.32, 1]), plain(0xf2ead6, 0.9), { y: 0.116 }));
    return g;
  },

  bones() {
    const g = new THREE.Group();
    const bone = plain(0xe7dfc8, 0.7);
    for (const [x, rz] of [[-0.02, 0.4], [0.03, -0.3]]) {
      const b = new THREE.Group();
      b.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), bone));
      for (const e of [-1, 1]) for (const k of [-1, 1]) b.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), bone, { x: k * 0.012, y: e * 0.11 }));
      b.position.set(x, 0.022, 0);
      b.rotation.set(Math.PI / 2, 0, rz);
      g.add(b);
    }
    return g;
  },
};

function blade(a, len, width, guard, curved) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), leather(), { y: 0.0 }));
  g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), metal(new THREE.Color(a.color).multiplyScalar(0.8).getHex()), { y: -0.07 }));
  g.add(mesh(new THREE.BoxGeometry(guard, 0.02, 0.03), metal(new THREE.Color(a.color).multiplyScalar(0.85).getHex()), { y: 0.065 }));
  const s = new THREE.Shape();
  s.moveTo(-width, 0);
  s.lineTo(width, 0);
  if (curved) {
    s.quadraticCurveTo(width * 1.6, len * 0.6, width * 0.2 + 0.05, len);
    s.quadraticCurveTo(-width * 0.2, len * 0.55, -width, 0);
  } else {
    s.lineTo(width * 0.8, len * 0.85);
    s.lineTo(0, len);
    s.lineTo(-width * 0.8, len * 0.85);
    s.closePath();
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
  geo.translate(0, 0, -0.002);
  g.add(mesh(geo, metal(a.color), { y: 0.075 }));
  return g;
}

function torso(a, material) {
  const g = new THREE.Group();
  const body = lathe([[0.14, 0], [0.15, 0.08], [0.16, 0.2], [0.18, 0.32], [0.17, 0.38], [0.08, 0.42], [0.001, 0.42]], 28);
  body.scale(1, 1, 0.68);
  g.add(mesh(body, material));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.18, 12), material, { x: s * 0.2, y: 0.31, rz: s * 0.5 }));
    g.add(mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), material, { x: s * 0.17, y: 0.37 }));
  }
  return g;
}

function chainMaterial(color) {
  return mat(`chain${color}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#222';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ddd';
    g.lineWidth = 2;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.beginPath();
        g.arc(x * 8 + (y % 2) * 4 + 4, y * 8 + 4, 3.2, 0, Math.PI * 2);
        g.stroke();
      }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 4);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ color, map: t, metalness: 1, roughness: 0.45 });
  });
}

// Bark textures are handed over once loaded (see setBarkTextures), so icons drawn
// straight away already have them.
const BARK = {};
export function setBarkTextures(map) {
  Object.assign(BARK, map);
}
function barkMaterial(kind) {
  return mat(`bark${kind}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    if (BARK[kind]) {
      const c = BARK[kind].clone();
      c.repeat.set(1.5, 1);
      c.needsUpdate = true;
      m.map = c;
    }
    return m;
  });
}

function ringsMaterial(color) {
  return mat(`rings${color}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const base = new THREE.Color(color);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, 64, 64);
    for (let r = 4; r < 32; r += 3 + Math.random() * 2) {
      g.strokeStyle = `rgba(90,55,25,${0.25 + Math.random() * 0.2})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(32, 32, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(60,35,15,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(32, 32, 30.5, 0, Math.PI * 2);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  });
}

// ------------------------------------------------------------------ public
export function buildItem(id, assets) {
  const def = ITEMS[id];
  const make = BUILD[def?.art?.kind];
  const g = new THREE.Group();
  if (!make) {
    g.add(mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), plain(0xff00ff)));
    return g;
  }
  g.add(make(def.art, assets));
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// How each kind sits in its icon: rotation of the model, and a tilt of the camera.
const POSE = {
  sword: { rz: -Math.PI / 4 - 0.1, rx: 0.2 },
  dagger: { rz: -Math.PI / 4 - 0.1, rx: 0.2 },
  scimitar: { rz: -Math.PI / 4 - 0.1, rx: 0.2 },
  axe: { rz: -Math.PI / 4, ry: -0.4 },
  pickaxe: { rz: -Math.PI / 4, ry: -0.3 },
  hammer: { rz: -Math.PI / 4, ry: -0.3 },
  knife: { rz: -Math.PI / 4, ry: -0.3 },
  rod: { rz: -Math.PI / 4, ry: -0.3 },
  net: { rz: -Math.PI / 4, ry: -0.3 },
  bow: { ry: -Math.PI / 2 + 0.25, rx: -0.75 },
  kiteshield: { ry: 0.35, rx: -0.1 },
  med_helm: { ry: 0.6, rx: 0.15 },
  full_helm: { ry: 0.6, rx: 0.15 },
  chainbody: { ry: 0.3 },
  cleaver: { rz: -Math.PI / 4 - 0.1, rx: 0.2 },
  crown: { rx: 0.35 },
  petgob: { ry: 0.5 },
  petbird: { ry: 0.9 },
  petgolem: { ry: 0.5 },
  petsapling: { ry: 0.5 },
  petfrog: { ry: 0.5 },
  hook: { rz: 0.35, ry: 0.2 },
  staff: { rz: -Math.PI / 4 - 0.1, rx: 0.2 },
  rune: { rx: 0.5 },
  book: { rx: 0.55, ry: 0.5 },
  strongbox: { ry: 0.55, rx: 0.2 },
  mug: { ry: -0.5 },
  platebody: { ry: 0.3 },
  platelegs: { ry: 0.3 },
};

// Renders item icons with a small renderer of its own, lit like a shop display.
export class IconStudio {
  constructor(assets, environment) {
    this.assets = assets;
    this.size = 96;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.size, this.size, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    if (environment) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromEquirectangular(environment).texture;
      this.scene.environmentIntensity = 0.9;
      pm.dispose();
    }
    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(1.5, 2.5, 2);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.2);
    rim.position.set(-2, 1, -1.5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x3a3226, 0.6));
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.01, 20);
    this.cache = new Map();
  }

  // A data URL of the item's icon (drawn once, then cached).
  icon(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const model = buildItem(id, this.assets);
    const kind = ITEMS[id]?.art?.kind;
    const pose = POSE[kind] || {};
    const holder = new THREE.Group();
    holder.add(model);
    model.rotation.set(pose.rx || 0, pose.ry || 0, pose.rz || 0);
    this.scene.add(holder);
    // Frame the model: centre it and back the camera off to fit.
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    holder.position.sub(c);
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const dir = new THREE.Vector3(0.35, 0.55, 1).normalize();
    this.camera.position.copy(dir.multiplyScalar(r / Math.tan((this.camera.fov * Math.PI) / 360)));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    this.cache.set(id, url);
    return url;
  }

  // Redraws everything (after textures finish loading).
  refresh() {
    this.cache.clear();
  }
}
