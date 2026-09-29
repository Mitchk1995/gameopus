import * as THREE from 'three';
import { WORLD, FARMS, shoreAt, fieldsAt, biomeAt, groundAt } from './map.js';

// Ground plants that are not grass: reeds and cattails in the marsh and at the river's slow bends,
// heather on the heath, bracken on the woodland floor, wheat standing in its field and rows of
// greens in theirs. Like the grass, each kind is one instanced clump laid out once over a square
// that the vertex shader wraps round the player, stands on the heightmap and shows only where the
// baked maps say it grows (shore.png, fields.png, the biome maps). Crops sit on a lattice turned to
// their field's rows. A kind is only drawn when some of it is near.

const Y_UP = new THREE.Vector3(0, 1, 0);

// kind: clump geometry, how many, the side of the wrapped square, the fade-out distance, lattice
// spacing (crops) or null (scattered), and the GLSL that says how much grows at a spot (0..1).
const KINDS = {
  reeds: {
    count: 5200, size: 84, fade: [30, 40], lattice: null,
    mask: `max(sh.g, bA.b * smoothstep(1.1, 0.35, gy) * 0.8) * smoothstep(-0.75, -0.25, gy) * (1.0 - smoothstep(0.1, 0.4, gc.r)) * (1.0 - smoothstep(0.1, 0.4, gc.b))`,
    sway: 0.18, near: (x, z) => shoreAt(x, z)[1] > 0.1 || biomeAt(x, z)[2] > 0.3,
  },
  heather: {
    count: 5200, size: 70, fade: [24, 33], lattice: null, leaf: 'oak', lum: true,
    mask: `smoothstep(0.25, 0.6, bA.g) * (1.0 - smoothstep(0.1, 0.4, gc.r)) * (1.0 - smoothstep(0.1, 0.4, gc.b)) * smoothstep(1.2, 1.8, gy) * smoothstep(0.8, 0.9, gN.y) * (1.0 - bB.b)`,
    sway: 0.03, near: (x, z) => biomeAt(x, z)[1] > 0.2,
  },
  bracken: {
    count: 4500, size: 70, fade: [24, 33], lattice: null, leaf: 'ash',
    mask: `smoothstep(0.35, 0.8, gc.g) * (1.0 - smoothstep(0.1, 0.4, gc.r)) * (1.0 - smoothstep(0.1, 0.4, gc.b)) * (1.0 - bA.b) * smoothstep(1.2, 1.8, gy) * smoothstep(0.82, 0.92, gN.y) * smoothstep(0.4, 0.5, gPatch)`,
    sway: 0.08, near: (x, z) => groundAt(x, z)[1] > 0.3,
  },
  wheat: {
    count: 9000, size: 64, fade: [26, 32], lattice: [0.62, 0.62],
    mask: `smoothstep(0.55, 0.9, fl.r)`,
    sway: 0.14, near: (x, z) => fieldsAt(x, z)[0] > 0.1,
  },
  greens: {
    count: 4200, size: 50, fade: [20, 25], lattice: [0.75, 0.62],
    mask: `smoothstep(0.55, 0.9, fl.g)`,
    sway: 0.02, near: (x, z) => fieldsAt(x, z)[1] > 0.1,
  },
};

