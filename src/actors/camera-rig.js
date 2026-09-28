import * as THREE from 'three';

// Over-the-shoulder third-person camera. The mouse turns it; the wheel zooms. It
// pulls in when a wall, tree or hill would come between it and the player, and eases
// back out once the view is clear.

const SENS = 0.0021;
const PITCH = [-1.25, 0.95];
const ZOOM = [1.4, 9];
// How far the camera keeps from walls, ceilings and trunks. The lens (near-plane corners) reaches
// about 0.12 m around the camera point, so this keeps it clear, yet still fits doorways.
const PAD = 0.2;

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = -0.22;
    this.dist = 3.9;
    this.cur = 3.9;
    this.shoulder = 0.52;
    this.height = 1.58;
    this.pivot = new THREE.Vector3();
    this.smoothY = null;
    this.sideK = 1;
    this.fov = camera.fov;
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.shake = 0;
    this.sensitivity = 1;
    this.aimK = 0;
  }

  // After a teleport: start from the usual distance and height rather than easing there.
  snap() {
    this.cur = this.dist;
    this.smoothY = null;
    this.sideK = 1;
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
    if (input.wheel) this.dist = Math.min(ZOOM[1], Math.max(ZOOM[0], this.dist * (1 + input.wheel * 0.12)));

    // Follow the feet, smoothing height changes from steps and slopes.
    const y = target.y + this.height;
    this.smoothY = this.smoothY === null ? y : this.smoothY + (y - this.smoothY) * (1 - Math.exp(-14 * dt));
    if (Math.abs(this.smoothY - y) > 1.5) this.smoothY = y;
    const head = this.pivot.set(target.x, this.smoothY, target.z);

    this.forward();
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    // The shoulder offset shrinks as the camera comes in, so close up it's centred.
    const k = Math.min(1, Math.max(0, (this.cur - 0.8) / 2.2));
    const off = (this.shoulder + this.aimK * 0.14) * k;
    const dist = this.dist + (Math.min(this.dist, 2.6) - this.dist) * this.aimK;
    const shoulder = this.tmpA || (this.tmpA = new THREE.Vector3());
    const want = this.tmpB || (this.tmpB = new THREE.Vector3());
    // How far a ball the camera's size gets back from the shoulder point s of the way
    // out to the side (0 = over the head): it stops at the first wall, ceiling, roof or trunk.
    const boom = (s) => {
      shoulder.copy(head).addScaledVector(this.right, off * s);
      want.copy(shoulder).addScaledVector(this.fwd, -dist);
      return dist * this.world.lineOfSight(shoulder, want, PAD, true);
    };
    // The shoulder only helps while it costs nothing: when stepping to the side would
    // hit a wall or shorten the view (a door jamb, a corner), slide back toward centre.
    let sMax = 1;
    if (off > 0.001) {
      const base = boom(0), tmp = this.tmpC || (this.tmpC = new THREE.Vector3());
      const ok = (s) => {
        tmp.copy(head).addScaledVector(this.right, off * s);
        return this.world.lineOfSight(head, tmp, PAD, true) > 0.999 && boom(s) >= base - 0.05;
      };
      if (!ok(1)) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (ok(mid)) lo = mid;
          else hi = mid;
        }
        sMax = lo;
      }
    }
    // Pull to the limit at once, ease back out after it clears.
    const eased = this.sideK + (1 - this.sideK) * (1 - Math.exp(-dt * 6));
    this.sideK = Math.min(sMax, eased);
    // Sweep the ball back; it can come all the way in to the head if it has to.
    const reach = Math.max(0, boom(this.sideK) - 0.04);
    // Snap in immediately when blocked (so it never shows the inside of a wall), ease back out.
    this.cur = reach < this.cur ? reach : this.cur + (reach - this.cur) * (1 - Math.exp(-4 * dt));

    const cam = this.camera;
    cam.position.copy(shoulder).addScaledVector(this.fwd, -this.cur);
    const floor = this.world.heightAt(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < floor) cam.position.y = floor;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const fov = this.fov + (sprinting ? 6 : 0) - this.aimK * 12;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-5 * dt));
      cam.updateProjectionMatrix();
    }
    return this.cur;
  }
}
