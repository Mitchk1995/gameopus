// Helpers for world.py: walking on the collider grid across the whole vale (decks and benches count as ground,
// the bridge is walkable), floods from more than one place, and scripted walks and jumps that press the real keys.
// The region's data (roads, exits, pads, landmarks) is read at run time from world.sites.map.
window.__world = (() => {
  const g = () => window.__game;
  const RADIUS = 0.32, HEIGHT = 1.8, STEP = 0.45;
  const P = { x: 0, y: 0, z: 0 };
  const fails = [];
  const fail = (msg) => { if (fails.length < 120) fails.push('FAIL ' + msg); };
  const map = () => g().world.sites.map;
  const parts = () => g().world.sites.parts;

  // Can a player stand here? On the ground or on something walkable standing on it (the bridge deck, a bench);
  // not inside a solid, not on a cliff, not in deep water.
  function free(x, z) {
    const w = g().world, y = w.heightAt(x, z);
    const gx = w.heightAt(x + 0.5, z) - w.heightAt(x - 0.5, z), gz = w.heightAt(x, z + 0.5) - w.heightAt(x, z - 0.5);
    P.x = x; P.z = z; P.y = w.groundAt(x, z, y + 6.0);
    const raised = P.y > y + 0.5;
    if (!raised && Math.hypot(gx, gz) > 1.05) return false;
    if (!raised && w.waterDepth(x, z) > 1.05) return false;
    const hit = w.colliders.push(P, RADIUS, HEIGHT, STEP);
    return !hit || Math.hypot(P.x - x, P.z - z) < 0.01;
  }

  // Flood fill over a grid of `cell` metres from each of the seeds; returns a reader.
  function flood(x0, z0, x1, z1, cell, seeds) {
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const ok = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
    const at = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const [x, z] = at(i, j); ok[j * nx + i] = free(x, z) ? 1 : 0; }
    const queue = [];
    for (const [sx, sz] of seeds) {
      const k = Math.floor((sz - z0) / cell) * nx + Math.floor((sx - x0) / cell);
      if (ok[k] && !seen[k]) { seen[k] = 1; queue.push(k); }
    }
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

  // Walks the player at a closure: from `from` metres before it (along the road) and `lat` metres to the side, holding
  // W (and Shift to run), jumping every `jump` ticks (a jump is a tap of Space), for `ticks` ticks of 1/60 s.
  // Returns how far along the road it got past the closure (u) at most.
  function walk(e, { lat = 0, from = 12, run = false, jump = 0, roll = 0, strafe = 0, ticks = 300 } = {}) {
    const game = g(), pos = game.player.pos, inp = game.input;
    const nx = -e.tz, nz = e.tx;
    const sx = e.x - e.tx * from + nx * lat, sz = e.z - e.tz * from + nz * lat;
    game.player.spawn(sx, sz, Math.atan2(e.tx, e.tz));
    game.rig.yaw = e.facing;
    inp.keys.clear(); inp.pressed.clear(); inp.tapped.clear();
    inp.keys.add('KeyW');
    if (run) inp.keys.add('ShiftLeft');
    if (strafe) inp.keys.add(strafe > 0 ? 'KeyD' : 'KeyA');
    let maxU = -1e9;
    for (let i = 0; i < ticks; i++) {
      if (jump && i % jump === 0) inp.pressed.add('Space');
      if (roll && i % roll === 0) inp.tapped.add('ShiftRight');
      game.sim(1 / 60);
      maxU = Math.max(maxU, (pos.x - e.x) * e.tx + (pos.z - e.z) * e.tz);
    }
    inp.keys.clear(); inp.pressed.clear(); inp.tapped.clear();
    return { maxU, endX: pos.x, endZ: pos.z };
  }

  return { g, free, flood, walk, fails, fail, map, parts, RADIUS };
})();
