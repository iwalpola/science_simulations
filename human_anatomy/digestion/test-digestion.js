/* Tests for the digestion story.
 *
 *   cd human_anatomy/digestion && node test-digestion.js
 *
 * The page is run under the real three.js r128 it loads (the URL is read from
 * its own <script src>, and the copy particles/test-render.js keeps in
 * particles/.three-cache is reused), with the real ../../cell_biology/
 * organelles.js, and with only WebGLRenderer and PMREMGenerator stubbed.
 * Then:
 *
 *   RENDER    every frame of every chapter: nothing throws, the camera stays
 *             finite, every frame draws; every label that is showing is in
 *             the picture and not under the bar, the key or the buttons, on
 *             the narrowest stage the side panel leaves.
 *   FOOD      the route was found through the model: mouth, pharynx,
 *             oesophagus, stomach, duodenum, small intestine, then up, across
 *             and down the colon; the stretches through the stomach and
 *             duodenum stay inside them, and through the colon stay in the
 *             middle of the tube, with wall all round.
 *   DUCTS     saliva runs from each gland to the mouth; the bile duct runs
 *             from the liver to the duodenum, and the gall bladder hangs off
 *             it; the pancreatic duct runs through the pancreas from its tail
 *             to its head, where it meets the bile duct.
 *   ENZYMES   every bond that is cut is cut by an enzyme docked on it at that
 *             moment, whose active site is the shape of the blocks either
 *             side; the docked substrate sits inside the pocket and not
 *             through it; maltase only ever splits a maltose and sucrase a
 *             sucrose, amylase only a starch chain; two enzymes never crowd
 *             the same stretch of chain; in the small intestine every bond is
 *             cut by the end; in the lock and key the miss and the denatured
 *             enzyme cut nothing.
 *   EMULSION  every split keeps the volume; the surface quoted is worked out
 *             from the droplets' radii; the lipase at work follows the
 *             surface; the final droplets do not overlap.
 *   TESTS     each tube ends the colour its test says; Benedict's changes only
 *             while it is heated, through green, yellow and orange to red.
 *   WORDS     no caption says undefined or NaN; the figures it quotes are the
 *             measured ones; bile is never said to digest anything.
 *   LICENCE   the packed anatomy is the manifest's, carries its licence, and
 *             holds no part the licence rules block.
 *   CATALOGUE the page is listed in the folder index and the main search.
 *
 * Whether it LOOKS right is for a browser.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname, ROOT = path.resolve(HERE, '..', '..');
const FILE = 'digestion.html';
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
const expose = ['frame', 'enterChapter', 'CH', 'camera', 'renderer', 'worldAt', 'shotAt', 'ROUTE', 'LM', 'FACTS', 'COLON', 'COLON_PARTS',
  'DUCT', 'CUES', 'BOLUS', 'solid', 'insideOf', 'ANATOMY', 'S_FOOD', 'FOOD_MOUTH', 'FOOD_DUO', 'FOOD_COLON', 'KEY', 'polyOf', 'part', 'centroid',
  'MAT', 'GROUP', 'LOOK', 'ENZ', 'ENZ_GEO', 'POCKET', 'U', 'UNIT_GEO', 'TAIL_BEADS', 'KEYS', 'LK', 'ST', 'LU', 'EM', 'TS', 'TT', 'BU', 'SH',
  'enzAt', 'bondAt', 'unitAt', 'ARRIVE', 'LEAVE', 'CLR', 'S5', 'testColour'].join(',');
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
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ======================================================================== */
section('RENDER  every frame of every chapter');
/* A label's rectangle, projected through the real camera, must sit inside
   the frame and clear of the HTML laid over the stage: the bar across the
   top, the key below it on the right (as tall as the chapter's key has
   rows), the buttons along the bottom middle. (In NDC, for the 920 x 720
   stage.) */
