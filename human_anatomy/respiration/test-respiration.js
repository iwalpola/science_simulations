/* Tests for the respiration story.
 *
 *   cd human_anatomy/respiration && node test-respiration.js
 *
 * The page is run under the real three.js r128 it loads (the URL is read from
 * its own <script src>, and the copy particles/test-render.js keeps in
 * particles/.three-cache is reused), with the real ../../cell_biology/
 * organelles.js, and with only WebGLRenderer and PMREMGenerator stubbed.
 * Then:
 *
 *   RENDER     every frame of every chapter: nothing throws, the camera stays
 *              finite, every frame draws; every label that is showing is in
 *              the picture and not under the equation bar, the key or the
 *              buttons, on the narrowest stage the side panel leaves.
 *   FOOD       the route was found through the model: mouth, pharynx,
 *              oesophagus, in at the cardia, through the stomach, out at the
 *              pylorus, round the duodenum, into the small intestine; the
 *              stretches through the stomach and duodenum stay inside them.
 *   AIR        the route was searched through the model's bronchi: nose,
 *              pharynx, larynx, trachea, right main bronchus, intermediate
 *              bronchus, middle lobar bronchus, the lateral segmental
 *              bronchus, then the drawn bronchioles to an alveolus, ending
 *              inside the right lung's middle lobe. Every drawn bronchiole
 *              is inside a lobe and narrower than the branch it came from.
 *   DIFFUSION  the three walls: the run is the same every time; nothing
 *              leaves the box; glucose goes into the blood in the gut and
 *              into the cell in the muscle; oxygen into the blood in the
 *              lung and out of it in the muscle; carbon dioxide the other
 *              way; red cells hold oxygen only in the blood; oxygen becomes
 *              carbon dioxide only at a mitochondrion. These are CHECKED on
 *              the run, not set: each molecule only ever takes random steps.
 *   REACTION   the equation balances, every atom on the left goes to exactly
 *              one place on the right with the same element, and the atoms
 *              start and finish where the molecules are drawn.
 *   WORDS      no caption says undefined or NaN; the figures it quotes are
 *              the measured ones.
 *   LICENCE    the packed anatomy is the manifest's, carries its licence, and
 *              holds no part the licence rules block.
 *
 * Whether it LOOKS right is for a browser.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname, ROOT = path.resolve(HERE, '..', '..');
const FILE = 'respiration.html';
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
/* the shared organelles, read out of the page's own <script src> */
function organelles(THREE) {
  const m = html.match(/<script src="([^"]*organelles\.js)"><\/script>/);
  if (!m) return null;
  const win = {};
  new Function('THREE', 'window', fs.readFileSync(path.resolve(HERE, m[1]), 'utf8'))(THREE, win);
  return win.Organelles;
}

