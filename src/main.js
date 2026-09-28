import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { Assets } from './engine/assets.js';
import { Input } from './engine/input.js';
import { World } from './world/world.js';
import { CharacterFactory } from './actors/character.js';
import { Player } from './actors/player.js';
import { CameraRig } from './actors/camera-rig.js';
import { Hud } from './ui/hud.js';
import { Game } from './game/game.js';
import { SPAWN } from './world/map.js';
import { loadSettings, saveSettings, applyQuality } from './engine/settings.js';

// Headless tests (#test) step the game by hand, since software GL renders slowly.
const TEST = location.hash.includes('test');

const app = document.getElementById('app');
const { renderer, scene, camera } = createRenderer(app);
const assets = new Assets();
const hud = new Hud();
assets.onProgress = (f) => hud.progress(f * 0.9);

async function start() {
  const world = await new World({ renderer, scene, assets }).load();
  hud.progress(0.9, 'Waking the villagers');
  const factory = new CharacterFactory(assets);
  await factory.loadAnimations();
  const hero = await factory.create({ outfit: 'male_ranger', body: 'male', hair: 'hair_simpleparted', eyebrows: 'eyebrows_regular' });
  scene.add(hero.root);

  const input = new Input(renderer.domElement);
  const player = new Player({ world, character: hero, input });
  player.spawn(SPAWN.x, SPAWN.z, SPAWN.facing);
  const rig = new CameraRig(camera, world);
  rig.yaw = SPAWN.facing + Math.PI;

  const game = new Game({ renderer, scene, camera, world, player, rig, hero, input, hud, assets, factory });
  await game.init();
  window.__game = Object.assign(game, { ready: true });

  if (TEST) {
    input.locked = true;
    input.lock = input.unlock = () => {};
  }
  // Paused only when the mouse is free and no game window explains why.
  let paused = false;
  const setPaused = (p) => {
    if (p === paused) return;
    paused = p;
    hud.setPaused(p, 'Continue');
  };
  hud.playButton.addEventListener('click', () => input.lock());
  const settings = loadSettings();
  const applySettings = () => {
    applyQuality(settings.quality, { renderer, world });
    rig.sensitivity = settings.sensitivity;
    hud.showSettings(settings);
    saveSettings(settings);
  };
  hud.onQuality = (q) => {
    settings.quality = q;
    applySettings();
  };
  hud.onSensitivity = (v) => {
    settings.sensitivity = v;
    applySettings();
  };
  applySettings();
  renderer.domElement.addEventListener('click', () => {
    if (game.uiOpen) game.closeAll();
    if (!input.locked) input.lock();
  });

  // Sound can only start after the player does something.
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => game.audio.unlock(), { passive: true });

  game.tick = (dt) => {
    setPaused(!TEST && !input.locked && !game.uiOpen);
    // Hit-stop and slow motion scale the simulation, not the camera.
    const sdt = dt * game.timeStep(dt);
    if (!paused) {
      game.update(sdt);
      player.update(sdt, rig.yaw);
    } else game.minimap.update(player, rig.yaw);
    rig.update(dt, input, player.pos, { sprinting: player.gait === 'Sprint_Loop' });
    hero.update(sdt);
    hero.root.visible = rig.cur > 0.75;
    input.endFrame();
  };
  game.draw = (dt) => {
    world.update(dt, camera, player.pos);
    renderer.render(scene, camera);
  };
  game.frame = (dt) => {
    game.tick(dt);
    game.draw(dt);
  };
  // Simulates some seconds at 60 Hz without drawing (for headless tests).
  game.sim = (seconds) => {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) game.tick(1 / 60);
  };
  // Simulates some seconds at 60 Hz, then draws once (for headless tests).
  game.run = (seconds) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      game.tick(1 / 60);
      world.forest.update(1 / 60, camera);
    }
    game.draw(1 / 60);
    return { x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), state: player.state, gait: player.gait };
  };

  hud.ready();
  if (TEST) {
    game.frame(0);
    return;
  }
  paused = true;
  hud.setPaused(true, 'Enter the world');
  const timer = new THREE.Timer();
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    game.frame(Math.min(timer.getDelta(), 0.05));
  });
}

start().catch((e) => {
  console.error(e);
  hud.progress(0, `Something went wrong: ${e.message}`);
});
