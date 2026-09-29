import * as THREE from 'three';
import { rings } from './map.js';

// The air of each ring of the vale, blended by where the player stands (map.js rings): a cool green
// haze under the trees of the goblin woods, a warm amber haze over bandit country, grey cold air on
// Mine Hill, clear bright light over the farmland. Only a few cheap values change (fog colour and
// distance, the sun's tint, the sky light's strength), eased over a couple of seconds as you walk
// from one ring into the next. Kept subtle: never dark, never muddy.

// fog: a tint mixed into the sky's own horizon colour (so the haze still meets the sky), near/far
// scale the fog distances, sun multiplies the sun's colour, env scales the sky light.
const MOODS = {
  woods: { fog: new THREE.Color(0.62, 0.74, 0.64), tint: 0.3, near: 0.55, far: 0.62, sun: new THREE.Color(0.95, 1.0, 0.95), env: 0.97 },
  bandit: { fog: new THREE.Color(0.86, 0.74, 0.56), tint: 0.32, near: 0.7, far: 0.72, sun: new THREE.Color(1.05, 0.97, 0.86), env: 1.0 },
  mine: { fog: new THREE.Color(0.66, 0.69, 0.73), tint: 0.35, near: 0.6, far: 0.66, sun: new THREE.Color(0.92, 0.95, 1.0), env: 0.94 },
  farm: { fog: null, tint: 0, near: 1.15, far: 1.1, sun: new THREE.Color(1.02, 1.01, 0.98), env: 1.03 },
};

export class Mood {
  constructor({ scene, sky }) {
    this.scene = scene;
    this.sky = sky;
    const f = scene.fog;
    this.base = { fog: f.color.clone(), near: f.near, far: f.far, sun: sky.sun.color.clone(), env: scene.environmentIntensity ?? 1 };
    this.cur = { fog: this.base.fog.clone(), near: f.near, far: f.far, sun: this.base.sun.clone(), env: this.base.env };
    this.target = { fog: this.base.fog.clone(), near: f.near, far: f.far, sun: this.base.sun.clone(), env: this.base.env };
    this.at = new THREE.Vector2(1e9, 0);
    this.first = true;
  }

  // Where the player is decides the target; the air eases toward it.
  update(dt, focus) {
    if (Math.hypot(focus.x - this.at.x, focus.z - this.at.y) > 3) {
      this.at.set(focus.x, focus.z);
      this.#aim(rings(focus.x, focus.z));
    }
    const k = this.first ? 1 : 1 - Math.exp(-dt / 1.4);
    this.first = false;
    const c = this.cur, t = this.target;
    c.fog.lerp(t.fog, k);
    c.sun.lerp(t.sun, k);
    c.near += (t.near - c.near) * k;
    c.far += (t.far - c.far) * k;
    c.env += (t.env - c.env) * k;
    const f = this.scene.fog;
    f.color.copy(c.fog);
    f.near = c.near;
    f.far = c.far;
    this.sky.sun.color.copy(c.sun);
    this.scene.environmentIntensity = c.env;
  }

  #aim(R) {
    const w = { woods: R.woods * (1 - R.town), bandit: R.bandit * (1 - R.town), mine: R.mine * (1 - R.town), farm: R.farm };
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    const scale = sum > 1 ? 1 / sum : 1;
    const b = this.base, t = this.target;
    t.fog.copy(b.fog);
    t.sun.copy(b.sun);
    let near = 1, far = 1, env = 1;
    const tmp = new THREE.Color();
    for (const [name, m] of Object.entries(MOODS)) {
      const a = w[name] * scale;
      if (a <= 0) continue;
      if (m.fog) t.fog.lerp(tmp.copy(b.fog).lerp(m.fog, m.tint), a);
      t.sun.lerp(tmp.copy(b.sun).multiply(m.sun), a);
      near += (m.near - 1) * a;
      far += (m.far - 1) * a;
      env += (m.env - 1) * a;
    }
    t.near = b.near * near;
    t.far = b.far * far;
    t.env = b.env * env;
  }
}
