import * as THREE from 'three';
import { Batcher } from '../world/kit.js';
import { Colliders } from '../world/colliders.js';
import { Fire } from '../world/effects.js';
import { STEP } from '../world/world.js';
import { generate, CELL, rng } from './generate.js';

// A dungeon level built from a generated layout: uneven stone walls two storeys high,
// stone floors, a dark vault overhead, torches (a few real lights shared among the
// nearest), props, chests, and a rope back up. It offers the same queries as the
// overworld (ground, collision, line of sight), so the player, camera and enemies
// work here unchanged.

const WALL_H = 3.0;
const LIGHTS = 6;

export class Dungeon {
  constructor({ kit, assets }) {
    this.kit = kit;
    this.assets = assets;
  }

  build(seed) {
    const L = (this.layout = generate(seed));
    this.rnd = rng(seed * 7 + 3);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050403);
    this.scene.fog = new THREE.FogExp2(0x070605, 0.05);
    this.colliders = new Colliders();
    this.half = (L.size * CELL) / 2;
    this.interactables = [];
    this.fires = [];
    this.torches = [];

    const batch = new Batcher(this.kit);
    const floor = (i, j) => i >= 0 && j >= 0 && i < L.size && j < L.size && L.grid[j * L.size + i] === 1;
    for (let j = 0; j < L.size; j++)
      for (let i = 0; i < L.size; i++) {
        if (!floor(i, j)) {
          // Solid cells beside the floor get a collider (slightly into the room, to
          // cover the wall's thickness).
          if (floor(i + 1, j) || floor(i - 1, j) || floor(i, j + 1) || floor(i, j - 1)) {
            const c = this.cellCentre(i, j);
            this.colliders.addBox(c.x, c.z, CELL / 2 + 0.12, CELL / 2 + 0.12, 0, -2, WALL_H * 2 + 2);
          }
          continue;
        }
        const c = this.cellCentre(i, j);
        batch.add(this.rnd() < 0.85 ? 'Floor_UnevenBrick' : 'Floor_Brick', c.x, 0, c.z, Math.floor(this.rnd() * 4) * (Math.PI / 2));
        // Walls on every edge that meets rock, two storeys high, brick side in.
        for (const [di, dj, rot] of [[0, 1, Math.PI], [0, -1, 0], [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2]]) {
          if (floor(i + di, j + dj)) continue;
          const ex = c.x + di * (CELL / 2), ez = c.z + dj * (CELL / 2);
          batch.add('Wall_UnevenBrick_Straight', ex, 0, ez, rot);
          batch.add('Wall_UnevenBrick_Straight', ex, WALL_H, ez, rot);
          // Now and then a torch on the wall.
          if (this.rnd() < 0.07) this.#torch(ex - di * 0.25, ez - dj * 0.25, rot, batch);
        }
      }
    this.#pillars(L, floor);
    this.#vault(L);
    this.#dressRooms(L, batch, floor);
    this.mesh = batch.build();
    this.scene.add(this.mesh);
    // The camera stays under the vault.
    this.colliders.addBox(0, 0, this.half + 4, this.half + 4, 0, WALL_H * 2 - 0.1, WALL_H * 2 + 3).noFloor = true;

