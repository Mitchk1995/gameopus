STEPS = [
  {'eval': """(() => { const g = __game, st = g.state; st.inv.add('oak_longbow', 1); st.inv.add('iron_arrow', 60);
     st.skills.xp.ranged = 40000; st.skills.xp.magic = 3000; st.skills.xp.hitpoints = 40000; st.hp = st.maxHp;
     g.equip(st.inv.slots.findIndex(s => s && s.id === 'oak_longbow')); g.equip(st.inv.slots.findIndex(s => s && s.id === 'iron_arrow'));
     const gob = g.fight.enemies.find(e => e.def.name === 'Goblin' && e.alive);
     window.__gob = gob;
     g.player.spawn(gob.pos.x + 14, gob.pos.z, 0); g.player.faceTowards(gob.pos.x, gob.pos.z); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.08; g.rig.snap();
     g.fight.lock = gob; g.sim(0.3);
     window.__shoot = () => { g.input.clicked.add(0); for (let i = 0; i < 55; i++) { g.input.buttons.add(0); g.sim(1 / 60); } g.input.buttons.delete(0); g.sim(1 / 60); };
     window.__shoot(); g.sim(0.05); g.run(0.02);
     return { hp: gob.hp + '/' + gob.def.hp, flying: g.ranged.shots.length, ammo: st.ammo }; })()"""},
  {'shot': 'range_flight'},
  {'eval': """(() => { const g = __game, gob = window.__gob; g.sim(0.5); const out = { hp: gob.hp, engaged: gob.engaged, state: gob.state, xp: g.state.skills.xp.ranged.toFixed(0), stuckOnGob: gob.char.root.children.filter(c => c.type === 'Group' && c.children.length >= 4).length };
     for (let k = 0; k < 5 && gob.alive; k++) { g.fight.lock = gob; window.__shoot(); g.sim(0.4); }
     out.after = { hp: gob.hp, alive: gob.alive, dist: gob.pos.distanceTo(g.player.pos).toFixed(1), ammo: g.state.ammo, xp: g.state.skills.xp.ranged.toFixed(0), arrowsOnGround: g.fight.ground.filter(it => !it.gone && /_arrow$/.test(it.id)).map(it => it.n) };
     g.run(0.02); return out; })()"""},
  {'shot': 'range_after'},
]
