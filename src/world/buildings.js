import * as THREE from 'three';
import { OPENING, DOOR_CLEAR } from './doors.js';
import { sweep, roofSection, gableGeometry, bargeGeometry, stackParts } from './roofs.js';
import { grainUV } from './landmarks.js';
import { fitUV } from './props.js';

// Ashford's houses: kit walls on the Medieval Village kit's 2 m grid, dressed in the town's own
// palette, under roofs built for them. A building row says what it is (a type: a jettied town
// house, a stone cottage, a thatched cottage, a tall narrow house...) and anything it does
// differently (its limewash, its timbers, its roofing, which way its ridge runs); this turns that
// into kit pieces (walls, corner posts), procedural pieces (roof, gables, carved bargeboards,
// chimney stacks, window frames with leaded lights, jetty joists) and collision boxes, leaving
// the doorways open.
//
// Local frame: origin at the centre of the footprint on the ground floor, +z is the front. Kit
// walls face their exterior along +z.
//
// Windows follow how real houses are laid out rather than a dice roll per bay: each wall is a row
// of 2 m bays, and windows go in every other bay, mirrored about the door where there is one (the
// bays either side of it), the same bays on every floor so they stack in columns. A wall without a
// door gets its middle bay (or pair). Short walls (two bays) get none unless they carry the door.
// No shutters: casements with leaded diamond panes in the timber houses, stone-mullioned lights
// under a hood mould in the stone ones.

export const STOREY = 3.0;
const WALL_T = 0.41, WALL_Z = -0.105; // thickness, and where the wall's middle sits
const WALL_DEPTH = 0.31; // the kit wall's plaster face is at z = 0, its back at -0.31
const OPEN = { x: 0.6, y0: 1.06, y1: 2.3 }; // the opening of a Wide_Flat window wall piece
// Metres per repeat of the kit materials (as the kit lays them), for procedural pieces in them.
const TILE = { MI_WoodTrim: 2.2, MI_UnevenBrick: 2.1, MI_Brick: 2.2, MI_RedBrick: 2.0, MI_Plaster: 2.2 };

// What each type of building is, before a row's own overrides.
//   walls   'frame' timber-framed plaster on every floor, 'mixed' stone ground floor, 'stone' all stone
//   roof    a key of ROOFING in looks.js; ridge 'across' (gable to the street) or 'along' (eaves to it)
//   jetty   how far each upper floor oversails the one below, at the front (m)
//   window  'casement' | 'mullion' | 'bars' | 'shop' ; chimney 'ridge' | 'gable' | 'none'
export const TYPES = {
  cottage: { walls: 'frame', roof: 'tile', ridge: 'across', window: 'casement', barge: true, chimney: 'ridge' },
  jetty: { walls: 'frame', roof: 'tile', ridge: 'along', jetty: 0.5, window: 'casement', barge: true, chimney: 'ridge' },
  gabled: { walls: 'frame', roof: 'tile-red', ridge: 'across', jetty: 0.45, window: 'casement', barge: true, chimney: 'ridge' },
  tall: { walls: 'frame', roof: 'tile-brown', ridge: 'across', jetty: 0.35, window: 'casement', barge: true, chimney: 'ridge', pitch: 55 },
  stone: { walls: 'stone', roof: 'slate', ridge: 'along', window: 'mullion', chimney: 'gable', stone: 'honey', pitch: 47 },
  thatch: { walls: 'frame', roof: 'thatch', ridge: 'along', window: 'casement', chimney: 'gable', pitch: 52, over: 0.5 },
  bank: { walls: 'stone', roof: 'slate-dark', ridge: 'along', window: 'bars', chimney: 'gable', stone: 'honey', pitch: 45 },
  shop: { walls: 'mixed', roof: 'tile', ridge: 'across', jetty: 0.45, window: 'shop', barge: true, chimney: 'ridge' },
  inn: { walls: 'frame', roof: 'tile-brown', ridge: 'along', jetty: 0.5, window: 'casement', barge: true, chimney: 'ridge' },
  workshop: { walls: 'mixed', roof: 'tile', ridge: 'across', window: 'casement', barge: true, chimney: 'none' },
  stable: { walls: 'mixed', roof: 'tile-brown', ridge: 'along', window: 'none', chimney: 'none', timber: 'oak' },
  lockup: { walls: 'stone', roof: 'slate', ridge: 'along', window: 'mullion', chimney: 'gable', pitch: 47 },
  hall: { walls: 'frame', roof: 'tile-red', ridge: 'along', window: 'casement', barge: true, chimney: 'none', pitch: 50 },
};
const PITCH = { thatch: 52, slate: 47, 'slate-dark': 47 };

