// Prints the terrain along radial lines (height and slope), and road profiles with their grades.
import * as M from '../../src/world/map.js';
const lines = [['north', 0, -1, -40], ['east', 1, 0, 40], ['south', 0, 1, 20], ['west', -1, 0, 0], ['NE', 0.7, -0.7, 0]];
for (const [name, dx, dz, off] of lines) {
  const row = [];
  for (let r = 180; r <= 400; r += 10) {
    const x = dx * r + (dx === 0 ? off : 0), z = dz * r + (dz === 0 ? off : 0);
    const h = M.heightAt(x, z), g = Math.hypot(M.heightAt(x + 0.5, z) - M.heightAt(x - 0.5, z), M.heightAt(x, z + 0.5) - M.heightAt(x, z - 0.5));
    row.push(`${r}:${h.toFixed(0)}/${g.toFixed(1)}`);
  }
  console.log(name.padEnd(6), row.join(' '));
}
for (const r of M.ROADS) {
  const p = (M.ROADS.find((q) => q.id === r.id)).prof;
  if (!p) continue;
  let maxg = 0, len = 0;
  for (let i = 0; i < p.n - 1; i++) { const g = Math.abs(p.ys[i + 1] - p.ys[i]) / p.ds; maxg = Math.max(maxg, g); len += p.ds; }
  console.log(r.id.padEnd(12), 'len', len.toFixed(0), 'y', p.ys[0].toFixed(1), '->', p.ys[p.n - 1].toFixed(1), 'max grade', maxg.toFixed(3));
}
