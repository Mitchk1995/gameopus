import * as THREE from 'three';
import { rng } from './buildings.js';

// Procedural street furniture for Ashford that the Quaternius kits do not have: lamp posts,
// low stone walls, hedges, gates, signposts, crops, hay, woodpiles, troughs, graves and the
// like. Each one is added to the village Batcher (so the whole town stays a few dozen draw
// calls) and, where a person could bump into it, to the collider grid.

const Y = new THREE.Vector3(0, 1, 0);

export function findMaterial(kit, name) {
  for (const part of kit.parts.values()) {
    let found = null;
    part.traverse((o) => {
      if (!found && o.isMesh) for (const m of [o.material].flat()) if (m.name === name) found = m;
    });
    if (found) return found;
  }
  return null;
}

// Scales the UVs of a geometry so that a texture repeats every `tile` metres, on every face.
function worldUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (az >= ay) { u = p.getX(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getZ(i); }
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}

export class TownKit {
  constructor(kit, batch, colliders, world) {
    this.kit = kit;
    this.batch = batch;
    this.colliders = colliders;
    this.world = world;
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    this.m = {
      stone: findMaterial(kit, 'MI_UnevenBrick') || std(0x8a8580),
      rock: findMaterial(kit, 'MI_RockTrim') || std(0x777068),
      wood: findMaterial(kit, 'MI_WoodTrim') || std(0x6b4a2f),
      tiles: findMaterial(kit, 'MI_RoundTiles') || std(0xa5502f),
      plaster: findMaterial(kit, 'MI_Plaster') || std(0xd8ceb8),
      metal: findMaterial(kit, 'MI_Trim_Metal') || std(0x2a2a2e, { metalness: 0.7, roughness: 0.5 }),
      vine: findMaterial(kit, 'MI_Vine'),
      iron: std(0x25262a, { metalness: 0.6, roughness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa640, emissiveIntensity: 1.6, roughness: 0.3 }),
      hedge: std(0x3f6a2b, { roughness: 1 }),
      hedge2: std(0x4c7a30, { roughness: 1 }),
      hedgeCore: std(0x2b4d1f, { roughness: 1 }),
      cabbage: std(0x76a24a),
      cabbage2: std(0x5f8f3f),
      bean: std(0x5a8a34),
      hay: new THREE.MeshStandardMaterial({ map: strawTexture(), roughness: 1 }),
      straw: std(0xb98c3a, { roughness: 1 }),
      water: new THREE.MeshStandardMaterial({ color: 0x2a4d5a, roughness: 0.08, metalness: 0 }),
      paper: std(0xe9dfc4),
      soil: std(0x4a3524, { roughness: 1 }),
      log: std(0x6a4a2c),
      logEnd: std(0xb58b58),
      cloth: [0xe8e2d0, 0xb0473a, 0x3f6ea0, 0xd9b44a].map((c) => std(c, { side: THREE.DoubleSide, roughness: 1 })),
      flower: [0xd9503f, 0xe8c547, 0xb06ad0, 0xf0f0f0].map((c) => std(c, { roughness: 0.7 })),
    };
    this.geo = {};
    this.rnd = rng(2024);
  }

