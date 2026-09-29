# ci paths=src/world/,src/game/fight.js,public/assets/world,tests/playtest/landmarks
# The landmarks and the camps (src/world/landmarks.js, fort.js, smoke.js), checked in the built world:
#   built    each landmark exists, is tall enough to read from town, and stands on its ground
#   effects  smoke plumes and flames are live objects outside the static batch (no colliders, no camera)
#   trees    none grow inside the ruin or the bandit fort's clearing
#   sight    the abbey shows straight up Lake Street from the spawn, over the bank; the beacon from
#            Bridge Street; the lighthouse through the south gate; the headframe from the Quarry Road
#            (sight lines clear of the ground, walls, roofs, trunks and tree crowns)
#   walk     with the game's own controller: into the fort by the west gate and out by the east gate onto
#            the East Road; the palisade stops you; the walkway stairs climb; a jump from the walkway
#            doesn't carry you over; into the abbey by its south door, not through its wall; into the
#            goblin camp by its trail; from the Yard Path onto the headframe's yard; up to the doors of
#            the lighthouse and the beacon tower (which stop you)
# The camps' people are parked during the walks, so a walk isn't a fight. Prints "FAIL ..." lines.
def done(expr='{}'):
    return "(() => { const o = %s; o.failLines = __lm.fails.splice(0).join(' || ') || 'none'; return o; })()" % expr

