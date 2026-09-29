// Scratch runner: serves dist/, opens the game in #test mode, then runs a Node module that
// gets { page, out, ev } (ev(fn|string) = page.evaluate). Usage: node scripts/dev/run.mjs .scratch/foo.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const DIST = path.resolve(process.env.DIST || 'dist');
const OUT = path.resolve(process.env.SP || '.scratch/out');
await mkdir(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, url === '/' ? 'index.html' : url);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ channel: process.env.CHANNEL || 'chrome', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); else if (process.env.LOG) console.log('console:', m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(`http://localhost:${port}/#test`);
await page.waitForFunction(() => window.__game?.ready || window.__game, null, { timeout: 240000 }).catch(() => errs.push('timeout waiting for game'));
await page.waitForTimeout(+(process.env.SETTLE || 1000));
const mod = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const ev = (f, arg) => page.evaluate(f, arg);
try {
  await mod.default({ page, out: OUT, ev });
} catch (e) {
  console.log('SCRIPT ERROR', e.message);
}
console.log(errs.filter((e) => !e.includes('ERR_CERT') && !e.includes('fonts.g')).slice(0, 30).join('\n') || 'no errors');
await browser.close();
server.close();
