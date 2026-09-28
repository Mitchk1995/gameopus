// Dungeon layouts on a grid of 2 m cells. Rooms come in several shapes (halls,
// L-shapes, crosses, pillared chambers and cellular-automaton caverns), placed without
// overlap, joined by a spanning tree of wide corridors plus a few extra links so there
// are loops. The start and the boss room are the two rooms farthest apart.

export const CELL = 2;

export function generate(seed, { size = 56, rooms: wanted = 9 } = {}) {
  const rnd = rng(seed);
  const grid = new Uint8Array(size * size); // 0 solid, 1 floor
  const idx = (x, y) => y * size + x;
  const rooms = [];

  const shapes = ['hall', 'hall', 'L', 'cross', 'pillars', 'cavern', 'cavern'];
  for (let tries = 0; tries < 400 && rooms.length < wanted; tries++) {
    const shape = rooms.length === 0 ? 'hall' : shapes[Math.floor(rnd() * shapes.length)];
    const w = 6 + Math.floor(rnd() * (shape === 'cavern' ? 7 : 5)), h = 6 + Math.floor(rnd() * (shape === 'cavern' ? 7 : 5));
    const x = 2 + Math.floor(rnd() * (size - w - 4)), y = 2 + Math.floor(rnd() * (size - h - 4));
    // Keep a gap of two cells between rooms.
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    const mask = roomMask(shape, w, h, rnd);
    if (!mask) continue;
    const room = { x, y, w, h, shape, cells: [], id: rooms.length };
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (mask[j * w + i]) {
          grid[idx(x + i, y + j)] = 1;
          room.cells.push([x + i, y + j]);
        }
    // Centre: the room cell nearest the middle of its box.
    const mx = x + w / 2, my = y + h / 2;
    room.c = room.cells.reduce((b, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(b[0] - mx, b[1] - my) ? c : b));
    rooms.push(room);
  }

  // Connect: minimum spanning tree over room centres, plus a few extra edges.
  const edges = [];
  for (let a = 0; a < rooms.length; a++)
    for (let b = a + 1; b < rooms.length; b++) edges.push([Math.hypot(rooms[a].c[0] - rooms[b].c[0], rooms[a].c[1] - rooms[b].c[1]), a, b]);
  edges.sort((p, q) => p[0] - q[0]);
  const parent = rooms.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const links = [];
  for (const [d, a, b] of edges) {
    if (find(a) !== find(b)) {
      parent[find(a)] = find(b);
      links.push([a, b]);
    } else if (rnd() < 0.12 && d < size * 0.45) links.push([a, b]);
  }
  for (const [a, b] of links) carveCorridor(grid, size, rooms[a].c, rooms[b].c, rnd);

  // Start and boss: the pair of rooms farthest apart by walking distance.
  const dist = (from) => bfs(grid, size, from);
  const d0 = dist(rooms[0].c);
  let far = rooms[0];
  for (const r of rooms) if (d0[idx(...r.c)] > d0[idx(...far.c)]) far = r;
  const dFar = dist(far.c);
  let start = far;
  for (const r of rooms) if (dFar[idx(...r.c)] > dFar[idx(...start.c)]) start = r;
  const boss = far;
  start.role = 'start';
  boss.role = 'boss';
  const fromStart = dist(start.c);
  for (const r of rooms) r.depth = fromStart[idx(...r.c)];

  return { size, grid, rooms, start, boss, seed };
}

function roomMask(shape, w, h, rnd) {
  const m = new Uint8Array(w * h);
  const set = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (m[y * w + x] = 1);
  if (shape === 'hall' || shape === 'pillars') {
    m.fill(1);
    // Knock the corners off some halls.
    if (rnd() < 0.5) for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) m[y * w + x] = 0;
  } else if (shape === 'L') {
    const cw = Math.floor(w * (0.4 + rnd() * 0.2)), ch = Math.floor(h * (0.4 + rnd() * 0.2));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!(x >= cw && y >= ch)) set(x, y);
  } else if (shape === 'cross') {
    const bw = Math.max(3, Math.floor(w * 0.45)), bh = Math.max(3, Math.floor(h * 0.45));
    const x0 = Math.floor((w - bw) / 2), y0 = Math.floor((h - bh) / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x >= x0 && x < x0 + bw) || (y >= y0 && y < y0 + bh)) set(x, y);
  } else if (shape === 'cavern') {
    // Cellular automaton: random fill, a few smoothing passes, keep the biggest blob.
    for (let i = 0; i < m.length; i++) m[i] = rnd() < 0.58 ? 1 : 0;
    for (let pass = 0; pass < 4; pass++) {
      const n = new Uint8Array(m);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && m[(y + dy) * w + (x + dx)] && x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h) c++;
          n[y * w + x] = c >= 5 || (m[y * w + x] && c >= 4) ? 1 : 0;
        }
      m.set(n);
    }
    // Largest connected blob only.
    const seen = new Int16Array(m.length).fill(-1);
    let best = -1, bestN = 0, label = 0;
    for (let i = 0; i < m.length; i++) {
      if (!m[i] || seen[i] >= 0) continue;
      let n = 0;
      const stack = [i];
      seen[i] = label;
      while (stack.length) {
        const k = stack.pop();
        n++;
        const x = k % w, y = (k / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = ny * w + nx;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[nk] && seen[nk] < 0) {
            seen[nk] = label;
            stack.push(nk);
          }
        }
      }
      if (n > bestN) {
        bestN = n;
        best = label;
      }
      label++;
    }
    if (bestN < w * h * 0.35) return null;
    for (let i = 0; i < m.length; i++) m[i] = seen[i] === best ? 1 : 0;
  }
  return m;
}

// Corridors are two cells wide and bend once, with the odd wiggle.
function carveCorridor(grid, size, a, b, rnd) {
  const set = (x, y) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1) grid[ny * size + nx] = 1;
    }
  };
  let [x, y] = a;
  const horizontalFirst = rnd() < 0.5;
  const walk = (tx, ty, axis) => {
    while (axis === 'x' ? x !== tx : y !== ty) {
      if (axis === 'x') x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      set(x, y);
    }
  };
  if (horizontalFirst) {
    walk(b[0], y, 'x');
    walk(x, b[1], 'y');
  } else {
    walk(x, b[1], 'y');
    walk(b[0], y, 'x');
  }
}

export function bfs(grid, size, from) {
  const d = new Int32Array(size * size).fill(-1);
  const q = [from[1] * size + from[0]];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % size, y = (k / size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = (y + dy) * size + (x + dx);
      if (grid[nk] && d[nk] < 0) {
        d[nk] = d[k] + 1;
        q.push(nk);
      }
    }
  }
  return d;
}

function rng(seed) {
  let a = seed | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { rng };
