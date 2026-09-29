# ci paths=src/world/,src/actors/camera-rig.js,src/dungeon/,tests/playtest/camera
# Camera never clips: at village doorways, inside the bank, store and inn, against building
# corners, at the mine mouth and in the Old Warren, the camera must never sit inside a solid
# shape, above an interior ceiling, under the ground or above the dungeon vault, and it must
# not flutter (pull in right after easing out) while the player walks past edges.
# Prints "FAIL ..." lines for misses (play.py exits non-zero on those) and a summary line.
STEPS = [
  {'eval': '@camera_helpers.js'},
  # --- register the village buildings
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, list = [];
    for (const id of ['bank', 'store', 'inn']) list.push({ id, ceiling: true, p: v.places[id] });
    (v.places.houses || []).forEach((p, i) => list.push({ id: 'house' + i, ceiling: false, p }));
    for (const { id, ceiling, p } of list) C.T.buildings.push({ id, ceiling, x: p.x, z: p.z, rot: p.rot, w: p.w, d: p.d, y: 3.2, storey: 3, place: p });
    return { buildings: C.T.buildings.length, colliders: g.world.colliders.all.length };
  })()"""},
  # --- through the front doors, in and out, walking forward and backing up, three pitches
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village;
    const at = (b, lx, lz) => v.at(b.place, lx, lz);
    for (const b of C.T.buildings.filter((b) => b.ceiling || b.place.openings.length)) {
      const op = b.place.openings[0];
      if (!op) continue;
      for (const pitch of [-0.22, -0.9, 0.5])
        for (const back of [false, true])
          for (const off of [0, 0.7, -0.7, 2, -2]) {
            const label = `${b.id} door in pitch ${pitch} ${back ? 'backing' : 'facing'} off ${off}`;
            let s = at(b, op.lx + off, b.d / 2 + 5);
            C.walk(label + ' in', s.x, s.z, b.rot + Math.PI + Math.atan2(-off, 5) * 0.0, 2.4, pitch, back);
            s = at(b, op.lx + off, -b.d / 2 + 1.2);
            C.walk(label + ' out', s.x, s.z, b.rot, 2.4, pitch, back);
          }
    }
    return { frames: C.T.frames, fails: C.T.fails.length, jitter: C.T.jitter };
  })()"""},
  # --- diagonal runs past the outside corners and along the walls of every building
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village;
    for (const b of C.T.buildings) {
      const hw = b.w / 2 + 1.5, hd = b.d / 2 + 1.5;
      for (const [lx, lz] of [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]])
        for (let k = 0; k < 8; k++) {
          const h = k * Math.PI / 4;
          const s = v.at(b.place, lx, lz);
          C.walk(`${b.id} corner heading ${k}`, s.x, s.z, h, 1.4, k % 2 ? -0.6 : -0.22, k % 3 === 0, false);
        }
    }
    return { frames: C.T.frames, fails: C.T.fails.length, jitter: C.T.jitter };
  })()"""},
  # --- standing hard against every wall, corner and doorway (outside), looking all round
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village;
    for (const b of C.T.buildings) {
      const hw = b.w / 2 + 0.45, hd = b.d / 2 + 0.45;
      const pts = [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd], [0, hd], [0, -hd], [hw, 0], [-hw, 0]];
      for (const [lx, lz] of pts) {
        const s = v.at(b.place, lx, lz);
        for (let k = 0; k < 12; k++)
          for (const pitch of [-0.22, -1.1, 0.7]) {
            C.place(s.x, s.z, k * Math.PI / 6, pitch);
            C.stepFor(`${b.id} outside wall`, 8);
          }
      }
    }
    return { frames: C.T.frames, fails: C.T.fails.length, jitter: C.T.jitter };
  })()"""},
  # --- inside the bank, store and inn: corners, walls, under the ceiling, looking up and down
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village;
    for (const b of C.T.buildings.filter((b) => b.ceiling)) {
      const hw = b.w / 2 - 0.75, hd = b.d / 2 - 0.75;
      const pts = [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd], [0, hd], [0, -hd], [hw, 0], [-hw, 0], [0, 0], [0, 1.5]];
      for (const [lx, lz] of pts) {
        const s = v.at(b.place, lx, lz);
        for (let k = 0; k < 16; k++)
          for (const pitch of [-0.22, -0.7, -1.25, 0.5, 0.95]) {
            C.place(s.x, s.z, k * Math.PI / 8, pitch);
            C.stepFor(`${b.id} inside`, 8);
          }
      }
      // Walk about inside in every direction.
      for (let k = 0; k < 8; k++) {
        const s = v.at(b.place, 0, 0.5);
        C.walk(`${b.id} inside walk ${k}`, s.x, s.z, k * Math.PI / 4, 1.6, -0.5, k % 2 === 0, k === 3);
      }
    }
    return { frames: C.T.frames, fails: C.T.fails.length, jitter: C.T.jitter };
  })()"""},
  # --- a look inside from the doorway, for the screenshots
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = C.T.buildings.find((b) => b.id === 'inn');
    const s = v.at(b.place, b.place.openings[0].lx, b.d / 2 - 0.2);
    C.place(s.x, s.z, b.rot, -0.35); g.player.faceTowards(s.x - Math.sin(b.rot), s.z - Math.cos(b.rot)); g.rig.yaw = b.rot;
    C.stepFor('shot inn door', 40); g.run(0.1); return 1; })()"""},
  {'shot': 'camera_inn_door'},
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = C.T.buildings.find((b) => b.id === 'bank');
    const s = v.at(b.place, b.w / 2 - 0.9, -b.d / 2 + 0.9);
    C.place(s.x, s.z, b.rot + Math.PI * 0.75, -1.2); C.stepFor('shot bank corner', 40); g.run(0.1); return 1; })()"""},
  {'shot': 'camera_bank_corner_down'},
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = C.T.buildings.find((b) => b.id === 'store');
    const s = v.at(b.place, 0, 0);
    C.place(s.x, s.z, b.rot, 0.8); C.stepFor('shot store up', 40); g.run(0.1); return 1; })()"""},
  {'shot': 'camera_store_up'},
  {'eval': """(() => {
    const g = __game, C = __cam, v = g.world.village, b = C.T.buildings.find((b) => b.id === 'store');
    const s = v.at(b.place, 2.4, b.d / 2 + 0.7);
    C.place(s.x, s.z, b.rot + Math.PI, -0.3); C.stepFor('shot store corner', 40); g.run(0.1); return 1; })()"""},
  {'shot': 'camera_store_wall'},
  # --- the mine mouth (the way down)
  {'eval': """(() => {
    const g = __game, C = __cam, e = g.resources.caveExit;
    const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
    for (const r of [1, 2.5, 4.2, 6]) for (const side of [-1.5, 0, 1.5]) for (let k = 0; k < 16; k++) for (const pitch of [-0.22, -1.0, 0.6]) {
      C.place(e.x - fx * (r - 4.2) + fz * side, e.z - fz * (r - 4.2) - fx * side, k * Math.PI / 8, pitch);
      C.stepFor('mine mouth', 6);
    }
    for (let k = 0; k < 8; k++) C.walk('mine walk ' + k, e.x + Math.sin(k) * 5, e.z + Math.cos(k) * 5, k * Math.PI / 4, 2, -0.3, k % 2 === 0);
    C.place(e.x, e.z, e.facing, -0.3); C.stepFor('shot mine', 30); g.run(0.1);
    return { frames: C.T.frames, fails: C.T.fails.length, jitter: C.T.jitter };
  })()"""},
  {'shot': 'camera_mine'},
  # --- the dungeon
  {'eval': "(() => { const g = __game; window.__entered = false; g.enterDungeon().then(() => (window.__entered = true)); return 1; })()"},
  {'wait': 4000},
  {'eval': """(() => {
    const g = __game, C = __cam, d = g.dungeon, L = d.layout;
    if (!d) return 'FAIL no dungeon'; g.player.invulnerable = true;
    let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const cells = []; for (let j = 0; j < L.size; j++) for (let i = 0; i < L.size; i++) if (L.grid[j * L.size + i] === 1) cells.push([i, j]);
    // Cells that touch rock are the interesting ones.
    const edge = cells.filter(([i, j]) => [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].some(([a, b]) => L.grid[(j + b) * L.size + i + a] !== 1));
    const pool = edge.length > 90 ? Array.from({ length: 90 }, () => edge[Math.floor(rnd() * edge.length)]) : edge;
    for (const [i, j] of pool) {
      const c = d.cellCentre(i, j);
      for (const [ox, oz] of [[0.75, 0.75], [-0.75, 0.75], [-0.75, -0.75], [0.75, -0.75], [0, 0]])
        for (let k = 0; k < 8; k++) for (const pitch of [-0.22, -1.2, 0.7]) {
          C.place(c.x + ox, c.z + oz, k * Math.PI / 4 + rnd(), pitch);
          C.stepFor('dungeon edge', 6);
        }
    }
    // Walk through rooms and corridors in random directions.
    for (let n = 0; n < 60; n++) {
      const [i, j] = cells[Math.floor(rnd() * cells.length)], c = d.cellCentre(i, j);
      C.walk('dungeon walk ' + n, c.x, c.z, rnd() * Math.PI * 2, 2.5, [-0.22, -0.8, 0.4][n % 3], n % 2 === 0, n % 5 === 0);
    }
    return { cells: cells.length, frames: C.T.frames, fails: C.T.fails.length, jitter: C.T.jitter };
  })()"""},
  {'eval': """(() => {
    const g = __game, C = __cam, d = g.dungeon; if (!d) return 'no dungeon, realm ' + g.realm;
    const s = d.startPos, L = d.layout;
    // A wall-hugging spot for the screenshots: the first start-room cell with rock beside it.
    const room = L.rooms.find((r) => r.role === 'start');
    const c = room.cells.find(([i, j]) => L.grid[j * L.size + i - 1] !== 1) || room.c, p = d.cellCentre(c[0], c[1]);
    C.place(p.x - 0.3, p.z, Math.PI / 2, -0.25); C.stepFor('shot dungeon wall', 40); g.run(0.1); return 1; })()"""},
  {'shot': 'camera_dungeon_wall'},
  {'eval': """(() => {
    const g = __game, C = __cam, d = g.dungeon; if (!d) return 'no dungeon';
    const s = d.startPos; C.place(s.x, s.z, 0.3, -1.25); C.stepFor('shot dungeon down', 40); g.run(0.1); return 1; })()"""},
  {'shot': 'camera_dungeon_down'},
  # --- verdict
  {'eval': """(() => {
    const T = __cam.T;
    __cam.hold();
    const lines = T.fails.slice();
    return { frames: T.frames, skippedInWall: T.skipped, skipBy: T.skipBy, flutters: T.jitter, flutterAt: (T.flutterAt || []).slice(0, 12).join(' | '), biggestStep: +T.maxStep.toFixed(2), fails: lines.length, failLines: lines.join(' || ') || 'none' };
  })()"""},
]
