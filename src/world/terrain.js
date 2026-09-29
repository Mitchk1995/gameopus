import * as THREE from 'three';
import { WORLD, FARMS } from './map.js';
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
// Headings of the rows in the Farms' fields and in the flax field.
const FIELD_ROT = FARMS[0].rot, FLAX_ROT = FARMS[1].rot;

export class Terrain {
  constructor({ scene, assets, renderer }) {
    this.scene = scene;
    this.assets = assets;
    this.renderer = renderer;
    this.chunks = [];
  }

  async load() {
    const [buf, ground, biomeA, biomeB, shore, fields, flow, albedo, nr] = await Promise.all([
      fetchBinary('world/height.bin'),
      this.assets.texture('world/ground.png', { srgb: false, repeat: false, anisotropy: 4 }),
      this.assets.texture('world/biome_a.png', { srgb: false, repeat: false, anisotropy: 1 }),
      this.assets.texture('world/biome_b.png', { srgb: false, repeat: false, anisotropy: 1 }),
      this.assets.texture('world/shore.png', { srgb: false, repeat: false, anisotropy: 1 }),
      this.assets.texture('world/fields.png', { srgb: false, repeat: false, anisotropy: 4 }),
      this.assets.texture('world/flow.png', { srgb: false, repeat: false, anisotropy: 1 }),
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
    for (const t of [ground, biomeA, biomeB, shore, fields, flow]) {
      t.flipY = false;
      t.generateMipmaps = true;
    }
    this.groundTex = ground;
    // Biome weights (meadow, heath, marsh / dry scrub, woodland moss, mine dust and scree), the shore
    // (sand and gravel, reeds, flax), the fields (wheat, greens, plough) and the water's current:
    // all painted by the bake from map.js.
    this.biomeA = biomeA;
    this.biomeB = biomeB;
    this.shoreTex = shore;
    this.fieldsTex = fields;
    this.flowTex = flow;
    this.material = this.#material(heightTex, ground, biomeA, biomeB, arrayTexture(albedo, true), arrayTexture(nr, false));
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

  #material(heightTex, ground, biomeA, biomeB, albedo, nr) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    const uniforms = {
      uHeight: { value: heightTex },
      uGround: { value: ground },
      uBiomeA: { value: biomeA },
      uBiomeB: { value: biomeB },
      uShore: { value: this.shoreTex },
      uFields: { value: this.fieldsTex },
      uAlb: { value: albedo },
      uNrm: { value: nr },
      uHalf: { value: WORLD.half },
      uN: { value: N },
      uTile: { value: TILE.map((t) => 1 / t) },
      // The fields' rows run along their long side: the farms' and the flax field's headings.
      uRows: { value: new THREE.Vector4(Math.cos(FIELD_ROT), Math.sin(FIELD_ROT), Math.cos(FLAX_ROT), Math.sin(FLAX_ROT)) },
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
          uniform sampler2D uGround, uBiomeA, uBiomeB, uShore, uFields;
          uniform highp sampler2DArray uAlb;
          uniform highp sampler2DArray uNrm;
          uniform float uHalf, uN, uTile[8];
          uniform vec4 uRows;
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
          }
          float tLum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
          // Stripes across a heading, faded out once they are finer than a few pixels.
          float tRowsAt(vec2 p, vec2 dir, float spacing, float px, out float fade) {
            float u = (p.x * dir.x - p.y * dir.y) / spacing;
            fade = smoothstep(0.45, 0.12, px / spacing);
            return 0.5 + 0.5 * cos(u * 6.2832);
          }`)
        .replace('#include <map_fragment>', `
          vec3 tp = vWPos;
          vec3 tdx = dFdx(tp), tdy = dFdy(tp);
          float tPx = max(length(tdx), length(tdy));
          // Per-pixel normal from the heightmap, sampled wider when far to avoid shimmer.
          float tE = clamp(tPx * 1.5, 1.0, 6.0);
          vec3 tn = normalize(vec3(tH(tp.xz - vec2(tE, 0.0)) - tH(tp.xz + vec2(tE, 0.0)), 2.0 * tE,
                                   tH(tp.xz - vec2(0.0, tE)) - tH(tp.xz + vec2(0.0, tE))));
          vec2 tUV = tp.xz / (uHalf * 2.0) + 0.5;
          vec3 cover = texture2D(uGround, tUV).rgb;
          // Biomes: A = meadow, rocky heath, marsh; B = dry scrub, woodland moss, mine spoil and scree.
          vec3 bioA = texture2D(uBiomeA, tUV).rgb;
          vec3 bioB = texture2D(uBiomeB, tUV).rgb;
          // Shore: sand and gravel bars, reeds, the flax field. Fields: wheat, greens, ploughland.
          vec3 shore = texture2D(uShore, tUV).rgb;
          vec3 crop = texture2D(uFields, tUV).rgb;
          float macro = tNoise(tp.xz * 0.018) * 0.65 + tNoise(tp.xz * 0.07) * 0.35;
          float mixK = clamp(0.5 + (tNoise(tp.xz * 0.05 + 7.0) - 0.5) * 1.4, 0.0, 1.0);
          float slope = 1.0 - tn.y;
          float wobble = (macro - 0.5);
          // High ground goes stony, except in the meadows (Abbey Hill is grass to the top).
          float altRock = smoothstep(22.0, 44.0, tp.y + wobble * 16.0) * smoothstep(0.05, 0.15, slope + 0.04) * (1.0 - bioA.r * 0.85);
          float wRock = max(smoothstep(0.13, 0.26, slope + wobble * 0.1), altRock);
          float wCliff = smoothstep(0.3, 0.46, slope + wobble * 0.12);
          // Snow lies only high up, and only where it can settle.
          float wSnow = smoothstep(108.0, 136.0, tp.y + wobble * 34.0) * smoothstep(0.6, 0.34, slope + wobble * 0.12);
          // Sand and gravel: the bars and beaches, a wet margin at the water's edge, and the beds.
          float wSand = max(shore.r * smoothstep(1.6, 0.5, tp.y), smoothstep(0.32, -0.3, tp.y + wobble * 0.35));
          // Tilled ground in the fields (the crops themselves are drawn over it).
          float soil = max(max(crop.b, crop.g * 0.9), max(crop.r * 0.75, shore.b * 0.85));
          float w[8];
          for (int m = 0; m < 8; m++) w[m] = 0.0;
          w[0] = 1.0;
          float layerT[8];
          layerT[1] = smoothstep(0.1, 0.7, cover.g + wobble * 0.3);
          layerT[5] = wSand * (1.0 - soil);
          float road = smoothstep(0.2, 0.75, cover.r);
          layerT[3] = max(road, soil);
          layerT[4] = smoothstep(0.2, 0.7, cover.b);
          // Heath and mine spoil are patchy stone; the road stays a road.
          float stony = max(bioA.g * smoothstep(0.32, 0.6, macro + (tNoise(tp.xz * 0.4) - 0.5) * 0.55), bioB.b * smoothstep(0.15, 0.5, bioB.b + (tNoise(tp.xz * 0.16) - 0.5) * 0.4));
          layerT[2] = max(wRock, stony * (1.0 - layerT[3])) * (1.0 - layerT[4]) * (1.0 - soil);
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
          tSample(4, tp.xz, tdx.xz, tdy.xz, mixK, tAlb, tNr, w[4]);
          float fine = tNoise(tp.xz * 0.9) * 0.5 + tNoise(tp.xz * 3.1) * 0.5;
          if (w[1] > 0.004) {
            // Forest floor: dark leaf litter and soil, with cushions of moss (the stony-grass scan
            // stands in for moss) where the woods are old and damp.
            vec3 fa = vec3(0.0), fn = vec3(0.0), ma = vec3(0.0), mn = vec3(0.0);
            tSample(1, tp.xz, tdx.xz, tdy.xz, mixK, fa, fn, 1.0);
            tSample(2, tp.xz * 1.3, tdx.xz * 1.3, tdy.xz * 1.3, mixK, ma, mn, 1.0);
            float fl = tLum(fa) / 0.1;
            vec3 litter = mix(vec3(0.036, 0.024, 0.013), vec3(0.058, 0.038, 0.02), tNoise(tp.xz * 0.21)) * mix(1.0, fl, 0.8);
            float mossK = smoothstep(0.42, 0.66, tNoise(tp.xz * 0.11 + 4.0) * 0.6 + tNoise(tp.xz * 0.47) * 0.4 + bioB.g * 0.22 - bioB.r * 0.3);
            vec3 moss = mix(vec3(0.017, 0.032, 0.009), vec3(0.032, 0.05, 0.013), fine) * mix(1.0, tLum(ma) / 0.12, 0.7);
            tAlb += mix(litter, moss, mossK) * w[1];
            tNr += mix(fn, mn, mossK) * w[1];
          }
          if (w[5] > 0.004) {
            // River gravel and sand: grey-brown pebbles, paler sand, darker where it is wet.
            vec3 sa = vec3(0.0), sn = vec3(0.0);
            tSample(5, tp.xz, tdx.xz, tdy.xz, mixK, sa, sn, 1.0);
            float sl = tLum(sa) / 0.17;
            vec3 gravel = mix(vec3(0.075, 0.07, 0.062), vec3(0.115, 0.098, 0.074), tNoise(tp.xz * 0.35 + 2.0)) * mix(1.0, sl, 0.8);
            gravel *= mix(0.55, 1.0, smoothstep(-0.05, 0.45, tp.y));
            tAlb += gravel * w[5];
            tNr += sn * w[5];
          }
          if (w[3] > 0.004) {
            // Earth: the roads and tracks, and the fields' tilled soil.
            vec3 pa = vec3(0.0), pn = vec3(0.0);
            tSample(3, tp.xz, tdx.xz, tdy.xz, mixK, pa, pn, 1.0);
            float fieldK = soil * (1.0 - road);
            vec3 earth = pa * mix(vec3(0.8, 0.74, 0.68), vec3(0.2, 0.15, 0.125) * (0.7 + 0.6 * fine), fieldK);
            // Rows: ploughed ridges and furrows, green rows of crops, flax, stubble under the wheat.
            float fadeA, fadeB;
            vec2 dirF = uRows.xy, dirX = uRows.zw;
            float furrow = tRowsAt(tp.xz, dirF, 0.9, tPx, fadeA);
            float greenRow = tRowsAt(tp.xz, dirF, 0.75, tPx, fadeA);
            float flaxRow = tRowsAt(tp.xz, dirX, 0.62, tPx, fadeB);
            earth *= mix(1.0, 0.72 + 0.5 * furrow, crop.b * fadeA * (1.0 - road));
            vec3 greens = mix(vec3(0.02, 0.045, 0.012), vec3(0.035, 0.07, 0.018), fine);
            // Near, the soil shows between the rows the plants stand in; far off the rows blur to green.
            earth = mix(earth, greens, crop.g * (1.0 - road) * mix(0.55, 0.12 * fine, fadeA));
            vec3 wheat = mix(vec3(0.12, 0.08, 0.024), vec3(0.17, 0.115, 0.034), tNoise(tp.xz * 0.5) * 0.6 + fine * 0.4);
            earth = mix(earth, wheat, crop.r * (1.0 - road) * 0.92);
            vec3 flaxc = mix(vec3(0.03, 0.055, 0.03), vec3(0.05, 0.075, 0.06), fine);
            earth = mix(earth, flaxc, shore.b * (1.0 - road) * mix(0.6, smoothstep(0.3, 0.8, flaxRow), fadeB));
            tAlb += earth * w[3];
            // Ridges catch the light: bend the normal across the furrows.
            vec3 pn2 = pn;
            pn2.xy += vec2(dirF.x, -dirF.y) * sin((tp.x * dirF.x - tp.z * dirF.y) / 0.9 * 6.2832) * 0.28 * crop.b * fadeA * (1.0 - road);
            tNr += pn2 * w[3];
          }
          if (w[2] > 0.004) {
            // Stony ground loses its grass higher up; on the heath it is grey, lichened stone.
            vec3 sa = vec3(0.0), sn = vec3(0.0);
            tSample(2, tp.xz, tdx.xz, tdy.xz, mixK, sa, sn, 1.0);
            float sl = tLum(sa);
            sa = mix(sa, vec3(sl) * vec3(1.05, 0.98, 0.9), smoothstep(26.0, 60.0, tp.y) * 0.7);
            sa = mix(sa, vec3(sl) * vec3(0.95, 0.94, 0.9) * 1.1, bioA.g * 0.55);
            sa = mix(sa, vec3(sl) * vec3(0.92, 0.9, 0.88), bioB.b * 0.6);
            tAlb += sa * w[2];
            tNr += sn * w[2];
          }
          float flowers = 0.0;
          if (w[0] > 0.004) {
            // Grass, coloured by where it grows. The scan gives the blades and their shading; the
            // colour comes from the biome: fresh meadow and pasture greens, golden-brown dry grass in
            // bandit country, heather browns and purples on the heath, dark olive in the marsh.
            vec3 ga = vec3(0.0), gn = vec3(0.0);
            tSample(0, tp.xz, tdx.xz, tdy.xz, mixK, ga, gn, 1.0);
            float gl = tLum(ga) / 0.178;
            float lush = tNoise(tp.xz * 0.011 + 3.0) * 0.7 + tNoise(tp.xz * 0.045) * 0.3;
            vec3 green = mix(vec3(0.048, 0.07, 0.018), vec3(0.078, 0.078, 0.024), smoothstep(0.35, 0.8, lush));
            // Meadow and pasture: rich greens, yellower where it is drier, bluer in the damp.
            vec3 meadow = mix(vec3(0.052, 0.078, 0.019), vec3(0.085, 0.085, 0.026), smoothstep(0.3, 0.75, lush + (fine - 0.5) * 0.35));
            meadow = mix(meadow, vec3(0.036, 0.062, 0.02), smoothstep(0.6, 0.2, lush) * 0.45);
            green = mix(green, meadow, bioA.r * 0.85);
            // Dry scrub: golden and tawny grass with greyer tufts; never white.
            vec3 dry = mix(vec3(0.105, 0.06, 0.02), vec3(0.15, 0.092, 0.028), smoothstep(0.3, 0.8, lush + (fine - 0.5) * 0.5));
            dry = mix(dry, vec3(0.085, 0.064, 0.036), smoothstep(0.55, 0.85, fine) * 0.45);
            green = mix(green, dry, bioB.r * 0.92);
            // The marsh: dark and wet.
            green = mix(green, vec3(0.028, 0.038, 0.016), bioA.b * 0.8);
            // Heath: heather browns with purple drifts.
            vec3 heather = mix(vec3(0.06, 0.05, 0.04), vec3(0.058, 0.034, 0.048), smoothstep(0.5, 0.78, tNoise(tp.xz * 0.08 + 9.0)));
            green = mix(green, heather, bioA.g * 0.75);
            // Woodland edges: darker, mossier grass.
            green = mix(green, vec3(0.028, 0.05, 0.014), bioB.g * 0.5);
            // The scan's own hue (greenish) is let through in the meadows, not in the straw of the scrub.
            vec3 grass = green * mix(vec3(1.0), mix(vec3(gl), ga / vec3(0.235, 0.174, 0.079), 0.45 * (1.0 - bioB.r * 0.8)), 0.8);
            tAlb += max(grass, vec3(0.0)) * w[0];
            tNr += gn * w[0];
            // Wild flowers: little round heads in drifts through the meadow grass, drawn while a head is
            // big enough on screen to read; farther off only their colour lingers in the grass.
            float fk = w[0] * clamp(bioA.r * 1.1 + 0.08 - bioB.r * 0.5 - bioA.g * 0.4 - bioA.b * 0.5, 0.0, 1.0);
            if (fk > 0.02) {
              vec2 fp = tp.xz * 3.0;
              vec2 fc = floor(fp), ff = fract(fp) - 0.5;
              float drift = smoothstep(0.45, 0.72, tNoise(tp.xz * 0.05 + 3.0) * 0.7 + tNoise(tp.xz * 0.21 + 1.0) * 0.3);
              float present = step(1.0 - (0.14 * drift * drift + 0.004), tHash(fc));
              vec2 off = vec2(tHash(fc + 1.7), tHash(fc + 5.3)) - 0.5;
              vec2 fd = ff - off * 0.55;
              float fa = atan(fd.y, fd.x) + tHash(fc + 2.2) * 6.28;
              float r = 0.07 + 0.07 * tHash(fc + 9.1);
              float petals = r * (0.72 + 0.28 * cos(fa * 5.0));
              float aa = tPx * 3.0 + 0.02;
              float fl = length(fd);
              float disc = 1.0 - smoothstep(petals - aa, petals + aa, fl);
              float eye = 1.0 - smoothstep(r * 0.28 - aa, r * 0.28 + aa, fl);
              float kind = tHash(fc + 3.3);
              // Buttercups, daisies (a yellow eye), clover, speedwell and cranesbill; petals darker at the base.
              vec3 fcol = kind < 0.32 ? vec3(0.4, 0.3, 0.03) : kind < 0.55 ? vec3(0.4, 0.4, 0.37) : kind < 0.75 ? vec3(0.19, 0.07, 0.15) : kind < 0.88 ? vec3(0.08, 0.12, 0.3) : vec3(0.27, 0.1, 0.2);
              fcol *= 0.75 + 0.25 * smoothstep(0.0, petals, fl);
              fcol = mix(fcol, kind < 0.55 && kind >= 0.32 ? vec3(0.38, 0.28, 0.02) : fcol * 0.55, eye);
              float near = smoothstep(0.08, 0.03, tPx);
              tAlb = mix(tAlb, fcol, present * disc * near * fk);
              flowers = present * disc * near * fk;
            }
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
            float rl = tLum(ra);
            ra = mix(vec3(rl), ra, 0.22) * vec3(0.95, 0.97, 1.02);
            ra = pow(ra, vec3(1.12)) * 0.78;
            // Strata: pale and dark beds running along the face, warped so they never run ruler-straight.
            float bed = tp.y * 0.34 + tNoise(tp.xz * 0.035) * 3.0 + (tp.x * 0.02 + tp.z * 0.012);
            float strata = 0.78 + 0.34 * tNoise(vec2(bed, (tp.x - tp.z) * 0.015)) + 0.12 * (tNoise(vec2(bed * 3.1, tp.x * 0.05)) - 0.5);
            ra *= strata;
            // Weathering: dark streaks where water runs down, lichen and moss on the lower rock.
            float streak = tNoise(vec2((tp.x + tp.z) * 0.33, tp.y * 0.02)) * tNoise(vec2((tp.x - tp.z) * 0.9, tp.y * 0.05));
            ra *= 1.0 - smoothstep(0.3, 0.7, streak) * 0.35;
            float lichen = smoothstep(0.62, 0.8, tNoise(tp.xz * 0.23 + tp.y * 0.1)) * smoothstep(110.0, 40.0, tp.y);
            ra = mix(ra, vec3(0.2, 0.19, 0.12), lichen * 0.35);
            float mossy = smoothstep(0.6, 0.35, slope) * smoothstep(60.0, 12.0, tp.y) * smoothstep(0.4, 0.7, tNoise(tp.xz * 0.12));
            ra = mix(ra, vec3(0.045, 0.06, 0.025), mossy * 0.5);
            tAlb += ra * w[6];
            tNr += rn * w[6];
          }
          if (w[7] > 0.004) {
            // Snow stays mostly white; the scan only adds a little texture.
            vec3 sa = vec3(0.0), sn = vec3(0.0);
            tSample(7, tp.xz, tdx.xz, tdy.xz, mixK, sa, sn, 1.0);
            tAlb += mix(vec3(0.78, 0.82, 0.88), sa * 1.2, 0.3) * w[7];
            tNr += sn * w[7];
          }
          tAlb *= 0.86 + macro * 0.28;
          // The mood of each ring in the ground: mossy woods, dusty bandit country, sooty mine hill.
          tAlb *= mix(vec3(1.0), vec3(0.86, 0.96, 0.88), bioB.g * (1.0 - w[1]));
          tAlb *= mix(vec3(1.0), vec3(0.88, 0.86, 0.84), bioB.b * 0.5);
          diffuseColor.rgb *= tAlb;
          float tRough = mix(tNr.b, 0.5, bioA.b * 0.8);
          // Grass and leaf litter hardly shine; wet stone and the water's edge do. (Full specular at a low,
          // grazing view is what bleached the meadows to white.)
          float tSpec = w[0] * 0.28 + w[1] * 0.25 + w[2] * 0.45 + w[3] * 0.45 + w[4] * 0.8 + w[5] * mix(0.9, 0.45, smoothstep(0.1, 0.6, tp.y)) + w[6] * 0.55 + w[7] * 0.8;
          tRough = mix(tRough, 0.55, smoothstep(0.3, -0.1, tp.y));`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(tRough, 0.35, 1.0);')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.directSpecular *= tSpec;
          reflectedLight.indirectSpecular *= tSpec;`)
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
