/* Tests for the 2D energy scenes in this folder.
 *
 *   node energy/test-energy-scenes.js
 *
 * Three passes, in the same spirit as 3dreactionscenes/test-scenes.js and
 * particles/test-render.js:
 *
 *   1. TEXT      the file is still one self-contained page, and its script
 *                parses.
 *   2. MODEL     the data tables are pulled OUT of the page and executed, so
 *                the physics constants, the shape of the heating curve and the
 *                bond-energy arithmetic are checked against the real source
 *                rather than a copy of it. Equations are balanced atom by atom
 *                and bond by bond.
 *   3. RENDER    every frame of every chapter is driven under a stub canvas,
 *                looking for thrown errors, non-finite coordinates and frames
 *                that draw nothing. This is the pass that catches a variable
 *                referenced out of scope: `node --check` cannot see it, and in
 *                the browser it kills the first frame and leaves a blank page
 *                with the panel still sitting on top of it.
 *
 * What none of it can tell you is whether anything LOOKS right. Check that
 * yourself in a browser.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const FILES = ['energy-physical-change.html', 'energy-chemical-change.html'];

let checks = 0, fails = 0;
function chk(ok, msg) {
  checks++;
  if (!ok) { fails++; console.log('    ✗ ' + msg); }
}
function section(name) { console.log('\n' + name); }
function read(f) { return fs.readFileSync(path.join(HERE, f), 'utf8'); }
function scriptOf(html) {
  const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
  return m ? m[1] : '';
}
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);
/* Pull a declaration out of the page by brace matching, so the test runs the
   page's own table rather than a transcription of it. */
function decl(js, start) {
  const i = js.indexOf(start);
  if (i < 0) return null;
  /* A declaration can open with a brace, a bracket or a call, so match all
     three kinds and skip anything inside a string or a comment. */
  let j = i;
  if (start.indexOf('function') === 0) {
    j = js.indexOf('{', i);                 /* skip the parameter list */
  } else {
    while (j < js.length && '{[('.indexOf(js[j]) < 0) j++;
  }
  if (j >= js.length) return null;
  const open = '{[(', close = '}])';
  let depth = 0, q = null;
  for (let k = j; k < js.length; k++) {
    const ch = js[k];
    if (q) {
      if (ch === BACKSLASH) { k++; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && js[k + 1] === '*') { k = js.indexOf('*/', k) + 1; continue; }
    if (ch === '/' && js[k + 1] === '/') { k = js.indexOf(NEWLINE, k); continue; }
    if (open.indexOf(ch) >= 0) depth++;
    else if (close.indexOf(ch) >= 0) { depth--; if (depth === 0) return js.slice(i, k + 1) + ';'; }
  }
  return null;
}
function line(js, re) {
  const m = js.match(re);
  return m ? m[0] : null;
}
/* The one palette, read from where the rest of the repo keeps it: the `EL`
   table at the top of each 3dreactionscenes scene. Colours there are three.js
   hex literals (0xd8402f); the 2D scenes need CSS strings (#d8402f). */
function readScenePalette() {
  const dir = path.join(HERE, '..', '3dreactionscenes');
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.html')); } catch (e) { return out; }
  files.forEach(f => {
    const js = scriptOf(fs.readFileSync(path.join(dir, f), 'utf8'));
    const table = decl(js, 'const EL = {');
    if (!table) return;
    const re = /(\w+):\s*\{name:'([^']+)',\s*col:0x([0-9a-f]{6}),\s*r:([0-9.]+)/g;
    let m;
    while ((m = re.exec(table))) {
      const [, sym, name, col, r] = m;
      if (!out[sym]) out[sym] = { name, col: '#' + col, r: parseFloat(r), file: f };
    }
  });
  return out;
}

/* ===================================================================
   1. TEXT
   =================================================================== */
