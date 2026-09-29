// Fast regressions for the real inventory/equipment/save code. Rendering imports
// are inert here; the browser scenarios cover the corresponding player actions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

globalThis.document = { baseURI: 'http://localhost/' };
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(new URL(url), 'utf8')}`, shortCircuit: true };
    return next(url, context);
  },
});
const { Game } = await import('../src/game/game.js');
const { GameState } = await import('../src/game/state.js');
const { Container } = await import('../src/game/inventory.js');
const { ITEMS } = await import('../src/game/items.js');
const { Quests } = await import('../src/game/quests.js');
const { SPAWN, LAYOUT } = await import('../src/world/map.js');

function fixture() {
  const game = new Game({ input: { unlock() {} } });
  game.state = new GameState();
  game.state.inv = new Container(28);
  game.messages = [];
  game.panels = { renderWorn() {}, open() {}, message(text) { game.messages.push(text); } };
  game.menus = { openShop(shop) { this.shop = shop; }, renderShop() {} };
  game.held = new THREE.Group();
  game.handBone = new THREE.Object3D();
  game.heldModels = new Map(Object.keys(ITEMS).map((id) => [id, new THREE.Object3D()]));
  game.aim = { setWeapon() {} };
  return game;
}

test('full-pack arrow swap preserves both arrow types and exact counts', () => {
  const g = fixture();
  g.state.equip.ammo = 'iron_arrow';
  g.state.ammo = 100;
  g.state.inv.add('bronze_arrow', 5);
  g.state.inv.add('logs', 27);
  assert.equal(g.equip(0), true);
  assert.equal(g.state.equip.ammo, 'bronze_arrow');
  assert.equal(g.state.ammo, 5);
  assert.equal(g.state.inv.count('iron_arrow'), 100);
  assert.equal(g.state.inv.count('logs'), 27);
});

test('a full-pack bow swap either fits both removed items or changes nothing', () => {
  const g = fixture();
  g.state.equip.shield = 'bronze_kiteshield';
  g.state.inv.add('shortbow');
  g.state.inv.add('logs', 27);
  const before = g.state.inv.toJSON();
  g.equip(0);
  assert.deepEqual(g.state.inv.toJSON(), before);
  assert.equal(g.state.equip.weapon, 'bronze_sword');
  assert.equal(g.state.equip.shield, 'bronze_kiteshield');
  g.state.inv.remove('logs');
  assert.equal(g.equip(0), true);
  assert.equal(g.state.equip.weapon, 'shortbow');
  assert.equal(g.state.equip.shield, null);
  assert.equal(g.state.inv.count('bronze_sword'), 1);
  assert.equal(g.state.inv.count('bronze_kiteshield'), 1);
});

test('stack-input crafting cannot consume ingredients without room for its output', () => {
  const inv = new Container(28);
  inv.add('arrow_shaft', 30);
  inv.add('feather', 30);
  inv.add('logs', 26);
  const before = inv.toJSON();
  let events = 0;
  inv.listeners.add(() => events++);
  assert.equal(inv.exchange([['arrow_shaft', 15], ['feather', 15]], [['headless_arrow', 15]]), false);
  assert.deepEqual(inv.toJSON(), before);
  assert.equal(events, 0);
  inv.remove('logs');
  events = 0;
  assert.equal(inv.exchange([['arrow_shaft', 15], ['feather', 15]], [['headless_arrow', 15]]), true);
  assert.equal(inv.count('headless_arrow'), 15);
  assert.equal(inv.count('arrow_shaft'), 15);
  assert.equal(inv.count('feather'), 15);
  assert.equal(events, 1);
});

test('full-pack sales preserve goods if coins cannot fit, and allow selling a whole stack', () => {
  const inv = new Container(28);
  inv.add('bronze_arrow', 30);
  inv.add('logs', 27);
  assert.equal(inv.exchange([['bronze_arrow', 1]], [['coins', 1]]), false);
  assert.equal(inv.count('bronze_arrow'), 30);
  assert.equal(inv.exchange([['bronze_arrow', 30]], [['coins', 30]]), true);
  assert.equal(inv.count('bronze_arrow'), 0);
  assert.equal(inv.count('coins'), 30);
});

test('an exact-price purchase can use the slot vacated by its final coins', () => {
  const g = fixture();
  g.state.inv.add('coins', 12);
  g.state.inv.add('logs', 27);
  const bread = { id: 'bread', n: 2, price: 12 };
  g.openShop({ name: 'Test inn', owner: 'Bess', stock: [bread], buys: 'food' });
  g.menus.shop.onBuy(bread, 1);
  assert.equal(g.state.inv.count('bread'), 1);
  assert.equal(g.state.inv.count('coins'), 0);
  assert.equal(bread.n, 1);
});

test('failed purchases preserve money and stock', () => {
  const g = fixture();
  g.state.inv.add('coins', 13);
  g.state.inv.add('logs', 27);
  const bread = { id: 'bread', n: 2, price: 12 };
  g.openShop({ name: 'Test inn', owner: 'Bess', stock: [bread], buys: 'food' });
  g.menus.shop.onBuy(bread, 1);
  assert.equal(g.state.inv.count('bread'), 0);
  assert.equal(g.state.inv.count('coins'), 13);
  assert.equal(bread.n, 2);
});

test('old zero-health saves recover at the safe start without losing belongings', () => {
  const state = new GameState();
  const saved = { ...state.toJSON(), hp: 0, pos: { x: 270, z: -20, yaw: 1, layout: LAYOUT } };
  const restored = new GameState(saved);
  assert.equal(restored.hp, restored.maxHp);
  assert.equal(restored.pos, null);
  assert.deepEqual(restored.inv.toJSON(), state.inv.toJSON());
});

test('saving during death stores a safe recovery without reviving the live body', () => {
  const g = fixture();
  g.player = { state: 'dead', pos: new THREE.Vector3(270, 0, -20), yaw: 1 };
  g.state.hp = 0;
  let saved;
  g.state.save = (extra) => { saved = { ...g.state.toJSON(), ...extra }; };
  g.save();
  assert.equal(saved.hp, g.state.maxHp);
  assert.equal(saved.pos.x, SPAWN.x);
  assert.equal(saved.pos.z, SPAWN.z);
  assert.equal(saved.pos.layout, LAYOUT);
  assert.equal(g.state.hp, 0);
  assert.equal(g.player.state, 'dead');
});

function questFixture(state = new GameState()) {
  const g = fixture();
  g.state = state;
  g.npcs = [{ def: { id: 'tam' }, pos: { x: 10, z: 20 } }, { def: { id: 'rowan' }, pos: { x: -73, z: 154.8 } }];
  g.audio = { play() {} };
  g.save = () => { g.snapshot = structuredClone(g.state.toJSON()); };
  const quests = new Quests(g);
  quests.ui = { update() {}, flash() {}, complete() {} };
  return { g, quests };
}

test('a new character gets a household lead without accepting its job', () => {
  const { quests } = questFixture();
  assert.equal(quests.tracked, 'kindling');
  assert.equal(quests.stage('kindling'), 0);
  assert.deepEqual(quests.goal(), { x: -73, z: 154.8 });
});

test('the household lead does not replace a saved choice of Tam', () => {
  const state = new GameState();
  state.flags.questTracked = 'gnasher';
  assert.equal(questFixture(state).quests.tracked, 'gnasher');
});

test('journal tracking survives reload and quest progress selects the new objective', () => {
  const { g, quests } = questFixture();
  assert.equal(quests.track('ledger'), true);
  const restored = questFixture(new GameState(g.snapshot));
  assert.equal(restored.quests.tracked, 'ledger');
  assert.equal(restored.quests.stage('ledger'), 0);
  restored.quests.set('gnasher', 1);
  assert.equal(restored.quests.tracked, 'gnasher');
  assert.equal(restored.g.snapshot.flags.questTracked, 'gnasher');
});

test('an existing active quest takes precedence over the default opening lead', () => {
  const state = new GameState();
  state.quests.ledger = 2;
  assert.equal(questFixture(state).quests.tracked, 'ledger');
});

test('completing the tracked quest clears and persists its guidance', () => {
  const { g, quests } = questFixture();
  quests.set('gnasher', 3);
  quests.complete('gnasher');
  assert.equal(quests.tracked, null);
  assert.equal(g.snapshot.flags.questTracked, null);
  assert.equal(questFixture(new GameState(g.snapshot)).quests.tracked, null);
  assert.equal(quests.track('gnasher'), false);
  assert.equal(quests.goal(), null);
});
