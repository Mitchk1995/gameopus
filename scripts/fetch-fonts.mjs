// Bundle the existing interface fonts so the desktop game also works offline.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('public/assets/fonts');
await mkdir(out, { recursive: true });
const url = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap';
async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36' } });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
let css = await (await get(url)).text();
const fonts = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
if (!fonts.length) throw new Error('No font files returned');
for (const [i, source] of fonts.entries()) {
  const name = `aldermere-${i}${path.extname(new URL(source).pathname)}`;
  await writeFile(path.join(out, name), Buffer.from(await (await get(source)).arrayBuffer()));
  css = css.replaceAll(source, `./${name}`);
}
await writeFile(path.join(out, 'fonts.css'), css);
for (const family of ['cinzel', 'alegreyasans']) {
  const license = await (await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`)).text();
  await writeFile(path.join(out, `${family}-OFL.txt`), license);
}
console.log(`Bundled ${fonts.length} font files and both open font licenses.`);
