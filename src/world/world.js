import * as THREE from 'three';
import { Sky } from './sky.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Forest } from './trees.js';
import { Colliders } from './colliders.js';
import { Solids } from './solids.js';
import { Grass } from './grass.js';
import { Plants } from './plants.js';
import { Falls } from './falls.js';
import { Mood } from './mood.js';
import { Village } from './village.js';
import { Sites } from './sites.js';
import { LakesideHome } from './lakeside-home.js';
import { WORLD } from './map.js';

export const STEP = 0.45;

// The outdoor world: sky, ground, water, forests and everything solid in them, with
// the queries the player and camera need (ground height, collision, line of sight).
export class World {
  constructor({ renderer, scene, assets }) {
    this.renderer = renderer;
    this.scene = scene;
    this.assets = assets;
    this.colliders = new Colliders();
    // Triangles of every static solid mesh, for the camera (see solids.js).
    this.solids = new Solids();
    this.solidScan = -1;
    this.updaters = [];
    this.focus = new THREE.Vector3();
  }

  async load() {
    const ctx = { renderer: this.renderer, scene: this.scene, assets: this.assets };
    this.sky = await new Sky(ctx).load();
    this.terrain = await new Terrain(ctx).load();
    this.water = new Water({ scene: this.scene, terrain: this.terrain });
    this.forest = await new Forest({ ...ctx, terrain: this.terrain }).load();
    this.grass = new Grass({ scene: this.scene, terrain: this.terrain });
    this.plants = new Plants({ scene: this.scene, terrain: this.terrain, leaves: this.forest.leafTex });
    this.village = await new Village({ ...ctx, world: this }).load();
    this.sites = await new Sites({ ...ctx, world: this }).load();
    this.lakeside = await new LakesideHome({ ...ctx, world: this }).load();
    this.updaters.push((dt) => this.sites.update(dt));
    this.falls = new Falls({ scene: this.scene, world: this });
    this.mood = new Mood({ scene: this.scene, sky: this.sky });
    this.updaters.push((dt, camera, focus) => { this.falls.update(dt); this.mood.update(dt, focus); });
    for (const t of this.forest.trees) {
      if (t.radius > 0.05) t.collider = this.colliders.addCircle(t.x, t.z, t.radius, t.y - 2, t.y + 40, { tree: t });
    }
    this.#syncSolids();
    return this;
  }

  heightAt(x, z) {
    return this.terrain.heightAt(x, z);
  }

  // Where feet at height y come to rest: the terrain or anything built on it.
  groundAt(x, z, y) {
    return this.colliders.groundAt(x, z, y, STEP, this.terrain.heightAt(x, z));
  }

  waterDepth(x, z) {
    return WORLD.water - this.terrain.heightAt(x, z);
  }

  // Index any solid meshes that have joined the scene (cheap unless the scene changed).
  #syncSolids() {
    if (this.solidScan === this.scene.children.length) return;
    this.solidScan = this.scene.children.length;
    this.solids.collect(this.scene);
  }

  // The camera ignores hand-made colliders that a real mesh already covers (walls, roofs,
  // lintels, props of every building), and keeps the rest (trees, villagers, other props).
  cameraIgnores(sh) {
    return this.#covered(sh);
  }

  #covered(sh) {
    if (sh.keepCamera || sh.data?.tree) return false;
    if (sh.camVer !== this.solids.version) {
      sh.camVer = this.solids.version;
      sh.camCovered = this.solids.covers(sh);
    }
    return sh.camCovered;
  }

  // Fraction of the segment from a to b that is clear of terrain and solid shapes.
  // `camera` sweeps a camera-sized ball instead of a thin ray: fully 3D, against the real
  // triangles of every solid mesh (roofs, eaves, chimneys, walls, props) plus the colliders
  // that have no mesh behind them, so ceilings and roofs hold it in as well.
  lineOfSight(a, b, pad = 0.2, camera = false, tight = 0.14) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let t;
    if (camera) {
      this.#syncSolids();
      t = this.colliders.sweep(a.x, a.y, a.z, dx, dy, dz, pad, tight, this.skipCovered || (this.skipCovered = (sh) => this.#covered(sh)));
      if (t > 0) t = Math.min(t, this.solids.sweep(a.x, a.y, a.z, dx, dy, dz, pad, tight));
    } else t = this.colliders.raycast(a.x, a.y, a.z, dx, dy, dz, pad);
    // March the terrain in half-metre steps.
    const n = Math.ceil(Math.hypot(dx, dz) / 0.5);
    for (let i = 1; i <= n; i++) {
      const f = (i / n) * t;
      const x = a.x + dx * f, y = a.y + dy * f, z = a.z + dz * f;
      if (y < this.terrain.heightAt(x, z) + pad) {
        t = Math.max(0, ((i - 1) / n) * t);
        break;
      }
    }
    return t;
  }

  // Called by the camera each frame with the head and the reach it may need: keeps the local
  // triangle list around it.
  prepareCamera(p, r) {
    this.#syncSolids();
    this.solids.prepare(p.x, p.y, p.z, Math.max(5.2, r));
  }

  // How enclosed a point is, 0 (open air) to 1 (in a closed room): a ceiling overhead and
  // walls all round, found by casting rays into the real geometry. It lets the camera know
  // it is indoors and behave (see camera-rig.js).
  enclosure(x, y, z) {
    this.#syncSolids();
    const S = this.solids;
    S.prepare(x, y, z, 5.2);
    const up = S.ray(x, y, z, 0, 5, 0);
    if (up >= 1) return 0;
    let hit = 0;
    const N = 8;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      if (S.ray(x, y, z, Math.sin(a) * 5, 0, Math.cos(a) * 5) < 1) hit++;
    }
    return (hit / N) * Math.min(1, (1 - up) * 2 + 0.3);
  }

  update(dt, camera, focus) {
    this.focus.copy(focus);
    this.grass.update(dt, focus, focus);
    this.plants.update(dt, focus);
    this.sky.update(camera, focus);
    this.terrain.update(camera);
    this.water.update(dt);
    this.forest.update(dt, camera);
    for (const u of this.updaters) u(dt, camera, focus);
  }
}