const blocked = c => [
  { name: 'the bar', x0: -0.8, x1: 0.8, y0: 0.8, y1: 1 },
  { name: 'the key', x0: 0.54, x1: 1, y0: 0.744 - (24 + 20.2 * S.CH[c].key.length) / 360, y1: 0.744 },
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
  for (const B of blocked(c))
    if (r.x + r.hw > B.x0 && r.x - r.hw < B.x1 && r.y + r.hh > B.y0 && r.y - r.hh < B.y1)
      return note(what, 'under ' + B.name + ' at ' + t.toFixed(1) + ' s (x ' + (r.x - r.hw).toFixed(2) + '..' + (r.x + r.hw).toFixed(2) + ', y ' + (r.y - r.hh).toFixed(2) + '..' + (r.y + r.hh).toFixed(2) + ')');
  if (r.hh * 2 * STAGE_H < 11) note(what, 'too small to read: ' + (r.hh * 2 * STAGE_H).toFixed(0) + ' px high at ' + t.toFixed(1) + ' s');
}
function checkMarker(spr, what, c, t) {
  const r = rectOf(spr);
  if (!r || Math.abs(r.x) > 1 || Math.abs(r.y) > 1) note('chapter ' + c + ': ' + what, 'out of the picture at ' + t.toFixed(1) + ' s');
}
const WORLDS_SEEN = [];
const tFrames = Date.now();
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
console.log('    every frame of ' + S.CH.length + ' chapters in ' + ((Date.now() - tFrames) / 1000).toFixed(1) + ' s');
chk(problems.size === 0, 'labels or markers out of place:\n        ' + [...problems].map(([k, v]) => k + ' ' + v).join('\n        '));
const want = [['macro'], ['shelf'], ['tests'], ['enz'], ['macro'], ['macro', 'stom'], ['macro'], ['emul'], ['lumen'], ['villi'], ['macro'], ['build']];
want.forEach((w, c) => chk(WORLDS_SEEN[c] && w.join() === WORLDS_SEEN[c].join(), 'chapter ' + c + ' shows ' + (WORLDS_SEEN[c] || []).join('+') + ', not ' + w.join('+')));
chk(S.CH.every(c => !/undefined|NaN/.test(c.text + c.title + (c.look || '') + (c.scale || '') + JSON.stringify(c.terms))), 'a caption has "undefined" or NaN in it');
chk(S.CH.every(c => c.key.every(k => S.KEY[k])), 'a chapter asks for a key entry that does not exist');
chk(S.CH.every(c => c.key.length <= 5), 'a chapter has more than five key entries; the key would cover the picture');
const owner = new Map();
for (const g in S.GROUP) for (const m of S.GROUP[g]) {
  if (owner.has(m.material) && owner.get(m.material) !== g) chk(false, 'groups "' + owner.get(m.material) + '" and "' + g + '" share a material');
  owner.set(m.material, g);
}
chk(S.CH.every(c => !c.view || S.LOOK[c.view]), 'a chapter asks for a view that does not exist');
chk(S.CH.every(c => c.eq.length && c.eq.every(k => ['carb', 'prot', 'lip'].includes(k))), 'a chapter lights a part of the bar that is not there');

/* ======================================================================== */
section('FOOD  the route through the gut');
const F = S.ROUTE.food;
const seq = poly => poly.parts.filter((p, i) => i === 0 || p !== poly.parts[i - 1]);
console.log('    ' + F.L.toFixed(2) + ' m: ' + seq(F).join(' > '));
chk(seq(F).join(' > ') === ['mouth', 'pharynx', 'Oesophagus', 'Stomach', 'Duodenum', 'Jejunum', ...S.COLON_PARTS].join(' > '),
  'the food does not go mouth > pharynx > oesophagus > stomach > duodenum > small intestine > ascending, transverse, descending, sigmoid colon');
const stoS = S.solid('Stomach'), duoS = S.solid('Duodenum');
const inStomach = F.pts.filter((p, i) => F.parts[i] === 'Stomach'), inDuo = F.pts.filter((p, i) => F.parts[i] === 'Duodenum');
chk(inStomach.length > 10 && inStomach.every(p => S.insideOf(stoS, p)), 'the route through the stomach leaves it: ' + inStomach.filter(p => !S.insideOf(stoS, p)).length + ' of ' + inStomach.length + ' points outside');
chk(inDuo.length > 10 && inDuo.slice(1).every(p => S.insideOf(duoS, p)), 'the route through the duodenum leaves it');
const oesEnd = F.pts[F.parts.lastIndexOf('Oesophagus')];
chk(d3(oesEnd, S.LM.cardia) < 0.012, 'the oesophagus does not end at the cardia (' + (d3(oesEnd, S.LM.cardia) * 1000).toFixed(0) + ' mm)');
chk(d3(F.pts[F.parts.indexOf('Duodenum')], S.LM.pylorus) < 0.006, 'the food does not leave the stomach through the pylorus');
chk(S.LM.pylorus[1] < S.LM.cardia[1] && S.LM.pylorus[0] < S.LM.cardia[0], 'the pylorus is not below and to the right of the cardia');
chk(S.LM.lips[2] > S.LM.oroBack[2] + 0.03, 'the mouth is not in front of the throat');
/* where one organ hands over to the next there is no gap; the small
   intestine opens into the side of the colon, through its wall */
