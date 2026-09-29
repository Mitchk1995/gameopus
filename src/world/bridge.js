import { BRIDGE } from './map.js';
import { frame } from './sitekit.js';

// The stone bridge on Bridge Street: one segmental arch over the river, a gently humped deck you
// can walk (and jump) on, low stone kerbs with a timber rail above them, and a lamp at each end.
// It is built to fit the river as baked: the water's width where the road crosses sets the span.
export function buildBridge(sk) {
  const w = sk.world;
  const { m } = sk;
  // Find the water's edges along the road axis.
  let xa = BRIDGE.x, xb = BRIDGE.x;
  for (let x = BRIDGE.x; x > BRIDGE.x - 40; x -= 0.25) { if (w.heightAt(x, BRIDGE.z) > 0.15) break; xa = x; }
  for (let x = BRIDGE.x; x < BRIDGE.x + 40; x += 0.25) { if (w.heightAt(x, BRIDGE.z) > 0.15) break; xb = x; }
  const cx = (xa + xb) / 2, water = xb - xa;
  const L = Math.ceil(water + 12), half = L / 2;      // the whole bridge, abutments included
  const f = frame(cx, BRIDGE.z, 0);
  const yA = w.heightAt(cx - half - 1.5, BRIDGE.z), yB = w.heightAt(cx + half + 1.5, BRIDGE.z);
  const rise = 0.9;
  const deckY = (u) => yA + (yB - yA) * ((u + half) / L) + rise * (1 - Math.pow(u / half, 2));
  // The arch: springing just above the water, crown a good metre under the deck.
  const a = water / 2 + 1.2, ys = 0.85, crown = deckY(0) - 1.15;
  const R = (a * a + (crown - ys) * (crown - ys)) / (2 * (crown - ys));
  const yc = crown - R;
  const soffit = (u) => (Math.abs(u) <= a + 1e-6 ? yc + Math.sqrt(Math.max(0, R * R - u * u)) : -Infinity);
  const yb0 = -4.2;
  const WIDTH = 5.6;

  sk.begin('bridge', cx, BRIDGE.z);
  // Body: an extruded side elevation with the arch left out from underneath.
  const top = [];
  const N = Math.round(L / 0.5);
  for (let i = 0; i <= N; i++) { const u = -half + (L * i) / N; top.push([u, deckY(u)]); }
  const arch = [];
  for (let i = 0; i <= 24; i++) { const u = a - ((2 * a) * i) / 24; arch.push([u, soffit(u)]); }
  const pts = [[-half, yb0], ...top, [half, yb0], [a, yb0], ...arch, [-a, yb0]];
  sk.profile(f, 0, 0, 0, pts, WIDTH, m.stone);
  // Kerbs along both edges, with a cap stone.
  for (const s of [-1, 1]) {
    const kz = s * (WIDTH / 2 - 0.25);
    const kerb = [], kerbTop = [];
    for (let i = 0; i <= N; i++) { const u = -half + (L * i) / N; kerb.push([u, deckY(u) - 0.02]); kerbTop.push([u, deckY(u) + 0.5]); }
    sk.profile(f, 0, kz, 0, [...kerb, ...kerbTop.reverse()], 0.5, m.rock);
    // Timber posts and two rails above the kerb, a post every two metres.
    for (let u = -half + 0.5; u <= half - 0.4; u += 2) {
      const y = deckY(u) + 0.48;
      const [x, z] = f.at(u, kz);
      sk.put(sk.box(0.16, 1.0, 0.16), m.wood, x, y, z, 0);
    }
    for (const rh of [0.55, 0.95]) {
      const seg = 2.0;
      for (let u = -half + 0.5; u < half - 0.5; u += seg) {
        const u2 = Math.min(u + seg, half - 0.5);
        const [x0, z0] = f.at(u, kz), [x1, z1] = f.at(u2, kz);
        const y0 = deckY(u) + 0.5 + rh, y1 = deckY(u2) + 0.5 + rh;
        const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0), pitch = Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
        sk.put(sk.box(len, 0.1, 0.1), m.wood, (x0 + x1) / 2, (y0 + y1) / 2 - 0.05, (z0 + z1) / 2, 0, 1, 1, 1, 0, pitch);
      }
    }
  }
  // Colliders: the deck in one-metre slabs (each standable, following the hump and hanging under
  // the arch only where the stone is), kerbs you can hop onto, and a rail nobody can climb.
  const Lm = Math.ceil(L);
  for (let i = 0; i < Lm; i++) {
    const u = -half + (L * (i + 0.5)) / Lm, len = L / Lm;
    // A slab reaching past the springing covers the abutment's face down to the foot as well.
    const sa = soffit(u - len / 2), sb = soffit(u + len / 2);
    const y1 = deckY(u), y0 = Number.isFinite(sa) && Number.isFinite(sb) ? Math.min(sa, sb) - 0.2 : yb0;
    const [x, z] = f.at(u, 0);
    const sh = sk.colliders.addBox(x, z, len / 2 + 0.01, WIDTH / 2, 0, y0, y1);
    sh.floor = true;
    for (const s of [-1, 1]) {
      const kz = s * (WIDTH / 2 - 0.25);
      const [kx, kzw] = f.at(u, kz);
      const kerb = sk.colliders.addBox(kx, kzw, len / 2 + 0.01, 0.25, 0, y1 - 0.1, y1 + 0.5);
      kerb.floor = true;
      kerb.noCamera = true;
      const rail = sk.colliders.addBox(kx, kzw, len / 2 + 0.01, 0.08, 0, y1 + 0.5, y1 + 1.85);
      rail.noCamera = true;
    }
  }
  bridgeLamps(sk, f, half, WIDTH, deckY);
  return { x: cx, z: BRIDGE.z, length: L, width: WIDTH, half, deckY, xa, xb, yA, yB, span: water };
}

function bridgeLamps(sk, f, half, width, deckY) {
  // A lamp post on each corner, standing on the ground just off the ends of the kerbs.
  for (const sx of [-1, 1]) for (const s of [-1, 1]) {
    const [x, z] = f.at(sx * (half + 0.9), s * (width / 2 + 0.2));
    sk.lamp(x, z, sk.ground(x, z));
  }
}
