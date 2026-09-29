# ci
# Melee swings: they start moving at once, sweep through the crosshair (standing, on the
# move and in the air), hit what is under the crosshair, chain A -> B -> C from side to
# side, and leave the body and the combo counter clean afterwards (chain end, block, dodge,
# jump, being hurt). A line starting "FAIL" means a check missed.
# The scenario also takes screenshots of a jump-swing into out/jump_swing_*.png.
PRE = """
  const g = __game, P = g.player, T = __THREE, keys = g.input.keys, I = g.input, ch = g.hero, F = g.fight;
  const out = [], fails = [];
  const check = (name, ok, info) => { out.push(name + ': ' + info); if (!ok) fails.push('FAIL ' + name + ' ' + info); };
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const hand = g.handBone;
  const lefthand = ch.bones.hand_l;
  const wpos = (o) => { ch.root.updateMatrixWorld(true); return o.getWorldPosition(V(0, 0, 0)); };
  // The sword's tip: the model vertex farthest from the grip, kept in the model's own space.
  let tipLocal = null;
  const calib = () => {
    const held = g.held.children[0];
    tipLocal = null;
    if (!held) return;
    ch.root.updateMatrixWorld(true);
    const hp = wpos(hand); let best = 0;
    held.traverse((o) => { if (!o.isMesh) return; const a = o.geometry.attributes.position, v = V(0, 0, 0); for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); const d = v.distanceTo(hp); if (d > best) { best = d; tipLocal = held.worldToLocal(v.clone()); } } });
  };
  calib();
  // The blade: from the grip to the tip (armed), or the forearm's end (bare hands).
  const blade = () => {
    ch.root.updateMatrixWorld(true);
    const a = wpos(hand);
    if (tipLocal) return [a, g.held.children[0].localToWorld(tipLocal.clone())];
    return [a, a.clone()];
  };
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = ab.lengthSq() < 1e-9 ? 0 : Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  const local = (p) => ch.root.worldToLocal(p.clone());
  const reset = (o = {}) => {
    keys.clear(); I.buttons.clear(); g.sim(0.6);
    P.spawn(0, 0, 0); g.rig.yaw = Math.PI; g.rig.pitch = o.pitch ?? -0.22; F.lock = null; F.combo = 0; F.queued = null; g.sim(0.5);
    F.stamina = 100; g.state.hp = g.state.maxHp;
  };
  const press = (kind) => { if (kind === 'heavy') I.pressed.add('KeyF'); else I.clicked.add(0); };
  const MOVES = { A: ['light', 0], B: ['light', 1], C: ['light', 2], heavy: ['heavy', 0] };
  // The point on the crosshair ray where a blade reaching `R` metres from the shoulder
  // crosses it (the ray's closest point if it never gets that near).
  const rayPoint = (R) => {
    const cam = g.camera.position, f = g.rig.forward(V(0, 0, 0)), sh = wpos(ch.bones.upperarm_r);
    const w = sh.clone().sub(cam), a0 = w.dot(f), perp2 = w.lengthSq() - a0 * a0;
    return cam.clone().addScaledVector(f, a0 + Math.sqrt(Math.max(0, R * R - perp2)));
  };
"""

