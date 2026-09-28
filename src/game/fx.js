import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }`;

const SHADERS = {
  slash: /* glsl */ `
    uniform float uProg, uFade, uDir;
    uniform vec3 uColor;
    varying vec2 vP;
    const float HALF = 1.2;
    void main() {
      float a = (atan(vP.y, vP.x) + HALF) / (2.0 * HALF);
      if (uDir > 0.0) a = 1.0 - a;
      float r = (length(vP) - 0.25) / 0.75;
      float trail = smoothstep(uProg - 0.6, uProg, a) * step(a, uProg + 0.01);
      float body = smoothstep(0.0, 0.8, r) * (1.0 - smoothstep(0.9, 1.0, r));
      float edge = smoothstep(0.8, 0.95, r) * (1.0 - smoothstep(0.96, 1.0, r));
      gl_FragColor = vec4(uColor * (body * 0.45 + edge * 1.6) * trail * uFade, 1.0);
    }`,
  ring: /* glsl */ `
    uniform float uProg, uFade;
    uniform vec3 uColor;
    varying vec2 vP;
    void main() {
      float r = length(vP);
      float band = smoothstep(uProg - 0.2, uProg, r) * (1.0 - smoothstep(uProg, uProg + 0.025, r));
      float fill = (1.0 - smoothstep(0.0, max(uProg, 0.01), r)) * 0.04;
      gl_FragColor = vec4(uColor * (band * 0.75 + fill) * uFade, 1.0);
    }`,
  telegraph: /* glsl */ `
    uniform float uProg, uFade;
    uniform vec3 uColor;
    varying vec2 vP;
    void main() {
      float r = length(vP);
      float rim = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float fill = step(r, uProg) * (0.25 + 0.3 * smoothstep(uProg - 0.1, uProg, r)) * step(r, 1.0);
      gl_FragColor = vec4(uColor * (rim * 0.9 + fill) * uFade, 1.0);
    }`,
  fire: /* glsl */ `
    uniform float uTime, uFade, uSeed;
    uniform vec3 uColor;
    varying vec2 vP;
    ${NOISE}
    void main() {
      float r = length(vP);
      float n = vn(vP * 2.6 + vec2(uSeed, uTime * 1.3)) * 0.6 + vn(vP * 6.0 - vec2(uTime * 2.2, uSeed)) * 0.4;
      float m = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.6);
      vec3 c = mix(vec3(0.5, 0.06, 0.01), vec3(1.5, 0.62, 0.14), n * n) * uColor;
      gl_FragColor = vec4(c * m * (0.45 + n * 0.7) * uFade, 1.0);
    }`,
  glow: /* glsl */ `
    uniform float uFade;
    uniform vec3 uColor;
    varying vec2 vP;
    void main() {
      float r = length(vP);
      float g = pow(max(0.0, 1.0 - r), 2.2);
      gl_FragColor = vec4(uColor * g * uFade, 1.0);
    }`,
};

class Pool {
  constructor(scene, geo, kind, n) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uProg: { value: 0 }, uFade: { value: 1 }, uDir: { value: 1 }, uTime: { value: 0 }, uSeed: { value: Math.random() * 100 },
          uColor: { value: new THREE.Color() },
        },
        vertexShader: VERT,
        fragmentShader: SHADERS[kind],
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.order = 'XYZ';
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 5;
      m.frustumCulled = false;
      scene.add(m);
      this.items.push({ mesh: m, u: mat.uniforms, t: 0, dur: 1, active: false });
    }
    this.i = 0;
  }
  get() {
    const it = this.items[this.i];
    this.i = (this.i + 1) % this.items.length;
    it.active = true;
    it.mesh.visible = true;
    it.t = 0;
    return it;
  }
}

export class FX {
  constructor(game) {
    this.game = game;
    const s = game.scene;
    this.slashes = new Pool(s, new THREE.RingGeometry(0.25, 1, 40, 3, -1.2, 2.4), 'slash', 16);
    this.rings = new Pool(s, new THREE.CircleGeometry(1, 64), 'ring', 24);
    this.teles = new Pool(s, new THREE.CircleGeometry(1, 48), 'telegraph', 12);
    this.fires = new Pool(s, new THREE.CircleGeometry(1, 32), 'fire', 70);
    this.glows = new Pool(s, new THREE.CircleGeometry(1, 32), 'glow', 20);
    this.lootGlows = new Pool(s, new THREE.CircleGeometry(1, 32), 'glow', 16);
    this.pools = [this.slashes, this.rings, this.teles, this.fires, this.glows, this.lootGlows];
  }

  slash(x, z, angle, range, color, dir) {
    const it = this.slashes.get();
    it.dur = 0.2;
    it.kind = 'slash';
    it.mesh.position.set(x, 1.0, z);
    it.mesh.rotation.z = angle - Math.PI / 2;
    it.mesh.scale.setScalar(range);
    it.u.uColor.value.setRGB(...color);
    it.u.uDir.value = dir;
  }

  ring(x, z, radius, color, dur = 0.45, implode = false) {
    const it = this.rings.get();
    it.dur = dur;
    it.kind = implode ? 'implode' : 'ring';
    it.mesh.position.set(x, 0.06, z);
    it.mesh.scale.setScalar(radius);
    it.u.uColor.value.setRGB(...color);
  }

  telegraph(x, z, radius, dur) {
    const it = this.teles.get();
    it.dur = dur;
    it.kind = 'tele';
    it.mesh.position.set(x, 0.04, z);
    it.mesh.scale.setScalar(radius);
    it.u.uColor.value.setRGB(1.6, 0.15, 0.05);
  }

  fire(x, z, radius, dur, enemy) {
    const it = this.fires.get();
    it.dur = dur;
    it.kind = 'fire';
    it.mesh.position.set(x, 0.035 + Math.random() * 0.01, z);
    it.mesh.scale.setScalar(radius);
    it.u.uColor.value.setRGB(...(enemy ? [1.3, 0.35, 0.8] : [1, 1, 1]));
    return it;
  }

  glow(x, z, radius, color, dur, loot = false) {
    const it = (loot ? this.lootGlows : this.glows).get();
    it.dur = dur;
    it.kind = 'glow';
    it.mesh.position.set(x, 0.05, z);
    it.mesh.scale.setScalar(radius);
    it.u.uColor.value.setRGB(...color);
    return it;
  }

  // Jagged bolt of light drawn with particles.
  lightning(ax, ay, az, bx, by, bz, c = [2.5, 3, 7], life = 0.16) {
    const P = this.game.particles;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const segs = Math.max(3, Math.ceil(len / 0.7));
    const px = -dz / (len || 1), pz = dx / (len || 1);
    let lx = ax, ly = ay, lz = az;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const j = s === segs ? 0 : (Math.random() - 0.5) * 0.9;
      const nx = ax + dx * t + px * j, ny = ay + dy * t + (Math.random() - 0.5) * 0.4 * (s < segs), nz = az + dz * t + pz * j;
      const sl = Math.hypot(nx - lx, ny - ly, nz - lz);
      const steps = Math.ceil(sl / 0.09);
      for (let k = 0; k < steps; k++) {
        const u = k / steps;
        P.spawn(lx + (nx - lx) * u, ly + (ny - ly) * u, lz + (nz - lz) * u, 0, 0, 0, life * (0.7 + Math.random() * 0.6), 0.32, c[0], c[1], c[2]);
      }
      lx = nx; ly = ny; lz = nz;
    }
    P.burst(bx, by, bz, 8, 4, c, 0.3, 0.25, 4, 2);
  }

  update(dt) {
    const t = this.game.time;
    for (const pool of this.pools) {
      for (const it of pool.items) {
        if (!it.active) continue;
        it.t += dt;
        const k = it.t / it.dur;
        if (k >= 1) {
          it.active = false;
          it.mesh.visible = false;
          continue;
        }
        const u = it.u;
        switch (it.kind) {
          case 'slash':
            u.uProg.value = Math.min(1.25, k * 1.6);
            u.uFade.value = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
            break;
          case 'ring':
            u.uProg.value = 1 - Math.pow(1 - k, 3);
            u.uFade.value = 1 - k * k;
            break;
          case 'implode':
            u.uProg.value = 1 - k;
            u.uFade.value = Math.min(1, (1 - k) * 3);
            break;
          case 'tele':
            u.uProg.value = k;
            u.uFade.value = 0.6 + 0.4 * Math.sin(t * 30);
            break;
          case 'fire':
            u.uTime.value = t;
            u.uFade.value = Math.min(1, it.t * 5) * Math.min(1, (it.dur - it.t) * 2);
            break;
          case 'glow':
            u.uFade.value = Math.min(1, it.t * 4) * Math.min(1, (it.dur - it.t) * 2);
            break;
        }
      }
    }
  }
}
