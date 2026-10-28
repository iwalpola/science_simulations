/* Tests for the heart viewer.
 *
 *   cd human_anatomy/heart && node test-heart-viewer.js          check
 *   cd human_anatomy/heart && node test-heart-viewer.js --sync   re-copy the shared code from heart.html, then check
 *
 * The viewer exists to look closely at the heart the story draws, so it must
 * BE that heart: everything that builds, beats and cuts it is copied from
 * heart.html block by block, and
 *
 *   SAME      each block is still character for character the story's.
 *             --sync copies them across (run it after editing heart.html).
 *
 * Then the page is run under the real three.js r128, as test-heart.js runs
 * the story (only WebGLRenderer and PMREMGenerator stubbed):
 *
 *   RENDER    every moment of the beat, with each valve mode, the squeeze on
 *             and off, every layer, the landmarks and the cut: nothing
 *             throws, the camera, the heart and the landmarks stay finite,
 *             every frame draws.
 *   SECTION   any angle: a plane's normal and depth survive the sliders'
 *             turn/tilt/depth; the story's planes come back exactly; flipping
 *             keeps the same plane and the other half; "square to my view"
 *             cuts square to the camera through the point it orbits; "look at
 *             the cut" looks straight down the normal; the clip keeps the
 *             side away from the normal, as the story's does.
 *   LAYERS    the layers shown at first are exactly the story's heart (its
 *             "near" parts), and every mesh is in one layer.
 *   PICK      a click names a part that is drawn, never one cut away.
 *   BEAT      the words for each part of the beat agree with the valves.
 *   VIEW      a copied view comes back as it was.
 *
 * Whether it LOOKS right is for a browser.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname, ROOT = path.resolve(HERE, '..', '..');
const FILE = 'heart-viewer.html', STORY = 'heart.html';
let checks = 0, fails = 0;
function chk(ok, msg) { checks++; if (!ok) { fails++; console.log('    ✗ ' + msg); } }
function section(s) { console.log('\n' + s); }

/* ======================================================================== */
section('SAME  the code copied from heart.html');
/* Each block runs from a string that starts it to a string that ends it,
   both unique in heart.html. In the viewer a block is either the same text
   or, before the first --sync, a placeholder. */
