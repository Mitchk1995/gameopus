import { setup, shot } from './lib.mjs';
export default async ({ page, out, ev }) => {
  await setup(page);
  await ev(() => __ui(false));
  const info = await ev(() => { const b = __game.world.sites.parts.bridge; return JSON.stringify({ x: b.x, z: b.z, L: b.length, span: b.span, yA: b.yA, yB: b.yB, xa: b.xa, xb: b.xb }); });
  console.log(info);
  const S = [
    ['bridge_walk', () => __stand(66, 4, Math.PI / 2, -0.12)],
    ['bridge_side', () => __eye(90, 26, 90, 3, 3, 1.7, 60)],
    ['bridge_high', () => __cam(78, 12, 22, 92, 2, 3, 55)],
    ['bridge_east', () => __eye(120, 2, 90, 4, 3, 1.7, 60)],
  ];
  for (const [name, fn] of S) { await ev(fn); await shot(page, out, name); }
};
