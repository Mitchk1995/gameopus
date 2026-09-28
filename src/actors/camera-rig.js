import * as THREE from 'three';

// Over-the-shoulder third-person camera. The mouse turns it; the wheel zooms. It
// pulls in when a wall, tree or hill would come between it and the player, and eases
// back out once the view is clear.

const SENS = 0.0021;
const PITCH = [-1.25, 0.95];
const ZOOM = [1.4, 9];

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
    this.fov = camera.fov;
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.shake = 0;
  }

  // Direction the camera looks (and the crosshair points).
  forward(out = this.fwd) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input, target, { sprinting = false } = {}) {
    this.yaw -= input.dx * SENS;
    this.pitch = Math.min(PITCH[1], Math.max(PITCH[0], this.pitch - input.dy * SENS));
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
    const shoulder = this.tmpA || (this.tmpA = new THREE.Vector3());
    shoulder.copy(head).addScaledVector(this.right, this.shoulder * k);
    const side = this.world.lineOfSight(head, shoulder, 0.25);
    shoulder.lerpVectors(head, shoulder, side);

    const want = this.tmpB || (this.tmpB = new THREE.Vector3());
    want.copy(shoulder).addScaledVector(this.fwd, -this.dist);
    const clear = this.world.lineOfSight(shoulder, want, 0.28);
    const reach = Math.max(0.35, this.dist * clear - 0.1);
    // Snap in immediately when blocked, ease back out.
    this.cur = reach < this.cur ? reach : this.cur + (reach - this.cur) * (1 - Math.exp(-3 * dt));

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

    const fov = this.fov + (sprinting ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-5 * dt));
      cam.updateProjectionMatrix();
    }
    return this.cur;
  }
}
