// Headless playtest: node scripts/playtest.mjs (STEPS env = JSON list of inputs/screenshots).
import { chromium } from 'playwright-core';
const SP = process.env.SP || 'shots';
const url = 'file://' + process.cwd() + '/dist/index.html' + (process.env.HASH || '');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto(url);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SP}/shots/01-title.png` });
await page.click('.go');
await page.waitForTimeout(1500);
const steps = JSON.parse(process.env.STEPS || '[]');
for (const s of steps) {
  if (s.key) await page.keyboard.down(s.key);
  if (s.up) await page.keyboard.up(s.up);
  if (s.press) await page.keyboard.press(s.press);
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1]);
  if (s.down) await page.mouse.down({ button: s.down });
  if (s.mup) await page.mouse.up({ button: s.mup });
  if (s.eval) console.log('EVAL', JSON.stringify(await page.evaluate(s.eval)));
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${SP}/shots/${s.shot}.png` });
}
console.log(errs.slice(0, 30).join('\n') || 'no errors');
await browser.close();
