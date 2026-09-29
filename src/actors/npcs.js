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
    this.routine = def.routine || null;
    this.leg = 0;
    this.pause = Math.random() * 3;
    if (this.routine) {
      this.routineStop = this.routine[0];
      this.leg = 1 % this.routine.length;
      this.pause = this.routineStop.wait || 0;
    }
    this.talking = false;
    this.char.play(def.idle || 'Idle_Loop', { fade: 0 });
    this.char.mixer.update(Math.random() * 3);
    this.#sync();
    if (!this.route && !this.routine) world.colliders.addCircle(def.x, def.z, 0.35, this.pos.y - 1, this.pos.y + 1.9).keepCamera = true;
  }

  get target() {
    return { kind: 'npc', npc: this, x: this.pos.x, y: this.pos.y + 1.0, z: this.pos.z, r: 0.45, h: 2.0, reach: this.def.reach ?? 3.2 };
  }

  update(dt, player) {
    const d = player ? Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : 99;
    if (this.talking && player) {
      this.#turn(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 6);
      this.#setAnim(this.def.talkAnim || 'Idle_Talking_Loop');
    } else if (this.routine) {
      this.#round(dt, player, d);
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

  // Authored household rounds use checked waypoints and substantial work stops.
  // A visitor freezes the round, including its timer, so an NPC never wanders
  // away while being approached or talked to. Obstacles stop motion rather than
  // allowing a routine to carry someone through a shut door or a wall.
  #round(dt, player, playerDist) {
    this.blocked = false;
    this.waitingForDoor = false;
    const stop = this.routineStop;
    if (playerDist < (this.def.approachDistance || 2.2)) {
      if (player) this.#turn(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 3);
      this.#setAnim(this.def.idle || 'Idle_Loop');
      return;
    }
    if (this.pause > 0) {
      this.pause = Math.max(0, this.pause - dt);
      this.#turn(stop.facing ?? this.baseYaw, dt, 3);
      this.#setAnim(stop.idle || this.def.idle || 'Idle_Loop');
      return;
    }
    const target = this.routine[this.leg];
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist < 0.04) {
      this.routineStop = target;
      this.pause = target.wait || 0;
      this.leg = (this.leg + 1) % this.routine.length;
      return;
    }
    const door = this.def.routineDoor;
    if (target.door && door) {
      const at = door.target || door.def;
      if (at && Math.hypot(this.pos.x - at.x, this.pos.z - at.z) < 1.6) {
        if (!door.open) door.use();
        if (!door.open || door.t < 0.98) {
          this.waitingForDoor = true;
          this.#setAnim('Idle_Loop');
          return;
        }
      }
    }
    const speed = this.def.speed || 1.0, step = Math.min(dist, speed * dt);
    const forward = { x: dx / dist, z: dz / dist };
    const nearby = (this.neighbours || []).filter((n) => n !== this && Math.abs(n.pos.y - this.pos.y) < 1.5 && Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z) < 1.7);
    const ahead = nearby.find((n) => {
      const x = n.pos.x - this.pos.x, z = n.pos.z - this.pos.z;
      return x * forward.x + z * forward.z > -0.1 && Math.abs(x * forward.z - z * forward.x) < 0.8;
    });
    const candidates = [];
    if (ahead) {
      const x = ahead.pos.x - this.pos.x, z = ahead.pos.z - this.pos.z, distance = Math.hypot(x, z) || 1;
      // Pass to the right. Opposing walkers choose opposite physical sides;
      // tangent alternatives let someone yield in a narrow doorway safely.
      const tangent = { x: z / distance, z: -x / distance };
      candidates.push({ x: forward.x * 0.35 + tangent.x, z: forward.z * 0.35 + tangent.z });
      candidates.push(tangent, { x: -tangent.x, z: -tangent.z });
    }
    candidates.push(forward);
    let next = null;
    for (const direction of candidates) {
      const length = Math.hypot(direction.x, direction.z);
      const x = this.pos.x + direction.x / length * step, z = this.pos.z + direction.z / length * step;
      if (nearby.some((n) => Math.hypot(n.pos.x - x, n.pos.z - z) < 0.65)) continue;
      const y = this.world.groundAt(x, z, this.pos.y + 0.3);
      const candidate = (this._next ??= new THREE.Vector3()).set(x, y, z);
      this.world.colliders.push(candidate, 0.3, 1.8, 0.4);
      if (Math.hypot(candidate.x - x, candidate.z - z) > 0.015 || Math.abs(y - this.pos.y) > 0.45 || (this.world.waterDepth?.(x, z) ?? 0) > 0.15) continue;
      next = candidate;
      break;
    }
    if (!next) {
      this.blocked = true;
      this.#setAnim('Idle_Loop');
      return;
    }
    const moveYaw = Math.atan2(next.x - this.pos.x, next.z - this.pos.z);
    this.pos.copy(next);
    this.#turn(moveYaw, dt, 5);
    this.#setAnim('Walk_Loop', speed / 0.97);
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
