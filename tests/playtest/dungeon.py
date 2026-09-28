STEPS = [
  {'eval': '@m4_helpers.js'},
  {'eval': "(() => { const g = __game; g.enterDungeon().then(() => (window.__entered = true)); return 1; })()"},
  {'wait': 4000},
  # --- chest
  {'eval': """(() => { const g = __game, d = g.dungeon, c = d.chests[0]; if (!c) return 'no chest';
     __h.standBy(g, c.x, c.z, 1.5); g.run(0.2); const t = g.target && (g.target.station || g.target.kind);
     __h.pressE(g); g.sim(0.8); return { chests: d.chests.length, target: t, opened: c.opened, state: g.player.state }; })()"""},
  {'wait': 800},
  {'eval': "(() => { const g = __game; g.sim(0.6); g.run(0.1); return __h.loot(g); })()"},
  {'shot': 'm4_chest'},
  # --- pick the loot up by aiming at it
  {'eval': """(() => { const g = __game, out = []; const before = g.state.inv.slots.filter(Boolean).length;
     for (const it of g.fight.ground.filter((it) => !it.gone && it.realm === 'dungeon')) {
       __h.standBy(g, it.x, it.z, 1.1); g.rig.pitch = -0.6; g.run(0.05);
       const t = g.target; out.push(t && t.kind === 'item' ? t.item.id : 'none:' + (t && (t.station || t.kind)));
       __h.pressE(g); }
     return { targets: out, invBefore: before, invAfter: g.state.inv.slots.filter(Boolean).length, left: __h.loot(g) }; })()"""},
  # --- the boss
  {'eval': """(() => { const g = __game, b = g.fight.boss, P = g.player, S = g.state.skills;
     for (const k of ['attack', 'strength', 'defence', 'hitpoints']) S.xp[k] = 1500000; g.state.hp = g.state.maxHp;
     P.spawn(b.pos.x + 2.5, b.pos.z, 0);
     window.__boss = { t: 0, phaseAt: null, maxAdds: 0, heals: 0, rings: 0 };
     window.__fightFor = (secs, untilPhase) => { const B = window.__boss; const end = B.t + secs;
       while (B.t < end && b.alive && P.state !== 'dead' && !(untilPhase && b.phase === 2)) {
         const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
         if (d > 2.8 && P.state === 'move') { const a = Math.atan2(P.pos.x - b.pos.x, P.pos.z - b.pos.z); P.spawn(b.pos.x + Math.sin(a) * 2.2, b.pos.z + Math.cos(a) * 2.2, 0); }
         g.fight.lock = b;
         if (P.state === 'move') g.input.clicked.add(0);
         if (g.state.hp < g.state.maxHp * 0.4) { g.state.hp = g.state.maxHp; B.heals++; }
         g.sim(1 / 60); B.t += 1 / 60;
         if (b.phase === 2 && B.phaseAt === null) B.phaseAt = +B.t.toFixed(1);
         B.maxAdds = Math.max(B.maxAdds, g.fight.enemies.filter((e) => e.id >= 2000 && e.alive && e.engaged).length);
         B.rings = Math.max(B.rings, (g.fight.rings || []).length);
       }
       return { ...B, t: B.t.toFixed(1), bossAlive: b.alive, bossHp: b.hp, phase: b.phase, dead: P.state === 'dead' }; };
     return window.__fightFor(120, true); })()"""},
  {'wait': 600},
  {'eval': "(() => { const g = __game; g.rig.pitch = -0.3; g.run(0.3); return window.__fightFor(0.1); })()"},
  {'shot': 'm4_enraged'},
  {'eval': "(() => { const g = __game; const r = window.__fightFor(150); return { ...r, kills: g.state.collection.kills, fightBoss: !!g.fight.boss }; })()"},
  {'wait': 300},
  {'eval': "(() => { const g = __game; g.rig.pitch = -0.5; g.run(0.3); return __h.loot(g); })()"},
  {'shot': 'm4_bossdrops'},
  # --- rares and the pet
  {'eval': """(() => { const g = __game, P = g.player;
     const a = g.fight.drop('warren_crown', 1, P.pos.x + 1, P.pos.z, true), b = g.fight.drop('pet_grubling', 1, P.pos.x - 1, P.pos.z, true);
     g.fight.take(a); window.__petP = g.fight.take(b); return { log: g.state.collection.log }; })()"""},
  {'wait': 2500},
  {'eval': """(() => { const g = __game, P = g.player, f = g.pets.follower;
     const start = f && f.pos.clone();
     P.spawn(P.pos.x + 0.1, P.pos.z + 0.1, 0); g.sim(0.5);
     return { pet: f && f.id, inScene: f && f.root.parent === g.dungeon.scene, flag: g.state.flags.pet, crown: g.state.inv.count('warren_crown'), petPos: f && f.pos.toArray().map(v => v.toFixed(1)), player: P.pos.toArray().map(v => v.toFixed(1)) }; })()"""},
  {'eval': """(() => { const g = __game, P = g.player, f = g.pets.follower; P.faceTowards(f.pos.x, f.pos.z); g.rig.yaw = P.yaw; g.rig.pitch = -0.3; g.run(0.3); return f.anim; })()"""},
  {'shot': 'm4_pet'},
  {'eval': "(() => { const g = __game; g.togglePack('log'); return g.panels.tab; })()"},
  {'wait': 400},
  {'shot': 'm4_log'},
  {'eval': "(() => { const g = __game; g.closeAll(); return g.uiOpen; })()"},
  # --- rope out
  {'eval': """(() => { const g = __game, d = g.dungeon, r = d.interactables.find((i) => i.station === 'rope');
     __h.standBy(g, r.x, r.z, 1.2); g.rig.pitch = -0.1; g.run(0.1); const t = g.target && (g.target.station || g.target.kind);
     __h.pressE(g); g.sim(0.5); g.run(0.2); const e = g.resources.caveExit, P = g.player;
     return { target: t, realm: g.realm, nearExit: Math.hypot(P.pos.x - e.x, P.pos.z - e.z).toFixed(1), petInWorld: g.pets.follower && g.pets.follower.root.parent === g.scene, dungeonEnemies: g.fight.enemies.filter((x) => x.realm === 'dungeon').length, worldLoot: __h.loot(g).length }; })()"""},
  {'shot': 'm4_out'},
  # --- dying down there
  {'eval': "(() => { const g = __game; window.__entered = false; g.enterDungeon().then(() => (window.__entered = true)); return 1; })()"},
  {'wait': 4000},
  {'eval': """(() => { const g = __game, P = g.player, S = g.state.skills; S.xp.defence = 0; S.xp.hitpoints = 1154; g.state.hp = 2;
     const foe = g.fight.enemies.find((e) => e.realm === 'dungeon' && !e.def.boss && e.alive);
     P.spawn(foe.pos.x + 1.8, foe.pos.z, 0); let t = 0;
     while (t < 40 && P.state !== 'dead') { g.sim(1 / 60); t += 1 / 60; }
     return { entered: window.__entered, t: t.toFixed(1), state: P.state, hp: g.state.hp }; })()"""},
  {'wait': 4300},
  {'eval': """(() => { const g = __game, P = g.player; g.sim(0.2); g.run(0.1);
     return { realm: g.realm, state: P.state, hp: g.state.hp + '/' + g.state.maxHp, pos: P.pos.toArray().map((v) => v.toFixed(1)), dungeon: !!g.dungeon, dungeonEnemies: g.fight.enemies.filter((x) => x.realm === 'dungeon').length, pet: g.pets.follower && g.pets.follower.root.parent === g.scene }; })()"""},
  {'shot': 'm4_woke'},
]
