/* Tests for the heart and double circulation story.
 *
 *   cd human_anatomy/heart && node test-heart.js
 *
 * The page is run under the real three.js r128 it loads (the URL is read from
 * its own <script src>, and the copy particles/test-render.js keeps in
 * particles/.three-cache is reused), with only WebGLRenderer and
 * PMREMGenerator stubbed. Then:
 *
 *   RENDER    every frame of every chapter: nothing throws, the camera, the
 *             beating heart and every blood cell stay finite, every frame
 *             draws, and every label and the cell we follow are in the
 *             picture.
 *   HEART     what was found in the geometry is anatomy: the valve rings are
 *             where atrium meets ventricle and where the arteries start, their
 *             axes point downstream, the cavities are hollow, the four-chamber
 *             cut shows the textbook view (right atrium top left), the left
 *             ventricle's wall is the thicker.
 *   VALVES    the beat: never both pairs of valves open; the AV valves shut
 *             while the ventricles squeeze. Shut, each valve covers its ring;
 *             open, its middle is clear. The drawn flaps fill only the gaps
 *             the atlas leaves, and fall where the missing leaflets belong.
 *   FLOW      blood crosses each valve only while it is open, never goes
 *             backwards, waits in the ventricle's cavity, and as much leaves
 *             each beat as comes in.
 *   ROUTES    the routes FOUND by searching the vessels are the anatomical
 *             ones: the left carotid and subclavian straight off the arch, the
 *             right ones through the brachiocephalic trunk, each limb by its
 *             own side's vessels, legs back by the inferior vena cava.
 *   CIRCUITS  every circuit goes heart -> lungs -> heart -> body -> heart, is
 *             oxygenated exactly between the lungs' capillaries and the
 *             body's, and the vessels are coloured by the blood they carry.
 *   THE CELL  the cell we follow visits every stop in order, changes colour
 *             in the lungs, and never jumps.
 *   WORDS     the numbers the captions quote are the measured ones.
 *   LICENCE   the packed anatomy is the manifest's, carries its licence, and
 *             holds no part the licence rules block.
 *
 * Whether it LOOKS right is for a browser.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname, ROOT = path.resolve(HERE, '..', '..');
const FILE = 'heart.html';
let checks = 0, fails = 0;
function chk(ok, msg) { checks++; if (!ok) { fails++; console.log('    ✗ ' + msg); } }
function section(s) { console.log('\n' + s); }
const html = fs.readFileSync(path.join(HERE, FILE), 'utf8');

/* --- three.js, the cached copy the particle tests fetched --------------- */
function three() {
  const url = (html.match(/<script src="([^"]*three[^"]*\.js)"><\/script>/) || [])[1];
  const name = url.split('/').slice(-3).join('-').replace(/[^\w.-]/g, '_');
  const file = path.join(ROOT, 'particles', '.three-cache', name);
  if (!fs.existsSync(file)) return null;
  const exports = {}, sb = { module: { exports }, exports, console };
  sb.self = sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sb);
  return [sb.exports, sb.module.exports, sb.THREE].find(c => c && c.Vector3);
}

