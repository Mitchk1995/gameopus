// Optimizes glTF/GLB files for the web: dedupe, prune, WebP textures (resized), meshopt.
// Usage: node scripts/optimize-gltf.mjs <in.gltf|glb> <out.glb> [--tex 1024] [--no-meshopt] [--keep-anims a,b,c] [--drop-meshes]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

export async function makeIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

export async function optimizeDoc(doc, { tex = 1024, useMeshopt = true, keepAnims = null, dropMeshes = false } = {}) {
  const root = doc.getRoot();
  if (keepAnims) for (const a of root.listAnimations()) if (!keepAnims.includes(a.getName())) a.dispose();
  if (dropMeshes) {
    for (const n of root.listNodes()) if (n.getMesh()) n.setMesh(null);
    for (const s of root.listSkins()) s.dispose();
  }
  const steps = [dedup(), prune({ keepLeaves: true }), resample()];
  if (!dropMeshes) steps.push(weld());
  if (root.listTextures().length) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 88 }));
  if (useMeshopt) steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  return doc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output, ...rest] = process.argv.slice(2);
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  const io = await makeIO();
  const doc = await io.read(input);
  await optimizeDoc(doc, {
    tex: +(opt('--tex') || 1024),
    useMeshopt: !rest.includes('--no-meshopt'),
    keepAnims: opt('--keep-anims')?.split(','),
    dropMeshes: rest.includes('--drop-meshes'),
  });
  await io.write(output, doc);
  console.log('wrote', output);
}
