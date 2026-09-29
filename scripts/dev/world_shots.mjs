import fs from 'node:fs';
import sharp from 'sharp';
import { setup, shot } from './lib.mjs';
import * as M from '../../src/world/map.js';

// The pictures in docs/world for the ways out and the waymarks: each closure from 15 m down the road, an
// East Pass notice being read, a junction signpost and a cairn at eye level, and the minimap in four places.
// Run from the repo root after npm run build:
//   CHANNEL=chrome node scripts/dev/run.mjs scripts/dev/world_shots.mjs
// (J and C pick the junction and the cairn; Q is the JPEG quality, 60 keeps the set near 600 KB.) The PNGs go to
// .scratch/out (SP), the JPEGs straight to docs/world.
export default async ({ page, out, ev }) => {
  await setup(page);
  await ev(() => __ui(false));
  // Each closure from about 15 m down the road, the player in view.
  for (const e of M.EXITS) {
    const r = M.roadById(e.road);
    const p = M.pointAtRoad(r, e.s - 15), p2 = M.pointAtRoad(r, e.s - 12);
    const yaw = Math.atan2(p2[0] - p[0], p2[1] - p[1]);
    await ev(`__stand(${p[0]}, ${p[1]}, ${yaw}, -0.1)`);
    await shot(page, out, `doc_exit_${e.id}`);
  }
  // A notice being read: the east one, with the interface up.
  const e = M.EXITS[1];
  const n = JSON.parse(await ev(`JSON.stringify(__game.world.sites.interactables.find((o) => o.title === ${JSON.stringify(e.sign.title)}))`));
  const yaw = Math.atan2(n.x - (e.x - e.tx * 20), n.z - (e.z - e.tz * 20));
  await ev(`(() => { __ui(true); const g = __game; g.player.spawn(${n.x - Math.sin(yaw) * 2.7}, ${n.z - Math.cos(yaw) * 2.7}, ${yaw}); g.rig.yaw = ${yaw} + Math.PI; g.rig.pitch = -0.02; g.rig.snap(); g.sim(0.5); g.input.pressed.add('KeyE'); g.sim(1 / 60); g.run(0.3); })()`);
  await shot(page, out, 'doc_notice_read');
  await ev(`(() => { __game.endTalk(); __ui(false); })()`);
  // A junction signpost, eye level.
  const j = JSON.parse(await ev(`JSON.stringify(__game.world.sites.parts.waymarks.junctions)`));
  const jp = j[+(process.env.J || 5)];
  await ev(`(() => { const w = __game.world; const gy = w.heightAt(${jp.x}, ${jp.z}); const cx = ${jp.x} + Math.sin(0.55) * 6.5, cz = ${jp.z} + Math.cos(0.55) * 6.5; __cam(cx, w.heightAt(cx, cz) + 1.7, cz, ${jp.x}, gy + 2.3, ${jp.z}, 55, false); })()`);
  await shot(page, out, 'doc_signpost');
  // A cairn on a pad.
  const c = JSON.parse(await ev(`JSON.stringify(__game.world.sites.parts.waymarks.cairns)`));
  const cp = c[+(process.env.C || 1)];
  await ev(`(() => { const w = __game.world; const gy = w.heightAt(${cp.x}, ${cp.z}); const cx = ${cp.x} + Math.sin(0.7) * 6.5, cz = ${cp.z} + Math.cos(0.7) * 6.5; __cam(cx, w.heightAt(cx, cz) + 1.7, cz, ${cp.x}, gy + 1.3, ${cp.z}, 55, false); })()`);
  await shot(page, out, 'doc_cairn');
  // The minimap in four places: a junction, the lake shore, the East Pass, and a hill with a landmark.
  const gate = M.EXITS[1];
  const spots = [['waystation', 178, 40, 0.3], ['lighthouse', 20, 205, 0.3], ['gate', gate.x - gate.tx * 22, gate.z - gate.tz * 22, Math.atan2(gate.tx, gate.tz)], ['abbey', -10, -170, 3.0]];
  const windows = [];
  for (const [, x, z, yawM] of spots) {
    await ev(`(() => { const g = __game; g.player.spawn(${x}, ${z}, ${yawM}); g.rig.yaw = ${yawM} + Math.PI; g.sim(0.1); })()`);
    const url = await ev('document.querySelector(".minimap canvas").toDataURL("image/png")');
    windows.push(await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(340, 340).png().toBuffer());
  }
  const sheet = await sharp({ create: { width: 340 * windows.length, height: 340, channels: 3, background: '#222' } })
    .composite(windows.map((input, i) => ({ input, left: i * 340, top: 0 }))).png().toBuffer();
  // The pictures, as JPEGs in docs/world.
  const q = +(process.env.Q || 60);
  fs.mkdirSync('docs/world', { recursive: true });
  let total = 0;
  for (const [src, dst] of [['doc_exit_north', 'exit_north'], ['doc_exit_east', 'exit_east'], ['doc_exit_south', 'exit_south'], ['doc_notice_read', 'notice_read'], ['doc_signpost', 'signpost'], ['doc_cairn', 'cairn']]) {
    const info = await sharp(`${out}/${src}.png`).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: q, mozjpeg: true }).toFile(`docs/world/${dst}.jpg`);
    total += info.size;
  }
  total += (await sharp(sheet).jpeg({ quality: 84, mozjpeg: true }).toFile('docs/world/minimap.jpg')).size;
  console.log(`docs/world: 7 pictures, ${(total / 1024).toFixed(0)} KB`);
};
