// Samples the forward root motion of selected Universal Animation Library clips into
// src/actors/rootmotion.json, so in-place clips can move the character exactly as
// the animator intended (rolls, lunges, knockbacks) without foot sliding.
//   node scripts/root-motion.mjs   (after fetch-assets has unpacked the packs)
import { writeFile } from 'node:fs/promises';
import { makeIO } from './optimize-gltf.mjs';

const PACKS = [
  '.asset-cache/unpacked/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard_RM.glb',
  '.asset-cache/unpacked/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard_RM.glb',
];
const CLIPS = /^(Roll|Sword_Regular_[ABC]|Sword_Regular_[AB]_Rec|Sword_Heavy_Combo|Sword_Dash|Sword_Attack|Shield_Dash|Hit_Knockback|Melee_Hook|Death01|Punch_Jab|Punch_Cross)$/;
const HZ = 30;

const io = await makeIO();
const out = {};
for (const file of PACKS) {
  const doc = await io.read(file);
  for (const anim of doc.getRoot().listAnimations()) {
    if (!CLIPS.test(anim.getName())) continue;
    const ch = anim.listChannels().find((c) => c.getTargetPath() === 'translation' && c.getTargetNode().getName() === 'root');
    if (!ch) continue;
    const t = ch.getSampler().getInput().getArray(), v = ch.getSampler().getOutput().getArray();
    const dur = t[t.length - 1] - t[0];
    const samples = [];
    for (let k = 0, i = 0; k <= Math.round(dur * HZ); k++) {
      const time = t[0] + k / HZ;
      while (i < t.length - 2 && t[i + 1] < time) i++;
      const f = Math.min(1, Math.max(0, (time - t[i]) / (t[i + 1] - t[i] || 1)));
      samples.push(+(v[i * 3 + 2] + (v[(i + 1) * 3 + 2] - v[i * 3 + 2]) * f - v[2]).toFixed(3));
    }
    out[anim.getName()] = samples;
  }
}
await writeFile('src/actors/rootmotion.json', JSON.stringify({ hz: HZ, clips: out }));
console.log(Object.entries(out).map(([k, s]) => `${k}: ${s.length} samples, ${s[s.length - 1]} m`).join('\n'));
