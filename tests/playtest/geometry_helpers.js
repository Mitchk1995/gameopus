// Geometry audit for geometry.py: scans everything the world (or the dungeon) is made of and
// checks it numerically, so a floating lantern, a stall's goods sunk into its counter, a door
// that doesn't fit its frame or a prop you can walk through fails here instead of in a
// playtest. It reads only what exists at runtime, so it keeps working when the layout changes:
//   * every kit piece placed through a Batcher (its log rides on the built mesh's userData.pieces)
//     and every live kit instance (userData.audit.kit);
//   * procedural things that tag themselves (userData.audit.name): kiln, furnace, wheels, tents...
//   * doors (colliders.doors), buildings (colliders.buildings) and every collider shape.
// Truth about shape comes from the meshes themselves (sampled surface points); the solids table in
// src/world/props.js is what the game uses for collision and is what the meshes are held to.
// Each check returns FAIL lines (piece name and world position) in the shape geometry.py prints.
window.__geo = (() => {
  const T = window.__THREE;
  const G = () => window.__game;

  // ---- thresholds: strict, but with room for authored-model noise
  const TOL = {
    hover: 0.06,        // a resting prop may float at most this far above what it stands on
    buried: 0.3,        // ...or sink this far into the ground
    penetrate: 0.04,    // two solids may overlap by at most this much (after a 2 cm skin)
    doorWide: 0.06,     // door leaf width vs the opening it fills
    doorTall: 0.08,     // ...and height
    doorOff: 0.03,      // ...and how far off-centre it hangs
    covered: 0.75,      // share of a prop's body (up to head height) that must sit inside colliders
    mass: 0.5,          // share of a collider's footprint that must have something visible in it
    density: [0.55, 1.9],   // texture repeats per metre vs the kit's own for that material
    stretch: 2.4,       // median anisotropy (how much one texture axis is stretched vs the other)
    mount: 0.12,        // a wall-mounted prop's back may be this far off the wall
  };

  const STEP = 0.45, HEAD = 1.8;
  const WALLMOUNT = /^(Lantern_Wall|Torch_Metal|Shelf_|Banner_|Peg_Rack|Shield_Wooden|Chandelier)/;
  const STRUCT = /^(Stairs|Overhang|Balcony|HoleCover|Prop_Support|Prop_Vine|Prop_ExteriorBorder)/;

  function catOf(name) {
    if (/^Wall_(Plaster|UnevenBrick)/.test(name)) return 'wall';
    if (/^Corner_/.test(name)) return 'corner';
    if (/^Roof_Front/.test(name)) return 'gable';
    if (/^Roof_/.test(name)) return 'roof';
    if (/^Prop_Chimney/.test(name)) return 'chimney';
    if (/^Floor_/.test(name)) return 'floor';
    if (/^WindowShutters/.test(name)) return 'shutters';
    if (/^Window_/.test(name)) return 'glass';
    if (/^Door/.test(name)) return 'door';
    if (WALLMOUNT.test(name)) return 'mount';
    if (STRUCT.test(name)) return 'struct';
    return 'prop';
  }

  // ---- results
  function makeReport() {
    const fails = [], seen = new Set(), counts = {};
    return {
      fails, counts,
      fail(check, label, msg) {
        const key = check + '|' + label + '|' + msg.replace(/[0-9.\-]+/g, '#');
        if (seen.has(key)) return;
        seen.add(key);
        counts[check] = (counts[check] || 0) + 1;
        fails.push({ check, line: `FAIL ${check} ${label}: ${msg}` });
      },
    };
  }
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const at = (x, y, z) => `@(${f2(x)},${f2(y)},${f2(z)})`;

  // ---- kit part data: bounds, surface point cloud (in the part's own frame)
  const clouds = new Map();
  function cloudOf(kit, name) {
    if (clouds.has(name)) return clouds.get(name);
    const part = kit.part(name);
    part.updateMatrixWorld(true);
    let seed = 987654321;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out = [];
    const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3(), n = new T.Vector3();
    part.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      const cnt = idx ? idx.count : pos.count;
      for (let i = 0; i < cnt; i += 3) {
        A.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
        B.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(o.matrixWorld);
        C.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(o.matrixWorld);
        const area = n.crossVectors(B.clone().sub(A), C.clone().sub(A)).length() / 2;
        let k = Math.floor(area * 320);
        if (rnd() < area * 320 - k) k++;
        for (let j = 0; j < k; j++) {
          let r1 = rnd(), r2 = rnd();
          if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
          out.push(A.x + (B.x - A.x) * r1 + (C.x - A.x) * r2, A.y + (B.y - A.y) * r1 + (C.y - A.y) * r2, A.z + (B.z - A.z) * r1 + (C.z - A.z) * r2);
        }
      }
    });
    const arr = new Float32Array(out);
    clouds.set(name, arr);
    return arr;
  }

  // Surface points of a procedural group (a tagged object, or one piece of town furniture), in world space.
  function groupCloud(g) {
    if (g._cloud) return g._cloud;
    const out = [];
    let seed = 24680;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3(), n = new T.Vector3();
    for (const o of g.objs) {
      if ([o.material].flat().some((m) => m.transparent) || !o.geometry.attributes.position) continue;
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      const cnt = idx ? idx.count : pos.count;
      for (let i = 0; i < cnt; i += 3) {
        A.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
        B.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(o.matrixWorld);
        C.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(o.matrixWorld);
        const area = n.crossVectors(B.clone().sub(A), C.clone().sub(A)).length() / 2;
        let k = Math.floor(area * 320);
        if (rnd() < area * 320 - k) k++;
        for (let j = 0; j < k; j++) {
          let r1 = rnd(), r2 = rnd();
          if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
          out.push(A.x + (B.x - A.x) * r1 + (C.x - A.x) * r2, A.y + (B.y - A.y) * r1 + (C.y - A.y) * r2, A.z + (B.z - A.z) * r1 + (C.z - A.z) * r2);
        }
      }
    }
    return (g._cloud = new Float32Array(out));
  }

  // ---- scanning a scene
  function scan(scene, kit, world) {
    scene.updateMatrixWorld(true);
    const pieces = [], tagged = [], procs = new Map();
    const mk = (name, m, meta, src) => {
      const e = m.elements;
      const s = Math.hypot(e[0], e[8]);
      const b = kit.bounds(name);
      const p = { name, cat: catOf(name), meta: meta || {}, src, m, x: e[12], y: e[13], z: e[14], yaw: Math.atan2(e[8], e[0]), s, b, tilted: !!(meta && meta.tilted) || Math.abs(e[5] - s) > 0.02 * s };
      // World AABB from the bounds' corners.
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const v = new T.Vector3();
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        v.set(x, y, z).applyMatrix4(m);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      p.box = { x0, x1, y0, y1, z0, z1 };
      return p;
    };
    scene.traverse((o) => {
      if (o.userData.pieces) {
        for (const e of o.userData.pieces) {
          if (e.proc) {
            // A procedural piece of street furniture: grouped by the object it belongs to.
            const g = procs.get(e.meta.id) || procs.set(e.meta.id, { name: e.meta.label, soft: !!e.meta.soft, on: !!e.meta.on, x: e.meta.x, z: e.meta.z, objs: [] }).get(e.meta.id);
            g.objs.push({ geometry: e.geometry, material: e.material, matrixWorld: new T.Matrix4().fromArray(e.m) });
          } else pieces.push(mk(e.name, new T.Matrix4().fromArray(e.m), e.meta, 'batch'));
        }
      }
      const a = o.userData.audit;
      if (!a) return;
      if (a.kit) pieces.push(mk(a.kit, o.matrixWorld.clone(), a, 'live'));
      else if (a.name && !a.door) tagged.push(o);
    });
    // Tagged objects become groups too (their meshes, flagged where they are kit props).
    const groups = [...procs.values()];
    for (const o of tagged) {
      const g = { name: o.userData.audit.name, soft: !!o.userData.audit.soft, x: o.position.x, z: o.position.z, objs: [], obj: o };
      o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh || !m.geometry.attributes.position) return;
        let fromKit = false;
        for (let q = m.parent; q && q !== o.parent; q = q.parent) if (q.userData.fromKit) fromKit = true;
        g.objs.push({ geometry: m.geometry, material: m.material, matrixWorld: m.matrixWorld, fromKit });
      });
      groups.push(g);
    }
    // A spatial hash over the pieces' footprints.
    const hash = new Map();
    const CELL = 3;
    const cellsOf = (b, pad = 0) => {
      const out = [];
      for (let i = Math.floor((b.x0 - pad) / CELL); i <= Math.floor((b.x1 + pad) / CELL); i++) for (let j = Math.floor((b.z0 - pad) / CELL); j <= Math.floor((b.z1 + pad) / CELL); j++) out.push(i * 100003 + j);
      return out;
    };
    pieces.forEach((p, i) => { p.id = i; });
    for (const p of pieces) for (const k of cellsOf(p.box)) (hash.get(k) || hash.set(k, []).get(k)).push(p);
    const near = (b, pad = 0.1) => {
      const out = new Set();
      for (const k of cellsOf(b, pad)) for (const p of hash.get(k) || []) out.add(p);
      return [...out];
    };
    const doors = (world.colliders.doors || []).slice();
    // Adding and removing pieces after the scan (the canary does this to break things on purpose).
    const add = (p) => {
      p.id = pieces.length;
      pieces.push(p);
      for (const k of cellsOf(p.box)) (hash.get(k) || hash.set(k, []).get(k)).push(p);
      return p;
    };
    const remove = (p) => {
      pieces.splice(pieces.indexOf(p), 1);
      for (const k of cellsOf(p.box)) { const l = hash.get(k); l.splice(l.indexOf(p), 1); }
    };
    return { scene, kit, world, pieces, tagged, groups, doors, near, add, remove, mk, ground: (x, z) => world.heightAt(x, z) };
  }

  // A piece's solid shapes in world space (from the solids table in props.js).
  function solidsOf(kit, p) {
    if (p._solids) return p._solids;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    p._solids = kit.solids(p.name).map((sh) => {
      const x = p.x + (sh.x * c + sh.z * s) * p.s, z = p.z + (-sh.x * s + sh.z * c) * p.s;
      const base = { x, z, y0: p.y + sh.y0 * p.s, y1: p.y + sh.y1 * p.s, floor: !!sh.floor, piece: p };
      return sh.t === 'c' ? { ...base, t: 'c', r: sh.r * p.s } : { ...base, t: 'b', hx: sh.hx * p.s, hz: sh.hz * p.s, c, s };
    });
    return p._solids;
  }
  const solidBox = (sh) => (sh.t === 'c' ? { x0: sh.x - sh.r, x1: sh.x + sh.r, z0: sh.z - sh.r, z1: sh.z + sh.r } : { x0: sh.x - Math.abs(sh.c) * sh.hx - Math.abs(sh.s) * sh.hz, x1: sh.x + Math.abs(sh.c) * sh.hx + Math.abs(sh.s) * sh.hz, z0: sh.z - Math.abs(sh.s) * sh.hx - Math.abs(sh.c) * sh.hz, z1: sh.z + Math.abs(sh.s) * sh.hx + Math.abs(sh.c) * sh.hz });
  // How deep inside a solid (shrunk by m) a point is; 0 or less means outside.
  function depthIn(sh, x, y, z, m = 0) {
    const dy = Math.min(y - sh.y0, sh.y1 - y) - m;
    if (dy <= 0) return 0;
    if (sh.t === 'c') return Math.min(dy, sh.r - m - Math.hypot(x - sh.x, z - sh.z));
    const dx = x - sh.x, dz = z - sh.z;
    const lx = dx * sh.c - dz * sh.s, lz = dx * sh.s + dz * sh.c;
    return Math.min(dy, sh.hx - m - Math.abs(lx), sh.hz - m - Math.abs(lz));
  }
  const inFootprint = (sh, x, z, pad = 0) => {
    if (sh.t === 'c') return Math.hypot(x - sh.x, z - sh.z) <= sh.r + pad;
    const dx = x - sh.x, dz = z - sh.z;
    return Math.abs(dx * sh.c - dz * sh.s) <= sh.hx + pad && Math.abs(dx * sh.s + dz * sh.c) <= sh.hz + pad;
  };

  const worldCloud = (kit, p) => {
    if (p._cloud) return p._cloud;
    const src = cloudOf(kit, p.name), e = p.m.elements, out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    return (p._cloud = out);
  };

  const label = (p) => `${p.name} ${at(p.x, p.y, p.z)}`;

  // The highest surface at (x, z) that is at or below yLimit: ground, floor tiles, another
  // prop's solid top, a walkable collider. Returns { y, on } (on: 'ground' | 'piece' | 'floor').
  function surfaceBelow(S, x, z, yLimit, skip) {
    let best = { y: S.ground(x, z), on: 'ground' };
    if (best.y > yLimit) best = { y: best.y, on: 'ground' };
    for (const p of S.near({ x0: x, x1: x, z0: z, z1: z }, 0.05)) {
      if (p === skip) continue;
      if (p.cat === 'floor') {
        if (x >= p.box.x0 && x <= p.box.x1 && z >= p.box.z0 && z <= p.box.z1 && p.box.y1 <= yLimit && p.box.y1 > best.y) best = { y: p.box.y1, on: 'floor' };
        continue;
      }
      if (p.cat === 'wall') continue;
      for (const sh of solidsOf(S.kit, p)) if (sh.y1 <= yLimit && sh.y1 > best.y && inFootprint(sh, x, z)) best = { y: sh.y1, on: 'piece' };
    }
    for (const sh of S.world.colliders.query(x, z, 0.02)) {
      if (!sh.floor || sh.removed || sh.y1 > yLimit || sh.y1 <= best.y) continue;
      const inside = sh.kind === 'c' ? Math.hypot(x - sh.x, z - sh.z) < sh.r : (() => { const [lx, lz] = [ (x - sh.x) * sh.c - (z - sh.z) * sh.s, (x - sh.x) * sh.s + (z - sh.z) * sh.c ]; return Math.abs(lx) <= sh.hx && Math.abs(lz) <= sh.hz; })();
      if (inside) best = { y: sh.y1, on: 'floor' };
    }
    return best;
  }

  // Footprint sample points of a piece: centre and four inset corners.
  function samples(p) {
    const b = p.b, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const mx = (b.min.x + b.max.x) / 2, mz = (b.min.z + b.max.z) / 2, hx = ((b.max.x - b.min.x) / 2) * 0.7, hz = ((b.max.z - b.min.z) / 2) * 0.7;
    const out = [];
    for (const [ax, az] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = (mx + ax * hx) * p.s, lz = (mz + az * hz) * p.s;
      out.push([p.x + lx * c + lz * s, p.z - lx * s + lz * c]);
    }
    return out;
  }

  // =============================================================== checks

  // 1. Floating and buried pieces.
  function checkFloating(S, R) {
    for (const p of S.pieces) {
      if (p.cat !== 'prop' || p.tilted) continue;
      const height = (p.b.max.y - p.b.min.y) * p.s;
      const bottom = p.y + p.b.min.y * p.s;
      const pts = samples(p);
      const gaps = pts.map(([x, z]) => bottom - surfaceBelow(S, x, z, bottom + TOL.hover, p).y);
      if (Math.min(...gaps) > TOL.hover) R.fail('floating', label(p), `hovers ${f2(Math.min(...gaps))} m above what it stands on`);
      const worstTerrain = Math.max(...pts.map(([x, z]) => S.ground(x, z)));
      if (worstTerrain - bottom > TOL.buried && height > 0.2) R.fail('buried', label(p), `sunk ${f2(worstTerrain - bottom)} m into the ground`);
    }
  }

  // Wall-mounted things (lanterns, shelves, banners, torches) must touch a wall.
  function checkMounts(S, R) {
    for (const p of S.pieces) {
      if (p.cat !== 'mount' || p.name === 'Chandelier') continue;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      // The piece's own +z (world) and its back plane.
      const fx = s, fz = c;
      const backLocal = p.b.min.z * p.s;
      const bx = p.x + backLocal * s, bz = p.z + backLocal * c;
      let best = Infinity, bestWall = null;
      for (const w of S.near(p.box, 0.6)) {
        if (w.cat !== 'wall') continue;
        // In the wall's frame.
        const wc = Math.cos(w.yaw), ws = Math.sin(w.yaw);
        const dx = bx - w.x, dz = bz - w.z;
        const a = dx * wc - dz * ws, zz = dx * ws + dz * wc;
        if (Math.abs(a) > 1.1 || p.y + p.b.max.y * p.s < w.y || p.y > w.y + 3.2) continue;
        const dot = fx * ws + fz * wc; // piece facing vs the wall's outward normal (+z of the wall)
        let gap;
        if (dot > 0.7) gap = zz - 0.0; // on the outside face (plaster at z = 0)
        else if (dot < -0.7) gap = -0.24 - zz; // on the inside face
        else continue;
        if (Math.abs(gap) < Math.abs(best)) { best = gap; bestWall = w; }
      }
      if (!bestWall) R.fail('mount', label(p), 'hangs on nothing: no wall behind it');
      else if (Math.abs(best) > TOL.mount) R.fail('mount', label(p), `off the wall by ${f2(best)} m`);
    }
  }

  // 2. Interpenetration.
  function checkPenetration(S, R) {
    const solidCats = new Set(['prop', 'mount', 'shutters', 'wall']);
    const testCats = new Set(['prop', 'mount', 'shutters']);
    for (const a of S.pieces) {
      if (!testCats.has(a.cat) || a.tilted) continue;
      const cloud = worldCloud(S.kit, a);
      for (const b of S.near(a.box, 0.05)) {
        if (b === a || !solidCats.has(b.cat) || b.tilted) continue;
        if (a.cat === 'shutters' && b.cat === 'wall') continue; // shutters are hung on walls
        // Each pair is tested once, both ways round for two props (a wall only has solids).
        const both = b.cat !== 'wall';
        if (both && b.id < a.id) continue;
        const bs = solidsOf(S.kit, b);
        const pairs = [];
        if (bs.length) pairs.push([a, cloud, bs]);
        if (both && testCats.has(b.cat)) pairs.push([b, worldCloud(S.kit, b), solidsOf(S.kit, a)]);
        for (const [owner, pts, shapes] of pairs) {
          if (!shapes.length) continue;
          let n = 0, depth = 0;
          for (let i = 0; i < pts.length; i += 3) {
            for (const sh of shapes) {
              const d = depthIn(sh, pts[i], pts[i + 1], pts[i + 2], 0.02);
              if (d > 0) { n++; depth = Math.max(depth, d); break; }
            }
          }
          if (n >= 3 && depth > TOL.penetrate) {
            const other = owner === a ? b : a;
            R.fail('clip', label(owner), `${n} surface points inside ${other.name} ${at(other.x, other.y, other.z)} (up to ${f2(depth)} m deep)`);
          }
        }
      }
    }
    // Wall/roof pieces of different buildings, or a prop through a roof edge, are not tested.
  }

  // Door poses and fit -----------------------------------------------------
  function leafCloud(S, d) {
    d.pivot.updateMatrixWorld(true);
    const src = cloudOf(S.kit, d.leafName), m = d.leaf.matrixWorld.elements, out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    return out;
  }
  // The leaf as a solid box, in world space.
  function leafSolid(S, d) {
    d.pivot.updateMatrixWorld(true);
    const b = S.kit.bounds(d.leafName), m = d.leaf.matrixWorld;
    const ctr = new T.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2).applyMatrix4(m);
    const th = d.pivot.rotation.y;
    return { t: 'b', x: ctr.x, z: ctr.z, hx: ((b.max.x - b.min.x) / 2) * d.leaf.scale.x, hz: (b.max.z - b.min.z) / 2, y0: ctr.y - ((b.max.y - b.min.y) / 2) * d.leaf.scale.y, y1: ctr.y + ((b.max.y - b.min.y) / 2) * d.leaf.scale.y, c: Math.cos(th), s: Math.sin(th), floor: false, leaf: d };
  }

  // The opening a wall piece cuts, measured on the mesh: half-widths at 1.2 m and the crown height.
  function measureOpening(S, wallName) {
    const rc = new T.Raycaster(), part = S.kit.part(wallName);
    const open = (x, y) => {
      rc.set(new T.Vector3(x, y, 3), new T.Vector3(0, 0, -1));
      return !rc.intersectObject(part, true).some((h) => h.point.z < 0.15 && h.point.z > -0.35);
    };
    let lo = 0;
    for (let x = 0; x < 1; x += 0.01) if (open(x, 1.2)) lo = x; else break;
    let hi = 0;
    for (let x = 0; x > -1; x -= 0.01) if (open(x, 1.2)) hi = x; else break;
    let top = 0;
    for (let y = 0; y < 3.1; y += 0.01) if (open(0, y)) top = y; else if (y > 0.2) break;
    return { left: hi, right: lo, top };
  }

  // 3. Doors fit their frames, collide shut, and let you through open.
  function checkDoors(S, R) {
    const openings = new Map();
    for (const d of S.doors) {
      const wallName = (S.pieces.find((p) => p.cat === 'wall' && /_Door_/.test(p.name) && Math.hypot(p.x - d.def.x, p.z - d.def.z) < 0.5) || {}).name;
      const lab = `${d.leafName} ${at(d.def.x, d.def.y, d.def.z)}`;
      if (!wallName) { R.fail('door', lab, 'no door wall piece behind this door'); continue; }
      if (!openings.has(wallName)) openings.set(wallName, measureOpening(S, wallName));
      const op = openings.get(wallName), openW = op.right - op.left, openC = (op.right + op.left) / 2;
      d.snap(false);
      const pts = leafCloud(S, d);
      // Leaf extents in the wall's frame.
      const c = Math.cos(d.def.yaw), s = Math.sin(d.def.yaw);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i += 3) {
        const dx = pts[i] - d.def.x, dz = pts[i + 2] - d.def.z;
        const a = dx * c - dz * s, b = dx * s + dz * c;
        a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
      }
      const w = a1 - a0, h = y1 - d.def.y, off = (a1 + a0) / 2 - openC;
      if (w > openW + 0.005) R.fail('door', lab, `leaf ${f2(w)} m wide is wider than its ${f2(openW)} m frame opening`);
      else if (openW - w > TOL.doorWide) R.fail('door', lab, `leaf ${f2(w)} m wide leaves a gap in its ${f2(openW)} m frame opening`);
      if (h > op.top + 0.005) R.fail('door', lab, `leaf ${f2(h)} m tall pokes above its ${f2(op.top)} m opening`);
      else if (op.top - h > TOL.doorTall) R.fail('door', lab, `leaf ${f2(h)} m tall leaves a gap under its ${f2(op.top)} m lintel`);
      if (Math.abs(off) > TOL.doorOff) R.fail('door', lab, `leaf hangs ${f2(off)} m off-centre in its frame`);
      if (y0 - d.def.y > 0.08 || y0 - d.def.y < -0.02) R.fail('door', lab, `leaf bottom is ${f2(y0 - d.def.y)} m from the floor`);
      if (b1 > 0.2 || b0 < -0.21) R.fail('door', lab, `leaf sits outside the wall's thickness (${f2(b0)}..${f2(b1)})`);
      // Collision: shut = the whole doorway is blocked; open = the doorway is clear and the leaf is solid beside it.
      const blocked = (x, z, y) => S.world.colliders.query(x, z, 0.3).some((sh) => !sh.cameraOnly && !sh.removed && y > sh.y0 && y < sh.y1 && (sh.kind === 'c' ? Math.hypot(x - sh.x, z - sh.z) < sh.r : (() => { const dx = x - sh.x, dz = z - sh.z; return Math.abs(dx * sh.c - dz * sh.s) < sh.hx && Math.abs(dx * sh.s + dz * sh.c) < sh.hz; })()));
      const wpt = (a, b) => [d.def.x + a * c + b * s, d.def.z - a * s + b * c];
      for (let a = -0.6; a <= 0.6; a += 0.1) {
        const [x, z] = wpt(a, 0);
        for (const y of [0.4, 1.0, 1.7]) if (!blocked(x, z, d.def.y + y)) { R.fail('door', lab, `shut, but you can walk through at ${f2(a)} m across, ${f2(y)} m up`); a = 9; break; }
      }
      for (const a of [-0.9, 0.9]) { const [x, z] = wpt(a, 0); if (!blocked(x, z, d.def.y + 1.0)) R.fail('door', lab, `no wall beside the frame (${f2(a)} m across)`); }
      if (d.public) {
        d.snap(true);
        for (let a = -0.1; a <= 0.3; a += 0.1)
          for (let b = -1.2; b <= 1.2; b += 0.2) {
            const [x, z] = wpt(a, b);
            if (blocked(x, z, d.def.y + 1.0)) { R.fail('door', lab, `open, but the doorway is blocked at ${f2(a)} across, ${f2(b)} out`); a = 9; break; }
          }
        // The open leaf is a solid slab beside the doorway, and clear of the furniture inside.
        const lp = leafSolid(S, d);
        const cx = lp.x, cz = lp.z;
        if (!blocked(cx, cz, d.def.y + 1.0)) R.fail('door', lab, 'the open leaf has no collider');
        for (const p of S.near({ x0: cx - 2, x1: cx + 2, z0: cz - 2, z1: cz + 2 }, 0)) {
          if (!['prop', 'mount'].includes(p.cat) || p.tilted) continue;
          for (const sh of solidsOf(S.kit, p)) {
            let n = 0, depth = 0;
            const pts2 = leafCloud(S, d);
            for (let i = 0; i < pts2.length; i += 3) {
              const dd = depthIn(sh, pts2[i], pts2[i + 1], pts2[i + 2], 0.02);
              if (dd > 0) { n++; depth = Math.max(depth, dd); }
            }
            if (n >= 3 && depth > TOL.penetrate) R.fail('door', lab, `the open leaf swings into ${p.name} ${at(p.x, p.y, p.z)}`);
          }
        }
        // ...and clear of the doorway approach: nothing solid within 1.2 m in front of or behind it.
        d.snap(true);
      }
      // Front and back of the doorway: nothing stands in the way of using it.
      for (const b of [0.8, 1.2, -0.8, -1.2]) {
        const [x, z] = wpt(0, b);
        d.snap(!!d.public);
        if (blocked(x, z, d.def.y + 1.0) && (b > 0 || d.public)) R.fail('door', lab, `something stands in front of the door, ${f2(b)} m out`);
      }
      d.snap(d.public);
    }
  }

  // Both door states, for the coverage checks.
  function withDoors(S, open, fn) {
    const was = S.doors.map((d) => d.open);
    S.doors.forEach((d) => d.snap(open ? true : false));
    S.scene.updateMatrixWorld(true);
    const r = fn();
    S.doors.forEach((d, i) => d.snap(was[i]));
    return r;
  }

  // 4. Collider coverage, both ways.
  function massIndex(S) {
    // Cells of 0.25 m holding the vertical range of visible mass in them.
    const cells = new Map();
    const add = (x, y, z) => {
      const k = Math.floor(x / 0.25) * 100003 + Math.floor(z / 0.25);
      const c = cells.get(k);
      if (!c) cells.set(k, [y, y]);
      else { if (y < c[0]) c[0] = y; if (y > c[1]) c[1] = y; }
    };
    const rect = (b, y0, y1, c, s, hx, hz, cx, cz) => {
      for (let u = -hx; u <= hx + 0.001; u += 0.2) for (let v = -hz; v <= hz + 0.001; v += 0.2) add(cx + u * c + v * s, y0, cz - u * s + v * c), add(cx + u * c + v * s, y1, cz - u * s + v * c);
    };
    for (const p of S.pieces) {
      if (p.cat === 'wall' || p.cat === 'corner') {
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        const mx = (p.b.min.x + p.b.max.x) / 2, mz = (p.b.min.z + p.b.max.z) / 2;
        rect(null, p.y, p.y + 3.1, c, s, (p.b.max.x - p.b.min.x) / 2 * p.s, (p.b.max.z - p.b.min.z) / 2 * p.s, p.x + mx * c + mz * s, p.z - mx * s + mz * c);
      } else if (p.cat === 'floor') {
        rect(null, p.box.y0, p.box.y1, 1, 0, (p.box.x1 - p.box.x0) / 2, (p.box.z1 - p.box.z0) / 2, (p.box.x0 + p.box.x1) / 2, (p.box.z0 + p.box.z1) / 2);
      } else if (p.cat === 'roof' || p.cat === 'gable' || p.cat === 'chimney' || p.cat === 'struct' || p.cat === 'glass' || p.cat === 'shutters') {
        if (p.cat === 'chimney' || p.cat === 'glass' || p.cat === 'shutters') { const pts = worldCloud(S.kit, p); for (let i = 0; i < pts.length; i += 3) add(pts[i], pts[i + 1], pts[i + 2]); }
      } else {
        const pts = worldCloud(S.kit, p);
        for (let i = 0; i < pts.length; i += 3) add(pts[i], pts[i + 1], pts[i + 2]);
      }
    }
    for (const gr of S.groups) { const pts = groupCloud(gr); for (let i = 0; i < pts.length; i += 3) add(pts[i], pts[i + 1], pts[i + 2]); }
    for (const d of S.doors) { const pts = leafCloud(S, d); for (let i = 0; i < pts.length; i += 3) add(pts[i], pts[i + 1], pts[i + 2]); }
    return {
      has(x, z, y0, y1, r = 0.3) {
        const n = Math.ceil(r / 0.25);
        const i0 = Math.floor(x / 0.25), j0 = Math.floor(z / 0.25);
        for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) {
          const c = cells.get(i * 100003 + j);
          if (c && c[1] >= y0 - 0.15 && c[0] <= y1 + 0.15) return true;
        }
        return false;
      },
    };
  }

  const shapeHas = (sh, x, z, pad) => (sh.kind === 'c' ? Math.hypot(x - sh.x, z - sh.z) <= sh.r + pad : (() => { const dx = x - sh.x, dz = z - sh.z; return Math.abs(dx * sh.c - dz * sh.s) <= sh.hx + pad && Math.abs(dx * sh.s + dz * sh.c) <= sh.hz + pad; })());

  function checkCoverage(S, R, tag) {
    const cols = S.world.colliders;
    // (a) Visible solid props with no collider: the share of their body (feet to head) that no collider covers.
    for (const p of S.pieces) {
      if (p.cat !== 'prop' || p.tilted && !S.allowTilted) continue;
      const height = (p.b.max.y - p.b.min.y) * p.s, bottom = p.y + p.b.min.y * p.s;
      if (height < STEP + 0.05) continue; // step-over clutter
      const sup = surfaceBelow(S, p.x, p.z, bottom + TOL.hover, p);
      if (sup.on === 'piece') continue; // resting on something else (goods on a counter)
      const feet = Math.min(sup.y, bottom + 0.1);
      if (bottom - feet > 1.3) continue; // hangs overhead
      const pts = worldCloud(S.kit, p);
      let n = 0, miss = 0, mx = 0, mz = 0, my = 0;
      for (let i = 0; i < pts.length; i += 3) {
        const y = pts[i + 1];
        if (y < feet + STEP || y > feet + HEAD - 0.1) continue; // only what a walking body meets
        n++;
        let ok = false;
        for (const sh of cols.query(pts[i], pts[i + 2], 0.4)) {
          if (sh.cameraOnly || sh.removed) continue;
          if (y >= sh.y0 - 0.1 && y <= sh.y1 + 0.1 && shapeHas(sh, pts[i], pts[i + 2], 0.06)) { ok = true; break; }
        }
        if (!ok) { miss++; mx += pts[i]; mz += pts[i + 2]; my += y; }
      }
      if (n >= 12 && 1 - miss / n < TOL.covered) R.fail('collider', label(p), `${Math.round((miss / n) * 100)}% of its body has no collider (walk-through near ${at(mx / miss, my / miss, mz / miss)})`);
    }
    // (b) Procedural things (tagged objects and town furniture): same test on their surface points.
    for (const gr of S.groups) {
      if (gr.soft) continue; // crops and washing: walked through like grass
      if (/^(Boulders|MineMouth)$/.test(gr.name)) continue; // rocks and timbers are covered by hand-placed round shapes; checked by (c)
      const pts = groupCloud(gr);
      let gmin = Infinity;
      for (let i = 0; i < pts.length; i += 3) gmin = Math.min(gmin, pts[i + 1]);
      if (!Number.isFinite(gmin)) continue;
      const ground = S.ground(gr.x, gr.z);
      const feet = Math.max(ground, Math.min(gmin, ground + 0.5));
      let n = 0, miss = 0, mx = 0, mz = 0;
      for (let i = 0; i < pts.length; i += 3) {
        const y = pts[i + 1];
        if (y < feet + STEP || y > feet + HEAD - 0.1) continue;
        n++;
        let ok = false;
        for (const sh of cols.query(pts[i], pts[i + 2], 0.4)) {
          if (sh.cameraOnly || sh.removed) continue;
          if (y >= sh.y0 - 0.1 && y <= sh.y1 + 0.1 && shapeHas(sh, pts[i], pts[i + 2], 0.06)) { ok = true; break; }
        }
        if (!ok) { miss++; mx += pts[i]; mz += pts[i + 2]; }
      }
      if (n >= 12 && 1 - miss / n < TOL.covered) R.fail('collider', `${gr.name} ${at(gr.x, ground, gr.z)}`, `${Math.round((miss / n) * 100)}% of its body has no collider (walk-through near ${at(mx / miss, ground, mz / miss)})`);
    }
    // (c) Colliders with nothing to see in them.
    const mass = massIndex(S);
    const people = [...(G().npcs || []).map((n) => n.pos), ...((G().fight && G().fight.enemies) || []).map((e) => e.pos || e.root?.position).filter(Boolean)];
    for (const sh of cols.all) {
      if (sh.cameraOnly || sh.removed || sh.data || sh.exempt) continue;
      if (S.dungeon && sh.kind === 'b' && sh.y0 <= -1.5) continue; // the rock between rooms: only its wall face is visible
      if (people.some((q) => Math.hypot(q.x - sh.x, q.z - sh.z) < 0.7)) continue;
      // Footprint cells inside the shape.
      const r = sh.kind === 'c' ? sh.r : Math.hypot(sh.hx, sh.hz);
      let n = 0, seen = 0;
      const y0 = Math.max(sh.y0, S.ground(sh.x, sh.z) - 0.2), y1 = sh.y1;
      for (let u = -r; u <= r; u += 0.2) for (let v = -r; v <= r; v += 0.2) {
        const x = sh.x + u, z = sh.z + v;
        if (!shapeHas(sh, x, z, -0.02)) continue;
        n++;
        if (mass.has(x, z, y0, y1, 0.3)) seen++;
      }
      if (n >= 6 && seen / n < TOL.mass) R.fail('collider', `${sh.kind === 'c' ? 'round' : 'box'} collider ${at(sh.x, sh.y0, sh.z)} ${f2(sh.kind === 'c' ? sh.r * 2 : sh.hx * 2)}x${f2(sh.kind === 'c' ? sh.r * 2 : sh.hz * 2)}`, `only ${Math.round((seen / n) * 100)}% of it has anything visible in it (an invisible wall)`);
    }
  }

  // 5. Buildings: windows, roofs, corners, chimneys.
  function checkBuildings(S, R) {
    const list = S.world.colliders.buildings || [];
    let windowPieces = 0;
    for (const p of S.pieces) if (p.cat === 'wall' && /_Window_/.test(p.name)) windowPieces++;
    let registered = 0;
    for (const b of list) {
      const sp = b.spec, lab = `building ${at(sp.x, sp.groundY, sp.z)} ${sp.w}x${sp.d}x${sp.floors}`;
      registered += b.windows.length;
      // Windows per wall and floor.
      const byWall = {};
      for (const w of b.windows) (byWall[w.side + w.floor] ??= []).push(w);
      for (const [k, ws] of Object.entries(byWall)) {
        const n = ws[0].n;
        if (ws.length > Math.ceil(n / 2)) R.fail('window', lab, `wall ${k}: ${ws.length} windows in ${n} bays`);
        const bays = ws.map((w) => w.bay).sort((a, c) => a - c);
        // Mirror symmetry about the wall's centre or, on a wall with a door, about the door.
        const door = b.openings.find((o) => o.side === k[0]);
        const mirror = (i) => (door ? 2 * door.i - i : n - 1 - i);
        for (const i of bays) {
          if (door && i === door.i) R.fail('window', lab, `wall ${k}: a window in the door's own bay`);
          const m = mirror(i);
          if (m >= 0 && m < n && !bays.includes(m) && !(door && m === door.i)) R.fail('window', lab, `wall ${k}: window in bay ${i} has no partner in bay ${m}`);
        }
        // Open shutters need breathing room: no window in the next bay, and not in a corner bay.
        for (const w of ws) if (w.shutters === 'open' && (w.bay === 0 || w.bay === n - 1 || bays.includes(w.bay + 1) || bays.includes(w.bay - 1) || (door && Math.abs(w.bay - door.i) === 1))) R.fail('window', lab, `wall ${k}: open shutters crowd a corner, a door or another window (bay ${w.bay})`);
      }
      // Same bays on every floor, so they stack.
      for (const [k, ws] of Object.entries(byWall)) {
        if (k[1] === '0' || sp.groundOpen) continue; // (a hall on posts has no walls below its windows)
        const ground = (byWall[k[0] + '0'] || []).map((w) => w.bay);
        for (const w of ws) if (!ground.includes(w.bay)) R.fail('window', lab, `wall ${k[0]}: upper window in bay ${w.bay} doesn't sit over one below`);
      }
      // Shutters only on the front wall (the door's wall); never on more than half of a house's windows.
      const shuttered = b.windows.filter((w) => w.shutters !== 'none');
      if (shuttered.length && shuttered.some((w) => w.side !== 's')) R.fail('window', lab, 'shutters on a side or back wall');
      // Density: windows per storey against bays.
      const bays = 2 * (sp.w / 2 + sp.d / 2);
      if (b.windows.length / sp.floors > 0.5 * bays + 0.001) R.fail('window', lab, `${b.windows.length / sp.floors} windows per storey in ${bays} bays`);
      if (!b.openings.length && !b.windows.length && sp.w >= 6 && sp.d >= 6 && !b.spec.open) R.fail('window', lab, 'a big house with no windows');
      // Roof seated: its origin on the wall tops, over the footprint, with an overhang. Houses built
      // with their own roofs (buildings.js, roofs.js) report them: seated on the wall tops, overhanging
      // the walls, and drawn (a 'roof' group over the footprint).
      const roofs = S.pieces.filter((p) => p.cat === 'roof' && Math.abs(p.x - sp.x) < 0.01 && Math.abs(p.z - sp.z) < 0.01);
      const own = b.roof && b.roof.ridge ? b.roof : null;
      if (own) {
        const rise = own.y0 - sp.floors * 3; // (heights in the house frame)
        if (rise < 0.05 || rise > 0.2) R.fail('roof', lab, `roof sits ${f2(rise)} m above the wall tops`);
        if (own.over < 0.2 || own.over > 1.0) R.fail('roof', lab, `roof overhangs by ${f2(own.over)} m`);
        if (own.ridge - own.y0 < 1.2) R.fail('roof', lab, `roof ridge only ${f2(own.ridge - own.y0)} m above the eaves (flat)`);
        const drawn = S.groups.some((gr) => gr.name === 'roof' && Math.hypot(gr.x - sp.x, gr.z - sp.z) < Math.hypot(sp.w, sp.d) / 2 + 1.5);
        if (!drawn) R.fail('roof', lab, 'no roof');
      } else if (!roofs.length) R.fail('roof', lab, 'no roof');
      for (const r of roofs) {
        const rise = r.y - (sp.groundY + sp.floors * 3);
        if (rise < 0.05 || rise > 0.2) R.fail('roof', lab, `roof sits ${f2(rise)} m above the wall tops`);
        const over = (r.b.max.x - r.b.min.x) / 2 - sp.w / 2;
        if (over < 0.5 || over > 2.0) R.fail('roof', lab, `roof overhangs by ${f2(over)} m`);
      }
      // Corner posts: one at each of the four corners of the footprint, wrapped round the outside
      // of the corner (none of their mass pokes into the room).
      const cornerY = sp.groundY + (sp.groundOpen ? 3 : 0); // a hall's walls start on its first floor
      const corners = sp.open.length ? [] : S.pieces.filter((p) => p.cat === 'corner' && Math.hypot(p.x - sp.x, p.z - sp.z) < Math.hypot(sp.w, sp.d) / 2 + 0.3 && Math.abs(p.y - cornerY) < 0.05);
      if (!sp.open.length) {
        const c = Math.cos(sp.rot), s = Math.sin(sp.rot);
        for (const [ax, az] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
          const wx = sp.x + (ax * sp.w / 2) * c + (az * sp.d / 2) * s, wz = sp.z - (ax * sp.w / 2) * s + (az * sp.d / 2) * c;
          const p = corners.find((q) => Math.hypot(q.x - wx, q.z - wz) < 0.05);
          if (!p) { R.fail('corner', lab, `no corner post at ${at(wx, cornerY, wz)}`); continue; }
          const pts = worldCloud(S.kit, p);
          let room = 0, n = 0;
          for (let i = 0; i < pts.length; i += 3) {
            const dx = pts[i] - sp.x, dz = pts[i + 2] - sp.z;
            const lx = dx * c - dz * s, lz = dx * s + dz * c;
            n++;
            if (sp.w / 2 - lx * ax > 0.4 && sp.d / 2 - lz * az > 0.4) room++;
          }
          if (n && room / n > 0.03) R.fail('corner', label(p), `${Math.round((room / n) * 100)}% of the corner post is turned into the room (wrong way round)`);
        }
      }
      // Chimney set into the roof: its foot below the lowest roof line under it, its cap above the highest.
      for (const ch of S.pieces.filter((p) => p.cat === 'chimney' && Math.hypot(p.x - sp.x, p.z - sp.z) < Math.hypot(sp.w, sp.d) / 2)) {
        const roof = roofs[0];
        if (!roof) continue;
        let lo = Infinity, hi = -Infinity;
        const c = Math.cos(roof.yaw), s = Math.sin(roof.yaw);
        for (const [ox, oz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4], [0, 0]]) {
          const dx = ch.x + ox - roof.x, dz = ch.z + oz - roof.z;
          const y = roof.y + S.kit.topAt(roof.name, dx * c - dz * s, dx * s + dz * c);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
        const foot = ch.y + ch.b.min.y, top = ch.y + ch.b.max.y;
        if (foot > lo + 0.02) R.fail('roof', `chimney ${at(ch.x, ch.y, ch.z)}`, `floats ${f2(foot - lo)} m above the roof on its low side`);
        if (top < hi + 0.4) R.fail('roof', `chimney ${at(ch.x, ch.y, ch.z)}`, `cap only ${f2(top - hi)} m above the roof`);
      }
      // Every glass/shutter piece sits in a window wall piece.
      for (const g of S.pieces.filter((p) => (p.cat === 'glass' || p.cat === 'shutters') && Math.hypot(p.x - sp.x, p.z - sp.z) < Math.hypot(sp.w, sp.d) / 2 + 0.5)) {
        const wall = S.near(g.box, 0.1).find((w) => w.cat === 'wall' && /_Window_/.test(w.name) && Math.hypot(w.x - g.x, w.z - g.z) < 0.02 && Math.abs(w.y - g.y) < 0.02);
        if (!wall) R.fail('window', label(g), 'not set into a window wall piece');
      }
    }
    if (registered !== windowPieces) R.fail('window', 'world', `${registered} windows planned but ${windowPieces} window wall pieces placed`);
    // Doors: every door has exactly one door wall piece and every door wall piece has a door.
    const doorWalls = S.pieces.filter((p) => p.cat === 'wall' && /_Door_/.test(p.name));
    if (doorWalls.length !== S.doors.length) R.fail('door', 'world', `${doorWalls.length} door frames but ${S.doors.length} doors`);
  }

  // 6. Texture stretch on procedural surfaces.
  function refDensity(S) {
    if (S._ref) return S._ref;
    const acc = {};
    for (const part of S.kit.parts.values()) {
      part.updateMatrixWorld(true);
      part.traverse((o) => {
        if (!o.isMesh || !o.geometry.attributes.uv) return;
        for (const t of triangles(o, true)) {
          const key = t.mat.name;
          const a = (acc[key] ??= { w: 0, u: 0 });
          a.w += t.wa; a.u += t.ua;
        }
      });
    }
    S._ref = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, Math.sqrt(v.u / v.w)]));
    return S._ref;
  }
  function* triangles(o, local) {
    const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
    const mats = [o.material].flat();
    const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3();
    const cnt = idx ? idx.count : pos.count;
    for (let i = 0; i < cnt; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
      B.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
      C.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
      const e1 = B.clone().sub(A), e2 = C.clone().sub(A);
      const wa = e1.clone().cross(e2).length() / 2;
      if (wa < 1e-8) continue;
      const u1 = [uv.getX(ib) - uv.getX(ia), uv.getY(ib) - uv.getY(ia)], u2 = [uv.getX(ic) - uv.getX(ia), uv.getY(ic) - uv.getY(ia)];
      const ua = Math.abs(u1[0] * u2[1] - u2[0] * u1[1]) / 2;
      let mat = mats[0];
      if (mats.length > 1) for (const gr of g.groups) if (i >= gr.start && i < gr.start + gr.count) mat = mats[gr.materialIndex];
      // Stretch: ratio of the singular values of the world-to-uv map for this triangle.
      const l1 = e1.length(), l2 = e2.length(), d = e1.dot(e2) / (l1 * l2);
      const s = Math.sqrt(Math.max(0, 1 - d * d));
      // Local 2D coordinates of the triangle in its plane: p1 = (l1, 0), p2 = (l2 d, l2 s).
      const M = [[l1, l2 * d], [0, l2 * s]];
      // uv = J * p  =>  J = [u1 u2] * M^-1
      const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      let aniso = 1;
      if (Math.abs(det) > 1e-10) {
        const inv = [[M[1][1] / det, -M[0][1] / det], [-M[1][0] / det, M[0][0] / det]];
        const J = [[u1[0] * inv[0][0] + u2[0] * inv[1][0], u1[0] * inv[0][1] + u2[0] * inv[1][1]], [u1[1] * inv[0][0] + u2[1] * inv[1][0], u1[1] * inv[0][1] + u2[1] * inv[1][1]]];
        const a2 = J[0][0] ** 2 + J[0][1] ** 2 + J[1][0] ** 2 + J[1][1] ** 2;
        const dj = Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]);
        const disc = Math.sqrt(Math.max(0, a2 * a2 - 4 * dj * dj));
        const smax = Math.sqrt((a2 + disc) / 2), smin = Math.sqrt(Math.max(1e-12, (a2 - disc) / 2));
        aniso = smax / smin;
      }
      yield { wa, ua, mat, aniso };
    }
  }
  function checkTextures(S, R) {
    const ref = refDensity(S);
    for (const gr of S.groups) {
      const nm = gr.name;
      const acc = {};
      for (const m of gr.objs) {
        if (m.fromKit || !m.geometry.attributes.uv || [m.material].flat().some((x) => x.transparent)) continue;
        for (const t of triangles(m)) {
          if (!t.mat.map) continue;
          const a = (acc[t.mat.name || t.mat.uuid] ??= { w: 0, u: 0, an: [] });
          a.w += t.wa; a.u += t.ua; a.an.push([t.aniso, t.wa]);
        }
      }
      for (const [mat, a] of Object.entries(acc)) {
        if (a.w < 0.3) continue;
        const dens = Math.sqrt(a.u / a.w);
        a.an.sort((x, y) => x[0] - y[0]);
        let half = a.w / 2, med = 1;
        for (const [v, w] of a.an) { half -= w; if (half <= 0) { med = v; break; } }
        const lab = `${nm} material ${mat} ${at(gr.x, S.ground(gr.x, gr.z), gr.z)}`;
        if (/^MI_/.test(mat) && med > TOL.stretch) R.fail('texture', lab, `stretched ${f2(med)}:1 (one texture axis is ${f2(med)}x the other)`);
        if (ref[mat]) {
          const ratio = dens / ref[mat];
          if (ratio < TOL.density[0] || ratio > TOL.density[1]) R.fail('texture', lab, `${f2(dens)} repeats per metre vs ${f2(ref[mat])} in the kit (${f2(ratio)}x: bricks ${ratio < 1 ? 'too big' : 'too small'})`);
        }
      }
    }
  }

  // Every part of a piece of furniture must touch the rest of it (a lantern on a gate pier, a beam
  // on its posts, a signboard on its post): loose parts hover.
  function checkAttached(S, R) {
    for (const gr of S.groups) {
      if (gr.soft || gr.on || gr.objs.length < 2) continue;
      const boxes = [];
      for (const o of gr.objs) {
        if ([o.material].flat().some((m) => m.transparent) || !o.geometry.attributes.position) continue;
        o.geometry.boundingBox || o.geometry.computeBoundingBox();
        boxes.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
      const n = boxes.length;
      if (n < 2) continue;
      const dist = (a, b) => Math.hypot(Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0), Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0), Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0));
      const comp = boxes.map((_, i) => i);
      const find = (i) => (comp[i] === i ? i : (comp[i] = find(comp[i])));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (dist(boxes[i], boxes[j]) <= 0.03) comp[find(i)] = find(j);
      const roots = [...new Set(boxes.map((_, i) => find(i)))];
      if (roots.length < 2) continue;
      // Report the smallest loose component and how far it floats from the nearest other part.
      const members = (r) => boxes.map((b, i) => [b, i]).filter(([, i]) => find(i) === r).map(([b]) => b);
      roots.sort((a, b) => members(a).length - members(b).length);
      const loose = members(roots[0]);
      let gap = Infinity;
      for (const a of loose) for (let i = 0; i < n; i++) if (find(i) !== roots[0]) gap = Math.min(gap, dist(a, boxes[i]));
      const c = new T.Box3();
      loose.forEach((b) => c.union(b));
      const ctr = c.getCenter(new T.Vector3());
      R.fail('floating', `${gr.name} ${at(gr.x, S.ground(gr.x, gr.z), gr.z)}`, `a part at ${at(ctr.x, ctr.y, ctr.z)} is not attached: ${f2(gap)} m off the rest`);
    }
  }

  // Procedural furniture standing on the ground: the underside must meet it (no gap under a wall,
  // a lamp or a gate pier), column by column.
  function checkGroups(S, R) {
    for (const gr of S.groups) {
      if (gr.soft || gr.on) continue;
      const pts = groupCloud(gr);
      const cols = new Map();
      for (let i = 0; i < pts.length; i += 3) {
        const k = Math.floor(pts[i] / 0.5) * 100003 + Math.floor(pts[i + 2] / 0.5);
        const c = cols.get(k);
        if (!c || pts[i + 1] < c.y) cols.set(k, { y: pts[i + 1], x: pts[i], z: pts[i + 2] });
      }
      let worst = 0, wx = 0, wz = 0, wy = 0, low = Infinity, lowY = Infinity;
      for (const c of cols.values()) lowY = Math.min(lowY, c.y);
      for (const c of cols.values()) {
        const gap = c.y - S.ground(c.x, c.z);
        low = Math.min(low, gap);
        // Only the body's underside counts (columns holding just a cap's overhang sit higher).
        if (c.y <= lowY + 0.25 && gap > worst) { worst = gap; wx = c.x; wz = c.z; wy = c.y; }
      }
      // A beam or a washing line is above the ground on purpose: flag a group only when its
      // lowest point anywhere is off the ground, or a wall has a visible gap under it.
      if (cols.size && low > TOL.hover + 0.02) R.fail('floating', `${gr.name} ${at(gr.x, S.ground(gr.x, gr.z), gr.z)}`, `hovers ${f2(low)} m above the ground`);
      else if (worst > 0.3 && /^(wall|hedge|wall pier)$/.test(gr.name)) R.fail('floating', `${gr.name} ${at(wx, wy, wz)}`, `a ${f2(worst)} m gap under it where the ground falls away`);
    }
  }

  // 7. Every building looks like what it is: each role has parts it must have and parts it must not.
  // (The critic's "one building doing another's job": a barn with glazed windows, a chapel that is a
  // house, a bank with no name on it.) Reads what was built: colliders.buildings (buildHouse), the
  // village's chapel, barn, signs, lamps and the audit groups.
  const near = (gr, x, z, r) => Math.hypot(gr.x - x, gr.z - z) < r;
  function checkRoles(S, R, V = G().world.village) {
    const B = S.world.colliders.buildings || [];
    const groups = S.groups;
    const by = (role) => B.filter((b) => b.spec.role === role || b.spec.type === role);
    const lab = (b) => `${b.spec.role} ${at(b.spec.x, b.spec.groundY, b.spec.z)}`;
    const reachOf = (b) => Math.hypot(b.spec.w, b.spec.d) / 2 + 2.5;
    const signNear = (b) => (V.signs || []).find((s) => Math.hypot(s.x - b.spec.x, s.z - b.spec.z) < reachOf(b));
    // No house anywhere keeps the old arched windows or their shutters.
    for (const p of S.pieces) if (p.cat === 'shutters') R.fail('role', `${p.name} ${at(p.x, p.y, p.z)}`, 'shutters on a house (the town has none)');
    for (const b of B) for (const w of b.windows) if (/Round/.test(w.kind || '')) R.fail('role', lab(b), `an arched ${w.kind} window`);
    // Public buildings say what they are.
    for (const role of ['store', 'inn', 'smithy', 'potter', 'cooper']) for (const b of by(role)) if (!signNear(b)) R.fail('role', lab(b), 'no hanging sign');
    for (const b of by('bank')) {
      if (b.look.walls !== 'stone') R.fail('role', lab(b), 'the bank is not built in stone');
      if (!b.windows.length || b.windows.some((w) => w.style !== 'bars')) R.fail('role', lab(b), 'bank windows without iron bars');
      if (!b.doors.some((d) => d.leaf === 4)) R.fail('role', lab(b), 'the bank door is not the heavy iron-bound one');
      if (!groups.some((g) => g.name === 'bank name' && near(g, b.spec.x, b.spec.z, reachOf(b)))) R.fail('role', lab(b), 'no name cut over the bank door');
    }
    for (const b of by('store')) if (!(b.shopWindows || []).length) R.fail('role', lab(b), 'a shop with no counter or shop window');
    for (const b of by('inn')) {
      const s = signNear(b);
      if (!s || s.reach < 1.4 || s.w < 1.2) R.fail('role', lab(b), 'the inn has no big hanging sign');
      if (!groups.some((g) => g.name === 'yard arch' && near(g, b.spec.x, b.spec.z, reachOf(b) + 6))) R.fail('role', lab(b), 'no arch into the inn yard');
    }
    // Working buildings: no glazed windows, the right doors.
    for (const b of by('stable')) if (b.windows.length) R.fail('role', lab(b), `a stable with ${b.windows.length} glazed windows`);
    if (!V.barn) R.fail('role', 'barn', 'no barn was built (a cottage stands in for it)');
    else {
      if (V.barn.width < 2.5) R.fail('role', 'barn', `the barn's doorway is only ${f2(V.barn.width)} m wide`);
      const row = (V.places.houses || []).find((p) => p.role === 'barn');
      const inBarn = (x, z) => { const dx = x - row.x, dz = z - row.z, c = Math.cos(row.rot), s = Math.sin(row.rot); return Math.abs(dx * c - dz * s) < row.w / 2 + 0.3 && Math.abs(dx * s + dz * c) < row.d / 2 + 0.3; };
      if (row && groups.some((g) => g.name === 'window' && inBarn(g.x, g.z))) R.fail('role', 'barn', 'glazed windows on the barn');
    }
    for (const b of by('toll house')) if (!groups.some((g) => g.name === 'notice' && near(g, b.spec.x, b.spec.z, reachOf(b)))) R.fail('role', lab(b), 'no board of tolls');
    for (const b of by('watch house')) if (!groups.some((g) => g.name === 'watch bell' && near(g, b.spec.x, b.spec.z, reachOf(b)))) R.fail('role', lab(b), 'no bell at the watch house');
    // The chapel: a church, not a house.
    const C = V.chapel;
    if (!C) R.fail('role', 'chapel', 'no chapel was built (a house stands in for it)');
    else {
      if ((C.lancets || 0) < 3) R.fail('role', 'chapel', `only ${C.lancets || 0} lancet lights`);
      if (!C.belfry || !C.bell) R.fail('role', 'chapel', 'no belfry with a bell');
      const n = C.nave, tower = V.places.tower;
      if (n && tower && Math.abs(tower.x + tower.w / 2 - n.x0) > 0.2) R.fail('role', 'chapel', `the tower stands ${f2(n.x0 - tower.x - tower.w / 2)} m from the nave`);
      if (n) {
        const inside = (x, z, pad = 0.5) => x > n.x0 - 4.5 - pad && x < n.x1 + 3.1 + pad && z > n.z0 - pad && z < n.z1 + pad;
        if ((V.lamps || []).some((l) => inside(l.x, l.z))) R.fail('role', 'chapel', 'a house lantern on the chapel');
        if (groups.some((g) => (g.name === 'window' || g.name === 'chimney') && inside(g.x, g.z, 0))) R.fail('role', 'chapel', 'house windows or a chimney on the chapel');
      }
      if ((C.graves || 0) < 12) R.fail('role', 'chapel', `only ${C.graves || 0} graves in the churchyard`);
    }
    // The market hall: on posts, with its cupola.
    for (const b of by('market hall')) {
      if (!b.spec.groundOpen || (b.roof.posts || []).length < 6) R.fail('role', lab(b), 'the market hall does not stand on posts over an open floor');
      if (!groups.some((g) => g.name === 'cupola' && near(g, b.spec.x, b.spec.z, 4))) R.fail('role', lab(b), 'no cupola on the market hall');
    }
  }

  // 8. Floors, not grass: under every building the ground is painted as a built surface (the grass only
  // grows on meadow), and the buildings you walk into or see into stand on real floors.
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function meadowAt(L, x, z) {
    const [dirt, cobble] = L.townGround(x, z);
    // The grass shader's test on the painted ground (with the paint's own noise at its weakest).
    return (1 - smooth(0.15, 0.55, dirt * 0.8)) * (1 - smooth(0.1, 0.4, cobble));
  }
  function checkFloors(S, R, V = G().world.village, rows = null) {
    const L = V.layout;
    for (const b of rows || L.BUILDINGS) {
      if (b.groundOpen) continue;
      let worst = 0, wx = 0, wz = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const [x, z] = L.toWorld(b, (i / 4 - 0.5) * (b.w - 0.6), (j / 4 - 0.5) * (b.d - 0.6));
        const m = meadowAt(L, x, z);
        if (m > worst) { worst = m; wx = x; wz = z; }
      }
      if (worst > 0.05) R.fail('floor', `${b.role || b.id} ${at(b.x, 0, b.z)}`, `grass can grow inside it (meadow ${f2(worst)} at ${f2(wx)},${f2(wz)})`);
    }
    if (rows) return;
    for (const id of ['bank', 'store', 'inn', 'smithy', 'potter']) {
      const p = V.places[id];
      if (!p) continue;
      let bare = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const q = V.at(p, (i / 4 - 0.5) * (p.w - 0.8), (j / 4 - 0.5) * (p.d - 0.8));
        const floor = S.near({ x0: q.x, x1: q.x, z0: q.z, z1: q.z }, 0.05).some((f) => f.cat === 'floor' && q.x >= f.box.x0 && q.x <= f.box.x1 && q.z >= f.box.z0 && q.z <= f.box.z1 && Math.abs(f.box.y1 - p.y) < 0.12);
        if (!floor) bare++;
      }
      if (bare) R.fail('floor', `${id} ${at(p.x, p.y, p.z)}`, `${bare} of 25 points inside have no floor (bare ground)`);
    }
  }

  // ---- entry points
  function run(name, opts = {}) {
    const g = G();
    const dungeon = opts.dungeon;
    const world = dungeon ? g.dungeon : g.world;
    const kit = g.world.village.kit;
    const scene = dungeon ? g.dungeon.scene : g.scene;
    const S = scan(scene, kit, world);
    S.allowTilted = false;
    S.dungeon = !!dungeon;
    const R = makeReport();
    const checks = {
      floating: () => { checkFloating(S, R); checkMounts(S, R); checkGroups(S, R); checkAttached(S, R); },
      penetration: () => checkPenetration(S, R),
      doors: () => checkDoors(S, R),
      coverage: () => { withDoors(S, false, () => checkCoverage(S, R)); withDoors(S, true, () => checkCoverage(S, R)); },
      buildings: () => checkBuildings(S, R),
      textures: () => checkTextures(S, R),
      roles: () => checkRoles(S, R),
      floors: () => checkFloors(S, R),
    };
    const t0 = performance.now();
    if (dungeon) delete checks.doors, delete checks.buildings, delete checks.textures, delete checks.roles, delete checks.floors;
    (name === 'all' ? Object.values(checks) : [checks[name]]).forEach((c) => c());
    return {
      check: name, ms: Math.round(performance.now() - t0), pieces: S.pieces.length, tagged: S.groups.length, doors: S.doors.length, colliders: world.colliders.all.length,
      fails: R.fails.length, counts: R.counts, lines: R.fails.map((f) => f.line),
    };
  }
  // Breaks pieces on purpose and requires the audit to notice each one, so a scan that quietly
  // sees nothing (or a check that stops working) can't leave the run green.
  function canary() {
    const g = G(), kit = g.world.village.kit, world = g.world;
    const S = scan(g.scene, kit, world);
    const lines = [];
    let caught = 0, total = 0;
    const expect = (what, run, pattern) => {
      total++;
      const R = makeReport();
      run(R);
      if (R.fails.some((f) => pattern.test(f.line))) caught++;
      else lines.push(`FAIL canary: the audit missed ${what}`);
    };
    const put = (name, x, y, z, yaw = 0) => S.add(S.mk(name, new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw), new T.Vector3(1, 1, 1)), {}, 'batch'));
    const gy = world.heightAt(-8, 40);
    let p = put('Barrel', -8, gy + 0.5, 40);
    expect('a barrel floating half a metre up', (R) => checkFloating(S, R), /floating Barrel/);
    S.remove(p);
    const wall = S.pieces.find((w) => w.cat === 'wall' && /Straight/.test(w.name));
    p = put('Crate_Wooden', wall.x, wall.y, wall.z, wall.yaw);
    expect('a crate inside a wall', (R) => checkPenetration(S, R), /clip Crate_Wooden/);
    S.remove(p);
    const stall = S.pieces.find((q) => q.name === 'Stall_Empty');
    p = put('FarmCrate_Apple', stall.x, stall.y + 0.58, stall.z, stall.yaw);
    expect('goods sunk into a stall counter', (R) => checkPenetration(S, R), /clip FarmCrate_Apple/);
    S.remove(p);
    // A wall lantern a metre out from the face of a wall (on its own side of the wall piece).
    p = put('Lantern_Wall', wall.x + Math.sin(wall.yaw) * 1.0, wall.y + 1.0, wall.z + Math.cos(wall.yaw) * 1.0, wall.yaw);
    expect('a lantern hung a metre off its wall', (R) => checkMounts(S, R), /mount Lantern_Wall/);
    S.remove(p);
    const d = S.doors[0];
    d.leaf.scale.x *= 0.8;
    expect('a door leaf too narrow for its frame', (R) => checkDoors(S, R), /door Door_/);
    d.leaf.scale.x /= 0.8;
    d.snap(d.public);
    p = put('Bench', -8 + 10, world.heightAt(2, 40), 40);
    expect('a bench with no collider', (R) => checkCoverage(S, R), /collider Bench/);
    S.remove(p);
    const sh = world.colliders.addCircle(-8, 70, 1.0, world.heightAt(-8, 70) - 1, world.heightAt(-8, 70) + 2);
    expect('a collider with nothing visible in it', (R) => checkCoverage(S, R), /invisible wall/);
    world.colliders.remove(sh);
    const b = (world.colliders.buildings || [])[0], saved = b.windows.slice();
    for (const bay of [0, 1, 2]) b.windows.push({ side: 's', floor: 0, bay, n: 3, kind: 'Wide_Round', shutters: 'none' });
    expect('a wall covered in windows', (R) => checkBuildings(S, R), /window building/);
    b.windows.length = 0;
    b.windows.push(...saved);
    let brick = null;
    for (const part of kit.parts.values()) part.traverse((o) => { if (!brick && o.isMesh) for (const m of [o.material].flat()) if (m.name === 'MI_RedBrick') brick = m; });
    const fake = new T.Mesh(new T.PlaneGeometry(4, 0.5), brick);
    fake.userData.audit = { name: 'CanaryWall' };
    g.scene.add(fake);
    S.groups.push({ name: 'CanaryWall', soft: false, x: 0, z: 0, objs: [{ geometry: fake.geometry, material: fake.material, matrixWorld: fake.matrixWorld }] });
    expect('a stretched brick texture', (R) => checkTextures(S, R), /texture CanaryWall/);
    g.scene.remove(fake);
    S.groups.pop();
    // A bank that lost its bars, a chapel that lost its bell: the role check must notice.
    const V = g.world.village;
    const bank = (world.colliders.buildings || []).find((q) => q.spec.type === 'bank');
    const styles = bank.windows.map((w) => w.style);
    bank.windows.forEach((w) => (w.style = 'casement'));
    expect('a bank with plain glazed windows', (R) => checkRoles(S, R), /role bank .*iron bars/);
    bank.windows.forEach((w, i) => (w.style = styles[i]));
    const bell = V.chapel.bell;
    V.chapel.bell = null;
    expect('a chapel with no bell', (R) => checkRoles(S, R), /role chapel: no belfry/);
    V.chapel.bell = bell;
    // Grass inside: a shed planned on the open paddock; the bank with its floor taken up.
    expect('grass growing inside a building', (R) => checkFloors(S, R, V, [{ id: 'house', role: 'canary shed', x: 24, z: 36, w: 4, d: 4, rot: 0 }]), /floor canary shed/);
    const boards = S.pieces.filter((q) => q.cat === 'floor' && Math.hypot(q.x - V.places.bank.x, q.z - V.places.bank.z) < 4.5);
    boards.forEach((q) => S.remove(q));
    expect('a bank with its floor taken up', (R) => checkFloors(S, R), /floor bank/);
    boards.forEach((q) => S.add(q));
    return { lines, caught: `${caught}/${total}` };
  }
  return { run, canary, catOf, cloudOf, scan };
})();
