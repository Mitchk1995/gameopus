import * as THREE from 'three';
import { studioEnv } from './envs.js';
import { createKit } from './kit.js';
import { buildItemModel, artKey, disposeModel, cowl } from './items3d.js';
import { UNIQUE_BY_ID } from '../content/uniques.js';
import { BASES } from '../content/bases.js';

// A tiny offscreen photo studio: renders item models and skill vignettes into
// icon images (data URLs) with proper lighting, then caches them.
const SIZE = 160;

export class ArtStudio {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.ok = true;
    try {
      this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    } catch {
      this.ok = false;
      return;
    }
    this.r.setPixelRatio(1);
    this.r.setSize(SIZE, SIZE, false);
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.0;
    this.r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xfff0dc, 2.3);
    key.position.set(-2.5, 3, 4);
    const rim = new THREE.DirectionalLight(0x9ab8ff, 2.6);
    rim.position.set(3, 1.5, -3.5);
    const warm = new THREE.DirectionalLight(0xff9a60, 0.8);
    warm.position.set(2, -2, 2);
    this.scene.add(key, rim, warm, new THREE.HemisphereLight(0xb0b8c8, 0x201810, 0.45));
    this.env = studioEnv(this.r);
    this.kit = createKit(this.env);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    this.camera.position.set(0, 0, 6);
    this.cache = new Map();
    this.work = document.createElement('canvas');
    this.work.width = this.work.height = SIZE;
  }

  #shoot(group, radius = 1.3) {
    const box = new THREE.Box3().setFromObject(group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const k = radius / Math.max(0.001, sphere.radius);
    const holder = new THREE.Group();
    group.position.sub(sphere.center);
    holder.add(group);
    holder.scale.setScalar(k);
    this.scene.add(holder);
    this.r.render(this.scene, this.camera);
    this.scene.remove(holder);
  }

  #pose(g, slot) {
    const P = {
      weapon: [-0.25, 0.35, -Math.PI / 4],
      helm: [0.18, -0.55, 0],
      chest: [0.12, -0.45, 0],
      gloves: [0.2, -0.5, 0.35],
      boots: [0.2, -0.8, 0],
      amulet: [0.1, 0.3, 0],
      ring: [0.95, 0.35, 0.1],
    }[slot];
    g.rotation.set(P[0], P[1], P[2]); // XYZ order: in-plane turn first, then yaw, then tilt
  }

  icon(item) {
    if (!this.ok || !item?.slot) return null;
    const key = artKey(item);
    if (this.cache.has(key)) return this.cache.get(key);
    const g = buildItemModel(item, this.kit);
    this.#pose(g, item.slot);
    this.#shoot(g, item.slot === 'weapon' ? 1.75 : 1.55);
    const url = this.canvas.toDataURL('image/png');
    disposeModel(g);
    this.cache.set(key, url);
    return url;
  }

  uniqueIcon(id) {
    const u = UNIQUE_BY_ID[id];
    if (!u) return null;
    return this.icon({ slot: u.slot, uniqueId: id, rarity: 'unique', base: BASES[u.slot][3], uid: id, affixes: [] });
  }

  // Skill icons: a lit 3D vignette composited over a painted backdrop with glow.
  skillIcon(id) {
    if (!this.ok) return null;
    const key = `skill:${id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const k = this.kit;
    const g = new THREE.Group();
    const glowMat = (c, s = 2.5) => k.glow(c, s);
    let bg = ['#2a0f0a', '#070304'], glow = '#ff9a50';
    if (id === 'cleave') {
      const sword = buildItemModel({ slot: 'weapon', base: BASES.weapon[1], rarity: 'magic', uid: 'skill', affixes: [] }, k);
      sword.rotation.set(0.2, 0.3, -Math.PI / 4 - 0.2);
      g.add(sword);
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 40, 1, Math.PI * 0.15, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      arc.position.set(0.05, 0.05, -0.2);
      g.add(arc);
      bg = ['#4a1c0c', '#0a0404']; glow = '#ffb070';
    } else if (id === 'bolt') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 18), glowMat(0xd8a0ff, 3)));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.4, 2.2), transparent: true, opacity: 0.35 })));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 3) * 0.015, 8, 6), glowMat(0xe0b8ff, 3)).translateX(Math.cos(a) * (0.62 + (i % 2) * 0.15)).translateY(Math.sin(a) * (0.62 + (i % 2) * 0.15)));
      }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.3, 1.6), transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      tail.rotation.z = Math.PI / 2 + 0.6;
      tail.position.set(-0.55, -0.35, -0.2);
      g.add(tail);
      bg = ['#2c0f45', '#07030c']; glow = '#c890ff';
    } else if (id === 'dash') {
      // A hooded, cloaked figure lunging right, trailing fading afterimages.
      const figure = (mat, x, ghost) => {
        const lean = new THREE.Group();
        const body = new THREE.Group();
        const cloak = new THREE.LatheGeometry([[0.001, -0.66], [0.38, -0.62], [0.3, -0.22], [0.22, 0.14], [0.15, 0.32], [0.001, 0.36]].map(([a, b]) => new THREE.Vector2(a, b)), 24);
        const pos = cloak.attributes.position;
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setZ(i, pos.getZ(i) + pos.getY(i) * 0.3);
        cloak.computeVertexNormals();
        body.add(new THREE.Mesh(cloak, mat));
        const hood = cowl(k, mat, ghost ? mat : k.cloth(0x1a0806));
        hood.scale.setScalar(0.6);
        hood.position.set(0, 0.55, 0.04);
        body.add(hood);
        if (ghost) body.traverse((o) => { if (o.isMesh) o.material = mat; });
        else for (const sx of [-1, 1]) body.add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), glowMat(0x9ff0ff, 3.5)).translateX(sx * 0.05).translateY(0.53).translateZ(0.14));
        body.rotation.y = Math.PI / 2;
        lean.add(body);
        lean.rotation.z = -0.22;
        lean.position.x = x;
        return lean;
      };
      g.add(figure(k.cloth(0x5a1612), 0.38, false));
      [0.3, 0.17, 0.08].forEach((o, i) => g.add(figure(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.0, 1.8), transparent: true, opacity: o, depthWrite: false }), -0.2 - i * 0.5, true)));
      for (let i = 0; i < 5; i++) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.025, 0.02), glowMat(0x8fe8ff, 2)).translateX(-0.5).translateY(-0.4 + i * 0.2));
      bg = ['#0c2f3a', '#020709']; glow = '#7fe0ff';
    } else if (id === 'nova') {
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22), k.crystal(0xcff2ff)));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55 + (i % 2) * 0.2, 6), k.crystal(0x9fdcff));
        spike.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
        spike.rotation.z = a - Math.PI / 2;
        g.add(spike);
      }
      g.add(new THREE.Mesh(new THREE.RingGeometry(0.95, 1.02, 48), glowMat(0x9fe0ff, 2)));
      bg = ['#0b2a4a', '#02060c']; glow = '#9fdcff';
    } else if (id === 'potion') {
      const glass = new THREE.LatheGeometry([[0.001, -0.55], [0.34, -0.5], [0.44, -0.25], [0.42, 0.05], [0.16, 0.28], [0.12, 0.55], [0.14, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
      g.add(new THREE.Mesh(glass, new THREE.MeshStandardMaterial({ color: 0xd8e8ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, envMap: this.env, envMapIntensity: 2 })));
      const liquid = new THREE.LatheGeometry([[0.001, -0.5], [0.3, -0.46], [0.39, -0.24], [0.37, 0.0], [0.001, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
      g.add(new THREE.Mesh(liquid, glowMat(0xff3040, 1.6)));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.16, 14), k.leather(0x7a5030)).translateY(0.64));
      bg = ['#4a0a10', '#0a0203']; glow = '#ff5060';
    }
    g.rotation.set(0.1, 0, 0);
    this.#shoot(g, 1.2);
    // Composite: painted backdrop + glow halo + the render.
    const ctx = this.work.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    const grad = ctx.createRadialGradient(SIZE * 0.5, SIZE * 0.45, SIZE * 0.05, SIZE * 0.5, SIZE * 0.5, SIZE * 0.72);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 2, 2);
    }
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 22;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
    ctx.drawImage(this.canvas, 0, 0);
    const vig = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.35, SIZE / 2, SIZE / 2, SIZE * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const url = this.work.toDataURL('image/png');
    g.traverse((m) => m.isMesh && m.geometry.dispose());
    this.cache.set(key, url);
    return url;
  }
}
