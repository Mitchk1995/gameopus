import * as THREE from 'three';
import { WORLD } from './map.js';

// One water plane at sea level for the river and the lake. The shader reads the
// terrain heightmap to find depth: clear and sandy at the shore, deep green-blue in
// the middle, a line of foam where it meets the bank. Ripples come from two scrolling
// normal maps; the sky and sun reflect through the regular lighting.
export class Water {
  constructor({ scene, terrain }) {
    this.time = { value: 0 };
    const normals = rippleTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d4a52,
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 1.2,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHeight = { value: terrain.heightTex };
      sh.uniforms.uHalf = { value: WORLD.half };
      sh.uniforms.uN = { value: WORLD.size + 1 };
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uHeight;
          uniform float uHalf, uN, uTime;
          varying vec3 vWPos;
          float wHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          float wNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wDepth = -texture2D(uHeight, (vWPos.xz + uHalf + 0.5) / uN).r;
          if (wDepth < -0.25) discard;
          float wShore = smoothstep(0.0, 2.8, wDepth);
          diffuseColor.rgb = mix(vec3(0.05, 0.08, 0.06), mix(vec3(0.015, 0.05, 0.05), vec3(0.006, 0.022, 0.032), smoothstep(1.5, 5.0, wDepth)), wShore);
          float foamLine = smoothstep(0.28, 0.0, abs(wDepth - 0.1 - 0.06 * sin(uTime * 1.3 + vWPos.x * 0.7 + vWPos.z * 0.5)));
          float foam = foamLine * smoothstep(0.35, 0.75, wNoise(vWPos.xz * 1.7 + uTime * 0.35));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), foam * 0.8);
          diffuseColor.a = clamp(0.25 + wShore * 0.7 + foam * 0.5, 0.0, 0.95) * smoothstep(-0.25, 0.08, wDepth);`)
        .replace('#include <normal_fragment_maps>', `
          vec2 wuv1 = vWPos.xz * 0.11 + vec2(uTime * 0.021, uTime * 0.013);
          vec2 wuv2 = vWPos.xz * 0.043 - vec2(uTime * 0.012, -uTime * 0.017);
          vec3 wn = texture2D(normalMap, wuv1).xyz * 2.0 - 1.0 + texture2D(normalMap, wuv2).xyz * 2.0 - 1.0;
          wn.xy *= normalScale;
          vec3 wWorldN = normalize(vec3(wn.x, 2.0, wn.y));
          normal = normalize((viewMatrix * vec4(wWorldN, 0.0)).xyz);`);
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1).rotateX(-Math.PI / 2), mat);
    mesh.position.y = WORLD.water;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    scene.add(mesh);
    this.mesh = mesh;
  }

  update(dt) {
    this.time.value += dt;
  }
}

// A tiling ripple normal map painted from layered noise.
function rippleTexture() {
  const S = 256;
  const h = new Float32Array(S * S);
  const waves = [];
  for (let k = 0; k < 24; k++) waves.push([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) - 3, Math.random() * 6.28, 0.6 / (1 + k * 0.15)]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [fx, fy, ph, a] of waves) v += Math.sin(((x * fx + y * fy) / S) * Math.PI * 2 + ph) * a;
      h[y * S + x] = v;
    }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      const n = new THREE.Vector3(-dx, -dy, 2).normalize();
      const i = (y * S + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
