import * as THREE from 'three';
import { ITEMS } from '../game/items.js';
import { buildItem } from '../ui/itemart.js';

// The hero keeps a plain, animated linen outfit underneath removable equipment.
// Item art supplies the metalwork; its wearable pieces are fitted in the shared
// humanoid's rest pose and bound to the existing bones, without replacing the rig.
export class EquipmentAppearance {
  constructor(character, assets) {
    this.character = character;
    this.assets = assets;
    this.slots = new Map();
    this.models = new Map();
    this.base = [];
    character.root.updateMatrixWorld(true);
    const rootInverse = character.root.matrixWorld.clone().invert();
    this.bind = new Map(Object.entries(character.bones).map(([name, bone]) =>
      [name, rootInverse.clone().multiply(bone.matrixWorld)]));
    character.root.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.piece) this.base.push(mesh);
    });
  }

  update(equip) {
    for (const slot of ['head', 'body', 'legs', 'shield']) {
      const id = equip[slot] || null;
      if (this.slots.get(slot)?.id === id) continue;
      this.slots.get(slot)?.model.removeFromParent();
      this.slots.delete(slot);
      if (!id) continue;
      if (!this.models.has(id)) this.models.set(id, this.#make(id));
      const model = this.models.get(id);
      if (!model) continue;
      const bone = model.userData.bone;
      (bone ? this.character.bones[bone] : this.character.root).add(model);
      this.slots.set(slot, { id, model });
    }
    const helmet = /helm$/.test(ITEMS[equip.head]?.art?.kind || '');
    for (const mesh of this.base) {
      if (mesh.userData.piece === 'hair' && !/Eyebrow|Beard/i.test(mesh.name)) mesh.visible = !helmet;
      // Leg armour replaces the trousers; footwear and the linen undershirt stay.
      if (mesh.userData.piece === 'legs') mesh.visible = !equip.legs;
    }
  }

  #make(id) {
    const item = ITEMS[id];
    if (!item) return null;
    const model = buildItem(id, this.assets);
    model.name = `worn_${id}`;
    model.userData.item = id;
    if (item.equip === 'head') {
      const crown = item.art.kind === 'crown';
      model.position.set(0, crown ? 1.765 : 1.675, -0.017);
      model.scale.set(1.02, crown ? 1 : 0.85, 1.02);
      return this.#rigid(model, 'Head');
    }
    if (item.equip === 'shield') {
      model.position.set(0.53, 1.4555, 0.055);
      model.rotation.z = -Math.PI / 2;
      return this.#rigid(model, 'lowerarm_l');
    }
    if (item.equip === 'body') {
      const parts = model.children[0].children;
      // The inventory model has hanging sleeves. Align them to the rig's T-pose
      // before skinning, so shoulders and sleeves follow arm animation properly.
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const sleeve = parts[1 + side * 2], shoulder = parts[2 + side * 2];
        sleeve.position.set(sign * 0.26, 0.375, -0.035);
        sleeve.rotation.z = sign * Math.PI / 2;
        shoulder.position.set(sign * 0.18, 0.375, -0.035);
        sleeve.userData.bone = shoulder.userData.bone = sign > 0 ? 'upperarm_l' : 'upperarm_r';
      }
      model.position.set(0, 0.99, -0.022);
      model.scale.set(1.13, 1.2, 1.2);
      return this.#skin(model, (point) => blendHeight(point.y, [
        [0.98, 'pelvis'], [1.09, 'spine_01'], [1.23, 'spine_02'], [1.38, 'spine_03'],
      ]));
    }
    if (item.equip === 'legs') {
      model.position.set(0, 0.15, -0.038);
      model.scale.set(1.12, 1.55, 1.2);
      return this.#skin(model, (point) => {
        const side = point.x > 0 ? 'l' : 'r';
        return blendHeight(point.y, [[0.48, `calf_${side}`], [0.60, `thigh_${side}`], [0.95, `thigh_${side}`], [1.0, 'pelvis']]);
      });
    }
    return null;
  }

  #rigid(model, bone) {
    model.updateMatrix();
    const local = this.bind.get(bone).clone().invert().multiply(model.matrix);
    local.decompose(model.position, model.quaternion, model.scale);
    model.userData.bone = bone;
    return model;
  }

  #skin(source, weights) {
    source.updateMatrixWorld(true);
    const group = new THREE.Group();
    group.name = source.name;
    group.userData.item = source.userData.item;
    const names = Object.keys(this.character.bones);
    const indices = new Map(names.map((name, i) => [name, i]));
    const skeleton = new THREE.Skeleton(names.map((name) => this.character.bones[name]), names.map((name) => this.bind.get(name).clone().invert()));
    source.traverse((part) => {
      if (!part.isMesh) return;
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const position = geometry.attributes.position;
      const index = [], weight = [], point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        const influences = part.userData.bone ? [[part.userData.bone, 1]] : weights(point);
        for (let j = 0; j < 4; j++) {
          index.push(influences[j] ? indices.get(influences[j][0]) : 0);
          weight.push(influences[j]?.[1] || 0);
        }
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
      const mesh = new THREE.SkinnedMesh(geometry, part.material);
      mesh.name = `${source.name}_part`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.bind(skeleton, new THREE.Matrix4());
      group.add(mesh);
    });
    // Only the fitted clones are used; release temporary icon geometry.
    source.traverse((part) => part.isMesh && part.geometry.dispose());
    return group;
  }
}

function blendHeight(y, stops) {
  for (let i = 1; i < stops.length; i++) {
    if (y > stops[i][0]) continue;
    const [low, a] = stops[i - 1], [high, b] = stops[i];
    const t = THREE.MathUtils.clamp((y - low) / (high - low), 0, 1);
    return a === b ? [[a, 1]] : [[a, 1 - t], [b, t]];
  }
  return [[stops.at(-1)[1], 1]];
}
