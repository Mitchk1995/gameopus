# The packed artifact page: build with node scripts/artifact.mjs, lay it out like the
# host (see scripts/artifact.mjs), then run with DIST pointing at that folder.
STEPS = [
  {'eval': "(() => { const g = __game; return [g.ready, g.realm, g.npcs.length, Object.keys(g.quests.state.quests).length, !!document.querySelector('.qtrack'), g.chat.available]; })()"},
  {'eval': "(() => { const g = __game; g.run(0.1); return g.quests.markers().map(m => m.icon).join(','); })()"},
  {'shot': 'pub2'},
]
