// How far each road's profile strays from the land it crosses (pits and berms), and its grades.
import * as M from '../../src/world/map.js';
M.heightAt(0, 0); // builds the profiles
for (const r of M.ROADS) {
  const p = r.prof;
  let worst = 0, at = null, maxg = 0, len = 0;
  const notes = [];
  for (let i = 0; i < p.n; i++) {
    const s = M.surface0(p.xs[i], p.zs[i]);
    const dev = p.ys[i] - s;
    if (Math.abs(dev) > Math.abs(worst)) { worst = dev; at = [p.xs[i], p.zs[i]]; }
    if (i < p.n - 1) { maxg = Math.max(maxg, Math.abs(p.ys[i + 1] - p.ys[i]) / p.ds); len += p.ds; }
  }
  console.log(r.id.padEnd(11), 'len', String(len.toFixed(0)).padStart(4), 'y', p.ys[0].toFixed(1).padStart(5), '->', p.ys[p.n - 1].toFixed(1).padStart(5), 'grade', maxg.toFixed(2), 'worst dev', worst.toFixed(1), at ? '@' + at.map((v) => v.toFixed(0)).join(',') : '');
}
