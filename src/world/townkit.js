import * as THREE from 'three';
import { rng } from './buildings.js';
import { enhance } from '../engine/detail.js';
import { fitUV } from './props.js';
import * as GR from './greens.js';
import { townWall, townHedge, gatehouse, fieldGate } from './townwall.js';

// Metres per texture repeat of each kit material (the kit's own density), so furniture built from
// plain boxes and cylinders carries bricks and planks at the size the walls do.
const TILE = { MI_WoodTrim: 2.2, MI_UnevenBrick: 2.1, MI_Brick: 2.2, MI_RedBrick: 2.0, MI_RockTrim: 2.7, MI_RoundTiles: 4.3, MI_Plaster: 2.2, MI_Trim_Metal: 1.07 };

// Procedural street furniture and grounds for Ashford that the Quaternius kits do not have: the town
// wall, its towers and gatehouses, hedges and field gates, lantern posts, signposts, crops in their
// beds, hay, woodpiles, troughs, pumps, washing, graves and the like. Each one is added to the village
// Batcher (so the whole town stays a few dozen draw calls) and, where a person could bump into it,
// to the collider grid.
//
// Timber never uses the kit's wood sheet directly (it is a trim sheet with a metal strip in it: thin
// parts mapped across the whole sheet showed grey bands). Instead the sheet's plank, light-plank and
// end-grain bands are cut out as textures of their own, and timber gets its grain along its length.
// Stone likewise: the rock sheet's ashlar and smooth-slab bands.

const Y = new THREE.Vector3(0, 1, 0);

export function findMaterial(kit, name) {
  for (const part of kit.parts.values()) {
    let found = null;
    part.traverse((o) => {
      if (!found && o.isMesh) for (const m of [o.material].flat()) if (m.name === name) found = m;
    });
    if (found) return found;
  }
  return null;
}

// Scales the UVs of a geometry so that a texture repeats every `tile` metres, on every face.
function worldUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (az >= ay) { u = p.getX(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getZ(i); }
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}

// fitUV with a different size across (u) and up (v): for a band cut from a trim sheet, which is a
// long strip, one repeat covers tu metres along and tv metres up.
export function fitUV2(geometry, tu, tv) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; }
      else if (ax >= az) { u = v.z; w = v.y; }
      else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u / tu;
      uv[(i + k) * 2 + 1] = w / tv;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// Timber UVs: the grain (u) runs along the piece's `along` axis on every face that contains it.
// `tile` = [metres per repeat along the grain, metres per repeat across].
export function grainUV(g, along, tile) {
  const [tu, tv] = tile;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const A = { x: 0, y: 1, z: 2 }[along];
  const c = [0, 0, 0], nn = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    c[0] = p.getX(i); c[1] = p.getY(i); c[2] = p.getZ(i);
    nn[0] = Math.abs(n.getX(i)); nn[1] = Math.abs(n.getY(i)); nn[2] = Math.abs(n.getZ(i));
    const ax = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2;
    const inFace = [0, 1, 2].filter((k) => k !== ax);
    const ua = inFace.includes(A) ? A : inFace[0], va = inFace.find((k) => k !== ua);
    uv.setXY(i, c[ua] / tu, c[va] / tv);
  }
  g.userData.wuv = true;
  return g;
}

// A band of rows v0..v1 of a kit texture (v = 0 at the top, as glTF stores them) as a texture of its
// own that tiles both ways. Cached, so every TownKit shares them.
const bands = new Map();
function bandTexture(tex, v0, v1) {
  const key = `${tex.uuid}|${v0}|${v1}`;
  if (bands.has(key)) return bands.get(key);
  const img = tex.image, W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.max(4, Math.round((v1 - v0) * H));
  c.getContext('2d').drawImage(img, 0, Math.round(v0 * H), W, c.height, 0, 0, W, c.height);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = tex.colorSpace;
  t.anisotropy = Math.max(8, tex.anisotropy || 1);
  bands.set(key, t);
  return t;
}
const bandMats = new Map();
function bandMaterial(base, v0, v1, name, userData) {
  if (!base?.map?.image) return null;
  const key = `${base.uuid}|${v0}|${v1}|${name}`;
  if (bandMats.has(key)) return bandMats.get(key);
  const m = base.clone();
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (base[k]) m[k] = bandTexture(base[k], v0, v1);
  m.name = name;
  m.userData = { ...userData };
  enhance(m);
  bandMats.set(key, m);
  return m;
}

