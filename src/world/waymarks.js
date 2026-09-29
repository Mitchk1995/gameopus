import * as THREE from 'three';
import { JUNCTIONS, WARNINGS, POIS, ROADS, roadAt, roadById } from './map.js';
import { rng } from './buildings.js';
import { texturedMaterial } from './townkit.js';
import { plank, log, rockGeo } from './siteparts.js';

// The vale's waymarks: a fingerpost at every junction whose boards point down the roads and name where each
// goes and how far (read off the road graph in map.js, so a sign never lies), warning posts where each ring of
// danger begins, and a cairn with a name board on every point-of-interest pad, so a site still waiting for its
// buildings already reads as a named place. Every post stands beside the road, never on it, with a collider;
// every board can be read with E.
//
// All the boards share one texture atlas (a board is a plank with a lettered plane pinned to each face), so the
// whole set of waymarks is a couple of draw calls however many signs there are.

const PI = Math.PI;
const SERIF = 'Georgia, "Times New Roman", serif';

// ------------------------------------------------------------------ lettering
// A shelf-packed canvas atlas: every board face is drawn into a cell of one of a few canvases.
class Atlas {
  constructor(size = 2048) {
    this.size = size;
    this.sheets = [];
  }

  #sheet(w, h) {
    let s = this.sheets.at(-1);
    if (s) {
      if (s.x + w > this.size) { s.y += s.rowH; s.x = 0; s.rowH = 0; }
      if (s.y + h > this.size) s = null;
    }
    if (!s) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = this.size;
      const g = cv.getContext('2d');
      g.fillStyle = '#b08a5a';
      g.fillRect(0, 0, this.size, this.size);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      s = { cv, g, tex, mat: texturedMaterial(tex, 0.85), x: 0, y: 0, rowH: 0 };
      this.sheets.push(s);
    }
    return s;
  }

  // Reserves a w x h cell, lets `draw(g, w, h)` paint it, and returns { mat, rect } (rect is u0, v0, u1, v1).
  cell(w, h, draw) {
    const s = this.#sheet(w, h);
    s.g.save();
    s.g.translate(s.x, s.y);
    s.g.beginPath();
    s.g.rect(0, 0, w, h);
    s.g.clip();
    draw(s.g, w, h);
    s.g.restore();
    const S = this.size, rect = [s.x / S, 1 - (s.y + h) / S, (s.x + w) / S, 1 - s.y / S];
    s.x += w;
    s.rowH = Math.max(s.rowH, h);
    return { mat: s.mat, rect };
  }

  finish() {
    for (const s of this.sheets) s.tex.needsUpdate = true;
  }
}

// A weathered plank ground with a dark border.
function plankGround(g, w, h, base = '#c79a5e', edge = '#3a2410') {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  let seed = 9;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = 'rgba(70,45,20,0.28)';
  for (let i = 0; i < Math.round(h / 7); i++) {
    g.lineWidth = 1 + r() * 1.2;
    g.beginPath();
    const y = 5 + i * 7 + r() * 3;
    g.moveTo(0, y);
    g.lineTo(w, y + (r() - 0.5) * 5);
    g.stroke();
  }
  g.strokeStyle = edge;
  g.lineWidth = Math.max(3, h * 0.045);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
}

// Text shrunk to fit a width; returns the size used.
function fitText(g, text, size, maxW, weight = 'bold') {
  g.font = `${weight} ${size}px ${SERIF}`;
  while (g.measureText(text).width > maxW && size > 12) {
    size -= 2;
    g.font = `${weight} ${size}px ${SERIF}`;
  }
  return size;
}

// One face of a fingerpost board: the place on top, the distance under it, an arrow at the pointing end
// (`side` +1 on the right, -1 on the left).
function drawFinger(g, w, h, to, dist, side) {
  const k = w / 512;
  plankGround(g, w, h);
  // The post stands over the end away from the arrow, so the lettering starts clear of it.
  const pad = 18 * k, arrow = 64 * k, postEnd = 62 * k;
  const x0 = side > 0 ? postEnd : pad + arrow, x1 = side > 0 ? w - pad - arrow : w - postEnd;
  g.fillStyle = '#2a1a0c';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'center';
  const size = fitText(g, to, 64 * k, x1 - x0);
  g.fillText(to, (x0 + x1) / 2, h * 0.5);
  g.font = `bold ${Math.min(46 * k, Math.round(size * 0.8))}px ${SERIF}`;
  g.fillStyle = '#5a1f12';
  g.fillText(dist, (x0 + x1) / 2, h * 0.86);
  // The arrow: a broad head on a short tail.
  g.fillStyle = '#2a1a0c';
  const ax = side > 0 ? w - pad - 5 * k : pad + 5 * k, d = side;
  g.beginPath();
  g.moveTo(ax, h / 2);
  g.lineTo(ax - d * 36 * k, h / 2 - 27 * k);
  g.lineTo(ax - d * 36 * k, h / 2 - 9 * k);
  g.lineTo(ax - d * 56 * k, h / 2 - 9 * k);
  g.lineTo(ax - d * 56 * k, h / 2 + 9 * k);
  g.lineTo(ax - d * 36 * k, h / 2 + 9 * k);
  g.lineTo(ax - d * 36 * k, h / 2 + 27 * k);
  g.closePath();
  g.fill();
}