// The look of a building row: its type's defaults under its own settings.
export function lookOf(spec) {
  const t = TYPES[spec.type] || TYPES[spec.id] || TYPES.cottage;
  // Rows without a type (older plans) keep their style: stone meant a stone ground floor.
  const walls = spec.walls || (spec.type || TYPES[spec.id] ? t.walls : spec.style === 'stone' ? 'mixed' : 'frame');
  const look = { ...t, walls, ...pickDefined(spec, ['roof', 'ridge', 'jetty', 'window', 'barge', 'wash', 'timber', 'stone', 'pitch', 'over', 'dormers', 'boxes', 'lean', 'door', 'chimneyAt', 'ivy', 'datestone']) };
  if (spec.chimney === 0) look.chimney = 'none';
  else if (typeof spec.chimney === 'string') look.chimney = spec.chimney;
  look.pitch = ((look.pitch ?? PITCH[look.roof] ?? 50) * Math.PI) / 180;
  look.jetty = (spec.floors || 1) > 1 ? look.jetty || 0 : 0;
  look.wash ??= 'cream';
  look.timber ??= 'kit';
  look.stone ??= 'grey';
  return look;
}
function pickDefined(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

// Which bays of a wall (n bays long) get a window. doorBay is the bay holding the door, or -1.
export function windowBays(n, doorBay) {
  if (doorBay >= 0) {
    const out = [];
    for (let i = 0; i < n; i++) if (Math.abs(i - doorBay) % 2 === 1) out.push(i);
    return out;
  }
  if (n <= 2) return [];
  if (n === 3) return [1];
  if (n === 4) return [1, 2];
  if (n === 5) return [1, 3];
  return [1, n - 2];
}

// Corner posts wrap the corner: the brick one is an L, so each corner turns it (front-right as authored).
const CORNER_TURN = { '1,1': 0, '-1,1': Math.PI / 2, '-1,-1': Math.PI, '1,-1': -Math.PI / 2 };
const Y = new THREE.Vector3(0, 1, 0);

// spec: { x, z, rot, w, d, floors, type, style, doors: [{ side: 's'|'n'|'e'|'w', at, open (public), shape, leaf, paint }],
//         seed, chimney, windows (0 for none), open (walls left off, for workshops), backDoor, and look overrides }
// env: { tk (TownKit, for procedural pieces), looks (houseLooks) }; without them the house is bare kit.
export function buildHouse(kit, batch, colliders, spec, groundY, env = {}) {
  const { tk, looks: L } = env;
  const look = lookOf(spec);
  const floors = spec.floors || 1;
  const rnd = rng(spec.seed ?? Math.round(spec.x * 13 + spec.z * 7));
  const yaw = spec.rot || 0;
  const world = new THREE.Matrix4().compose(new THREE.Vector3(spec.x, groundY, spec.z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(1, 1, 1));
  const parts = [];
  const swap = L ? L.swap(look) : null, swapStone = L ? L.swap(look, true) : null;
  const M = (lx, ly, lz, rot = 0, sx = 1) => new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(Y, rot), new THREE.Vector3(sx, 1, 1));
  // A crooked house: everything above the ground floor leans a few degrees (front and to one side).
  const leanM = look.lean ? new THREE.Matrix4().makeTranslation(0, STOREY, spec.d / 2).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(look.lean * 0.9, 0, -look.lean * 0.55))).multiply(new THREE.Matrix4().makeTranslation(0, -STOREY, -spec.d / 2)) : null;
  const toWorld = (local, lean = false) => (lean && leanM ? new THREE.Matrix4().multiplyMatrices(world, leanM).multiply(local) : new THREE.Matrix4().multiplyMatrices(world, local));
  const place = (name, local, meta = {}, lean = false) => {
    parts.push({ name, lx: local.elements[12], ly: local.elements[13], lz: local.elements[14], ...meta });
    const sw = /UnevenBrick|Corner_Exterior_Brick/.test(name) ? swapStone : swap;
    batch.add(name, toWorld(local, lean), sw ? { ...meta, swap: sw } : meta);
  };
  // A procedural piece in the house's frame, through the TownKit (so the audit groups it).
  const put = (geo, mat, local, lean = false) => {
    if (!tk) return;
    let g = geo;
    const tile = TILE[mat.name];
    if (tile && !g.userData.wuv) g = Object.assign(fitUV(g, tile), { userData: { wuv: true } });
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(toWorld(local, lean));
    batch.addObject(mesh, new THREE.Matrix4(), tk.cur);
  };
  // Thin facade dressing should not pull the camera into the player; the solid
  // house walls and roof remain the camera's obstruction surfaces.
  const THIN = new Set(['window', 'date stone']);
  const begin = (label, lx, lz, on = true) => {
    if (!tk) return;
    const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(world);
    tk.begin(label, p.x, p.z, false, on);
    if (THIN.has(label)) tk.cur.thin = true;
  };
  const hw = spec.w / 2, hd = spec.d / 2;
  const doors = (spec.doors || []).map((d) => ({ ...d }));
  if (spec.backDoor && !doors.some((d) => d.side === 'n')) doors.push({ side: 'n', at: spec.backDoor.at ?? Math.floor(spec.w / 4), back: true });
  const J = (f) => look.jetty * f; // how far floor f's front stands out
  const Jtop = J(floors - 1);
  const sides = [
    // side, pieces along it, wall rotation, piece centre for index i on floor f (and the along-wall scale)
    ['s', spec.w / 2, 0, (i, f) => [-hw + 1 + i * 2, hd + J(f), 1]],
    ['n', spec.w / 2, Math.PI, (i) => [hw - 1 - i * 2, -hd, 1]],
    ['e', spec.d / 2, Math.PI / 2, (i, f) => { const k = (spec.d + J(f)) / spec.d; return [hw, hd + J(f) - (1 + 2 * i) * k, k]; }],
    ['w', spec.d / 2, -Math.PI / 2, (i, f) => { const k = (spec.d + J(f)) / spec.d; return [-hw, -hd + (1 + 2 * i) * k, k]; }],
  ];
  const stoneAt = (f) => look.walls === 'stone' || (look.walls === 'mixed' && f === 0);

  const kinds = {
    casement: 'Wide_Flat', mullion: 'Wide_Flat', bars: 'Wide_Flat', shop: 'Wide_Flat', none: null,
  };
  const kind = spec.windows === 0 || look.window === 'none' ? null : kinds[look.window] || 'Wide_Flat';
  const doorLeaf = look.door?.leaf, doorShape = look.door?.shape, doorPaint = look.door?.paint;

  const openings = [];
  const windows = [];
  for (const [side, n, rot, at] of sides) {
    if (spec.open?.includes(side)) continue;
    const doorBay = doors.find((d) => d.side === side)?.at ?? -1;
    const bays = !kind ? [] : windowBays(n, doorBay);
    for (let f = spec.groundOpen ? 1 : 0; f < floors; f++)
      for (let i = 0; i < n; i++) {
        const [lx, lz, k] = at(i, f);
        const y = f * STOREY;
        const door = f === 0 && doors.find((d) => d.side === side && d.at === i);
        const stone = stoneAt(f);
        const prefix = stone ? 'Wall_UnevenBrick' : 'Wall_Plaster';
        const meta = { side, floor: f, bay: i, n };
        const local = M(lx, y, lz, rot, k);
        const lean = f > 0;
        if (door) {
          const shape = (door.shape || doorShape || 'Round') === 'Flat' ? 'Flat' : 'Round';
          place(`${prefix}_Door_${shape}`, local, { ...meta, role: 'door-wall' }, lean);
          openings.push({ side, i, lx, lz, rot, door, shape, floor: f });
        } else if (bays.includes(i)) {
          const piece = stone ? 'Wall_UnevenBrick_Window_Wide_Flat' : f === 0 ? 'Wall_Plaster_Window_Wide_Flat' : 'Wall_Plaster_Window_Wide_Flat2';
          place(piece, local, { ...meta, role: 'window-wall', kind }, lean);
          const style = look.window === 'shop' && !(f === 0 && side === 's') ? 'casement' : look.window;
          windows.push({ side, floor: f, bay: i, n, kind, style, shutters: 'none', local, lean });
        } else {
          let name;
          if (stone) name = 'Wall_UnevenBrick_Straight';
          else if (f > 0) name = 'Wall_Plaster_Straight';
          // Braces rise to the corner posts at both ends of a timber-framed wall, the way they were framed.
          else name = n >= 3 && i === 0 ? 'Wall_Plaster_Straight_L' : n >= 3 && i === n - 1 ? 'Wall_Plaster_Straight_R' : 'Wall_Plaster_Straight_Base';
          place(name, local, { ...meta, role: 'wall' }, lean);
        }
      }
  }
  // Corner posts at every corner where both walls stand (an open-fronted workshop keeps its back ones).
  const has = (s) => !spec.open?.includes(s);
  for (const [cx, cz] of [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]]) {
    const a = cz > 0 ? 's' : 'n', b = cx > 0 ? 'e' : 'w';
    if (!has(a) || !has(b)) continue;
    for (let f = spec.groundOpen ? 1 : 0; f < floors; f++) {
      const zz = cz > 0 ? cz + J(f) : cz;
      place(stoneAt(f) ? 'Corner_Exterior_Brick' : 'Corner_Exterior_Wood', M(cx, f * STOREY, zz, CORNER_TURN[`${Math.sign(cx)},${Math.sign(cz)}`]), { role: 'corner', floor: f }, f > 0);
    }
  }

  const top = floors * STOREY + 0.12;
  const roof = { y0: top, ridgeDir: look.ridge, pitch: look.pitch, kind: look.roof };
  if (L && tk) {
    const mats = {
      timber: L.timber(look.timber),
      plaster: L.plaster(look.wash),
      stone: L.stone(look.stone),
      dressed: L.dressed(look.stone),
      roof: L.roof(look.roof),
      gable: stoneAt(floors - 1) ? L.stone(look.stone) : L.plaster(look.wash),
    };
    // Windows: frames, leaded lights and sills set into the kit's openings.
    for (const w of windows) {
      begin('window', w.local.elements[12], w.local.elements[14]);
      windowInsert(put, w, mats, L, look, stoneAt(w.floor));
    }
    // The jetty: joists, a moulded bressumer and a soffit under every oversailing floor, brackets at the corners.
    for (let f = 1; f < floors && look.jetty > 0; f++) {
      begin('jetty', 0, hd + J(f));
      jettyFloor(put, mats.timber, spec.w, hd + J(f - 1), J(f) - J(f - 1), f * STOREY, f > 1);
    }
    Object.assign(roof, buildRoof(put, begin, { w: spec.w, d: spec.d, hd, Jtop, top, look, mats, lean: floors > 1 && !!look.lean, rnd, framed: !stoneAt(floors - 1), hasBarge: look.barge && !stoneAt(floors - 1) }));
    // Chimney stacks: brick on the timber houses, stone on the stone ones.
    if (look.chimney !== 'none' && spec.chimney !== 0) chimney(put, begin, roof, look, stoneAt(floors - 1) ? mats.stone : L.brick, L.pot, rnd, { hw, hd, Jtop, lean: floors > 1 && !!look.lean });
    if (look.dormers && look.ridge === 'along') dormers(put, begin, roof, look, mats, L.glass, spec.w, hd, Jtop, look.dormers, floors > 1 && !!look.lean);
    // A market hall: its upper floor stands on oak posts over an open ground floor, with a boarded
    // ceiling on beams, and a louvred cupola with a weathervane rides its ridge.
    if (spec.groundOpen) roof.posts = hallFrame(put, begin, mats, L, spec.w, spec.d, roof);
    // A date stone over the front door, carved the year the house was built.
    const front = openings.find((o) => o.side === 's');
    if (look.datestone && front) {
      begin('date stone', front.lx, front.lz);
      const plaque = new THREE.BoxGeometry(0.62, 0.34, 0.06);
      put(plaque, L.carved(String(look.datestone)), M(front.lx, OPENING[front.shape].top + 0.42, front.lz + 0.03, front.rot));
    }
  }
  // Ivy climbing one wall from the eaves down, near its back corner (the kit's hanging vines).
  if (look.ivy && kit.has('Prop_Vine1')) {
    const wallTop = floors * STOREY + 0.1;
    const spot = { n: [hw - 1.3, -hd - 0.02, Math.PI], e: [hw + 0.02, -hd + 1.3, Math.PI / 2], w: [-hw - 0.02, -hd + 1.3, -Math.PI / 2] }[look.ivy];
    if (spot) {
      const [ix, iz, ir] = spot;
      for (let k = 0; k < floors + 1; k++) {
        const name = ['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine1'][k % 3];
        const b = kit.bounds(name);
        const along = (k % 2 ? 0.7 : 0) * (ir === Math.PI ? -1 : 1);
        const [ox, oz] = ir === Math.PI ? [along, 0] : [0, along];
        place(name, M(ix + ox, wallTop - b.max.y - k * 2.2, iz + oz, ir), { role: 'ivy' });
      }
    }
  }

  // Collision: one box per wall segment, split around doorways.
  const doorDefs = [];
  if (colliders) {
    const h = floors * STOREY + 2;
    const add = (lx, lz, hx, hz) => {
      const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(world);
      return colliders.addBox(v.x, v.z, hx, hz, yaw, groundY - 1, groundY + h);
    };
    for (const [side, n, rot, at] of sides) {
      if (spec.open?.includes(side) || spec.groundOpen) continue;
      const horiz = side === 's' || side === 'n';
      for (let i = 0; i < n; i++) {
        const [lx, lz] = at(i, 0);
        const inset = side === 's' || side === 'e' ? WALL_Z : -WALL_Z;
        const cx = horiz ? lx : lx + inset, cz = horiz ? lz + inset : lz;
        const opening = openings.find((o) => o.side === side && o.i === i);
        if (!opening) {
          add(cx, cz, horiz ? 1.02 : WALL_T / 2, horiz ? WALL_T / 2 : 1.02);
        } else {
          // Jambs either side of the opening, out to the bay's edge.
          const half = OPENING[opening.shape].half;
          const off = (half + 1.0) / 2 + 0.005, jh = (1.0 - half) / 2 + 0.02;
          for (const s of [-1, 1]) {
            const ox = horiz ? cx + s * off : cx, oz = horiz ? cz : cz + s * off;
            add(ox, oz, horiz ? jh : WALL_T / 2, horiz ? WALL_T / 2 : jh);
          }
          // The wall above the door: solid to the camera, but the player passes under it.
          const v = new THREE.Vector3(cx, 0, cz).applyMatrix4(world);
          const lintel = colliders.addBox(v.x, v.z, horiz ? 0.6 : WALL_T / 2, horiz ? WALL_T / 2 : 0.6, yaw, groundY + DOOR_CLEAR, groundY + h);
          lintel.cameraOnly = true;
          // The door itself (built by whoever owns the scene: see Door in doors.js).
          const local = new THREE.Vector3(lx + Math.sin(rot) * WALL_Z, 0, lz + Math.cos(rot) * WALL_Z).applyMatrix4(world);
          const d = opening.door;
          doorDefs.push({ x: local.x, z: local.z, yaw: yaw + rot, y: groundY, shape: opening.shape, leaf: d.leaf || doorLeaf || 1, paint: d.paint || doorPaint || null, public: !!d.open, side, bay: i, back: !!d.back });
        }
      }
    }
    // A hall's posts.
    if (spec.groundOpen && roof.posts) for (const [px, pz] of roof.posts) {
      const v = new THREE.Vector3(px, 0, pz).applyMatrix4(world);
      colliders.addCircle(v.x, v.z, 0.2, groundY - 1, groundY + STOREY - 0.2);
    }
    // The roof: from the top of the walls up, over the whole footprint, so the camera
    // can't climb through the ceiling or roof from inside (or drop through it from above).
    const c = new THREE.Vector3(0, 0, Jtop / 2).applyMatrix4(world);
    const roofSlab = colliders.addBox(c.x, c.z, hw + 0.2, hd + Jtop / 2 + 0.2, yaw, groundY + floors * STOREY - 0.05, groundY + floors * STOREY + 6);
    roofSlab.cameraOnly = true;
  }
  const info = {
    world, top, openings, doors: doorDefs, parts, windows: windows.map(({ local, lean, ...w }) => w), look, roof,
    shopWindows: windows.filter((w) => w.style === 'shop').map((w) => toWorld(w.local, w.lean)),
    spec: { x: spec.x, z: spec.z, rot: yaw, w: spec.w, d: spec.d, floors, groundY, style: spec.style || 'plaster', type: spec.type || spec.id, role: spec.role || spec.id, roof: roof.kind, open: spec.open || [], jetty: Jtop, groundOpen: !!spec.groundOpen },
  };
  if (colliders) (colliders.buildings ??= []).push(info);
  return info;
}

