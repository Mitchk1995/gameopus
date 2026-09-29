// Downloads the game's free art (CC0/MIT) and optimizes it into public/assets/.
//   node scripts/fetch-assets.mjs [step ...]     steps: quaternius, combat, polyhaven, props, trees (default: all)
//   node scripts/fetch-assets.mjs kaykit         (opt-in) KayKit clips retargeted, for the animation lab
// Raw downloads are cached in .asset-cache/ (gitignored); the optimized output is committed.
import { mkdir, writeFile, readdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { makeIO, optimizeDoc } from './optimize-gltf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.asset-cache');
const OUT = path.join(ROOT, 'public/assets');
const steps = process.argv.slice(2);
const want = (s) => !steps.length || steps.includes(s);

// ---------------------------------------------------------------- itch.io (Quaternius, CC0)
const PACKS = {
  'universal-animation-library': 'ual1',
  'universal-animation-library-2': 'ual2',
  'universal-base-characters': 'ubc',
  'modular-character-outfits-fantasy': 'outfits',
  'medieval-village-megakit': 'village',
  'fantasy-props-megakit': 'props',
  'bestiary-dungeon-monsters-kit': 'bestiary',
};

async function itchDownload(slug, user = 'quaternius') {
  const dir = path.join(CACHE, 'itch', slug);
  await mkdir(dir, { recursive: true });
  const done = (await readdir(dir)).find((f) => f.endsWith('.zip'));
  if (done) return path.join(dir, done);
  const page = `https://${user}.itch.io/${slug}`;
  let cookie = '';
  const req = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), cookie } });
    const set = r.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return r;
  };
  const html = await (await req(page)).text();
  const csrf = html.match(/name="csrf_token" value="([^"]+)"/)[1];
  const body = new URLSearchParams({ csrf_token: csrf });
  const { url: dlPage } = await (await req(`${page}/download_url`, { method: 'POST', body })).json();
  const d = await (await req(dlPage)).text();
  const uploads = [...d.matchAll(/data-upload_id="(\d+)"[\s\S]*?<strong title="([^"]+)" class="name">/g)];
  for (const [, id, name] of uploads) {
    const j = await (await req(`${page}/file/${id}?source=view_game&as_props=1&after_download_lightbox=true`, { method: 'POST', body })).json();
    console.log('  downloading', name);
    const file = path.join(dir, name.endsWith('.zip') ? name : `${name}.zip`);
    const r = await fetch(j.url);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    return file;
  }
  throw new Error(`no uploads for ${slug}`);
}

async function unpack(slug) {
  const zip = await itchDownload(slug);
  const dir = path.join(CACHE, 'unpacked', PACKS[slug]);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  }
  return dir;
}

async function findFile(dir, name) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const f = await findFile(p, name);
      if (f) return f;
    } else if (e.name === name) return p;
  }
  return null;
}

async function optimize(input, output, opts = {}) {
  const io = await makeIO();
  const doc = await io.read(input);
  await optimizeDoc(doc, opts);
  await mkdir(path.dirname(output), { recursive: true });
  await io.write(output, doc);
  const kb = ((await stat(output)).size / 1024).toFixed(0);
  console.log(`  ${path.relative(OUT, output)} ${kb} KB`);
}

// Merge many small glTF files into one GLB; each source's root nodes keep their names.
async function mergeKit(files, output, opts = {}) {
  const io = await makeIO();
  const { mergeDocuments, unpartition } = await import('@gltf-transform/functions');
  const target = await io.read(files[0]);
  for (const f of files.slice(1)) mergeDocuments(target, await io.read(f));
  const root = target.getRoot();
  const scene = root.listScenes()[0];
  for (const s of root.listScenes().slice(1)) {
    for (const n of s.listChildren()) scene.addChild(n);
    s.dispose();
  }
  await target.transform(unpartition());
  await optimizeDoc(target, opts);
  await mkdir(path.dirname(output), { recursive: true });
  await io.write(output, target);
  console.log(`  ${path.relative(OUT, output)} ${((await stat(output)).size / 1024).toFixed(0)} KB (${files.length} parts)`);
}

