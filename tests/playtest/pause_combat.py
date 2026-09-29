# ci paths=src/main.js,src/actors/,src/game/fight.js,tests/playtest/pause_combat.py
# Use the normal game (not #test, which bypasses pause), then manually advance its
# real frame function. A pause must freeze the swing/roll pose and its gameplay clock.
HASH = ''
STEPS = [
  {'eval': """(() => {
    const g = __game, P = g.player, I = g.input, F = g.fight;
    g.renderer.setAnimationLoop(null);
    const out = [], fails = [];
    const check = (name, ok, detail = '') => { out.push(name + ': ' + detail); if (!ok) fails.push('FAIL ' + name); };
    const pause = (label) => {
      const stateTime = P.stateTime, animTime = g.hero.current.time, fightTime = F.time;
      g.slow(0.2, 0.4); I.locked = false;
      for (let k = 0; k < 120; k++) g.tick(1 / 60);
      check(label + ' freezes body and combat', P.stateTime === stateTime && g.hero.current.time === animTime && F.time === fightTime,
        JSON.stringify({ stateDelta: P.stateTime - stateTime, animationDelta: g.hero.current.time - animTime, combatDelta: F.time - fightTime }));
      check(label + ' preserves hit-stop', g.fx?.left === 0.4, String(g.fx?.left));
      I.locked = true; g.tick(1 / 60);
      check(label + ' resumes', P.stateTime > stateTime && g.hero.current.time > animTime, P.state);
      g.fx = null;
    };
    P.spawn(0, 0, 0); I.locked = true; F.stamina = 100;
    I.clicked.add(0); g.tick(1 / 60); g.tick(1 / 60); pause('swing');
    P.spawn(0, 0, 0); I.tapped.add('ShiftLeft'); g.tick(1 / 60); g.tick(1 / 60); pause('dodge');
    P.spawn(0, 0, 0);
    return out.concat(fails).join(' | ');
  })()"""},
]
