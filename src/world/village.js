import * as THREE from 'three';
import { Kit, Batcher } from './kit.js';
import { buildHouse, rng, STOREY } from './buildings.js';
import { VILLAGE, ROADS, SPAWN, MINE_ENTRANCE } from './map.js';
import * as A from './ashford.js';
import { TownKit, boardTexture, texturedMaterial } from './townkit.js';
import { placeProp } from './props.js';
import { Door } from './doors.js';
import { wallTower } from './townwall.js';
import * as G from './grounds.js';

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
    await this.tk.extras(this.assets);
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

  // The town wall with its towers and gatehouses, the hedge with its field gates.
  #edge(batch) {
    const tk = this.tk;
    for (const w of A.WALLS) {
      if (w.kind === 'stone') tk.townWall(w.a, w.b, w.out);
      else tk.hedge(w.a, w.b, { height: 1.85, thick: A.THICK.hedge, ends: w.open, seed: w.edge * 17 + Math.round(Math.abs(w.a[0] * 3 + w.a[1])) });
    }
    for (const t of A.TOWERS) wallTower(tk, t.x, t.z, { r: t.r });
    const sign = boardTexture('ASHFORD', { w: 512, h: 128 });
    this.gatehouses = A.GATES.map((g) => ({ id: g.id, ...tk.gate({ ...g, out: g.wallOut }, sign) }));
    for (const g of A.GAPS) tk.fieldGate({ ...g, out: g.wallOut });
    // The churchyard wall: west and east sides and the south side either side of the lych-gate.
    const cy = A.YARDS.find((r) => r.id === 'churchyard');
    tk.stoneWall([cy.x0, cy.z0], [cy.x0, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([cy.x1, cy.z0], [cy.x1, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([cy.x0, cy.z1], [1.8 - 1.9, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([1.8 + 1.9, cy.z1], [cy.x1, cy.z1], null, { height: 1.1, thick: 0.5 });
  }

  // Gardens, allotments, the orchard and the drying green: a fence with a gate (a wicket standing
  // open), and what grows inside. A side formed by a house's back wall gets no fence: its ends stop a
  // hand short of the wall.
  #plots(batch) {
    const tk = this.tk;
    for (const p of A.PLOTS) {
      const back = p.back;
      const inset = (side) => (side === back ? null : side);
      const sides = {
        n: [[p.x0, p.z0], [p.x1, p.z0]],
        s: [[p.x0, p.z1], [p.x1, p.z1]],
        w: [[p.x0, p.z0], [p.x0, p.z1]],
        e: [[p.x1, p.z0], [p.x1, p.z1]],
      };
      // Fences running up to the house stop 0.15 m short of its wall.
      if (back === 's') { sides.w[1] = [p.x0, p.z1 - 0.15]; sides.e[1] = [p.x1, p.z1 - 0.15]; }
      if (back === 'n') { sides.w[0] = [p.x0, p.z0 + 0.15]; sides.e[0] = [p.x1, p.z0 + 0.15]; }
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      for (const [k, [a, b]] of Object.entries(sides)) {
        if (!inset(k)) continue;
        if (k !== p.gate) { tk.fence(a, b); continue; }
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
        const mid = len * (p.gateAt ?? 0.5), half = 0.62;
        const g0 = [a[0] + ux * (mid - half), a[1] + uz * (mid - half)], g1 = [a[0] + ux * (mid + half), a[1] + uz * (mid + half)];
        tk.fence(a, g0);
        tk.fence(g1, b);
        // The wicket opens into the plot.
        const ix = cx - (g0[0] + g1[0]) / 2, iz = cz - (g0[1] + g1[1]) / 2, il = Math.hypot(ix, iz);
        const into = Math.abs(ux) > Math.abs(uz) ? [0, Math.sign(iz)] : [Math.sign(ix), 0];
        tk.wicket(g0, g1, il ? into : [0, 1]);
      }
      if (A.BEDS.has(p.crop)) tk.crops(p, p.crop);
    }
  }

  // Everything with a reason: lanterns, stalls, the well and the cross, benches, barrels, hay, graves.
  #props(batch, y) {
    const tk = this.tk;
    const apples = new THREE.MeshStandardMaterial({ color: 0xa8321f, roughness: 0.55 });
    const greens = new THREE.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 0.8 });
    const noticeMat = texturedMaterial(G.noticeTexture(), 0.9);
    noticeMat.alphaTest = 0.5;
    noticeMat.side = THREE.DoubleSide;
    for (const p of A.PROPS) {
      const h = this.world.heightAt(p.x, p.z);
      switch (p.type) {
        case 'kit':
          if (!p.skip) this.#prop(batch, p.name, p.x, p.z, p.rot, { r: p.r || null });
          break;
        case 'lantern':
          tk.lamp(p.x, p.z, h, p.rot);
          break;
        case 'brazier':
          (this.braziers ??= []).push(G.brazier(tk, p.x, p.z));
          break;
        case 'stall':
          this.#prop(batch, p.name, p.x, p.z, p.rot);
          this.#goods(batch, p.x, p.z, p.rot, h, rng(Math.round(p.x * 31 + p.z * 17 + 900)), p.goods, p.name);
          break;
        case 'well':
          G.well(tk, p.x, p.z, p.rot);
          this.places.well = { x: p.x, z: p.z };
          break;
        case 'cross':
          this.places.cross = G.marketCross(tk, p.x, p.z);
          break;
        case 'flags': G.flagRing(tk, p.x, p.z, p.r0, p.r1); break;
        case 'treeBench': G.ringBench(tk, p.x, p.z); break;
        case 'sign': {
          const tex = p.boards.map((b) => [boardTexture(b.text, { arrow: 1 }), boardTexture(b.text, { arrow: -1 })]);
          tk.sign(p.x, p.z, p.rot, p.boards.map((b) => ({ turn: Math.atan2(-b.dir[1], b.dir[0]) - p.rot })), tex);
          break;
        }
        case 'notice': tk.noticeBoard(p.x, p.z, p.rot, noticeMat); break;
        case 'trough': tk.trough(p.x, p.z, p.rot, { len: p.len || 1.8, stone: !!p.stone }); break;
        case 'pump': tk.pump(p.x, p.z, p.rot); break;
        case 'bale': tk.bale(p.x, p.z, p.rot, p.level || 0); break;
        case 'haystack': tk.haystack(p.x, p.z, p.r); break;
        case 'woodpile': tk.woodpile(p.x, p.z, p.rot, { block: p.block !== false }); break;
        case 'washing': tk.washing([p.x, p.z], p.to, { seed: Math.round(Math.abs(p.x * 3 + p.z)) }); break;
        case 'bleach': G.bleachingSheet(tk, p.x, p.z, p.rot); break;
        case 'washtub': G.washtub(tk, p.x, p.z); break;
        case 'shed': G.shed(tk, p.x, p.z, p.rot, { w: p.w, d: p.d }); break;
        case 'compost': G.compost(tk, p.x, p.z, p.rot); break;
        case 'skeps': G.skeps(tk, p.x, p.z, p.rot); break;
        case 'ladder': G.ladder(tk, p.x, p.z, p.rot); break;
        case 'basket': G.basket(tk, p.x, p.z, { fill: p.fill === 'apples' ? apples : p.fill === 'greens' ? greens : null }); break;
        case 'handcart': G.handcart(tk, p.x, p.z, p.rot); break;
        case 'cooper': G.cooperYard(tk, p.spots); break;
        case 'grave': tk.grave(p.x, p.z, p.rot); break;
        case 'lychgate': tk.lychgate(p.x, p.z, p.rot, h); break;
        case 'wagon': this.#wagon(batch, p); break;
        default:
          break;
      }
    }
  }

  // A wagon (the kit's) with its load on the bed, not beside it: trusses of hay, or casks.
  #wagon(batch, p) {
    const tk = this.tk;
    this.#prop(batch, 'Prop_Wagon', p.x, p.z, p.rot);
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    const at = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    // The bed's top, found on the model (the heap of hay at the back is part of the kit piece).
    const top = this.kit.topAt('Prop_Wagon', 0, -1.1);
    const bed = this.world.heightAt(p.x, p.z) + (Number.isFinite(top) ? top : 1.0);
    if (p.load === 'hay') {
      for (const [lx, lz, lvl] of [[-0.24, -0.9, 0], [0.24, -0.9, 0], [0, -0.9, 1]]) {
        const [bx, bz] = at(lx, lz);
        tk.bale(bx, bz, p.rot + Math.PI / 2, lvl, bed);
      }
      // The load is solid (a body walking into the cart meets the hay, not air).
      const [lx, lz] = at(0, -0.9);
      tk.colliders.addBox(lx, lz, 0.5, 0.47, p.rot, bed, bed + 0.86).owner = tk.cur.id;
    } else if (p.load === 'casks') {
      for (const lz of [-0.8, -1.55]) {
        const [bx, bz] = at(0.2, lz);
        this.#prop(batch, 'Barrel', bx, bz, lz, { y: bed, solid: false });
      }
    }
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

export { STOREY };
