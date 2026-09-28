// Player settings kept in this browser: graphics quality and mouse sensitivity.
const KEY = 'aldermere.settings.v1';

export const QUALITY = {
  high: { label: 'High', pixelRatio: 1.5, shadow: 4096, grass: 1, treesNear: 40 },
  medium: { label: 'Medium', pixelRatio: 1, shadow: 2048, grass: 0.6, treesNear: 32 },
  low: { label: 'Low', pixelRatio: 0.8, shadow: 1024, grass: 0.3, treesNear: 24 },
};

export function loadSettings() {
  const d = { quality: 'high', sensitivity: 1 };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return d;
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: settings last for this visit only.
  }
}

// Applies a quality level to the running renderer and world.
export function applyQuality(level, { renderer, world }) {
  const q = QUALITY[level] || QUALITY.high;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  const sun = world.sky.sun;
  if (sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  world.grass.setDensity(q.grass);
  world.forest.setNear(q.treesNear);
}