for (let i = 1; i < F.pts.length; i++) if (F.parts[i] !== F.parts[i - 1]) {
  const gap = d3(F.pts[i - 1], F.pts[i]), into = F.parts[i] === S.COLON_PARTS[0];
  console.log('    ' + F.parts[i - 1] + ' > ' + F.parts[i] + ': ' + (gap * 1000).toFixed(1) + ' mm');
  chk(gap < (into ? 0.025 : 0.014), 'a ' + (gap * 1000).toFixed(0) + ' mm gap between ' + F.parts[i - 1] + ' and ' + F.parts[i]);
}
/* through the colon: every point in the middle of the tube, with wall all
   round it in the slab across the way it goes, and well clear of it */
S.COLON_PARTS.forEach((name, ci) => {
  /* the wall as its vertices and the middles of its triangles: the decimated
     sigmoid has so few vertices that a thin slab can miss a side of it */
  const W = S.COLON.S[ci], idx = F.parts.map((p, i) => p === name ? i : -1).filter(i => i >= 0);
  const Pp = S.part(name), wall = W.V.slice();
  for (let t = 0; t < Pp.idx.length; t += 3) wall.push([0, 1, 2].map(k => (Pp.pos[Pp.idx[t] * 3 + k] + Pp.pos[Pp.idx[t + 1] * 3 + k] + Pp.pos[Pp.idx[t + 2] * 3 + k]) / 3));
  let walled = 0, minClear = Infinity;
  const open = [];
  for (const i of idx) {
    const p = F.pts[i], d = norm(sub(F.pts[Math.min(F.pts.length - 1, i + 1)], F.pts[Math.max(0, i - 1)]));
    const e1 = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(d, e1);
    const sectors = new Set();
    for (const v of wall) {
      const w = sub(v, p);
      minClear = Math.min(minClear, Math.hypot(...w));
      if (Math.abs(dot(w, d)) < 0.008 && Math.hypot(...w) < 0.06) sectors.add(Math.floor((Math.atan2(dot(w, e2), dot(w, e1)) + Math.PI) / (Math.PI / 6)) % 12);
    }
    if (sectors.size >= 9) walled++; else open.push(idx.indexOf(i));
  }
  console.log('    ' + name + ': ' + idx.length + ' points, ' + walled + ' with wall all round, nearest wall ' + (minClear * 1000).toFixed(1) + ' mm');
  chk(idx.length >= 15, name + ': too few route points');
  chk(walled === idx.length, name + ': route points ' + open.join(', ') + ' of ' + idx.length + ' are not inside the tube');
  chk(minClear > 0.004, name + ': the route comes within ' + (minClear * 1000).toFixed(1) + ' mm of the wall');
});
const pick = (name, f) => F.pts.filter((p, i) => F.parts[i] === name).map(f);
const asc = pick(S.COLON_PARTS[0], p => p[1]), desc = pick(S.COLON_PARTS[2], p => p[1]), tra = pick(S.COLON_PARTS[1], p => p[0]);
chk(asc[asc.length - 1] > asc[0] + 0.08, 'the food does not go UP the ascending colon');
chk(desc[desc.length - 1] < desc[0] - 0.1, 'the food does not go DOWN the descending colon');
chk(tra[0] < 0 && tra[tra.length - 1] > 0, 'the food does not cross the transverse colon from the body’s right to its left');
chk(d3(S.LM.jejEnd, S.LM.appendix) < 0.05, 'the small intestine does not end by the appendix (' + (d3(S.LM.jejEnd, S.LM.appendix) * 1000).toFixed(0) + ' mm)');
/* the timelines: forwards only, and each chapter's ends where its text says */
for (const [name, f, len] of [['chapter 5', S.FOOD_MOUTH, 16], ['chapter 7', S.FOOD_DUO, 16], ['chapter 11', S.FOOD_COLON, 16]]) {
  let back = false; for (let t = 0; t < len; t += 0.05) if (f(t + 0.05) < f(t) - 1e-9) back = true;
  chk(!back, name + ': the food goes backwards');
}
chk(S.FOOD_MOUTH(16) > S.S_FOOD.cardia && S.FOOD_MOUTH(16) < S.S_FOOD.pylorus, 'chapter 5 does not end with the food in the stomach');
chk(S.FOOD_DUO(0) === S.FOOD_MOUTH(16), 'chapter 7 does not pick the food up where chapter 5 left it');
chk(S.FOOD_DUO(16) > S.S_FOOD.pylorus && S.FOOD_DUO(16) < S.S_FOOD.jej, 'chapter 7 does not end with the food in the duodenum');
chk(S.FOOD_COLON(0) < S.S_FOOD.colon && S.FOOD_COLON(16) === S.S_FOOD.end, 'chapter 11 does not take the food from the small intestine to the end of the colon');

