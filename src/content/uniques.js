// Uniques: fixed stat lines + a power built from triggers (see game/powers.js) and
// actions (see game/actions.js). `asc` is true for the Ascendant version of the item.
// This file is where most new loot gets written.
export const UNIQUES = [
  {
    id: 'stormcaller',
    name: "Stormcaller's Loop",
    slot: 'ring',
    stats: [['critChance', 6, 10], ['lightningDmg', 6, 12]],
    flavor: 'The bellringers of Vael tied lightning to their fingers so the storm would know them.',
    power: {
      text: (asc) => `Critical hits unleash Chain Lightning that arcs to ${asc ? 9 : 5} enemies.`,
      on: {
        crit(g, ev, inst) {
          const t = g.time;
          if (t - (inst.state.last || 0) < 0.12) return;
          inst.state.last = t;
          g.actions.chainLightning(ev.enemy.x, ev.enemy.z, ev.enemy, inst.asc ? 9 : 5, 1.1);
        },
      },
    },
  },
  {
    id: 'emberwake',
    name: 'Emberwake Treads',
    slot: 'boots',
    stats: [['moveSpd', 10, 18], ['fireDmg', 4, 9]],
    flavor: 'Whoever wore them last is still walking, somewhere, still burning.',
    power: {
      text: (asc) => `Dashing leaves a trail of fire that burns enemies for ${asc ? 6 : 3} seconds.`,
      update(g, dt, inst) {
        const p = g.player;
        if (p.dashT <= 0) {
          inst.state.acc = 0;
          return;
        }
        inst.state.acc = (inst.state.acc || 0) + p.stats.moveSpeed * 5 * dt;
        if (inst.state.acc > 0.8) {
          inst.state.acc = 0;
          g.actions.firePatch(p.x, p.z, 1.3, 0.9, inst.asc ? 6 : 3);
        }
      },
    },
  },
  {
    id: 'hollowstar',
    name: 'Heart of the Hollow Star',
    slot: 'amulet',
    stats: [['life', 20, 40], ['area', 10, 20]],
    flavor: 'It fell from a sky that was never there. It is still falling.',
    power: {
      text: (asc) => `Enemies you slay have a ${asc ? 45 : 25}% chance to implode, damaging nearby enemies. Implosions can chain.`,
      on: {
        kill(g, ev, inst) {
          const depth = ev.chainDepth || 0;
          if (depth > 7 || Math.random() > (inst.asc ? 0.45 : 0.25)) return;
          const { x, z } = ev;
          g.schedule(0.12 + Math.random() * 0.08, () =>
            g.actions.nova(x, z, 3.4, 1.4, 'void', { chainDepth: depth + 1, implode: true }),
          );
        },
      },
    },
  },
  {
    id: 'orrery',
    name: 'The Orrery',
    slot: 'helm',
    stats: [['mana', 20, 40], ['cdr', 8, 12]],
    flavor: 'Three moons, bound to one skull. They are not happy about it.',
    power: {
      text: (asc) => `${asc ? 5 : 3} arcane moons orbit you, striking enemies they pass through.`,
      update(g, dt, inst) {
        const n = inst.asc ? 5 : 3;
        const s = inst.state;
        s.a = (s.a || 0) + dt * 2.3;
        s.hits ||= new WeakMap();
        const p = g.player;
        const R = 2.7 * p.stats.areaMult;
        for (let i = 0; i < n; i++) {
          const a = s.a + (i / n) * Math.PI * 2;
          const x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R;
          g.particles.spawn(x, 1.2, z, 0, 0, 0, 0.25, 0.9, 1.8, 0.9, 4.5);
          g.particles.spawn(x, 1.2, z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.5, 0.35, 1.2, 0.5, 3.5);
          for (const e of g.enemies.near(x, z, 0.7)) {
            const last = s.hits.get(e) || 0;
            if (g.time - last < 0.45) continue;
            s.hits.set(e, g.time);
            g.combat.playerHit(e, 0.45, { kind: 'orb', element: 'arcane', noProc: true });
          }
        }
      },
    },
  },
  {
    id: 'rimebite',
    name: 'Rimebite',
    slot: 'weapon',
    stats: [['coldDmg', 6, 12], ['atkSpd', 8, 14]],
    implicitMult: 1.25,
    flavor: 'Forged in a winter that ate its own smith.',
    power: {
      text: (asc) => `Your cleaves launch ${asc ? 5 : 3} piercing ice shards that chill enemies.`,
      on: {
        attack(g, ev, inst) {
          g.actions.shards(g.player.x, g.player.z, ev.angle, inst.asc ? 5 : 3, 0.55, 0.6);
        },
      },
    },
  },
  {
    id: 'gravemantle',
    name: 'Gravemantle',
    slot: 'chest',
    stats: [['armor', 25, 45], ['lifeOnHit', 3, 6]],
    flavor: 'Stitched from burial shrouds. The dead inside are loyal, in their way.',
    power: {
      text: (asc) => `Slain enemies have a ${asc ? 30 : 15}% chance to release a vengeful soul that hunts ${asc ? 5 : 3} more.`,
      on: {
        kill(g, ev, inst) {
          if ((ev.chainDepth || 0) > 3 || Math.random() > (inst.asc ? 0.3 : 0.15)) return;
          g.actions.soul(ev.x, ev.z, inst.asc ? 5 : 3, 1.0, (ev.chainDepth || 0) + 1);
        },
      },
    },
  },
  {
    id: 'metronome',
    name: 'Grips of the Metronome',
    slot: 'gloves',
    stats: [['atkSpd', 10, 16], ['critDmg', 30, 55]],
    flavor: 'Keep time. Keep time. Keep time.',
    power: {
      text: (asc) => `Every ${asc ? 3 : 4}th cleave is a Thunderclap: a guaranteed critical strike with double area that shakes the ground.`,
      hud: true,
      on: {
        swing(g, ev, inst) {
          const n = inst.asc ? 3 : 4;
          inst.state.count = ((inst.state.count || 0) % n) + 1;
          g.hud.setRhythm(inst.state.count, n);
          if (inst.state.count === n) {
            ev.forceCrit = true;
            ev.areaMult *= 2;
            ev.thunderclap = true;
          }
        },
        attack(g, ev) {
          if (!ev.thunderclap) return;
          const p = g.player;
          g.actions.nova(p.x, p.z, 4.5, 1.3, 'lightning', { noProc: true, quiet: true });
          g.shake(0.55);
          g.hitstop(0.06);
          g.audio.play('thunderclap');
        },
      },
    },
  },
  {
    id: 'greedmaw',
    name: "Greedmaw's Locket",
    slot: 'amulet',
    stats: [['magicFind', 30, 55], ['goldFind', 40, 80]],
    flavor: 'It hungers. You are only its hands.',
    power: {
      text: (asc) => `Picking up gold heals you. ${asc ? 12 : 6}% chance for gold to erupt into a fountain of coins.`,
      on: {
        pickup(g, ev, inst) {
          if (ev.kind !== 'gold') return;
          g.player.heal(g.player.stats.life * 0.015);
          if (!ev.fountain && Math.random() < (inst.asc ? 0.12 : 0.06)) g.loot.goldFountain(ev.x, ev.z);
        },
      },
    },
  },
];

export const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));
