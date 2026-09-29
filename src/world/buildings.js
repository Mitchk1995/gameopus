import * as THREE from 'three';
import { OPENING, DOOR_CLEAR } from './doors.js';

// Houses assembled from the Medieval Village kit on its 2 m grid. A building is
// described by its footprint, storeys, style and which walls have doors; this turns
// that into kit pieces (walls, windows, shutters, doors, corner posts, gables, roof,
// chimney) and into collision boxes, leaving the doorways open.
//
// Local frame: origin at the centre of the footprint on the ground floor, +z is the
// front. Kit walls face their exterior along +z.
//
// Windows follow how real houses are laid out rather than a dice roll per bay: each wall is
// a row of 2 m bays, and windows go in every other bay, mirrored about the door where there
// is one (the bays either side of it), the same bays on every floor so they stack in
// columns. A wall without a door gets its middle bay (or pair). Short walls (two bays) get
// none unless they carry the door. Shutters are the exception, not the rule: a house has
// none, or closed ones, or (when the bays around are free) folded-back ones, on its front
// wall only, all alike so the wall stays symmetrical.

export const STOREY = 3.0;
const WALL_T = 0.41, WALL_Z = -0.105; // thickness, and where the wall's middle sits
const JAMB_HALF = 0.19; // half-width of the wall beside a door (the opening itself is OPENING.half wide)

const STYLES = {
  plaster: {
    ground: { prefix: 'Wall_Plaster', plain: ['Wall_Plaster_Straight_Base'] },
    upper: { prefix: 'Wall_Plaster', plain: ['Wall_Plaster_Straight'] },
    corner: 'Corner_Exterior_Wood',
  },
  stone: {
    ground: { prefix: 'Wall_UnevenBrick', plain: ['Wall_UnevenBrick_Straight'] },
    upper: { prefix: 'Wall_Plaster', plain: ['Wall_Plaster_Straight'] },
    corner: 'Corner_Exterior_Brick',
  },
};
const WINDOW_INSERT = {
  Wide_Round: ['Window_Wide_Round1', 'WindowShutters_Wide_Round_Open', 'WindowShutters_Wide_Round_Closed'],
  Wide_Flat: ['Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Open', 'WindowShutters_Wide_Flat_Closed'],
  Thin_Round: ['Window_Thin_Round1', 'WindowShutters_Thin_Round_Open', 'WindowShutters_Thin_Round_Closed'],
};
// Corner posts wrap the corner: the brick one is an L, so each corner turns it (front-right as authored).
const CORNER_TURN = { '1,1': 0, '-1,1': Math.PI / 2, '-1,-1': Math.PI, '1,-1': -Math.PI / 2 };

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