/* --- just enough browser ------------------------------------------------- */
function dom() {
  const els = new Map();
  const ctx2d = () => ({
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    measureText(s) { return { width: String(s).length * 26 }; }, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}
  });
  function mk(id) {
    return {
      id, width: 300, height: 150, innerHTML: '', textContent: '', hidden: false,
      style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, appendChild() {}, setPointerCapture() {},
      clientWidth: 1280, clientHeight: 720, title: '',
      getContext: () => ctx2d()
    };
  }
  return {
    getElementById(id) { if (!els.has(id)) els.set(id, mk(id)); return els.get(id); },
    createElement(t) { return mk(t); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
}
function stub(THREE, d) {
  THREE.WebGLRenderer = class {
    constructor() { this.domElement = d.createElement('canvas'); this.__renders = 0; }
    setPixelRatio() {} setSize() {} render() { this.__renders++; }
  };
  THREE.PMREMGenerator = class { fromScene() { return { texture: new THREE.Texture() }; } dispose() {} };
}

const THREE = three();
if (!THREE) {
  console.log('SKIPPED — no cached three.js; run particles/test-render.js once with a network connection.');
  process.exit(0);
}
const D = dom();
stub(THREE, D);
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const expose = ['frame', 'enterChapter', 'CH', 'camera', 'renderer', 'CUES', 'shotAt', 'CAM', 'STATE', 'CELLS', 'MESH', 'PARTS',
  'ANATOMY', 'LM', 'ROUTE', 'CIRCUITS', 'oxyAt', 'SIDES', 'sideCell', 'sideRange', 'Fin', 'Fout', 'cycle', 'PH', 'VALVES',
  'DRAWN', 'FACTS', 'BLOOD', 'REAL_T', 'TAG', 'tagAt', 'stopOf', 'STOPS4', 'TAG_LBL', 'TAG_SPR', 'CHAMBERS', 'LEAFLETS',
  'inCavity', 'rayHits', 'ringFrame', 'along', 'OXY', 'DEOXY', 'isPulArt', 'isPulVein', 'SYS_ART', 'SYS_VEIN',
  'MAT', 'matsFor', 'frac', 'COL', 'ringRadiusAt', 'CH4', 'NETWORK', 'NET', 'FLOWS', 'cellSize', 'radiusAlong', 'inLineage',
  'asCentreline', 'isCardiacVein'].join(',');
let S;
try {
  S = new Function('THREE', 'document', 'window', 'performance', 'requestAnimationFrame', 'atob',
    js + '\nreturn {' + expose + '};')(
    THREE, D, { addEventListener() {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
    { now() { return 0; } }, () => 0, s => Buffer.from(s, 'base64').toString('latin1'));
} catch (e) {
  console.log('    ✗ the page threw while loading: ' + e.message);
  console.log((e.stack || '').split('\n').slice(1, 4).join('\n'));
  process.exit(1);
}
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const finite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
const seq = poly => poly.parts.filter((p, i) => i === 0 || p !== poly.parts[i - 1]);
const LM = S.LM, R = S.ROUTE;
/* Is p inside the muscle of a chamber's wall? Find the nearest vertex of the
   wall's surface: if p is behind it (against its outward normal), p is in
   the solid. Robust where a mesh is open -- the right ventricle's is, along
   the septum, so counting ray crossings would not do. */
const NORMALS = {};
function wallNormals(name) {
  if (NORMALS[name]) return NORMALS[name];
  const P = S.PARTS[name], g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3)); g.setIndex(new THREE.BufferAttribute(P.idx, 1));
  g.computeVertexNormals();
  /* vertices on an open edge (a valve ring, a vessel's mouth): their normals
     say nothing about which side is inside, so they cannot vote */
  const key = i => [0, 1, 2].map(k => Math.round(P.pos[i * 3 + k] * 1e5)).join(':');
  const E = new Map();
  for (let t = 0; t < P.idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = key(P.idx[t + e]), b = key(P.idx[t + (e + 1) % 3]), k = a < b ? a + '|' + b : b + '|' + a;
    E.set(k, (E.get(k) || 0) + 1);
  }
  const edge = new Set();
  for (const [k, c] of E) if (c === 1) k.split('|').forEach(x => edge.add(x));
  const open = new Uint8Array(P.pos.length / 3);
  for (let i = 0; i < open.length; i++) if (edge.has(key(i))) open[i] = 1;
  return (NORMALS[name] = { N: g.attributes.normal.array, open });
}
function inMuscle(p) {
  for (const k in S.CHAMBERS) {
    const name = S.CHAMBERS[k], P = S.PARTS[name], W = wallNormals(name), N = W.N;
    let best = -1, bd = Infinity;
    for (let i = 0; i < P.pos.length; i += 3) { const d = Math.hypot(P.pos[i] - p[0], P.pos[i + 1] - p[1], P.pos[i + 2] - p[2]); if (d < bd) { bd = d; best = i; } }
    /* inside a wall at most ~16 mm thick, a point is within 8 mm of a face */
    if (bd > 0.008 || W.open[best / 3]) continue;
    const q = [p[0] - P.pos[best], p[1] - P.pos[best + 1], p[2] - P.pos[best + 2]];
    if (dot(q, [N[best], N[best + 1], N[best + 2]]) < -0.0005) return name;
  }
  return null;
}

/* ======================================================================== */
section('RENDER  every frame of every chapter');
/* Labels that are showing, and the cell we follow, must be IN the picture:
   projected through the real camera, inside the 16:9 frame resize() sets
   up for a 1280x720 stage, and in front of it. */
const offscreen = new Map();
function inView(obj, what, c, t, margin) {
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  const camSpace = v.clone().applyMatrix4(S.camera.matrixWorldInverse);
  v.project(S.camera);
  const m = margin || 1.0;
  if (camSpace.z > 0 || Math.abs(v.x) > m || Math.abs(v.y) > m) {
    const k = 'chapter ' + c + ': ' + what;
    if (!offscreen.has(k)) offscreen.set(k, t.toFixed(1) + ' s (' + v.x.toFixed(2) + ', ' + v.y.toFixed(2) + ')');
  }
}
for (let c = 0; c < S.CH.length; c++) {
  S.enterChapter(c);
  const before = S.renderer.__renders;
  let bad = 0, t = 0, badCells = 0, badHeart = 0;
  try {
    for (t = 0; t <= S.CH[c].len + 3; t += 1 / 30) {
      S.frame(t);
      const p = S.camera.position;
      if (!Number.isFinite(p.x + p.y + p.z)) bad++;
      for (const k in S.CELLS) if (S.CELLS[k].visible && !finite(S.CELLS[k].instanceMatrix.array)) badCells++;
      /* only once the camera has settled from its opening move */
      const shot = S.shotAt(S.CH[c], t);
      if (shot.fade > 0.05 || t < 3.4) continue;
      S.camera.updateMatrixWorld();
      for (const cu of S.CUES) {
        if (!cu.ch.includes(c) || !cu.obj.visible) continue;
        cu.obj.traverse(o => { if (o.isSprite) inView(o, 'label "' + o.userData.text + '"', c, t, 0.97); });
      }
      if (S.TAG_SPR.visible) inView(S.TAG_SPR, 'the cell we follow', c, t);
      for (const k in S.TAG_LBL) if (S.TAG_LBL[k].visible) inView(S.TAG_LBL[k], 'the label "' + S.TAG_LBL[k].userData.text + '"', c, t, 0.97);
    }
    for (const name in S.MESH) {
      const M = S.MESH[name];
      if (M.near && !finite(M.geo.attributes.position.array)) { badHeart++; break; }
    }
  } catch (e) {
    chk(false, 'chapter ' + c + ' ("' + S.CH[c].title + '") threw at t=' + t.toFixed(2) + ': ' + e.message);
    console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
    continue;
  }
  chk(S.renderer.__renders - before >= Math.floor((S.CH[c].len + 3) * 30), 'chapter ' + c + ' missed frames');
  chk(bad === 0, 'chapter ' + c + ': ' + bad + ' non-finite camera positions');
  chk(badCells === 0, 'chapter ' + c + ': a blood cell went non-finite');
  chk(badHeart === 0, 'chapter ' + c + ': the beating heart went non-finite');
}
chk(offscreen.size === 0, 'shown but out of the picture:\n        ' + [...offscreen].map(([k, v]) => k + ' at ' + v).join('\n        '));
chk(S.CH.every(c => !/undefined|NaN/.test(c.text + c.title + (c.look || '') + (c.scale || ''))), 'a caption has "undefined" or NaN in it');
chk(S.CUES.every(cu => { let ok = true; cu.obj.traverse(o => { if (o.isSprite && /undefined|NaN/.test(o.userData.text)) ok = false; }); return ok; }), 'a label has "undefined" or NaN in it');

/* ======================================================================== */
section('HEART  found in the geometry');
const ring = k => LM[k];
for (const k of ['tricuspid', 'mitral', 'aortic', 'pulmonary'])
  chk(ring(k).r > 0.011 && ring(k).r < 0.025, 'the ' + k + ' ring is ' + (ring(k).r * 2000).toFixed(0) + ' mm across; a valve ring is 2-5 cm');
chk(dot(LM.tricuspid.n, sub(LM.RV, LM.RA)) > 0, 'the tricuspid axis does not point from the right atrium into the right ventricle');
chk(dot(LM.mitral.n, sub(LM.LV, LM.LA)) > 0, 'the mitral axis does not point from the left atrium into the left ventricle');
chk(dot(LM.aortic.n, sub(LM.aortic.c, LM.LV)) > 0, 'the aortic valve does not face out of the left ventricle');
chk(dot(LM.pulmonary.n, sub(LM.trunkTop, LM.pulmonary.c)) > 0, 'the pulmonary valve does not face up the pulmonary trunk');
chk(d3(LM.tricuspid.c, LM.RA) < d3(LM.tricuspid.c, LM.LA) && d3(LM.mitral.c, LM.LA) < d3(LM.mitral.c, LM.RA), 'an AV ring is on the wrong side of the heart');
chk(LM.tricuspid.c[0] < LM.mitral.c[0], 'the tricuspid valve should be on the body\'s right (-x) of the mitral');
for (const k in S.CHAMBERS) chk(S.inCavity(S.CHAMBERS[k], LM.inside[k]), 'the point found inside the ' + S.CHAMBERS[k] + ' is not in its cavity');
for (const k in S.CHAMBERS) chk(!!LM.onCut[k], 'the frontal cut does not open the ' + S.CHAMBERS[k] + ' at all');
/* THE FRONTAL CUT faces the front of the body, and sits at the depth that
   opens the four chambers most evenly a frontal cut can: measured here, the
   smallest of the four cavities' cut areas is at least as big as 5 mm in
   front or behind. (The heart lies tilted, so no frontal cut opens the left
   atrium and right ventricle much; this is the best it gets.) */
const onPlane = p => Math.abs(dot(LM.cut.n, p) - LM.cut.d);
chk(LM.cut.n[0] === 0 && LM.cut.n[1] === 0 && LM.cut.n[2] === 1, 'the cut for the chambers is not frontal: its normal should be the body\'s front, +z');
{
  const cavityArea = (k, z) => {
    const P = S.PARTS[S.CHAMBERS[k]], step = 0.003;
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (let i = 0; i < P.pos.length; i += 3) for (let j = 0; j < 2; j++) { lo[j] = Math.min(lo[j], P.pos[i + j]); hi[j] = Math.max(hi[j], P.pos[i + j]); }
    const D = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * 2 * Math.PI + 0.1; return [Math.cos(a), Math.sin(a), 0]; });
    let n = 0;
    for (let x = lo[0]; x <= hi[0]; x += step) for (let y = lo[1]; y <= hi[1]; y += step) {
      let f = 0, h = 0;
      for (const d of D) { const r = S.rayHits(P, [x, y, z], d); if (!r.length) continue; h++; if (r[0].front) f++; }
      if (h >= 6 && f >= h - 1) n++;
    }
    return n * step * step * 1e4;
  };
  const minArea = z => Math.min(...Object.keys(S.CHAMBERS).map(k => cavityArea(k, z)));
  const here = minArea(LM.cut.d), front = minArea(LM.cut.d + 0.005), back = minArea(LM.cut.d - 0.005);
  console.log('    frontal cut ' + (LM.cut.d * 1000).toFixed(1) + ' mm: the smallest chamber opening is ' + here.toFixed(1) + ' cm2 (' + front.toFixed(1) + ' cm2 5 mm in front, ' + back.toFixed(1) + ' cm2 5 mm behind)');
  chk(here > 0 && here >= front - 0.2 && here >= back - 0.2, 'the frontal cut is not at the depth that opens all four chambers best');
}
/* the textbook view from the front: right atrium top left, atria above
   ventricles, apex down */
{
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.001, 10), c = S.CAM.four;
  chk(Math.abs(c.az) < 1e-9 && Math.abs(c.el) < 1e-9, 'the camera for the chambers should look straight at the front of the body');
  cam.position.set(c.look[0] + c.dist * Math.cos(c.el) * Math.sin(c.az), c.look[1] + c.dist * Math.sin(c.el), c.look[2] + c.dist * Math.cos(c.el) * Math.cos(c.az));
  cam.lookAt(c.look[0], c.look[1], c.look[2]); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const P = k => new THREE.Vector3(...LM.inside[k]).project(cam);
  const ra = P('RA'), rv = P('RV'), la = P('LA'), lv = P('LV');
  chk(ra.x < la.x && rv.x < lv.x, 'seen from the front, the heart\'s right side is not on the viewer\'s left');
  chk(ra.y > rv.y && la.y > lv.y, 'seen from the front, the atria are not above the ventricles');
  const apex = new THREE.Vector3(...LM.apex).project(cam);
  chk(apex.y < Math.min(rv.y, lv.y), 'seen from the front, the apex does not point down');
}
/* the short-axis cut, for the walls: square to the long axis, across both ventricles */
const onShort = p => Math.abs(dot(LM.short.n, p) - LM.short.d);
chk(!!LM.onShort.LV && !!LM.onShort.RV, 'the short-axis cut does not open both ventricles');
console.log('    walls: left ventricle ' + LM.wallLV.mm.toFixed(1) + ' mm (' + LM.wallLV.rays + ' rays), right ventricle ' + LM.wallRV.mm.toFixed(1) + ' mm (' + LM.wallRV.rays + ' rays)');
chk(LM.wallLV.rays >= 10 && LM.wallRV.rays >= 10, 'a wall was measured with too few rays');
chk(LM.wallLV.mm > 2 * LM.wallRV.mm, 'the left ventricle wall should be more than twice as thick as the right');
chk(LM.wallLV.mm > 6 && LM.wallLV.mm < 16 && LM.wallRV.mm > 1.5 && LM.wallRV.mm < 6, 'a wall thickness is outside what hearts have');
chk(onShort(LM.wallLV.from) < 1e-6 && onShort(LM.wallRV.to) < 1e-6, 'the rulers are not on the short-axis cut');
chk(d3(LM.sa, S.PARTS[S.CHAMBERS.RA].pos.slice(0, 3)) >= 0 && LM.sa[1] > LM.RA[1], 'the pacemaker is not in the upper part of the right atrium');
chk(LM.length > 0.09 && LM.length < 0.16, 'the heart is ' + (LM.length * 100).toFixed(0) + ' cm long; a heart is about 12 cm');