function text() {
  section('TEXT  one self-contained page each');
  FILES.forEach(f => {
    const html = read(f);
    const js = scriptOf(html);
    chk(js.length > 2000, f + ': no inline script found');
    chk(!/<script[^>]+src=/.test(html), f + ': pulls in an external script; these pages must work off disk');
    chk(!/require\(|import\s/.test(js), f + ': uses a module system');
    chk(/<title>/.test(html), f + ': no <title>');
    chk(/aria-label/.test(html), f + ': canvas has no aria-label');
    /* The prose panel was deliberately removed: the scenes are meant to be
       read off the canvas on a projector, not from a column of text. Keep the
       furniture to the key and the control bar, and keep the bar's controls --
       without them there is no way to reach chapter two. */
    chk(!/id="panel"/.test(html), f + ': the explainer panel is back');
    chk(!/id="body"/.test(html), f + ': the prose body is back');
    chk(/id="bar"/.test(html), f + ': no control bar');
    ['#prev', '#next', '#dots', '#replay', '#kicker', '#title', '#ctrl'].forEach(id => {
      chk(html.indexOf('id="' + id.slice(1) + '"') > 0, f + ': the bar has no ' + id);
    });
    /* every href the page needs must be a font stylesheet, nothing else */
    (html.match(/href="([^"]+)"/g) || []).forEach(h => {
      chk(/fonts\.(googleapis|gstatic)\.com/.test(h), f + ': unexpected external asset ' + h);
    });
    let threw = null;
    try { new vm.Script(js, { filename: f }); } catch (e) { threw = e; }
    chk(!threw, f + ': script does not parse: ' + (threw && threw.message));
    /* the page's own animation must be a function of time, not an integrator */
    chk(!/\+=\s*v[xy]\s*\*\s*dt/.test(js), f + ': looks like per-frame integration; keep the scenes closed-form');
  });
}

/* ===================================================================
   2a. MODEL  the heating curve
   =================================================================== */
