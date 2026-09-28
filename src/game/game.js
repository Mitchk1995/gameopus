import * as THREE from 'three';
import { GameState, SLOTS } from './state.js';
import { ITEMS } from './items.js';
import { SKILL } from './skills.js';
import { TICK, TREES, SPECIES_TREE, FISHING, COOKING, SMELTING, SMITHING, FLETCHING, CRAFTING, rate, unlocks } from './content.js';
import { Panels } from '../ui/panels.js';
import { Menus, Talk } from '../ui/menus.js';
import { Minimap } from '../ui/minimap.js';
import { Fight } from './fight.js';
import { Audio } from '../engine/audio.js';
import { Dungeon } from '../dungeon/dungeon.js';
import { Pets } from './pets.js';
import { icon } from '../ui/icons.js';
import { IconStudio, buildItem, setBarkTextures } from '../ui/itemart.js';
import { Resources } from '../world/resources.js';
import { Npc } from '../actors/npcs.js';
import { VILLAGE, SPAWN } from '../world/map.js';

// The game on top of the world: what you're looking at and can use, skilling loops
// that run on 0.6 s ticks, the inventory and bank, shops, villagers and saving.

// How held things sit in the right hand, in the hand bone's space: fingers run along
// +Y, the thumb side is +Z, so handles leave the fist along +Z with edges facing forward.
const HOLD = {
  default: { p: [-0.025, 0.075, 0], r: [Math.PI / 2, Math.PI, 0] },
};

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.activity = null;
    this.time = 0;
    this.timeScale = 1;
    this.realm = 'world';
    this.audio = new Audio();
    this.saveTimer = 0;
    this.target = null;
    this.npcs = [];
  }

  async init() {
    const { assets, world } = this;
    this.state = GameState.load();
    this.items = ITEMS;
    const hdr = await assets.hdr('sky/sky_1k.hdr');
    this.studio = new IconStudio(assets, hdr);
    const barks = await Promise.all(['birch', 'oak', 'pine'].map((b) => assets.texture(`trees/${b}_color.webp`)));
    setBarkTextures({ birch: barks[0], oak: barks[1], pine: barks[2] });
    this.unlockList = unlocks();
    this.panels = new Panels({
      state: this.state,
      studio: this.studio,
      actions: {
        primary: (i) => this.#primary(i),
        options: (i) => this.#options(i),
        drop: (i) => this.#drop(i),
        unequip: (slot) => this.unequip(slot),
        useOn: (a, b) => this.#useOn(a, b),
        guide: (skill) => this.#guide(skill),
        pet: (id) => this.pets.toggle(id),
        nextUnlock: (skill, lvl) => this.unlockList.find((u) => u.skill === skill && u.level > lvl),
        unlocksAt: (skill, lvl) => this.unlockList.filter((u) => u.skill === skill && u.level === lvl).map((u) => u.label.toLowerCase()),
      },
    });
    this.menus = new Menus({ state: this.state, studio: this.studio, onClose: (kind) => this.#afterClose(kind) });
    this.talk = new Talk();
    this.resources = await new Resources({ scene: this.scene, assets, world, kit: world.village.kit }).load();
    await this.#villagers();
    this.#stations();
    this.minimap = new Minimap({ world, markers: () => this.#markers() });
    this.#vitals();
    this.fight = new Fight(this);
    await this.fight.init();
    this.pets = new Pets(this);
    await this.pets.init();
    this.state.skills.listeners.add(({ after, before }) => after > before && this.audio.play('levelup'));
    this.#hand();
    this.#showHeld();
    // Put the player back where they left off.
    const p = this.state.pos;
    if (p && Number.isFinite(p.x)) this.player.spawn(p.x, p.z, p.yaw ?? SPAWN.facing);
    this.rig.yaw = this.player.yaw + Math.PI;
    this.panels.message('Welcome to Ashford. Tab opens your pack, E uses what you look at.', 'game');
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
  }

  // Slows the simulation for a moment of real time (hit-stop, parries, perfect dodges).
  slow(scale, seconds) {
    this.fx = { scale, left: seconds };
  }

  // Called with real time each frame; returns the scale for the simulation.
  timeStep(realDt) {
    if (!this.fx) return 1;
    this.fx.left -= realDt;
    if (this.fx.left <= 0) this.fx = null;
    return this.fx ? this.fx.scale : 1;
  }

  save() {
    this.state.pos = { x: +this.player.pos.x.toFixed(2), z: +this.player.pos.z.toFixed(2), yaw: +this.player.yaw.toFixed(3) };
    this.state.save();
  }

  // ------------------------------------------------------------ interface state
  get uiOpen() {
    return this.panels.isOpen || this.menus.isOpen || this.talk.isOpen;
  }

  // Windows free the mouse; closing the last one takes it back.
  #freeMouse() {
    this.input.unlock();
  }

  #takeMouse() {
    if (!this.uiOpen) this.input.lock();
  }

  togglePack(tab = 'inv') {
    if (this.panels.isOpen && this.panels.tab === tab && !this.menus.isOpen) {
      this.panels.close();
      this.#takeMouse();
    } else {
      this.panels.open(tab);
      this.#freeMouse();
    }
  }

  closeAll() {
    this.#endTalk(false);
    this.panels.close();
    this.menus.close();
  }

  #afterClose(kind) {
    if (kind === 'bank' || kind === 'shop') this.panels.close();
    this.mode = null;
    this.#takeMouse();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.time += dt;
    const input = this.input;
    if (input.hit('Tab') || input.hit('KeyI')) this.togglePack('inv');
    if (input.hit('KeyK')) this.togglePack('skills');
    if (input.hit('KeyL')) this.togglePack('worn');
    if (input.hit('KeyC')) this.togglePack('log');
    if (input.hit('Escape') && this.uiOpen) this.closeAll();

    // What's under the crosshair.
    this.target = this.menus.isOpen || this.talk.isOpen ? null : this.#findTarget();
    this.hud.setPrompt(this.target ? this.#prompt(this.target) : null);
    if (input.hit('KeyE') && this.target) this.#interact(this.target);

    // Moving away or starting to walk ends work.
    if (this.activity) {
      if (this.player.state !== 'act') this.stop();
      else if (this.time >= this.activity.next) {
        this.activity.next = this.time + this.activity.interval;
        this.activity.tick();
      }
    }
    if (this.realm === 'world') {
      for (const n of this.npcs) n.update(dt, this.player);
      this.resources.update(dt);
    }
    this.fight.update(dt);
    this.pets.update(dt, this.player);
    this.minimap.update(this.player, this.rig.yaw);
    this.audio.setListener(this.player.pos.x, this.player.pos.z, this.rig.yaw);
    this.#updateFalling(dt);
    this.saveTimer += dt;
    this.state.played += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.save();
    }
  }

  // ------------------------------------------------------------ targeting
  #candidates() {
    const P = this.player.pos, out = [];
    if (this.realm === 'dungeon') {
      out.push(...this.dungeon.near(P.x, P.z, 6), ...this.fight.groundTargets(P.x, P.z, 4));
      return out;
    }
    for (const t of this.world.forest.near(P.x, P.z, 6)) {
      const kind = SPECIES_TREE[t.variant.species];
      if (!kind) continue;
      out.push({ kind: 'tree', tree: t, def: TREES[kind], x: t.x, y: t.y + 2, z: t.z, r: t.radius + 0.2, h: 4.5, reach: t.radius + 1.8 });
    }
    out.push(...this.resources.near(P.x, P.z, 8));
    for (const n of this.npcs) if (n.pos.distanceTo(P) < 8) out.push(n.target);
    out.push(...this.fight.groundTargets(P.x, P.z, 4));
    return out;
  }

  #findTarget() {
    const cam = this.camera.position, fwd = this.rig.forward(new THREE.Vector3());
    const P = this.player.pos;
    let best = null, bestT = Infinity;
    const cands = this.#candidates();
    for (const c of cands) {
      const reachGap = Math.hypot(c.x - P.x, c.z - P.z) - (c.r || 0);
      if (reachGap > c.reach) continue;
      const t = rayCylinder(cam, fwd, c);
      if (t !== null && t < bestT) {
        best = c;
        bestT = t;
      }
    }
    if (best) return best;
    // Forgiving fallback: the closest thing right in front of the player.
    const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
    let bestD = Infinity;
    for (const c of cands) {
      const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz);
      if (d - (c.r || 0) > Math.min(c.reach, 1.9)) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.55) continue;
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  #prompt(t) {
    const lvl = (skill, need) => (this.state.skills.level(skill) < need ? `${SKILL[skill].name} ${need}` : null);
    switch (t.kind) {
      case 'tree': return { verb: 'Chop down', noun: t.def.name, level: lvl('woodcutting', t.def.level) };
      case 'rock': return t.depleted ? { verb: 'Prospect', noun: 'Empty rock' } : { verb: 'Mine', noun: t.def.name, level: lvl('mining', t.def.level) };
      case 'fish': return { verb: t.def.verb, noun: t.def.name, level: lvl('fishing', t.def.catches[0].level) };
      case 'flax': return { verb: 'Pick', noun: 'Flax' };
      case 'npc': return { verb: t.npc.def.verb || 'Talk to', noun: t.npc.name };
      case 'station': return { verb: t.verb || 'Use', noun: t.name };
      case 'item': return { verb: 'Take', noun: `${ITEMS[t.item.id].name}${t.item.n > 1 ? ` (${t.item.n})` : ''}` };
      default: return null;
    }
  }

  #interact(t) {
    this.panels.cancelUse();
    switch (t.kind) {
      case 'tree': return this.#chop(t);
      case 'rock': return this.#mine(t);
      case 'fish': return this.#fish(t);
      case 'flax': return this.#pickFlax(t);
      case 'npc': return this.#talkTo(t.npc);
      case 'station': return this.#station(t);
      case 'item': return this.fight.take(t.item);
    }
  }

  // ------------------------------------------------------------ activities
  #begin(target, { clip, interval, tick, tool = null, speed = 1, ticksFirst = 1 }) {
    this.stop();
    this.player.faceTowards(target.x, target.z);
    this.player.perform(clip, { loop: true, speed, onEnd: () => this.stop() });
    this.#showHeld(tool);
    this.activity = { target, interval, tick, next: this.time + interval * ticksFirst };
  }

  stop() {
    if (!this.activity) return;
    this.activity = null;
    if (this.player.state === 'act') this.player.stopAction();
    this.#showHeld();
  }

  #need(skill, level, what) {
    if (this.state.skills.level(skill) >= level) return true;
    this.panels.message(`You need ${SKILL[skill].name} level ${level} to ${what}.`, 'bad');
    return false;
  }

  #chop(t) {
    const def = t.def, axe = this.state.bestTool('axe');
    if (!axe) return this.panels.message('You need an axe to chop down this tree.', 'bad');
    if (!this.#need('woodcutting', def.level, `chop down ${def.name.toLowerCase()}s`)) return;
    if (!this.state.inv.room(def.log)) return this.panels.message('Your pack is too full to hold any more logs.', 'bad');
    this.panels.message('You swing your axe at the tree.');
    this.#begin(t, {
      clip: 'TreeChopping_Loop', interval: TICK * 4, tool: axe, speed: 1.1,
      tick: () => {
        this.audio.play('chop', t);
        if (!this.state.inv.room(def.log)) {
          this.panels.message('Your pack is too full to hold any more logs.', 'bad');
          return this.stop();
        }
        if (Math.random() < rate(def, this.state.skills.level('woodcutting'), ITEMS[axe].power)) {
          this.#gain(def.log, 1, 'woodcutting', def.xp, `You get some ${ITEMS[def.log].name.toLowerCase()}.`);
          if (Math.random() < def.fell) {
            this.#fell(t.tree, def);
            this.stop();
          }
        }
      },
    });
  }

  #mine(r) {
    if (r.depleted) return this.panels.message('There is currently no ore available in this rock.');
    const def = r.def, pick = this.state.bestTool('pickaxe');
    if (!pick) return this.panels.message('You need a pickaxe to mine this rock.', 'bad');
    if (!this.#need('mining', def.level, `mine ${def.name.toLowerCase().replace(' rock', '')}`)) return;
    if (!this.state.inv.room(def.ore)) return this.panels.message('Your pack is too full to hold any more ore.', 'bad');
    const power = ITEMS[pick].power;
    this.panels.message('You swing your pickaxe at the rock.');
    this.#begin(r, {
      clip: 'OverhandThrow', interval: TICK * Math.max(3, 6 - power), tool: pick, speed: 0.9,
      tick: () => {
        this.audio.play('mine', r);
        if (r.depleted) return this.stop();
        if (!this.state.inv.room(def.ore)) {
          this.panels.message('Your pack is too full to hold any more ore.', 'bad');
          return this.stop();
        }
        if (Math.random() < rate(def, this.state.skills.level('mining'), power)) {
          this.#gain(def.ore, 1, 'mining', def.xp, `You manage to mine some ${ITEMS[def.ore].name.toLowerCase().replace(' ore', '')}.`);
          this.resources.setRock(r, true, def.respawn[0] + Math.random() * (def.respawn[1] - def.respawn[0]));
          this.stop();
        }
      },
    });
  }

  #fish(s) {
    const def = s.def;
    const tool = this.state.bestTool(def.tool);
    if (!tool) return this.panels.message(`You need a ${def.tool === 'net' ? 'small fishing net' : 'fly fishing rod'} to fish here.`, 'bad');
    if (!this.#need('fishing', def.catches[0].level, `fish here`)) return;
    if (def.bait && !this.state.inv.has(def.bait)) return this.panels.message(`You need ${ITEMS[def.bait].name.toLowerCase()}s to fish here.`, 'bad');
    this.panels.message(def.tool === 'net' ? 'You cast out your net.' : 'You cast out your line.');
    this.#begin(s, {
      clip: def.tool === 'net' ? 'Fixing_Kneeling' : 'Idle_Torch_Loop', interval: TICK * 5, tool,
      tick: () => {
        if (Math.random() < 0.5) this.audio.play('splash', s, 0.6);
        const options = def.catches.filter((c) => this.state.skills.level('fishing') >= c.level).reverse();
        if (def.bait && !this.state.inv.has(def.bait)) {
          this.panels.message(`You have run out of ${ITEMS[def.bait].name.toLowerCase()}s.`, 'bad');
          return this.stop();
        }
        for (const c of options) {
          if (!this.state.inv.room(c.fish)) {
            this.panels.message('Your pack is too full to hold any more fish.', 'bad');
            return this.stop();
          }
          if (Math.random() < rate(c, this.state.skills.level('fishing'))) {
            if (def.bait) this.state.inv.remove(def.bait, 1);
            this.#gain(c.fish, 1, 'fishing', c.xp, `You catch ${aOrSome(ITEMS[c.fish].name.replace('Raw ', '').toLowerCase())}.`);
            return;
          }
        }
      },
    });
  }

  #pickFlax(f) {
    if (!this.state.inv.room('flax')) return this.panels.message('Your pack is too full.', 'bad');
    this.stop();
    this.player.faceTowards(f.x, f.z);
    this.player.perform('PickUp_Table', { speed: 1.4 });
    setTimeout(() => {
      if (f.plant.picked) return;
      this.resources.pickFlax(f.plant);
      this.state.inv.add('flax', 1);
      this.panels.message('You pick some flax.');
    }, 450);
  }

  // Adds an item and experience, with a message, and a small chance of a pet.
  #gain(id, n, skill, xp, text) {
    this.state.inv.add(id, n);
    if (text) this.panels.message(text);
    this.state.skills.add(skill, xp);
    this.pets.roll(skill);
  }

  // Records a unique in the collection log.
  logUnique(id) {
    const log = (this.state.collection.log ??= {});
    const first = !log[id];
    log[id] = (log[id] || 0) + 1;
    if (first) this.panels.message(`New item added to your collection log: ${ITEMS[id].name}.`, 'good');
    this.panels.renderLog?.();
  }

  // ------------------------------------------------------------ felled trees
  #fell(tree, def) {
    const f = this.world.forest;
    tree.felled = true;
    if (tree.collider) this.world.colliders.remove(tree.collider);
    f.lastUpdate.set(1e9, 0, 0);
    // A copy of the tree topples over; a stump stays behind.
    const v = tree.variant;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(v.near.branches, v.barkMat), new THREE.Mesh(v.near.leaves, v.leafMat));
    g.position.set(tree.x, tree.y, tree.z);
    g.rotation.y = tree.rot;
    g.scale.setScalar(tree.scale);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const pivot = new THREE.Group();
    pivot.position.set(tree.x, tree.y + 0.4, tree.z);
    g.position.set(0, -0.4, 0);
    pivot.add(g);
    const away = Math.atan2(tree.x - this.player.pos.x, tree.z - this.player.pos.z);
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = away;
    g.rotation.y = tree.rot - away;
    this.scene.add(pivot);
    const stump = this.#stump(tree);
    this.falling = this.falling || [];
    this.falling.push({ pivot, t: 0, tree, stump, respawn: def.respawn[0] + Math.random() * (def.respawn[1] - def.respawn[0]) });
    this.panels.message('The tree falls.');
    this.audio.play('chop', tree, 1.4);
  }

  #stump(tree) {
    const s = new THREE.Group();
    const bark = tree.variant.barkMat;
    const r = Math.max(0.2, tree.radius * 0.8);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 1.15, 0.55, 12), bark);
    m.position.y = 0.2;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 12), new THREE.MeshStandardMaterial({ color: 0xc9a476, roughness: 0.8 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.475;
    s.add(m, top);
    s.position.set(tree.x, tree.y, tree.z);
    s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(s);
    return s;
  }

  #updateFalling(dt) {
    if (!this.falling?.length) return;
    for (const f of this.falling) {
      f.t += dt;
      if (f.pivot) {
        // Topple with gravity, bounce slightly, then sink away.
        const k = Math.min(1, f.t / 1.6);
        f.pivot.rotation.x = Math.min(Math.PI / 2 - 0.08, (k * k) * (Math.PI / 2)) + (k >= 1 ? Math.sin((f.t - 1.6) * 12) * Math.exp(-(f.t - 1.6) * 6) * 0.04 : 0);
        if (f.t > 3.5) f.pivot.position.y -= dt * 1.5;
        if (f.t > 5) {
          this.scene.remove(f.pivot);
          f.pivot = null;
        }
      }
      if (f.t >= f.respawn) {
        f.tree.felled = false;
        if (f.tree.collider) f.tree.collider.removed = false;
        this.world.forest.lastUpdate.set(1e9, 0, 0);
        this.scene.remove(f.stump);
        f.done = true;
      }
    }
    this.falling = this.falling.filter((f) => !f.done);
  }

  // ------------------------------------------------------------ stations and making
  #stations() {
    // The well wets clay; the bank counter opens the bank.
    const w = this.world.village.places.well;
    this.resources.add({ kind: 'station', station: 'well', name: 'Well', verb: 'Draw water at', x: w.x, y: VILLAGE.y + 0.9, z: w.z, r: 1.2, h: 1.8, reach: 2.4 });
  }

  #station(s) {
    const lv = (skill) => this.state.skills.level(skill);
    const has = (needs, times = 1) => needs.every(([id, n]) => this.state.inv.count(id) >= n * times);
    const list = (recipes, skill) => recipes.map((r) => ({ ...r, skill, n: r.n || 1, locked: lv(skill) < r.level, short: !has(r.needs) }));
    switch (s.station) {
      case 'furnace':
        return this.#makeMenu(s, 'Furnace', 'Smelt ore into bars', list(SMELTING, 'smithing'), { skill: 'smithing', clip: 'Interact', ticks: 4 });
      case 'anvil':
        if (!this.state.inv.has('hammer')) return this.panels.message('You need a hammer to work the metal with.', 'bad');
        return this.#makeMenu(s, 'Anvil', 'What would you like to make?', list(SMITHING.filter((r) => this.state.inv.has(r.needs[0][0]) || lv('smithing') >= r.level - 5).slice(0, 36), 'smithing'), { skill: 'smithing', clip: 'Melee_Hook', ticks: 5, tool: 'hammer' });
      case 'fire': {
        const rs = COOKING.map((c) => ({ out: c.out, level: c.level, xp: c.xp, needs: [[c.raw, 1]], cook: c }));
        return this.#makeMenu(s, 'Cooking fire', 'What would you like to cook?', list(rs, 'cooking'), { skill: 'cooking', clip: 'Fixing_Kneeling', ticks: 4 });
      }
      case 'wheel':
        return this.#makeMenu(s, 'Spinning wheel', 'Spin flax into bow string', list(CRAFTING.wheel, 'crafting'), { skill: 'crafting', clip: 'Interact', ticks: 3 });
      case 'potter':
        return this.#makeMenu(s, "Potter's wheel", 'Shape soft clay', list(CRAFTING.potter, 'crafting'), { skill: 'crafting', clip: 'Fixing_Kneeling', ticks: 3 });
      case 'kiln':
        return this.#makeMenu(s, 'Pottery kiln', 'Fire your pottery', list(CRAFTING.kiln, 'crafting'), { skill: 'crafting', clip: 'Interact', ticks: 3 });
      case 'well': {
        const clay = this.state.inv.count('clay');
        if (!clay) return this.panels.message('You draw some water, then pour it back. Clay would soften in it.');
        return this.#produce(s, { out: 'soft_clay', needs: [['clay', 1]], xp: 0, n: 1 }, Infinity, { skill: null, clip: 'Interact', ticks: 2, text: 'You soften the clay with water.' });
      }
      case 'bank':
        return this.openBank();
      case 'cave':
        return this.enterDungeon();
      case 'rope':
        return this.exitDungeon();
      case 'chest':
        return this.#openChest(s);
    }
  }

  // ------------------------------------------------------------ the Old Warren
  get activeScene() {
    return this.realm === 'dungeon' ? this.dungeon.scene : this.scene;
  }

  get activeWorld() {
    return this.realm === 'dungeon' ? this.dungeon : this.world;
  }

  async enterDungeon() {
    if (this.entering) return;
    this.entering = true;
    this.stop();
    this.closeAll();
    this.fight.ui.setDead(false);
    this.hud.fade?.(true);
    const seed = (Date.now() ^ (Math.random() * 1e9)) & 0x7fffffff;
    this.dungeon = new Dungeon({ kit: this.world.village.kit, assets: this.assets }).build(seed);
    this.realm = 'dungeon';
    this.dungeon.scene.add(this.hero.root);
    // three.js refreshes each skeleton once per frame number, and the world's shadow
    // pass has already stamped the hero's with the coming one. With no shadow pass down
    // here to refresh it, the first frame would draw the body where it stood up top.
    this.renderer.info.render.frame++;
    this.player.world = this.dungeon;
    this.rig.world = this.dungeon;
    const s = this.dungeon.startPos;
    this.player.spawn(s.x, s.z, 0);
    this.rig.yaw = Math.PI;
    this.rig.snap();
    await this.fight.spawnDungeon(this.dungeon);
    this.pets.moveTo(this.dungeon.scene, this.player.pos);
    this.minimap.setDungeon(this.dungeon);
    this.audio.indoors = true;
    this.entering = false;
    this.hud.fade?.(false);
    this.panels.message('You climb down into the Old Warren. It stinks of goblin, and somewhere below, something big is snoring.');
  }

  exitDungeon(dead = false) {
    if (this.realm !== 'dungeon') return;
    this.stop();
    this.fight.clearDungeon();
    this.scene.add(this.hero.root);
    this.player.world = this.world;
    this.rig.world = this.world;
    this.realm = 'world';
    this.dungeon.scene.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose();
      }
    });
    this.dungeon = null;
    const e = this.resources.caveExit;
    if (!dead) {
      this.player.spawn(e.x, e.z, e.facing);
      this.rig.yaw = e.facing + Math.PI;
      // Look down a little, so the camera clears the slope up to the cave mouth.
      this.rig.pitch = Math.min(this.rig.pitch, -0.42);
      this.rig.snap();
    }
    this.pets.moveTo(this.scene, this.player.pos);
    this.minimap.setDungeon(null);
    this.audio.indoors = false;
  }

  #openChest(c) {
    if (c.opened) return;
    c.opened = c.hidden = true;
    this.player.faceTowards(c.x, c.z);
    this.player.perform('Chest_Open', { speed: 1.2 });
    this.audio.play('click', c);
    const rich = c.depth > 50;
    const loot = [['coins', 15 + Math.floor(Math.random() * (rich ? 120 : 50))]];
    const extra = rich ? ['iron_bar', 'steel_bar', 'iron_full_helm', 'salmon', 'coal', 'iron_arrow'] : ['bronze_bar', 'iron_ore', 'trout', 'bronze_arrow', 'iron_dagger', 'feather'];
    const pick = extra[Math.floor(Math.random() * extra.length)];
    loot.push([pick, ITEMS[pick].stack ? 8 + Math.floor(Math.random() * 12) : 1]);
    const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
    const spill = () => loot.forEach(([id, n], i) => {
      const side = (i - (loot.length - 1) / 2) * 0.7;
      this.fight.drop(id, n, c.x + fx * 0.95 + fz * side, c.z + fz * 0.95 - fx * side);
    });
    setTimeout(() => this.dungeon?.chests.includes(c) && spill(), 500);
  }

  #makeMenu(s, title, sub, recipes, how) {
    this.stop();
    this.menus.openMake({ title, sub, recipes, onMake: (r, qty) => this.#produce(s, r, qty, how) });
    this.#freeMouse();
  }

  // Runs a recipe on ticks until the count is reached or materials run out.
  #produce(target, r, qty, { skill, clip, ticks, tool = null, text = null }) {
    let made = 0;
    const needs = r.needs;
    const can = () => needs.every(([id, n]) => this.state.inv.count(id) >= n);
    if (!can()) return this.panels.message("You don't have the materials for that.", 'bad');
    this.#begin(target, {
      clip, interval: TICK * ticks, tool, ticksFirst: 1,
      tick: () => {
        if (!can() || made >= qty) return this.stop();
        this.audio.play(r.cook ? 'sizzle' : skill === 'smithing' && tool === 'hammer' ? 'hammer' : skill === 'smithing' ? 'fire' : 'click', target);
        for (const [id, n] of needs) this.state.inv.remove(id, n);
        made++;
        if (r.cook) {
          const c = r.cook, lvl = this.state.skills.level('cooking');
          const burn = lvl >= c.stopBurn ? 0 : c.burn * (1 - (lvl - c.level) / (c.stopBurn - c.level));
          if (Math.random() < burn) {
            this.state.inv.add('burnt_fish', 1);
            this.panels.message('You accidentally burn it.', 'bad');
          } else this.#gain(r.out, 1, 'cooking', c.xp, `You cook the ${ITEMS[c.raw].name.replace('Raw ', '').toLowerCase()}.`);
        } else if (r.success !== undefined && Math.random() > r.success) {
          this.panels.message('The ore is too impure and you fail to refine it.', 'bad');
        } else {
          this.state.inv.add(r.out, r.n || 1);
          if (skill) this.state.skills.add(skill, r.xp);
          this.panels.message(text || `You make ${aOrSome(ITEMS[r.out].name.toLowerCase(), r.n)}.`);
        }
        if (!can() || made >= qty) this.stop();
      },
    });
  }

  // ------------------------------------------------------------ inventory actions
  #primary(i) {
    const s = this.state.inv.slots[i];
    const it = ITEMS[s.id];
    if (this.mode === 'bank') return this.#deposit(i, this.menus.qty);
    if (this.mode === 'shop') return this.#sell(i, this.menus.qty === 10 ? 10 : this.menus.qty);
    if (it.food) return this.#eat(i);
    if (it.equip) return this.equip(i);
    this.panels.beginUse(i);
  }

  #options(i) {
    const s = this.state.inv.slots[i], it = ITEMS[s.id];
    const name = `<span class="n">${it.name}</span>`;
    const o = [];
    if (this.mode === 'bank') {
      for (const n of [1, 5, 10]) o.push({ label: `Deposit-${n} ${name}`, run: () => this.#deposit(i, n) });
      o.push({ label: `Deposit-All ${name}`, run: () => this.#deposit(i, Infinity) });
      return o;
    }
    if (this.mode === 'shop') {
      o.push({ label: `Value ${name}`, run: () => this.panels.message(`${it.name}: the shop will pay ${this.#sellPrice(s.id)} coins.`) });
      for (const n of [1, 5, 10]) o.push({ label: `Sell ${n} ${name}`, run: () => this.#sell(i, n) });
      return o;
    }
    if (it.food) o.push({ label: `Eat ${name}`, run: () => this.#eat(i) });
    if (it.equip) o.push({ label: `${it.equip === 'weapon' || it.equip === 'ammo' ? 'Wield' : 'Wear'} ${name}`, run: () => this.equip(i) });
    o.push({ label: `Use ${name}`, run: () => this.panels.beginUse(i) });
    o.push({ label: `Drop ${name}`, run: () => this.#drop(i) });
    o.push({ label: `Examine ${name}`, run: () => this.panels.message(it.examine || it.name) });
    return o;
  }

  #drop(i) {
    const s = this.state.inv.slots[i];
    if (!s) return;
    this.state.inv.remove(s.id, s.n, i);
    this.panels.message(`You drop the ${ITEMS[s.id].name.toLowerCase()}.`);
  }

  #eat(i) {
    const s = this.state.inv.slots[i], it = ITEMS[s.id];
    this.state.inv.remove(s.id, 1, i);
    const before = this.state.hp;
    this.state.hp = Math.min(this.state.maxHp, this.state.hp + it.heal);
    this.panels.message(`You eat the ${it.name.toLowerCase()}.${this.state.hp > before ? ' It heals some health.' : ''}`);
    this.state.changed('hp');
  }

  equip(i) {
    const s = this.state.inv.slots[i], it = ITEMS[s.id];
    const miss = this.state.unmet(s.id);
    if (miss) return this.panels.message(`You need ${SKILL[miss.skill].name} level ${miss.lvl} to ${it.equip === 'weapon' ? 'wield' : 'wear'} that.`, 'bad');
    const slot = it.equip;
    if (slot === 'ammo') {
      const n = s.n;
      if (this.state.equip.ammo && this.state.equip.ammo !== s.id) this.unequip('ammo');
      this.state.inv.remove(s.id, n, i);
      this.state.equip.ammo = s.id;
      this.state.ammo += n;
    } else {
      this.state.inv.remove(s.id, 1, i);
      const old = this.state.equip[slot];
      if (old) this.state.inv.add(old, 1);
      this.state.equip[slot] = s.id;
      if (it.twoHanded && this.state.equip.shield) this.unequip('shield');
      if (slot === 'shield' && ITEMS[this.state.equip.weapon]?.twoHanded) this.unequip('weapon');
    }
    this.panels.renderWorn();
    this.#showHeld();
    this.state.changed('equip');
  }

  unequip(slot) {
    const id = this.state.equip[slot];
    if (!id) return;
    const n = slot === 'ammo' ? this.state.ammo : 1;
    if (this.state.inv.room(id) < (ITEMS[id].stack ? 1 : n)) return this.panels.message('You have no room in your pack.', 'bad');
    this.state.inv.add(id, n);
    this.state.equip[slot] = null;
    if (slot === 'ammo') this.state.ammo = 0;
    this.panels.renderWorn();
    this.#showHeld();
  }

  #useOn(a, b) {
    const A = this.state.inv.slots[a], B = this.state.inv.slots[b];
    if (!A || !B) return;
    const ids = [A.id, B.id];
    const has = (id) => ids.includes(id);
    // Knife on logs: fletching menu for those logs.
    const logs = ids.find((id) => id.endsWith('logs'));
    if (has('knife') && logs) {
      const rs = FLETCHING.filter((r) => r.tool === 'knife' && r.needs[0][0] === logs);
      return this.#makeMenu(this.#self(), 'Fletching', `Carve ${ITEMS[logs].name.toLowerCase()}`, rs.map((r) => ({ ...r, skill: 'fletching', n: r.n || 1, locked: this.state.skills.level('fletching') < r.level, short: false })), { skill: 'fletching', clip: 'Fixing_Kneeling', ticks: 3, tool: 'knife' });
    }
    // Any other pairing that matches a fletching recipe (feathers on shafts, tips on
    // headless arrows, string on unstrung bows).
    const r = FLETCHING.find((f) => !f.tool && f.needs.length === 2 && f.needs.every(([id]) => has(id)));
    if (r) {
      if (!this.#need('fletching', r.level, `make ${ITEMS[r.out].name.toLowerCase()}`)) return;
      return this.#produce(this.#self(), { ...r, n: r.n || 1 }, Infinity, { skill: 'fletching', clip: 'Fixing_Kneeling', ticks: 2 });
    }
    this.panels.message('Nothing interesting happens.');
  }

  // A stand-in target at the player's feet, for making things anywhere.
  #self() {
    const P = this.player.pos, f = [Math.sin(this.player.yaw), Math.cos(this.player.yaw)];
    return { x: P.x + f[0], z: P.z + f[1] };
  }

  // ------------------------------------------------------------ bank
  openBank() {
    this.stop();
    this.mode = 'bank';
    this.panels.open('inv');
    this.menus.openBank({
      onWithdraw: (i, n) => this.#withdraw(i, n),
      onDepositAll: () => {
        for (let k = 0; k < 28; k++) if (this.state.inv.slots[k]) this.#deposit(k, Infinity, true);
        this.menus.renderBank();
      },
    });
    this.#freeMouse();
  }

  #deposit(i, n, quiet = false) {
    const s = this.state.inv.slots[i];
    if (!s) return;
    const count = Math.min(n, this.state.inv.count(s.id));
    const id = s.id;
    if (this.state.bank.room(id) === 0) return this.panels.message('Your bank is full.', 'bad');
    const removed = this.state.inv.remove(id, count, i);
    this.state.bank.add(id, removed);
    if (!quiet) this.menus.renderBank();
  }

  #withdraw(i, n) {
    const s = this.state.bank.slots[i];
    if (!s) return;
    const id = s.id;
    const count = Math.min(n, s.n, this.state.inv.room(id));
    if (count <= 0) return this.panels.message("You don't have enough inventory space.", 'bad');
    const added = this.state.inv.add(id, count);
    this.state.bank.remove(id, added);
    this.menus.renderBank();
  }

  // ------------------------------------------------------------ shops
  #sellPrice(id) {
    return Math.max(0, Math.floor(ITEMS[id].value * 0.4));
  }

  openShop(shop) {
    this.stop();
    this.mode = 'shop';
    this.currentShop = shop;
    this.panels.open('inv');
    this.menus.openShop({
      name: shop.name, owner: shop.owner, stock: shop.stock,
      onBuy: (s, n) => {
        let bought = 0;
        for (let k = 0; k < n; k++) {
          if (s.n <= 0) break;
          if (this.state.inv.count('coins') < s.price) {
            if (!bought) this.panels.message("You don't have enough coins.", 'bad');
            break;
          }
          if (!this.state.inv.room(s.id)) {
            this.panels.message("You don't have enough inventory space.", 'bad');
            break;
          }
          this.state.inv.remove('coins', s.price);
          this.state.inv.add(s.id, 1);
          s.n--;
          bought++;
        }
        this.menus.renderShop();
      },
    });
    this.#freeMouse();
  }

  #sell(i, n) {
    const s = this.state.inv.slots[i];
    if (!s) return;
    if (s.id === 'coins') return;
    const id = s.id, price = this.#sellPrice(id);
    const count = this.state.inv.remove(id, Math.min(n, this.state.inv.count(id)), i);
    if (price * count > 0) this.state.inv.add('coins', price * count);
    const stock = this.currentShop.stock.find((x) => x.id === id);
    if (stock) stock.n += count;
    else if (this.currentShop.buysAll) this.currentShop.stock.push({ id, n: count, price: Math.max(1, Math.ceil(ITEMS[id].value * 1.2)) });
    this.menus.renderShop();
  }

  // ------------------------------------------------------------ villagers
  async #villagers() {
    const v = this.world.village, places = v.places;
    const defs = [];
    const inside = (place, lx, lz, extra) => {
      const p = v.at(place, lx, lz);
      return { x: p.x, z: p.z, facing: place.rot, ...extra };
    };
    defs.push({ name: 'Aldwyn', role: 'banker', look: { outfit: 'male_peasant', body: 'male', hair: 'hair_buzzed', beard: 'hair_beard', eyebrows: 'eyebrows_regular' }, idle: 'Idle_FoldArms_Loop', ...inside(places.bank, 0, -2.6) });
    defs.push({ name: 'Maren', role: 'shop', look: { outfit: 'female_peasant', body: 'female', hair: 'hair_buns', eyebrows: 'eyebrows_female' }, ...inside(places.store, 0, -1.9) });
    const smithy = this.resources.places.smithy;
    defs.push({ name: 'Brom', role: 'smith', look: { outfit: 'male_peasant', body: 'male', hair: 'hair_buzzed', beard: 'hair_beard', eyebrows: 'eyebrows_regular' }, idle: 'Idle_FoldArms_Loop', ...inside(smithy, -2.0, -0.2) });
    defs.push({ name: 'Old Tam', role: 'fisher', look: { outfit: 'male_ranger', body: 'male', hair: 'hair_long', beard: 'hair_beard', eyebrows: 'eyebrows_regular' }, x: -50.5, z: 171.5, facing: 2.6 });
    const craft = this.resources.items.find((o) => o.station === 'potter');
    defs.push({ name: 'Ysolde', role: 'potter', look: { outfit: 'female_ranger', body: 'female', hair: 'hair_long', eyebrows: 'eyebrows_female' }, x: craft.x + 1.2, z: craft.z - 1.0, facing: -0.8 });
    // Folk going about their day around the square.
    const C = VILLAGE;
    const loop = (r, a0, n = 6) => Array.from({ length: n }, (_, k) => [C.x + Math.cos(a0 + (k / n) * Math.PI * 2) * r, C.z + Math.sin(a0 + (k / n) * Math.PI * 2) * r]);
    defs.push({ name: 'Wenna', role: 'villager', look: { outfit: 'female_peasant', body: 'female', hair: 'hair_long', eyebrows: 'eyebrows_female' }, x: C.x + 9, z: C.z, route: loop(9, 0), speed: 1.0 });
    defs.push({ name: 'Hob', role: 'villager', look: { outfit: 'male_peasant', body: 'male', hair: 'hair_simpleparted', eyebrows: 'eyebrows_regular' }, x: C.x - 11, z: C.z, route: loop(11.5, Math.PI, 7).reverse(), speed: 1.15 });
    defs.push({ name: 'Garrow', role: 'guard', look: { outfit: 'male_ranger', body: 'male', hair: 'hair_buzzed', eyebrows: 'eyebrows_regular' }, idle: 'Idle_FoldArms_Loop', x: C.x + 30, z: C.z - 8, facing: 1.2 });
    for (const d of defs) {
      const ch = await this.factory.create(d.look);
      this.scene.add(ch.root);
      this.npcs.push(new Npc(d, ch, this.world));
    }
    // The bank counter doubles as a booth.
    const counter = v.at(places.bank, 0, -1.4);
    this.resources.add({ kind: 'station', station: 'bank', name: 'Bank counter', verb: 'Bank at', x: counter.x, y: VILLAGE.y + 0.9, z: counter.z, r: 1.2, h: 1.2, reach: 2.0 });
  }

  #talkTo(npc) {
    this.stop();
    this.player.faceTowards(npc.pos.x, npc.pos.z);
    npc.talking = true;
    this.talking = npc;
    this.#freeMouse();
    const bye = { label: 'Goodbye.', run: () => this.#endTalk() };
    const say = (text, options) => this.talk.show(npc.name, text, options);
    switch (npc.def.role) {
      case 'banker':
        return say('Good day. Your coin and goods are safe with the Bank of Ashford. Shall I open your account?', [
          { label: 'Yes, open my bank.', run: () => { this.#endTalk(false); this.openBank(); } },
          { label: 'How safe is safe?', run: () => say('Stone walls, iron locks, and me. Nothing has gone missing in forty years, bar one goat.', [{ label: 'Open my bank, then.', run: () => { this.#endTalk(false); this.openBank(); } }, bye]) },
          bye,
        ]);
      case 'shop':
        return say('Welcome to Maren\'s! Tools, nets, knives, whatever you need to get started. I\'ll buy most things too.', [
          { label: "Let's trade.", run: () => { this.#endTalk(false); this.openShop(this.#shop('general')); } },
          { label: 'Where should I start?', run: () => say('Grab an axe and try the trees by the road, or take a pickaxe to the quarry north-west. Brom will show you the furnace once you have ore.', [{ label: "Let's trade.", run: () => { this.#endTalk(false); this.openShop(this.#shop('general')); } }, bye]) },
          bye,
        ]);
      case 'smith':
        return say('Copper and tin make bronze. Put them in the furnace, then bring the bars to the anvil with a hammer. Iron wants a steadier hand.', [
          { label: 'What can I make at the anvil?', run: () => say('Daggers and swords to begin, then helmets, shields and plate as you improve. Arrowtips too, if you shoot.', [bye]) },
          bye,
        ]);
      case 'fisher':
        return say("Shrimp and anchovies by the jetty with a net. Trout and salmon run in the river for them as can cast a fly. I sell what you'll need.", [
          { label: "Show me what you've got.", run: () => { this.#endTalk(false); this.openShop(this.#shop('fishing')); } },
          bye,
        ]);
      case 'potter':
        return say('Dig clay at the quarry, soften it at the well, shape it on my wheel and fire it in the kiln. Flax from the east field spins into bow string on that wheel there.', [bye]);
      case 'guard':
        return say('Keep your wits about you east of the river. Bandits have been camping in the woods past the farms.', [bye]);
      default:
        return say(['Lovely day for it.', 'Have you seen the size of the pike in that lake?', "Mind the well, it's deeper than it looks."][Math.floor(Math.random() * 3)], [bye]);
    }
  }

  #endTalk(relock = true) {
    this.talk.hide();
    if (this.talking) this.talking.talking = false;
    this.talking = null;
    if (relock) this.#takeMouse();
  }

  #shop(id) {
    this.shops ??= {
      general: {
        name: "Maren's General Store", owner: 'Maren', buysAll: true,
        stock: [
          ['bronze_axe', 5, 18], ['iron_axe', 3, 60], ['steel_axe', 2, 210], ['bronze_pickaxe', 5, 18], ['iron_pickaxe', 3, 60], ['steel_pickaxe', 2, 210],
          ['hammer', 8, 3], ['knife', 8, 4], ['small_net', 6, 6], ['bronze_sword', 3, 30], ['bronze_med_helm', 2, 25],
        ].map(([sid, n, price]) => ({ id: sid, n, price })),
      },
      fishing: {
        name: "Tam's Tackle", owner: 'Old Tam',
        stock: [['small_net', 5, 6], ['fly_rod', 4, 12], ['feather', 2000, 3]].map(([sid, n, price]) => ({ id: sid, n, price })),
      },
    };
    return this.shops[id];
  }

  // ------------------------------------------------------------ minimap and vitals
  #markers() {
    if (!this.staticMarkers) {
      const v = this.world.village.places, r = this.resources;
      const st = (name) => r.items.find((o) => o.station === name);
      const m = [];
      m.push({ ...v.bank, icon: 'bank' }, { ...v.store, icon: 'store' }, { ...v.inn, icon: 'inn' });
      m.push({ ...r.places.smithy, icon: 'smithy' }, { ...st('fire'), icon: 'fire' }, { ...st('potter'), icon: 'craft' });
      m.push({ ...r.mineCentre, icon: 'mine' });
      // One fish marker per cluster of spots.
      for (const s of r.spots) if (!m.some((o) => o.icon === 'fish' && Math.hypot(o.x - s.x, o.z - s.z) < 25)) m.push({ x: s.x, z: s.z, icon: 'fish' });
      this.staticMarkers = m.map(({ x, z, icon: i }) => ({ x, z, icon: i }));
    }
    return [...this.npcs.map((n) => ({ x: n.pos.x, z: n.pos.z, dot: '#ffe04a' })), ...this.staticMarkers];
  }

  #vitals() {
    const el = document.createElement('div');
    el.className = 'vitals';
    el.innerHTML = `<div class="vital hp"><i></i><span>${icon('hitpoints', 13)}<b></b></span></div>`;
    document.body.append(el);
    const bar = el.querySelector('.hp i'), label = el.querySelector('.hp b');
    const draw = () => {
      const max = this.state.maxHp;
      bar.style.width = `${Math.max(0, Math.min(1, this.state.hp / max)) * 100}%`;
      label.textContent = `${Math.ceil(this.state.hp)} / ${max}`;
    };
    this.state.listeners.add((what) => what === 'hp' && draw());
    this.state.skills.listeners.add(({ id }) => id === 'hitpoints' && draw());
    draw();
  }

  // ------------------------------------------------------------ skill guide
  #guide(skill) {
    this.menus.openGuide(skill, this.unlockList.filter((u) => u.skill === skill));
    this.#freeMouse();
  }

  // ------------------------------------------------------------ held items
  #hand() {
    this.handBone = this.hero.bones.hand_r;
    this.held = new THREE.Group();
    this.handBone.add(this.held);
    this.heldModels = new Map();
  }

  debugHold(id, p, r) {
    HOLD.default = { p, r };
    this.heldModels.delete(id);
    this.#showHeld(id);
  }

  #showHeld(tool = null) {
    const id = tool || this.state.equip.weapon;
    this.held.clear();
    if (!id) return;
    if (!this.heldModels.has(id)) this.heldModels.set(id, buildItem(id, this.assets));
    const m = this.heldModels.get(id);
    const h = HOLD[ITEMS[id].art?.kind] || HOLD.default;
    m.position.set(...h.p);
    m.rotation.set(...h.r);
    // Bones are in centimetre-scaled space on some rigs; undo the parent's scale.
    const s = new THREE.Vector3();
    this.handBone.getWorldScale(s);
    m.scale.setScalar(1 / s.x);
    this.held.add(m);
  }
}

// Distance along a ray to a vertical cylinder around a target, or null.
function rayCylinder(o, d, c) {
  const ox = o.x - c.x, oz = o.z - c.z, r = c.r || 0.5;
  const a = d.x * d.x + d.z * d.z;
  const b = ox * d.x + oz * d.z;
  const cc = ox * ox + oz * oz - r * r;
  let t;
  if (cc < 0) t = 0;
  else {
    const disc = b * b - a * cc;
    if (disc < 0 || a < 1e-8) return null;
    t = (-b - Math.sqrt(disc)) / a;
    if (t < 0) return null;
  }
  const y = o.y + d.y * t, y0 = c.y - c.h / 2, y1 = c.y + c.h / 2;
  if (y >= y0 && y <= y1) return t;
  // Could enter through the top or bottom cap.
  if (Math.abs(d.y) > 1e-6) {
    for (const cap of [y0, y1]) {
      const tc = (cap - o.y) / d.y;
      if (tc > 0 && (o.x + d.x * tc - c.x) ** 2 + (o.z + d.z * tc - c.z) ** 2 <= r * r) return tc;
    }
  }
  return null;
}

function aOrSome(name, n = 1) {
  if (n > 1) return `${n} ${name}`;
  if (/s$/.test(name) && !/ss$/.test(name)) return `some ${name}`;
  return /^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`;
}
