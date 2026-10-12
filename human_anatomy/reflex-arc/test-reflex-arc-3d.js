/* Tests for the 3D reflex arc story.
 *
 *   cd human_anatomy/reflex-arc && node test-reflex-arc-3d.js
 *
 * The page is run under the real three.js r128 it loads (the URL is read from
 * its own <script src>, and the copy particles/test-render.js keeps in
 * particles/.three-cache is reused), with only WebGLRenderer and
 * PMREMGenerator stubbed. Then:
 *
 *   RENDER    every frame of every chapter: nothing throws, the camera and
 *             the bent arm stay finite, every frame draws.
 *   ROUTES    the impulse's route was FOUND by searching the model's nerves;
 *             check it went where anatomy says: fingertip -> median nerve ->
 *             posterior root -> cord, and cord -> anterior root ->
 *             musculocutaneous nerve -> biceps, at one spinal level.
 *   THE ARC   nothing moves before the impulse reaches the muscle; the
 *             message to the brain leaves the cord, not the arm; where the
 *             brain is shown, it hears last; the forearm swings rigidly and
 *             forwards, lifting the hand off the plate; the biceps shortens
 *             and keeps its volume.
 *   WORDS     the lengths the captions quote are the routes' lengths.
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
const FILE = 'reflex-arc-3d.html';
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
const expose = ['frame', 'enterChapter', 'CH', 'camera', 'renderer', 'worldAt', 'RUNS', 'ROUTE', 'LM', 'FACTS', 'prog',
  'elbowAt', 'TH_MAX', 'bicepsShape', 'BI_L0', 'bent', 'swing', 'MESH', 'PARTS', 'DEFORM', 'ANATOMY', 'TUBES', 'COL',
  'FOREARM_BONE', 'PHASES', 'CUES', 'IMP', 'OUCH', 'shotAt'].join(',');
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
const finite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

/* ======================================================================== */
section('RENDER  every frame of every chapter');
/* Labels and impulses that are showing must be IN the picture: projected
   through the real camera, inside the frame and in front of it. This is the
   3D version of the 2D suite's "text drawn off the stage". The frame is the
   16:9 one resize() sets up for a 1280x720 stage. */
const offscreen = new Map();
function inView(obj, what, c, t) {
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  const camSpace = v.clone().applyMatrix4(S.camera.matrixWorldInverse);
  v.project(S.camera);
  if (camSpace.z > 0 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) {
    const k = 'chapter ' + c + ': ' + what;
    if (!offscreen.has(k)) offscreen.set(k, t.toFixed(1) + ' s (' + v.x.toFixed(2) + ', ' + v.y.toFixed(2) + ')');
  }
}
for (let c = 0; c < S.CH.length; c++) {
  S.enterChapter(c);
  const before = S.renderer.__renders;
  let bad = 0, t = 0;
  try {
    for (t = 0; t <= S.CH[c].len + 3; t += 1 / 30) {
      S.frame(t);
      const p = S.camera.position;
      if (!Number.isFinite(p.x + p.y + p.z)) bad++;
      /* only once the camera has settled from its opening move, and not
         while a fade hides everything */
      const shot = S.shotAt(S.CH[c], t);
      if (shot.fade > 0.05 || t < 3.2) continue;
      S.camera.updateMatrixWorld();
      for (const cu of S.CUES) {
        if (!cu.ch.includes(c) || !cu.obj.visible) continue;
        cu.obj.traverse(o => { if (o.isSprite) inView(o, 'label "' + o.userData.text + '"', c, t); });
      }
      for (const k in S.IMP) if (S.IMP[k].visible) inView(S.IMP[k].children[0], 'the ' + k + ' impulse', c, t);
      if (S.OUCH.visible) inView(S.OUCH, '"Ouch!"', c, t);
    }
  } catch (e) {
    chk(false, 'chapter ' + c + ' ("' + S.CH[c].title + '") threw at t=' + t.toFixed(2) + ': ' + e.message);
    console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
    continue;
  }
  chk(S.renderer.__renders - before >= Math.floor((S.CH[c].len + 3) * 30), 'chapter ' + c + ' missed frames');
  chk(bad === 0, 'chapter ' + c + ': ' + bad + ' non-finite camera positions');
  for (const Dm of S.DEFORM) if (!finite(Dm.mesh.geometry.attributes.position.array)) { chk(false, 'chapter ' + c + ': ' + Dm.mesh.name + ' went non-finite when bent'); break; }
  for (const T of S.TUBES) if (!finite(T.mesh.geometry.attributes.position.array)) { chk(false, 'chapter ' + c + ': a neurone tube went non-finite'); break; }
}
chk(offscreen.size === 0, 'shown but out of the picture:\n        ' + [...offscreen].map(([k, v]) => k + ' at ' + v).join('\n        '));
chk(S.worldAt(0, 5) === 'macro' && S.worldAt(3, 0.5) === 'macro' && S.worldAt(3, 6) === 'micro' && S.worldAt(4, 5) === 'micro' && S.worldAt(5, 5) === 'macro',
  'the chapters are not in the worlds the story says');
