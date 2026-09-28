import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural monster meshes. Each returns one geometry with two groups:
// 0 = body (vertex colored, lit) and 1 = glow (eyes, cracks; unlit HDR).
function part(geo, color, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (o.sx || o.sy || o.sz) g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  if (o.rx) g.rotateX(o.rx);
  if (o.ry) g.rotateY(o.ry);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const cap = (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 3, s);
const sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const cyl = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

function build(body, glow) {
  return mergeGeometries([mergeGeometries(body), mergeGeometries(glow)], true);
}

const BUILDERS = {
  husk() {
    const skin = 0x6e6258, dark = 0x3e3530, bone = 0x9a8e7e;
    const body = [
      part(cap(0.11, 0.5), dark, { x: 0.15, y: 0.4 }),
      part(cap(0.11, 0.5), dark, { x: -0.15, y: 0.4 }),
      part(cap(0.27, 0.38), skin, { y: 1.02, z: 0.08, rx: 0.5, sx: 1.1 }),
      part(sph(0.2), bone, { y: 1.4, z: 0.34, sy: 1.1 }),
      part(box(0.22, 0.08, 0.12), dark, { y: 1.28, z: 0.46 }),
      part(cap(0.075, 0.62), skin, { x: 0.36, y: 0.92, z: 0.22, rx: -0.55, rz: 0.1 }),
      part(cap(0.075, 0.62), skin, { x: -0.36, y: 0.92, z: 0.22, rx: -0.55, rz: -0.1 }),
      part(sph(0.1), bone, { x: 0.38, y: 0.62, z: 0.48 }),
      part(sph(0.1), bone, { x: -0.38, y: 0.62, z: 0.48 }),
      part(cone(0.06, 0.25), bone, { y: 1.22, z: -0.2, rx: -1.2 }),
      part(cone(0.05, 0.22), bone, { y: 1.05, z: -0.24, rx: -1.3 }),
    ];
    const glow = [
      part(sph(0.045, 6, 4), 0xffffff, { x: 0.08, y: 1.44, z: 0.51 }),
      part(sph(0.045, 6, 4), 0xffffff, { x: -0.08, y: 1.44, z: 0.51 }),
      part(box(0.05, 0.34, 0.03), 0xffffff, { y: 1.05, z: 0.34, rx: 0.5, rz: 0.2 }),
    ];
    return { geo: build(body, glow), glow: [4, 1.5, 0.35] };
  },
  skitter() {
    const shell = 0x2a211d, joint = 0x4a3a30;
    const body = [
      part(sph(0.28), shell, { y: 0.34, sx: 1, sy: 0.6, sz: 1.2 }),
      part(sph(0.3), shell, { y: 0.42, z: -0.42, sx: 1.05, sy: 0.85, sz: 1.15 }),
      part(cone(0.05, 0.3), joint, { x: 0.1, y: 0.3, z: 0.38, rx: 1.6 }),
      part(cone(0.05, 0.3), joint, { x: -0.1, y: 0.3, z: 0.38, rx: 1.6 }),
    ];
    for (const side of [1, -1])
      for (let i = 0; i < 3; i++) {
        body.push(part(cyl(0.035, 0.02, 0.75, 4), joint, { rz: side * 1.05, ry: (i - 1) * 0.5 * side, x: side * 0.4, y: 0.3, z: 0.1 - i * 0.22 }));
      }
    const glow = [
      part(sph(0.17, 8, 6), 0xffffff, { y: 0.55, z: -0.5, sy: 0.7 }),
      part(sph(0.035, 5, 4), 0xffffff, { x: 0.07, y: 0.42, z: 0.32 }),
      part(sph(0.035, 5, 4), 0xffffff, { x: -0.07, y: 0.42, z: 0.32 }),
      part(sph(0.03, 5, 4), 0xffffff, { x: 0.13, y: 0.4, z: 0.28 }),
      part(sph(0.03, 5, 4), 0xffffff, { x: -0.13, y: 0.4, z: 0.28 }),
    ];
    return { geo: build(body, glow), glow: [5, 2, 0.3] };
  },
  brute() {
    const hide = 0x5a4238, dark = 0x2e2420, horn = 0xb0a08a;
    const body = [
      part(cap(0.22, 0.55), dark, { x: 0.32, y: 0.55 }),
      part(cap(0.22, 0.55), dark, { x: -0.32, y: 0.55 }),
      part(cap(0.56, 0.45), hide, { y: 1.62, z: 0.05, rx: 0.25, sx: 1.35, sz: 0.95 }),
      part(sph(0.4), hide, { y: 1.05, sx: 1.2, sy: 0.8 }),
      part(sph(0.24), hide, { y: 2.28, z: 0.42 }),
      part(box(0.3, 0.12, 0.2), dark, { y: 2.14, z: 0.58 }),
      part(cone(0.08, 0.5), horn, { x: 0.22, y: 2.52, z: 0.35, rz: -0.6 }),
      part(cone(0.08, 0.5), horn, { x: -0.22, y: 2.52, z: 0.35, rz: 0.6 }),
      part(cap(0.2, 0.95), hide, { x: 0.86, y: 1.42, z: 0.15, rz: 0.25, rx: -0.2 }),
      part(cap(0.2, 0.95), hide, { x: -0.86, y: 1.42, z: 0.15, rz: -0.25, rx: -0.2 }),
      part(sph(0.3), dark, { x: 1.0, y: 0.75, z: 0.3 }),
      part(sph(0.3), dark, { x: -1.0, y: 0.75, z: 0.3 }),
      part(cone(0.12, 0.45), horn, { x: 0.7, y: 2.1, z: -0.1, rz: -0.9 }),
      part(cone(0.12, 0.45), horn, { x: -0.7, y: 2.1, z: -0.1, rz: 0.9 }),
      part(cone(0.1, 0.4), horn, { y: 2.0, z: -0.45, rx: -1.0 }),
    ];
    const glow = [
      part(sph(0.05, 6, 4), 0xffffff, { x: 0.09, y: 2.32, z: 0.64 }),
      part(sph(0.05, 6, 4), 0xffffff, { x: -0.09, y: 2.32, z: 0.64 }),
      part(box(0.08, 0.6, 0.04), 0xffffff, { y: 1.62, z: 0.6, rx: 0.25, rz: 0.3 }),
      part(box(0.06, 0.4, 0.04), 0xffffff, { x: 0.25, y: 1.5, z: 0.58, rx: 0.25, rz: -0.5 }),
      part(box(0.05, 0.3, 0.04), 0xffffff, { x: -0.3, y: 1.8, z: 0.55, rx: 0.25, rz: 0.8 }),
    ];
    return { geo: build(body, glow), glow: [4.5, 0.9, 0.25] };
  },
  wisp() {
    const robe = 0x2a2238, trim = 0x46385a;
    const body = [
      part(cone(0.5, 1.5, 10), robe, { y: 0.85 }),
      part(cone(0.3, 0.6, 8), trim, { y: 1.75, z: -0.02 }),
      part(sph(0.2), 0x0a0810, { y: 1.62, z: 0.1 }),
      part(cap(0.07, 0.5), robe, { x: 0.3, y: 1.2, z: 0.28, rx: -1.1 }),
      part(cap(0.07, 0.5), robe, { x: -0.3, y: 1.2, z: 0.28, rx: -1.1 }),
      part(cyl(0.52, 0.3, 0.12, 10), trim, { y: 0.14 }),
    ];
    const glow = [
      part(sph(0.04, 6, 4), 0xffffff, { x: 0.07, y: 1.66, z: 0.27 }),
      part(sph(0.04, 6, 4), 0xffffff, { x: -0.07, y: 1.66, z: 0.27 }),
      part(sph(0.13, 8, 6), 0xffffff, { y: 1.25, z: 0.62 }),
      part(cyl(0.2, 0.06, 0.05, 10), 0xffffff, { y: 0.05 }),
    ];
    return { geo: build(body, glow), glow: [2.6, 1.0, 5] };
  },
};

export function buildMonster(model) {
  return BUILDERS[model]();
}