/* ======================================================================== */
section('VALVES  the beat and the leaflets');
{
  let both = 0, avWhileSqueeze = 0, atriaShut = 0, slWithoutSqueeze = 0;
  for (let p = 0; p < 1; p += 0.0005) {
    const c = S.cycle(p);
    if (c.av > 0.02 && c.sl > 0.02) both++;
    if (c.vent > 0.3 && c.av > 0.01) avWhileSqueeze++;
    if (c.atria > 0.05 && c.av < 0.95) atriaShut++;
    if (c.sl > 0.02 && c.vent < 0.3) slWithoutSqueeze++;
  }
  chk(both === 0, 'both pairs of valves are open at once: blood could run straight through');
  chk(avWhileSqueeze === 0, 'an AV valve is open while the ventricles squeeze: blood would go back into the atria');
  chk(atriaShut === 0, 'the atria squeeze against shut AV valves');
  chk(slWithoutSqueeze === 0, 'the semilunar valves open without the ventricles squeezing');
  chk(S.PH.avShut[0] < S.PH.slShut[0], '"lub" (AV valves shutting) should come before "dub" (semilunar valves shutting)');
}
/* how much of a ring's disc a set of triangles covers, looking along its axis */
function coverage(Rg, meshes, rmax, rmin) {
  let hit = 0, n = 0;
  for (let i = 0; i < 24; i++) for (let j = 1; j <= 6; j++) {
    const a = i / 24 * 2 * Math.PI - Math.PI, r = S.ringRadiusAt(Rg, a) * (rmin + (rmax - rmin) * j / 6);
    const p = [0, 1, 2].map(k => Rg.c[k] + (Rg.e1[k] * Math.cos(a) + Rg.e2[k] * Math.sin(a)) * r - Rg.n[k] * 0.05);
    n++;
    if (meshes.some(M => S.rayHits(M, p, Rg.n).length > 0 || S.rayHits(M, p.map((x, k) => x + Rg.n[k] * 0.1), Rg.n.map(x => -x)).length > 0)) hit++;
  }
  return hit / n;
}
for (const key of ['tricuspid', 'mitral', 'aortic', 'pulmonary']) {
  const V = S.VALVES[key], Rg = V.R;
  const flaps = V.av ? S.VALVES[key + 'Flaps'] : [];
  /* an AV leaflet blocks blood with its sheet, not its tendons: count only
     triangles of the sheet, above where the tendons begin */
  const sheet = L => {
    const idx = S.PARTS[L.name].idx;
    if (!V.av) return idx;
    const out = [];
    for (let t = 0; t < idx.length; t += 3) if ([0, 1, 2].every(j => L.F[idx[t + j]].h <= L.edge)) out.push(idx[t], idx[t + 1], idx[t + 2]);
    return Uint32Array.from(out);
  };
  const shut = V.leaves.map(L => ({ pos: V.av ? L.alt : L.rest, idx: sheet(L) }))
    .concat(flaps.map(F => ({ pos: F.alt, idx: Uint32Array.from(F.idx) })));
  const open = V.leaves.map(L => ({ pos: V.av ? L.rest : L.alt, idx: sheet(L) }))
    .concat(flaps.map(F => ({ pos: F.rest, idx: Uint32Array.from(F.idx) })));
  const cs = coverage(Rg, shut, 0.8, 0), co = coverage(Rg, open, V.av ? 0.3 : 0.55, 0);
  console.log('    ' + key.padEnd(10) + 'shut covers ' + (cs * 100).toFixed(0) + '% of the ring; open, ' + (co * 100).toFixed(0) + '% of its middle');
  chk(cs > 0.9, 'the ' + key + ' valve, shut, leaves ' + ((1 - cs) * 100).toFixed(0) + '% of its ring open: blood would leak back');
  chk(co < 0.15, 'the ' + key + ' valve, open, still blocks ' + (co * 100).toFixed(0) + '% of its middle');
}
/* the drawn flaps: only in the gaps, and where the missing leaflets belong */
chk(S.VALVES.mitralFlaps.length === 1 && S.VALVES.tricuspidFlaps.length === 1, 'expected one drawn flap on each AV valve (the atlas lacks each one\'s anterior leaflet)');
{
  const midDir = (key) => { const F = S.VALVES[key + 'Flaps'][0], Rg = LM[key], a = (F.arc[0] + F.arc[1]) / 2; return [0, 1, 2].map(k => Rg.e1[k] * Math.cos(a) + Rg.e2[k] * Math.sin(a)); };
  const toward = (u, from, to) => { const d = sub(to, from), L = Math.hypot(...d); return dot(u, d) / L; };
  chk(toward(midDir('mitral'), LM.mitral.c, LM.aortic.c) > 0.7, 'the drawn mitral flap should face the aortic valve: the anterior leaflet is joined to the aortic root');
  chk(midDir('tricuspid')[2] > 0.5, 'the drawn tricuspid flap should face the front of the body: it stands in for the anterior leaflet');
  for (const key of ['tricuspid', 'mitral']) {
    const deg = S.VALVES[key + 'Flaps'][0].degrees;
    chk(deg > 90 && deg < 220, 'the drawn ' + key + ' flap spans ' + deg.toFixed(0) + ' degrees of the ring');
  }
}

