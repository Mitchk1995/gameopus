import * as THREE from 'three';

// The camera's view of the world's solid, rendered geometry.
//
// Instead of hand-placed camera colliders, this indexes the actual triangles of every static
// mesh that is flagged solid (the kit batcher flags all of its output, see kit.js; anything
// else can be added with addObject) in a 2D grid, and sweeps a camera-sized ball through
// them: exact sphere-versus-triangle contact, so roofs, eaves, chimneys, lintels, props and
// interiors hold the camera off wherever they really are, for any building added later.
//
// Cost control: a sweep only ever looks at a small local list. `#ensure` gathers the
// triangles around the query into typed arrays (with plane normals and bounds), keeps them
// while later queries stay inside that box, and the rig's dozen sweeps per frame share it.

const CELL = 2;
const KEY = 100003;
const TOUCH = 2e-5; // metres: closer than this to a contact distance counts as touching
const EPS2 = 1e-5;

export class Solids {
  constructor() {
    this.n = 0;
    this.v = new Float32Array(9 * 4096);
    this.cells = new Map();
    this.version = 0;
    this.L = { n: 0, cap: 0, a: null, e1: null, e2: null, nr: null, bb: null };
    this.box = null;
    this.boxVersion = -1;
    this.scratch = [];
    this.marks = new Int32Array(0);
    this.stamp = 0;
    this.tmpV = new THREE.Vector3();
  }

  get size() {
    return this.n;
  }

