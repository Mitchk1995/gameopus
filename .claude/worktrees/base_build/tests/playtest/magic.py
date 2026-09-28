STEPS = [
  {'eval': """(() => { const g = __game, st = g.state; st.inv.add('staff', 1); for (const r of ['air_rune', 'mind_rune', 'fire_rune']) st.inv.add(r, 60);
     st.skills.xp.magic = 3000; st.skills.xp.hitpoints = 40000; st.hp = st.maxHp;
     g.equip(st.inv.slots.findIndex(s => s && s.id === 'staff'));
     const gob = g.fight.enemies.find(e => e.def.name === 'Goblin' && e.alive); window.__gob = gob;
     g.player.spawn(gob.pos.x + 12, gob.pos.z + 3, 0); g.player.faceTowards(gob.pos.x, gob.pos.z); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.08; g.rig.snap();
     g.fight.lock = gob; g.sim(0.3);
     g.input.clicked.add(0); for (let i = 0; i < 35; i++) { g.input.buttons.add(0); g.sim(1 / 60); } g.input.buttons.add(0); g.run(1/60);
     return { style: g.ranged.style, spell: g.ranged.spell()?.name, casts: g.ranged.casts(), charging: g.ranged.drawing, label: document.querySelector('.ammo').textContent }; })()"""},
  {'shot': 'magic_charge'},
  {'eval': """(() => { const g = __game; g.input.buttons.delete(0); g.sim(1/60); g.sim(0.12); g.run(1/60); return { flying: g.ranged.shots.length, fire: g.state.inv.count('fire_rune'), air: g.state.inv.count('air_rune') }; })()"""},
  {'shot': 'magic_flight'},
  {'eval': """(() => { const g = __game, gob = window.__gob; g.sim(0.3); const hp1 = gob.hp;
     for (let k = 0; k < 6 && gob.alive; k++) { g.fight.lock = gob; g.input.clicked.add(0); for (let i = 0; i < 30; i++) { g.input.buttons.add(0); g.sim(1 / 60); } g.input.buttons.delete(0); g.sim(0.6); }
     g.run(0.02); return { hp1, alive: gob.alive, magicXp: g.state.skills.xp.magic.toFixed(1), level: g.state.skills.level('magic'), fire: g.state.inv.count('fire_rune') }; })()"""},
  {'shot': 'magic_after'},
  {'eval': """(() => { const g = __game; g.state.inv.remove('fire_rune', g.state.inv.count('fire_rune')); g.state.inv.remove('mind_rune', g.state.inv.count('mind_rune'));
     g.input.clicked.add(0); g.sim(1/60); return { spell: g.ranged.spell(), drawing: g.ranged.drawing, msg: document.querySelector('.log').lastChild.textContent }; })()"""},
]
