import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Npc } from '../src/actors/npcs.js';
import { Colliders } from '../src/world/colliders.js';

const away = { pos: new THREE.Vector3(50, 0, 50) };
function fixture(routine, door = null) {
  const world = { colliders: new Colliders(), groundAt: () => 0, waterDepth: () => 0 };
  const character = { root: new THREE.Object3D(), mixer: { update() {} }, play(name) { this.clip = name; }, update() {} };
  const npc = new Npc({ id: 'test', name: 'Test', x: routine[0].x, z: routine[0].z, routine, routineDoor: door, speed: 1 }, character, world);
  return { npc, world, character };
}
const simulate = (npc, seconds, player = away) => { for (let t = 0; t < seconds - 1e-6; t += 0.05) npc.update(0.05, player); };

test('household stops last their authored duration and approaches freeze the clock', () => {
  const { npc } = fixture([{ id: 'garden', x: 0, z: 0, wait: 30 }, { id: 'porch', x: 4, z: 0, wait: 45 }]);
  simulate(npc, 10);
  assert.equal(npc.pos.x, 0);
  const pause = npc.pause;
  simulate(npc, 5, { pos: new THREE.Vector3(1, 0, 0) });
  assert.equal(npc.pause, pause);
  npc.talking = true;
  simulate(npc, 5);
  assert.equal(npc.pause, pause);
  npc.talking = false;
  simulate(npc, 25);
  assert.ok(npc.pos.x > 3.95);
  assert.equal(npc.routineStop.id, 'porch');
  assert.ok(npc.pause > 40);
});

test('an unexpected wall blocks an authored route instead of being walked through', () => {
  const { npc, world } = fixture([{ x: 0, z: 0 }, { id: 'porch', x: 3, z: 0, wait: 30 }]);
  const wall = world.colliders.addBox(1, 0, 0.1, 1, 0, -1, 2.4);
  simulate(npc, 3);
  assert.ok(npc.pos.x <= 0.61);
  assert.equal(npc.blocked, true);
  wall.removed = true;
  simulate(npc, 3);
  assert.ok(npc.pos.x > 2.95);
  assert.equal(npc.routineStop.id, 'porch');
});

test('a household member opens a shut door and waits for the actual opening', () => {
  let uses = 0;
  const door = { open: false, t: 0, target: { x: 0, z: 1.5 }, use() { uses++; this.open = true; } };
  const { npc, world } = fixture([{ x: 0, z: 0 }, { id: 'inside', x: 0, z: 3, wait: 30, door: true }], door);
  const leaf = world.colliders.addBox(0, 1.5, 0.75, 0.05, 0, -1, 2.4);
  npc.update(0.1, away);
  assert.equal(uses, 1);
  assert.equal(npc.pos.z, 0);
  assert.equal(npc.waitingForDoor, true);
  for (let t = 0; t < 4; t += 0.05) {
    door.t = Math.min(1, door.t + 0.05 / 0.35);
    leaf.removed = door.t === 1;
    npc.update(0.05, away);
  }
  assert.equal(uses, 1);
  assert.ok(npc.pos.z > 2.95);
  assert.equal(npc.routineStop.id, 'inside');
});

test('opposing household walkers pass without overlapping or getting stuck', () => {
  const a = fixture([{ x: -2, z: 0 }, { id: 'east', x: 2, z: 0, wait: 30 }]);
  const b = fixture([{ x: 2, z: 0 }, { id: 'west', x: -2, z: 0, wait: 30 }]);
  b.npc.world = a.world;
  const people = [a.npc, b.npc];
  for (const n of people) n.neighbours = people;
  a.world.colliders.addBox(0, -1, 4, 0.1, 0, -1, 2.4);
  a.world.colliders.addBox(0, 1, 4, 0.1, 0, -1, 2.4);
  let closest = Infinity;
  for (let t = 0; t < 20; t += 0.05) {
    for (const n of people) n.update(0.05, away);
    closest = Math.min(closest, a.npc.pos.distanceTo(b.npc.pos));
  }
  assert.ok(closest >= 0.649, `walkers overlapped: ${closest}`);
  assert.equal(a.npc.routineStop.id, 'east');
  assert.equal(b.npc.routineStop.id, 'west');
});