    // Light: a cool faint ambient, a lantern glow around the player, torch lights.
    this.scene.add(new THREE.HemisphereLight(0x8090a8, 0x2a1d12, 0.55));
    this.lantern = new THREE.PointLight(0xffc98a, 5, 12, 1.5);
    this.scene.add(this.lantern);
    this.pool = [];
    for (let k = 0; k < LIGHTS; k++) {
      const l = new THREE.PointLight(0xff9a45, 0, 14, 1.4);
      this.scene.add(l);
      this.pool.push(l);
    }
    this.poolTimer = 0;
    return this;
  }

  cellCentre(i, j) {
    return new THREE.Vector3(i * CELL + CELL / 2 - this.half, 0, j * CELL + CELL / 2 - this.half);
  }

  cellsOf(room) {
    return room.cells.map(([i, j]) => this.cellCentre(i, j));
  }

  // Square pillars where walls meet, to hide the seams at corners.
  #pillars(L, floor) {
    const mat = findMaterial(this.kit, 'MI_UnevenBrick');
    const geo = new THREE.BoxGeometry(0.5, WALL_H * 2, 0.5);
    geo.translate(0, WALL_H, 0);
    const spots = [];
    for (let j = 0; j <= L.size; j++)
      for (let i = 0; i <= L.size; i++) {
        // A grid corner touching both floor and rock, where two wall directions meet.
        const q = [floor(i - 1, j - 1), floor(i, j - 1), floor(i - 1, j), floor(i, j)];
        const n = q.filter(Boolean).length;
        if (n === 0 || n === 4) continue;
        if (n === 2 && ((q[0] && q[3]) || (q[1] && q[2])) === false && (q[0] === q[1] || q[0] === q[2])) continue;
        spots.push([i * CELL - this.half, j * CELL - this.half]);
      }
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], k) => {
      inst.setMatrixAt(k, m.makeTranslation(x, 0, z));
      this.colliders.addBox(x, z, 0.27, 0.27, 0, -2, WALL_H * 2 + 2);
    });
    inst.castShadow = inst.receiveShadow = true;
    this.scene.add(inst);
  }

  // A dark stone vault overhead.
  #vault(L) {
    const tex = this.assets.cache.get('t:ground/cliff_a.webp:true:true');
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 1 });
    tex?.then((t) => {
      const c = t.clone();
      c.repeat.set(L.size / 3, L.size / 3);
      c.needsUpdate = true;
      mat.map = c;
      mat.needsUpdate = true;
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(L.size * CELL, L.size * CELL), mat);
    plane.rotation.x = Math.PI / 2;
    plane.position.y = WALL_H * 2;
    this.scene.add(plane);
  }

  #torch(x, z, rot, batch) {
    const y = 2.2;
    batch.add('Torch_Metal', x, y, z, rot);
    const fx = x + Math.sin(rot) * 0.28, fz = z + Math.cos(rot) * 0.28;
    const fire = new Fire(this.scene, fx, y + 0.28, fz, { size: 0.28, light: false });
    this.fires.push(fire);
    this.torches.push(new THREE.Vector3(fx, y + 0.5, fz));
  }

  // Props along the walls, chests, bones, and the rope out.
  #dressRooms(L, batch, floor) {
    const props = ['Barrel', 'Crate_Wooden', 'Crate_Wooden', 'Bucket_Wooden_1', 'Cage_Small', 'Vase_Rubble_Medium', 'Pot_1', 'Bag'];
    const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    this.spawns = [];
    this.chests = [];
    for (const room of L.rooms) {
      const cells = room.cells.filter(([i, j]) => SIDES.some(([a, b]) => !floor(i + a, j + b)));
      const inner = room.cells.filter(([i, j]) => SIDES.every(([a, b]) => floor(i + a, j + b)));
      const used = new Set();
      // Clutter along the edges.
      for (let k = 0; k < Math.min(6, cells.length / 5); k++) {
        const [i, j] = cells[Math.floor(this.rnd() * cells.length)];
        used.add(i + ',' + j);
        const c = this.cellCentre(i, j);
        const name = props[Math.floor(this.rnd() * props.length)];
        const ox = (this.rnd() - 0.5) * 0.8, oz = (this.rnd() - 0.5) * 0.8;
        batch.add(name, c.x + ox, 0, c.z + oz, this.rnd() * Math.PI * 2);
        if (['Barrel', 'Crate_Wooden', 'Cage_Small'].includes(name)) this.colliders.addCircle(c.x + ox, c.z + oz, 0.45, -1, 1.1);
      }
      if (room.role === 'start') {
        // Arrive in the middle of the room, with the rope in a neighbouring cell.
        const c = this.cellCentre(...room.c);
        const [ri, rj] = SIDES.map(([a, b]) => [room.c[0] + a, room.c[1] + b]).find(([i, j]) => floor(i, j)) || room.c;
        const r = this.cellCentre(ri, rj);
        this.#rope(r.x, r.z);
        this.startPos = c;
        continue;
      }
      if (room.role === 'boss') {
        this.bossRoom = room;
        this.bossPos = this.cellCentre(...room.c);
        // Braziers at the room's inner corners.
        for (const [i, j] of pickSpread(inner, 4, this.rnd)) {
          const c = this.cellCentre(i, j);
          this.#brazier(c.x, c.z);
        }
        continue;
      }
      // A chest in most rooms, its back to a wall.
      const free = cells.filter(([i, j]) => !used.has(i + ',' + j));
      if (free.length && this.rnd() < 0.7) {
        const [i, j] = free[Math.floor(this.rnd() * free.length)];
        const [di, dj] = SIDES.find(([a, b]) => !floor(i + a, j + b));
        const c = this.cellCentre(i, j);
        this.#chest(c.x + di * 0.35, c.z + dj * 0.35, Math.atan2(-di, -dj), room.depth);
      }
      // Monsters: more and tougher the deeper the room.
      const n = 1 + Math.floor(this.rnd() * 2) + (room.depth > 60 ? 1 : 0);
      const spots = pickSpread(inner.length ? inner : room.cells, n, this.rnd);
      for (const [i, j] of spots) {
        const deep = room.depth / Math.max(1, L.boss.depth);
        this.spawns.push({ pos: this.cellCentre(i, j), kind: this.rnd() < 0.15 + deep * 0.4 ? 'warren_brute' : 'warren_goblin' });
      }
    }
  }

  #rope(x, z) {
    const g = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, WALL_H * 2, 6), new THREE.MeshStandardMaterial({ color: 0x9c8a66, roughness: 0.9 }));
    rope.position.y = WALL_H;
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    light.rotation.x = Math.PI / 2;
    light.position.y = WALL_H * 2 - 0.02;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    shaft.position.y = WALL_H * 2 + 0.02;
    g.add(rope, light, shaft);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const beam = new THREE.PointLight(0xfff1d8, 8, 10, 1.2);
    beam.position.set(x, WALL_H * 2 - 1, z);
    this.scene.add(beam);
    this.interactables.push({ kind: 'station', station: 'rope', name: 'Rope', verb: 'Climb up the', x, y: 1.5, z, r: 0.5, h: 3, reach: 2.2 });
  }

  #brazier(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.7, roughness: 0.5 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.35, 12, 1, true), mat);
    bowl.position.set(x, 1.05, z);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.9, 8), mat);
    stand.position.set(x, 0.45, z);
    this.scene.add(bowl, stand);
    this.fires.push(new Fire(this.scene, x, 1.1, z, { size: 0.55, light: false }));
    this.torches.push(new THREE.Vector3(x, 1.8, z));
    this.colliders.addCircle(x, z, 0.5, -1, 1.3);
  }

  #chest(x, z, rot, depth) {
    const wood = findMaterial(this.kit, 'MI_WoodTrim') || new THREE.MeshStandardMaterial({ color: 0x6b4a2c });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.8, roughness: 0.4 });
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.62), wood);
    box.position.y = 0.25;
    const lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 1.0, 12, 1, false, 0, Math.PI), wood);
    lidMesh.rotation.z = Math.PI / 2;
    lidMesh.position.z = 0.31;
    lid.add(lidMesh);
    lid.position.set(0, 0.5, -0.31);
    for (const bx of [-0.35, 0.35]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.64), iron);
      band.position.set(bx, 0.26, 0);
      g.add(band);
    }
    g.add(box, lid);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    this.colliders.addBox(x, z, 0.52, 0.34, g.rotation.y, -1, 0.9);
    const chest = { kind: 'station', station: 'chest', name: 'Chest', verb: 'Open', x, y: 0.5, z, r: 0.6, h: 1.0, reach: 2.0, lid, depth, rot, opened: false };
    this.chests.push(chest);
    this.interactables.push(chest);
  }

  // ---------------------------------------------------------------- world queries
  heightAt() {
    return 0;
  }

  groundAt(x, z, y) {
    return this.colliders.groundAt(x, z, y, STEP, 0);
  }

  waterDepth() {
    return -99;
  }

  lineOfSight(a, b, pad = 0.2) {
    return this.colliders.raycast(a.x, a.y, a.z, b.x - a.x, b.y - a.y, b.z - a.z, pad);
  }

  near(x, z, r) {
    return this.interactables.filter((o) => !o.hidden && Math.hypot(o.x - x, o.z - z) < r + (o.r || 0));
  }

  update(dt, camera, focus) {
    Fire.tick(dt);
    for (const f of this.fires) f.update(dt);
    this.lantern.position.set(focus.x, focus.y + 2.2, focus.z);
    for (const c of this.chests) if (c.opened && c.lid.rotation.x > -1.9) c.lid.rotation.x -= dt * 4;
    // Hand the few real lights to the nearest torches.
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.3;
      const near = this.torches.map((p) => [p, p.distanceToSquared(focus)]).sort((a, b) => a[1] - b[1]).slice(0, LIGHTS);
      this.pool.forEach((l, k) => {
        if (near[k]) {
          l.position.copy(near[k][0]);
          l.userData.on = true;
        } else l.userData.on = false;
      });
    }
    const t = performance.now() / 1000;
    this.pool.forEach((l, k) => (l.intensity = l.userData.on ? 7 + Math.sin(t * 11 + k * 3) * 0.9 + Math.sin(t * 23 + k) * 0.5 : 0));
  }
}

function pickSpread(cells, n, rnd) {
  const out = [];
  for (let tries = 0; tries < 60 && out.length < n && cells.length; tries++) {
    const c = cells[Math.floor(rnd() * cells.length)];
    if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > 2)) out.push(c);
  }
  return out;
}

function findMaterial(kit, name) {
  for (const part of kit.parts.values()) {
    let found = null;
    part.traverse((o) => {
      if (!found && o.isMesh) for (const m of [o.material].flat()) if (m.name === name) found = m;
    });
    if (found) return found;
  }
  return null;
}
