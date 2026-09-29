import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { enhance } from '../engine/detail.js';

// People are assembled from Quaternius parts that share one 65-bone humanoid rig:
// an outfit (arms, torso, legs, feet, extras), a head cut from a base body, hair,
// eyebrows and a beard. Every part is re-bound to the outfit's skeleton, so one
// AnimationMixer drives the whole person with the Universal Animation Library clips.
//
// A look (see src/content/people.js) is plain data. Everything but `outfit` is optional:
//   body      'male' | 'female': the head, and which outfits fit
//   outfit    where every garment comes from ('male_peasant', 'male_ranger', ...)
//   parts     { torso, arms, legs, feet }: take one garment from another outfit of the same
//             body, e.g. { legs: 'male_peasant' } under a ranger outfit
//   addons    ranger extras to wear: 'hood', 'pauldron', 'bracers', 'belt' (all of them
//             with a ranger outfit unless listed, none with a peasant one)
//   dye       colour of each garment ({ torso, arms, legs, feet, hood, cloth for all }); a
//             hex number, or [hex, brighter] for a dark piece. On the peasant outfit the
//             cloth is multiplied by it (0xffffff leaves the linen as it is; the hex is
//             about the colour the cream linen comes out); on the ranger outfit it
//             replaces the green cloth and leaves leather, metal and trim alone
//   leather   hex, or per piece: the ranger outfit's brown leather (belts, boots, straps)
//   hair, beard, eyebrows   the hair piece to wear (files in assets/chars/hair)
//   hairColor a name from HAIR_COLORS or a hex (the strands are grey in the files);
//             beardColor and browColor default to it
//   skin      a name from SKIN_TONES or a hex
//   scale     height, 1 by default; build: width, 1 by default
//   gear      things to wear that are built here from a few curves rather than loaded:
//             { kind: 'apron', color, trim?, length? } { kind: 'tabard', color, trim? }
//             { kind: 'hat', style: 'straw' | 'knit' | 'pointed', color, band?, size?, lift?, forward? }
//   tint, tintMaterial   the old single multiply, kept for the bandits

const HEAD_BONES = new Set(['Head', 'neck_01']);

// ---------------------------------------------------------------- outfits, piece by piece
// Each mesh in an outfit file is one piece of clothing, told apart by its name.
const PIECES = [
  ['bracers', /_Arms_Bracer$/],
  ['arms', /_Arms(_\d+)?$/],
  ['torso', /_Body$/],
  ['belt', /_Body_Belt_\d+$/],
  ['legs', /_Legs$/],
  ['feet', /_Feet(_Boots)?$/],
  ['hood', /_Head_Hood$/],
  ['pauldron', /_Acc_Pauldrons?$/],
];
export const CORE_PIECES = ['torso', 'arms', 'legs', 'feet'];
export const ADDON_PIECES = ['hood', 'pauldron', 'bracers', 'belt'];
const pieceOf = (mesh) => PIECES.find(([, re]) => re.test(mesh.name))?.[0] ?? null;

// The cream linen of the peasant tunic: what a dye colour is measured against.
const CREAM = new THREE.Color(0x948f76);
// The mean of the grey hair textures and of the skin textures, and the middle of the
// ranger's green cloth (its luminance is what the recolour scales by).
const HAIR_GREY = 0.2746;
const SKIN_MEAN = new THREE.Color(0xa0704f);
const RANGER_LEATHER = new THREE.Color(0x6e492c);
const RANGER_GREEN = 0x2f5a1e;
const GREEN_LUMINANCE = 0.049;

// Natural hair colours, as the strands look in daylight (a little darker than they read, since
// the sun is bright and the hair files are pale grey).
export const HAIR_COLORS = {
  black: 0x1c1714, darkbrown: 0x32241a, brown: 0x47331f, chestnut: 0x64402a, auburn: 0x74341c,
  ginger: 0x8f4519, blond: 0xa88748, fair: 0xc4a86a, grey: 0x8a8985, white: 0xd0cdc6,
};
// Skin, pale to dark, as the face looks in daylight.
export const SKIN_TONES = {
  pale: 0xd8a888, fair: 0xcf9f7c, ruddy: 0xc98466, tan: 0xb98058, olive: 0xa88a5a,
  weathered: 0xa66f4a, brown: 0x86553a, dark: 0x5e3a26,
};
const named = (table, v) => (typeof v === 'string' ? table[v] ?? Number(v) : v);

