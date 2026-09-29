# ci
# The sword guard: holding the right button raises a guard that stays alive (a breathing loop,
# not a frozen frame), a blow landing on it jolts it back and it settles again, a parry keeps it
# steady, and letting go drops it. A line starting "FAIL" means a check missed.
STEPS = [
  {'eval': """(() => {
    const g = __game, P = g.player, F = g.fight, I = g.input, keys = I.keys, ch = g.hero;
    const out = [], fails = [];
    const check = (name, ok, info) => { out.push(name + ': ' + info); if (!ok) fails.push('FAIL ' + name + ' ' + info); };
    const clip = () => ch.current && ch.current.getClip().name;
    const reset = () => { keys.clear(); I.buttons.clear(); g.sim(0.4); P.spawn(0, 0, 0); g.rig.yaw = Math.PI; F.lock = null; g.sim(0.4); F.stamina = 100; g.state.hp = g.state.maxHp; };
    const handY = () => { ch.root.updateMatrixWorld(true); return ch.bones.hand_r.getWorldPosition(new __THREE.Vector3()).y - P.pos.y; };

    // 1. Raise the guard: the guard loop plays and keeps moving (breathing), sword hand up.
    reset();
    I.buttons.add(2); g.sim(0.3);
    const y0 = handY(), c0 = clip();
    const spine = () => ch.bones.spine_02.quaternion.clone();
    const s0 = spine(); g.sim(1.0); const s1 = spine();
    check('guard up', P.state === 'block' && c0 === 'Sword_Guard_Loop', P.state + ', ' + c0);
    check('guard hand at chest height', y0 > 0.95 && y0 < 1.45, 'sword hand ' + y0.toFixed(2) + ' m up');
    check('guard is alive, not frozen', s0.angleTo(s1) > 0.002 && !ch.current.paused, 'chest moved ' + (s0.angleTo(s1) * 57.3).toFixed(2) + ' deg in a second');

    // 2. A blow on the guard jolts it and it settles back into the loop.
    P.blockHit(); g.sim(1 / 60);
    const c1 = clip();
    g.sim(0.2); const mid = clip();
    g.sim(0.5); const c2 = clip();
    check('blow jolts the guard', c1 === 'Sword_Guard_Hit' && mid === 'Sword_Guard_Hit', c1 + ' then ' + mid);
    check('guard settles again', c2 === 'Sword_Guard_Loop' && P.state === 'block', c2 + ', ' + P.state);

    // 3. The same through a real goblin swing: held early it blocks (jolt), raised just in time
    //    it parries (no jolt, the goblin reels).
    const e = F.enemies.find((x) => x.def.name === 'Goblin' && x.alive);
    const swingAt = (early) => {
      reset();
      e.pos.set(0, g.activeWorld.groundAt(0, -1.3, 1e4), -1.3); e.yaw = 0; e.setState('idle');
      P.yaw = Math.PI;
      const a = { ...e.def.attacks[0] };
      if (early) { I.buttons.add(2); g.sim(0.4); }
      e.attack = a; e.struck = false; e.engaged = true;
      e.setState('attack');
      e.action = e.char.play(a.clip, { loop: false, restart: true, fade: 0.02 });
      let jolted = false, n = 0;
      while (!e.struck && n++ < 120) {
        if (!early && e.action.time >= a.hit - 0.1 && !I.buttons.has(2)) I.buttons.add(2);
        g.sim(1 / 60);
        P.yaw = Math.PI;
        if (clip() === 'Sword_Guard_Hit') jolted = true;
      }
      g.sim(2 / 60);
      if (clip() === 'Sword_Guard_Hit') jolted = true;
      const r = { struck: e.struck, state: P.state, jolted, foe: e.state, hp: g.state.hp };
      I.buttons.clear(); e.setState('idle'); e.engaged = false; e.pos.set(400, 0, 400);
      return r;
    };
    const blocked = swingAt(true);
    check('a goblin blow on the guard jolts it', blocked.struck && blocked.state === 'block' && blocked.jolted, JSON.stringify(blocked));
    const parried = swingAt(false);
    check('a parry keeps the guard steady', parried.struck && parried.state === 'block' && !parried.jolted && parried.foe === 'parried', JSON.stringify(parried));

    // 4. Letting go drops the guard back to idle.
    reset();
    I.buttons.add(2); g.sim(0.4); I.buttons.clear(); g.sim(0.6);
    check('guard drops', P.state === 'move' && clip() === 'Idle_Loop', P.state + ', ' + clip());
    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},
]