const BLOCKS = [
  { key: 'anatomy', what: 'the packed anatomy, helpers, geometry and landmarks', from: '/* ANATOMY:BEGIN', to: '  L.sa = sa;\n  return L;\n})();' },
  { key: 'beat', what: 'the beat and the flow table', from: '/* =========================================================================\n   THE BEAT\n', to: 'const FILLED_BY_EJECTION = tab(FLOWTAB.fin, PH.slOpen[0]);' },
  { key: 'valves', what: 'the valves', from: '/* =========================================================================\n   THE VALVES\n', to: '    out[key] = {R, leaves, av};\n  }\n  return out;\n})();' },
  { key: 'three', what: 'renderer, lights, environment, linearise', from: '/* =========================================================================\n   THREE\n', to: 'const lin = hex => new THREE.Color(hex).convertSRGBToLinear();' },
  { key: 'labels', what: 'labels', from: '/* ------------------------------------------------------------------ labels */', to: '  parent.add(l);\n  return l;\n}' },
  { key: 'body', what: 'colours, the cut, materials, meshes, the squeeze and poseHeart', from: '/* ----------------------------------------------------------------- colours */', to: '    if(D.normals) D.M.geo.computeVertexNormals();\n  }\n}' },
  { key: 'semilunar', what: 'the plane above the semilunar valves', from: '/* looking down on the two semilunar valves', to: '  return d + 0.004;\n})();' }
];
const story = fs.readFileSync(path.join(HERE, STORY), 'utf8');
let html = fs.readFileSync(path.join(HERE, FILE), 'utf8');
function blockIn(text, B) {
  const a = text.indexOf(B.from);
  if (a < 0 || text.indexOf(B.from, a + 1) >= 0) return null;
  const b = text.indexOf(B.to, a);
  if (b < 0) return null;
  return { a, b: b + B.to.length, text: text.slice(a, b + B.to.length) };
}
const SYNC = process.argv.includes('--sync');
let synced = 0;
for (const B of BLOCKS) {
  const src = blockIn(story, B);
  chk(!!src, B.what + ': heart.html no longer has this block where expected; update BLOCKS in this test');
  if (!src) continue;
  const hole = '/*@@SAME:' + B.key + '@@*/';
  let here = html.includes(hole) ? { a: html.indexOf(hole), b: html.indexOf(hole) + hole.length, text: hole } : blockIn(html, B);
  if (SYNC && here && here.text !== src.text) {
    html = html.slice(0, here.a) + src.text + html.slice(here.b);
    here = blockIn(html, B); synced++;
  }
  chk(!!here, B.what + ': not found in the viewer');
  chk(here && here.text === src.text, B.what + ': differs from heart.html; run node test-heart-viewer.js --sync');
}
if (SYNC) {
  if (synced) fs.writeFileSync(path.join(HERE, FILE), html);
  console.log('    re-copied ' + synced + ' block' + (synced === 1 ? '' : 's') + ' from heart.html');
}
const storyCH3 = +(story.match(/const CH3 = \{T:([\d.]+)/) || [])[1];
const viewerCH3 = +(html.match(/const STORY_VALVES_T = ([\d.]+);/) || [])[1];
chk(storyCH3 > 0 && storyCH3 === viewerCH3, 'the "as in the valves chapter" speed is not the story\'s CH3.T (' + storyCH3 + ' vs ' + viewerCH3 + ')');
if (fails) { console.log('\n' + checks + ' checks, ' + fails + ' failures'); process.exit(1); }

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
  /* a 2D context on which every call is a no-op */
  const ctx2d = () => new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return s => ({ width: String(s).length * 26 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; }
  });
  function mk(id) {
    return {
      id, width: 300, height: 150, innerHTML: '', textContent: '', hidden: false, value: '', checked: false,
      style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, appendChild() {}, setPointerCapture() {},
      clientWidth: 1280, clientHeight: 720, title: '',
      getContext: () => ctx2d()
    };
  }
  return {
    getElementById(id) { if (!els.has(id)) els.set(id, mk(id)); return els.get(id); },
    createElement(t) { return mk(t); },
    createTextNode(s) { return { textContent: s }; },
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
  console.log('SKIPPED the rest — no cached three.js; run particles/test-render.js once with a network connection.');
  process.exit(fails ? 1 : 0);
}
const D = dom();
stub(THREE, D);
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const expose = ['frame', 'STATE', 'SEC', 'SHOW', 'LAYERS', 'layerOf', 'setSection', 'secN', 'secD', 'squareToView',
  'flipSection', 'faceCut', 'view', 'PRESETS', 'pick', 'showPick', 'PICKED', 'MARKS', 'POINTS', 'RINGS', 'PLANE', 'planeLine',
  'PHASES', 'phaseOf', 'cycle', 'PH', 'CLOCK', 'stateOf', 'applyState', 'syncUI', 'MESH', 'DRAWN', 'NET', 'DEFORM', 'CLIP',
  'LM', 'SL_N', 'SL_D', 'camera', 'renderer', 'CHAMBERS', 'PARTS', 'ANATOMY', 'VALVE_MODES', 'dirOf', 'angOf'].join(',');
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
const LM = S.LM;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
const finite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
const close = (a, b, e) => a.every((x, i) => Math.abs(x - b[i]) < e);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ======================================================================== */
section('RENDER  every moment of the beat, every setting');
{
  let thrown = 0, blank = 0, badCam = 0, badMesh = 0, badMarks = 0, frames = 0;
  const firstErr = [];
  const setLayers = on => S.LAYERS.forEach(L => { L.on = on(L); });
  const settings = [
    { name: 'as it opens', go() {} },
    { name: 'cut, frontal', go() { S.setSection(S.PRESETS[0].n, S.PRESETS[0].d); } },
    { name: 'valves held open, landmarks', go() { S.SHOW.valves = 'open'; S.SHOW.marks = true; } },
    { name: 'valves held shut, no squeeze', go() { S.SHOW.valves = 'shut'; S.SHOW.squeeze = false; } },
    { name: 'everything shown, wireframe, translucent vessels', go() { setLayers(() => true); S.SHOW.wire = true; S.SHOW.vo = 0.3; } },
    { name: 'nothing shown', go() { setLayers(() => false); } },
    { name: 'cut at an odd angle, no caps or ghost', go() { Object.assign(S.SEC, { on: true, az: 2.1, el: -0.7, mm: 13 }); S.SHOW.caps = S.SHOW.ghost = false; } },
    { name: 'cut, looking straight down', go() { Object.assign(S.SEC, { on: true, az: 0, el: Math.PI / 2, mm: -5 }); S.faceCut(); } }
  ];
  for (const st of settings) {
    S.applyState({ show: { squeeze: true, valves: 'beat', caps: true, ghost: true, outline: true, marks: false, wire: false, vo: 1 },
      sec: { on: false, az: 0, el: 0, mm: 0 }, cam: { dist: 0.42, az: 0.3, el: 0.14, look: LM.centre.slice() },
      layers: Object.fromEntries(S.LAYERS.map(L => [L.key, ['walls', 'papillary', 'leaflets', 'drawn', 'coronary', 'great'].includes(L.key)])) });
    st.go(); S.syncUI();
    for (let i = 0; i < 100; i++) {
      const phi = i / 100;
      const before = S.renderer.__renders;
      try { S.frame(phi); } catch (e) { thrown++; if (firstErr.length < 3) firstErr.push(st.name + ' φ=' + phi + ': ' + e.message); continue; }
      frames++;
      if (S.renderer.__renders !== before + 1) blank++;
      if (!finite(S.camera.position.toArray()) || !finite(S.camera.projectionMatrix.elements)) badCam++;
      if (i % 10 === 0) for (const Dm of S.DEFORM) if (!finite(Dm.M.geo.attributes.position.array)) { badMesh++; break; }
      if (S.SHOW.marks) {
        for (const P of S.POINTS) if (!finite(P.dot.position.toArray())) badMarks++;
        for (const G of S.RINGS) if (!finite(G.line.geometry.attributes.position.array)) badMarks++;
      }
    }
  }
  firstErr.forEach(e => console.log('      ' + e));
  console.log('    ' + frames + ' frames over ' + settings.length + ' settings');
  chk(thrown === 0, thrown + ' frames threw');
  chk(blank === 0, blank + ' frames did not draw');
  chk(badCam === 0, 'the camera went non-finite in ' + badCam + ' frames');
  chk(badMesh === 0, 'the beating heart went non-finite ' + badMesh + ' times');
  chk(badMarks === 0, 'a landmark went non-finite ' + badMarks + ' times');
}

