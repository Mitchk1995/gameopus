// Action primitives. Unique powers and skills are composed from these.
// Adding a new kind of effect to the game starts here.
export const ELEMENT_COLOR = {
  physical: [2.6, 2.2, 1.8],
  fire: [5.5, 2.0, 0.4],
  cold: [1.2, 2.8, 5.5],
  lightning: [2.6, 3.0, 7.0],
  arcane: [3.4, 1.3, 5.5],
  void: [3.0, 0.8, 5.0],
};

export class Actions {
  constructor(game) {
    this.game = game;
    this.patches = [];
  }

  reset() {
    this.patches.length = 0;
  }

  // Lightning that jumps from a source enemy to `jumps` others.
  chainLightning(x, z, first, jumps, mult) {
    const g = this.game;
    const hit = new Set();
    if (first) hit.add(first);
    let cx = x, cz = z;
    let target = g.enemies.nearest(cx, cz, 7.5, hit);
    let delay = 0;
    for (let j = 0; j < jumps && target; j++) {
      const t = target, fx = cx, fz = cz;
      hit.add(t);
      g.schedule(delay, () => {
        g.fx.lightning(fx, 1.1, fz, t.x, 1.0, t.z);
        g.audio.play('zap');
        if (!t.dead) g.combat.playerHit(t, mult, { kind: 'chain', element: 'lightning', noProc: true });
      });
      cx = t.x; cz = t.z;
      delay += 0.045;
      target = g.enemies.nearest(cx, cz, 7.5, hit);
    }
  }

  nova(x, z, radius, mult, element, opts = {}) {
    const g = this.game;
    const c = ELEMENT_COLOR[element];
    if (opts.implode) {
      g.fx.ring(x, z, radius, c, 0.25, true);
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.4);
        g.particles.spawn(x + Math.cos(a) * r, 0.5 + Math.random() * 1.5, z + Math.sin(a) * r, -Math.cos(a) * r * 4, 0, -Math.sin(a) * r * 4, 0.25, 0.4, c[0], c[1], c[2]);
      }
      g.schedule(0.2, () => {
        g.particles.burst(x, 0.8, z, 40, 9, c, 0.5, 0.45, 2, 3);
        g.fx.glow(x, z, radius * 0.8, c, 0.4);
        this.#novaHits(x, z, radius, mult, element, opts);
        g.audio.play('implode');
      });
      return;
    }
    g.fx.ring(x, z, radius, c, 0.45);
    if (opts.frost) {
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2, s = radius * (1.6 + Math.random() * 0.8);
        g.particles.spawn(x, 0.3 + Math.random() * 0.6, z, Math.cos(a) * s, 0.5 + Math.random() * 2, Math.sin(a) * s, 0.5, 0.5, c[0], c[1], c[2], 2, 3.5, 0.1);
      }
    } else g.particles.ring(x, 0.3, z, radius * 0.2, 50, c, 0.4, 0.45, radius * 2.2);
    this.#novaHits(x, z, radius, mult, element, opts);
  }

  #novaHits(x, z, radius, mult, element, opts) {
    const g = this.game;
    for (const e of g.enemies.near(x, z, radius)) {
      g.combat.playerHit(e, mult, { kind: 'nova', element, noProc: opts.noProc ?? !opts.frost, chill: opts.chill, chainDepth: opts.chainDepth, knock: 3, from: [x, z] });
    }
  }

  // Burning ground. Player-owned patches scale with your damage; enemy ones hurt you.
  firePatch(x, z, radius, power, dur, owner = 'player') {
    const g = this.game;
    const dps = owner === 'player' ? g.player.stats.avgHit * power : power;
    const it = g.fx.fire(x, z, radius, dur, owner === 'enemy');
    this.patches.push({ x, z, r: radius, dps, t: dur, tick: 0, owner, it });
    if (owner === 'player') g.audio.play('fire');
  }

  shards(x, z, angle, count, spread, mult) {
    for (let i = 0; i < count; i++) {
      const a = angle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread * 2);
      this.game.projectiles.shard(x + Math.sin(a) * 0.8, z + Math.cos(a) * 0.8, a, mult);
    }
  }

  soul(x, z, hits, mult, depth) {
    this.game.projectiles.soul(x, z, hits, mult, depth);
    this.game.particles.burst(x, 1, z, 20, 3, [2, 4, 3], 0.6, 0.4, -2, 2);
  }

  update(dt) {
    const g = this.game, P = g.particles, p = g.player;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const f = this.patches[i];
      f.t -= dt;
      f.tick += dt;
      if (Math.random() < dt * 14 * f.r) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * f.r * 0.8;
        const c = f.owner === 'enemy' ? [4, 0.8, 1.6] : [5, 1.8, 0.3];
        P.spawn(f.x + Math.cos(a) * r, 0.1, f.z + Math.sin(a) * r, 0, 1 + Math.random() * 2, 0, 0.5 + Math.random() * 0.4, 0.35, c[0], c[1], c[2], -0.5, 1, 0.05);
      }
      if (f.tick >= 0.25) {
        const amt = f.dps * f.tick;
        f.tick = 0;
        if (f.owner === 'player') {
          for (const e of g.enemies.near(f.x, f.z, f.r)) {
            g.combat.applyDamage(e, amt, { element: 'fire', small: true });
            e.burnT = Math.max(e.burnT, 0.5);
          }
        } else if (!p.dead && Math.hypot(p.x - f.x, p.z - f.z) < f.r + p.radius * 0.5) {
          g.combat.hurtPlayer(amt, null, { dot: true });
        }
      }
      if (f.t <= 0) {
        this.patches[i] = this.patches[this.patches.length - 1];
        this.patches.pop();
      }
    }
  }
}