// ---------------------------------------------------------------- windows
// A window's frame, lights and sill in the kit opening (x +-0.6, y 1.06..2.3 in the wall piece's
// frame; the wall's face at z = 0, its back at -0.31). Timber houses: an oak frame with a mullion and
// a transom holding leaded diamond panes, on a timber sill. Stone houses: stone mullions and a stone
// sill, small square leaded panes, and a hood mould over the head to throw off the rain.
function windowInsert(put, w, mats, L, look, stone) {
  const at = (x, y, z) => new THREE.Matrix4().multiplyMatrices(w.local, new THREE.Matrix4().makeTranslation(x, y, z));
  const { x: X, y0, y1 } = OPEN;
  const H = y1 - y0;
  const box = (sx, sy, sz, along) => grainUV(new THREE.BoxGeometry(sx, sy, sz), along, mats.timber.userData.grain || [2.2, 0.645]);
  const glass = (mat, z) => {
    const g = new THREE.PlaneGeometry(2 * X, H);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.5, p.getY(i) / 0.5);
    put(g, mat, at(0, (y0 + y1) / 2, z), w.lean);
  };
  if (w.style === 'shop') return; // shop fronts are built by the trades (a stall board and canopy)
  if (w.style === 'bars' || w.style === 'mullion' || stone) {
    glass(L.glassSquare, -0.17);
    const dm = mats.dressed;
    // Mullions: three lights in the stone houses, two (with iron bars) at the bank.
    const xs = w.style === 'bars' ? [0] : [-0.2, 0.2];
    for (const x of xs) put(new THREE.BoxGeometry(0.1, H, 0.2), dm, at(x, (y0 + y1) / 2, -0.1), w.lean);
    if (w.style === 'bars') for (const x of [-0.42, -0.21, 0.21, 0.42]) put(new THREE.CylinderGeometry(0.018, 0.018, H, 6), L.iron, at(x, (y0 + y1) / 2, -0.06), w.lean);
    put(new THREE.BoxGeometry(2 * X + 0.2, 0.09, 0.3), dm, at(0, y0 - 0.045, -0.06), w.lean);
    // Hood mould with its two label stops.
    put(new THREE.BoxGeometry(2 * X + 0.32, 0.1, 0.12), dm, at(0, y1 + 0.1, 0.05), w.lean);
    for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.1, 0.2, 0.12), dm, at(s * (X + 0.11), y1 + 0.05, 0.05), w.lean);
    return;
  }
  // Timber casement.
  glass(L.glass, -0.15);
  const T = 0.07, D = 0.1, z = -0.1;
  put(box(T, H, D, 'y'), mats.timber, at(-X + T / 2, (y0 + y1) / 2, z), w.lean);
  put(box(T, H, D, 'y'), mats.timber, at(X - T / 2, (y0 + y1) / 2, z), w.lean);
  put(box(2 * X - 2 * T, T, D, 'x'), mats.timber, at(0, y1 - T / 2, z), w.lean);
  put(box(2 * X - 2 * T, T, D, 'x'), mats.timber, at(0, y0 + T / 2, z), w.lean);
  put(box(0.06, H - 2 * T, D, 'y'), mats.timber, at(0, (y0 + y1) / 2, z), w.lean);
  put(box(2 * X - 2 * T, 0.05, D, 'x'), mats.timber, at(0, y0 + H * 0.68, z), w.lean);
  put(box(2 * X + 0.14, 0.07, 0.24, 'x'), mats.timber, at(0, y0 - 0.035, -0.02), w.lean);
  // Flower boxes under the front windows of some houses.
  if (look.boxes && w.side === 's') flowerBox(put, at, mats.timber, L, w.lean, (w.bay * 7 + w.floor * 3) | 0);
}