/* --- just enough browser ------------------------------------------------- */
const STAGE_W = 920, STAGE_H = 720;      // a 1280 x 720 screen, less the 360 px side panel
function dom() {
  const els = new Map();
  const ctx2d = () => ({
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    measureText(s) { return { width: String(s).length * 26 }; }, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, ellipse() {}
  });
  function mk(id) {
    return {
      id, width: 300, height: 150, innerHTML: '', textContent: '', hidden: false, dataset: {},
      style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, appendChild() {}, setPointerCapture() {},
      clientWidth: STAGE_W, clientHeight: STAGE_H, title: '',
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
const ORG = organelles(THREE);
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const expose = ['frame', 'enterChapter', 'CH', 'camera', 'renderer', 'worldAt', 'shotAt', 'ROUTE', 'LM', 'FACTS', 'TREE', 'BRONCH',
  'SIM', 'WALLS', 'rbcAt', 'runDiffusion', 'RX', 'RXT', 'EQN', 'MOL', 'BAL', 'EL', 'CUES', 'BOLUS', 'AIR_PUFF', 'solid', 'insideOf',
  'LOBES', 'ANATOMY', 'S_FOOD', 'S_AIR', 'FOOD1', 'FOOD2', 'AIR1', 'GEN', 'TARGET_BRONCHUS', 'CELLW', 'updateReaction', 'KEY',
  'SAC_R', 'polyOf', 'part', 'GUTW', 'LUNGW', 'VG', 'MAT', 'GROUP', 'LOOK'].join(',');
let S;
const t0 = Date.now();
try {
  S = new Function('THREE', 'Organelles', 'document', 'window', 'performance', 'requestAnimationFrame', 'atob',
    js + '\nreturn {' + expose + '};')(
    THREE, ORG, D, { addEventListener() {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
    { now() { return 0; } }, () => 0, s => Buffer.from(s, 'base64').toString('latin1'));
} catch (e) {
  console.log('    ✗ the page threw while loading: ' + e.message);
  console.log((e.stack || '').split('\n').slice(1, 4).join('\n'));
  process.exit(1);
}
console.log('    page built in ' + ((Date.now() - t0) / 1000).toFixed(2) + ' s (node)');
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

/* ======================================================================== */
section('RENDER  every frame of every chapter');
/* A label's rectangle, projected through the real camera, must sit inside
   the frame and clear of the HTML laid over the stage: the equation bar
   across the top middle, the key below it on the right, the buttons along
   the bottom middle. (Their sizes, in NDC, for the 920 x 720 stage.) */
const BLOCKED = [
  { name: 'the equation bar', x0: -0.6, x1: 0.6, y0: 0.76, y1: 1 },
  { name: 'the key', x0: 0.54, x1: 1, y0: 0.42, y1: 0.76 },
  { name: 'the buttons', x0: -0.48, x1: 0.48, y0: -1, y1: -0.8 }
];
const problems = new Map();
function note(k, v) { if (!problems.has(k)) problems.set(k, v); }
function rectOf(spr) {
  const v = new THREE.Vector3();
  spr.getWorldPosition(v);
  const cs = v.clone().applyMatrix4(S.camera.matrixWorldInverse);
  if (cs.z > -1e-6) return null;
  const p = v.clone().project(S.camera);
  const s = new THREE.Vector3(); spr.getWorldScale(s);
  const h = 2 * -cs.z * Math.tan(S.camera.fov * Math.PI / 360), w = h * S.camera.aspect;
  return { x: p.x, y: p.y, hw: s.x / w, hh: s.y / h };
}
function checkLabel(spr, c, t) {
  const what = 'chapter ' + c + ': "' + spr.userData.text + '"';
  const r = rectOf(spr);
  if (!r) return note(what, 'behind the camera at ' + t.toFixed(1) + ' s');
  if (r.x - r.hw < -1.02 || r.x + r.hw > 1.02 || r.y - r.hh < -1.02 || r.y + r.hh > 1.02)
    return note(what, 'off the edge at ' + t.toFixed(1) + ' s (x ' + (r.x - r.hw).toFixed(2) + '..' + (r.x + r.hw).toFixed(2) + ', y ' + (r.y - r.hh).toFixed(2) + '..' + (r.y + r.hh).toFixed(2) + ')');
  for (const B of BLOCKED)
    if (r.x + r.hw > B.x0 && r.x - r.hw < B.x1 && r.y + r.hh > B.y0 && r.y - r.hh < B.y1)
      return note(what, 'under ' + B.name + ' at ' + t.toFixed(1) + ' s (x ' + r.x.toFixed(2) + ', y ' + r.y.toFixed(2) + ')');
  if (r.hh * 2 * STAGE_H < 11) note(what, 'too small to read: ' + (r.hh * 2 * STAGE_H).toFixed(0) + ' px high at ' + t.toFixed(1) + ' s');
}
function checkMarker(spr, what, c, t) {
  const r = rectOf(spr);
  if (!r || Math.abs(r.x) > 1 || Math.abs(r.y) > 1) note('chapter ' + c + ': ' + what, 'out of the picture at ' + t.toFixed(1) + ' s');
}
const WORLDS_SEEN = [];
for (let c = 0; c < S.CH.length; c++) {
  S.enterChapter(c);
  const before = S.renderer.__renders;
  let bad = 0, t = 0;
  const seen = new Set();
  try {
    for (t = 0; t <= S.CH[c].len + 3; t += 1 / 30) {
      S.frame(t);
      const p = S.camera.position;
      if (!Number.isFinite(p.x + p.y + p.z)) bad++;
      const shot = S.shotAt(S.CH[c], t);
      seen.add(shot.world);
      if (shot.fade > 0.05 || t - shot.t0 < 0.6) continue;
      S.camera.updateMatrixWorld();
      for (const cu of S.CUES) {
        if (!cu.ch.includes(c) || !cu.obj.visible) continue;
        let p0 = cu.obj; while (p0.parent && p0.visible) p0 = p0.parent;
        if (!p0.visible) continue;                      // its world is not the one on screen
        cu.obj.traverse(o => { if (o.isSprite && o.userData.text && o.material.opacity > 0.3) checkLabel(o, c, t); });
      }
      if (S.BOLUS.visible && S.BOLUS.parent.visible) checkMarker(S.BOLUS, 'the food', c, t);
      if (S.AIR_PUFF.visible && S.AIR_PUFF.parent.visible) checkMarker(S.AIR_PUFF, 'the air', c, t);
    }
  } catch (e) {
    chk(false, 'chapter ' + c + ' ("' + S.CH[c].title + '") threw at t=' + t.toFixed(2) + ': ' + e.message);
    console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
    continue;
  }
  WORLDS_SEEN.push([...seen]);
  chk(S.renderer.__renders - before >= Math.floor((S.CH[c].len + 3) * 30), 'chapter ' + c + ' missed frames');
  chk(bad === 0, 'chapter ' + c + ': ' + bad + ' non-finite camera positions');
}
chk(problems.size === 0, 'labels or markers out of place:\n        ' + [...problems].map(([k, v]) => k + ' ' + v).join('\n        '));
const want = [['macro'], ['macro'], ['macro'], ['villi'], ['gut'], ['macro'], ['alv'], ['lung'], ['macro', 'cell'], ['react']];
want.forEach((w, c) => chk(WORLDS_SEEN[c] && w.join() === WORLDS_SEEN[c].join(), 'chapter ' + c + ' shows ' + (WORLDS_SEEN[c] || []).join('+') + ', not ' + w.join('+')));
chk(S.CH.every(c => !/undefined|NaN/.test(c.text + c.title + (c.look || '') + (c.scale || '') + JSON.stringify(c.terms))), 'a caption has "undefined" or NaN in it');
chk(S.CH.every(c => c.key.every(k => S.KEY[k])), 'a chapter asks for a key entry that does not exist');
/* each chapter sets how solid each group of the body is through its
   material, so no two groups may share one */
const owner = new Map();
for (const g in S.GROUP) for (const m of S.GROUP[g]) {
  if (owner.has(m.material) && owner.get(m.material) !== g) chk(false, 'groups "' + owner.get(m.material) + '" and "' + g + '" share a material');
  owner.set(m.material, g);
}
chk(S.CH.every(c => !c.view || S.LOOK[c.view]), 'a chapter asks for a view that does not exist');
chk(S.CH.every(c => c.eq.length && c.eq.every(k => ['glucose', 'oxygen', 'co2', 'water', 'energy'].includes(k))), 'a chapter lights a part of the equation that is not there');

/* ======================================================================== */
section('FOOD  the route through the gut');
const F = S.ROUTE.food;
const seq = poly => poly.parts.filter((p, i) => i === 0 || p !== poly.parts[i - 1]);
console.log('    ' + F.L.toFixed(2) + ' m: ' + seq(F).join(' > '));
chk(seq(F).join(' > ') === 'mouth > pharynx > Oesophagus > Stomach > Duodenum > Jejunum', 'the food does not go mouth > pharynx > oesophagus > stomach > duodenum > small intestine');
const stoS = S.solid('Stomach'), duoS = S.solid('Duodenum');
const inStomach = F.pts.filter((p, i) => F.parts[i] === 'Stomach'), inDuo = F.pts.filter((p, i) => F.parts[i] === 'Duodenum');
chk(inStomach.length > 10 && inStomach.every(p => S.insideOf(stoS, p)), 'the route through the stomach leaves it: ' + inStomach.filter(p => !S.insideOf(stoS, p)).length + ' of ' + inStomach.length + ' points outside');
chk(inDuo.length > 10 && inDuo.slice(1).every(p => S.insideOf(duoS, p)), 'the route through the duodenum leaves it: ' + inDuo.slice(1).filter(p => !S.insideOf(duoS, p)).length + ' of ' + inDuo.length + ' points outside');
const oesEnd = F.pts[F.parts.lastIndexOf('Oesophagus')];
chk(d3(oesEnd, S.LM.cardia) < 0.012, 'the oesophagus does not end at the cardia (' + (d3(oesEnd, S.LM.cardia) * 1000).toFixed(0) + ' mm)');
chk(d3(F.pts[F.parts.indexOf('Duodenum')], S.LM.pylorus) < 0.006, 'the food does not leave the stomach through the pylorus');
chk(S.LM.pylorus[1] < S.LM.cardia[1] && S.LM.pylorus[0] < S.LM.cardia[0], 'the pylorus is not below and to the right of the cardia');
chk(d3(F.pts[F.parts.lastIndexOf('Duodenum')], S.LM.jejStart) < 0.012, 'the duodenum does not lead into the small intestine');
/* where one organ hands over to the next there is no gap (a thinned
   centreline's straight stretches can be long; a gap between organs cannot) */
for (let i = 1; i < F.pts.length; i++) if (F.parts[i] !== F.parts[i - 1])
  chk(d3(F.pts[i - 1], F.pts[i]) < 0.012, 'a ' + (d3(F.pts[i - 1], F.pts[i]) * 1000).toFixed(0) + ' mm gap between ' + F.parts[i - 1] + ' and ' + F.parts[i]);
chk(S.LM.lips[2] > S.LM.oroBack[2] + 0.03, 'the mouth is not in front of the throat');
chk(Number(S.FACTS.gutM) > 1 && Number(S.FACTS.gutM) < 8, 'the small intestine is ' + S.FACTS.gutM + ' m');
/* the timelines: forwards only, and each chapter's stays where its text says */
for (const [name, f, len] of [['chapter 2', S.FOOD1, 16], ['chapter 3', S.FOOD2, 16], ['chapter 6', S.AIR1, 16]]) {
  let back = false; for (let t = 0; t < len; t += 0.05) if (f(t + 0.05) < f(t) - 1e-9) back = true;
  chk(!back, name + ': the food or air goes backwards');
}
chk(F.parts[0] === 'mouth' && d3(F.pts[0], S.LM.lips) < 1e-9, 'the food does not start at the lips');
const endOf1 = S.FOOD1(16);
chk(endOf1 > S.S_FOOD.cardia && endOf1 < S.S_FOOD.pylorus, 'chapter 2 does not end with the food in the stomach');
chk(S.FOOD2(0) === endOf1, 'chapter 3 does not pick the food up where chapter 2 left it');
chk(S.FOOD2(16) > S.S_FOOD.jej, 'chapter 3 does not take the food into the small intestine');

/* ======================================================================== */
section('AIR  the route through the airways');
const A = S.ROUTE.air;
console.log('    ' + A.L.toFixed(3) + ' m: ' + seq(A).join(' > '));
const aseq = seq(A);
const wantAir = ['nose', 'pharynx', 'larynx', 'Trachea', 'Right main bronchus', 'Intermediate bronchus.r', 'Middle lobar bronchus.r', S.TARGET_BRONCHUS, 'bronchiole', 'alveoli'];
chk(aseq.join(' > ') === wantAir.join(' > '), 'the air does not go nose > pharynx > larynx > trachea > right main bronchus > intermediate bronchus > middle lobar bronchus > lateral segmental bronchus > bronchioles > alveoli');
let ajump = 0; for (let i = 1; i < A.pts.length; i++) if (A.parts[i] !== A.parts[i - 1]) ajump = Math.max(ajump, d3(A.pts[i - 1], A.pts[i]));
chk(ajump < 0.012, 'the air route jumps ' + (ajump * 1000).toFixed(1) + ' mm between two points');
const trach = A.pts.filter((p, i) => A.parts[i] === 'Trachea');
chk(trach.slice(1).every(p => S.insideOf(S.solid('Trachea'), p)), 'the route down the trachea leaves it');
const mid = S.solid('Middle lobe of right lung');
chk(S.insideOf(mid, A.pts[A.pts.length - 1]), 'the air does not end inside the right lung’s middle lobe');
chk(S.LM.nostril[2] > S.LM.trachTop[2] + 0.05 && S.LM.nostril[1] > S.LM.trachTop[1], 'the nostril is not above and in front of the trachea');
chk(S.LM.carina[1] < S.LM.trachTop[1] - 0.06, 'the carina is not well below the top of the trachea');
/* the bronchi narrow as the air goes down them */
const rs = A.rad.filter((r, i) => /bronch/i.test(A.parts[i]));
chk(rs[rs.length - 1] < rs[0] * 0.5, 'the bronchi do not get narrower on the way down');
chk(S.FACTS.atlasForks >= 4 && S.FACTS.atlasForks <= 8, 'the route takes ' + S.FACTS.atlasForks + ' forks through the model; trachea to a segmental bronchus is 4 to 6');
/* the grown tree */
const lobes = S.LOBES.map(S.solid);
const inLung = p => lobes.some(L => S.insideOf(L, p));
chk(S.BRONCH.tips.length > 30, 'only ' + S.BRONCH.tips.length + ' tips of the bronchial tree found');
chk(S.TREE.segs.every(s => inLung(s.b)), 'a drawn bronchiole ends outside the lungs');
chk(S.TREE.sacs.length > S.BRONCH.tips.length * 2, 'too few alveolar sacs: ' + S.TREE.sacs.length);
chk(S.TREE.segs.every(s => s.gen < S.GEN), 'the tree grows past GEN');
for (let g = 1; g < S.GEN; g++) {
  const a = S.TREE.segs.filter(s => s.gen === g - 1), b = S.TREE.segs.filter(s => s.gen === g);
  const mean = (L, f) => L.reduce((x, s) => x + f(s), 0) / L.length;
  chk(mean(b, s => s.r) < mean(a, s => s.r) && mean(b, s => d3(s.a, s.b)) < mean(a, s => d3(s.a, s.b)), 'generation ' + g + ' is not narrower and shorter than generation ' + (g - 1));
}
console.log('    ' + S.BRONCH.tips.length + ' tips in the atlas, ' + S.TREE.segs.length + ' drawn bronchioles, ' + S.TREE.sacs.length + ' sacs');

/* ======================================================================== */
section('DIFFUSION  the three walls');
for (const k of ['gut', 'lung', 'cell']) {
  const W = S.WALLS[k], R = S.SIM[k], st = R.stat;
  const again = S.runDiffusion(W);
  let same = again.pos.length === R.pos.length;
  for (let i = 0; same && i < R.pos.length; i += 97) if (again.pos[i] !== R.pos[i]) same = false;
  chk(same, k + ': two runs differ');
  let out = 0, boundOut = 0;
  for (let f = 0; f <= R.F; f++) for (let i = 0; i < R.N; i++) {
    const o = f * R.N + i, x = R.pos[o * 3], y = R.pos[o * 3 + 1], z = R.pos[o * 3 + 2];
    if (Math.abs(x) > W.X + W.pad + 0.5 || y > W.Ytop + 1e-6 || y < -W.Ybot - 1e-6 || Math.abs(z) > W.Z + W.rbcT + 0.01) out++;
    if (R.bnd[o] >= 0 && y > W.mem[0]) boundOut++;
  }
  chk(out === 0, k + ': ' + out + ' molecule-frames outside the box');
  chk(boundOut === 0, k + ': a red cell holds a molecule outside the blood');
  const name = W.species;
  const net = name.map((n, j) => st.down[j] - st.up[j]);
  console.log('    ' + k + ': ' + name.map((n, j) => n + ' crossed down ' + st.down[j] + ', up ' + st.up[j]).join('; ') +
    (st.bound ? '; picked up by red cells ' + st.bound : '') + (st.released ? '; let go ' + st.released : '') +
    (W.mito ? '; used at mitochondria: ' + name.map((n, j) => n + ' ' + st.used[j]).join(', ') : ''));
  /* how many sit where, averaged over the second half of the run */
  const mean = (sp, test) => { let c = 0, n = 0; for (let f = R.F >> 1; f <= R.F; f++, n++) for (let i = 0; i < R.N; i++) { const o = f * R.N + i; if (R.spc[o] === sp && test(R.pos[o * 3 + 1], R.bnd[o])) c++; } return c / n; };
  const above = sp => mean(sp, y => y > W.mem[1]) / (W.Ytop - W.mem[1]);
  const below = sp => mean(sp, (y, b) => y < W.mem[0] && b < 0) / (W.Ybot + W.mem[0]);
  if (k === 'gut') {
    chk(net[0] > 20, 'gut: glucose does not go into the blood overall (' + net[0] + ')');
    chk(above(0) > below(0), 'gut: there is not more glucose in the gut than in the plasma');
  }
  if (k === 'lung') {
    chk(net[0] > 20, 'lung: oxygen does not go into the blood overall (' + net[0] + ')');
    chk(net[1] < -10, 'lung: carbon dioxide does not come out of the blood overall (' + net[1] + ')');
    chk(st.bound > 20, 'lung: the red cells do not pick oxygen up');
    chk(st.used[1] > 5, 'lung: no carbon dioxide is breathed out');
    chk(above(0) > below(0), 'lung: there is not more oxygen in the air than free in the plasma');
    chk(below(1) > above(1), 'lung: there is not more carbon dioxide in the plasma than in the air');
  }
  if (k === 'cell') {
    chk(net[0] < -10, 'cell: oxygen does not go into the cell overall (' + net[0] + ')');
    chk(net[2] < -5, 'cell: glucose does not go into the cell overall (' + net[2] + ')');
    chk(net[1] > 5, 'cell: carbon dioxide does not come out of the cell overall (' + net[1] + ')');
    chk(st.released > 20, 'cell: the red cells do not let their oxygen go');
    chk(st.used[0] > 10 && st.used[2] > 2, 'cell: the mitochondria use too little oxygen or glucose');
    /* oxygen becomes carbon dioxide only at a mitochondrion */
    let wrong = 0;
    for (let f = 1; f <= R.F; f++) for (let i = 0; i < R.N; i++) {
      const o = f * R.N + i, o0 = (f - 1) * R.N + i;
      if (R.spc[o0] === 0 && R.spc[o] === 1) {
        const p = [R.pos[o * 3], R.pos[o * 3 + 1], R.pos[o * 3 + 2]];
        if (!W.mito.some(m => d3(m, p) < W.mitoR + 0.25)) wrong++;
      }
    }
    chk(wrong === 0, 'cell: ' + wrong + ' oxygen molecules turned into carbon dioxide away from a mitochondrion');
  }
}
/* the red cells move with the blood and only forwards */
for (const k of ['gut', 'lung', 'cell']) {
  const W = S.WALLS[k];
  let okR = true;
  for (let j = 0; j < W.rbc.length; j++) for (let t = 0; t < W.T; t += 0.1) {
    const a = S.rbcAt(W, j, t), b = S.rbcAt(W, j, t + 0.1);
    if (a.lap === b.lap && b.x < a.x) okR = false;
    if (a.y > W.mem[0] - W.rbcR * 0.5 || a.y < -W.Ybot + W.rbcR * 0.5) okR = false;
  }
  chk(okR, k + ': a red cell goes backwards or out of the capillary');
}
/* the mitochondria in the muscle cell are organelles.js's own */
chk(!!ORG, 'the page does not load ../../cell_biology/organelles.js');
if (ORG) {
  let mitos = 0;
  S.CELLW.g.traverse(o => { if (o.material === ORG.materials.mitochondrion && o.children.some(c => c.material === ORG.materials.cristae)) mitos++; });
  chk(mitos === S.WALLS.cell.mito.length, 'the muscle cell’s mitochondria are not organelles.js’s (' + mitos + ')');
}

/* ======================================================================== */
section('REACTION  the atoms');
const count = side => { const c = {}; for (const [k, n] of S.EQN[side]) for (const [el] of S.MOL[k].atoms) c[el] = (c[el] || 0) + n; return c; };
const L = count('lhs'), Rr = count('rhs');
console.log('    left ' + JSON.stringify(L) + ', right ' + JSON.stringify(Rr));
chk(['C', 'H', 'O'].every(e => L[e] === Rr[e]) && Object.keys(L).length === 3, 'the equation does not balance');
chk(L.C === 6 && L.H === 12 && L.O === 18, 'glucose + 6 O2 is not C6 H12 O18');
const glu = {}; for (const [el] of S.MOL.GLU.atoms) glu[el] = (glu[el] || 0) + 1;
chk(glu.C === 6 && glu.H === 12 && glu.O === 6, 'the glucose molecule is not C6H12O6: ' + JSON.stringify(glu));
chk(new Set(S.RX.MAP).size === S.RX.MAP.length && S.RX.MAP.length === S.RX.R.length, 'two atoms go to the same place, or one place is left empty');
chk(S.RX.MAP.every((j, i) => S.RX.R[j].el === S.RX.L[i].el), 'an atom changes element');
S.enterChapter(9);
S.updateReaction(0);
chk(S.RX.meshes.every((m, i) => d3(m.position.toArray(), S.RX.L[i].p) < 0.08), 'the atoms do not start where the reactants are drawn');
S.updateReaction(S.RXT.done + 0.1);
chk(S.RX.meshes.every((m, i) => d3(m.position.toArray(), S.RX.R[S.RX.MAP[i]].p) < 1e-6), 'the atoms do not end where the products are drawn');
chk(S.RXT.done < S.CH[9].len, 'the reaction is not over before the chapter ends');
/* atoms in one molecule do not sit on top of each other */
for (const k in S.MOL) {
  const at = S.MOL[k].atoms;
  let close = Infinity;
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) close = Math.min(close, Math.hypot(at[i][1] - at[j][1], at[i][2] - at[j][2], at[i][3] - at[j][3]));
  chk(close > 0.35, k + ': two atoms are ' + close.toFixed(2) + ' apart');
}

/* ======================================================================== */
section('WORDS');
chk(S.FACTS.gutM === S.polyOf(S.LM.jej.pts).L.toFixed(1), 'the small intestine length quoted is not the model’s');
chk(S.CH[2].scale.includes(S.FACTS.gutM + ' m'), 'chapter 3 does not quote the model’s small intestine length');
chk(S.CH[1].look.includes(S.FACTS.oesCm + ' cm'), 'chapter 2 does not quote the oesophagus length');
chk(S.CH[9].text.includes(S.BAL.lhs.C + ' carbon, ' + S.BAL.lhs.H + ' hydrogen and ' + S.BAL.lhs.O + ' oxygen'), 'chapter 10 does not quote the atom counts');
chk(S.CH[5].scale.includes(S.FACTS.alvX + ' times'), 'chapter 6 does not quote how much too big the alveoli are');
/* "produce" or "make" energy is the commonest mistake there is about respiration */
chk(S.CH.every(c => !/(produc|mak|creat)\w* (the )?energy|energy (is )?(produced|made|created)/i.test(c.text + c.look + c.scale)), 'a caption says energy is produced or made; it is transferred');
/* every number in a caption is one of the measured ones, or a count from the equation */
chk(['gut', 'lung', 'cell'].every(k => S.WALLS[k].fps * S.WALLS[k].sub === S.FACTS.stepsPerS), 'the steps a second quoted are not the walls’ own');
const allowed = new Set([S.FACTS.gutM, String(S.FACTS.oesCm), String(S.FACTS.drawnGen), String(S.FACTS.alvX), String(S.FACTS.stepsPerS), String(S.FACTS.atlasForks), '6', '12', '18', '23', '1', '2']);
for (const c of S.CH) {
  const txt = (c.text + ' ' + c.look + ' ' + c.scale).replace(/<[^>]+>/g, ' ');
  for (const n of txt.match(/\d+(\.\d+)?/g) || []) chk(allowed.has(n), 'chapter "' + c.title + '" quotes ' + n + ', which is not measured or from the equation');
}

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
