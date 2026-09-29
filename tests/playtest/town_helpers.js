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
    return { reach, count: queue.length, nx, nz, seen, ok, at, x0, z0, cell };
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

  // ---------------------------------------------------------------- the grounds checks
  // Each takes the plan (and what it needs of the world) and returns FAIL lines, so the canary step can
  // run it again on a deliberately broken copy of the plan and see it catch the break.
  const name = (b) => (b.id === 'house' ? b.role : b.id) + '@' + b.x.toFixed(0) + ',' + b.z.toFixed(0);
  const THICK = (L, kind) => (L.THICK ? L.THICK[kind] : kind === 'stone' ? 0.9 : 1.25);

  // The sides of a plot that carry a fence (a `back` side is a house wall), as segments with the gate's
  // gap left out; and the gate's gap itself.
  function plotSides(p) {
    const S = { n: [[p.x0, p.z0], [p.x1, p.z0]], s: [[p.x0, p.z1], [p.x1, p.z1]], w: [[p.x0, p.z0], [p.x0, p.z1]], e: [[p.x1, p.z0], [p.x1, p.z1]] };
    const out = [];
    let gate = null;
    for (const [k, [a, b]] of Object.entries(S)) {
      if (k === p.back) continue;
      if (k !== p.gate) { out.push([a, b]); continue; }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, mid = len * (p.gateAt ?? 0.5);
      out.push([a, [a[0] + ux * (mid - 0.62), a[1] + uz * (mid - 0.62)]], [[a[0] + ux * (mid + 0.62), a[1] + uz * (mid + 0.62)], b]);
      const gx = a[0] + ux * mid, gz = a[1] + uz * mid, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      const nx = Math.abs(ux) > Math.abs(uz) ? 0 : Math.sign(gx - cx), nz = Math.abs(ux) > Math.abs(uz) ? Math.sign(gz - cz) : 0;
      gate = { x: gx, z: gz, out: [nx, nz] };
    }
    return { fences: out, gate };
  }

  // Check 1 (plan): every plot corner stands well inside the boundary (1.5 m clear of the town wall's
  // inner face, 1 m clear of the hedge's), and no prop stands in the wall, a fence line or a house.
  function planCrossings(L, radiusOf) {
    const out = [];
    for (const p of L.PLOTS) for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]]) {
      for (const wl of L.WALLS) {
        const need = THICK(L, wl.kind) / 2 + (wl.kind === 'stone' ? 1.5 : 1.0), d = segDist(x, z, wl.a, wl.b);
        if (d < need) { out.push(`FAIL crossing: plot ${p.id} corner ${x},${z} is ${(d - THICK(L, wl.kind) / 2).toFixed(2)} m from the ${wl.kind === 'stone' ? 'town wall' : 'hedge'} (want ${need - THICK(L, wl.kind) / 2} m inside it)`); break; }
      }
      if (L.polyDistance(x, z) > 0) out.push(`FAIL crossing: plot ${p.id} corner ${x},${z} is outside the town`);
    }
    const fences = L.PLOTS.flatMap((p) => plotSides(p).fences.map((f) => [p, f]));
    for (const q of L.PROPS) {
      const r = radiusOf(q);
      if (r === null) continue;
      const lab = q.type + (q.name ? ':' + q.name : '') + '@' + q.x.toFixed(1) + ',' + q.z.toFixed(1);
      for (const wl of L.WALLS) {
        const d = segDist(q.x, q.z, wl.a, wl.b) - THICK(L, wl.kind) / 2 - r;
        if (d < 0.3) { out.push(`FAIL crossing: ${lab} is ${d.toFixed(2)} m from the ${wl.kind === 'stone' ? 'town wall' : 'hedge'} (want 0.3)`); break; }
      }
      for (const [p, [a, b]] of fences) {
        if (q.plot === p.id && q.type === 'wicket') continue;
        const d = segDist(q.x, q.z, a, b) - 0.09 - r;
        if (d < 0.3) { out.push(`FAIL crossing: ${lab} is ${d.toFixed(2)} m from the fence of ${p.id} (want 0.3)`); break; }
      }
      for (const b of L.BUILDINGS) {
        const inside = inPoly(q.x, q.z, L.footprint(b)), d = polyDist(q.x, q.z, L.footprint(b)) - r;
        if (inside || d < 0.05) { out.push(`FAIL crossing: ${lab} is ${inside ? 'inside' : d.toFixed(2) + ' m from'} ${name(b)} (want it clear of the walls)`); break; }
      }
    }
    return out;
  }

  // Check 2: places you can't get into. Each plot: 80% of its free inside reachable, the point 1.2 m out
  // of its gate reachable; a plot side within 2 m of a house wall needs a door in that wall into the plot.
  function sealedPlaces(L, fine) {
    const out = [];
    for (const p of L.PLOTS) {
      let freeN = 0, reached = 0;
      for (let x = p.x0 + 0.4; x < p.x1 - 0.3; x += 0.25) for (let z = p.z0 + 0.4; z < p.z1 - 0.3; z += 0.25) {
        const i = Math.floor((x - fine.x0) / fine.cell), j = Math.floor((z - fine.z0) / fine.cell);
        if (i < 0 || j < 0 || i >= fine.nx || j >= fine.nz) continue;
        const k = j * fine.nx + i;
        if (!fine.ok[k]) continue;
        freeN++;
        if (fine.seen[k]) reached++;
      }
      if (freeN && reached / freeN < 0.8) out.push(`FAIL sealed: only ${reached} of ${freeN} walkable cells inside ${p.id} can be reached on foot`);
      const { gate } = plotSides(p);
      if (gate && !fine.reach(gate.x + gate.out[0] * 1.2, gate.z + gate.out[1] * 1.2, 0.3)) out.push(`FAIL sealed: the way to the gate of ${p.id} (${(gate.x + gate.out[0] * 1.2).toFixed(1)},${(gate.z + gate.out[1] * 1.2).toFixed(1)}) cannot be reached`);
      if (gate && !fine.reach(gate.x - gate.out[0] * 1.0, gate.z - gate.out[1] * 1.0, 0.3)) out.push(`FAIL sealed: inside the gate of ${p.id} cannot be reached`);
      // House walls close to a side of the plot.
      const sides = { n: [[p.x0, p.z0], [p.x1, p.z0]], s: [[p.x0, p.z1], [p.x1, p.z1]], w: [[p.x0, p.z0], [p.x0, p.z1]], e: [[p.x1, p.z0], [p.x1, p.z1]] };
      for (const b of L.BUILDINGS) {
        const fp = L.footprint(b);
        let near = Infinity;
        for (const [a, c] of Object.values(sides)) for (let t = 0; t <= 1.0001; t += 0.05) {
          const x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t;
          near = Math.min(near, inPoly(x, z, fp) ? 0 : polyDist(x, z, fp));
        }
        if (near >= 2) continue;
        const into = L.doorways(b).some((d) => d.out[0] > p.x0 && d.out[0] < p.x1 && d.out[1] > p.z0 && d.out[1] < p.z1);
        if (!into) out.push(`FAIL sealed: ${p.id} runs ${near.toFixed(1)} m from ${name(b)}, which has no door into it (a slot behind the house)`);
      }
    }
    return out;
  }

  // Check 3: barriers in front of doors. From every doorway a 1.2 x 2 m path straight out must be free
  // of solids and reach a street, the square, a yard or a plot; any boundary, wall or fence line within
  // 4 m in front must have a gap at least 1.2 m wide within 1 m of the door's axis.
  function barriers(L, w, lines) {
    const out = [];
    const solidAt = (x, z, y) => w.colliders.query(x, z, 0.1).some((sh) => !sh.cameraOnly && !sh.removed && y > sh.y0 && y < sh.y1 && (sh.kind === 'c' ? Math.hypot(x - sh.x, z - sh.z) < sh.r : Math.abs((x - sh.x) * sh.c - (z - sh.z) * sh.s) < sh.hx && Math.abs((x - sh.x) * sh.s + (z - sh.z) * sh.c) < sh.hz));
    const near = (x, z) => {
      let best = Infinity;
      for (const s of L.STREETS) best = Math.min(best, L.lineDistance(x, z, s.pts) - s.w / 2);
      best = Math.min(best, L.rectDistance(x, z, L.SQUARE));
      for (const y of L.YARDS) best = Math.min(best, L.rectDistance(x, z, y));
      for (const p of L.PLOTS) best = Math.min(best, L.rectDistance(x, z, p));
      return best;
    };
    for (const b of L.BUILDINGS) for (const d of L.doorways(b)) {
      const [nx, nz] = d.normal, tx = -nz, tz = nx, y = w.heightAt(d.out[0], d.out[1]);
      const lab = `door of ${name(b)} (${d.side})`;
      let hit = null;
      for (let s = 0.35; s <= 2.0001 && !hit; s += 0.2) for (let a = -0.6; a <= 0.6001; a += 0.2) {
        const x = d.at[0] + nx * s + tx * a, z = d.at[1] + nz * s + tz * a;
        if (solidAt(x, z, w.heightAt(x, z) + 0.6) || solidAt(x, z, w.heightAt(x, z) + 1.5)) { hit = [x, z, s]; break; }
      }
      if (hit) out.push(`FAIL barrier: something solid stands ${hit[2].toFixed(1)} m in front of the ${lab}, at ${hit[0].toFixed(1)},${hit[1].toFixed(1)}`);
      if (near(d.at[0] + nx * 2, d.at[1] + nz * 2) > 1.0) out.push(`FAIL barrier: the ${lab} opens onto nothing (no street, square, yard or plot within 3 m)`);
      // Boundary and fence lines crossing the way out within 4 m.
      for (const [a, c, kind] of lines) {
        const ex = c[0] - a[0], ez = c[1] - a[1], den = nx * ez - nz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((a[0] - d.at[0]) * ez - (a[1] - d.at[1]) * ex) / den, u = ((a[0] - d.at[0]) * nz - (a[1] - d.at[1]) * nx) / den;
        if (t <= 0.2 || t > 4 || u < 0 || u > 1) continue;
        // The line is solid here: look along it for the nearest gap in the colliders at knee height.
        const hx = d.at[0] + nx * t, hz = d.at[1] + nz * t, L2 = Math.hypot(ex, ez), dx = ex / L2, dz = ez / L2;
        let gapStart = null, best = Infinity;
        for (let s = -3; s <= 3.0001; s += 0.05) {
          const x = hx + dx * s, z = hz + dz * s, blocked = solidAt(x, z, w.heightAt(x, z) + 0.6);
          if (!blocked && gapStart === null) gapStart = s;
          if ((blocked || s > 2.99) && gapStart !== null) {
            const g0 = gapStart, g1 = blocked ? s : s + 0.05;
            if (g1 - g0 >= 1.2) best = Math.min(best, Math.max(0, g0 > 0 ? g0 : g1 < 0 ? -g1 : 0));
            gapStart = null;
          }
        }
        if (best > 1.0) out.push(`FAIL barrier: a ${kind} runs ${t.toFixed(1)} m in front of the ${lab} with no opening near the door's axis`);
      }
    }
    // Gateways: the clear width between solids at least 0.9 of the gate's width, all the way through.
    for (const gt of [...L.GATES, ...L.GAPS]) {
      const n = gt.wallOut || gt.out, ax = -n[1], az = n[0];
      let narrowest = Infinity;
      for (const s of [-1.2, 0, 1.2]) {
        let left = 0, right = 0;
        const cx = gt.x + n[0] * s, cz = gt.z + n[1] * s, y = w.heightAt(cx, cz);
        while (left < 6 && !solidAt(cx - ax * left, cz - az * left, y + 1.0)) left += 0.05;
        while (right < 6 && !solidAt(cx + ax * right, cz + az * right, y + 1.0)) right += 0.05;
        narrowest = Math.min(narrowest, left + right);
      }
      if (narrowest < 0.9 * gt.width) out.push(`FAIL barrier: the ${gt.id} ${L.GATES.includes(gt) ? 'gate' : 'gap'} is only ${narrowest.toFixed(2)} m clear (want ${(0.9 * gt.width).toFixed(2)})`);
    }
    return out;
  }

  // The boundary, fence and yard-wall lines of the plan (for barriers()).
  function lines(L) {
    const out = L.WALLS.map((wl) => [wl.a, wl.b, wl.kind === 'stone' ? 'town wall' : 'hedge']);
    for (const p of L.PLOTS) for (const [a, b] of plotSides(p).fences) out.push([a, b, 'fence of ' + p.id]);
    return out;
  }

  // Check 4 (beds): no grass in a bed. The grass grows where the baked ground map (what the grass shader
  // reads) says meadow; sample it at 25 points inside every plot grown in beds.
  function groundReader(w) {
    const tex = w.terrain.groundTex, img = tex.image;
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const size = 800, half = 400;
    return (x, z) => {
      const i = Math.min(cv.width - 1, Math.max(0, Math.floor(((x + half) / size) * cv.width)));
      const j = Math.min(cv.height - 1, Math.max(0, Math.floor(((z + half) / size) * cv.height)));
      const k = (j * cv.width + i) * 4;
      return [data[k] / 255, data[k + 1] / 255, data[k + 2] / 255];
    };
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // The grass shader's meadow weight from the ground cover (path, forest, cobble), before height and patch noise.
  const meadow = ([p, f, c]) => (1 - smooth(0.15, 0.55, p)) * (1 - smooth(0.1, 0.4, c)) * (1 - smooth(0.35, 0.8, f) * 0.8);
  function grassInBeds(L, read) {
    const out = [];
    for (const p of L.PLOTS) {
      if (!L.BEDS.has(p.crop)) continue;
      let worst = 0, wx = 0, wz = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = p.x0 + 1.0 + ((p.x1 - p.x0 - 2.0) * i) / 4, z = p.z0 + 1.0 + ((p.z1 - p.z0 - 2.0) * j) / 4;
        const m = meadow(read(x, z));
        if (m > worst) { worst = m; wx = x; wz = z; }
      }
      if (worst > 0.05) out.push(`FAIL grass: grass grows in the beds of ${p.id} (meadow ${worst.toFixed(2)} at ${wx.toFixed(1)},${wz.toFixed(1)})`);
    }
    return out;
  }

  // Check 12 (a warning): connected places over 60 m2 inside the wall, more than 6 m from anything built
  // or used (a building, a prop, a plot, a street, the square, a yard, the wall, a tree).
  function deadSpace(L, fine) {
    const x0 = -56, z0 = -30, nx = 96, nz = 96;
    const far = new Uint8Array(nx * nz);
    const dist = (x, z) => {
      let d = Infinity;
      for (const b of L.BUILDINGS) d = Math.min(d, inPoly(x, z, L.footprint(b)) ? 0 : polyDist(x, z, L.footprint(b)));
      for (const q of L.PROPS) d = Math.min(d, Math.hypot(q.x - x, q.z - z) - 1);
      for (const p of L.PLOTS) d = Math.min(d, L.rectDistance(x, z, p));
      for (const s of L.STREETS) d = Math.min(d, L.lineDistance(x, z, s.pts) - s.w / 2);
      d = Math.min(d, L.rectDistance(x, z, L.SQUARE));
      for (const y of L.YARDS) d = Math.min(d, L.rectDistance(x, z, y));
      for (const wl of L.WALLS) d = Math.min(d, segDist(x, z, wl.a, wl.b));
      for (const t of L.TOWN_TREES || []) d = Math.min(d, Math.hypot(t.x - x, t.z - z) - 3);
      return d;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i + 0.5, z = z0 + j + 0.5;
      if (L.polyDistance(x, z) > -1.5 || !fine.reach(x, z, 0.2)) continue;
      if (dist(x, z) > 6) far[j * nx + i] = 1;
    }
    const seen = new Uint8Array(nx * nz), regions = [];
    for (let k = 0; k < far.length; k++) {
      if (!far[k] || seen[k]) continue;
      const q = [k]; seen[k] = 1; let sx = 0, sz = 0;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], i = c % nx, j = (c - i) / nx;
        sx += x0 + i + 0.5; sz += z0 + j + 0.5;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const n = b * nx + a; if (far[n] && !seen[n]) { seen[n] = 1; q.push(n); } }
      }
      if (q.length > 60) regions.push('WARN dead space: about ' + q.length + ' m2 around ' + (sx / q.length).toFixed(0) + ',' + (sz / q.length).toFixed(0) + ' with nothing built or used within 6 m');
    }
    return regions;
  }

  return { g, free, flood, clearWalk, fails, fail, sat, rectPoly, segDist, polyDist, inPoly, RADIUS, plotSides, planCrossings, sealedPlaces, barriers, lines, groundReader, grassInBeds, meadow, name, deadSpace };
})();
