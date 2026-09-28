import * as THREE from 'three';
import { Sky } from './sky.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Forest } from './trees.js';
import { Colliders } from './colliders.js';
import { Grass } from './grass.js';
import { Village } from './village.js';
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
    this.village = await new Village({ ...ctx, world: this }).load();
    for (const t of this.forest.trees) {
      if (t.radius > 0.05) t.collider = this.colliders.addCircle(t.x, t.z, t.radius, t.y - 2, t.y + 40, { tree: t });
    }
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

  // Fraction of the segment from a to b that is clear of terrain and solid shapes.
  lineOfSight(a, b, pad = 0.2) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let t = this.colliders.raycast(a.x, a.y, a.z, dx, dy, dz, pad);
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

  update(dt, camera, focus) {
    this.focus.copy(focus);
    this.grass.update(dt, focus, focus);
    this.sky.update(camera, focus);
    this.terrain.update(camera);
    this.water.update(dt);
    this.forest.update(dt, camera);
    for (const u of this.updaters) u(dt, camera, focus);
  }
}
