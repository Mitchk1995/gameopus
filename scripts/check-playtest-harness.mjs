// Deliberately fail tiny pages to prove both test entry points reject runtime,
// asset, network and assertion failures. No game or player profile is loaded.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scratch = await mkdtemp(path.join(tmpdir(), 'aldermere-runner-canary-'));
try {
  const fixture = path.join(scratch, 'page'), out = path.join(scratch, 'out');
  await mkdir(fixture); await mkdir(out);
  await writeFile(path.join(fixture, 'index.html'), `<!doctype html><title>Runner canary</title><script>
    window.__game = { ready: true };
    const mode = location.hash.slice(1);
    if (mode === 'pageerror') setTimeout(() => { throw new Error('canary page failure'); }, 20);
    if (mode === 'asset') fetch('/required-asset.glb');
    if (mode === 'network') fetch('http://127.0.0.1:1/unreachable').catch(() => {});
  </script>`);
  const env = { ...process.env, DIST: fixture, SP: out, SETTLE: '150', READY_TIMEOUT: '5000' };
  for (const mode of ['clean', 'pageerror', 'asset', 'network', 'assertion']) {
    const expression = mode === 'assertion' ? "'FAIL canary assertion'" : 'true';
    const scenario = path.join(scratch, `${mode}.py`);
    await writeFile(scenario, `HASH = '#${mode}'\nSTEPS = [{'eval': ${JSON.stringify(expression)}}]\n`);
    const calls = [
      ['node', ['scripts/playtest.mjs'], { ...env, HASH: `#${mode}`, STEPS: JSON.stringify([{ eval: expression }]) }],
      [process.env.PYTHON || 'python', ['tests/playtest/play.py', scenario], env],
    ];
    for (const [command, args, runEnv] of calls) {
      const result = spawnSync(command, args, { env: runEnv, encoding: 'utf8', timeout: 30000, windowsHide: true });
      if (result.error) throw result.error;
      const failed = result.status !== 0;
      assert.equal(failed, mode !== 'clean', `${command} ${mode}: exit ${result.status}\n${result.stdout}\n${result.stderr}`);
      console.log(`PASS ${command} ${mode}: exit ${result.status}`);
    }
  }
} finally {
  assert.equal(path.dirname(scratch), path.resolve(tmpdir()));
  await rm(scratch, { recursive: true, force: true });
}