/* ======================================================================== */
section('SECTION  any angle, and the story\'s planes exactly');
{
  /* the story's planes come back through turn/tilt/depth */
  const story = [['frontal', LM.cut.n, LM.cut.d], ['short axis', LM.short.n, LM.short.d], ['semilunar', S.SL_N, S.SL_D]];
  for (const [name, n, d] of story) {
    const P = S.PRESETS.find(p => p.n === n);
    chk(!!P && P.d === d, 'no preset is the story\'s ' + name + ' cut');
    S.setSection(n, d);
    chk(close(S.secN(), n, 1e-12) && Math.abs(S.secD() - d) < 1e-12, 'the ' + name + ' cut does not survive turn/tilt/depth');
  }
  /* every preset normal is a unit vector and the plane goes through the heart */
  for (const P of S.PRESETS) {
    chk(Math.abs(Math.hypot(...P.n) - 1) < 1e-9, P.label + ': normal is not a unit vector');
    chk(Math.abs(dot(P.n, LM.centre) - P.d) < 0.08, P.label + ': plane misses the heart');
  }
  const long = S.PRESETS.find(p => /Apex/.test(p.label));
  chk(Math.abs(dot(long.n, LM.apex) - long.d) < 1e-9 && Math.abs(dot(long.n, LM.tricuspid.c) - long.d) < 1e-9 && Math.abs(dot(long.n, LM.mitral.c) - long.d) < 1e-9,
    'the apex + AV rings plane does not go through all three');
  chk(long.n[1] > 0, 'the apex + AV rings plane is not seen from above');

  /* random planes: what is kept, flipping, the clip */
  const r = rng(7);
  let roundTrip = 0, flipBad = 0, keptBad = 0;
  for (let i = 0; i < 300; i++) {
    const n = nrm([r() - 0.5, r() - 0.5, r() - 0.5]), d = dot(n, LM.centre) + (r() - 0.5) * 0.1;
    S.setSection(n, d);
    if (!close(S.secN(), n, 1e-12) || Math.abs(S.secD() - d) > 1e-12) roundTrip++;
    S.frame(0.3);
    const p = LM.centre.map(x => x + (r() - 0.5) * 0.12);
    const kept = S.CLIP.distanceToPoint(new THREE.Vector3(...p)) >= 0;
    if (kept !== (dot(n, p) <= d)) keptBad++;
    S.flipSection();
    if (!close(S.secN(), n.map(x => -x), 1e-12) || Math.abs(S.secD() + d) > 1e-12) flipBad++;
    S.frame(0.3);
    const kept2 = S.CLIP.distanceToPoint(new THREE.Vector3(...p)) >= 0;
    if (Math.abs(dot(n, p) - d) > 1e-9 && kept2 === kept) flipBad++;
  }
  chk(roundTrip === 0, roundTrip + ' of 300 planes do not survive turn/tilt/depth');
  chk(keptBad === 0, 'the cut keeps the wrong side in ' + keptBad + ' of 300 planes (it should keep n.p <= d, as the story does)');
  chk(flipBad === 0, 'flipping is not the same plane with the other half kept, ' + flipBad + ' times');

  /* square to the view, then look at the cut */
  let sqBad = 0, faceBad = 0;
  for (let i = 0; i < 50; i++) {
    Object.assign(S.view, { az: (r() - 0.5) * 7, el: (r() - 0.5) * 3, dist: 0.2 + r() * 0.4, look: LM.centre.map(x => x + (r() - 0.5) * 0.04) });
    S.frame(0.5);
    S.squareToView();
    const toCam = nrm(sub(S.camera.position.toArray(), S.view.look));
    if (!close(S.secN(), toCam, 1e-6) || Math.abs(dot(S.secN(), S.view.look) - S.secD()) > 1e-9) sqBad++;
    S.SEC.mm += (r() - 0.5) * 30;
    S.faceCut(); S.frame(0.5);
    const toCam2 = nrm(sub(S.camera.position.toArray(), S.view.look));
    if (!close(toCam2, S.secN(), 1e-6) || Math.abs(dot(S.secN(), S.view.look) - S.secD()) > 1e-9) faceBad++;
  }
  chk(sqBad === 0, '"cut square to my view" is not square to the camera through the point it orbits, ' + sqBad + ' times');
  chk(faceBad === 0, '"look at the cut" does not look straight at the plane, ' + faceBad + ' times');
}