/* ======================================================================== */
section('DUCTS  the juices go down the real ones');
const teeth = S.ANATOMY.parts.filter(p => p.lineage.includes('Teeth')).map(p => S.centroid(p.name));
for (const sd of S.DUCT.saliva) {
  const toTooth = Math.min(...teeth.map(c => d3(c, sd.mouthEnd))), fromGland = d3(sd.gland, sd.poly.pts[1]);
  console.log('    ' + sd.name + ': ' + (sd.poly.L * 1000).toFixed(0) + ' mm, opens ' + (toTooth * 1000).toFixed(0) + ' mm from a tooth');
  chk(fromGland < 0.03, sd.name + ' does not start at its gland (' + (fromGland * 1000).toFixed(0) + ' mm)');
  chk(toTooth < 0.03 && toTooth < d3(sd.gland, sd.mouthEnd), sd.name + ' does not open into the mouth');
}
const B = S.DUCT.bile.pts, liverS = S.solid('Liver');
const nearLiver = Math.min(...liverS.V.map(v => d3(v, B[0])));
console.log('    bile duct: ' + (S.polyOf(B).L * 1000).toFixed(0) + ' mm, starts ' + (nearLiver * 1000).toFixed(1) + ' mm from the liver; cystic duct (drawn) ' + S.DUCT.cysticMm + ' mm');
chk(nearLiver < 0.012 || S.insideOf(liverS, B[0]), 'the bile duct does not start at the liver');
chk(d3(S.DUCT.bileEnd, S.DUCT.papilla) < 0.02, 'the bile duct does not end at the duodenum (' + (d3(S.DUCT.bileEnd, S.DUCT.papilla) * 1000).toFixed(0) + ' mm)');
chk(B[0][1] > S.DUCT.bileEnd[1] + 0.03, 'bile does not run down the bile duct');
chk(S.DUCT.cysticMm > 3 && S.DUCT.cysticMm < 45, 'the drawn cystic duct is ' + S.DUCT.cysticMm + ' mm');
const gallS = S.solid('Gallbladder');
chk(S.insideOf(gallS, S.DUCT.gallC) || d3(S.DUCT.gallC, S.LM.gall) < 1e-9, 'the bile does not start in the gall bladder');
const route = S.DUCT.route;
chk(d3(route.bileOut.pts[0], S.LM.gall) < 1e-9 && route.bileOut.pts[route.bileOut.pts.length - 1] === S.DUCT.papilla, 'bile out of the gall bladder does not go to the duodenum');
chk(d3(route.bileIn.pts[0], B[0]) < 1e-9 && d3(route.bileIn.pts[route.bileIn.pts.length - 1], S.LM.gall) < 1e-9, 'bile from the liver does not go to the gall bladder');
const P = S.DUCT.pan.pts, panS = S.solid('Pancreas');
const inPan = P.filter(p => S.insideOf(panS, p)).length;
console.log('    pancreatic duct: ' + (S.polyOf(P).L * 1000).toFixed(0) + ' mm, ' + inPan + ' of ' + P.length + ' points inside the pancreas; meets the bile duct ' + (d3(P[P.length - 1], S.DUCT.bileEnd) * 1000).toFixed(0) + ' mm from its end');
chk(inPan >= P.length * 0.7, 'the pancreatic duct does not run through the pancreas');
chk(d3(P[0], S.LM.duodenum) > d3(P[P.length - 1], S.LM.duodenum) + 0.05, 'the pancreatic juice does not run from the tail of the pancreas to its head');
chk(d3(P[P.length - 1], S.DUCT.bileEnd) < 0.015, 'the pancreatic duct does not meet the bile duct');
chk(S.FOOD_DUO(16) >= S.S_FOOD.papilla, 'the food is not where the juices come in when chapter 7 ends');