  // Every triangle of a mesh (skinned and instanced meshes are skipped: they move). A mesh
  // may carry userData.camMask, one byte per triangle, 0 = decorative, passes through.
  addMesh(mesh) {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.userData.camIndexed) return 0;
    mesh.userData.camIndexed = true;
    mesh.userData.camSolid = true;
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index, mask = mesh.userData.camMask;
    const count = idx ? idx.count / 3 : pos.count / 3;
    const m = mesh.matrixWorld.elements, v = this.tmpV, p = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let added = 0;
    for (let t = 0; t < count; t++) {
      if (mask && !mask[t]) continue;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k);
        // matrixWorld * v (affine)
        p[k * 3] = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
        p[k * 3 + 1] = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
        p[k * 3 + 2] = m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14];
      }
      if (this.#add(p)) added++;
    }
    this.version++;
    return added;
  }

  // Everything drawn under an object (a hand-built prop, a well, a cave mouth).
  addObject(obj) {
    let n = 0;
    obj.traverse((o) => {
      if (o.isMesh && !o.userData.noCamera) n += this.addMesh(o);
    });
    return n;
  }

  // Any camSolid mesh under root that isn't in yet. Cheap when nothing is new.
  collect(root) {
    let n = 0;
    root.traverse((o) => {
      if (o.isMesh && o.userData.camSolid && !o.userData.camIndexed) n += this.addMesh(o);
    });
    return n;
  }

  #add(p) {
    // Skip slivers with no area.
    const e1x = p[3] - p[0], e1y = p[4] - p[1], e1z = p[5] - p[2], e2x = p[6] - p[0], e2y = p[7] - p[1], e2z = p[8] - p[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-12) return false;
    if ((this.n + 1) * 9 > this.v.length) {
      const bigger = new Float32Array(this.v.length * 2);
      bigger.set(this.v);
      this.v = bigger;
    }
    const id = this.n++;
    this.v.set(p, id * 9);
    const x0 = Math.min(p[0], p[3], p[6]), x1 = Math.max(p[0], p[3], p[6]);
    const z0 = Math.min(p[2], p[5], p[8]), z1 = Math.max(p[2], p[5], p[8]);
    for (let cz2 = Math.floor(z0 / CELL); cz2 <= Math.floor(z1 / CELL); cz2++)
      for (let cx2 = Math.floor(x0 / CELL); cx2 <= Math.floor(x1 / CELL); cx2++) {
        const key = cx2 * KEY + cz2;
        let l = this.cells.get(key);
        if (!l) this.cells.set(key, (l = []));
        l.push(id);
      }
    return true;
  }

  // Keep the local list around a point (radius r) so the queries that follow reuse it.
  prepare(x, y, z, r) {
    this.#ensure(x - r, y - r, z - r, x + r, y + r, z + r);
  }

  // Make the local list cover the box (grown by a margin so a moving camera reuses it).
  #ensure(x0, y0, z0, x1, y1, z1) {
    const b = this.box;
    if (b && this.boxVersion === this.version && x0 >= b[0] && y0 >= b[1] && z0 >= b[2] && x1 <= b[3] && y1 <= b[4] && z1 <= b[5]) return;
    const M = 1.6;
    const nb = [x0 - M, y0 - M, z0 - M, x1 + M, y1 + M, z1 + M];
    this.box = nb;
    this.boxVersion = this.version;
    if (this.marks.length < this.n) this.marks = new Int32Array(this.n + 4096);
    const st = ++this.stamp, marks = this.marks, V = this.v;
    const L = this.L;
    L.n = 0;
    for (let cz = Math.floor(nb[2] / CELL); cz <= Math.floor(nb[5] / CELL); cz++)
      for (let cx = Math.floor(nb[0] / CELL); cx <= Math.floor(nb[3] / CELL); cx++) {
        const list = this.cells.get(cx * KEY + cz);
        if (!list) continue;
        for (let q = 0; q < list.length; q++) {
          const id = list[q];
          if (marks[id] === st) continue;
          marks[id] = st;
          const o = id * 9;
          const minY = Math.min(V[o + 1], V[o + 4], V[o + 7]), maxY = Math.max(V[o + 1], V[o + 4], V[o + 7]);
          if (maxY < nb[1] || minY > nb[4]) continue;
          const minX = Math.min(V[o], V[o + 3], V[o + 6]), maxX = Math.max(V[o], V[o + 3], V[o + 6]);
          const minZ = Math.min(V[o + 2], V[o + 5], V[o + 8]), maxZ = Math.max(V[o + 2], V[o + 5], V[o + 8]);
          if (maxX < nb[0] || minX > nb[3] || maxZ < nb[2] || minZ > nb[5]) continue;
          this.#local(o, minX, minY, minZ, maxX, maxY, maxZ);
        }
      }
  }

  #local(o, minX, minY, minZ, maxX, maxY, maxZ) {
    const L = this.L, V = this.v;
    if (L.n >= L.cap) {
      const cap = Math.max(1024, L.cap * 2);
      const grow = (old, k) => {
        const a = new Float32Array(cap * k);
        if (old) a.set(old.subarray(0, L.n * k));
        return a;
      };
      L.a = grow(L.a, 3);
      L.e1 = grow(L.e1, 3);
      L.e2 = grow(L.e2, 3);
      L.nr = grow(L.nr, 3);
      L.bb = grow(L.bb, 6);
      L.cap = cap;
    }
    const i = L.n++, i3 = i * 3;
    L.a[i3] = V[o]; L.a[i3 + 1] = V[o + 1]; L.a[i3 + 2] = V[o + 2];
    const e1x = V[o + 3] - V[o], e1y = V[o + 4] - V[o + 1], e1z = V[o + 5] - V[o + 2];
    const e2x = V[o + 6] - V[o], e2y = V[o + 7] - V[o + 1], e2z = V[o + 8] - V[o + 2];
    L.e1[i3] = e1x; L.e1[i3 + 1] = e1y; L.e1[i3 + 2] = e1z;
    L.e2[i3] = e2x; L.e2[i3 + 1] = e2y; L.e2[i3 + 2] = e2z;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    L.nr[i3] = nx / nl; L.nr[i3 + 1] = ny / nl; L.nr[i3 + 2] = nz / nl;
    const b = i * 6;
    L.bb[b] = minX; L.bb[b + 1] = minY; L.bb[b + 2] = minZ; L.bb[b + 3] = maxX; L.bb[b + 4] = maxY; L.bb[b + 5] = maxZ;
  }

  // Does any solid triangle have its centre inside the vertical prism (a circle or a rotated
  // box in the ground plane, between y0 and y1)? Used to retire hand-made colliders that a
  // real mesh already covers. `slack` grows the footprint a little.
  covers(sh, slack = 0.15) {
    const reach = sh.reach + slack;
    const V = this.v;
    const c0 = Math.floor((sh.x - reach) / CELL), c1 = Math.floor((sh.x + reach) / CELL);
    const r0 = Math.floor((sh.z - reach) / CELL), r1 = Math.floor((sh.z + reach) / CELL);
    if (this.marks.length < this.n) this.marks = new Int32Array(this.n + 4096);
    const st = ++this.stamp, marks = this.marks;
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const list = this.cells.get(c * KEY + r);
        if (!list) continue;
        for (const id of list) {
          if (marks[id] === st) continue;
          marks[id] = st;
          const o = id * 9;
          const x = (V[o] + V[o + 3] + V[o + 6]) / 3, y = (V[o + 1] + V[o + 4] + V[o + 7]) / 3, z = (V[o + 2] + V[o + 5] + V[o + 8]) / 3;
          if (y < sh.y0 - slack || y > sh.y1 + slack) continue;
          if (sh.kind === 'c') {
            if (Math.hypot(x - sh.x, z - sh.z) < sh.r + slack) return true;
          } else {
            const dx = x - sh.x, dz = z - sh.z;
            const lx = dx * sh.c - dz * sh.s, lz = dx * sh.s + dz * sh.c;
            if (Math.abs(lx) < sh.hx + slack && Math.abs(lz) < sh.hz + slack) return true;
          }
        }
      }
    return false;
  }

  describe(i) {
    const L = this.L, i3 = i * 3;
    const f = (a, b, c) => `(${a.toFixed(2)},${b.toFixed(2)},${c.toFixed(2)})`;
    return `tri@${f(L.a[i3], L.a[i3 + 1], L.a[i3 + 2])} n${f(L.nr[i3], L.nr[i3 + 1], L.nr[i3 + 2])} e1${f(L.e1[i3], L.e1[i3 + 1], L.e1[i3 + 2])} e2${f(L.e2[i3], L.e2[i3 + 1], L.e2[i3 + 2])}`;
  }

  // Debug: distance from a point to the nearest solid triangle (within 3 m).
  clearance(x, y, z) {
    this.#ensure(x - 3, y - 3, z - 3, x + 3, y + 3, z + 3);
    const L = this.L;
    let best = Infinity, at = -1;
    for (let i = 0; i < L.n; i++) {
      const d = distSq(L, i * 3, x, y, z);
      if (d < best) { best = d; at = i; }
    }
    this.lastHit = at;
    return Math.sqrt(best);
  }

  // Distance along a ray (direction need not be unit) before it hits a solid, as a fraction
  // of the vector's length, or 1 when clear.
  ray(ox, oy, oz, dx, dy, dz) {
    const x0 = Math.min(ox, ox + dx), x1 = Math.max(ox, ox + dx), y0 = Math.min(oy, oy + dy), y1 = Math.max(oy, oy + dy), z0 = Math.min(oz, oz + dz), z1 = Math.max(oz, oz + dz);
    this.#ensure(x0, y0, z0, x1, y1, z1);
    const L = this.L;
    let best = 1;
    for (let i = 0; i < L.n; i++) {
      const b = i * 6;
      if (L.bb[b] > x1 || L.bb[b + 3] < x0 || L.bb[b + 1] > y1 || L.bb[b + 4] < y0 || L.bb[b + 2] > z1 || L.bb[b + 5] < z0) continue;
      const i3 = i * 3;
      const e1x = L.e1[i3], e1y = L.e1[i3 + 1], e1z = L.e1[i3 + 2], e2x = L.e2[i3], e2y = L.e2[i3 + 1], e2z = L.e2[i3 + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - L.a[i3], sy = oy - L.a[i3 + 1], sz = oz - L.a[i3 + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const w = (dx * qx + dy * qy + dz * qz) * inv;
      if (w < 0 || u + w > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  // How far a ball of radius `pad` can travel along o -> o + d before touching a solid, as a
  // fraction of d in [0, 1] (1 = clear). A start already nearer than `pad` to a triangle may
  // press on down to `tight` from it (never nearer than it is now), so hugging a wall or
  // brushing a door jamb doesn't collapse the view; a start inside geometry returns 0.
  sweep(ox, oy, oz, dx, dy, dz, pad, tight = 0.14) {
    const x0 = Math.min(ox, ox + dx) - pad, x1 = Math.max(ox, ox + dx) + pad;
    const y0 = Math.min(oy, oy + dy) - pad, y1 = Math.max(oy, oy + dy) + pad;
    const z0 = Math.min(oz, oz + dz) - pad, z1 = Math.max(oz, oz + dz) + pad;
    this.#ensure(x0, y0, z0, x1, y1, z1);
    const L = this.L, bb = L.bb;
    const dd = dx * dx + dy * dy + dz * dz;
    let best = 1;
    if (dd < 1e-12) return 1;
    for (let i = 0; i < L.n; i++) {
      const b = i * 6;
      if (bb[b] > x1 || bb[b + 3] < x0 || bb[b + 1] > y1 || bb[b + 4] < y0 || bb[b + 2] > z1 || bb[b + 5] < z0) continue;
      const i3 = i * 3;
      const nx = L.nr[i3], ny = L.nr[i3 + 1], nz = L.nr[i3 + 2];
      const ax = L.a[i3], ay = L.a[i3 + 1], az = L.a[i3 + 2];
      const sd = (ox - ax) * nx + (oy - ay) * ny + (oz - az) * nz;
      const sv = dx * nx + dy * ny + dz * nz;
      const se = sd + sv;
      // Radius for this triangle: full pad, or less if the start is already inside it.
      let e = pad;
      if (Math.abs(sd) < pad && ox > bb[b] - pad && ox < bb[b + 3] + pad && oy > bb[b + 1] - pad && oy < bb[b + 4] + pad && oz > bb[b + 2] - pad && oz < bb[b + 5] + pad) {
        const d0 = Math.sqrt(distSq(L, i3, ox, oy, oz));
        // The start is on this surface (a head in a door leaf, say): nothing to be done about it.
        if (d0 <= 1e-3) continue;
        if (d0 < pad - 1e-4) e = d0 > tight + 1e-3 ? tight : d0 - 1e-4;
      }
      // The path never comes within e of the triangle's plane: no contact possible.
      if ((sd > e && se > e) || (sd < -e && se < -e)) continue;
      const e1x = L.e1[i3], e1y = L.e1[i3 + 1], e1z = L.e1[i3 + 2], e2x = L.e2[i3], e2y = L.e2[i3 + 1], e2z = L.e2[i3 + 2];
      let hit = best;
      // Face: the ball touches the plane offset by e toward the start's side.
      if (Math.abs(sv) > 1e-9) {
        const side = sd >= 0 ? 1 : -1;
        // A start resting on the contact distance (where the last clamp left it) counts as
        // touching, not as overlapping: rounding must not let it through.
        const t = e - side * sd > TOUCH ? -1 : Math.max(0, (side * e - sd) / sv);
        if (t >= 0 && t < hit && (sv * side < 0)) {
          // Contact point on the plane, inside the triangle?
          const cx = ox + dx * t - nx * side * e - ax, cy = oy + dy * t - ny * side * e - ay, cz = oz + dz * t - nz * side * e - az;
          if (inTri(cx, cy, cz, e1x, e1y, e1z, e2x, e2y, e2z)) hit = t;
        }
      }
      // Edges (cylinders) and corners (spheres).
      const mx = ox - ax, my = oy - ay, mz = oz - az;
      const p1x = e1x, p1y = e1y, p1z = e1z, p2x = e2x, p2y = e2y, p2z = e2z;
      // Corner 0 is at the origin of the local frame; corner 1 = e1; corner 2 = e2.
      hit = sphereHit(mx, my, mz, dx, dy, dz, dd, e, hit);
      hit = sphereHit(mx - p1x, my - p1y, mz - p1z, dx, dy, dz, dd, e, hit);
      hit = sphereHit(mx - p2x, my - p2y, mz - p2z, dx, dy, dz, dd, e, hit);
      hit = edgeHit(mx, my, mz, dx, dy, dz, p1x, p1y, p1z, e, hit);
      hit = edgeHit(mx, my, mz, dx, dy, dz, p2x, p2y, p2z, e, hit);
      hit = edgeHit(mx - p1x, my - p1y, mz - p1z, dx, dy, dz, p2x - p1x, p2y - p1y, p2z - p1z, e, hit);
      if (hit < best) {
        best = hit;
        this.lastHit = i;
      }
    }
    return best;
  }
}

// Squared distance from a point to a local triangle (Ericson, Real-Time Collision Detection).
function distSq(L, i3, px, py, pz) {
  const ax = L.a[i3], ay = L.a[i3 + 1], az = L.a[i3 + 2];
  const abx = L.e1[i3], aby = L.e1[i3 + 1], abz = L.e1[i3 + 2], acx = L.e2[i3], acy = L.e2[i3 + 1], acz = L.e2[i3 + 2];
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = 0; qy = 0; qz = 0; }
  else {
    const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = abx; qy = aby; qz = abz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        qx = abx * v; qy = aby * v; qz = abz * v;
      } else {
        const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = acx; qy = acy; qz = acz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            qx = acx * w; qy = acy * w; qz = acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + d5 - d6);
              qx = abx + (acx - abx) * w; qy = aby + (acy - aby) * w; qz = abz + (acz - abz) * w;
            } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              qx = abx * v + acx * w; qy = aby * v + acy * w; qz = abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const rx = apx - qx, ry = apy - qy, rz = apz - qz;
  return rx * rx + ry * ry + rz * rz;
}

// Is the point c (relative to corner 0) inside the triangle spanned by e1 and e2? (It is on
// the plane already.)
function inTri(cx, cy, cz, e1x, e1y, e1z, e2x, e2y, e2z) {
  const d00 = e1x * e1x + e1y * e1y + e1z * e1z, d01 = e1x * e2x + e1y * e2y + e1z * e2z, d11 = e2x * e2x + e2y * e2y + e2z * e2z;
  const d20 = cx * e1x + cy * e1y + cz * e1z, d21 = cx * e2x + cy * e2y + cz * e2z;
  const den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-14) return false;
  const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
  return v >= 0 && w >= 0 && v + w <= 1;
}

// Earliest t in [0, best) at which the ray m + t d enters a sphere of radius r at the origin.
function sphereHit(mx, my, mz, dx, dy, dz, dd, r, best) {
  const b = mx * dx + my * dy + mz * dz, c = mx * mx + my * my + mz * mz - r * r;
  if (c < -EPS2) return best; // well inside: the start was adapted, so this is rounding or a squeeze
  if (b >= 0) return best; // moving away
  const disc = b * b - dd * c;
  if (disc < 0) return best;
  const t = Math.max(0, (-b - Math.sqrt(disc)) / dd);
  return t < best ? t : best;
}

// Earliest t at which the ray m + t d enters the cylinder of radius r around the line
// through the origin with direction E, within the edge's length.
function edgeHit(mx, my, mz, dx, dy, dz, ex, ey, ez, r, best) {
  const ee = ex * ex + ey * ey + ez * ez;
  const de = dx * ex + dy * ey + dz * ez, me = mx * ex + my * ey + mz * ez;
  // Components perpendicular to the edge.
  const dpx = dx - ex * de / ee, dpy = dy - ey * de / ee, dpz = dz - ez * de / ee;
  const mpx = mx - ex * me / ee, mpy = my - ey * me / ee, mpz = mz - ez * me / ee;
  const a = dpx * dpx + dpy * dpy + dpz * dpz;
  if (a < 1e-12) return best;
  const b = mpx * dpx + mpy * dpy + mpz * dpz, c = mpx * mpx + mpy * mpy + mpz * mpz - r * r;
  if (c < -EPS2 || b >= 0) return best;
  const disc = b * b - a * c;
  if (disc < 0) return best;
  const t = Math.max(0, (-b - Math.sqrt(disc)) / a);
  if (t >= best) return best;
  const s = (me + t * de) / ee;
  return s >= 0 && s <= 1 ? t : best;
}
