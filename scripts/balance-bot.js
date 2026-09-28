// In-page balance bot. Injected by scripts/balance.mjs into the built game.
// It plays like a competent human: ~0.25s reactions, dodges most telegraphed slams
// and incoming bolts, kites when hurt, drinks potions, and equips upgrades.
(() => {
  const PROFILES = {
    casual: { react: 0.35, dodge: 0.45, kite: 0.3, potionAt: 0.35, crowd: 99 },
    competent: { react: 0.25, dodge: 0.75, kite: 0.5, potionAt: 0.45, crowd: 5 },
    expert: { react: 0.15, dodge: 0.95, kite: 0.6, potionAt: 0.5, crowd: 3 },
  };

  function tick(g, st) {
    const p = g.player;
    const inp = g.input;
    inp.mouse.left = false;
    inp.mouse.right = false;
    if (p.dead) return;
    const prof = st.profile;
    const lifePct = p.life / p.stats.life;

    let near = 0, cx = 0, cz = 0, closest = null, cd = 1e9;
    for (const e of g.enemies.list) {
      if (e.dead || e.spawnT < 1) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z) - e.radius;
      if (d < cd) { cd = d; closest = e; }
      if (d < 3) { near++; cx += e.x; cz += e.z; }
    }
    if (near) { cx /= near; cz /= near; }

    // Dangers the bot has had time to notice.
    let danger = null;
    for (const e of g.enemies.list) {
      if (e.dead || e.windup <= 0 || e.def.behavior !== 'slam') continue;
      if (e.def.windup - e.windup < prof.react) continue;
      const sx = e.x + Math.sin(e.face) * 1.2, sz = e.z + Math.cos(e.face) * 1.2;
      if (Math.hypot(p.x - sx, p.z - sz) < e.def.reach * e.scale + 0.9) danger = { x: sx, z: sz };
    }
    for (const b of g.projectiles.list) {
      if (b.owner !== 'enemy' || b.t < prof.react) continue;
      const rx = p.x - b.x, rz = p.z - b.z;
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const along = (rx * b.vx + rz * b.vz) / sp;
      if (along < 0 || along > 6) continue;
      const perp = Math.abs(rx * b.vz - rz * b.vx) / sp;
      if (perp < 1.1) danger = { x: b.x, z: b.z, proj: b };
    }

    const away = (fx, fz, dist = 5) => {
      let dx = p.x - fx, dz = p.z - fz;
      const l = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dx / l) * dist, z: p.z + (dz / l) * dist };
    };

    if (lifePct < prof.potionAt && p.potionCd <= 0) inp.pressed.add('KeyR');

    // Dodge: roll once per threat so the bot doesn't get infinite retries.
    if (danger) {
      const key = danger.proj || `${Math.round(danger.x)},${Math.round(danger.z)}`;
      if (st.lastThreat !== key) {
        st.lastThreat = key;
        st.willDodge = Math.random() < prof.dodge;
      }
    }
    if (danger && st.willDodge && p.dashCd > 0) {
      // No dash available: sidestep projectiles, back away from slams.
      if (danger.proj) {
        const b = danger.proj, sp = Math.hypot(b.vx, b.vz) || 1;
        const side = (p.x - b.x) * b.vz - (p.z - b.z) * b.vx > 0 ? 1 : -1;
        p.moveTarget = { x: p.x + (b.vz / sp) * 3 * side, z: p.z - (b.vx / sp) * 3 * side };
      } else p.moveTarget = away(danger.x, danger.z, 4);
      return;
    }
    if (danger && p.dashCd <= 0) {
      if (st.willDodge) {
        const t = danger.proj
          ? { x: p.x - danger.proj.vz * 0.4, z: p.z + danger.proj.vx * 0.4 }
          : away(danger.x, danger.z, 6);
        p.moveTarget = t;
        inp.pressed.add('Space');
        st.dodges++;
        return;
      }
    }

    // Surrounded and hurt: step out.
    if (near >= 6 && lifePct < 0.55 && p.dashCd <= 0) {
      p.moveTarget = away(cx, cz, 6);
      inp.pressed.add('Space');
      return;
    }

    if (p.can('nova') && near >= 5 && p.mana >= 25 && p.novaCd <= 0) inp.pressed.add('KeyQ');

    if (closest && cd < 2.3) {
      g.aim.set(near ? cx : closest.x, 0.9, near ? cz : closest.z);
      inp.mouse.left = true;
      // Keep swinging while backing out of crowds, like a player circle-kiting.
      if ((lifePct < prof.kite && near >= 3) || near >= prof.crowd) p.moveTarget = away(cx, cz, 3);
      else p.moveTarget = null;
    } else if (closest && cd < 11 && p.can('bolt') && p.mana > p.stats.mana * 0.5 && Math.random() < 0.5) {
      g.aim.set(closest.x, 0.9, closest.z);
      inp.mouse.right = true;
      p.moveTarget = { x: closest.x, z: closest.z };
    } else {
      // Loot first when it's safe, else close in.
      const item = cd > 6 && g.loot.items.find((it) => it.landed && Math.hypot(it.x - p.x, it.z - p.z) < 14);
      if (item) p.moveTarget = { x: item.x, z: item.z };
      else if (closest) p.moveTarget = { x: closest.x, z: closest.z };
      else p.moveTarget = { x: p.x + Math.sin(g.time * 0.3) * 6, z: p.z + Math.cos(g.time * 0.3) * 6 };
    }
  }

  function manageGear(g) {
    const inv = g.inventory, bag = g.save.bag;
    for (let pass = 0; pass < 3; pass++) {
      let best = -1, bestScore = 1.5;
      for (let i = 0; i < bag.length; i++) {
        const s = inv.upgradeScore(bag[i]);
        if (s > bestScore) { best = i; bestScore = s; }
      }
      if (best < 0) break;
      inv.equip(best);
    }
    if (bag.length > 28) {
      for (let i = bag.length - 1; i >= 0; i--) {
        const it = bag[i];
        const keepUnique = (it.rarity === 'unique' || it.rarity === 'ascendant') && !bag.some((o, j) => j < i && o.uniqueId === it.uniqueId);
        if (!keepUnique && inv.upgradeScore(it) <= 0) {
          g.save.shards += 1;
          bag.splice(i, 1);
        }
      }
    }
  }

  // Simulate one run until death or maxMinutes. Returns a run record.
  function run(g, { profile = 'competent', maxMinutes = 20, dread = 0 } = {}) {
    document.querySelectorAll('.screen').forEach((s) => s.remove());
    g.hud.root.hidden = false;
    g.state = 'play';
    g.dread = dread;
    g.newRun();
    const st = { profile: PROFILES[profile], dodges: 0, lastThreat: null, willDodge: false };
    const dt = 1 / 30;
    const rec = { dread, profile, depthTimes: {}, dmgTaken: 0, levelStart: g.player.level, lowest: 1, potions: 0, bySource: {}, lastHits: [], perDepth: {} };
    const hurt = g.combat.hurtPlayer.bind(g.combat);
    g.combat.hurtPlayer = (amt, src, o) => {
      const before = g.player.life;
      hurt(amt, src, o);
      const d = Math.max(0, before - g.player.life);
      rec.dmgTaken += d;
      const pd = (rec.perDepth[g.depth] ||= { dmgPctMax: 0, lowest: 1, potions: 0, t0: g.runTime });
      pd.dmgPctMax += d / g.player.stats.life;
      const key = src ? `${src.elite ? src.elite + ' ' : ''}${src.typeId}` : o?.dot ? 'burning ground' : 'bolt';
      rec.bySource[key] = Math.round((rec.bySource[key] || 0) + d);
      if (d > 0) { rec.lastHits.push(key); if (rec.lastHits.length > 6) rec.lastHits.shift(); }
    };
    const drops = { magic: 0, rare: 0, unique: 0, ascendant: 0 };
    const dropItem = g.loot.dropItem.bind(g.loot);
    g.loot.dropItem = (item, x, z) => { drops[item.rarity]++; dropItem(item, x, z); };
    let lastDepth = 1, gearT = 0;
    const maxSteps = maxMinutes * 60 * 30;
    let step = 0;
    for (; step < maxSteps; step++) {
      tick(g, st);
      if (g.input.pressed.has('KeyR') && g.player.potionCd <= 0 && g.player.life < g.player.stats.life) {
        rec.potions++;
        (rec.perDepth[g.depth] ||= { dmgPctMax: 0, lowest: 1, potions: 0, t0: g.runTime }).potions++;
      }
      g.update(dt);
      g.input.endFrame();
      rec.lowest = Math.min(rec.lowest, g.player.life / g.player.stats.life);
      const pd = (rec.perDepth[g.depth] ||= { dmgPctMax: 0, lowest: 1, potions: 0, t0: g.runTime });
      pd.lowest = Math.min(pd.lowest, g.player.life / g.player.stats.life);
      if (g.depth !== lastDepth) { rec.depthTimes[g.depth] = +g.runTime.toFixed(0); lastDepth = g.depth; }
      gearT += dt;
      if (gearT > 5) { gearT = 0; manageGear(g); }
      if (g.player.dead) break;
    }
    g.combat.hurtPlayer = hurt;
    g.loot.dropItem = dropItem;
    manageGear(g);
    const s = g.player.stats;
    Object.assign(rec, {
      died: g.player.dead,
      minutes: +(g.runTime / 60).toFixed(2),
      depth: g.depth,
      kills: g.kills,
      level: g.player.level,
      dps: Math.round(s.dps),
      life: Math.round(s.life),
      dr: +(s.dr * 100).toFixed(0),
      dmgTakenPerMin: Math.round(rec.dmgTaken / Math.max(0.1, g.runTime / 60)),
      killsPerMin: Math.round(g.kills / Math.max(0.1, g.runTime / 60)),
      dodges: st.dodges,
      drops,
      uniquesEquipped: Object.values(g.save.equipment).filter((i) => i && i.uniqueId).length,
      dreadUnlocked: g.save.dreadUnlocked,
    });
    return rec;
  }

  // Hits needed to kill one monster type at a given depth/dread with current gear.
  function ttk(g, typeId, depth = 1, dread = 0) {
    const saved = [g.depth, g.dread, g.runTime];
    g.depth = depth; g.dread = dread; g.runTime = 0;
    const e = g.enemies.spawn(typeId, 999, 999);
    g.depth = saved[0]; g.dread = saved[1]; g.runTime = saved[2];
    const s = g.player.stats;
    const avg = ((s.dmgMin + s.dmgMax) / 2 + s.flatDmg + s.fireDmg + s.coldDmg + s.lightningDmg) * (1 + s.pctDmg / 100) * (1 + (s.critChance / 100) * (s.critDmg / 100));
    e.dead = true;
    return +(e.maxHp / avg).toFixed(1);
  }

  window.__bot = { run, ttk, manageGear, PROFILES };
})();
