window.__h = {
  // A free floor spot about r metres from (x, z), facing it.
  standBy(g, x, z, r = 1.5) {
    const d = g.activeWorld, P = g.player, V = P.pos.constructor;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, p = new V(x + Math.sin(a) * r, 0, z + Math.cos(a) * r), q = p.clone();
      d.colliders.push(q, 0.35, 1.8, 0.45);
      if (q.distanceTo(p) < 0.01) {
        P.spawn(p.x, p.z, 0); P.faceTowards(x, z); g.rig.yaw = P.yaw + Math.PI; g.rig.pitch = -0.35;
        return true;
      }
    }
    return false;
  },
  pressE(g) { g.input.pressed.add('KeyE'); g.sim(1 / 60); },
  loot(g) { return g.fight.ground.filter((it) => !it.gone && it.realm === g.realm).map((it) => `${it.id}x${it.n}@${it.y.toFixed(2)}${it.rare ? '*' : ''}`); },
};