const FLOWERS = [0xc8402e, 0xe0a0b8, 0xe8d25a, 0xf2eee2, 0x8c4fb0];
function flowerBox(put, at, timber, L, lean, seed) {
  const box = grainUV(new THREE.BoxGeometry(1.15, 0.2, 0.24).translate(0, 0.1, 0), 'x', timber.userData.grain || [2.2, 0.645]);
  put(box, timber, at(0, OPEN.y0 - 0.26, 0.14), lean);
  L.flowerMats ??= FLOWERS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const leafG = (L.leafG ??= new THREE.PlaneGeometry(0.24, 0.26));
  const headG = (L.headG ??= new THREE.SphereGeometry(0.035, 6, 5));
  const stemG = (L.stemG ??= new THREE.CylinderGeometry(0.0025, 0.0035, 1, 5));
  const stemMat = (L.stemMat ??= Object.assign(new THREE.MeshStandardMaterial({ color: 0x476532, roughness: 0.9 }), { name: 'Flower_Stem' }));
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const col = L.flowerMats[seed % L.flowerMats.length], col2 = L.flowerMats[(seed + 2) % L.flowerMats.length];
  for (let i = 0; i < 5; i++) {
    const x = -0.44 + i * 0.22;
    // Two crossed sprays keep visible leaf silhouettes from either end of the street;
    // their photographed stems descend into the planter rather than floating above it.
    const leafY = OPEN.y0 - 0.06 + r() * 0.04;
    for (const turn of [-0.65, 0.65]) {
      const m = at(x, leafY, 0.14).multiply(new THREE.Matrix4().makeRotationY(turn));
      m.multiply(new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.3));
      put(leafG, L.leaf, m, lean);
    }
    for (let k = 0; k < 3; k++) {
      const hx = x + (r() - 0.5) * 0.18, hy = OPEN.y0 + 0.02 + r() * 0.08, hz = 0.1 + r() * 0.12;
      const baseY = OPEN.y0 - 0.1;
      const axis = new THREE.Vector3(hx - x, hy - baseY, hz - 0.14), length = axis.length();
      const turn = new THREE.Quaternion().setFromUnitVectors(Y, axis.normalize());
      const stem = at((x + hx) / 2, (baseY + hy) / 2, (0.14 + hz) / 2)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn)).multiply(new THREE.Matrix4().makeScale(1, length, 1));
      put(stemG, stemMat, stem, lean);
      put(headG, k === 2 ? col2 : col, at(hx, hy, hz), lean);
    }
  }
}

