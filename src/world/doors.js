import * as THREE from 'three';

// Doors: a leaf from the kit hung on a hinge inside the frame the wall piece leaves for it.
// The leaf is scaled to fill that opening (the kit's leaf is a hand narrower than the opening
// its walls cut), swings on E, blocks the doorway while shut and stands against the inside
// while open. Public buildings (bank, store, inn) start open; private houses stay shut and
// answer a knock, so no interior is a trap and none is entered.

// The opening each wall piece cuts, measured on the kit's meshes (the audit measures it again
// and fails if these drift): half-width, and the height at the arch's crown or lintel.
export const OPENING = { Round: { half: 0.63, top: 2.46 }, Flat: { half: 0.63, top: 2.14 } };
// The kit's leaf in its own frame: the hinge edge is x = 0.
const LEAF = { Round: { x0: -0.05, x1: 1.07, y0: 0.03, y1: 2.35 }, Flat: { x0: -0.05, x1: 1.07, y0: 0.04, y1: 2.13 } };
const SWING = Math.PI / 2; // shut to open, into the building
const SECONDS = 0.35;
export const LEAF_THICK = 0.06;
export const DOOR_CLEAR = 2.25; // player-blocking height of a door

export function leafFit(shape) {
  const o = OPENING[shape], l = LEAF[shape];
  const half = o.half - 0.008;
  const sx = (2 * half) / (l.x1 - l.x0);
  const sy = (o.top - 0.02) / l.y1;
  // Hinge position (wall-local x) so the leaf spans exactly -half..+half when shut.
  return { sx, sy, half, hingeX: -half - l.x0 * sx, width: 2 * half, height: l.y1 * sy };
}

export class Door {
  // def: { x, z (world, centre of the doorway in the wall), yaw (world, wall piece yaw), y (ground), shape, public,
  //        name, id, wallLocal: {x0} } ; kit and scene to build the leaf; colliders to block the way.
  constructor({ kit, scene, colliders, def }) {
    this.def = def;
    this.public = !!def.public;
    this.fit = leafFit(def.shape);
    const c = Math.cos(def.yaw), s = Math.sin(def.yaw);
    // Wall-local (a along the wall, b out of it) to world.
    const toWorld = (a, b) => [def.x + a * c + b * s, def.z - a * s + b * c];
    this.toWorld = toWorld;
    const [hx, hz] = toWorld(this.fit.hingeX, 0);
    this.pivot = new THREE.Group();
    this.pivot.position.set(hx, def.y, hz);
    this.leafName = `Door_${def.leaf || 1}_${def.shape}`;
    this.leaf = kit.instance(this.leafName);
    // A painted door: its boards take the house's paint (the ironwork stays iron).
    if (def.paintMat) {
      const swap = (m) => (m.name === 'MI_WoodTrim' ? def.paintMat : m);
      this.leaf.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); });
    }
    this.leaf.scale.set(this.fit.sx, this.fit.sy, 1);
    this.pivot.add(this.leaf);
    this.pivot.userData.audit = { door: true, name: this.leafName };
    scene.add(this.pivot);

    this.open = this.public;
    this.t = this.open ? 1 : 0; // 0 shut .. 1 open
    this.goal = this.t;
    this.rattle = 0;
    this.colliders = colliders;
    this.shut = colliders.addBox(def.x, def.z, this.fit.half, LEAF_THICK + 0.04, def.yaw, def.y - 0.5, def.y + DOOR_CLEAR);
    this.shut.door = this;
    // The leaf moves, so the camera's triangle index leaves it out; while shut, this box stands in
    // for it (the frame's own triangles would otherwise mark it as covered and let the lens through).
    this.shut.keepCamera = true;
    // The open leaf stands inside, square to the wall, beside the doorway.
    const [ox, oz] = toWorld(this.fit.hingeX, -this.fit.width / 2);
    this.ajar = colliders.addBox(ox, oz, LEAF_THICK + 0.02, this.fit.width / 2, def.yaw, def.y - 0.5, def.y + DOOR_CLEAR);
    this.ajar.door = this;
    this.ajar.noCamera = true;
    this.target = {
      kind: 'station', station: 'door', door: this, name: 'Door',
      get verb() { return this.door.verb; },
      x: def.x, y: def.y + 1.15, z: def.z, r: 0.8, h: 2.3, reach: 2.7,
    };
    this.#pose();
    colliders.doors ??= [];
    colliders.doors.push(this);
  }

  get verb() {
    if (!this.public) return 'Knock on the';
    return this.open ? 'Close the' : 'Open the';
  }

  // E on the door. Returns a line for the message log, or nothing.
  use() {
    if (!this.public) {
      this.rattle = 0.4;
      return { locked: true, text: 'You knock. Nobody comes to the door.' };
    }
    this.open = !this.open;
    this.goal = this.open ? 1 : 0;
    return { opened: this.open };
  }

  // Puts the door straight into a state (the audit poses every door both ways).
  snap(open) {
    this.open = open;
    this.t = this.goal = open ? 1 : 0;
    this.rattle = 0;
    this.#pose();
  }

  update(dt) {
    if (this.rattle > 0) this.rattle = Math.max(0, this.rattle - dt);
    if (this.t !== this.goal) {
      const step = dt / SECONDS;
      this.t = this.goal > this.t ? Math.min(this.goal, this.t + step) : Math.max(this.goal, this.t - step);
    } else if (!this.rattle) return;
    this.#pose();
  }

  #pose() {
    const e = this.t * this.t * (3 - 2 * this.t);
    const shake = this.rattle > 0 ? Math.sin(this.rattle * 60) * 0.03 * (this.rattle / 0.4) : 0;
    this.pivot.rotation.y = this.def.yaw + e * SWING + shake;
    // Solid while shut, the leaf's own thin slab while fully open, nothing in between.
    this.shut.removed = this.t > 0;
    this.ajar.removed = this.t < 1;
    // Looking at the doorway is what the prompt points at; open, it reaches a little less far so
    // it doesn't shadow the counter behind it.
    this.target.reach = this.t >= 0.5 ? 2.2 : 2.7;
  }
}
