import { ELEMENT_COLOR } from './actions.js';
import { dreadMods } from '../content/dread.js';

export class Combat {
  constructor(game) {
    this.game = game;
  }

  // A hit that scales with the player's weapon and stats.
  playerHit(e, mult, opts = {}) {
    if (e.dead) return 0;
    const g = this.game, p = g.player, s = p.stats;
    const phys = s.dmgMin + Math.random() * (s.dmgMax - s.dmgMin) + s.flatDmg;
    const pm = (1 + s.pctDmg / 100) * mult;
    let dmg = (phys + s.fireDmg + s.coldDmg + s.lightningDmg) * pm;
    const element = opts.element || p.dominantElement();
    const crit = !!opts.forceCrit || Math.random() * 100 < s.critChance;
    if (crit) dmg *= 1 + s.critDmg / 100;
    e.lastCrit = crit;

    if (opts.kind === 'melee' || opts.kind === 'bolt') {
      if (s.lifeOnHit) p.heal(s.lifeOnHit);
    }
    if (opts.chill || s.coldDmg > 0 || element === 'cold') e.slowT = Math.max(e.slowT, opts.chill || 1.2);
    if (s.fireDmg > 0 && !opts.noProc && Math.random() < 0.3) {
      e.burnT = 2;
      e.burnDps = Math.max(e.burnDps, s.fireDmg * pm * 0.6);
    }
    if (opts.knock && !e.elite) {
      const [fx, fz] = opts.from || [p.x, p.z];
      const dx = e.x - fx, dz = e.z - fz, d = Math.hypot(dx, dz) || 1;
      const k = opts.knock * (e.def.behavior === 'slam' ? 0.2 : 1);
      e.vx += (dx / d) * k * 2;
      e.vz += (dz / d) * k * 2;
    }

    this.applyDamage(e, dmg, { crit, element, chainDepth: opts.chainDepth || 0 });

    if (!opts.noProc) {
      const ev = { enemy: e, crit, kind: opts.kind, x: e.x, z: e.z, damage: dmg };
      g.powers.emit('hit', ev);
      if (crit) g.powers.emit('crit', ev);
      if (s.chainChance && Math.random() * 100 < s.chainChance) g.actions.chainLightning(e.x, e.z, e, 4, 0.8);
    }
    return dmg;
  }

  applyDamage(e, amt, { crit = false, element = 'physical', silent = false, small = false, chainDepth = 0 } = {}) {
    if (e.dead || !(amt > 0)) return;
    const g = this.game;
    e.hp -= amt;
    e.flash = crit ? 0.14 : 0.08;
    if (!small) e.hitT = crit ? 0.14 : 0.09;
    if (!silent) g.hud.damageNumber(e.x, 1.7 * e.scale, e.z, amt, crit, small ? 'small' : element);
    const c = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical;
    if (!small) g.particles.burst(e.x, 1.0 * e.scale, e.z, crit ? 14 : 6, crit ? 7 : 4, c, 0.35, crit ? 0.35 : 0.25, 5, 2);
    if (e.hp <= 0) this.kill(e, element, chainDepth);
  }

  kill(e, element, chainDepth = 0) {
    const g = this.game;
    e.dead = true;
    e.dying = 0;
    const c = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical;
    const d = e.def.debris;
    g.particles.burst(e.x, 0.9 * e.scale, e.z, 16, 5, d, 0.9, 0.3, 14, 5);
    g.particles.burst(e.x, 1.0 * e.scale, e.z, 10, 3, c, 0.4, 0.4, 0, 2);
    g.audio.play('kill');
    g.kills++;
    const xpMult = e.elite === 'rare' ? 12 : e.elite ? 4 : 1;
    g.player.gainXp(e.def.xp * xpMult * (1 + (g.depth - 1) * 0.35) * dreadMods(g.dread).xp);
    g.loot.onKill(e);
    g.powers.emit('kill', { enemy: e, x: e.x, z: e.z, chainDepth });
    if (e.elite === 'rare') {
      g.shake(0.7);
      g.hitstop(0.12);
      g.particles.burst(e.x, 1.2, e.z, 120, 12, [5, 3.5, 0.8], 1.2, 0.5, 6, 6);
      g.fx.ring(e.x, e.z, 7, [5, 3.5, 0.8], 0.7);
      g.hud.announce(`${e.name} is slain`, 'Fortune spills from the corpse', 'rare');
    }
  }

  // Armor gets less effective the deeper you go, so it can't trivialize late depths.
  drFor(armor) {
    const g = this.game;
    return Math.min(0.7, armor / (armor + 90 + 45 * (g.depth - 1) + 60 * g.dread));
  }

  hurtPlayer(amt, src, { dot = false } = {}) {
    const g = this.game, p = g.player;
    if (p.dead || (!dot && p.invuln > 0)) return;
    const dmg = amt * (1 - this.drFor(p.stats.armor));
    p.life -= dmg;
    g.damagePulse = Math.min(1, g.damagePulse + (dmg / p.stats.life) * (dot ? 1 : 2.5));
    if (!dot) {
      p.hurtT = 0.25;
      g.shake(0.22);
      g.audio.play('hurt');
      g.hud.damageNumber(p.x, 2.2, p.z, dmg, false, 'player');
      g.particles.burst(p.x, 1.2, p.z, 10, 4, [3, 0.2, 0.15], 0.5, 0.3, 10, 2);
    }
    g.powers.emit('hurt', { amount: dmg, src });
    if (p.life <= 0) g.playerDied();
  }
}
