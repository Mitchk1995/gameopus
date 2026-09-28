import * as THREE from 'three';
import { buildItem } from '../ui/itemart.js';
import { ITEMS } from '../game/items.js';

// Aiming: bows and spells. The library has no archery clips, so the aim is built on
// top of whatever the legs are doing: the upper body blends into a casting pose (left
// arm out), the spine tips toward where you're looking, and two-bone IK puts the bow
// hand on the line of sight and the draw hand at the cheek. The bow, its string and
// the nocked arrow are placed in world space from the hands each frame.

const UPPER = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'];
const UP = new THREE.Vector3(0, 1, 0);

const v = () => new THREE.Vector3();
const _a = v(), _b = v(), _c = v(), _d = v(), _e = v(), _t = v(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class AimRig {
  constructor(character, assets) {
    this.char = character;
    this.bones = character.bones;
    this.assets = assets;
    this.weight = 0;
    this.draw = 0;
    this.mode = null;
    this.pose = sample(character.clips.get('Spell_Simple_Idle_Loop'), 0.4, this.bones);
    this.dir = new THREE.Vector3(0, 0, 1);
    this.nock = new THREE.Vector3();
    this.cast = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = 'aim';
  }

  // The equipped ranged weapon ('bow' item id, a staff, or nothing).
  setWeapon(id, style) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.mode = style || null;
    this.group.clear();
    this.bow = null;
    if (style !== 'bow') return;
    // The bow, with its own string swapped for a live one.
    const bow = buildItem(id, this.assets);
    const art = bow.children[0];
    art.children[art.children.length - 1].visible = false;
    this.L = 0.62 * (ITEMS[id].art.len || 1);
    this.bow = bow;
    const cord = new THREE.MeshStandardMaterial({ color: 0xefe8d2, roughness: 0.7 });
    this.strings = [0, 1].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 4, 1, true), cord));
    this.arrow = arrowMesh();
    this.group.add(bow, ...this.strings, this.arrow);
  }

  // Scene the bow lives in (it's placed in world space).
  attach(scene) {
    scene.add(this.group);
  }

  // After the animation: blend in the aim, bend the spine, reach with the arms.
  //   active: aiming this frame; dir: world aim direction; draw: 0..1; nocked: show an arrow
  apply(dt, { active, dir, draw = 0, nocked = false, yaw }) {
    const target = active ? 1 : 0;
    this.weight += (target - this.weight) * (1 - Math.exp(-dt * (active ? 16 : 9)));
    if (dir) this.dir.copy(dir).normalize();
    this.draw = draw;
    const w = this.weight;
    const B = this.bones;
    const root = this.char.root;
    if (w > 0.002) {
      for (const name of UPPER) {
        const q = this.pose[name];
        if (q && B[name]) B[name].quaternion.slerp(q, w);
      }
      // Lean the chest toward the aim pitch, shared over the upper spine.
      const pitch = Math.asin(THREE.MathUtils.clamp(this.dir.y, -1, 1));
      const right = _a.set(Math.cos(yaw), 0, -Math.sin(yaw));
      root.updateMatrixWorld(true);
      for (const [name, share] of [['spine_02', 0.3], ['spine_03', 0.35]]) {
        const b = B[name];
        b.getWorldQuaternion(_q);
        const axis = _b.copy(right).applyQuaternion(_q.invert());
        b.quaternion.multiply(_q2.setFromAxisAngle(axis, -pitch * share * w));
        b.updateMatrixWorld(true);
      }
      // Bow (or casting) arm: straight out along the line of sight.
      const sh = B.upperarm_l.getWorldPosition(_c);
      const reach = armLength(B.upperarm_l, B.lowerarm_l, B.hand_l);
      const aimTarget = _d.copy(sh).addScaledVector(this.dir, reach * 0.97);
      const pole = _e.copy(sh).addScaledVector(UP, -0.5).addScaledVector(right, -0.3);
      blendIK(B.upperarm_l, B.lowerarm_l, B.hand_l, aimTarget, pole, w);
      if (this.mode === 'bow') {
        // Draw hand: from the string at rest back to the cheek.
        const grip = B.hand_l.getWorldPosition(_t);
        const rest = _d.copy(grip).addScaledVector(this.dir, -0.12);
        const head = B.Head.getWorldPosition(_e);
        const cheek = head.addScaledVector(right, 0.02).addScaledVector(UP, -0.07).addScaledVector(this.dir, 0.05);
        const hand = rest.lerp(cheek, easeDraw(draw));
        const shr = B.upperarm_r.getWorldPosition(_c);
        const poleR = _b.copy(shr).addScaledVector(right, 0.6).addScaledVector(this.dir, -0.5).addScaledVector(UP, 0.25);
        blendIK(B.upperarm_r, B.lowerarm_r, B.hand_r, hand, poleR, w);
      }
    }
    this.#place(w, nocked, yaw);
  }

  // Bow in the left hand; string from each tip to the draw hand; arrow on the string.
  #place(w, nocked, yaw) {
    if (!this.bow) return;
    const B = this.bones;
    const grip = B.hand_l.getWorldPosition(_a);
    // Aiming: upright in the aim plane with a slight cant. Carried: hanging along the
    // left side, tip up.
    const fwd = w > 0.5 ? _b.copy(this.dir) : _b.set(Math.sin(yaw), 0, Math.cos(yaw)).lerp(this.dir, w * 2).normalize();
    const cant = 0.34 * w;
    const up = _c.copy(UP).addScaledVector(fwd, -fwd.dot(UP)).normalize();
    up.applyAxisAngle(fwd, -cant);
    const x = _d.crossVectors(up, fwd).normalize();
    _m.makeBasis(x, up, fwd);
    this.bow.quaternion.setFromRotationMatrix(_m);
    this.bow.position.copy(grip).addScaledVector(fwd, 0.02 * w);
    this.bow.updateMatrixWorld(true);
    const L = this.L;
    const top = _t.set(0, L, -0.108).applyMatrix4(this.bow.matrixWorld);
    const bottom = _e.set(0, -L, -0.108).applyMatrix4(this.bow.matrixWorld);
    const rest = new THREE.Vector3().addVectors(top, bottom).multiplyScalar(0.5);
    const hand = B.hand_r.getWorldPosition(new THREE.Vector3());
    // The string meets the fingers only while drawn.
    const nock = w > 0.3 && this.draw > 0.02 ? rest.clone().lerp(hand.addScaledVector(fwd, 0.03), Math.min(1, w)) : rest;
    this.nock.copy(nock);
    stretch(this.strings[0], top, nock);
    stretch(this.strings[1], bottom, nock);
    this.arrow.visible = nocked && w > 0.6;
    if (this.arrow.visible) {
      this.arrow.position.copy(nock);
      this.arrow.quaternion.setFromUnitVectors(UP, _b.copy(fwd));
    }
  }

  // Where spells leave from: just in front of the casting hand.
  castPoint(out = this.cast) {
    return this.bones.hand_l.getWorldPosition(out).addScaledVector(this.dir, 0.12);
  }
}

