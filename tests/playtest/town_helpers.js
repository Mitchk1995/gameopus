// Shared helpers for town.py: walkability on the collider grid, flood fills from the spawn,
// and geometry checks against the plan (src/world/ashford.js, exposed as world.village.layout).
window.__town = (() => {
  const g = () => window.__game;
  const RADIUS = 0.32, HEIGHT = 1.8, STEP = 0.45;
  const P = { x: 0, y: 0, z: 0 };
  const fails = [];
  const fail = (msg) => { if (fails.length < 80) fails.push('FAIL ' + msg); };

  // Can a player stand here? (Not inside a solid, not on a cliff, not in deep water.)
  function free(x, z, ignore = null) {
    const w = g().world, y = w.heightAt(x, z);
    const gx = w.heightAt(x + 0.5, z) - w.heightAt(x - 0.5, z), gz = w.heightAt(x, z + 0.5) - w.heightAt(x, z - 0.5);
    if (Math.hypot(gx, gz) > 1.05) return false;
    if (w.waterDepth(x, z) > 1.05) return false;
    P.x = x; P.y = w.groundAt(x, z, y + 0.1); P.z = z;
    if (ignore) ignore.removed = true;
    const hit = w.colliders.push(P, RADIUS, HEIGHT, STEP);
    if (ignore) ignore.removed = false;
    return !hit || Math.hypot(P.x - x, P.z - z) < 0.01;
  }

  // Flood fill over a grid of `cell` metres from a start point; returns a reader.
  function flood(x0, z0, x1, z1, cell, sx, sz) {
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const ok = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
    const at = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const [x, z] = at(i, j); ok[j * nx + i] = free(x, z) ? 1 : 0; }
    let si = Math.floor((sx - x0) / cell), sj = Math.floor((sz - z0) / cell);
    const queue = [sj * nx + si];
    seen[queue[0]] = 1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], i = k % nx, j = (k - i) / nx;
      for (let d = 0; d < 8; d++) {
        const di = [1, -1, 0, 0, 1, 1, -1, -1][d], dj = [0, 0, 1, -1, 1, -1, 1, -1][d];
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = b * nx + a;
        if (seen[n] || !ok[n]) continue;
        if (d >= 4 && !(ok[j * nx + a] && ok[b * nx + i])) continue; // no squeezing through corners
        seen[n] = 1;
        queue.push(n);
      }
    }
    const reach = (x, z, r = 0) => {
      const R = Math.ceil(r / cell) + 1, ci = Math.floor((x - x0) / cell), cj = Math.floor((z - z0) / cell);
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
        if (i < 0 || j < 0 || i >= nx || j >= nz || !seen[j * nx + i]) continue;
        const [x2, z2] = at(i, j);
        if (Math.hypot(x2 - x, z2 - z) <= r + cell * 0.75) return true;
      }
      return false;
    };
    return { reach, count: queue.length, nx, nz, seen, ok, at };
  }

  // Segment clear of solids? (sampled every 0.4 m)
  function clearWalk(a, b, ignore = null) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 0; i <= n; i++) if (!free(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, ignore)) return false;
    return true;
  }

  // Polygon (convex, from footprint) helpers
  const sat = (A, B) => {
    for (const poly of [A, B])
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
        const nx = -(bz - az), nz = bx - ax;
        const proj = (P2) => P2.map(([x, z]) => x * nx + z * nz);
        const pa = proj(A), pb = proj(B);
        if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
      }
    return true;
  };
  const rectPoly = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
  };
  const polyDist = (x, z, poly) => Math.min(...poly.map((p, i) => segDist(x, z, p, poly[(i + 1) % poly.length])));
  const inPoly = (x, z, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j], [bx, bz] = poly[i];
      if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  };

  return { g, free, flood, clearWalk, fails, fail, sat, rectPoly, segDist, polyDist, inPoly, RADIUS };
})();
