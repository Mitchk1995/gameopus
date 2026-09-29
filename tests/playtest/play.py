# Runs a headless playtest scenario and prints what it evaluated.
#   python3 tests/playtest/play.py tests/playtest/dungeon.py
# A scenario defines STEPS (see scripts/playtest.mjs for the step keys). An eval that
# starts with "@" is read from that file next to the scenario (shared helpers).
# Screenshots land in tests/playtest/out/. The page runs in #test mode, where the
# game steps only when a scenario calls __game.sim(seconds) or __game.run(seconds).
import json, os, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
scenario = os.path.abspath(sys.argv[1])
ns = {}
exec(open(scenario).read(), ns)
steps = []
for s in ns['STEPS']:
    if 'eval' in s and s['eval'].startswith('@'):
        s = dict(s, eval=open(os.path.join(os.path.dirname(scenario), s['eval'][1:])).read())
    steps.append(s)
out_dir = os.environ.get('SP') or os.path.join(here, 'out')
os.makedirs(out_dir, exist_ok=True)
env = dict(os.environ, STEPS=json.dumps(steps), SP=out_dir, HASH=ns.get('HASH', '#test'))
if 'W' in ns: env['W'] = str(ns['W'])
if 'H' in ns: env['H'] = str(ns['H'])
out = subprocess.run(['node', 'scripts/playtest.mjs'], cwd=root, env=env, capture_output=True, text=True, errors='replace', timeout=1500)
lines = [l for l in (out.stdout + out.stderr).splitlines() if ('rror' in l and '404' not in l) or l.startswith('EVAL') or 'timeout' in l]
print('\n'.join(lines)[:60000])
# Non-zero exit for CI: a missed check, a page error, or the game never starting.
if out.returncode != 0 or any('FAIL' in l or 'PAGEERROR' in l or 'timeout' in l or l.startswith('error:') for l in lines):
    sys.exit(1)