export class TownKit {
  constructor(kit, batch, colliders, world) {
    this.kit = kit;
    this.batch = batch;
    this.colliders = colliders;
    this.world = world;
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    const stone = findMaterial(kit, 'MI_UnevenBrick') || std(0x8a8580);
    const rock = findMaterial(kit, 'MI_RockTrim') || std(0x777068);
    const wood = findMaterial(kit, 'MI_WoodTrim') || std(0x6b4a2f);
    const tiles = findMaterial(kit, 'MI_RoundTiles') || std(0xa5502f);
    this.m = {
      stone,
      rock,
      wood,
      tiles,
      plaster: findMaterial(kit, 'MI_Plaster') || std(0xd8ceb8),
      metal: findMaterial(kit, 'MI_Trim_Metal') || std(0x2a2a2e, { metalness: 0.7, roughness: 0.5 }),
      vine: (() => { const v = findMaterial(kit, 'MI_Vine'); if (!v) return null; const c = v.clone(); return texturedMaterial(c.map, c.roughness, c); })(),
      // Wrought iron: dark, hammered, rusting at the edges.
      iron: surface('Iron_Wrought', ironTexture(), { roughness: 0.6, metalness: 0.55, tile: [0.6, 0.6] }),
      glass: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa640, emissiveIntensity: 1.6, roughness: 0.3 }),
      // An opening (a slit window, a doorway's dark): not a surface.
      dark: Object.assign(new THREE.MeshBasicMaterial({ color: 0x0a0806 }), { name: 'Void' }),
      water: Object.assign(new THREE.MeshStandardMaterial({ color: 0x2a4d5a, roughness: 0.08, metalness: 0 }), { name: 'Water' }),
      rope: surface('Rope_Hemp', ropeTexture(), { roughness: 1, tile: [0.25, 0.25] }),
      coal: surface('Coal', ironTexture(0.5), { roughness: 1, color: 0x9a9088, tile: [0.4, 0.4] }),
      ember: new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff5a18, emissiveIntensity: 1.5, roughness: 1 }),
      // The hedge's heart: twiggy dark shade, seen only between the leaves.
      hedgeCore: surface('Hedge_Heart', twigTexture(), { roughness: 1, tile: [0.8, 0.8] }),
      // Freshly cut wood (the sharpened tips of stakes out in the vale).
      logEnd: std(0xb58b58),
      // Fallbacks until extras() has loaded the real surfaces.
      hay: texturedMaterial(strawTexture(), 1),
      paper: std(0xe9dfc4),
    };
    const m = this.m;
    // Sawn timber: the dark plank band; fresh wood: the light plank band (both with grain along).
    m.timber = bandMaterial(wood, 0.312, 0.605, 'Wood_Timber', { grain: [2.2, 0.645] }) || wood;
    m.oak = bandMaterial(wood, 0.0, 0.3, 'Wood_Light', { grain: [2.2, 0.66] }) || wood;
    // Dressed stone and smooth slabs from the rock sheet.
    m.ashlar = bandMaterial(rock, 0.585, 1.0, 'Stone_Ashlar', { tile: [2.7, 1.12] }) || rock;
    m.slab = bandMaterial(rock, 0.3, 0.575, 'Stone_Slab', { tile: [2.7, 0.74] }) || rock;
    // Clay tiles at a real size for small roofs (a well, a notice board, a shed): 0.25 m wide.
    m.roofTiles = tiles.clone();
    m.roofTiles.name = 'Tiles_Small';
    m.roofTiles.userData = { tile: [1.5, 1.5] };
    enhance(m.roofTiles);
    // Bark until extras() brings the real thing (the vale's builders use it without extras).
    m.bark = m.barkDark = surface('Bark_Painted', barkTexture(), { roughness: 1, tile: [0.7, 1.2] });
    // Planed wood for small turned and joined work (wheels, benches): a square grain, not a trim sheet.
    m.planed = surface('Wood_Planed', planedTexture(), { roughness: 0.8, tile: [0.9, 0.9] });
    m.endgrain = texturedMaterial(endGrainTexture(), 0.85);
    m.endgrain.name = 'Wood_EndGrain';
    this.geo = {};
    this.rnd = rng(2024);
    this.cur = null;
    this.nid = 0;
  }

  // The surfaces that come from their own files (bark, leaves, hay, soil, linen) and the painted ones
  // (bean, herb and cabbage leaves, notices). Call once before building the grounds.
  async extras(assets) {
    if (this.extrasLoaded) return this;
    const m = this.m;
    const tex = (p, srgb = true, repeat = true) => assets.texture(p, { srgb, repeat });
    const [pine, oak, leaf, hayA, hayN, soilA, soilN, linenA] = await Promise.all([
      Promise.all(['color', 'normal', 'roughness'].map((k) => tex(`trees/pine_${k}.webp`, k === 'color'))),
      Promise.all(['color', 'normal', 'roughness'].map((k) => tex(`trees/oak_${k}.webp`, k === 'color'))),
      tex('trees/leaves_oak.webp', true, false),
      tex('props/hay_a.webp'), tex('props/hay_n.webp', false),
      tex('props/soil_a.webp'), tex('props/soil_n.webp', false),
      tex('props/linen_a.webp'),
    ]);
    const bark = (t, color, name) => {
      const b = new THREE.MeshStandardMaterial({ map: t[0], normalMap: t[1], roughnessMap: t[2], color, roughness: 1 });
      b.name = name;
      b.userData = { tile: [0.7, 1.2] };
      return enhance(b);
    };
    m.bark = bark(pine, 0xb4a896, 'Bark_Pole');
    m.barkDark = bark(oak, 0x8a7a6a, 'Bark_Log');
    m.hedgeLeaf = new THREE.MeshStandardMaterial({ map: leaf, color: 0x6c8d4e, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
    m.hedgeLeaf.name = 'Leaf_Hedge';
    m.hedgeLeaf.userData.atlas = true;
    m.hay = new THREE.MeshStandardMaterial({ map: hayA, normalMap: hayN, color: new THREE.Color(1.3, 1.1, 0.78), roughness: 1, vertexColors: true });
    m.hay.name = 'Hay';
    enhance(m.hay);
    m.soil = new THREE.MeshStandardMaterial({ map: soilA, normalMap: soilN, color: 0xb8a99a, roughness: 1 });
    m.soil.name = 'Soil';
    enhance(m.soil);
    const garments = GR.garmentTexture(linenA.image);
    m.linen = new THREE.MeshStandardMaterial({ map: garments, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, vertexColors: true });
    m.linen.name = 'Cloth_Linen';
    m.linen.userData.atlas = true;
    m.bean = new THREE.MeshStandardMaterial({ map: GR.beanTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true });
    m.bean.name = 'Leaf_Bean';
    m.bean.userData.atlas = true;
    m.herb = new THREE.MeshStandardMaterial({ map: GR.herbTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
    m.herb.name = 'Leaf_Herb';
    m.herb.userData.atlas = true;
    m.cabbage = new THREE.MeshStandardMaterial({ map: GR.cabbageTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true });
    m.cabbage.name = 'Leaf_Cabbage';
    m.cabbage.userData.atlas = true;
    this.extrasLoaded = true;
    return this;
  }

  // Starts a new object for the geometry audit: everything put until the next begin() is one
  // piece of street furniture (a lamp, a length of wall...). `soft` things (crops, washing) can be
  // walked through.
  begin(label, x, z, soft = false, on = false) {
    this.cur = { label, id: ++this.nid, x, z, soft, on };
  }

  // Adds a mesh (geometry + material) at a world position/rotation to the batch. Geometry without
  // world-scale UVs of its own is fitted to the material's texture size.
  put(geo, mat, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0) {
    const tile = !Array.isArray(mat) && (TILE[mat.name] ?? mat.userData?.tile);
    if (tile && !geo.userData.wuv) {
      // One fitted copy per (geometry, tile); shapes that already have world UVs keep them. The copy
      // remembers what it was made from (the audit looks for cones and icospheres).
      const key = Array.isArray(tile) ? tile.join('x') : tile;
      const cache = (geo.userData.fitted ??= {});
      geo = cache[key] ??= Object.assign(Array.isArray(tile) ? fitUV2(geo, tile[0], tile[1]) : fitUV(geo, tile), { userData: { wuv: true, source: { type: geo.type, parameters: geo.parameters } } });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, rotZ, 'YXZ');
    mesh.scale.set(sx, sy, sz);
    this.batch.addObject(mesh, new THREE.Matrix4(), this.cur);
  }

  box(w, h, d, tile = 0) {
    const key = `b${w}|${h}|${d}|${tile}`;
    if (this.geo[key]) return this.geo[key];
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (tile) { worldUV(g, tile); g.userData.wuv = true; }
    return (this.geo[key] = g);
  }

  cyl(r0, r1, h, seg = 8) {
    const key = `c${r0}|${r1}|${h}|${seg}`;
    return (this.geo[key] ||= new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0));
  }

  // A timber box (bottom at y = 0) with its grain along `along` ('x', 'y' or 'z').
  timberBox(w, h, d, along = 'x', grain = this.m.timber.userData?.grain || [2.2, 0.645]) {
    const key = `tb${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${along}|${grain[0]}`;
    return (this.geo[key] ??= grainUV(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), along, grain));
  }

  // A round pole from y = 0 to h (r0 at the foot, r1 at the top): bark wraps round it, runs up it.
  poleGeometry(r0, r1, h, seg = 8) {
    const key = `pole${r0}|${r1}|${h}|${seg}`;
    if (this.geo[key]) return this.geo[key];
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, false).translate(0, h / 2, 0);
    const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal;
    const round = Math.max(1, Math.round((Math.PI * (r0 + r1)) / 0.7));
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i) / 0.3, p.getZ(i) / 0.3);
      else uv.setXY(i, uv.getX(i) * round, p.getY(i) / 1.2);
    }
    g.userData.wuv = true;
    return (this.geo[key] = g);
  }

  // A log lying along z: bark round it, end grain on its two ends (a multi-material geometry).
  logGeometry(r, L, seg = 9) {
    const key = `log${r}|${L}|${seg}`;
    if (this.geo[key]) return this.geo[key];
    const g = new THREE.CylinderGeometry(r, r, L, seg, 1, false);
    const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal;
    const round = Math.max(1, Math.round((Math.PI * 2 * r) / 0.7));
    for (let i = 0; i < uv.count; i++) if (Math.abs(n.getY(i)) < 0.9) uv.setXY(i, uv.getX(i) * round, p.getY(i) / 1.2);
    g.rotateX(Math.PI / 2);
    g.userData.wuv = true;
    return (this.geo[key] = g);
  }

  // Solid shapes up to a metre high are walkable on top (you can jump onto a bale, a low wall, a
  // fence rail); taller ones just block.
  solidCircle(x, z, r, y, h) {
    const sh = this.colliders.addCircle(x, z, r, y - 0.5, y + h);
    if (h <= 1.02) sh.floor = true;
    sh.owner = this.cur?.id;
    return sh;
  }

  solidBox(x, z, hx, hz, rot, y, h) {
    const sh = this.colliders.addBox(x, z, hx, hz, rot, y - 0.5, y + h);
    if (h <= 1.02) sh.floor = true;
    sh.owner = this.cur?.id;
    return sh;
  }

  // ---------------------------------------------------------------- lanterns
  // An iron lantern hanging from a ring at (x, y, z): the glowing panes are y - 0.52..y - 0.12.
  hangingLantern(x, y, z, rot = 0) {
    const { m } = this;
    this.put(this.cyl(0.03, 0.03, 0.1, 6), m.iron, x, y - 0.1, z);
    this.put(this.cyl(0.03, 0.17, 0.12, 4), m.iron, x, y - 0.18, z, rot + Math.PI / 4);
    this.put(this.box(0.24, 0.035, 0.24), m.iron, x, y - 0.2, z, rot);
    this.put(this.box(0.19, 0.3, 0.19), m.glass, x, y - 0.5, z, rot);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const c = Math.cos(rot), s = Math.sin(rot), lx = dx * 0.105, lz = dz * 0.105;
      this.put(this.box(0.025, 0.34, 0.025), m.iron, x + lx * c + lz * s, y - 0.53, z - lx * s + lz * c, rot);
    }
    this.put(this.box(0.24, 0.04, 0.24), m.iron, x, y - 0.56, z, rot);
  }

  // A lantern on an iron bracket fixed to a wall at (x, y, z), the wall's face looking along rot:
  // the arm reaches 0.5 m out and the lantern's foot hangs at y - 0.6 (keep y at 2.9 or more).
  bracketLantern(x, y, z, rot) {
    const { m } = this;
    const fx = Math.sin(rot), fz = Math.cos(rot);
    this.put(this.box(0.16, 0.34, 0.03), m.iron, x + fx * 0.015, y - 0.2, z + fz * 0.015, rot);
    this.put(this.box(0.04, 0.04, 0.56), m.iron, x + fx * 0.28, y, z + fz * 0.28, rot);
    this.put(this.box(0.03, 0.03, 0.42), m.iron, x + fx * 0.2, y - 0.16, z + fz * 0.2, rot, 1, 1, 1, -0.62, 0);
    this.hangingLantern(x + fx * 0.5, y - 0.02, z + fz * 0.5, rot);
  }

  // ---------------------------------------------------------------- lantern post
  // A squared oak post on a stone footing with an iron arm and a hanging lantern (no cast-iron street
  // lamps in a medieval town). The lantern's foot is 2.4 m up; the post is solid, the arm is overhead.
  lamp(x, z, y, rot = 0, { on = false } = {}) {
    // (`on`: the post stands on something else, a pile or a pier, and needs no footing of its own)
    this.begin('lantern post', x, z, false, on);
    const { m } = this;
    if (!on) this.put(this.box(0.42, 0.3, 0.42, 1.7), m.stone, x, y - 0.1, z, rot);
    this.put(this.timberBox(0.18, 3.05, 0.18, 'y'), m.timber, x, y + 0.18, z, rot);
    this.put(this.cyl(0.02, 0.15, 0.12, 4), m.timber, x, y + 3.23, z, rot + Math.PI / 4);
    const fx = Math.sin(rot), fz = Math.cos(rot);
    this.put(this.timberBox(0.1, 0.1, 0.72, 'z'), m.timber, x + fx * 0.36, y + 2.95, z + fz * 0.36, rot);
    this.put(this.timberBox(0.07, 0.07, 0.62, 'z'), m.timber, x + fx * 0.24, y + 2.69, z + fz * 0.24, rot, 1, 1, 1, -0.785, 0);
    this.hangingLantern(x + fx * 0.62, y + 2.95, z + fz * 0.62, rot);
    this.solidCircle(x, z, 0.16, y, 3.1);
  }

  // ---------------------------------------------------------------- walls
  // The town wall (see townwall.js): `out` is the outward normal.
  townWall(a, b, out, o) {
    townWall(this, a, b, out, o);
  }

  // A low stone wall (a garden or yard wall, knee to waist high): coursed rubble under a rounded
  // coping, following the ground, with no piers.
  stoneWall(a, b, y = null, { height = 1.1, thick = 0.5 } = {}) {
    const { m } = this;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.2) return;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.round(len / 3)), seg = len / n;
    const ground = (t) => y ?? this.world.heightAt(a[0] + ux * t, a[1] + uz * t);
    for (let i = 0; i < n; i++) {
      const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
      // Each length leans with the ground from end to end, so its coping runs on into the next length's
      // with no step (a wall following a slope, not a staircase).
      const g0 = ground(seg * i), g1 = ground(seg * (i + 1)), gm = (g0 + g1) / 2, tilt = Math.atan2(g1 - g0, seg);
      this.begin('wall', cx, cz);
      let lo = Math.min(g0, g1);
      if (y === null) for (const t of [-0.5, 0, 0.5]) for (const f of [-1, 1]) lo = Math.min(lo, this.world.heightAt(cx + ux * seg * t - uz * f * thick / 2, cz + uz * seg * t + ux * f * thick / 2));
      const foot = lo - 0.3 - Math.abs(g1 - g0) / 2;
      this.put(this.box(+(seg + 0.02).toFixed(3), +(gm + height - foot).toFixed(3), thick, 1.5), m.stone, cx, foot, cz, rot, 1, 1, 1, 0, tilt);
      const cl = +(seg / Math.cos(tilt) + 0.03).toFixed(2);
      const cap = (this.geo[`lowcap${thick}|${cl}`] ??= roundCoping(thick, cl));
      this.put(cap, m.slab, cx, gm + height, cz, rot, 1, 1, 1, 0, tilt);
      this.solidBox(cx, cz, seg / 2 + 0.01, thick / 2 + 0.06, rot, Math.min(g0, g1), height + Math.abs(g1 - g0) + 0.1);
    }
  }

  // ---------------------------------------------------------------- hedge
  // A clipped hawthorn hedge (townwall.js). `ends` says which ends are open (rounded).
  hedge(a, b, { height = 1.8, thick = 1.25, ends = [false, false], seed = 1 } = {}) {
    if (!this.m.hedgeLeaf) return this.#plainHedge(a, b, height, thick);
    townHedge(this, a, b, { height, thick, ends, seed });
  }

  #plainHedge(a, b, height, thick) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const k = Math.max(1, Math.round(len / 3.6)), seg = len / k;
    for (let i = 0; i < k; i++) {
      const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
      const gy = this.world.heightAt(cx, cz);
      this.begin('hedge', cx, cz);
      this.put(this.hedgeBlock(seg + 0.2, height * 0.94, thick * 0.86, this.rnd() * 20, true), this.m.hedgeCore, cx, gy - 0.1, cz, rot);
      this.solidBox(cx, cz, seg / 2, thick / 2, rot, gy - 0.3, height);
    }
  }

  // A lumpy block (used as the dark heart of field hedgerows).
  hedgeBlock(len, height, thick, phase, plain = false) {
    const g = new THREE.BoxGeometry(len, height, thick, Math.max(2, Math.round(len / 0.3)), 5, 3);
    g.translate(0, height / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = Math.max(0, (y - height * 0.55) / (height * 0.45));
      const round = 1 - 0.42 * t * t;
      const n = Math.sin(x * 2.9 + phase) * 0.5 + Math.sin(x * 6.3 + y * 4.1 + phase * 1.7) * 0.3 + Math.sin(y * 7.7 + z * 5.3 + phase) * 0.2;
      z *= round * (1 + 0.07 * n);
      y += (t > 0 ? 0.12 : 0.02) * n * (plain ? 0 : 1);
      x *= 1 - 0.04 * t;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    if (plain) return g;
    g.userData.wuv = true;
    return worldUV(g, 0.9);
  }

  // ---------------------------------------------------------------- wooden fence (kit pieces)
  fence(a, b, name = 'Prop_WoodenFence_Single', owner = null) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3) return;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.round(len / 2.0)), seg = len / n;
    for (let i = 0; i < n; i++) {
      const cx = a[0] + ux * seg * (i + 0.5), cz = a[1] + uz * seg * (i + 0.5);
      const gy = this.world.heightAt(cx, cz);
      this.batch.add(name, cx, gy, cz, rot, seg / 2.0);
      const sh = this.colliders.addBox(cx, cz, seg / 2, 0.09, rot, gy - 0.5, gy + 0.85);
      sh.floor = true;
      sh.owner = owner ?? `fence@${a[0].toFixed(1)},${a[1].toFixed(1)}`;
    }
  }

  // A garden wicket: two posts either side of a gap and a small ledged gate standing open.
  // a, b are the gap's ends on the fence line; the gate opens toward `into` (a unit vector).
  wicket(a, b, into, owner = null) {
    const { m } = this;
    const w = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / w, uz = (b[1] - a[1]) / w;
    for (const [px, pz] of [a, b]) {
      const y = this.world.heightAt(px, pz);
      this.begin('gate post', px, pz);
      this.put(this.timberBox(0.12, 1.15, 0.12, 'y'), m.timber, px, y - 0.1, pz, Math.atan2(-uz, ux));
      const post = this.solidCircle(px, pz, 0.08, y, 1.05);
      if (owner) post.owner = owner;
    }
    const L = w - 0.24, y = this.world.heightAt(a[0], a[1]);
    const lx = a[0] + into[0] * (0.08 + L / 2) + ux * 0.08, lz = a[1] + into[1] * (0.08 + L / 2) + uz * 0.08;
    const rot = Math.atan2(-into[1], into[0]);
    this.begin('wicket gate', lx, lz, false, true); // hung on its post, clear of the ground
    for (const h of [0.25, 0.85]) this.put(this.timberBox(L, 0.09, 0.04, 'x'), m.timber, lx, y + h, lz, rot);
    for (let k = 0; k < 5; k++) this.put(this.timberBox(0.08, 0.95, 0.03, 'y'), m.oak, lx + into[0] * (-L / 2 + 0.06 + k * (L - 0.12) / 4), y + 0.08, lz + into[1] * (-L / 2 + 0.06 + k * (L - 0.12) / 4), rot);
    const sh = this.colliders.addBox(lx, lz, L / 2, 0.05, rot, y, y + 1.05);
    sh.noCamera = true;
    sh.owner = owner ?? this.cur.id;
  }

  // ---------------------------------------------------------------- gates
  gate(g, signTexture) {
    const mat = signTexture ? texturedMaterial(signTexture, 0.85) : null;
    if (mat) mat.userData.atlas = true; // a painted board, not a tiling surface
    return gatehouse(this, g, mat);
  }

  fieldGate(g) {
    fieldGate(this, g);
  }

  // ---------------------------------------------------------------- signpost
  sign(x, z, rot, boards, textures) {
    this.begin('signpost', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z);
    this.put(this.timberBox(0.15, 3.75, 0.15, 'y'), m.timber, x, y - 0.15, z, rot + Math.PI / 4);
    this.put(this.cyl(0.02, 0.13, 0.16, 4), m.timber, x, y + 3.6, z, rot);
    boards.forEach((b, i) => {
      const tex = textures[i];
      const front = texturedMaterial(tex[0], 0.85);
      const back = texturedMaterial(tex[1], 0.85);
      const geo = new THREE.BoxGeometry(1.35, 0.3, 0.05);
      geo.translate(0.62, 0, 0);
      {
        // Edges: planks with the grain along the board; faces: the painted board.
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) {
          const q = f * 4 + k;
          uv.setXY(q, (f < 2 ? pos.getZ(q) : pos.getX(q)) / 2.2, (f < 2 ? pos.getY(q) : pos.getZ(q)) / 0.645);
        }
      }
      // materials: +x, -x, +y, -y, +z, -z; only the two big faces carry the text
      const mesh = new THREE.Mesh(geo, [m.timber, m.timber, m.timber, m.timber, front, back]);
      mesh.position.set(x, y + 3.35 - i * 0.3, z); // the lowest board's underside stays over 2.1 m (a head passes under)
      mesh.rotation.y = rot + b.turn;
      mesh.updateMatrixWorld(true);
      // Batcher splits multi-material meshes by geometry group.
      this.batch.addObject(mesh, new THREE.Matrix4(), this.cur);
    });
    this.solidCircle(x, z, 0.13, y, 3.6);
  }

  // ---------------------------------------------------------------- notice board
  // A board on two posts under a little tiled roof, with notices pinned on it: a proclamation, a
  // wanted poster with a face, a torn sheet, lists in a crabbed hand.
  noticeBoard(x, z, rot, noticeMat = null) {
    this.begin('notice board', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    for (const k of [-0.95, 0.95]) this.put(this.timberBox(0.14, 2.55, 0.14, 'y'), m.timber, ...pt(at(k, -0.02), y - 0.2), rot);
    this.put(this.timberBox(1.9, 1.15, 0.07, 'x'), m.timber, ...pt(at(0, 0), y + 0.9), rot);
    this.put(this.timberBox(2.1, 0.1, 0.12, 'x'), m.timber, ...pt(at(0, 0.02), y + 0.85), rot);
    this.put(this.timberBox(2.1, 0.1, 0.12, 'x'), m.timber, ...pt(at(0, 0.02), y + 2.05), rot);
    // The little roof: two tiled slopes and a ridge, overhanging the board.
    for (const k of [-1, 1]) {
      const [rx, rz] = at(0, k * 0.22);
      this.put(this.box(2.5, 0.05, 0.56), m.roofTiles, rx, y + 2.38, rz, rot, 1, 1, 1, k * 0.62, 0);
    }
    this.put(this.timberBox(2.5, 0.08, 0.08, 'x'), m.timber, ...pt(at(0, 0), y + 2.5), rot);
    if (noticeMat) {
      const g = (this.geo.notices ??= noticeGeometry());
      const [nx, nz] = at(0, 0.045);
      this.put(g, noticeMat, nx, y + 0.9, nz, rot);
    }
    this.solidBox(x, z, 1.05, 0.15, rot, y, 2.4);
  }

  // ---------------------------------------------------------------- hay
  // A truss of hay, bound with two bands of twine. `level` stacks it on another (or on a cart bed at
  // height `y`).
  bale(x, z, rot = 0, level = 0, y = null) {
    this.begin('hay truss', x, z, false, level > 0 || y !== null);
    const gy = y ?? this.world.heightAt(x, z);
    const sd = Math.round(Math.abs(x * 13 + z * 7)) % 5;
    const g = (this.geo[`truss${sd}`] ??= GR.trussGeometry(0.9, 0.46, 0.42, sd + 1));
    const base = gy + level * 0.42;
    this.put(g, this.m.hay, x, base, z, rot);
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const k of [-0.24, 0.24]) this.put(this.box(0.025, 0.44, 0.49), this.m.rope, x + c * k, base - 0.005, z - s * k, rot);
    if (level === 0 && y === null) this.solidBox(x, z, 0.46, 0.24, rot, gy, 0.42);
  }

  // A haystack: a beehive of loose hay round a pole, roped over with stone weights hanging, and loose
  // hay round its foot. r: its widest radius (the stack is about 1.9 r tall).
  haystack(x, z, r = 1.4) {
    this.begin('haystack', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z);
    let lo = y;
    for (let a = 0; a < 6.28; a += 0.8) lo = Math.min(lo, this.world.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
    const H = r * 1.9;
    const sd = Math.round(Math.abs(x * 31 + z * 17));
    this.put(GR.haystackGeometry(r, H, sd), m.hay, x, lo - 0.02, z, sd % 7);
    this.put(GR.hayApron(r, sd + 3), m.hay, x, lo - 0.03, z);
    // The stack pole sticks out of the crown.
    this.put(this.poleGeometry(0.06, 0.035, 1.4), m.bark, x, lo + H - 0.6, z, 0, 1, 1, 1, 0.06, 0.04);
    // Two ropes over the crown, following the stack's profile a little proud of the hay, each end
    // hanging a stone weight against the stack's belly.
    const prof = [[1.06, 0.3], [1.02, 0.48], [0.9, 0.63], [0.69, 0.77], [0.47, 0.87], [0.24, 0.95], [0.0, 1.005]];
    for (const a of [0.4, 0.4 + Math.PI / 2]) {
      const side = (sg) => prof.map(([pr, ph]) => new THREE.Vector3(Math.cos(a) * sg * (pr * r + 0.03), ph * H + 0.02, Math.sin(a) * sg * (pr * r + 0.03)));
      const pts = [...side(-1), ...side(1).reverse().slice(1)];
      const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.018, 4, false);
      this.put(rope, m.rope, x, lo, z);
      for (const sgn of [-1, 1]) {
        const ex = x + Math.cos(a) * (1.04 * r + 0.06) * sgn, ez = z + Math.sin(a) * (1.04 * r + 0.06) * sgn;
        const stone = (this.geo.weight ??= new THREE.DodecahedronGeometry(0.12, 0));
        this.put(stone, m.ashlar, ex, lo + 0.3 * H - 0.14, ez, a, 1, 1.25, 1);
      }
    }
    this.solidCircle(x, z, r * 1.07, lo, H);
  }

  // ---------------------------------------------------------------- wood
  // A woodpile: split logs stacked between two stakes (bark on the sides, pale end grain showing),
  // with a chopping block and an axe beside it. rot turns the stack; its length runs along local x.
  woodpile(x, z, rot = 0, { block = true } = {}) {
    this.begin('woodpile', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    const log = this.logGeometry(0.11, 0.62, 8);
    const mats = [m.barkDark, m.endgrain, m.endgrain];
    const r = rng(Math.round(Math.abs(x * 7 + z * 3)) + 5);
    [7, 6, 6, 5].forEach((n, row) => {
      for (let i = 0; i < n; i++) {
        const lx = (i - (n - 1) / 2) * 0.23 + (row % 2) * 0.05, jz = (r() - 0.5) * 0.08;
        const [px, pz] = at(lx, jz);
        this.put(log, mats, px, y + 0.11 + row * 0.2, pz, rot, 1, 1, 1, 0, r() * 3);
      }
    });
    // Stakes at the ends.
    for (const e of [-1, 1]) {
      const [px, pz] = at(e * 0.88, 0);
      this.put(this.poleGeometry(0.05, 0.04, 1.05), m.bark, px, y - 0.1, pz);
    }
    this.solidBox(x, z, 0.9, 0.34, rot, y, 0.9);
    if (!block) return;
    // The chopping block, with the axe in it and chips about.
    const [bx, bz] = at(1.45, 0.35);
    const by = this.world.heightAt(bx, bz);
    this.begin('chopping block', bx, bz);
    this.put(this.logGeometry(0.24, 0.5, 11), mats, bx, by + 0.25, bz, 0, 1, 1, 1, Math.PI / 2, 0);
    this.put(this.timberBox(0.05, 0.05, 0.62, 'z'), m.oak, bx + 0.05, by + 0.62, bz, rot + 0.5, 1, 1, 1, 0.55, 0);
    this.put(this.box(0.03, 0.14, 0.12), m.iron, bx, by + 0.52, bz, rot + 0.5);
    this.solidCircle(bx, bz, 0.25, by, 0.5);
  }

  // ---------------------------------------------------------------- water
  // A trough: a hollowed stone one (horse troughs, by the smithy and the pump) or a plank one on
  // trestles (the farm), with its water a hand below the rim.
  trough(x, z, rot = 0, { len = 1.8, stone = false } = {}) {
    this.begin('trough', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    const W = stone ? 0.7 : 0.6, H = stone ? 0.62 : 0.58, t = stone ? 0.12 : 0.05;
    const mat = stone ? m.ashlar : m.timber;
    const wall = (w, h, d, lx, lz, along) => (stone ? this.put(this.box(w, h, d), mat, ...pt(at(lx, lz), y + (stone ? 0 : 0.12)), rot) : this.put(this.timberBox(w, h, d, along), mat, ...pt(at(lx, lz), y + 0.12), rot));
    const bodyH = stone ? H : H - 0.12;
    wall(len, bodyH, t, 0, W / 2 - t / 2, 'x');
    wall(len, bodyH, t, 0, -W / 2 + t / 2, 'x');
    wall(t, bodyH, W - 2 * t, len / 2 - t / 2, 0, 'z');
    wall(t, bodyH, W - 2 * t, -len / 2 + t / 2, 0, 'z');
    wall(len - 2 * t, stone ? 0.14 : t, W - 2 * t, 0, 0, 'x');
    if (!stone) {
      for (const e of [-1, 1]) {
        const [tx, tz] = at(e * (len / 2 - 0.22), 0);
        this.put(this.timberBox(0.08, 0.14, W + 0.12, 'z'), m.timber, tx, y, tz, rot);
        this.put(this.box(0.03, 0.05, W + 0.02), m.iron, ...pt(at(e * (len / 2 - 0.35), 0), y + H - 0.12), rot);
      }
    }
    this.put(this.box(len - 2 * t - 0.01, 0.01, W - 2 * t - 0.01), m.water, x, y + H - 0.06, z, rot);
    this.solidBox(x, z, len / 2, W / 2, rot, y, H);
  }

  // A parish pump: a square timber case with a moulded cap, a long curved iron handle on its side, a
  // spout over a stone basin, on a stone slab.
  pump(x, z, rot = 0) {
    this.begin('pump', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    this.put(this.box(1.0, 0.12, 1.3), m.slab, ...pt(at(0, 0.25), y - 0.06), rot);
    this.put(this.timberBox(0.3, 1.55, 0.3, 'y'), m.timber, x, y + 0.05, z, rot);
    this.put(this.timberBox(0.38, 0.07, 0.38, 'x'), m.timber, x, y + 1.6, z, rot);
    this.put(this.cyl(0.03, 0.2, 0.16, 4), m.timber, x, y + 1.67, z, rot + Math.PI / 4);
    // The spout: out of the front face and turning down over the basin.
    const [sx, sz] = at(0, 0.15);
    const spout = (this.geo.spout ??= new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.02, 0.28), new THREE.Vector3(0, -0.14, 0.3)), 8, 0.035, 6, false));
    this.put(spout, m.iron, sx, y + 0.95, sz, rot);
    // The handle: pivoted high on the right side, curving out and down.
    const [hx, hz] = at(0.17, 0.02);
    const handle = (this.geo.pumpHandle ??= new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.08), new THREE.Vector3(0.03, 0.08, -0.25), new THREE.Vector3(0.05, -0.05, -0.6), new THREE.Vector3(0.06, -0.35, -0.8)]), 12, 0.022, 5, false));
    this.put(handle, m.iron, hx, y + 1.38, hz, rot);
    this.put(this.cyl(0.04, 0.04, 0.08, 6), m.iron, hx, y + 1.34, hz, rot, 1, 1, 1, 0, Math.PI / 2);
    // The stone basin under the spout.
    const [bx, bz] = at(0, 0.62);
    const by = this.world.heightAt(bx, bz);
    this.put(this.box(0.8, 0.12, 0.55), m.ashlar, bx, by - 0.02, bz, rot);
    for (const [w, d, lx, lz] of [[0.8, 0.09, 0, 0.23], [0.8, 0.09, 0, -0.23], [0.09, 0.37, 0.355, 0], [0.09, 0.37, -0.355, 0]]) this.put(this.box(w, 0.36, d), m.ashlar, ...pt(at(lx, 0.62 + lz), by + 0.08), rot);
    this.put(this.box(0.62, 0.01, 0.37), m.water, bx, by + 0.36, bz, rot);
    this.solidCircle(x, z, 0.22, y, 1.7);
    this.solidBox(bx, bz, 0.4, 0.28, rot, by, 0.44);
  }

  // ---------------------------------------------------------------- washing line
  // A line between two forked props, sagging a hand in the middle, with garments pegged along it:
  // sheets, shirts, a smock, stockings, aprons, each dyed its own colour and hanging in folds.
  washing(a, b, { seed = 1 } = {}) {
    const { m } = this;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const rot = Math.atan2(-uz, ux);
    const r = rng(seed * 31 + 7);
    const ya = this.world.heightAt(a[0], a[1]), yb = this.world.heightAt(b[0], b[1]);
    for (const [p, y] of [[a, ya], [b, yb]]) {
      this.begin('washing pole', p[0], p[1]);
      this.put(this.poleGeometry(0.055, 0.045, 2.35), m.bark, p[0], y - 0.15, p[1], 0, 1, 1, 1, 0.03, -0.02);
      // The fork at the top that holds the line.
      for (const k of [-1, 1]) this.put(this.poleGeometry(0.03, 0.025, 0.3), m.bark, p[0], y + 2.1, p[1], rot, 1, 1, 1, 0, k * 0.45);
      this.solidCircle(p[0], p[1], 0.08, y, 2.2);
    }
    if (!m.linen) return;
    const top = 2.12, sag = Math.min(0.35, 0.05 * len + 0.08);
    const ly = (t) => (ya + (yb - ya) * t) + top - sag * 4 * t * (1 - t);
    this.begin('washing', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, true);
    this.put(GR.ropeGeometry([a[0], ya + top, a[1]], [b[0], yb + top, b[1]], sag, 0.006), m.rope, 0, 0, 0);
    const dyes = [[0.95, 0.93, 0.88], [0.93, 0.9, 0.82], [0.62, 0.3, 0.24], [0.36, 0.46, 0.6], [0.82, 0.7, 0.42], [0.55, 0.6, 0.45], [0.96, 0.95, 0.93]];
    let t0 = 0.35;
    let k = 0;
    while (t0 < len - 0.35) {
      const gar = GR.GARMENTS[[0, 1, 3, 2, 5, 1, 4, 0][k % 8]];
      if (t0 + gar.w > len - 0.3) break;
      const mid = t0 + gar.w / 2, t = mid / len;
      const px = a[0] + ux * mid, pz = a[1] + uz * mid, py = ly(t);
      const slope = ((ly(Math.min(1, t + 0.05)) - ly(Math.max(0, t - 0.05))) / (0.1 * len));
      const geo = GR.garmentGeometry(gar, seed * 17 + k, (x) => x * slope);
      const dye = gar.name === 'sheet' || gar.name === 'cloth' ? dyes[r() < 0.7 ? 0 : 6] : dyes[2 + Math.floor(r() * 5)];
      const col = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = dye[0]; col[i + 1] = dye[1]; col[i + 2] = dye[2]; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.put(geo, m.linen, px, py, pz, rot);
      // Pegs on the line at the garment's shoulders.
      for (const e of [-0.45, 0.45]) {
        const qx = px + ux * gar.w * e, qz = pz + uz * gar.w * e;
        this.put(this.box(0.02, 0.09, 0.025), m.oak, qx, ly((mid + gar.w * e) / len) - 0.05, qz, rot);
      }
      t0 += gar.w + 0.12 + r() * 0.18;
      k++;
    }
  }

  // ---------------------------------------------------------------- crops in a plot
  // Raised beds of tilled soil edged with planks, running east-west, with a trodden path between them;
  // in them beans up wigwams of hazel poles, cabbages in rosettes, or clumps of herbs.
  crops(p, kind) {
    const { m } = this;
    if (!m.soil) return;
    const x0 = p.x0 + 0.9, x1 = p.x1 - 0.9, z0 = p.z0 + 0.9, z1 = p.z1 - 0.9;
    if (x1 - x0 < 1 || z1 - z0 < 1) return;
    const W = kind === 'beans' ? 1.0 : 1.2, pathW = kind === 'beans' ? 0.7 : 0.55;
    const L = x1 - x0, cx = (x0 + x1) / 2;
    let row = 0;
    for (let z = z0 + W / 2; z + W / 2 <= z1 + 0.01; z += W + pathW, row++) {
      const y = this.world.heightAt(cx, z);
      this.begin('crop bed', cx, z, true);
      this.put((this.geo[`soil${L.toFixed(2)}|${W}`] ??= GR.soilGeometry(L - 0.08, W - 0.08, 0.13, 1.2, kind === 'beans' ? 0 : 2)), m.soil, cx, y - 0.03, z);
      // Plank edging, pegged at the corners.
      for (const e of [-1, 1]) {
        this.put(this.timberBox(+L.toFixed(3), 0.2, 0.035, 'x'), m.timber, cx, y - 0.05, z + e * (W / 2 - 0.018));
        this.put(this.timberBox(0.035, 0.2, +(W - 0.07).toFixed(3), 'z'), m.timber, cx + e * (L / 2 - 0.018), y - 0.05, z);
      }
      const r = rng(Math.round(Math.abs(p.x0 * 13 + z * 7 + row)));
      if (kind === 'cabbage') {
        this.begin('cabbages', cx, z, true);
        for (let x = x0 + 0.35; x < x1 - 0.25; x += 0.62) for (const lz of [-0.26, 0.26]) {
          const jx = x + (r() - 0.5) * 0.08 + (lz > 0 ? 0.31 : 0), jz = z + lz + (r() - 0.5) * 0.06;
          if (jx > x1 - 0.25) continue;
          const sd = Math.floor(r() * 6);
          const cab = (this.geo[`cab${sd}`] ??= GR.cabbageGeometry(sd * 13 + 1));
          const gy = this.world.heightAt(jx, jz) + 0.12;
          const s = 0.85 + r() * 0.3;
          this.put(cab.leaves, m.cabbage, jx, gy, jz, r() * 6.28, s, s, s);
          this.put(cab.head, m.cabbage, jx, gy, jz, r() * 6.28, s, s, s);
        }
      } else if (kind === 'flowers' || kind === 'herbs') {
        this.begin('herbs', cx, z, true);
        for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.62 + r() * 0.2) {
          const kindH = GR.HERBS[(Math.floor((x - x0) / 2.2) + row) % 4];
          const sd = Math.floor(r() * 4);
          const bush = (this.geo[`herb${kindH}${sd}`] ??= GR.herbGeometry(kindH, sd * 7 + GR.HERBS.indexOf(kindH), kindH === 'lavender' ? 0.42 : 0.34));
          const jz = z + (r() - 0.5) * 0.3;
          this.put(bush, m.herb, x, this.world.heightAt(x, jz) + 0.12, jz, r() * 6.28, 0.9 + r() * 0.3, 0.85 + r() * 0.35, 0.9 + r() * 0.3);
        }
      } else {
        // Runner beans: wigwams along the bed.
        for (let x = x0 + 0.55; x < x1 - 0.45; x += 1.25) {
          const sd = Math.floor(r() * 5);
          const wig = (this.geo[`wig${sd}`] ??= GR.beanWigwam(sd * 11 + 3));
          const gy = this.world.heightAt(x, z) + 0.1;
          const turn = r() * 6.28;
          this.begin('bean wigwam', x, z, true);
          const c = Math.cos(turn), s = Math.sin(turn);
          for (const pole of wig.poles) {
            const bx = pole.base[0] * c + pole.base[2] * s, bz = -pole.base[0] * s + pole.base[2] * c;
            const dx = pole.dir[0] * c + pole.dir[2] * s, dz = -pole.dir[0] * s + pole.dir[2] * c;
            const hor = Math.hypot(dx, dz);
            this.put(this.poleGeometry(0.017, 0.012, +pole.L.toFixed(2), 5), m.bark, x + bx, gy + pole.base[1], z + bz, Math.atan2(dx, dz), 1, 1, 1, Math.atan2(hor, pole.dir[1]), 0);
          }
          this.put(this.cyl(0.05, 0.05, 0.05, 6), m.rope, x, gy + 1.96, z);
          this.put(wig.leaves, m.bean, x, gy, z, turn);
        }
      }
    }
  }

  // ---------------------------------------------------------------- churchyard
  grave(x, z, rot = 0, tall = 0.9) {
    this.begin('grave', x, z);
    const { m } = this;
    const y = this.world.heightAt(x, z);
    this.put(this.box(0.6, tall, 0.14, 2.7), m.rock, x, y - 0.05, z, rot);
    this.put(this.box(0.55, 0.16, 1.5, 2.1), m.stone, x + Math.sin(rot) * -0.85, y - 0.05, z + Math.cos(rot) * -0.85, rot);
    this.solidBox(x, z, 0.32, 0.12, rot, y, tall);
  }

  lychgate(x, z, rot, y) {
    this.begin('lych-gate', x, z);
    const { m } = this;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const k of [-1.35, 1.35]) for (const f of [-0.6, 0.6]) {
      this.put(this.box(0.24, 2.7, 0.24), m.wood, x + c * k + s * f, y, z - s * k + c * f, rot);
    }
    for (const f of [-0.6, 0.6]) this.put(this.box(3.1, 0.2, 0.22), m.wood, x + s * f, y + 2.5, z + c * f, rot);
    this.put(this.box(0.2, 0.2, 1.4), m.wood, x, y + 2.9, z, rot);
    // Two pitched roof planes meeting at a ridge along the lane.
    for (const k of [-1, 1]) this.put(this.box(1.3, 0.09, 3.5), m.roofTiles, x + c * 0.58 * k, y + 2.72 - 0.1, z - s * 0.58 * k, rot, 1, 1, 1, 0, -0.5 * k);
    for (const k of [-1.35, 1.35]) for (const f of [-0.6, 0.6]) this.solidBox(x + c * k + s * f, z - s * k + c * f, 0.14, 0.14, rot, y, 2.7);
  }
}

