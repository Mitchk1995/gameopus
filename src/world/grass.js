import * as THREE from 'three';
import { WORLD } from './map.js';

// Grass: a field of blade tufts that always surrounds the player. The tufts are laid
// out once over a square; the vertex shader wraps that square around the player,
// stands each tuft on the heightmap, and thins or hides it where the ground isn't
// meadow (paths, cobbles, forest floor, sand, steep rock). Blades sway in the wind
// and part around the player's legs.

const SIZE = 56;            // side of the wrapped square, metres
const COUNT = 26000;        // tufts
const FADE = [18, 27];      // blades shrink away between these distances

export class Grass {
  constructor({ scene, terrain }) {
    this.time = { value: 0 };
    this.center = { value: new THREE.Vector2() };
    this.pusher = { value: new THREE.Vector3(0, -100, 0) };
    const geo = tuftGeometry();
    const inst = new THREE.InstancedBufferGeometry().copy(geo);
    inst.instanceCount = COUNT;
    const offs = new Float32Array(COUNT * 2), rnd = new Float32Array(COUNT * 3);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const side = Math.ceil(Math.sqrt(COUNT)), cell = SIZE / side;
    // Shuffled, so drawing fewer (lower quality) still covers the whole square.
    const order = Array.from({ length: COUNT }, (_, i) => i);
    for (let i = COUNT - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let k = 0; k < COUNT; k++) {
      const i = order[k];
      offs[k * 2] = ((i % side) + r()) * cell;
      offs[k * 2 + 1] = (Math.floor(i / side) + r()) * cell;
      rnd[k * 3] = r() * Math.PI * 2;
      rnd[k * 3 + 1] = r();
      rnd[k * 3 + 2] = r();
    }
    inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 2));
    inst.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 3));

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.7 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uHeight: { value: terrain.heightTex },
        uGround: { value: terrain.groundTex },
        uBioA: { value: terrain.biomeA },
        uBioB: { value: terrain.biomeB },
        uShore: { value: terrain.shoreTex },
        uFields: { value: terrain.fieldsTex },
        uHalf: { value: WORLD.half },
        uN: { value: WORLD.size + 1 },
        uTime: this.time,
        uCenter: this.center,
        uPusher: this.pusher,
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uHeight, uGround, uBioA, uBioB, uShore, uFields;
          uniform float uHalf, uN, uTime;
          uniform vec2 uCenter;
          uniform vec3 uPusher;
          attribute vec2 aOffset;
          attribute vec3 aRand;
          attribute float aHead;
          varying float vTip;
          varying vec3 vTint;
          varying vec3 vHead;
          float gH(vec2 p) { return textureLod(uHeight, (p + uHalf + 0.5) / uN, 0.0).r; }
          float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`)
        .replace('#include <beginnormal_vertex>', `
          // Wrap this tuft's slot in the square to the copy nearest the player.
          vec2 gBase = aOffset + floor((uCenter - aOffset) / ${SIZE.toFixed(1)} + 0.5) * ${SIZE.toFixed(1)};
          float gDist = length(gBase - uCenter);
          vec3 cover = textureLod(uGround, gBase / (uHalf * 2.0) + 0.5, 0.0).rgb;
          float gY = gH(gBase);
          vec3 gN = normalize(vec3(gH(gBase - vec2(1.0, 0.0)) - gH(gBase + vec2(1.0, 0.0)), 2.0, gH(gBase - vec2(0.0, 1.0)) - gH(gBase + vec2(0.0, 1.0))));
          vec2 gUV = gBase / (uHalf * 2.0) + 0.5;
          vec3 bA = textureLod(uBioA, gUV, 0.0).rgb, bB = textureLod(uBioB, gUV, 0.0).rgb;
          vec3 gSh = textureLod(uShore, gUV, 0.0).rgb, gFl = textureLod(uFields, gUV, 0.0).rgb;
          float meadow = (1.0 - smoothstep(0.15, 0.55, cover.r)) * (1.0 - smoothstep(0.1, 0.4, cover.b));
          meadow *= 1.0 - smoothstep(0.35, 0.8, cover.g) * 0.8;
          meadow *= smoothstep(0.7, 1.3, gY) * smoothstep(0.78, 0.9, gN.y) * (1.0 - smoothstep(24.0, 40.0, gY));
          // None on the bars, in the fields (their crops grow there) or on the scree; sparse on the heath.
          meadow *= (1.0 - smoothstep(0.2, 0.6, gSh.r)) * (1.0 - smoothstep(0.2, 0.6, max(max(gFl.r, gFl.g), max(gFl.b, gSh.b))));
          meadow *= (1.0 - bA.g * 0.45) * (1.0 - bB.b * 0.8);
          // Patchy: some ground is lush, some is short and sparse.
          float gPatch = gNoise(gBase * 0.09) * 0.7 + gNoise(gBase * 0.31) * 0.3;
          float keep = step(aRand.z, meadow * (0.55 + gPatch * 0.7));
          float grow = keep * (1.0 - smoothstep(${FADE[0].toFixed(1)}, ${FADE[1].toFixed(1)}, gDist));
          // Tall and rank in the marsh and the dry scrub, short on the heath.
          float tall = 1.0 + bA.b * 0.5 + bB.r * 0.35 - bA.g * 0.35;
          float gScale = grow * (0.65 + aRand.y * 0.45) * (0.65 + gPatch * 0.55);
          // Coloured by where it grows, like the ground under it: meadow greens, golden dry grass in
          // bandit country, heather browns on the heath, dark sedge in the marsh.
          float gDry = smoothstep(0.35, 0.8, gNoise(gBase * 0.011 + 3.0) * 0.7 + gNoise(gBase * 0.045) * 0.3);
          vec3 tint = mix(vec3(0.05, 0.085, 0.02), vec3(0.085, 0.09, 0.028), gDry);
          tint = mix(tint, mix(vec3(0.1, 0.066, 0.024), vec3(0.15, 0.1, 0.035), gDry), bB.r * 0.9);
          tint = mix(tint, vec3(0.068, 0.058, 0.04), bA.g * 0.7);
          tint = mix(tint, vec3(0.032, 0.048, 0.02), bA.b * 0.8);
          tint = mix(tint, vec3(0.035, 0.06, 0.017), bB.g * 0.5);
          vTint = tint * (0.8 + aRand.y * 0.4);
          vTip = position.y;
          // One tuft in a dozen in the meadows is a flower: a head on its tallest blade.
          float r2 = fract(aRand.y * 7.13 + aRand.z * 3.71);
          float bloom = step(0.9, r2) * clamp(bA.r * 1.2 - bB.r - bA.g * 0.5, 0.0, 1.0) * step(0.35, gPatch);
          float fk = fract(r2 * 13.7);
          vHead = aHead * (fk < 0.4 ? vec3(0.4, 0.3, 0.03) : fk < 0.62 ? vec3(0.34, 0.34, 0.31) : fk < 0.84 ? vec3(0.2, 0.075, 0.18) : vec3(0.09, 0.13, 0.32));
          gScale *= mix(1.0, bloom, aHead);
          vec3 objectNormal = gN;`)
        .replace('#include <begin_vertex>', `
          float gc = cos(aRand.x), gs = sin(aRand.x);
          vec3 transformed = vec3(position.x * gc - position.z * gs, position.y * tall, position.x * gs + position.z * gc) * gScale;
          float bend = position.y * position.y * gScale;
          // Wind: slow gusts plus a quicker flutter.
          float gust = sin(uTime * 1.1 + gBase.x * 0.07 + gBase.y * 0.05) * 0.5 + 0.5;
          float wave = sin(uTime * 2.3 + gBase.x * 0.9 + gBase.y * 0.6 + aRand.y * 6.0);
          transformed.xz += vec2(0.8, 0.45) * bend * (0.35 + gust * 0.6 + wave * 0.18);
          // Part around the player.
          vec2 away = gBase - uPusher.xz;
          float near = max(0.0, 1.0 - length(away) / 1.1) * step(abs(uPusher.y - gY), 1.5);
          transformed.xz += normalize(away + 1e-4) * near * bend * 1.6;
          transformed.y -= near * bend * 0.4;
          transformed += vec3(gBase.x, gY, gBase.y);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vTip;
          varying vec3 vTint;
          varying vec3 vHead;`)
        // Both sides of a blade take the ground's normal, so back faces aren't dark.
        .replace('#include <normal_fragment_begin>', `
          float faceDirection = 1.0;
          vec3 normal = normalize(vNormal);
          vec3 nonPerturbedNormal = normal;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float gt = clamp(vTip / 0.5, 0.0, 1.0);
          diffuseColor.rgb = vTint * mix(0.62, 1.25, gt) * mix(vec3(1.0), vec3(1.08, 1.06, 0.8), gt * gt);
          if (dot(vHead, vHead) > 0.0001) diffuseColor.rgb = vHead;`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // Light through the blades; blades hardly shine.
          reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.22 * gt;
          reflectedLight.directSpecular *= 0.3;
          reflectedLight.indirectSpecular *= 0.3;`);
    };
    const mesh = new THREE.Mesh(inst, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    scene.add(mesh);
    this.mesh = mesh;
  }

  // 0..1 share of the tufts to draw.
  setDensity(f) {
    this.mesh.geometry.instanceCount = Math.round(COUNT * f);
    this.mesh.visible = f > 0;
  }

  update(dt, focus, pusher) {
    this.time.value += dt;
    this.center.value.set(focus.x, focus.z);
    if (pusher) this.pusher.value.copy(pusher);
  }
}

