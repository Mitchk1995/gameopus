// Puts the app `npm run package` just built (release/build/win-unpacked) where the owner plays it:
// release/Aldermere/Aldermere.exe, replacing the previous copy. If that folder can't be replaced
// (the game is open, or another program still holds a file in it), the new build goes next to it
// as release/Aldermere-<date>-<time> and this says so, so a packaging run never fails half-way
// and never leaves the owner's copy half-deleted.
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';

const BUILT = 'release/build/win-unpacked';
const HOME = 'release/Aldermere';

if (!existsSync(BUILT)) {
  console.error(`place-app: nothing at ${BUILT}; run electron-builder first`);
  process.exit(1);
}
let dest = HOME;
if (existsSync(HOME)) {
  // Moving the folder aside is all-or-nothing on Windows: it fails if any file in it is in use.
  const old = `release/.old-${Date.now()}`;
  try {
    await rename(HOME, old);
    await rm(old, { recursive: true, force: true }).catch(() => console.warn(`place-app: couldn't delete ${old}; delete it later`));
  } catch (e) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    dest = `release/Aldermere-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    console.warn(`place-app: ${HOME} is in use (${e.code}), so this build goes to ${dest} instead`);
  }
}
await rename(BUILT, dest);
console.log(`place-app: the game is at ${dest}/Aldermere.exe`);