export class Plants {
  constructor({ scene, terrain, leaves }) {
    this.time = { value: 0 };
    this.center = { value: new THREE.Vector2() };
    this.kinds = {};
    this.check = 0;
    const rot = FARMS[0].rot;
    for (const [name, k] of Object.entries(KINDS)) {
      const geo = GEOMETRY[name]();
      const inst = new THREE.InstancedBufferGeometry().copy(geo);
      inst.instanceCount = k.count;
      const offs = new Float32Array(k.count * 2), rnd = new Float32Array(k.count * 3);
      let seed = 7 + name.length * 31;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      if (k.lattice) {
        // A regular lattice in the rows' frame, about k.size wide in that frame.
        const nx = Math.floor(k.size / k.lattice[0]), nz = Math.floor(k.size / k.lattice[1]);
        k.count = nx * nz;
        inst.instanceCount = k.count;
        const o2 = new Float32Array(k.count * 2), r2 = new Float32Array(k.count * 3);
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
          const n = j * nx + i;
          o2[n * 2] = i * k.lattice[0] + (r() - 0.5) * 0.08;
          o2[n * 2 + 1] = j * k.lattice[1] + (r() - 0.5) * 0.08;
          r2[n * 3] = r() * Math.PI * 2; r2[n * 3 + 1] = r(); r2[n * 3 + 2] = r();
        }
        k.side = [nx * k.lattice[0], nz * k.lattice[1]];
        inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(o2, 2));
        inst.setAttribute('aRand', new THREE.InstancedBufferAttribute(r2, 3));
      } else {
        const side = Math.ceil(Math.sqrt(k.count)), cell = k.size / side;
        for (let n = 0; n < k.count; n++) {
          offs[n * 2] = ((n % side) + r()) * cell;
          offs[n * 2 + 1] = (Math.floor(n / side) + r()) * cell;
          rnd[n * 3] = r() * Math.PI * 2; rnd[n * 3 + 1] = r(); rnd[n * 3 + 2] = r();
        }
        k.side = [k.size, k.size];
        inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 2));
        inst.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 3));
      }
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.45, vertexColors: true });
      // Each kind patches in its own GLSL (mask, wrap, sway): without its own cache key three.js would
      // hand every kind with the same settings the first kind's compiled program.
      mat.customProgramCacheKey = () => `plants-${name}`;
      if (k.leaf && leaves?.[k.leaf]) Object.assign(mat, { map: leaves[k.leaf], alphaTest: 0.5, color: new THREE.Color(k.lum ? 0xffffff : 0x8c9a66) });
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
          uRowDir: { value: new THREE.Vector2(Math.cos(rot), Math.sin(rot)) },
        });
        const S = (v) => v.toFixed(3);
        const wrap = k.lattice
          ? `// Wrap in the rows' frame so the lattice lines up with the field.
            vec2 lc = vec2(dot(uCenter, vec2(uRowDir.x, -uRowDir.y)), dot(uCenter, vec2(uRowDir.y, uRowDir.x)));
            vec2 side = vec2(${S(k.side[0])}, ${S(k.side[1])});
            vec2 lb = aOffset + floor((lc - aOffset) / side + 0.5) * side;
            vec2 pBase = lb.x * vec2(uRowDir.x, -uRowDir.y) + lb.y * vec2(uRowDir.y, uRowDir.x);`
          : `vec2 pBase = aOffset + floor((uCenter - aOffset) / ${S(k.side[0])} + 0.5) * ${S(k.side[0])};`;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            uniform sampler2D uHeight, uGround, uBioA, uBioB, uShore, uFields;
            uniform float uHalf, uN, uTime;
            uniform vec2 uCenter, uRowDir;
            attribute vec2 aOffset;
            attribute vec3 aRand;
            float pH(vec2 p) { return textureLod(uHeight, (p + uHalf + 0.5) / uN, 0.0).r; }
            float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float pNoise(vec2 p) {
              vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
            }`)
          .replace('#include <beginnormal_vertex>', `
            ${wrap}
            float pDist = length(pBase - uCenter);
            vec2 pUV = pBase / (uHalf * 2.0) + 0.5;
            vec3 gc = textureLod(uGround, pUV, 0.0).rgb;
            vec3 bA = textureLod(uBioA, pUV, 0.0).rgb, bB = textureLod(uBioB, pUV, 0.0).rgb;
            vec3 sh = textureLod(uShore, pUV, 0.0).rgb, fl = textureLod(uFields, pUV, 0.0).rgb;
            float gy = pH(pBase);
            vec3 gN = normalize(vec3(pH(pBase - vec2(1.0, 0.0)) - pH(pBase + vec2(1.0, 0.0)), 2.0, pH(pBase - vec2(0.0, 1.0)) - pH(pBase + vec2(0.0, 1.0))));
            float gPatch = pNoise(pBase * 0.09) * 0.7 + pNoise(pBase * 0.37) * 0.3;
            float grows = ${k.mask};
            float keep = ${k.lattice ? "step(0.08 + aRand.z * 0.84, grows) * step(0.03, aRand.y)" : "step(aRand.z, grows * (0.55 + gPatch * 0.6))"};
            float pScale = keep * (1.0 - smoothstep(${S(k.fade[0])}, ${S(k.fade[1])}, pDist)) * (0.7 + aRand.y * 0.5) * (0.75 + gPatch * 0.4);
            vec3 objectNormal = mix(gN, normal, 0.35);`)
          .replace('#include <begin_vertex>', `
            float pc = cos(aRand.x), ps = sin(aRand.x);
            vec3 transformed = vec3(position.x * pc - position.z * ps, position.y, position.x * ps + position.z * pc) * pScale;
            float bend = position.y * position.y * pScale;
            float gust = sin(uTime * 1.1 + pBase.x * 0.07 + pBase.y * 0.05) * 0.5 + 0.5;
            float wave = sin(uTime * 2.1 + pBase.x * 0.8 + pBase.y * 0.6 + aRand.y * 6.0);
            transformed.xz += vec2(0.8, 0.45) * bend * ${S(k.sway)} * (0.4 + gust * 0.8 + wave * 0.25);
            transformed += vec3(pBase.x, gy - 0.03, pBase.y);`);
        if (k.lum) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb = vColor.rgb * dot(sampledDiffuseColor.rgb, vec3(0.3, 0.55, 0.15)) * 3.2;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
            reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.15;
            reflectedLight.directSpecular *= 0.15;
            reflectedLight.indirectSpecular *= 0.15;`);
      };
      const mesh = new THREE.Mesh(inst, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      mesh.visible = false;
      scene.add(mesh);
      this.kinds[name] = { ...k, mesh, full: k.count };
    }
  }

  // 0..1 share of each kind to draw (follows the grass setting).
  setDensity(f) {
    for (const k of Object.values(this.kinds)) {
      k.mesh.geometry.instanceCount = Math.round(k.full * Math.max(0.35, f));
      k.off = f <= 0;
    }
  }

  update(dt, focus) {
    this.time.value += dt;
    this.center.value.set(focus.x, focus.z);
    // Twice a second, or after a jump: which kinds grow anywhere near? (Sampled round the player
    // out to the fade.)
    this.check -= dt;
    this.last ??= new THREE.Vector2(1e9, 0);
    if (this.check > 0 && Math.hypot(focus.x - this.last.x, focus.z - this.last.y) < 6) return;
    this.check = 0.5;
    this.last.set(focus.x, focus.z);
    for (const k of Object.values(this.kinds)) {
      let any = false;
      const R = k.fade[1];
      for (let i = 0; i < 17 && !any; i++) {
        const a = i * 2.39996, d = i === 0 ? 0 : R * Math.sqrt(i / 16);
        any = k.near(focus.x + Math.cos(a) * d, focus.z + Math.sin(a) * d);
      }
      k.mesh.visible = any && !k.off;
    }
  }
}

