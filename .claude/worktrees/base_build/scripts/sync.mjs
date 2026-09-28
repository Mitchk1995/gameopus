// Keeps this folder and GitHub in step, from either machine.
//   npm run sync                    pull (rebase) then push what's committed
//   npm run sync -- "what I did"    also commits every change first, with that message
// Never force-pushes. If the rebase hits a conflict it stops and says so.
import { spawnSync } from 'node:child_process';

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const run = (...args) => {
  console.log('> git ' + args.join(' '));
  const r = spawnSync('git', args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nsync stopped: "git ${args.join(' ')}" failed. Fix it (git status) and run sync again.`);
    process.exit(r.status || 1);
  }
};

const message = process.argv.slice(2).join(' ').trim();
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
if (branch === 'HEAD') {
  console.error('Detached HEAD; check out a branch first.');
  process.exit(1);
}
const dirty = () => git('status', '--porcelain').stdout.trim().length > 0;

if (message && dirty()) {
  run('add', '-A');
  run('commit', '-m', message + '\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>');
} else if (dirty()) {
  console.log('Uncommitted changes stay local (pass a message to commit them): they are stashed around the pull.');
}

run('fetch', 'origin');
const hasRemote = git('rev-parse', '--verify', `origin/${branch}`).status === 0;
if (hasRemote) run('pull', '--rebase', '--autostash', 'origin', branch);
const ahead = hasRemote ? +git('rev-list', '--count', `origin/${branch}..HEAD`).stdout.trim() : 1;
if (ahead > 0) run('push', '-u', 'origin', branch);
else console.log('Nothing to push.');

console.log(`\n${branch} is in sync with origin/${branch}` + (dirty() ? ' (you still have uncommitted changes).' : '.'));
