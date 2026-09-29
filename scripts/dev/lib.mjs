// Helpers for scratch screenshot scripts.
export const PAGE_HELPERS = `
window.__ui = (on) => { for (const el of document.body.children) if (el.id !== 'app' && el.tagName !== 'SCRIPT') el.style.display = on ? '' : 'none'; };
// Camera at (x,y,z) looking at (tx,ty,tz); the player stands at the target (for shadows and grass).
window.__cam = (x, y, z, tx, ty, tz, fov = 58, stand = true) => {
  const g = __game;
  if (stand) { g.player.spawn(tx, tz, 0); g.hero.root.visible = false; }
  g.camera.fov = fov; g.camera.updateProjectionMatrix();
  g.camera.position.set(x, y, z);
  g.camera.lookAt(tx, ty, tz);
  g.camera.updateMatrixWorld(true);
  g.world.forest.lastUpdate.set(1e9, 0, 0);
  g.draw(1 / 60); g.draw(1 / 60);
};
// The player at (x,z) facing yaw, camera behind at the rig's default; then draw.
window.__stand = (x, z, yaw, pitch = -0.12) => {
  const g = __game;
  g.player.spawn(x, z, yaw); g.rig.yaw = yaw + Math.PI; g.rig.pitch = pitch; g.rig.snap(); g.hero.root.visible = true;
  g.camera.fov = 58; g.camera.updateProjectionMatrix();
  g.run(0.5);
};
// Eye-level view from a spot toward a target: the camera at the ground + eye height.
window.__eye = (x, z, tx, ty, tz, eye = 1.7, fov = 62) => {
  const g = __game; const y = g.world.heightAt(x, z) + eye;
  window.__cam(x, y, z, tx, ty, tz, fov, false);
};
// Straight-down orthographic view of a square (centre cx, cz, side span metres).
window.__top = (cx, cz, span = 800, trees = true) => {
  const g = __game, T = __THREE;
  const fog = g.scene.fog; g.scene.fog = null;
  const dome = g.world.sky.dome; dome.visible = false;
  const bg = g.scene.background; g.scene.background = new T.Color(0x20242c);
  const ter = g.world.terrain;
  ter.chunks.forEach((c) => { c.mesh.visible = true; c.mesh.geometry = ter.patches[0]; });
  const cam = new T.OrthographicCamera(-span / 2, span / 2, span / 2 * 0.5625 * 1.7777, -span / 2 * 0.5625 * 1.7777, 1, 3000);
  const asp = g.renderer.domElement.width / g.renderer.domElement.height;
  cam.left = -span / 2 * asp; cam.right = span / 2 * asp; cam.top = span / 2; cam.bottom = -span / 2; cam.updateProjectionMatrix();
  cam.position.set(cx, 1500, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld(true);
  g.player.spawn(cx, cz, 0); g.hero.root.visible = false;
  for (const v of g.world.forest.variants) for (const m of Object.values(v.meshes)) m.visible = trees;
  if (trees) { g.world.forest.forceLod = 'mid'; g.world.forest.lastUpdate.set(1e9, 0, 0); g.world.forest.update(0, cam); }
  g.renderer.render(g.scene, cam);
  g.scene.fog = fog; dome.visible = true; g.scene.background = bg;
  for (const v of g.world.forest.variants) for (const m of Object.values(v.meshes)) m.visible = true;
  g.world.forest.forceLod = null;
  g.world.forest.lastUpdate.set(1e9, 0, 0);
};
`;
export async function setup(page) {
  await page.evaluate(PAGE_HELPERS);
}
export async function shot(page, out, name, wait = 250) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
}
