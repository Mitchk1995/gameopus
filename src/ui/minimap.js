import { WORLD } from '../world/map.js';

// The minimap: a painted map of the valley (hill-shaded ground, water, paths, woods
// and buildings), turned so the view direction is up, with markers for places
// that matter. The map image is painted once at load.

const MAP = 1024; // pixels for the whole 800 m valley
const VIEW = 170; // CSS pixels across the round window
const METRES = 130; // metres across the round window

const ICONS = {
  bank: { color: '#f5d36b', glyph: '$' },
  store: { color: '#9fd3ff', glyph: '⚖' },
  smithy: { color: '#d9d9d9', glyph: '⚒' },
  fire: { color: '#ff9a4a', glyph: '♨' },
  fish: { color: '#7fd3ff', glyph: '◆' },
  mine: { color: '#d7b48a', glyph: '⛏' },
  craft: { color: '#e7c38a', glyph: '✂' },
  inn: { color: '#e9a0a0', glyph: '♥' },
};

export class Minimap {
  constructor({ world, markers }) {
    this.world = world;
    this.markers = markers;
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = VIEW * this.dpr;
    this.root.append(this.canvas);
    this.north = document.createElement('div');
    this.north.className = 'north';
    this.north.textContent = 'N';
    this.root.append(this.north);
    document.body.append(this.root);
    this.ctx = this.canvas.getContext('2d');
    this.map = this.#paint();
  }

  // Paints the valley once from the heightmap, ground cover and buildings.
  #paint() {
    const T = this.world.terrain;
    const c = document.createElement('canvas');
    c.width = c.height = MAP;
    const g = c.getContext('2d');
    const img = g.createImageData(MAP, MAP);
    const cover = this.#coverPixels();
    const scale = WORLD.size / MAP;
    for (let j = 0; j < MAP; j++)
      for (let i = 0; i < MAP; i++) {
        const x = -WORLD.half + (i + 0.5) * scale, z = -WORLD.half + (j + 0.5) * scale;
        const h = T.heightAt(x, z);
        const hx = T.heightAt(x + 1.5, z) - T.heightAt(x - 1.5, z), hz = T.heightAt(x, z + 1.5) - T.heightAt(x, z - 1.5);
        // Light from the north-west.
        const shade = Math.max(0.55, Math.min(1.3, 1 - (hx * -0.7 + hz * -0.7) * 0.18));
        let r, gg, b;
        if (h < 0) {
          const d = Math.min(1, -h / 3);
          [r, gg, b] = [60 - d * 25, 110 - d * 30, 140 - d * 20];
        } else {
          const k = (Math.floor(j * MAP / MAP) * MAP + i) * 4;
          const ci = ((Math.floor((j / MAP) * cover.h)) * cover.w + Math.floor((i / MAP) * cover.w)) * 4;
          const path = cover.data[ci] / 255, forest = cover.data[ci + 1] / 255, cobble = cover.data[ci + 2] / 255;
          const slope = Math.hypot(hx, hz) / 3;
          [r, gg, b] = [96, 132, 64];
          if (forest > 0.3) [r, gg, b] = mix([r, gg, b], [70, 96, 50], forest);
          if (h < 1.4) [r, gg, b] = mix([r, gg, b], [196, 182, 140], Math.min(1, (1.4 - h) / 0.9));
          if (slope > 0.3) [r, gg, b] = mix([r, gg, b], [128, 124, 118], Math.min(1, (slope - 0.3) * 2.5));
          if (h > 80) [r, gg, b] = mix([r, gg, b], [235, 238, 244], Math.min(1, (h - 80) / 20));
          if (path > 0.3) [r, gg, b] = mix([r, gg, b], [188, 166, 124], Math.min(1, path));
          if (cobble > 0.3) [r, gg, b] = mix([r, gg, b], [168, 162, 150], cobble);
          void k;
        }
        const o = (j * MAP + i) * 4;
        img.data[o] = r * shade;
        img.data[o + 1] = gg * shade;
        img.data[o + 2] = b * shade;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // Trees as dark dots, buildings as roofs.
    const px = (x) => ((x + WORLD.half) / WORLD.size) * MAP;
    g.fillStyle = 'rgba(28, 52, 22, 0.55)';
    for (const t of this.world.forest.trees) {
      g.beginPath();
      g.arc(px(t.x), px(t.z), Math.max(1.1, t.scale * 7), 0, Math.PI * 2);
      g.fill();
    }
    const v = this.world.village;
    const houses = [...Object.values(v.places).filter((p) => p && p.w), ...(v.places.houses || [])];
    for (const h of houses) {
      g.save();
      g.translate(px(h.x), px(h.z));
      g.rotate(-h.rot);
      g.fillStyle = '#8a4f3a';
      g.strokeStyle = '#3a2418';
      g.lineWidth = 1;
      const w = (h.w / WORLD.size) * MAP, d = (h.d / WORLD.size) * MAP;
      g.fillRect(-w / 2, -d / 2, w, d);
      g.strokeRect(-w / 2, -d / 2, w, d);
      g.restore();
    }
    return c;
  }

