import * as THREE from 'three';
import { WORLD, FALLS, RIVER, fbm, rimDistance, biomeAt, rings, riverAt, roadDistance, siteClearance, exitCalm } from './map.js';
import { greyStone } from './fields.js';

// Loose rock out in the vale: outcrops breaking through the heath, boulders fallen from the wall
// lying along its foot and on the scree, rocks round the falls pool and in the quick upper river,
// and a few in bandit country. Each boulder is a knobbly, half-buried stone from a handful of
// shapes, batched with the other sites (one draw call) and given a round collider; small ones are
// step-over clutter. Placed from a seeded random walk, so the vale is the same every time.

export function buildRocks(sk, assets) {
  return assets.texture('ground/cliff_a.webp').then((map) => {
    const mat = greyStone(new THREE.MeshStandardMaterial({ map, color: 0x9a9791, roughness: 0.94, metalness: 0 }));
    mat.name = 'ValeRock';
    const shapes = [0, 1, 2, 3, 4].map((i) => rockGeometry(i));
    const w = sk.world;
    let seed = 90210;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const placed = [];
    const free = (x, z, r) => {
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + r + 0.4)) return false;
      if (w.forest.near(x, z, r + 0.6).length) return false;
      const [rd, rw] = roadDistance(x, z);
      return rd > rw + r + 1.2 && siteClearance(x, z) > r + 2;
    };
    const stone = (x, z, size, { squash = 0.7, bury = 0.25, water = false } = {}) => {
      const gy = w.heightAt(x, z);
      if (!water && gy < 0.3) return false;
      if (!free(x, z, size)) return false;
      // Level enough to sit on.
      const n = w.terrain.normalAt(x, z);
      if (n.y < 0.72) return false;
      const geo = shapes[Math.floor(rnd() * shapes.length)];
      const h = size * squash, y0 = lowest(w, x, z, size * 0.7) - h * bury;
      sk.begin('Boulders', x, z);
      sk.put(geo, mat, x, y0, z, rnd() * 6.283, size, h, size * (0.8 + rnd() * 0.4));
      const top = y0 + h * 0.92;
      if (top - Math.max(gy, 0) > 0.45) {
        const sh = sk.colliders.addCircle(x, z, size * 0.72, y0, top);
        if (top - gy <= 1.02) sh.floor = true;
      }
      placed.push([x, z, size]);
      return true;
    };

    // Outcrops on the heath: knots of grey rock where the heath is barest.
    for (let i = 0; i < 1400; i++) {
      const x = -60 + rnd() * 260, z = -260 + rnd() * 200;
      const heath = biomeAt(x, z)[1];
      if (heath < 0.55 || rnd() > heath * 0.5) continue;
      if (fbm(x * 0.03 + 4, z * 0.03 - 2) < 0.52) continue;
      const n = 2 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.283, d = k === 0 ? 0 : 1.2 + rnd() * 3.5;
        stone(x + Math.cos(a) * d, z + Math.sin(a) * d, k === 0 ? 1.3 + rnd() * 1.2 : 0.4 + rnd() * 1.0, { squash: 0.6 + rnd() * 0.25 });
      }
    }
    // Fallen from the wall: along its foot and out over the scree fans (not in the passes).
    for (let i = 0; i < 5000; i++) {
      const x = -WORLD.half + 40 + rnd() * (WORLD.size - 80), z = -WORLD.half + 40 + rnd() * (WORLD.size - 80);
      const d = rimDistance(x, z);
      if (d < -24 || d > 6 || exitCalm(x, z) < 1) continue;
      const scree = biomeAt(x, z)[5];
      if (rnd() > 0.08 + scree * 0.5) continue;
      stone(x, z, 0.35 + rnd() * rnd() * 2.2, { squash: 0.55 + rnd() * 0.3, bury: 0.2 });
    }
    // Round the falls pool and down the quick upper river, some standing in the water.
    const [px, pz] = FALLS.pool;
    for (let i = 0; i < 70; i++) {
      const a = rnd() * 6.283, d = 9 + rnd() * 10;
      stone(px + Math.cos(a) * d, pz + Math.sin(a) * d * 0.9, 0.5 + rnd() * 1.4, { water: true, bury: 0.3 });
    }
    for (let i = 0; i < RIVER.length - 1; i++) {
      const q = riverAt(RIVER[i][0], RIVER[i][1]);
      if (!q || q.t > 0.3) continue;
      for (let k = 0; k < 3; k++) {
        if (rnd() > 0.55) continue;
        const side = rnd() < 0.5 ? -1 : 1, off = q.hw * (0.3 + rnd() * 1.1);
        const x = RIVER[i][0] - q.tz * side * off, z = RIVER[i][1] + q.tx * side * off;
        stone(x, z, 0.45 + rnd() * 1.1, { water: true, bury: 0.35 });
      }
    }
    // Bandit country: rock breaking the dry grass here and there.
    for (let i = 0; i < 900; i++) {
      const x = 150 + rnd() * 200, z = -200 + rnd() * 400;
      if (rings(x, z).bandit < 0.55 || rnd() > 0.12) continue;
      stone(x, z, 0.5 + rnd() * 1.4, { squash: 0.6 });
    }
    return placed.length;
  });
}

// The lowest ground under a stone's footprint, so no side of it hangs in the air.
function lowest(w, x, z, r) {
  let y = w.heightAt(x, z);
  for (let k = 0; k < 6; k++) y = Math.min(y, w.heightAt(x + Math.cos(k * 1.047) * r, z + Math.sin(k * 1.047) * r));
  return y;
}

// A boulder of unit footprint radius and unit height, standing on y = 0: a lumpy, flat-bottomed
// stone with facets, its UVs boxed on by metres so the rock grain keeps its size.
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 1.3 + seed * 7.1, v.z * 1.3 + v.y * 1.7 - seed * 3.3, 3);
    const flat = Math.floor((v.x * 2.1 + v.y * 1.3 + seed) * 1.5) * 0.02;
    v.multiplyScalar(0.78 + n * 0.45 + flat);
    v.y = v.y < -0.1 ? -0.1 + (v.y + 0.1) * 0.15 : v.y;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  const b = g.boundingBox;
  const sx = 2 / (b.max.x - b.min.x), sy = 1 / (b.max.y - b.min.y), sz = 2 / (b.max.z - b.min.z);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(sx, sy, sz);
  g.computeVertexNormals();
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / 1.6, z / 1.6);
    else if (ax >= az) uv.setXY(i, z / 1.6, y / 1.6);
    else uv.setXY(i, x / 1.6, y / 1.6);
  }
  return g;
}
