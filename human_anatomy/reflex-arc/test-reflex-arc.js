/* Tests for the reflex arc story.
 *
 *   cd human_anatomy/reflex-arc && node test-reflex-arc.js
 *
 * Three passes, in the same spirit as energy/test-energy-scenes.js:
 *
 *   1. TEXT      the page is still one self-contained file: no script from
 *                anywhere, no fetch of the 84 MB model, and the baked images
 *                are real PNGs of the size the page thinks they are.
 *   2. MODEL     the page's own code is run (not a copy of it) and its
 *                choreography checked for things that would be WRONG TO
 *                TEACH: the hand moving before the impulse reaches the
 *                muscle, the brain hearing about it before the hand moves,
 *                a synapse count that does not match the chain, a muscle
 *                that changes volume as it contracts.
 *   3. RENDER    every frame of every chapter under a stub canvas, looking
 *                for thrown errors, non-finite coordinates, captions that
 *                came out as "undefined", and text off the edge of the stage.
 *
 * None of it can tell you whether anything LOOKS right. Check that yourself
 * in a browser.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const FILE = 'scene.html';

let checks = 0, fails = 0;
function chk(ok, msg) {
  checks++;
  if (!ok) { fails++; console.log('    ✗ ' + msg); }
}
function section(name) { console.log('\n' + name); }
const html = fs.readFileSync(path.join(HERE, FILE), 'utf8');
const js = (html.match(/<script>\n([\s\S]*)\n<\/script>/) || [])[1] || '';

/* The page is one IIFE. To test its internals without copying them, run
   it with one line added at the end of the IIFE that hands them out. */
const EXPORTS = 'ARC,SYNAPSES,PHASES,mkRun,prog,elbow,stepAt,BUILT,RUNS,CH,LEN,LEN3,FACTS,B,figure,REST_L,finishOrder,LANES,TH_MAX,HOB_Z,CORD,FY_';
function instrumented() {
  const i = js.lastIndexOf('})();');
  return js.slice(0, i) + 'window.__T={' + EXPORTS + '};\n' + js.slice(i);
}

/* ===================================================================
   A STUB BROWSER
   =================================================================== */