// A look with every default filled in and every name turned into a number: what tests and
// the lineup compare, and what the factory builds from.
export function resolveLook(spec) {
  const body = spec.body || 'male';
  const outfit = spec.outfit;
  if (!outfit || !outfit.startsWith(`${body}_`)) throw new Error(`look: outfit ${outfit} does not fit a ${body} body`);
  const parts = {};
  for (const p of CORE_PIECES) {
    parts[p] = spec.parts?.[p] || outfit;
    if (!parts[p].startsWith(`${body}_`)) throw new Error(`look: ${parts[p]} does not fit a ${body} body`);
  }
  const addons = (spec.addons ?? (outfit.endsWith('_ranger') ? ADDON_PIECES : [])).filter((a) => ADDON_PIECES.includes(a));
  const dye = {};
  for (const p of [...CORE_PIECES, ...ADDON_PIECES]) {
    const d = spec.dye?.[p] ?? spec.dye?.cloth;
    if (d !== undefined) dye[p] = d;
  }
  const leather = {};
  for (const p of ['feet', 'belt', 'bracers', 'torso', 'arms', 'hood', 'pauldron']) {
    const l = typeof spec.leather === 'object' && !Array.isArray(spec.leather) ? spec.leather[p] ?? spec.leather.all : spec.leather;
    if (l !== undefined && l !== null) leather[p] = l;
  }
  const hairColor = spec.hairColor === undefined ? null : named(HAIR_COLORS, spec.hairColor);
  return {
    body, outfit, parts, addons, dye, leather,
    hair: spec.hair || null, beard: spec.beard || null, eyebrows: spec.eyebrows || null,
    hairColor,
    beardColor: spec.beardColor === undefined ? hairColor : named(HAIR_COLORS, spec.beardColor),
    browColor: spec.browColor === undefined ? hairColor : named(HAIR_COLORS, spec.browColor),
    skin: spec.skin === undefined ? null : named(SKIN_TONES, spec.skin),
    scale: spec.scale ?? 1,
    build: spec.build ?? 1,
    gear: spec.gear || [],
  };
}

const kindOf = (mat) => {
  const n = mat?.name || '';
  if (/Peasant|Ranger/.test(n)) return 'cloth';
  if (/Superhero|Regular/.test(n)) return 'skin';
  if (/Hair/.test(n)) return 'hair';
  return 'other';
};

const gainOf = (target, mean) => new THREE.Color(target.r / mean.r, target.g / mean.g, target.b / mean.b);

