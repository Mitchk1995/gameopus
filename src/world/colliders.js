// Static collision for everything that isn't terrain: tree trunks, walls, floors,
// fences, props. Shapes live in a 2D grid over the ground plane and each has a
// vertical span, so a low step or a floor can be walked onto while a wall blocks.
//   circle: { x, z, r, y0, y1 }
//   box:    { x, z, hx, hz, rot, y0, y1 }  (rot turns the box like object.rotation.y)
// Flags: `floor` (walkable top), `noCamera` (the camera sees through it), `cameraOnly`
// (only the camera collides with it: ceilings, roofs and lintels that the player can't
// reach or would only snag on), `keepCamera` (the camera always collides with this shape,
// even where a real mesh also covers it: villagers). The camera itself prefers real
// geometry: shapes sitting under solid meshes are ignored by it (see world/solids.js).

const CELL = 8;

export class Colliders {
  constructor() {
    this.cells = new Map();
    this.stamp = 0;
    this.all = [];
  }

  addCircle(x, z, r, y0, y1, data = null) {
    return this.#insert({ kind: 'c', x, z, r, y0, y1, data, reach: r });
  }

  addBox(x, z, hx, hz, rot, y0, y1, data = null) {
    return this.#insert({ kind: 'b', x, z, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, data, reach: Math.hypot(hx, hz) });
  }

  remove(shape) {
    shape.removed = true;
  }

