import * as THREE from 'three';
import { Kit, Batcher } from './kit.js';
import { buildHouse, doorLantern, rng, STOREY } from './buildings.js';
import { VILLAGE, ROADS, SPAWN, MINE_ENTRANCE } from './map.js';
import * as A from './ashford.js';
import { TownKit, boardTexture, findMaterial } from './townkit.js';
import { placeProp, tag, fitUV } from './props.js';
import { Door } from './doors.js';
import { houseLooks } from './looks.js';
import { grainUV } from './landmarks.js';
import { chapel, lychGate, grave, barn, hangingSign, wallBoard, shopWindow, yardArch, wallBell } from './civic.js';

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
    this.looks = await houseLooks(this.kit, this.assets, this.tk);
    const env = { tk: this.tk, looks: this.looks };
    for (const b of A.BUILDINGS) {
      if (b.type === 'chapel') continue; // built below, nave, chancel and tower together
      if (b.role === 'barn') {
        const place = { ...b, y: y + (b.rise || 0), openings: [], doors: [], look: {} };
        this.barn = barn(env, b, place.y);
        (this.places.houses ??= []).push(place);
        continue;
      }
      const by = y + (b.rise || 0);
      const spec = { ...b, seed: 101 + b.key * 17 };
      const info = buildHouse(this.kit, batch, this.world.colliders, spec, by, env);
      const place = { ...spec, ...info, y: by };
      if (A.PUBLIC.includes(b.id)) this.places[b.id] = place;
      else (this.places.houses ??= []).push(place);
      // Hang the doors (public ones start open; game.js puts them on the interactable list).
      for (const def of info.doors) this.doors.push(new Door({ kit: this.kit, scene: this.scene, colliders: this.world.colliders, def: { ...def, id: b.id, paintMat: def.paint ? this.looks.paint(def.paint) : null } }));
      // Open workshops hold their roof up on a post at each open corner.
      if (b.open?.includes('s')) {
        for (const sx of [-1, 1]) {
          const [px, pz] = A.toWorld(b, sx * (b.w / 2 - 0.1), b.d / 2 - 0.1);
          batch.add('Corner_Exterior_Wood', px, by, pz, b.rot, 1, { role: 'post' });
          this.world.colliders.addCircle(px, pz, 0.18, by - 1, by + 3);
        }
      }
    }
    // The chapel and its churchyard: the lych-gate, the graves in the grass.
    const nave = A.BUILDINGS.find((b) => b.type === 'chapel' && b.role === 'chapel');
    const tower = A.BUILDINGS.find((b) => b.type === 'chapel' && b.role === 'tower');
    if (nave && tower) {
      const cy = y + (nave.rise || 0);
      this.chapel = chapel(env, nave, tower, cy);
      for (const b of [nave, tower]) this.places[b.role] = { ...b, y: cy, openings: [], doors: [], look: {} };
      const lg = A.LYCH;
      this.chapel.lych = lychGate(env, lg.x, lg.z, lg.rot, this.world.heightAt(lg.x, lg.z));
      const rnd = rng(1311);
      for (const gv of A.GRAVES) grave(env, gv.x, this.world.heightAt(gv.x, gv.z), gv.z, gv.rot, gv.kind, rnd);
      this.chapel.graves = A.GRAVES.length;
    }
    this.#lanterns();
    this.#trades(batch);
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

  // A lantern by every front door, high enough to walk under (its underside 2.35 m up), on the
  // latch side: on an iron bracket from the wall, or hung from the joists where the floor above
  // is jettied out. The inn hangs its lamp over the door itself, the bank has a pair. A cottage
  // whose eaves come down low over its door has no room for one, and goes without.
  #lanterns() {
    const tk = this.tk;
    const lamps = (this.lamps = []);
    for (const p of [this.places.bank, this.places.store, this.places.inn, ...this.places.houses]) {
      const door = p.openings.find((o) => o.side === 's' && !o.door.back);
      if (!door || p.role === 'chapel' || p.role === 'tower') continue;
      const jetty = p.look.jetty > 0 && p.floors > 1;
      const spots = p.id === 'inn' ? [0] : p.id === 'bank' ? [-1, 1] : [Math.abs(door.lx + 1.0) <= p.w / 2 - 0.55 ? 1 : -1];
      for (const s of spots) {
        const lx = door.lx + s * (p.id === 'inn' ? 0 : 0.98);
        if (jetty) {
          // Hung from the jetty's joists on a short chain.
          const q = this.at(p, lx, p.d / 2 + Math.min(0.32, p.look.jetty * 0.6));
          lamps.push(doorLantern(tk, q.x, p.y, q.z, p.rot, { hang: STOREY - 0.22 }));
          continue;
        }
        // On a bracket: 0.42 m out on a two-storey wall, 0.3 m under a single storey's eaves if they allow.
        const reach = p.floors > 1 ? 0.42 : 0.3;
        const eaves = p.look.ridge === 'along' && p.floors === 1 ? p.top - (reach + 0.12) * Math.tan(p.look.pitch) : Infinity;
        if (eaves < 2.35 + 0.5) continue;
        const q = this.at(p, lx, p.d / 2);
        lamps.push(doorLantern(tk, q.x, p.y, q.z, p.rot, { reach }));
      }
    }
  }

  // What each building is for, shown on it: painted signs on iron brackets, the bank's carved name
  // and canopy, the store's counters let down with goods on them, the inn's yard arch, the toll board,
  // the watch's bell. (Positions are in each building's own frame: +z out of its front.)
  #trades(batch) {
    const env = { tk: this.tk, looks: this.looks, kit: this.kit };
    const P = this.places;
    const H = (role, n = 0) => (P.houses || []).filter((p) => p.role === role)[n];
    const front = (p) => p.d / 2 + (p.look.jetty || 0) * (p.floors > 1 ? 1 : 0);
    const sign = (p, lx, dy, text, icon, o = {}) => {
      const q = this.at(p, lx, o.lz ?? front(p));
      return hangingSign(env, q.x, p.y + dy, q.z, p.rot, text, icon, o);
    };
    const rnd = rng(4242);
    this.signs = [];
    if (P.inn) this.signs.push(sign(P.inn, 3.1, 4.15, 'The Crooked Pike', 'pike', { reach: 1.65, w: 1.5, h: 1.1 }));
    if (P.store) this.signs.push(sign(P.store, 2.3, 3.85, 'General Store', 'sack', { colors: { bg: '#5a2a1c', fg: '#f0dfb0' } }));
    const cooper = H('cooper');
    if (cooper) this.signs.push(sign(cooper, 2.3, 3.85, 'Cooper', 'barrel', { colors: { bg: '#2c3a4a', fg: '#e8d8a8' } }));
    // The open workshops hang theirs from a front corner post, standing out from the front.
    for (const [p, text, icon, sx] of [[P.smithy, 'Smithy', 'anvil', 1], [P.potter, 'Potter', 'jug', -1]]) {
      if (!p) continue;
      const q = this.at(p, sx * (p.w / 2 - 0.1), p.d / 2 - 0.1);
      this.signs.push(hangingSign(env, q.x, p.y + 2.98, q.z, p.rot, text, icon, { reach: 0.85, w: 0.62, h: 0.5, colors: { bg: text === 'Smithy' ? '#1e1e22' : '#6a3a22', fg: '#efe0b6' } }));
    }
    // The bank: its name cut in a stone tablet over the door, under a slate canopy on stone brackets.
    if (P.bank) {
      const p = P.bank, door = p.openings.find((o) => o.side === 's');
      const L = this.looks, dressed = L.dressed('honey'), slate = L.roof('slate-dark');
      const q = (lx, lz) => this.at(p, lx, lz);
      const c = q(door.lx, p.d / 2);
      this.tk.begin('bank canopy', c.x, c.z, false, true);
      const put = (geo, mat, lx, y, lz, rx = 0) => { const w = q(lx, lz); this.tk.put(geo, mat, w.x, p.y + y, w.z, p.rot, 1, 1, 1, rx, 0); };
      for (const k of [-1, 1]) put(new THREE.BoxGeometry(0.22, 0.42, 0.5), dressed, door.lx + k * 0.95, 2.62, p.d / 2 + 0.25);
      put(new THREE.BoxGeometry(2.3, 0.14, 0.66), dressed, door.lx, 3.04, p.d / 2 + 0.33);
      put(new THREE.BoxGeometry(2.4, 0.06, 0.78), slate, door.lx, 3.18, p.d / 2 + 0.33, -0.22);
      const tab = q(door.lx, p.d / 2 + 0.03);
      this.tk.begin('bank name', tab.x, tab.z, false, true);
      this.tk.put(new THREE.BoxGeometry(1.7, 0.42, 0.06), L.carved('COUNTING HOUSE', { w: 512, h: 128 }), tab.x, p.y + 3.62, tab.z, p.rot);
    }
    // The store: both front windows opened as counters, with goods laid out on them.
    if (P.store) for (const m of P.store.shopWindows || []) {
      this.tk.begin('shop counter', m.elements[12], m.elements[14], false, true);
      const c = shopWindow(env, m, rnd);
      const pool = ['FarmCrate_Apple', 'Pot_1', 'Bottle_1', 'FarmCrate_Carrot', 'Vase_4', 'Bag'];
      let x = c.x0 + 0.1;
      for (let k = 0; k < 4; k++) {
        const name = pool[(((k * 2 + Math.round(m.elements[12])) % pool.length) + pool.length) % pool.length];
        const b = this.kit.bounds(name), w = b.max.x - b.min.x;
        if (x + w > c.x1 - 0.05 || b.max.z - b.min.z > 0.55) { x += 0.05; continue; }
        const v = new THREE.Vector3(x + w / 2 - (b.max.x + b.min.x) / 2, 0, c.z + 0.02 - (b.max.z + b.min.z) / 2).applyMatrix4(m);
        this.#prop(batch, name, v.x, v.z, P.store.rot, { y: m.elements[13] + c.top + 0.03 - b.min.y, solid: false });
        x += w + 0.06;
      }
      const v = new THREE.Vector3(0, 0, c.z).applyMatrix4(m);
      const sh = this.world.colliders.addBox(v.x, v.z, 0.7, 0.3, P.store.rot, m.elements[13] - 0.5, m.elements[13] + 1.0);
      sh.floor = true;
    }
    // The inn's yard arch, between the inn and the stable, onto Bridge Street.
    const stable = H('stable');
    if (P.inn && stable) {
      const e = this.at(P.inn, P.inn.w / 2, -P.inn.d / 2), s0 = this.at(stable, -stable.w / 2, stable.d / 2);
      const x = (Math.max(e.x, P.inn.x + P.inn.d / 2) + s0.x) / 2;
      const gap = s0.x - (P.inn.x + P.inn.d / 2);
      if (gap > 2.4) yardArch(env, x, s0.z - 0.3, 0, this.world.heightAt(x, s0.z), gap - 0.8, 'Crooked Pike Yard');
    }
    // The toll house: its board of tolls by the door.
    const toll = H('toll house');
    if (toll) {
      const q = this.at(toll, -1.02, toll.d / 2 + 0.02);
      wallBoard(env, q.x, toll.y + 1.55, q.z, toll.rot, ['TOLLS', 'Cart ~ 2d', 'Horse ~ 1d', 'Beasts ~ 1d', 'On foot ~ free'], { w: 0.64, h: 0.86 });
    }
    // The watch house: a notice by the door, and the bell on its gable to raise the town.
    const watch = H('watch house');
    if (watch) {
      const q = this.at(watch, 0, watch.d / 2 + 0.02);
      wallBoard(env, q.x, watch.y + 1.6, q.z, watch.rot, ['THE WATCH', 'Ring for', 'the watchman'], { w: 0.64, h: 0.6 });
      const g = this.at(watch, watch.w / 2 + 0.01, 0.4);
      wallBell(env, g.x, watch.y + 2.95, g.z, watch.rot + Math.PI / 2);
    }
    if (stable) {
      const q = this.at(stable, -2.1, stable.d / 2 + 0.02);
      wallBoard(env, q.x, stable.y + 1.7, q.z, stable.rot, ['STABLES', 'Horses kept', 'by the night'], { w: 0.8, h: 0.6 });
    }
    // Hay in the barn.
    for (const [x, z, lv, rot] of this.barn?.hay || []) {
      this.tk.bale(x, z, rot, lv);
      // A stacked bale stands on the ones below: the stack is solid to its top.
      if (lv > 0) this.world.colliders.addBox(x, z, 0.55, 0.3, rot, this.world.heightAt(x, z) + lv * 0.55 - 0.1, this.world.heightAt(x, z) + (lv + 1) * 0.55);
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
    const lg = A.LYCH;
    tk.stoneWall([cy.x0, cy.z1], [lg.x - 1.5, cy.z1], null, { height: 1.1, thick: 0.5 });
    tk.stoneWall([lg.x + 1.5, cy.z1], [cy.x1, cy.z1], null, { height: 1.1, thick: 0.5 });
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

  // Counters, furniture and a ceiling in the buildings you can walk into, each furnished for what it
  // is: the bank's panelled counter behind a grille and its strongroom door, the store's counter and
  // stocked shelves, the inn's bar with its casks and a fire in the hearth. Wall shelves go only
  // where a wall has no window.
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
    const tk = this.tk, L = this.looks;
    const oak = L.timber('oak'), dark = L.timber('black'), grain = oak.userData.grain || [2.2, 0.645];
    const bx = (sx, sy, sz, along) => grainUV(new THREE.BoxGeometry(sx, sy, sz).translate(0, sy / 2, 0), along, grain);
    // A point in a building's frame, offset (dx, dz) along a piece turned by `turn` from the building.
    const P = (place, lx, lz, turn, dx, dz) => this.at(place, lx + dx * Math.cos(turn) + dz * Math.sin(turn), lz - dx * Math.sin(turn) + dz * Math.cos(turn));
    // A panelled counter `len` long, its customer side facing the building's front (+z), with a brass
    // grille and a pass-through gap on top if asked.
    const counter = (place, lx, lz, len, { h = 1.0, grille = false, turn = 0 } = {}) => {
      const c = this.at(place, lx, lz), rot = place.rot + turn;
      tk.begin('counter', c.x, c.z);
      tk.put(bx(len, h - 0.06, 0.55, 'x'), dark, c.x, y, c.z, rot);
      tk.put(bx(len + 0.1, 0.06, 0.68, 'x'), oak, c.x, y + h - 0.06, c.z, rot);
      const n = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i < n; i++) {
        const q = P(place, lx, lz, turn, -len / 2 + (i + 0.5) * (len / n), 0.29);
        tk.put(bx(len / n - 0.14, h - 0.38, 0.03, 'y'), oak, q.x, y + 0.16, q.z, rot);
      }
      if (grille) {
        const brass = (L.brass ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: 0.8, roughness: 0.35 }), { name: 'Brass' }));
        for (let x = -len / 2 + 0.06; x <= len / 2 - 0.05; x += 0.12) {
          if (Math.abs(x) < 0.34) continue; // the pass-through
          const q = P(place, lx, lz, turn, x, -0.05);
          tk.put(tk.cyl(0.012, 0.012, 0.62, 5), brass, q.x, y + h, q.z);
        }
        for (const s of [-1, 1]) {
          const q = P(place, lx, lz, turn, s * (len / 4 + 0.17), -0.05);
          tk.put(tk.box(len / 2 - 0.34, 0.035, 0.035), brass, q.x, y + h + 0.6, q.z, rot);
        }
      }
      // Its top is a surface things stand on (and a nimble player could).
      this.world.colliders.addBox(c.x, c.z, len / 2 + 0.05, 0.34, rot, y - 0.5, y + h).floor = true;
      return y + h;
    };
    // A pair of scales on a counter.
    const scales = (place, lx, lz, top) => {
      const c = this.at(place, lx, lz), iron = tk.m.iron;
      tk.begin('scales', c.x, c.z, true, true); // small enough to reach past, like the goods on a counter
      tk.put(tk.box(0.22, 0.04, 0.12), dark, c.x, top, c.z, place.rot);
      tk.put(tk.box(0.025, 0.34, 0.025), iron, c.x, top + 0.04, c.z, place.rot);
      tk.put(tk.box(0.4, 0.02, 0.02), iron, c.x, top + 0.36, c.z, place.rot);
      for (const s of [-1, 1]) {
        const q = P(place, lx, lz, 0, s * 0.18, 0);
        tk.put(tk.box(0.008, 0.2, 0.008), iron, q.x, top + 0.16, q.z, place.rot);
        tk.put(tk.cyl(0.07, 0.05, 0.02, 12), iron, q.x, top + 0.14, q.z);
      }
    };

    // --- the bank
    const bank = this.places.bank;
    ceiling(bank);
    const bt = counter(bank, 0, -1.4, 5.4, { grille: true });
    put(bank, 'Coin_Pile_2', -0.9, -1.45, 0.3, bt - y, false);
    put(bank, 'Coin_Pile', 0.9, -1.3, -0.5, bt - y, false);
    scales(bank, 1.7, -1.45, bt);
    put(bank, 'CandleStick_Triple', -1.8, -1.5, 0, bt - y, false);
    put(bank, 'Cabinet', 2.6, -3.35, 0);
    put(bank, 'Bookcase_2', 3.4, -1.0, -Math.PI / 2);
    put(bank, 'CandleStick_Stand', -3.3, 2.9, 0);
    // The strongroom: an iron-bound door in the back wall, behind the counter.
    {
      const lx = -2.9, lz = -bank.d / 2 + 0.31 + 0.05;
      const q = this.at(bank, lx, lz);
      batch.add('Door_4_Flat', q.x + Math.cos(bank.rot) * -0.53, y + 0.02, q.z - Math.sin(bank.rot) * -0.53, bank.rot, 1, { role: 'strongroom' });
      tk.begin('strongroom door', q.x, q.z, false, true);
      for (const [dx, h, dy] of [[-0.6, 2.25, 0], [0.6, 2.25, 0]]) { const r = P(bank, lx, lz, 0, dx, 0.02); tk.put(tk.box(0.1, h, 0.08), tk.m.iron, r.x, y + dy, r.z, bank.rot); }
      const r = P(bank, lx, lz, 0, 0, 0.02);
      tk.put(tk.box(1.3, 0.1, 0.08), tk.m.iron, r.x, y + 2.2, r.z, bank.rot);
      this.world.colliders.addBox(r.x, r.z, 0.66, 0.08, bank.rot, y - 0.5, y + 2.3);
    }

    // --- the store
    const store = this.places.store;
    ceiling(store);
    const st = counter(store, 0, -1.0, 3.4);
    scales(store, -1.1, -1.05, st);
    put(store, 'Bottle_1', 0.4, -0.9, 0, st - y, false);
    put(store, 'FarmCrate_Apple', 1.0, -1.05, 0.1, st - y, false);
    // Stocked shelves on the back and both side walls, in the bays without windows.
    const shelf = (place, lx, lz, turn, goods) => {
      put(place, goods ? 'Shelf_Simple' : 'Shelf_Small_Bottles', lx, lz, turn, goods ? 1.45 : 1.25, false);
      if (!goods) return;
      let x = -0.42;
      for (const name of goods) {
        const b = this.kit.bounds(name), w = b.max.x - b.min.x;
        if (x + w > 0.5) break;
        const q = P(place, lx, lz, turn, x + w / 2, 0.19);
        batch.add(name, q.x, y + 1.45 + 0.11 - b.min.y, q.z, place.rot + turn);
        x += w + 0.05;
      }
    };
    shelf(store, -2.0, -store.d / 2 + 0.28, 0, ['Pot_1', 'Bottle_1', 'Vase_4', 'Bottle_1']);
    shelf(store, 2.0, -store.d / 2 + 0.28, 0, ['Bottle_1', 'Pot_1', 'Bottle_1', 'Vase_4']);
    shelf(store, -store.w / 2 + 0.28, -2.55, Math.PI / 2, null);
    shelf(store, store.w / 2 - 0.28, -2.55, -Math.PI / 2, null);
    shelf(store, -store.w / 2 + 0.28, 2.6, Math.PI / 2, ['Vase_4', 'Pot_1', 'Bottle_1']);
    put(store, 'Barrel_Apples', -2.3, 2.9, 0);
    put(store, 'Bag', 2.25, 2.9, 0.8);
    put(store, 'Bag', 2.35, 1.95, -0.4);
    put(store, 'Crate_Wooden', 2.2, -3.1, 0.2);

    // --- the inn
    const inn = this.places.inn;
    ceiling(inn);
    // Bess's bar across the back, casks racked behind it, bottles on the wall.
    const it = counter(inn, -0.9, -3.9, 4.0);
    put(inn, 'Mug', -1.6, -3.85, 0.4, it - y, false);
    put(inn, 'Mug', -1.2, -3.95, 2.1, it - y, false);
    put(inn, 'Bottle_1', 0.4, -3.9, 0, it - y, false);
    put(inn, 'Barrel_Holder', 2.9, -5.25, 0); // clear of a back door into the yard
    put(inn, 'Shelf_Small_Bottles', -3.0, -inn.d / 2 + 0.28, 0, 1.3, false);
    // Tables with chairs and a bench.
    put(inn, 'Table_Large', 0.4, 1.4, Math.PI / 2);
    put(inn, 'Bench', -0.9, 1.4, Math.PI / 2);
    for (const [dz, t] of [[-0.8, -Math.PI / 2], [0.8, -Math.PI / 2]]) put(inn, 'Chair_1', 1.25, 1.4 + dz, t);
    put(inn, 'Mug', 0.4, 1.8, 0, 0.81, false);
    put(inn, 'Mug', 0.2, 0.9, 1, 0.81, false);
    put(inn, 'Stool', -2.2, -2.9, 0.3);
    put(inn, 'Stool', -0.4, -2.9, -0.2);
    // The fireplace on the gable wall, under the chimney: a stone breast with a fire in its opening.
    {
      const stone = L.stone('grey'), dressed = L.dressed('grey');
      const lx = inn.w / 2 - 0.31 - 0.3, turn = -Math.PI / 2;
      const c = this.at(inn, lx, 0);
      tk.begin('fireplace', c.x, c.z);
      for (const s of [-1, 1]) { const q = P(inn, lx, 0, turn, s * 0.72, 0); tk.put(tk.box(0.46, 1.0, 0.6), stone, q.x, y, q.z, inn.rot + turn); }
      tk.put(tk.box(1.9, STOREY - 1.02, 0.6), stone, c.x, y + 1.0, c.z, inn.rot + turn);
      const m = P(inn, lx, 0, turn, 0, 0.35);
      tk.put(bx(2.1, 0.08, 0.3, 'x'), oak, m.x, y + 1.3, m.z, inn.rot + turn);
      const h = P(inn, lx, 0, turn, 0, 0.5);
      tk.put(tk.box(1.9, 0.05, 0.5), dressed, h.x, y, h.z, inn.rot + turn);
      L.shade ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 }), { name: 'Shade' });
      const back = P(inn, lx, 0, turn, 0, -0.28);
      tk.put(tk.box(0.98, 1.0, 0.04), L.shade, back.x, y, back.z, inn.rot + turn);
      for (const s of [-1, 1]) { const q = P(inn, lx, 0, turn, s * 0.72, 0); this.world.colliders.addBox(q.x, q.z, 0.23, 0.3, inn.rot + turn, y - 0.5, y + STOREY); }
      this.world.colliders.addBox(c.x, c.z, 0.95, 0.3, inn.rot + turn, y + 1.0, y + STOREY).cameraOnly = true;
      const f = P(inn, lx, 0, turn, 0, 0.05);
      this.hearthFire = { x: f.x, y: y + 0.05, z: f.z };
    }
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
