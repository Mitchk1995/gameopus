import * as THREE from 'three';
import { WORLD } from './map.js';
import { fetchBinary } from '../engine/assets.js';

// Terrain: a baked 1 m heightmap drawn as 64 m patches that are displaced on the GPU,
// with coarser patches farther away. Lighting normals come from the heightmap per
// pixel, so far hills keep their shape even on coarse patches. The surface blends
// eight photoscanned materials: grass (base), forest floor, path and cobble (painted,
// baked into ground.png), sand (near water), stony ground (hillsides), cliff (steep
// faces, projected from three sides) and snow (high peaks).

const N = WORLD.size + 1;
const CHUNK = 64;
const LAYERS = ['grass', 'forest', 'rock', 'path', 'cobble', 'sand', 'cliff', 'snow'];
const TILE = [3.2, 3.6, 5.0, 3.2, 2.6, 4.0, 11.0, 24.0];

export class Terrain {
  constructor({ scene, assets, renderer }) {
    this.scene = scene;
    this.assets = assets;
    this.renderer = renderer;
    this.chunks = [];
  }

  async load() {
    const [buf, ground, albedo, nr] = await Promise.all([
      fetchBinary('world/height.bin'),
      this.assets.texture('world/ground.png', { srgb: false, repeat: false, anisotropy: 4 }),
      Promise.all(LAYERS.map((l) => this.assets.image(`ground/${l}_a.webp`))),
      Promise.all(LAYERS.map((l) => this.assets.image(`ground/${l}_nr.webp`))),
    ]);
    const cm = new Int16Array(buf);
    this.heights = new Float32Array(cm.length);
    const half = new Uint16Array(cm.length);
    for (let i = 0; i < cm.length; i++) {
      this.heights[i] = cm[i] / 100;
      half[i] = THREE.DataUtils.toHalfFloat(this.heights[i]);
    }
    const heightTex = new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType);
    heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
    heightTex.needsUpdate = true;
    this.heightTex = heightTex;