/* ======================================================================== */
section('ENZYMES  each fits only its own bond');
const FITS = { long: ['G', 'G'], GG: ['G', 'G'], GF: ['G', 'F'], AA: ['A', 'A'], YT: ['Y', 'T'] };
const outline = {};                     // a block's outline in its own frame, as points
const hexPts = (n, R, ph) => Array.from({ length: n }, (_, k) => [Math.cos(ph + k * 2 * Math.PI / n) * R, Math.sin(ph + k * 2 * Math.PI / n) * R]);
outline.G = hexPts(6, S.U.R, 0);
outline.F = hexPts(5, S.U.FR, Math.PI);
outline.A = hexPts(24, S.U.AR, 0);
outline.Y = [[-S.U.BAR_W / 2, -S.U.BAR_H / 2], [S.U.BAR_W / 2, -S.U.BAR_H / 2], [S.U.BAR_W / 2, S.U.BAR_H / 2], [-S.U.BAR_W / 2, S.U.BAR_H / 2]];
outline.T = S.TAIL_BEADS.flatMap(([x, y, , r]) => hexPts(12, r, 0).map(([a, b]) => [x + a, y + b]));
/* the underside of an enzyme, after the bevel has grown it by 0.06 */
function underside(pk, x) {
  const P = S.ENZ_GEO[pk].userData.pocket;
  for (let i = 1; i < P.length; i++) if (P[i][0] >= x && P[i - 1][0] <= x && P[i][0] > P[i - 1][0]) return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0]) - 0.06;
  return null;
}
const worlds = [['lock and key', [S.KEYS.E]], ['stomach', S.ST.pe], ['small intestine', S.LU.enz]];
let jobs = 0, docked = 0, fit = 0, clash = 0, worstClash = 0, wrongKind = 0, crowded = 0;
const kindsCut = {};
for (const [wname, list] of worlds) for (const E of list) for (const j of E.jobs) {
  if (j.miss) continue;
  jobs++;
  const b = j.I.mol.bonds[j.k], u = j.I.mol.units, pk = S.ENZ[E.kind].pk;
  const pair = [u[b.i].k, u[b.j].k];
  if (pair.join() !== FITS[pk].join()) { wrongKind++; console.log('      ' + wname + ': ' + E.kind + ' cut a ' + pair.join('-') + ' bond'); }
  kindsCut[E.kind] = (kindsCut[E.kind] || 0) + 1;
  /* docked on the bond at the moment it is cut */
  const at = S.enzAt(E, j.t), bw = S.bondAt(j.I, j.k, j.t);
  if (d3(at.p, bw.p) < 1e-6) docked++;
  /* every block near the bond, in the enzyme's frame (turned over if it
     docks from the far side), lies under its underside; a block that has
     drifted out of the enzyme's plane, in front of it or behind, cannot be in it */
  let worst = 0;
  const ca = Math.cos(-at.a), sa = Math.sin(-at.a), flip = Math.cos(at.rx || 0) < 0 ? -1 : 1;
  u.forEach((un, ui) => {
    const w = S.unitAt(j.I, ui, j.t - 1e-6);
    if (Math.abs(w.p[2] - at.p[2]) > 0.6) return;
    for (const [ox, oy] of outline[un.k]) {
      const c = Math.cos(w.a), s = Math.sin(w.a);
      const gx = w.p[0] + c * ox - s * oy - at.p[0], gy = w.p[1] + s * ox + c * oy - at.p[1];
      const x = ca * gx - sa * gy, y = flip * (sa * gx + ca * gy);
      const top = underside(pk, x);
      if (top != null && y > -0.3 && y > top) worst = Math.max(worst, y - top);
    }
  });
  if (worst > 0.03) { clash++; worstClash = Math.max(worstClash, worst); console.log('      ' + wname + ': ' + E.kind + ' on bond ' + j.k + ' at ' + j.t + ' s: a block is ' + worst.toFixed(2) + ' into the enzyme'); }
  else fit++;
  /* maltase splits maltose, sucrase sucrose; amylase works on a chain */
  const comp = new Set([b.i]), stack = [b.i];
  while (stack.length) { const q = stack.pop(); for (const [r, kb] of j.I.mol.adj[q]) if (!(j.I.cut[kb] < j.t) && !comp.has(r)) { comp.add(r); stack.push(r); } }
  if (E.kind === 'maltase') chk(comp.size === 2, wname + ': maltase cut something bigger than a maltose (' + comp.size + ' glucoses)');
  if (E.kind === 'sucrase') chk(comp.size === 2 && pair.includes('F'), wname + ': sucrase cut something that is not a sucrose');
  if (E.kind === 'amylase') chk(comp.size >= 4, wname + ': amylase cut a chain of only ' + comp.size);
}
/* no two enzymes crowd one stretch of chain at once */
for (const [wname, list] of worlds) {
  const all = list.flatMap(E => E.jobs.filter(j => !j.miss).map(j => ({ E, j })));
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const A = all[a], Bj = all[b];
    if (A.j.I !== Bj.j.I || Math.abs(A.j.t - Bj.j.t) > S.ARRIVE + S.LEAVE) continue;
    const wa = S.POCKET[S.ENZ[A.E.kind].pk], wb = S.POCKET[S.ENZ[Bj.E.kind].pk];
    const ma = A.j.I.mol.bonds[A.j.k].mid, mb = Bj.j.I.mol.bonds[Bj.j.k].mid;
    if (d3(ma, mb) < ((wa.x1 - wa.x0) + (wb.x1 - wb.x0)) / 2) { crowded++; console.log('      ' + wname + ': ' + A.E.kind + ' and ' + Bj.E.kind + ' both on bonds ' + A.j.k + ' and ' + Bj.j.k + ' at ' + A.j.t + '/' + Bj.j.t + ' s'); }
  }
}
console.log('    ' + jobs + ' cuts: ' + Object.entries(kindsCut).map(([k, n]) => k + ' ' + n).join(', ') + '; ' + fit + ' snug in the active site');
chk(wrongKind === 0, wrongKind + ' bonds cut by an enzyme whose active site is not their shape');
chk(docked === jobs, (jobs - docked) + ' bonds cut with no enzyme docked on them');
chk(clash === 0, clash + ' substrates sit through their enzyme (worst ' + worstClash.toFixed(2) + ')');
chk(crowded === 0, crowded + ' times two enzymes crowd the same stretch of chain');
/* every cut is someone's job: no bond breaks by itself */
for (const [wname, insts, list] of [['stomach', S.ST.P, S.ST.pe], ['small intestine', S.LU.insts, S.LU.enz], ['lock and key', [S.KEYS.I], [S.KEYS.E]]]) {
  for (const I of insts) I.cut.forEach((tc, k) => {
    if (!isFinite(tc)) return;
    chk(list.some(E => E.jobs.some(j => !j.miss && j.I === I && j.k === k && j.t === tc)), wname + ': bond ' + k + ' breaks with no enzyme on it');
  });
}
/* the small intestine: by the end, everything is single blocks */
const lenLU = S.CH[8].len;
const lumenLeft = S.LU.insts.filter(I => I.mol.bonds.length && !I.mol.units.every((u, i) => S.LU.insts && I.free[i] < lenLU - 1));
chk(lumenLeft.length === 0, 'the small intestine: ' + lumenLeft.length + ' molecules are not fully digested by the end');
/* the stomach: proteins only shortened, starch untouched */
chk(S.ST.P.every(I => I.cut.some(isFinite) && !I.mol.units.every((u, i) => isFinite(I.free[i]))), 'the stomach: a protein is not cut, or is cut all the way to amino acids');
/* lock and key: two maltoses cut off, then nothing more */
const K = S.KEYS;
const kc = [...K.I.cut].filter(isFinite).length;
chk(kc === 2, 'lock and key: ' + kc + ' bonds cut, not 2');
chk(K.E.jobs.filter(j => j.miss).every(j => !isFinite(K.I.cut[j.k])), 'lock and key: the denatured enzyme cut a bond');
chk([...K.P.cut].every(c => !isFinite(c)), 'lock and key: the protein was cut by amylase');
let closest = Infinity;
for (let t = S.LK.miss - 2; t < S.LK.miss + 2; t += 0.05) {
  const e = S.enzAt(K.E, t);
  K.P.mol.units.forEach((u, i) => { closest = Math.min(closest, d3(S.unitAt(K.P, i, t).p, e.p)); });
}
chk(closest > S.U.AR + 0.1, 'lock and key: the protein gets into amylase’s active site (' + closest.toFixed(2) + ')');
/* each enzyme's active site differs */
const shapes = Object.keys(S.POCKET).map(k => S.ENZ_GEO[k].userData.pocket.map(p => p[1].toFixed(2)).join());
chk(new Set(shapes).size === shapes.length, 'two enzymes have the same active site');

