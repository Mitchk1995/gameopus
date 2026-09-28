// Uniform grid for fast "who is near this point" queries on moving entities.
export class SpatialHash {
  constructor(cell = 2.5) {
    this.cell = cell;
    this.map = new Map();
    this.pool = [];
  }
  clear() {
    for (const arr of this.map.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.map.clear();
  }
  key(ix, iz) {
    return (ix + 40000) * 80021 + (iz + 40000);
  }
  insert(o) {
    const k = this.key(Math.floor(o.x / this.cell), Math.floor(o.z / this.cell));
    let a = this.map.get(k);
    if (!a) {
      a = this.pool.pop() || [];
      this.map.set(k, a);
    }
    a.push(o);
  }
  // Entities whose circle overlaps the query circle.
  query(x, z, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r - 1.5) / c), x1 = Math.floor((x + r + 1.5) / c);
    const z0 = Math.floor((z - r - 1.5) / c), z1 = Math.floor((z + r + 1.5) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.map.get(this.key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const o = a[i];
          const dx = o.x - x, dz = o.z - z, rr = r + o.radius;
          if (dx * dx + dz * dz <= rr * rr) out.push(o);
        }
      }
    }
    return out;
  }
}
