// node scripts/dev/splice.mjs <file> <startMarker> <endMarker> <newContentFile>
// Replaces the text from startMarker (inclusive) to endMarker (exclusive) with the new content.
import fs from 'node:fs';
const [file, start, end, from] = process.argv.slice(2);
let s = fs.readFileSync(file, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const a = s.indexOf(start), b = s.indexOf(end, a + 1);
if (a < 0 || b < 0) throw new Error(`markers not found ${a} ${b}`);
let n = fs.readFileSync(from, 'utf8').replace(/\r\n/g, '\n');
s = s.slice(0, a) + n + s.slice(b);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(file, s);
console.log('spliced', file, 'from', a, 'to', b, 'with', n.length, 'chars');
