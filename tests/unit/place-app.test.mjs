import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { placeApp } from '../../scripts/place-app.mjs';

const quiet = { log() {}, warn() {} };
async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'aldermere-place-test-'));
  const built = path.join(root, 'release/build/win-unpacked'), previous = path.join(root, 'release/Aldermere');
  try {
    await mkdir(built, { recursive: true }); await mkdir(previous, { recursive: true });
    await writeFile(path.join(built, 'Aldermere.exe'), 'new'); await writeFile(path.join(previous, 'Aldermere.exe'), 'previous');
    await run({ root, built, previous });
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
}

test('a completed replacement reaches the normal launch path', () => fixture(async ({ root, previous }) => {
  assert.equal(await placeApp({ root, log: quiet }), previous);
  assert.equal(await readFile(path.join(previous, 'Aldermere.exe'), 'utf8'), 'new');
}));

test('failure placing the new build restores the old launch path', () => fixture(async ({ root, built, previous }) => {
  const move = async (from, to) => { if (from === built) throw Object.assign(new Error('simulated locked build'), { code: 'EPERM' }); return rename(from, to); };
  await assert.rejects(placeApp({ root, move, log: quiet }), /previous app preserved/);
  assert.equal(await readFile(path.join(previous, 'Aldermere.exe'), 'utf8'), 'previous');
  assert.equal(await readFile(path.join(built, 'Aldermere.exe'), 'utf8'), 'new');
}));

test('an in-use previous app is left intact and the new app gets a distinct path', () => fixture(async ({ root, previous }) => {
  const move = async (from, to) => { if (from === previous) throw Object.assign(new Error('simulated in-use app'), { code: 'EPERM' }); return rename(from, to); };
  const destination = await placeApp({ root, move, log: quiet });
  assert.notEqual(destination, previous);
  assert.equal(await readFile(path.join(previous, 'Aldermere.exe'), 'utf8'), 'previous');
  assert.equal(await readFile(path.join(destination, 'Aldermere.exe'), 'utf8'), 'new');
}));

test('if rollback is also blocked, the old app remains in the reported recovery directory', () => fixture(async ({ root, built, previous }) => {
  const move = async (from, to) => {
    if (from === built || to === previous) throw Object.assign(new Error('simulated locked path'), { code: 'EPERM' });
    return rename(from, to);
  };
  let failure;
  await assert.rejects(placeApp({ root, move, log: quiet }), (error) => { failure = error.message; return /preserved at .*restoration failed/.test(error.message); });
  const release = path.join(root, 'release');
  const backups = (await readdir(release)).filter((name) => name.startsWith('.old-'));
  assert.equal(backups.length, 1);
  const recovery = path.join(release, backups[0]);
  assert.ok(failure.includes(recovery));
  assert.equal(await readFile(path.join(recovery, 'Aldermere.exe'), 'utf8'), 'previous');
  assert.equal(await readFile(path.join(built, 'Aldermere.exe'), 'utf8'), 'new');
}));

test('an incomplete build cannot move the previous app', () => fixture(async ({ root, built, previous }) => {
  await rm(path.join(built, 'Aldermere.exe'));
  await assert.rejects(placeApp({ root, log: quiet }), /No complete app/);
  assert.equal(existsSync(path.join(previous, 'Aldermere.exe')), true);
}));
