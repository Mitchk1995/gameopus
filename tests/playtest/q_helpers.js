window.__q = {
  check(ok, message) { if (!ok) throw new Error('FAIL ' + message); },
  said: () => document.querySelector('.talk .said').textContent,
  opts: () => [...document.querySelectorAll('.talk .opt')].map((b) => b.textContent.replace(/^\d+\./, '')),
  click(txt) { const b = [...document.querySelectorAll('.talk .opt')].find((x) => x.textContent.includes(txt)); if (!b) throw new Error('no option ' + txt + ' in ' + this.opts().join('|')); b.click(); },
  // Walk up to someone and press E.
  talk(g, id) {
    const n = g.npcs.find((x) => x.def.id === id);
    const a = n.yaw;
    g.player.spawn(n.pos.x + Math.sin(a) * 1.6, n.pos.z + Math.cos(a) * 1.6, 0);
    g.player.faceTowards(n.pos.x, n.pos.z); g.rig.yaw = g.player.yaw + Math.PI; g.rig.pitch = -0.1; g.rig.shoulder = 0; g.rig.snap();
    g.sim(0.2);
    const t = g.target;
    g.input.pressed.add('KeyE'); g.sim(1 / 60);
    return t && t.kind === 'npc' ? t.npc.def.id : 'none:' + (t && (t.kind + '/' + (t.station || t.name)));
  },
  // Pages through "Continue." and returns every line seen.
  read(max = 12) { const out = [this.said()]; for (let i = 0; i < max && this.opts().length === 1 && this.opts()[0] === 'Continue.'; i++) { this.click('Continue.'); out.push(this.said()); } return out; },
};