// ---------------------------------------------------------------- jetties
// Under an oversailing floor: joist ends every half metre, a soffit, a moulded bressumer beam along
// the front and a curved bracket at each corner post.
function jettyFloor(put, timber, w, zFace, J, y, upper) {
  const g = timber.userData.grain || [2.2, 0.645];
  const bx = (sx, sy, sz, along) => grainUV(new THREE.BoxGeometry(sx, sy, sz), along, g);
  const M = (x, yy, z) => new THREE.Matrix4().makeTranslation(x, yy, z);
  const zBress = zFace + J - 0.02;
  put(bx(w + 0.1, 0.24, 0.2, 'x'), timber, M(0, y - 0.1, zBress), upper);
  put(bx(w + 0.1, 0.05, 0.25, 'x'), timber, M(0, y + 0.045, zBress + 0.02), upper);
  put(bx(w, 0.04, J, 'x'), timber, M(0, y - 0.2, zFace + J / 2), upper);
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i <= n; i++) put(bx(0.12, 0.12, J + 0.06, 'z'), timber, M(-w / 2 + 0.06 + ((w - 0.12) * i) / n, y - 0.28, zFace + J / 2 - 0.02), upper);
  // Brackets: a quarter-round spandrel of oak under each front corner.
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, -0.9), new THREE.Vector2(0.08, -0.9)]);
  shape.quadraticCurveTo(0.1, -0.2, J + 0.02, -0.12);
  shape.lineTo(J + 0.02, 0);
  shape.lineTo(0, 0);
  const geo = grainUV(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.07), 'y', g);
  for (const s of [-1, 1]) put(geo, timber, new THREE.Matrix4().makeTranslation(s * (w / 2 - 0.1), y - 0.22, zFace).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), upper);
}