chk(S.CH.every(c => !/undefined|NaN/.test(c.text + c.title + (c.look || '') + (c.scale || ''))), 'a caption has "undefined" or NaN in it');

/* ======================================================================== */
section('ROUTES  found by searching the nerves');
const R = S.ROUTE;
const seq = poly => poly.parts.filter((p, i) => i === 0 || p !== poly.parts[i - 1]);
console.log('    sensory ' + R.sens.L.toFixed(3) + ' m: ' + seq(R.sens).join(' > '));
console.log('    motor   ' + R.motor.L.toFixed(3) + ' m: ' + seq(R.motor).join(' > '));
chk(d3(R.sens.pts[0], S.LM.tip) < 0.012, 'the sensory route does not start at the fingertip');
chk(R.sens.parts.includes('Median nerve.l'), 'the sensory route from a fingertip does not run in the median nerve');
chk(R.sens.parts.includes('Posterior root of spinal nerve.l') && !R.sens.parts.includes('Anterior root of spinal nerve.l'),
  'sensory neurones enter the cord by a POSTERIOR root');
chk(Math.abs(R.sens.pts[R.sens.pts.length - 1][0]) < 0.01, 'the sensory route does not end inside the spinal cord');
chk(R.motor.parts.includes('Anterior root of spinal nerve.l') && !R.motor.parts.includes('Posterior root of spinal nerve.l'),
  'motor neurones leave the cord by an ANTERIOR root');
chk(R.motor.parts.includes('Musculocutaneous nerve.l'), 'the motor route to the biceps does not run in the musculocutaneous nerve');
chk(d3(R.motor.pts[R.motor.pts.length - 1], S.LM.belly) < 1e-9, 'the motor route does not end in the biceps');
chk(Math.abs(R.motor.pts[0][1] - R.sens.pts[R.sens.pts.length - 1][1]) < 0.015, 'the impulse leaves the cord at a different level from where it came in');
chk(d3(R.relay.pts[0], R.sens.pts[R.sens.pts.length - 1]) < 1e-9 && d3(R.relay.pts[R.relay.pts.length - 1], R.motor.pts[0]) < 1e-9,
  'the relay neurone does not join the sensory neurone to the motor neurone');
chk(d3(R.up.pts[0], R.sens.pts[R.sens.pts.length - 1]) < 1e-9, 'the message to the brain does not leave from where the sensory neurone ends');
chk(d3(R.up.pts[R.up.pts.length - 1], S.LM.brainTop) < 1e-9, 'the message to the brain does not end in the brain');
for (let i = 1; i < R.up.pts.length; i++) if (R.up.pts[i][1] < R.up.pts[i - 1][1] - 0.002) { chk(false, 'the message to the brain goes down the cord'); break; }
chk(R.sens.L > 0.6 && R.sens.L < 1.2, 'the sensory route is ' + R.sens.L.toFixed(2) + ' m; fingertip to spine should be 0.6-1.2 m');
chk(R.motor.L > 0.2 && R.motor.L < R.sens.L, 'the motor route length is implausible: ' + R.motor.L.toFixed(2));

