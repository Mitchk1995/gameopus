STEPS = [
  {'eval': """(() => { const g = __game, st = g.state; st.inv.add('oak_longbow', 1); st.inv.add('bronze_arrow', 50);
     st.skills.xp.ranged = 40000;
     g.equip(st.inv.slots.findIndex(s => s && s.id === 'oak_longbow')); g.equip(st.inv.slots.findIndex(s => s && s.id === 'bronze_arrow'));
     g.player.spawn(-8, 30, Math.PI); g.rig.yaw = 0; g.rig.pitch = -0.05; g.rig.snap(); g.run(0.3);
     return { weapon: st.equip.weapon, ammo: [st.equip.ammo, st.ammo], style: g.ranged.style, bow: !!g.aim.bow }; })()"""},
  {'shot': 'bow_idle'},
  {'eval': """(() => { const g = __game; g.input.clicked.add(0); g.input.buttons.add(0); for (let i = 0; i < 60; i++) { g.input.buttons.add(0); g.sim(1/60); } g.input.buttons.add(0); g.run(1/60); 
     return { drawing: g.ranged.drawing, draw: g.ranged.draw.toFixed(2), w: g.aim.weight.toFixed(2), yaw: g.player.yaw.toFixed(2) }; })()"""},
  {'shot': 'bow_draw_back'},
  {'eval': """(() => { const g = __game; const P = g.player.pos, c = g.camera, yaw = g.player.yaw;
     c.position.set(P.x + Math.cos(yaw) * -3.0 + Math.sin(yaw) * 1.2, P.y + 1.5, P.z - Math.sin(yaw) * -3.0 + Math.cos(yaw) * 1.2); c.lookAt(P.x, P.y + 1.3, P.z); g.draw(0); return 1; })()"""},
  {'shot': 'bow_draw_side'},
  {'eval': """(() => { const g = __game; const P = g.player.pos, c = g.camera, yaw = g.player.yaw;
     c.position.set(P.x + Math.sin(yaw) * 3.2, P.y + 1.5, P.z + Math.cos(yaw) * 3.2); c.lookAt(P.x, P.y + 1.3, P.z); g.draw(0); return 1; })()"""},
  {'shot': 'bow_draw_front'},
  {'eval': """(() => { const g = __game; g.input.buttons.delete(0); g.run(1/60); const shots = g.ranged.shots.length; g.run(0.3);
     return { shots, ammo: g.state.ammo, stuck: g.ranged.stuck.length, flying: g.ranged.shots.length }; })()"""},
  {'shot': 'bow_loosed'},
]
