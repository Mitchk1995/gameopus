import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batcher } from './kit.js';
import { rng } from './buildings.js';
import { FIRE, KILN } from './ashford.js';
import { placeProp, tag, fitUV, courseGeometry } from './props.js';
import { TownKit } from './townkit.js';
import { shed as hutBuild } from './grounds.js';
import { ropeGeometry, canvasTexture, Builder } from './greens.js';
import { Fire, fishingRings } from './effects.js';
import { ROCKS, FISHING } from '../game/content.js';
import { VILLAGE, LAKE, FARMS, SWIMS, MINE_ENTRANCE, roadDistance } from './map.js';

// The things you work with: ore rocks at the mine, fishing spots on the lake and
// river, flax in the field, and the village's workstations (furnace and anvil in
// the smithy, the cooking fire, spinning wheel, potter's wheel and kiln).
//
// Each registers an interactable: { kind, x, y, z, r, h, reach, ... } that the game's
// targeting picks from when you look at it and press E.

export class Resources {
  constructor({ scene, assets, world, kit }) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.kit = kit;
    this.items = [];
    this.fires = [];
    this.rocks = [];
    this.spots = [];
  }

  async load() {
    const rockTex = await this.assets.texture('ground/cliff_a.webp');
    this.rockMat = new THREE.MeshStandardMaterial({ map: rockTex, color: 0xb2aca4, roughness: 0.92 });
    this.rockMat.name = 'Rock_Cliff';
    const batch = new Batcher(this.kit);
    // Built things out at the mine and the dock go through a TownKit (world-scale timber, bark, iron).
    this.tk = new TownKit(this.kit, batch, this.world.colliders, this.world);
    // The same surfaces as the town's (loaded once, by the village).
    if (this.world.village?.tk?.extrasLoaded) Object.assign(this.tk.m, this.world.village.tk.m);
    else await this.tk.extras(this.assets);
    this.tk.nid = 2000000; // audit ids apart from the village's and the vale's
    this.#mine();
    this.#caveMouth(batch);
    this.#fishing();
    this.#smithy(batch);
    this.#cookingFire(batch);
    this.#craftCorner(batch);
    // The fire in the inn's hearth (the village built the fireplace).
    const hf = this.world.village.hearthFire;
    if (hf) {
      const fire = new Fire(this.scene, hf.x, hf.y, hf.z, { size: 0.38, light: false });
      this.fires.push(fire);
    }
    this.#jetty(batch);
    this.scene.add(batch.build());
    this.#flax();
    return this;
  }

  add(obj) {
    this.items.push(obj);
    return obj;
  }

  // Interactables within r of a point.
  near(x, z, r) {
    return this.items.filter((o) => !o.hidden && Math.hypot(o.x - x, o.z - z) < r + (o.r || 0));
  }

  update(dt) {
    Fire.tick(dt);
    fishingRings.tick(dt);
    for (const f of this.fires) f.update(dt);
    const now = performance.now() / 1000;
    for (const r of this.rocks) if (r.depleted && now >= r.respawnAt) this.setRock(r, false);
    for (const f of this.flaxPlants || []) if (f.picked && now >= f.respawnAt) this.#setFlax(f, false);
  }

  // ------------------------------------------------------------------ mine
  #mine() {
    const T = this.world.terrain;
    const rnd = rng(31);
    // A quarry floor below the hill: rocks scattered on the gentler ground.
    const kinds = ['copper', 'copper', 'copper', 'tin', 'tin', 'tin', 'clay', 'clay', 'iron', 'iron', 'iron', 'iron', 'coal', 'coal', 'coal', 'copper', 'tin'];
    const cx = MINE_ENTRANCE.x + 16, cz = MINE_ENTRANCE.z + 10;
    const placed = [];
    for (const kind of kinds) {
      let x, z, tries = 0;
      do {
        const a = rnd() * Math.PI * 2, d = 4 + Math.sqrt(rnd()) * 16;
        x = cx + Math.cos(a) * d;
        z = cz + Math.sin(a) * d;
        tries++;
      } while (tries < 60 && (T.normalAt(x, z).y < 0.9 || placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 3.2)));
      placed.push([x, z]);
      this.#rock(kind, x, T.heightAt(x, z), z, rnd);
    }
    // All boulders in one mesh; each rock keeps its own (merged) ore.
    const bodies = this.rockBodies.map((m) => {
      m.parent.updateMatrixWorld(true); // the rock's group holds its position; bake the body where it stands
      return m.geometry.clone().applyMatrix4(m.matrixWorld);
    });
    const all = new THREE.Mesh(mergeGeometries(bodies), this.rockMat);
    all.castShadow = all.receiveShadow = true;
    this.scene.add(tag(all, 'Boulders'));
    for (const m of this.rockBodies) m.parent.remove(m);
    this.mineCentre = { x: cx, z: cz };
  }

  #rock(kind, x, y, z, rnd) {
    const def = ROCKS[kind];
    const s = 0.75 + rnd() * 0.35;
    const g = new THREE.Group();
    g.position.set(x, y - 0.15, z);
    g.rotation.y = rnd() * Math.PI * 2;
    const shape = boulder(s, rnd);
    const body = new THREE.Mesh(shape, this.rockMat);
    g.add(body);
    (this.rockBodies ??= []).push(body);
    // Ore shows as veins: bands of the ore's colour where folds in the stone cross the rock's upper
    // faces (copper green where it has weathered, tin pale grey, iron rust red, clay ochre), standing a
    // hair proud of the stone. They go when the rock is worked out.
    // (the placement's random sequence is kept as it was when the ore was nuggets: the quarry's rocks
    // stay where the roads and the tests know them)
    for (let i = 0; i < (kind === 'clay' ? 5 : 11) * 6; i++) rnd();
    const veins = veinGeometry(shape, s, rng(Math.round(Math.abs(x * 131 + z * 71)) + 7), kind);
    const oreMat = (this.oreMats ??= {})[kind] ??= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: kind === 'clay' || kind === 'coal' ? 0.9 : 0.4, metalness: ['copper', 'tin', 'iron'].includes(kind) ? 0.55 : 0 });
    const merged = new THREE.Mesh(veins, oreMat);
    merged.castShadow = true;
    g.add(merged);
    this.scene.add(g);
    this.world.colliders.addCircle(x, z, 0.85 * s, y - 1, y + 1.2 * s);
    const rock = this.add({ kind: 'rock', rock: kind, def, x, y: y + 0.6 * s, z, r: 1.0 * s, h: 1.4 * s, reach: 2.2 + s, group: g, veins: merged, depleted: false });
    this.rocks.push(rock);
  }

  // The adit into the hill, the way down to the Old Warren: a face of cliff rock round a timbered
  // portal (two sets of posts and caps with lagging boards over them), the dark of the drift beyond,
  // rails running out on sleepers to a tipped ore cart, a lantern on the post and the spoil heap.
  #caveMouth(batch) {
    const T = this.world.terrain;
    const tk = this.tk, m = tk.m;
    const { x, z, facing } = MINE_ENTRANCE;
    const fx = Math.sin(facing), fz = Math.cos(facing), rx = Math.cos(facing), rz = -Math.sin(facing);
    const at = (a, o) => [x + rx * a + fx * o, z + rz * a + fz * o]; // a across the portal, o out of it
    const y = T.heightAt(x, z);
    const rnd = rng(77);
    // The rock face: big cliff-textured boulders banked round and over the portal.
    tk.begin('mine face', x, z);
    for (let k = 0; k <= 12; k++) {
      const t = Math.PI * (k / 12), rr = 2.9 + rnd() * 0.5;
      const [bx, bz] = at(Math.cos(t) * rr, -0.8 - rnd() * 0.6);
      const size = 1.0 + rnd() * 0.7;
      tk.put(fitUV(boulder(size, rnd), 2.6), this.rockMat, bx, y + Math.sin(t) * 3.1 - 0.9, bz, rnd() * 6, 1, 1.15, 0.85);
      if (Math.sin(t) < 0.75) tk.solidCircle(bx, bz, size * 0.8, y + Math.sin(t) * 3.1 - 0.9, size * 1.4);
    }
    for (const a of [-4.6, 4.8]) {
      const [bx, bz] = at(a, -1.6);
      tk.put(fitUV(boulder(1.8, rnd), 2.6), this.rockMat, bx, y - 1.0, bz, rnd() * 6, 1.1, 1.3, 1);
      tk.solidCircle(bx, bz, 1.6, y - 1.0, 3.2);
    }
    // Two timber sets: posts with a cap across, lagging boards laid over the caps and down the sides.
    tk.begin('mine portal', x, z);
    const setAt = [0.25, -1.2];
    for (const o of setAt) {
      for (const a of [-1.3, 1.3]) {
        const [px, pz] = at(a, o);
        tk.put(tk.poleGeometry(0.15, 0.13, 3.1), m.barkDark, px, y - 0.2, pz, facing, 1, 1, 1, 0, a > 0 ? -0.04 : 0.04);
      }
      const [cx, cz] = at(0, o);
      tk.put(tk.logGeometry(0.16, 3.2, 9), [m.barkDark, m.endgrain, m.endgrain], cx, y + 2.95, cz, facing + Math.PI / 2);
    }
    for (let i = 0; i < 7; i++) {
      const a = -1.35 + i * 0.45;
      const [lx, lz] = at(a, -0.47);
      tk.put(tk.timberBox(0.4, 0.05, 1.9, 'z'), m.timber, lx, y + 3.12, lz, facing);
    }
    for (const a of [-1.42, 1.42]) for (let k = 0; k < 5; k++) {
      const [lx, lz] = at(a, -0.47);
      tk.put(tk.timberBox(0.05, 0.36, 1.8, 'z'), m.timber, lx, y + 0.2 + k * 0.52, lz, facing);
    }
    // The drift beyond: dark, going on into the hill.
    const [dx, dz] = at(0, -2.9);
    tk.put(tk.box(2.5, 2.9, 3.0), m.dark, dx, y - 0.1, dz, facing);
    tk.solidBox(dx, dz, 1.25, 1.5, facing, y, 2.9);
    // Rails on sleepers running out of the drift.
    tk.begin('mine rails', x, z);
    for (let o = -1.8; o < 5.2; o += 0.65) {
      const [sx, sz] = at(0, o);
      const gy = T.heightAt(sx, sz);
      tk.put(tk.timberBox(1.1, 0.09, 0.16, 'x'), m.timber, sx, Math.max(gy, y) - 0.04, sz, facing);
    }
    for (const a of [-0.32, 0.32]) {
      const [rx0, rz0] = at(a, 1.7);
      tk.put(tk.box(0.05, 0.07, 7.0), m.iron, rx0, y + 0.05, rz0, facing);
    }
    // The ore cart, run out on the rails, heaped with ore.
    const [kx, kz] = at(0, 2.6);
    tk.begin('ore cart', kx, kz);
    tk.put(tk.timberBox(0.8, 0.55, 1.1, 'z'), m.timber, kx, y + 0.3, kz, facing);
    for (const e of [-1, 1]) {
      const [bx, bz] = at(e * 0.41, 2.6);
      tk.put(tk.box(0.03, 0.08, 1.14), m.iron, bx, y + 0.72, bz, facing);
    }
    for (const a of [-0.32, 0.32]) for (const o of [2.25, 2.95]) {
      const [wx, wz] = at(a, o);
      const wheel = (tk.geo.cartWheel ??= new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12).rotateZ(Math.PI / 2));
      tk.put(wheel, m.iron, wx, y + 0.21, wz, facing);
    }
    const oreHeap = (tk.geo.oreHeap ??= new THREE.SphereGeometry(0.42, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.55, 1.2));
    tk.put(fitUV(oreHeap.clone(), 1.2), this.rockMat, kx, y + 0.82, kz, facing);
    tk.solidBox(kx, kz, 0.45, 0.6, facing, y, 0.95);
    // A lantern on the right-hand post, facing out.
    const [lx, lz] = at(1.3 + 0.16, 0.25);
    tk.begin('mine lantern', lx, lz, false, true);
    tk.bracketLantern(lx, y + 2.6, lz, facing + Math.PI / 2);
    // The portal's posts and side boards are solid.
    tk.begin('mine portal', x, z);
    for (const o of setAt) for (const a of [-1.3, 1.3]) tk.solidCircle(...at(a, o), 0.17, y, 3.0);
    for (const a of [-1.42, 1.42]) tk.solidBox(...at(a, -0.47), 0.06, 0.95, facing, y, 2.8);
    // The spoil heap beside the portal: waste rock tipped from the carts.
    const [hx, hz] = at(-5.2, 3.0);
    tk.begin('spoil heap', hx, hz);
    const heap = new THREE.SphereGeometry(2.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hp = heap.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const vx = hp.getX(i), vy = hp.getY(i), vz = hp.getZ(i);
      const n = Math.sin(vx * 3.1) * Math.sin(vz * 2.7) * 0.15 + Math.sin(vx * 7 + vz * 5) * 0.06;
      hp.setXYZ(i, vx * (1 + n), vy * 0.55 * (1 + n), vz * (1 + n) * 0.8);
    }
    heap.computeVertexNormals();
    const hy = T.heightAt(hx, hz);
    tk.put(fitUV(heap, 2.2), this.rockMat, hx, hy - 0.25, hz, facing);
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2, d = 2.2 + rnd() * 1.2;
      tk.put(fitUV(boulder(0.25 + rnd() * 0.2, rnd), 1.2), this.rockMat, hx + Math.cos(a) * d, T.heightAt(hx + Math.cos(a) * d, hz + Math.sin(a) * d) - 0.1, hz + Math.sin(a) * d, rnd() * 6);
    }
    tk.solidCircle(hx, hz, 2.0, hy, 1.1);
    // The light the lantern gives.
    const lamp = new THREE.PointLight(0xffb060, 3, 7, 1.6);
    lamp.position.set(lx + fx * 0.5, y + 2.1, lz + fz * 0.5);
    this.scene.add(lamp);
    for (const s of [-1, 1]) this.world.colliders.addCircle(x + rx * s * 2.3, z + rz * s * 2.3, 0.9, y - 1, y + 4);
    this.world.colliders.addBox(x - fx * 0.8, z - fz * 0.8, 1.4, 0.4, facing, y - 1, y + 4);
    this.cave = this.add({ kind: 'station', station: 'cave', name: 'Old Warren', verb: 'Enter the', x: x - fx * 0.3, y: y + 1.5, z: z - fz * 0.3, r: 1.3, h: 3, reach: 2.6 });
    this.caveExit = { x: x + fx * 4.2, z: z + fz * 4.2, facing };
  }

  setRock(r, depleted, respawn = 5) {
    r.depleted = depleted;
    r.veins.visible = !depleted;
    r.respawnAt = performance.now() / 1000 + respawn;
  }

  // ------------------------------------------------------------------ fishing
  #fishing() {
    const T = this.world.terrain;
    const spots = [];
    // Net fishing along the lake's north shore, near the jetty.
    for (let a = -2.2; a <= -0.9; a += 0.26) {
      for (let d = LAKE.r * 0.5; d < LAKE.r * 1.3; d += 0.5) {
        const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d;
        if (T.heightAt(x, z) > -0.75) {
          // Step back into the water a little.
          const bx = LAKE.x + Math.cos(a) * (d - 2.5), bz = LAKE.z + Math.sin(a) * (d - 2.5);
          spots.push(['net', bx, bz]);
          break;
        }
      }
    }
    // Fly fishing on the river: its pools, off the gravel bars you can stand on (map.js SWIMS).
    for (const [x, z] of SWIMS) spots.push(['fly', x, z]);
    for (const [method, x, z] of spots) {
      const def = FISHING[method];
      const rings = fishingRings(this.scene, x, z);
      this.spots.push(this.add({ kind: 'fish', method, def, x, y: 0.2, z, r: 1.3, h: 0.8, reach: 5.5, rings }));
    }
  }

  // ------------------------------------------------------------------ smithy
  #smithy(batch) {
    // The smithy building (open front, posts at the open corners) is built with the village;
    // this fits it out: a flagstone floor, the forge, the anvil on its stump, the quench tub.
    const place = this.world.village.places.smithy;
    const { x, z, rot } = place;
    const at = (lx, lz) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      return [x + lx * c + lz * s, z - lx * s + lz * c];
    };
    const env = { kit: this.kit, batch, scene: this.scene, colliders: this.world.colliders };
    // Flagstones.
    for (let ix = 0; ix < place.w / 2; ix++) for (let iz = 0; iz < place.d / 2; iz++) {
      const [px, pz] = at(-place.w / 2 + 1 + ix * 2, -place.d / 2 + 1 + iz * 2);
      batch.add('Floor_UnevenBrick', px, VILLAGE.y + 0.012, pz, rot);
    }
    // The forge against the back wall.
    const [fx, fz] = at(-1.2, -place.d / 2 + 0.95);
    this.#furnace(fx, fz, rot, place, batch);
    // Anvil in the middle, tools and a water barrel.
    const [ax, az] = at(0.9, 0.4);
    placeProp(env, 'Anvil_Log', ax, VILLAGE.y, az, rot + 0.3);
    this.add({ kind: 'station', station: 'anvil', name: 'Anvil', x: ax, y: VILLAGE.y + 0.8, z: az, r: 0.6, h: 1.1, reach: 2.4 });
    const [wx, wz] = at(2.1, -1.8);
    placeProp(env, 'Whetstone', wx, VILLAGE.y, wz, rot + Math.PI);
    const [sx, sz] = at(2.15, 0.2); // against the side wall, out of the smith's face
    placeProp(env, 'WeaponStand', sx, VILLAGE.y, sz, rot + Math.PI / 2);
    // The quench tub beside the anvil: a coopered half-barrel of water.
    const [qx, qz] = at(1.1, 1.75);
    this.#quench(qx, qz, batch);
    this.places = { ...(this.places || {}), smithy: place };
  }

  // A town kit for the stations' own pieces, batched with them (its audit ids kept apart).
  #tk(batch) {
    if (this.tkFor === batch) return this.tk;
    this.tk = new TownKit(this.kit, batch, this.world.colliders, this.world);
    this.tk.nid = 3000000;
    this.tkFor = batch;
    return this.tk;
  }

  // The forge: a waist-high brick hearth with a bed of live coals in it (the fire burns in a hollow
  // in the top), a brick hood over it narrowing into a chimney that runs up through the roof, and a
  // pair of leather bellows beside it on their frame, with the lever the smith pulls.
  #furnace(x, z, rot, place, batch) {
    const tk = this.#tk(batch);
    const L = this.world.village.looks;
    const brick = findMaterial(this.kit, 'MI_Brick') || this.rockMat;
    const iron = this.world.village.tk.m.iron;
    const y = VILLAGE.y;
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const W = 1.8, D = 1.1, HH = 0.85;
    tk.begin('forge', x, z);
    // The hearth: a brick block, its top a rim round a sunken fire bed.
    tk.put(tk.box(W, HH - 0.12, D), brick, x, y, z, rot);
    for (const [lx, lz, w, d] of [[0, -D / 2 + 0.1, W, 0.2], [0, D / 2 - 0.1, W, 0.2], [-W / 2 + 0.2, 0, 0.4, D - 0.4], [W / 2 - 0.2, 0, 0.4, D - 0.4]]) {
      const [px, pz] = at(lx, lz);
      tk.put(tk.box(w, 0.12, d), brick, px, y + HH - 0.12, pz, rot);
    }
    // Coals: dark lumps round a glowing heart.
    const coal = (L.coal ??= new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 1 }));
    const ember = (L.ember ??= new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff5a18, emissiveIntensity: 2.0, roughness: 1 }));
    tk.put(tk.box(W - 0.8, 0.04, D - 0.4), ember, x, y + HH - 0.12, z, rot);
    const rnd = rng(55);
    for (let i = 0; i < 26; i++) {
      const lx = (rnd() - 0.5) * (W - 0.9), lz = (rnd() - 0.5) * (D - 0.5), [px, pz] = at(lx, lz);
      const g = (tk.geo['coal' + (i % 4)] ??= new THREE.DodecahedronGeometry(0.05 + (i % 4) * 0.012, 0));
      tk.put(g, Math.hypot(lx / (W - 0.9), lz / (D - 0.5)) < 0.3 && i % 3 === 0 ? ember : coal, px, y + HH - 0.1 + rnd() * 0.03, pz, rnd() * 6);
    }
    // Brick cheeks at the back corners carry the hood.
    for (const k of [-1, 1]) {
      const [px, pz] = at(k * (W / 2 - 0.14), -D / 2 + 0.14);
      tk.put(tk.box(0.28, 1.12, 0.28), brick, px, y + HH - 0.02, pz, rot);
    }
    // The hood: a brick funnel from over the hearth up into the chimney.
    const hood = new THREE.CylinderGeometry(0.42 * Math.SQRT2, 1.0 * Math.SQRT2, 1.1, 4, 1, true).rotateY(Math.PI / 4);
    hood.scale(1, 1, D / 2 + 0.05);
    const hoodG = fitUV(hood.translate(0, 0.55, 0), 2.2);
    hoodG.userData.wuv = true;
    tk.put(hoodG, brick, x, y + 1.95, z, rot);
    // The chimney: from the hood up through the roof to well above the ridge.
    const top = place.roof?.ridge ?? 5.5;
    const h = top + 1.0 - 3.05;
    tk.put(tk.box(0.84, h, 0.64), brick, x, y + 3.05, z, rot);
    tk.put(tk.box(1.0, 0.14, 0.8), brick, x, y + 3.05 + h - 0.2, z, rot);
    // The bellows: its frame, the leather bag between two boards, the nozzle into the fire, the lever.
    const [bx, bz] = at(W / 2 + 0.55, 0.05);
    tk.begin('forge bellows', bx, bz);
    const tim = L.timber('oak'), leather = (L.leather ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.8 }), { name: 'Leather' }));
    for (const k of [-1, 1]) { const [px, pz] = at(W / 2 + 0.55 + k * 0.3, 0.05); tk.put(tk.box(0.08, 0.7, 0.08), tim, px, y, pz, rot); }
    tk.put(tk.box(0.72, 0.06, 0.5), tim, bx, y + 0.7, bz, rot);
    const wedge = new THREE.Shape([new THREE.Vector2(-0.45, 0), new THREE.Vector2(0.45, 0), new THREE.Vector2(0.45, 0.34), new THREE.Vector2(-0.45, 0.06)]);
    const wg = new THREE.ExtrudeGeometry(wedge, { depth: 0.46, bevelEnabled: false }).translate(0, 0, -0.23);
    tk.put(wg, leather, bx, y + 0.76, bz, rot + Math.PI / 2);
    tk.put(tk.box(0.5, 0.04, 0.95), tim, bx, y + 0.96, bz, rot);
    const [nx, nz] = at(W / 2 + 0.2, 0.05);
    tk.put(tk.cyl(0.05, 0.03, 0.34, 8), iron, nx, y + 0.72, nz, rot, 1, 1, 1, 0, Math.PI / 2);
    tk.put(tk.box(0.05, 0.05, 1.3), tim, bx, y + 1.0, bz, rot, 1, 1, 1, 0.5, 0);
    this.world.colliders.addBox(bx, bz, 0.42, 0.3, rot, y - 0.5, y + 1.1);
    // The fire in the bed of coals, and its light.
    const fire = new Fire(this.scene, 0, 0, 0, { size: 0.42 });
    fire.group.position.set(x, y + HH - 0.1, z);
    this.scene.add(fire.group);
    this.fires.push(fire);
    this.world.colliders.addBox(x, z, W / 2, D / 2, rot, y - 1, y + HH);
    this.world.colliders.addBox(x, z, 0.5, 0.35, rot, y + 1.9, y + h + 3.2).cameraOnly = true;
    this.add({ kind: 'station', station: 'furnace', name: 'Forge', x, y: y + 1.0, z, r: 1.0, h: 1.4, reach: 2.8 });
  }

  // A coopered tub of water for quenching hot iron.
  #quench(x, z, batch) {
    const tk = this.#tk(batch);
    const y = VILLAGE.y;
    const tim = this.world.village.looks.timber('oak');
    tk.begin('quench tub', x, z);
    const staves = 16, R = 0.38, H = 0.55;
    for (let i = 0; i < staves; i++) {
      const a = (i / staves) * Math.PI * 2;
      tk.put(tk.box(0.155, H, 0.04), tim, x + Math.cos(a) * R, y, z + Math.sin(a) * R, -a + Math.PI / 2);
    }
    for (const hy of [0.1, 0.45]) tk.put(new THREE.TorusGeometry(R + 0.02, 0.012, 5, 24).rotateX(Math.PI / 2), this.world.village.tk.m.iron, x, y + hy, z);
    const water = (this.waterMat ??= new THREE.MeshStandardMaterial({ color: 0x223c44, roughness: 0.08 }));
    tk.put(new THREE.CircleGeometry(R - 0.02, 20).rotateX(-Math.PI / 2), water, x, y + H - 0.08, z);
    tk.put(tk.cyl(R, R, 0.03, 16), tim, x, y + 0.02, z);
    this.world.colliders.addCircle(x, z, R + 0.04, y - 0.5, y + H).floor = true;
  }

  // ------------------------------------------------------------------ cooking fire
  #cookingFire(batch) {
    const x = FIRE.x, z = FIRE.z;
    const y = VILLAGE.y;
    const stones = new THREE.Group();
    stones.position.set(x, y, z);
    const rnd = rng(12);
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      const s = new THREE.Mesh(boulder(0.2 + rnd() * 0.06, rnd), this.rockMat);
      s.position.set(Math.cos(t) * 0.75, 0.05, Math.sin(t) * 0.75);
      s.castShadow = true;
      stones.add(s);
    }
    const logMat = this.tk.m.barkDark;
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 7), logMat);
      l.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI * 2, 0);
      l.position.y = 0.18;
      stones.add(l);
    }
    // A spit over the fire.
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), logMat);
      post.position.set(sx * 0.85, 0.6, 0);
      stones.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), logMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 1.15;
    stones.add(bar);
    this.scene.add(tag(stones, 'CookingFire'));
    const fire = new Fire(this.scene, x, y + 0.12, z, { size: 0.8 });
    this.fires.push(fire);
    this.world.colliders.addCircle(x, z, 1.0, y - 1, y + 1.3);
    this.add({ kind: 'station', station: 'fire', name: 'Cooking fire', x, y: y + 0.5, z, r: 0.9, h: 1.2, reach: 2.6 });
    // A crate of split logs by the fire.
    placeProp({ kit: this.kit, batch, scene: this.scene, colliders: this.world.colliders }, 'Crate_Wooden', x - 1.7, y, z - 1.0, 0.4);
  }

  // ------------------------------------------------------------------ crafting
  #craftCorner(batch) {
    // The potter's open workshop stands on the west side of the square; the kiln sits in the
    // alcove beside it.
    const po = this.world.village.places.potter;
    const y = VILLAGE.y;
    const face = po.rot;
    const local = (lx, lz) => {
      const c = Math.cos(po.rot), s = Math.sin(po.rot);
      return [po.x + lx * c + lz * s, po.z - lx * s + lz * c];
    };
    this.places = { ...(this.places || {}), potter: po };
    // Planed wood, not the kit's trim sheet (its metal strip showed on the wheels' thin parts).
    const woodMat = this.tk.m.planed || findMaterial(this.kit, 'MI_WoodTrim');
    const brick = findMaterial(this.kit, 'MI_RedBrick') || this.rockMat;
    // Spinning wheel.
    {
      const [px, pz] = local(-2.4, 1.0);
      const g = new THREE.Group();
      g.position.set(px, y, pz);
      g.rotation.y = face + Math.PI / 2;
      const wheel = new THREE.Mesh(fitUV(new THREE.TorusGeometry(0.42, 0.03, 6, 28), 2.2), woodMat);
      wheel.position.y = 0.85;
      g.add(wheel);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.012, 0.012, 0.82, 4), 2.2), woodMat);
        sp.position.y = 0.85;
        sp.rotation.z = (i / 8) * Math.PI;
        g.add(sp);
      }
      const base = new THREE.Mesh(fitUV(new THREE.BoxGeometry(0.9, 0.08, 0.3), 2.2), woodMat);
      base.position.set(0.15, 0.32, 0);
      g.add(base);
      for (const sx of [-0.3, 0.55]) for (const sz of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 5), 2.2), woodMat);
        leg.position.set(sx, 0.16, sz);
        g.add(leg);
      }
      const upright = new THREE.Mesh(fitUV(new THREE.BoxGeometry(0.06, 0.62, 0.06), 2.2), woodMat);
      upright.position.set(0, 0.62, 0);
      g.add(upright);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(tag(g, 'SpinningWheel'));
      this.spinWheel = wheel;
      // The frame is a long low base with the wheel standing on it: a box along the base.
      const wr = face + Math.PI / 2, wc = Math.cos(wr), ws = Math.sin(wr);
      this.world.colliders.addBox(px + 0.1 * wc, pz - 0.1 * ws, 0.55, 0.22, wr, y - 1, y + 1.3);
      this.add({ kind: 'station', station: 'wheel', name: 'Spinning wheel', x: px, y: y + 0.8, z: pz, r: 0.6, h: 1.3, reach: 2.4 });
    }
    // Potter's wheel.
    {
      const [px, pz] = local(0.5, 1.1);
      const g = new THREE.Group();
      g.position.set(px, y, pz);
      const table = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.34, 0.3, 0.06, 20), 2.2), woodMat);
      table.position.y = 0.62;
      const stem = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), 2.2), woodMat);
      stem.position.y = 0.31;
      const kick = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 20), 2.2), woodMat);
      kick.position.y = 0.08;
      const lump = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.5 }));
      lump.scale.y = 0.7;
      lump.position.y = 0.7;
      g.add(table, stem, kick, lump);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(tag(g, 'PottersWheel'));
      this.world.colliders.addCircle(px, pz, 0.42, y - 1, y + 0.9);
      this.add({ kind: 'station', station: 'potter', name: "Potter's wheel", x: px, y: y + 0.6, z: pz, r: 0.5, h: 1.0, reach: 2.3 });
    }
    // Kiln: a brick beehive on a stone footing, built in courses, with an arched stoking
    // mouth in front (the fire burns in it) and a flue stack on top with an iron collar.
    {
      this.#kiln(KILN.x, KILN.z, KILN.rot, y);
    }
    const env = { kit: this.kit, batch, scene: this.scene, colliders: this.world.colliders };
    const tk = this.#tk(batch);
    const L = this.world.village.looks;
    const mat = (key, color, roughness) => (L[key] ??= Object.assign(new THREE.MeshStandardMaterial({ color, roughness }), { name: key }));
    const clay = mat('Clay', 0x8a6446, 0.55), green = mat('Greenware', 0xbcae98, 0.95), terra = mat('Terracotta', 0xa9573b, 0.8), glaze = mat('Glaze', 0x5d6f58, 0.35);
    const tim = L.timber('oak');
    // A floor of boards.
    for (let ix = 0; ix < po.w / 2; ix++) for (let iz = 0; iz < po.d / 2; iz++) {
      const [px, pz] = local(-po.w / 2 + 1 + ix * 2, -po.d / 2 + 1 + iz * 2);
      batch.add('Floor_WoodLight', px, y + 0.012, pz, face);
    }
    // Turned pots: a jug, a bowl, a storage jar (profiles in metres, lathe-turned like the real thing).
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 14);
    const POTS = {
      jug: lathe([[0.001, 0], [0.08, 0], [0.11, 0.05], [0.12, 0.13], [0.09, 0.21], [0.055, 0.26], [0.065, 0.31], [0.05, 0.31], [0.001, 0.29]]),
      bowl: lathe([[0.001, 0], [0.06, 0], [0.13, 0.04], [0.16, 0.09], [0.145, 0.095], [0.11, 0.05], [0.001, 0.03]]),
      jar: lathe([[0.001, 0], [0.09, 0], [0.15, 0.09], [0.16, 0.19], [0.13, 0.29], [0.09, 0.32], [0.1, 0.35], [0.001, 0.34]]),
    };
    const pot = (kind, m, lx, yy, lz, turn = 0) => { const [px, pz] = local(lx, lz); tk.put(POTS[kind], m, px, yy, pz, face + turn); };
    // The display at the front, by the corner post: a two-tier plank stand on trestles, fired ware on it.
    {
      const [cx, cz] = local(2.5, po.d / 2 - 0.55);
      tk.begin('pot display', cx, cz);
      for (const [lz, hy, dep] of [[po.d / 2 - 0.4, 0.55, 0.42], [po.d / 2 - 0.72, 0.95, 0.3]]) {
        const [px, pz] = local(2.5, lz);
        tk.put(tk.box(2.2, 0.045, dep), tim, px, y + hy - 0.045, pz, face);
        for (const k of [-1, 1]) {
          const [lx2, lz2] = local(2.5 + k * 1.0, lz);
          tk.put(tk.box(0.06, hy - 0.045, 0.06), tim, lx2, y, lz2, face);
        }
      }
      const low = y + 0.55, high = y + 0.95;
      pot('bowl', terra, 1.65, low, po.d / 2 - 0.4, 0.3);
      pot('bowl', glaze, 2.05, low, po.d / 2 - 0.42);
      pot('jar', terra, 2.5, low, po.d / 2 - 0.38, 1.1);
      pot('bowl', terra, 2.95, low, po.d / 2 - 0.4, 2.1);
      pot('jar', glaze, 3.35, low, po.d / 2 - 0.4, 0.4);
      // A stack of plates.
      const [spx, spz] = local(1.6, po.d / 2 - 0.72);
      for (let k = 0; k < 6; k++) tk.put(tk.cyl(0.13, 0.11, 0.018, 16), terra, spx, high + k * 0.02, spz);
      for (const [lx, m] of [[2.0, terra], [2.4, glaze], [2.8, terra], [3.2, terra]]) pot('jug', m, lx, high, po.d / 2 - 0.72, lx);
      const [bx2, bz2] = local(2.5, po.d / 2 - 0.55);
      this.world.colliders.addBox(bx2, bz2, 1.12, 0.36, face, y - 0.5, y + 1.0).floor = true;
    }
    // The wedging table, a lump of clay on it; the clay bin beside the wheel; a bucket of water.
    const [wx, wz] = local(0.6, -3.2);
    placeProp(env, 'Workbench', wx, y, wz, face);
    tk.begin('clay lump', wx, wz, false, true);
    tk.put((tk.geo.lump ??= new THREE.SphereGeometry(0.16, 12, 8).scale(1.3, 0.6, 1)), clay, wx, y + 0.89 + 0.02, wz);
    {
      const [cx, cz] = local(-0.9, 2.3);
      tk.begin('clay bin', cx, cz);
      tk.put(tk.box(0.8, 0.5, 0.55), tim, cx, y, cz, face);
      tk.put(tk.box(0.72, 0.04, 0.47), clay, cx, y + 0.5, cz, face);
      for (let k = 0; k < 3; k++) { const [lx, lz] = local(-1.1 + k * 0.2, 2.25 + (k % 2) * 0.1); tk.put(tk.geo.lump, clay, lx, y + 0.54, lz, k); }
      this.world.colliders.addBox(cx, cz, 0.42, 0.3, face, y - 0.5, y + 0.6).floor = true;
    }
    {
      const [bx2, bz2] = local(1.5, 1.9);
      placeProp(env, 'Bucket_Wooden_1', bx2, y, bz2, face + 0.4);
    }
    // Shelves of drying greenware on the back wall, in the bays with no window.
    for (const lx of [3, -3]) {
      const [sx, sz] = local(lx, -po.d / 2 + 0.31 + 0.16);
      tk.begin('greenware shelf', sx, sz, false, true);
      for (const hy of [1.15, 1.65]) {
        tk.put(tk.box(1.5, 0.04, 0.3), tim, sx, y + hy, sz, face);
        for (const k of [-1, 1]) { const [px, pz] = local(lx + k * 0.6, -po.d / 2 + 0.31 + 0.08); tk.put(tk.box(0.04, 0.16, 0.14), tim, px, y + hy - 0.16, pz, face); }
        ['jug', 'bowl', 'jar', 'bowl'].forEach((kind, k) => pot(kind, green, lx - 0.52 + k * 0.35, y + hy + 0.04, -po.d / 2 + 0.31 + 0.16, k));
      }
      this.world.colliders.addBox(sx, sz, 0.76, 0.16, face, y + 1.05, y + 2.1);
    }
    const [bx, bz] = local(3.0, -2.6);
    placeProp(env, 'Barrel', bx, y, bz, 0);
  }

  // The pottery kiln. Every surface is built with texture coordinates in metres (courseGeometry,
  // fitUV), two metres to a repeat like the kit's own walls, so the bricks are brick-sized
  // everywhere: no stretched sphere-map.
  #kiln(px, pz, face, y) {
    const kit = this.kit;
    const brick = findMaterial(kit, 'MI_RedBrick') || this.rockMat;
    const stone = findMaterial(kit, 'MI_UnevenBrick') || this.rockMat;
    const wood = findMaterial(kit, 'MI_WoodTrim') || new THREE.MeshStandardMaterial({ color: 0x6b4a2c });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2b2725, metalness: 0.8, roughness: 0.55 });
    const g = new THREE.Group();
    g.position.set(px, y, pz);
    g.rotation.y = face;
    const mesh = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // Stone footing.
    const FOOT = 0.26, R0 = 1.12;
    mesh(courseGeometry([[1.34, 0], [1.34, FOOT], [R0, FOOT]], { segments: 40, tile: 2.0 }), stone);
    // The dome: a tall beehive, one course of brick every ~0.11 m.
    const H = 1.55, T = 0.93, COURSES = 14;
    const radiusAt = (t) => R0 * Math.sqrt(1 - Math.pow(t, 2.2));
    const prof = [];
    for (let j = 0; j <= COURSES; j++) {
      const t = (j / COURSES) * T;
      prof.push([radiusAt(t), FOOT + t * H]);
    }
    const [rTop, yTop] = prof[prof.length - 1];
    // A shelf at the top for the flue to stand on, then the flue and its collar.
    prof.push([0.34, yTop], [0.31, yTop + 0.06]);
    mesh(courseGeometry(prof, { segments: 40, tile: 2.0 }), brick);
    const flueTop = yTop + 0.85;
    mesh(courseGeometry([[0.31, yTop], [0.29, flueTop], [0.29, flueTop], [0.37, flueTop], [0.37, flueTop + 0.1], [0.33, flueTop + 0.1]], { segments: 24, tile: 2.0 }), brick);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), new THREE.MeshBasicMaterial({ color: 0x080606 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = flueTop + 0.095;
    g.add(hole);
    // Iron bands hooped round the dome.
    for (const t of [0.22, 0.55]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(t) + 0.012, 0.028, 6, 44), iron);
      band.rotation.x = Math.PI / 2;
      band.position.y = FOOT + t * H;
      band.castShadow = true;
      g.add(band);
    }
    // The stoking mouth: an arched brick surround standing out from the dome, with the fire inside.
    const outer = new THREE.Shape();
    outer.moveTo(-0.6, 0);
    outer.lineTo(-0.3, 0);
    outer.lineTo(-0.3, 0.4);
    outer.absarc(0, 0.4, 0.3, Math.PI, 0, true);
    outer.lineTo(0.3, 0);
    outer.lineTo(0.6, 0);
    outer.lineTo(0.6, 0.5);
    outer.absarc(0, 0.5, 0.6, 0, Math.PI, false);
    outer.lineTo(-0.6, 0);
    const arch = mesh(fitUV(new THREE.ExtrudeGeometry(outer, { depth: 0.72, bevelEnabled: false, curveSegments: 12 }), 2.0), brick);
    arch.position.set(0, FOOT, 0.6);
    // The dark, glowing back of the mouth, just in front of the dome wall.
    const back = new THREE.Shape();
    back.moveTo(-0.3, 0);
    back.lineTo(0.3, 0);
    back.lineTo(0.3, 0.4);
    back.absarc(0, 0.4, 0.3, 0, Math.PI, false);
    const glow = new THREE.Mesh(new THREE.ShapeGeometry(back, 12), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 1.6, side: THREE.DoubleSide }));
    glow.position.set(0, FOOT, 1.0);
    g.add(glow);
    this.scene.add(tag(g, 'Kiln'));
    const fire = new Fire(this.scene, 0, 0, 0, { size: 0.32, light: true });
    g.add(fire.group);
    fire.group.position.set(0, FOOT + 0.02, 1.16);
    this.fires.push(fire);
    this.world.colliders.addCircle(px, pz, 1.3, y - 1, y + flueTop + 0.1);
    this.add({ kind: 'station', station: 'kiln', name: 'Pottery kiln', x: px, y: y + 1.0, z: pz, r: 1.1, h: 2.0, reach: 2.9 });
  }

  // ------------------------------------------------------------------ jetty
  // The dock at the end of the lake road: the jetty's planks on stout piles, mooring posts with rope at
  // its end, and on the shore by Old Tam his fisher's hut, a rowing boat turned over on the shingle,
  // nets hung to dry on poles, and his crates and a barrel.
  #jetty(batch) {
    const T = this.world.terrain, tk = this.tk, m = tk.m;
    const sx = -52, sz = 168;
    const dir = new THREE.Vector2(LAKE.x - sx, LAKE.z - sz).normalize();
    const rot = Math.atan2(dir.x, dir.y);
    const deck = 0.55;
    const rx = Math.cos(rot), rz = -Math.sin(rot);
    // Jetty frame: a along the jetty (out over the water), c across it (+ to the right looking out).
    const at = (a, c) => [sx + dir.x * a + rx * c, sz + dir.y * a + rz * c];
    for (let i = 0; i < 7; i++) {
      const x = sx + dir.x * (i * 2 + 1), z = sz + dir.y * (i * 2 + 1);
      batch.add('Floor_WoodDark', x, deck, z, rot);
      batch.add('Floor_WoodDark', x, deck - 0.03, z, rot + Math.PI);
      for (const side of [-1, 1]) {
        const [px, pz] = at(i * 2 + 1, side * 0.95);
        const h = T.heightAt(px, pz);
        tk.begin('jetty pile', px, pz);
        tk.put(tk.poleGeometry(0.12, 0.11, +(deck - h + 0.75).toFixed(2), 8), m.barkDark, px, h - 0.4, pz);
        tk.solidCircle(px, pz, 0.13, h - 0.4 + 0.5, deck + 0.35 - h + 0.4 - 0.5);
      }
    }
    // Mooring posts at the far end, a rope made fast round each and coiled on the deck.
    for (const side of [-1, 1]) {
      const [px, pz] = at(13.4, side * 0.72);
      tk.begin('mooring post', px, pz, false, true); // on the deck
      tk.put(tk.poleGeometry(0.1, 0.09, 0.62, 8), m.barkDark, px, deck - 0.02, pz);
      const coil = (tk.geo.ropeCoil ??= new THREE.TorusGeometry(0.1, 0.022, 5, 12).rotateX(Math.PI / 2));
      tk.put(coil, m.rope, px, deck + 0.42, pz);
      tk.solidCircle(px, pz, 0.11, deck, 0.62);
      const [qx, qz] = at(12.8, side * 0.45);
      tk.begin('rope coil', qx, qz, true, true);
      const flat = (tk.geo.ropeFlat ??= new THREE.TorusGeometry(0.18, 0.02, 5, 14).rotateX(Math.PI / 2));
      for (let k = 0; k < 3; k++) tk.put(flat, m.rope, qx, deck + 0.02 + k * 0.035, qz, 0, 1 - k * 0.12, 1, 1 - k * 0.12);
    }
    // Walkable deck (a thin box the player can stand on).
    const len = 14;
    const cx = sx + dir.x * (len / 2), cz = sz + dir.y * (len / 2);
    const deckBox = this.world.colliders.addBox(cx, cz, 1.0, len / 2, rot, deck - 0.3, deck);
    deckBox.noCamera = true;
    deckBox.floor = true;
    this.jettyEnd = { x: sx + dir.x * len, z: sz + dir.y * len, dx: dir.x, dz: dir.y };
    // The shore by the jetty's head: find dry, level ground off the road for each thing, stepping
    // inland until there is some.
    const dry = (a, c, r) => {
      for (let k = 0; k < 16; k++, a -= 0.5) {
        const [x, z] = at(a, c);
        const h = T.heightAt(x, z);
        const [rd, rw] = roadDistance(x, z);
        let lo = Infinity, hi = -Infinity;
        for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const g = T.heightAt(x + dx, z + dz); lo = Math.min(lo, g); hi = Math.max(hi, g); }
        if (lo > 0.35 && hi - lo < 0.5 && rd > rw + r + 0.3) return [x, z];
      }
      return null;
    };
    const tam = { x: -50.5, z: 171.5 };
    const clearOfTam = (p, r) => p && Math.hypot(p[0] - tam.x, p[1] - tam.z) > r + 0.8;
    // Two crates and a barrel in a row where Tam can reach them, on a level patch of the shore.
    const cp = dry(-1.4, -2.9, 1.7);
    if (cp && clearOfTam(cp, 1.7)) {
      const ca = (cp[0] - sx) * dir.x + (cp[1] - sz) * dir.y, cc = (cp[0] - sx) * rx + (cp[1] - sz) * rz;
      for (const [dc, name, turn] of [[-1.1, 'Crate_Wooden', 0.25], [0, 'Crate_Wooden', -0.2], [1.05, 'Barrel', 0]]) {
        const [px, pz] = at(ca, cc + dc);
        let lo = Infinity;
        for (const [ex, ez] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0, 0]]) lo = Math.min(lo, T.heightAt(px + ex, pz + ez));
        placeProp({ kit: this.kit, batch, scene: this.scene, colliders: this.world.colliders }, name, px, lo - 0.02, pz, rot + turn);
      }
    }
    // A rowing boat turned over on the shingle, bow toward the water, resting on a pair of chocks.
    const bp = dry(-2.5, 3.6, 1.6);
    if (clearOfTam(bp, 1.6)) {
      const by = T.heightAt(bp[0], bp[1]);
      tk.begin('upturned boat', bp[0], bp[1]);
      tk.put((tk.geo.hull ??= hullGeometry()), m.timber, bp[0], by + 0.12, bp[1], rot + 0.3, 1, 1, 1, Math.PI, 0);
      for (const e of [-0.9, 0.9]) {
        const q = [bp[0] + Math.sin(rot + 0.3) * e, bp[1] + Math.cos(rot + 0.3) * e];
        tk.put(tk.timberBox(1.2, 0.16, 0.16, 'x'), m.timber, q[0], T.heightAt(q[0], q[1]) - 0.04, q[1], rot + 0.3);
      }
      tk.solidBox(bp[0], bp[1], 0.62, 1.9, rot + 0.3, by, 0.75);
    }
    // Nets hung to dry between two poles.
    const np = dry(-3.6, -5.6, 1.5);
    if (np) {
      const ny = T.heightAt(np[0], np[1]);
      const a0 = [np[0] - rx * 1.4, np[1] - rz * 1.4], a1 = [np[0] + rx * 1.4, np[1] + rz * 1.4];
      for (const q of [a0, a1]) {
        tk.begin('net pole', q[0], q[1]);
        tk.put(tk.poleGeometry(0.05, 0.045, 2.3, 7), m.bark, q[0], T.heightAt(q[0], q[1]) - 0.2, q[1]);
        tk.solidCircle(q[0], q[1], 0.07, T.heightAt(q[0], q[1]), 2.1);
      }
      tk.begin('drying nets', np[0], np[1], true);
      tk.put(ropeBetween([a0[0], ny + 2.0, a0[1]], [a1[0], ny + 2.0, a1[1]], 0.12), m.rope, 0, 0, 0);
      tk.put((tk.geo.net ??= netGeometry(2.6, 1.5)), (this.netMat ??= netMaterial()), np[0], ny + 1.98, np[1], rot + Math.PI / 2);
    }
    // Tam's hut, up the shore behind the jetty, its door to the water.
    const hp = dry(-7.5, -4.4, 1.8);
    if (hp) hutBuild(tk, hp[0], hp[1], rot, { w: 2.8, d: 2.2, h: 2.3 });
  }

  #flax() {
    const f = FARMS[1];
    const rnd = rng(55);
    const plants = [];
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    for (let row = 0; row < 7; row++)
      for (let k = 0; k < 16; k++) {
        const lx = -f.w / 2 + 4 + k * ((f.w - 8) / 15) + (rnd() - 0.5) * 0.8, lz = -f.d / 2 + 4 + row * ((f.d - 8) / 6) + (rnd() - 0.5) * 0.8;
        const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
        plants.push({ x, z, y: this.world.terrain.heightAt(x, z), rot: rnd() * 6, s: 0.8 + rnd() * 0.4 });
      }
    // Instanced plants: a clump of stalks with blue flowers.
    const stalk = new THREE.CylinderGeometry(0.008, 0.012, 0.9, 4);
    stalk.translate(0, 0.45, 0);
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 0.05 + (i % 3) * 0.05;
      parts.push(stalk.clone().rotateX(Math.sin(a) * 0.15).rotateZ(Math.cos(a) * 0.15).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const flowers = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 0.05 + (i % 3) * 0.05;
      flowers.push(new THREE.SphereGeometry(0.035, 6, 4).translate(Math.cos(a) * (r + 0.12), 0.9, Math.sin(a) * (r + 0.12)));
    }
    const stalkMesh = new THREE.InstancedMesh(mergeAll(parts), new THREE.MeshStandardMaterial({ color: 0x7c9a3c, roughness: 0.8 }), plants.length);
    const flowerMesh = new THREE.InstancedMesh(mergeAll(flowers), new THREE.MeshStandardMaterial({ color: 0x6f8fe8, roughness: 0.6 }), plants.length);
    stalkMesh.castShadow = true;
    this.flaxPlants = plants.map((p, i) => ({ ...p, i, picked: false }));
    this.flaxMeshes = [stalkMesh, flowerMesh];
    for (const p of this.flaxPlants) {
      this.#setFlax(p, false);
      this.add({ kind: 'flax', plant: p, x: p.x, y: p.y + 0.5, z: p.z, r: 0.4, h: 1.0, reach: 2.0, get hidden() { return p.picked; } });
    }
    this.scene.add(stalkMesh, flowerMesh);
  }

  #setFlax(p, picked) {
    p.picked = picked;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3().setScalar(picked ? 0 : p.s));
    for (const mesh of this.flaxMeshes) {
      mesh.setMatrixAt(p.i, m);
      mesh.instanceMatrix.needsUpdate = true;
    }
    p.respawnAt = performance.now() / 1000 + 25;
  }
  pickFlax(p) {
    this.#setFlax(p, true);
  }
}

