// First complete household of the approved open lakeside village direction.
// Coordinates are metres; the Blender house faces +Z (toward the lake).
export const LAKESIDE_HOME = {
  id: 'rowan', name: 'Rowan and Elin\'s cottage',
  x: -75, z: 150, y: 3.35, rot: 0, width: 8, depth: 7,
  garden: { x: -82.5, z: 155.8, width: 4.5, depth: 4 },
  path: [[-75, 155.1], [-73.5, 158.5], [-66, 160], [-58, 163.5], [-49.5, 167.5]],
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function homePoint(x, z) {
  const h = LAKESIDE_HOME, c = Math.cos(h.rot), s = Math.sin(h.rot);
  return { x: h.x + x * c + z * s, z: h.z - x * s + z * c };
}

function footprintDistance(x, z) {
  const h = LAKESIDE_HOME;
  return Math.max(Math.abs(x - h.x) - 4.7, Math.abs(z - h.z - 0.8) - 5.1);
}

function gardenDistance(x, z) {
  const g = LAKESIDE_HOME.garden;
  return Math.max(Math.abs(x - g.x) - g.width / 2, Math.abs(z - g.z) - g.depth / 2);
}

export function homePathDistance(x, z) {
  const p = LAKESIDE_HOME.path;
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export function homeGrade(height, x, z) {
  const weight = smooth(3.5, 0, Math.min(footprintDistance(x, z), gardenDistance(x, z)));
  return height + (LAKESIDE_HOME.y - 0.09 - height) * weight;
}

export function homeGround(x, z) {
  return Math.max(smooth(0.9, 0.15, Math.min(footprintDistance(x, z), gardenDistance(x, z))), smooth(1.7, 0.75, homePathDistance(x, z)));
}

export function homeClearance(x, z) {
  return Math.min(footprintDistance(x, z) - 1.2, homePathDistance(x, z) - 2, gardenDistance(x, z) - 1);
}

// Keep the small front lawn open so a low crown cannot conceal the house from
// its approach. Trees behind the garden and along the lake remain in place.
export function homeTreeClearance(x, z) {
  return Math.hypot(x - LAKESIDE_HOME.x + 1, z - LAKESIDE_HOME.z - 10) - 8;
}
