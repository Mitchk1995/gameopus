import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { Assets } from './engine/assets.js';
import { Sky } from './world/sky.js';
import { Terrain } from './world/terrain.js';
import { CharacterFactory } from './actors/character.js';
import { Water } from './world/water.js';
import { Forest } from './world/trees.js';
import { VILLAGE } from './world/map.js';

// World preview: sky, terrain and a few people in the village, with named camera views.
const app = document.getElementById('app');
const { renderer, scene, camera } = createRenderer(app);
const assets = new Assets();

async function preview() {
  const sky = await new Sky({ renderer, scene, assets }).load();
  const terrain = await new Terrain({ scene, assets, renderer }).load();
  const water = new Water({ scene, terrain });
  const forest = await new Forest({ scene, assets, terrain, renderer }).load();
  console.log('trees', forest.trees.length, 'variants', forest.variants.length);

  const factory = new CharacterFactory(assets);
  await factory.loadAnimations();
  const people = [];
  for (const [i, s] of [
    { outfit: 'male_ranger', body: 'male', hair: 'hair_simpleparted', eyebrows: 'eyebrows_regular', anim: 'Idle_Loop' },
    { outfit: 'female_peasant', body: 'female', hair: 'hair_long', eyebrows: 'eyebrows_female', anim: 'Idle_Talking_Loop' },
  ].entries()) {
    const c = await factory.create(s);
    const x = VILLAGE.x + i * 1.4, z = VILLAGE.z + 20;
    c.root.position.set(x, terrain.heightAt(x, z), z);
    c.root.rotation.y = i ? -2.2 : 0.9;
    c.play(s.anim);
    scene.add(c.root);
    people.push(c);
  }

  const views = {
    village: [VILLAGE.x + 6, 0, VILLAGE.z + 28, VILLAGE.x, VILLAGE.z + 18, 2.0],
    river: [70, 0, 30, 100, -40, 6],
    lake: [-20, 0, 190, -70, 250, 8],
    forest: [-120, 0, 30, -230, 20, 3],
    hill: [-120, 0, -110, -195, -205, 10],
    overview: [60, 0, 160, -40, -60, 60],
  };
  const setView = (name) => {
    const [x, , z, tx, tz, up] = views[name];
    camera.position.set(x, terrain.heightAt(x, z) + up, z);
    camera.lookAt(tx, terrain.heightAt(tx, tz) + 1.2, tz);
  };
  setView('village');

  const timer = new THREE.Timer();
  const game = { renderer, scene, camera, terrain, water, forest, people, sky, setView, ready: true };
  window.__game = game;
  const focus = new THREE.Vector3();
  game.frame = (dt) => {
    for (const p of people) p.update(dt);
    focus.set(camera.position.x, 0, camera.position.z);
    focus.y = terrain.heightAt(focus.x, focus.z);
    sky.update(camera, focus);
    terrain.update(camera);
    water.update(dt);
    forest.update(dt, camera.position);
    renderer.render(scene, camera);
  };
  // Headless tests (#test) render only when asked, since software GL is slow.
  if (location.hash.includes('test')) {
    game.frame(0.016);
    return;
  }
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    game.frame(Math.min(timer.getDelta(), 0.05));
  });
}

preview().catch((e) => {
  console.error(e);
  app.textContent = String(e);
});
