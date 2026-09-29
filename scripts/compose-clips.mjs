// Builds new combat clips out of pieces of the Universal Animation Library's own clips
// (CC0), where the library has no clip that does the job: a sword guard you can hold,
// and the jolt of a blow landing on it.
//   node scripts/compose-clips.mjs   (reads public/assets/anims/ual1.glb and ual2.glb,
//                                     writes public/assets/anims/combat.glb)
// Each clip is sampled at 30 Hz from its sources: body parts can come from different clips
// (the legs of one, the arms of another), and a clip's movement relative to its first frame
// can be layered on top of a pose, scaled.
import * as THREE from 'three';
import { stat } from 'node:fs/promises';
import { makeIO, optimizeDoc } from './optimize-gltf.mjs';
import { skeleton, addClip, sampler } from './retarget.mjs';

const HZ = 30;
const LEGS = ['root', 'pelvis', ...['thigh', 'calf', 'foot', 'ball', 'ball_leaf'].flatMap((b) => [b + '_l', b + '_r'])];
const SPINE = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'];
const side = (s) => (name) => name.endsWith('_' + s) && !LEGS.includes(name);

// One source clip: local rotation of any bone and the pelvis position at time t.
function source(doc, name) {
  const anim = doc.getRoot().listAnimations().find((a) => a.getName() === name);
  if (!anim) throw new Error('no clip ' + name);
  const rot = new Map(), pos = new Map();
  let duration = 0;
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode().getName();
    if (ch.getTargetPath() === 'rotation') rot.set(n, sampler(ch));
    if (ch.getTargetPath() === 'translation') pos.set(n, sampler(ch));
    duration = Math.max(duration, ch.getSampler().getInput().getArray().at(-1));
  }
  return {
    duration,
    q: (bone, t) => new THREE.Quaternion(...(rot.get(bone)?.(Math.min(t, duration)) ?? [0, 0, 0, 1])),
    p: (t) => new THREE.Vector3(...(pos.get('pelvis')?.(Math.min(t, duration)) ?? [0, 0, 0])),
  };
}

// Samples a pose function over a duration into the clip layout addClip writes.
function bake(skel, bones, duration, pose) {
  const n = Math.round(duration * HZ) + 1;
  const times = new Float32Array(n), rot = new Map(bones.map((b) => [b, new Float32Array(n * 4)])), pelvisT = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const t = Math.min(duration, k / HZ);
    times[k] = t;
    const { q, p } = pose(t);
    for (const b of bones) {
      const v = q.get(b);
      rot.get(b).set([v.x, v.y, v.z, v.w], k * 4);
    }
    pelvisT.set([p.x, p.y, p.z], k * 3);
  }
  for (const arr of rot.values())
    for (let k = 1; k < n; k++) {
      let d = 0;
      for (let c = 0; c < 4; c++) d += arr[k * 4 + c] * arr[k * 4 - 4 + c];
      if (d < 0) for (let c = 0; c < 4; c++) arr[k * 4 + c] *= -1;
    }
  return { times, rot, pelvisT, duration };
}

// Drops every animation of a document with its keyframe data, keeping the bones.
export function clearAnimations(doc) {
  const data = new Set();
  for (const a of doc.getRoot().listAnimations()) {
    for (const s of a.listSamplers()) {
      data.add(s.getInput());
      data.add(s.getOutput());
    }
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const acc of data) acc?.dispose();
}

// A rotation's change from `a` to `b` in the bone's own frame, scaled by w (0..1).
const delta = (a, b, w = 1) => new THREE.Quaternion().slerp(a.clone().invert().multiply(b), w);

export async function composeCombat(dir = 'public/assets/anims') {
  const io = await makeIO();
  const ual1 = await io.read(`${dir}/ual1.glb`), ual2 = await io.read(`${dir}/ual2.glb`);
  const out = await io.read(`${dir}/ual1.glb`);
  const bones = out.getRoot().listAnimations()[0].listChannels().filter((c) => c.getTargetPath() === 'rotation').map((c) => c.getTargetNode().getName());
  clearAnimations(out);
  const skel = skeleton(out);
  const only = new Set(bones);

  const stance = source(ual2, 'Idle_Shield_Loop');   // guard stance legs, breathing
  const block = source(ual2, 'Sword_Block');         // blade held upright in front
  const jolt = source(ual2, 'Idle_Shield_Break');    // a blow knocking the guard back
  const HOLD = 0.32;                                 // Sword_Block's held frame
  const armR = bones.filter(side('r')), armL = bones.filter(side('l'));
  // The block's chest orientation assumes its own crouched hips: carry it over onto the
  // stance's hips, so the chest (and the blade) stay where the block puts them.
  const hips = delta(stance.q('pelvis', 0), block.q('pelvis', HOLD));

  // Guard: stance legs and breathing, the block's chest and sword arm, and the stance's
  // raised left forearm (it reads as a guard with or without a shield on it).
  const guard = (t) => {
    const q = new Map();
    for (const b of bones) q.set(b, stance.q(b, t));
    for (const b of [...SPINE, ...armR]) {
      let v = block.q(b, HOLD).multiply(delta(stance.q(b, 0), stance.q(b, t)));
      if (b === 'spine_01') v = hips.clone().multiply(v);
      q.set(b, v);
    }
    return { q, p: stance.p(t) };
  };
  addClip(out, skel, 'Sword_Guard_Loop', bake(skel, bones, stance.duration, guard), { only });

  // Guard hit: the guard rocks back and settles, taken from the first moments of the
  // shield-break stagger, eased in and out (0.4 s).
  const HIT = 0.4, PEAK = 0.14, W = { spine_01: 0.7, spine_02: 0.7, spine_03: 0.7, neck_01: 0.5, Head: 0.5, clavicle_r: 0.6, upperarm_r: 0.45, lowerarm_r: 0.3, clavicle_l: 0.6, upperarm_l: 0.5, lowerarm_l: 0.4 };
  const guardHit = (t) => {
    const g = guard(t);
    const u = t / HIT, tau = PEAK * Math.sin(Math.PI * Math.min(1, u) ** 0.7);
    for (const [b, w] of Object.entries(W)) g.q.set(b, g.q.get(b).multiply(delta(jolt.q(b, 0), jolt.q(b, tau), w)));
    return g;
  };
  addClip(out, skel, 'Sword_Guard_Hit', bake(skel, bones, HIT, guardHit), { only });

  await optimizeDoc(out, { dropMeshes: true });
  await io.write(`${dir}/combat.glb`, out);
  return (await stat(`${dir}/combat.glb`)).size;
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const size = await composeCombat(process.argv[2]);
  console.log(`combat.glb ${(size / 1024).toFixed(0)} KB`);
}
