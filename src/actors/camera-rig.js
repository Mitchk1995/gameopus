import * as THREE from 'three';

// Over-the-shoulder third-person camera. The mouse turns it; the wheel zooms.
//
// Collision: the camera is a ball swept back from the player's shoulder through the real
// geometry of the world (World.lineOfSight, see world/solids.js), so roofs, eaves, lintels,
// walls, props and trees hold it off wherever they really are. Three things keep it smooth
// where that geometry is fiddly (doorways, corners, low ceilings):
//  - It looks a fraction of a second ahead along the player's motion, so it starts coming in
//    before a jamb or wall arrives instead of snapping when it does. The hard limit (never
//    inside anything) is still enforced every frame; only that limit is instant.
//  - Easing back out waits until the way has been clear for a moment (hysteresis), then runs
//    as a critically damped spring, so it never hunts back and forth around a threshold.
//  - The shoulder offset slides toward centre quickly and back out slowly, in both cases
//    continuously, and never with a jump.
// Indoors (a ceiling over the head and walls around) the follow distance also shortens a
// little so the camera doesn't keep bumping the far wall.

const SENS = 0.0021;
const PITCH = [-1.25, 0.95];
const ZOOM = [1.4, 9];
const LOOK = [0.14, 0.28]; // seconds of player motion the camera looks ahead by
const HOLD = 0.22; // seconds the way must stay clear before the boom eases back out
const IN_RATE = 20; // per second: how fast it comes in (the hard limit is instant)
const OUT_W = 3.4; // spring frequency of the ease back out
const SIDE_IN = 12; // shoulder toward centre
const SIDE_OUT = 2.6; // shoulder back out
const SIDE_HOLD = 0.3;
const BAND = 0.06; // dead band: less headroom than this and the boom stays put
const INDOOR_DIST = 3.0; // follow distance in a closed room

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = -0.22;
    this.dist = 3.9;
    this.cur = 3.9;
    this.curVel = 0;
    this.hold = 0;
    this.shoulder = 0.52;
    this.height = 1.58;
    this.pivot = new THREE.Vector3();
    this.smoothY = null;
    this.sideK = 1;
    this.sideHold = 0;
    this.kSide = 1;
    this.yawVel = 0;
    this.prevYaw = null;
    this.indoor = 0;
    this.indoorAt = 0;
    this.vel = new THREE.Vector3();
    this.prev = null;
    this.fov = camera.fov;
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.shake = 0;
    this.sensitivity = 1;
    this.aimK = 0;
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.samples = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.sampleYaw = [0, 0, 0];
  }

  // After a teleport: start from the usual distance and height rather than easing there.
  snap() {
    this.cur = this.dist;
    this.curVel = 0;
    this.hold = 0;
    this.smoothY = null;
    this.sideK = 1;
    this.sideHold = 0;
    this.prev = null;
    this.vel.set(0, 0, 0);
    this.indoorAt = 0;
    this.indoorSnap = true;
    this.kSide = Math.min(1, Math.max(0, (this.dist - 0.8) / 2.2));
    this.yawVel = 0;
    this.prevYaw = null;
  }

  // Direction the camera looks (and the crosshair points).
  forward(out = this.fwd) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input, target, { sprinting = false, aiming = false } = {}) {
    // Aiming steadies the mouse and pulls the view in over the shoulder.
    this.aimK += ((aiming ? 1 : 0) - this.aimK) * (1 - Math.exp(-dt * 10));
    const turn = SENS * this.sensitivity * (1 - this.aimK * 0.35);
    if (this.lockTarget) {
      // Locked on: keep the target ahead, a little below the horizon.
      const dx = this.lockTarget.x - target.x, dz = this.lockTarget.z - target.z;
      let d = Math.atan2(-dx, -dz) - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-9 * dt));
      const wantPitch = Math.min(0.25, Math.max(-0.6, Math.atan2(this.lockTarget.y - (target.y + this.height), Math.hypot(dx, dz)) - 0.14));
      this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-6 * dt));
    } else {
      this.yaw -= input.dx * turn;
      this.pitch = Math.min(PITCH[1], Math.max(PITCH[0], this.pitch - input.dy * turn));
    }
    // How fast the camera is turning (smoothed), to look ahead along that too.
    if (this.prevYaw !== null && dt > 1e-4) {
      const dy = Math.atan2(Math.sin(this.yaw - this.prevYaw), Math.cos(this.yaw - this.prevYaw)) / dt;
      this.yawVel += (Math.abs(dy) > 12 ? 0 - this.yawVel : dy - this.yawVel) * (1 - Math.exp(-dt * 14));
    }
    this.prevYaw = this.yaw;
    if (input.wheel) this.dist = Math.min(ZOOM[1], Math.max(ZOOM[0], this.dist * (1 + input.wheel * 0.12)));

    // Follow the feet, smoothing height changes from steps and slopes.
    const y = target.y + this.height;
    this.smoothY = this.smoothY === null ? y : this.smoothY + (y - this.smoothY) * (1 - Math.exp(-14 * dt));
    if (Math.abs(this.smoothY - y) > 1.5) this.smoothY = y;
    const head = this.pivot.set(target.x, this.smoothY, target.z);
    this.forward();
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // How fast the player is moving (smoothed), to look ahead along it.
    if (this.prev && dt > 1e-4) {
      const k = 1 - Math.exp(-dt * 14);
      const vx = (target.x - this.prev.x) / dt, vz = (target.z - this.prev.z) / dt;
      if (Math.hypot(vx, vz) > 25) this.vel.set(0, 0, 0); // a teleport, not a run
      else {
        this.vel.x += (vx - this.vel.x) * k;
        this.vel.z += (vz - this.vel.z) * k;
      }
    }
    this.prev = this.prev || { x: 0, z: 0 };
    this.prev.x = target.x;
    this.prev.z = target.z;

    this.world.prepareCamera?.(head, this.dist + 1);

    // Indoors or not (a few times a second, smoothed).
    this.indoorAt -= dt;
    if (this.indoorAt <= 0 && this.world.enclosure) {
      this.indoorAt = 0.12;
      this.indoorRaw = this.world.enclosure(head.x, head.y, head.z);
      if (this.indoorSnap) this.indoor = this.indoorRaw;
      this.indoorSnap = false;
    }
    this.indoor += ((this.indoorRaw || 0) - this.indoor) * (1 - Math.exp(-dt * 2.5));
    let dist = this.dist + (Math.min(this.dist, 2.6) - this.dist) * this.aimK;
    dist += (Math.min(dist, INDOOR_DIST) - dist) * this.indoor;

    // The lens (near-plane corners) reaches this far around the camera point. The hard ball
    // that must never touch anything is a little bigger; the shoulder decisions use a roomier
    // one, so the shoulder has slid toward centre (smoothly) long before the hard one binds.
    const cam = this.camera;
    const th = Math.tan((cam.fov * Math.PI) / 360), nh = cam.near * th, nw = nh * cam.aspect;
    const lens = Math.hypot(cam.near, nw, nh);
    const pad = lens + 0.03, comfy = pad + 0.13;

    // The shoulder offset shrinks as the camera comes in, so close up it's centred. It follows
    // the boom smoothly, so a sudden pull-in never snaps the shoulder as well.
    const kWant = Math.min(1, Math.max(0, (this.cur - 0.8) / 2.2));
    this.kSide += (kWant - this.kSide) * (1 - Math.exp(-dt * 8));
    const off = (this.shoulder + this.aimK * 0.14) * this.kSide;
    const A = this.tmpA, B = this.tmpB;
    const los = (a, b, r = pad) => this.world.lineOfSight(a, b, r, true, r);
    // Sample poses: the head now, and where it (and the mouse) will be shortly if they keep going.
    const S = this.samples, DY = this.sampleYaw;
    S[0].copy(head);
    DY[0] = 0;
    let ns = 1;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.8 || Math.abs(this.yawVel) > 0.4) {
      for (const t of LOOK) {
        const s = S[ns];
        s.set(head.x + this.vel.x * t, head.y, head.z + this.vel.z * t);
        DY[ns] = Math.max(-0.6, Math.min(0.6, this.yawVel * t));
        // Not through a wall: stop where the player would.
        if (speed > 0.8) {
          B.copy(s);
          const f = los(head, B);
          if (f < 1) s.copy(head).lerp(B, f);
        }
        ns++;
      }
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // How far a ball gets back from the shoulder point s of the way out to the side, from
    // sample i (its own head position and turn).
    const boom = (i, s, r = pad) => {
      const p = S[i], cy = Math.cos(this.yaw + DY[i]), sy = Math.sin(this.yaw + DY[i]);
      A.set(p.x + cy * off * s, p.y, p.z - sy * off * s);
      B.set(A.x + sy * cp * dist, A.y - sp * dist, A.z + cy * cp * dist);
      return dist * los(A, B, r);
    };
    const lateral = (i, r = pad) => {
      const p = S[i], cy = Math.cos(this.yaw + DY[i]), sy = Math.sin(this.yaw + DY[i]);
      A.set(p.x + cy * off, p.y, p.z - sy * off);
      return los(p, A, r);
    };

    // The shoulder only helps while it costs nothing: when stepping to the side would hit a
    // wall or shorten the view (a door jamb, a corner), it backs off toward centre.
    let sTarget = 1, hard = 1;
    if (off > 0.001) {
      hard = lateral(0);
      const roomy = lateral(0, comfy);
      sTarget = roomy >= 0.999 ? 1 : roomy;
      const bases = [];
      for (let i = 0; i < ns; i++) bases.push(boom(i, 0));
      const ok = (s) => {
        for (let i = 0; i < ns; i++) {
          if (i > 0 && lateral(i, comfy) < 0.999) return false;
          if (boom(i, s) < bases[i] - 0.3) return false;
        }
        return true;
      };
      const top = sTarget;
      sTarget = 0;
      for (const f of [1, 0.66, 0.33]) {
        if (ok(top * f)) {
          sTarget = top * f;
          break;
        }
      }
    }
    // In quickly, out slowly and only once it has stayed clear; always continuous.
    if (sTarget < this.sideK - 0.001) {
      this.sideK += (sTarget - this.sideK) * (1 - Math.exp(-dt * SIDE_IN));
      this.sideHold = SIDE_HOLD;
    } else {
      this.sideHold -= dt;
      if (this.sideHold <= 0) this.sideK += (sTarget - this.sideK) * (1 - Math.exp(-dt * SIDE_OUT));
    }
    // The shoulder point itself is never inside a wall.
    this.sideK = Math.min(this.sideK, hard);

    // How far the camera could go right now (hard), and how far the look-ahead says it will
    // soon be able to (soft).
    const reach = boom(0, this.sideK);
    let soft = reach;
    // The future boom uses where the shoulder is heading, not where it is.
    for (let i = 1; i < ns; i++) soft = Math.min(soft, boom(i, sTarget));
    const safe = Math.max(0, reach - 0.04);
    const want = Math.max(0, Math.min(safe, soft - 0.04));
    if (want < this.cur) {
      // Come in fast (a pull-in may be instant only where the hard limit demands it).
      this.cur += (want - this.cur) * (1 - Math.exp(-dt * IN_RATE));
      this.curVel = 0;
      this.hold = HOLD;
    } else if (want > this.cur + BAND) {
      // A withdrawing shoulder has not cleared the doorway yet. Extending the boom
      // during that transition can produce an out/in pulse as enclosure catches up.
      if (this.sideHold > 0) this.hold = HOLD;
      // Room to spare: wait a moment after both offsets settle, then spring out.
      this.hold -= dt;
      if (this.hold <= 0) {
        const w = OUT_W;
        this.curVel += (w * w * (want - this.cur) - 2 * w * this.curVel) * dt;
        this.cur = Math.min(want, this.cur + this.curVel * dt);
      } else this.curVel = 0;
    } else {
      this.hold = want < dist - 0.03 ? HOLD : 0;
      this.curVel = 0;
    }
    this.cur = Math.min(this.cur, safe);

    A.copy(head).addScaledVector(this.right, off * this.sideK);
    cam.position.copy(A).addScaledVector(this.fwd, -this.cur);
    const floor = this.world.heightAt(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < floor) cam.position.y = floor;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.12;
      // The shake never carries the lens into a wall: it stops where a lens-sized ball would.
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      A.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0).applyQuaternion(cam.quaternion);
      B.copy(cam.position).add(A);
      cam.position.lerp(B, this.world.lineOfSight(cam.position, B, lens + 0.01, true, lens + 0.01));
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const fov = this.fov + (sprinting ? 6 : 0) - this.aimK * 12;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 5));
      cam.updateProjectionMatrix();
    }
    return this.cur;
  }
}
