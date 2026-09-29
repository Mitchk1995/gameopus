# ci paths=src/world/,src/content/,src/game/,public/assets/world,tests/playtest/world
# The vale as a region: checks the map and the built world numerically (no frames are drawn, only game ticks).
#   - reachable on foot from the spawn: every town gate, the bridge, the front of each way out, the mine mouth, the
#     dungeon entrance, both camps, the dock and every point-of-interest pad
#   - nothing is reachable within 60 m of the map edge, and nothing beyond a closure
#   - each closure stops a scripted walk, run, jump and roll (at many places across the gorge, its walls included)
#   - every way out is locked by default; setLocked(id, false) makes it passable (the gate swings, the boom lifts,
#     the rubble sinks) and locking it again shuts it
#   - every way out has a notice that E reads
#   - a signpost stands at every junction, off the roads, its boards naming real destinations and pointing the right
#     way, with distances that match the road; warning posts and cairns stand where they should
# Prints "PASS ..." and "FAIL ..." lines (play.py exits non-zero on a FAIL) and a summary line.
STEPS = [
  {'eval': '@town_helpers.js'},
  {'eval': '@world_helpers.js'},
  # --- the ways out: locked by default, each with a notice and a way through that the code can open
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), ex = W.parts().exits, out = [];
    for (const e of M.EXITS) {
      const p = ex.byId[e.id];
      if (!p) { W.fail('exit ' + e.id + ' was not built'); continue; }
      if (!e.locked) W.fail('exit ' + e.id + ' is not locked in the data');
      if (!g.world.sites.isLocked(e.id)) W.fail('exit ' + e.id + ' is not locked by default');
      const n = g.world.sites.interactables.find((o) => o.station === 'sign' && o.title === e.sign.title);
      if (!n) { W.fail('exit ' + e.id + ' has no notice'); continue; }
      if (!Array.isArray(n.text) || n.text.length < 2 || n.text.join(' ').length < 200) W.fail('the notice at exit ' + e.id + ' says too little');
      // The notice is out where you come from, within reach of the front of the closure.
      const d = Math.hypot(n.x - p.front.x, n.z - p.front.z);
      if (d > 14) W.fail('the notice at exit ' + e.id + ' is ' + d.toFixed(0) + ' m from the way in');
      // The solids that shut the way stand at least 2.4 m tall above the ground under them (no hopping over).
      for (const sh of p.seal) {
        const top = sh.y1 - g.world.heightAt(sh.x, sh.z);
        if (top < 2.4) W.fail('a solid that shuts the ' + e.id + ' way is only ' + top.toFixed(1) + ' m tall');
      }
      // No tree stands in the closure's footprint (they are felled at build time; whoever grows the woods keeps clear too).
      const [along, across] = e.clear;
      const trees = g.world.forest.trees.filter((t) => !t.felled && t.radius > 0 && Math.abs((t.x - e.x) * e.tx + (t.z - e.z) * e.tz) < along && Math.abs((t.z - e.z) * e.tx - (t.x - e.x) * e.tz) < across);
      if (trees.length) W.fail(trees.length + ' trees stand in the ' + e.id + ' closure clearing');
      out.push('PASS exit ' + e.id + ' (' + e.kind + '): locked by default, ' + p.seal.length + ' shutting solids all 2.4 m or more, clearing free of trees, notice "' + e.sign.title + '" ' + d.toFixed(1) + ' m from the way in');
    }
    if (M.EXITS.length !== 3) W.fail('expected three ways out, found ' + M.EXITS.length);
    return out.join(' | ');
  })()"""},
  # --- reachability on foot: one flood from the spawn, one from the east bank, over the whole map
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), V = g.world.village, out = [];
    const S = M.SPAWN, br = W.parts().bridge;
    const east = [br.x + br.length / 2 + 4, br.z], west = [br.x - br.length / 2 - 4, br.z];
    const t0 = performance.now();
    const f = W.flood(-400, -400, 400, 400, 2, [[S.x, S.z], east]);
    window.__flood = f;
    out.push('flood ' + f.count + ' cells in ' + Math.round(performance.now() - t0) + ' ms');
    if (!f.reach(S.x, S.z, 1)) W.fail('the spawn point is not walkable');
    const need = (label, x, z, r = 3) => {
      if (f.reach(x, z, r)) out.push('PASS reach ' + label);
      else W.fail('cannot reach ' + label + ' on foot (' + x.toFixed(0) + ',' + z.toFixed(0) + ')');
    };
    for (const gt of V.layout.GATES) need('the ' + gt.id + ' gate', gt.x + gt.out[0] * 6, gt.z + gt.out[1] * 6);
    need('the west end of the bridge', west[0], west[1]);
    need('the east end of the bridge', east[0], east[1]);
    for (const e of M.EXITS) need('the front of the ' + e.id + ' way out', W.parts().exits.byId[e.id].front.x, W.parts().exits.byId[e.id].front.z);
    need('the mine mouth', M.MINE_ENTRANCE.x, M.MINE_ENTRANCE.z, 5);
    const cave = g.resources.cave;
    need('the dungeon entrance', cave.x, cave.z, cave.reach + 1);
    need('the bandit camp', M.BANDIT_CAMP.x, M.BANDIT_CAMP.z, 6);
    need('the goblin camp', M.GOBLIN_CAMP.x, M.GOBLIN_CAMP.z, 5);
    need('the dock', M.LANDMARKS.dock.x, M.LANDMARKS.dock.z, 6);
    for (const p of M.POIS) need('the ' + p.name + ' pad', p.x, p.z, 4);
    // The way round the mountains is closed: nothing within 60 m of the map edge can be reached on foot.
    let edge = 0, first = null;
    for (let j = 0; j < f.nz; j++) for (let i = 0; i < f.nx; i++) {
      if (!f.seen[j * f.nx + i]) continue;
      const [x, z] = f.at(i, j);
      if (Math.max(Math.abs(x), Math.abs(z)) > 340) { edge++; first = first || [x.toFixed(0), z.toFixed(0)]; }
    }
    if (edge) W.fail(edge + ' reachable cells within 60 m of the map edge, first at ' + first.join(','));
    else out.push('PASS nothing reachable within 60 m of the map edge');
    return out.join(' | ');
  })()"""},
  # --- the bridge: walk across it
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), br = W.parts().bridge, inp = g.input;
    g.player.spawn(br.x - br.length / 2 - 6, br.z, Math.PI / 2); g.rig.yaw = Math.PI / 2 + Math.PI;
    inp.keys.clear(); inp.keys.add('KeyW');
    // (Wading slows the player over the river even on the deck, so the crossing takes a while.)
    g.sim(18);
    inp.keys.clear();
    const x = g.player.pos.x, want = br.x + br.length / 2 + 2;
    if (x < want) W.fail('walking east along Bridge Street stopped at x=' + x.toFixed(1) + ' before the far end of the bridge (' + want.toFixed(1) + ')');
    return x >= want ? 'PASS the bridge can be walked across (reached x=' + x.toFixed(1) + ')' : 'bridge blocked';
  })()"""},
  # --- each closure stops walking, running, jumping and rolling, across the whole gorge
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), out = [];
    for (const e of M.EXITS) {
      const p = W.parts().exits.byId[e.id];
      let worst = -1e9, runs = 0, at = null;
      for (const lat of [-12, -9, -6, -3, -1, 0, 1, 3, 6, 9, 12]) {
        for (const opt of [{ run: true, jump: 30 }, { jump: 17, roll: 40 }, { strafe: lat < 0 ? 1 : -1, run: true, jump: 22, ticks: 150 }]) {
          const r = W.walk(e, { lat, ticks: 260, ...opt });
          runs++;
          if (r.maxU > worst) { worst = r.maxU; at = lat; }
          if (r.maxU > p.stopU) W.fail('the ' + e.id + ' closure let a walker through at ' + lat + ' m to the side (got ' + r.maxU.toFixed(1) + ' m past the closure, limit ' + p.stopU + ') ' + JSON.stringify(opt));
        }
      }
      out.push('PASS ' + e.id + ' closure held against ' + runs + ' walks, runs, jumps and rolls (furthest ' + worst.toFixed(1) + ' m, limit ' + p.stopU + ')');
    }
    return out.join(' | ');
  })()"""},
  # --- nothing is reachable beyond a closure: the road on beyond the east and south gates, and behind the tunnel portal
  {'eval': """(() => {
    const W = __world, M = W.map(), f = window.__flood, out = [];
    for (const e of M.EXITS) {
      const p = W.parts().exits.byId[e.id];
      const road = M.roadById(e.road);
      // Points along the road on the far side of the closure, from 10 m past it to its end.
      let bad = 0, n = 0;
      for (let s = e.s + 10; s < M.roadLength(road); s += 6) {
        const q = M.pointAtRoad(road, s);
        n++;
        if (f.reach(q[0], q[1], 1.5)) bad++;
      }
      // The tunnel's road ends at its portal: what lies beyond is the bore, four metres in.
      if (e.kind === 'tunnel') { n++; if (f.reach(e.x + e.tx * 4.2, e.z + e.tz * 4.2, 0.4)) bad++; }
      if (bad) W.fail('the road beyond the ' + e.id + ' closure is reachable on foot (' + bad + ' of ' + n + ' points)');
      else out.push('PASS the ground beyond the ' + e.id + ' closure is not reachable (' + n + ' points)');
    }
    return out.join(' | ');
  })()"""},
  # --- opening a way: the gate swings, the boom lifts, the rubble sinks; walk through; shut it again
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), out = [];
    for (const e of M.EXITS) {
      const p = W.parts().exits.byId[e.id];
      g.world.sites.setLocked(e.id, false);
      if (g.world.sites.isLocked(e.id)) W.fail('setLocked(' + e.id + ', false) did not unlock it');
      g.sim(6);
      const open = W.walk(e, { lat: 0, from: 14, ticks: 420 });
      if (open.maxU <= p.openU) W.fail('the ' + e.id + ' way is open but a walk only got ' + open.maxU.toFixed(1) + ' m past the closure (needs more than ' + p.openU + ')');
      // The walls stay: a walk along the gorge wall still stops.
      const wall = W.walk(e, { lat: e.kind === 'gatehouse' ? 6 : e.kind === 'toll' ? -6 : 7, run: true, jump: 25, ticks: 240 });
      if (wall.maxU > p.stopU + (e.kind === 'tunnel' ? 0 : 1.2)) W.fail('with the ' + e.id + ' way open the walls no longer hold (a walk at the side got ' + wall.maxU.toFixed(1) + ' m past)');
      g.world.sites.setLocked(e.id, true);
      g.sim(6);
      const shut = W.walk(e, { lat: 0, from: 14, ticks: 420 });
      if (shut.maxU >= p.stopU) W.fail('the ' + e.id + ' way did not shut again (a walk got ' + shut.maxU.toFixed(1) + ' m past)');
      out.push('PASS ' + e.id + ' opens (walk reached ' + open.maxU.toFixed(1) + ' m past, needs ' + p.openU + ') and shuts again (walk stopped at ' + shut.maxU.toFixed(1) + ')');
    }
    return out.join(' | ');
  })()"""},
  # --- canary: the walk test must notice a hole. Take a closure's shutting solids away (leaving it 'locked') and it must fail.
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), out = [];
    for (const e of M.EXITS) {
      const p = W.parts().exits.byId[e.id];
      p.apply(1);
      const r = W.walk(e, { lat: 0, from: 14, ticks: 420 });
      p.apply(0);
      if (r.maxU > p.openU) out.push('PASS canary: with the ' + e.id + ' solids taken away the walk gets through, so the walk test can see a hole');
      else W.fail('canary: the walk test did not notice the ' + e.id + ' closure with its solids taken away (got ' + r.maxU.toFixed(1) + ' m past)');
    }
    return out.join(' | ');
  })()"""},
  # --- the notices: stand in front of one, look at it, press E, and the text opens
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), out = [];
    for (const e of M.EXITS) {
      const n = g.world.sites.interactables.find((o) => o.station === 'sign' && o.title === e.sign.title);
      // Stand two and a half metres out from the notice on the road side, looking at it.
      const yaw = Math.atan2(n.x - (e.x - e.tx * 20), n.z - (e.z - e.tz * 20));
      const px = n.x - Math.sin(yaw) * 2.6, pz = n.z - Math.cos(yaw) * 2.6;
      g.endTalk();
      g.player.spawn(px, pz, yaw); g.rig.yaw = yaw + Math.PI; g.rig.pitch = -0.02;
      g.sim(0.6);
      const t = g.target;
      if (!t || t.station !== 'sign' || t.title !== e.sign.title) { W.fail('looking at the ' + e.id + ' notice offers ' + (t ? (t.station + ':' + (t.title || t.name)) : 'nothing')); continue; }
      g.input.pressed.add('KeyE');
      g.sim(1 / 60);
      const said = g.talk.saidEl.textContent;
      if (!g.talk.isOpen || said !== e.sign.text[0]) { W.fail('pressing E at the ' + e.id + ' notice did not show its text (open=' + g.talk.isOpen + ', said="' + said.slice(0, 40) + '")'); g.endTalk(); continue; }
      const pages = e.sign.text.length;
      for (let i = 1; i < pages; i++) { g.talk.root.querySelector('.opt').click(); if (g.talk.saidEl.textContent !== e.sign.text[i]) W.fail('page ' + (i + 1) + ' of the ' + e.id + ' notice is wrong'); }
      g.talk.root.querySelector('.opt').click();
      if (g.talk.isOpen) W.fail('the ' + e.id + ' notice did not close');
      out.push('PASS the ' + e.id + ' notice reads with E (' + pages + ' pages)');
    }
    return out.join(' | ');
  })()"""},
  # --- signposts: one at every junction, beside the roads, its boards true to the road graph
  {'eval': """(() => {
    const W = __world, g = W.g(), M = W.map(), way = W.parts().waymarks, out = [];
    const ends = new Set(M.ROADS.flatMap((r) => r.ends));
    if (way.junctions.length !== M.JUNCTIONS.length) W.fail(way.junctions.length + ' signposts for ' + M.JUNCTIONS.length + ' junctions');
    const nearRoad = (x, z) => { let best = null; for (const r of M.ROADS) { const q = M.roadAt(r.id, x, z); if (!best || q.d - r.width < best.gap) best = { gap: q.d - r.width, id: r.id }; } return best; };
    let boards = 0;
    M.JUNCTIONS.forEach((j, i) => {
      const post = way.junctions.find((p) => p.id === j.id);
      if (!post) { W.fail('no signpost at ' + j.id + ' (' + j.at.map((v) => v.toFixed(0)).join(',') + ')'); return; }
      const d = Math.hypot(post.x - j.at[0], post.z - j.at[1]);
      if (d > 14) W.fail('the ' + j.id + ' signpost stands ' + d.toFixed(0) + ' m from its junction');
      const nr = nearRoad(post.x, post.z);
      if (nr.gap < 0.8) W.fail('the ' + j.id + ' signpost stands on the ' + nr.id + ' (' + nr.gap.toFixed(1) + ' m from its painted edge)');
      if (post.boards !== j.boards.length) W.fail('the ' + j.id + ' signpost has ' + post.boards + ' boards for ' + j.boards.length + ' destinations');
      for (const b of j.boards) {
        boards++;
        const r = M.roadById(b.road);
        if (!r.ends.includes(b.to) || !ends.has(b.to)) W.fail(j.id + ' board "' + b.text + '" names no real destination');
        const q = M.roadAt(b.road, j.at[0], j.at[1]);
        const forward = b.to === r.ends[1];
        const dist = forward ? q.length - q.s : q.s;
        const shown = parseInt(b.text.slice(b.to.length), 10);
        if (Math.abs(shown - dist) > 6) W.fail(j.id + ' board "' + b.text + '" says ' + shown + ' m but the road is ' + dist.toFixed(0) + ' m');
        // Points the way the road goes from the junction.
        const [bx, bz] = M.pointAtRoad(r, Math.max(0, Math.min(q.length, q.s + (forward ? 15 : -15))));
        const dx = bx - q.x, dz = bz - q.z, l = Math.hypot(dx, dz) || 1;
        if ((dx * b.dir[0] + dz * b.dir[1]) / l < 0.9) W.fail(j.id + ' board "' + b.text + '" points away from its road');
      }
    });
    out.push('PASS ' + way.junctions.length + ' signposts, ' + boards + ' boards: off the roads, naming real places, distances and directions true to the road graph');
    // Warning posts and cairns.
    if (way.warnings.length !== M.WARNINGS.length) W.fail(way.warnings.length + ' warning posts for ' + M.WARNINGS.length + ' warnings');
    for (const w of way.warnings) { const nr = nearRoad(w.x, w.z); if (nr.gap < 0.8) W.fail('warning post ' + w.id + ' stands on the ' + nr.id); }
    out.push('PASS ' + way.warnings.length + ' warning posts stand off the roads');
    if (way.cairns.length !== M.POIS.length) W.fail(way.cairns.length + ' cairns for ' + M.POIS.length + ' pads');
    for (const p of M.POIS) {
      const c = way.cairns.find((q) => q.id === p.id);
      if (!c) { W.fail('no cairn on the ' + p.name + ' pad'); continue; }
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > p.r + 4) W.fail('the cairn for ' + p.name + ' stands ' + d.toFixed(0) + ' m from its pad (radius ' + p.r + ')');
      if (!g.world.sites.interactables.some((o) => o.station === 'sign' && o.title === p.name)) W.fail('the ' + p.name + ' name board cannot be read');
    }
    out.push('PASS ' + way.cairns.length + ' cairns with readable name boards on their pads');
    return out.join(' | ');
  })()"""},
  {'eval': "(() => { const f = __world.fails; return f.length ? f.join('\\n') : 'world ok'; })()"},
]
