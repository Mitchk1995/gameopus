// Static collision for everything that isn't terrain: tree trunks, walls, floors,
// fences, props. Shapes live in a 2D grid over the ground plane and each has a
// vertical span, so a low step or a floor can be walked onto while a wall blocks.
//   circle: { x, z, r, y0, y1 }
//   box:    { x, z, hx, hz, rot, y0, y1 }  (rot turns the box like object.rotation.y)

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
        if (sh.y1 <= p.y + step || sh.y0 >= p.y + h) continue;
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
      if (sh.noCamera) continue;
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
