import * as THREE from 'three';

// Small animated things: fire (flame cards, embers and a flickering light) and the
// rings of a fishing spot on the water.

const flameMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec2 vUv;
    varying float vSeed;
    attribute float aSeed;
    void main() {
      vUv = uv;
      vSeed = aSeed;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
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
      float t = uTime * 1.6 + vSeed * 10.0;
      float turb = n(vec2(p.x * 4.0 + vSeed * 7.0, p.y * 3.0 - t * 1.8)) * 0.6 + n(vec2(p.x * 9.0, p.y * 7.0 - t * 3.1)) * 0.4;
      float width = mix(0.36, 0.02, pow(p.y, 0.9));
      float shape = 1.0 - smoothstep(width * 0.55, width, abs(p.x - 0.5 + (turb - 0.5) * 0.18 * p.y));
      shape *= smoothstep(0.0, 0.08, p.y) * (1.0 - smoothstep(0.55, 1.0, p.y + (turb - 0.5) * 0.4));
      float heat = shape * (0.6 + turb * 0.8);
      vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.72, 0.28), smoothstep(0.2, 0.9, heat));
      col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.85, 1.3, heat) * (1.0 - p.y));
      gl_FragColor = vec4(col * heat * 1.6, heat);
    }`,
});

export class Fire {
  constructor(scene, x, y, z, { size = 0.9, light = true } = {}) {
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    const geo = new THREE.BufferGeometry();
    const pos = [], uv = [], seed = [], idx = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, c = Math.cos(a) * size * 0.5, s = Math.sin(a) * size * 0.5, b = pos.length / 3;
      pos.push(-c, 0, -s, c, 0, s, c, size * 1.3, s, -c, size * 1.3, -s);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      seed.push(k * 0.37, k * 0.37, k * 0.37, k * 0.37);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    geo.setIndex(idx);
    const flames = new THREE.Mesh(geo, flameMat);
    flames.renderOrder = 3;
    this.group.add(flames);
    if (light) {
      this.light = new THREE.PointLight(0xff9a4a, 6, 9, 1.6);
      this.light.position.y = size * 0.7;
      this.group.add(this.light);
    }
    this.embers = embers(size);
    this.group.add(this.embers);
    scene.add(this.group);
    this.t = Math.random() * 10;
  }

  update(dt) {
    this.t += dt;
    if (this.light) this.light.intensity = 5 + Math.sin(this.t * 13) * 0.8 + Math.sin(this.t * 7.3) * 0.9 + Math.sin(this.t * 29) * 0.4;
    this.embers.material.uniforms.uTime.value = this.t;
  }
}
Fire.tick = (dt) => (flameMat.uniforms.uTime.value += dt);

function embers(size) {
  const n = 24, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * size * 0.4, 0, (Math.random() - 0.5) * size * 0.4], i * 3);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: size } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime, uSize;
      attribute float aSeed;
      varying float vA;
      void main() {
        float t = fract(uTime * (0.35 + aSeed * 0.3) + aSeed);
        vec3 p = position + vec3(sin(t * 9.0 + aSeed * 20.0) * 0.12, t * uSize * 2.6, cos(t * 7.0 + aSeed * 13.0) * 0.12);
        vA = (1.0 - t) * step(0.25, aSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 40.0 / -mv.z;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(1.0, 0.55, 0.15, 1.0) * smoothstep(0.5, 0.1, d) * vA;
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// Rings spreading on the water where fish are biting.
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    float h(float x) { return fract(sin(x * 91.3) * 437.5); }
    void main() {
      vec2 p = vUv - 0.5;
      float a = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float t = fract(uTime * 0.45 + fi * 0.25);
        vec2 c = vec2(h(fi + floor(uTime * 0.45 + fi * 0.25)) - 0.5, h(fi * 3.1 + floor(uTime * 0.45 + fi * 0.25)) - 0.5) * 0.35;
        float r = length(p - c);
        a += smoothstep(0.012, 0.0, abs(r - t * 0.3)) * (1.0 - t);
      }
      // Glints.
      float g = step(0.985, h(floor(vUv.x * 40.0) + floor(vUv.y * 40.0) * 57.0 + floor(uTime * 6.0))) * smoothstep(0.5, 0.2, length(p));
      a = a * smoothstep(0.5, 0.35, length(p)) + g * 0.6;
      gl_FragColor = vec4(vec3(0.92, 0.97, 1.0), a * 0.75);
    }`,
});

export function fishingRings(scene, x, z, size = 2.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), ringMat);
  m.position.set(x, 0.03, z);
  m.renderOrder = 4;
  scene.add(m);
  return m;
}
fishingRings.tick = (dt) => (ringMat.uniforms.uTime.value += dt);