/* ======================================================================== */
section('FLOW  through the valves, one way');
for (const side of ['right', 'left']) {
  const Sd = S.SIDES[side], ringAV = side === 'right' ? 'tricuspid' : 'mitral', ringSL = side === 'right' ? 'pulmonary valve' : 'aortic valve';
  let wrongIn = 0, wrongOut = 0, back = 0, crossedIn = 0, crossedOut = 0;
  const sAt = (P, lab) => P.cum[P.parts.indexOf(lab)];
  for (let k = 100; k < 160; k++) {
    let prev = null;
    for (let c = 6; c < 22; c += 0.002) {
      const q = S.sideCell(Sd, k, c);
      if (!q) { if (prev && prev.stage === 'out') break; continue; }
      const stageN = { in: 0, pool: 1, out: 2 }[q.stage];
      const pos = q.stage === 'in' ? q.u * q.P.L : q.stage === 'out' ? q.s : 0;
      if (prev && (stageN < prev.n || (stageN === prev.n && pos < prev.pos - 1e-9))) back++;
      if (prev && prev.n === 0 && stageN === 0) {
        const sr = sAt(q.P, ringAV);
        if (prev.pos < sr && pos >= sr) { crossedIn++; if (S.cycle(S.frac(c)).av < 0.02) wrongIn++; }
      }
      if (prev && stageN === 2) {
        const sr = sAt(q.P, ringSL), was = prev.n === 2 ? prev.pos : -1;
        if (was < sr && pos >= sr) { crossedOut++; if (S.cycle(S.frac(c)).sl < 0.02) wrongOut++; }
      }
      prev = { n: stageN, pos };
    }
  }
  chk(crossedIn > 50 && crossedOut > 50, side + ': too few cells seen crossing the valves (' + crossedIn + ' in, ' + crossedOut + ' out)');
  chk(wrongIn === 0, side + ': ' + wrongIn + ' cells crossed the ' + ringAV + ' ring while it was shut');
  chk(wrongOut === 0, side + ': ' + wrongOut + ' cells crossed the ' + ringSL + ' while it was shut');
  chk(back === 0, side + ': a cell went backwards ' + back + ' times');
  /* waiting in the ventricle: inside its cavity */
  const vent = side === 'right' ? S.CHAMBERS.RV : S.CHAMBERS.LV;
  let pooled = 0, outside = 0;
  for (let k = 100; k < 220 && pooled < 40; k += 3) for (let c = 6; c < 24 && pooled < 40; c += 0.37) {
    const q = S.sideCell(Sd, k, c);
    if (q && q.stage === 'pool') { pooled++; if (inMuscle(q.p)) outside++; }
  }
  chk(pooled >= 20 && outside === 0, side + ': ' + outside + ' of ' + pooled + ' cells waiting in the ventricle are inside its wall');
  /* as many leave as come in */
  chk(Math.abs((S.Fin(17.3) - S.Fin(7.3)) - 10) < 1e-9 && Math.abs((S.Fout(17.3) - S.Fout(7.3)) - 10) < 1e-9, 'in ten beats, not exactly ten beats\' worth goes in and out');
  /* the paths themselves keep out of the heart's walls */
  let inWallPts = 0, total = 0;
  for (const P of [...Sd.inlets, ...Sd.outlets]) {
    for (let s = 0; s < P.L; s += 0.003) {
      const p = S.along(P, s);
      if (d3(p, LM.centre) > 0.06) continue;
      total++;
      if (inMuscle(p)) inWallPts++;
    }
  }
  chk(total > 20 && inWallPts / total < 0.04, side + ': ' + inWallPts + ' of ' + total + ' points of the blood\'s path through the heart are inside heart muscle');
}

