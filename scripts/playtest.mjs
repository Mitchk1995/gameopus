// Headless playtest: serves dist/ over HTTP, opens it in Chromium and runs scripted steps.
//   STEPS='[{"eval":"..."},{"wait":500,"shot":"name"}]' SP=out_dir node scripts/playtest.mjs
// (tests/playtest/play.py runs a scenario file through this.)
// Step keys: key (hold), up (release), press, mouse [x,y], down/mup (button), eval (JS), wait (ms), shot (png name).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST = path.resolve(process.env.DIST || 'dist');
const SP = process.env.SP || 'shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, url === '/' ? 'index.html' : url);
    // The game declares no favicon; Chromium's automatic request is optional.
    if (url === '/favicon.ico' && !existsSync(file)) { res.writeHead(204); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// A cloud container brings its own Chromium and no GPU (software GL). Elsewhere use
// Playwright's Chromium (npx playwright install chromium), or CHANNEL=chrome for
// the installed Chrome, on the real GPU unless SOFTWARE_GL=1.
const BUNDLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROME || (existsSync(BUNDLED) ? BUNDLED : undefined);
const software = process.env.SOFTWARE_GL ? process.env.SOFTWARE_GL !== '0' : !!executablePath && executablePath === BUNDLED;
let browser;
const errs = [], warnings = [];
let failedCheck = false;
// Browsers may request this without any page declaring an icon. Every bundled
// game asset remains required, including fonts and images.
const optionalIcon = (url) => new URL(url).pathname === '/favicon.ico';
try {
browser = await chromium.launch({
  executablePath,
  channel: executablePath ? undefined : process.env.CHANNEL,
  args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('error: ' + m.text());
  else if (m.type() === 'warning') warnings.push('warning: ' + m.text());
  else if (process.env.LOG) console.log('console:', m.text());
});
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('response', (r) => {
  if (r.status() >= 400 && !(r.status() === 404 && optionalIcon(r.url()))) errs.push(`HTTP ${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) => errs.push(`REQUESTFAILED ${r.url()} ${r.failure()?.errorText || ''}`));
await page.goto(`http://127.0.0.1:${port}/${process.env.HASH || ''}`);
await page.waitForFunction(() => window.__game?.ready, null, { timeout: +(process.env.READY_TIMEOUT || 120000) });
await page.waitForTimeout(+(process.env.SETTLE || 1500));
const steps = JSON.parse(process.env.STEPS || '[{"shot":"00-start"}]');
for (const s of steps) {
  if (s.key) await page.keyboard.down(s.key);
  if (s.up) await page.keyboard.up(s.up);
  if (s.press) await page.keyboard.press(s.press);
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1]);
  if (s.down) await page.mouse.down({ button: s.down });
  if (s.mup) await page.mouse.up({ button: s.mup });
  if (s.eval) {
    const result = JSON.stringify(await page.evaluate(s.eval));
    console.log('EVAL', result);
    if (/\bFAIL\b/.test(result || '')) failedCheck = true;
  }
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${SP}/${s.shot}.png`, timeout: 120000 });
}
} catch (error) {
  errs.push(`RUNNERERROR ${error.stack || error.message || error}`);
} finally {
  console.log(warnings.slice(0, 30).concat(errs).join('\n') || 'no errors');
  if (errs.length || failedCheck) process.exitCode = 1;
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
