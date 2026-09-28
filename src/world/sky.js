import * as THREE from 'three';

// A photographed sky: the 4K tonemapped image is what you see, the 1K HDR of the same
// sky lights the world (image-based lighting), and the sun light is aimed at the
// brightest spot of the HDR so shadows agree with the picture.
export class Sky {
  constructor({ renderer, scene, assets }) {
    this.renderer = renderer;
    this.scene = scene;
    this.assets = assets;
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  }

  async load() {
    const [hdr, img] = await Promise.all([
      this.assets.hdr('sky/sky_1k.hdr'),
      this.assets.texture('sky/sky_4k.webp', { repeat: false, anisotropy: 1 }),
    ]);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    this.sunDir.copy(this.#brightestDirection(hdr));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    img.mapping = THREE.EquirectangularReflectionMapping;
    img.minFilter = THREE.LinearFilter;
    img.generateMipmaps = false;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1300, 64, 32),
      new THREE.MeshBasicMaterial({ map: img, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }),
    );
    // SphereGeometry's UVs match three.js' equirect convention after a half-turn.
    dome.rotation.y = -Math.PI / 2;
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    this.scene.add(dome);
    this.scene.fog.color.copy(this.#horizonColor(img.image));

    const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const s = sun.shadow.camera;
    s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    // Layer 1 holds shadow-only stand-ins (lighter tree geometry).
    sun.shadow.camera.layers.enable(1);
    this.sun = sun;
    this.scene.add(sun, sun.target);
    return this;
  }

  // Keeps the sky centred on the camera and the shadow frustum centred on the player.
  update(camera, focus) {
    this.dome.position.copy(camera.position);
    const texel = 90 / 4096;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 150, focus.y + this.sunDir.y * 150, fz + this.sunDir.z * 150);
  }

  #brightestDirection(tex) {
    const { data, width, height } = tex.image;
    let best = -1, bi = 0;
    for (let i = 0; i < width * height; i++) {
      const l = data[i * 4] * 0.2 + data[i * 4 + 1] * 0.7 + data[i * 4 + 2] * 0.1;
      if (l > best) { best = l; bi = i; }
    }
    const x = bi % width, y = Math.floor(bi / width);
    const u = (x + 0.5) / width, v = 1 - (y + 0.5) / height;
    const phi = (u - 0.5) * Math.PI * 2, theta = (v - 0.5) * Math.PI;
    const dir = new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
    // A low photographed sun makes long shadows everywhere; keep it at least ~35 degrees up.
    if (dir.y < 0.58) {
      const h = Math.hypot(dir.x, dir.z);
      dir.set((dir.x / h) * 0.81, 0.58, (dir.z / h) * 0.81);
    }
    return dir.normalize();
  }

  // Fog is mixed in after tone mapping, so it must match the sky image as displayed.
  #horizonColor(image) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 256, 128);
    const px = ctx.getImageData(0, 60, 256, 1).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 256; i++) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; }
    return new THREE.Color().setRGB(r / 256 / 255, g / 256 / 255, b / 256 / 255, THREE.LinearSRGBColorSpace);
  }
}
