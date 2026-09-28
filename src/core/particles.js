import * as THREE from 'three';

// One big additive point cloud for every spark, ember, bolt and lightning arc.
// CPU-simulated in flat typed arrays; a single draw call.
const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.5, aSize * uScale / -mv.z);
  }`;
const FRAG = /* glsl */ `
  uniform float uGain;
  varying vec4 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d) * 4.0;
    if (r > 1.0) discard;
    float a = 1.0 - r;
    a *= a;
    gl_FragColor = vec4(vColor.rgb * vColor.a * a * uGain, 1.0);
  }`;

export class Particles {
  constructor(scene, cap = 40000) {
    this.cap = cap;
    this.n = 0;
    this.gain = 1; // effects-brightness setting
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uGain: { value: 0.62 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, drag = 0, sizeEnd = 0) {
    if (this.n >= this.cap) return;
    // Never let a bad number into the GPU buffers.
    if (x !== x || y !== y || z !== z || r !== r || g !== g || b !== b || size !== size) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    const i4 = i * 4;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = 1;
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = size; this.s1[i] = sizeEnd;
    this.size[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt) {
    const { pos, vel, col, life, maxLife, size, s0, s1, grav, drag } = this;
    let i = 0;
    while (i < this.n) {
      life[i] -= dt;
      if (life[i] <= 0) {
        this.#remove(i);
        continue;
      }
      const i3 = i * 3;
      const d = drag[i] > 0 ? Math.exp(-drag[i] * dt) : 1;
      vel[i3] *= d; vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt; vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.02 && grav[i] > 0) {
        pos[i3 + 1] = 0.02;
        vel[i3 + 1] *= -0.35;
        vel[i3] *= 0.6; vel[i3 + 2] *= 0.6;
      }
      const t = life[i] / maxLife[i];
      col[i * 4 + 3] = t < 0.3 ? t / 0.3 : 1;
      size[i] = s1[i] + (s0[i] - s1[i]) * t;
      i++;
    }
    const n = this.n;
    // Dense fights get dimmer per particle so the screen never turns into a white-out.
    const density = Math.min(1, Math.max(0.4, 1 / Math.sqrt(Math.max(1, n / 1500))));
    this.material.uniforms.uGain.value = 0.62 * this.gain * density;
    this.points.geometry.setDrawRange(0, n);
    for (const [attr, k] of [[this.aPos, 3], [this.aCol, 4], [this.aSize, 1]]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, n * k));
      attr.needsUpdate = true;
    }
  }

  #remove(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3, i4 = i * 4, j4 = j * 4;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k];
      this.vel[i3 + k] = this.vel[j3 + k];
    }
    for (let k = 0; k < 4; k++) this.col[i4 + k] = this.col[j4 + k];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
    this.size[i] = this.size[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
  }

  // Convenience emitters -------------------------------------------------
  burst(x, y, z, count, speed, c, life = 0.5, size = 0.3, grav = 6, up = 2) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, z, Math.cos(a) * s, up * (0.3 + Math.random()), Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), c[0], c[1], c[2], grav, 2.5, 0);
    }
  }
  ring(x, y, z, radius, count, c, life = 0.5, size = 0.35, outSpeed = 2) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.1;
      const cx = Math.cos(a), cz = Math.sin(a);
      this.spawn(x + cx * radius, y, z + cz * radius, cx * outSpeed, 0.5 + Math.random(), cz * outSpeed,
        life * (0.7 + Math.random() * 0.5), size, c[0], c[1], c[2], 0, 1.5, 0);
    }
  }
}