function browser() {
  const els = new Map();
  const rec = { bad: [], stray: [], junk: [], text: [], draws: 0 };
  const dim = js.match(/const SW=(\d+),SH=(\d+);/);
  const SW = dim ? +dim[1] : 0, SH = dim ? +dim[2] : 0;
  const MARGIN = 30;
  const DRAW = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage']);
  function El(sel) {
    this.sel = sel; this.children = []; this.style = {}; this.dataset = {};
    this.textContent = ''; this.innerHTML = ''; this.disabled = false;
    this.className = ''; this.offsetHeight = 60;
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.setAttribute = function () {};
  El.prototype.addEventListener = function () {};
  const raw = {
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
    ellipse() {}, bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, clip() {},
    setLineDash() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {},
    clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    measureText(s) { return { width: String(s).length * 7.5 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  const ctx = new Proxy(raw, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return function (...a) {
        a.forEach((x, i) => {
          if (typeof x === 'number' && !Number.isFinite(x)) rec.bad.push(k + ' arg ' + i + ' = ' + x);
        });
        if (k === 'fillText') {
          const s = String(a[0]);
          rec.text.push(s);
          if (/\[native code\]|\bundefined\b|NaN|\[object |function \w*\(/.test(s)) rec.junk.push(JSON.stringify(s.slice(0, 60)));
          const x = a[1], y = a[2];
          if (Number.isFinite(x) && Number.isFinite(y) && (x < -MARGIN || x > SW + MARGIN || y < -MARGIN || y > SH + MARGIN))
            rec.stray.push(JSON.stringify(s.slice(0, 34)) + ' at ' + Math.round(x) + ',' + Math.round(y));
        }
        if (DRAW.has(k)) rec.draws++;
        return v.apply(t, a);
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) rec.bad.push(k + ' = ' + v);
      if (typeof v === 'string' && /NaN|undefined/.test(v)) rec.bad.push(k + ' = ' + v);
      t[k] = v; return true;
    }
  });
  function get(sel) {
    if (!els.has(sel)) {
      const e = new El(sel);
      if (sel === '#c') { e.getContext = () => ctx; e.width = 800; e.height = 600; }
      els.set(sel, e);
    }
    return els.get(sel);
  }
  let rafCb = null;
  function Image() { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; }
  const sandbox = {
    console,
    document: {
      querySelector: get,
      createElement: (tag) => new El(tag),
      addEventListener() {}
    },
    Image,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    performance: { now: () => 0 },
    addEventListener() {},
    innerWidth: 1600, innerHeight: 900, devicePixelRatio: 2,
    Math, Date, JSON, Set, Map, isFinite, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return { sandbox, els, rec, get raf() { return rafCb; }, SW, SH };
}

/* ===================================================================
   1. TEXT
   =================================================================== */
function readPng(b64) {
  const b = Buffer.from(b64, 'base64');
  const sig = b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { sig, type: b.slice(12, 16).toString('ascii'), w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}
function text() {
  section('TEXT  one self-contained page');
  chk(js.length > 5000, 'no inline script found');
  chk(!/<script[^>]+src=/.test(html), 'pulls in an external script; this page must work off disk');
  (html.match(/href="([^"]+)"/g) || []).forEach(h => {
    chk(/fonts\.(googleapis|gstatic)\.com/.test(h), 'unexpected external asset ' + h);
  });
  /* the whole point of the bake: the model itself is never loaded */
  chk(!/scene\.(gltf|bin)|fetch\(|XMLHttpRequest|GLTFLoader/.test(js), 'the page reaches for the model at runtime; it must use the baked images');
  chk(!/require\(|import\s/.test(js), 'uses a module system');
  chk(/<title>/.test(html), 'no <title>');
  chk(/aria-label/.test(html), 'canvas has no aria-label');
  chk(!/id="panel"/.test(html), 'a prose panel has crept in');
  ['#bar', '#prev', '#next', '#dots', '#replay', '#kicker', '#title', '#ctrl'].forEach(id => {
    chk(html.indexOf('id="' + id.slice(1) + '"') > 0, 'the bar has no ' + id);
  });
  let threw = null;
  try { new vm.Script(js, { filename: FILE }); } catch (e) { threw = e; }
  chk(!threw, 'script does not parse: ' + (threw && threw.message));
  chk(!/\+=\s*v[xy]\s*\*\s*dt/.test(js), 'looks like per-frame integration; keep the scene closed-form');
  chk(!/Math\.random\(/.test(js), 'Math.random() in the page; use hash(index) so a replay is identical');
  /* the licence travels with the picture */
  chk(/Z-Anatomy/.test(js) && /CC BY-SA/.test(js), 'the on-screen credit for the model is missing');
  chk(/CC-BY-SA/.test(html.slice(0, 3000)), 'the licence note in the head is missing');

  /* the baked images */
  const m = js.match(/const BAKED=(\{[\s\S]*?\});\n/);
  chk(!!m, 'no BAKED block: run node bake-backdrop.js');
  if (!m) return;
  const B = JSON.parse(m[1]);
  [['body', ['flesh', 'bone', 'brain', 'nerve']], ['arm', ['flesh', 'bone', 'nerve']]].forEach(([L, ks]) => {
    ks.forEach(k => {
      const u = B[L] && B[L][k];
      chk(typeof u === 'string' && u.indexOf('data:image/png;base64,') === 0, L + '.' + k + ': not a PNG data URI');
      if (typeof u !== 'string') return;
      const p = readPng(u.slice(22));
      chk(p.sig && p.type === 'IHDR', L + '.' + k + ': not a valid PNG');
      chk(p.w === B[L].w && p.h === B[L].h, L + '.' + k + ': is ' + p.w + 'x' + p.h + ' but the page draws it as ' + B[L].w + 'x' + B[L].h);
    });
  });
  const kb = Buffer.byteLength(html) / 1024;
  chk(kb < 1500, 'the page is ' + kb.toFixed(0) + ' KB; the bake has grown, check K in bake-backdrop.js');
  console.log('    page ' + kb.toFixed(0) + ' KB, baked at ' + B.K + ' px per metre');
}

/* ===================================================================
   2. MODEL
   =================================================================== */
function model() {
  section('MODEL  the choreography, run from the page itself');
  const br = browser();
  let threw = null;
  try { vm.runInContext(instrumented(), br.sandbox, { filename: FILE }); } catch (e) { threw = e; }
  chk(!threw, 'threw on load: ' + (threw && threw.message));
  const T = br.sandbox.__T;
  chk(!!T, 'could not reach the page internals');
  if (!T) return;

  /* --- the chain itself --- */
  const ids = T.ARC.map(a => a.id).join(',');
  chk(ids === 'stimulus,receptor,sensory,relay,motor,effector,response', 'the arc is out of order: ' + ids);
  chk(JSON.stringify(T.SYNAPSES) === JSON.stringify([['sensory', 'relay'], ['relay', 'motor']]),
    'synapses should be sensory→relay and relay→motor, got ' + JSON.stringify(T.SYNAPSES));
  chk(T.FACTS.synapses === T.SYNAPSES.length, 'the caption\'s synapse count is not the chain\'s');
  T.ARC.forEach(a => chk(a.name && a.what && a.what.length > 8, a.id + ': missing a name or description'));

  /* --- the landmarks the bake found --- */
  const B = T.B;
  chk(B.shoulder[1] > B.pivot[1] && B.pivot[1] > B.wrist[1] && B.wrist[1] > B.tip[1],
    'the arm is upside down: shoulder > elbow > wrist > fingertip should hold in height');
  chk(B.skinTip[1] < B.tip[1] && B.tip[1] - B.skinTip[1] < 0.04, 'the drawn-in fingertip is not just below the bone');
  for (let i = 1; i < B.canal.length; i++) chk(B.canal[i][1] < B.canal[i - 1][1], 'the spinal canal is not traced top to bottom');
  chk(B.stem[1] > B.canal[0][1] - 0.02, 'the brainstem does not sit on top of the canal');
  chk(T.CORD[1] < B.canal[0][1] && T.CORD[1] > B.canal[B.canal.length - 1][1], 'the arm joins the cord outside the traced canal');
  chk(T.CORD[1] > B.shoulder[1], 'the arm joins the cord below the shoulder; its nerves come from the neck');
  chk(B.brain.z0 > T.CORD[1], 'the brain is below where the arm joins the cord');

  /* --- the lengths quoted on screen --- */
  chk(T.LEN3.sensory > 0.6 && T.LEN3.sensory < 1.2,
    'the sensory neurone measures ' + T.LEN3.sensory.toFixed(2) + ' m; an adult fingertip-to-spine path is 0.6-1.2 m');
  chk(T.LEN3.motor > 0.15 && T.LEN3.motor < T.LEN3.sensory, 'the motor neurone length is not plausible: ' + T.LEN3.motor.toFixed(2));
  chk(T.FACTS.sensoryM === T.LEN3.sensory.toFixed(1), 'the quoted sensory length is not the measured one');

  /* --- the muscle and the arm --- */
  const g0 = T.figure(0), g1 = T.figure(T.TH_MAX);
  chk(g1.L < g0.L, 'the biceps gets LONGER as the elbow bends; it should shorten to pull the forearm up');
  const vol = g => g.w * g.w * g.L;
  chk(Math.abs(vol(g1) / vol(g0) - 1) < 1e-9, 'the biceps changes volume as it contracts');
  chk(g1.tipIn[1] < g0.tipIn[1] - 40, 'the fingertip does not come up off the hot plate');
  chk(g1.tipIn[1] < T.FY_(T.HOB_Z) - 40, 'the fingertip ends up near the hot plate');
  chk(g1.tipIn[0] < g0.tipIn[0], 'the forearm swings backwards; flexing the elbow brings it forwards');
  chk(Math.abs(g0.tipIn[1] - T.FY_(T.HOB_Z)) < 0.02 * 520, 'at rest the fingertip is not on the hot plate');

  /* --- every run --- */
  const chRuns = new Map();
  T.CH.forEach(c => { chRuns.set(c.run, (chRuns.get(c.run) || []).concat(c)); if (c.speedCtl) chRuns.set('slow', (chRuns.get('slow') || []).concat(c)); });
  Object.keys(T.BUILT).forEach(k => {
    const run = T.BUILT[k], ph = run.ph, o = T.RUNS[k];
    /* the chain is contiguous: each phase starts as the last one ends */
    for (let i = 1; i < T.PHASES.length; i++)
      chk(Math.abs(ph[T.PHASES[i]].t0 - ph[T.PHASES[i - 1]].t1) < 1e-9, k + ': ' + T.PHASES[i] + ' does not start when ' + T.PHASES[i - 1] + ' ends');
    T.PHASES.concat(['up', 'feel']).forEach(p => chk(ph[p].d >= 0 && Number.isFinite(ph[p].d), k + ': phase ' + p + ' has a bad duration'));
    /* a neurone's phase lasts its length over the chapter's speed */
    chk(Math.abs(ph.sensory.d * o.vs - T.LEN.sensory) < 1e-6, k + ': the sensory phase is not its length over its speed');
    chk(Math.abs(ph.motor.d * o.vm - T.LEN.motor) < 1e-6, k + ': the motor phase is not its length over its speed');
    /* the message to the brain leaves the first synapse, not before */
    chk(ph.up.t0 >= ph.syn1.t1 - 1e-9, k + ': the message sets off for the brain before it has reached the spinal cord');
    /* causality: nothing moves before the impulse reaches the muscle */
    for (let t = 0; t < ph.contract.t0; t += 0.01)
      if (T.elbow(run, t) !== 0) { chk(false, k + ': the elbow bends at t=' + t.toFixed(2) + ', before the impulse reaches the biceps'); break; }
    chk(T.elbow(run, ph.contract.t1 + 0.01) > T.TH_MAX * 0.99, k + ': the elbow never finishes bending');
    /* the step shown only ever moves forward, and visits every step */
    let prev = -1, seen = new Set(), mono = true;
    for (let t = 0; t <= run.end; t += 0.005) {
      const s = T.stepAt(run, t);
      if (s < prev) mono = false;
      prev = s; seen.add(s);
    }
    chk(mono, k + ': the highlighted step goes backwards');
    chk(seen.size === T.ARC.length, k + ': only ' + seen.size + ' of ' + T.ARC.length + ' steps are ever highlighted');
    chk(run.end > Math.max(ph.contract.t1, ph.feel.t1), k + ': the loop restarts before the run has finished');
    /* where a chapter shows the brain getting the message, the hand must
       already be moving -- that is what its caption says */
    const shows = (chRuns.get(k) || []).some(c => c.up);
    if (shows) {
      chk(ph.feel.t1 > ph.contract.t1, k + ': "Ouch" comes before the hand has moved');
      chk(T.finishOrder(run)[0] === 0, k + ': the race panel would call the brain FIRST');
    }
  });
  console.log('    sensory ' + T.LEN3.sensory.toFixed(2) + ' m, motor ' + T.LEN3.motor.toFixed(2) + ' m, ' + T.SYNAPSES.length + ' synapses, ' + Object.keys(T.BUILT).length + ' runs');
}

/* ===================================================================
   3. RENDER
   =================================================================== */
function render() {
  section('RENDER  every frame of every chapter, under a stub canvas');
  const br = browser();
  let threw = null;
  try { vm.runInContext(instrumented(), br.sandbox, { filename: FILE }); } catch (e) { threw = e; }
  chk(!threw, 'threw on load: ' + (threw && (threw.stack || '').split('\n').slice(0, 2).join(' | ')));
  if (threw) return;
  chk(typeof br.raf === 'function', 'never asked for an animation frame');
  if (typeof br.raf !== 'function') return;
  const T = br.sandbox.__T;
  let clock = 0;
  function run(label, seconds) {
    const t0 = br.rec.draws;
    let empty = 0;
    const n = Math.round(seconds * 30);
    br.rec.text.length = 0;
    for (let i = 0; i < n; i++) {
      const before = br.rec.draws;
      clock += 1000 / 30;
      br.sandbox.performance.now = () => clock;
      try { br.raf(clock); }
      catch (e) {
        chk(false, label + ': frame ' + i + ' threw: ' + (e.stack || String(e)).split('\n').slice(0, 2).join(' | '));
        return null;
      }
      if (br.rec.draws === before) empty++;
    }
    chk(br.rec.draws - t0 > 0, label + ': drew nothing at all');
    chk(empty === 0, label + ': ' + empty + ' of ' + n + ' frames drew nothing');
    return br.rec.text.join('\n');
  }
  const next = br.els.get('#next');
  let n = 0;
  for (; ;) {
    /* long enough for the slowest chapter to play through and loop */
    const words = run('chapter ' + n, 26);
    if (words === null) break;
    if (n === 2) chk(words.indexOf('about ' + T.FACTS.sensoryM + ' m long') >= 0, 'chapter 3 does not quote the measured sensory length');
    if (n === 4) chk(words.indexOf('about ' + T.FACTS.motorM + ' m long') >= 0, 'chapter 5 does not quote the measured motor length');
    if (n === 5) chk(/FIRST: the hand is pulled away/.test(words) && /SECOND: you feel the pain/.test(words), 'the race panel does not finish hand first, brain second');
    if (n > 0 && /again/i.test(String(next.textContent))) break;
    if (n > 20) { chk(false, 'Next never wrapped round after 20 chapters'); break; }
    if (typeof next.onclick !== 'function') { chk(false, 'no Next handler'); break; }
    next.onclick();
    n++;
  }
  chk(n + 1 === T.CH.length, 'walked ' + (n + 1) + ' chapters, expected ' + T.CH.length);
  /* the speed toggle on the first chapter, and every bar button */
  next.onclick();
  ['#tSlow', '#tFast', '#replay', '#prev'].forEach(sel => {
    const e = br.els.get(sel);
    if (!e || typeof e.onclick !== 'function') { chk(sel === '#prev', sel + ': not wired up'); return; }
    let t = null;
    try { e.onclick(); } catch (err) { t = err; }
    chk(!t, sel + ': threw when pressed: ' + (t && t.message));
    if (!t) run(sel + ' pressed', sel === '#tSlow' ? 20 : 4);
  });

  const uniq = [...new Set(br.rec.bad)];
  chk(uniq.length === 0, 'non-finite values reached the canvas: ' + uniq.slice(0, 6).join(', '));
  const strayU = [...new Set(br.rec.stray)];
  chk(strayU.length === 0, 'text drawn outside the ' + br.SW + '×' + br.SH + ' stage: ' + strayU.slice(0, 5).join('; '));
  const junkU = [...new Set(br.rec.junk)];
  chk(junkU.length === 0, 'a caption came out as a value rather than words: ' + junkU.slice(0, 5).join('; '));
  console.log('    ' + (n + 1) + ' chapters, ' + br.rec.draws.toLocaleString() + ' draw calls');
}

/* =================================================================== */
text();
model();
render();
console.log('\n' + checks + ' checks, ' + fails + ' failure' + (fails === 1 ? '' : 's'));
process.exit(fails ? 1 : 0);