/* ======================================================================== */
section('LAYERS  the story\'s heart, and every mesh in one layer');
{
  const first = ['walls', 'papillary', 'leaflets', 'drawn', 'coronary', 'great'];
  let wrong = [];
  for (const name in S.MESH) {
    const L = S.layerOf(name);
    if (!L) { wrong.push(name + ' (no layer)'); continue; }
    if (first.includes(L.key) !== !!S.MESH[name].near) wrong.push(name + ' (in ' + L.key + ', near ' + !!S.MESH[name].near + ')');
  }
  chk(wrong.length === 0, 'the layers shown at first are not the story\'s heart: ' + wrong.slice(0, 4).join('; '));
  const count = {};
  for (const name in S.MESH) { const k = S.layerOf(name).key; count[k] = (count[k] || 0) + 1; }
  console.log('    ' + Object.entries(count).map(([k, n]) => k + ' ' + n).join(', ') + ', + ' + S.DRAWN.length + ' drawn flaps, ' + Object.keys(S.NET).length + ' merged vessel networks');
  for (const k of ['walls', 'leaflets', 'great', 'coronary']) chk(count[k] > 0, 'the ' + k + ' layer is empty');
  chk(count.walls === 4, 'the walls layer is not the four chambers');
}

/* ======================================================================== */
section('PICK  names what is drawn, never what is cut away');
{
  S.applyState({ sec: { on: false, az: 0, el: 0, mm: 0 }, cam: { dist: 0.42, az: 0, el: 0, look: LM.centre.slice() },
    layers: Object.fromEntries(S.LAYERS.map(L => [L.key, ['walls', 'papillary', 'leaflets', 'drawn', 'coronary', 'great'].includes(L.key)])) });
  S.syncUI(); S.frame(0.8);
  const front = S.pick(0, 0);
  chk(!!front && !!S.MESH[front.name] && S.MESH[front.name].near, 'a click on the middle of the heart, from the front, names no heart part (' + (front && front.name) + ')');
  console.log('    from the front: ' + (front && front.name));
  const r = rng(11);
  let cutAway = 0, named = 0, tries = 0;
  for (const P of S.PRESETS.slice(0, 4)) {
    S.setSection(P.n, P.d); S.faceCut(); S.syncUI(); S.frame(0.8);
    for (let i = 0; i < 12; i++) {
      const h = S.pick((r() - 0.5) * 0.6, (r() - 0.5) * 0.6); tries++;
      if (!h) continue;
      named++;
      if (dot(S.secN(), h.point) > S.secD() + 1e-5) cutAway++;
    }
  }
  chk(named > tries / 2, 'clicks on the cut heart mostly hit nothing (' + named + ' of ' + tries + ')');
  chk(cutAway === 0, cutAway + ' clicks named a part on the side that is cut away');
  S.showPick(front);
  chk(S.PICKED.visible && S.PICKED.geometry === S.MESH[front.name].geo, 'the picked part is not outlined with its own (beating) geometry');
}