// [x, z] and a height into put()'s (x, y, z).
const pt = ([x, z], y) => [x, y, z];

// A low wall's coping along x: a rounded top of slabs a little wider than the wall.
function roundCoping(thick, len) {
  const w = thick / 2 + 0.06, pts = [[-w, -0.02], [w, -0.02], [w, 0.06]];
  for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; pts.push([Math.cos(a) * w, 0.06 + Math.sin(a) * 0.1]); }
  pts.push([-w, 0.06]);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// The notices on a board: five sheets of the atlas (see noticeTexture), each its own card a hair in
// front of the board, tilted a little.
function noticeGeometry() {
  const B = new GR.Builder();
  const sheets = [
    // [centre x, centre y, w, h, tilt, atlas rect]
    [-0.55, 0.62, 0.42, 0.55, 0.04, [0, 0.5, 0.25, 1]],
    [-0.08, 0.66, 0.36, 0.48, -0.03, [0.25, 0.5, 0.5, 1]],
    [0.36, 0.6, 0.42, 0.56, 0.05, [0.5, 0.5, 0.75, 1]],
    [0.72, 0.4, 0.24, 0.34, -0.08, [0.75, 0.5, 1, 1]],
    [-0.3, 0.2, 0.46, 0.3, -0.02, [0, 0, 0.5, 0.5]],
    [0.25, 0.2, 0.34, 0.3, 0.06, [0.5, 0, 0.75, 0.5]],
  ];
  sheets.forEach(([x, y, w, h, tilt, rect], i) => {
    const c = Math.cos(tilt), s = Math.sin(tilt);
    B.card([x, y + 0.02, 0.004 + i * 0.001], [c * w / 2, s * w / 2, 0], [-s * h / 2, c * h / 2, 0], [0, 0, 1], rect);
  });
  return B.build();
}

