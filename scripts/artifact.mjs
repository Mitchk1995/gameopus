// Prepares dist/ for publishing as a claude.ai artifact:
//  - dist-artifact/aldermere.html: the page body the publisher expects (it adds its
//    own doctype, head and body), with title and styles first, then the app;
//  - binary assets (.glb .hdr .bin) become base64 .txt files, since artifacts only
//    serve web media types; the page sets __PACKED_ASSETS__ so the loader unpacks them;
//  - dist-artifact/files.json: the published-path -> source map for the publish call.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'dist-artifact';
const html = await readFile('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/i)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/i)[0];
const links = head.match(/<link[^>]*>/gi) || [];
const styles = head.match(/<style[\s\S]*?<\/style>/gi) || [];
const scripts = head.match(/<script[\s\S]*?<\/script>/gi) || [];
const flag = '<script>window.__PACKED_ASSETS__ = true;</script>';
const page = [title, ...links, ...styles, body.trim(), flag, ...scripts].join('\n');
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'aldermere.html'), page);

const files = {};
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else {
      const rel = path.relative('dist', full).split(path.sep).join('/');
      if (/\.(glb|hdr|bin)$/.test(e.name)) {
        const dest = path.join(OUT, `${rel}.txt`);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, (await readFile(full)).toString('base64'));
        files[`${rel}.txt`] = dest;
      } else files[rel] = full;
    }
  }
}
await walk('dist/assets');
await writeFile(path.join(OUT, 'files.json'), JSON.stringify(files));
console.log(`${OUT}/aldermere.html ${(page.length / 1024).toFixed(0)} KB, ${Object.keys(files).length} asset files`);
