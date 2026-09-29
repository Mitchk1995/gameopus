// Check the packaged game offline, exercise real keyboard input, then save and
// relaunch. Every launch uses one unique throwaway profile, never the owner's.
//   node scripts/smoke-app.mjs [out-dir] [--owner-save]
// --owner-save starts the throwaway profile from a COPY of the owner's save, to check that their
// progress loads and where they start.
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const exe = path.resolve(process.env.APP || 'release/Aldermere/Aldermere.exe');
assert.ok(existsSync(exe), `Packaged app is missing: ${exe}`);
const out = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'tests/playtest/out');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'aldermere-smoke-'));
const owner = path.join(process.env.APPDATA || '', 'Aldermere', 'Local Storage');
const ownerCopy = process.argv.includes('--owner-save');
if (ownerCopy) {
  assert.ok(existsSync(owner), `No existing owner profile to copy at ${owner}`);
  cpSync(owner, path.join(profile, 'Local Storage'), { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let active = null;
const report = { exe, profile, ownerCopy, checks: [] };
const passed = (name, detail) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}: ${JSON.stringify(detail)}`); };

async function stop() {
  const session = active;
  active = null;
  if (!session) return;
  const { child, page, browser } = session;
  await page?.close({ runBeforeUnload: true }).catch(() => {});
  await browser?.close().catch(() => {});
  const running = () => child.exitCode === null && child.signalCode === null && !session.launchError;
  if (running()) await Promise.race([once(child, 'exit').catch(() => {}), delay(3000)]);
  if (running()) {
    // This is precisely the process this run created, never another game window.
    child.kill();
    await Promise.race([once(child, 'exit').catch(() => {}), delay(3000)]);
  }
  assert.ok(!running(), `Smoke app process ${child.pid} did not exit`);
}

async function launch(label) {
  // Chromium writes its OS-assigned endpoint inside our unique profile. A stale
  // random port can never attach us to somebody else's browser or game.
  const endpointFile = path.join(profile, 'DevToolsActivePort');
  await unlink(endpointFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  const child = spawn(exe, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], { stdio: 'ignore', windowsHide: true });
  const session = active = { child, errors: [], externalRequests: [] };
  child.on('error', (error) => { session.launchError = error; });
  for (let i = 0; i < 120 && !session.browser; i++) {
    if (session.launchError) throw session.launchError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`App exited before debugging was ready: ${child.exitCode}`);
    try {
      const [port, endpoint] = (await readFile(endpointFile, 'utf8')).trim().split(/\r?\n/);
      if (/^\d+$/.test(port) && endpoint?.startsWith('/devtools/browser/')) session.browser = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${endpoint}`);
    } catch { /* the endpoint file may still be being written */ }
    if (!session.browser) await delay(250);
  }
  assert.ok(session.browser, 'Could not attach to the isolated app');
  const ctx = session.browser.contexts()[0];
  for (let i = 0; i < 80 && !session.page; i++) {
    session.page = ctx.pages().find((p) => p.url().startsWith('aldermere://'));
    if (!session.page) await delay(250);
  }
  const page = session.page;
  assert.ok(page, 'App did not create its game page');
  let capture = true;
  session.stopCapture = () => { capture = false; };
  const fail = (message) => { if (capture) session.errors.push(message); };
  page.on('pageerror', (error) => fail(`PAGEERROR ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') fail(`console ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) fail(`HTTP ${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => fail(`REQUESTFAILED ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) session.externalRequests.push(request.url()); });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  if (ownerCopy && label === 'first') {
    // Check the copied save before a reload's beforeunload handler can rewrite it.
    const progress = await page.evaluate(() => ({ raw: localStorage.getItem('aldermere.save.v1'), loaded: __game.state.toJSON() }));
    assert.ok(progress.raw, 'Copied profile contains no existing game save');
    const original = JSON.parse(progress.raw);
    for (const key of ['inv', 'bank', 'equip', 'quests', 'collection']) {
      if (original[key] !== undefined) assert.deepEqual(progress.loaded[key], original[key], `Copied save did not restore ${key}`);
    }
    for (const [skill, xp] of Object.entries(original.skills || {})) assert.equal(progress.loaded.skills[skill], xp, `Copied save lost ${skill} XP`);
    passed('existing save copy restored', { inventorySlots: original.inv?.filter(Boolean).length || 0, bankSlots: original.bank?.filter(Boolean).length || 0 });
  }

  // Reload without network or cache so locally bundled fonts/assets are actually
  // required; a previously cached internet resource cannot make this check pass.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  const fonts = await page.evaluate(async () => {
    const faces = await Promise.all(['500 16px "Cinzel"', '400 16px "Alegreya Sans"'].map((font) => document.fonts.load(font)));
    return faces.map((set) => ({ count: set.length, loaded: set.every((face) => face.status === 'loaded') }));
  });
  assert.ok(fonts.every((font) => font.count > 0 && font.loaded), 'Bundled fonts did not load offline');
  assert.deepEqual(session.externalRequests, [], 'Game attempted an external request');
  assert.deepEqual(session.errors, [], 'App reported a load error');
  passed(`${label} offline startup`, { fonts, pid: child.pid });
  return session;
}