// ---------------------------------------------------------------- the market hall
// Oak posts on stone pads round an open ground floor, braced to the beams that carry the hall above,
// a boarded ceiling, and a louvred cupola with a weathervane on the ridge. Returns the posts.
function hallFrame(put, begin, mats, L, w, d, roof) {
  const hw = w / 2, hd = d / 2, H = STOREY - 0.25;
  const g = mats.timber.userData.grain || [2.2, 0.645];
  const bx = (sx, sy, sz, along) => grainUV(new THREE.BoxGeometry(sx, sy, sz), along, g);
  const T = (x, y, z, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
  const posts = [];
  const nx = Math.round((w - 0.3) / 2);
  for (let i = 0; i <= nx; i++) for (const z of [-hd + 0.15, hd - 0.15]) posts.push([-hw + 0.15 + ((w - 0.3) * i) / nx, z]);
  const nz = d > 7 ? Math.round((d - 0.3) / 3) : 1; // the short ends of a small hall span on their tie beams
  for (let j = 1; j < nz; j++) for (const x of [-hw + 0.15, hw - 0.15]) posts.push([x, -hd + 0.15 + ((d - 0.3) * j) / nz]);
  begin('hall frame', 0, 0, false);
  for (const [x, z] of posts) {
    put(new THREE.BoxGeometry(0.44, 0.4, 0.44).translate(0, 0.1, 0), mats.dressed, T(x, 0, z));
    put(bx(0.26, H - 0.3, 0.26, 'y'), mats.timber, T(x, 0.3 + (H - 0.3) / 2, z));
  }
  // Arch braces from the posts up to the beams along the long sides.
  const brace = Math.hypot(0.62, 0.62);
  for (const [x, z] of posts) {
    if (Math.abs(Math.abs(z) - (hd - 0.15)) > 0.01) continue;
    for (const k of [-1, 1]) {
      if (Math.abs(x + k * 0.5) > hw - 0.1) continue;
      put(bx(0.1, brace, 0.12, 'y'), mats.timber, T(x + k * 0.31, H - 0.31, z, 0, -k * Math.PI / 4));
    }
  }
  // Beams: round the edge and across the hall every two metres; a boarded ceiling over them.
  for (const z of [-hd + 0.15, hd - 0.15]) put(bx(w, 0.26, 0.28, 'x'), mats.timber, T(0, H + 0.13, z));
  for (const x of [-hw + 0.15, hw - 0.15]) put(bx(0.28, 0.26, d - 0.56, 'z'), mats.timber, T(x, H + 0.13, 0));
  for (let i = 1; i < nx; i++) put(bx(0.2, 0.22, d - 0.56, 'z'), mats.timber, T(-hw + 0.15 + ((w - 0.3) * i) / nx, H + 0.11, 0));
  put(bx(w - 0.5, 0.05, d - 0.5, 'x'), mats.timber, T(0, H + 0.225, 0));
  // The cupola on the ridge.
  const [cx, , cz] = roof.at(0, 0, 0);
  const y = roof.ridge - 0.12;
  begin('cupola', cx, cz);
  put(bx(1.2, 0.3, 1.2, 'x'), mats.timber, T(cx, y + 0.15, cz));
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put(bx(0.12, 0.95, 0.12, 'y'), mats.timber, T(cx + a * 0.5, y + 0.3 + 0.475, cz + b * 0.5));
  for (const [a, b, r] of [[0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1]]) for (let k = 0; k < 3; k++) {
    const geo = r ? bx(0.05, 0.22, 0.9, 'z') : bx(0.9, 0.22, 0.05, 'x');
    put(geo, mats.timber, T(cx + a * 0.5, y + 0.45 + k * 0.27, cz + b * 0.5, r ? 0 : 0.5 * b, r ? -0.5 * a : 0));
  }
  const cap = fitUV(new THREE.ConeGeometry(0.92, 0.75, 4, 1, false).rotateY(Math.PI / 4), mats.roof.userData.roofing.tu);
  put(cap, mats.roof, T(cx, y + 1.25 + 0.375, cz));
  put(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), L.iron, T(cx, y + 2.1, cz));
  put(new THREE.SphereGeometry(0.07, 10, 8), L.iron, T(cx, y + 1.95, cz));
  put(new THREE.BoxGeometry(0.75, 0.04, 0.04), L.iron, T(cx, y + 2.35, cz));
  put(new THREE.ConeGeometry(0.08, 0.18, 4).rotateZ(-Math.PI / 2), L.iron, T(cx + 0.44, y + 2.35, cz));
  put(new THREE.BoxGeometry(0.02, 0.22, 0.2), L.iron, T(cx - 0.35, y + 2.35, cz));
  return posts;
}