  #coverPixels() {
    const img = this.world.terrain.groundTex.image;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  }

  update(player, yaw) {
    const g = this.ctx, S = VIEW * this.dpr;
    const ppm = S / METRES; // canvas pixels per metre
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    g.translate(S / 2, S / 2);
    // View direction up: the camera looks along (-sin yaw, -cos yaw).
    g.rotate(yaw);
    // Source window around the player, clamped to the map (the edge stays blank).
    const k = MAP / WORLD.size, span = METRES * 1.5;
    let sx = (player.pos.x + WORLD.half - span / 2) * k, sy = (player.pos.z + WORLD.half - span / 2) * k;
    let sw = span * k, sh = span * k, dx = (-span / 2) * ppm, dy = (-span / 2) * ppm, dw = span * ppm, dh = span * ppm;
    const f = dw / sw;
    if (sx < 0) { dx -= sx * f; dw += sx * f; sw += sx; sx = 0; }
    if (sy < 0) { dy -= sy * f; dh += sy * f; sh += sy; sy = 0; }
    if (sx + sw > MAP) { const o = sx + sw - MAP; sw -= o; dw -= o * f; }
    if (sy + sh > MAP) { const o = sy + sh - MAP; sh -= o; dh -= o * f; }
    g.fillStyle = '#1b1914';
    g.fillRect(-S, -S, S * 2, S * 2);
    if (sw > 0 && sh > 0) g.drawImage(this.map, sx, sy, sw, sh, dx, dy, dw, dh);
    // Markers.
    g.font = `${12 * this.dpr}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const m of this.markers()) {
      const dx = (m.x - player.pos.x) * ppm, dz = (m.z - player.pos.z) * ppm;
      if (Math.hypot(dx, dz) > S * 0.75) continue;
      if (m.dot) {
        g.fillStyle = m.dot;
        g.beginPath();
        g.arc(dx, dz, 2.6 * this.dpr, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const ic = ICONS[m.icon];
      g.save();
      g.translate(dx, dz);
      g.rotate(-yaw);
      g.fillStyle = 'rgba(15, 12, 8, 0.8)';
      g.beginPath();
      g.arc(0, 0, 8 * this.dpr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ic.color;
      g.fillText(ic.glyph, 0, 0.5 * this.dpr);
      g.restore();
    }
    g.restore();
    // The player: an arrow pointing where they face, relative to the view.
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(yaw - player.yaw + Math.PI);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5 * this.dpr;
    g.beginPath();
    g.moveTo(0, -6 * this.dpr);
    g.lineTo(4.5 * this.dpr, 5 * this.dpr);
    g.lineTo(0, 2.5 * this.dpr);
    g.lineTo(-4.5 * this.dpr, 5 * this.dpr);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    // North marker orbits the rim.
    const r = VIEW / 2 - 9;
    this.north.style.transform = `translate(${Math.sin(yaw) * r}px, ${-Math.cos(yaw) * r}px)`;
  }
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
