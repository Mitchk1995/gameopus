// Balance simulation: a bot plays the real game code headlessly, much faster than real time.
//   npm run build && node scripts/balance.mjs [fresh|campaign|all] [--runs N] [--minutes M] [--profile competent]
// fresh:    N brand-new characters on Normal, one run each (how hard is the start?)
// campaign: one character playing run after run for M simulated minutes, keeping gear,
//           climbing Dread tiers as they unlock (is the long-term curve right?)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) || 'all';
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const RUNS = +opt('runs', 6);
const CAMPAIGN_MIN = +opt('minutes', 120);
const PROFILE = opt('profile', 'competent');

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = 'file://' + (process.env.DIST || process.cwd() + '/dist') + '/index.html';
const bot = readFileSync(new URL('./balance-bot.js', import.meta.url), 'utf8');

async function fresh() {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForFunction(() => window.__game);
  await page.addScriptTag({ content: bot });
  await page.evaluate(() => {
    const g = window.__game;
    g.audio.play = () => {};
    g.hud.update = () => {};
    g.hud.placeLabel = () => {};
    g.hud.damageNumber = () => {};
    g.frame = () => {}; // stop rendering while simulating
  });
}

const fmtRow = (r) =>
  `${String(r.dread).padStart(2)} | ${r.died ? 'died ' : 'alive'} ${String(r.minutes).padStart(6)}m | depth ${String(r.depth).padStart(2)} | lvl ${String(r.level).padStart(2)} | dps ${String(r.dps).padStart(5)} | life ${String(r.life).padStart(4)} dr ${String(r.dr).padStart(2)}% | kills/min ${String(r.killsPerMin).padStart(3)} | dmg taken/min ${String(r.dmgTakenPerMin).padStart(5)} | low ${(r.lowest * 100).toFixed(0).padStart(3)}% | uniques on ${r.uniquesEquipped} | drops m${r.drops.magic} r${r.drops.rare} u${r.drops.unique + r.drops.ascendant}`;

if (mode === 'fresh' || mode === 'all') {
  console.log(`\n== FRESH characters on Normal (${RUNS} runs, profile ${PROFILE}) ==`);
  const recs = [];
  for (let i = 0; i < RUNS; i++) {
    await fresh();
    const ttk = await page.evaluate(() => ({ husk: __bot.ttk(__game, 'husk'), skitter: __bot.ttk(__game, 'skitter'), brute: __bot.ttk(__game, 'brute') }));
    const r = await page.evaluate((p) => __bot.run(__game, { profile: p, maxMinutes: 25 }), PROFILE);
    recs.push(r);
    console.log(fmtRow(r), `| depth reached at ${JSON.stringify(r.depthTimes)}s`, i === 0 ? `| hits to kill at start: ${JSON.stringify(ttk)}` : '');
    if (process.env.VERBOSE) console.log('   damage by source', JSON.stringify(r.bySource), 'last hits', r.lastHits.join(', '));
    console.log('   per depth (life lost per minute as % of max, lowest life, potions):', Object.entries(r.perDepth).map(([d, v]) => {
      const mins = Math.max(0.1, ((r.depthTimes[+d + 1] ?? r.minutes * 60) - (r.depthTimes[d] ?? 0)) / 60);
      return `d${d}: ${Math.round((v.dmgPctMax / mins) * 100)}%/min low ${Math.round(v.lowest * 100)}% pots ${v.potions}`;
    }).join(' | '));
  }
  const avg = (k) => (recs.reduce((a, r) => a + r[k], 0) / recs.length).toFixed(1);
  console.log(`avg: ${avg('minutes')} min, depth ${avg('depth')}, level ${avg('level')}, dmg taken/min ${avg('dmgTakenPerMin')}, deaths ${recs.filter((r) => r.died).length}/${recs.length}`);
}

if (mode === 'campaign' || mode === 'all') {
  console.log(`\n== CAMPAIGN: one character, ${CAMPAIGN_MIN} simulated minutes, profile ${PROFILE} ==`);
  await fresh();
  let total = 0, n = 0, dread = 0, struggles = 0;
  while (total < CAMPAIGN_MIN) {
    const r = await page.evaluate(([p, d]) => __bot.run(__game, { profile: p, maxMinutes: 20, dread: d }), [PROFILE, dread]);
    total += r.minutes;
    n++;
    console.log(`run ${String(n).padStart(2)} t=${total.toFixed(0).padStart(4)}m | ` + fmtRow(r));
    // Push difficulty like a player would: climb when unlocked, back off after repeated early deaths.
    if (r.died && r.depth < 2) struggles++;
    else struggles = 0;
    if (struggles >= 2 && dread > 0) { dread--; struggles = 0; }
    else if (r.dreadUnlocked > dread) dread = r.dreadUnlocked;
  }
}

if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
