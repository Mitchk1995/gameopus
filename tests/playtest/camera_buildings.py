# ci paths=src/world/,src/actors/camera-rig.js,src/main.js,tests/playtest/camera
# The camera never clips through any building: for EVERY building (bank, Maren's store, inn, all
# the houses, the smithy) and the cave mouth, the player is put at many places in and around it
# (inside, against walls and corners, under eaves, beside chimneys) with the camera at many
# headings, pitches and zooms, and the camera pose is checked against the real rendered meshes,
# with plain ray/triangle tests that share nothing with the game's own collision: the camera must
# never be inside solid geometry, and no triangle may cut the near plane of the lens. (A player whose
# own head is inside a wall mesh - the walk collision lets that happen - is skipped and counted.)
# Prints FAIL lines for misses (play.py exits non-zero on those); screenshots of Maren's house.
STEPS = [
  {'eval': '@camera_helpers.js'},
  {'eval': '@camera_mesh.js'},
  {'eval': """(() => {
    const g = __game, M = __cm, v = g.world.village;
    M.build();
    const list = [];
    for (const id of ['bank', 'store', 'inn', 'potter']) if (v.places[id]) list.push({ id, p: v.places[id] });
    (v.places.houses || []).forEach((p, i) => { if (i % __EVERY__ === 0) list.push({ id: 'house' + i, p }); });
    list.push({ id: 'smithy', p: g.resources.places.smithy });
    window.__list = list;
    return { buildings: list.length, truthTriangles: M.S.n };
  })()"""},
  # --- a regular sweep of every building, plus a dense one of Maren's store
  {'eval': """(() => {
    const g = __game, C = __cam, M = __cm, v = g.world.village;
    let seed = 4242; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const per = {};
    for (const { id, p } of __list) {
      const before = M.F.checks;
      const step = id === 'store' ? 0.6 : 1.5, margin = id === 'store' ? 3.2 : 2.4;
      for (let lx = -p.w / 2 - margin; lx <= p.w / 2 + margin; lx += step)
        for (let lz = -p.d / 2 - margin; lz <= p.d / 2 + margin; lz += step) {
          const s = v.at(p, lx, lz);
          for (let k = 0; k < (id === 'store' ? 8 : 6); k++)
            for (const pitch of [-1.15, -0.5, -0.22, 0.4, 0.95]) {
              const dist = rnd() < 0.5 ? 3.9 : [1.8, 6, 9][Math.floor(rnd() * 3)];
              C.place(s.x, s.z, (k + rnd() * 0.9) * (Math.PI * 2 / (id === 'store' ? 8 : 6)), pitch);
              g.rig.dist = dist; g.rig.snap();
              g.sim(1 / 60);
              M.check(`${id} sweep`);
            }
        }
      per[id] = M.F.checks - before;
    }
    g.rig.dist = 3.9;
    return { per, clips: M.F.clips, inside: M.F.inside, fails: M.F.fails.length };
  })()"""},
  # --- the cave mouth
  {'eval': """(() => {
    const g = __game, C = __cam, M = __cm, e = g.resources.caveExit;
    const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
    for (const r of [0.5, 1.5, 2.5, 4.2, 6]) for (const side of [-2.5, -1.2, 0, 1.2, 2.5]) for (let k = 0; k < 12; k++) for (const pitch of [-1.0, -0.22, 0.6]) {
      C.place(e.x - fx * (r - 4.2) + fz * side, e.z - fz * (r - 4.2) - fx * side, k * Math.PI / 6, pitch);
      g.sim(1 / 60);
      M.check('cave mouth sweep');
    }
    return { checks: M.F.checks, fails: M.F.fails.length };
  })()"""},
  # --- Maren's house, for looking at: outside by the eaves, and inside
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = v.places.store;
    const s = v.at(b, b.w / 2 + 0.6, b.d / 2 + 0.4);
    C.place(s.x, s.z, b.rot + 2.4, 0.15); g.sim(0.4); g.run(0.1);
    return 1;
  })()"""},
  {'shot': 'buildings_maren_eaves'},
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = v.places.store;
    const s = v.at(b, -1.5, 2.2);
    C.place(s.x, s.z, b.rot + Math.PI * 0.8, 0.9); g.sim(0.5); g.run(0.1);
    return 1;
  })()"""},
  {'shot': 'buildings_maren_inside_up'},
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = v.places.store;
    const s = v.at(b, b.w / 2 + 1.2, -b.d / 2 - 0.4);
    C.place(s.x, s.z, b.rot + Math.PI * 0.25, -0.9); g.sim(0.5); g.run(0.1);
    return 1;
  })()"""},
  {'shot': 'buildings_maren_roof_down'},
  # --- verdict
  {'eval': """(() => {
    const M = __cm, F = M.F;
    const lines = F.fails.slice();
    if (M.S.n < 100000) lines.push('FAIL truth mesh too small: ' + M.S.n + ' triangles');
    if (F.checks < 5000) lines.push('FAIL too few camera checks: ' + F.checks);
    if (F.skipped > F.checks * 0.15) lines.push('FAIL too many poses skipped as head-in-wall: ' + F.skipped + ' of ' + F.checks);
    return { checks: F.checks, skippedHeadInWall: F.skipped, clips: F.clips, inside: F.inside, occludedByScenery: F.occluded, fails: lines.length, failLines: lines.join(' || ') || 'none' };
  })()"""},
]

# The town has dozens of cottages built by the same rules, so by default this plays the public
# buildings, the workshops and every fourth house; CAMERA_FULL=1 plays every house.
import os as _os
_every = '1' if _os.environ.get('CAMERA_FULL') else '4'
STEPS = [dict(s, eval=s['eval'].replace('__EVERY__', _every)) if 'eval' in s else s for s in STEPS]
