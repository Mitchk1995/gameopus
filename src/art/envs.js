import * as THREE from 'three';

// Reflection environments for metal. Each is a tiny emissive scene (a dark shell
// plus a few bright panels) filtered through PMREM. Dark surroundings with
// discrete light sources give metal crisp highlights and deep reflections,
// instead of the flat gray sheen of a uniformly lit room.

function shell(scene, top, mid, bottom) {
  const geo = new THREE.SphereGeometry(20, 48, 24);
  const p = geo.attributes.position;
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 20;
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 0.7));
    else c.copy(mid).lerp(bottom, Math.pow(-y, 0.5));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
}

function panel(scene, w, h, color, k, pos, round = false) {
  const geo = round ? new THREE.CircleGeometry(w / 2, 32) : new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
  m.position.set(...pos);
  m.lookAt(0, 0, 0);
  scene.add(m);
}

function filter(renderer, scene, sigma) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, sigma).texture;
  pmrem.dispose();
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

// Product-photo lighting for item icons: a warm key softbox, a cool rim strip,
// a soft top light and a faint warm kicker, over near-black surroundings.
export function studioEnv(renderer) {
  const scene = new THREE.Scene();
  shell(scene, new THREE.Color(0.06, 0.06, 0.07), new THREE.Color(0.025, 0.025, 0.03), new THREE.Color(0.008, 0.007, 0.007));
  panel(scene, 9, 5, 0xfff0dc, 4.5, [-7, 7, 9]);
  panel(scene, 1.6, 12, 0xc4d8ff, 5, [9, 2, -8]);
  panel(scene, 6, 6, 0xffffff, 1.4, [0, 14, 0], true);
  panel(scene, 8, 1.4, 0xff9a5a, 0.9, [6, -5, 7]);
  panel(scene, 1.2, 6, 0xffe2c0, 2.2, [-10, 1, -4]);
  panel(scene, 30, 16, 0xfff4e8, 0.4, [0, 3, 15]);
  return filter(renderer, scene, 0.015);
}

// The dungeon as a mirror sees it: a black vault ringed by warm torchlight, a
// faint cold glow from far above, and the ember-lit floor below.
export function dungeonEnv(renderer) {
  const scene = new THREE.Scene();
  shell(scene, new THREE.Color(0.02, 0.025, 0.04), new THREE.Color(0.018, 0.014, 0.014), new THREE.Color(0.03, 0.018, 0.012));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = 14;
    panel(scene, 1.6, 1.6, 0xffa050, 2.6 + (i % 2) * 1.2, [Math.cos(a) * r, 2 + (i % 3), Math.sin(a) * r], true);
  }
  panel(scene, 10, 10, 0x8aa0d0, 0.35, [0, 16, 0], true);
  return filter(renderer, scene, 0.03);
}
