// Headless playtest: serves dist/ over HTTP, opens it in Chromium and runs scripted steps.
//   STEPS='[{"eval":"..."},{"wait":500,"shot":"name"}]' SP=out_dir node scripts/playtest.mjs
// Step keys: key (hold), up (release), press, mouse [x,y], down/mup (button), eval (JS), wait (ms), shot (png name).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST = path.resolve(process.env.DIST || 'dist');
const SP = process.env.SP || 'shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, url === '/' ? 'index.html' : url);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const errs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text());
  else if (process.env.LOG) console.log('console:', m.text());
});
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('response', (r) => {
  if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`);
});
await page.goto(`http://localhost:${port}/${process.env.HASH || ''}`);
await page.waitForFunction(() => window.__game?.ready || window.__game, null, { timeout: +(process.env.READY_TIMEOUT || 120000) }).catch(() => errs.push('timeout waiting for game'));
await page.waitForTimeout(+(process.env.SETTLE || 1500));
const steps = JSON.parse(process.env.STEPS || '[{"shot":"00-start"}]');
for (const s of steps) {
  if (s.key) await page.keyboard.down(s.key);
  if (s.up) await page.keyboard.up(s.up);
  if (s.press) await page.keyboard.press(s.press);
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1]);
  if (s.down) await page.mouse.down({ button: s.down });
  if (s.mup) await page.mouse.up({ button: s.mup });
  if (s.eval) console.log('EVAL', JSON.stringify(await page.evaluate(s.eval)));
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${SP}/${s.shot}.png`, timeout: 120000 });
}
console.log(errs.filter((e) => !e.includes('ERR_CERT') && (process.env.ALLERR || !e.includes('fonts.g'))).slice(0, 30).join('\n') || 'no errors');
await browser.close();
server.close();
