STEPS = [
  {'eval': '@q_helpers.js'},
  {'eval': """(() => { const g = __game; const ids = ['air_rune', 'mind_rune', 'water_rune', 'earth_rune', 'fire_rune', 'staff', 'staff_of_air', 'shortbow', 'iron_arrow'];
     const wrap = document.createElement('div'); wrap.id = 'sheet';
     wrap.style.cssText = 'position:fixed;inset:0;z-index:99;background:#2b2620;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;padding:10px;font:13px sans-serif;color:#ddd';
     for (const id of ids) { const d = document.createElement('div'); d.style.cssText = 'width:120px;text-align:center';
       d.innerHTML = `<img src="${g.studio.icon(id)}" style="width:110px;height:110px;background:#3a342b;border-radius:6px"><div>${id}</div>`; wrap.append(d); }
     document.body.append(wrap); return ids.length; })()"""},
  {'wait': 400},
  {'shot': 'icons_magic'},
  {'eval': """(() => { const g = __game; document.getElementById('sheet').remove(); const who = __q.talk(g, 'mirelle'); const a = __q.read(); __q.click('How does magic work'); const b = __q.read(); __q.click('Show me your wares');
     const stock = [...document.querySelectorAll('.bankgrid .slot img')].map(i => i.alt); g.run(0.05); return { who, a, b: b.length, stock }; })()"""},
  {'shot': 'mage_shop'},
  {'eval': """(() => { const g = __game, st = g.state; g.closeAll(); st.inv.add('shortbow', 1); st.inv.add('bronze_arrow', 20);
     g.equip(st.inv.slots.findIndex(s => s && s.id === 'shortbow')); g.equip(st.inv.slots.findIndex(s => s && s.id === 'bronze_arrow'));
     window.__entered = false; g.enterDungeon().then(() => (window.__entered = true)); return 1; })()"""},
  {'wait': 4000},
  {'eval': """(() => { const g = __game; g.rig.pitch = -0.02; g.sim(0.3);
     g.input.clicked.add(0); for (let i = 0; i < 40; i++) { g.input.buttons.add(0); g.sim(1 / 60); } g.input.buttons.delete(0); g.sim(1/60);
     const flying = g.ranged.shots.length; g.sim(0.6); g.run(0.02);
     return { entered: window.__entered, aimInDungeon: g.aim.group.parent === g.dungeon.scene, pointsInDungeon: g.ranged.points.parent === g.dungeon.scene, flying, stuck: g.ranged.stuck.length, stuckPos: g.ranged.stuck[0] && g.ranged.stuck[0].mesh.position.toArray().map(v => v.toFixed(1)) }; })()"""},
  {'shot': 'dungeon_arrow'},
  {'eval': "(() => { const g = __game; g.exitDungeon(); return { stuck: g.ranged.stuck.length, aimInWorld: g.aim.group.parent === g.scene }; })()"},
]
