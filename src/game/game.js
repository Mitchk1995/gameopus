import * as THREE from 'three';
import { createRenderer } from '../core/renderer.js';
import { Input } from '../core/input.js';
import { Sound } from '../core/audio.js';
import { Particles } from '../core/particles.js';
import { World } from '../world/world.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { FX } from './fx.js';
import { Loot } from './loot.js';
import { PowerSystem } from './powers.js';
import { Actions } from './actions.js';
import { Combat } from './combat.js';
import { HUD } from '../ui/hud.js';
import { InventoryUI } from '../ui/inventory.js';
import { BIOMES, biomeForDepth } from '../content/biomes.js';
import { UNIQUES } from '../content/uniques.js';
import { SLOTS } from '../content/bases.js';
import { generateItem } from './items.js';

const SAVE_KEY = 'hollowreach-save-v1';
const DEPTH_SECONDS = 80;

function loadSave() {
  const fresh = { v: 1, level: 1, xp: 0, gold: 0, shards: 0, equipment: {}, bag: [], codex: {}, firstUnique: false, deepest: 1, lifetimeKills: 0 };
  for (const s of SLOTS) fresh.equipment[s] = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw);
    return { ...fresh, ...s, equipment: { ...fresh.equipment, ...s.equipment } };
  } catch {
    return fresh;
  }
}

export class Game {
  constructor(root) {
    this.save = loadSave();
    if (!this.save.started) {
      // Starter kit so the first minute feels like a hero, not a victim.
      this.save.started = true;
      this.save.equipment.weapon = generateItem({ ilvl: 2, rarity: 'magic', slot: 'weapon' });
      this.save.equipment.chest = generateItem({ ilvl: 2, rarity: 'magic', slot: 'chest' });
    }
    this.gfx = createRenderer(root);
    this.scene = this.gfx.scene;
    this.camera = this.gfx.camera;
    this.input = new Input(this.gfx.renderer.domElement);
    this.audio = new Sound();
    this.particles = new Particles(this.scene, 40000);
    this.gfx.onResize = () => this.particles.setViewport(this.gfx.renderer.domElement.height, this.camera.fov);
    this.gfx.onResize();

    this.time = 0;
    this.runTime = 0;
    this.depth = 1;
    this.kills = 0;
    this.damagePulse = 0;
    this.trauma = 0;
    this.stop = 0;
    this.flashV = 0;
    this.timers = [];
    this.aim = new THREE.Vector3();
    this.state = 'title';
    this.debug = location.hash === '#debug';

    this.powers = new PowerSystem(this);
    this.world = new World(this);
    this.fx = new FX(this);
    this.actions = new Actions(this);
    this.combat = new Combat(this);
    this.projectiles = new Projectiles(this);
    this.enemies = new Enemies(this);
    this.loot = new Loot(this);
    this.hud = new HUD(this);
    this.inventory = new InventoryUI(this);
    this.player = new Player(this);
    this.player.recompute();
    this.world.setBiome(BIOMES[0], true);

    this.camPos = new THREE.Vector3(0, 22, 15);
    this.camLook = new THREE.Vector3();
    this.#titleScreen();
    this.#bindKeys();

    this.last = performance.now();
    this.saveT = 0;
    const loop = () => {
      // One clock for everything; rAF timestamps can lag performance.now().
      const now = performance.now();
      const real = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(real);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__game = this;
  }

  // Timed callbacks in game time (used by chained effects).
  schedule(delay, fn) {
    this.timers.push({ t: delay, fn });
  }
  shake(v) {
    this.trauma = Math.min(1, this.trauma + v);
  }
  hitstop(s) {
    this.stop = Math.max(this.stop, s);
  }
  flash(color, v) {
    this.gfx.grade.uniforms.uFlashColor.value.setRGB(...color);
    this.flashV = Math.max(this.flashV, v);
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* storage unavailable: progress lives only in this tab */
    }
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.hud.toast(this.audio.muted ? 'Sound off' : 'Sound on');
  }

