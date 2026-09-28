import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural monster meshes with "bones": every vertex is tagged with a part id
// (aPart) and each family ships a small GLSL rig that poses those parts per
// instance from aAnim = (walk phase, move amount, wind-up 0..1, strike 0..1).
// Geometry groups: 0 = body (lit, textured), 1 = glow (eyes, cores; unlit HDR).

function part(geo, color, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (o.sx || o.sy || o.sz) g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  if (o.rx) g.rotateX(o.rx);
  if (o.ry) g.rotateY(o.ry);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), prt = new Float32Array(n).fill(o.part ?? 0);
  for (let i = 0; i < n * 3; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(prt, 1));
  return g;
}
const cap = (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const torus = (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 16, arc);
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y)), seg);

const build = (body, glow) => mergeGeometries([mergeGeometries(body), mergeGeometries(glow)], true);

// Shared GLSL helpers for the rigs.
export const RIG_LIB = /* glsl */ `
  mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  void rot(inout vec3 p, inout vec3 n, vec3 piv, mat3 R) { p = R * (p - piv) + piv; n = R * n; }
`;

const BUILDERS = {
  // Ashen Husk: a hunched, burned corpse. Drags its right leg; raises both arms and slams.
  husk() {
    const skin = 0x6e6258, dark = 0x3e3530, bone = 0xa89c88, rag = 0x3a2e26;
    const body = [
      part(cap(0.1, 0.34), dark, { x: 0.15, y: 0.46, part: 1 }),
      part(sph(0.075), skin, { x: 0.15, y: 0.44, z: 0.05, part: 1 }),
      part(cap(0.1, 0.34), dark, { x: -0.15, y: 0.46, part: 2 }),
      part(sph(0.075), skin, { x: -0.15, y: 0.44, z: 0.05, part: 2 }),
      part(cap(0.26, 0.36), skin, { y: 1.0, z: 0.08, rx: 0.55, sx: 1.12, part: 0 }),
      part(lathe([[0.3, -0.18], [0.27, 0.0], [0.22, 0.08]], 12), rag, { y: 0.72, z: 0.02, part: 7 }),
      part(sph(0.17), bone, { y: 1.34, z: 0.36, sy: 1.05, part: 5 }),
      part(box(0.26, 0.05, 0.1), bone, { y: 1.42, z: 0.45, part: 5 }),
      part(box(0.17, 0.06, 0.13), bone, { y: 1.19, z: 0.44, rx: 0.35, part: 6 }),
      part(cap(0.07, 0.36), skin, { x: 0.35, y: 0.92, z: 0.24, rx: -0.55, rz: 0.1, part: 3 }),
      part(cap(0.07, 0.36), skin, { x: -0.35, y: 0.92, z: 0.24, rx: -0.55, rz: -0.1, part: 4 }),
      part(cone(0.02, 0.1), bone, { x: 0.33, y: 0.66, z: 0.52, rx: 2.4, part: 3 }),
      part(cone(0.02, 0.1), bone, { x: 0.39, y: 0.66, z: 0.5, rx: 2.4, part: 3 }),
      part(cone(0.02, 0.1), bone, { x: -0.33, y: 0.66, z: 0.52, rx: 2.4, part: 4 }),
      part(cone(0.02, 0.1), bone, { x: -0.39, y: 0.66, z: 0.5, rx: 2.4, part: 4 }),
      part(cone(0.06, 0.22), bone, { y: 1.22, z: -0.2, rx: -1.2, part: 0 }),
      part(cone(0.05, 0.2), bone, { y: 1.05, z: -0.24, rx: -1.3, part: 0 }),
    ];
    for (let i = 0; i < 4; i++) body.push(part(torus(0.2 - i * 0.02, 0.018, Math.PI), bone, { y: 1.12 - i * 0.08, z: 0.2 + i * 0.02, rx: 0.55, sy: 0.7, part: 0 }));
    const glow = [
      part(sph(0.04, 6, 4), 0xffffff, { x: 0.07, y: 1.37, z: 0.5, part: 5 }),
      part(sph(0.04, 6, 4), 0xffffff, { x: -0.07, y: 1.37, z: 0.5, part: 5 }),
      part(box(0.05, 0.34, 0.03), 0xffffff, { y: 1.02, z: 0.33, rx: 0.55, rz: 0.2, part: 0 }),
    ];
    const rig = /* glsl */ `
      void rig(inout vec3 p, inout vec3 n, float part, vec4 A, float t) {
        float walk = A.x, mv = A.y, wind = A.z, strike = A.w;
        if (part == 1.0) rot(p, n, vec3(0.15, 0.72, 0.0), rX(-sin(walk) * 0.62 * mv));
        else if (part == 2.0) rot(p, n, vec3(-0.15, 0.72, 0.0), rX(sin(walk) * 0.34 * mv + 0.15 * mv));
        else if (part == 3.0 || part == 4.0) {
          float side = part == 3.0 ? 1.0 : -1.0;
          float sway = sin(walk + (side > 0.0 ? 3.14 : 0.0)) * 0.32 * mv + sin(t * 1.7 + side * 2.0) * 0.1;
          float a = sway - 2.4 * wind + 2.2 * strike * (1.0 - wind);
          rot(p, n, vec3(0.33 * side, 1.16, 0.12), rX(a) * rZ(side * 0.25 * wind));
        } else if (part >= 5.0 && part <= 6.0) {
          if (part == 6.0) rot(p, n, vec3(0.0, 1.24, 0.38), rX(0.35 + 0.45 * wind + sin(t * 7.0) * 0.08));
          rot(p, n, vec3(0.0, 1.22, 0.24), rZ(sin(t * 1.3) * 0.2 + sin(walk * 0.5) * 0.14 * mv) * rX(-0.45 * wind));
        } else if (part == 7.0) {
          rot(p, n, vec3(0.0, 0.84, 0.0), rX(sin(walk) * 0.18 * mv) * rZ(sin(t * 2.0) * 0.05));
        }
      }`;
    return { geo: build(body, glow), glow: [4, 1.5, 0.35], rig };
  },

  // Cinder Skitter: six two-jointed legs in a tripod gait, pulsing ember sac, mandibles.
  skitter() {
    const shell = 0x2a211d, joint = 0x4a3a30;
    const body = [
      part(sph(0.26), shell, { y: 0.36, sx: 1, sy: 0.62, sz: 1.2, part: 0 }),
      part(sph(0.3), shell, { y: 0.44, z: -0.44, sx: 1.05, sy: 0.85, sz: 1.15, part: 7 }),
      part(cone(0.045, 0.24), joint, { x: 0.08, y: 0.3, z: 0.36, rx: 1.75, rz: 0.3, part: 8 }),
      part(cone(0.045, 0.24), joint, { x: -0.08, y: 0.3, z: 0.36, rx: 1.75, rz: -0.3, part: 9 }),
    ];
    // legs: parts 1-3 left (+x), 4-6 right (-x); each has an upper and lower segment
    for (const side of [1, -1])
      for (let i = 0; i < 3; i++) {
        const id = (side > 0 ? 1 : 4) + i;
        const z = 0.12 - i * 0.2;
        body.push(part(cyl(0.028, 0.022, 0.36, 5), joint, { rz: side * 0.95, ry: side * (i - 1) * 0.35, x: side * 0.34, y: 0.47, z, part: id }));
        body.push(part(cyl(0.02, 0.01, 0.46, 5), joint, { rz: -side * 0.35, ry: side * (i - 1) * 0.35, x: side * 0.56, y: 0.26, z: z + (i - 1) * 0.05, part: id }));
      }
    const glow = [
      part(sph(0.16, 10, 8), 0xffffff, { y: 0.56, z: -0.5, sy: 0.65, part: 7 }),
      part(sph(0.033, 5, 4), 0xffffff, { x: 0.06, y: 0.44, z: 0.3, part: 0 }),
      part(sph(0.033, 5, 4), 0xffffff, { x: -0.06, y: 0.44, z: 0.3, part: 0 }),
      part(sph(0.024, 5, 4), 0xffffff, { x: 0.12, y: 0.42, z: 0.26, part: 0 }),
      part(sph(0.024, 5, 4), 0xffffff, { x: -0.12, y: 0.42, z: 0.26, part: 0 }),
    ];
    const rig = /* glsl */ `
      void rig(inout vec3 p, inout vec3 n, float part, vec4 A, float t) {
        float walk = A.x, mv = A.y, wind = A.z, strike = A.w;
        if (part >= 1.0 && part <= 6.0) {
          float side = part <= 3.0 ? 1.0 : -1.0;
          float i = part <= 3.0 ? part - 1.0 : part - 4.0;
          float grp = mod(i + (side > 0.0 ? 0.0 : 1.0), 2.0) * 3.14159;
          float ph = walk * 1.5 + grp;
          float swing = sin(ph) * 0.45 * mv + sin(t * 9.0 + part) * 0.04;
          float lift = max(0.0, cos(ph)) * 0.45 * mv;
          float rear = i == 0.0 ? -1.1 * wind : 0.0;
          rot(p, n, vec3(side * 0.2, 0.42, 0.12 - i * 0.2), rY(swing * side) * rZ(side * lift) * rX(rear));
        } else if (part == 7.0) {
          float k = 1.0 + sin(t * 4.0) * 0.06 + wind * 0.12;
          vec3 c = vec3(0.0, 0.44, -0.44);
          p = (p - c) * k + c;
        } else if (part == 8.0 || part == 9.0) {
          float side = part == 8.0 ? 1.0 : -1.0;
          rot(p, n, vec3(side * 0.06, 0.32, 0.26), rY(side * (0.25 + sin(t * 14.0) * 0.25 * (0.3 + wind + strike))));
        }
      }`;
    return { geo: build(body, glow), glow: [5, 2, 0.3], rig };
  },

  // Grave Brute: hulking, horned, furnace chest. Stomps; raises both fists overhead and slams.
  brute() {
    const hide = 0x5a4238, dark = 0x2e2420, horn = 0xb0a08a, iron = 0x3a3634;
    const body = [
      part(cap(0.22, 0.5), dark, { x: 0.32, y: 0.55, part: 1 }),
      part(cap(0.22, 0.5), dark, { x: -0.32, y: 0.55, part: 2 }),
      part(cap(0.56, 0.45), hide, { y: 1.62, z: 0.05, rx: 0.25, sx: 1.35, sz: 0.95, part: 0 }),
      part(sph(0.4), hide, { y: 1.05, sx: 1.2, sy: 0.8, part: 0 }),
      part(lathe([[0.5, -0.3], [0.45, 0.0], [0.42, 0.06]], 14), 0x2a1c14, { y: 0.9, part: 0 }),
      part(sph(0.24), hide, { y: 2.22, z: 0.42, part: 5 }),
      part(box(0.3, 0.12, 0.2), dark, { y: 2.08, z: 0.58, part: 5 }),
      part(cone(0.08, 0.5), horn, { x: 0.22, y: 2.46, z: 0.35, rz: -0.6, part: 5 }),
      part(cone(0.08, 0.5), horn, { x: -0.22, y: 2.46, z: 0.35, rz: 0.6, part: 5 }),
      part(cap(0.2, 0.62), hide, { x: 0.86, y: 1.5, z: 0.15, rz: 0.25, rx: -0.2, part: 3 }),
      part(cap(0.2, 0.62), hide, { x: -0.86, y: 1.5, z: 0.15, rz: -0.25, rx: -0.2, part: 4 }),
      part(sph(0.32), dark, { x: 1.0, y: 0.78, z: 0.32, part: 3 }),
      part(sph(0.32), dark, { x: -1.0, y: 0.78, z: 0.32, part: 4 }),
      part(torus(0.24, 0.05), iron, { x: 0.95, y: 1.05, z: 0.25, rx: Math.PI / 2, rz: 0.25, part: 3 }),
      part(torus(0.24, 0.05), iron, { x: -0.95, y: 1.05, z: 0.25, rx: Math.PI / 2, rz: -0.25, part: 4 }),
      part(sph(0.34, 12, 8), iron, { x: 0.72, y: 2.05, z: 0.0, sy: 0.6, part: 0 }),
      part(sph(0.34, 12, 8), iron, { x: -0.72, y: 2.05, z: 0.0, sy: 0.6, part: 0 }),
      part(cone(0.1, 0.4), horn, { x: 0.82, y: 2.3, z: 0.0, rz: -0.7, part: 0 }),
      part(cone(0.1, 0.4), horn, { x: -0.82, y: 2.3, z: 0.0, rz: 0.7, part: 0 }),
      part(cone(0.1, 0.4), horn, { y: 2.0, z: -0.45, rx: -1.0, part: 0 }),
    ];
    for (const sx of [1, -1]) for (let i = 0; i < 3; i++) body.push(part(cone(0.045, 0.14), horn, { x: sx * (0.9 + i * 0.08), y: 0.9 - i * 0.03, z: 0.55, rx: 1.3, part: sx > 0 ? 3 : 4 }));
    const glow = [
      part(sph(0.05, 6, 4), 0xffffff, { x: 0.09, y: 2.26, z: 0.64, part: 5 }),
      part(sph(0.05, 6, 4), 0xffffff, { x: -0.09, y: 2.26, z: 0.64, part: 5 }),
      part(sph(0.16, 10, 8), 0xffffff, { y: 1.62, z: 0.55, sz: 0.5, part: 0 }),
      part(box(0.06, 0.5, 0.04), 0xffffff, { x: 0.25, y: 1.5, z: 0.6, rx: 0.25, rz: -0.5, part: 0 }),
      part(box(0.05, 0.4, 0.04), 0xffffff, { x: -0.3, y: 1.8, z: 0.56, rx: 0.25, rz: 0.8, part: 0 }),
    ];
    const rig = /* glsl */ `
      void rig(inout vec3 p, inout vec3 n, float part, vec4 A, float t) {
        float walk = A.x, mv = A.y, wind = A.z, strike = A.w;
        if (part == 1.0) rot(p, n, vec3(0.32, 0.98, 0.0), rX(-sin(walk) * 0.42 * mv));
        else if (part == 2.0) rot(p, n, vec3(-0.32, 0.98, 0.0), rX(sin(walk) * 0.42 * mv));
        else if (part == 3.0 || part == 4.0) {
          float side = part == 3.0 ? 1.0 : -1.0;
          float a = sin(walk + (side > 0.0 ? 3.14 : 0.0)) * 0.35 * mv + sin(t * 1.2) * 0.04;
          a += -2.7 * wind + 0.7 * strike * (1.0 - wind);
          rot(p, n, vec3(0.72 * side, 1.95, 0.05), rX(a) * rZ(-side * 0.35 * wind));
        } else if (part == 5.0) {
          rot(p, n, vec3(0.0, 2.05, 0.3), rX(-0.55 * wind + 0.25 * strike) * rZ(sin(walk * 0.5) * 0.08 * mv));
        }
      }`;
    return { geo: build(body, glow), glow: [4.5, 0.9, 0.25], rig };
  },

  // Choir Wisp: a floating robed caster with a jagged hem and an orb between its hands.
  wisp() {
    const robe = 0x2a2238, trim = 0x46385a, bone = 0x9a8e7e;
    // A robe that flares into a ragged, jagged hem and narrows to the shoulders.
    const hem = [[0.56, 0.0], [0.47, 0.07], [0.54, 0.13], [0.45, 0.2], [0.42, 0.45], [0.36, 0.85], [0.3, 1.15], [0.26, 1.32], [0.14, 1.44], [0.0, 1.48]];
    const body = [
      part(lathe(hem, 18), robe, { y: 0.1, part: 0 }),
      part(cone(0.3, 0.6, 10), trim, { y: 1.72, z: -0.02, part: 5 }),
      part(sph(0.2), 0x0a0810, { y: 1.6, z: 0.1, part: 5 }),
      part(cap(0.075, 0.42), robe, { x: 0.3, y: 1.22, z: 0.26, rx: -1.1, part: 3 }),
      part(cap(0.075, 0.42), robe, { x: -0.3, y: 1.22, z: 0.26, rx: -1.1, part: 4 }),
      part(sph(0.05), bone, { x: 0.28, y: 1.12, z: 0.5, part: 3 }),
      part(sph(0.05), bone, { x: -0.28, y: 1.12, z: 0.5, part: 4 }),
      part(torus(0.3, 0.025), trim, { y: 1.45, rx: Math.PI / 2, part: 0 }),
    ];
    const glow = [
      part(sph(0.04, 6, 4), 0xffffff, { x: 0.07, y: 1.64, z: 0.27, part: 5 }),
      part(sph(0.04, 6, 4), 0xffffff, { x: -0.07, y: 1.64, z: 0.27, part: 5 }),
      part(sph(0.13, 10, 8), 0xffffff, { y: 1.18, z: 0.62, part: 8 }),
      part(cyl(0.2, 0.06, 0.05, 10), 0xffffff, { y: 0.05, part: 0 }),
    ];
    const rig = /* glsl */ `
      void rig(inout vec3 p, inout vec3 n, float part, vec4 A, float t) {
        float castK = A.w;
        if (part == 0.0 && p.y < 0.9) {
          float a = atan(p.z, p.x);
          float k = (0.9 - p.y) * 0.09;
          p.x += sin(t * 3.0 + a * 3.0) * k;
          p.z += cos(t * 2.6 + a * 3.0) * k;
        } else if (part == 3.0 || part == 4.0) {
          float side = part == 3.0 ? 1.0 : -1.0;
          rot(p, n, vec3(0.3 * side, 1.42, 0.05), rX(-0.1 + sin(t * 1.5 + side) * 0.12 - 0.6 * castK) * rZ(side * 0.2 * castK));
        } else if (part == 5.0) {
          rot(p, n, vec3(0.0, 1.45, 0.0), rX(sin(t * 0.9) * 0.08 + 0.2 * castK) * rZ(sin(t * 0.7) * 0.12));
        } else if (part == 8.0) {
          vec3 c = vec3(0.0, 1.18, 0.62);
          float k = 1.0 + sin(t * 5.0) * 0.12 + castK * 0.6;
          p = (p - c) * k + c + vec3(0.0, sin(t * 2.0) * 0.04, 0.35 * castK);
        }
      }`;
    return { geo: build(body, glow), glow: [2.6, 1.0, 5], rig };
  },
};

export function buildMonster(model) {
  return BUILDERS[model]();
}
