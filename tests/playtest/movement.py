# ci
# Movement feel: jog for regular movement, run (sprint) while Shift is held. Measures how
# fast speed settles on start, stop and gear change, and that the gait clip follows.
# Prints a summary line per phase; a line starting "FAIL" means a check missed.
STEPS = [
  {'eval': """(() => {
    const g = __game, P = g.player, keys = g.input.keys;
    P.spawn(0, 0, 0);
    g.rig.yaw = 0;
    const speed = () => Math.hypot(P.vel.x, P.vel.z);
    const out = [];
    const fails = [];
    const check = (name, ok, info) => { out.push(name + ': ' + info); if (!ok) fails.push('FAIL ' + name + ' ' + info); };
    // Time (s) until speed is within 5% of the goal, stepping at 60 Hz.
    const settle = (goal, max = 1) => { let t = 0; while (t < max && Math.abs(speed() - goal) > Math.max(goal * 0.05, 0.15)) { g.sim(1 / 60); t += 1 / 60; } return +t.toFixed(3); };
    const hold = (...ks) => { keys.clear(); ks.forEach(k => keys.add(k)); };

    g.sim(0.3);
    check('idle', P.gait === 'Idle_Loop' && speed() < 0.05, P.gait + ' ' + speed().toFixed(2));

    hold('KeyW');
    const tJog = settle(5.0);
    check('jog start', tJog <= 0.2, tJog + 's to 5 m/s');
    g.sim(0.3);
    check('jog gait', P.gait === 'Jog_Fwd_Loop', P.gait + ' ' + speed().toFixed(2) + ' m/s, clip rate ' + P.char.current.timeScale.toFixed(2));

    hold('KeyW', 'ShiftLeft');
    const tRun = settle(7.4);
    check('run gear change', tRun <= 0.35, tRun + 's to 7.4 m/s');
    g.sim(0.3);
    check('run gait', P.gait === 'Sprint_Loop', P.gait + ' ' + speed().toFixed(2) + ' m/s, clip rate ' + P.char.current.timeScale.toFixed(2));

    hold('KeyW');
    const tBack = settle(5.0);
    check('run to jog', P.gait === 'Jog_Fwd_Loop' && tBack <= 0.35, P.gait + ' ' + tBack + 's');

    hold();
    const tStop = settle(0, 0.5);
    g.sim(0.25);
    check('stop', tStop <= 0.15 && P.gait === 'Idle_Loop', tStop + 's to rest, ' + P.gait);

    keys.clear();
    return out.concat(fails).join(' | ');
  })()"""},
]
