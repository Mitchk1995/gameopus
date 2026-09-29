# ci
# Geometry audit: scans every placed piece in the world (village buildings and their parts,
# doors, windows, props, stall goods, stations, resource nodes, camps, the wreck) and in the
# Old Warren, and checks them numerically. Checks:
#   floating   props hovering over the ground or counter, wall-mounted things off their wall
#   clip       props (and the goods on a counter) poking into other props or walls
#   door       leaf vs frame opening, shut doors solid, open doors clear, the open leaf solid and clear
#   collider   solid-looking things with no collider, and colliders with nothing visible in them
#   window     windows per wall, symmetry, stacking, shutters, roofs, corner posts, chimneys
#   texture    procedural surfaces whose UV density or stretch strays from the kit's
#   role       every building has the parts its job needs and none it must not (a barn with no glazed
#              windows and wide doors, a chapel with lancets, a belfry and a bell and no house lanterns,
#              a barred stone bank with its name cut over the door, signs on the trades, no shutters)
#   floor      no grass can grow inside any building, and the ones you walk into stand on real floors
# Then plays it: shut doors stop you, the bank door swings on E, a bench can be jumped onto, the
# door lanterns hang overhead and you walk under them. Prints "FAIL ..." lines (play.py exits non-zero on those).
# A canary block breaks pieces on purpose and requires the audit to notice.
def check(name, dungeon=False):
    return {'eval': """(() => { const r = __geo.run('%s', { dungeon: %s }); return { check: r.check, fails: r.fails, counts: r.counts, scanned: r.pieces + ' pieces, ' + r.tagged + ' tagged, ' + r.doors + ' doors, ' + r.colliders + ' colliders', failLines: r.lines.slice(0, 14).join(' || ') || 'none', warnLines: (r.warns || []).slice(0, 8).join(' || ') || 'none' }; })()""" % (name, 'true' if dungeon else 'false')}

