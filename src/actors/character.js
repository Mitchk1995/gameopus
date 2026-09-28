import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { enhance } from '../engine/detail.js';

// People are assembled from Quaternius parts that share one 65-bone humanoid rig:
// an outfit (arms, body, legs, feet, extras), a head cut from a base body, hair,
// eyebrows and a beard. Every part is re-bound to the outfit's skeleton, so one
// AnimationMixer drives the whole person with the Universal Animation Library clips.

const HEAD_BONES = new Set(['Head', 'neck_01']);

export class CharacterFactory {
  constructor(assets) {
    this.assets = assets;
    this.clips = new Map();
    this.heads = new Map();
  }

  async loadAnimations() {
    const [a, b] = await Promise.all([this.assets.model('anims/ual1.glb'), this.assets.model('anims/ual2.glb')]);
    for (const clip of [...a.animations, ...b.animations]) {
      // Keep the hips' height but drop horizontal root drift so clips play in place.
      for (const t of clip.tracks) {
        if (t.name === 'root.position' || t.name === 'pelvis.position') {
          const v = t.values;
          for (let i = 0; i < v.length; i += 3) {
            v[i] = v[0];
            v[i + 2] = v[2];
          }
        }
      }
      this.clips.set(clip.name, clip);
    }
  }

  async #head(body) {
    if (this.heads.has(body)) return this.heads.get(body);
    const gltf = await this.assets.model(`chars/base_${body}.glb`);
    const parts = [];
    gltf.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (/Eyes|Eyebrows/i.test(o.name)) parts.push({ mesh: o, geometry: o.geometry });
      else parts.push({ mesh: o, geometry: headOnly(o) });
    });
    this.heads.set(body, parts);
    return parts;
  }

  async create(spec) {
    const body = spec.body || 'male';
    const outfitGltf = await this.assets.model(`chars/outfits/${spec.outfit}.glb`);
    const extras = await Promise.all([spec.hair, spec.beard, spec.eyebrows].filter(Boolean).map((h) => this.assets.model(`chars/hair/${h}.glb`)));
    const head = await this.#head(body);

    const root = cloneSkinned(outfitGltf.scene);
    const bones = {};
    let skeletonHost = null;
    root.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh && !skeletonHost) skeletonHost = o;
    });
    const armature = skeletonHost.parent;

    const attach = (src, geometry) => {
      const mesh = new THREE.SkinnedMesh(geometry, src.material);
      mesh.name = src.name;
      const b = src.skeleton.bones.map((bone) => bones[bone.name] || bones.root);
      armature.add(mesh);
      mesh.bind(new THREE.Skeleton(b, src.skeleton.boneInverses), src.bindMatrix);
      return mesh;
    };
    for (const p of head) attach(p.mesh, p.geometry);
    for (const g of extras) g.scene.traverse((o) => o.isSkinnedMesh && attach(o, o.geometry));

    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // Cull by a generous sphere around the bind pose, so animation can't escape it.
      if (o.isSkinnedMesh) {
        o.computeBoundingSphere();
        o.boundingSphere.radius = Math.max(o.boundingSphere.radius * 1.6, 1.2);
      }
      if (spec.tint && o.material?.name?.includes(spec.tintMaterial || 'Ranger')) {
        o.material = o.material.clone();
        o.material.color.multiply(new THREE.Color(spec.tint));
        // A cloned material starts without the surface-detail shader patch.
        enhance(o.material, 'chars/');
      }
    });
    return new Character(root, bones, this.clips);
  }
}

// Keeps only the triangles of a base body that belong to the head and neck.
function headOnly(mesh) {
  const g = mesh.geometry;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const isHead = new Uint8Array(si.count);
  for (let v = 0; v < si.count; v++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      if (w > bw) { bw = w; best = si.getComponent(v, k); }
    }
    isHead[v] = HEAD_BONES.has(names[best]) ? 1 : 0;
  }
  const src = g.index.array;
  const keep = [];
  for (let i = 0; i < src.length; i += 3) {
    if (isHead[src[i]] && isHead[src[i + 1]] && isHead[src[i + 2]]) keep.push(src[i], src[i + 1], src[i + 2]);
  }
  const out = g.clone();
  out.setIndex(keep);
  return out;
}

// A posed, animated person. Clips crossfade by name; one-shot clips can report back.
export class Character {
  constructor(root, bones, clips) {
    this.root = root;
    this.bones = bones;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.marked = new Map();
    this.current = null;
    this.mixer.addEventListener('finished', (e) => this.onFinished?.(e.action.getClip().name));
  }

  action(name) {
    if (!this.actions.has(name)) {
      const clip = this.clips.get(name);
      if (!clip) throw new Error(`missing clip ${name}`);
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    return this.actions.get(name);
  }

  play(name, { fade = 0.2, loop = true, speed = 1, restart = false } = {}) {
    const next = this.action(name);
    next.timeScale = speed;
    if (this.current === next && !restart) return next;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    return next;
  }

  // Poses laid over the animation after it ran (a swing, the bow's aim, a chest lean) mark
  // the bones they change first. The mixer only rewrites a bone whose animated value moved,
  // so a bone with a steady rotation would keep the layer's leftover and get it added
  // again next frame; putting the marked bones back before each update stops that.
  mark(bone) {
    if (!this.marked.has(bone)) this.marked.set(bone, bone.quaternion.clone());
  }

  update(dt) {
    for (const [bone, q] of this.marked) bone.quaternion.copy(q);
    this.marked.clear();
    this.mixer.update(dt);
  }
}
