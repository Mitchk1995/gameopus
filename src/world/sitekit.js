import * as THREE from 'three';
import { TownKit } from './townkit.js';
import { fitUV } from './props.js';

// Building blocks for the structures out in the vale (bridge, gatehouse, towers, palisades, ruins),
// on top of TownKit so every piece is batched, world-scale textured, grouped for the geometry
// audit, and gets colliders where a person could bump into it.
//
// Structures are drawn in a local frame: origin (ox, oz), turned by yaw like a building (its front
// faces (sin yaw, cos yaw)); lx runs along the front, lz out of it. Heights are absolute (world y).

export function frame(ox, oz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { ox, oz, yaw, c, s, at: (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c] };
}

export class SiteKit extends TownKit {
  constructor(...args) {
    super(...args);
    // Keep our pieces' audit ids apart from the village's own TownKit.
    this.nid = 1000000;
  }

  ground(x, z) {
    return this.world.heightAt(x, z);
  }

  // The lowest terrain under a rectangle in a frame (sampled), for foundations.
  lowest(f, lx, lz, w, d) {
    let y = Infinity;
    for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) {
      const [x, z] = f.at(lx + a * w, lz + b * d);
      y = Math.min(y, this.ground(x, z));
    }
    return y;
  }

  highest(f, lx, lz, w, d) {
    let y = -Infinity;
    for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) {
      const [x, z] = f.at(lx + a * w, lz + b * d);
      y = Math.max(y, this.ground(x, z));
    }
    return y;
  }

  // A solid oriented box: local centre (lx, lz), w along the front, d out of it, from `bottom` (default
  // the lowest ground under it, less a hand to sink into the slope) up to the absolute height `top`.
  // Adds a collider unless `solid` is false; low tops (a metre or less) are standable.
  block(f, lx, lz, w, d, top, mat, { bottom = null, turn = 0, tile = 0, solid = true, colliderTop = null, camera = true } = {}) {
    const [x, z] = f.at(lx, lz);
    const y0 = bottom ?? this.lowest(f, lx, lz, w, d) - 0.35;
    const rot = f.yaw + turn;
    this.put(this.box(w, top - y0, d, tile), mat, x, y0, z, rot);
    if (!solid) return null;
    const sh = this.colliders.addBox(x, z, w / 2, d / 2, rot, y0, colliderTop ?? top);
    if (top - y0 <= 1.02 && bottom !== null) sh.floor = true;
    if (!camera) sh.noCamera = true;
    return sh;
  }

  // A round column or cone (r0 at the bottom, r1 at the top).
  column(f, lx, lz, r0, r1, y0, h, mat, { seg = 10, solid = true, turn = 0 } = {}) {
    const [x, z] = f.at(lx, lz);
    this.put(this.cyl(r0, r1, h, seg), mat, x, y0, z, f.yaw + turn);
    if (!solid) return null;
    return this.colliders.addCircle(x, z, Math.max(r0, r1), y0 - 0.2, y0 + h);
  }

  // Any extruded profile: points [[x, y], ...] in the frame's (lx, y) plane, thickness d (centred on lz),
  // placed at local (lx, lz) with its origin at absolute height y0. `holes` are more point loops.
  profile(f, lx, lz, y0, pts, d, mat, { holes = [], turn = 0 } = {}) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 12 });
    geo.translate(0, 0, -d / 2);
    const [x, z] = f.at(lx, lz);
    this.put(geo, mat, x, y0, z, f.yaw + turn);
  }

  // A solid collider box for something drawn by hand, in a frame.
  wall(f, lx, lz, w, d, y0, y1, { turn = 0, floor = false, camera = true } = {}) {
    const [x, z] = f.at(lx, lz);
    const sh = this.colliders.addBox(x, z, w / 2, d / 2, f.yaw + turn, y0, y1);
    if (floor) sh.floor = true;
    if (!camera) sh.noCamera = true;
    return sh;
  }

  // A tile-roofed cone or pyramid on a tower (4 = pyramid, 8 = a round-ish cone).
  spire(f, lx, lz, r, y0, h, seg = 8) {
    const [x, z] = f.at(lx, lz);
    this.put(this.cyl(0.03, r, h, seg), this.m.tiles, x, y0, z, f.yaw + Math.PI / seg);
  }

  // Merlons along the top of a wall run: `count` blocks across a span, standing on `top`.
  merlons(f, lx, lz, len, top, { thick = 0.7, height = 0.9, along = 'x', gap = 0.9, mat = this.m.stone, solid = true } = {}) {
    const n = Math.max(1, Math.floor(len / (1.0 + gap)));
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const c = -len / 2 + step * (i + 0.5);
      const bx = along === 'x' ? lx + c : lx, bz = along === 'x' ? lz : lz + c;
      const w = along === 'x' ? step - gap : thick, d = along === 'x' ? thick : step - gap;
      const [x, z] = f.at(bx, bz);
      this.put(this.box(w, height, d), mat, x, top, z, f.yaw);
    }
  }

  // Deals a scatter of boulders into a group of fixed size, each with its own collider.
  boulder(geo, x, y, z, rot, size, { solid = true, squash = 1 } = {}) {
    this.put(geo, this.m.rock, x, y, z, rot, size, size * squash, size);
    if (solid) return this.colliders.addCircle(x, z, size * 0.8, y - 0.3, y + size * 1.1 * squash);
    return null;
  }
}
