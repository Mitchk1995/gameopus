import * as THREE from 'three';
import { assetURL } from '../engine/assets.js';
import { Fire } from './effects.js';
import { LAKESIDE_HOME, homePoint } from './lakeside-plan.js';

// The first complete home in the approved lakeside direction. The editable
// Blender source and its measured collision manifest ship together.
export class LakesideHome {
  constructor({ scene, assets, world }) {
    Object.assign(this, { scene, assets, world });
    this.place = LAKESIDE_HOME;
    this.interactables = [];
    this.shapes = [];
    this.occupants = () => [];
  }

  async load() {
    const [gltf, response, garden, gardenResponse] = await Promise.all([
      this.assets.model('lakeside/rowan-cottage.glb'),
      fetch(assetURL('lakeside/rowan-cottage.manifest.json')),
      this.assets.model('lakeside/elin-garden.glb'),
      fetch(assetURL('lakeside/elin-garden.manifest.json')),
    ]);
    if (!response.ok) throw new Error(`Cottage collision manifest: ${response.status}`);
    if (!gardenResponse.ok) throw new Error(`Garden collision manifest: ${gardenResponse.status}`);
    const manifest = this.manifest = await response.json();
    const h = this.place;
    this.root = gltf.scene;
    this.root.name = 'Rowan and Elin cottage';
    this.root.position.set(h.x, h.y, h.z);
    this.root.rotation.y = h.rot;
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);

    for (const box of manifest.colliders) {
      const [x, y, z] = box.center, [width, height, depth] = box.size;
      const p = homePoint(x, z);
      const shape = this.world.colliders.addBox(p.x, p.z, width / 2, depth / 2, h.rot, h.y + y - height / 2, h.y + y + height / 2, { home: h.id, name: box.id });
      shape.owner = `lakeside:${box.id}`;
      shape.floor = !!box.floor;
      shape.cameraOnly = !!box.cameraOnly;
      // The transparent pane is omitted from static triangle indexing. Its
      // measured slab still keeps the camera inside a closed window.
      shape.keepCamera = /window_glazing$/.test(box.id);
      this.shapes.push(shape);
    }

    this.door = new CottageDoor(this, manifest.doorway);
    this.interactables.push(this.door.target);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // Ordinary shadow maps treat blended glazing as opaque; let sunlight
      // through the pane while its surrounding frame still casts a shadow.
      o.castShadow = o.userData.assetPart !== 'glass';
      o.receiveShadow = true;
      // Moving door leaves are represented by their moving collision slab.
      let dynamic = false;
      for (let p = o; p; p = p.parent) if (p === this.door.pivot) dynamic = true;
      o.userData.noCamera = dynamic || o.userData.noCamera === true || o.userData.staticCameraSolid === false;
    });
    this.world.solids.addObject(this.root);

    this.gardenManifest = await gardenResponse.json();
    this.gardenRoot = garden.scene;
    this.gardenRoot.name = "Elin's kitchen garden";
    this.gardenRoot.position.set(h.garden.x, h.y, h.garden.z);
    this.gardenRoot.rotation.y = h.rot;
    this.scene.add(this.gardenRoot);
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    for (const box of this.gardenManifest.colliders) {
      const [x, y, z] = box.center, [width, height, depth] = box.size;
      const shape = this.world.colliders.addBox(h.garden.x + x * c + z * s, h.garden.z - x * s + z * c, width / 2, depth / 2, h.rot, h.y + y - height / 2, h.y + y + height / 2, { home: h.id, name: box.id });
      shape.owner = `lakeside:garden:${box.id}`;
      shape.floor = !!box.floor;
      this.shapes.push(shape);
    }
    this.gardenRoot.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.noCamera = o.userData.staticCameraSolid === false;
    });
    this.world.solids.addObject(this.gardenRoot);

    if (manifest.hearthFire) {
      const [x, y, z] = manifest.hearthFire, p = homePoint(x, z);
      this.fire = new Fire(this.scene, p.x, h.y + y, p.z, { size: 0.35, light: true });
      const approach = homePoint(-2.55, z);
      this.interactables.push({ kind: 'station', station: 'fire', name: 'Cottage hearth', verb: 'Cook at', x: p.x, y: h.y + y + 0.5, z: p.z, r: 0.55, h: 1.4, reach: 2.5,
        access: { x: approach.x, y: h.y + 1.2, z: approach.z },
      });
    }
    return this;
  }

  update(dt) {
    this.door.update(dt);
    this.fire?.update(dt);
  }
}

