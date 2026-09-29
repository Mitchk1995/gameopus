# ci
STEPS = [
  {'eval': """(() => { const g = __game; const r = g.resources.rocks.find(r => r.rock === 'copper');
     const a = 0.8, d = r.r + 1.1; g.player.spawn(r.x + Math.sin(a)*d, r.z + Math.cos(a)*d, a + Math.PI);
     g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.35; g.run(0.3); return [g.target && g.target.kind, g.target && g.target.rock]; })()"""},
  {'press': 'KeyE'},
  {'eval': "__game.run(1.0); [__game.player.state, __game.player.char.current.getClip().name]"},
  {'shot': 'f0'},
  {'eval': "__game.run(25); [__game.state.inv.count('copper_ore'), __game.state.skills.xp.mining]"},
  {'eval': """(() => { const g = __game; g.state.inv.add('tin_ore', 3); g.state.inv.add('copper_ore', 2); const f = g.resources.items.find(o => o.station === 'furnace');
     const a = f.x, b = f.z; const s = g.resources.places.smithy; const dx = Math.sin(s.rot), dz = Math.cos(s.rot);
     g.player.spawn(a + dx*2.0, b + dz*2.0, s.rot + Math.PI); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.2; g.run(0.3); return g.target && g.target.station; })()"""},
  {'press': 'KeyE'},
  {'eval': "__game.run(0.2); __game.menus.kind"},
  {'shot': 'f1'},
  {'press': 'Space'},
  {'eval': "__game.run(12); [__game.state.inv.count('bronze_bar'), __game.state.skills.xp.smithing]"},
  {'shot': 'f2'},
  {'eval': """(() => { const g = __game; const b = g.resources.items.find(o => o.station === 'bank'); const p = g.world.village.places.bank;
     const dx = Math.sin(p.rot), dz = Math.cos(p.rot); g.player.spawn(b.x + dx*1.6, b.z + dz*1.6, p.rot + Math.PI); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.15; g.run(0.3); return g.target && (g.target.station || g.target.kind); })()"""},
  {'shot': 'f3'},
  {'press': 'KeyE'},
  {'eval': "__game.run(0.2); __game.menus.kind"},
  {'shot': 'f4'},
]
