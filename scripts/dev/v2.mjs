import { setup, shot } from './lib.mjs';
export default async ({ page, out, ev }) => {
  await setup(page);
  await ev(() => __ui(false));
  const S = [
    ['spawn_n', () => __stand(-8, 53, Math.PI, -0.1)],
    ['spawn_s', () => __stand(-8, 53, 0, -0.05)],
    ['gate_n', () => __eye(-27, -36, -60, 40, -300, 1.7, 70)],
    ['east_view', () => __eye(60, 14, 250, 30, 30, 1.7, 70)],
    ['quarry_n', () => __eye(-130, -128, -110, 60, -300, 1.7, 70)],
    ['lake_view', () => __eye(-30, 150, -70, 20, 300, 1.7, 70)],
    ['fort_view', () => __eye(215, 60, 262, 12, 70, 1.7, 70)],
    ['west_view', () => __eye(-60, 40, -200, 30, 0, 1.7, 70)],
  ];
  for (const [name, fn] of S) { await ev(fn); await shot(page, out, name); }
};
