// Inspect the actual exported binary assets, not the modelling source.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';

const root = path.resolve(import.meta.dirname, '../..');
const reports = [];
for (const name of ['rowan-cottage', 'elin-garden']) {
  const bytes = fs.readFileSync(path.join(root, 'public/assets/lakeside', `${name}.glb`));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const len = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + len));
  const binaryStart = 20 + len + 8;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/lakeside', `${name}.manifest.json`), 'utf8'));
  const parents = new Map();
  gltf.nodes.forEach((n, i) => (n.children || []).forEach(c => parents.set(c, i)));
  const matrices = new Map();
  function world(i) {
    if (matrices.has(i)) return matrices.get(i);
    const n = gltf.nodes[i];
    const m = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])), new Vector3(...(n.scale || [1, 1, 1])));
    if (parents.has(i)) m.premultiply(world(parents.get(i)));
    matrices.set(i, m);
    return m;
  }
  let triangles = 0;
  const bounds = new Box3();
  for (const [i, n] of gltf.nodes.entries()) {
    if (n.mesh === undefined) continue;
    for (const p of gltf.meshes[n.mesh].primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      assert(a.min.every(Number.isFinite) && a.max.every(Number.isFinite));
      assert.equal(a.componentType, 5126, 'Position buffer must contain floats');
      const bv = gltf.bufferViews[a.bufferView];
      const at = binaryStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
      const stride = bv.byteStride || 12;
      for (let n = 0; n < a.count; n++) {
        const q = at + n * stride;
        bounds.expandByPoint(new Vector3(bytes.readFloatLE(q), bytes.readFloatLE(q + 4), bytes.readFloatLE(q + 8)).applyMatrix4(world(i)));
      }
      triangles += (p.indices === undefined ? a.count : gltf.accessors[p.indices].count) / 3;
      assert(p.attributes.TEXCOORD_0 !== undefined, `${name}: missing UVs`);
    }
  }
  assert(triangles < 100000, `${name}: geometry budget exceeded`);
  const images = [];
  for (const im of gltf.images || []) {
    assert(im.bufferView !== undefined, `${name}: unbundled texture`);
    const b = gltf.bufferViews[im.bufferView];
    const start = binaryStart + (b.byteOffset || 0);
    const meta = await sharp(bytes.subarray(start, start + b.byteLength)).metadata();
    assert(meta.width <= 1024 && meta.height <= 1024, `${name}: oversized texture`);
    images.push({ name: im.name, width: meta.width, height: meta.height });
  }
  for (const c of manifest.colliders) {
    assert(c.center.every(Number.isFinite) && c.size.every(n => Number.isFinite(n) && n > 0));
  }
  if (name === 'rowan-cottage') {
    const index = gltf.nodes.findIndex(n => n.name === 'door_leaf');
    assert(index >= 0, 'Door hinge missing');
    const p = new Vector3().setFromMatrixPosition(world(index));
    assert(p.distanceTo(new Vector3(-.75, 0, 3.56)) < .001, `Unexpected hinge position ${p.toArray()}`);
    assert(gltf.nodes[index].children?.length, 'Door leaf has no geometry');
    // The furniture must leave the resident's central path, hearth and table stop free.
    for (const [x, z] of [[.1, 3], [.1, 1], [.1, -1], [-2.05, -.5], [1, 1]]) {
      assert(!manifest.colliders.some(c => !c.floor && c.center[1] - c.size[1] / 2 < 1.7 && c.center[1] + c.size[1] / 2 > .2 && Math.abs(x - c.center[0]) < c.size[0] / 2 + .18 && Math.abs(z - c.center[2]) < c.size[2] / 2 + .18), `Blocked interior stop ${x},${z}`);
    }
  } else {
    const plants = gltf.nodes.filter(n => n.mesh !== undefined && gltf.meshes[n.mesh].primitives.some(p => /cabbage|nettle/i.test(gltf.materials[p.material]?.name || '')));
    assert(plants.length >= 3, 'Plant materials missing');
    assert(plants.every(n => n.extras?.staticCameraSolid === false), 'Plant leaves block camera');
    const soil = manifest.colliders.filter(c => c.id === 'garden_soil');
    assert.equal(soil.length, 2);
    assert(soil.every(c => Math.abs(c.center[1] + c.size[1] / 2 - .02) < 1e-6), 'Soil collision surface height differs');
    assert.equal(manifest.colliders.filter(c => c.id === 'garden_corner_peg').length, 8);
  }
  reports.push({ name, triangles, meshes: gltf.meshes.length, bytes: bytes.length, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, images, colliders: manifest.colliders.length });
}
fs.writeFileSync(path.join(root, 'art/lakeside-cottage/export-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), reports }, null, 2));
console.log(JSON.stringify(reports.map(({ images, ...r }) => ({ ...r, embeddedImages: images.length })), null, 2));