/* ======================================================================== */
section('ROUTES  found by searching the vessels');
const body = k => R.body.find(b => b.key === k);
for (const b of R.body) console.log('    ' + b.key.padEnd(7) + b.art.L.toFixed(2) + ' m out, capillaries ' + (b.cap * 1000).toFixed(0) + ' mm, ' + b.vein.L.toFixed(2) + ' m back: ' + seq(b.art).join(' > '));
const has = (poly, n) => poly.parts.includes(n);
chk(!has(body('head.l').art, 'Brachiocephalic trunk') && has(body('head.l').art, 'Left common carotid artery'), 'the left common carotid should leave the aortic arch directly');
chk(!has(body('arm.l').art, 'Brachiocephalic trunk') && has(body('arm.l').art, 'Left subclavian artery'), 'the left subclavian should leave the aortic arch directly');
chk(has(body('head.r').art, 'Brachiocephalic trunk') && has(body('head.r').art, 'Right common carotid artery'), 'the right common carotid should come off the brachiocephalic trunk');
chk(has(body('arm.r').art, 'Brachiocephalic trunk') && has(body('arm.r').art, 'Right subclavian artery'), 'the right subclavian should come off the brachiocephalic trunk');
for (const side of ['l', 'r']) {
  const leg = body('leg.' + side);
  chk(['Thoracic aorta', 'Abdominal aorta', 'Common iliac artery.' + side, 'Femoral artery.' + side, 'Popliteal artery.' + side].every(n => has(leg.art, n)), 'the ' + side + ' leg\'s arteries are not aorta > common iliac > femoral > popliteal');
  chk(['Femoral vein.' + side, 'Common iliac vein.' + side, 'Inferior vena cava (thoracic part)'].every(n => has(leg.vein, n)), 'the ' + side + ' leg\'s blood does not come back by its femoral and iliac veins and the inferior vena cava');
  for (const k of ['head', 'arm', 'leg']) {
    const B = body(k + '.' + side), other = side === 'l' ? '.r' : '.l';
    chk(![...B.art.parts, ...B.vein.parts].some(n => n.endsWith(other)), k + '.' + side + ' uses a vessel of the other side');
  }
  chk(body('arm.' + side).cava === 'Superior vena cava' && body('head.' + side).cava === 'Superior vena cava', 'blood from the head and arms should return by the superior vena cava');
  chk(body('leg.' + side).cava === 'Inferior vena cava (thoracic part)', 'blood from the legs should return by the inferior vena cava');
}
for (const b of R.body) {
  chk(b.art.parts.every(n => S.SYS_ART.test(n)) && b.vein.parts.every(n => S.SYS_VEIN.test(n)), b.key + ': an artery route runs in a vein, or a vein route in an artery');
  chk(b.art.parts[0] === 'Ascending aorta', b.key + ': the route to the body does not start in the ascending aorta');
  chk(b.cap < 0.07, b.key + ': ' + (b.cap * 1000).toFixed(0) + ' mm of drawn capillaries is too long');
}
for (const l of R.lungs) {
  chk(l.art.parts.every(n => S.isPulArt(n)) && l.vein.parts.every(n => S.isPulVein(n)), l.key + ': the route through the lungs leaves the pulmonary vessels');
  chk(/^(Left|Right) (superior|inferior) pulmonary vein$/.test(l.vein.parts[l.vein.parts.length - 1]) || d3(l.vein.pts[l.vein.pts.length - 1], LM.LA) < 0.04, l.key + ': the pulmonary vein route does not reach the left atrium');
  chk(l.cap < 0.06, l.key + ': ' + (l.cap * 1000).toFixed(0) + ' mm of drawn capillaries in the lung is too long');
  const right = /right lung/.test(l.key);
  chk(l.art.parts.every(n => !(right ? /left lung|Left pulmonary/ : /right lung|Right pulmonary/).test(n)), l.key + ': the route crosses to the other lung');
}
chk(R.body.every(b => b.art.L > 0.2 && b.art.L < 2.0), 'an arterial route has an implausible length');
chk(body('leg.l').art.L > 1.2, 'the route to the foot is only ' + body('leg.l').art.L.toFixed(2) + ' m');

