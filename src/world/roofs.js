import * as THREE from 'three';

// Roofs, gables and the joinery on them, as plain geometry in a house's own frame (origin at the
// centre of the footprint on the ground floor, +z the front, y up). buildings.js places them.
//
// Every roof is a profile swept along its ridge: a thin band for tiles and stone slates, a thick
// rounded one for thatch (a fat nose at the eaves and a ridge roll on top). Texture coordinates are
// in metres on every face (u along the ridge, v down the slope), so tiles, slates and reed keep
// their real size on any house, and thatch lays its mossy ridge band along the ridge.

// Sweeps a closed outline (points [a, y], in the (x, y) plane) along z from -L/2 to L/2.
//   u = z / tu on the swept faces; v = outline length / tv, or vOf(a, y, s) if given.
//   Corners sharper than `crease` degrees keep hard shading. The two end caps take planar UVs.
export function sweep(profile, L, { tu = 2, tv = 2, vOf = null, caps = true, crease = 40, capTile = 2 } = {}) {
  let P = profile.map((p) => p.slice());
  let area = 0;
  for (let i = 0; i < P.length; i++) { const [a0, y0] = P[i], [a1, y1] = P[(i + 1) % P.length]; area += a0 * y1 - a1 * y0; }
  if (area < 0) P = P.reverse(); // counter-clockwise, so edge normals (dy, -dx) point out
  const n = P.length;
  const s = [0];
  for (let i = 1; i <= n; i++) s.push(s[i - 1] + Math.hypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
  const en = [];
  for (let i = 0; i < n; i++) {
    const [a0, y0] = P[i], [a1, y1] = P[(i + 1) % n];
    const l = Math.hypot(a1 - a0, y1 - y0) || 1;
    en.push([(y1 - y0) / l, -(a1 - a0) / l]);
  }
  const cosC = Math.cos((crease * Math.PI) / 180);
  // Normal at vertex i for edge e (e is i-1 or i): smoothed with the other edge if the turn is gentle.
  const vn = (i, e) => {
    const other = e === i ? (i - 1 + n) % n : i;
    const a = en[e], b = en[other];
    if (a[0] * b[0] + a[1] * b[1] < cosC) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const pos = [], nor = [], uv = [], idx = [];
  // An outline point may carry its own v as a third number (thatch maps its eaves that way).
  const V = (i, sIdx) => (P[i][2] !== undefined ? P[i][2] : vOf ? vOf(P[i][0], P[i][1], s[sIdx]) : s[sIdx] / tv);
  for (let e = 0; e < n; e++) {
    const i0 = e, i1 = (e + 1) % n;
    const n0 = vn(i0, e), n1 = vn(i1, e);
    const b = pos.length / 3;
    for (const [i, nn, si] of [[i0, n0, e], [i1, n1, e + 1]]) {
      for (const z of [-L / 2, L / 2]) {
        pos.push(P[i][0], P[i][1], z);
        nor.push(nn[0], nn[1], 0);
        uv.push(z / tu, V(i, si));
      }
    }
    // b: (i0,-), b+1: (i0,+), b+2: (i1,-), b+3: (i1,+)
    idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
  }
  if (caps) {
    const tris = THREE.ShapeUtils.triangulateShape(P.map(([a, y]) => new THREE.Vector2(a, y)), []);
    for (const [z, nz] of [[L / 2, 1], [-L / 2, -1]]) {
      const b = pos.length / 3;
      for (const [a, y] of P) { pos.push(a, y, z); nor.push(0, 0, nz); uv.push(a / capTile, y / capTile); }
      for (const [p, q, r] of tris) {
        // Face the cap outwards.
        const cross = (P[q][0] - P[p][0]) * (P[r][1] - P[p][1]) - (P[q][1] - P[p][1]) * (P[r][0] - P[p][0]);
        if ((cross > 0) === (nz > 0)) idx.push(b + p, b + q, b + r);
        else idx.push(b + p, b + r, b + q);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.wuv = true;
  return g;
}

// The cross-section of a pitched roof over a span of 2H (wall face to wall face), with its underside
// resting on the wall tops at y0: { outline, ridge (top of the ridge line), under(a) (underside
// height), top(a) (top surface height) }.
//   kind 'band'  : tiles or slates, `t` thick, eaves `over` beyond the walls.
//   kind 'thatch': a thick coat with a rounded nose at the eaves and a ridge roll.
export function roofSection({ H, y0, pitch, over, t, kind = 'band' }) {
  const tan = Math.tan(pitch), cos = Math.cos(pitch), sin = Math.sin(pitch);
  const under = (a) => y0 + (H - Math.abs(a)) * tan;
  const T = t / cos; // vertical thickness
  const E = H + over;
  const out = [];
  if (kind === 'band') {
    out.push([-E, under(-E)], [E, under(E)], [E, under(E) + T], [0, under(0) + T], [-E, under(-E) + T]);
    // The underside's apex point (so the band has a proper inverted V).
    out.splice(1, 0, [0, under(0)]);
    return { outline: out, ridge: under(0) + T, under, top: (a) => under(a) + T };
  }
  // Thatch: underside from the left eave to the right one, a blunt cut nose, the top back over a
  // ridge roll. Each point carries its v: the reed runs from the ridge (v = 1, the texture's mossy
  // band) down the slope and on round the nose, at one steady density, so the eaves show the reed
  // ends instead of a smear.
  const noseSeg = 5;
  const slopeLen = E / cos;
  const noseArc = (Math.PI * t) / 2 * 0.7;
  const Lt = slopeLen + noseArc;
  const vAt = (dist) => 1 - 0.95 * (dist / Lt);
  const nose = (side) => {
    // A flattened half-round from the top end to the underside end, bulging a little down the slope.
    const U = [side * E, under(E)];
    const nrm = [side * sin, cos]; // up out of the slope
    const d = [side * cos, -sin]; // down the slope
    const C = [U[0] + (nrm[0] * t) / 2, U[1] + (nrm[1] * t) / 2];
    const pts = [];
    for (let k = 1; k < noseSeg; k++) {
      const th = (k / noseSeg) * Math.PI; // from the top (th = 0) round to the underside (th = PI)
      pts.push([C[0] + (t / 2) * (nrm[0] * Math.cos(th) + d[0] * Math.sin(th) * 0.45), C[1] + (t / 2) * (nrm[1] * Math.cos(th) + d[1] * Math.sin(th) * 0.45), vAt(slopeLen + noseArc * (k / noseSeg))]);
    }
    // Returned in outline order: the right nose runs from the underside up to the top (counter-clockwise).
    return side > 0 ? pts.reverse() : pts;
  };
  const roll = 0.16, rw = 0.55;
  const topAt = (a) => under(a) + T + roll * Math.max(0, 1 - (a / rw) ** 2);
  const vUnder = vAt(Lt);
  out.push([-E, under(-E), vUnder], [0, under(0), vUnder - 0.5], [E, under(E), vUnder]);
  out.push(...nose(1));
  out.push([E, under(E) + T, vAt(slopeLen)]);
  for (let k = 8; k >= -8; k--) {
    const a = (k / 8) * Math.min(rw * 1.3, E * 0.5);
    out.push([a, topAt(a), vAt(Math.abs(a) / cos)]);
  }
  out.push([-E, under(-E) + T, vAt(slopeLen)]);
  out.push(...nose(-1));
  return { outline: out, ridge: topAt(0), under, top: topAt };
}

// A gable: the triangle of wall between the wall tops (y0) and the roof's underside, 2H wide and
// `thick` deep (its outer face at z = 0, the wall running back to -thick). Point [0, apex] is the top.
export function gableGeometry(H, rise, thick) {
  const shape = new THREE.Shape([new THREE.Vector2(-H, 0), new THREE.Vector2(H, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick);
  return g;
}

// A bargeboard: the board along one rake of a gable, `len` long and `h` deep, `t` thick, its top edge
// on the x axis (it is laid on the rake by whoever places it). Its lower edge is cut in a row of ash
// leaves: pointed leaflets pierced through the board in pairs along a stem, Ashford's own motif.
export function bargeGeometry(len, h = 0.3, t = 0.05) {
  const shape = new THREE.Shape();
  // A lobed lower edge: one rounded lobe under each pair of leaves.
  const n = Math.max(2, Math.round(len / 0.55));
  const step = len / n;
  shape.moveTo(0, 0);
  shape.lineTo(len, 0);
  shape.lineTo(len, -h * 0.7);
  for (let i = n - 1; i >= 0; i--) shape.quadraticCurveTo(step * (i + 0.5), -h * 1.25, step * i, -h * 0.7);
  shape.lineTo(0, 0);
  // Leaf holes: a pointed oval, tipped like an ash leaflet, in pairs either side of each lobe's middle.
  for (let i = 0; i < n; i++) {
    const cx = step * (i + 0.5), cy = -h * 0.36;
    for (const k of [-1, 1]) {
      const hole = new THREE.Path();
      const L2 = step * 0.21, W2 = h * 0.12;
      const ax = cx + k * L2 * 1.1, ay = cy + 0.012;
      // A leaflet pointing away from the centre, drawn as two arcs meeting at its tips.
      hole.moveTo(ax - k * L2, ay);
      hole.quadraticCurveTo(ax, ay + W2 * 1.6, ax + k * L2, ay);
      hole.quadraticCurveTo(ax, ay - W2 * 1.6, ax - k * L2, ay);
      shape.holes.push(hole);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -t / 2);
  return g;
}

// A chimney stack: a shaft w x d, from y 0 to h, an oversailing course near the top and pots.
// Returns [{ geo, part: 'shaft' | 'cap' | 'pot', y }] in the stack's own frame (base centre at 0).
export function stackParts(w, d, h, pots = 1) {
  const parts = [];
  parts.push({ geo: new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), part: 'shaft' });
  parts.push({ geo: new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12).translate(0, h - 0.24, 0), part: 'cap' });
  parts.push({ geo: new THREE.BoxGeometry(w, 0.1, d).translate(0, h + 0.02, 0), part: 'cap' });
  for (let i = 0; i < pots; i++) {
    const x = pots === 1 ? 0 : (i - (pots - 1) / 2) * Math.min(0.34, (w - 0.2) / (pots - 1 || 1));
    parts.push({ geo: new THREE.CylinderGeometry(0.1, 0.13, 0.42, 10).translate(x, h + 0.12 + 0.21, 0), part: 'pot' });
    parts.push({ geo: new THREE.CylinderGeometry(0.125, 0.125, 0.05, 10).translate(x, h + 0.12 + 0.44, 0), part: 'pot' });
  }
  return parts;
}