// spec: { x, z, rot, w, d, floors, style, doors: [{ side: 's'|'n'|'e'|'w', at: index, open (public), shape, leaf }],
//         seed, chimney, windows (0 for none), shutters ('none'|'closed'|'open'), open (walls left off, for workshops) }
export function buildHouse(kit, batch, colliders, spec, groundY) {
  const style = STYLES[spec.style || 'plaster'];
  const floors = spec.floors || 1;
  const rnd = rng(spec.seed ?? Math.round(spec.x * 13 + spec.z * 7));
  const yaw = spec.rot || 0;
  const world = new THREE.Matrix4().compose(new THREE.Vector3(spec.x, groundY, spec.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const parts = [];
  const place = (name, lx, ly, lz, rot = 0, meta = {}) => {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    parts.push({ name, lx, ly, lz, rot, ...meta });
    batch.add(name, new THREE.Matrix4().multiplyMatrices(world, local), meta);
  };
  const hw = spec.w / 2, hd = spec.d / 2;
  const doors = spec.doors || [];
  const sides = [
    // side, pieces along it, wall rotation, piece centre for index i
    ['s', spec.w / 2, 0, (i) => [-hw + 1 + i * 2, hd]],
    ['n', spec.w / 2, Math.PI, (i) => [hw - 1 - i * 2, -hd]],
    ['e', spec.d / 2, Math.PI / 2, (i) => [hw, hd - 1 - i * 2]],
    ['w', spec.d / 2, -Math.PI / 2, (i) => [-hw, -hd + 1 + i * 2]],
  ];

  // The look of this house: one kind of window, and how (if at all) it is shuttered.
  const roll = rnd();
  const kind = spec.windowKind || (roll < 0.62 ? 'Wide_Round' : roll < 0.9 ? 'Wide_Flat' : 'Thin_Round');
  const publicHouse = doors.some((d) => d.open);
  const r2 = rnd();
  const shutters = spec.shutters || (publicHouse ? 'none' : r2 < 0.4 ? 'none' : r2 < 0.7 ? 'closed' : 'open');
  const upperPlain = pick(style.upper.plain, rnd);

  const openings = [];
  const windows = [];
  for (const [side, n, rot, at] of sides) {
    if (spec.open?.includes(side)) continue;
    const doorBay = doors.find((d) => d.side === side)?.at ?? -1;
    const bays = spec.windows === 0 ? [] : windowBays(n, doorBay);
    // Open shutters need free bays either side (and a bay's width to fold into); else closed.
    const crowded = bays.some((i) => i === 0 || i === n - 1 || Math.abs(i - doorBay) === 1);
    const wallShutters = side === 's' ? (shutters === 'open' && crowded ? 'closed' : shutters) : 'none';
    for (let f = 0; f < floors; f++)
      for (let i = 0; i < n; i++) {
        const [lx, lz] = at(i);
        const y = f * STOREY;
        const door = f === 0 && doors.find((d) => d.side === side && d.at === i);
        const group = f === 0 ? style.ground : style.upper;
        const meta = { side, floor: f, bay: i, n };
        if (door) {
          const shape = door.shape === 'flat' ? 'Flat' : 'Round';
          place(`${group.prefix}_Door_${shape}`, lx, y, lz, rot, { ...meta, role: 'door-wall' });
          openings.push({ side, i, lx, lz, rot, door, shape });
        } else if (bays.includes(i)) {
          place(`${group.prefix}_Window_${kind}`, lx, y, lz, rot, { ...meta, role: 'window-wall', kind });
          const [glass, open, closed] = WINDOW_INSERT[kind];
          place(glass, lx, y, lz, rot, { ...meta, role: 'glass' });
          let shutter = null;
          if (wallShutters === 'open') shutter = open;
          else if (wallShutters === 'closed') shutter = closed;
          if (shutter) place(shutter, lx, y, lz, rot, { ...meta, role: 'shutters', mode: wallShutters });
          windows.push({ side, floor: f, bay: i, n, kind, shutters: wallShutters });
        } else {
          place(f === 0 ? pick(group.plain, rnd) : upperPlain, lx, y, lz, rot, { ...meta, role: 'wall' });
        }
      }
  }
  // Corner posts.
  if (!spec.open?.length)
    for (const [cx, cz] of [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]])
      for (let f = 0; f < floors; f++) place(style.corner, cx, f * STOREY, cz, CORNER_TURN[`${Math.sign(cx)},${Math.sign(cz)}`], { role: 'corner', floor: f });

  // Roof: tiled, ridge running front to back, with framed gables at both ends.
  const top = floors * STOREY + 0.12;
  const roof = `Roof_RoundTiles_${spec.w}x${spec.d}`;
  if (kit.has(roof)) place(roof, 0, top, 0, 0, { role: 'roof' });
  const gable = `Roof_Front_Brick${spec.w}`;
  if (kit.has(gable)) {
    place(gable, 0, top, hd, 0, { role: 'gable' });
    place(gable, 0, top, -hd, Math.PI, { role: 'gable' });
  }
  if (spec.chimney) {
    // Set into the roof: its foot below the lowest roof line under it, its cap well above the highest.
    const name = spec.chimney === 2 ? 'Prop_Chimney2' : 'Prop_Chimney';
    const cx = hw - 1.3, cz = -hd + 1.6;
    let lo = Infinity;
    if (kit.has(roof)) for (const [ox, oz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4], [0, 0]]) lo = Math.min(lo, top + kit.topAt(roof, cx + ox, cz + oz));
    if (!Number.isFinite(lo)) lo = top + 1.5;
    place(name, cx, lo - 0.3, cz, 0, { role: 'chimney' });
  }

  // Collision: one box per wall segment, split around doorways.
  const doorDefs = [];
  if (colliders) {
    const h = floors * STOREY + 2;
    const add = (lx, lz, hx, hz) => {
      const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(world);
      colliders.addBox(v.x, v.z, hx, hz, yaw, groundY - 1, groundY + h);
    };
    for (const [side, n, rot, at] of sides) {
      if (spec.open?.includes(side)) continue;
      const horiz = side === 's' || side === 'n';
      for (let i = 0; i < n; i++) {
        const [lx, lz] = at(i);
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
          doorDefs.push({ x: local.x, z: local.z, yaw: yaw + rot, y: groundY, shape: opening.shape, leaf: opening.door.leaf || 1, public: !!opening.door.open, side, bay: i });
        }
      }
    }
    // The roof: from the top of the walls up, over the whole footprint, so the camera
    // can't climb through the ceiling or roof from inside (or drop through it from above).
    const roofSlab = colliders.addBox(spec.x, spec.z, hw + 0.2, hd + 0.2, yaw, groundY + floors * STOREY - 0.05, groundY + floors * STOREY + 6);
    roofSlab.cameraOnly = true;
  }
  const info = { world, top, openings, doors: doorDefs, parts, windows, look: { kind, shutters }, spec: { x: spec.x, z: spec.z, rot: yaw, w: spec.w, d: spec.d, floors, groundY, style: spec.style || 'plaster', roof, open: spec.open || [] } };
  if (colliders) (colliders.buildings ??= []).push(info);
  return info;
}

function pick(list, rnd) {
  return list[Math.floor(rnd() * list.length)];
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