  // Adds a mesh (geometry + material) at a world position/rotation to the batch.
  put(geo, mat, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, rotZ, 'YXZ');
    mesh.scale.set(sx, sy, sz);
    this.batch.addObject(mesh, new THREE.Matrix4());
  }

  box(w, h, d, tile = 0) {
    const key = `b${w}|${h}|${d}|${tile}`;
    if (this.geo[key]) return this.geo[key];
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (tile) worldUV(g, tile);
    return (this.geo[key] = g);
  }

  cyl(r0, r1, h, seg = 8) {
    const key = `c${r0}|${r1}|${h}|${seg}`;
    return (this.geo[key] ||= new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0));
  }

  solidCircle(x, z, r, y, h) {
    return this.colliders.addCircle(x, z, r, y - 0.5, y + h);
  }

  solidBox(x, z, hx, hz, rot, y, h) {
    return this.colliders.addBox(x, z, hx, hz, rot, y - 0.5, y + h);
  }

  // ---------------------------------------------------------------- lamp post
  lamp(x, z, y) {
    const { m } = this;
    this.put(this.cyl(0.11, 0.14, 0.35, 8), m.iron, x, y, z);
    this.put(this.cyl(0.055, 0.075, 2.7, 8), m.iron, x, y + 0.3, z);
    this.put(this.box(0.34, 0.06, 0.34), m.iron, x, y + 2.95, z);
    this.put(this.box(0.26, 0.42, 0.26), m.glass, x, y + 3.0, z);
    this.put(this.cyl(0.005, 0.25, 0.22, 4), m.iron, x, y + 3.42, z, Math.PI / 4);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.put(this.box(0.03, 0.42, 0.03), m.iron, x + dx * 0.14, y + 3.0, z + dz * 0.14);
    this.solidCircle(x, z, 0.16, y, 3.4);
  }

  // ---------------------------------------------------------------- low stone wall
  // A run of wall from a to b, chunked so the collider grid stays tidy. Piers every ~6 m.
  stoneWall(a, b, y = null, { height = 1.25, thick = 0.55 } = {}) {
    const { m } = this;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.round(len / 5.5)), seg = len / n;
    for (let i = 0; i < n; i++) {
      const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
      const gy = y ?? this.world.heightAt(cx, cz);
      this.put(this.box(seg + 0.04, height, thick, 1.4), m.stone, cx, gy - 0.35, cz, rot);
      this.put(this.box(seg + 0.04, 0.14, thick + 0.22, 1.6), m.rock, cx, gy - 0.35 + height, cz, rot);
      this.solidBox(cx, cz, seg / 2 + 0.02, thick / 2 + 0.1, rot, gy - 0.35, height + 0.14);
    }
    for (let i = 0; i <= n; i++) {
      const px = a[0] + ux * seg * i, pz = a[1] + uz * seg * i, gy = y ?? this.world.heightAt(px, pz);
      this.put(this.box(0.85, height + 0.35, 0.85, 1.4), m.stone, px, gy - 0.35, pz, rot);
      this.put(this.box(1.05, 0.14, 1.05, 1.6), m.rock, px, gy - 0.35 + height + 0.35, pz, rot);
    }
  }

  // ---------------------------------------------------------------- hedge
  // A clipped hedge: lumpy leafy blocks (a dark core under a leaf-textured shell), with a
  // rounded top, about a metre thick. Chunked so the collider grid stays tidy.
  hedge(a, b, { height = 1.7, thick = 1.1 } = {}) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const k = Math.max(1, Math.round(len / 3.6)), seg = len / k;
    for (let i = 0; i < k; i++) {
      const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
      const gy = this.world.heightAt(cx, cz);
      const ph = this.rnd() * 20;
      const shell = this.hedgeBlock(seg + 0.25, height, thick, ph);
      const core = this.hedgeBlock(seg + 0.2, height * 0.94, thick * 0.86, ph + 3, true);
      this.put(core, this.m.hedgeCore, cx, gy - 0.1, cz, rot);
      this.put(shell, this.m.vine || this.m.hedge, cx, gy - 0.1, cz, rot);
      this.solidBox(cx, cz, seg / 2, thick / 2, rot, gy - 0.3, height);
    }
  }

  hedgeBlock(len, height, thick, phase, plain = false) {
    const g = new THREE.BoxGeometry(len, height, thick, Math.max(2, Math.round(len / 0.3)), 5, 3);
    g.translate(0, height / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = Math.max(0, (y - height * 0.55) / (height * 0.45));
      const round = 1 - 0.42 * t * t;
      const n = Math.sin(x * 2.9 + phase) * 0.5 + Math.sin(x * 6.3 + y * 4.1 + phase * 1.7) * 0.3 + Math.sin(y * 7.7 + z * 5.3 + phase) * 0.2;
      z *= round * (1 + 0.07 * n);
      y += (t > 0 ? 0.12 : 0.02) * n * (plain ? 0 : 1);
      // The ends taper a little so runs do not end in flat slabs.
      x *= 1 - 0.04 * t;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return plain ? g : worldUV(g, 0.9);
  }

  // ---------------------------------------------------------------- wooden fence (kit pieces)
  fence(a, b, name = 'Prop_WoodenFence_Single') {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3) return;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.round(len / 2.0)), seg = len / n;
    for (let i = 0; i < n; i++) {
      const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
      const gy = this.world.heightAt(cx, cz);
      this.batch.add(name, cx, gy, cz, rot, seg / 2.0);
      this.solidBox(cx, cz, seg / 2, 0.09, rot, gy, 0.85);
    }
  }

  // ---------------------------------------------------------------- gate posts and name sign
  gate(g, signTexture) {
    const { m } = this;
    const ox = -g.out[1], oz = g.out[0]; // across the opening
    const y = this.world.heightAt(g.x, g.z);
    const rot = Math.atan2(-oz, ox);
    const half = g.width / 2 + 0.55;
    for (const s of [-1, 1]) {
      const px = g.x + ox * half * s, pz = g.z + oz * half * s;
      this.put(this.box(1.15, 3.1, 1.15, 1.4), m.stone, px, y - 0.3, pz, rot);
      this.put(this.box(1.45, 0.2, 1.45, 1.6), m.rock, px, y + 2.8, pz, rot);
      this.put(this.cyl(0.005, 0.5, 0.4, 4), m.tiles, px, y + 3.0, pz, rot + Math.PI / 4);
      // A lantern on the inside face of each pier.
      this.put(this.box(0.24, 0.36, 0.24), m.glass, px - g.out[0] * 0.75, y + 2.05, pz - g.out[1] * 0.75, rot);
      this.put(this.box(0.3, 0.05, 0.3), m.iron, px - g.out[0] * 0.75, y + 2.4, pz - g.out[1] * 0.75, rot);
      this.solidBox(px, pz, 0.6, 0.6, rot, y, 3.2);
    }
    // A timber beam across, with the town's name hanging from it.
    const bx = g.x, bz = g.z;
    this.put(this.box(g.width + 1.6, 0.3, 0.32), m.wood, bx, y + 3.5, bz, rot);
    const face = Math.atan2(g.out[0], g.out[1]);
    if (signTexture) {
      const mat = new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.85 });
      const board = new THREE.PlaneGeometry(2.6, 0.66);
      for (const s of [1, -1]) this.put(board, mat, bx + g.out[0] * 0.05 * s, y + 2.95, bz + g.out[1] * 0.05 * s, face + (s > 0 ? 0 : Math.PI));
      for (const dx of [-1.0, 1.0]) this.put(this.cyl(0.012, 0.012, 0.45, 4), m.iron, bx + ox * dx, y + 3.28, bz + oz * dx);
    }
  }

  // ---------------------------------------------------------------- signpost
  sign(x, z, rot, boards, textures) {
    const { m } = this;
    const y = this.world.heightAt(x, z);
    this.put(this.cyl(0.07, 0.09, 2.9, 8), m.wood, x, y, z);
    this.put(this.cyl(0.005, 0.11, 0.22, 4), m.wood, x, y + 2.9, z, 0.78);
    boards.forEach((b, i) => {
      const tex = textures[i];
      const front = new THREE.MeshStandardMaterial({ map: tex[0], roughness: 0.85 });
      const back = new THREE.MeshStandardMaterial({ map: tex[1], roughness: 0.85 });
      const geo = new THREE.BoxGeometry(1.35, 0.3, 0.05);
      geo.translate(0.55, 0, 0);
      // materials: +x, -x, +y, -y, +z, -z; only the two big faces carry the text
      const mesh = new THREE.Mesh(geo, [m.wood, m.wood, m.wood, m.wood, front, back]);
      mesh.position.set(x, y + 2.55 - i * 0.36, z);
      mesh.rotation.y = rot + b.turn;
      mesh.updateMatrixWorld(true);
      // Batcher splits multi-material meshes by geometry group.
      this.batch.addObject(mesh, new THREE.Matrix4());
    });
    this.solidCircle(x, z, 0.12, y, 3);
  }

  // ---------------------------------------------------------------- notice board
  noticeBoard(x, z, rot) {
    const { m } = this;
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    for (const k of [-0.75, 0.75]) this.put(this.cyl(0.06, 0.07, 2.1, 6), m.wood, x + c * k, y, z - s * k);
    this.put(this.box(1.9, 1.05, 0.1), m.wood, x, y + 0.95, z, rot);
    for (let i = 0; i < 5; i++) {
      const k = -0.7 + i * 0.35, jz = 0.07;
      this.put(this.box(0.26 + this.rnd() * 0.08, 0.34 + this.rnd() * 0.2, 0.012), m.paper, x + c * k + s * jz, y + 1.05 + (this.rnd() - 0.5) * 0.3, z - s * k + c * jz, rot + (this.rnd() - 0.5) * 0.2);
    }
    this.solidBox(x, z, 1.0, 0.2, rot, y, 2.0);
  }

  // ---------------------------------------------------------------- hay, wood, water
  bale(x, z, rot = 0, level = 0) {
    const y = this.world.heightAt(x, z);
    this.put(this.box(1.05, 0.55, 0.55, 0.7), this.m.hay, x, y + level * 0.55, z, rot);
    // Binding twine
    for (const k of [-0.28, 0.28]) this.put(this.box(0.03, 0.57, 0.58), this.m.straw, x + Math.cos(rot) * k, y + level * 0.55, z - Math.sin(rot) * k, rot);
    if (level === 0) this.solidBox(x, z, 0.55, 0.3, rot, y, 0.6);
  }

  haystack(x, z, r = 1.6) {
    const y = this.world.heightAt(x, z);
    this.put(this.cyl(r, r * 0.95, 1.1, 12), this.m.hay, x, y, z);
    this.put(this.cyl(0.05, r, 1.5, 12), this.m.hay, x, y + 1.05, z);
    this.solidCircle(x, z, r, y, 2.4);
  }

  woodpile(x, z, rot = 0) {
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    // Logs lie along the local z axis, stacked five, four, three.
    const logG = (this.geo.log ||= new THREE.CylinderGeometry(0.1, 0.1, 1.3, 7).rotateX(Math.PI / 2));
    [5, 4, 3].forEach((n, r) => {
      for (let i = 0; i < n; i++) {
        const k = (i - (n - 1) / 2) * 0.21;
        this.put(logG, this.m.log, x + c * k, y + 0.11 + r * 0.19, z - s * k, rot);
      }
    });
    this.solidBox(x, z, 0.62, 0.7, rot, y, 0.7);
  }

  trough(x, z, rot = 0, len = 1.9) {
    const { m } = this;
    const y = this.world.heightAt(x, z);
    this.put(this.box(len, 0.55, 0.65), m.wood, x, y, z, rot);
    this.put(this.box(len - 0.2, 0.02, 0.45), m.water, x, y + 0.5, z, rot);
    this.solidBox(x, z, len / 2, 0.35, rot, y, 0.6);
  }

  pump(x, z, rot = 0) {
    const { m } = this;
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    this.put(this.box(0.5, 0.35, 0.5, 1.4), m.stone, x, y, z, rot);
    this.put(this.cyl(0.1, 0.13, 1.15, 8), m.iron, x, y + 0.3, z);
    this.put(this.box(0.07, 0.07, 0.6), m.iron, x + s * 0.2, y + 1.3, z + c * 0.2, rot);
    this.put(this.box(0.6, 0.06, 0.06), m.iron, x - c * 0.25, y + 1.2, z + s * 0.25, rot + 0.35);
    this.put(this.box(0.55, 0.2, 0.4), m.wood, x + s * 0.5, y, z + c * 0.5, rot);
    this.solidCircle(x, z, 0.45, y, 1.4);
  }

  // ---------------------------------------------------------------- washing line
  washing(a, b) {
    const { m } = this;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    for (const p of [a, b]) {
      const y = this.world.heightAt(p[0], p[1]);
      this.put(this.cyl(0.05, 0.06, 2.3, 6), m.wood, p[0], y, p[1]);
      this.solidCircle(p[0], p[1], 0.1, y, 2.3);
    }
    const y0 = this.world.heightAt(a[0], a[1]) + 2.15;
    this.put(this.box(len, 0.012, 0.012), m.wood, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, rot);
    const n = Math.floor(len / 0.85);
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.6) / n) * len;
      const mat = m.cloth[i % m.cloth.length];
      const w = 0.45 + this.rnd() * 0.2, h = 0.55 + this.rnd() * 0.45;
      const px = a[0] + ux * t, pz = a[1] + uz * t;
      const g = this.geo[`cl${w.toFixed(2)}${h.toFixed(2)}`] ||= new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0);
      this.put(g, mat, px, y0, pz, rot + Math.PI / 2 + (this.rnd() - 0.5) * 0.15);
    }
  }

  // ---------------------------------------------------------------- crops in a plot
  crops(p, kind) {
    const { m } = this;
    const x0 = p.x0 + 0.9, x1 = p.x1 - 0.9, z0 = p.z0 + 0.9, z1 = p.z1 - 0.9;
    if (x1 - x0 < 1 || z1 - z0 < 1) return;
    if (kind === 'pen') {
      // A paddock: bare ground, hay in one corner and a trough at the far side.
      return;
    }
    // Raised soil beds in rows, running east-west.
    const rowStep = kind === 'flowers' ? 1.3 : 1.5;
    const bedG = this.box(x1 - x0, 0.14, 0.75);
    for (let z = z0 + 0.4; z < z1; z += rowStep) {
      const y = this.world.heightAt((x0 + x1) / 2, z);
      this.put(bedG, m.soil, (x0 + x1) / 2, y - 0.02, z);
      for (let x = x0 + 0.5; x < x1 - 0.2; x += kind === 'cabbage' ? 0.85 : 0.6) {
        const jx = x + (this.rnd() - 0.5) * 0.15, jz = z + (this.rnd() - 0.5) * 0.15;
        if (kind === 'cabbage') {
          const g = (this.geo.cab ||= new THREE.IcosahedronGeometry(0.27, 1));
          this.put(g, this.rnd() < 0.5 ? m.cabbage : m.cabbage2, jx, y + 0.22, jz, this.rnd() * 6, 1, 0.75, 1);
        } else if (kind === 'flowers') {
          const g = (this.geo.fl ||= new THREE.IcosahedronGeometry(0.12, 0));
          this.put(this.cyl(0.012, 0.012, 0.5, 4), m.bean, jx, y, jz);
          this.put(g, m.flower[Math.floor(this.rnd() * m.flower.length)], jx, y + 0.52, jz, 0, 1, 0.8, 1);
        } else {
          // Bean poles: a leaning pair with foliage.
          this.put(this.cyl(0.018, 0.02, 1.7, 4), m.wood, jx, y, jz, 0, 1, 1, 1, 0.14, 0);
          this.put(this.cyl(0.018, 0.02, 1.7, 4), m.wood, jx, y, jz, 0, 1, 1, 1, -0.14, 0);
          this.put(this.cyl(0.04, 0.22, 1.2, 5), m.bean, jx, y + 0.08, jz);
        }
      }
    }
  }

  // ---------------------------------------------------------------- churchyard
  grave(x, z, rot = 0, tall = 0.9) {
    const { m } = this;
    const y = this.world.heightAt(x, z);
    this.put(this.box(0.6, tall, 0.14, 0.8), m.rock, x, y - 0.05, z, rot);
    this.put(this.box(0.55, 0.16, 1.5, 0.8), m.stone, x + Math.sin(rot) * -0.85, y - 0.05, z + Math.cos(rot) * -0.85, rot);
    this.solidBox(x, z, 0.32, 0.12, rot, y, tall);
  }

  lychgate(x, z, rot, y) {
    const { m } = this;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const k of [-1.35, 1.35]) for (const f of [-0.6, 0.6]) {
      this.put(this.box(0.24, 2.7, 0.24), m.wood, x + c * k + s * f, y, z - s * k + c * f, rot);
    }
    for (const f of [-0.6, 0.6]) this.put(this.box(3.1, 0.2, 0.22), m.wood, x + s * f, y + 2.5, z + c * f, rot);
    this.put(this.box(0.2, 0.2, 1.4), m.wood, x, y + 2.9, z, rot);
    // Two pitched roof planes meeting at a ridge along the lane.
    for (const k of [-1, 1]) this.put(this.box(1.3, 0.09, 3.5, 1.2), m.tiles, x + c * 0.58 * k, y + 2.72 - 0.1, z - s * 0.58 * k, rot, 1, 1, 1, 0, -0.5 * k);
    for (const k of [-1.35, 1.35]) this.solidBox(x + c * k, z - s * k, 0.2, 0.2, rot, y, 2.7);
  }
}

