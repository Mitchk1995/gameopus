STEPS = [
  {'eval': '@q_helpers.js'},
  {'eval': """(() => { const g = __game; const out = {};
     __q.talk(g, 'brom'); out.hello = __q.read(); out.o = __q.opts(); __q.click("What's this about your iron");
     out.offer = __q.read(); __q.click("find out"); out.start = __q.read(); __q.click("talk to him");
     out.stage1 = g.quests.stage('ledger');
     __q.talk(g, 'garrow'); out.garrow = __q.read(); __q.click("take a look");
     out.stage2 = g.quests.stage('ledger'); out.goal = g.quests.goal();
     return out; })()"""},
  {'eval': """(() => { const g = __game; const w = g.quests.wreckAt; const sp = g.quests.spots.find(s => s.spotId === 'wreck');
     g.player.spawn(w.x + 2.6, w.z + 0.5, 0); g.player.faceTowards(sp.x, sp.z); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.3; g.rig.shoulder = 0; g.rig.snap(); g.sim(0.2);
     const t = g.target; g.run(0.05); return { target: t && (t.name + '/' + t.station) }; })()"""},
  {'shot': 'q3_wreck'},
  {'eval': """(() => { const g = __game; g.input.pressed.add('KeyE'); g.sim(0.1); const said = __q.said(); __q.click('Close'); g.sim(0.1);
     return { said, stage: g.quests.stage('ledger'), tracker: document.querySelector('.qtrack .qs').textContent, goal: g.quests.goal() }; })()"""},
  {'eval': """(() => { const g = __game, P = g.player, S = g.state.skills;
     for (const k of ['attack', 'strength', 'defence', 'hitpoints']) S.xp[k] = 1500000; g.state.hp = g.state.maxHp;
     const cap = g.fight.enemies.find(e => e.def.name === 'Bandit captain');
     P.spawn(cap.pos.x + 2.2, cap.pos.z, 0); let t = 0;
     while (t < 90 && cap.alive && P.state !== 'dead') {
       const d = Math.hypot(cap.pos.x - P.pos.x, cap.pos.z - P.pos.z);
       if (d > 2.6 && P.state === 'move') { const a = Math.atan2(P.pos.x - cap.pos.x, P.pos.z - cap.pos.z); P.spawn(cap.pos.x + Math.sin(a) * 2.0, cap.pos.z + Math.cos(a) * 2.0, 0); }
       g.fight.lock = cap; if (P.state === 'move') g.input.clicked.add(0);
       if (g.state.hp < g.state.maxHp * 0.4) g.state.hp = g.state.maxHp;
       g.sim(1 / 60); t += 1 / 60; }
     const ledger = g.fight.ground.find(it => !it.gone && it.id === 'captains_ledger');
     const res = { t: t.toFixed(1), dead: !cap.alive, ledger: !!ledger, loot: g.fight.ground.filter(it => !it.gone).map(it => it.id).join(',') };
     if (ledger) g.fight.take(ledger);
     res.has = g.state.inv.count('captains_ledger');
     return res; })()"""},
  {'eval': """(() => { const g = __game; const i = g.state.inv.slots.findIndex(s => s && s.id === 'captains_ledger');
     const opts = g.panels.actions.options(i).map(o => o.label.replace(/<[^>]+>/g, ''));
     g.quests.read('captains_ledger'); const p1 = __q.said(); __q.click('Read on'); const p2 = __q.said(); __q.click('Close');
     return { opts, p1, p2, stage: g.quests.stage('ledger'), tracker: document.querySelector('.qtrack .qs').textContent }; })()"""},
  {'eval': "(() => { const g = __game; window.__entered = false; g.enterDungeon().then(() => (window.__entered = true)); return 1; })()"},
  {'wait': 4000},
  {'eval': """(() => { const g = __game, d = g.dungeon; const box = d.interactables.find(i => i.name === "Brom's strongbox");
     if (!box) return 'no box';
     g.player.spawn(box.x + 1.4, box.z, 0); g.player.faceTowards(box.x, box.z); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.4; g.rig.snap();
     g.fight.boss.engaged = false; g.sim(0.1); const t = g.target;
     g.input.pressed.add('KeyE'); g.sim(1/60); const msg = document.querySelector('.log').lastChild.textContent;
     g.fight.boss.hp = 0; g.fight.boss.alive = false; g.fight.boss.state = 'dead'; g.fight.boss = null;
     g.player.faceTowards(box.x, box.z); g.sim(0.1); g.input.pressed.add('KeyE'); g.sim(0.2);
     g.run(0.05);
     return { entered: window.__entered, target: t && t.name, whileAlive: msg, has: g.state.inv.count('ore_strongbox'), stage: g.quests.stage('ledger'), boxHidden: box.hidden }; })()"""},
  {'shot': 'q3_box'},
  {'eval': """(() => { const g = __game; g.exitDungeon(); g.sim(0.2); const coins = g.state.inv.count('coins');
     __q.talk(g, 'brom'); const lines = __q.read(); __q.click('Glad to help'); document.querySelector('.qscroll').click();
     __q.talk(g, 'brom'); __q.click("Let's trade"); const stock = [...document.querySelectorAll('.bankgrid .slot img')].map(i => i.alt);
     return { lines, stage: g.quests.stage('ledger'), points: g.quests.points, coins: [coins, g.state.inv.count('coins')], steel: stock.filter(s => /Steel/.test(s)) }; })()"""},
  {'eval': """(() => { const g = __game; g.state.inv.add('logs', 1); const i = g.state.inv.slots.findIndex(s => s && s.id === 'logs');
     g.panels.actions.primary(i); const msg1 = document.querySelector('.log').lastChild.textContent;
     g.state.inv.add('bronze_bar', 1); const j = g.state.inv.slots.findIndex(s => s && s.id === 'bronze_bar'); const c0 = g.state.inv.count('coins');
     g.panels.actions.primary(j); return { logs: msg1, soldBar: g.state.inv.count('bronze_bar') === 0, coins: [c0, g.state.inv.count('coins')] }; })()"""},
  {'shot': 'q3_shop'},
]
