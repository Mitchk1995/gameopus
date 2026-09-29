import * as M from '../../src/world/map.js';
const arg = process.argv.slice(2);
// node scan.mjs x0 z0 x1 z1 [n]  -> surface0 heights along the line
const [x0, z0, x1, z1] = arg.map(Number), n = +(arg[4] || 24);
const row = [];
for (let i = 0; i <= n; i++) {
  const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
  row.push(`(${x.toFixed(0)},${z.toFixed(0)}):${M.surface0(x, z).toFixed(0)}`);
}
console.log(row.join(' '));
