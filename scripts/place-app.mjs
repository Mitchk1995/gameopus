// Swap in a complete desktop build, preserving the previous one until placement
// succeeds. An in-use app stays put while the new build gets its own launch path.
import { existsSync, statSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function placeApp({ root = process.cwd(), move = rename, remove = rm, log = console } = {}) {
  const release = path.resolve(root, 'release');
  const built = path.join(release, 'build', 'win-unpacked');
  const usual = path.join(release, 'Aldermere');
  if (!existsSync(built) || !statSync(built).isDirectory() || !existsSync(path.join(built, 'Aldermere.exe'))) {
    throw new Error(`No complete app at ${built}; run electron-builder first`);
  }
  const stamp = `${Date.now()}-${process.pid}`;
  let destination = usual, previous = null;
  if (existsSync(usual)) {
    const backup = path.join(release, `.old-${stamp}`);
    try {
      await move(usual, backup);
      previous = backup;
    } catch (error) {
      destination = path.join(release, `Aldermere-${stamp}`);
      log.warn(`place-app: current app is in use (${error.code}); placing the new build at ${destination}`);
    }
  }
  try {
    await move(built, destination);
  } catch (error) {
    if (previous) {
      try { await move(previous, usual); }
      catch (restoreError) {
        throw new Error(`New build could not be placed (${error.message}). Previous app is preserved at ${previous}; restoration failed (${restoreError.message}).`);
      }
    }
    throw new Error(`New build could not be placed; previous app preserved. ${error.message}`);
  }

  if (previous) {
    // Verify the exact backup remains inside this release directory before cleanup.
    if (path.dirname(previous) !== release || !path.basename(previous).startsWith('.old-')) throw new Error('Invalid app backup path');
    await remove(previous, { recursive: true, force: true }).catch(() => log.warn(`place-app: previous backup remains at ${previous}`));
  }
  log.log(`place-app: the game is at ${path.join(destination, 'Aldermere.exe')}`);
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await placeApp(); }
  catch (error) { console.error(`place-app: ${error.message}`); process.exitCode = 1; }
}