    // The bake writes row 0 at the north edge (z = -half), which is v = 0 here.
    ground.flipY = false;
    ground.generateMipmaps = true;
    this.groundTex = ground;
    this.material = this.#material(heightTex, ground, arrayTexture(albedo, true), arrayTexture(nr, false));
    this.#buildChunks();
    return this;
  }

  // Height of the ground at a world position (bilinear, metres).
  heightAt(x, z) {
    const fx = Math.min(N - 1.001, Math.max(0, x + WORLD.half)), fz = Math.min(N - 1.001, Math.max(0, z + WORLD.half));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const h = this.heights, k = j * N + i;
    return h[k] + (h[k + 1] - h[k]) * tx + (h[k + N] - h[k]) * tz + (h[k] - h[k + 1] - h[k + N] + h[k + N + 1]) * tx * tz;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    return out.set(this.heightAt(x - 1, z) - this.heightAt(x + 1, z), 2, this.heightAt(x, z - 1) - this.heightAt(x, z + 1)).normalize();
  }

  // Picks a level of detail per patch and culls patches outside the view.
  update(camera) {
    camera.updateMatrixWorld();
    this.frustum ??= new THREE.Frustum();
    this.pv ??= new THREE.Matrix4();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const cx = camera.position.x, cz = camera.position.z;
    for (const c of this.chunks) {
      c.mesh.visible = this.frustum.intersectsBox(c.box);
      if (!c.mesh.visible) continue;
      const d = Math.hypot(c.cx - cx, c.cz - cz);
      const lod = d < 110 ? 0 : d < 230 ? 1 : d < 420 ? 2 : 3;
      if (lod !== c.lod) {
        c.lod = lod;
        c.mesh.geometry = this.patches[lod];
      }
    }
  }

  #buildChunks() {
    this.patches = [64, 32, 16, 8].map((segs) => patchGeometry(segs));
    const count = Math.ceil(WORLD.size / CHUNK);
    for (let j = 0; j < count; j++)
      for (let i = 0; i < count; i++) {
        const x0 = -WORLD.half + i * CHUNK, z0 = -WORLD.half + j * CHUNK;
        let lo = Infinity, hi = -Infinity;
        for (let z = z0; z <= Math.min(z0 + CHUNK, WORLD.half); z += 4)
          for (let x = x0; x <= Math.min(x0 + CHUNK, WORLD.half); x += 4) {
            const h = this.heightAt(x, z);
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
        const mesh = new THREE.Mesh(this.patches[3], this.material);
        mesh.position.set(x0, 0, z0);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.scene.add(mesh);
        this.chunks.push({ mesh, lod: 3, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, box: new THREE.Box3(new THREE.Vector3(x0, lo - 5, z0), new THREE.Vector3(x0 + CHUNK, hi + 1, z0 + CHUNK)) });
      }
  }

  #material(heightTex, ground, albedo, nr) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    const uniforms = {
      uHeight: { value: heightTex },
      uGround: { value: ground },
      uAlb: { value: albedo },
      uNrm: { value: nr },
      uHalf: { value: WORLD.half },
      uN: { value: N },
      uTile: { value: TILE.map((t) => 1 / t) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uHeight;
          uniform float uHalf, uN;
          attribute float aSkirt;
          varying vec3 vWPos;
          varying vec3 vWNrm;
          float tHeight(vec2 p) { return textureLod(uHeight, (p + uHalf + 0.5) / uN, 0.0).r; }`)
        .replace('#include <beginnormal_vertex>', `
          vec2 tXZ = (modelMatrix * vec4(position, 1.0)).xz;
          float tH = tHeight(tXZ);
          vec3 objectNormal = normalize(vec3(tHeight(tXZ - vec2(1.0, 0.0)) - tHeight(tXZ + vec2(1.0, 0.0)), 2.0,
                                             tHeight(tXZ - vec2(0.0, 1.0)) - tHeight(tXZ + vec2(0.0, 1.0))));
          vWNrm = objectNormal;`)
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position.x, tH - aSkirt * 4.0, position.z);
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uGround;
          uniform highp sampler2DArray uAlb;
          uniform highp sampler2DArray uNrm;
          uniform float uHalf, uN, uTile[8];
          uniform sampler2D uHeight;
          float tH(vec2 p) { return texture2D(uHeight, (p + uHalf + 0.5) / uN).r; }
          varying vec3 vWPos;
          varying vec3 vWNrm;
          float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float tNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          // One material layer: two scales blended to hide tiling. Derivatives are passed
          // in because they must be taken outside the branch that skips unused layers.
          const mat2 tRot = mat2(0.8, -0.6, 0.6, 0.8);
          void tSample(int layer, vec2 p, vec2 dx, vec2 dy, float mixK, inout vec3 alb, inout vec3 nr, float w) {
            if (w < 0.004) return;
            float s = uTile[layer];
            vec2 uv1 = p * s;
            vec2 uv2 = tRot * p * s * 0.37 + 0.31;
            vec2 dx1 = dx * s, dy1 = dy * s, dx2 = tRot * dx * s * 0.37, dy2 = tRot * dy * s * 0.37;
            vec3 a1 = textureGrad(uAlb, vec3(uv1, float(layer)), dx1, dy1).rgb;
            vec3 a2 = textureGrad(uAlb, vec3(uv2, float(layer)), dx2, dy2).rgb;
            vec3 n1 = textureGrad(uNrm, vec3(uv1, float(layer)), dx1, dy1).rgb;
            vec3 n2 = textureGrad(uNrm, vec3(uv2, float(layer)), dx2, dy2).rgb;
            alb += mix(a1, a2, mixK) * w;
            nr += mix(n1, n2, mixK) * w;
          }`)
        .replace('#include <map_fragment>', `
          vec3 tp = vWPos;
          vec3 tdx = dFdx(tp), tdy = dFdy(tp);
          // Per-pixel normal from the heightmap, sampled wider when far to avoid shimmer.
          float tE = clamp(max(length(tdx), length(tdy)) * 1.5, 1.0, 6.0);
          vec3 tn = normalize(vec3(tH(tp.xz - vec2(tE, 0.0)) - tH(tp.xz + vec2(tE, 0.0)), 2.0 * tE,
                                   tH(tp.xz - vec2(0.0, tE)) - tH(tp.xz + vec2(0.0, tE))));
          vec3 cover = texture2D(uGround, tp.xz / (uHalf * 2.0) + 0.5).rgb;
          float macro = tNoise(tp.xz * 0.018) * 0.65 + tNoise(tp.xz * 0.07) * 0.35;
          float mixK = clamp(0.5 + (tNoise(tp.xz * 0.05 + 7.0) - 0.5) * 1.4, 0.0, 1.0);
          float slope = 1.0 - tn.y;
          float wobble = (macro - 0.5);
          float wRock = max(smoothstep(0.12, 0.24, slope + wobble * 0.1), smoothstep(20.0, 40.0, tp.y + wobble * 16.0) * smoothstep(0.05, 0.15, slope + 0.04));
          float wCliff = smoothstep(0.3, 0.46, slope + wobble * 0.12);
          float wSnow = smoothstep(74.0, 96.0, tp.y + wobble * 34.0) * smoothstep(0.66, 0.4, slope + wobble * 0.1);
          float wSand = smoothstep(1.35, 0.45, tp.y + wobble * 0.9);
          float w[8];
          for (int m = 0; m < 8; m++) w[m] = 0.0;
          w[0] = 1.0;
          float layerT[8];
          layerT[1] = smoothstep(0.1, 0.7, cover.g + wobble * 0.3);
          layerT[5] = wSand;
          layerT[3] = smoothstep(0.2, 0.75, cover.r);
          layerT[4] = smoothstep(0.2, 0.7, cover.b);
          layerT[2] = wRock * (1.0 - layerT[4]);
          layerT[6] = wCliff;
          layerT[7] = wSnow;
          int order[7] = int[7](1, 5, 3, 4, 2, 6, 7);
          for (int k = 0; k < 7; k++) {
            int L = order[k];
            float t = layerT[L];
            for (int m = 0; m < 8; m++) w[m] *= 1.0 - t;
            w[L] += t;
          }
          vec3 tAlb = vec3(0.0), tNr = vec3(0.0);
          for (int L = 1; L < 6; L++) if (L != 2) tSample(L, tp.xz, tdx.xz, tdy.xz, mixK, tAlb, tNr, w[L]);
          if (w[2] > 0.004) {
            // Stony ground loses its grass higher up.
            vec3 sa = vec3(0.0), sn = vec3(0.0);
            tSample(2, tp.xz, tdx.xz, tdy.xz, mixK, sa, sn, 1.0);
            float sl = dot(sa, vec3(0.3, 0.55, 0.15));
            sa = mix(sa, vec3(sl) * vec3(1.05, 0.98, 0.9), smoothstep(26.0, 60.0, tp.y) * 0.7);
            tAlb += sa * w[2];
            tNr += sn * w[2];
          }
          if (w[0] > 0.004) {
            // Grass: deep green with drier, yellower meadows here and there.
            vec3 ga = vec3(0.0), gn = vec3(0.0);
            tSample(0, tp.xz, tdx.xz, tdy.xz, mixK, ga, gn, 1.0);
            float lum = dot(ga, vec3(0.3, 0.55, 0.15));
            float dry = smoothstep(0.38, 0.78, tNoise(tp.xz * 0.011 + 3.0) * 0.7 + tNoise(tp.xz * 0.045) * 0.3);
            vec3 lush = mix(vec3(0.065, 0.14, 0.028), vec3(0.15, 0.16, 0.055), dry) * (0.55 + lum * 2.2);
            tAlb += mix(ga, lush, 0.62) * w[0];
            tNr += gn * w[0];
          }
          if (w[6] > 0.004) {
            // Cliffs are projected from the sides as well, so steep faces don't smear.
            vec3 bw = pow(abs(tn), vec3(4.0));
            bw /= bw.x + bw.y + bw.z;
            vec3 ra = vec3(0.0), rn = vec3(0.0);
            tSample(6, tp.xz, tdx.xz, tdy.xz, mixK, ra, rn, bw.y);
            tSample(6, tp.zy, tdx.zy, tdy.zy, mixK, ra, rn, bw.x);
            tSample(6, tp.xy, tdx.xy, tdy.xy, mixK, ra, rn, bw.z);
            // Grey granite rather than the scan's sandstone.
            float rl = dot(ra, vec3(0.3, 0.55, 0.15));
            ra = mix(vec3(rl), ra, 0.3) * vec3(0.95, 0.97, 1.02);
            ra = pow(ra, vec3(1.15)) * 0.95;
            tAlb += ra * w[6];
            tNr += rn * w[6];
          }
          if (w[7] > 0.004) {
            // Snow stays mostly white; the scan only adds a little texture.
            vec3 sa = vec3(0.0), sn = vec3(0.0);
            tSample(7, tp.xz, tdx.xz, tdy.xz, mixK, sa, sn, 1.0);
            tAlb += mix(vec3(0.8, 0.84, 0.9), sa * 1.25, 0.3) * w[7];
            tNr += sn * w[7];
          }
          tAlb *= 0.84 + macro * 0.32;
          diffuseColor.rgb *= tAlb;
          float tRough = tNr.b;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(tRough, 0.35, 1.0);')
        .replace('#include <normal_fragment_maps>', `
          vec2 nxy = tNr.rg * 2.0 - 1.0;
          vec3 tsn = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
          vec3 T = normalize(vec3(1.0, 0.0, 0.0) - tn * tn.x);
          vec3 B = normalize(vec3(0.0, 0.0, 1.0) - tn * tn.z);
          vec3 wN = normalize(T * tsn.x * 0.9 + B * tsn.y * 0.9 + tn * tsn.z);
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`);
    };
    return mat;
  }
}

// A flat 64 m patch in XZ with a downturned skirt that hides seams between detail levels.
function patchGeometry(segs) {
  const pos = [], skirt = [], idx = [];
  const step = CHUNK / segs, row = segs + 1;
  for (let j = 0; j <= segs; j++)
    for (let i = 0; i <= segs; i++) {
      pos.push(i * step, 0, j * step);
      skirt.push(0);
    }
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const ring = [];
  for (let i = 0; i <= segs; i++) ring.push(i);
  for (let j = 1; j <= segs; j++) ring.push(j * row + segs);
  for (let i = segs - 1; i >= 0; i--) ring.push(segs * row + i);
  for (let j = segs - 1; j >= 1; j--) ring.push(j * row);
  const base = pos.length / 3;
  for (const r of ring) {
    pos.push(pos[r * 3], 0, pos[r * 3 + 2]);
    skirt.push(1);
  }
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length], sa = base + k, sb = base + ((k + 1) % ring.length);
    idx.push(a, b, sa, b, sb, sa);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  g.setAttribute('aSkirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setIndex(idx);
  return g;
}

// Stacks same-sized images into a mipmapped texture array.
function arrayTexture(images, srgb) {
  const size = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * images.length);
  images.forEach((img, i) => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const t = new THREE.DataArrayTexture(data, size, size, images.length);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
