// Checks the packaged desktop game starts: launches release/Aldermere/Aldermere.exe with a throwaway
// profile (so the owner's own save in %APPDATA%\Aldermere is never touched), waits for the game to be
// ready, saves a screenshot, reports page errors, and closes it.
//   node scripts/smoke-app.mjs [out-dir] [--owner-save]
// --owner-save starts the throwaway profile from a COPY of the owner's save, to check that their
// progress loads and where they start.
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const exe = path.resolve(process.env.APP || 'release/Aldermere/Aldermere.exe');
const out = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'tests/playtest/out');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'aldermere-smoke-'));
const owner = path.join(process.env.APPDATA || '', 'Aldermere', 'Local Storage');
if (process.argv.includes('--owner-save') && existsSync(owner)) cpSync(owner, path.join(profile, 'Local Storage'), { recursive: true });

const port = 9300 + Math.floor(Math.random() * 600);
const child = spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { stdio: 'ignore' });
const t0 = Date.now();
let browser;
for (let i = 0; i < 60 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise((r) => setTimeout(r, 500)); }
}
if (!browser) {
  console.log('FAIL could not attach to the app');
  child.kill();
  process.exit(1);
}
const ctx = browser.contexts()[0];
let page = ctx.pages()[0];
for (let i = 0; i < 40 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); page = ctx.pages()[0]; }
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
const ready = await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 }).then(() => true, () => false);
console.log(ready ? `ready after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'FAIL the game never became ready');
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const g = window.__game, p = g?.player?.pos;
  return { title: document.title, at: p ? [+p.x.toFixed(1), +p.z.toFixed(1)] : null, items: g?.state?.inv?.slots?.filter(Boolean).length ?? null };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: path.join(out, 'app_smoke.png') });
console.log(errs.length ? 'FAIL ' + errs.slice(0, 10).join('\n') : 'no errors');
await browser.close().catch(() => {});
child.kill();
process.exit(ready && !errs.length ? 0 : 1);
