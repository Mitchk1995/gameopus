import * as THREE from 'three';

// Villagers. Each has a look (outfit, hair, tint), a place to stand or a loop to
// walk, an idle animation, and what happens when you talk to them. They turn to face
// you when you're close and talking.

export class Npc {
  constructor(def, character, world) {
    this.def = def;
    this.name = def.name;
    this.char = character;
    this.world = world;
    this.home = new THREE.Vector3(def.x, 0, def.z);
    this.pos = new THREE.Vector3(def.x, world.groundAt(def.x, def.z, 1e4), def.z);
    this.yaw = def.facing ?? 0;
    this.baseYaw = this.yaw;
    this.route = def.route || null;
    this.leg = 0;
    this.pause = Math.random() * 3;
    this.talking = false;
    this.char.play(def.idle || 'Idle_Loop', { fade: 0 });
    this.char.mixer.update(Math.random() * 3);
    this.#sync();
    if (!this.route) world.colliders.addCircle(def.x, def.z, 0.35, this.pos.y - 1, this.pos.y + 1.9);
  }

  get target() {
    return { kind: 'npc', npc: this, x: this.pos.x, y: this.pos.y + 1.0, z: this.pos.z, r: 0.45, h: 2.0, reach: this.def.reach ?? 3.2 };
  }

  update(dt, player) {
    const d = player ? Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : 99;
    if (this.talking && player) {
      this.#turn(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 6);
      this.#setAnim(this.def.talkAnim || 'Idle_Talking_Loop');
    } else if (this.route) {
      this.#walk(dt, d);
    } else {
      // Glance at the player when they come close.
      const want = d < 4 && player ? Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : this.baseYaw;
      this.#turn(want, dt, 2.5);
      this.#setAnim(this.def.idle || 'Idle_Loop');
    }
    this.char.update(dt);
    this.#sync();
  }

  #walk(dt, playerDist) {
    if (this.pause > 0 || playerDist < 1.4) {
      this.pause -= dt;
      this.#setAnim(this.def.idle || 'Idle_Loop');
      return;
    }
    const [tx, tz] = this.route[this.leg];
    const dx = tx - this.pos.x, dz = tz - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      this.leg = (this.leg + 1) % this.route.length;
      this.pause = 1 + Math.random() * 4;
      return;
    }
    const speed = this.def.speed || 1.1;
    this.#turn(Math.atan2(dx, dz), dt, 5);
    const step = Math.min(dist, speed * dt);
    this.pos.x += (dx / dist) * step;
    this.pos.z += (dz / dist) * step;
    this.pos.y = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
    this.#setAnim('Walk_Loop', speed / 0.97);
  }

  #turn(target, dt, rate) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, rate * dt);
  }

  #setAnim(name, speed = 1) {
    if (this.anim === name) return;
    this.anim = name;
    this.char.play(name, { fade: 0.3, speed });
  }

  #sync() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
  }
}
