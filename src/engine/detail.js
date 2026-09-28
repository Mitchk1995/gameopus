import * as THREE from 'three';

// Fine surface detail for the GLB materials (village kit, props, people, monsters).
//
// The source textures are hand-painted and some of them are almost flat: the plaster is
// one cream (colour varies by about 2%), skin and cloth have tiny normal maps. Up close
// they read as coloured plastic. This adds three things to any material that has a normal
// map, all from one small shared noise texture, so it costs one to four extra texture reads:
//   * a fine grain that darkens and lightens the colour a little and roughens the surface,
//   * tiny bumps folded into the existing normal map, so light catches the surface,
//   * a slow mottling (stains, uneven paint) that keeps big flat walls from looking cloned.
// Static things (the village) map the noise by world position, so it has the same scale on
// every wall; people map it by their own texture coordinates so it stays on the body.
// Everything fades out with distance, where it would only shimmer.

// One uniform object is shared by every patched material. `mode` is the quality: 0 off,
// 1 a single read by texture coordinates, 2 world-space mapping (three reads for the grain).
export const detailUniforms = {
  uDetailMap: { value: null },
  uDetailMode: { value: 2 },
};

// What each material family wants: colour grain, bump strength, mottling, extra normal
// scale for the material's own map, and whether it maps by world position.
const KINDS = {
  plaster: { grain: 0.2, bump: 0.8, mottle: 0.18, normal: 2.2, scale: 1.6 },
  skin: { grain: 0.0, bump: 0.5, mottle: 0.0, normal: 1.8, scale: 9, uv: true },
  cloth: { grain: 0.32, bump: 1.0, mottle: 0.10, normal: 1.4, scale: 14, uv: true },
  hair: { grain: 0.0, bump: 0.0, mottle: 0.0, normal: 1.0, scale: 9, uv: true },
  stone: { grain: 0.2, bump: 0.55, mottle: 0.24, normal: 1.3, scale: 1.4 },
  wood: { grain: 0.16, bump: 0.45, mottle: 0.10, normal: 1.3, scale: 1.2 },
  tile: { grain: 0.3, bump: 0.7, mottle: 0.26, normal: 1.3, scale: 1.7 },
  metal: { grain: 0.10, bump: 0.3, mottle: 0.08, normal: 1.0, scale: 1.2 },
  other: { grain: 0.18, bump: 0.5, mottle: 0.12, normal: 1.3, scale: 1.3 },
};

function kindOf(m, path) {
  const n = m.name || '';
  if (/Plaster/i.test(n)) return 'plaster';
  if (/Regular|Superhero|Female|Male|Skin/i.test(n)) return 'skin';
  if (/Hair|Eyebrow|Beard|Eye/i.test(n)) return 'hair';
  if (/Brick|Rock|Stone/i.test(n)) return 'stone';
  if (/Wood/i.test(n)) return 'wood';
  if (/Tile|Roof/i.test(n)) return 'tile';
  if (/Metal/i.test(n)) return 'metal';
  if (/^chars|^monsters/.test(path || '')) return 'cloth';
  return 'other';
}

// A tileable noise texture: R is grain around 0.5, G and B are the slope of the same
// noise (a tangent-space normal's x and y around 0.5).
function makeNoise(size = 256) {
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const height = new Float32Array(size * size);
  // Octaves of periodic value noise; finer octaves are weaker.
  for (const [cells, weight] of [[4, 0.7], [8, 0.9], [16, 1.0], [32, 0.75], [64, 0.5]]) {
    const lat = new Float32Array(cells * cells).map(() => rnd());
    const at = (x, y) => lat[(y % cells) * cells + (x % cells)];
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        height[y * size + x] += (a + (b - a) * sy - 0.5) * weight;
      }
    }
  }
  let sum = 0, sum2 = 0;
  for (const v of height) { sum += v; sum2 += v * v; }
  const mean = sum / height.length, sd = Math.sqrt(sum2 / height.length - mean * mean);
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = (h(x, y) - mean) / sd;
      const dx = (h(x + 1, y) - h(x - 1, y)) / sd, dy = (h(x, y + 1) - h(x, y - 1)) / sd;
      data[i] = Math.max(0, Math.min(255, 128 + v * 44));
      data[i + 1] = Math.max(0, Math.min(255, 128 - dx * 200));
      data[i + 2] = Math.max(0, Math.min(255, 128 - dy * 200));
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const patched = new WeakSet();
let noise = null;
export function detailTexture() {
  return (noise ??= makeNoise());
}

