import * as THREE from 'three';

// Houses assembled from the Medieval Village kit on its 2 m grid. A building is
// described by its footprint, storeys, style and which walls have doors; this turns
// that into kit pieces (walls, windows, shutters, doors, corner posts, gables, roof,
// chimney) and into collision boxes, leaving the doorways open.
//
// Local frame: origin at the centre of the footprint on the ground floor, +z is the
// front. Kit walls face their exterior along +z.

export const STOREY = 3.0;
const WALL_T = 0.41, WALL_Z = -0.105; // thickness, and where the wall's middle sits

const STYLES = {
  plaster: {
    plain: ['Wall_Plaster_Straight_Base', 'Wall_Plaster_Straight'],
    upper: ['Wall_Plaster_WoodGrid', 'Wall_Plaster_Straight', 'Wall_Plaster_Straight_Base'],
    window: ['Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Window_Wide_Flat', 'Wall_Plaster_Window_Thin_Round'],
    door: { round: 'Wall_Plaster_Door_Round', flat: 'Wall_Plaster_Door_Flat' },
    corner: 'Corner_Exterior_Wood',
  },
  stone: {
    plain: ['Wall_UnevenBrick_Straight'],
    upper: ['Wall_Plaster_WoodGrid', 'Wall_Plaster_Straight'],
    window: ['Wall_UnevenBrick_Window_Wide_Round', 'Wall_UnevenBrick_Window_Wide_Flat', 'Wall_UnevenBrick_Window_Thin_Round'],
    door: { round: 'Wall_UnevenBrick_Door_Round', flat: 'Wall_UnevenBrick_Door_Flat' },
    corner: 'Corner_Exterior_Brick',
  },
};
const WINDOW_INSERT = {
  Window_Wide_Round: ['Window_Wide_Round1', 'WindowShutters_Wide_Round_Open', 'WindowShutters_Wide_Round_Closed'],
  Window_Wide_Flat: ['Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Open', 'WindowShutters_Wide_Flat_Closed'],
  Window_Thin_Round: ['Window_Thin_Round1', 'WindowShutters_Thin_Round_Open', 'WindowShutters_Thin_Round_Closed'],
};

// spec: { x, z, rot, w, d, floors, style, doors: [{ side: 's'|'n'|'e'|'w', at: index, open }],
//         seed, chimney, windows (0..1), open (walls left off, for workshops) }
export function buildHouse(kit, batch, colliders, spec, groundY) {
  const style = STYLES[spec.style || 'plaster'];
  const floors = spec.floors || 1;
  const rnd = rng(spec.seed ?? Math.round(spec.x * 13 + spec.z * 7));
  const world = new THREE.Matrix4().compose(new THREE.Vector3(spec.x, groundY, spec.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.rot || 0), new THREE.Vector3(1, 1, 1));
  const place = (name, lx, ly, lz, rot = 0) => {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    batch.add(name, new THREE.Matrix4().multiplyMatrices(world, local));
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
  const openings = [];
  for (const [side, n, rot, at] of sides) {
    if (spec.open?.includes(side)) continue;
    for (let f = 0; f < floors; f++)
      for (let i = 0; i < n; i++) {
        const [lx, lz] = at(i);
        const y = f * STOREY;
        const door = f === 0 && doors.find((d) => d.side === side && d.at === i);
        let name;
        if (door) name = style.door[door.shape || 'round'];
        else if (rnd() < (spec.windows ?? 0.5) && !(f === 0 && n > 2 && (i === 0 || i === n - 1) && rnd() < 0.5)) name = pick(style.window, rnd);
        else name = f === 0 ? pick(style.plain, rnd) : pick(style.upper, rnd);
        if (f > 0 && spec.style === 'stone' && !door && name.startsWith('Wall_UnevenBrick_Window')) name = name.replace('UnevenBrick', 'Plaster');
        place(name, lx, y, lz, rot);
        const kind = Object.keys(WINDOW_INSERT).find((k) => name.endsWith(k));
        if (kind) {
          const [glass, open, closed] = WINDOW_INSERT[kind];
          place(glass, lx, y, lz, rot);
          const r = rnd();
          if (r < 0.45) place(open, lx, y, lz, rot);
          else if (r < 0.6) place(closed, lx, y, lz, rot);
        }
        if (door) {
          openings.push({ side, i, lx, lz, rot, door });
          // The door leaf hinges at its left edge; swung open it stands against the wall inside.
          const shape = door.shape === 'flat' ? 'Flat' : 'Round';
          const leaf = `Door_${door.leaf || 1}_${shape}`;
          if (!door.open) place(leaf, lx + Math.cos(rot) * -0.56 + Math.sin(rot) * WALL_Z, 0, lz - Math.sin(rot) * -0.56 + Math.cos(rot) * WALL_Z, rot);
        }
      }
  }
  // Corner posts.
  if (!spec.open?.length)
    for (const [cx, cz] of [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]])
      for (let f = 0; f < floors; f++) place(style.corner, cx + Math.sign(cx) * 0.0, f * STOREY, cz, 0);

  // Roof: tiled, ridge running front to back, with framed gables at both ends.
  const top = floors * STOREY + 0.12;
  const roof = `Roof_RoundTiles_${spec.w}x${spec.d}`;
  if (kit.has(roof)) place(roof, 0, top, 0, 0);
  const gable = `Roof_Front_Brick${spec.w}`;
  if (kit.has(gable)) {
    place(gable, 0, top, hd, 0);
    place(gable, 0, top, -hd, Math.PI);
  }
  if (spec.chimney) place(spec.chimney === 2 ? 'Prop_Chimney2' : 'Prop_Chimney', hw - 1.3, top + 0.4, -hd + 1.6, 0);

  // Collision: one box per wall segment, split around doorways.
  if (colliders) {
    const h = floors * STOREY + 2;
    const add = (lx, lz, hx, hz) => {
      const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(world);
      colliders.addBox(v.x, v.z, hx, hz, spec.rot || 0, groundY - 1, groundY + h);
    };
    for (const [side, n, , at] of sides) {
      if (spec.open?.includes(side)) continue;
      const horiz = side === 's' || side === 'n';
      for (let i = 0; i < n; i++) {
        const [lx, lz] = at(i);
        const inset = side === 's' || side === 'e' ? WALL_Z : -WALL_Z;
        const cx = horiz ? lx : lx + inset, cz = horiz ? lz + inset : lz;
        const hasDoor = openings.some((o) => o.side === side && o.i === i);
        if (!hasDoor) {
          add(cx, cz, horiz ? 1.02 : WALL_T / 2, horiz ? WALL_T / 2 : 1.02);
        } else {
          // Jambs either side of a 1.1 m opening.
          for (const s of [-1, 1]) {
            const ox = horiz ? cx + s * 0.78 : cx, oz = horiz ? cz : cz + s * 0.78;
            add(ox, oz, horiz ? 0.24 : WALL_T / 2, horiz ? WALL_T / 2 : 0.24);
          }
        }
      }
    }
  }
  return { world, top, openings };
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