// Replaces the green cloth of a ranger material with another colour, keeping its painted
// light and dark, and scales the brown leather. Texels are told apart by how green they are.
function recolorGreen(material, cloth, leather) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uClothTo = { value: cloth };
    shader.uniforms.uLeatherGain = { value: leather };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uClothTo;\nuniform vec3 uLeatherGain;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
        {
          vec3 tx = sampledDiffuseColor.rgb;
          float lum = dot(tx, vec3(0.2126, 0.7152, 0.0722));
          float green = smoothstep(0.15, 0.32, (tx.g - max(tx.r, tx.b)) / max(tx.g, 0.002));
          vec3 cloth = uClothTo * (lum / ${GREEN_LUMINANCE.toFixed(4)});
          diffuseColor.rgb = diffuse * mix(tx * uLeatherGain, cloth, green);
        }
        #endif`);
  };
  material.customProgramCacheKey = () => 'detail1+recolor';
  material.needsUpdate = true;
}

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

  // The look a spec resolves to (defaults filled in, names turned into numbers).
  describe(spec) {
    return resolveLook(spec);
  }

  async create(spec) {
    const look = resolveLook(spec);
    const { body } = look;
    const ranger = `${body}_ranger`;
    const outfitIds = [...new Set([look.outfit, ...Object.values(look.parts), ...(look.addons.length ? [ranger] : [])])];
    const gltfs = {};
    await Promise.all(outfitIds.map(async (id) => { gltfs[id] = await this.assets.model(`chars/outfits/${id}.glb`); }));
    const extras = await Promise.all([spec.hair, spec.beard, spec.eyebrows].filter(Boolean).map((h) => this.assets.model(`chars/hair/${h}.glb`)));
    const head = await this.#head(body);

    const root = cloneSkinned(gltfs[look.outfit].scene);
    const bones = {};
    let skeletonHost = null;
    root.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh && !skeletonHost) skeletonHost = o;
    });
    const armature = root.getObjectByName('Armature') || skeletonHost.parent;

    const attach = (src, geometry, piece) => {
      const mesh = new THREE.SkinnedMesh(geometry, src.material);
      mesh.name = src.name;
      mesh.userData.piece = piece;
      const b = src.skeleton.bones.map((bone) => bones[bone.name] || bones.root);
      armature.add(mesh);
      mesh.bind(new THREE.Skeleton(b, src.skeleton.boneInverses), src.bindMatrix);
      return mesh;
    };

    // Which garments does this outfit's file supply, and which do we keep from it?
    const wanted = (piece, outfitId) => (CORE_PIECES.includes(piece)
      ? look.parts[piece] === outfitId
      : look.addons.includes(piece) && outfitId === ranger);
    const drop = [];
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const piece = pieceOf(o);
      if (!piece) return;
      o.userData.piece = piece;
      if (!wanted(piece, look.outfit)) drop.push(o);
    });
    for (const o of drop) o.parent.remove(o);
    for (const id of outfitIds) {
      if (id === look.outfit) continue;
      gltfs[id].scene.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const piece = pieceOf(o);
        if (piece && wanted(piece, id)) attach(o, o.geometry, piece);
      });
    }
    for (const p of head) attach(p.mesh, p.geometry, 'head');
    for (const g of extras) g.scene.traverse((o) => o.isSkinnedMesh && attach(o, o.geometry, 'hair'));

    root.updateMatrixWorld(true);
    this.#paint(root, spec, look);
    for (const g of look.gear) wear(g, { root, bones, armature, female: body === 'female' });
    if (look.scale !== 1 || look.build !== 1) root.scale.set(look.scale * look.build, look.scale, look.scale * look.build);
    const character = new Character(root, bones, this.clips);
    character.look = look;
    character.spec = spec;
    return character;
  }

  // Colours: dyes on the garments, hair and skin, each on a private copy of the material
  // (the files' own materials stay shared and untouched for everyone else).
  #paint(root, spec, look) {
    const copies = new Map();
    const copy = (mat, key, setup) => {
      const k = `${mat.uuid}|${key}`;
      if (!copies.has(k)) {
        const m = mat.clone();
        // A cloned material starts without the surface-detail shader patch.
        enhance(m, 'chars/');
        setup(m);
        copies.set(k, m);
      }
      return copies.get(k);
    };
    const hairGain = (hex) => { const c = new THREE.Color(hex); return new THREE.Color(c.r / HAIR_GREY, c.g / HAIR_GREY, c.b / HAIR_GREY); };
    root.traverse((o) => {
      if (!o.isMesh) return;
      prepareMesh(o);
      const kind = kindOf(o.material);
      const piece = o.userData.piece;
      if (spec.tint && o.material?.name?.includes(spec.tintMaterial || 'Ranger')) {
        o.material = copy(o.material, `tint${spec.tint}`, (m) => m.color.multiply(new THREE.Color(spec.tint)));
        return;
      }
      if (kind === 'cloth') {
        const ranger = /Ranger/.test(o.material.name);
        const dye = look.dye[piece];
        const leather = look.leather[piece];
        if (dye === undefined && leather === undefined) return;
        if (ranger) {
          const to = dye === undefined ? new THREE.Color(RANGER_GREEN) : new THREE.Color(Array.isArray(dye) ? dye[0] : dye);
          if (Array.isArray(dye)) to.multiplyScalar(dye[1]);
          const gain = leather === undefined ? new THREE.Color(1, 1, 1) : gainOf(new THREE.Color(leather), RANGER_LEATHER);
          o.material = copy(o.material, `r${dye}|${leather}`, (m) => recolorGreen(m, to, gain));
        } else if (dye !== undefined) {
          const [hex, k = 1] = Array.isArray(dye) ? dye : [dye];
          const gain = gainOf(new THREE.Color(hex), CREAM).multiplyScalar(k);
          o.material = copy(o.material, `d${hex}|${k}`, (m) => m.color.copy(gain));
        }
      } else if (kind === 'skin' && look.skin !== null) {
        const gain = gainOf(new THREE.Color(look.skin), SKIN_MEAN);
        o.material = copy(o.material, `s${look.skin}`, (m) => m.color.copy(gain));
      } else if (kind === 'hair') {
        const isBeard = /Beard/i.test(o.name), isBrow = /Eyebrow/i.test(o.name);
        const hex = isBeard ? look.beardColor : isBrow ? look.browColor : look.hairColor;
        if (hex === null) return;
        const gain = hairGain(hex);
        o.material = copy(o.material, `h${hex}`, (m) => m.color.copy(gain));
      }
    });
  }
}


