// Retargets animation clips from another humanoid rig onto the Universal Animation Library
// rig the game's people use, at build time, so the game loads them like its own clips.
//
// How: both rigs stand in a T-pose at rest. For each mapped bone the clip's world-space
// rotation relative to that rest pose is put onto the matching bone of our rig (world
// rotation = source world rotation * source rest^-1 * target rest), then turned back into
// a local rotation under the target's (already retargeted) parent. Bones with no match
// keep their rest rotation, except the fingers, which take a sword grip from one of our
// own clips (the source rigs have no fingers). The hips' movement is scaled by leg length.
//
// Used by scripts/fetch-assets.mjs (step `kaykit`); see there for the clip list.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// Value of a glTF animation channel at time t (linear, slerp for rotations).
function sampler(ch) {
  const s = ch.getSampler();
  const times = s.getInput().getArray(), vals = s.getOutput().getArray();
  const n = ch.getTargetPath() === 'rotation' ? 4 : 3;
  const cubic = s.getInterpolation() === 'CUBICSPLINE';
  const stride = cubic ? n * 3 : n, off = cubic ? n : 0;
  const a = new THREE.Quaternion(), b = new THREE.Quaternion();
  return (t) => {
    let i = 0;
    if (t <= times[0]) i = 0;
    else if (t >= times[times.length - 1]) i = times.length - 1;
    else {
      let lo = 0, hi = times.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid;
      }
      i = lo;
    }
    const j = Math.min(i + 1, times.length - 1);
    const f = j === i ? 0 : THREE.MathUtils.clamp((t - times[i]) / (times[j] - times[i]), 0, 1);
    const p = i * stride + off, q = j * stride + off;
    if (n === 4) {
      a.set(vals[p], vals[p + 1], vals[p + 2], vals[p + 3]);
      b.set(vals[q], vals[q + 1], vals[q + 2], vals[q + 3]);
      return a.slerp(b, f).normalize().toArray();
    }
    return [0, 1, 2].map((k) => vals[p + k] + (vals[q + k] - vals[p + k]) * f);
  };
}

// A rig's bones: name -> { node, parent name, rest t/r/s }, in parent-first order.
export function skeleton(doc) {
  const scene = doc.getRoot().listScenes()[0];
  const list = [];
  const walk = (n, parent) => {
    if (!n.getMesh()) list.push({ name: n.getName(), node: n, parent, t: new THREE.Vector3(...n.getTranslation()), r: new THREE.Quaternion(...n.getRotation()), s: new THREE.Vector3(...n.getScale()) });
    for (const c of n.listChildren()) walk(c, n.getMesh() ? parent : n.getName());
  };
  for (const n of scene.listChildren()) walk(n, null);
  return { list, byName: new Map(list.map((b) => [b.name, b])) };
}

// World transforms of every bone for given local rotations/translations (name -> value).
function fk(skel, localR, localT) {
  const world = new Map();
  for (const b of skel.list) {
    const m = new THREE.Matrix4().compose(localT(b), localR(b), b.s);
    if (b.parent) m.premultiply(world.get(b.parent));
    world.set(b.name, m);
  }
  return world;
}

const rotOf = (m) => { m.decompose(_v, _q, _s); return _q.clone(); };
const posOf = (m) => new THREE.Vector3().setFromMatrixPosition(m);

// Local rotations of every bone of our rig at time t of one of our clips.
export function sampleClip(doc, clipName, t) {
  const anim = doc.getRoot().listAnimations().find((a) => a.getName() === clipName);
  const out = new Map();
  for (const ch of anim.listChannels()) if (ch.getTargetPath() === 'rotation') out.set(ch.getTargetNode().getName(), new THREE.Quaternion(...sampler(ch)(t)));
  return out;
}

