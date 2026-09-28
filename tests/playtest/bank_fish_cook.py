STEPS = [
  {'eval': """(() => { const g = __game; const b = g.resources.items.find(o => o.station === 'bank'); const p = g.world.village.places.bank;
     const dx = Math.sin(p.rot), dz = Math.cos(p.rot); g.player.spawn(b.x + dx*2.2, b.z + dz*2.2, p.rot + Math.PI); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.12; g.rig.dist = 3.2; g.run(0.3); return g.target && (g.target.station || g.target.kind); })()"""},
  {'shot': 'g0'},
  {'eval': """(() => { const g = __game; const s = g.resources.spots.find(s => s.method === 'net'); const T = g.world.terrain;
     let best = null; for (let a = 0; a < 6.28; a += 0.2) for (let d = 2; d < 5; d += 0.5) { const x = s.x + Math.cos(a)*d, z = s.z + Math.sin(a)*d; if (T.heightAt(x,z) > 0.15 && !best) best = [x,z]; }
     g.player.spawn(best[0], best[1], Math.atan2(s.x - best[0], s.z - best[1])); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.45; g.run(0.3); return [g.target && g.target.kind, best]; })()"""},
  {'press': 'KeyE'},
  {'eval': "__game.run(1.0); [__game.player.state, __game.player.char.current.getClip().name]"},
  {'shot': 'g1'},
  {'eval': "__game.run(30); [__game.state.inv.count('raw_shrimp'), __game.state.skills.xp.fishing]"},
  {'eval': """(() => { const g = __game; g.state.inv.add('raw_shrimp', 3); const f = g.resources.items.find(o => o.station === 'fire');
     g.player.spawn(f.x + 1.8, f.z + 0.4, Math.atan2(-1.8, -0.4)); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.25; g.run(0.3); return g.target && g.target.station; })()"""},
  {'press': 'KeyE'},
  {'eval': "__game.run(0.2); __game.menus.kind"},
  {'press': 'Space'},
  {'eval': "__game.run(1.5); [__game.player.char.current.getClip().name]"},
  {'shot': 'g2'},
  {'eval': "__game.run(10); [__game.state.inv.count('shrimp'), __game.state.inv.count('burnt_fish'), __game.state.skills.xp.cooking]"},
  {'eval': "(() => { const g = __game; const n = g.npcs.find(n => n.name === 'Maren'); g.player.spawn(n.pos.x + Math.sin(g.world.village.places.store.rot)*2.6, n.pos.z + Math.cos(g.world.village.places.store.rot)*2.6, g.world.village.places.store.rot + Math.PI); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.1; g.run(0.4); return g.target && g.target.kind; })()"},
  {'press': 'KeyE'},
  {'eval': "__game.run(0.6); __game.talk.isOpen"},
  {'shot': 'g3'},
  {'eval': "JSON.stringify(__game.renderer.info.render)"},
]