/* ======================================================================== */
section('CIRCUITS  heart, lungs, heart, body, heart');
const ORDER = ['Right atrium', 'tricuspid', 'Right ventricle', 'pulmonary valve', 'lung capillaries', 'Left atrium', 'mitral', 'Left ventricle', 'aortic valve', 'capillaries', 'Right atrium'];
for (const C of S.CIRCUITS) {
  const sq = seq(C.poly).filter(n => ORDER.includes(n));
  chk(sq.join('>') === ORDER.join('>'), C.body.key + ': the circuit goes ' + sq.join(' > '));
  /* through the heart twice: it enters an atrium twice */
  chk(sq.filter(n => /atrium/.test(n)).length === 3, C.body.key + ': the circuit does not pass through the heart exactly twice');
  /* oxygenated exactly from the lungs to the body's capillaries */
  let wrong = 0;
  for (let s = 0; s < C.poly.L; s += 0.004) {
    const i = C.poly.cum.findIndex(x => x > s), n = C.poly.parts[i < 0 ? C.poly.parts.length - 1 : Math.max(0, i - 1)], o = S.oxyAt(C, s);
    if (/capillaries/.test(n)) continue;
    const want = (S.SYS_ART.test(n) || S.isPulVein(n) || ['Left atrium', 'mitral', 'Left ventricle', 'aortic valve'].includes(n)) ? 1 : 0;
    if (Math.abs(o - want) > 1e-9) wrong++;
  }
  chk(wrong === 0, C.body.key + ': ' + wrong + ' points of the circuit carry the wrong kind of blood');
}
/* the vessels are coloured by the blood in them, not by their name */
const matOf = n => S.matsFor(n)[0];
chk(matOf('Pulmonary trunk') === S.MAT.deoxy && matOf('Left pulmonary artery') === S.MAT.deoxy, 'the pulmonary artery carries deoxygenated blood and should be blue');
chk(matOf('Right superior pulmonary vein') === S.MAT.oxy, 'the pulmonary veins carry oxygenated blood and should be red');
chk(matOf('Aortic arch') === S.MAT.oxy && matOf('Superior vena cava') === S.MAT.deoxy, 'the aorta should be red and the vena cava blue');
chk(matOf('Great cardiac vein') === S.MAT.deoxy, 'the cardiac veins should be blue');
chk(Object.keys(S.PARTS).every(n => !(S.OXY(n) && S.DEOXY(n))), 'a vessel is counted as carrying both kinds of blood');

