# ci
# Real combat entry points: walls/heights block hits; interrupted dodge protection
# cannot survive a new action or spawn; death cannot be cancelled by another pose.
STEPS = [
  {'eval': """(() => {
    const g = __game, P = g.player, F = g.fight, I = g.input, w = g.world;
    const out = [], fails = [];
    const check = (name, ok, detail = '') => { out.push(name + ': ' + (ok ? 'PASS' : 'FAIL') + ' ' + detail); if (!ok) fails.push('FAIL ' + name); };
    // A synthetic flat arena keeps this about combat, independent of town layout.
    w.colliders = new w.colliders.constructor();
    w.terrain.heightAt = () => 0;
    w.waterDepth = () => -10;
    w.lineOfSight = (a, b, pad = 0, full3D = false, tight = pad) => full3D
      ? w.colliders.sweep(a.x, a.y, a.z, b.x-a.x, b.y-a.y, b.z-a.z, pad, tight)
      : w.colliders.raycast(a.x, a.y, a.z, b.x-a.x, b.y-a.y, b.z-a.z, pad);
    const e = F.enemies.find(e => e.def.name === 'Goblin');
    F.enemies = [e];
    const update = e.update.bind(e), takeHit = e.takeHit.bind(e);
    e.update = () => {};
    e.takeHit = (...args) => { e.hitCount++; return takeHit(...args); };
    const reset = (height = 0) => {
      I.keys.clear(); I.buttons.clear(); I.pressed.clear(); I.clicked.clear(); I.tapped.clear();
      P.spawn(0, 0, 0); P.pos.y = height;
      e.pos.set(0, 0, 1.8); e.yaw = Math.PI; e.hp = 1000; e.hitCount = 0; e.setState('idle');
      F.lock = e; F.combo = 0; F.queued = null; F.stamina = 100; F.staminaWait = 0;
      g.state.hp = g.state.maxHp; g.fx = null;
      g.rig.yaw = Math.PI; g.rig.pitch = -0.2; g.rig.snap();
    };
    const swing = () => {
      I.clicked.add(0); g.tick(1 / 60);
      for (let k = 0; k < 60 && !P.hitDone; k++) g.tick(1 / 60);
      return e.hitCount;
    };
    reset(); check('unobstructed player attack connects', swing() > 0);
    const wall = w.colliders.addBox(0, 0.9, 3, 0.08, 0, 0, 4);
    reset(); check('wall blocks player attack', swing() === 0);
    w.colliders.remove(wall);
    reset(); e.pos.y = 8; check('player cannot attack a remote upper floor', swing() === 0);
    reset(); e.pos.set(0, 2, 0.8);
    const floor = w.colliders.addBox(0, 0, 3, 3, 0, 1.8, 2); floor.cameraOnly = true;
    check('upper floor blocks upward player attack', swing() === 0);
    w.colliders.remove(floor);
    reset(); check('removing barrier restores player attack', swing() > 0);

    const enemySwing = ({ height = 0, block = false, aoe = false } = {}) => {
      reset(); e.pos.y = height;
      const blocker = block ? w.colliders.addBox(0, 0.9, 3, 0.08, 0, -1, 12) : null;
      const a = { ...e.def.attacks[0], ...(aoe ? { aoe: 3.4 } : {}) };
      e.attack = a; e.struck = false; e.engaged = true; e.setState('attack');
      e.action = e.char.play(a.clip, { loop: false, restart: true }); e.action.time = a.hit + 0.01;
      e.update = update;
      const hp = g.state.hp, random = Math.random;
      try { Math.random = () => 0; F.update(1 / 60); } finally { Math.random = random; e.update = () => {}; }
      if (blocker) w.colliders.remove(blocker);
      return hp - g.state.hp;
    };
    check('unobstructed enemy attack connects', enemySwing() > 0);
    check('wall blocks enemy attack', enemySwing({ block: true }) === 0);
    check('enemy cannot attack from a remote upper floor', enemySwing({ height: 8 }) === 0);
    check('unobstructed slam connects', enemySwing({ aoe: true }) > 0);
    check('wall blocks enemy slam', enemySwing({ block: true, aoe: true }) === 0);

    reset(); e.pos.set(300, 0, 300); F.lock = null;
    const roll = () => { P.spawn(0, 0, 0); I.tapped.add('ShiftLeft'); g.sim(0.08); check('dodge enters protected frames', P.state === 'roll' && P.invulnerable); };
    roll(); P.perform('Idle_Loop', { loop: true }); g.sim(1);
    check('interaction clears dodge protection', P.state === 'act' && !P.invulnerable);
    P.stopAction(); roll(); P.spawn(0, 0, 0); g.sim(0.02);
    check('spawn clears dodge protection and movement', P.state === 'move' && !P.invulnerable && P.grounded && P.vy === 0);
    P.die(); P.perform('Idle_Loop', { loop: true }); P.startBlock(); P.startAttack({}, null);
    check('actions cannot cancel death', P.state === 'dead');
    P.spawn(0, 0, 0);
    return out.concat(fails).join(' | ');
  })()"""},
]