// Quality: 0 off, 1 cheap (one read), 2 full.
export function setDetailMode(mode) {
  detailUniforms.uDetailMap.value = detailTexture();
  detailUniforms.uDetailMode.value = mode;
}

export function setDetailAnisotropy(n) {
  if (noise && noise.anisotropy !== n) {
    noise.anisotropy = n;
    noise.needsUpdate = true;
  }
}

// Patches one material (once). Only materials with a tangent-space normal map are touched.
export function enhance(material, path = '') {
  const m = material;
  if (!m || patched.has(m) || !m.isMeshStandardMaterial || !m.normalMap) return m;
  const k = KINDS[kindOf(m, path)];
  patched.add(m);
  m.userData.detail = true;
  detailUniforms.uDetailMap.value ??= detailTexture();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, detailUniforms, {
      uDetailGrain: { value: k.grain },
      uDetailBump: { value: k.bump },
      uDetailMottle: { value: k.mottle },
      uDetailScale: { value: k.scale },
      uDetailWorld: { value: k.uv ? 0 : 1 },
      uDetailNormal: { value: k.normal },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vDetailPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDetailN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDetailPos;
        varying vec3 vDetailN;
        uniform sampler2D uDetailMap;
        uniform float uDetailMode, uDetailGrain, uDetailBump, uDetailMottle, uDetailScale, uDetailWorld, uDetailNormal;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // x: grain (-0.5..0.5), yz: slope, w: mottle (-0.5..0.5). Fades with distance.
        vec4 dtl = vec4(0.0);
        {
          float dist = length(vViewPosition);
          float near = 1.0 - smoothstep(14.0, 42.0, dist);
          float far = 1.0 - smoothstep(45.0, 120.0, dist);
          if (uDetailMode > 0.5 && far > 0.0) {
            vec3 n = normalize(vDetailN);
            vec2 fine = vec2(0.0);
            if (uDetailMode > 1.5 && uDetailWorld > 0.5) {
              vec3 w = pow(abs(n), vec3(4.0));
              w /= (w.x + w.y + w.z);
              vec3 p = vDetailPos * uDetailScale;
              vec3 sx = texture2D(uDetailMap, p.zy).rgb;
              vec3 sy = texture2D(uDetailMap, p.xz).rgb;
              vec3 sz = texture2D(uDetailMap, p.xy).rgb;
              vec3 s = sx * w.x + sy * w.y + sz * w.z;
              dtl.xyz = s - 0.5;
              // Mottling: the dominant projection at a much larger scale.
              vec2 q = (w.y > max(w.x, w.z) ? vDetailPos.xz : (w.x > w.z ? vDetailPos.zy : vDetailPos.xy)) * (uDetailScale * 0.17) + 0.37;
              dtl.w = texture2D(uDetailMap, q).r - 0.5;
            } else {
              vec2 uv = (uDetailWorld > 0.5 ? (abs(n.y) > 0.7 ? vDetailPos.xz : (abs(n.x) > abs(n.z) ? vDetailPos.zy : vDetailPos.xy)) : vNormalMapUv) * uDetailScale;
              dtl.xyz = texture2D(uDetailMap, uv).rgb - 0.5;
              dtl.w = dtl.x * 0.6;
            }
            dtl.xyz *= near;
            dtl.w *= far;
          }
        }
        diffuseColor.rgb *= 1.0 + dtl.x * uDetailGrain * 2.4 + dtl.w * uDetailMottle * 2.4;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + dtl.x * 0.3, 0.05, 1.0);`)
      .replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale * (uDetailMode > 0.5 ? uDetailNormal : 1.0);
        mapN.xy += dtl.yz * uDetailBump * 2.0;`);
  };
  // All patched materials share one program per set of defines.
  m.customProgramCacheKey = () => 'detail1';
  m.needsUpdate = true;
  return m;
}

export function enhanceTree(root, path = '') {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) if (m && !seen.has(m)) { seen.add(m); enhance(m, path); }
  });
}
