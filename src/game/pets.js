import * as THREE from 'three';
import { ITEMS } from './items.js';
import { buildItem } from '../ui/itemart.js';

// Pets: rare companions from bosses and from skilling. Getting one records it in the
// collection log and it starts following you; the log lets you swap which one does.

const SKILL_PETS = {
  woodcutting: { id: 'pet_sapling', chance: 1 / 900 },
  mining: { id: 'pet_golem', chance: 1 / 800 },
  fishing: { id: 'pet_frogling', chance: 1 / 850 },
};

export class Pets {
  constructor(game) {
    this.game = game;
    this.follower = null;
  }

  async init() {
    const id = this.game.state.flags.pet;
    if (id && this.owned(id)) await this.#summon(id);
  }

  owned(id) {
    return !!this.game.state.collection.log?.[id];
  }

  // A chance at the skill's pet after each resource gathered.
  roll(skill) {
    const p = SKILL_PETS[skill];
    if (p && Math.random() < p.chance) this.unlock(p.id);
  }

  async unlock(id) {
    const g = this.game;
    if (this.owned(id)) {
      g.panels.message('You have a funny feeling you would have been followed...', 'good');
      return;
    }
    g.logUnique(id);
    g.panels.message(`You have a funny feeling you're being followed. ${ITEMS[id].name} has joined you.`, 'good');
    g.audio.play('levelup');
    await this.#summon(id);
  }

  async toggle(id) {
    if (this.follower?.id === id) return this.dismiss();
    if (this.owned(id)) await this.#summon(id);
  }

  dismiss() {
    if (!this.follower) return;
    this.follower.root.parent?.remove(this.follower.root);
    this.follower = null;
    this.game.state.flags.pet = null;
  }

  async #summon(id) {
    const g = this.game;
    this.dismiss();
    let root, char = null;
    if (id === 'pet_grubling') {
      // A very small Warren King, with the real animations.
      char = await g.fight.factory.create({ model: 'puglin', skin: 2, scale: 0.42 });
      root = char.root;
      const crown = buildItem('warren_crown', g.assets);
      const head = char.bones.Head;
      const s = new THREE.Vector3();
      head.getWorldScale(s);
      crown.scale.setScalar(0.95 / s.x);
      crown.position.set(0, 0.12 / s.x, 0);
      head.add(crown);
      char.play('Idle_Loop', { fade: 0 });
    } else {
      root = new THREE.Group();
      const m = buildItem(id, g.assets);
      m.scale.setScalar(2.2);
      root.add(m);
    }
    const P = g.player.pos;
    root.position.set(P.x + 1, P.y, P.z + 1);
    g.activeScene.add(root);
    this.follower = { id, root, char, pos: root.position.clone(), yaw: 0, hop: 0, anim: 'Idle_Loop' };
    g.state.flags.pet = id;
  }

  moveTo(scene, pos) {
    if (!this.follower) return;
    scene.add(this.follower.root);
    this.follower.pos.set(pos.x + 1, pos.y, pos.z + 1);
  }

  update(dt, player) {
    const f = this.follower;
    if (!f) return;
    const w = this.game.activeWorld;
    const to = new THREE.Vector3(player.pos.x - f.pos.x, 0, player.pos.z - f.pos.z);
    const d = to.length();
    let speed = 0;
    if (d > 14) {
      // Too far behind: catch up.
      f.pos.set(player.pos.x - Math.sin(player.yaw) * 1.5, player.pos.y, player.pos.z - Math.cos(player.yaw) * 1.5);
    } else if (d > 1.8) {
      speed = Math.min(7, d * 1.6);
      f.pos.addScaledVector(to.normalize(), speed * dt);
      f.yaw = Math.atan2(to.x, to.z);
    }
    f.pos.y = w.groundAt(f.pos.x, f.pos.z, f.pos.y + 0.4);
    f.root.position.copy(f.pos);
    f.root.rotation.y += (f.yaw - f.root.rotation.y) * Math.min(1, dt * 8);
    if (f.char) {
      const clip = speed > 3 ? 'Jog_Fwd_Loop' : speed > 0.3 ? 'Walk_Loop' : 'Idle_Loop';
      if (clip !== f.anim) {
        f.anim = clip;
        f.char.play(clip, { fade: 0.2, speed: clip === 'Jog_Fwd_Loop' ? 1.3 : 1.2 });
      }
      f.char.update(dt);
    } else {
      // Little hops while moving, a slow bob at rest.
      f.hop += dt * (speed > 0.3 ? 9 : 2.5);
      f.root.position.y += speed > 0.3 ? Math.abs(Math.sin(f.hop)) * 0.18 : Math.sin(f.hop) * 0.02 + 0.02;
    }
  }
}
