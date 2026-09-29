import * as THREE from 'three';
import { FALLS } from './map.js';

// Whitespring Falls: the stream pours from its notch in the cliff top and slides down the face into
// the plunge pool, with a thinner cascade coming down the ravine above the lip, and spray and mist
// rising where it lands (the white water in the pool itself is the water shader's, from flow.png).
// Cheap on purpose: two ribbons with a scrolling-streak shader and one cloud of point sprites.

const RIBBON = {
  uniforms: { uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 1 }, uFogFar: { value: 1000 } },
  vertexShader: `
    attribute float aT;
    varying vec2 vUv;
    varying float vT;
    varying float vFog;
    void main() {
      vUv = uv;
      vT = aT;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vFog = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uTime, uFogNear, uFogFar;
    uniform vec3 uFogColor;
    uniform float uSpeed, uOpacity;
    varying vec2 vUv;
    varying float vT;
    varying float vFog;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      // Streaks falling down the sheet: long in v, narrow in u, several speeds layered.
      float t = uTime * uSpeed;
      float s1 = n(vec2(vUv.x * 18.0, vUv.y * 1.6 - t));
      float s2 = n(vec2(vUv.x * 41.0 + 3.0, vUv.y * 3.1 - t * 1.6));
      float s3 = n(vec2(vUv.x * 7.0 + 9.0, vUv.y * 0.7 - t * 0.7));
      float streak = s1 * 0.5 + s2 * 0.3 + s3 * 0.2;
      // Thin and broken at the edges, fuller down the middle; frayed where it starts.
      float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
      float a = smoothstep(0.25, 0.75, streak + edge * 0.35) * edge * uOpacity;
      a *= smoothstep(1.0, 0.96, vT) * (0.7 + 0.3 * smoothstep(0.0, 0.15, vT));
      vec3 col = mix(vec3(0.62, 0.7, 0.74), vec3(0.97, 0.99, 1.0), smoothstep(0.45, 0.85, streak));
      float fog = smoothstep(uFogNear, uFogFar, vFog);
      gl_FragColor = vec4(mix(col, uFogColor, fog), a);
    }`,
};

export class Falls {
  constructor({ scene, world }) {
    this.time = { value: 0 };
    const w = world;
    const [lx, lz] = FALLS.lip, [px, pz] = FALLS.pool, [tx, tz] = FALLS.top;
    // Out from the cliff toward the pool, and back up the ravine.
    let ox = px - lx, oz = pz - lz;
    const ol = Math.hypot(ox, oz);
    ox /= ol; oz /= ol;
    const ground = (x, z) => w.heightAt(x, z);
    // The fall: for each height from the lip down to the pool, the face's distance out from the lip;
    // the sheet hangs a little in front of it.
    const lipY = ground(lx, lz);
    const pts = [];
    const N = 28;
    for (let k = 0; k <= N; k++) {
      const y = lipY + 0.4 - (lipY + 0.6) * (k / N);
      let u = -3;
      while (u < 40 && ground(lx + ox * u, lz + oz * u) > y) u += 0.25;
      const out = 0.7 + 0.8 * (k / N);
      pts.push([lx + ox * (u + out), y, lz + oz * (u + out), 3.4 + 4.6 * Math.pow(k / N, 0.7)]);
    }
    // Make it fall steadily: each point no nearer the cliff than the one above it.
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const da = (a[0] - lx) * ox + (a[2] - lz) * oz, db = (b[0] - lx) * ox + (b[2] - lz) * oz;
      if (db < da) { b[0] += ox * (da - db); b[2] += oz * (da - db); }
    }
    this.fall = ribbon(pts, ox, oz, 1.5, 0.95);
    // The cascade down the ravine above the lip: over the notch's floor, a hand above it.
    let rx = tx - lx, rz = tz - lz;
    const rl = Math.hypot(rx, rz);
    rx /= rl; rz /= rl;
    const up = [];
    for (let k = 14; k >= 0; k--) {
      const u = (k / 14) * Math.min(26, rl), x = lx + rx * u, z = lz + rz * u;
      up.push([x, ground(x, z) + 0.25, z, 1.2 + 0.6 * (1 - k / 14)]);
    }
    this.cascade = ribbon(up, -rx, -rz, 0.9, 0.8, true);
    for (const m of [this.fall, this.cascade]) {
      m.material.uniforms.uTime = this.time;
      scene.add(m);
    }
    // Spray and mist where the water lands.
    const land = pts[pts.length - 1];
    this.mist = mist(land[0], land[2], this.time);
    scene.add(this.mist);
    this.landing = { x: land[0], z: land[2] };
    this.scene = scene;
  }

  update(dt) {
    this.time.value += dt;
    const f = this.scene.fog;
    if (f) for (const m of [this.fall, this.cascade, this.mist]) {
      const u = m.material.uniforms;
      u.uFogColor.value.copy(f.color);
      u.uFogNear.value = f.near;
      u.uFogFar.value = f.far;
    }
  }
}

// A sheet of falling water through points [x, y, z, width], facing out along (fx, fz).
function ribbon(pts, fx, fz, speed, opacity, flat = false) {
  const pos = [], uv = [], idx = [], at = [];
  let v = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x, y, z, w] = pts[k];
    if (k) v += Math.hypot(x - pts[k - 1][0], y - pts[k - 1][1], z - pts[k - 1][2]) / 12;
    // Across the sheet: sideways to its fall (and on the ravine floor, sideways to the stream).
    const sx = -fz, sz = fx;
    pos.push(x - sx * w / 2, y, z - sz * w / 2, x + sx * w / 2, y, z + sz * w / 2);
    uv.push(0, v, 1, v);
    at.push(k / (pts.length - 1), k / (pts.length - 1));
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(RIBBON.uniforms), uSpeed: { value: speed }, uOpacity: { value: opacity } },
    vertexShader: RIBBON.vertexShader,
    fragmentShader: RIBBON.fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  m.userData.flat = flat;
  return m;
}

// A drifting cloud of soft white sprites over the landing: rising, spreading and fading, over and over.
function mist(x, z, time) {
  const n = 46;
  const seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, 4, z), 30);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uAt: { value: new THREE.Vector2(x, z) }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 1 }, uFogFar: { value: 1000 } },
    vertexShader: `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform vec2 uAt;
      varying float vA;
      varying float vFog;
      void main() {
        float life = fract(uTime * (0.08 + aSeed.x * 0.08) + aSeed.y);
        float a = aSeed.z * 6.2832 + life * 1.3;
        float r = 1.0 + life * (4.5 + aSeed.x * 5.0);
        vec3 p = vec3(uAt.x + cos(a) * r, 0.3 + life * (3.0 + aSeed.y * 5.0), uAt.y + sin(a) * r * 0.8 + life * 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFog = -mv.z;
        vA = smoothstep(0.0, 0.15, life) * (1.0 - life) * 0.32;
        gl_PointSize = (180.0 + 260.0 * life) * (0.6 + aSeed.x * 0.6) / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uFogColor;
      uniform float uFogNear, uFogFar;
      varying float vA;
      varying float vFog;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.1, d) * vA;
        gl_FragColor = vec4(mix(vec3(0.92, 0.95, 0.97), uFogColor, smoothstep(uFogNear, uFogFar, vFog)), a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const p = new THREE.Points(g, mat);
  p.renderOrder = 4;
  return p;
}