/* ======================================================================== */
section('NETWORK  every vessel in the atlas, and blood through it');
{
  const cl = Object.keys(S.PARTS).filter(S.asCentreline);
  const inNet = new Set(Object.values(S.NET).flatMap(m => m.userData.names));
  console.log('    ' + cl.length + ' vessels built from centrelines; ' + S.NETWORK.body.length + ' loops round the body, ' + S.NETWORK.lungs.length + ' through the lungs');
  chk(cl.length > 500, 'only ' + cl.length + ' vessels came as centrelines; the atlas has about 650');
  chk(cl.every(n => inNet.has(n) || S.MESH[n]), 'a vessel given as a centreline was never built into a tube');
  for (const k in S.NET) chk(finite(S.NET[k].geometry.attributes.position.array) && S.NET[k].geometry.index.count > 0, 'the ' + k + ' network has a bad tube');
  /* the atlas files the heart's own muscle and valves under "Arterial system" too */
  const heartItself = n => Object.values(S.CHAMBERS).includes(n) || /papillary muscle/.test(n) || Object.values(S.LEAFLETS).flat().includes(n);
  const vessels = Object.keys(S.PARTS).filter(n => (S.inLineage(n, 'Arterial system') || S.inLineage(n, 'Venous system')) && !heartItself(n));
  const wrong = vessels.filter(n => S.OXY(n) === S.DEOXY(n));
  chk(!wrong.length, 'not coloured as one kind of blood: ' + wrong.slice(0, 4).join(', '));
  chk(Object.keys(S.PARTS).filter(S.isCardiacVein).every(n => S.DEOXY(n)), 'the cardiac veins carry deoxygenated blood');
  const near = (a, b, mm) => d3(a, b) < mm / 1000;
  for (const L of S.NETWORK.body) {
    const tag = L.art.parts[L.art.parts.length - 1];
    chk(L.art.parts.every(n => S.inLineage(n, 'Systemic arteries')) && L.vein.parts.every(n => S.inLineage(n, 'Systemic veins')), tag + ': a loop leaves the arteries before its capillaries or the veins after them');
    chk(near(L.art.pts[0], LM.aortic.c, 30), tag + ': a loop does not start at the aortic valve');
    chk(near(L.vein.pts[L.vein.pts.length - 1], R.svcEnd, 2) || near(L.vein.pts[L.vein.pts.length - 1], R.ivcEnd, 2), tag + ': a loop does not end where a vena cava meets the heart');
    chk(L.cap <= 0.03, tag + ': ' + (L.cap * 1000).toFixed(0) + ' mm of drawn capillaries');
  }
  for (const L of S.NETWORK.lungs) {
    chk(L.art.parts.every(S.isPulArt) && L.vein.parts.every(S.isPulVein), 'a loop through the lungs leaves the pulmonary vessels');
    chk(near(L.art.pts[0], LM.trunkTop, 30) && d3(L.vein.pts[L.vein.pts.length - 1], LM.LA) < 0.05, 'a loop through the lungs does not run from the pulmonary trunk to the left atrium');
  }
  chk(S.NETWORK.body.length >= 30 && S.NETWORK.lungs.length >= 10, 'too few loops through the network');
  /* spread over the whole body: head, arms, trunk and legs all have some */
  const tips = S.NETWORK.body.map(L => L.art.pts[L.art.pts.length - 1]);
  chk(tips.some(p => p[1] > 1.5) && tips.some(p => p[1] < 0.8) && tips.some(p => Math.abs(p[0]) > 0.2), 'the loops do not reach the head, the legs and the arms');
  /* a cell is a dot inside its vessel, never fatter than it */
  let fat = 0, n = 0;
  for (const view of [0.15, 0.7, 2.2]) {
    S.camera.fov = 40;
    for (const C of S.FLOWS) for (let s = 0; s < C.poly.L; s += 0.05) {
      const r = S.radiusAlong(C.poly, s);
      /* onScreen() scales with the view; at worst the cell is the floor size */
      const size = Math.min(0.0018 * view, Math.max(0.0004, 0.75 * r));
      n++; if (size > Math.max(r, 0.0004) + 1e-9) fat++;
    }
  }
  chk(n > 1000 && fat === 0, fat + ' cells would be fatter than their vessel');
  chk(S.cellSize(0.001, 1) <= 0.00075 + 1e-12 && S.cellSize(0.01, 0.001) <= 0.001 * 2.5, 'cellSize does not cap a cell at the vessel and at its share of the picture');
}

