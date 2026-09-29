# ci paths=src/actors/camera-rig.js,src/world/
# Regression: a zoomed-out camera must not extend while its shoulder is still
# recentering at the southern stone cottage, then pull back in a second time.
STEPS = [
    {'eval': '@camera_helpers.js'},
    {'eval': '@camera_mesh.js'},
    {'eval': """(() => {
      const g = __game, v = g.world.village;
      const p = v.places.houses.find(p => p.type === 'stone' && Math.hypot(p.x - 7, p.z - 41.3) < 0.1);
      if (!p) throw new Error('FAIL camera regression doorway was not found');
      const c = v.at(p, p.openings?.[0]?.lx ?? 0, p.d / 2), h = p.rot + Math.PI;
      const result = __cm.walk('stone cottage approach at zoom 6', c.x - Math.sin(h) * 5, c.z - Math.cos(h) * 5,
        h + Math.PI, -0.22, 2.2, ['KeyW'], {dist: 6, noTruth: true});
      __cm.verdict(result);
      const lines = __cm.SMOOTH.fails;
      return {result, failLines: lines.join(' || ') || 'none'};
    })()"""},
    {'eval': """(() => {
      const g = __game;
      __cam.place(-8, 60, 0, -0.22);
      g.rig.dist = 2.2; g.rig.snap(); g.sim(0.1);
      g.rig.dist = 6; g.sim(2.5);
      if (g.rig.cur < 5.3) throw new Error('FAIL camera did not release and zoom back out in open ground: ' + g.rig.cur);
      return {check:'outward easing releases in open ground',distance:g.rig.cur};
    })()"""},
]