// A warning board: red, with a hazard triangle and the words in cream capitals over one or two lines.
function drawWarning(g, w, h, text) {
  plankGround(g, w, h, '#8a2c22', '#2a0d09');
  const words = text.split(' ');
  const half = Math.ceil(words.length / 2);
  const lines = words.length >= 2 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [text];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2e6c8';
  const x0 = w * 0.3, x1 = w - w * 0.05;
  let size = 200;
  for (const l of lines) size = Math.min(size, fitText(g, l, w * 0.2, x1 - x0));
  g.font = `bold ${size}px ${SERIF}`;
  lines.forEach((l, i) => g.fillText(l, (x0 + x1) / 2, h * (0.5 + (i - (lines.length - 1) / 2) * 0.3)));
  // The triangle with an exclamation mark.
  g.fillStyle = '#e8c23a';
  g.beginPath();
  g.moveTo(w * 0.145, h * 0.2);
  g.lineTo(w * 0.245, h * 0.78);
  g.lineTo(w * 0.045, h * 0.78);
  g.closePath();
  g.fill();
  g.strokeStyle = '#2a0d09';
  g.lineWidth = Math.max(3, w * 0.012);
  g.stroke();
  g.fillStyle = '#2a0d09';
  g.font = `bold ${Math.round(h * 0.34)}px ${SERIF}`;
  g.fillText('!', w * 0.145, h * 0.6);
}

// A name board on a cairn: the place's name over one or two rows, on a paler plank.
function drawName(g, w, h, name) {
  plankGround(g, w, h, '#cfa970');
  g.fillStyle = '#2a1a0c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = name.split(' ');
  const half = Math.ceil(words.length / 2);
  const lines = name.length > 13 && words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [name];
  let size = h * 0.5;
  for (const l of lines) size = Math.min(size, fitText(g, l, h * 0.5, w - 34));
  g.font = `bold ${size}px ${SERIF}`;
  lines.forEach((l, i) => g.fillText(l, w / 2, h * (0.5 + (i - (lines.length - 1) / 2) * 0.36)));
}

// ------------------------------------------------------------------ small things
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (dx, dz) => COMPASS[Math.round(((Math.atan2(dx, -dz) + 2 * PI) % (2 * PI)) / (PI / 4)) % 8];
const proper = (s) => s.replace(/^the /, 'The ');

// A spot for a post near (x, z): as it is if that stands clear of every road (a road's painted half-width and a
// bit), on dry ground that is not steep; else the nearest such spot (to `around`, or to (x, z)) searching outward.
function postSpot(sk, x, z, { clear = 1.1, slope = 0.5, around = null } = {}) {
  const ok = (px, pz) => {
    for (const r of ROADS) if (roadAt(r.id, px, pz).d < r.width + clear) return false;
    const g = Math.hypot(sk.ground(px + 0.5, pz) - sk.ground(px - 0.5, pz), sk.ground(px, pz + 0.5) - sk.ground(px, pz - 0.5));
    return g <= slope && sk.ground(px, pz) > 0.9;
  };
  if (ok(x, z)) return [x, z];
  const [cx, cz] = around ?? [x, z];
  let best = null;
  for (let d = 0.6; d <= 9 && !best; d += 0.6)
    for (let a = 0; a < 2 * PI; a += PI / 12) {
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (ok(px, pz) && (!best || Math.hypot(px - cx, pz - cz) < best.d)) best = { d: Math.hypot(px - cx, pz - cz), p: [px, pz] };
    }
  return best ? best.p : [x, z];
}

