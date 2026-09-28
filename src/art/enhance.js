import * as THREE from 'three';
import { materialTextures } from './texgen.js';
import { RIG_LIB } from '../game/monsterModels.js';

// One shader patch for every lit surface in the game. Features (all optional):
//   tex:    triplanar albedo + bump + roughness from art/texgen.js (no UVs needed)
//   glow:   color added where the texture's glow mask is set (smouldering cracks, lava veins)
//   rim:    cool fresnel rim so characters separate from the floor
//   ao:     darkens surfaces close to the ground (cheap contact shadowing)
//   rig:    GLSL skeleton for instanced monsters (see game/monsterModels.js)
const shared = {
  rimColor: { value: new THREE.Color(0.35, 0.45, 0.8) },
  time: { value: 0 },
};
export const enhanceUniforms = shared;

export function enhance(mat, o = {}) {
  const lit = !mat.isMeshBasicMaterial;
  const tex = lit && o.tex ? materialTextures(o.tex, o.texSize || 256) : null;
  const key = [o.tex, o.space, o.rim, o.ao, !!o.glow, o.rigId || ''].join('|');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    sh.uniforms.uEnhTime = shared.time;

    let vHead = 'varying vec3 vEnhPos;\nvarying vec3 vEnhNrm;\nvarying float vEnhY;\nuniform float uEnhTime;\n';
    if (o.rig) vHead += `attribute float aPart;\nattribute vec4 aAnim;\nattribute float aPhase;\n${RIG_LIB}\n${o.rig}\n`;
    vs = vHead + vs;
    if (o.rig) {
      // Pose the vertex once, before normals are transformed, then use the posed position.
      if (lit) {
        vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec3 rigP = position;
          rig(rigP, objectNormal, aPart, aAnim, uEnhTime + aPhase);`);
        vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = rigP;');
      } else {
        vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec3 rigN = vec3(0.0, 1.0, 0.0); rig(transformed, rigN, aPart, aAnim, uEnhTime + aPhase); }`);
      }
    }
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 ew = vec4(transformed, 1.0);
        vec3 en = ${lit ? 'objectNormal' : 'vec3(0.0, 1.0, 0.0)'};
        #ifdef USE_INSTANCING
          ew = instanceMatrix * ew;
          en = mat3(instanceMatrix) * en;
        #endif
        ew = modelMatrix * ew;
        vEnhY = ew.y;
        ${o.space === 'world' ? 'vEnhPos = ew.xyz; vEnhNrm = mat3(modelMatrix) * en;' : 'vEnhPos = position; vEnhNrm = normal;'}
      }`);

    let fHead = 'varying vec3 vEnhPos;\nvarying vec3 vEnhNrm;\nvarying float vEnhY;\nuniform float uEnhTime;\n';
    if (tex) {
      sh.uniforms.tEnhA = { value: tex.map };
      sh.uniforms.tEnhD = { value: tex.data };
      sh.uniforms.uEnhScale = { value: o.scale ?? 1 };
      sh.uniforms.uEnhBump = { value: o.bump ?? 1 };
      sh.uniforms.uEnhGlow = { value: o.glow || new THREE.Color(0, 0, 0) };
      fHead += `
        uniform sampler2D tEnhA; uniform sampler2D tEnhD;
        uniform float uEnhScale, uEnhBump; uniform vec3 uEnhGlow;
        vec3 enhW;
        vec4 enhTri(sampler2D t, vec3 p) {
          return texture2D(t, p.zy) * enhW.x + texture2D(t, p.xz) * enhW.y + texture2D(t, p.xy) * enhW.z;
        }
        vec3 enhPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
          vec3 dx = dFdx(surfPos), dy = dFdy(surfPos);
          if (dot(dx, dx) < 1e-12 || dot(dy, dy) < 1e-12) return surfNorm;
          vec3 sx = normalize(dx), sy = normalize(dy);
          vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
          float det = dot(sx, r1) * faceDir;
          vec3 g = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
          vec3 n = abs(det) * surfNorm - g;
          return dot(n, n) > 1e-12 ? normalize(n) : surfNorm;
        }`;
      fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
        vec3 enhN = normalize(vEnhNrm + 1e-5);
        enhW = pow(abs(enhN), vec3(4.0));
        enhW /= (enhW.x + enhW.y + enhW.z);
        vec3 enhP = vEnhPos * uEnhScale;
        vec4 enhAlb = enhTri(tEnhA, enhP);
        vec4 enhDat = enhTri(tEnhD, enhP);
        diffuseColor.rgb *= enhAlb.rgb;`);
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.35 + enhDat.g * 1.3), 0.04, 1.0);`);
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 dH = vec2(dFdx(enhDat.r), dFdy(enhDat.r)) * uEnhBump;
          normal = enhPerturb(-vViewPosition, normal, dH, faceDirection);
        }`);
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEnhGlow * enhDat.b * (0.75 + 0.25 * sin(uEnhTime * 3.0 + vEnhPos.x * 3.0));`);
    }
    if (o.rim && lit) {
      sh.uniforms.uEnhRim = shared.rimColor;
      sh.uniforms.uEnhRimK = { value: o.rim };
      fHead += 'uniform vec3 uEnhRim; uniform float uEnhRimK;\n';
      fs = fs.replace('#include <opaque_fragment>', `
        {
          float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          outgoingLight += uEnhRim * pow(fr, 3.0) * uEnhRimK;
        }
        #include <opaque_fragment>`);
    }
    if (o.ao && lit) {
      fs = fs.replace('#include <lights_fragment_begin>', `
        diffuseColor.rgb *= mix(${(o.aoMin ?? 0.45).toFixed(2)}, 1.0, smoothstep(0.0, ${o.ao.toFixed(2)}, vEnhY));
        #include <lights_fragment_begin>`);
    }
    sh.vertexShader = vs;
    sh.fragmentShader = fHead + '\n' + fs;
  };
  return mat;
}

export function tickEnhance(t) {
  shared.time.value = t;
}
