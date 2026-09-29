import * as THREE from 'three';
import { QUESTS, DONE } from '../content/quests.js';
import { ITEMS } from './items.js';
import { SKILL } from './skills.js';
import { TICK } from './content.js';
import { ROADS, MINE_ENTRANCE } from '../world/map.js';
import { boulder } from '../world/resources.js';
import { tag, addSolids } from '../world/props.js';
import { buildItem } from '../ui/itemart.js';

// Runs the quests in src/content/quests.js: their stages, the conditions and effects
// that dialogue uses, rewards, the places and objects they add to the world, and
// the few mechanics a quest needs (casting for Old Gnasher, searching the wreck,
// Brom's strongbox in the Warren).

export class Quests {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.spots = [];
    this.tracked = null;
  }

  init(ui) {
    this.ui = ui;
    this.#wreck();
    const R = this.game.resources;
    for (const [qid, q] of Object.entries(QUESTS)) {
      for (const [sid, s] of Object.entries(q.spots || {})) {
        const at = this.#anchor(s.at);
        const self = this;
        const spot = R.add({
          kind: 'station', station: 'quest', quest: qid, spotId: sid, def: s, name: s.name, verb: s.verb,
          x: at.x, y: at.y, z: at.z, r: at.r ?? 0.9, h: at.h ?? 1.6, reach: at.reach ?? 2.6,
          get hidden() { return s.if ? !self.check(s.if) : false; },
        });
        this.spots.push(spot);
      }
    }
    // Keep following whichever quest you touched last.
    this.tracked = Object.keys(QUESTS).find((id) => this.active(id)) || null;
    this.ui.update();
  }

  // ------------------------------------------------------------ state
  stage(id) {
    return this.state.quests[id] ?? 0;
  }

  done(id) {
    return this.stage(id) >= DONE;
  }

  active(id) {
    const s = this.stage(id);
    return s > 0 && s < DONE;
  }

  get points() {
    return Object.entries(QUESTS).reduce((t, [id, q]) => t + (this.done(id) ? q.rewards.points : 0), 0);
  }

  set(id, n) {
    const before = this.stage(id);
    if (n === before) return;
    this.state.quests[id] = n;
    this.tracked = id;
    const q = QUESTS[id];
    if (before === 0) {
      this.game.panels.message(`Quest started: ${q.name}`, 'quest');
      this.game.audio.play('levelup');
    } else this.game.panels.message('Your quest journal has been updated.', 'quest');
    this.ui.update();
    this.ui.flash();
    this.game.save();
  }

  complete(id) {
    if (this.done(id)) return;
    const q = QUESTS[id], r = q.rewards;
    this.state.quests[id] = DONE;
    // Its quest items have done their job.
    for (const it of Object.values(ITEMS)) {
      if (it.quest !== id) continue;
      this.state.inv.remove(it.id, this.state.inv.count(it.id));
      this.state.bank.remove(it.id, this.state.bank.count(it.id));
    }
    const lines = [`${r.points} Quest point${r.points > 1 ? 's' : ''}`];
    for (const [skill, xp] of Object.entries(r.xp || {})) {
      this.state.skills.add(skill, xp);
      lines.push(`${xp.toLocaleString('en-US')} ${SKILL[skill].name} XP`);
    }
    for (const [item, n] of r.items || []) {
      this.#give(item, n);
      const name = ITEMS[item].name;
      lines.push(n > 1 ? `${n.toLocaleString('en-US')} ${/s$/.test(name) ? name : `${name}s`}` : name);
    }
    if (r.unlocks) lines.push(r.unlocks);
    this.game.panels.message(`Congratulations, quest complete: ${q.name}!`, 'quest');
    if (this.tracked === id) this.tracked = Object.keys(QUESTS).find((k) => this.active(k)) || null;
    this.ui.update();
    this.ui.complete(q, lines, (r.items || [])[0]?.[0]);
    this.game.audio.play('levelup');
    this.game.save();
  }

  // Into the pack; whatever doesn't fit goes to the bank.
  #give(item, n) {
    const added = this.state.inv.add(item, n);
    if (added < n) {
      this.state.bank.add(item, n - added);
      this.game.panels.message(`Your pack is full, so the ${ITEMS[item].name.toLowerCase()} went to your bank.`);
    }
  }

  // ------------------------------------------------------------ conditions and effects
  check(c) {
    if (!c) return true;
    const inv = this.state.inv;
    for (const [k, v] of Object.entries(c)) {
      let ok = true;
      if (k === 'quest') ok = this.stage(v[0]) === v[1];
      else if (k === 'questFrom') ok = this.stage(v[0]) >= v[1];
      else if (k === 'questBefore') ok = this.stage(v[0]) < v[1];
      else if (k === 'done') ok = this.done(v);
      else if (k === 'has') ok = inv.count(v[0]) >= (v[1] ?? 1);
      else if (k === 'lacks') ok = !inv.count(v);
      else if (k === 'level') ok = this.state.skills.level(v[0]) >= v[1];
      else if (k === 'not') ok = !this.check(v);
      else if (k === 'any') ok = v.some((x) => this.check(x));
      if (!ok) return false;
    }
    return true;
  }

  apply(d) {
    if (!d) return;
    for (const [item, n] of d.take || []) this.state.inv.remove(item, n);
    for (const [item, n] of d.give || []) this.#give(item, n);
    if (d.quest) this.set(d.quest[0], d.quest[1]);
    if (d.complete) this.complete(d.complete);
  }

  // ------------------------------------------------------------ what the map shows
  // Quest stars over people with a quest to give, and one on the tracked goal.
  markers() {
    const out = [];
    for (const [id, q] of Object.entries(QUESTS)) {
      if (this.stage(id) !== 0) continue;
      const npc = this.game.npcs.find((n) => n.def.id === q.giver);
      if (npc) out.push({ x: npc.pos.x, z: npc.pos.z, icon: 'quest', npc: npc.def.id });
    }
    const g = this.goal();
    if (g) out.push({ ...g, icon: 'goal', edge: true });
    return out;
  }

  goal() {
    const id = this.tracked;
    if (!id || !this.active(id)) return null;
    const goal = QUESTS[id].steps[this.stage(id)]?.goal;
    if (!goal) return null;
    if (goal.npc) {
      const npc = this.game.npcs.find((n) => n.def.id === goal.npc);
      return npc ? { x: npc.pos.x, z: npc.pos.z } : null;
    }
    if (goal.spot) {
      if (goal.spot === 'cave') return { x: MINE_ENTRANCE.x, z: MINE_ENTRANCE.z };
      const s = this.spots.find((p) => p.spotId === goal.spot);
      return s ? { x: s.x, z: s.z } : null;
    }
    return { x: goal.x, z: goal.z };
  }

  // Journal lines for a quest: every step reached, and whether each is behind you.
  journal(id) {
    const q = QUESTS[id], s = this.stage(id);
    const out = [];
    for (const [n, step] of Object.entries(q.steps)) if (+n <= s) out.push({ text: step.text, past: +n < s || s >= DONE });
    return out;
  }

  // Short lines about quests, for villagers' typed chat.
  summary() {
    return Object.entries(QUESTS).map(([id, q]) => {
      if (this.done(id)) return `- "${q.name}": the traveller has finished it.`;
      if (!this.active(id)) return `- "${q.name}": not started. (Given by ${this.game.npcs.find((n) => n.def.id === q.giver)?.name}.)`;
      return `- "${q.name}": in progress. Current step: ${q.steps[this.stage(id)].text}`;
    }).join('\n');
  }

  // ------------------------------------------------------------ hooks
  // Items a monster always drops while a quest needs them.
  drops(tableId) {
    const out = [];
    for (const q of Object.values(QUESTS))
      for (const d of q.drops || []) if (d.monster === tableId && this.check(d.if)) out.push([d.item, 1, false]);
    return out;
  }

  // Reading an item: shows its text, then any quest effect.
  read(id) {
    const it = ITEMS[id], g = this.game;
    g.stop();
    g.freeMouse();
    const pages = it.read;
    let i = 0;
    const show = () => {
      const last = i === pages.length - 1;
      g.talk.show(it.name, pages[i], [{ label: last ? 'Close.' : 'Read on.', run: () => (last ? finish() : (i++, show())) }], { kind: 'narrate' });
    };
    const finish = () => {
      g.endTalk();
      for (const q of Object.values(QUESTS)) {
        const r = q.reads?.[id];
        if (r && this.check(r.if)) this.apply(r.do);
      }
    };
    show();
  }

  // A quest object was used.
  use(spot) {
    const fn = this[spot.def.action];
    if (fn) fn.call(this, spot);
  }

  // Old Gnasher: bait the heavy hook, cast into the deep, and strike when he bites.
  castForGnasher(spot) {
    const g = this.game, inv = this.state.inv;
    if (!inv.count('heavy_hook')) return g.panels.message('Your hooks would never hold him. Brom could forge a heavy one.', 'bad');
    if (!inv.count('raw_shrimp')) return g.panels.message('You need a raw shrimp to bait the heavy hook.', 'bad');
    g.panels.message('You bait the heavy hook with a shrimp and cast it into the deep water.');
    const bite = 3 + Math.floor(Math.random() * 5);
    let ticks = 0;
    g.begin(spot, {
      clip: 'Idle_Torch_Loop', interval: TICK * 2, tool: 'fly_rod',
      tick: () => {
        ticks++;
        const a = g.activity;
        if (a.strike) {
          // Too slow: he strips the hook.
          inv.remove('raw_shrimp', 1);
          g.panels.message('The line goes slack. Gnasher has stripped the shrimp off your hook.', 'bad');
          this.ui.strike(false);
          return g.stop();
        }
        if (ticks < bite) {
          if (Math.random() < 0.4) g.audio.play('splash', spot, 0.5);
          return;
        }
        a.strike = { until: g.time + 1.1 };
        a.interval = 1.1;
        a.next = g.time + 1.1;
        a.onStrike = () => this.#landGnasher(spot);
        g.audio.play('splash', spot, 1.4);
        g.audio.play('tell', spot, 1.2);
        g.rig.shake = 0.5;
        this.ui.strike(true);
        g.panels.message('Something huge takes the bait! Strike!', 'quest');
      },
      onStop: () => this.ui.strike(false),
    });
  }

  #landGnasher(spot) {
    const g = this.game;
    this.ui.strike(false);
    g.stop();
    this.state.inv.remove('raw_shrimp', 1);
    g.rig.shake = 1.2;
    g.audio.play('splash', spot, 1.6);
    g.audio.play('crit', spot);
    g.player.perform('Interact', { speed: 0.8 });
    g.panels.message('You strike! After a long, furious fight you haul Old Gnasher onto the jetty!', 'good');
    this.state.inv.add('old_gnasher', 1);
    this.set('gnasher', 3);
  }

  searchWreck() {
    const g = this.game;
    g.stop();
    g.player.perform('PickUp_Table', { speed: 1.1 });
    if (this.stage('ledger') === 2) {
      g.talk.show('Wrecked cart', 'Among the splinters you find a scrap of red cloth snagged on a nail: bandit colours. Deep ruts lead off the road and east into the woods.', [{ label: 'Close.', run: () => g.endTalk() }], { kind: 'narrate' });
      g.freeMouse();
      this.set('ledger', 3);
    } else if (this.stage('ledger') < 2) g.panels.message('A cart with a smashed wheel. Someone left in a hurry, and took the load with them.');
    else g.panels.message('Nothing else here but splinters.');
  }

  // Brom's strongbox waits by Grubnak while the quest needs it.
  dressDungeon(d) {
    if (!(this.stage('ledger') === 4 && !this.state.inv.count('ore_strongbox'))) return;
    const p = d.bossPos;
    const cells = d.cellsOf(d.bossRoom).filter((c) => c.distanceTo(p) > 2.5 && c.distanceTo(p) < 6);
    const c = cells[0] || p.clone().add(new THREE.Vector3(3, 0, 0));
    const box = buildItem('ore_strongbox', this.game.assets);
    box.scale.setScalar(2.2);
    box.position.set(c.x, 0, c.z);
    box.rotation.y = Math.random() * Math.PI * 2;
    d.scene.add(box);
    const self = this;
    d.interactables.push({
      kind: 'station', station: 'quest', def: { action: 'takeStrongbox' }, name: "Brom's strongbox", verb: 'Take', x: c.x, y: 0.3, z: c.z, r: 0.5, h: 0.8, reach: 2.2, model: box,
      get hidden() { return self.stage('ledger') !== 4 || self.state.inv.count('ore_strongbox') > 0; },
    });
  }

  takeStrongbox(spot) {
    const g = this.game;
    if (g.fight.boss?.alive) return g.panels.message('Grubnak is sitting right beside it. You will have to deal with him first.', 'bad');
    if (!this.state.inv.room('ore_strongbox')) return g.panels.message('Your pack is too full.', 'bad');
    g.player.perform('PickUp_Table', { speed: 1.2 });
    spot.model?.parent?.remove(spot.model);
    this.state.inv.add('ore_strongbox', 1);
    g.panels.message("You heave up Brom's strongbox. It clinks.", 'good');
    this.set('ledger', 5);
  }

  // ------------------------------------------------------------ places
  #anchor(name) {
    const R = this.game.resources;
    if (name === 'jettyEnd') {
      const e = R.jettyEnd;
      return { x: e.x + e.dx * 1.6, y: 0.4, z: e.z + e.dz * 1.6, r: 1.2, h: 1.2, reach: 3.2 };
    }
    if (name === 'wreck') return { ...this.wreckAt, y: this.wreckAt.y + 0.8, r: 1.4, h: 1.8, reach: 2.6 };
    return { x: 0, y: 0, z: 0 };
  }

  // A cart smashed on the east road, where the woods begin: tilted on a broken
  // wheel, with its crates split and a trail of spilled ore.
  #wreck() {
    const w = this.game.world, kit = w.village.kit;
    const road = ROADS[1].pts;
    let best = 0;
    for (let i = 1; i < road.length; i++) if (Math.abs(road[i][0] - 196) < Math.abs(road[best][0] - 196)) best = i;
    const [ax, az] = road[best], [bx, bz] = road[Math.min(road.length - 1, best + 1)];
    const len = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / len, tz = (bz - az) / len;
    const x = ax - tz * 4.5, z = az + tx * 4.5, y = w.heightAt(x, z);
    const cart = kit.instance('Prop_Wagon');
    cart.position.set(x, y - 0.25, z);
    cart.rotation.set(0, Math.atan2(tx, tz) + 0.5, 0.22);
    cart.userData.audit = { kit: 'Prop_Wagon', tilted: true };
    this.game.scene.add(cart);
    // Its bed and hay heap (the tilt is a few degrees, so the same shapes serve).
    addSolids(kit, w.colliders, 'Prop_Wagon', x, y - 0.25, z, cart.rotation.y);
    // Crates split open and a barrel on its side, lying where they fell.
    const junk = [['Crate_Wooden', 1.8, 1.2, 0.9, 1.3], ['Crate_Wooden', -1.6, 2.2, 2.2, 1.57], ['Barrel', 2.4, -0.8, 0.3, 1.57]];
    for (const [name, dx, dz, ry, rz] of junk) {
      const o = kit.instance(name);
      const px = x + dx, pz = z + dz;
      const gy = w.heightAt(px, pz);
      o.position.set(px, gy + (rz ? 0.3 : 0), pz);
      o.rotation.set(0, ry, rz);
      o.userData.audit = { kit: name, tilted: true };
      this.game.scene.add(o);
      // Lying on its side: about a crate's width across and a barrel's width high.
      if (name === 'Barrel') w.colliders.addBox(px, pz, 0.47, 0.36, ry, gy - 0.2, gy + 0.7).floor = true;
      else w.colliders.addBox(px, pz, 0.46, 0.46, ry, gy - 0.2, gy + 0.9).floor = true;
    }
    // Ore spilled along the ruts toward the woods.
    const ore = new THREE.MeshStandardMaterial({ color: 0x6b3a26, roughness: 0.8, metalness: 0.3 });
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) {
      const d = 1.5 + i * 0.9, px = x + tx * d + (rnd() - 0.5) * 1.6, pz = z + tz * d + (rnd() - 0.5) * 1.6;
      const m = new THREE.Mesh(boulder(0.09 + rnd() * 0.08, rnd), ore);
      m.position.set(px, w.heightAt(px, pz) + 0.03, pz);
      m.castShadow = true;
      this.game.scene.add(m);
    }
    this.wreckAt = { x, y, z };
  }
}
