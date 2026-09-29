# ci
# Ashford's layout is a town, not a scatter: checks the plan and the built world.
#   - every building and station can be reached on foot from the spawn (flood fill on the collider grid)
#   - no buildings overlap each other, the streets, the square, the fenced plots or the wall
#   - buildings stand on level ground; streets are gentle enough to walk
#   - every door opens onto a street, the square or a yard, and the way to it is clear
#   - every NPC stands somewhere walkable, near their work (or walks a clear route)
#   - the three gates are open and the three roads connect to the town
#   - every prop has a reason: it stands within a few metres of a building, street, fence, wall or stall
# Prints "FAIL ..." lines for misses (play.py exits non-zero on those) and a summary line.
STEPS = [
  {'eval': '@town_helpers.js'},
  # --- the plan: overlaps, terrain, doors, props
  {'eval': """(() => {
    const T = __town, g = __game, V = g.world.village, L = V.layout, w = g.world;
    const name = (b) => (b.id === 'house' ? b.role : b.id) + '@' + b.x.toFixed(0) + ',' + b.z.toFixed(0);
    const B = L.BUILDINGS, fp = (b, pad = 0) => L.footprint(b, pad);
    // Inside the wall, with room to spare.
    for (const b of B) for (const [x, z] of fp(b)) if (L.polyDistance(x, z) > -1.4) T.fail(name(b) + ' stands on or outside the town wall');
    // Buildings never overlap.
    // (the chapel's tower is built onto the west end of its nave: one building)
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (!(B[i].type === 'chapel' && B[j].type === 'chapel') && T.sat(fp(B[i], 0.1), fp(B[j], 0.1))) T.fail('buildings overlap: ' + name(B[i]) + ' and ' + name(B[j]));
    // Nor the streets, the square, the plots or the wall.
    for (const b of B) {
      const poly = fp(b);
      const edge = [];
      poly.forEach((p, i) => { const q = poly[(i + 1) % 4]; const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5); for (let k = 0; k < n; k++) edge.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]); });
      for (const s of L.STREETS) for (const [x, z] of edge) if (!b.groundOpen && L.lineDistance(x, z, s.pts) < s.w / 2 - 0.2) { T.fail(name(b) + ' overlaps ' + s.name); break; }
      const sq = L.SQUARE;
      // (a market hall on posts stands in the square by design: its ground floor is the market's)
      if (!b.groundOpen && T.sat(fp(b), T.rectPoly({ x0: sq.x0 + 0.2, x1: sq.x1 - 0.2, z0: sq.z0 + 0.2, z1: sq.z1 - 0.2 }))) T.fail(name(b) + ' overlaps the market square');
      for (const p of L.PLOTS) if (T.sat(fp(b), T.rectPoly(p))) T.fail(name(b) + ' overlaps plot ' + p.id);
      for (const wl of L.WALLS) { const n = Math.ceil(Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1])); for (let k = 0; k <= n; k++) { const x = wl.a[0] + ((wl.b[0] - wl.a[0]) * k) / n, z = wl.a[1] + ((wl.b[1] - wl.a[1]) * k) / n; if (T.inPoly(x, z, fp(b, 0.6))) { T.fail(name(b) + ' is hard against the wall'); k = n + 1; } } }
    }
    // Plots do not overlap each other.
    for (let i = 0; i < L.PLOTS.length; i++) for (let j = i + 1; j < L.PLOTS.length; j++) if (T.sat(T.rectPoly(L.PLOTS[i]), T.rectPoly(L.PLOTS[j]))) T.fail('plots overlap: ' + L.PLOTS[i].id + ' and ' + L.PLOTS[j].id);
    // Level ground under every building.
    for (const b of B) {
      const y = 3.2 + (b.rise || 0);
      let worst = 0;
      for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.5, 0, 0.5]) { const [x, z] = L.toWorld(b, fx * b.w, fz * b.d); worst = Math.max(worst, Math.abs(w.heightAt(x, z) - y)); }
      if (worst > 0.12) T.fail(name(b) + ' is on a slope (' + worst.toFixed(2) + ' m off its floor)');
    }
    // Streets: gentle enough to walk everywhere.
    let steepest = 0;
    for (const s of L.STREETS) for (let i = 0; i < s.pts.length - 1; i++) {
      const [a, c] = [s.pts[i], s.pts[i + 1]], n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2);
      for (let k = 0; k < n; k++) {
        const x0 = a[0] + ((c[0] - a[0]) * k) / n, z0 = a[1] + ((c[1] - a[1]) * k) / n, x1 = a[0] + ((c[0] - a[0]) * (k + 1)) / n, z1 = a[1] + ((c[1] - a[1]) * (k + 1)) / n;
        const grade = Math.abs(w.heightAt(x1, z1) - w.heightAt(x0, z0)) / Math.hypot(x1 - x0, z1 - z0);
        steepest = Math.max(steepest, grade);
        if (grade > 0.3) T.fail(s.name + ' is too steep near ' + x0.toFixed(0) + ',' + z0.toFixed(0) + ' (' + grade.toFixed(2) + ')');
      }
    }
    // Every door faces a street, the square or a yard.
    let doors = 0;
    for (const b of B) for (const d of L.doorways(b)) {
      doors++;
      const [x, z] = d.out;
      let best = Infinity;
      for (const s of L.STREETS) best = Math.min(best, L.lineDistance(x, z, s.pts) - s.w / 2);
      best = Math.min(best, L.rectDistance(x, z, L.SQUARE));
      for (const y of L.YARDS) best = Math.min(best, L.rectDistance(x, z, y));
      for (const p of L.PLOTS) best = Math.min(best, L.rectDistance(x, z, p) + 1.0);
      if (best > 3.6) T.fail(name(b) + ' has a door that opens onto nothing (' + best.toFixed(1) + ' m from any street)');
    }
    // Props: none inside a building, none orphaned, every one with a reason.
    const streetGap = (x, z) => Math.min(...L.STREETS.map((s) => L.lineDistance(x, z, s.pts) - s.w / 2));
    let props = 0, worstOrphan = 0;
    for (const p of L.PROPS) {
      props++;
      const label = p.type + (p.name ? ':' + p.name : '') + '@' + p.x.toFixed(1) + ',' + p.z.toFixed(1);
      if (B.some((b) => !b.groundOpen && T.inPoly(p.x, p.z, fp(b, 0.05)))) T.fail('prop inside a building: ' + label);
      if (p.type === 'kit' && !p.why) T.fail('prop without a reason: ' + label);
      let d = Math.min(streetGap(p.x, p.z), L.rectDistance(p.x, p.z, L.SQUARE));
      for (const b of B) d = Math.min(d, T.polyDist(p.x, p.z, fp(b)));
      for (const pl of L.PLOTS) d = Math.min(d, L.rectDistance(p.x, p.z, pl));
      for (const y of L.YARDS) d = Math.min(d, L.rectDistance(p.x, p.z, y));
      for (const wl of L.WALLS) d = Math.min(d, T.segDist(p.x, p.z, wl.a, wl.b));
      for (const gt of L.GATES) d = Math.min(d, Math.hypot(p.x - gt.x, p.z - gt.z) - 3);
      worstOrphan = Math.max(worstOrphan, d);
      if (d > 3.5) T.fail('orphan prop, ' + d.toFixed(1) + ' m from any building, street, fence or wall: ' + label);
    }
    // Fires, wells and stalls stand on the square or near a building.
    return { buildings: B.length, doors, props, worstOrphan: +worstOrphan.toFixed(2), steepestStreet: +steepest.toFixed(2), fails: T.fails.length };
  })()"""},
  # --- walking: flood fill from the spawn over the whole town and its gates
  {'eval': """(() => {
    const T = __town, g = __game, V = g.world.village, L = V.layout, w = g.world;
    const S = V.mapData.SPAWN;
    if (!T.free(S.x, S.z)) T.fail('the spawn point is blocked');
    const fine = T.flood(-72, -44, 54, 82, 0.25, S.x, S.z);
    window.__fine = fine;
    const out = { cells: fine.count };
    // Doors: the way to the outside of every door, and inside the public ones.
    let doors = 0;
    for (const b of L.BUILDINGS) for (const d of L.doorways(b)) {
      doors++;
      if (!fine.reach(d.out[0], d.out[1], 0.3)) T.fail('cannot walk to the door of ' + (b.id === 'house' ? b.role : b.id) + '@' + b.x.toFixed(0) + ',' + b.z.toFixed(0));
      if (b.doors[0].open) {
        const inside = L.toWorld(b, d.door.at !== undefined ? -b.w / 2 + 1 + d.door.at * 2 : 0, b.d / 2 - 2.2);
        if (!fine.reach(inside[0], inside[1], 0.3)) T.fail('cannot walk inside ' + b.id + ' through its door');
      }
    }
    out.doors = doors;
    // Every station near town (bank, furnace, anvil, cooking fire, wheels, kiln, well).
    const stations = g.resources.items.filter((o) => o.kind === 'station' && o.station !== 'cave');
    out.stations = stations.map((o) => o.station).join(',');
    for (const o of stations) {
      if (o.x < -72 || o.x > 54 || o.z < -44 || o.z > 82) continue;
      if (!fine.reach(o.x, o.z, Math.max(0.6, o.reach - 0.4))) T.fail('cannot reach the ' + o.station + ' at ' + o.x.toFixed(1) + ',' + o.z.toFixed(1));
    }
    for (const need of ['bank', 'furnace', 'anvil', 'fire', 'wheel', 'potter', 'kiln', 'well']) if (!stations.some((o) => o.station === need)) T.fail('missing station: ' + need);
    // The market stalls and the well can be walked around; the square is open.
    for (const p of L.PROPS.filter((p) => p.type === 'stall')) {
      const f = [Math.sin(p.rot), Math.cos(p.rot)];
      if (!fine.reach(p.x + f[0] * 1.6, p.z + f[1] * 1.6, 0.3)) T.fail('cannot walk up to the stall at ' + p.x + ',' + p.z);
    }
    // Gates: open, wide, and the road beyond leads on.
    for (const gt of L.GATES) {
      const ox = -gt.out[1], oz = gt.out[0];
      let width = 0;
      for (let d = -4; d <= 4; d += 0.25) if (fine.reach(gt.x + ox * d, gt.z + oz * d, 0.05)) width += 0.25;
      out['gate_' + gt.id] = width;
      if (width < 3.0) T.fail('the ' + gt.id + ' gate is only ' + width + ' m of walkable width');
      if (!fine.reach(gt.x + gt.out[0] * 6, gt.z + gt.out[1] * 6, 0.3)) T.fail('cannot walk out of the ' + gt.id + ' gate');
    }
    for (const gp of L.GAPS) if (!fine.reach(gp.x + gp.out[0] * 3, gp.z + gp.out[1] * 3, 0.3)) T.fail('cannot walk out of the ' + gp.id + ' gap');
    out.fails = T.fails.length;
    return out;
  })()"""},
  # --- the roads: each one is walkable from its gate on, and they end where they should
  {'eval': """(() => {
    const T = __town, g = __game, V = g.world.village, L = V.layout, w = g.world;
    const roads = V.mapData.ROADS;
    const gates = { 0: L.GATES.find((x) => x.id === 'north'), 1: L.GATES.find((x) => x.id === 'east'), 2: L.GATES.find((x) => x.id === 'south') };
    const out = {};
    roads.slice(0, 3).forEach((r, i) => {
      const gt = gates[i];
      const first = r.pts[0];
      // The road starts inside the gate and passes through it.
      let near = Infinity;
      for (const p of r.pts) near = Math.min(near, Math.hypot(p[0] - gt.x, p[1] - gt.z));
      if (near > 3) T.fail('road ' + i + ' does not pass through the ' + gt.id + ' gate (' + near.toFixed(1) + ' m off)');
      // Walk along it: every sample clear (the east road stops at the river, where the bridge will be).
      let bad = 0, n = 0, badAt = null;
      for (let k = 0; k < r.pts.length; k += 2) {
        const p = r.pts[k];
        if (i === 1 && p[0] > 78) break;
        n++;
        if (!T.free(p[0], p[1])) { bad++; badAt = badAt || p; }
      }
      if (bad) T.fail('road ' + i + ' is blocked at ' + badAt.map((v) => v.toFixed(0)).join(',') + ' (' + bad + ' of ' + n + ' samples)');
      out['road' + i] = n;
      // Its far end is where the game says: the mine, the bandits' road, the jetty.
    });
    // Coarse flood over the whole valley from the spawn: the far ends of the roads and the places on them.
    const S = V.mapData.SPAWN;
    const world = T.flood(-330, -330, 330, 300, 1.5, S.x, S.z);
    const reachFar = (label, x, z, r = 4) => { if (!world.reach(x, z, r)) T.fail(label + ' cannot be reached on foot from the spawn (' + x.toFixed(0) + ',' + z.toFixed(0) + ')'); };
    reachFar('the quarry road end', roads[0].pts.at(-1)[0], roads[0].pts.at(-1)[1]);
    reachFar('the mine mouth', V.mapData.MINE_ENTRANCE.x, V.mapData.MINE_ENTRANCE.z, 5);
    reachFar('the lake jetty', roads[2].pts.at(-1)[0], roads[2].pts.at(-1)[1]);
    reachFar('the farm track', roads[4].pts.at(-1)[0], roads[4].pts.at(-1)[1]);
    reachFar('the woodcutters track', roads[5].pts.at(-1)[0], roads[5].pts.at(-1)[1]);
    const rock = g.resources.rocks[0];
    reachFar('a mining rock', rock.x, rock.z, 4);
    const spot = g.resources.spots.find((s) => s.method === 'net');
    reachFar('the net fishing spot', spot.x, spot.z, 8);
    out.fails = T.fails.length;
    out.valleyCells = world.count;
    return out;
  })()"""},
  # --- people: on their feet, at their work
  {'eval': """(() => {
    const T = __town, g = __game, V = g.world.village, L = V.layout, w = g.world;
    const S = (n) => g.resources.items.find((o) => o.station === n);
    const stallOf = (goods) => L.STALLS.find((s) => s.goods === goods);
    const inside = (b, x, z) => T.inPoly(x, z, L.footprint(b, -0.3));
    const work = {
      aldwyn: (n) => Math.hypot(n.pos.x - S('bank').x, n.pos.z - S('bank').z) < 4.5 && inside(L.BUILDINGS.find((b) => b.id === 'bank'), n.pos.x, n.pos.z),
      maren: (n) => inside(L.BUILDINGS.find((b) => b.id === 'store'), n.pos.x, n.pos.z),
      bess: (n) => inside(L.BUILDINGS.find((b) => b.id === 'inn'), n.pos.x, n.pos.z),
      brom: (n) => Math.hypot(n.pos.x - S('furnace').x, n.pos.z - S('furnace').z) < 5,
      ysolde: (n) => Math.hypot(n.pos.x - S('potter').x, n.pos.z - S('potter').z) < 3.5 && Math.hypot(n.pos.x - S('kiln').x, n.pos.z - S('kiln').z) < 9,
      mirelle: (n) => { const s = stallOf('runes'); return Math.hypot(n.pos.x - s.x, n.pos.z - s.z) < 3.2; },
      garrow: (n) => { const gt = L.GATES.find((x) => x.id === 'east'); return Math.hypot(n.pos.x - gt.x, n.pos.z - gt.z) < 6; },
      tam: (n) => { const e = g.resources.jettyEnd; return Math.hypot(n.pos.x - e.x, n.pos.z - e.z) < 16; },
    };
    const names = [];
    for (const n of g.npcs) {
      const id = n.def.id;
      names.push(id);
      const at = id + ' at ' + n.pos.x.toFixed(1) + ',' + n.pos.z.toFixed(1);
      // Standing spots: walkable (ignoring their own collider), and reachable.
      if (!n.route) {
        const own = w.colliders.all.find((s) => s.kind === 'c' && Math.abs(s.x - n.pos.x) < 0.01 && Math.abs(s.z - n.pos.z) < 0.01 && Math.abs(s.r - 0.35) < 0.01);
        if (!T.free(n.pos.x, n.pos.z, own)) T.fail(id + ' stands somewhere blocked: ' + at);
        if (n.pos.x > -72 && n.pos.x < 54 && n.pos.z > -44 && n.pos.z < 82 && !__fine.reach(n.pos.x, n.pos.z, 1.8)) T.fail(id + ' cannot be reached on foot: ' + at);
      } else {
        for (let i = 0; i < n.route.length; i++) {
          const a = n.route[i], b = n.route[(i + 1) % n.route.length];
          if (!T.free(a[0], a[1])) T.fail(id + ' has a route point in a wall: ' + a.join(','));
          if (!T.clearWalk(a, b)) T.fail(id + ' walks into something between ' + a.join(',') + ' and ' + b.join(','));
          if (Math.hypot(a[0] - L.WELL.x, a[1] - L.WELL.z) > 24) T.fail(id + ' strays from the square at ' + a.join(','));
        }
      }
      if (work[id] && !work[id](n)) T.fail(id + ' is not at their work: ' + at);
    }
    for (const id of ['aldwyn', 'maren', 'brom', 'tam', 'ysolde', 'mirelle', 'garrow', 'bess', 'wenna', 'hob']) if (!names.includes(id)) T.fail('missing NPC ' + id);
    return { npcs: names.length, fails: T.fails.length };
  })()"""},
  {'eval': "(() => { const f = __town.fails; return f.length ? f.join('\\n') : 'town ok'; })()"},
]
