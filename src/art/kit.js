import * as THREE from 'three';
import { enhance } from './enhance.js';

// Shared, cached materials for item models and character gear.
// One kit per WebGL context (each needs its own environment map).
export function createKit(env, { envScale = 1, roughAdd = 0, metalTint = 1 } = {}) {
  const cache = new Map();
  const get = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const hex = (c) => (c instanceof THREE.Color ? c.getHexString() : new THREE.Color(c).getHexString());

  const METALS = {
    steel: { tex: 'steel', color: [0.7, 0.72, 0.78], metal: 0.95, rough: 0.55 },
    silver: { tex: 'steel', color: [0.95, 0.96, 1.0], metal: 1, rough: 0.5 },
    blade: { tex: 'polished', color: [0.92, 0.94, 0.98], metal: 0.9, rough: 0.5, bump: 0.15, scale: 1.5 },
    iron: { tex: 'iron', color: [0.9, 0.9, 0.95], metal: 0.85, rough: 1 },
    rust: { tex: 'iron', color: [1.25, 1.0, 0.85], metal: 0.6, rough: 1.1 },
    gold: { tex: 'gold', color: [1, 1, 1], metal: 1, rough: 0.9 },
    bronze: { tex: 'gold', color: [0.6, 0.62, 0.95], metal: 1, rough: 1.1 },
    copper: { tex: 'steel', color: [1.0, 0.62, 0.48], metal: 1, rough: 0.7 },
    void: { tex: 'iron', color: [0.22, 0.18, 0.3], metal: 0.9, rough: 0.55 },
    ice: { tex: 'steel', color: [0.7, 0.9, 1.1], metal: 0.4, rough: 0.35 },
  };

  return {
    env,
    metal(kind = 'steel') {
      return get(`metal:${kind}`, () => {
        const m = METALS[kind];
        return enhance(new THREE.MeshStandardMaterial({ color: new THREE.Color(...m.color).multiplyScalar(metalTint), metalness: m.metal, roughness: Math.min(1, m.rough + roughAdd), envMap: env, envMapIntensity: 1.1 * envScale }),
          { tex: m.tex, scale: m.scale ?? (m.tex === 'gold' ? 4 : 3), bump: m.bump ?? (m.tex === 'gold' ? 0.35 : 0.7), rim: 0.35 });
      });
    },
    leather(color = 0x8a5a3a) {
      return get(`leather:${hex(color)}`, () =>
        enhance(new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(2.0), roughness: 0.9, metalness: 0, envMap: env, envMapIntensity: 0.35 }), { tex: 'leather', scale: 6, bump: 0.7, rim: 0.3 }));
    },
    hide() {
      return get('hide', () =>
        enhance(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.45, 0.42), roughness: 1, metalness: 0, envMap: env, envMapIntensity: 0.3 }), { tex: 'hide', scale: 5, bump: 1, rim: 0.3, glow: new THREE.Color(2.4, 0.7, 0.12) }));
    },
    charred() {
      return get('charred', () =>
        enhance(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.28, 0.26), roughness: 1, metalness: 0, envMap: env, envMapIntensity: 0.25 }), { tex: 'skin', scale: 4.5, bump: 1, rim: 0.3, glow: new THREE.Color(1.9, 0.55, 0.1) }));
    },
    inner() {
      return get('inner', () => new THREE.MeshStandardMaterial({ color: 0x060508, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    },
    cloth(color = 0x6a1a18) {
      return get(`cloth:${hex(color)}`, () =>
        enhance(new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 1, metalness: 0, side: THREE.DoubleSide }), { tex: 'cloth', scale: 4, bump: 0.6, rim: 0.3 }));
    },
    chain(doubleSide = false) {
      return get(`chain:${doubleSide}`, () => enhance(new THREE.MeshStandardMaterial({ color: 0x8e929c, metalness: 0.95, roughness: 0.8, envMap: env, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide }), { tex: 'chain', scale: 5, bump: 1.4, rim: 0.3 }));
    },
    bone() {
      return get('bone', () => enhance(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMap: env, envMapIntensity: 0.3 }), { tex: 'bone', scale: 2.5, bump: 1, rim: 0.3 }));
    },
    gem(color, glow = 0.5) {
      return get(`gem:${hex(color)}:${glow}`, () => {
        const c = new THREE.Color(color);
        return new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(glow), roughness: 0.06, metalness: 0.15, envMap: env, envMapIntensity: 1.8, flatShading: true });
      });
    },
    crystal(color) {
      return get(`crystal:${hex(color)}`, () => {
        const c = new THREE.Color(color);
        return new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.55), roughness: 0.04, metalness: 0.1, envMap: env, envMapIntensity: 2, transparent: true, opacity: 0.82, flatShading: true });
      });
    },
    glow(color, k = 1) {
      return get(`glow:${hex(color)}:${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: true }));
    },
    dark() {
      return get('dark', () => new THREE.MeshStandardMaterial({ color: 0x050407, roughness: 0.9 }));
    },
  };
}