  #insert(sh) {
    sh.seen = 0;
    this.all.push(sh);
    const c0 = Math.floor((sh.x - sh.reach) / CELL), c1 = Math.floor((sh.x + sh.reach) / CELL);
    const r0 = Math.floor((sh.z - sh.reach) / CELL), r1 = Math.floor((sh.z + sh.reach) / CELL);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const k = c * 65536 + r;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(sh);
      }
    return sh;
  }

  // Every shape whose cell overlaps the square around (x, z).
  query(x, z, r, out = []) {
    out.length = 0;
    const st = ++this.stamp;
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
    const r0 = Math.floor((z - r) / CELL), r1 = Math.floor((z + r) / CELL);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const list = this.cells.get(c * 65536 + rr);
        if (!list) continue;
        for (const sh of list) {
          if (sh.seen === st || sh.removed) continue;
          sh.seen = st;
          out.push(sh);
        }
      }
    return out;
  }

  // Box-local coordinates of a world point (inverse of the box's rotation).
  static local(sh, x, z) {
    const dx = x - sh.x, dz = z - sh.z;
    return [dx * sh.c - dz * sh.s, dx * sh.s + dz * sh.c];
  }

  // Highest walkable shape top (decks, platforms: shapes marked .floor) under (x, z)
  // that feet at height y can step onto.
  groundAt(x, z, y, step, base) {
    let g = base;
    for (const sh of this.query(x, z, 0.01, this.tmp || (this.tmp = []))) {
      if (!sh.floor || sh.y1 > y + step || sh.y1 <= g) continue;
      if (sh.kind === 'c') {
        if ((x - sh.x) ** 2 + (z - sh.z) ** 2 < sh.r * sh.r) g = sh.y1;
      } else {
        const [lx, lz] = Colliders.local(sh, x, z);
        if (Math.abs(lx) <= sh.hx && Math.abs(lz) <= sh.hz) g = sh.y1;
      }
    }
    return g;
  }

  // Pushes a standing cylinder (feet at p.y, radius r, height h) out of every shape it
  // overlaps. Shapes low enough to step onto, or entirely overhead, don't block.
  push(p, r, h, step) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++)
      for (const sh of this.query(p.x, p.z, r + 1, this.tmp2 || (this.tmp2 = []))) {
        if (sh.cameraOnly || sh.y1 <= p.y + step || sh.y0 >= p.y + h) continue;
        if (sh.kind === 'c') {
          const dx = p.x - sh.x, dz = p.z - sh.z, d = Math.hypot(dx, dz), min = r + sh.r;
          if (d >= min) continue;
          const k = d > 1e-5 ? (min - d) / d : 0;
          p.x += d > 1e-5 ? dx * k : min;
          p.z += dz * k;
          hit = true;
        } else {
          const [lx, lz] = Colliders.local(sh, p.x, p.z);
          const cx = Math.max(-sh.hx, Math.min(sh.hx, lx)), cz = Math.max(-sh.hz, Math.min(sh.hz, lz));
          let nx = lx - cx, nz = lz - cz;
          let d = Math.hypot(nx, nz);
          if (d >= r) continue;
          let push;
          if (d > 1e-5) {
            push = r - d;
            nx /= d;
            nz /= d;
          } else {
            // Centre inside the box: leave by the nearest face.
            const px = sh.hx - Math.abs(lx), pz = sh.hz - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; }
            else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
          }
          // Back to world space.
          const wx = nx * sh.c + nz * sh.s, wz = -nx * sh.s + nz * sh.c;
          p.x += wx * push;
          p.z += wz * push;
          hit = true;
        }
      }
    return hit;
  }

  // Nearest hit along the segment o -> o + d, as a fraction in [0, 1] (1 = clear).
  raycast(ox, oy, oz, dx, dy, dz, pad = 0) {
    const len = Math.hypot(dx, dz);
    const mx = ox + dx / 2, mz = oz + dz / 2;
    let best = 1;
    for (const sh of this.query(mx, mz, len / 2 + 1, this.tmp3 || (this.tmp3 = []))) {
      if (sh.noCamera || sh.cameraOnly) continue;
      let t;
      if (sh.kind === 'c') t = rayCylinder(ox - sh.x, oz - sh.z, dx, dz, sh.r + pad);
      else {
        const [lx, lz] = Colliders.local(sh, ox, oz);
        const ldx = dx * sh.c - dz * sh.s, ldz = dx * sh.s + dz * sh.c;
        t = raySlab(lx, ldx, -sh.hx - pad, sh.hx + pad, lz, ldz, -sh.hz - pad, sh.hz + pad);
      }
      if (t === null || t >= best) continue;
      // Check the height span at the entry point.
      const y = oy + dy * Math.max(0, t);
      if (y < sh.y0 - pad || y > sh.y1 + pad) continue;
      best = Math.max(0, t);
    }
    return best;
  }

  // How far a camera-sized ball can travel along o -> o + d before it would touch a solid,
  // as a fraction in [0, 1] (1 = clear). Unlike raycast this is fully 3D (a ceiling above
  // the start blocks a ray that climbs to it), honours ceilings and roofs (cameraOnly),
  // and a start that is already closer to a solid than `pad` may still press on down to
  // `tight` from it (but no nearer), so hugging a wall or brushing a door jamb doesn't
  // collapse the view.
  // `skip(shape)` retires shapes the caller has better data for (see World.lineOfSight).
  sweep(ox, oy, oz, dx, dy, dz, pad, tight = 0.14, skip = null) {
    const len = Math.hypot(dx, dz);
    let best = 1;
    for (const sh of this.query(ox + dx / 2, oz + dz / 2, len / 2 + 1, this.tmp3 || (this.tmp3 = []))) {
      if (sh.noCamera || (skip && skip(sh))) continue;
      // Clearance from the start to the solid: the biggest gap on any axis.
      const gy = Math.max(sh.y0 - oy, oy - sh.y1);
      let gap, lx = 0, lz = 0, ldx = 0, ldz = 0;
      if (sh.kind === 'c') gap = Math.max(Math.hypot(ox - sh.x, oz - sh.z) - sh.r, gy);
      else {
        [lx, lz] = Colliders.local(sh, ox, oz);
        ldx = dx * sh.c - dz * sh.s;
        ldz = dx * sh.s + dz * sh.c;
        gap = Math.max(Math.abs(lx) - sh.hx, Math.abs(lz) - sh.hz, gy);
      }
      if (gap <= 1e-4) return 0;
      const e = gap >= pad ? pad : gap > tight + 1e-3 ? tight : gap - 1e-4;
      // Time span inside the solid grown by e, on each axis.
      let a = 0, b = Math.min(1, best);
      const y = slab(oy, dy, sh.y0 - e, sh.y1 + e);
      if (!y) continue;
      a = Math.max(a, y[0]);
      b = Math.min(b, y[1]);
      if (a >= b) continue;
      if (sh.kind === 'c') {
        const r = sh.r + e, ex = ox - sh.x, ez = oz - sh.z, qa = dx * dx + dz * dz;
        if (qa < 1e-9) {
          if (ex * ex + ez * ez >= r * r) continue;
        } else {
          const qb = ex * dx + ez * dz, disc = qb * qb - qa * (ex * ex + ez * ez - r * r);
          if (disc <= 0) continue;
          const sq = Math.sqrt(disc);
          a = Math.max(a, (-qb - sq) / qa);
          b = Math.min(b, (-qb + sq) / qa);
        }
      } else {
        const sx = slab(lx, ldx, -sh.hx - e, sh.hx + e), sz = slab(lz, ldz, -sh.hz - e, sh.hz + e);
        if (!sx || !sz) continue;
        a = Math.max(a, sx[0], sz[0]);
        b = Math.min(b, sx[1], sz[1]);
      }
      if (a < b && a < best) best = a;
    }
    return best;
  }
}

// Span of t in which o + t d lies within [lo, hi], or null if never.
function slab(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return o > lo && o < hi ? [-Infinity, Infinity] : null;
  const a = (lo - o) / d, b = (hi - o) / d;
  return a < b ? [a, b] : [b, a];
}

// Entry fraction of a 2D ray into a circle at the origin, or null.
function rayCylinder(ox, oz, dx, dz, r) {
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return ox * ox + oz * oz < r * r ? 0 : null;
  const b = ox * dx + oz * dz, c = ox * ox + oz * oz - r * r;
  if (c < 0) return 0;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

// Entry fraction of a 2D ray into an axis-aligned rectangle, or null.
function raySlab(ox, dx, x0, x1, oz, dz, z0, z1) {
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
