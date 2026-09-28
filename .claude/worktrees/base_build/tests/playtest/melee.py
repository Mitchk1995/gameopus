# Melee against the first goblin (locked on), its loot, then walking up to the bandit camp.
STEPS = [
  {'eval': """(() => { const g = __game; const e = g.fight.enemies[0]; g.player.spawn(e.pos.x + 2.2, e.pos.z, -Math.PI/2); g.rig.yaw = Math.PI/2; g.rig.pitch = -0.25;
     g.state.hp = 99; g.state.changed('hp');
     g.fight.lock = e;
     let t = 0; while (e.alive && t < 40) { g.input.clicked.add(0); g.sim(0.2); t += 0.2; }
     return [e.state, t.toFixed(1), g.fight.ground.map(it => it.id + 'x' + it.n).join(','), JSON.stringify(g.state.collection.kills)]; })()"""},
  {'eval': "(() => { const g = __game; g.sim(0.5); g.run(0.02); return 1; })()"},
  {'shot': 'y0'},
  {'eval': """(() => { const g = __game; const it = g.fight.ground[0]; if (!it) return 'no loot'; g.player.spawn(it.x + 1.2, it.z, -Math.PI/2); g.rig.yaw = Math.PI/2; g.rig.pitch = -0.6; g.run(0.1); return g.target && g.target.kind; })()"""},
  {'shot': 'y1'},
  {'eval': "(() => { const g = __game; const b = g.fight.enemies.find(e => e.def.name === 'Bandit captain'); g.player.spawn(b.home.x + 9, b.home.z + 6, 0); g.rig.yaw = Math.atan2(9, 6); g.rig.pitch = -0.15; g.sim(1.5); g.run(0.05); return g.fight.enemies.filter(e => e.engaged).map(e => e.def.name).join(','); })()"},
  {'shot': 'y2'},
]
