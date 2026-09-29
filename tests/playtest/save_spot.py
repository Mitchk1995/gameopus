# ci
# Where you come back after a reload: the spot you saved at, unless the world has been laid out anew
# since (then the town gate, SPAWN), and never a spot inside the Old Warren's own coordinates (saving
# down there keeps the cave mouth). Reloads the page twice.
READY = """(async () => {
  for (let i = 0; i < 1200 && !window.__game?.ready; i++) await new Promise((r) => setTimeout(r, 200));
  return !!window.__game?.ready;
})()"""
STEPS = [
  # A save from an older layout, standing where the old village had a house: dropped.
  {'eval': """(() => {
    // The page saves on unload; stop it, or it would overwrite the old save before the reload reads it.
    __game.save = () => {};
    const k = 'aldermere.save.v1', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.pos = { x: 12.5, z: -3.25, yaw: 1.2 };
    localStorage.setItem(k, JSON.stringify(s));
    setTimeout(() => location.reload(), 50);
    return 'old-layout save written';
  })()"""},
  {'wait': 3000},
  {'eval': READY},
  {'eval': """(() => {
    const g = __game, p = g.player.pos;
    const d = Math.hypot(p.x - (-8), p.z - 53);
    return d < 1 ? { atGate: true } : 'FAIL an old-layout save put the player at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ' instead of the gate';
  })()"""},
  # A save from this layout, halfway up Lake Street: kept.
  {'eval': """(() => {
    const g = __game;
    g.player.spawn(-8, 40, 0.7);
    g.sim(0.2);
    g.save();
    const pos = JSON.parse(localStorage.getItem('aldermere.save.v1')).pos;
    setTimeout(() => location.reload(), 50);
    return pos;
  })()"""},
  {'wait': 3000},
  {'eval': READY},
  {'eval': """(() => {
    const p = __game.player.pos;
    return Math.hypot(p.x - (-8), p.z - 40) < 0.6 ? { backOnLakeStreet: true } : 'FAIL the saved spot on Lake Street came back as ' + p.x.toFixed(1) + ',' + p.z.toFixed(1);
  })()"""},
  # Saving in the Old Warren keeps the cave mouth, not the dungeon's own coordinates.
  {'eval': "(() => { __game.enterDungeon(); return 1; })()"},
  {'wait': 4000},
  {'eval': """(() => {
    const g = __game;
    if (g.realm !== 'dungeon') return 'FAIL never got into the Old Warren';
    g.save();
    const pos = JSON.parse(localStorage.getItem('aldermere.save.v1')).pos, e = g.resources.caveExit;
    return Math.hypot(pos.x - e.x, pos.z - e.z) < 0.1 ? { savedAtCaveMouth: true } : 'FAIL saving in the dungeon stored ' + JSON.stringify(pos);
  })()"""},
]