// ---------------------------------------------------------------- roofs
// The roof, its two gables and (on timber houses) carved bargeboards and a finial at each apex.
function buildRoof(put, begin, { w, d, hd, Jtop, top, look, mats, lean, rnd, hasBarge, framed }) {
  const across = look.ridge !== 'along';
  const R = mats.roof.userData.roofing;
  const thatch = R.tex === 'thatch';
  const over = look.over ?? (thatch ? 0.5 : 0.38);
  const gOver = thatch ? 0.45 : 0.32;
  const depth = d + Jtop, zc = Jtop / 2;
  const H = across ? w / 2 : depth / 2;
  const span = across ? depth : w; // along the ridge, wall to wall
  const L = span + 2 * gOver;
  const t = thatch ? 0.42 : 0.13;
  const sec = roofSection({ H, y0: top, pitch: look.pitch, over, t, kind: thatch ? 'thatch' : 'band' });
  const E = H + over;
  // v climbs the slope from the eaves on both sides (tiles hang the right way up on each), and on
  // thatch one whole repeat spans eaves to ridge so the mossy band of the reed texture caps the ridge.
  const slope = E / Math.cos(look.pitch);
  const vOf = thatch ? (a) => Math.max(0.02, 1 - 0.95 * (Math.abs(a) / E)) : (a) => ((E - Math.abs(a)) / E) * slope / R.tv;
  const geo = sweep(sec.outline, L, { tu: R.tu, tv: R.tv || 2, vOf, crease: thatch ? 60 : 25, capTile: R.tu });
  const turn = across ? 0 : Math.PI / 2;
  const at = (a, y, s) => (across ? [a, y, zc + s] : [s, y, zc - a]); // (across-ridge a, along-ridge s) -> local
  const RM = (x, y, z, rot = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, 1));
  begin('roof', 0, zc);
  put(geo, mats.roof, RM(0, 0, zc, turn), lean);
  // Ridge: half-round ridge tiles on tiles, a stone capping on slate (thatch has its roll).
  if (!thatch) {
    const r = 0.13;
    const prof = [];
    for (let k = 0; k <= 8; k++) { const th = (Math.PI * k) / 8; prof.push([Math.cos(th) * r, sec.ridge - 0.05 + Math.sin(th) * r * 0.8]); }
    const ridge = sweep(prof, L + 0.04, { tu: R.tu, tv: R.tv, caps: true, capTile: R.tu, crease: 80 });
    put(ridge, mats.roof, RM(0, 0, zc, turn), lean);
  }
  // Gables: plaster with a king post and struts on the timber houses, stone on the stone ones.
  const rise = H * Math.tan(look.pitch);
  const wallMat = mats.gable;
  for (const s of [-1, 1]) {
    const [gx, , gz] = at(0, 0, s * span / 2);
    const rot = across ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2;
    begin('gable', gx, gz);
    put(gableGeometry(H - 0.02, rise - 0.02, WALL_DEPTH), wallMat, RM(gx, top, gz, rot), lean);
    if (framed) {
      const g = mats.timber.userData.grain || [2.2, 0.645];
      const f = (x, y, z, rz = 0) => new THREE.Matrix4().multiplyMatrices(RM(gx, top, gz, rot), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1)));
      const post = grainUV(new THREE.BoxGeometry(0.16, rise - 0.2, 0.08), 'y', g);
      put(post, mats.timber, f(0, (rise - 0.2) / 2, 0.02), lean);
      const collarY = rise * 0.42, collarH = H * (1 - 0.42) - 0.12;
      put(grainUV(new THREE.BoxGeometry(2 * collarH, 0.14, 0.08), 'x', g), mats.timber, f(0, collarY, 0.02), lean);
      for (const k of [-1, 1]) {
        const len = Math.hypot(collarH * 0.8, collarY);
        put(grainUV(new THREE.BoxGeometry(0.12, len, 0.08), 'y', g), mats.timber, f(k * collarH * 0.45, collarY / 2, 0.02, k * Math.atan2(collarH * 0.8, collarY)), lean);
      }
    }
  }
  // Carved bargeboards along both rakes of each gable, and a finial at the apex.
  if (hasBarge) {
    const barge = bargeGeometry(E / Math.cos(look.pitch), 0.3, 0.05);
    const g = mats.timber.userData.grain || [2.2, 0.645];
    grainUV(barge, 'x', g);
    for (const s of [-1, 1]) {
      const along = s * (span / 2 + gOver - 0.04);
      for (const k of [-1, 1]) {
        // Board from the eave end (a = k E) up to the apex, its top on the roof's underside.
        const [ex, ey, ez] = at(k * E, sec.under(k * E), along);
        const dirA = [-k * Math.cos(look.pitch), Math.sin(look.pitch)];
        const X = across ? new THREE.Vector3(dirA[0], dirA[1], 0) : new THREE.Vector3(0, dirA[1], -dirA[0]);
        const Yv = across ? new THREE.Vector3(k * Math.sin(look.pitch), Math.cos(look.pitch), 0) : new THREE.Vector3(0, Math.cos(look.pitch), -k * Math.sin(look.pitch));
        const Z = new THREE.Vector3().crossVectors(X, Yv);
        const m = new THREE.Matrix4().makeBasis(X, Yv, Z).setPosition(ex, ey, ez);
        begin('roof', 0, zc);
        put(barge, mats.timber, m, lean);
      }
      const [fx, , fz] = at(0, 0, along);
      put(grainUV(new THREE.BoxGeometry(0.1, 0.95, 0.1), 'y', g), mats.timber, RM(fx, sec.under(0) - 0.4, fz), lean);
      put(new THREE.OctahedronGeometry(0.09, 0), mats.timber, RM(fx, sec.under(0) - 0.9, fz), lean);
    }
  }
  void rnd;
  return { H, L, span, zc, across, ridge: sec.ridge, under: sec.under, topAt: sec.top, over, rise, thick: t, at };
}

// A chimney stack standing through the roof: on the ridge (a big brick stack, the timber houses'
// way) or on a gable end (the stone cottages').
function chimney(put, begin, roof, look, mat, pot, rnd, { lean }) {
  const onGable = look.chimney === 'gable';
  const s = onGable ? (roof.span / 2 - 0.4) * (look.chimneyAt ?? 1) : (look.chimneyAt ?? (rnd() < 0.5 ? -0.3 : 0.35)) * (roof.span / 2 - 1);
  const w = onGable ? 0.9 : 1.1, dd = 0.62;
  const [x, , z] = roof.at(0, 0, s);
  const base = roof.under(0) - 0.8, h = roof.ridge + (onGable ? 0.95 : 1.15) - base;
  begin('chimney', x, z);
  // A gable stack stands broad across the gable; a ridge stack runs along the ridge.
  const turn = onGable === roof.across ? 0 : Math.PI / 2;
  const M = new THREE.Matrix4().compose(new THREE.Vector3(x, base, z), new THREE.Quaternion().setFromAxisAngle(Y, turn), new THREE.Vector3(1, 1, 1));
  for (const p of stackParts(w, dd, h, onGable ? 1 : 2)) put(p.geo, p.part === 'pot' ? pot : mat, M, lean);
}