STEPS = [
  # 1. How soon a swing starts moving, and how soon it lands.
  {'eval': "(() => {" + PRE + """
    const armedTrace = (armed, kind, idx, moving, click) => {
      reset();
      if (moving) { keys.add('KeyW'); g.sim(0.5); }
      F.combo = idx;
      const frames = []; let hitAt = null, endAt = null;
      for (let k = 1; k <= 40; k++) {
        if (k === 1 && click) press(kind);
        g.sim(1 / 60);
        const [a, b] = blade();
        frames.push({ tip: local(armed ? b : wpos(hand)), off: local(wpos(lefthand)), grip: local(a) });
        if (hitAt === null && P.state === 'attack' && P.hitDone) hitAt = k / 60;
        if (endAt === null && click && P.state !== 'attack') endAt = k / 60;
      }
      keys.clear();
      return { frames, hitAt, endAt, clip: P.move && P.move.clip };
    };
    const latency = (armed, kind, idx, moving) => {
      const c = armedTrace(armed, kind, idx, moving, false), t = armedTrace(armed, kind, idx, moving, true);
      let first = null;
      for (let k = 0; k < t.frames.length && first === null; k++) {
        // Any hand: the sword tip or the grip hand; bare-handed, either fist.
        const d = Math.max(t.frames[k].tip.distanceTo(c.frames[k].tip), t.frames[k].grip.distanceTo(c.frames[k].grip), armed ? 0 : t.frames[k].off.distanceTo(c.frames[k].off));
        if (d > 0.12) first = (k + 1) / 60;
      }
      // The longest stretch before the hit in which the blade hardly moves (dead lead-in).
      let stall = 0, run = 0;
      const last = Math.round((t.hitAt ?? 0.3) * 60);
      for (let k = 1; k < last; k++) {
        const v = Math.max(t.frames[k].tip.distanceTo(t.frames[k - 1].tip), armed ? 0 : t.frames[k].off.distanceTo(t.frames[k - 1].off)) * 60;
        if (v < 0.6) { run++; stall = Math.max(stall, run); } else run = 0;
      }
      return { first, hit: t.hitAt, stall: stall / 60, clip: t.clip };
    };
    const fmt = (r) => 'moves at ' + (r.first === null ? 'never' : (r.first * 1000).toFixed(0) + ' ms') + ', lands at ' + (r.hit === null ? 'never' : (r.hit * 1000).toFixed(0) + ' ms') + ', longest stall ' + (r.stall * 1000).toFixed(0) + ' ms';
    for (const [name, [kind, idx]] of Object.entries(MOVES)) {
      for (const moving of [false, true]) {
        const r = latency(true, kind, idx, moving);
        const label = name + (moving ? ' moving' : ' standing');
        const limit = kind === 'heavy' ? 0.06 : 0.05;
        check('swing starts: ' + label, r.first !== null && r.first <= limit + 1e-6, fmt(r) + ' (' + r.clip + ')');
        check('swing lands: ' + label, r.hit !== null && r.hit <= (kind === 'heavy' ? 0.5 : name === 'C' ? 0.27 : 0.24), fmt(r));
        check('no dead lead-in: ' + label, r.stall <= (kind === 'heavy' ? 0.1 : 0.05) + 1e-6, 'stall ' + (r.stall * 1000).toFixed(0) + ' ms');
      }
    }
    // Bare hands (the punch clips used to idle for a tenth of a second first).
    const sword = g.state.inv.slots.findIndex((s) => s && s.id === 'bronze_sword');
    g.unequip('weapon'); calib();
    for (const [name, kind] of [['jab', 'light'], ['cross', 'heavy']]) {
      for (const moving of [false, true]) {
        const r = latency(false, kind, 0, moving);
        const label = name + (moving ? ' moving' : ' standing');
        check('punch starts: ' + label, r.first !== null && r.first <= 0.05 + 1e-6, fmt(r) + ' (' + r.clip + ')');
        check('punch lands: ' + label, r.hit !== null && r.hit <= 0.2, fmt(r));
      }
    }
    g.equip(g.state.inv.slots.findIndex((s) => s && s.id === 'bronze_sword')); calib();
    check('sword back in hand', g.state.equip.weapon === 'bronze_sword' && !!tipLocal, String(g.state.equip.weapon));
    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},

  # 2. The blade sweeps through the crosshair: standing, moving, jumping, at different pitches.
  {'eval': "(() => {" + PRE + """
    const trial = (name, o) => {
      const [kind, idx] = MOVES[name];
      reset({ pitch: o.pitch });
      if (o.moving) { keys.add('KeyW'); g.sim(0.5); }
      if (o.air) { I.pressed.add('Space'); g.sim(0.1); }
      F.combo = idx;
      const airborne = !P.grounded;
      press(kind);
      const frames = []; let hitT = null, hitAim = null, t = 0, started = false;
      const step = 1 / 240;
      for (let k = 0; k < 240 * 1.2; k++) {
        g.tick(step); t += step;
        if (P.state === 'attack') started = true;
        if (started && P.state !== 'attack') break;
        if (P.state === 'attack' && P.hitDone && hitT === null) { hitT = t; hitAim = rayPoint(P.move.aimReach); }
        const [a, x] = blade();
        frames.push({ t, a, b: x, head: wpos(ch.bones.Head).y });
      }
      // Closest the blade comes to the crosshair point around the moment of the hit.
      let min = Infinity, minT = null, peak = -9;
      if (hitT !== null) for (const f of frames) {
        if (Math.abs(f.t - hitT) > 0.08) continue;
        const d = segDist(hitAim, f.a, f.b);
        if (d < min) { min = d; minT = f.t; }
        if (Math.abs(f.t - hitT) < 0.003) peak = f.b.y - f.head;
      }
      return { min, minT, hitT, airborne, peak };
    };
    for (const name of ['A', 'B', 'C', 'heavy']) {
      for (const [label, o] of [['standing', {}], ['moving', { moving: true }], ['jumping', { air: true }], ['jumping and moving', { air: true, moving: true }], ['looking down', { pitch: -0.5 }], ['looking up', { pitch: 0.25 }], ['jumping, looking down', { air: true, pitch: -0.5 }]]) {
        const r = trial(name, o);
        check('blade through crosshair: ' + name + ' ' + label, r.min < 0.35 && (!o.air || r.airborne), 'closest ' + r.min.toFixed(2) + ' m at ' + (r.minT * 1000).toFixed(0) + ' ms (hit ' + (r.hitT * 1000).toFixed(0) + ' ms)' + (o.air ? ', airborne=' + r.airborne : '') + ', tip above head ' + r.peak.toFixed(2));
      }
    }
    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},

  # 3. The blow lands on what is under the crosshair: a foe on the ray gets hit even when it
  #    is off to one side of the player, the lock-on target wins, and swinging at nothing
  #    still goes straight along the aim.
  {'eval': "(() => {" + PRE + """
    const goblins = F.enemies.filter((e) => e.def.name === 'Goblin').slice(0, 2);
    const [E1, E2] = goblins;
    for (const e of goblins) {
      e.update = () => {};
      e.hp = 1e6; e.hits = 0;
      const orig = e.takeHit.bind(e);
      e.takeHit = (...a) => { e.hits++; return orig(...a); };
    }
    const away = () => goblins.forEach((e) => { e.pos.set(400, g.activeWorld.groundAt(400, 400, 1e4), 400); e.setState('idle'); });
    // A spot on the crosshair's ground track, d metres from the player, `side` metres to its right.
    const onRay = (e, d, side = 0) => {
      const cam = g.camera.position, f = g.rig.forward(V(0, 0, 0)), hl = Math.hypot(f.x, f.z), hx = f.x / hl, hz = f.z / hl;
      const px = P.pos.x - cam.x, pz = P.pos.z - cam.z, base = px * hx + pz * hz, lat = Math.abs(px * hz - pz * hx);
      const along = base + Math.sqrt(Math.max(0, d * d - lat * lat));
      const x = cam.x + hx * along - hz * side, z = cam.z + hz * along + hx * side;
      e.pos.set(x, g.activeWorld.groundAt(x, z, 1e4), z);
    };
    const swingAt = (name, o, setup) => {
      const [kind, idx] = MOVES[name];
      away(); reset();
      if (o.moving) { keys.add('KeyW'); g.sim(0.5); }
      if (o.air) { I.pressed.add('Space'); g.sim(0.1); }
      F.combo = idx;
      goblins.forEach((e) => { e.hits = 0; });
      setup();
      press(kind);
      g.sim(0.8);
      const r = { e1: E1.hits, e2: E2.hits, target: F.swingTarget, yaw: P.yaw };
      keys.clear(); away();
      return r;
    };
    for (const name of ['A', 'B', 'C', 'heavy']) {
      for (const [label, o] of [['standing', {}], ['moving', { moving: true }], ['jumping', { air: true }]]) {
        // The foe on the ray (a little to the side of straight ahead of the player), a decoy nearer the player's front.
        const r = swingAt(name, o, () => { onRay(E1, 1.9); onRay(E2, 1.5, -1.6); });
        check('hits what is under the crosshair: ' + name + ' ' + label, r.e1 >= 1 && r.target === E1, 'foe on the ray hit ' + r.e1 + 'x, aimed at ' + (r.target === E1 ? 'it' : r.target === E2 ? 'the decoy' : 'nothing'));
      }
    }
    // Locked on: the lock wins, wherever the crosshair is.
    for (const name of ['A', 'heavy']) {
      const r = swingAt(name, {}, () => { onRay(E1, 1.9); onRay(E2, 1.7, 1.2); F.lock = E2; });
      check('lock-on target is the one hit: ' + name, r.e2 >= 1 && r.target === E2, 'locked foe hit ' + r.e2 + 'x, aimed at ' + (r.target === E2 ? 'it' : 'something else'));
    }
    F.lock = null;
    // Nothing near the crosshair: no target, and the body faces along the crosshair.
    for (const name of ['A', 'C']) {
      const r = swingAt(name, {}, () => { onRay(E1, 6.0); });
      const face = Math.abs(Math.atan2(Math.sin(r.yaw - (g.rig.yaw + Math.PI)), Math.cos(r.yaw - (g.rig.yaw + Math.PI))));
      check('swings straight along the aim at nothing: ' + name, r.target === null && face < 0.5, 'target ' + r.target + ', body ' + (face * 57.3).toFixed(0) + ' deg off the camera heading');
    }
    away();
    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},

  # 4. The chain A -> B -> C swings side to side, cuts in at the chain window, and starts over.
  {'eval': "(() => {" + PRE + """
    const clipName = () => (P.state === 'attack' ? P.move.clip : null);
    const side = () => local(blade()[1]).x * -1;   // to the right of the body (positive) or left
    // Spam the button every 0.1 s and record each swing: when it started, which clip, where the blade is just after the hit.
    reset();
    const swings = []; let cur = null, t = 0;
    for (let k = 0; k < 60 * 2.6; k++) {
      if (k % 6 === 0) I.clicked.add(0);
      g.sim(1 / 60); t += 1 / 60;
      if (P.state === 'attack' && (!cur || cur.move !== P.move)) { cur = { move: P.move, start: t, clip: P.move.clip, hitAt: null, side: null }; swings.push(cur); }
      if (cur && P.state === 'attack' && P.hitDone && cur.hitAt === null) cur.hitAt = t;
      // Where the blade is on the way out of the blow (the last look before the next swing cuts in).
      if (cur && cur.hitAt !== null && P.state === 'attack' && P.move === cur.move) cur.side = side();
      F.stamina = 100;
    }
    const order = swings.slice(0, 7).map((s) => s.clip.replace('Sword_Regular_', '').replace('Sword_Attack', 'H')).join('');
    check('chain order', order === 'ABCABCA', order + ' (each press cuts in as soon as the last blow has landed)');
    const gaps = swings.slice(1, 7).map((s, i) => s.start - swings[i].start);
    check('chain window is short', gaps.every((d) => d < 0.42), 'gaps ' + gaps.map((d) => (d * 1000).toFixed(0)).join(', ') + ' ms');
    const sides = swings.slice(0, 6).map((s) => s.side);
    check('sides alternate', sides[0] < 0 && sides[1] > 0 && sides[2] < 0 && sides[3] < 0 && sides[4] > 0 && sides[5] < 0, 'blade side after each hit (right +): ' + sides.map((v) => v.toFixed(2)).join(', '));
    // Pressing early: a click a hair after the first swing starts still gets the second at the window.
    reset(); F.combo = 0;
    I.clicked.add(0); g.sim(1 / 60); g.sim(0.02); I.clicked.add(0);
    let tB = null, tt = 0;
    for (let k = 0; k < 60; k++) { g.sim(1 / 60); tt += 1 / 60; if (tB === null && clipName() === 'Sword_Regular_B') tB = tt; }
    check('early press queues the next swing', tB !== null && tB < 0.3, 'second swing began ' + (tB === null ? 'never' : (tB * 1000).toFixed(0) + ' ms') + ' after the first press');
    // Pressing late (after the swing is over) still carries the chain; leaving it too long starts over.
    reset(); F.combo = 0;
    I.clicked.add(0); g.sim(0.6);
    I.clicked.add(0); g.sim(1 / 60);
    check('late press carries the chain', clipName() === 'Sword_Regular_B', String(clipName()));
    reset(); F.combo = 0;
    I.clicked.add(0); g.sim(0.6); g.sim(1.4);
    I.clicked.add(0); g.sim(1 / 60);
    check('long pause starts over', clipName() === 'Sword_Regular_A', String(clipName()));
    // No pops: no bone turns more than about 40 degrees in one frame at any hand-over of the chain.
    const names = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'pelvis', 'thigh_l', 'thigh_r'];
    const snap = () => Object.fromEntries(names.map((n) => [n, ch.bones[n].quaternion.clone()]));
    reset(); F.combo = 0;
    let prev = snap(), worst = 0, where = '';
    for (let k = 0; k < 60 * 2.2; k++) {
      if (k % 6 === 0) I.clicked.add(0);
      g.sim(1 / 60); F.stamina = 100;
      const now = snap();
      for (const n of names) { const a = prev[n].angleTo(now[n]); if (a > worst) { worst = a; where = n + ' in ' + (P.state === 'attack' ? P.move.clip + ' at ' + P.swingClipT.toFixed(2) : P.state); } }
      prev = now;
    }
    check('no pops through the chain', worst < 0.7, 'largest one-frame turn ' + (worst * 57.3).toFixed(0) + ' deg (' + where + ')');
    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},

  # 5. After a swing is cut short or finished, the body, the pose and the combo are clean again.
  {'eval': "(() => {" + PRE + """
    const names = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'];
    // How far the upper body is from the plain idle pose, in degrees (the worst bone).
    const idleErr = () => {
      const clip = ch.clips.get('Idle_Loop'), t = ch.current.time % clip.duration;
      let worst = 0;
      for (const track of clip.tracks) {
        const [n, prop] = track.name.split('.');
        if (prop !== 'quaternion' || !names.includes(n)) continue;
        const r = track.createInterpolant().evaluate(t), q = new T.Quaternion(r[0], r[1], r[2], r[3]).normalize();
        worst = Math.max(worst, ch.bones[n].quaternion.angleTo(q));
      }
      return worst * 57.3;
    };
    const clipName = () => (P.state === 'attack' ? P.move.clip : null);
    // stimulus(): what interrupts the swing; runs after `at` seconds of the swing.
    const scenario = (label, opts) => {
      reset(); F.combo = opts.combo ?? 0;
      if (opts.moving) { keys.add('KeyW'); g.sim(0.5); }
      for (let i = 0; i < (opts.swings ?? 1); i++) { I.clicked.add(0); g.sim(opts.at ?? 0.1); }
      opts.stimulus?.();
      g.sim(1.0);
      keys.clear(); I.buttons.clear();
      const early = { state: P.state, combo: F.combo, queued: F.queued };
      g.sim(0.8);
      const idle = ch.current.getClip().name === 'Idle_Loop';
      const err = idleErr();
      const lean = P.leanW, blend = P.swingW, aimClear = P.aimPoint === null;
      F.stamina = 100; I.clicked.add(0); g.sim(1 / 60);
      const next = clipName();
      check('resets after ' + label, early.state === 'move' && early.combo === (opts.expect ?? 0) && early.queued === null && blend < 0.01 && lean < 0.01 && aimClear && idle && err < 4 && next === 'Sword_Regular_A',
        'state ' + early.state + ', combo ' + early.combo + ', queued ' + early.queued + ', swing layer ' + blend.toFixed(2) + ', lean ' + lean.toFixed(2) + ', idle ' + idle + ', pose off idle by ' + err.toFixed(1) + ' deg, next swing ' + next);
    };
    scenario('the full chain', { swings: 3, at: 0.7 });
    scenario('a single swing', { expect: 1 });
    scenario('a moving swing', { moving: true, expect: 1 });
    scenario('a heavy blow', { stimulus: () => { I.pressed.add('KeyF'); }, swings: 0 });
    scenario('a block', { at: 0.3, stimulus: () => { I.buttons.add(2); g.sim(0.4); I.buttons.delete(2); } });
    scenario('a dodge', { at: 0.1, stimulus: () => { I.tapped.add('ShiftLeft'); g.sim(1 / 60); } });
    scenario('a dodge mid-chain', { combo: 1, at: 0.1, stimulus: () => { I.tapped.add('ShiftLeft'); g.sim(1 / 60); } });
    scenario('a jump mid-swing', { expect: 1, at: 0.08, stimulus: () => { I.pressed.add('Space'); g.sim(1 / 60); } });
    scenario('a jump mid-swing while moving', { expect: 1, moving: true, at: 0.08, stimulus: () => { I.pressed.add('Space'); g.sim(1 / 60); } });
    scenario('being hurt', { at: 0.1, stimulus: () => { P.hurt(false, 0); } });
    scenario('a hard hit', { at: 0.1, stimulus: () => { P.hurt(true, 0.5); } });
    // A press just before a dodge or a stagger ends is not lost (the swing follows it).
    reset(); F.combo = 0;
    I.tapped.add("ShiftLeft"); g.sim(1 / 60); g.sim(0.65);
    I.clicked.add(0); g.sim(0.2);
    check('press near the end of a dodge still swings', P.state === 'attack' || F.combo > 0, 'state ' + P.state + ', combo ' + F.combo);
    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},

  # 6. Pictures of a jump-swing: wind-up, the moment of the hit, and just after. A red ball
  #    marks the crosshair point the blade should pass through (screen centre).
  {'eval': "(() => {" + PRE + """
    reset(); F.combo = 0;
    window.__mark = new T.Mesh(new T.SphereGeometry(0.07, 12, 8), new T.MeshBasicMaterial({ color: 0xff2020, depthTest: false }));
    window.__mark.renderOrder = 20;
    g.scene.add(window.__mark);
    I.pressed.add('Space'); g.sim(0.1);
    I.clicked.add(0);
    g.sim(0.09);
    window.__mark.position.copy(rayPoint(1.0));
    g.draw(1 / 60);
    return 'wind-up, airborne=' + !P.grounded;
  })()"""},
  {'shot': 'jump_swing_1_windup'},
  {'eval': "(() => {" + PRE + """
    let n = 0;
    while (!P.hitDone && n++ < 60) g.tick(1 / 60);
    window.__mark.position.copy(rayPoint(1.0));
    g.draw(1 / 60);
    return 'hit tick, airborne=' + !P.grounded;
  })()"""},
  {'shot': 'jump_swing_2_strike'},
  {'eval': "(() => {" + PRE + """
    g.sim(0.05); g.draw(1 / 60);
    return 'follow-through';
  })()"""},
  {'shot': 'jump_swing_3_after'},
]
