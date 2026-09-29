// Shared helpers for landmarks.py: walking the hero along a route with the game's own controller,
// sight lines against the ground, walls, roofs and tree crowns, and parking the camps' people so a
// walk through a camp isn't a fight.
window.__lm = (() => {
  const G = () => window.__game;
  const T = () => window.__THREE;
  const fails = [];
  const fail = (msg) => fails.push('FAIL ' + msg);
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

  // Walks toward (tx, tz) holding W and steering the camera, for up to `secs`. `jump(P)` may ask for
  // a jump (once). Returns where the hero ended up.
  function walk(tx, tz, secs = 8, { stop = 0.6, jump = null } = {}) {
    const g = G(), P = g.player, keys = g.input.keys;
    keys.clear();
    keys.add('KeyW');
    let t = 0, jumped = false;
    while (t < secs) {
      const dx = tx - P.pos.x, dz = tz - P.pos.z;
      if (Math.hypot(dx, dz) < stop) break;
      g.rig.yaw = Math.atan2(dx, dz) + Math.PI;
      if (jump && !jumped && jump(P)) { g.input.pressed.add('Space'); jumped = true; }
      g.sim(1 / 60);
      t += 1 / 60;
    }
    keys.clear();
    g.sim(0.4);
    return { x: P.pos.x, y: P.pos.y, z: P.pos.z, t, jumped };
  }
  // Puts the hero at (x, z) facing (tx, tz), camera behind.
  function place(x, z, tx, tz) {
    const g = G(), yaw = Math.atan2(tx - x, tz - z);
    g.player.spawn(x, z, yaw);
    g.rig.yaw = yaw + Math.PI;
    g.rig.snap?.();
    g.sim(0.2);
  }
  // The camps' people step out of the world for a moment (and back).
  function park(on) {
    for (const e of G().fight?.enemies || []) {
      if (on && e.realm === 'world') e.realm = 'parked';
      else if (!on && e.realm === 'parked') e.realm = 'world';
    }
  }
  // Can the eye see the target: is the straight line clear of the ground, solids (walls, roofs, trunks)
  // and tree crowns until it reaches the landmark itself (within `near` metres of the target)?
  function sight(from, to, near = 0) {
    const g = G(), w = g.world, V = T().Vector3;
    const a = new V(...from), b = new V(...to);
    // Trunk colliders stand 40 m tall (they only stop feet and cameras); trees are judged by their crowns below.
    const trunks = w.forest.trees.map((tr) => tr.collider).filter((c) => c && !c.removed);
    trunks.forEach((c) => (c.removed = true));
    const t = w.lineOfSight(a, b, 0.05, true);
    trunks.forEach((c) => (c.removed = false));
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const reach = Math.max(0, 1 - near / L);
    let crown = null;
    for (const tr of w.forest.trees) {
      if (tr.felled) continue;
      const s = ((tr.x - a.x) * dx + (tr.z - a.z) * dz) / L2;
      if (s <= 0 || s >= reach) continue;
      const H = (tr.variant?.height || 12) * tr.scale, cr = Math.max(2.5, H * 0.3);
      if (Math.hypot(a.x + dx * s - tr.x, a.z + dz * s - tr.z) > cr) continue;
      const y = a.y + (b.y - a.y) * s;
      if (y < tr.y + H && y > tr.y + H * 0.3) { crown = [f2(tr.x), f2(tr.z)]; break; }
    }
    const blockedAt = t < reach - 1e-3 ? [f2(a.x + (b.x - a.x) * t), f2(a.y + (b.y - a.y) * t), f2(a.z + (b.z - a.z) * t)] : null;
    return { clear: !blockedAt && !crown, t: +t.toFixed(3), blockedAt, crown };
  }
  const eye = (x, z, h = 1.7) => [x, G().world.groundAt(x, z, 1e4) + h, z];
  const polar = (c, a, r) => [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r];
  return { walk, place, park, sight, eye, polar, fail, fails, f2 };
})();
