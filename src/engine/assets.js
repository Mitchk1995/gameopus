import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Everything the game downloads lives under assets/, next to the page.
const BASE = new URL('assets/', document.baseURI);
export const assetURL = (path) => new URL(path, BASE).href;

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
    return this.#track(`m:${path}`, () => this.gltf.loadAsync(assetURL(path)));
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
    return this.#track(`h:${path}`, () => this.hdrs.loadAsync(assetURL(path)));
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