// A small canvas texture for a signboard: text on a weathered plank, optionally with an arrow.
export function boardTexture(text, { w = 512, h = 112, bg = '#b78d58', fg = '#2a1a0c', arrow = 0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(60,35,15,0.35)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, 12 + i * 18);
    g.lineTo(w, 12 + i * 18 + (i % 2 ? 3 : -3));
    g.stroke();
  }
  g.strokeStyle = '#3a2410';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(h * 0.5)}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2 + arrow * -14, h / 2 + 3);
  if (arrow) {
    g.beginPath();
    const cx = arrow > 0 ? w - 34 : 34, d = arrow > 0 ? 1 : -1;
    g.moveTo(cx - 14 * d, h / 2 - 14);
    g.lineTo(cx + 14 * d, h / 2);
    g.lineTo(cx - 14 * d, h / 2 + 14);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Straw: warm streaks, so bales and stacks do not read as flat yellow boxes.
function strawTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#c9a24c';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    g.strokeStyle = 'hsl(' + (38 + r() * 12) + ', ' + (45 + r() * 25) + '%, ' + (38 + r() * 30) + '%)';
    g.lineWidth = 1 + r() * 1.5;
    const x = r() * 128, y = r() * 128, l = 10 + r() * 30;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l, y + (r() - 0.5) * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
