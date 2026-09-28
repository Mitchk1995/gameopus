// Turns the single-file Vite build into an Artifact page fragment
// (the Artifact host supplies its own doctype/head/body skeleton).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));

const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const links = head.match(/<link[^>]*>/g) || [];
const blocks = head.match(/<(style|script)[\s\S]*?<\/\1>/g) || [];
const styles = blocks.filter((b) => b.startsWith('<style'));
const scripts = blocks.filter((b) => b.startsWith('<script'));

const out = [title, ...links, ...styles, body.trim(), ...scripts].join('\n');
writeFileSync('dist/hollowreach.html', out);
console.log(`artifact fragment: dist/hollowreach.html (${(out.length / 1024).toFixed(0)} KB)`);
