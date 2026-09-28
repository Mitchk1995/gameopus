// Shared helpers for camera.py: numeric checks that the camera is never inside a
// solid shape, never above an interior ceiling, and how it moves frame to frame.
window.__cam = (() => {
  const R = 0.12; // how far the lens (near-plane corners) reaches around the camera point
  const T = { fails: [], seen: new Set(), frames: 0, skipped: 0, skipBy: {}, jitter: 0, maxStep: 0, buildings: [] };
  const g = () => window.__game;

  // The solid (camera-blocking) shape the point is inside, if any.
  function solidAt(colliders, x, y, z, r = R) {
    for (const sh of colliders.query(x, z, 2)) {
      if (sh.noCamera) continue;
      if (y < sh.y0 - r || y > sh.y1 + r) continue;
      if (sh.kind === 'c') {
        if (Math.hypot(x - sh.x, z - sh.z) < sh.r + r) return sh;
      } else {
        const dx = x - sh.x, dz = z - sh.z;
        const lx = dx * sh.c - dz * sh.s, lz = dx * sh.s + dz * sh.c;
        const ex = Math.max(0, Math.abs(lx) - sh.hx), ez = Math.max(0, Math.abs(lz) - sh.hz);
        if (Math.hypot(ex, ez) < r) return sh;
      }
    }
    return null;
  }

  function fail(label, kind, msg) {
    const key = label + '|' + kind;
    if (T.seen.has(key)) return;
    T.seen.add(key);
    if (T.fails.length < 40) T.fails.push(`FAIL ${label}: ${kind} ${msg}`);
  }

  const inFoot = (b, x, z, m = 0.05) => {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < b.w / 2 - m && Math.abs(lz) < b.d / 2 - m;
  };

  // Check the current camera pose. label says where/what we were doing.
  function check(label) {
    const G = g(), cam = G.camera.position, w = G.rig.world, P = G.player.pos;
    T.frames++;
    const at = ` @cam(${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(2)}) player(${P.x.toFixed(2)},${P.y.toFixed(2)},${P.z.toFixed(2)}) pitch ${G.rig.pitch.toFixed(2)} yaw ${G.rig.yaw.toFixed(2)} cur ${G.rig.cur.toFixed(2)}`;
    // A player dropped with their own head against or inside a wall (a spot we put them on,
    // never a place they can walk to) leaves the camera nowhere to go: not the camera's doing.
    const pv = G.rig.pivot;
    if (solidAt(w.colliders, pv.x, pv.y, pv.z, R + 0.05)) {
      const key = label.split(' ').slice(0, 2).join(' ');
      T.skipped++;
      T.skipBy[key] = (T.skipBy[key] || 0) + 1;
      return null;
    }
    const sh = solidAt(w.colliders, cam.x, cam.y, cam.z);
    if (sh) fail(label, 'inside-solid', `${sh.kind === 'c' ? 'round' : 'box'} y ${sh.y0.toFixed(1)}..${sh.y1.toFixed(1)}` + at);
    if (G.realm === 'world') {
      const h = w.heightAt(cam.x, cam.z);
      if (cam.y < h + R) fail(label, 'under-ground', `${(cam.y - h).toFixed(2)} above` + at);
      for (const b of T.buildings) {
        if (!b.ceiling) continue;
        // The player is indoors on the ground floor; the camera must stay below the ceiling.
        if (inFoot(b, P.x, P.z) && P.y < b.y + 2 && cam.y > b.y + b.storey - 0.05 && (inFoot(b, cam.x, cam.z, -0.5))) fail(label, 'above-ceiling', b.id + at);
      }
    } else if (cam.y > 5.85) fail(label, 'above-vault', at);
    return sh;
  }

  // Frame-to-frame behaviour: the camera should pull in, then ease out, not flutter. A
  // flutter is a pull-in of over 0.15 m that follows another one within half a second
  // with the camera easing back out in between.
  let prev = null;
  function motion(label) {
    const cur = g().rig.cur;
    T.f = (T.f || 0) + 1;
    if (prev && prev.label === label) {
      const d = cur - prev.cur;
      T.maxStep = Math.max(T.maxStep, Math.abs(d));
      if (d > 0.002) prev.grew = true;
      if (d < -0.15) {
        if (prev.pullAt !== undefined && T.f - prev.pullAt <= 30 && prev.grew) T.jitter++;
        prev.pullAt = T.f;
        prev.grew = false;
      }
      prev.cur = cur;
    } else prev = { label, cur, grew: false };
  }

  function stepFor(label, n) {
    const G = g();
    for (let i = 0; i < n; i++) {
      G.sim(1 / 60);
      check(label);
      motion(label);
    }
  }

  function hold(...ks) {
    const keys = g().input.keys;
    keys.clear();
    ks.forEach((k) => keys.add(k));
  }

  // Put the player at (x, z) and set the camera (yaw, pitch), snapped to its usual distance.
  function place(x, z, yaw, pitch) {
    const G = g();
    hold();
    prev = null;
    G.player.spawn(x, z, 0);
    G.rig.yaw = yaw;
    G.rig.pitch = pitch;
    G.rig.snap();
  }

  // Walk from (x, z) along the world heading h (direction (sin h, cos h)) for secs, the
  // camera looking along the walk, or (back) looking behind us while we back up.
  function walk(label, x, z, h, secs, pitch, back = false, sprint = false) {
    place(x, z, back ? h : h + Math.PI, pitch);
    g().sim(0.05);
    hold(back ? 'KeyS' : 'KeyW', ...(sprint ? ['ShiftLeft'] : []));
    stepFor(label, Math.round(secs * 60));
    hold();
  }

  return { T, check, stepFor, place, walk, hold, solidAt, motion, inFoot };
})();
