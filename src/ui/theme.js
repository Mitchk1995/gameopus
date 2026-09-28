import { tileNoise } from '../art/texgen.js';
import { mulberry32 } from '../core/rng.js';

// Generates the interface's surface textures (panel leather, carved stone, globe liquid)
// once at startup and exposes them to CSS as custom properties.
function paint(size, fn) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
    }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

export function installTheme() {
  const rng = mulberry32(77);
  const S = 192;
  const n1 = tileNoise(S, 6, rng), n2 = tileNoise(S, 24, rng), n3 = tileNoise(S, 96, rng), n4 = tileNoise(S, 12, rng);

  // Dark tooled leather for panels.
  const leather = paint(S, (x, y) => {
    const crease = Math.pow(1 - Math.abs(n4(x, y) * 2 - 1), 10);
    const k = 14 + n1(x, y) * 10 + n2(x, y) * 6 + n3(x, y) * 5 - crease * 8;
    return [k * 1.15, k * 0.95, k * 0.9];
  });
  // Carved dark stone for the skill plinth and headers.
  const stone = paint(S, (x, y) => {
    const k = 24 + n1(x + 30, y) * 14 + n2(x, y + 20) * 10 + (n3(x, y) > 0.7 ? 8 : 0);
    return [k * 1.02, k * 0.98, k * 0.95];
  });
  // Swirling liquid for the globes (grayscale; tinted in CSS).
  const liquid = paint(S, (x, y) => {
    const w = n1(x + n2(x, y) * 40, y) * 0.6 + n2(x, y) * 0.4;
    const k = 120 + w * 135;
    return [k, k, k];
  });
  const root = document.documentElement.style;
  root.setProperty('--tex-leather', `url(${leather})`);
  root.setProperty('--tex-stone', `url(${stone})`);
  root.setProperty('--tex-liquid', `url(${liquid})`);
}