// A painted surface as a material (with the detail layer), fitted to `tile` metres a repeat by put().
const surfaces = new Map();
function surface(name, map, { roughness = 0.9, metalness = 0, color = 0xffffff, tile = [1, 1] } = {}) {
  if (surfaces.has(name)) return surfaces.get(name);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const m = texturedMaterial(map, roughness);
  m.metalness = metalness;
  m.color = new THREE.Color(color);
  m.name = name;
  m.userData = { tile };
  surfaces.set(name, m);
  return m;
}

// Hammered iron: near black, with lighter worn highlights and rust bloom.
function ironTexture(k = 1) {
  return GR.canvasTexture(128, 128, (g, W) => {
    const r = GR.seeded(19 + Math.round(k * 10));
    g.fillStyle = '#2a2a2c';
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < 260; i++) {
      const rust = r() < 0.25 * k;
      g.fillStyle = rust ? `rgba(${110 + r() * 40},${55 + r() * 25},${30 + r() * 15},${0.15 + r() * 0.25})` : `rgba(${60 + r() * 50},${60 + r() * 50},${62 + r() * 50},${0.1 + r() * 0.2})`;
      g.beginPath();
      g.ellipse(r() * W, r() * W, 2 + r() * 9, 1 + r() * 5, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: true });
}

// Twisted hemp: diagonal strands, light and shadow.
function ropeTexture() {
  return GR.canvasTexture(64, 64, (g, W) => {
    g.fillStyle = '#8a7250';
    g.fillRect(0, 0, W, W);
    for (let i = -W; i < W * 2; i += 8) {
      g.strokeStyle = 'rgba(60,45,25,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + W, W);
      g.stroke();
      g.strokeStyle = 'rgba(200,180,140,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(i + 3, 0);
      g.lineTo(i + 3 + W, W);
      g.stroke();
    }
  }, { repeat: true });
}

// Planed wood: warm brown with long wavy grain lines.
function planedTexture() {
  return GR.canvasTexture(128, 128, (g, W) => {
    const r = GR.seeded(41);
    g.fillStyle = '#8a6440';
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < 40; i++) {
      const y0 = r() * W, a = 1 + r() * 3, f = 0.03 + r() * 0.05;
      g.strokeStyle = r() < 0.5 ? 'rgba(90,60,35,0.45)' : 'rgba(170,130,90,0.3)';
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      for (let x = 0; x <= W; x += 4) { const y = y0 + Math.sin(x * f + i) * a; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }, { repeat: true });
}

// Bark: grey-brown with dark fissures running up the pole.
function barkTexture() {
  return GR.canvasTexture(128, 128, (g, W) => {
    const r = GR.seeded(31);
    g.fillStyle = '#6b5a48';
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < 26; i++) {
      const x = r() * W, w = 2 + r() * 4;
      g.fillStyle = `rgba(${40 + r() * 20},${32 + r() * 15},${24 + r() * 10},0.8)`;
      g.fillRect(x, 0, w, W);
    }
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${120 + r() * 50},${110 + r() * 40},${95 + r() * 30},0.25)`; g.fillRect(r() * W, r() * W, 2 + r() * 6, 4 + r() * 14); }
  }, { repeat: true });
}

// A hedge's heart: dark twigs criss-crossing in deep green shade.
function twigTexture() {
  return GR.canvasTexture(128, 128, (g, W) => {
    const r = GR.seeded(23);
    g.fillStyle = '#172612';
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = r() * W, a = r() * Math.PI, L = 10 + r() * 30;
      g.strokeStyle = r() < 0.5 ? 'rgba(45,35,22,0.9)' : 'rgba(30,48,22,0.8)';
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      g.stroke();
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${40 + r() * 30},${70 + r() * 40},${30 + r() * 20},0.7)`; g.beginPath(); g.ellipse(r() * W, r() * W, 3 + r() * 4, 2 + r() * 2, r() * 3, 0, Math.PI * 2); g.fill(); }
  }, { repeat: true });
}