/* ======================================================================== */
section('BEAT  the words agree with the valves');
{
  chk(S.PHASES[S.PHASES.length - 1].to === 1, 'the phases do not cover the whole beat');
  for (let i = 1; i < S.PHASES.length; i++) chk(S.PHASES[i].to > S.PHASES[i - 1].to, 'the phases are out of order');
  let bad = [], atriaN = 0, atriaOn = 0;
  for (let i = 0; i < 1000; i++) {
    const phi = i / 1000, P = S.phaseOf(phi), c = S.cycle(phi);
    /* inside a phase, away from where valves are still moving */
    const moving = [S.PH.avShut, S.PH.slOpen, S.PH.slShut, S.PH.avOpen].some(([a, b]) => phi >= a && phi < b);
    if (moving) continue;
    const allShut = /All four valves are shut/.test(P.sub), avOpen = /^Atrioventricular valves open/.test(P.sub), slOpen = /^Semilunar valves open/.test(P.sub);
    if (allShut && (c.av > 0 || c.sl > 0)) bad.push(phi + ' says all shut');
    if (avOpen && (c.av < 1 || c.sl > 0)) bad.push(phi + ' says AV open');
    if (slOpen && (c.sl < 1 || c.av > 0)) bad.push(phi + ' says semilunar open');
    if (/^Atria contract/.test(P.name)) { atriaN++; if (c.atria > 0) atriaOn++; }
    if (/pump blood out/.test(P.name) && c.vent === 0) bad.push(phi + ' says the ventricles pump');
  }
  /* the atria have relaxed a moment (0.005 of a beat) before the AV valves start to shut */
  chk(atriaOn > 0.9 * atriaN, 'the atria are contracting for only ' + atriaOn + ' of the ' + atriaN + ' moments said to be "Atria contract"');
  chk(bad.length === 0, 'the words for the beat disagree with it: ' + bad.slice(0, 4).join('; '));
  const ok = { beat: [0.6, 0.1], open: [1, 1], shut: [0, 0] };
  for (const k in ok) { const v = S.VALVE_MODES[k](S.cycle(0.3)); chk(k === 'beat' || (v.av === ok[k][0] && v.sl === ok[k][1]), 'valve mode ' + k + ' is wrong'); }
}

/* ======================================================================== */
section('VIEW  a copied view comes back');
{
  S.applyState({ phi: 0.37, playing: false, speed: 0.1, cam: { dist: 0.3, az: 1.2, el: -0.3, look: [0.01, 1.2, 0.02] },
    sec: { on: true, az: -2, el: 0.4, mm: 7.5 }, show: { valves: 'shut', marks: true }, layers: { lungs: true } });
  const a = JSON.stringify(S.stateOf());
  S.applyState(JSON.parse(a));
  chk(JSON.stringify(S.stateOf()) === a, 'a view does not come back as it was');
  const st = JSON.parse(a);
  chk(st.phi === 0.37 && st.playing === false && st.sec.mm === 7.5 && st.show.valves === 'shut' && st.layers.lungs === true, 'a view loses its settings');
  S.applyState({ show: { valves: 'nonsense' } });
  chk(S.SHOW.valves === 'beat', 'a bad valve mode in a pasted view is not refused');
}

/* ======================================================================== */
section('LICENCE');
{
  const credit = html.slice(html.indexOf('<div class="credit">'), html.indexOf('<div class="credit">') + 600);
  chk(/Z-Anatomy/.test(credit) && /CC BY-SA/.test(credit), 'the on-screen credit is missing');
  chk(/drawn in/.test(credit), 'the credit does not say what is drawn in');
  chk(/CC BY-SA 4\.0/.test(html.slice(0, 1500)), 'the licence note in the page head is missing');
  const kb = Buffer.byteLength(html) / 1024;
  chk(kb < 2000, 'the page is ' + kb.toFixed(0) + ' KB; keep it under 2 MB');
  console.log('    page ' + kb.toFixed(0) + ' KB');
}

console.log('\n' + checks + ' checks, ' + fails + ' failure' + (fails === 1 ? '' : 's'));
process.exit(fails ? 1 : 0);
