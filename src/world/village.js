import * as THREE from 'three';
import { Kit, Batcher } from './kit.js';
import { buildHouse, rng, STOREY } from './buildings.js';
import { VILLAGE, ROADS, SPAWN, MINE_ENTRANCE } from './map.js';
import * as A from './ashford.js';
import { TownKit, boardTexture, findMaterial } from './townkit.js';
import { placeProp, tag, fitUV } from './props.js';
import { Door } from './doors.js';

// Ashford: a market town on a level terrace. Streets, the square, the rows of houses, the gates
// and the wall are all read from ashford.js (see DESIGN.md, "Ashford v2"). This file turns that
// plan into buildings, street furniture and colliders. The bank, store, inn, smithy and
// potter's workshop are open to the public; the houses are private.

export class Village {
  constructor({ scene, assets, world }) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.places = {};
    this.interactables = [];
    this.doors = [];
    this.layout = A;
    this.mapData = { ROADS, SPAWN, MINE_ENTRANCE };
  }

  async load() {
    this.kit = await new Kit(this.assets).load();
    const batch = new Batcher(this.kit);
    const y = VILLAGE.y;
    this.tk = new TownKit(this.kit, batch, this.world.colliders, this.world);
    for (const b of A.BUILDINGS) {
      const by = y + (b.rise || 0);
      const spec = { ...b, seed: 101 + b.key * 17 };
      const info = buildHouse(this.kit, batch, this.world.colliders, spec, by);
      const place = { ...spec, ...info, y: by };
      if (A.PUBLIC.includes(b.id)) this.places[b.id] = place;
      else (this.places.houses ??= []).push(place);
      // Hang the doors (public ones start open; game.js puts them on the interactable list).
      for (const def of info.doors) this.doors.push(new Door({ kit: this.kit, scene: this.scene, colliders: this.world.colliders, def: { ...def, id: b.id } }));
      // Open workshops hold their roof up on a post at each open corner.
      if (b.open?.includes('s')) {
        for (const sx of [-1, 1]) {
          const [px, pz] = A.toWorld(b, sx * (b.w / 2 - 0.1), b.d / 2 - 0.1);
          batch.add('Corner_Exterior_Wood', px, by, pz, b.rot, 1, { role: 'post' });
          this.world.colliders.addCircle(px, pz, 0.18, by - 1, by + 3);
        }
      }
    }
    this.#lanterns(batch, y);
    this.#edge(batch);
    this.#plots(batch);
    this.#props(batch, y);
    this.#interiors(batch, y);
    this.mesh = batch.build();
    this.scene.add(this.mesh);
    return this;
  }

  // Doors swing on the game's own clock (game.js calls this each tick).
  update(dt) {
    for (const d of this.doors) d.update(dt);
  }

  // Local-to-world for a building: a point in its footprint frame.
  at(place, lx, lz, out = new THREE.Vector3()) {
    const c = Math.cos(place.rot), s = Math.sin(place.rot);
    return out.set(place.x + lx * c + lz * s, place.y ?? VILLAGE.y, place.z - lx * s + lz * c);
  }

  // A kit prop standing on the ground (or at `y`), with its solid shapes from props.js.
  // `solid: false` is for clutter that sits on something (goods, mugs); those get no collider.
  #prop(batch, name, x, z, rot = 0, { y = this.world.heightAt(x, z), solid = true } = {}) {
    return placeProp({ kit: this.kit, batch, scene: this.scene, colliders: this.world.colliders }, name, x, y, z, rot, { solid });
  }

  // Wall lanterns beside every door: both sides of the public doors, one side of a house's (the
  // side with wall to spare). Each is screwed flush to the wall with the lamp hanging at chest
  // height, where you can walk into it, so it has a collider.
  #lanterns(batch, y) {
    for (const p of [this.places.bank, this.places.store, this.places.inn, ...this.places.houses]) {
      const door = p.openings[0];
      if (!door) continue;
      const room = (s) => Math.abs(door.lx + s * 1.0) <= p.w / 2 - 0.6;
      const sides = A.PUBLIC.includes(p.id) ? [-1, 1] : [room(p.key % 2 ? 1 : -1) ? (p.key % 2 ? 1 : -1) : (p.key % 2 ? -1 : 1)];
      for (const s of sides) {
        if (!room(s)) continue;
        const q = this.at(p, door.lx + s * 1.0, p.d / 2 + 0.04);
        this.#prop(batch, 'Lantern_Wall', q.x, q.z, p.rot, { y: p.y + 0.9 });
      }
    }
  }

  // The wall, hedge and gates around the town.
  #edge(batch) {
    const tk = this.tk;
    for (const w of A.WALLS) {
      if (w.kind === 'stone') tk.stoneWall(w.a, w.b);
      else tk.hedge(w.a, w.b, { height: 1.75, thick: 1.25 });
    }
    const sign = boardTexture('ASHFORD', { w: 512, h: 128 });
    for (const g of A.GATES) tk.gate(g, sign);
    // Small gaps get a pair of timber posts.
    for (const g of A.GAPS) {
      const ox = -g.out[1], oz = g.out[0];
      for (const s of [-1, 1]) {
        const px = g.x + ox * (g.width / 2 + 0.15) * s, pz = g.z + oz * (g.width / 2 + 0.15) * s;
        const gy = this.world.heightAt(px, pz);
        tk.begin('gap post', px, pz);
        tk.put(tk.box(0.3, 1.9, 0.3), tk.m.wood, px, gy, pz, 0);
        tk.put(tk.cyl(0.005, 0.28, 0.25, 4), tk.m.wood, px, gy + 1.9, pz, Math.PI / 4);
        tk.solidCircle(px, pz, 0.2, gy, 1.9);
      }
    }
    // The churchyard wall: west and east sides and the south side either side of the lych-gate.
    const cy = A.YARDS.find((r) => r.id === 'churchyard');
    tk.stoneWall([cy.x0, cy.z0], [cy.x0, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([cy.x1, cy.z0], [cy.x1, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([cy.x0, cy.z1], [1.8 - 1.9, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([1.8 + 1.9, cy.z1], [cy.x1, cy.z1], null, { height: 1.1, thick: 0.5 });
  }

  // Gardens, allotments and paddocks: a fence with a gap, and what grows inside.
  #plots(batch) {
    const tk = this.tk;
    for (const p of A.PLOTS) {
      const sides = {
        n: [[p.x0, p.z0], [p.x1, p.z0]],
        s: [[p.x0, p.z1], [p.x1, p.z1]],
        w: [[p.x0, p.z0], [p.x0, p.z1]],
        e: [[p.x1, p.z0], [p.x1, p.z1]],
      };
      for (const [k, [a, b]] of Object.entries(sides)) {
        const pieces = k === p.gate ? gapped(a, b, 1.1) : [[a, b]];
        for (const [c, d] of pieces) {
          if (p.fence === 'hedge') tk.hedge(c, d, { height: 1.4, thick: 0.9 });
          else if (p.fence === 'stone') tk.stoneWall(c, d, null, { height: 0.9, thick: 0.45 });
          else tk.fence(c, d);
        }
      }
      if (p.crop !== 'pen' && p.crop !== 'none') tk.crops(p, p.crop);
    }
  }

  // Everything with a reason: lamps, stalls, the well, benches, barrels, hay, graves.
  #props(batch, y) {
    const tk = this.tk;
    const rnd = rng(77);
    const signTex = new Map();
    for (const p of A.PROPS) {
      const h = this.world.heightAt(p.x, p.z);
      switch (p.type) {
        case 'kit':
          if (!p.skip) this.#prop(batch, p.name, p.x, p.z, p.rot, { r: p.r || null });
          break;
        case 'lamp':
          tk.lamp(p.x, p.z, h);
          break;
        case 'stall':
          this.#prop(batch, p.name, p.x, p.z, p.rot);
          this.#goods(batch, p.x, p.z, p.rot, h, rng(Math.round(p.x * 31 + p.z * 17 + 900)), p.goods, p.name);
          break;
        case 'well': {
          const well = wellMesh(this.kit);
          well.position.set(p.x, h, p.z);
          this.scene.add(well);
          this.world.solids.addObject(well);
          this.world.colliders.addCircle(p.x, p.z, 1.25, h - 0.5, h + 1.0);
          this.places.well = { x: p.x, z: p.z };
          break;
        }
        case 'sign': {
          const tex = p.boards.map((b) => [boardTexture(b.text, { arrow: 1 }), boardTexture(b.text, { arrow: -1 })]);
          tk.sign(p.x, p.z, p.rot, p.boards.map((b) => ({ turn: Math.atan2(-b.dir[1], b.dir[0]) - p.rot })), tex);
          break;
        }
        case 'notice': tk.noticeBoard(p.x, p.z, p.rot); break;
        case 'trough': tk.trough(p.x, p.z, p.rot); break;
        case 'pump': tk.pump(p.x, p.z, p.rot); break;
        case 'bale': tk.bale(p.x, p.z, p.rot, p.level || 0); break;
        case 'haystack': tk.haystack(p.x, p.z, p.r); break;
        case 'woodpile': tk.woodpile(p.x, p.z, p.rot); break;
        case 'washing': tk.washing([p.x, p.z], p.to); break;
        case 'grave': tk.grave(p.x, p.z, p.rot); break;
        case 'lychgate': tk.lychgate(p.x, p.z, p.rot, h); break;
        case 'cart': {
          this.#prop(batch, 'Prop_Wagon', p.x, p.z, p.rot);
          // Two barrels unloaded beside the wagon.
          const c = Math.cos(p.rot), sn = Math.sin(p.rot);
          for (const dz of [-0.8, -1.7]) this.#prop(batch, 'Barrel', p.x + 1.45 * c + dz * sn, p.z - 1.45 * sn + dz * c, 0);
          break;
        }
        default:
          break;
      }
    }
    void signTex;
  }

  // Goods laid out along a stall's counter: left to right in the space the counter has, each one
  // resting on the top (0.83 m up) with its footprint inside the counter, none overlapping.
  #goods(batch, x, z, rot, y, rnd, kind, stall = 'Stall_Empty') {
    // The cart has a rail along its back edge, so its goods stay in the front half of the counter.
    const cart = stall === 'Stall_Cart_Empty';
    const COUNTER = { top: 0.83, half: 0.91, depth: 0.42, back: cart ? -0.14 : -0.42 };
    const pool = kind === 'runes'
      ? ['Potion_1', 'Potion_2', 'Potion_4', 'CandleStick', 'Vase_4', 'Potion_2', 'Potion_1', 'Potion_4']
      : ['FarmCrate_Apple', 'FarmCrate_Carrot', 'FarmCrate_Apple', cart ? 'Pot_1' : 'Bag', 'Vase_4', 'Pot_1', 'Bucket_Wooden_1', 'FarmCrate_Carrot'];
    let cursor = -COUNTER.half + 0.08;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let k = 0; k < 5; k++) {
      const name = pool[Math.floor(rnd() * pool.length)];
      const turn = (rnd() - 0.5) * 0.3;
      const b = this.kit.bounds(name);
      const tc = Math.cos(turn), ts = Math.sin(turn);
      const hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
      const ex = Math.abs(tc) * hx + Math.abs(ts) * hz, ez = Math.abs(ts) * hx + Math.abs(tc) * hz;
      const mx = (b.max.x + b.min.x) / 2, mz = (b.max.z + b.min.z) / 2;
      if (cursor + 2 * ex > COUNTER.half - 0.06) continue;
      const lx = cursor + ex - (mx * tc + mz * ts);
      const lz = Math.max(COUNTER.back + ez + 0.03, Math.min(COUNTER.depth - ez - 0.03, 0.02 + (rnd() - 0.5) * 0.1)) - (-mx * ts + mz * tc);
      cursor += 2 * ex + 0.06;
      this.#prop(batch, name, x + lx * c + lz * s, z - lx * s + lz * c, rot + turn, { y: y + COUNTER.top - b.min.y, solid: false });
    }
  }

  // Counters, furniture and a ceiling in the buildings you can walk into.
  #interiors(batch, y) {
    const put = (place, name, lx, lz, turn = 0, dy = 0, solid = true) => {
      const p = this.at(place, lx, lz);
      if (solid) this.#prop(batch, name, p.x, p.z, place.rot + turn, { y: y + dy });
      else batch.add(name, p.x, y + dy, p.z, place.rot + turn);
    };
    const ceiling = (place) => {
      for (let ix = 0; ix < place.w / 2; ix++)
        for (let iz = 0; iz < place.d / 2; iz++) {
          const p = this.at(place, -place.w / 2 + 1 + ix * 2, -place.d / 2 + 1 + iz * 2);
          batch.add('Floor_WoodDark', p.x, y + STOREY - 0.02, p.z, place.rot);
          batch.add('Floor_WoodDark', p.x, y + 0.012, p.z, place.rot);
        }
      // The camera can't climb through it: solid from the ceiling up to the roof.
      const slab = this.world.colliders.addBox(place.x, place.z, place.w / 2 + 0.2, place.d / 2 + 0.2, place.rot, y + STOREY - 0.05, y + place.floors * STOREY + 6);
      slab.cameraOnly = true;
    };
    const bank = this.places.bank;
    ceiling(bank);
    put(bank, 'Table_Large', 0, -1.4);
    put(bank, 'Chest_Armature', -2.6, -3.1, Math.PI);
    put(bank, 'Cabinet', 2.6, -3.35, 0);
    put(bank, 'Bookcase_2', 3.4, -1.0, -Math.PI / 2);
    put(bank, 'Coin_Pile_2', -0.6, -1.45, 0.3, 0.81, false);
    put(bank, 'Coin_Pile', 0.7, -1.3, -0.5, 0.81, false);
    put(bank, 'CandleStick_Triple', 0.1, -1.6, 0, 0.81, false);
    put(bank, 'CandleStick_Stand', -3.3, 2.9, 0);
    const store = this.places.store;
    ceiling(store);
    put(store, 'Table_Large', 0, -1.0);
    put(store, 'Shelf_Small_Bottles', 1.8, -3.72, 0, 1.2, false);
    put(store, 'Shelf_Simple', -1.2, -3.72, 0, 1.4, false);
    put(store, 'Barrel_Apples', -2.3, 2.8, 0);
    put(store, 'Crate_Wooden', 2.0, 3.0, 0.4);
    put(store, 'Bag', 2.2, 1.6, 0.8);
    put(store, 'Pot_1_Lid', -0.5, -1.05, 0.2, 0.81, false);
    put(store, 'Bottle_1', 0.6, -0.9, 0, 0.81, false);
    const inn = this.places.inn;
    ceiling(inn);
    put(inn, 'Table_Large', 0.4, -1.0, Math.PI / 2);
    put(inn, 'Bench', -0.9, -1.0, Math.PI / 2);
    put(inn, 'Bench', 1.7, -1.0, -Math.PI / 2);
    put(inn, 'Barrel_Holder', 2.8, -4.9, 0);
    put(inn, 'Mug', 0.4, -0.6, 0, 0.81, false);
    put(inn, 'Mug', 0.2, -1.6, 1, 0.81, false);
    // Bess's bar at the back, with stools in front and bottles behind.
    put(inn, 'Table_Large', -0.9, -3.7, 0);
    put(inn, 'Stool', -2.0, -2.8, 0.3);
    put(inn, 'Stool', -0.2, -2.8, -0.2);
    put(inn, 'Mug', -1.6, -3.55, 0.4, 0.81, false);
    put(inn, 'Mug', -1.3, -3.8, 2.1, 0.81, false);
    put(inn, 'Bottle_1', -0.1, -3.75, 0, 0.81, false);
    put(inn, 'Shelf_Small_Bottles', -0.9, -5.72, 0, 1.2, false);
  }

  // Debug: a row of parts, for learning which way pieces face.
  debugRow(names, x0, z0, gap = 4, rot = 0) {
    const b = new Batcher(this.kit);
    names.forEach((n, i) => b.add(n, x0 + i * gap, this.world.heightAt(x0 + i * gap, z0), z0, rot));
    const g = b.build();
    this.scene.add(g);
    return g;
  }
}