/* ======================================================================== */
section('THE CELL  we follow in chapter 5');
{
  const want = S.STOPS4.map(s => s[1]);
  const seen = [];
  let jump = 0, prevP = null, oxyBefore = 0, oxyAfter = 0, worstJump = 0;
  for (let t = 0; t <= S.CH[4].len; t += 1 / 30) {
    const g = S.tagAt(t);
    if (!g) { prevP = null; continue; }
    const st = S.stopOf(g.where);
    if (st && seen[seen.length - 1] !== st) seen.push(st);
    if (prevP) { const d = d3(prevP, g.p); worstJump = Math.max(worstJump, d); if (d > 0.03) jump++; }
    prevP = g.p;
    const before = seen.indexOf('lung capillaries') < 0, after = seen.indexOf('pulmonary vein') >= 0;
    if (before && g.oxy > 0) oxyBefore++;
    if (after && g.oxy < 1) oxyAfter++;
  }
  console.log('    stops: ' + seen.join(' > ') + '; biggest step between frames ' + (worstJump * 1000).toFixed(1) + ' mm');
  chk(seen.join('>') === want.join('>'), 'the cell does not visit every stop in order');
  chk(jump === 0, 'the cell jumps more than 3 cm between frames ' + jump + ' times');
  chk(oxyBefore === 0 && oxyAfter === 0, 'the cell is oxygenated before the lungs, or not after them');
  chk(S.TAG.tLeft < S.CH[4].len - 4, 'the cell has not reached the left side with enough of the chapter left');
}

/* ======================================================================== */
section('WORDS');
chk(S.FACTS.wallLV === LM.wallLV.mm.toFixed(0) && S.FACTS.wallRV === LM.wallRV.mm.toFixed(0), 'FACTS do not quote the measured walls');
chk(S.CH[6].text.includes('<b>' + S.FACTS.wallLV + ' mm</b>') && S.CH[6].text.includes('<b>' + S.FACTS.wallRV + ' mm</b>'), 'the walls chapter does not quote the measured thicknesses');
chk(S.FACTS.toesM === Math.max(...R.body.map(b => b.art.L)).toFixed(1) && S.CH[6].text.includes(S.FACTS.toesM + ' m'), 'the distance to the toes is not the route\'s');
chk(+S.FACTS.lungsM < +S.FACTS.toesM / 4, 'the lungs should be much nearer the heart than the toes');
chk(S.FACTS.outputL === (S.BLOOD.bpm * S.BLOOD.strokeML / 1000).toFixed(1) && S.CH[0].text.includes(S.FACTS.outputL + ' litres'), 'the litres a minute are not heart rate x stroke volume');
chk(S.FACTS.lengthCm === (LM.length * 100).toFixed(0) && S.CH[0].text.includes(S.FACTS.lengthCm + ' cm'), 'the heart\'s size is not the measured one');
chk(Math.abs(S.CH[0].T - 60 / S.BLOOD.bpm) < 1e-9, 'the first chapter is not beating in real time');
chk(S.CH[3].look.includes('slowed down about ' + Math.round(S.CH[3].T / S.REAL_T) + ' times'), 'the valves chapter misstates how much it is slowed down');
for (const c of S.CH) for (const k of c.key) chk(typeof k === 'string', 'a chapter has a bad key entry');

/* ======================================================================== */
section('LICENCE');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'anatomy', 'licence-rules.json'), 'utf8'));
chk(S.ANATOMY.licence === rules.licence && S.ANATOMY.attribution === rules.attribution, 'the packed licence is not the current one; re-pack');
chk(/Z-Anatomy/.test(html.slice(html.indexOf('<div class="credit">'), html.indexOf('<div class="credit">') + 600)) && /CC BY-SA/.test(html), 'the on-screen credit is missing');
chk(/drawn in/.test(html.slice(html.indexOf('<div class="credit">'), html.indexOf('<div class="credit">') + 600)), 'the credit does not say what is drawn in');
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'anatomy', 'catalogue.json'), 'utf8')).parts;
const blocked = new Set(cat.filter(p => p.blocked).map(p => p.name));
chk(S.ANATOMY.parts.every(p => !blocked.has(p.name)), 'the page carries a part the licence rules block');
chk(S.ANATOMY.parts.every(p => cat.some(c => c.name === p.name)), 'the page carries a part that is not in the catalogue');
const manifest = path.join(HERE, S.ANATOMY.source.glb.replace(/\.glb$/, '.manifest.json'));
if (fs.existsSync(manifest)) {
  const M = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  chk(M.parts.map(p => p.name).sort().join('|') === S.ANATOMY.parts.map(p => p.name).sort().join('|'), 'the packed parts are not the manifest\'s; re-pack');
  chk(S.ANATOMY.source.bytes === M.totals.bytes, 'the page was packed from a different build of the .glb; re-pack');
  const tris = Object.fromEntries(M.parts.map(p => [p.name, p.tris]));
  chk(S.ANATOMY.parts.every(p => p.i / 3 === tris[p.name]), 'a packed part has a different triangle count from the manifest');
}
const kb = Buffer.byteLength(html) / 1024;
chk(kb < 2000, 'the page is ' + kb.toFixed(0) + ' KB; keep it under 2 MB');
console.log('    page ' + kb.toFixed(0) + ' KB, ' + S.ANATOMY.parts.length + ' parts');

console.log('\n' + checks + ' checks, ' + fails + ' failure' + (fails === 1 ? '' : 's'));
process.exit(fails ? 1 : 0);
