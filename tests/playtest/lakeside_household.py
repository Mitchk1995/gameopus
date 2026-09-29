# ci paths=src/content/,src/actors/npcs.js,src/game/,src/world/,public/assets/lakeside/
# Real household dialogue and gathering, followed by ten simulated minutes of
# authored routines. Teleports shorten travel; this is not a player walking tour.
STEPS = [
  {'eval': '@q_helpers.js'},
  {'eval': """(() => {
    const g = __game;
    window.__houseMeet = (id) => {
      g.closeAll();
      const n = g.npcs.find(n => n.def.id === id);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        g.player.spawn(n.pos.x + Math.sin(a) * 1.7, n.pos.z + Math.cos(a) * 1.7, a + Math.PI);
        g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.1; g.rig.shoulder = 0; g.rig.snap(); g.sim(0.2);
        const from = g.player.pos.clone().add(new __THREE.Vector3(0, 1.1, 0));
        const to = n.pos.clone().add(new __THREE.Vector3(0, 1.1, 0));
        if (g.target?.npc === n && g.world.lineOfSight(from, to, 0.05) >= 0.99) {
          g.input.pressed.add('KeyE'); g.sim(1 / 60); return n;
        }
      }
      throw new Error('FAIL could not approach ' + id + ' without a wall between us');
    };
    __q.check(g.world.lakeside?.door && g.npcs.some(n => n.def.id === 'rowan') && g.npcs.some(n => n.def.id === 'elin'), 'household or cottage door is missing');
    __q.check(g.quests.tracked === 'kindling' && g.quests.stage('kindling') === 0, 'opening lead accepted the household job or points elsewhere');
    const hidden = g.npcs.find(n => n.def.id === 'rowan'), home = g.world.lakeside.place;
    const original = hidden.pos.clone(), yaw = hidden.yaw;
    hidden.talking = true;
    hidden.pos.set(home.x, home.y, home.z - 2.3);
    g.player.spawn(home.x, home.z - 4.7, 0);
    g.rig.yaw = Math.PI; g.rig.pitch = -0.1; g.rig.shoulder = 0; g.rig.snap(); g.sim(0.2);
    g.input.pressed.add('KeyE'); g.sim(1 / 60);
    __q.check(g.target?.npc !== hidden && !g.talk.isOpen, 'Rowan could be spoken to through the solid back wall');
    hidden.pos.copy(original); hidden.yaw = yaw; hidden.talking = false;
    const n = __houseMeet('rowan'), before = n.pos.clone(), pause = n.pause;
    g.sim(4);
    __q.check(n.pos.distanceTo(before) < 0.001 && n.pause === pause, 'Rowan wandered away or advanced his routine while talking');
    __q.read(); __q.click('Could you use a hand'); __q.read(); __q.click('I will bring'); __q.read(); __q.click('See you');
    __q.check(g.quests.stage('kindling') === 1 && !g.state.inv.count('trout'), 'job acceptance failed or awarded food early');
    return 'PASS household introduction and conversation pause';
  })()"""},
  {'eval': """(() => {
    const g = __game, home = g.world.lakeside.place;
    const trees = g.world.forest.trees.filter(t => !t.felled && ['ash', 'aspen'].includes(t.variant.species)).sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z));
    const oldRandom = Math.random, gathered = [];
    try {
      // Fix success rolls, while exercising targeting, tool checks, the action
      // timer, tree depletion and the real resource/XP awards.
      Math.random = () => 0.05;
      for (const tree of trees.slice(0, 50)) {
        if (g.state.inv.count('logs') >= 3) break;
        let targeted = false;
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * Math.PI * 2, d = tree.radius + 1.1;
          g.player.spawn(tree.x + Math.sin(a) * d, tree.z + Math.cos(a) * d, a + Math.PI);
          g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.25; g.rig.snap(); g.sim(0.1);
          if (g.target?.tree === tree) { targeted = true; break; }
        }
        if (!targeted) continue;
        const count = g.state.inv.count('logs');
        g.input.pressed.add('KeyE'); g.sim(3);
        if (g.state.inv.count('logs') === count + 1 && tree.felled) gathered.push([tree.x, tree.z]);
      }
    } finally { Math.random = oldRandom; g.stop(); }
    __q.check(gathered.length === 3 && g.state.inv.count('logs') === 3 && g.state.skills.xp.woodcutting >= 75, 'could not gather three normal logs near the household');
    g.state.inv.remove('coins', g.state.inv.count('coins'));
    g.state.inv.add('clay', g.state.inv.free());
    const clay = g.state.inv.count('clay');
    __q.check(g.state.inv.free() === 0, 'full-pack reward fixture was not full');
    __houseMeet('rowan'); const lines = __q.read(); __q.click('Glad to help');
    __q.check(g.quests.done('kindling') && !g.state.inv.count('logs') && g.state.inv.count('trout') === 2 && g.state.inv.count('coins') === 25, 'full-pack job hand-in lost wood, food or coins');
    __q.check(g.state.inv.count('clay') === clay && g.state.inv.free() === 0, 'hand-in disturbed other pack items');
    document.querySelector('.qscroll').click();
    __houseMeet('rowan'); __q.read(); __q.click('Remind me'); __q.read(); __q.click('I will look');
    __q.check(g.state.inv.count('trout') === 2 && g.state.inv.count('coins') === 25, 'household reward can be claimed twice');
    __q.check(g.quests.tracked === 'gnasher' && g.quests.stage('gnasher') === 0, 'Tam follow-on should only change guidance');
    __houseMeet('elin'); __q.read(); __q.click('I am new'); const advice = __q.read(); __q.click('See you');
    __q.check(advice.join(' ').includes('our hearth'), 'Elin did not explain the usable home hearth');
    return { verdict: 'PASS real gathering, full-pack one-time reward and follow-on lead', gathered, lines, advice };
  })()"""},
  {'eval': """(() => {
    const g = __game, home = g.world.lakeside.place, door = g.world.lakeside.door;
    const people = g.npcs.filter(n => ['rowan', 'elin'].includes(n.def.id));
    g.closeAll(); g.player.spawn(-8, 53, Math.PI);
    const seen = Object.fromEntries(people.map(n => [n.def.id, new Set()]));
    const blocked = Object.fromEntries(people.map(n => [n.def.id, 0]));
    const failures = [], crossings = { rowan: 0, elin: 0 };
    const local = (n) => {
      const dx = n.pos.x - home.x, dz = n.pos.z - home.z, c = Math.cos(home.rot || 0), s = Math.sin(home.rot || 0);
      return { x: dx * c - dz * s, z: dx * s + dz * c };
    };
    let closest = Infinity, closestAt = null;
    for (let k = 0; k < 6000; k++) {
      const before = people.map(local);
      g.sim(0.1);
      const distance = people[0].pos.distanceTo(people[1].pos);
      if (distance < closest) { closest = distance; closestAt = people.map(n => ({ id: n.def.id, x: n.pos.x, z: n.pos.z, target: n.routine[n.leg].id, pause: n.pause })); }
      for (const [i, n] of people.entries()) {
        const at = local(n), id = n.def.id;
        if (n.pause > 0 && n.routineStop?.wait) seen[id].add(n.routineStop.id);
        blocked[id] = n.blocked ? blocked[id] + 0.1 : 0;
        if (blocked[id] > 2 && !failures.some(f => f.id === id)) failures.push({ id, at, target: n.routine[n.leg], reason: 'blocked for over two seconds' });
        if ((before[i].z - 3.56) * (at.z - 3.56) < 0 && Math.abs(at.x) < 4.3) {
          crossings[id]++;
          if (!door.open || door.t < 0.98 || Math.abs(at.x) > 0.46) failures.push({ id, at, reason: 'crossed a shut door or wall' });
        }
      }
    }
    for (const n of people) {
      const expected = n.routine.filter(p => p.wait > 0).map(p => p.id);
      for (const stop of expected) if (!seen[n.def.id].has(stop)) failures.push({ id: n.def.id, reason: 'never reached ' + stop });
      if (crossings[n.def.id] < 2) failures.push({ id: n.def.id, reason: 'did not enter and leave the home' });
    }
    if (closest < 0.6) failures.push({ reason: 'household members walked through one another', closest, closestAt });
    __q.check(!failures.length, JSON.stringify(failures));
    return { verdict: 'PASS ten minutes of household routines', stops: Object.fromEntries(Object.entries(seen).map(([id, set]) => [id, [...set]])), crossings, closestSeparation: +closest.toFixed(2), closestAt };
  })()"""},
]
