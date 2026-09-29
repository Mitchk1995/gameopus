// Ground truth and smoothness meter for the camera scenarios. Nothing here uses the game's
// colliders or its camera sweep: the truth is a plain triangle grid over the meshes that are
// actually rendered (every static kit mesh: the village, smithy, interiors, props), tested with
// ordinary segment/triangle intersections.
//
//   __cm.truth(pos, pivot)   -> { clip, inside, occluded } for a camera at pos
//   __cm.rec.begin(label) / __cm.rec.frame() / __cm.rec.end()   record a walk and score it
window.__cm = (() => {
  const G = () => window.__game;
  const CELL = 2;
  const S = { tris: null, n: 0, cells: new Map(), built: false, meshes: 0 };

  // Static meshes that are drawn as solid geometry: anything the batcher built (flagged
  // camSolid), with decorative bits (mugs, bottles, lanterns) masked out the same way the
  // camera does, plus the hand-built well and cave mouth.
  function collect() {
    const out = [];
    G().scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
      if (o.userData.camSolid) out.push(o);
    });
    return out;
  }

  function build() {
    if (S.built) return S;
    const meshes = collect();
    let total = 0;
    for (const m of meshes) total += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
    const tris = new Float32Array(total * 9);
    let n = 0;
    const v = new (G().camera.position.constructor)();
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      const geo = m.geometry, pos = geo.attributes.position, idx = geo.index;
      const mask = m.userData.camMask;
      const count = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < count; t++) {
        if (mask && !mask[t]) continue;
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          tris[n * 9 + k * 3] = v.x;
          tris[n * 9 + k * 3 + 1] = v.y;
          tris[n * 9 + k * 3 + 2] = v.z;
        }
        n++;
      }
    }
    S.tris = tris;
    S.n = n;
    S.meshes = meshes.length;
    for (let t = 0; t < n; t++) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < 3; k++) {
        const x = tris[t * 9 + k * 3], z = tris[t * 9 + k * 3 + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          const key = cx * 100003 + cz;
          let l = S.cells.get(key);
          if (!l) S.cells.set(key, (l = []));
          l.push(t);
        }
    }
    S.built = true;
    return S;
  }

  // Triangle ids in the cells around a box (deduplicated with a stamp array).
  let stamp = 0, marks = null;
  function near(x0, z0, x1, z1, out) {
    out.length = 0;
    if (!marks || marks.length < S.n) marks = new Int32Array(S.n);
    const st = ++stamp;
    const a = Math.floor(Math.min(x0, x1) / CELL), b = Math.floor(Math.max(x0, x1) / CELL);
    const c = Math.floor(Math.min(z0, z1) / CELL), d = Math.floor(Math.max(z0, z1) / CELL);
    for (let cz = c; cz <= d; cz++)
      for (let cx = a; cx <= b; cx++) {
        const l = S.cells.get(cx * 100003 + cz);
        if (!l) continue;
        for (const t of l) if (marks[t] !== st) { marks[t] = st; out.push(t); }
      }
    return out;
  }

  // Segment o -> o+d against one triangle. Returns t in [0,1] or -1; front = the triangle
  // faces the ray origin.
  let lastFront = true;
  function segTri(t, ox, oy, oz, dx, dy, dz) {
    const T = S.tris, b = t * 9;
    const ax = T[b], ay = T[b + 1], az = T[b + 2];
    const e1x = T[b + 3] - ax, e1y = T[b + 4] - ay, e1z = T[b + 5] - az;
    const e2x = T[b + 6] - ax, e2y = T[b + 7] - ay, e2z = T[b + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return -1;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (dx * qx + dy * qy + dz * qz) * inv;
    if (w < 0 || u + w > 1) return -1;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt < 0 || tt > 1) return -1;
    // Normal (e1 x e2) against the ray: facing the origin means the ray runs against it.
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    lastFront = nx * dx + ny * dy + nz * dz < 0;
    return tt;
  }

  const cand = [], candB = [];
  // First hit of a segment (nearest t) among the candidate triangles, or null.
  function cast(list, ox, oy, oz, dx, dy, dz) {
    let best = 2, front = true;
    for (const t of list) {
      const h = segTri(t, ox, oy, oz, dx, dy, dz);
      if (h >= 0 && h < best) { best = h; front = lastFront; }
    }
    return best <= 1 ? { t: best, front } : null;
  }

  // Does any triangle cut the little frustum stub in front of the lens (the near plane's four
  // edges and the four rays from the eye to its corners)? Also: is the eye inside solid
  // (most of the surfaces around it face away)?
  const DIRS = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) { const l = Math.hypot(x, y, z); DIRS.push([x / l, y / l, z / l]); }

  function truth(cam, pivot) {
    build();
    const g = G(), c = g.camera;
    const res = { clip: null, inside: null, occluded: null };
    // Lens corners in world space.
    const th = Math.tan((c.fov * Math.PI) / 360), nh = c.near * th, nw = nh * c.aspect;
    c.updateMatrixWorld(true);
    const corners = [[-nw, -nh], [nw, -nh], [nw, nh], [-nw, nh]].map(([x, y]) => new c.position.constructor(x, y, -c.near).applyMatrix4(c.matrixWorld));
    const o = c.position;
    near(o.x - 1.6, o.z - 1.6, o.x + 1.6, o.z + 1.6, cand);
    for (let i = 0; i < 4 && !res.clip; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      for (const [p, q] of [[o, a], [a, b]]) {
        const h = cast(cand, p.x, p.y, p.z, q.x - p.x, q.y - p.y, q.z - p.z);
        if (h) { res.clip = 'lens'; break; }
      }
    }
    // Inside a solid: every surface within reach faces away from the eye (nothing in front),
    // and there are plenty of them (a lone thin sheet seen from behind has few).
    let front = 0, back = 0;
    for (const [dx, dy, dz] of DIRS) {
      const h = cast(cand, o.x, o.y, o.z, dx * 1.5, dy * 1.5, dz * 1.5);
      if (h) { if (h.front) front++; else back++; }
    }
    if (back >= 10 && front === 0) res.inside = `${back} of 26 directions hit a back face, none a front face`;
    // The player hidden behind a surface: the eye-to-head line cuts a triangle (ignoring the
    // last 0.3 m, where the head itself may brush a wall).
    if (pivot) {
      const dx = pivot.x - o.x, dy = pivot.y - o.y, dz = pivot.z - o.z, len = Math.hypot(dx, dy, dz);
      if (len > 0.4) {
        const k = (len - 0.3) / len;
        near(o.x, o.z, o.x + dx, o.z + dz, candB);
        const h = cast(candB, o.x, o.y, o.z, dx * k, dy * k, dz * k);
        if (h) res.occluded = `surface ${(h.t * k * len).toFixed(2)} m from the eye, ${len.toFixed(2)} m from the head`;
      }
    }
    return res;
  }

  // Debug: triangles within r of a point (plane distance and normal, vertices).
  function dump(p, r = 0.3) {
    build();
    near(p.x - r, p.z - r, p.x + r, p.z + r, cand);
    const out = [], T = S.tris;
    for (const t of cand) {
      const b = t * 9;
      const mn = [Math.min(T[b], T[b + 3], T[b + 6]), Math.min(T[b + 1], T[b + 4], T[b + 7]), Math.min(T[b + 2], T[b + 5], T[b + 8])];
      const mx = [Math.max(T[b], T[b + 3], T[b + 6]), Math.max(T[b + 1], T[b + 4], T[b + 7]), Math.max(T[b + 2], T[b + 5], T[b + 8])];
      if (p.x < mn[0] - r || p.x > mx[0] + r || p.y < mn[1] - r || p.y > mx[1] + r || p.z < mn[2] - r || p.z > mx[2] + r) continue;
      const e1 = [T[b + 3] - T[b], T[b + 4] - T[b + 1], T[b + 5] - T[b + 2]], e2 = [T[b + 6] - T[b], T[b + 7] - T[b + 1], T[b + 8] - T[b + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...n) || 1;
      const sd = ((p.x - T[b]) * n[0] + (p.y - T[b + 1]) * n[1] + (p.z - T[b + 2]) * n[2]) / l;
      out.push(`n(${(n[0] / l).toFixed(2)},${(n[1] / l).toFixed(2)},${(n[2] / l).toFixed(2)}) sd ${sd.toFixed(2)} v(${[...T.slice(b, b + 9)].map((x) => x.toFixed(2)).join(',')})`);
    }
    return out;
  }

  // Is a bare point inside solid geometry (most surfaces around it face away)?
  function insideAt(x, y, z) {
    build();
    near(x - 1.6, z - 1.6, x + 1.6, z + 1.6, cand);
    let front = 0, back = 0;
    for (const [dx, dy, dz] of DIRS) {
      const h = cast(cand, x, y, z, dx * 1.5, dy * 1.5, dz * 1.5);
      if (h) { if (h.front) front++; else back++; }
    }
    return back >= 10 && front === 0;
  }

  // Distance from a point to the nearest solid triangle within r (Ericson's closest point).
  function clearance(px, py, pz, r) {
    build();
    near(px - r, pz - r, px + r, pz + r, cand);
    const T = S.tris;
    let best = r * r;
    for (const t of cand) {
      const b = t * 9;
      const ax = T[b], ay = T[b + 1], az = T[b + 2];
      const abx = T[b + 3] - ax, aby = T[b + 4] - ay, abz = T[b + 5] - az, acx = T[b + 6] - ax, acy = T[b + 7] - ay, acz = T[b + 8] - az;
      const apx = px - ax, apy = py - ay, apz = pz - az;
      const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
      let qx, qy, qz;
      const bpx = px - T[b + 3], bpy = py - T[b + 4], bpz = pz - T[b + 5];
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      const cpx = px - T[b + 6], cpy = py - T[b + 7], cpz = pz - T[b + 8];
      const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
      else if (d3 >= 0 && d4 <= d3) { qx = T[b + 3]; qy = T[b + 4]; qz = T[b + 5]; }
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
      else if (d6 >= 0 && d5 <= d6) { qx = T[b + 6]; qy = T[b + 7]; qz = T[b + 8]; }
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; }
      else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); qx = T[b + 3] + (T[b + 6] - T[b + 3]) * w; qy = T[b + 4] + (T[b + 7] - T[b + 4]) * w; qz = T[b + 5] + (T[b + 8] - T[b + 5]) * w; }
      else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
      const dd = (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  }

  // Would the lens clip if the camera sat exactly at p (same orientation)?
  function pivotClips(p) {
    const c = G().camera, save = c.position.clone();
    c.position.copy(p);
    c.updateMatrixWorld(true);
    const r = truth(p, null);
    c.position.copy(save);
    c.updateMatrixWorld(true);
    return !!r.clip;
  }

  // Scores the current camera pose against the rendered geometry. A player whose own head is
  // in solid mesh (a spot the walk collision allows but no camera could fix) is skipped.
  const F = { fails: [], seen: new Set(), checks: 0, skipped: 0, occluded: 0, clips: 0, inside: 0, worstOcc: null };
  function check(label, kind = '') {
    const g = G(), pv = g.rig.pivot, cam = g.camera.position;
    F.checks++;
    // A head that is itself inside (or within 0.1 m of) a mesh surface - the walk collision
    // lets the player stand in a wall - leaves no camera anywhere good: not the camera's doing.
    if (clearance(pv.x, pv.y, pv.z, 0.1) < 0.1 || insideAt(pv.x, pv.y, pv.z)) { F.skipped++; return null; }
    let r = truth(cam, pv);
    // If the head itself clips the lens (a shutter, a chimney it can walk through), no camera
    // could do better.
    if ((r.clip || r.inside) && pivotClips(pv)) { F.skipped++; return null; }
    const at = ` dist ${g.rig.dist.toFixed(1)} cam(${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(2)}) head(${pv.x.toFixed(2)},${pv.y.toFixed(2)},${pv.z.toFixed(2)}) yaw ${g.rig.yaw.toFixed(2)} pitch ${g.rig.pitch.toFixed(2)} cur ${g.rig.cur.toFixed(2)}`;
    for (const k of ['clip', 'inside']) {
      if (!r[k]) continue;
      F[k === 'clip' ? 'clips' : 'inside']++;
      const key = label + '|' + k;
      if (!F.seen.has(key) && F.fails.length < 40) {
        F.seen.add(key);
        F.fails.push(`FAIL ${label}: camera ${k === 'clip' ? 'clips the near plane through geometry' : 'is inside solid geometry (' + r[k] + ')'}` + at);
      }
    }
    if (r.occluded) { F.occluded++; F.worstOcc = F.worstOcc || (label + ': ' + r.occluded + at); }
    return r;
  }

  // ----------------------------------------------------------------------------------------
  // Smoothness recorder. It tracks the camera's offset from the player's head, split into how
  // far back it sits (cur), how far to the side (lat) and how far up, plus the lens (fov).
  const R = { frames: [], label: '', on: false };
  const W = { worst: {}, walks: 0 };

  function begin(label) {
    R.frames.length = 0;
    R.label = label;
    R.on = true;
  }

  function frame() {
    if (!R.on) return;
    const g = G(), rig = g.rig, cam = g.camera, pv = rig.pivot;
    const rx = Math.cos(rig.yaw), rz = -Math.sin(rig.yaw);
    const ox = cam.position.x - pv.x, oy = cam.position.y - pv.y, oz = cam.position.z - pv.z;
    R.frames.push({
      cur: rig.cur, lat: ox * rx + oz * rz, up: oy, fov: cam.fov, yaw: rig.yaw, pitch: rig.pitch,
      cx: cam.position.x, cy: cam.position.y, cz: cam.position.z, px: pv.x, py: pv.y, pz: pv.z,
      d: Math.hypot(ox, oy, oz), dbg: rig.dbg ? { ...rig.dbg } : null,
    });
  }

  // Scores the recorded walk. Pulling in may be instant, so only its size is tracked (and a
  // limit on how big a single pull may be). What must be smooth: easing back out, the sideways
  // slide, the height, the lens; and nothing may go back and forth.
  function end(opts = {}) {
    R.on = false;
    const f = R.frames, n = f.length;
    const m = { label: R.label, frames: n, maxOut: 0, maxOutAcc: 0, maxLat: 0, maxLatAcc: 0, maxUp: 0, maxFov: 0, flips: 0, pullMax: 0, pulls: 0, dOffMax: 0, dOffAcc: 0 };
    const zz = { dir: 0, ext: f.length ? f[0].cur : 0, rev: -99 };
    let prevOut = 0, prevLat = 0, prevOff = null;
    for (let i = 1; i < n; i++) {
      const d = f[i].cur - f[i - 1].cur;
      if (d > 0) {
        m.maxOut = Math.max(m.maxOut, d);
        m.maxOutAcc = Math.max(m.maxOutAcc, Math.abs(d - prevOut));
      }
      if (d < -0.02) { m.pulls++; m.pullMax = Math.max(m.pullMax, -d); }
      prevOut = Math.max(0, d);
      // Reversals of the boom (zig-zag filter, 4 cm): in, out, in again inside a third of a
      // second is a flutter. Each reversal that follows another within 20 frames counts once.
      const c = f[i].cur;
      if (zz.dir === 0) {
        if (c - zz.ext >= 0.08) { zz.dir = 1; zz.ext = c; }
        else if (zz.ext - c >= 0.08) { zz.dir = -1; zz.ext = c; }
      } else if (zz.dir === 1) {
        if (c > zz.ext) zz.ext = c;
        else if (zz.ext - c >= 0.08) { zz.dir = -1; zz.ext = c; if (i - zz.rev < 20) m.flips++; zz.rev = i; }
      } else {
        if (c < zz.ext) zz.ext = c;
        else if (c - zz.ext >= 0.08) { zz.dir = 1; zz.ext = c; if (i - zz.rev < 20) m.flips++; zz.rev = i; }
      }
      const dl = f[i].lat - f[i - 1].lat;
      m.maxLat = Math.max(m.maxLat, Math.abs(dl));
      m.maxLatAcc = Math.max(m.maxLatAcc, Math.abs(dl - prevLat));
      prevLat = dl;
      m.maxUp = Math.max(m.maxUp, Math.abs(f[i].up - f[i - 1].up));
      m.maxFov = Math.max(m.maxFov, Math.abs(f[i].fov - f[i - 1].fov));
      // Whole-offset (the camera's place relative to the head): speed and its change.
      const ex = (f[i].cx - f[i].px) - (f[i - 1].cx - f[i - 1].px);
      const ey = (f[i].cy - f[i].py) - (f[i - 1].cy - f[i - 1].py);
      const ez = (f[i].cz - f[i].pz) - (f[i - 1].cz - f[i - 1].pz);
      const od = Math.hypot(ex, ey, ez);
      m.dOffMax = Math.max(m.dOffMax, od);
      if (prevOff) m.dOffAcc = Math.max(m.dOffAcc, Math.hypot(ex - prevOff[0], ey - prevOff[1], ez - prevOff[2]));
      prevOff = [ex, ey, ez];
    }
    W.walks++;
    for (const k of ['maxOut', 'maxOutAcc', 'maxLat', 'maxLatAcc', 'maxUp', 'maxFov', 'flips', 'pullMax', 'dOffMax', 'dOffAcc'])
      if (!W.worst[k] || m[k] > W.worst[k].v) W.worst[k] = { v: m[k], at: m.label };
    return m;
  }

  // ----------------------------------------------------------------------------------------
  // Scripted walks. The player is put at (x, z) with the camera looking along yaw, keys are held
  // for `secs`, the camera is recorded every frame (and checked against the meshes every few).
  // o.yawRate steers with the mouse (rad/s), o.dist sets the zoom.
  function walk(label, x, z, yaw, pitch, secs, keys, o = {}) {
    const g = G(), C = window.__cam;
    C.place(x, z, yaw, pitch);
    g.rig.dist = o.dist || 3.9;
    g.rig.snap();
    g.sim(0.05);
    C.hold(...keys);
    begin(label);
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      if (o.yawRate) g.rig.yaw += o.yawRate / 60;
      g.sim(1 / 60);
      frame();
      if (!o.noTruth && i % 4 === 0) check(label);
    }
    C.hold();
    g.rig.dist = 3.9;
    return end();
  }

  // Limits for a doorway walk (per frame at 60 Hz). Pulling in may be instant (pullMax bounds the
  // biggest single one); easing out, the sideways slide and the lens must be smooth; and the boom
  // must not go in, out and in again.
  const LIMITS = { flips: 0, maxOut: 0.09, maxOutAcc: 0.025, maxLat: 0.12, maxLatAcc: 0.12, maxFov: 0.6, pullMax: 2.2 };
  const SMOOTH = { fails: [], seen: new Set(), scored: 0 };
  function verdict(m, limits = LIMITS) {
    SMOOTH.scored++;
    for (const [k, lim] of Object.entries(limits)) {
      if (m[k] <= lim) continue;
      const key = m.label.replace(/ (pitch|off|phi|dir|yaw|run|jog).*/, '') + '|' + k;
      if (SMOOTH.seen.has(key)) continue;
      SMOOTH.seen.add(key);
      if (SMOOTH.fails.length < 40) SMOOTH.fails.push(`FAIL ${m.label}: camera ${DESC[k]} ${m[k].toFixed(3)} (limit ${lim})`);
    }
  }
  const DESC = {
    flips: 'flutters (in, out, in again within a third of a second):',
    maxOut: 'eases back out too fast in one frame, m:',
    maxOutAcc: 'eases out with a jolt (change in speed), m:',
    maxLat: 'shoulder slides too fast in one frame, m:',
    maxLatAcc: 'shoulder slide jolts (change in speed), m:',
    maxFov: 'field of view pops in one frame, deg:',
    pullMax: 'snaps in by more than a stride in one frame, m:',
  };

  return { build, truth, check, insideAt, dump, clearance, walk, verdict, SMOOTH, LIMITS, rec: { begin, frame, end, frames: R.frames }, F, W, S };
})();