// ------------------------------------------------------------------ clumps
// Each builds one clump in local space (y up, standing at the origin) with vertex colours.
const GEOMETRY = {
  reeds: () => clump((b, r) => {
    // A dozen tall blades, some carrying a cattail's brown head.
    for (let i = 0; i < 13; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 0.22;
      const h = 1.2 + r() * 1.0;
      blade(b, Math.cos(a) * d, Math.sin(a) * d, h, 0.016 + r() * 0.01, r() * 6.283, 0.05 + r() * 0.12, [0.045, 0.058, 0.022], [0.1, 0.095, 0.045]);
      if (i < 4) head(b, Math.cos(a) * d, h * 0.82, Math.sin(a) * d, 0.03, 0.2, [0.04, 0.022, 0.011]);
    }
  }, 11),
  heather: () => clump((b, r) => {
    // A low, rounded cushion of little leafy sprigs, dark and woody below, misted purple with flower
    // on top. (Its texture gives only the leaves' shape and shading; the colour is its own.)
    for (let i = 0; i < 32; i++) {
      const a = r() * 6.283, u = Math.sqrt(r());
      const x = Math.cos(a) * u * 0.45, z = Math.sin(a) * u * 0.45, y = 0.04 + (1 - u * u) * 0.22 * (0.8 + r() * 0.4);
      const top = y > 0.13;
      card(b, x, y, z, 0.13 + r() * 0.07, a, 0.95 - u * 0.5, top && r() < 0.8 ? [0.13, 0.05, 0.11] : [0.075, 0.062, 0.04]);
    }
  }, 21),
  bracken: () => clump((b, r) => {
    // Fronds on their stalks, rising and then arching out from the middle.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.283 + r() * 0.5;
      frond(b, a, 0.75 + r() * 0.35, 0.24 + r() * 0.06, [0.45, 0.5, 0.36], [0.72, 0.78, 0.5]);
    }
  }, 31),
  wheat: () => clump((b, r) => {
    // Stalks of ripe wheat with their ears.
    for (let i = 0; i < 10; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 0.34;
      const h = 0.85 + r() * 0.25;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      blade(b, x, z, h, 0.009, r() * 6.283, 0.05, [0.08, 0.06, 0.022], [0.16, 0.11, 0.035]);
      head(b, x + 0.02, h, z, 0.028, 0.13, [0.19, 0.13, 0.042], 3);
    }
  }, 41),
  greens: () => clump((b, r) => {
    // A cabbage: a tight heart in a ring of broad outer leaves.
    const heart = new THREE.IcosahedronGeometry(0.17, 1);
    heart.scale(1, 0.85, 1).translate(0, 0.16, 0);
    add(b, heart, [0.055, 0.085, 0.07]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 + r() * 0.4;
      const leaf = new THREE.CircleGeometry(0.2, 8);
      leaf.scale(1, 1.25, 1).rotateX(-1.15 - r() * 0.25).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.19, 0.08, Math.sin(a) * 0.19);
      add(b, leaf, i % 2 ? [0.035, 0.062, 0.048] : [0.042, 0.07, 0.052]);
    }
  }, 51),
};