// ---------------------------------------------------------------- things to wear
// Hats ride the head bone. Aprons and tabards are cloth panels curved round the body and
// skinned to the spine, hips and thighs, so they hang and swing with the person. Measured on
// the rig at rest (a T-pose facing +z): hips 0.95 m, chest 1.3 m, shoulders 1.46 m, head
// centre 1.70 m, hair top 1.81 m, torso front 0.10 m ahead of the spine, thighs 0.09 m out.
const clothMaterial = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, ...extra });

// Which bones a point at height y (and side x) moves with: 0 spine_02, 1 spine_01, 2 pelvis,
// 3 thigh_l, 4 thigh_r.
function panelWeights(y, x) {
  const w = [0, 0, 0, 0, 0];
  if (y >= 1.25) w[0] = 1;
  else if (y >= 1.1) { const t = (y - 1.1) / 0.15; w[0] = t; w[1] = 1 - t; }
  else if (y >= 0.95) { const t = (y - 0.95) / 0.15; w[1] = t; w[2] = 1 - t; }
  else {
    // Below the hips each side of the cloth follows its own leg (the middle follows both), so a
    // knee stepping forward carries the cloth with it instead of poking through.
    const legs = 0.95 * Math.min(1, (0.98 - y) / 0.16);
    const side = Math.min(1, Math.max(0, (x + 0.07) / 0.14));
    w[2] = 1 - legs;
    w[3] = legs * side;
    w[4] = legs * (1 - side);
  }
  return w;
}

