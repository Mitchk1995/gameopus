import assert from 'node:assert/strict';
import test from 'node:test';
import { Colliders } from '../../src/world/colliders.js';
import { meleeReach } from '../../src/game/melee-reach.js';

const arena = () => {
  const colliders = new Colliders();
  return {
    colliders,
    lineOfSight(a, b, pad, full3D, tight) {
      return full3D
        ? colliders.sweep(a.x, a.y, a.z, b.x - a.x, b.y - a.y, b.z - a.z, pad, tight)
        : colliders.raycast(a.x, a.y, a.z, b.x - a.x, b.y - a.y, b.z - a.z, pad);
    },
  };
};
const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 1.8 };
const hit = (w, from = a, to = b) => meleeReach(w, from, to, 2.2, 1.8, 1.8, 0.35);

test('normal reach, slopes and a metre-high jump still connect in either direction', () => {
  const w = arena();
  assert.equal(hit(w), true);
  assert.equal(hit(w, b, a), true);
  assert.equal(hit(w, { ...a, y: 1 }), true);
  assert.equal(hit(w, a, { ...b, y: 1 }), true);
  assert.equal(hit(w, a, { ...b, z: 3 }), false);
});

test('a melee blow cannot reach a distant floor above or below the attacker', () => {
  const w = arena();
  assert.equal(hit(w, a, { ...b, y: 8 }), false);
  assert.equal(hit(w, { ...a, y: 8 }, b), false);
});

test('a close upper floor blocks a vertical attack even inside its footprint', () => {
  const w = arena(), above = { x: 0, y: 2, z: 0.2 };
  assert.equal(hit(w, a, above), true);
  const floor = w.colliders.addBox(0, 0, 3, 3, 0, 1.8, 2);
  floor.cameraOnly = true;
  assert.equal(hit(w, a, above), false);
  assert.equal(hit(w, above, a), false);
});

test('a closed door blocks both attackers; removing it restores contact', () => {
  const w = arena();
  const door = w.colliders.addBox(0, 0.9, 0.6, 0.08, 0, 0, 2.5);
  assert.equal(hit(w), false);
  assert.equal(hit(w, b, a), false);
  w.colliders.remove(door);
  assert.equal(hit(w), true);
  assert.equal(hit(w, b, a), true);
});

test('a wall or tree blocks the blow, while low ground furniture does not', () => {
  const w = arena();
  const wall = w.colliders.addBox(0, 0.9, 3, 0.1, 0, 0, 4);
  assert.equal(hit(w), false);
  w.colliders.remove(wall);
  const tree = w.colliders.addCircle(0, 0.9, 0.2, 0, 8);
  assert.equal(hit(w), false);
  w.colliders.remove(tree);
  w.colliders.addBox(0, 0.9, 0.6, 0.2, 0, 0, 0.5);
  assert.equal(hit(w), true);
});

test('a slam measures from its impact point but cannot hit through a wall', () => {
  const w = arena(), impact = { x: 0, z: 1.6 }, victim = { x: 0, y: 0, z: 4.5 };
  const slam = () => meleeReach(w, a, victim, 3.4, 2.8, 1.8, 0, impact);
  assert.equal(slam(), true);
  w.colliders.addBox(0, 0.9, 3, 0.08, 0, 0, 4);
  assert.equal(slam(), false);
});