class CottageDoor {
  constructor(home, def) {
    if (!def || !Array.isArray(def.hinge)) throw new Error('Cottage has no measured door hinge');
    def = { ...def, width: def.leafWidth || def.width, height: def.leafHeight || def.height, thickness: def.leafThickness || 0.08 };
    this.home = home;
    this.def = def;
    this.leaf = home.root.getObjectByName(def.node);
    if (!this.leaf) throw new Error(`Cottage door node missing: ${def.node}`);
    this.pivot = new THREE.Group();
    this.pivot.name = 'Cottage door hinge';
    this.pivot.position.fromArray(def.hinge);
    home.root.add(this.pivot);
    home.root.updateMatrixWorld(true);
    this.pivot.attach(this.leaf);
    this.open = false;
    this.t = this.goal = 0;
    this.public = true;
    const p = homePoint(def.hinge[0], def.hinge[2]);
    this.hinge = p;
    // Register the complete swing envelope in the spatial grid once. The slab
    // below changes within that envelope, so every pose remains discoverable.
    this.shape = home.world.colliders.addBox(p.x, p.z, def.width, def.width, 0, home.place.y + def.hinge[1], home.place.y + def.hinge[1] + def.height);
    this.shape.keepCamera = true;
    this.shape.door = this;
    this.shape.owner = 'lakeside:door';
    const centre = homePoint(def.hinge[0] + def.width / 2, def.hinge[2]);
    this.target = {
      kind: 'station', station: 'door', door: this, name: 'Cottage door',
      get verb() { return this.door.open ? 'Close the' : 'Open the'; },
      x: centre.x, y: home.place.y + 1.15, z: centre.z, r: 0.8, h: def.height, reach: 2.6,
    };
    this.#pose();
  }

  #occupied() {
    const { home, def, hinge } = this;
    return home.occupants().some((actor) => {
      const p = actor.pos;
      return p && p.y < home.place.y + def.height && p.y + 1.8 > home.place.y
        && Math.hypot(p.x - hinge.x, p.z - hinge.z) < def.width + 0.38;
    });
  }

  use() {
    if (this.open && this.#occupied()) return { opened: true, text: 'Let the doorway clear before closing it.' };
    this.open = !this.open;
    this.goal = this.open ? 1 : 0;
    return { opened: this.open };
  }

  snap(open) {
    this.open = open;
    this.t = this.goal = open ? 1 : 0;
    this.#pose();
  }

  update(dt) {
    if (this.t === this.goal) return;
    if (this.goal === 0 && this.#occupied()) { this.open = true; this.goal = 1; }
    const step = dt / 0.45;
    this.t = this.goal > this.t ? Math.min(this.goal, this.t + step) : Math.max(this.goal, this.t - step);
    this.#pose();
  }

  #pose() {
    const { def, home, shape } = this;
    const angle = this.t * this.t * (3 - 2 * this.t) * Math.PI / 2;
    this.pivot.rotation.y = angle;
    const p = homePoint(def.hinge[0] + Math.cos(angle) * def.width / 2, def.hinge[2] - Math.sin(angle) * def.width / 2);
    shape.x = p.x; shape.z = p.z;
    shape.hx = def.width / 2; shape.hz = (def.thickness || 0.08) / 2;
    shape.rot = home.place.rot + angle;
    shape.c = Math.cos(shape.rot); shape.s = Math.sin(shape.rot);
    shape.reach = Math.hypot(shape.hx, shape.hz);
    this.target.reach = this.t > 0.5 ? 2.2 : 2.6;
  }
}