// Clips the game uses, by library. Keeps the download small.
const CLIPS = {
  ual1: ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Roll', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Death01', 'Hit_Chest', 'Hit_Head',
    'Interact', 'PickUp_Table', 'Idle_Talking_Loop', 'Sitting_Idle_Loop', 'Sword_Attack', 'Sword_Idle', 'Spell_Simple_Enter', 'Spell_Simple_Idle_Loop',
    'Spell_Simple_Shoot', 'Spell_Simple_Exit', 'Fixing_Kneeling', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Idle_Torch_Loop', 'Punch_Jab', 'Punch_Cross'],
  ual2: ['Sword_Block', 'Sword_Dash', 'Sword_Heavy_Combo', 'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C',
    'Sword_Regular_Combo', 'Idle_Shield_Loop', 'Idle_Shield_Break', 'Shield_Dash', 'Hit_Knockback', 'TreeChopping_Loop', 'Consume', 'Chest_Open', 'OverhandThrow',
    'Idle_FoldArms_Loop', 'Idle_Lantern_Loop', 'Walk_Carry_Loop', 'Zombie_Idle_Loop', 'Zombie_Scratch', 'Zombie_Walk_Fwd_Loop', 'Yes', 'Idle_No_Loop', 'Melee_Hook', 'Farm_Harvest'],
};

async function quaternius() {
  console.log('Quaternius packs');
  const ual1 = await unpack('universal-animation-library');
  const ual2 = await unpack('universal-animation-library-2');
  await optimize(await findFile(ual1, 'UAL1_Standard.glb'), path.join(OUT, 'anims/ual1.glb'), { dropMeshes: true, keepAnims: CLIPS.ual1 });
  await optimize(await findFile(ual2, 'UAL2_Standard.glb'), path.join(OUT, 'anims/ual2.glb'), { dropMeshes: true, keepAnims: CLIPS.ual2 });

  const ubc = await unpack('universal-base-characters');
  const bodyDir = path.dirname(await findFile(ubc, 'Superhero_Male_FullBody.gltf'));
  // The shipped glTFs reference a few texture names that are missing; alias them.
  for (const [alias, real] of [['T_Hair_1_Normal_png.png', 'T_Hair_1_Normal.png'], ['T_Eye_Normal_png.png', 'T_Eye_Normal.png']])
    if (!existsSync(path.join(bodyDir, alias))) await copyFile(path.join(bodyDir, real), path.join(bodyDir, alias));
  for (const who of ['Male', 'Female'])
    await optimize(path.join(bodyDir, `Superhero_${who}_FullBody.gltf`), path.join(OUT, `chars/base_${who.toLowerCase()}.glb`), { tex: 1024 });
  const hairDir = path.dirname(await findFile(path.join(ubc, 'Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone'), 'Hair_Long.gltf'));
  for (const f of (await readdir(hairDir)).filter((f) => f.endsWith('.gltf')))
    await optimize(path.join(hairDir, f), path.join(OUT, `chars/hair/${f.replace('.gltf', '.glb').toLowerCase()}`), { tex: 512 });

  const outfits = await unpack('modular-character-outfits-fantasy');
  const outfitDir = path.dirname(await findFile(outfits, 'Male_Peasant.gltf'));
  for (const f of (await readdir(outfitDir)).filter((f) => f.endsWith('.gltf')))
    await optimize(path.join(outfitDir, f), path.join(OUT, `chars/outfits/${f.replace('.gltf', '.glb').toLowerCase()}`), { tex: 1024 });

  const village = await unpack('medieval-village-megakit');
  const vDir = path.dirname(await findFile(village, 'Wall_Plaster_Straight.gltf'));
  const vFiles = (await readdir(vDir)).filter((f) => f.endsWith('.gltf')).map((f) => path.join(vDir, f));
  await mergeKit(vFiles, path.join(OUT, 'kits/village.glb'), { tex: 1024 });

  const props = await unpack('fantasy-props-megakit');
  const pDir = path.dirname(await findFile(props, 'Anvil.gltf'));
  const pFiles = (await readdir(pDir)).filter((f) => f.endsWith('.gltf')).map((f) => path.join(pDir, f));
  await mergeKit(pFiles, path.join(OUT, 'kits/props.glb'), { tex: 1024 });

  const best = await unpack('bestiary-dungeon-monsters-kit');
  for (const m of ['Imp', 'Puglin']) {
    await optimize(await findFile(best, `${m}.glb`), path.join(OUT, `monsters/${m.toLowerCase()}.glb`), { tex: 1024 });
    // The other two colourings, for tougher variants.
    for (const k of [2, 3]) {
      const tex = await findFile(best, `T_${m}_BaseColor_${k}.png`);
      await sharp(tex).resize(1024, 1024).webp({ quality: 88 }).toFile(path.join(OUT, `monsters/${m.toLowerCase()}_${k}.webp`));
    }
  }
}