// Seven thin curved blades in a loose tuft, 0 to ~0.55 m tall, in local space.
function tuftGeometry() {
  const pos = [], idx = [];
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let top = null;
  for (let b = 0; b < 7; b++) {
    const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.13;
    const bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad;
    const rot = r() * Math.PI * 2, h = 0.3 + r() * 0.25, w = 0.011 + r() * 0.008, lean = 0.12 + r() * 0.3;
    const base = pos.length / 3;
    const segs = 3;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const width = w * (1 - t * 0.85);
      const fwd = lean * t * t * h;
      for (const side of [-1, 1]) {
        if (i === segs && side === 1) continue;
        const lx = side * width;
        pos.push(bx + lx * c - fwd * s, t * h, bz + lx * s + fwd * c);
      }
    }
    for (let i = 0; i < segs - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const a = base + (segs - 1) * 2;
    idx.push(a, a + 1, a + 2);
    const tip = pos.length / 3 - 1;
    if (!top || pos[tip * 3 + 1] > top[1]) top = [pos[tip * 3], pos[tip * 3 + 1], pos[tip * 3 + 2]];
  }
  // A flower head on the tallest blade: a little round face turned up to the sky, tipped a touch
  // (hidden unless the tuft blooms).
  const blades = pos.length / 3;
  const s = 0.03, b0 = pos.length / 3;
  pos.push(top[0], top[1] + 0.012, top[2]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    pos.push(top[0] + Math.cos(a) * s, top[1] + Math.cos(a) * s * 0.35, top[2] + Math.sin(a) * s);
  }
  for (let k = 0; k < 7; k++) idx.push(b0, b0 + 1 + ((k + 1) % 7), b0 + 1 + k);
  const head = new Float32Array(pos.length / 3);
  head.fill(1, blades);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1));
  g.setIndex(idx);
  return g;
}