STEPS = [
  {'eval': '@geometry_helpers.js'},
  # --- the audit must have something to look at, or a green run means nothing
  {'eval': """(() => { const g = __game, S = __geo.scan(g.scene, g.world.village.kit, g.world);
    const need = { pieces: [S.pieces.length, 400], doors: [S.doors.length, 8], tagged: [S.tagged.length, 8], buildings: [(g.world.colliders.buildings || []).length, 10] };
    const bad = Object.entries(need).filter(([, [n, min]]) => n < min).map(([k, [n, min]]) => `FAIL scan: only ${n} ${k} found (expected at least ${min}), so the audit is blind`);
    return { pieces: S.pieces.length, doors: S.doors.length, tagged: S.tagged.length, buildings: need.buildings[0], failLines: bad.join(' || ') || 'none' }; })()"""},
  check('floating'),
  check('penetration'),
  check('doors'),
  check('coverage'),
  check('buildings'),
  check('textures'),
  check('crossing'),
  check('placeholder'),
  check('joins'),
  check('headroom'),
  check('roles'),
  check('floors'),
  # --- canary: the audit must catch deliberately broken pieces
  {'eval': "(() => { const c = __geo.canary(); return { failLines: c.lines.join(' || ') || 'none', caught: c.caught }; })()"},
  # --- the dungeon
  {'eval': "(() => { const g = __game; window.__entered = false; g.enterDungeon().then(() => (window.__entered = true)); return 1; })()"},
  {'wait': 4000},
  check('floating', True),
  check('penetration', True),
  check('coverage', True),
  # --- play it: a shut house door stops you, and answers a knock
  {'eval': """(() => { const g = __game, v = g.world.village;
    g.exitDungeon && g.realm === 'dungeon' && g.exitDungeon();
    const d = g.world.colliders.doors.find((d) => !d.public), s = Math.sin(d.def.yaw), c = Math.cos(d.def.yaw);
    window.__d = d;
    g.player.spawn(d.def.x + s * 2.6, d.def.z + c * 2.6, d.def.yaw + Math.PI); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.1; g.run(0.4);
    return { target: g.target && (g.target.station + ':' + g.target.verb) }; })()"""},
  {'key': 'KeyW'},
  {'eval': "__game.sim(2.5)"},
  {'up': 'KeyW'},
  {'eval': """(() => { const g = __game, d = window.__d, s = Math.sin(d.def.yaw), c = Math.cos(d.def.yaw), P = g.player.pos;
    const b = (P.x - d.def.x) * s + (P.z - d.def.z) * c;
    return { bAfterWalkingIntoShutDoor: +b.toFixed(2), failLines: b < 0.2 ? 'FAIL door: walked through a shut house door (b=' + b.toFixed(2) + ')' : 'none' }; })()"""},
  {'eval': "(() => { const g = __game; g.run(0.3); return { target: g.target && (g.target.station + ':' + g.target.verb) }; })()"},
  {'press': 'KeyE'},
  {'eval': """(() => { const g = __game; g.run(0.5); const d = window.__d;
    return { failLines: d.t === 0 && !d.open ? 'none' : 'FAIL door: a private house door opened', locked: d.rattle >= 0 }; })()"""},
  # --- the bank door: open, walk in; close it on E; blocked; open it on E; walk in
  {'eval': """(() => { const g = __game;
    const d = g.world.colliders.doors.find((d) => d.public && d.def.id === 'bank'), s = Math.sin(d.def.yaw), c = Math.cos(d.def.yaw);
    window.__d = d;
    g.player.spawn(d.def.x + s * 2.4, d.def.z + c * 2.4, d.def.yaw + Math.PI); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.1; g.run(0.4);
    return { open: d.open, target: g.target && (g.target.station + ':' + g.target.verb) }; })()"""},
  {'shot': 'geometry_bank_door_open'},
  {'eval': """(() => { const g = __game, d = window.__d; const t = g.target;
    return { failLines: t && t.station === 'door' && /Close/.test(t.verb) ? 'none' : 'FAIL door: looking at the open bank door offers ' + (t ? t.station + ':' + t.verb : 'nothing') }; })()"""},
  {'press': 'KeyE'},
  {'eval': "__game.run(0.6); [window.__d.open, +window.__d.t.toFixed(2)]"},
  {'shot': 'geometry_bank_door_shut'},
  {'key': 'KeyW'},
  {'eval': "__game.sim(2.0)"},
  {'up': 'KeyW'},
  {'eval': """(() => { const g = __game, d = window.__d, s = Math.sin(d.def.yaw), c = Math.cos(d.def.yaw), P = g.player.pos;
    const b = (P.x - d.def.x) * s + (P.z - d.def.z) * c;
    return { bAfterWalkingIntoShutBankDoor: +b.toFixed(2), failLines: d.open || b < 0.2 ? 'FAIL door: the shut bank door let you through (b=' + b.toFixed(2) + ')' : 'none' }; })()"""},
  {'press': 'KeyE'},
  {'eval': "__game.run(0.6); [window.__d.open, +window.__d.t.toFixed(2)]"},
  {'key': 'KeyW'},
  {'eval': "__game.sim(2.2)"},
  {'up': 'KeyW'},
  {'eval': """(() => { const g = __game, d = window.__d, s = Math.sin(d.def.yaw), c = Math.cos(d.def.yaw), P = g.player.pos;
    const b = (P.x - d.def.x) * s + (P.z - d.def.z) * c;
    return { bInsideBank: +b.toFixed(2), failLines: !d.open || b > -0.6 ? 'FAIL door: could not walk in through the reopened bank door (b=' + b.toFixed(2) + ')' : 'none' }; })()"""},
  # --- a bench can be jumped onto and stood on
  {'eval': """(() => { const g = __game, v = g.world.village;
    const sh = g.world.colliders.all.find((s) => s.prop === 'Bench' && s.floor && !s.removed);
    window.__bench = sh;
    // Approach across the seat's narrow side (local z), from 1.4 m out.
    const ax = Math.sin(sh.rot ?? Math.atan2(sh.s, sh.c)), az = Math.cos(sh.rot ?? Math.atan2(sh.s, sh.c));
    const px = sh.x + ax * 1.5, pz = sh.z + az * 1.5, face = Math.atan2(-ax, -az);
    g.player.spawn(px, pz, face); g.rig.yaw = face + Math.PI; g.rig.pitch = -0.1; g.run(0.3);
    return { bench: [sh.x.toFixed(1), sh.z.toFixed(1)], top: (sh.y1 - g.world.heightAt(sh.x, sh.z)).toFixed(2) }; })()"""},
  {'key': 'KeyW'},
  {'eval': "__game.sim(0.45)"},
  {'press': 'Space'},
  {'eval': "__game.sim(0.15)"},
  {'up': 'KeyW'},
  {'eval': "__game.sim(1.0)"},
  {'eval': """(() => { const g = __game, sh = window.__bench, P = g.player.pos;
    const onTop = Math.abs(P.y - sh.y1) < 0.05;
    return { y: +P.y.toFixed(2), benchTop: +sh.y1.toFixed(2), failLines: onTop ? 'none' : 'FAIL bench: could not jump onto the bench (feet ' + P.y.toFixed(2) + ', seat ' + sh.y1.toFixed(2) + ')' }; })()"""},
  # --- door lanterns hang overhead: every one clears a tall head, and you walk under one to the wall
  {'eval': """(() => { const g = __game, v = g.world.village, lines = [];
    for (const l of v.lamps || []) { const up = l.bottom - g.world.heightAt(l.x, l.z); if (up < 2.3) lines.push('FAIL lantern: a door lantern at ' + l.x.toFixed(1) + ',' + l.z.toFixed(1) + ' hangs only ' + up.toFixed(2) + ' m up (head height)'); }
    const lamp = (v.lamps || []).find((l) => !l.hung);
    if (!lamp) lines.push('FAIL lantern: no bracket lanterns by the doors');
    else {
      window.__lamp = lamp;
      const out = { x: Math.sin(lamp.rot), z: Math.cos(lamp.rot) };
      // Stand out in front of the lamp, walk straight at the wall under it.
      const px = lamp.wx + out.x * 2.4, pz = lamp.wz + out.z * 2.4, face = Math.atan2(-out.x, -out.z);
      g.player.spawn(px, pz, face); g.rig.yaw = face + Math.PI; g.rig.pitch = -0.1; g.run(0.3);
    }
    return { lamps: (v.lamps || []).length, failLines: lines.join(' || ') || 'none' }; })()"""},
  {'key': 'KeyW'},
  {'eval': "__game.sim(2.0)"},
  {'up': 'KeyW'},
  {'eval': """(() => { const g = __game, l = window.__lamp, P = g.player.pos;
    const fromWall = (P.x - l.wx) * Math.sin(l.rot) + (P.z - l.wz) * Math.cos(l.rot);
    return { fromWall: +fromWall.toFixed(2), failLines: fromWall > 0.7 ? 'FAIL lantern: stopped ' + fromWall.toFixed(2) + ' m from the wall, short of walking under the door lantern' : 'none' }; })()"""},
]