// Retargets one clip. src: {doc, skel}; tgt: {skel}; map: target bone -> source bone.
// opts.legScale: hips movement scale; opts.fixed: target bone -> fixed local rotation;
// opts.hz: sample rate; opts.from/to: time range of the source clip; opts.hips: source hips
// bone; opts.pelvis: target pelvis bone; opts.offsets: target bone -> extra local rotation
// applied after retargeting (a grip or posture correction).
export function retargetClip(src, tgt, anim, map, opts = {}) {
  const hz = opts.hz ?? 30;
  const chans = new Map();
  for (const ch of anim.listChannels()) {
    const name = ch.getTargetNode().getName();
    if (!chans.has(name)) chans.set(name, {});
    chans.get(name)[ch.getTargetPath()] = sampler(ch);
  }
  let dur = 0;
  for (const ch of anim.listChannels()) dur = Math.max(dur, ch.getSampler().getInput().getArray().at(-1));
  const from = opts.from ?? 0, to = Math.min(opts.to ?? dur, dur);
  // Rest (reference) world rotations of both rigs.
  const srcRest = fk(src.skel, (b) => b.r, (b) => b.t);
  const tgtRest = fk(tgt.skel, (b) => b.r, (b) => b.t);
  const hipsName = opts.hips ?? 'hips', pelvisName = opts.pelvis ?? 'pelvis';
  const srcHips0 = posOf(srcRest.get(hipsName));
  const tgtPelvis0 = posOf(tgtRest.get(pelvisName));
  const legScale = opts.legScale ?? 1;
  const n = Math.max(2, Math.round((to - from) * hz) + 1);
  const times = new Float32Array(n);
  const rot = new Map(tgt.skel.list.map((b) => [b.name, new Float32Array(n * 4)]));
  const pelvisT = new Float32Array(n * 3);
  const rootMotion = [];
  for (let k = 0; k < n; k++) {
    const t = Math.min(to, from + k / hz);
    times[k] = t - from;
    const sw = fk(src.skel,
      (b) => (chans.get(b.name)?.rotation ? new THREE.Quaternion(...chans.get(b.name).rotation(t)) : b.r),
      (b) => (chans.get(b.name)?.translation ? new THREE.Vector3(...chans.get(b.name).translation(t)) : b.t));
    const tw = new Map();
    for (const b of tgt.skel.list) {
      const parentW = b.parent ? tw.get(b.parent) : new THREE.Matrix4();
      const parentQ = rotOf(parentW);
      let local;
      const s = map[b.name];
      if (s && sw.has(s)) {
        const wq = rotOf(sw.get(s)).multiply(rotOf(srcRest.get(s)).invert()).multiply(rotOf(tgtRest.get(b.name)));
        local = parentQ.clone().invert().multiply(wq);
      } else local = (opts.fixed?.get(b.name) ?? b.r).clone();
      if (opts.offsets?.[b.name]) local.multiply(opts.offsets[b.name]);
      local.normalize();
      let lt = b.t;
      if (b.name === pelvisName) {
        const hp = posOf(sw.get(hipsName)).sub(srcHips0).multiplyScalar(legScale);
        rootMotion.push([hp.x, hp.z]);
        const wp = tgtPelvis0.clone().add(hp);
        lt = wp.applyMatrix4(parentW.clone().invert());
        pelvisT.set([lt.x, lt.y, lt.z], k * 3);
      }
      const m = new THREE.Matrix4().compose(lt, local, b.s).premultiply(parentW);
      tw.set(b.name, m);
      rot.get(b.name).set([local.x, local.y, local.z, local.w], k * 4);
    }
  }
  // Keep quaternions on one hemisphere so linear blending between keys doesn't flip.
  for (const arr of rot.values())
    for (let k = 1; k < n; k++) {
      const d = arr[k * 4] * arr[k * 4 - 4] + arr[k * 4 + 1] * arr[k * 4 - 3] + arr[k * 4 + 2] * arr[k * 4 - 2] + arr[k * 4 + 3] * arr[k * 4 - 1];
      if (d < 0) for (let c = 0; c < 4; c++) arr[k * 4 + c] *= -1;
    }
  return { times, rot, pelvisT, rootMotion, duration: to - from };
}

// Writes retargeted clips into a document holding our rig (its bones as plain nodes).
export function addClip(doc, skel, name, clip, { pelvisName = 'pelvis', only = null } = {}) {
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor().setType('SCALAR').setArray(clip.times).setBuffer(buffer);
  const two = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, clip.duration])).setBuffer(buffer);
  for (const b of skel.list) {
    if (only && !only.has(b.name)) continue;
    const node = doc.getRoot().listNodes().find((x) => x.getName() === b.name);
    if (!node) continue;
    const out = doc.createAccessor().setType('VEC4').setArray(clip.rot.get(b.name)).setBuffer(buffer);
    const s = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(s));
    const tr = b.name === pelvisName
      ? doc.createAccessor().setType('VEC3').setArray(clip.pelvisT).setBuffer(buffer)
      : doc.createAccessor().setType('VEC3').setArray(new Float32Array([...b.t.toArray(), ...b.t.toArray()])).setBuffer(buffer);
    const st = doc.createAnimationSampler().setInput(b.name === pelvisName ? input : two).setOutput(tr).setInterpolation('LINEAR');
    anim.addSampler(st).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(st));
  }
  return anim;
}