// Dormers on the front slope of a roof whose eaves face the street: a little gabled face with a
// casement, its cheeks and its own roof in the same roofing.
function dormers(put, begin, roof, look, mats, glass, w, hd, Jtop, n, lean) {
  const R = mats.roof.userData.roofing;
  const face = hd + Jtop - 0.55; // set back from the eaves
  const yBase = roof.under(-(roof.H - 0.55)) - 0.1;
  const Wd = 1.5, Hd = 1.35, back = 1.9;
  const g = mats.timber.userData.grain || [2.2, 0.645];
  const bx = (sx, sy, sz, along) => grainUV(new THREE.BoxGeometry(sx, sy, sz), along, g);
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i - (n - 1) / 2) * Math.min(3.4, (w - 2.2) / (n - 1));
    begin('dormer', x, face);
    const M = (xx, yy, zz) => new THREE.Matrix4().makeTranslation(x + xx, yBase + yy, face + zz);
    // The face: plaster round a small casement.
    const wall = new THREE.Shape([new THREE.Vector2(-Wd / 2, 0), new THREE.Vector2(Wd / 2, 0), new THREE.Vector2(Wd / 2, Hd), new THREE.Vector2(-Wd / 2, Hd)]);
    wall.holes.push(new THREE.Path([new THREE.Vector2(-0.4, 0.35), new THREE.Vector2(-0.4, 1.15), new THREE.Vector2(0.4, 1.15), new THREE.Vector2(0.4, 0.35)]));
    put(new THREE.ExtrudeGeometry(wall, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.12), mats.gable, M(0, 0, 0), lean);
    const pane = new THREE.PlaneGeometry(0.8, 0.8);
    const uv = pane.attributes.uv, p = pane.attributes.position;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 0.5, p.getY(k) / 0.5);
    put(pane, glass, M(0, 0.75, -0.1), lean);
    put(bx(0.9, 0.07, 0.08, 'x'), mats.timber, M(0, 1.15, -0.04), lean);
    put(bx(0.9, 0.07, 0.08, 'x'), mats.timber, M(0, 0.35, -0.04), lean);
    put(bx(0.06, 0.8, 0.08, 'y'), mats.timber, M(0, 0.75, -0.04), lean);
    // Cheeks back into the roof.
    for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.1, Hd, back), mats.gable, M(s * (Wd / 2 - 0.05), Hd / 2, -back / 2), lean);
    // Its own little roof, running back into the main one, and a gable over the face.
    const sec = roofSection({ H: Wd / 2, y0: 0, pitch: look.pitch, over: 0.15, t: 0.1, kind: 'band' });
    put(sweep(sec.outline, back + 0.25, { tu: R.tu, tv: R.tv || 2, capTile: R.tu }), mats.roof, M(0, Hd, -back / 2 + 0.12), lean);
    put(gableGeometry(Wd / 2 - 0.02, (Wd / 2) * Math.tan(look.pitch) - 0.02, 0.12), mats.gable, M(0, Hd, 0), lean);
  }
}

// A door lantern: an iron lamp with glass sides under a pyramid cap, its underside 2.36 m above the
// ground (x, y, z is the foot of the wall under it, rot the wall's facing). On a wall bracket `reach`
// out, or with `hang` (the height of the beam above), on a short chain from a jetty's soffit.
export const LAMP_CLEAR = 2.36;
export function doorLantern(tk, x, y, z, rot, { reach = 0.42, hang = null } = {}) {
  const m = tk.m;
  const s = Math.sin(rot), c = Math.cos(rot);
  const out = hang ? 0 : reach;
  const at = (o) => [x + s * o, z + c * o];
  const y0 = y + LAMP_CLEAR;
  const [lx, lz] = at(out);
  tk.begin('door lantern', lx, lz, false, true);
  tk.put(tk.box(0.2, 0.02, 0.2), m.iron, lx, y0, lz, rot);
  tk.put(tk.box(0.15, 0.2, 0.15), m.glass, lx, y0 + 0.02, lz, rot);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = lx + (a * c + b * s) * 0.085, pz = lz + (-a * s + b * c) * 0.085;
    tk.put(tk.box(0.022, 0.21, 0.022), m.iron, px, y0 + 0.015, pz, rot);
  }
  tk.put(tk.cyl(0.02, 0.15, 0.08, 4), m.iron, lx, y0 + 0.22, lz, rot + Math.PI / 4);
  tk.put(tk.box(0.025, 0.1, 0.025), m.iron, lx, y0 + 0.3, lz, rot);
  if (hang) {
    // The chain up to the soffit.
    tk.put(tk.box(0.02, +(y + hang - (y0 + 0.4)).toFixed(3), 0.02), m.iron, lx, y0 + 0.4, lz, rot);
    return { x: lx, z: lz, wx: x, wz: z, rot, bottom: y0, top: y + hang, hung: true };
  }
  // The bracket: a plate on the wall, an arm out to the lamp and a curling brace under it.
  const [wx, wz] = at(0.015);
  tk.put(tk.box(0.08, 0.36, 0.03), m.iron, wx, y0 + 0.12, wz, rot);
  const [ax, az] = at((reach + 0.03) / 2);
  tk.put(tk.box(0.035, 0.04, reach + 0.03), m.iron, ax, y0 + 0.4, az, rot);
  const bl = Math.hypot(reach * 0.62, 0.26);
  tk.put(tk.box(0.025, bl, 0.025), m.iron, wx, y0 + 0.14, wz, rot, 1, 1, 1, Math.atan2(reach * 0.62, 0.26), 0);
  return { x: lx, z: lz, wx: x, wz: z, rot, bottom: y0, top: y0 + 0.48, hung: false };
}

export function rng(seed) {
  let a = seed | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
