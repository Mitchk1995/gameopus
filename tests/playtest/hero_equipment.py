# ci paths=src/actors/,src/main.js,src/game/,src/ui/itemart.js
# Actual hero, equipment actions and save reload. Items are supplied to exercise
# appearance without spending a playthrough mining every armour tier.
STEPS = [
  {'eval': '@q_helpers.js'},
  {'eval': """(() => {
    const g = __game, T = __THREE;
    __q.check(g.hero.look.outfit === 'male_peasant' && g.hero.look.addons.length === 0 && g.hero.look.gear.length === 0, 'hero has fixed adventurer clothing');
    __q.check(g.appearance.slots.size === 0 && g.state.equip.weapon === 'bronze_sword', 'fresh appearance does not match starter equipment');
    window.__heroView = (side = 0) => {
      const p = g.player.pos;
      g.hero.root.visible = true;
      g.camera.fov = 35; g.camera.updateProjectionMatrix();
      g.camera.position.set(p.x + Math.sin(side) * 3.6, p.y + 1.25, p.z + Math.cos(side) * 3.6);
      g.camera.lookAt(p.x, p.y + 0.95, p.z); g.camera.updateMatrixWorld(true); g.draw(0);
    };
    window.__wear = (id) => {
      if (!g.state.inv.count(id)) g.state.inv.add(id, 1);
      __q.check(g.equip(g.state.inv.slots.findIndex(s => s?.id === id)) === true, 'cannot equip ' + id);
    };
    g.player.spawn(-8, 75, 0); g.sim(0.3);
    g.unequip('weapon'); g.sim(0.3);
    for (const el of document.body.children) if (el.id !== 'app') el.style.display = 'none';
    __heroView(0.15);
    return 'PASS plain clothing, no fixed hood or armour, starter weapon removable';
  })()""", 'shot': 'hero_plain_front'},
  {'eval': '__heroView(Math.PI)', 'shot': 'hero_plain_back'},
  {'eval': """(() => {
    const g = __game;
    for (const id of ['bronze_med_helm', 'bronze_platebody', 'bronze_platelegs', 'bronze_kiteshield', 'bronze_sword']) __wear(id);
    __q.check([...g.appearance.slots.values()].map(v => v.id).sort().join() === ['bronze_med_helm','bronze_platebody','bronze_platelegs','bronze_kiteshield'].sort().join(), 'armour slots are missing or show wrong items');
    __q.check(g.appearance.slots.get('shield').model.parent === g.hero.bones.lowerarm_l && g.held.children.length === 1, 'shield or weapon is not worn');
    __q.check(g.appearance.base.filter(m => m.userData.piece === 'hair' && !/Eyebrow|Beard/i.test(m.name)).every(m => !m.visible), 'hair clips through helmet');
    g.sim(0.3); __heroView(0.25);
    return { verdict: 'PASS bronze equipment appears in every worn slot', slots: [...g.appearance.slots.keys()] };
  })()""", 'shot': 'hero_equipped_front'},
  {'eval': '__heroView(Math.PI + 0.25)', 'shot': 'hero_equipped_back'},
  {'eval': """(() => { const g = __game; g.player.perform('Jog_Fwd_Loop', {loop:true, fade:0}); g.sim(0.23); __heroView(0.6); return 'Jog pose'; })()""", 'shot': 'hero_equipped_jog'},
  {'eval': """(() => { const g = __game; g.player.stopAction(); g.player.startBlock(true); g.sim(0.3); __heroView(0.6); return 'Shield guard pose'; })()""", 'shot': 'hero_equipped_guard'},
  {'eval': """(() => {
    const g = __game;
    g.player.spawn(-8, 75, 0);
    __wear('bronze_chainbody'); __wear('bronze_full_helm');
    __q.check(!g.appearance.models.get('bronze_platebody').parent && !g.appearance.models.get('bronze_med_helm').parent, 'replaced armour remains attached');
    g.sim(0.3); __heroView(0.3); g.save();
    return 'PASS armour replacements remove previous model';
  })()""", 'shot': 'hero_chain_full_helm'},
  {'eval': 'location.reload()'},
  {'wait': 12000},
  {'eval': """(() => {
    const g = __game;
    if (!g?.ready) throw new Error('FAIL saved hero not ready');
    if (g.appearance.slots.get('head')?.id !== 'bronze_full_helm' || g.appearance.slots.get('body')?.id !== 'bronze_chainbody' || g.appearance.slots.get('legs')?.id !== 'bronze_platelegs' || g.appearance.slots.get('shield')?.id !== 'bronze_kiteshield') throw new Error('FAIL saved equipment appearance not restored');
    for (const slot of ['head', 'body', 'legs', 'shield', 'weapon']) if (!g.unequip(slot)) throw new Error('FAIL cannot remove ' + slot);
    if (g.appearance.slots.size || g.held.children.length || g.appearance.base.some(m => !m.visible)) throw new Error('FAIL removing equipment did not restore the plain character');
    g.player.spawn(-8, 75, 0); g.sim(0.3);
    for (const el of document.body.children) if (el.id !== 'app') el.style.display = 'none';
    const p = g.player.pos;
    g.camera.fov = 35; g.camera.updateProjectionMatrix(); g.camera.position.set(p.x + 0.54, p.y + 1.25, p.z + 3.56); g.camera.lookAt(p.x,p.y + 0.95,p.z); g.hero.root.visible = true; g.draw(0);
    return 'PASS save reload restores worn equipment; removing it restores plain clothes and hair';
  })()""", 'shot': 'hero_restored_plain'},
]