// A side of a plot with a gap of `w` metres in its middle: the two pieces either side.
function gapped(a, b, half) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, mid = len / 2;
  return [[a, [a[0] + ux * (mid - half), a[1] + uz * (mid - half)]], [[a[0] + ux * (mid + half), a[1] + uz * (mid + half)], b]];
}

// A round stone well with a little roof and a bucket on a rope.
function wellMesh(kit) {
  const g = new THREE.Group();
  const stoneMat = findMaterial(kit, 'MI_UnevenBrick') || new THREE.MeshStandardMaterial({ color: 0x8a8580 });
  const woodMat = findMaterial(kit, 'MI_WoodTrim') || new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
  const ring = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(1.15, 1.2, 0.9, 20, 1, true), 2.0), stoneMat);
  ring.position.y = 0.45;
  const inner = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 20, 1, true), 2.0), stoneMat);
  inner.position.y = 0.45;
  inner.material = stoneMat.clone();
  inner.material.side = THREE.BackSide;
  const lip = new THREE.Mesh(fitUV(new THREE.TorusGeometry(1.03, 0.16, 8, 24), 2.0), stoneMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.92;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshStandardMaterial({ color: 0x0b1a1c, roughness: 0.05 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  g.add(ring, inner, lip, water);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(fitUV(new THREE.BoxGeometry(0.16, 2.1, 0.16), 2.2), woodMat);
    post.position.set(s * 1.05, 1.05, 0);
    g.add(post);
  }
  const axle = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), 2.2), woodMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 1.75;
  g.add(axle);
  const roof = new THREE.Mesh(fitUV(new THREE.CylinderGeometry(0.02, 1.7, 0.8, 4, 1), 4.3), findMaterial(kit, 'MI_RoundTiles') || woodMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);
  roof.position.y = 2.45;
  g.add(roof);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x9c8a66 }));
  rope.position.set(0.2, 1.25, 0);
  g.add(rope);
  const bucket = kit.instance('Bucket_Wooden_1');
  bucket.position.set(0.2, 0.62, 0);
  g.add(bucket);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return tag(g, 'Well');
}

export { STOREY };
