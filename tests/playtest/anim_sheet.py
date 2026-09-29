# Animation contact sheets (not part of CI): renders clips on the hero, a frame every
# 0.05 s, from the side and from behind, into out/sheet_<tag>_<clip>_<view>_<page>.png
# (18 frames to a page).
#   LAB_CLIPS="Sword_Regular_A@0-0.45,Sword_Block@0-1.2" LAB_VIEWS="side,behind" python tests/playtest/anim_sheet.py
# LAB_LOAD="anims/extra.glb" loads more clips first (a path under dist/assets/).
# LAB_DT sets the step, LAB_TAG names the set. Without a range a clip shows 0-0.85 s.
import os, json
W, H = 1920, 1080
clips = [c for c in os.environ.get('LAB_CLIPS', 'Sword_Regular_A').split(',') if c]
views = os.environ.get('LAB_VIEWS', 'side,behind').split(',')
loads = [p for p in os.environ.get('LAB_LOAD', '').split(',') if p]
dt = float(os.environ.get('LAB_DT', '0.05'))
tag = os.environ.get('LAB_TAG', 'lab')
PER = 18
STEPS = [{'eval': '@anim_sheet.js'}]
# Lab-only files (e.g. lab/kaykit.glb from `node scripts/fetch-assets.mjs kaykit`) live in
# .asset-cache/lab/ and are copied next to the build for the page to load.
import shutil
for p in loads:   # paths are relative to the repository root, where this is run from
  src = os.path.join('.asset-cache', p)
  if p.startswith('lab/') and os.path.exists(src):
    os.makedirs(os.path.join('dist', 'assets', 'lab'), exist_ok=True)
    shutil.copy(src, os.path.join('dist', 'assets', p))
for p in loads:
  STEPS.append({'eval': f"__lab.load({json.dumps(p)}).then((n) => n.join(' | '))"})
# LAB_LIVE="chain,guard,heavy,dodge" draws the game itself (blends, aim lean) with scripted input instead.
LIVE = {
  'chain': (36, [[k, 'click'] for k in range(0, 27, 2)]),
  'guard': (18, [[0, 'guard'], [7, 'jolt'], [15, 'release']]),
  'heavy': (18, [[0, 'heavy']]),
  'dodge': (18, [[0, 'dodge']]),
}
for preset in [p for p in os.environ.get('LAB_LIVE', '').split(',') if p]:
  frames, actions = LIVE[preset]
  for v in views:
    for k in range((frames + PER - 1) // PER):
      opts = {'view': v, 'frames': min(PER, frames - k * PER), 'from': k * PER, 'dt': dt, 'actions': actions, 'title': preset}
      STEPS.append({'eval': f"__lab.live({json.dumps(opts)})", 'shot': f'live_{tag}_{preset}_{v}_{k}'})
if os.environ.get('LAB_LIVE'): clips = [c for c in clips if os.environ.get('LAB_CLIPS')]
for c in clips:
  name, t0, t1 = c, 0.0, 0.85
  if '@' in c:
    name, rng = c.split('@')
    a, b = rng.split('-')
    t0, t1 = float(a), float(b)
  frames = int(round((t1 - t0) / dt)) + 1
  pages = (frames + PER - 1) // PER
  for v in views:
    for k in range(pages):
      a = t0 + k * PER * dt
      b = min(t1, a + (PER - 1) * dt)
      safe = name.replace('/', '_')
      STEPS.append({'eval': f"__lab.sheet({json.dumps({'clip': name, 'view': v, 't0': round(a, 3), 't1': round(b, 3), 'dt': dt})})", 'shot': f'sheet_{tag}_{safe}_{v}_{k}'})
