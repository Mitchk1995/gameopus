# ci
# Fluid combat: keep moving while swinging, jump, and cut a swing short with a dodge or a
# jump. Prints a summary per check; a line starting "FAIL" means a check missed.
STEPS = [
  {'eval': """(() => {
    const g = __game, P = g.player, keys = g.input.keys, I = g.input;
    P.spawn(0, 0, 0);
    g.rig.yaw = 0;
    g.fight.stamina = 100;
    const out = [], fails = [];
    const check = (name, ok, info) => { out.push(name + ': ' + info); if (!ok) fails.push('FAIL ' + name + ' ' + info); };
    const speed = () => Math.hypot(P.vel.x, P.vel.z);
    const swing = () => { I.clicked.add(0); g.sim(1 / 60); };
    const reset = () => { keys.clear(); g.sim(0.6); P.spawn(0, 0, 0); g.sim(0.2); g.fight.stamina = 100; };
    g.sim(0.4);

    // 1. Swing while jogging: you keep moving and the swing plays over your legs.
    keys.add('KeyW'); g.sim(0.4);
    const x0 = P.pos.z;
    swing(); g.sim(0.1);
    const blend = P.swingW;
    check('swing on the move', P.state === 'attack' && P.swingMode === 'layered' && speed() > 2.5 && speed() < 4, P.state + ' ' + P.swingMode + ' ' + speed().toFixed(1) + ' m/s, legs ' + P.gait);
    check('swing shows on the upper body', blend > 0.5, 'blend ' + blend.toFixed(2));
    g.sim(1);
    check('back to jog after the swing', P.state === 'move' && speed() > 4.5, P.state + ' ' + speed().toFixed(1) + ' m/s');
    reset();

    // 2. Standing swing still uses the whole body; walking off mid-swing hands the legs over.
    swing(); g.sim(0.05);
    check('standing swing', P.state === 'attack' && P.swingMode === 'full', P.swingMode);
    keys.add('KeyW'); g.sim(0.15);
    check('walk off mid-swing', P.state === 'attack' && P.swingMode === 'layered' && speed() > 1.5, P.swingMode + ' ' + speed().toFixed(1) + ' m/s');
    reset();

    // 3. Jump: leaves the ground, rises about a metre, comes back down.
    const ground = P.pos.y;
    I.pressed.add('Space'); g.sim(1 / 60);
    let peak = 0, t = 0; while (t < 1.2 && (!P.grounded || t < 0.05)) { g.sim(1 / 60); t += 1 / 60; peak = Math.max(peak, P.pos.y - ground); }
    check('jump', peak > 0.7 && peak < 1.5 && P.grounded, 'peak ' + peak.toFixed(2) + ' m, back down after ' + t.toFixed(2) + ' s');
    reset();

    // 4. Jump while running keeps your speed; jump in the middle of a swing keeps the swing.
    keys.add('KeyW'); keys.add('ShiftLeft'); g.sim(0.6);
    I.pressed.add('Space'); g.sim(0.15);
    check('jump keeps speed', !P.grounded && speed() > 6.5 && P.gait.startsWith('Jump'), speed().toFixed(1) + ' m/s, ' + P.gait);
    reset();
    swing(); g.sim(0.08); I.pressed.add('Space'); g.sim(0.1);
    check('jump mid-swing', P.state === 'attack' && !P.grounded, P.state + ' grounded=' + P.grounded);
    reset();

    // 5. Dodge (a quick tap of Shift) cuts a swing off right away, and costs stamina.
    swing(); g.sim(0.05);
    const st = g.fight.stamina;
    I.tapped.add('ShiftLeft'); g.sim(1 / 60);
    check('dodge out of a swing', P.state === 'roll' && g.fight.stamina < st, P.state + ' stamina ' + st.toFixed(0) + '->' + g.fight.stamina.toFixed(0));
    g.sim(1);
    check('roll ends', P.state === 'move', P.state);
    reset();

    // 6. Holding Shift is a run, not a dodge.
    keys.add('KeyW'); keys.add('ShiftLeft'); g.sim(0.5);
    check('hold shift = run', P.state === 'move' && P.gait === 'Sprint_Loop', P.state + ' ' + P.gait);

    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},
]
