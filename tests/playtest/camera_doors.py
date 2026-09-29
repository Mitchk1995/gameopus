# ci
# Camera smoothness in doorways: scripted walks (jog and run, in and out, at several camera
# headings, pitches and zooms, and steering with the mouse) through the door of EVERY building
# (bank, store, inn, all houses, the smithy's open front) and into the cave mouth, plus standing in
# a doorway while turning the camera all the way round, plus walking the corridors of the Old
# Warren. Every frame's camera position (as its offset from the player's head), lens and shoulder
# offset are recorded and scored: no flutter (in, out, in again), easing out and the shoulder
# slide must be continuous (bounded speed and jolt), no field-of-view pop, and no single snap-in
# bigger than a stride when walking straight through. The camera is also checked against the real
# meshes every few frames (never inside geometry or clipping the near plane).
# Prints FAIL lines for misses (play.py exits non-zero on those) and worst-case numbers.
STEPS = [
  {'eval': '@camera_helpers.js'},
  {'eval': '@camera_mesh.js'},
  {'eval': """(() => {
    const g = __game, M = __cm, v = g.world.village;
    M.build();
    // Every building's front door: [id, place, door centre, outward direction (world heading)].
    const doors = [];
    for (const id of ['bank', 'store', 'inn']) doors.push([id, v.places[id]]);
    (v.places.houses || []).forEach((p, i) => doors.push(['house' + i, p]));
    doors.push(['smithy', g.resources.places.smithy]);
    window.__doors = doors.map(([id, p]) => {
      const lx = p.openings?.[0]?.lx ?? 0;
      const c = v.at(p, lx, p.d / 2);
      return { id, p, x: c.x, z: c.z, out: p.rot, lx };
    });
    return { doors: __doors.length, truthTriangles: M.S.n };
  })()"""},
  # --- straight through every door, in and out
  {'eval': """(() => {
    const g = __game, M = __cm;
    let n = 0;
    const gait = (run) => ['KeyW', ...(run ? ['ShiftLeft'] : [])];
    // Steering with the mouse at a run drags the boom across jambs: snaps in are the mouse's doing,
    // and the shoulder may follow the head's own speed; flutter is still held to one small one.
    const STEER = { ...M.LIMITS, pullMax: Infinity, maxLat: 0.26, maxLatAcc: 0.26, flips: 1 };
    for (const d of __doors) {
      for (const dir of ['in', 'out']) {
        // Start 5 m before the door (outside going in) or 3 m past it (inside going out), heading
        // through the doorway at phi off its axis.
        const walk = (label, phi, pitch, run, o = {}) => {
          const h = dir === 'in' ? d.out + Math.PI + phi : d.out + phi; // heading of travel
          const back = dir === 'in' ? 5 : 3;
          M.verdict(M.walk(`${d.id} ${dir} phi ${phi} pitch ${pitch} ${run ? 'run' : 'jog'}${label}`, d.x - Math.sin(h) * back, d.z - Math.cos(h) * back, h + Math.PI, pitch, 2.2, gait(run), o), o.lim || (phi ? { ...M.LIMITS, flips: 1, pullMax: 3.0 } : undefined));
          n++;
        };
        for (const pitch of [-0.22, -0.7, 0.3]) for (const run of [false, true]) walk('', 0, pitch, run);
        for (const phi of [0.2, -0.2]) for (const run of [false, true]) walk('', phi, -0.22, run);
        // Zoomed in and out.
        for (const dist of [2.2, 6]) walk(` dist ${dist}`, 0, -0.22, false, { dist });
        // Steering with the mouse while going through.
        for (const yawRate of [0.3, -0.3]) walk(` steer ${yawRate}`, 0, -0.3, true, { yawRate, lim: STEER });
      }
    }
    return { walks: n, fails: M.SMOOTH.fails.length + M.F.fails.length };
  })()"""},
  # --- standing in a doorway (and just in / just out of it) turning the camera all the way round
  {'eval': """(() => {
    const g = __game, M = __cm, C = __cam;
    let n = 0;
    // Turning the camera drags the boom across walls: snaps in are the mouse's doing, so only the
    // easing out, the shoulder slide, the lens and flutter are held to the limits here.
    const lim = { ...M.LIMITS, pullMax: Infinity, flips: 1 };
    for (const d of __doors) {
      for (const back of [0, 1.2, -1.2]) // metres inside the door plane along its axis (0 = in the frame)
        for (const pitch of [-0.22, -0.8]) {
          const x = d.x - Math.sin(d.out) * back, z = d.z - Math.cos(d.out) * back;
          M.verdict(M.walk(`${d.id} spin at ${back} pitch ${pitch}`, x, z, d.out, pitch, 4.4, [], { yawRate: 1.43 }), lim);
          n++;
        }
    }
    return { spins: n, fails: M.SMOOTH.fails.length + M.F.fails.length };
  })()"""},
  # --- the cave mouth (the dungeon's door): walk at it from several headings, turn round at it
  {'eval': """(() => {
    const g = __game, M = __cm, C = __cam, e = g.resources.caveExit;
    const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
    let n = 0;
    const lim = { ...M.LIMITS, pullMax: Infinity, maxLat: 0.26, maxLatAcc: 0.26, flips: 1 };
    for (const phi of [0, 0.3, -0.3, 0.6, -0.6])
      for (const pitch of [-0.22, -0.6]) {
        const h = e.facing + Math.PI + phi; // toward the mouth
        M.verdict(M.walk(`cave in phi ${phi} pitch ${pitch}`, e.x + fx * 2 - Math.sin(h) * 2, e.z + fz * 2 - Math.cos(h) * 2, h + Math.PI, pitch, 2.4, ['KeyW']), lim);
        M.verdict(M.walk(`cave out phi ${phi} pitch ${pitch}`, e.x - fx * 1.5, e.z - fz * 1.5, e.facing + phi, pitch, 2.2, ['KeyW']), lim);
        n += 2;
      }
    for (const back of [0, 2, 4])
      for (const pitch of [-0.22, -0.8]) {
        M.verdict(M.walk(`cave spin at ${back} pitch ${pitch}`, e.x - fx * (back - 4), e.z - fz * (back - 4), e.facing, pitch, 4.4, [], { yawRate: 1.43 }), lim);
        n++;
      }
    return { walks: n, fails: M.SMOOTH.fails.length + M.F.fails.length };
  })()"""},
  # --- a doorway walk-through you can look at
  {'eval': """(() => {
    const g = __game, M = __cm, C = __cam, d = __doors.find((d) => d.id === 'store');
    // Just in the frame, walking in, camera behind.
    const h = d.out + Math.PI + 0.15;
    C.place(d.x - Math.sin(h) * 1.6, d.z - Math.cos(h) * 1.6, h + Math.PI, -0.2);
    C.hold('KeyW');
    for (let i = 0; i < 28; i++) g.sim(1 / 60);
    C.hold();
    g.run(0.1);
    return 1;
  })()"""},
  {'shot': 'doors_store_mid'},
  {'eval': """(() => {
    const g = __game, C = __cam, d = __doors.find((d) => d.id === 'bank');
    // Standing in the bank's doorway looking out and down the steps.
    C.place(d.x, d.z, d.out + Math.PI, -0.3);
    g.sim(0.5); g.run(0.1);
    return 1;
  })()"""},
  {'shot': 'doors_bank_threshold'},
  # --- the corridors and rooms of the Old Warren (its "doorways" are corridor mouths)
  {'eval': "(() => { const g = __game; g.enterDungeon(); return 1; })()"},
  {'wait': 4000},
  {'eval': """(() => {
    const g = __game, M = __cm, C = __cam, d = g.dungeon;
    if (!d) return 'FAIL no dungeon';
    g.player.invulnerable = true;
    const L = d.layout;
    let seed = 777; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const cells = []; for (let j = 0; j < L.size; j++) for (let i = 0; i < L.size; i++) if (L.grid[j * L.size + i] === 1) cells.push([i, j]);
    // Corridor mouths: floor cells with rock on both sides across one axis.
    const isFloor = (i, j) => L.grid[j * L.size + i] === 1;
    const mouths = cells.filter(([i, j]) => (!isFloor(i - 1, j) && !isFloor(i + 1, j) && (isFloor(i, j - 1) || isFloor(i, j + 1))) || (!isFloor(i, j - 1) && !isFloor(i, j + 1) && (isFloor(i - 1, j) || isFloor(i + 1, j))));
    const pool = mouths.length > 30 ? Array.from({ length: 30 }, () => mouths[Math.floor(rnd() * mouths.length)]) : mouths;
    let n = 0;
    // Dungeon walls are boxes: no mesh truth here (the old collider check in camera.py covers
    // clipping); this is about smoothness while walking through the mouths.
    const lim = { ...M.LIMITS, pullMax: Infinity, flips: 2 };
    for (const [i, j] of pool) {
      const c = d.cellCentre(i, j);
      for (let k = 0; k < 4; k++) {
        const h = k * Math.PI / 2 + (rnd() - 0.5) * 0.4;
        M.verdict(M.walk(`warren mouth ${i},${j} heading ${k}`, c.x - Math.sin(h) * 3, c.z - Math.cos(h) * 3, h + Math.PI, -0.25, 1.8, ['KeyW'], { noTruth: true }), lim);
        n++;
      }
    }
    return { mouths: mouths.length, walks: n, fails: M.SMOOTH.fails.length };
  })()"""},
  # --- verdict
  {'eval': """(() => {
    const M = __cm, F = M.F;
    __cam.hold();
    const w = M.W.worst, fmt = (k) => w[k] ? `${w[k].v.toFixed(3)} (${w[k].at})` : 'n/a';
    const lines = [...M.SMOOTH.fails, ...F.fails];
    // The check has to have looked at something.
    if (M.S.n < 100000) lines.push('FAIL truth mesh too small: ' + M.S.n + ' triangles');
    if (F.checks < 2000) lines.push('FAIL too few camera checks: ' + F.checks);
    return { walks: M.W.walks, checks: F.checks, skippedHeadInGeometry: F.skipped, clips: F.clips, inside: F.inside, occludedByScenery: F.occluded,
      worst: { flips: fmt('flips'), maxOut: fmt('maxOut'), maxOutAcc: fmt('maxOutAcc'), maxLat: fmt('maxLat'), maxLatAcc: fmt('maxLatAcc'), maxFov: fmt('maxFov'), pullMax: fmt('pullMax') },
      fails: lines.length, failLines: lines.join(' || ') || 'none' };
  })()"""},
]