// Local rotations of each bone at time t of a clip, without touching the character.
function sample(clip, t, bones) {
  const out = {};
  if (!clip) return out;
  for (const track of clip.tracks) {
    const [name, prop] = track.name.split('.');
    if (prop !== 'quaternion' || !bones[name]) continue;
    const r = track.createInterpolant().evaluate(Math.min(t, clip.duration));
    out[name] = new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize();
  }
  return out;
}

function armLength(upper, lower, end) {
  const a = upper.getWorldPosition(v()), b = lower.getWorldPosition(v()), c = end.getWorldPosition(v());
  return a.distanceTo(b) + b.distanceTo(c);
}

// Turns a bone (in world terms) so that its child point moves from `now` toward `want`.
function aim(bone, now, want, w = 1) {
  const p = bone.getWorldPosition(v());
  const from = now.clone().sub(p).normalize(), to = want.clone().sub(p).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  if (w < 1) delta.slerp(new THREE.Quaternion(), 1 - w);
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(delta.multiply(world)));
  bone.updateMatrixWorld(true);
}

// Two-bone IK with a pole for the elbow, blended by w.
function blendIK(upper, lower, end, target, pole, w) {
  const a = upper.getWorldPosition(v()), b = lower.getWorldPosition(v()), c = end.getWorldPosition(v());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const t = target.clone().sub(a);
  const d = THREE.MathUtils.clamp(t.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = t.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const bend = pole.clone().sub(a);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0);
  bend.normalize();
  const elbow = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(bend, l1 * Math.sqrt(1 - cosA * cosA));
  aim(upper, b, elbow, w);
  const hand = a.clone().addScaledVector(dir, d);
  aim(lower, end.getWorldPosition(v()), hand, w);
}

// A thin cylinder from a to b.
function stretch(m, a, b) {
  const d = b.clone().sub(a), len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, Math.max(1e-3, len), 1);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
}

// Pulls slow at the start and fast at the end, like a real draw.
function easeDraw(t) {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 2);
}

// One arrow, nock at the origin, pointing along +Y.
export function arrowMesh(tip = 0xb7773f) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.72, 5), new THREE.MeshStandardMaterial({ color: 0xc8a57a, roughness: 0.7 }));
  shaft.position.y = 0.36;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, 4), new THREE.MeshStandardMaterial({ color: tip, metalness: 1, roughness: 0.35 }));
  head.position.y = 0.745;
  const vane = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.9, side: THREE.DoubleSide });
  const fl = new THREE.Shape();
  fl.moveTo(0, 0);
  fl.lineTo(0.018, 0.015);
  fl.lineTo(0.018, 0.075);
  fl.lineTo(0, 0.09);
  const fg = new THREE.ShapeGeometry(fl);
  g.add(shaft, head);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(fg, vane);
    f.position.y = 0.02;
    f.rotation.y = (k / 3) * Math.PI * 2;
    g.add(f);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
