# ci paths=src/game/,src/content/,src/ui/,src/actors/player.js
# Guidance and recovery across real page reloads in an isolated browser profile.
READY = """(async () => {
  for (let i = 0; i < 1200 && !window.__game?.ready; i++) await new Promise(r => setTimeout(r, 200));
  if (!window.__game?.ready) throw new Error('FAIL game did not reload');
  return 'ready';
})()"""
STEPS = [
  {'eval': """(() => {
    const g = __game, rowan = g.npcs.find(n => n.def.id === 'rowan');
    const check = (ok, msg) => { if (!ok) throw new Error('FAIL ' + msg); };
    check(g.quests.tracked === 'kindling' && g.quests.stage('kindling') === 0, 'fresh game should suggest Rowan without accepting his job');
    const goal = g.quests.goal();
    check(goal && Math.hypot(goal.x - rowan.pos.x, goal.z - rowan.pos.z) < 0.01, 'opening map lead does not point to Rowan');
    check(!document.querySelector('.qtrack').hidden, 'opening quest lead is not visible');
    g.state.flags.testSpawn = { x: g.player.pos.x, z: g.player.pos.z };
    g.togglePack('quests');
    [...document.querySelectorAll('.qitem')].find(el => el.textContent.includes("Captain's Ledger")).click();
    check(g.quests.tracked === 'ledger' && g.quests.stage('ledger') === 0, 'journal selection must track an unstarted quest without accepting it');
    g.closeAll();
    g.state.hp = 4; g.state.inv.add('coins', 75); g.save();
    setTimeout(() => location.reload(), 50);
    return 'PASS opening lead and journal selection';
  })()"""},
  {'wait': 3000},
  {'eval': READY},
  {'eval': """(() => {
    const g = __game;
    const check = (ok, msg) => { if (!ok) throw new Error('FAIL ' + msg); };
    check(g.quests.tracked === 'ledger' && g.quests.stage('ledger') === 0, 'selected journal lead was lost on reload');
    check(g.state.hp === 4 && g.state.inv.count('coins') === 100, 'healthy character save changed health or inventory');
    g.quests.set('gnasher', 1);
    check(g.quests.tracked === 'gnasher' && g.state.flags.questTracked === 'gnasher', 'new quest progress did not take over guidance');
    const tam = g.npcs.find(n => n.def.id === 'tam'), facing = tam.yaw;
    g.player.spawn(tam.pos.x + Math.sin(facing) * 1.6, tam.pos.z + Math.cos(facing) * 1.6, 0);
    g.player.faceTowards(tam.pos.x, tam.pos.z); g.rig.yaw = g.player.yaw + Math.PI;
    g.rig.pitch = -0.1; g.rig.shoulder = 0; g.rig.snap(); g.sim(0.2);
    check(g.target?.npc === tam, 'death interaction check could not target Tam');
    g.player.die(); g.state.hp = 0;
    g.input.pressed.add('KeyE'); g.sim(1 / 60);
    check(g.player.state === 'dead' && !g.talk.isOpen, 'E started a conversation while dead');
    g.player.pos.set(262, 0, 70); g.save();
    const saved = JSON.parse(localStorage.getItem('aldermere.save.v1')), spawn = g.state.flags.testSpawn;
    check(saved.hp === g.state.maxHp && Math.hypot(saved.pos.x - spawn.x, saved.pos.z - spawn.z) < 0.1, 'death save did not store safe recovery');
    check(g.player.state === 'dead' && g.state.hp === 0, 'saving unexpectedly revived the live character');
    setTimeout(() => location.reload(), 50);
    return 'PASS guidance reload and death snapshot';
  })()"""},
  {'wait': 3000},
  {'eval': READY},
  {'eval': """(() => {
    const g = __game, spawn = g.state.flags.testSpawn;
    const check = (ok, msg) => { if (!ok) throw new Error('FAIL ' + msg); };
    check(g.state.hp === g.state.maxHp && g.player.state === 'move' && Math.hypot(g.player.pos.x - spawn.x, g.player.pos.z - spawn.z) < 0.1, 'death reload did not recover at safe spawn');
    check(g.state.inv.count('coins') === 100 && g.quests.stage('gnasher') === 1 && g.quests.tracked === 'gnasher', 'death recovery lost inventory or quest progress');
    const saved = g.state.toJSON();
    saved.hp = 0; saved.pos = { ...saved.pos, x: 262, z: 70 };
    g.save = () => {};
    localStorage.setItem('aldermere.save.v1', JSON.stringify(saved));
    setTimeout(() => location.reload(), 50);
    return 'PASS death recovery; checking legacy death save';
  })()"""},
  {'wait': 3000},
  {'eval': READY},
  {'eval': """(() => {
    const g = __game, spawn = g.state.flags.testSpawn;
    if (g.state.hp !== g.state.maxHp || Math.hypot(g.player.pos.x - spawn.x, g.player.pos.z - spawn.z) > 0.1 || g.state.inv.count('coins') !== 100) throw new Error('FAIL legacy zero-health save did not recover safely');
    return 'PASS legacy zero-health recovery';
  })()"""},
]