function mergeAll(geos) {
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const gi = g.index ? g : g.toNonIndexed();
    pos.push(...gi.attributes.position.array);
    nor.push(...gi.attributes.normal.array);
    if (gi.index) idx.push(...Array.from(gi.index.array, (v) => v + base));
    base += gi.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// A boulder: a squashed, lumpy icosphere.
export function boulder(size, rnd) {
  // Welded, so the displaced surface shades smoothly instead of in facets.
  const g = mergeVertices(new THREE.IcosahedronGeometry(size, 3).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, v = new THREE.Vector3();
  const k = [rnd() * 10, rnd() * 10, rnd() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 / size + k[0]) * Math.sin(v.y * 2.7 / size + k[1]) * Math.sin(v.z * 3.3 / size + k[2]);
    const n2 = Math.sin(v.x * 9 / size + k[1]) * Math.sin(v.z * 8 / size + k[2]) * 0.3;
    v.multiplyScalar(1 + n * 0.22 + n2 * 0.12);
    v.y = v.y > 0 ? v.y * 0.78 : v.y * 0.5;
    p.setXYZ(i, v.x, v.y + size * 0.3, v.z);
  }
  g.computeVertexNormals();
  // Rock at its own size (2.4 m a repeat), projected along each vertex's main direction, so the stone's
  // grain and cracks show instead of one smeared texel.
  const n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, w] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / 2.4 + k[0];
    uv[i * 2 + 1] = w / 2.4 + k[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Ore veins on a rock (the boulder's own triangles where folds in the stone cross its upper faces),
// lifted a hair off the stone and coloured by the ore: copper orange with green weathering, tin pale
// grey, iron rust red, clay ochre, coal black.
function veinGeometry(g, s, rnd, kind) {
  const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
  const d1 = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
  const d2 = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
  const fr = (3.2 + rnd() * 2) / s, ph = rnd() * 6, width = kind === 'clay' || kind === 'coal' ? 0.26 : 0.15;
  const base = new THREE.Color(kind === 'tin' ? 0x8f969a : ROCKS[kind]?.color ?? 0x888888);
  const alt = kind === 'copper' ? new THREE.Color(0x3f8f72) : base.clone().multiplyScalar(0.75);
  const P = [], N = [], C = [], a = new THREE.Vector3(), c = new THREE.Vector3();
  const cnt = idx ? idx.count : pos.count;
  for (let i = 0; i < cnt; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(a.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k));
    c.multiplyScalar(1 / 3);
    if (c.y < s * 0.35) continue;
    const f = Math.abs(Math.sin(c.dot(d1) * fr + ph + 0.9 * Math.sin(c.dot(d2) * fr * 0.7)));
    if (f > width) continue;
    const col = rnd() < 0.35 ? alt : base;
    for (let k = 0; k < 3; k++) {
      const vi = idx ? idx.getX(i + k) : i + k;
      P.push(pos.getX(vi) + nor.getX(vi) * 0.015, pos.getY(vi) + nor.getY(vi) * 0.015, pos.getZ(vi) + nor.getZ(vi) * 0.015);
      N.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
      C.push(col.r, col.g, col.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return out;
}

// A clinker rowing boat's hull (open, no thwarts): 3.6 m long along z, 1.2 m in the beam, pointed at
// both ends, the gunwale at y = 0 and the keel 0.55 m below; planks run along it.
function hullGeometry(L = 3.6, beam = 1.2, depth = 0.55) {
  const B = new Builder(), ni = 16, nj = 10;
  const rows = [];
  for (let i = 0; i <= ni; i++) {
    const z = -L / 2 + (L * i) / ni, e = Math.max(0, 1 - ((2 * z) / L) ** 2);
    const w = (beam / 2) * Math.pow(e, 0.55), d = depth * (0.75 + 0.25 * e) + 0.08 * ((2 * z) / L) ** 2;
    const row = [];
    let arc = 0, prev = null;
    for (let j = 0; j <= nj; j++) {
      const t = (Math.PI * j) / nj;
      // Clinker: each strake stands a little proud of the one below.
      const lap = 1 + 0.03 * ((j % 2) - 0.5);
      const p = [w * Math.cos(t) * lap, -d * Math.sin(t) + (1 - e) * 0.15, z];
      if (prev) arc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
      row.push(B.vert(p, [0, -1, 0], [z / 2.2, arc / 0.645]));
    }
    rows.push(row);
  }
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) B.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  return B.build({ computeNormals: true });
}

// A fishing net hung over a line to dry: a panel sagging between its ends, folds deepening downward.
function netGeometry(w, h) {
  const B = new Builder(), nx = 12, ny = 8;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const s = i / nx, t = j / ny, x = (s - 0.5) * w;
    const y = -0.12 * Math.sin(s * Math.PI) - t * h * (0.9 + 0.1 * Math.sin(s * Math.PI));
    const z = Math.sin(s * Math.PI * 5) * 0.06 * t;
    B.vert([x, y, z], [0, 0, 1], [s * w * 3, t * h * 3]);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i;
    B.quad(a, a + 1, a + nx + 2, a + nx + 1);
  }
  return B.build({ computeNormals: true });
}

// Knotted twine in diamonds, the rest open (alpha).
function netMaterial() {
  const tex = canvasTexture(64, 64, (g, W) => {
    g.clearRect(0, 0, W, W);
    g.strokeStyle = '#6e5a40';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(W, W); g.moveTo(W, 0); g.lineTo(0, W);
    g.moveTo(-W / 2, W / 2); g.lineTo(W / 2, -W / 2); g.moveTo(W / 2, W * 1.5); g.lineTo(W * 1.5, W / 2);
    g.moveTo(W / 2, -W / 2); g.lineTo(W * 1.5, W / 2); g.moveTo(-W / 2, W / 2); g.lineTo(W / 2, W * 1.5);
    g.stroke();
    g.fillStyle = '#5a4630';
    for (const [x, y] of [[0, 0], [W, 0], [0, W], [W, W], [W / 2, W / 2]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  }, { repeat: true });
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  m.name = 'Net_Twine';
  m.userData = { atlas: true };
  return m;
}

// A line between two points, sagging in the middle.
function ropeBetween(a, b, sag) {
  return ropeGeometry(a, b, sag, 0.008);
}

function findMaterial(kit, name) {
  for (const part of kit.parts.values()) {
    let found = null;
    part.traverse((o) => {
      if (!found && o.isMesh) for (const m of [o.material].flat()) if (m.name === name) found = m;
    });
    if (found) return found;
  }
  return null;
}