STEPS = [
  {'eval': '@landmarks_helpers.js'},
  # --- built, seated, effects kept apart, trees
  {'eval': """(() => {
    const L = __lm, g = __game, w = g.world, S = w.sites, P = S.parts, M = P.landmarks, F = P.fort, out = {};
    for (const k of ['abbey', 'beacon', 'headframe', 'lighthouse']) if (!M?.[k]) L.fail('landmark: the ' + k + ' was not built');
    if (!F) L.fail('fort: the bandit fort was not built');
    const tall = { abbey: [M.abbey.apex[1] - M.abbey.base, 18], beacon: [M.beacon.top - M.beacon.base, 12], headframe: [M.headframe.top - M.headframe.base, 13], lighthouse: [M.lighthouse.top - M.lighthouse.base, 14] };
    for (const [k, [h, min]] of Object.entries(tall)) { out[k] = +h.toFixed(1); if (h < min) L.fail('landmark: the ' + k + ' is only ' + h.toFixed(1) + ' m tall (want ' + min + '+), too small to read from town'); }
    for (const k of ['beacon', 'headframe']) { const o = M[k], gy = w.heightAt(o.x, o.z); if (Math.abs(gy - o.base) > 0.3) L.fail('landmark: the ' + k + ' stands ' + L.f2(o.base - gy) + ' m off its ground'); }
    const plumes = S.smoke?.plumes || [];
    out.plumes = plumes.length;
    if (plumes.length < 4) L.fail('smoke: only ' + plumes.length + ' plumes (the beacon, the chimney and both camps want one)');
    for (const p of plumes) if (!p.parent || p.parent === S.mesh) L.fail('smoke: a plume is not a live object of its own');
    const baked = new Set();
    S.mesh.traverse((o) => { if (o.isMesh) baked.add(o.material); });
    for (const m of baked) if (m.transparent || m.blending === __THREE.AdditiveBlending) L.fail('batch: a see-through material (' + (m.name || m.type) + ') is baked into the static batch');
    if (!M.beacon.fire?.light) L.fail('beacon: the fire has no light');
    const inFort = w.forest.trees.filter((t) => Math.hypot(t.x - F.x, t.z - F.z) < F.R + 8).length;
    if (inFort) L.fail('trees: ' + inFort + ' trees stand in or against the bandit fort');
    const fr = M.abbey.frame;
    const inRuin = w.forest.trees.filter((t) => { const dx = t.x - fr.ox, dz = t.z - fr.oz, lx = dx * fr.c - dz * fr.s, lz = dx * fr.s + dz * fr.c; return lx > -23 && lx < 16 && Math.abs(lz) < 6; }).length;
    if (inRuin) L.fail('trees: ' + inRuin + ' trees grow inside the abbey ruin');
    out.treesCleared = [M.treesCleared, F.treesCleared];
    return out; })()"""},
  {'eval': done()},
  # --- sight lines from town
  {'eval': """(() => {
    const L = __lm, M = __game.world.sites.parts.landmarks, out = {};
    const up = (p, h) => [p[0], p[1] + h, p[2]];
    const tests = [
      ['abbey gable from the spawn', L.eye(-8, 53), up(M.abbey.apex, 0.6), 2],
      ['abbey tower from the spawn', L.eye(-8, 53), up(M.abbey.towerTop, 3.5), 5],
      ['abbey gable from Lake Street outside the gate', L.eye(-8, 66), up(M.abbey.apex, 0.6), 2],
      ['beacon from Bridge Street', L.eye(60, 14), [M.beacon.x, M.beacon.top - 0.5, M.beacon.z], M.beacon.R + 1],
      ['beacon from the bridge', L.eye(90, 3), [M.beacon.x, M.beacon.top - 0.5, M.beacon.z], M.beacon.R + 1],
      ['lighthouse through the south gate', L.eye(-8, 60), [M.lighthouse.x, M.lighthouse.top - 1.2, M.lighthouse.z], 2],
      ['headframe from the Quarry Road', L.eye(-29, -40), [M.headframe.wheel[0], M.headframe.top + 0.3, M.headframe.wheel[2]], 2],
    ];
    for (const [name, a, b, near] of tests) {
      const r = L.sight(a, b, near);
      out[name] = r.clear ? 'clear' : 't=' + r.t + (r.blockedAt ? ' solid at ' + r.blockedAt : '') + (r.crown ? ' tree at ' + r.crown : '');
      if (!r.clear) L.fail('sight: the ' + name + ' is blocked (' + out[name] + ')');
    }
    return out; })()"""},
  {'eval': done()},
  # --- the bandit fort on foot
  {'eval': """(() => {
    const L = __lm, g = __game, F = g.world.sites.parts.fort, out = {};
    L.park(true);
    // In from Bridge Street through the west gate.
    let [sx, sz] = L.polar(F, F.west, F.R + 14), [tx, tz] = L.polar(F, F.west, F.R - 6);
    L.place(sx, sz, tx, tz);
    let r = L.walk(tx, tz, 8), d = Math.hypot(r.x - tx, r.z - tz);
    out.westGate = L.f2(d);
    if (d > 1.2) L.fail('fort: walking in from Bridge Street through the west gate stopped ' + L.f2(d) + ' m short, at (' + L.f2(r.x) + ', ' + L.f2(r.z) + ')');
    // Out through the east gate and onto the East Road.
    [sx, sz] = L.polar(F, F.east, F.R - 6);
    [tx, tz] = L.polar(F, F.east, F.R);
    L.place(sx, sz, tx, tz);
    L.walk(tx, tz, 4);
    r = L.walk(288.5, 82.5, 5);
    d = Math.hypot(r.x - 288.5, r.z - 82.5);
    out.eastGate = L.f2(d);
    if (d > 1.2) L.fail('fort: walking out through the east gate onto the East Road stopped ' + L.f2(d) + ' m short, at (' + L.f2(r.x) + ', ' + L.f2(r.z) + ')');
    // The palisade stops you.
    [sx, sz] = L.polar(F, 2.0, F.R + 5);
    [tx, tz] = L.polar(F, 2.0, F.R - 5);
    L.place(sx, sz, tx, tz);
    r = L.walk(tx, tz, 4);
    const rw = Math.hypot(r.x - F.x, r.z - F.z);
    out.wall = L.f2(rw);
    if (rw < F.R + 0.2) L.fail('fort: walked through the palisade (ended ' + L.f2(rw) + ' m from the middle; the wall stands at ' + F.R + ')');
    // Up each walkway's stair onto the deck.
    out.stairs = F.walkways.map((wk) => {
      L.place(wk.foot[0], wk.foot[1], wk.top[0], wk.top[1]);
      const q = L.walk(wk.top[0], wk.top[1], 5, { stop: 0.4 });
      if (Math.abs(q.y - wk.deck) > 0.25) L.fail('fort: could not climb a walkway stair (feet at ' + L.f2(q.y) + ', deck at ' + L.f2(wk.deck) + ')');
      return L.f2(q.y - wk.deck);
    });
    // A jump from the walkway doesn't carry you over the palisade.
    const wk = F.walkways[0], am = (wk.a0 + wk.a1) / 2, [ox, oz] = L.polar(F, am, F.R + 3);
    L.place(wk.mid[0], wk.mid[1], ox, oz);
    r = L.walk(ox, oz, 3, { jump: (P) => Math.hypot(P.pos.x - F.x, P.pos.z - F.z) > F.R - 1.0 });
    const rj = Math.hypot(r.x - F.x, r.z - F.z);
    out.walkwayJump = L.f2(rj);
    if (!r.jumped) L.fail('fort: the jump from the walkway never happened');
    if (rj > F.R - 0.2) L.fail('fort: jumped from the walkway over the palisade (ended ' + L.f2(rj) + ' m out)');
    L.park(false);
    return out; })()"""},
  {'eval': done()},
  # --- the abbey, the goblin camp, the headframe's yard, the lighthouse and beacon doors on foot
  {'eval': """(() => {
    const L = __lm, g = __game, P = g.world.sites.parts, M = P.landmarks, Gb = P.fort.goblins, out = {};
    L.park(true);
    const A = M.abbey;
    L.place(A.outside[0], A.outside[1], A.inside[0], A.inside[1]);
    let r = L.walk(A.inside[0], A.inside[1], 6), d = Math.hypot(r.x - A.inside[0], r.z - A.inside[1]);
    out.abbeyDoor = L.f2(d);
    if (d > 1.2) L.fail('abbey: walking in through the south door stopped ' + L.f2(d) + ' m short');
    L.place(A.bayOutside[0], A.bayOutside[1], A.bayInside[0], A.bayInside[1]);
    r = L.walk(A.bayInside[0], A.bayInside[1], 4);
    d = Math.hypot(r.x - A.bayInside[0], r.z - A.bayInside[1]);
    out.abbeyWall = L.f2(d);
    if (d < 4.3) L.fail('abbey: walked through the south wall (got within ' + L.f2(d) + ' m of the nave middle)');
    let [sx, sz] = L.polar(Gb, Gb.way, Gb.R + 6), [tx, tz] = L.polar(Gb, Gb.way, 4);
    L.place(sx, sz, tx, tz);
    r = L.walk(tx, tz, 8);
    d = Math.hypot(r.x - tx, r.z - tz);
    out.goblinCamp = L.f2(d);
    if (d > 1.2) L.fail('goblins: walking into the camp along the trail stopped ' + L.f2(d) + ' m short, at (' + L.f2(r.x) + ', ' + L.f2(r.z) + ')');
    const H = M.headframe;
    L.place(H.pathEnd[0], H.pathEnd[1], H.yard[0], H.yard[1]);
    r = L.walk(H.yard[0], H.yard[1], 4);
    d = Math.hypot(r.x - H.yard[0], r.z - H.yard[1]);
    out.headframeYard = L.f2(d);
    if (d > 1.0) L.fail('headframe: walking from the Yard Path onto the yard stopped ' + L.f2(d) + ' m short');
    if (Math.abs(r.y - H.base) > 0.3) L.fail('headframe: the yard is not level with the headframe (' + L.f2(r.y - H.base) + ' m)');
    for (const k of ['lighthouse', 'beacon']) {
      const o = M[k];
      L.place(o.approach[0], o.approach[1], o.x, o.z);
      r = L.walk(o.x, o.z, 4);
      d = Math.hypot(r.x - o.x, r.z - o.z);
      out[k + 'Door'] = L.f2(d);
      if (d < o.R - 0.05) L.fail(k + ': walked into the tower (' + L.f2(d) + ' m from its middle)');
      if (d > o.R + 0.9) L.fail(k + ': stopped ' + L.f2(d - o.R) + ' m short of the door');
    }
    L.park(false);
    return out; })()"""},
  {'eval': done()},
]