/* ======================================================================== */
section('EMULSION  smaller droplets, more surface');
const E = S.EM;
for (let g = 0; g <= E.GENS; g++) chk(Math.abs((1 << g) * Math.pow(E.r(g), 3) - Math.pow(E.R0, 3)) < 1e-9, 'generation ' + g + ' does not keep the volume');
chk(E.AREA.every((a, g) => Math.abs(a - Math.pow(2, g / 3)) < 1e-9), 'the surface is not 2^(g/3) times the first drop’s');
chk(String(Math.round(E.AREA[E.GENS] * 10) / 10) === S.FACTS.emX && S.FACTS.emN === 1 << E.GENS, 'the figures quoted are not the droplets’ own');
chk(E.atWork(0) === E.PER && E.atWork(40) === E.NL && E.NL === Math.round(E.PER * E.AREA[E.GENS]), 'the lipase at work does not follow the surface');
let workBack = false; for (let t = 0; t < 20; t += 0.05) if (E.atWork(t + 0.05) < E.atWork(t)) workBack = true;
chk(!workBack, 'the lipase at work goes down as the surface grows');
const endT = S.CH[7].len, leaves = Array.from({ length: E.N }, (_, k) => E.centre(k, endT));
let overlap = 0; for (let a = 0; a < E.N; a++) for (let b = a + 1; b < E.N; b++) if (d3(leaves[a], leaves[b]) < 2 * E.r(E.GENS) * 0.98) overlap++;
chk(overlap === 0, overlap + ' pairs of final droplets overlap');
console.log('    1 drop of radius ' + E.R0 + ' into ' + E.N + ' of radius ' + E.r(E.GENS).toFixed(2) + ': ' + S.FACTS.emX + ' times the surface; lipase at work ' + E.atWork(0) + ' to ' + E.NL);

