# ci paths=src/game/,src/content/,src/world/,src/ui/
STEPS = [
  {'eval': '@q_helpers.js'},
  {'eval': """(() => { const g = __game;
     __q.check(__q.talk(g, 'tam') === 'tam', 'cannot reach Old Tam');
     __q.read(); __q.click('Which fish'); __q.read(); __q.click("I'll catch"); __q.read(); __q.click("I'll go");
     __q.check(g.quests.stage('gnasher') === 1, 'accepting Tam quest did not start it');
     const who = __q.talk(g, 'brom'); const a = __q.read(); const o = __q.opts(); __q.click('Goodbye');
     g.state.inv.add('bronze_bar', 1);
     __q.talk(g, 'brom'); const b = __q.read(); const o2 = __q.opts(); __q.click('Thanks');
     __q.check(who === 'brom' && g.quests.stage('gnasher') === 2 && g.state.inv.count('heavy_hook') === 1 && !g.state.inv.count('bronze_bar'), 'Brom did not exchange one bronze bar for the quest hook');
     return { who, a, o, b, o2, stage: g.quests.stage('gnasher'), hook: g.state.inv.count('heavy_hook'), bar: g.state.inv.count('bronze_bar') }; })()"""},
  {'eval': """(() => { const g = __game; const sp = g.quests.spots.find(s => s.spotId === 'deepwater');
     const e = g.resources.jettyEnd; g.player.spawn(e.x - e.dx * 0.8, e.z - e.dz * 0.8, 0); g.player.faceTowards(sp.x, sp.z); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.35; g.rig.snap(); g.sim(0.2);
     const t = g.target; g.input.pressed.add('KeyE'); g.sim(1/60);
     const noShrimp = document.querySelector('.log').lastChild.textContent;
     g.state.inv.add('raw_shrimp', 2);
     g.input.pressed.add('KeyE'); g.sim(1/60);
     // Don't strike: let him take the bait.
     let t2 = 0; while (t2 < 12 && !(g.activity && g.activity.strike)) { g.sim(0.1); t2 += 0.1; }
     const bit = !!(g.activity && g.activity.strike), strikeShown = !document.querySelector('.strike')?.hidden;
     g.sim(1.3);
     __q.check(noShrimp.includes('raw shrimp') && bit && strikeShown, 'missing-bait feedback or bite prompt failed');
     __q.check(g.state.inv.count('raw_shrimp') === 1 && !g.activity && g.quests.stage('gnasher') === 2, 'missed bite did not consume one bait and reset fishing');
     return { target: t && (t.name + '/' + t.station), py: g.player.pos.y.toFixed(2), noShrimp, bitAfter: t2.toFixed(1), bit, strikeShown, shrimpLeft: g.state.inv.count('raw_shrimp'), active: !!g.activity, log: document.querySelector('.log').lastChild.textContent }; })()"""},
  {'eval': """(() => { const g = __game; const sp = g.quests.spots.find(s => s.spotId === 'deepwater');
     g.player.faceTowards(sp.x, sp.z); g.rig.yaw = g.player.yaw + Math.PI; g.sim(0.1);
     g.input.pressed.add('KeyE'); g.sim(1/60);
     let t2 = 0; while (t2 < 12 && !(g.activity && g.activity.strike)) { g.sim(0.1); t2 += 0.1; }
     g.run(0.05); return { bite: t2.toFixed(1), strike: !document.querySelector('.strike').hidden }; })()"""},
  {'shot': 'q2_strike'},
  {'eval': """(() => { const g = __game; g.input.pressed.add('KeyE'); g.sim(0.3);
     __q.check(g.quests.stage('gnasher') === 3 && g.state.inv.count('old_gnasher') === 1 && !g.state.inv.count('raw_shrimp'), 'striking the bite did not land Gnasher');
     return { stage: g.quests.stage('gnasher'), gnasher: g.state.inv.count('old_gnasher'), shrimp: g.state.inv.count('raw_shrimp'), log: document.querySelector('.log').lastChild.textContent, tracker: document.querySelector('.qtrack .qs').textContent, spotHidden: g.quests.spots.find(s => s.spotId === 'deepwater').hidden }; })()"""},
  {'eval': """(() => { const g = __game; const fishXp = g.state.skills.xp.fishing; __q.talk(g, 'tam'); const lines = __q.read(); const o = __q.opts();
     const scrollWhileTalking = !document.querySelector('.qscroll').hidden; __q.click('Enjoy');
     __q.check(g.quests.done('gnasher') && g.state.skills.xp.fishing === fishXp + 1200 && g.state.inv.count('fly_rod') === 1 && g.state.inv.count('feather') === 100 && !g.state.inv.count('old_gnasher') && g.quests.points === 1, 'Tam completion or rewards failed');
     __q.check(!scrollWhileTalking && !document.querySelector('.qscroll').hidden, 'quest reward scroll was not held until dialogue ended');
     return { lines, o, scrollWhileTalking, scrollAfter: !document.querySelector('.qscroll').hidden, stage: g.quests.stage('gnasher'), fishXp: [fishXp, g.state.skills.xp.fishing], rod: g.state.inv.count('fly_rod'), feathers: g.state.inv.count('feather'), gnasher: g.state.inv.count('old_gnasher'), tracker: document.querySelector('.qtrack').hidden, points: g.quests.points }; })()"""},
  {'wait': 700},
  {'shot': 'q2_scroll'},
  {'eval': "(() => { const g = __game; document.querySelector('.qscroll').click(); g.togglePack('quests'); [...document.querySelectorAll('.qitem')][0].click(); return document.querySelector('.qentry').textContent.slice(0, 300); })()"},
  {'wait': 300},
  {'shot': 'q2_journal'},
]