// ------------------------------------------------------------------ the builder
export function buildWaymarks(sites) {
  const sk = sites.sk, m = sk.m;
  const atlas = new Atlas();
  const out = { junctions: [], warnings: [], cairns: [] };

  // A lettered plank: `bw` x `bh`, its base at y, centred at (x, z), facing `yaw`; the face at +z shows `front`
  // and the face at -z shows `back` (each a { mat, rect } cell).
  const board = (x, y, z, yaw, bw, bh, front, back) => {
    sk.put(plank(bw, bh, 0.05), m.wood, x, y, z, yaw);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (const [cell, k] of [[front, 1], [back, -1]]) {
      if (!cell) continue;
      const g = new THREE.PlaneGeometry(bw - 0.05, bh - 0.05), uv = g.attributes.uv, [u0, v0, u1, v1] = cell.rect;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
      sk.put(g, cell.mat, x + s * 0.0275 * k, y + bh / 2, z + c * 0.0275 * k, yaw + (k > 0 ? 0 : PI));
    }
  };
  // A post: a round timber standing on the lowest ground under it, with a small cap and a collider. Returns the ground.
  const post = (x, z, height, r0 = 0.085, r1 = 0.1) => {
    const y = sk.ground(x, z);
    sk.put(log(r0, r1, height + 0.3, 8), m.wood, x, y - 0.3, z);
    sk.put(log(0.005, r1 + 0.02, 0.22, 4), m.wood, x, y + height, z, PI / 4);
    sk.solidCircle(x, z, 0.14, y, height + 0.2);
    return y;
  };
  const read = (name, x, y, z, title, text) => sites.interactables.push({ kind: 'station', station: 'sign', name, verb: 'Read the', title, text, x, y, z, r: 0.9, h: 2.6, reach: 3.4 });

  // --- a fingerpost at every junction
  const BW = 1.7, BH = 0.365, STEP = 0.375;
  for (const j of JUNCTIONS) {
    const [x, z] = postSpot(sk, j.x, j.z, { around: j.at });
    const n = j.boards.length;
    // The lowest board's underside clears a tall head; the post rises above the top board.
    const lowest = 2.05, height = lowest + n * STEP + 0.35;
    sk.begin('signpost', x, z);
    const y = post(x, z, height);
    j.boards.forEach((b, i) => {
      const [dx, dz] = b.dir, yaw = Math.atan2(-dz, dx);
      const dist = b.text.slice(b.to.length).trim();
      const front = atlas.cell(384, 82, (g, cw, ch) => drawFinger(g, cw, ch, proper(b.to), dist, 1));
      const back = atlas.cell(384, 82, (g, cw, ch) => drawFinger(g, cw, ch, proper(b.to), dist, -1));
      board(x + dx * (BW / 2 - 0.12), y + lowest + (n - 1 - i) * STEP, z + dz * (BW / 2 - 0.12), yaw, BW, BH, front, back);
    });
    read('Signpost', x, y + 2.2, z, 'Signpost', j.boards.map((b) => `${proper(b.to)}, ${b.text.slice(b.to.length).trim()}, to the ${compass(b.dir[0], b.dir[1])}.`));
    out.junctions.push({ id: j.id, x, z, boards: n });
  }

  // --- the warning posts
  for (const wp of WARNINGS) {
    const [x, z] = postSpot(sk, wp.x, wp.z, { clear: 1.3 });
    sk.begin('warning post', x, z);
    const y = post(x, z, 2.7, 0.09, 0.11);
    const cell = atlas.cell(384, 207, (g, cw, ch) => drawWarning(g, cw, ch, wp.board));
    board(x + Math.sin(wp.face) * 0.12, y + 1.65, z + Math.cos(wp.face) * 0.12, wp.face, 1.15, 0.62, cell, cell);
    read('Warning post', x, y + 1.9, z, wp.board, wp.text);
    out.warnings.push({ id: wp.id, x, z });
  }

  // --- a cairn and a name board on every pad
  const rnd = rng(7717);
  for (const p of POIS) {
    const r = roadById(p.road), end = r.pts[r.pts.length - 1];
    // Beside where the road meets the pad: off to one side of the way to the centre (which is for whoever builds here).
    let ux = end[0] - p.x, uz = end[1] - p.z;
    const ul = Math.hypot(ux, uz);
    if (ul < 1) { ux = Math.sin(p.facing); uz = Math.cos(p.facing); } else { ux /= ul; uz /= ul; }
    const d = Math.min(p.r * 0.6, 7.5);
    const [x, z] = postSpot(sk, p.x + ux * d - uz * 2.6, p.z + uz * d + ux * 2.6, { clear: 1.4, slope: 0.35 });
    const gy = sk.ground(x, z);
    sk.begin('cairn', x, z);
    // Flat stones piled up and narrowing, each set a little off the last.
    let top = gy - 0.05;
    for (let i = 0; i < 6; i++) {
      const s = 0.5 - i * 0.055, thick = 2 * 0.42 * s;
      const off = i ? (rnd() - 0.5) * 0.12 : 0;
      sk.put(rockGeo(s, rnd, 0.42, false), sites.mat.boulder, x + off, top + thick / 2 - 0.03, z + (rnd() - 0.5) * 0.1, rnd() * PI * 2);
      top += thick * 0.78;
    }
    sk.solidCircle(x, z, 0.62, gy, 1.4);
    // The name board on its own short post beside it, facing the road.
    const bx = x + uz * 1.0, bz = z - ux * 1.0;
    sk.begin('name board', bx, bz);
    const by = post(bx, bz, 1.75, 0.06, 0.075);
    const cell = atlas.cell(384, 130, (g, cw, ch) => drawName(g, cw, ch, p.name));
    const yaw = Math.atan2(ux, uz);
    board(bx + Math.sin(yaw) * 0.09, by + 1.18, bz + Math.cos(yaw) * 0.09, yaw, 1.3, 0.44, cell, cell);
    // The board sticks out either side of its post at chest height: it is solid too.
    sk.colliders.addBox(bx + Math.sin(yaw) * 0.09, bz + Math.cos(yaw) * 0.09, 0.66, 0.1, yaw, by + 1.1, by + 1.7);
    read(p.name, x, by + 1.0, z, p.name, [p.note]);
    out.cairns.push({ id: p.id, x, z });
  }
  atlas.finish();
  return out;
}