try {
  const first = await launch('first');
  const page = first.page;
  await page.bringToFront();
  await page.locator('button.play').click();
  await page.waitForFunction(() => __game.input.locked && document.pointerLockElement, null, { timeout: 10000 });
  let movement;
  // An existing save can face a wall. Try actual directions, without teleporting
  // or pretending input is held, so the copy gets a fair movement check too.
  for (const key of ownerCopy ? ['w', 'a', 's', 'd'] : ['w']) {
    const before = await page.evaluate(() => ({ x: __game.player.pos.x, z: __game.player.pos.z }));
    await page.keyboard.down(key);
    await page.waitForTimeout(850);
    await page.keyboard.up(key);
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ x: __game.player.pos.x, z: __game.player.pos.z, held: ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(k => __game.input.down(k)) }));
    movement = { key, before, after, metres: Math.hypot(after.x - before.x, after.z - before.z) };
    if (movement.metres > 0.3) break;
  }
  assert.ok(movement.metres > 0.3 && !movement.after.held, `Real keyboard movement failed: ${JSON.stringify(movement)}`);
  passed('captured mouse and real keyboard movement', { key: movement.key, metres: +movement.metres.toFixed(2) });
  const marker = `smoke-${Date.now()}`;
  const saved = await page.evaluate((token) => {
    const g = __game;
    g.state.flags.desktopSmoke = token;
    g.state.inv.add('coins', 7);
    g.save();
    return { marker: token, coins: g.state.inv.count('coins'), pos: { x: g.player.pos.x, z: g.player.pos.z } };
  }, marker);
  await page.screenshot({ path: path.join(out, 'app_smoke.png') });
  assert.deepEqual(first.errors, [], 'App reported an input/save error');
  first.stopCapture();
  await stop();

  const second = await launch('relaunch');
  const restored = await second.page.evaluate(() => ({ marker: __game.state.flags.desktopSmoke, coins: __game.state.inv.count('coins'), pos: { x: __game.player.pos.x, z: __game.player.pos.z } }));
  assert.equal(restored.marker, saved.marker, 'Save marker did not survive application restart');
  assert.equal(restored.coins, saved.coins, 'Inventory did not survive application restart');
  assert.ok(Math.hypot(restored.pos.x - saved.pos.x, restored.pos.z - saved.pos.z) < 0.25, 'Saved position did not survive application restart');
  passed('save and full application relaunch', restored);
  await second.page.screenshot({ path: path.join(out, 'app_relaunch.png') });
  assert.deepEqual(second.errors, [], 'App reported a restore error');
  second.stopCapture();
} catch (error) {
  report.error = error.stack || String(error);
  if (active?.page && !active.page.isClosed()) {
    report.window = await active.page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, pointerLock: !!document.pointerLockElement, inputLocked: window.__game?.input?.locked })).catch(() => null);
    report.pageErrors = active.errors;
    await active.page.screenshot({ path: path.join(out, 'app_failure.png') }).catch(() => {});
  }
  console.error(`FAIL ${report.error}`);
  if (report.window) console.error(`Window state: ${JSON.stringify(report.window)}; errors: ${JSON.stringify(report.pageErrors)}`);
  process.exitCode = 1;
} finally {
  await stop().catch((error) => { console.error(`FAIL cleanup: ${error.message}`); process.exitCode = 1; });
  await writeFile(path.join(out, 'app-smoke.json'), JSON.stringify(report, null, 2));
  console.log(`Isolated QA profile: ${profile}`);
}
