import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Everything the game downloads lives under assets/, next to the page.
const BASE = new URL('assets/', document.baseURI);
export const assetURL = (path) => new URL(path, BASE).href;

// Where the page is hosted as an artifact, binary files (models, the HDR sky, the
// heightmap) are published as base64 text, since only web media types are served.
const PACKED = typeof window !== 'undefined' && !!window.__PACKED_ASSETS__;

export async function fetchBinary(path) {
  if (!PACKED) {
    const r = await fetch(assetURL(path));
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.arrayBuffer();
  }
  const r = await fetch(assetURL(`${path}.txt`));
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const text = (await r.text()).trim();
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(text).buffer;
  const bin = atob(text), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Cached loaders with a single progress counter for the loading screen.
export class Assets {
  constructor() {
    this.gltf = new GLTFLoader();
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.textures = new THREE.TextureLoader();
    this.hdrs = new HDRLoader();
    this.cache = new Map();
    this.total = 0;
    this.loaded = 0;
    this.onProgress = null;
  }

  #track(key, make) {
    if (!this.cache.has(key)) {
      this.total++;
      const p = make().finally(() => {
        this.loaded++;
        this.onProgress?.(this.loaded / this.total);
      });
      this.cache.set(key, p);
    }
    return this.cache.get(key);
  }

  model(path) {
    return this.#track(`m:${path}`, async () => this.gltf.parseAsync(await fetchBinary(path), assetURL(path).replace(/[^/]*$/, '')));
  }

  texture(path, { srgb = true, repeat = true, anisotropy = 8 } = {}) {
    return this.#track(`t:${path}:${srgb}:${repeat}`, () =>
      this.textures.loadAsync(assetURL(path)).then((t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = anisotropy;
        return t;
      }));
  }

  hdr(path) {
    return this.#track(`h:${path}`, async () => {
      const d = this.hdrs.parse(await fetchBinary(path));
      const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
      t.colorSpace = THREE.LinearSRGBColorSpace;
      t.flipY = true;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    });
  }

  // Raw decoded pixels of an image (for building texture arrays).
  image(path) {
    return this.#track(`i:${path}`, () => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = assetURL(path);
    }));
  }
}
