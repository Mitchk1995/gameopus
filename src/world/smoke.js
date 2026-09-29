import * as THREE from 'three';

// Smoke plumes: the beacon fire, the mine chimney, the camps' cook fires. Every plume is one
// mesh of camera-facing puffs whose whole life (rise, drift, growth, fade) is worked out in the
// vertex shader from a shared clock, so a plume costs one draw call and nothing per frame but a
// uniform. All plumes lean the same way in one shared wind. They have no colliders and are not
// in any Batcher, so neither the player nor the camera ever bumps into them.

const WIND = new THREE.Vector3(0.82, 0, 0.36).normalize();

let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  // A soft ball with a lumpy, billowing edge: value noise over a radial falloff.
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lat = (n) => Array.from({ length: n * n }, rnd);
  const octs = [[4, lat(4), 0.5], [8, lat(8), 0.3], [16, lat(16), 0.2]];
  const val = (u, v) => {
    let s = 0;
    for (const [n, L, w] of octs) {
      const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const at = (a, b) => L[((b % n) + n) % n * n + (((a % n) + n) % n)];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      s += w * (at(i, j) + (at(i + 1, j) - at(i, j)) * sx + (at(i, j + 1) - at(i, j)) * sy + (at(i, j) - at(i + 1, j) - at(i, j + 1) + at(i + 1, j + 1)) * sx * sy);
    }
    return s;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
      const n = val(u, v);
      const a = Math.max(0, Math.min(1, (1 - r * (0.8 + 0.5 * n)) * 1.6)) ** 1.4;
      const k = (y * S + x) * 4;
      // Colour carries the puff's own light: brighter towards the top.
      const l = 190 + 60 * (0.5 - dy) + 30 * (n - 0.5);
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, l));
      img.data[k + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  puffTex = new THREE.CanvasTexture(cv);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

const clock = { value: 0 };

function smokeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uWind: { value: WIND } }]),
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWind;
      attribute vec2 aCorner;
      attribute float aSeed;
      attribute vec4 aLife;   // life (s), rise (m), start size, end size (m)
      attribute vec4 aLook;   // colour (grey), opacity, wind strength, spread
      varying vec2 vUv;
      varying float vAlpha;
      varying float vGrey;
      #include <fog_pars_vertex>
      void main() {
        float t = fract(uTime / aLife.x + aSeed);
        // Buoyant: quick off the fire, slowing as it cools; the wind bends it over with height.
        float up = aLife.y * (1.0 - pow(1.0 - t, 1.4));
        vec3 p = vec3(0.0, up, 0.0);
        p += uWind * aLook.z * (up * 0.55 + t * 3.0);
        float wob = aLook.w * t;
        p.x += sin(aSeed * 41.0 + t * 4.3) * wob;
        p.z += cos(aSeed * 29.0 + t * 3.7) * wob;
        float size = mix(aLife.z, aLife.w, pow(t, 0.75));
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        float a = aSeed * 6.2831 + t * (aSeed - 0.5) * 1.6;
        vec2 c = vec2(cos(a) * aCorner.x - sin(a) * aCorner.y, sin(a) * aCorner.x + cos(a) * aCorner.y);
        mvPosition.xy += c * size;
        gl_Position = projectionMatrix * mvPosition;
        vUv = aCorner * 0.5 + 0.5;
        vAlpha = aLook.y * smoothstep(0.0, 0.025, t) * pow(1.0 - smoothstep(0.22, 1.0, t), 1.25);
        // Fresh smoke is darker; it pales as it thins out. Each puff a little different.
        vGrey = mix(aLook.x, min(1.0, aLook.x + 0.32), sqrt(t)) * (0.88 + 0.24 * fract(aSeed * 13.7));
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vGrey;
      #include <fog_pars_fragment>
      void main() {
        vec4 s = texture2D(uMap, vUv);
        float a = s.a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(s.rgb * vGrey, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// A flame that holds its colour against a bright sky. The game's fires (effects.js) are additive,
// which glows at dusk and indoors but washes out to white against daylight clouds; a beacon is
// meant to be seen by day, so its fire also gets this alpha-blended core under the glow.
function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: clock },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vUv;
        float t = uTime * 1.5 + vSeed * 10.0;
        float turb = n(vec2(p.x * 4.0 + vSeed * 7.0, p.y * 3.0 - t * 1.8)) * 0.6 + n(vec2(p.x * 9.0, p.y * 7.0 - t * 3.1)) * 0.4;
        float width = mix(0.4, 0.03, pow(p.y, 0.85));
        float shape = 1.0 - smoothstep(width * 0.5, width, abs(p.x - 0.5 + (turb - 0.5) * 0.2 * p.y));
        shape *= smoothstep(0.0, 0.06, p.y) * (1.0 - smoothstep(0.5, 1.0, p.y + (turb - 0.5) * 0.4));
        float heat = shape * (0.65 + turb * 0.7);
        vec3 col = mix(vec3(0.95, 0.28, 0.04), vec3(1.0, 0.62, 0.16), smoothstep(0.25, 0.85, heat));
        col = mix(col, vec3(1.0, 0.9, 0.55), smoothstep(0.9, 1.25, heat) * (1.0 - p.y));
        float a = clamp(heat * 1.5, 0.0, 1.0);
        if (a < 0.02) discard;
        gl_FragColor = vec4(col * 1.25, a);
        #include <colorspace_fragment>
      }`,
  });
}

export class Smoke {
  constructor(scene) {
    this.scene = scene;
    this.material = smokeMaterial();
    this.material.uniforms.uMap.value = puffTexture();
    // Shared clock, so every plume is in step with one uniform write a frame.
    this.material.uniforms.uTime = clock;
    this.plumes = [];
  }

  // Three crossed flame cards standing on (x, y, z), `size` wide and 1.4 x size tall.
  flame(x, y, z, size = 1) {
    this.flameMat ??= flameMaterial();
    const pos = [], uv = [], seed = [], idx = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, c = Math.cos(a) * size * 0.5, s = Math.sin(a) * size * 0.5, b = pos.length / 3;
      pos.push(-c, 0, -s, c, 0, s, c, size * 1.4, s, -c, size * 1.4, -s);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      seed.push(k * 0.41 + 0.2, k * 0.41 + 0.2, k * 0.41 + 0.2, k * 0.41 + 0.2);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.flameMat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 3;
    mesh.userData.flame = true;
    this.scene.add(mesh);
    return mesh;
  }

  // A plume rising from (x, y, z). `rise` is how high the smoke climbs before it is gone, `size`
  // the puffs' start and end radius, `grey` their colour (0 black .. 1 white), `puffs` how many.
  add(x, y, z, { puffs = 26, life = 16, rise = 38, size = [0.9, 8], grey = 0.62, opacity = 0.55, wind = 1, spread = 2.4, seed = 1 } = {}) {
    const n = puffs, pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), sd = new Float32Array(n * 4);
    const lifeA = new Float32Array(n * 16), look = new Float32Array(n * 16), idx = [];
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < n; i++) {
      const phase = (i + rnd() * 0.6) / n;
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        corner.set(C[k], v * 2);
        sd[v] = phase;
        lifeA.set([life * (0.85 + rnd() * 0.3), rise * (0.8 + rnd() * 0.4), size[0], size[1] * (0.75 + rnd() * 0.5)], v * 4);
        look.set([grey, opacity, wind, spread], v * 4);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    g.setAttribute('aLife', new THREE.BufferAttribute(lifeA, 4));
    g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
    g.setIndex(idx);
    // Bounds that hold the whole bent plume, so it is culled only when truly out of view.
    const drift = wind * (rise * 0.55 + 3) * 1.2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(WIND.x * drift * 0.5, rise * 0.5, WIND.z * drift * 0.5), Math.hypot(rise * 0.5, drift * 0.5) + size[1] * 1.3 + spread);
    g.boundingBox = new THREE.Box3().setFromCenterAndSize(g.boundingSphere.center, new THREE.Vector3().setScalar(g.boundingSphere.radius * 2));
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 5;
    mesh.userData.smoke = true;
    this.scene.add(mesh);
    this.plumes.push(mesh);
    return mesh;
  }

  update(dt) {
    clock.value += dt;
  }
}