function physical() {
  section('MODEL  physical change: the heating curve');
  const js = scriptOf(read('energy-physical-change.html'));
  const src = [
    line(js, /const clamp=[^\n]+/),
    line(js, /const lerp=[^\n]+/),
    decl(js, 'const WATER={'),
    decl(js, 'function mkrun('),
    decl(js, 'const RUN_MELT='),
    decl(js, 'const RUN_BOIL='),
    decl(js, 'const RUN_COOL='),
    decl(js, 'const RUN_FULL='),
    decl(js, 'const RUN_FULL_REV='),
    line(js, /const kJ=[^\n]+/),
    decl(js, 'const FACTS={')
  ];
  chk(src.every(Boolean), 'could not extract the run model from the page');
  if (!src.every(Boolean)) return;
  const box = {};
  vm.createContext(box);
  vm.runInContext(src.join('\n') + '\nthis.out={WATER,RUN_MELT,RUN_BOIL,RUN_COOL,RUN_FULL,RUN_FULL_REV,FACTS};', box);
  const { WATER, RUN_MELT, RUN_BOIL, RUN_COOL, RUN_FULL, RUN_FULL_REV, FACTS } = box.out;

  /* the constants are the data book values, not tuned for the animation */
  chk(WATER.ci === 2100, 'specific heat capacity of ice should be 2100, is ' + WATER.ci);
  chk(WATER.cw === 4200, 'specific heat capacity of water should be 4200, is ' + WATER.cw);
  chk(WATER.cs === 2000, 'specific heat capacity of steam should be 2000, is ' + WATER.cs);
  chk(WATER.Lf === 334000, 'specific latent heat of fusion should be 334000, is ' + WATER.Lf);
  chk(WATER.Lv === 2260000, 'specific latent heat of vaporisation should be 2260000, is ' + WATER.Lv);
  /* ice must not warm at the same rate as water, or the curve teaches nothing */
  chk(WATER.ci < WATER.cw, 'ice should have a smaller specific heat capacity than water');

  const runs = { RUN_MELT, RUN_BOIL, RUN_COOL, RUN_FULL, RUN_FULL_REV };
  Object.keys(runs).forEach(name => {
    const r = runs[name];
    chk(r.total > 0, name + ': zero total energy');
    /* segments must tile the energy axis with no gap and no overlap */
    r.segs.forEach((s, i) => {
      chk(s.e0 === (i ? r.segs[i - 1].e1 : 0), name + ' segment ' + i + ': does not start where the last one ended');
      chk(s.dE > 0, name + ' segment ' + i + ': no energy in it');
      chk(typeof s.name === 'string' && s.name.length > 0, name + ' segment ' + i + ': no caption name');
    });
    chk(r.segs[r.segs.length - 1].e1 === r.total, name + ': segments do not add up to the total');

    /* a flat part must be DEAD flat -- this is the thing a pupil reads off */
    r.segs.forEach((s, i) => {
      if (s.type !== 'latent') return;
      const a = r.at(s.e0 + s.dE * 0.01).temp, b = r.at(s.e0 + s.dE * 0.99).temp;
      chk(a === b && a === s.at,
        name + ' segment ' + i + ' (' + s.name + '): plateau is not flat (' + a + ' to ' + b + ')');
      chk(s.at === 0 || s.at === 100,
        name + ' segment ' + i + ': a change of state at ' + s.at + ' °C; water does it at 0 and 100');
    });
    /* a sloping part must have gradient 1/c, so the plot IS the constant */
    r.segs.forEach((s, i) => {
      if (s.type !== 'ramp') return;
      const dT = r.at(s.e1).temp - r.at(s.e0).temp;
      const grad = dT / s.dE;
      const want = Math.sign(s.t1 - s.t0) / s.c;
      chk(Math.abs(grad - want) < 1e-12,
        name + ' segment ' + i + ': gradient ' + grad + ', expected 1/c = ' + want);
    });
    /* at() must stay inside the run */
    [-1e9, 0, r.total * 0.5, r.total, r.total + 1e9].forEach(e => {
      const s = r.at(e);
      chk(s && Number.isFinite(s.temp), name + ': at(' + e + ') gave no finite temperature');
      chk(s.u >= 0 && s.u <= 1, name + ': at(' + e + ') gave u = ' + s.u);
    });
    /* the plot's corners must be monotonic in energy */
    const pts = r.pts();
    for (let i = 1; i < pts.length; i++)
      chk(pts[i][0] >= pts[i - 1][0], name + ': graph corner ' + i + ' goes backwards in energy');
  });

  /* boiling really is the long plateau, and by the ratio the caption quotes */
  const melt = RUN_FULL.segs.find(s => s.vis === 'melt');
  const boil = RUN_FULL.segs.find(s => s.vis === 'boil');
  chk(melt && boil, 'the full run is missing a change of state');
  chk(boil.dE > melt.dE, 'the boiling plateau should be the longer one');
  chk(FACTS.ratio === (WATER.Lv / WATER.Lf).toFixed(1),
    'the quoted ratio ' + FACTS.ratio + ' is not Lv/Lf');
  chk(FACTS.Lf === 334 && FACTS.Lv === 2260, 'the quoted latent heats are not the constants in kJ');
  chk(Math.abs(FACTS.fullShares.reduce((a, s) => a + parseFloat(s.pc), 0) - 100) < 0.3,
    'the stage percentages do not add up to 100: ' + FACTS.fullShares.map(s => s.pc).join(' '));

  /* heating and cooling must be each other's mirror: the same joules, the
     same plateaux, the same temperatures, in the opposite order */
  chk(Math.abs(RUN_FULL.total - RUN_FULL_REV.total) < 1e-9,
    'cooling the sample back down does not involve the same energy as heating it up');
  const up = RUN_FULL.segs.map(s => s.dE).reverse();
  const down = RUN_FULL_REV.segs.map(s => s.dE);
  up.forEach((v, i) => chk(Math.abs(v - down[i]) < 1e-9,
    'reversed run segment ' + i + ' is ' + down[i] + ' J, not ' + v + ' J'));
  const REV = { solid: 'solid', liquid: 'liquid', gas: 'gas', melt: 'freeze', boil: 'condense' };
  RUN_FULL.segs.slice().reverse().forEach((s, i) => {
    chk(RUN_FULL_REV.segs[i].vis === REV[s.vis],
      'reversed run segment ' + i + ' shows ' + RUN_FULL_REV.segs[i].vis + ', not ' + REV[s.vis]);
  });

  /* ---- which way the blocks go ----
     This is the whole teaching point of the scene, and it is the one thing a
     pupil will read straight off the screen, so run the page's own flowDir()
     over every segment of every run rather than eyeballing the source.
     The rule: a change of state carries its own direction whichever way the
     run is being driven (melting always takes energy IN, freezing always
     gives it OUT); a sloping part follows the driving. */
  const dsrc = [
    decl(js, 'const ENDO=new Set('),
    decl(js, 'const EXO=new Set('),
    decl(js, 'function flowDir(')
  ];
  chk(dsrc.every(Boolean), 'could not extract the flow direction rule');
  if (!dsrc.every(Boolean)) return;
  vm.runInContext(dsrc.join('\n') + '\nthis.flowDir=flowDir;this.ENDO=ENDO;this.EXO=EXO;', box);
  const flowDir = box.flowDir;

  chk(box.ENDO.has('melt') && box.ENDO.has('boil'), 'ENDO should hold melt and boil');
  chk(box.EXO.has('freeze') && box.EXO.has('condense'), 'EXO should hold freeze and condense');
  chk(!box.ENDO.has('freeze') && !box.ENDO.has('condense'), 'ENDO must not contain freezing or condensing');
  chk(!box.EXO.has('melt') && !box.EXO.has('boil'), 'EXO must not contain melting or boiling');

  /* a change of state ignores the driving; melting in a freezer is still
     endothermic */
  [true, false].forEach(heating => {
    RUN_FULL.segs.concat(RUN_FULL_REV.segs).forEach(s => {
      if (s.type !== 'latent') return;
      const want = box.ENDO.has(s.vis) ? 1 : -1;
      chk(flowDir(s, heating) === want,
        s.vis + ' should always be energy ' + (want > 0 ? 'IN' : 'OUT') +
        ', but with heating=' + heating + ' it is ' + flowDir(s, heating));
    });
  });
  /* heating the sample from ice to steam must be energy IN at every single
     point of the run, and cooling it back down must be energy OUT at every
     point -- no segment may disagree with the arrow and the caption */
  RUN_FULL.segs.forEach((s, i) => {
    chk(flowDir(s, true) === 1,
      'heating: segment ' + i + ' (' + s.name + ') says energy ' +
      (flowDir(s, true) > 0 ? 'in' : 'OUT') + ', but the flame is on');
  });
  RUN_FULL_REV.segs.forEach((s, i) => {
    chk(flowDir(s, false) === -1,
      'cooling: segment ' + i + ' (' + s.name + ') says energy ' +
      (flowDir(s, false) > 0 ? 'IN' : 'out') + ', but the sample is being cooled');
  });
  /* the other runs, driven the way their chapter drives them */
  [[RUN_MELT, true, 1], [RUN_BOIL, true, 1], [RUN_COOL, false, -1]].forEach(([r, heating, want], n) => {
    r.segs.forEach((s, i) => {
      chk(flowDir(s, heating) === want,
        'run ' + n + ' segment ' + i + ' (' + s.name + ') goes the wrong way: ' + flowDir(s, heating));
    });
  });

  /* ---- and the call site ----
     The checks above test flowDir() on its own, which is not where this has
     already gone wrong. The reversed run's segments ALREADY say freeze and
     condense, so flipping flowDir's answer a second time for the reversed
     run turns condensing into an endothermic change on screen: blocks
     pouring INTO a beaker that is giving energy out. Nothing in the render
     pass can see that, so pin the one line down. */
  const call = line(js, /const dir=flowDir\([^\n]*/);
  chk(call === 'const dir=flowDir(st.seg,heating);',
    'the direction is no longer taken straight from flowDir(st.seg,heating). ' +
    'Found: ' + call + ' -- do not negate it for the reversed run; set `heating` instead.');
  chk(/const heating=!reversed&&c\.heat==='fire';/.test(js),
    '`heating` must be false whenever the run is reversed, since that is the only ' +
    'thing telling flowDir() which way a sloping part of the curve is being driven');
  chk(/const reversed=!!\(c\.rev&&coolMode\);/.test(js),
    'the reversed-run flag should be worked out once, not re-tested at each use');
}

/* ===================================================================
   2b. MODEL  the bond energies
   =================================================================== */
function chemical() {
  section('MODEL  chemical change: bond energies and balanced equations');
  const js = scriptOf(read('energy-chemical-change.html'));
  const src = [
    decl(js, 'const EL={'),
    line(js, /const BLOCK_kJ=[^\n]+/),
    decl(js, 'const SP={'),
    decl(js, 'const RX={'),
    decl(js, 'function tally('),
    decl(js, 'function sums('),
    line(js, /Object\.keys\(RX\)\.forEach\(k=>\{RX\[k\]\.sum=sums\(RX\[k\]\);\}\);/),
    decl(js, 'const BENCH={')
  ];
  chk(src.every(Boolean), 'could not extract the chemistry tables from the page');
  if (!src.every(Boolean)) return;
  const box = {};
  vm.createContext(box);
  vm.runInContext(src.join('\n') + '\nthis.out={EL,SP,RX,BENCH,BLOCK_kJ};', box);
  const { EL, SP, RX, BENCH, BLOCK_kJ } = box.out;

  /* The shared palette. Rather than keep a copy here -- a test that mirrors
     what it is testing proves nothing -- read the EL tables out of the
     3dreactionscenes files and compare against those. An element must not
     change colour or size between scenes. */
  const PALETTE = readScenePalette();
  chk(Object.keys(PALETTE).length >= 5,
    'could not read the element palette out of 3dreactionscenes (' +
    Object.keys(PALETTE).length + ' elements found)');
  Object.keys(EL).forEach(sym => {
    const want = PALETTE[sym];
    chk(want, sym + ' is not in any 3dreactionscenes EL table, so its colour is unchecked');
    if (!want) return;
    chk(EL[sym].col === want.col,
      sym + ' is ' + EL[sym].col + ' here but ' + want.col + ' in ' + want.file);
    chk(EL[sym].r === want.r,
      sym + ' has radius ' + EL[sym].r + ' here but ' + want.r + ' in ' + want.file);
    chk(EL[sym].name === want.name,
      sym + ' is called "' + EL[sym].name + '" here but "' + want.name + '" in ' + want.file);
  });
  /* a cation is smaller and an anion bigger, but there are no ions here, so
     the only size rule left is that hydrogen is the smallest thing on screen */
  Object.keys(EL).forEach(s => {
    if (s !== 'H') chk(EL[s].r > EL.H.r, s + ' is drawn no bigger than hydrogen');
  });

  /* every species' geometry must be consistent with itself */
  Object.keys(SP).forEach(k => {
    const s = SP[k];
    chk(s.atoms.length >= 2, k + ': fewer than two atoms');
    chk(s.f && s.f.length, k + ': no formula to label it with');
    s.atoms.forEach((a, i) => {
      chk(EL[a[0]], k + ' atom ' + i + ': unknown element ' + a[0]);
      chk(Number.isFinite(a[1]) && Number.isFinite(a[2]), k + ' atom ' + i + ': bad coordinates');
    });
    s.bonds.forEach((b, i) => {
      chk(b[0] < s.atoms.length && b[1] < s.atoms.length, k + ' bond ' + i + ': points at an atom that is not there');
      chk(b[0] !== b[1], k + ' bond ' + i + ': joins an atom to itself');
      chk(b[2] >= 1 && b[2] <= 3, k + ' bond ' + i + ': bond order ' + b[2]);
      chk(typeof b[3] === 'string' && b[3].length, k + ' bond ' + i + ': no name');
    });
    /* the geometry must hold together: no atom left unbonded */
    const touched = new Set();
    s.bonds.forEach(b => { touched.add(b[0]); touched.add(b[1]); });
    chk(touched.size === s.atoms.length, k + ': an atom has no bonds, so it would float off on its own');
  });

  function atoms(side) {
    const c = {};
    side.forEach(e => {
      SP[e[0]].atoms.forEach(a => { c[a[0]] = (c[a[0]] || 0) + e[1]; });
    });
    return c;
  }
  function bondsOf(side) {
    const c = {};
    side.forEach(e => {
      SP[e[0]].bonds.forEach(b => { c[b[3]] = (c[b[3]] || 0) + e[1]; });
    });
    return c;
  }
  function same(a, b) {
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return k;
    return null;
  }

  Object.keys(RX).forEach(k => {
    const rx = RX[k], S = rx.sum;
    chk(rx.eq && / → /.test(rx.eq), k + ': the equation has no reaction arrow');
    chk(rx.note && rx.note.length > 20, k + ': no note saying where this reaction turns up');

    /* the equation must balance, atom by atom */
    const bad = same(atoms(rx.r), atoms(rx.p));
    chk(!bad, k + ' (' + rx.eq + ') does not balance: ' + bad +
      ' is ' + (atoms(rx.r)[bad] || 0) + ' on the left and ' + (atoms(rx.p)[bad] || 0) + ' on the right');

    /* the bonds counted must be exactly the bonds drawn. This is the check
       that stops the ledger and the animation drifting apart. */
    const brkWant = bondsOf(rx.r), makWant = bondsOf(rx.p);
    const brkGot = {}; rx.brk.forEach(r => { brkGot[r[0]] = (brkGot[r[0]] || 0) + r[2]; });
    const makGot = {}; rx.mak.forEach(r => { makGot[r[0]] = (makGot[r[0]] || 0) + r[2]; });
    const b1 = same(brkWant, brkGot);
    chk(!b1, k + ': the reactants contain ' + (brkWant[b1] || 0) + ' ' + b1 +
      ' bonds but the ledger breaks ' + (brkGot[b1] || 0));
    const b2 = same(makWant, makGot);
    chk(!b2, k + ': the products contain ' + (makWant[b2] || 0) + ' ' + b2 +
      ' bonds but the ledger makes ' + (makGot[b2] || 0));

    /* bond energies: positive, and the same value wherever that bond appears */
    rx.brk.concat(rx.mak).forEach(r => {
      chk(r[1] > 0 && r[1] < 1200, k + ': bond energy for ' + r[0] + ' is ' + r[1] + ' kJ/mol');
      chk(r[2] >= 1, k + ': ' + r[0] + ' appears ' + r[2] + ' times');
    });

    /* the arithmetic, done independently of sums() */
    const bin = rx.brk.reduce((a, r) => a + r[1] * r[2], 0);
    const bout = rx.mak.reduce((a, r) => a + r[1] * r[2], 0);
    chk(S.bin === bin, k + ': energy in is ' + S.bin + ', should be ' + bin);
    chk(S.bout === bout, k + ': energy out is ' + S.bout + ', should be ' + bout);
    chk(S.net === bin - bout, k + ': net is ' + S.net + ', should be ' + (bin - bout));
    /* exothermic MUST mean a negative overall change, in both directions */
    chk(S.exo === (S.net < 0), k + ': called ' + (S.exo ? 'exothermic' : 'endothermic') +
      ' with an overall change of ' + S.net);
    chk(S.net !== 0, k + ': an overall change of exactly zero teaches nothing');
    chk(Math.abs(S.net) >= 100, k + ': overall change of only ' + S.net +
      ' kJ/mol is too small to read off the profile');
    /* the profile needs a hill to climb, or the two steps are not visible */
    chk(bin > Math.abs(S.net), k + ': the bond-breaking hump is not taller than the overall change');
  });

  /* a bond must be worth the same in every reaction that uses it */
  const seen = {};
  Object.keys(RX).forEach(k => {
    RX[k].brk.concat(RX[k].mak).forEach(r => {
      if (seen[r[0]] === undefined) seen[r[0]] = { v: r[1], k };
      else chk(seen[r[0]].v === r[1],
        r[0] + ' is ' + seen[r[0]].v + ' kJ/mol in ' + seen[r[0]].k + ' but ' + r[1] + ' in ' + k);
    });
  });
  /* against the data book */
  const BOOK = { 'H–H': 436, 'Cl–Cl': 242, 'H–Cl': 431, 'N≡N': 945, 'O=O': 498, 'N=O': 631, 'C–H': 413, 'C=O': 805, 'O–H': 464 };
  Object.keys(BOOK).forEach(b => {
    chk(seen[b], 'bond ' + b + ' is never used');
    if (seen[b]) chk(seen[b].v === BOOK[b], b + ' is ' + seen[b].v + ' kJ/mol, data book says ' + BOOK[b]);
  });
  /* the triple bond in nitrogen is what makes N2 + O2 endothermic; if it ever
     stops being the strongest bond on the table, that explanation is wrong */
  const strongest = Object.keys(seen).reduce((a, b) => seen[b].v > seen[a].v ? b : a);
  chk(strongest === 'N≡N', 'the captions say N≡N is the exceptionally strong one, but ' + strongest + ' is stronger');

  /* the classroom demonstrations must go the way they are labelled */
  chk(BENCH.exo.kind === 'exo' && BENCH.exo.t1 > BENCH.exo.t0,
    'the exothermic demonstration does not get hotter');
  chk(BENCH.endo.kind === 'endo' && BENCH.endo.t1 < BENCH.endo.t0,
    'the endothermic demonstration does not get colder');
  chk(Math.abs(BENCH.exo.t1 - BENCH.exo.t0) >= 5 && Math.abs(BENCH.endo.t1 - BENCH.endo.t0) >= 5,
    'a temperature change of a few degrees will not read on a projector');
  [BENCH.exo, BENCH.endo].forEach((b, i) => {
    chk(/→/.test(b.eq), 'bench reaction ' + i + ': no equation');
    chk(b.fizz > 0, 'bench reaction ' + i + ': no fizzing, so the two look different for the wrong reason');
  });
  /* both demonstrations fizz on purpose: the lesson is that fizzing is not
     the clue, the thermometer is */
  chk(BENCH.exo.fizz > 0 && BENCH.endo.fizz > 0,
    'both bench reactions should visibly react, so the thermometer is the only difference');

  chk(BLOCK_kJ === 100, 'one block should be 100 kJ/mol, is ' + BLOCK_kJ);
  /* the legend states the block value, so it must not drift from the code */
  const html = read('energy-chemical-change.html');
  chk(html.indexOf('block = 100 kJ per mole') > 0,
    'the legend no longer agrees with BLOCK_kJ = ' + BLOCK_kJ);
}

/* ===================================================================
   3. RENDER  drive every frame of every chapter
   =================================================================== */
function render() {
  section('RENDER  every frame of every chapter, under a stub canvas');
  FILES.forEach(f => renderOne(f));
}
function renderOne(f) {
  const js = scriptOf(read(f));
  const els = new Map();
  const bad = [];
  const stray = [];
  const junk = [];
  let drawCalls = 0;
  const DRAW = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'clearRect']);

  /* The stage size the scene lays itself out in. The stub ignores the
     canvas transform, so every coordinate the page passes is already in
     stage space and can be compared against it directly. */
  const dim = js.match(/const SW=(\d+),SH=(\d+);/);
  const SW = dim ? +dim[1] : 0, SH = dim ? +dim[2] : 0;
  chk(SW > 0 && SH > 0, f + ': could not find the stage size');
  /* Labels drawn off the edge are invisible on a projector and are the
     usual symptom of a layout constant left behind after a resize. */
  const MARGIN = 30;
  function watchText(s, x, y) {
    if (Number.isFinite(x) && Number.isFinite(y) &&
      (x < -MARGIN || x > SW + MARGIN || y < -MARGIN || y > SH + MARGIN)) {
      stray.push(JSON.stringify(String(s).slice(0, 34)) + ' at ' + Math.round(x) + ',' + Math.round(y));
    }
    /* A caption showing "[native code]" means an object was expected and a
       string was passed (or the other way round) -- exactly how
       String.prototype.sub once ended up printed under the thermometer. */
    const str = String(s);
    if (/\[native code\]|\bundefined\b|NaN|\[object |function \w*\(/.test(str)) {
      junk.push(JSON.stringify(str.slice(0, 60)));
    }
  }

  function El(sel) {
    this.sel = sel; this.children = []; this.style = {}; this.dataset = {};
    this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false;
    this.className = ''; this.tagName = 'DIV'; this.scrollTop = 0; this.offsetHeight = 300;
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.insertBefore = function (c) { this.children.push(c); return c; };
  El.prototype.setAttribute = function () {};
  El.prototype.addEventListener = function () {};
  El.prototype.querySelector = function () { return null; };
  El.prototype.querySelectorAll = function () { return []; };

  const raw = {
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
    ellipse() {}, bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, clip() {},
    setLineDash() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {},
    clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    measureText(s) { return { width: String(s).length * 7 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  const ctx = new Proxy(raw, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return function (...a) {
        a.forEach((x, i) => {
          if (typeof x === 'number' && !Number.isFinite(x)) bad.push(k + ' arg ' + i + ' = ' + x);
        });
        if (k === 'fillText' || k === 'strokeText') watchText(a[0], a[1], a[2]);
        if (DRAW.has(k)) drawCalls++;
        return v.apply(t, a);
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k + ' = ' + v);
      if (typeof v === 'string' && /NaN|undefined/.test(v)) bad.push(k + ' = ' + v);
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
  /* the reaction selector is looked up by class, and pressing it re-enters
     show(), so it has to be exercised */
  const rxBtns = ['hcl', 'ch4', 'no'].map(k => { const e = new El('.rx.' + k); e.dataset.rx = k; return e; });
  let rafCb = null;
  const sandbox = {
    console,
    document: {
      querySelector: get,
      querySelectorAll: (sel) => (sel === '.rxsel .btn' ? rxBtns : []),
      createElement: (tag) => { const e = new El(tag); e.tagName = tag.toUpperCase(); e.getContext = () => ctx; return e; },
      addEventListener() {}
    },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    performance: { now: () => 0 },
    addEventListener() {},
    innerWidth: 1600, innerHeight: 900, devicePixelRatio: 2,
    Math, Date, JSON, Set, Map, isFinite, parseInt, parseFloat, setTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  let threw = null;
  try { vm.runInContext(js, sandbox, { filename: f }); } catch (e) { threw = e; }
  chk(!threw, f + ': threw on load: ' + (threw && (threw.stack || '').split('\n').slice(0, 2).join(' | ')));
  if (threw) return;
  chk(typeof rafCb === 'function', f + ': never asked for an animation frame');
  if (typeof rafCb !== 'function') return;

  /* Drive frames. requestAnimationFrame re-registers every frame, so calling
     the captured callback with a rising clock walks the page's real loop. */
  function run(label, seconds) {
    const t0 = drawCalls;
    let empty = 0;
    const step = 1000 / 30, n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) {
      const before = drawCalls;
      sandbox.performance.now = () => i * step;
      try { rafCb(i * step); }
      catch (e) {
        chk(false, f + ' ' + label + ': frame ' + i + ' threw: ' +
          (e.stack || String(e)).split('\n').slice(0, 2).join(' | '));
        return false;
      }
      if (drawCalls === before) empty++;
    }
    chk(drawCalls - t0 > 0, f + ' ' + label + ': drew nothing at all');
    chk(empty === 0, f + ' ' + label + ': ' + empty + ' of ' + n + ' frames drew nothing');
    return true;
  }

  const next = els.get('#next');
  let n = 0;
  for (; ;) {
    if (!run('chapter ' + n, 9)) break;
    if (n > 0 && /again/i.test(String(next.textContent))) break;
    if (n > 20) { chk(false, f + ': Next never wrapped round after 20 chapters'); break; }
    if (typeof next.onclick !== 'function') { chk(false, f + ': no Next handler'); break; }
    next.onclick();
    n++;
  }
  chk(n >= 5, f + ': expected at least 6 chapters, walked ' + (n + 1));

  /* every button the page wires up must survive being pressed */
  ['#replay', '#minBtn', '#tHeat', '#tCool', '#q1check', '#q2check'].forEach(sel => {
    const e = els.get(sel);
    if (!e || typeof e.onclick !== 'function') return;
    let t = null;
    try { e.onclick(); } catch (err) { t = err; }
    chk(!t, f + ' ' + sel + ': threw when pressed: ' + (t && t.message));
    if (!t) run(sel + ' pressed', 3);
  });
  /* and every reaction in the selector must render on every chapter */
  rxBtns.forEach(b => {
    if (typeof b.onclick !== 'function') return;
    let t = null;
    try { b.onclick(); } catch (err) { t = err; }
    chk(!t, f + ': selecting ' + b.dataset.rx + ' threw: ' + (t && t.message));
    if (!t) run('reaction ' + b.dataset.rx, 10);
  });

  const uniq = [...new Set(bad)];
  chk(uniq.length === 0, f + ': non-finite values reached the canvas: ' + uniq.slice(0, 6).join(', '));
  const strayU = [...new Set(stray)];
  chk(strayU.length === 0, f + ': text drawn outside the ' + SW + '×' + SH +
    ' stage, so it will not be on screen: ' + strayU.slice(0, 5).join('; '));
  const junkU = [...new Set(junk)];
  chk(junkU.length === 0, f + ': a caption came out as a value rather than words: ' +
    junkU.slice(0, 5).join('; '));
  console.log('    ' + f + ': ' + (n + 1) + ' chapters, ' + drawCalls.toLocaleString() + ' draw calls');
}

/* =================================================================== */
text();
physical();
chemical();
render();
console.log('\n' + checks + ' checks, ' + fails + ' failure' + (fails === 1 ? '' : 's'));
process.exit(fails ? 1 : 0);
