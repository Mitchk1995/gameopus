// Contact sheets of animation clips on the hero, for judging animations by eye.
// Defines window.__lab; tests/playtest/anim_sheet.py drives it. Each sheet is one clip
// seen from one side, a frame every `dt` seconds, laid out in a grid with the clip time
// under each frame. Extra clips can be loaded from any GLB under dist/assets/.
(() => {
  const g = __game, T = __THREE, ch = g.hero;
  const W = innerWidth, H = innerHeight;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99998;background:#d9dde2`;
  document.body.appendChild(canvas);
  const labels = document.createElement('div');
  labels.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;pointer-events:none;font:12px monospace;color:#123`;
  document.body.appendChild(labels);
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.setClearColor(0xd9dde2, 1);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x556070, 2.4));
  const sun = new T.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 5, 3);
  scene.add(sun);
  const grid = new T.GridHelper(8, 16, 0x7a8590, 0xa8b0b8);
  scene.add(grid);
  // A post one step (1 m) in front of the hero and a line along his facing, to judge drift.
  const mark = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.8, 6), new T.MeshBasicMaterial({ color: 0xc03030 }));
  mark.position.set(0, 0.9, 1.0);
  scene.add(mark);
  const home = ch.root.parent;
  const mixer = new T.AnimationMixer(ch.root);
  const cam = new T.PerspectiveCamera(30, 1, 0.05, 50);
  const VIEWS = {
    side: { pos: [-4.6, 1.25, 0.35], at: [0, 1.0, 0.35] },      // from his right
    left: { pos: [4.6, 1.25, 0.35], at: [0, 1.0, 0.35] },       // from his left
    behind: { pos: [0.35, 1.9, -4.4], at: [0, 1.05, 0.5] },     // over the shoulder, like play
    front: { pos: [-0.6, 1.4, 4.6], at: [0, 1.0, 0] },
    top: { pos: [0, 6.5, 0.4], at: [0, 0, 0.4] },
  };
  const extra = new Map();

  // Loads a GLB's clips (under dist/assets/<path>) and adds them to the hero's clip list,
  // with the same in-place treatment as the game's own clips.
  async function load(path, prefix = '') {
    const gltf = await g.assets.model(path);
    const names = [];
    for (const src of gltf.animations) {
      const clip = src.clone();
      clip.name = prefix + src.name;
      for (const t of clip.tracks) {
        if (t.name === 'root.position' || t.name === 'pelvis.position') {
          const v = t.values;
          for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
        }
      }
      ch.clips.set(clip.name, clip);
      extra.set(clip.name, clip);
      names.push(clip.name + ' ' + clip.duration.toFixed(2));
    }
    return names;
  }

  function pose(clip, t) {
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.setLoop(T.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    a.time = Math.min(t, clip.duration);
    a.paused = false;
    mixer.update(0);
    ch.root.updateMatrixWorld(true);
  }

  // One sheet: a clip from one view, frames from t0 to t1 every dt, in a grid.
  function sheet({ clip: name, view = 'side', t0 = 0, t1 = null, dt = 0.05, cols = 6, rows = 3, title = '' }) {
    const clip = ch.clips.get(name);
    if (!clip) return 'missing clip ' + name;
    const end = Math.min(t1 ?? clip.duration, clip.duration + dt * 0.5);
    const times = [];
    for (let t = t0; t <= end + 1e-6 && times.length < cols * rows; t += dt) times.push(+t.toFixed(3));
    const cw = Math.floor(W / cols), chh = Math.floor((H - 22) / rows);
    scene.add(ch.root);
    ch.root.position.set(0, 0, 0);
    ch.root.rotation.set(0, 0, 0);
    const v = VIEWS[view];
    cam.aspect = cw / chh;
    cam.position.set(...v.pos);
    const at = new T.Vector3(...v.at);
    cam.lookAt(at);
    // Fit about 2.4 m across and 2.3 m up at the hero, whatever the cell's shape.
    const dist = cam.position.distanceTo(at), span = Math.max(2.3, (v.span || 2.4) / cam.aspect);
    cam.fov = (2 * Math.atan(span / 2 / dist) * 180) / Math.PI;
    cam.updateProjectionMatrix();
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    labels.innerHTML = `<div style="position:absolute;left:6px;top:3px;font-weight:bold;font-size:14px">${title || name} (${view}, ${clip.duration.toFixed(2)} s, every ${dt} s)</div>`;
    times.forEach((t, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = c * cw, y = 22 + r * chh;
      pose(clip, t);
      renderer.setViewport(x, H - y - chh, cw, chh);
      renderer.setScissor(x, H - y - chh, cw, chh);
      renderer.render(scene, cam);
      labels.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:${x + 4}px;top:${y + 2}px">${t.toFixed(2)}</div>`);
    });
    renderer.setScissorTest(false);
    mixer.stopAllAction();
    home?.add(ch.root);
    return `${name} ${view}: ${times.length} frames`;
  }

  // Where the right hand and the sword tip go through a clip (for measuring hit times).
  function trace(name, dt = 1 / 60) {
    const clip = ch.clips.get(name);
    const out = [];
    const tip = new T.Vector3(), hand = new T.Vector3(), pel = new T.Vector3();
    for (let t = 0; t <= clip.duration + 1e-6; t += dt) {
      pose(clip, t);
      ch.bones.hand_r.getWorldPosition(hand);
      ch.bones.pelvis.getWorldPosition(pel);
      out.push([+t.toFixed(3), +hand.x.toFixed(3), +hand.y.toFixed(3), +hand.z.toFixed(3), +pel.y.toFixed(3)]);
    }
    mixer.stopAllAction();
    return out;
  }

  window.__lab = { load, sheet, trace, pose, clips: () => [...ch.clips.keys()], extra };
  return 'lab ready ' + W + 'x' + H;
})()
