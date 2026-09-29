# ci paths=src/content/,src/actors/,tests/playtest/npc_looks
# Villagers look like themselves: no two people share a look, and nobody could pass for the player.
#   - clones      no two villagers may have the same outfit pieces, colours, hair, beard, skin and gear;
#                 the closest pair still has to differ by a clear margin (the "look distance" below)
#   - the player  nobody wears the player's outfit and colouring: the ranger outfit is the player's alone
#                 in green (other people may wear ranger pieces re-dyed to a clearly different colour),
#                 and every villager stays a clear distance from the player's own look
#   - built       the people in the world really are built from the looks in src/content/people.js
# It also photographs the lineup (npc_lineup.png): the player and every villager side by side on the road
# outside the south gate, front view, at eye level (docs/town/after/npc_lineup.jpg is a copy of it).
# Look distance is a sum over the parts you can see at ten metres: which outfit each garment comes from,
# the colour of each garment, hair style and colour, beard, skin, gear, height and build. Colours are
# compared as CIE Lab differences, so a hex that is one digit off does not count as a different colour.
# Prints "FAIL ..." lines for misses (play.py exits non-zero on those) and a summary line.
STEPS = [
  {'eval': """(() => {
    const g = __game, hero = g.hero;
    const fails = [], info = [];
    const fail = (m) => fails.push('FAIL ' + m);

    // ---- colours
    const lin = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const lab = (h) => {
      const [r, gg, b] = lin(h);
      const X = (0.4124 * r + 0.3576 * gg + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * gg + 0.0722 * b, Z = (0.0193 * r + 0.1192 * gg + 0.9505 * b) / 1.08883;
      const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

    // ---- what you see of a look
    // The files' own colours, for what is not dyed: the ranger's green cloth, the peasant's cream linen,
    // the grey hair files, the base skin.
    const NATIVE = { green: 0x2f5a1e, cream: 0x948f76, leather: 0x6e492c, hair: 0x8f8f8c, skin: 0xa0704f };
    const CORE = ['torso', 'arms', 'legs', 'feet'];
    const isRanger = (src) => /_ranger$/.test(src);
    const hexOf = (d) => (Array.isArray(d) ? d[0] : d);
    const leather = (l, p) => l.leather[p] ?? NATIVE.leather;
    // The main colour of a garment. Ranger boots hold no green cloth, only leather.
    const cloth = (l, p) => (p === 'feet' && isRanger(l.parts[p]) ? leather(l, p) : hexOf(l.dye[p]) ?? (isRanger(l.parts[p]) ? NATIVE.green : NATIVE.cream));
    const gearKey = (l) => l.gear.map((x) => [x.kind, x.style || '', x.color ?? ''].join(':')).sort();
    // How different two looks are. Every term is worth about one "clear difference".
    function distance(a, b) {
      let d = 0;
      const parts = [];
      const add = (v, what) => { if (v > 0.05) { d += v; parts.push(what + ' ' + v.toFixed(1)); } };
      const col = (x, y, full) => Math.min(1.5, dE(x, y) / full);
      for (const p of CORE) {
        add(a.parts[p] !== b.parts[p] ? 1 : 0, p + ' from another outfit');
        add(col(cloth(a, p), cloth(b, p), 30), p + ' colour');
      }
      for (const x of ['hood', 'pauldron', 'bracers', 'belt']) add(a.addons.includes(x) !== b.addons.includes(x) ? 0.7 : 0, x);
      if (a.addons.includes('hood') && b.addons.includes('hood')) add(col(cloth(a, 'hood'), cloth(b, 'hood'), 30), 'hood colour');
      if (isRanger(a.parts.feet) && isRanger(b.parts.feet)) add(col(leather(a, 'feet'), leather(b, 'feet'), 40), 'leather');
      add(a.hair !== b.hair ? 1.5 : 0, 'hair style');
      add(col(a.hairColor ?? NATIVE.hair, b.hairColor ?? NATIVE.hair, 25), 'hair colour');
      add(!!a.beard !== !!b.beard ? 1.5 : 0, 'beard');
      add(col(a.skin ?? NATIVE.skin, b.skin ?? NATIVE.skin, 20), 'skin');
      add(gearKey(a).join('|') !== gearKey(b).join('|') ? 1.5 : 0, 'gear');
      add(Math.min(1, Math.abs(a.scale - b.scale) / 0.04), 'height');
      add(Math.min(1, Math.abs(a.build - b.build) / 0.05), 'build');
      add(a.tint !== b.tint ? 1 : 0, 'tint');
      return { d, why: parts.join(', ') };
    }

    // ---- the people, as built
    const npcs = g.npcs.map((n) => ({ id: n.def.id, look: n.char.look }));
    if (!hero.look) fail('the player has no look');
    for (const n of npcs) {
      if (!n.look) { fail(n.id + ' was not built from a look'); continue; }
      const want = JSON.stringify(g.factory.describe(g.npcs.find((x) => x.def.id === n.id).def.look));
      if (want !== JSON.stringify(n.look)) fail(n.id + ' is not built from its row in src/content/people.js');
    }
    const MIN_PAIR = 5, MIN_PLAYER = 7;
    // ---- no clones: every pair of villagers, and the closest is reported
    let closest = { d: 1e9 };
    const pairs = [];
    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const r = distance(npcs[i].look, npcs[j].look);
        pairs.push({ d: r.d, a: npcs[i].id, b: npcs[j].id });
        if (r.d < closest.d) closest = { d: r.d, a: npcs[i].id, b: npcs[j].id, why: r.why };
        if (JSON.stringify(npcs[i].look) === JSON.stringify(npcs[j].look)) fail(npcs[i].id + ' and ' + npcs[j].id + ' are clones: the same outfit, colours, hair and beard');
        else if (r.d < MIN_PAIR) fail(npcs[i].id + ' and ' + npcs[j].id + ' look alike (look distance ' + r.d.toFixed(1) + ' < ' + MIN_PAIR + '; they differ in: ' + (r.why || 'nothing') + ')');
      }
    }
    pairs.sort((x, y) => x.d - y.d);
    info.push('closest pairs ' + pairs.slice(0, 3).map((x) => x.a + '/' + x.b + ' ' + x.d.toFixed(1)).join(', '));
    // ---- nobody passes for the player
    let nearPlayer = { d: 1e9 };
    for (const n of npcs) {
      const r = distance(n.look, hero.look);
      if (r.d < nearPlayer.d) nearPlayer = { d: r.d, id: n.id };
      if (r.d < MIN_PLAYER) fail(n.id + ' could pass for the player (look distance ' + r.d.toFixed(1) + ' < ' + MIN_PLAYER + '; they differ in: ' + (r.why || 'nothing') + ')');
      // the ranger outfit is the player's in green: anyone else in ranger pieces has them dyed clearly away from it
      const pieces = CORE.filter((p) => p !== 'feet' && isRanger(n.look.parts[p]));
      if (n.look.addons.includes('hood')) pieces.push('hood');
      for (const p of pieces) {
        const c = cloth(n.look, p);
        if (dE(c, NATIVE.green) < 30) fail(n.id + ' wears the ranger ' + p + ' in the player\\'s green (0x' + c.toString(16).padStart(6, '0') + ')');
      }
      const hoodGreen = n.look.addons.includes('hood') && cloth(n.look, 'hood') === NATIVE.green;
      if (hoodGreen) fail(n.id + ' wears the player\\'s green hood');
    }
    info.push('nearest to the player ' + nearPlayer.id + ' at ' + nearPlayer.d.toFixed(1));
    // ---- hair and skin: villagers do not all share the silver of the hair files
    const silver = npcs.filter((n) => n.look.hair && n.look.hairColor === null).map((n) => n.id);
    if (silver.length) fail('hair left in the files\\' silver-grey (give it a hairColor): ' + silver.join(', '));
    const table = npcs.map((n) => n.id + ': ' + CORE.map((p) => n.look.parts[p].replace(/^(fe)?male_/, '')[0] + (n.look.dye[p] !== undefined ? hexOf(n.look.dye[p]).toString(16).padStart(6, '0') : '-')).join(' ') + ' | ' + (n.look.hair || 'bald').replace('hair_', '') + '/' + (n.look.hairColor === null ? 'silver' : n.look.hairColor.toString(16)) + (n.look.beard ? ' +beard' : '') + (n.look.gear.length ? ' gear:' + n.look.gear.map((x) => x.kind).join(',') : ''));
    return { people: npcs.length, fails: fails.length, info: info.join('; '), verdict: fails.length ? fails.join('\\n') : 'looks ok', table };
  })()"""},
  # --- the lineup
  {'eval': """(async () => {
    const g = __game, T = window.__THREE;
    const X0 = -8, Z0 = 80, GAP = 0.9;
    const people = [{ name: 'Player', char: g.hero }];
    for (const n of g.npcs) {
      const c = await g.factory.create(n.def.look);
      g.scene.add(c.root);
      c.play('Idle_Loop', { fade: 0 });
      c.mixer.update(0.7);
      people.push({ name: n.def.name, char: c });
    }
    people.forEach((p, i) => {
      const x = X0 + (i - (people.length - 1) / 2) * GAP;
      p.char.root.position.set(x, g.world.groundAt(x, Z0, 1e4), Z0);
      p.char.root.rotation.y = 0;
      p.char.root.visible = true;
      p.x = x;
    });
    for (const el of document.body.children) if (el.id !== 'app') el.style.display = 'none';
    const gy = g.world.groundAt(X0, Z0, 1e4);
    g.camera.fov = 30;
    g.camera.aspect = innerWidth / innerHeight;
    g.camera.updateProjectionMatrix();
    g.camera.position.set(X0, gy + 1.5, Z0 + 11);
    g.camera.lookAt(X0, gy + 1.2, Z0);
    g.camera.updateMatrixWorld(true);
    g.draw(1 / 60);
    const v = new T.Vector3();
    for (const p of people) {
      v.set(p.x, g.world.groundAt(p.x, Z0, 1e4), Z0).project(g.camera);
      const d = document.createElement('div');
      d.textContent = p.name;
      d.style.cssText = `position:fixed;left:${(v.x * 0.5 + 0.5) * innerWidth}px;top:${(-v.y * 0.5 + 0.5) * innerHeight + 6}px;transform:translateX(-50%);z-index:9999;font:600 13px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:3px;white-space:nowrap`;
      document.body.appendChild(d);
    }
    return 'lineup of ' + people.length;
  })()""", 'wait': 300, 'shot': 'npc_lineup'},
]