/* ======================================================================== */
section('THE ARC');
const shown = new Set(S.CH.filter(c => c.show && c.show.up && c.run).map(c => c.run));
for (const k in S.RUNS) {
  const run = S.RUNS[k], ph = run.ph;
  for (let i = 1; i < S.PHASES.length; i++)
    chk(Math.abs(ph[S.PHASES[i]].t0 - ph[S.PHASES[i - 1]].t1) < 1e-9, k + ': ' + S.PHASES[i] + ' does not follow ' + S.PHASES[i - 1]);
  for (let t = 0; t < ph.contract.t0; t += 0.01)
    if (S.elbowAt(run, t) !== 0) { chk(false, k + ': the elbow bends before the impulse reaches the biceps'); break; }
  chk(Math.abs(S.elbowAt(run, ph.contract.t1 + 0.01) - S.TH_MAX) < 1e-9, k + ': the elbow does not finish bending');
  chk(ph.up.t0 >= ph.syn1.t1 - 1e-9, k + ': the message to the brain sets off before the impulse reaches the cord');
  if (shown.has(k)) chk(ph.feel.t1 > ph.contract.t1, k + ': "Ouch" comes before the hand has moved');
}
/* the hand: forwards and up, off the plate */
const tip1 = S.bent(S.LM.tip, S.TH_MAX);
chk(tip1[1] > S.LM.plateY + 0.15, 'the fingertip does not lift well clear of the plate (' + (tip1[1] - S.LM.plateY).toFixed(3) + ' m)');
chk(tip1[2] > S.LM.tip[2] + 0.15, 'the forearm swings backwards; flexing the elbow brings it forwards');
chk(Math.abs(d3(tip1, S.LM.pivot) - d3(S.LM.tip, S.LM.pivot)) < 1e-9, 'the forearm changes length as it swings');
/* rigid forearm bones, untouched upper arm */
S.enterChapter(5);
S.frame(S.RUNS.motor.ph.contract.t1 + 0.5);
const rad = S.MESH['Radius.l'].geometry.attributes.position.array, radB = S.PARTS['Radius.l'].pos;
let rigid = true;
for (let i = 0; i < radB.length; i += 3) {
  const w = S.swing([0, 0, 0], radB[i], radB[i + 1], radB[i + 2], S.TH_MAX);
  if (d3(w, [rad[i], rad[i + 1], rad[i + 2]]) > 1e-6) { rigid = false; break; }
}
chk(rigid, 'the radius does not swing rigidly with the elbow');
const hum = S.MESH['Humerus.l'].geometry.attributes.position.array, humB = S.PARTS['Humerus.l'].pos;
let still = true;
for (let i = 0; i < humB.length; i++) if (Math.abs(hum[i] - humB[i]) > 1e-9) { still = false; break; }
chk(still, 'the humerus moves when the elbow bends');
chk(S.DEFORM.every(Dm => !/^(Humerus|Scapula|Clavicle)/.test(Dm.mesh.name)), 'an upper-arm bone is set to bend');
chk(['Radius.l', 'Ulna.l', 'Median nerve.l'].every(n => S.DEFORM.some(Dm => Dm.mesh.name === n)), 'the radius, ulna or median nerve does not move with the forearm');
chk(!S.DEFORM.some(Dm => /^Hip bone/.test(Dm.mesh.name)), 'the hip bone moves with the elbow');
/* the biceps */
const b0 = S.bicepsShape(0), b1 = S.bicepsShape(S.TH_MAX);
chk(Math.abs(b0.L - S.BI_L0) < 1e-9, 'the biceps rest length is wrong');
chk(b1.L < b0.L * 0.95, 'the biceps does not shorten as the elbow bends');
chk(Math.abs(b1.fat * b1.fat * b1.L - b0.fat * b0.fat * b0.L) < 1e-9, 'the biceps changes volume as it contracts');

/* ======================================================================== */
section('WORDS');
chk(S.FACTS.sensoryM === R.sens.L.toFixed(1) && S.FACTS.motorM === R.motor.L.toFixed(1), 'FACTS are not the route lengths');
chk(S.CH[2].text.includes('about <b>' + S.FACTS.sensoryM + ' m</b>'), 'chapter 3 does not quote the sensory route length');
chk(S.CH[5].text.includes('about <b>' + S.FACTS.motorM + ' m</b>'), 'chapter 6 does not quote the motor route length');

/* ======================================================================== */
section('LICENCE');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'anatomy', 'licence-rules.json'), 'utf8'));
chk(S.ANATOMY.licence === rules.licence && S.ANATOMY.attribution === rules.attribution, 'the packed licence is not the current one; re-pack');
chk(/Z-Anatomy/.test(html.slice(html.indexOf('<div class="credit">'), html.indexOf('<div class="credit">') + 600)) && /CC BY-SA/.test(html), 'the on-screen credit is missing');
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