function clump(build, seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const b = { pos: [], col: [], idx: [], uv: [] };
  build(b, r);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  // Plant normals lean up, so the clumps light like the ground they stand in.
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)).lerp(Y_UP, 0.6).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// A tapering blade (or stalk) from the ground, leaning a little; colour runs from foot to tip.
function blade(b, x, z, h, w, rot, lean, c0, c1) {
  const base = b.pos.length / 3, segs = 3, c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, width = w * (1 - t * 0.8), fwd = lean * t * t * h;
    for (const side of [-1, 1]) {
      b.pos.push(x + side * width * c - fwd * s, t * h, z + side * width * s + fwd * c);
      b.uv.push(side > 0 ? 1 : 0, t);
      b.col.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2;
    b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

// A small upright head (a cattail's sausage, an ear of wheat): a four-sided spindle.
function head(b, x, y, z, r, h, col, N = 6) {
  // A rounded spindle: N sides, two rings, closed at both ends.
  const base = b.pos.length / 3;
  b.pos.push(x, y, z);
  for (const [t, k] of [[0.18, 0.85], [0.82, 0.85]]) for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    b.pos.push(x + Math.cos(a) * r * k, y + h * t, z + Math.sin(a) * r * k);
  }
  b.pos.push(x, y + h, z);
  for (let i = 0; i < 2 + N * 2; i++) { b.col.push(...col); b.uv.push(0.5, 0.5); }
  for (let i = 0; i < N; i++) {
    const a = base + 1 + i, n = base + 1 + ((i + 1) % N), a2 = a + N, n2 = n + N;
    b.idx.push(base, n, a, a, n, a2, n, n2, a2, a2, n2, base + 1 + N * 2);
  }
}

// A leafy card (textured with a sprig) standing at (x, y, z), turned by a and tilted out by lean.
function card(b, x, y, z, s, a, lean, col) {
  const base = b.pos.length / 3;
  const c = Math.cos(a), sn = Math.sin(a);
  const ox = c * Math.sin(lean) * s, oz = sn * Math.sin(lean) * s, oy = Math.cos(lean) * s;
  for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
    b.pos.push(x - sn * s * 0.6 * u + ox * v, y - s * 0.35 + oy * v, z + c * s * 0.6 * u + oz * v);
    b.col.push(...col);
    b.uv.push((u + 1) / 2, v);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// A bracken frond: a bare stalk rising from the ground, then a leafy blade arching out, broad in the
// middle and narrowing to its tip.
function frond(b, a, len, w, c0, c1) {
  const base = b.pos.length / 3, segs = 8, dx = Math.cos(a), dz = Math.sin(a);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const along = len * 0.85 * Math.pow(t, 1.4), up = len * (1.05 * Math.sin(t * 2.0) - 0.25 * t * t);
    const width = t < 0.3 ? 0.012 : w * Math.sin(Math.PI * Math.min(1, (t - 0.3) / 0.72));
    for (const side of [-1, 1]) {
      b.pos.push(dx * along - dz * width * side, up, dz * along + dx * width * side);
      b.uv.push(side > 0 ? 1 : 0, t);
      b.col.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
    }
  }
  for (let i = 0; i < segs; i++) {
    const q = base + i * 2;
    b.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
  }
}

function add(b, geo, col) {
  const g = geo.index ? geo : geo;
  const base = b.pos.length / 3, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { b.pos.push(p.getX(i), p.getY(i), p.getZ(i)); b.col.push(...col); b.uv.push(0.5, 0.5); }
  if (g.index) for (const i of g.index.array) b.idx.push(base + i);
  else for (let i = 0; i < p.count; i++) b.idx.push(base + i);
}