// A curved cloth panel hung on the body. `knots` are [y, half width, z] from the top down (z is
// the distance ahead of the spine, negative for a back panel); the edges curl away from the body.
// With a `trim` colour the bottom `trimHeight` metres are that colour, with a sharp edge (the row
// where they meet is doubled, so the colours do not blend). Plain vertex colours, so the panel
// needs no texture.
function clothPanel(ctx, knots, { color, cols = 8, rowsPerKnot = 3, curve = 1.6, trim = null, trimHeight = 0.08 }) {
  const at = (y) => {
    for (let k = 0; k < knots.length - 1; k++) {
      const a = knots[k], b = knots[k + 1];
      if (y <= a[0] && y >= b[0]) {
        const t = (a[0] - y) / (a[0] - b[0] || 1);
        return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    return knots[knots.length - 1];
  };
  const rows = []; // [y, half width, z, trimmed?]
  for (let k = 0; k < knots.length - 1; k++) {
    for (let s = 0; s < rowsPerKnot; s++) rows.push([...at(knots[k][0] + (knots[k + 1][0] - knots[k][0]) * (s / rowsPerKnot)), false]);
  }
  const bottom = knots[knots.length - 1];
  if (trim !== null) {
    const yb = bottom[0] + trimHeight;
    let cut = rows.findIndex((r) => r[0] < yb);
    if (cut < 0) cut = rows.length;
    rows.splice(cut, 0, [...at(yb), false], [...at(yb), true]);
    for (let j = cut + 2; j < rows.length; j++) rows[j][3] = true;
    rows.push([...bottom, true]);
  } else rows.push([...bottom, false]);
  const front = knots[0][2] >= 0;
  const base = new THREE.Color(color), edge = new THREE.Color(trim ?? color);
  const pos = [], idx = [], skinIndex = [], skinWeight = [], colors = [];
  rows.forEach(([y, w, z, trimmed]) => {
    for (let i = 0; i <= cols; i++) {
      const x = ((i / cols) * 2 - 1) * w;
      pos.push(x, y, z - Math.sign(z) * curve * x * x);
      const wt = panelWeights(y, x).map((v, n) => [v, n]).sort((p, q) => q[0] - p[0]).slice(0, 4);
      const sum = wt.reduce((acc, v) => acc + v[0], 0) || 1;
      for (let n = 0; n < 4; n++) { skinIndex.push(wt[n][1]); skinWeight.push(wt[n][0] / sum); }
      const c = trimmed ? edge : base;
      colors.push(c.r, c.g, c.b);
    }
  });
  for (let j = 0; j < rows.length - 1; j++) {
    if (rows[j][0] === rows[j + 1][0] && rows[j][3] !== rows[j + 1][3]) continue; // the sharp edge of the trim
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, c = a + cols + 1;
      if (front) idx.push(a, c, a + 1, a + 1, c, c + 1);
      else idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, clothMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'gear_panel';
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.armature.add(mesh);
  const list = ['spine_02', 'spine_01', 'pelvis', 'thigh_l', 'thigh_r'].map((n) => ctx.bones[n]);
  mesh.bind(new THREE.Skeleton(list), mesh.matrixWorld);
  return mesh;
}

const HATS = {
  // wide brim, low round crown
  straw: { profile: [[0, 0.135], [0.045, 0.133], [0.085, 0.118], [0.099, 0.075], [0.102, 0.03], [0.12, 0.012], [0.19, 0.004], [0.255, -0.012], [0.262, -0.026]], y: 1.715, z: -0.012 },
  // a snug woollen cap with a rolled edge
  // a tall pointed hat with a broad brim
  pointed: { profile: [[0, 0.4], [0.008, 0.37], [0.026, 0.29], [0.05, 0.19], [0.073, 0.1], [0.092, 0.035], [0.108, 0.008], [0.16, 0.0], [0.215, -0.012], [0.243, -0.03]], y: 1.728, z: -0.012 },
  knit: { profile: [[0, 0.104], [0.03, 0.102], [0.06, 0.093], [0.088, 0.073], [0.106, 0.045], [0.116, 0.015], [0.12, -0.012], [0.127, -0.028], [0.124, -0.043], [0.112, -0.038]], y: 1.742, z: -0.012 },
};

function wear(g, ctx) {
  if (g.kind === 'hat') {
    const h = HATS[g.style || 'straw'];
    const k = g.size ?? 1;
    const geo = new THREE.LatheGeometry(h.profile.map(([r, y]) => new THREE.Vector2(r * k, y * k)), 24);
    const mesh = new THREE.Mesh(geo, clothMaterial(g.color ?? 0xc9a85a, { roughness: 1 }));
    mesh.name = 'gear_hat';
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(0, h.y + (g.lift ?? 0), h.z + (g.forward ?? 0));
    if (g.band !== undefined) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.107, 0.03, 24, 1, true), clothMaterial(g.band));
      band.position.y = 0.024;
      band.castShadow = true;
      mesh.add(band);
    }
    ctx.root.add(mesh);
    ctx.root.updateMatrixWorld(true);
    ctx.bones.Head.attach(mesh);
  } else if (g.kind === 'apron') {
    const len = g.length ?? 0.62;
    // (measured on the bodies: the belly and hips are 0.11-0.12 ahead of the spine, the thighs 0.06,
    // a woman's chest 0.13; the panel stands 1.5 cm off that, and hangs further out below the hips
    // so a bent knee does not push through it)
    const bust = ctx.female ? 0.04 : 0;
    clothPanel(ctx, [[1.4, 0.08, 0.125 + bust], [1.3, 0.115, 0.14 + bust], [1.16, 0.135, 0.14], [1.0, 0.14, 0.145], [0.9, 0.145, 0.15], [len, 0.16, 0.14]], { color: g.color ?? 0xe8e0cc, trim: g.trim ?? null, curve: 1.6 });
  } else if (g.kind === 'tabard') {
    const len = g.length ?? 0.66;
    const knots = (s) => [[1.5, 0.11, s * 0.15], [1.4, 0.16, s * 0.155], [1.2, 0.17, s * 0.15], [1.0, 0.18, s * 0.14], [len, 0.19, s * 0.13]];
    clothPanel(ctx, knots(1), { color: g.color, trim: g.trim ?? null, curve: 1.3 });
    clothPanel(ctx, knots(-1).map(([y, w, z]) => [y, w, z * 1.3]), { color: g.color, trim: g.trim ?? null, curve: 1.3 });
  }
}

// Shadows on, and for skinned meshes a culling sphere generous enough around the bind
// pose that animation can't escape it.
export function prepareMesh(o) {
  o.castShadow = true;
  o.receiveShadow = true;
  if (o.isSkinnedMesh) {
    o.computeBoundingSphere();
    o.boundingSphere.radius = Math.max(o.boundingSphere.radius * 1.6, 1.2);
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
