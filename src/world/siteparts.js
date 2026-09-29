import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batcher } from './kit.js';
import { fitUV } from './props.js';
import { enhance } from '../engine/detail.js';

// Parts shared by the things built out in the vale (the ways out, the waymarks): timber that samples the right
// band of the kit's trim sheet, boulders and broken rock in the mountain's own stone, the odd materials the kit
// lacks, and a way to build pieces into their own Batcher (for things that move or go away).

// The kit's wood is a trim sheet, not a tiling texture: from the top its rows are orange planks (v 0..0.3), dark
// planks (0.31..0.6), end-grain blocks and a strip of stone, so projecting it at world scale onto a post paints
// bands of all of them. `bandUV` rewrites a geometry's UVs so it samples one band: u follows the piece's length
// (the grain runs along it), v goes across, folding back and forth (a triangle wave) so no seam shows. The
// scale is the kit's own (`tile` metres per repeat), so the texture keeps its size.
export const WOOD = { dark: [0.345, 0.585], orange: [0.04, 0.27] };
export function bandUV(src, [v0, v1], { round = false, tile = 2.2 } = {}) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingBox();
  const lo = g.boundingBox.min, size = g.boundingBox.getSize(new THREE.Vector3()), mid = g.boundingBox.getCenter(new THREE.Vector3());
  const along = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  const [a1, a2] = [0, 1, 2].filter((k) => k !== along);
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  let period = tile * (v1 - v0);
  // A round piece goes a whole number of folds (a fold is two periods) once round, so it closes without a seam.
  const radius = Math.max(size.getComponent(a1), size.getComponent(a2)) / 2;
  if (round) period = (2 * Math.PI * radius) / (2 * Math.max(1, Math.round((2 * Math.PI * radius) / (2 * period))));
  const tri = (x) => { const t = ((x % 2) + 2) % 2; return t < 1 ? t : 2 - t; };
  const at = (i, k) => (k === 0 ? p.getX(i) : k === 1 ? p.getY(i) : p.getZ(i));
  const nc = (i, k) => (k === 0 ? n.getX(i) : k === 1 ? n.getY(i) : n.getZ(i));
  for (let i = 0; i < p.count; i++) {
    let u = at(i, along) - lo.getComponent(along), across;
    if (Math.abs(nc(i, along)) > 0.7) {
      // An end: laid flat, across its first axis.
      u = at(i, a1) - lo.getComponent(a1);
      across = at(i, a2) - lo.getComponent(a2);
    } else if (round) {
      across = radius * (Math.atan2(at(i, a2) - mid.getComponent(a2), at(i, a1) - mid.getComponent(a1)) + Math.PI);
    } else across = Math.abs(nc(i, a1)) >= Math.abs(nc(i, a2)) ? at(i, a2) - lo.getComponent(a2) : at(i, a1) - lo.getComponent(a1);
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v0 + (v1 - v0) * tri(across / period);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.userData.wuv = true;
  return g;
}
const geoCache = new Map();
const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
// Big faces are cut up (a quarter metre a cell) so the folds of the band mapping happen at vertices.
const cut = (s) => (s > 0.5 ? Math.ceil(s / 0.25) : 1);
const woodBox = (w, h, d, band) => bandUV(new THREE.BoxGeometry(w, h, d, cut(w), cut(h), cut(d)), band);
// A dark-plank timber (base on y = 0 like SiteKit's box), an orange-plank board, a log, and a centred timber for struts.
export const timber = (w, h, d) => cached(`t${w}|${h}|${d}`, () => woodBox(w, h, d, WOOD.dark).translate(0, h / 2, 0));
export const plank = (w, h, d) => cached(`p${w}|${h}|${d}`, () => woodBox(w, h, d, WOOD.orange).translate(0, h / 2, 0));
export const log = (r0, r1, h, seg = 8) => cached(`l${r0}|${r1}|${h}|${seg}`, () => bandUV(new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0), WOOD.dark, { round: true }));
export const beamGeo = (len, t) => cached(`b${len.toFixed(3)}|${t}`, () => woodBox(len, t, t, WOOD.dark));
const cboxCache = new Map();
// A box centred on its own origin (for struts set at any angle).
export function cbox(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!cboxCache.has(k)) cboxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return cboxCache.get(k);
}