  #bindKeys() {
    addEventListener('keydown', (e) => {
      if (this.state === 'title') return;
      if (e.code === 'KeyI' || e.code === 'Tab') this.inventory.toggle();
      if (e.code === 'KeyC') this.inventory.toggleCodex();
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'Backquote') this.hud.fps.hidden = !this.hud.fps.hidden;
      if (e.code === 'Escape') {
        this.inventory.toggle(false);
        this.inventory.toggleCodex(false);
      }
      if (this.debug) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= UNIQUES.length) this.loot.debugDrop(UNIQUES[n - 1].id, e.shiftKey);
        if (e.code === 'KeyK') this.enemies.spawnElitePack(false);
        if (e.code === 'KeyO') this.enemies.spawnElitePack(true);
        if (e.code === 'KeyJ') this.#nextDepth();
      }
    });
  }

  #overlay(cls, html) {
    const s = document.createElement('div');
    s.className = `screen ${cls}`;
    s.innerHTML = `<div class="inner">${html}</div>`;
    document.getElementById('app').appendChild(s);
    return s;
  }

  #titleScreen() {
    this.hud.root.hidden = true;
    const returning = this.save.level > 1 || this.save.lifetimeKills > 0;
    const s = this.#overlay('title', `
      <div class="tag">A descent without end</div>
      <h1>Hollowreach</h1>
      <div class="tag" style="letter-spacing:.14em">${returning ? `Level ${this.save.level} · deepest depth ${this.save.deepest}` : 'The kingdom fell upward into the dark'}</div>
      <button class="go" type="button">${returning ? 'Descend again' : 'Descend'}</button>
      <div class="keys">
        <b>WASD</b><span>move</span>
        <b>Left mouse</b><span>cleave (hold)</span>
        <b>Right mouse</b><span>arcane bolt</span>
        <b>Space</b><span>dash</span>
        <b>Q</b><span>frost nova</span>
        <b>R</b><span>potion</span>
        <b>I · C</b><span>inventory · codex</span>
      </div>`);
    s.querySelector('.go').onclick = () => {
      this.audio.init();
      s.remove();
      this.hud.root.hidden = false;
      this.state = 'play';
      this.gfx.renderer.domElement.focus?.();
      this.hud.announce(this.world.biome.name, `Depth ${this.depth} — ${this.world.biome.tagline}`, 'depth');
      this.audio.play('depth');
    };
  }

  playerDied() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.life = 0;
    this.audio.play('death');
    this.shake(0.6);
    this.save.lifetimeKills += this.kills;
    this.persist();
    setTimeout(() => {
      const mins = Math.floor(this.runTime / 60), secs = Math.floor(this.runTime % 60).toString().padStart(2, '0');
      const s = this.#overlay('dead', `
        <div class="tag">${this.world.biome.name}</div>
        <h1>You have fallen</h1>
        <div class="runstats">Depth ${this.depth} · ${this.kills} slain · ${mins}:${secs}</div>
        <div class="runstats">Your gear, levels and gold are kept. The descent begins again.</div>
        <button class="go" type="button">Rise again</button>`);
      s.querySelector('.go').onclick = () => {
        s.remove();
        this.newRun();
      };
    }, 1800);
  }

  newRun() {
    this.enemies.reset();
    this.projectiles.reset();
    this.actions.reset();
    this.loot.reset();
    this.player.reset();
    this.player.model.body.rotation.x = 0;
    this.player.model.body.position.y = 0;
    this.depth = 1;
    this.runTime = 0;
    this.kills = 0;
    this.timers.length = 0;
    this.world.setBiome(BIOMES[0]);
    this.hud.announce(this.world.biome.name, `Depth 1 — ${this.world.biome.tagline}`, 'depth');
    this.audio.play('depth');
  }

  #nextDepth() {
    this.depth++;
    this.save.deepest = Math.max(this.save.deepest, this.depth);
    const b = biomeForDepth(this.depth);
    this.world.setBiome(b);
    this.hud.announce(b.name, `Depth ${this.depth} — ${b.tagline}`, 'depth');
    this.audio.play('depth');
    this.persist();
  }

  #updateAim() {
    if (this.aimLock) return; // set by the headless playtest
    const m = this.input.mouse;
    const ndc = new THREE.Vector3((m.x / innerWidth) * 2 - 1, -(m.y / innerHeight) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = (0.9 - this.camera.position.y) / dir.y;
    if (t > 0) this.aim.copy(this.camera.position).addScaledVector(dir, t);
  }

  frame(real) {
    const paused = this.inventory.open || this.inventory.codexOpen;
    let dt = real;
    if (this.stop > 0) {
      this.stop -= real;
      dt = real * 0.05;
    }
    if (this.state === 'play' && !paused) this.update(dt);
    else if (this.state === 'title') this.#titleUpdate(real);

    this.#camera(real);
    this.particles.update(this.state === 'play' && !paused ? dt : this.state === 'title' ? real : 0);
    const gu = this.gfx.grade.uniforms;
    this.damagePulse = Math.max(0, this.damagePulse - real * 1.4);
    const lowLife = this.player.life / this.player.stats.life < 0.3 && !this.player.dead ? 0.35 + Math.sin(this.time * 6) * 0.15 : 0;
    gu.uDamage.value = Math.max(this.damagePulse, lowLife);
    this.flashV = Math.max(0, this.flashV - real * 1.6);
    gu.uFlash.value = this.flashV;
    gu.uTime.value = this.time;
    this.gfx.composer.render(real);
    this.input.endFrame();
  }

  #titleUpdate(dt) {
    this.time += dt;
    this.world.update(dt, 0, 0, this.time);
    this.fx.update(dt);
    this.player.model.root.position.set(0, 0, 0);
    this.player.model.root.rotation.y = 0.5;
    const t = this.player.model;
    t.body.position.y = Math.sin(this.time * 2) * 0.012;
    this.world.torch.position.set(0, 3.4, 0.6);
    this.world.torch.intensity = 48 + Math.sin(this.time * 11) * 3;
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    if (!p.dead) this.runTime += dt;
    this.#updateAim();

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers[i] = this.timers[this.timers.length - 1];
        this.timers.pop();
        tm.fn();
      }
    }

    p.update(dt);
    this.powers.update(dt);
    this.enemies.update(dt);
    this.projectiles.update(dt);
    this.actions.update(dt);
    this.loot.update(dt);
    this.fx.update(dt);
    this.world.update(dt, p.x, p.z, this.time);
    this.hud.update(dt);

    if (!p.dead && this.runTime > this.depth * DEPTH_SECONDS) this.#nextDepth();

    this.saveT += dt;
    if (this.saveT > 10) {
      this.saveT = 0;
      this.persist();
    }
  }

  #camera(dt) {
    const p = this.player;
    const title = this.state === 'title';
    const tx = title ? Math.sin(this.time * 0.1) * 3 : p.x + (this.aim.x - p.x) * 0.08;
    const tz = title ? Math.cos(this.time * 0.1) * 3 : p.z + (this.aim.z - p.z) * 0.08;
    const off = title ? [Math.sin(this.time * 0.07) * 9, 9, 13] : [0, 21.5, 15];
    const k = 1 - Math.exp(-(title ? 1 : 7) * dt);
    this.camPos.x += (tx + off[0] - this.camPos.x) * k;
    this.camPos.y += (off[1] - this.camPos.y) * k;
    this.camPos.z += (tz + off[2] - this.camPos.z) * k;
    this.camLook.x += (tx - this.camLook.x) * k;
    this.camLook.z += (tz - this.camLook.z) * k;
    this.camLook.y = title ? 1.2 : 0.6;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const sh = this.trauma * this.trauma;
    const t = this.time * 40;
    this.camera.position.set(
      this.camPos.x + Math.sin(t * 1.3) * sh * 0.6,
      this.camPos.y + Math.sin(t * 1.7 + 2) * sh * 0.4,
      this.camPos.z + Math.sin(t * 1.1 + 4) * sh * 0.6,
    );
    this.camera.lookAt(this.camLook);
  }
}