/* ======================================================================== */
section('TESTS  the food tests');
const hue = css => { const n = parseInt(css.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d) return 0; let h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const lum = css => { const n = parseInt(css.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
const T = Object.fromEntries(S.TT.map(t => [t.reagent, t]));
chk(['iodine', 'Benedict’s', 'biuret', 'Sudan III'].every(k => T[k]), 'the four tests are not iodine, Benedict’s, biuret and Sudan III');
const end = t => { const [, b, u] = S.testColour(t, 99); return u === 1 ? b : null; };
const io = end(T.iodine), bn = end(T['Benedict’s']), bi = end(T.biuret);
chk(hue(T.iodine.from) > 15 && hue(T.iodine.from) < 45 && lum(io) < 50, 'iodine does not go from orange-brown to blue-black');
chk(hue(T['Benedict’s'].from) > 200 && hue(T['Benedict’s'].from) < 240 && (hue(bn) < 20 || hue(bn) > 345), 'Benedict’s does not go from blue to brick red');
const bh = T['Benedict’s'].to.map(hue);
chk(bh[0] > 80 && bh[0] < 150 && bh.slice(1).every((h, i) => h < bh[i]), 'Benedict’s does not go through green, yellow and orange in order');
chk(T['Benedict’s'].change[0] >= T['Benedict’s'].bath[0] + 0.9 && T['Benedict’s'].change[1] <= T['Benedict’s'].bath[1], 'Benedict’s changes colour without being heated');
chk(hue(T.biuret.from) > 200 && hue(T.biuret.from) < 240 && hue(bi) > 255 && hue(bi) < 300, 'biuret does not go from blue to purple');
chk(T['Sudan III'].layer && (hue(T['Sudan III'].layer) < 15 || hue(T['Sudan III'].layer) > 345), 'Sudan III does not leave a red layer');
chk(S.TT.every(t => t.change[0] > t.add), 'a tube changes colour before the food goes in');
chk(S.TT.every(t => { const [a, , u] = S.testColour(t, t.add); return u === 0 && a === t.from; }), 'a tube is not its test solution’s colour until the food goes in');

/* ======================================================================== */
section('WORDS');
const all = S.CH.map(c => c.text + ' ' + c.look + ' ' + c.scale + ' ' + JSON.stringify(c.terms)).join(' ');
chk(S.CH.every(c => !/(produc|mak|creat)\w* (the )?energy|energy (is )?(produced|made|created)/i.test(c.text + c.look + c.scale)), 'a caption says energy is produced or made; it is transferred');
chk(!/bile (digests|breaks down|is an enzyme)/i.test(all) && /Bile is not an enzyme/.test(all), 'a caption says bile digests fat, or never says it is not an enzyme');
chk(/glycerol/.test(S.CH[8].text) && /fatty acids/.test(S.CH[8].text) && /maltose/.test(S.CH[8].text) && /amino acids/.test(S.CH[8].text), 'chapter 9 does not name every product');
chk(/denatured/.test(S.CH[3].text) && /active site/.test(S.CH[3].text) && /substrate/.test(S.CH[3].text), 'chapter 4 does not teach the active site, the substrate and denaturing');
chk(S.CH[4].look.includes(S.FACTS.oesCm + ' cm'), 'chapter 5 does not quote the oesophagus length');
chk(S.CH[10].look.includes(S.FACTS.colonCm + ' cm'), 'chapter 11 does not quote the colon length');
chk(S.CH[7].text.includes(S.FACTS.emN + ' droplets') && S.CH[7].text.includes(S.FACTS.emX + ' times'), 'chapter 8 does not quote the emulsion figures');
chk(S.CH[6].scale.includes(S.DUCT.cysticMm + ' mm'), 'chapter 7 does not quote the drawn cystic duct');
/* every number in a caption is a measured one, or one the curriculum gives */
const allowed = new Set([String(S.FACTS.oesCm), String(S.FACTS.colonCm), String(S.FACTS.emN), S.FACTS.emX, String(S.DUCT.cysticMm),
  '20',               // kinds of amino acid
  '2', '7']);         // the stomach's pH; neutral
for (const c of S.CH) {
  const txt = (c.text + ' ' + c.look + ' ' + c.scale + ' ' + c.terms.map(x => x.join(' ')).join(' ')).replace(/<[^>]+>/g, ' ');
  for (const n of txt.match(/\d+(\.\d+)?/g) || []) chk(allowed.has(n), 'chapter "' + c.title + '" quotes ' + n + ', which is not measured or from the curriculum');
}

/* ======================================================================== */
section('LICENCE');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'anatomy', 'licence-rules.json'), 'utf8'));
chk(S.ANATOMY.licence === rules.licence && S.ANATOMY.attribution === rules.attribution, 'the packed licence is not the current one; re-pack');
chk(/Z-Anatomy/.test(html.slice(html.indexOf('<div class="credit">'), html.indexOf('<div class="credit">') + 600)) && /CC BY-SA/.test(html), 'the on-screen credit is missing');
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'anatomy', 'catalogue.json'), 'utf8')).parts;
const blockedParts = new Set(cat.filter(p => p.blocked).map(p => p.name));
chk(S.ANATOMY.parts.every(p => !blockedParts.has(p.name)), 'the page carries a part the licence rules block');
chk(S.ANATOMY.parts.every(p => cat.some(c => c.name === p.name)), 'the page carries a part that is not in the catalogue');
const manifest = path.join(HERE, S.ANATOMY.source.glb.replace(/\.glb$/, '.manifest.json'));
if (fs.existsSync(manifest)) {
  const M = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  chk(M.parts.map(p => p.name).sort().join('|') === S.ANATOMY.parts.map(p => p.name).sort().join('|'), 'the packed parts are not the manifest\'s; re-pack');
  chk(S.ANATOMY.source.bytes === M.totals.bytes, 'the page was packed from a different build of the .glb; re-pack');
  const tris = Object.fromEntries(M.parts.map(p => [p.name, p.tris]));
  chk(S.ANATOMY.parts.every(p => p.i / 3 === tris[p.name]), 'a packed part has a different triangle count from the manifest');
} else chk(false, 'no manifest beside the page');
const kb = Buffer.byteLength(html) / 1024;
chk(kb < 2000, 'the page is ' + kb.toFixed(0) + ' KB; keep it under 2 MB');
console.log('    page ' + kb.toFixed(0) + ' KB, ' + S.ANATOMY.parts.length + ' parts');

/* ======================================================================== */
section('CATALOGUE');
const folder = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
chk(folder.includes('./digestion/' + FILE), 'human_anatomy/index.html does not link the page');
const root = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
chk(root.includes('"u": "human_anatomy/digestion/' + FILE + '"'), 'the main search does not list the page');

console.log('\n' + checks + ' checks, ' + fails + ' failure' + (fails === 1 ? '' : 's'));
process.exit(fails ? 1 : 0);