// A square timber (or bar) from point A to point B, [x, y, z] each, `t` thick.
export function strut(sk, mat, A, B, t) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const len = Math.hypot(dx, dy, dz), horiz = Math.hypot(dx, dz);
  const geo = mat === sk.m.wood ? beamGeo(len, t) : cbox(len, t, t);
  sk.put(geo, mat, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2, Math.atan2(-dz, dx), 1, 1, 1, 0, Math.atan2(dy, horiz));
}

// A lumpy rock of about `size` (radius) metres, its size baked in and its UVs at a fixed scale (`fitUV`), so its
// texture keeps the same grain whatever the size. `angular` keeps the facets (broken stone from the collapse);
// otherwise the corners are welded and it shades smoothly (a boulder).
export function rockGeo(size, rnd, flat = 0.72, angular = true) {
  let g = new THREE.IcosahedronGeometry(size, angular ? 1 : 2);
  const p = g.attributes.position;
  const seed = [rnd() * 9, rnd() * 9, rnd() * 9];
  // (The icosahedron is unindexed, its corners repeated per face; the displacement depends on position alone, so
  // the faces stay joined.)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const jitter = (Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed[0]) * 43758.5453) % 1;
    const n = 1 + 0.3 * (Math.sin(x * 3.7 / size + seed[0]) * Math.sin(y * 3.1 / size + seed[1]) * Math.sin(z * 4.3 / size + seed[2])) + jitter * (angular ? 0.07 : 0.02);
    p.setXYZ(i, x * n, y * n * flat, z * n);
  }
  if (!angular) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); }
  g.computeVertexNormals();
  return fitUV(g, 3.0);
}

// A dressed block of w x h x d with slightly knocked corners.
export function chippedBlock(w, h, d, rnd) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * 0.05, p.getY(i) + (rnd() - 0.5) * 0.05, p.getZ(i) + (rnd() - 0.5) * 0.05);
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  return n;
}


// ------------------------------------------------------------------ materials
export function siteMaterials(sk, cliff) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  // Boulders and broken rock wear the mountain's own cliff scan, taken to grey as the terrain shader does, so a
  // fallen rock matches the wall it fell from.
  const grey = (() => {
    const img = cliff.map.image, cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 512, 512);
    const d = g.getImageData(0, 0, 512, 512);
    for (let i = 0; i < d.data.length; i += 4) {
      const l = d.data[i] * 0.3 + d.data[i + 1] * 0.55 + d.data[i + 2] * 0.15;
      d.data[i] = (l * 0.75 + d.data[i] * 0.25) * 0.93;
      d.data[i + 1] = (l * 0.75 + d.data[i + 1] * 0.25) * 0.95;
      d.data[i + 2] = (l * 0.75 + d.data[i + 2] * 0.25) * 1.0;
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const boulder = new THREE.MeshStandardMaterial({ map: grey, normalMap: cliff.normal, roughness: 0.95, color: 0xc9c9c9 });
  boulder.name = 'CliffBoulder';
  enhance(boulder);
  return {
    boulder,
    iron: std(0x2c2c31, { metalness: 0.2, roughness: 0.6 }),
    dark: std(0x1a1613, { roughness: 1 }),                    // the inside of the bore, arrow slits
    black: new THREE.MeshBasicMaterial({ color: 0x040302 }),  // where the tunnel goes on
    red: std(0xa5312a, { roughness: 0.65 }),
    white: std(0xe8e2d2, { roughness: 0.65 }),
    paper: (() => {
      // A pinned sheet: off-white with lines of a clerk's hand and a seal.
      const cv = document.createElement('canvas');
      cv.width = 96;
      cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = '#e6dcc0';
      g.fillRect(0, 0, 96, 128);
      let seed = 3;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      g.fillStyle = 'rgba(40,30,20,0.75)';
      g.fillRect(14, 12, 40 + r() * 20, 5);
      for (let y = 30; y < 100; y += 8) g.fillRect(12, y, 58 + r() * 24, 2.5);
      g.fillStyle = 'rgba(150,30,20,0.85)';
      g.beginPath();
      g.arc(70, 108, 9, 0, Math.PI * 2);
      g.fill();
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    })(),
  };
}

// Builds pieces into their own Batcher and returns the merged group (for things that move or go away).
export function dynamic(sk, scene, fn) {
  const main = sk.batch;
  const b = new Batcher(sk.kit);
  sk.batch = b;
  try { fn(); } finally { sk.batch = main; }
  const g = b.build();
  scene.add(g);
  return g;
}