// End grain for log ends: rings round a dark pith, radial cracks, a band of bark at the rim.
function endGrainTexture() {
  return GR.canvasTexture(128, 128, (g, W) => {
    const r = GR.seeded(5);
    g.fillStyle = '#5a4128';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#c9a06a';
    g.beginPath();
    g.arc(W / 2, W / 2, W * 0.46, 0, Math.PI * 2);
    g.fill();
    for (let k = 1; k < 12; k++) {
      g.strokeStyle = `rgba(120,80,40,${0.25 + r() * 0.3})`;
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath();
      g.arc(W / 2 + (r() - 0.5) * 2, W / 2 + (r() - 0.5) * 2, W * 0.035 * k + r() * 1.5, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(60,35,15,0.6)';
    g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      g.beginPath();
      g.moveTo(W / 2, W / 2);
      g.lineTo(W / 2 + Math.cos(a) * W * 0.4, W / 2 + Math.sin(a) * W * 0.4);
      g.stroke();
    }
  });
}

// A small canvas texture for a signboard: text on a weathered plank, optionally with an arrow.
export function boardTexture(text, { w = 512, h = 112, bg = '#b78d58', fg = '#2a1a0c', arrow = 0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(60,35,15,0.35)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, 12 + i * 18);
    g.lineTo(w, 12 + i * 18 + (i % 2 ? 3 : -3));
    g.stroke();
  }
  g.strokeStyle = '#3a2410';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(h * 0.5)}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2 + arrow * -14, h / 2 + 3);
  if (arrow) {
    g.beginPath();
    const cx = arrow > 0 ? w - 34 : 34, d = arrow > 0 ? 1 : -1;
    g.moveTo(cx - 14 * d, h / 2 - 14);
    g.lineTo(cx + 14 * d, h / 2);
    g.lineTo(cx - 14 * d, h / 2 + 14);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Straw: warm streaks (a stand-in until the hay texture has loaded).
function strawTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#c9a24c';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    g.strokeStyle = 'hsl(' + (38 + r() * 12) + ', ' + (45 + r() * 25) + '%, ' + (38 + r() * 30) + '%)';
    g.lineWidth = 1 + r() * 1.5;
    const x = r() * 128, y = r() * 128, l = 10 + r() * 30;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 6, y + l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let flat = null;
// A painted texture as a material that takes the same surface-detail layer as the kit's (a flat
// normal map for it to bend), so signs and straw are sharpened and lit like everything else.
export function texturedMaterial(map, roughness, base = null) {
  flat ??= new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
  flat.anisotropy = 16;
  flat.needsUpdate = true;
  map.anisotropy = Math.max(map.anisotropy, 8);
  const m = base || new THREE.MeshStandardMaterial({ map, roughness });
  m.normalMap = flat;
  return enhance(m);
}
