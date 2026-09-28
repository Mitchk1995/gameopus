// Projectiles are drawn purely with particles: a bright head plus a trail.
const LOOK = {
  bolt: { c: [3.2, 1.2, 5.5], size: 0.75, trail: [2, 0.7, 4] },
  shard: { c: [1.6, 3.5, 6], size: 0.55, trail: [0.8, 2, 4] },
  soul: { c: [2.4, 4.5, 3.2], size: 0.8, trail: [1, 2.5, 1.6] },
  enemy: { c: [5.5, 1.6, 3.5], size: 0.85, trail: [3, 0.6, 2] },
};

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  reset() {
    this.list.length = 0;
  }

  spawn(o) {
    this.list.push({ y: 1.15, pierce: 0, hit: new Set(), t: 0, ...o });
  }

  bolt(x, z, a) {
    this.spawn({ kind: 'bolt', owner: 'player', x: x + Math.sin(a) * 0.6, z: z + Math.cos(a) * 0.6, vx: Math.sin(a) * 24, vz: Math.cos(a) * 24, life: 0.85, radius: 0.35, mult: 0.85, pierce: 1, element: 'arcane' });
  }

  shard(x, z, a, mult) {
    this.spawn({ kind: 'shard', owner: 'player', x, z, vx: Math.sin(a) * 20, vz: Math.cos(a) * 20, life: 0.55, radius: 0.35, mult, pierce: 99, element: 'cold', chill: 1.5 });
  }

  soul(x, z, hits, mult, depth) {
    const a = Math.random() * Math.PI * 2;
    this.spawn({ kind: 'soul', owner: 'player', x, z, y: 1.4, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, life: 4, radius: 0.4, mult, pierce: hits - 1, homing: true, element: 'void', chainDepth: depth });
  }

  enemyBolt(e, nx, nz) {
    const sp = 9;
    this.spawn({ kind: 'enemy', owner: 'enemy', x: e.x + nx * 0.7, z: e.z + nz * 0.7, y: 1.3, vx: nx * sp, vz: nz * sp, life: 2.4, radius: 0.35, damage: e.damage });
    this.game.audio.play('enemyShoot');
  }

  update(dt) {
    const g = this.game, P = g.particles, p = g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      b.life -= dt;
      const look = LOOK[b.kind];
      if (b.homing) {
        if (!b.target || b.target.dead) b.target = g.enemies.nearest(b.x, b.z, 14, b.hit);
        if (b.target) {
          const dx = b.target.x - b.x, dz = b.target.z - b.z, d = Math.hypot(dx, dz) || 1;
          const sp = 13;
          b.vx += ((dx / d) * sp - b.vx) * Math.min(1, dt * 6);
          b.vz += ((dz / d) * sp - b.vz) * Math.min(1, dt * 6);
        }
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      P.spawn(b.x, b.y, b.z, 0, 0, 0, 0.06, look.size, look.c[0], look.c[1], look.c[2]);
      P.spawn(b.x + (Math.random() - 0.5) * 0.15, b.y + (Math.random() - 0.5) * 0.15, b.z + (Math.random() - 0.5) * 0.15, -b.vx * 0.05, 0.2, -b.vz * 0.05, 0.3, look.size * 0.55, look.trail[0], look.trail[1], look.trail[2], 0, 3);

      let dead = b.life <= 0;
      if (b.owner === 'player' && !dead) {
        for (const e of g.enemies.near(b.x, b.z, b.radius)) {
          if (b.hit.has(e)) continue;
          b.hit.add(e);
          g.combat.playerHit(e, b.mult, { kind: b.kind, element: b.element, noProc: b.kind !== 'bolt', chill: b.chill, chainDepth: b.chainDepth, knock: 1.5 });
          P.burst(b.x, b.y, b.z, 8, 4, look.c, 0.3, 0.3, 3, 1);
          if (b.kind === 'bolt') g.audio.play('boltHit');
          if (b.homing) b.target = null;
          if (--b.pierce < 0) { dead = true; break; }
        }
      } else if (b.owner === 'enemy' && !dead && !p.dead) {
        if (Math.hypot(p.x - b.x, p.z - b.z) < b.radius + p.radius) {
          g.combat.hurtPlayer(b.damage, null);
          P.burst(b.x, b.y, b.z, 14, 5, look.c, 0.4, 0.35, 3, 1);
          dead = true;
        }
      }
      if (dead) {
        if (b.kind === 'bolt') P.burst(b.x, b.y, b.z, 10, 3, look.c, 0.35, 0.3, 2, 1);
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
      }
    }
  }
}
