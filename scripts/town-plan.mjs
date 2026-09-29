// Draws the Ashford layout (src/world/ashford.js) as a top-down plan, for design review.
//   node scripts/town-plan.mjs [out.png]      (default docs/town/plan.png)
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import * as A from '../src/world/ashford.js';

const out = path.resolve(process.argv[2] || 'docs/town/plan.png');
const S = 10; // pixels per metre
const X0 = -66, Z0 = -40, W = 116, Hh = 120;
const px = (x) => ((x - X0) * S).toFixed(1), pz = (z) => ((z - Z0) * S).toFixed(1);
const poly = (pts, attrs) => `<polygon points="${pts.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" ${attrs}/>`;
const line = (pts, w, col, extra = '') => `<polyline points="${pts.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${w * S}" stroke-linecap="butt" stroke-linejoin="round" ${extra}/>`;
const el = [];
el.push(`<rect width="100%" height="100%" fill="#8fa35a"/>`);
el.push(poly(A.OUTLINE, 'fill="#9db266" stroke="none"'));
for (const g of A.PLOTS || []) el.push(`<rect x="${px(g.x0)}" y="${pz(g.z0)}" width="${(g.x1 - g.x0) * S}" height="${(g.z1 - g.z0) * S}" fill="#7f9a4a" stroke="#6b4a2f" stroke-width="2"/>`);
for (const s of A.STREETS) el.push(line(s.pts, s.w, s.paved ? '#c9bfa8' : '#b39b74'));
const r = A.SQUARE;
el.push(`<rect x="${px(r.x0)}" y="${pz(r.z0)}" width="${(r.x1 - r.x0) * S}" height="${(r.z1 - r.z0) * S}" fill="#c9bfa8"/>`);
for (const y of A.YARDS || []) el.push(`<rect x="${px(y.x0)}" y="${pz(y.z0)}" width="${(y.x1 - y.x0) * S}" height="${(y.z1 - y.z0) * S}" fill="${y.paved ? '#c9bfa8' : '#b39b74'}"/>`);
for (const w of A.WALLS || []) el.push(line([w.a, w.b], w.kind === 'stone' ? 0.6 : w.kind === 'hedge' ? 1.2 : 0.25, w.kind === 'stone' ? '#55524d' : w.kind === 'hedge' ? '#2f5a26' : '#6b4a2f'));
for (const b of A.BUILDINGS) {
  const col = A.PUBLIC.includes(b.id) ? '#c8553a' : b.role === 'chapel' || b.role === 'tower' ? '#6a6d78' : '#b98564';
  el.push(poly(A.footprint(b), `fill="${col}" stroke="#2b1c14" stroke-width="1.5"`));
  const [fx, fz] = [b.x + Math.sin(b.rot) * (b.d / 2), b.z + Math.cos(b.rot) * (b.d / 2)];
  el.push(`<circle cx="${px(fx)}" cy="${pz(fz)}" r="4" fill="#ffe066"/>`);
  el.push(`<text x="${px(b.x)}" y="${pz(b.z)}" font-size="11" text-anchor="middle" fill="#fff">${b.id === 'house' ? (b.role || '') : b.id}</text>`);
}
for (const g of A.GATES) el.push(`<circle cx="${px(g.x)}" cy="${pz(g.z)}" r="12" fill="none" stroke="#ff0" stroke-width="3"/>`);
const pc = (p) => (p.type === 'kit' ? (/Barrel/.test(p.name) ? '#6b3e1f' : /Crate|Chest/.test(p.name) ? '#8a5a2b' : /Bench/.test(p.name) ? '#2b1c14' : '#c9a') : ({ lamp: '#ffd21f', stall: '#c0392b', well: '#3b6ea8', sign: '#fff', trough: '#38a', bale: '#e5c35a', haystack: '#e5c35a', woodpile: '#6b4a2f', cart: '#963', grave: '#999', washing: '#f8f', pump: '#39f', notice: '#fff', lychgate: '#963' }[p.type] || '#f0f'));
for (const p of A.PROPS || []) el.push(`<circle cx="${px(p.x)}" cy="${pz(p.z)}" r="${p.type === 'lamp' ? 3.5 : 5}" fill="${pc(p)}" stroke="#000" stroke-width="0.7"/>`);
for (const st of A.STALLS || []) el.push(`<rect x="${Number(px(st.x)) - 9}" y="${Number(pz(st.z)) - 9}" width="18" height="${st.name.includes('Cart') ? 30 : 18}" fill="#c0392b" transform="rotate(${(-st.rot * 180) / Math.PI} ${px(st.x)} ${pz(st.z)})"/>`);
for (const [k, p] of Object.entries({ well: A.WELL, fire: A.FIRE, kiln: A.KILN })) el.push(`<circle cx="${px(p.x)}" cy="${pz(p.z)}" r="9" fill="#3b6ea8" stroke="#000"/><text x="${px(p.x)}" y="${Number(pz(p.z)) - 11}" font-size="10" text-anchor="middle">${k}</text>`);
for (const [k, p] of Object.entries(A.PEOPLE_AT || {})) for (const q of p.route || [p]) el.push(`<circle cx="${px(q[0] ?? q.x)}" cy="${pz(q[1] ?? q.z)}" r="4" fill="#0ff" stroke="#000"/>`);
for (const p of A.STATIONS || []) el.push(`<rect x="${Number(px(p.x)) - 6}" y="${Number(pz(p.z)) - 6}" width="12" height="12" fill="#f0f" stroke="#000"/><text x="${px(p.x)}" y="${Number(pz(p.z)) - 9}" font-size="10" text-anchor="middle" fill="#000">${p.id}</text>`);
for (const n of A.NPC_SPOTS || []) el.push(`<circle cx="${px(n.x)}" cy="${pz(n.z)}" r="5" fill="#0ff" stroke="#000"/><text x="${px(n.x)}" y="${Number(pz(n.z)) + 14}" font-size="10" text-anchor="middle">${n.id}</text>`);
// Grid every 10 m.
for (let x = Math.ceil(X0 / 10) * 10; x < X0 + W; x += 10) el.push(`<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${Hh * S}" stroke="#000" stroke-opacity="${x % 50 === 0 ? 0.35 : 0.12}"/><text x="${px(x) }" y="10" font-size="9">${x}</text>`);
for (let z = Math.ceil(Z0 / 10) * 10; z < Z0 + Hh; z += 10) el.push(`<line x1="0" y1="${pz(z)}" x2="${W * S}" y2="${pz(z)}" stroke="#000" stroke-opacity="${z % 50 === 0 ? 0.35 : 0.12}"/><text x="2" y="${pz(z)}" font-size="9">${z}</text>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${Hh * S}" viewBox="0 0 ${W * S} ${Hh * S}">${el.join('\n')}</svg>`;
await mkdir(path.dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(out);
console.log('plan ->', out);
