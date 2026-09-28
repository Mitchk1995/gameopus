# ci
# Look check: how textured do the people and the village read? Takes the same viewpoints
# every time (a building close up, a house, a villager, the hero, the square from a
# distance) and prints numbers about the textures behind them.
# LOOK_TAG=before|after names the screenshots; LOOK_Q=high|medium|low picks the quality.
# A line starting "FAIL" means a check missed.
import os
TAG = os.environ.get('LOOK_TAG', 'after')
Q = os.environ.get('LOOK_Q', 'high')
CAM = """
  // Puts the camera at (x,y,z) looking at (tx,ty,tz), then draws one frame.
  window.__look = (x, y, z, tx, ty, tz) => {
    const g = __game;
    g.camera.position.set(x, y, z);
    g.camera.lookAt(tx, ty, tz);
    g.camera.updateMatrixWorld(true);
    g.draw(1 / 60);
  };
"""
def view(name, body):
    return [
      {'eval': "(() => { " + CAM + body + " return 'ok'; })()", 'wait': 400},
      {'shot': f'look_{TAG}_{Q}_{name}'},
    ]
STEPS = [
  {'eval': """(() => {
    const g = __game;
    g.hud.onQuality(%r);
    g.player.spawn(-8, 60, Math.PI);
    g.sim(0.5);
    return 'quality ' + %r;
  })()""" % (Q, Q)},
]
# A building close up: the bank's front wall from the square.
STEPS += view('building', """
    const b = __game.world.village.places.bank, V = __game.world.village;
    const c = V.at(b, 2.6, b.d / 2 + 4.6), t = V.at(b, 0.6, b.d / 2);
    __look(c.x, c.y + 2.1, c.z, t.x, c.y + 1.9, t.z);
""")
# A house wall at an angle.
STEPS += view('house', """
    const h = __game.world.village.places.houses[3], V = __game.world.village;
    const c = V.at(h, -4.2, h.d / 2 + 3.4), t = V.at(h, 0.5, h.d / 2);
    __look(c.x, c.y + 1.9, c.z, t.x, c.y + 1.8, t.z);
""")
# A villager close up.
STEPS += view('villager', """
    const n = __game.npcs.find((p) => p.def.id === 'garrow'), d = 2.3;
    __look(n.pos.x + Math.sin(n.yaw + 0.5) * d, n.pos.y + 1.55, n.pos.z + Math.cos(n.yaw + 0.5) * d, n.pos.x, n.pos.y + 1.3, n.pos.z);
""")
# The hero close up.
STEPS += view('hero', """
    const P = __game.player, d = 2.3;
    P.spawn(-8, 60, 0); __game.sim(0.3);
    const y = P.yaw;
    __look(P.pos.x + Math.sin(y + 0.5) * d, P.pos.y + 1.55, P.pos.z + Math.cos(y + 0.5) * d, P.pos.x, P.pos.y + 1.2, P.pos.z);
""")
# Mid distance: the square and the buildings around it.
STEPS += view('square', """
    const C = __game.world.village.places.well;
    __look(C.x + 3, 5.2, C.z + 13, C.x - 2, 5.0, C.z - 20);
""")
# Numbers: textures behind the hero, a villager and the village must be sharpened at
# angles, and every material needs a normal map strong enough to catch light.
STEPS += [{'eval': """(() => {
    const g = __game, out = [], fails = [];
    const check = (name, ok, info) => { out.push(name + ': ' + info); if (!ok) fails.push('FAIL ' + name + ' ' + info); };
    const scan = (root, label) => {
      const maps = new Set(), mats = new Set();
      let aniso = 1e9, nrm = 0, weak = 0, noNormal = 0, patched = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [o.material].flat()) {
          if (!m || mats.has(m)) continue;
          mats.add(m);
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
            const t = m[k];
            if (t && !maps.has(t)) { maps.add(t); aniso = Math.min(aniso, t.anisotropy); }
          }
          if (m.normalMap) { nrm++; if (m.normalScale.x < 1) weak++; if (m.userData.detail) patched++; }
          else if (m.map) noNormal++;
        }
      });
      check(label + ' textures sharpened', maps.size > 0 && aniso > 1, maps.size + ' maps over ' + mats.size + ' materials, min anisotropy ' + aniso);
      check(label + ' normal maps', nrm > 0 && noNormal === 0 && weak === 0 && patched === nrm, nrm + ' normal-mapped (' + patched + ' with surface detail), ' + noNormal + ' textured without a normal map, ' + weak + ' weak');
    };
    scan(g.hero.root, 'hero');
    scan(g.npcs.find((p) => p.def.id === 'garrow').char.root, 'villager');
    scan(g.world.village.mesh, 'village');
    const ren = g.renderer;
    // Cost of the detail layer at the square view, by mode (indicative only: headless GL is not a real GPU).
    const { detailUniforms } = window.__detail || {};
    const timeDraws = () => { const t = performance.now(); for (let i = 0; i < 20; i++) g.draw(1 / 60); const gl = ren.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return (performance.now() - t) / 20; };
    if (detailUniforms) {
      const was = detailUniforms.uDetailMode.value, ms = [];
      for (const md of [0, 1, 2]) { detailUniforms.uDetailMode.value = md; ms.push(md + ':' + timeDraws().toFixed(0) + 'ms'); }
      detailUniforms.uDetailMode.value = was;
      out.push('draw time by detail mode ' + ms.join(' '));
    }
    out.push('tone ' + ren.toneMapping + ' x' + ren.toneMappingExposure + ', env ' + g.scene.environmentIntensity + ', max anisotropy ' + ren.capabilities.getMaxAnisotropy());
    out.push('draw calls ' + ren.info.render.calls + ', triangles ' + ren.info.render.triangles);
    return out.concat(fails).join(' | ');
  })()"""}]