// ---------------------------------------------------------------- composed combat clips (CC0)
// A sword guard you can hold and a blow landing on it, built from pieces of the library's own
// clips (the library has neither). See scripts/compose-clips.mjs.
async function combat() {
  console.log('Composed combat clips');
  const { composeCombat } = await import('./compose-clips.mjs');
  const size = await composeCombat(path.join(OUT, 'anims'));
  console.log(`  anims/combat.glb ${(size / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------- KayKit animations (CC0), lab only
// Not shipped. KayKit's 150 clips retarget cleanly onto our rig (scripts/retarget.mjs), but they
// are made for chunky toy proportions and read stiff on our people (DESIGN.md, Art sources).
// This writes them to .asset-cache/lab/kaykit.glb, for side-by-side sheets:
//   LAB_LOAD=lab/kaykit.glb LAB_CLIPS=KK_Dodge_Forward python tests/playtest/anim_sheet.py
async function kaykit() {
  console.log('KayKit animations (lab)');
  const zip = await itchDownload('kaykit-character-animations', 'kaylousberg');
  const dir = path.join(CACHE, 'unpacked', 'kaykit');
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  }
  const { skeleton, retargetClip, addClip, sampleClip } = await import('./retarget.mjs');
  const { clearAnimations } = await import('./compose-clips.mjs');
  const io = await makeIO();
  const out = await io.read(path.join(OUT, 'anims/ual1.glb'));
  const bones = new Set(out.getRoot().listAnimations()[0].listChannels().map((c) => c.getTargetNode().getName()));
  const grip = sampleClip(out, 'Sword_Idle', 0);
  clearAnimations(out);
  const tgt = { skel: skeleton(out) };
  tgt.skel.list = tgt.skel.list.filter((b) => bones.has(b.name) || b.name === 'Armature');
  const fixed = new Map([...grip].filter(([n]) => /^(thumb|index|middle|ring|pinky)_/.test(n)));
  const MAP = {
    pelvis: 'hips', spine_01: 'spine', spine_03: 'chest', Head: 'head',
    upperarm_l: 'upperarm.l', lowerarm_l: 'lowerarm.l', hand_l: 'hand.l', upperarm_r: 'upperarm.r', lowerarm_r: 'lowerarm.r', hand_r: 'hand.r',
    thigh_l: 'upperleg.l', calf_l: 'lowerleg.l', foot_l: 'foot.l', ball_l: 'toes.l', thigh_r: 'upperleg.r', calf_r: 'lowerleg.r', foot_r: 'foot.r', ball_r: 'toes.r',
  };
  let n = 0;
  for (const part of ['CombatMelee', 'MovementAdvanced', 'MovementBasic', 'General']) {
    const doc = await io.read(await findFile(dir, `Rig_Medium_${part}.glb`));
    const src = { skel: skeleton(doc) };
    // Leg length (hip joint height) ours / KayKit's: scales the hips' movement.
    for (const anim of doc.getRoot().listAnimations()) {
      if (/T-Pose|_Pose$/.test(anim.getName())) continue;
      addClip(out, tgt.skel, `KK_${anim.getName()}`, retargetClip(src, tgt, anim, MAP, { legScale: 0.932 / 0.519, fixed }), { only: bones });
      n++;
    }
  }
  await optimizeDoc(out, { dropMeshes: true });
  await mkdir(path.join(CACHE, 'lab'), { recursive: true });
  await io.write(path.join(CACHE, 'lab/kaykit.glb'), out);
  console.log(`  .asset-cache/lab/kaykit.glb (${n} clips)`);
}

// ---------------------------------------------------------------- Poly Haven (CC0)
const SKY = 'kloofendal_48d_partly_cloudy_puresky';
const GROUND = {
  grass: 'leafy_grass',
  forest: 'forest_ground_04',
  rock: 'rocky_terrain_02',
  path: 'grass_path_2',
  cobble: 'cobblestone_floor_04',
  sand: 'coast_sand_01',
  cliff: 'rock_face_03',
  snow: 'snow_field_aerial',
};

async function cached(url, name) {
  const file = path.join(CACHE, 'polyhaven', name);
  if (!existsSync(file)) {
    await mkdir(path.dirname(file), { recursive: true });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
  }
  return file;
}

async function polyhaven() {
  console.log('Poly Haven');
  await mkdir(path.join(OUT, 'sky'), { recursive: true });
  const files = await (await fetch(`https://api.polyhaven.com/files/${SKY}`)).json();
  const hdr = await cached(files.hdri['1k'].hdr.url, `${SKY}_1k.hdr`);
  await copyFile(hdr, path.join(OUT, 'sky/sky_1k.hdr'));
  const tm = await cached(files.tonemapped.url, `${SKY}_tonemapped.jpg`);
  await sharp(tm, { limitInputPixels: false }).resize(4096, 2048).webp({ quality: 86 }).toFile(path.join(OUT, 'sky/sky_4k.webp'));
  console.log('  sky/sky_1k.hdr, sky/sky_4k.webp');

  // Ground materials, two textures each (no alpha, so browsers can't mangle the data):
  //   <id>_a.webp  : albedo RGB with a touch of baked ambient occlusion
  //   <id>_nr.webp : OpenGL normal X/Y in R/G, roughness in B (normal Z is rebuilt in the shader)
  await mkdir(path.join(OUT, 'ground'), { recursive: true });
  for (const [id, asset] of Object.entries(GROUND)) {
    const f = await (await fetch(`https://api.polyhaven.com/files/${asset}`)).json();
    const diff = await cached(f.Diffuse['1k'].jpg.url, `${asset}_diff.jpg`);
    const nor = await cached(f.nor_gl['1k'].jpg.url, `${asset}_nor.jpg`);
    const arm = await cached(f.arm['1k'].jpg.url, `${asset}_arm.jpg`);
    const a = await sharp(diff).resize(1024, 1024).removeAlpha().raw().toBuffer();
    const n = await sharp(nor).resize(1024, 1024).removeAlpha().raw().toBuffer();
    const m = await sharp(arm).resize(1024, 1024).removeAlpha().raw().toBuffer();
    const albedo = Buffer.alloc(1024 * 1024 * 3), nr = Buffer.alloc(1024 * 1024 * 3);
    for (let i = 0; i < 1024 * 1024; i++) {
      const k = 1 - (1 - m[i * 3] / 255) * 0.5;
      albedo[i * 3] = a[i * 3] * k;
      albedo[i * 3 + 1] = a[i * 3 + 1] * k;
      albedo[i * 3 + 2] = a[i * 3 + 2] * k;
      nr[i * 3] = n[i * 3];
      nr[i * 3 + 1] = n[i * 3 + 1];
      nr[i * 3 + 2] = m[i * 3 + 1];
    }
    const raw = { raw: { width: 1024, height: 1024, channels: 3 } };
    await sharp(albedo, raw).webp({ quality: 86 }).toFile(path.join(OUT, `ground/${id}_a.webp`));
    await sharp(nr, raw).webp({ quality: 92 }).toFile(path.join(OUT, `ground/${id}_nr.webp`));
    console.log(`  ground/${id} (${asset})`);
  }
}

// Surfaces for the town's grounds (hay, tilled soil, linen), two textures each at 512 px:
//   props/<id>_a.webp : albedo, props/<id>_n.webp : OpenGL normal map
const PROPS = { hay: 'reed_roof_04', soil: 'farm_soil', linen: 'rough_linen' };

// The thatch scan has its mossy ridge along the top: cut it off, then cross-fade the bottom rows into
// the top ones so the straw tiles vertically without a seam.
async function seamless(file, cropTop) {
  const img = sharp(file).removeAlpha();
  const { width: W, height: H } = await img.metadata();
  const top = Math.round(H * cropTop), fade = Math.round(H * 0.12);
  const raw = await sharp(file).removeAlpha().extract({ left: 0, top, width: W, height: H - top }).raw().toBuffer();
  const h = H - top, out = Buffer.alloc(W * (h - fade) * 3);
  for (let y = 0; y < h - fade; y++)
    for (let x = 0; x < W * 3; x++) {
      const k = y < fade ? y / fade : 1;
      const a = raw[(y + fade) * W * 3 + x], b = y < fade ? raw[(h - fade + y) * W * 3 + x] : a;
      out[y * W * 3 + x] = Math.round(a * k + b * (1 - k));
    }
  return sharp(out, { raw: { width: W, height: h - fade, channels: 3 } });
}

async function propTextures() {
  console.log('Poly Haven (props)');
  await mkdir(path.join(OUT, 'props'), { recursive: true });
  for (const [id, asset] of Object.entries(PROPS)) {
    const f = await (await fetch(`https://api.polyhaven.com/files/${asset}`)).json();
    const diff = await cached(f.Diffuse['1k'].jpg.url, `${asset}_diff.jpg`);
    const nor = await cached(f.nor_gl['1k'].jpg.url, `${asset}_nor.jpg`);
    const src = async (file) => (id === 'hay' ? seamless(file, 0.075) : sharp(file).removeAlpha());
    let a = (await src(diff)).resize(512, 512);
    // Linen is dyed in the game (vertex colours), so it starts out as undyed grey-white cloth.
    if (id === 'linen') a = a.grayscale().linear(1.15, 12);
    await a.webp({ quality: 86 }).toFile(path.join(OUT, `props/${id}_a.webp`));
    await (await src(nor)).resize(512, 512).webp({ quality: 90 }).toFile(path.join(OUT, `props/${id}_n.webp`));
    console.log(`  props/${id} (${asset})`);
  }
}

// ---------------------------------------------------------------- ez-tree textures (MIT)
async function trees() {
  console.log('Tree textures');
  const src = path.join(ROOT, 'node_modules/@dgreenheck/ez-tree/src/lib/assets');
  await mkdir(path.join(OUT, 'trees'), { recursive: true });
  for (const f of await readdir(path.join(src, 'bark'))) {
    if (!f.endsWith('.jpg')) continue;
    await sharp(path.join(src, 'bark', f)).resize(512, 512).webp({ quality: 86 }).toFile(path.join(OUT, 'trees', f.replace('_1k.jpg', '.webp')));
  }
  for (const f of await readdir(path.join(src, 'leaves'))) {
    if (!f.endsWith('.png')) continue;
    await sharp(path.join(src, 'leaves', f)).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(OUT, 'trees', `leaves_${f.replace('_color.png', '.webp')}`));
  }
  console.log('  trees/*');
}

await mkdir(OUT, { recursive: true });
if (want('quaternius')) await quaternius();
if (want('combat')) await combat();
if (want('polyhaven')) await polyhaven();
if (want('polyhaven') || want('props')) await propTextures();
if (want('trees')) await trees();
if (steps.includes('kaykit')) await kaykit();
console.log('done');
