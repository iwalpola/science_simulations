/* ===========================================================================
   Tests for the 3D reaction scenes.   Run with:  node test-scenes.js
   No dependencies — the scene files are read as text and the species tables,
   captions and timing windows are pulled out and checked.

   What this can check:
     - every species combination is balanced, named and has a track to follow
     - captions are ordered, non-empty, and end before the timeline does
     - camera tracks cover their act and the fade points really change world
     - the choreography is causally ordered: nothing arrives before it departs

   What it cannot check: whether any of it looks right. Open the file for that.
=========================================================================== */

const fs = require('fs');
const path = require('path');

let fails = 0, checks = 0;
function chk(ok, msg){
  checks++;
  if(!ok){ fails++; console.log('    FAIL  ' + msg); }
}
function section(s){ console.log('\n' + s); }

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const scriptOf = html => {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if(!m) throw new Error('no inline script found');
  return m[1];
};

/* pull a region of source out between two anchors */
function region(js, from, to){
  const a = js.indexOf(from), b = js.indexOf(to);
  if(a < 0) throw new Error('anchor not found: ' + from);
  if(b < 0) throw new Error('anchor not found: ' + to);
  return js.slice(a, b);
}

/* evaluate some extracted source and expose the named bindings */
function evaluate(src, exposed, setter){
  const getters = exposed.map(n => `get ${n}(){return typeof ${n}==='undefined'?undefined:${n}}`);
  const setters = setter ? [`set pick(v){${setter}}`] : [];
  const body = src + `\nreturn {${getters.concat(setters).join(',')}};`;
  return new Function('location', body)({search:''});
}

/* read the numbers out of one timing window, e.g. ramp(t,33.8,35.6) */
function window_(js, pattern, label){
  const m = js.match(pattern);
  if(!m){ fails++; checks++; console.log('    FAIL  could not read timing: ' + label); return null; }
  return m.slice(1).map(Number);
}
const N = '(-?[0-9.]+)';
const rampRe = prefix =>
  new RegExp(prefix + '\\s*=\\s*ramp\\(\\s*t\\s*,\\s*' + N + '\\s*,\\s*' + N + '\\s*\\)');

/* ---------------------------------------------------------------------------
   shared checks — every scene should satisfy these
--------------------------------------------------------------------------- */
function checkTimeline(S, nCaptions, actStarts){
  const segs = S.SEGS;
  chk(segs.length === nCaptions, `expected ${nCaptions} captions, got ${segs.length}`);
  for(let i=1;i<segs.length;i++)
    chk(segs[i].t > segs[i-1].t, `caption ${i} is not after caption ${i-1}`);
  chk(segs[segs.length-1].t < S.TOTAL, 'last caption starts at or after the end of the timeline');
  segs.forEach((s,i)=> chk(s.c && s.c.trim().length > 0, `caption ${i} is empty`));

  S.TRANSITIONS.forEach(T=>{
    chk(S.worldAt(T-0.01) !== S.worldAt(T+0.01), `the fade at ${T}s does not change world`);
  });

  Object.keys(S.CAM).forEach(w=>{
    const k = S.CAM[w];
    for(let i=1;i<k.length;i++)
      chk(k[i].t > k[i-1].t, `${w} camera key ${i} is not after key ${i-1}`);
    chk(k[0].t === actStarts[w], `${w} camera starts at ${k[0].t}, expected ${actStarts[w]}`);
    k.forEach((key,i)=>{
      chk(key.p.length===3 && key.l.length===3, `${w} camera key ${i} is not a 3-vector`);
      chk(key.p.every(Number.isFinite) && key.l.every(Number.isFinite),
          `${w} camera key ${i} has a non-finite component`);
    });
  });

  const m2 = S.CAM.micro2;
  chk(m2[m2.length-1].t >= S.TOTAL, 'the final camera key stops before the timeline ends');
}

/* ===========================================================================
   SCENE 01 — acid + metal oxide
=========================================================================== */
function scene01(){
  section('SCENE 01  acid-metal-oxide.html');
  const js = scriptOf(read('acid-metal-oxide.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'const ANION_PATHS', 'function buildMicro2()')
            + region(js, 'const TOTAL = 50', 'const camPos=');

  const S = evaluate(src,
    ['OXIDES','ACIDS','derive','equation','saltFormula','saltName','buildCaptions',
     'ANION_PATHS','CAM','TOTAL','TRANSITIONS','worldAt','SEGS','OX','AC','AN','NANION'],
    'oxideKey=v[0];acidKey=v[1];');

  const combos = [];
  for(const ok of Object.keys(S.OXIDES)) for(const ak of Object.keys(S.ACIDS)){
    S.pick = [ok, ak];
    S.derive();
    S.buildCaptions();
    combos.push(`${ok}+${ak} → ${S.equation()}`);

    chk(2 + S.NANION * S.AN.charge === 0,
        `${ok}+${ak}: charge does not balance (2 cation, ${S.NANION} × ${S.AN.charge})`);
    chk(S.ANION_PATHS[S.NANION] && S.ANION_PATHS[S.NANION].length === S.NANION,
        `${ok}+${ak}: no anion track for ${S.NANION} anion(s)`);
    // each anion needs a distinct start, middle and end, or it will not move
    (S.ANION_PATHS[S.NANION]||[]).forEach((k,i)=>{
      chk(JSON.stringify(k.s) !== JSON.stringify(k.e),
          `${ok}+${ak}: anion ${i} starts where it ends`);
    });
    chk(S.equation().includes('→') && S.equation().includes('H₂O'),
        `${ok}+${ak}: equation looks wrong — ${S.equation()}`);
    chk(S.saltFormula().startsWith(S.OX.sym), `${ok}+${ak}: salt formula does not start with the metal`);
    chk(/^[a-z(]/.test(S.saltName()), `${ok}+${ak}: salt name should be lower case — ${S.saltName()}`);

    checkTimeline(S, 16, {macro:0, micro1:7.2, micro2:27.0});
  }
  console.log('    ' + combos.length + ' combinations:');
  combos.forEach(c => console.log('      ' + c));

  /* choreography: the Cu–O bond must break before the products form */
  const bondBreak = window_(js, /const bondFade = 1 - ramp\(t,([0-9.]+),([0-9.]+)\)/, 'M–O bond breaks');
  const ohOn      = window_(js, rampRe('const ohOn'), 'O–H bonds form');
  const linkOn    = window_(js, rampRe('const linkOn'), 'metal···anion attraction');
  if(bondBreak && ohOn && linkOn){
    chk(bondBreak[1] <= ohOn[0], `the M–O bond must break (${bondBreak[1]}s) before O–H forms (${ohOn[0]}s)`);
    chk(bondBreak[1] <= linkOn[0], `the M–O bond must break (${bondBreak[1]}s) before the salt pairs up (${linkOn[0]}s)`);
  }

  /* the powder must be released only while the spoon is actually tipping */
  const rel = window_(js, /const RELEASE_A = ([0-9.]+), RELEASE_B = ([0-9.]+)/, 'grain release');
  const tip = window_(js, /spoon\.rotation\.z = -1\.95\*ramp\(t,([0-9.]+),([0-9.]+)\)/, 'spoon tip');
  if(rel && tip){
    chk(rel[0] >= tip[0], `grains fall at ${rel[0]}s but the spoon only starts tipping at ${tip[0]}s`);
    chk(rel[1] <= tip[1] + 0.5, `grains are still falling at ${rel[1]}s, after the spoon finished tipping at ${tip[1]}s`);
  }
}

/* ===========================================================================
   SCENE 04 — metal + acid
=========================================================================== */
function scene04(){
  section('SCENE 04  metal-acid.html');
  const js = scriptOf(read('metal-acid.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'const ANION_PATHS', 'function buildMicro2()')
            + region(js, 'const TOTAL = 57', 'const camPos=');

  const S = evaluate(src,
    ['METALS','ACIDS','derive','equation','halves','saltName','tier','buildCaptions',
     'ANION_PATHS','CAM','TOTAL','TRANSITIONS','worldAt','SEGS','MT','AC','AN','NANION'],
    'metalKey=v[0];acidKey=v[1];');

  const combos = [];
  for(const mk of Object.keys(S.METALS)) for(const ak of Object.keys(S.ACIDS)){
    S.pick = [mk, ak];
    S.derive();
    S.buildCaptions();
    combos.push(`${mk}+${ak} → ${S.equation()}  (${S.tier()})`);

    chk(2 + S.NANION * S.AN.charge === 0,
        `${mk}+${ak}: charge does not balance`);
    chk(S.ANION_PATHS[S.NANION] && S.ANION_PATHS[S.NANION].length === S.NANION,
        `${mk}+${ak}: no spectator track for ${S.NANION} anion(s)`);
    chk(S.equation().includes('H₂') && !S.equation().includes('H₂O'),
        `${mk}+${ak}: this reaction makes hydrogen, not water — ${S.equation()}`);
    chk(S.halves().includes(S.MT.ion) && S.halves().includes('2e⁻'),
        `${mk}+${ak}: the half-equations are missing the ion or the electrons`);
    chk(S.MT.vigour > 0 && S.MT.vigour <= 1, `${mk}: vigour must be in (0,1]`);
    chk(['fast','steady','slow'].includes(S.tier()), `${mk}: unknown rate tier`);

    checkTimeline(S, 19, {macro:0, micro1:7.0, micro2:28.0});
  }
  console.log('    ' + combos.length + ' combinations:');
  combos.forEach(c => console.log('      ' + c));

  /* the reason this scene exists: the electrons must behave causally */
  section('    electron choreography');
  const outA    = window_(js, rampRe('const outA'), 'electron A leaves the atom');
  const outB    = window_(js, /outB = ramp\(t,([0-9.]+),([0-9.]+)\)/, 'electron B leaves the atom');
  const travelA = window_(js, rampRe('const travelA'), 'electron A travels to H⁺');
  const travelB = window_(js, /travelB = ramp\(t,([0-9.]+),([0-9.]+)\)/, 'electron B travels to H⁺');
  const gain1   = window_(js, rampRe('const gain1'), 'H⁺ 1 becomes an atom');
  const gain2   = window_(js, /gain2 = ramp\(t,([0-9.]+),([0-9.]+)\)/, 'H⁺ 2 becomes an atom');
  const pairUp  = window_(js, rampRe('const pairUp'), 'the two H atoms pair');
  const hhOn    = window_(js, rampRe('const hhOn'), 'the H–H bond forms');
  const rise    = window_(js, /const rise = Math\.max\(0, t-([0-9.]+)\)/, 'H₂ floats off');
  const depart  = window_(js, /const leave = smooth\(\(t-([0-9.]+)\)\/([0-9.]+)\)/, 'the ion leaves the metal');
  const shrink  = window_(js, /lerp\(1, 0\.72, ramp\(t,([0-9.]+),([0-9.]+)\)\)/, 'the atom shrinks to an ion');

  if(outA && outB && travelA && travelB && gain1 && gain2 && pairUp && hhOn && rise && depart && shrink){
    chk(outA[1] <= travelA[0],
        `electron A must be parked in the metal (by ${outA[1]}s) before it travels (${travelA[0]}s)`);
    chk(outB[1] <= travelB[0],
        `electron B must be parked in the metal (by ${outB[1]}s) before it travels (${travelB[0]}s)`);
    chk(travelA[0] >= depart[0],
        `electrons set off at ${travelA[0]}s but the ion only leaves at ${depart[0]}s — they should stay behind`);
    chk(gain1[0] >= travelA[1] - 0.01,
        `H⁺ 1 becomes an atom at ${gain1[0]}s but its electron only arrives at ${travelA[1]}s`);
    chk(gain2[0] >= travelB[1] - 0.01,
        `H⁺ 2 becomes an atom at ${gain2[0]}s but its electron only arrives at ${travelB[1]}s`);
    chk(shrink[0] >= outA[0],
        `the atom shrinks at ${shrink[0]}s before it sheds anything at ${outA[0]}s`);
    chk(depart[0] >= shrink[0],
        `the ion leaves at ${depart[0]}s before it has become an ion at ${shrink[0]}s`);
    chk(pairUp[0] >= gain2[1],
        `the H atoms pair at ${pairUp[0]}s but H 2 is only an atom at ${gain2[1]}s`);
    chk(hhOn[0] >= pairUp[0] && hhOn[1] <= pairUp[1] + 0.3,
        `the H–H bond (${hhOn[0]}–${hhOn[1]}s) should form while they pair (${pairUp[0]}–${pairUp[1]}s)`);
    chk(rise[0] >= hhOn[1],
        `H₂ floats off at ${rise[0]}s before the bond is finished at ${hhOn[1]}s`);
    console.log('      electrons leave at ' + outA[0] + 's, wait in the metal, reach H⁺ by ' + travelB[1] + 's');
  }

  /* the macro act */
  section('    the pour and the fizz');
  const fizz = window_(js, /const FIZZ_A = ([0-9.]+), FIZZ_B = ([0-9.]+)/, 'fizz window');
  const drop = window_(js, /const DROP_A = ([0-9.]+), DROP_B = ([0-9.]+)/, 'drop window');
  const open = window_(js, rampRe('const open'), 'the tongs open');
  if(fizz && drop && open){
    chk(drop[0] >= open[0], `the metal is released at ${drop[0]}s before the tongs open at ${open[0]}s`);
    chk(fizz[0] >= drop[1], `bubbles start at ${fizz[0]}s but the metal only lands at ${drop[1]}s`);
    chk(fizz[1] <= 28.0, `bubbles are still being born at ${fizz[1]}s, after the camera dives in at 28s`);
  }
}

/* ===========================================================================
   SCENE 02 — acid + metal hydroxide
=========================================================================== */
function scene02(){
  section('SCENE 02  acid-metal-hydroxide.html');
  const js = scriptOf(read('acid-metal-hydroxide.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const SLOTS = {', 'function buildMicro2()')
            + region(js, 'const TOTAL = 54', 'const camPos=');

  const S = evaluate(src,
    ['ALKALIS','ACIDS','INDICATORS','derive','equation','ionicEq','saltFormula','saltName',
     'hasColour','buildCaptions','SLOTS','CAM','TOTAL','TRANSITIONS','worldAt','SEGS',
     'AL','AC','AN','IND','NH'],
    'alkaliKey=v[0];acidKey=v[1];indKey=v[2];');

  const combos = [];
  for(const lk of Object.keys(S.ALKALIS)) for(const ak of Object.keys(S.ACIDS)){
    for(const ik of Object.keys(S.INDICATORS)){
      S.pick = [lk, ak, ik];
      S.derive();
      S.buildCaptions();
      if(ik === 'phenolphthalein') combos.push(`${lk}+${ak}`.padEnd(12) + '→ ' + S.equation());

      /* the cast size follows the acid: one proton needs one hydroxide */
      chk(S.NH === S.AC.nH, `${lk}+${ak}: NH does not match the acid's proton count`);
      chk(S.SLOTS[S.NH] && S.SLOTS[S.NH].length === S.NH,
          `${lk}+${ak}: no slot layout for ${S.NH} water molecule(s)`);
      // charge must balance: NH cations of 1+ against one anion
      chk(S.NH + S.AN.charge === 0,
          `${lk}+${ak}: ${S.NH} single-charged cations do not balance ${S.AN.label}`);
      // the equation must carry the right coefficients and the right water count
      if(S.NH > 1){
        chk(S.equation().startsWith('2') && S.equation().includes('2H₂O'),
            `${lk}+${ak}: a diprotic acid needs 2 alkali and makes 2 water — ${S.equation()}`);
        chk(S.saltFormula().includes('₂'), `${lk}+${ak}: salt should be M₂X — ${S.saltFormula()}`);
      } else {
        chk(!S.equation().includes('2H₂O'),
            `${lk}+${ak}: a monoprotic acid makes one water — ${S.equation()}`);
      }
      // the point of the scene
      chk(S.ionicEq() === 'H⁺ + OH⁻ → H₂O', 'the ionic equation should not vary');
      chk(S.hasColour() === (ik !== 'none'), `${ik}: hasColour() is wrong`);

      checkTimeline(S, 18, {macro:0, micro1:7.0, micro2:28.0});
    }
  }
  console.log('    ' + combos.length + ' alkali/acid pairs × 3 indicators:');
  combos.forEach(c => console.log('      ' + c));

  /* every slot must put its hydroxide and its proton on opposite sides, or
     they will not travel towards each other */
  [1,2].forEach(n=>{
    S.SLOTS[n].forEach((slot,i)=>{
      chk(slot.oh[0] < slot.meet[0] && slot.h[0] > slot.meet[0],
          `slot ${i} of ${n}: OH⁻ and H⁺ should approach the meeting point from opposite sides`);
    });
  });

  /* choreography: the bond cannot appear before the proton has arrived */
  section('    the join');
  const close  = window_(js, rampRe('const close'), 'the two drift together');
  const join   = window_(js, rampRe('const join'), 'the proton takes its place');
  const bondOn = window_(js, rampRe('const bondOn'), 'the new O–H bond');
  if(close && join && bondOn){
    chk(join[0] >= close[0], `the join starts at ${join[0]}s, before they even approach (${close[0]}s)`);
    chk(bondOn[0] >= join[0], `the bond appears at ${bondOn[0]}s before the proton is in place (${join[0]}s)`);
    chk(bondOn[1] <= join[1] + 0.5, `the bond is still forming at ${bondOn[1]}s, well after the join ended (${join[1]}s)`);
  }

  /* the end point must arrive suddenly — that is what makes a titration work */
  const early = window_(js, /const early = ramp\(t,([0-9.]+),([0-9.]+)\)\*([0-9.]+)/, 'the slow fade');
  const turn  = window_(js, rampRe('const turn'), 'the end point');
  if(early && turn){
    chk(turn[1]-turn[0] < (early[1]-early[0]),
        `the end point (${turn[1]-turn[0]}s) should be sharper than the gradual fade before it`);
    chk(early[2] <= 0.3, `too much colour drains before the end point (${early[2]})`);
    chk(turn[1] <= 28.0, `the end point lands at ${turn[1]}s, after the camera dives in`);
  }
}

/* ===========================================================================
   SCENE 03 — acid + metal carbonate
=========================================================================== */
function scene03(){
  section('SCENE 03  acid-metal-carbonate.html');
  const js = scriptOf(read('acid-metal-carbonate.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const ANION_PATHS = {', 'function buildMicro2()')
            + region(js, 'const TOTAL = 58', 'const camPos=');

  const S = evaluate(src,
    ['CARBONATES','ACIDS','forbidden','derive','equation','ionicEq','saltFormula','saltName',
     'buildCaptions','ANION_PATHS','CAM','TOTAL','TRANSITIONS','worldAt','SEGS',
     'CB','AC','AN','NANION'],
    'carbKey=v[0];acidKey=v[1];');

  const combos = [];
  let offered = 0, blocked = 0;
  for(const ck of Object.keys(S.CARBONATES)) for(const ak of Object.keys(S.ACIDS)){
    if(S.forbidden(ck, ak)){
      blocked++;
      combos.push(`${ck}+${ak}`.padEnd(14) + '  not offered (insoluble salt)');
      continue;
    }
    offered++;
    S.pick = [ck, ak];
    S.derive();
    S.buildCaptions();
    combos.push(`${ck}+${ak}`.padEnd(14) + '→ ' + S.equation());

    chk(2 + S.NANION * S.AN.charge === 0, `${ck}+${ak}: charge does not balance`);
    chk(S.ANION_PATHS[S.NANION] && S.ANION_PATHS[S.NANION].length === S.NANION,
        `${ck}+${ak}: no anion track for ${S.NANION}`);
    // this reaction must produce all three products
    ['H₂O','CO₂'].forEach(p=> chk(S.equation().includes(p),
        `${ck}+${ak}: equation is missing ${p} — ${S.equation()}`));
    chk(S.equation().includes(S.saltFormula()),
        `${ck}+${ak}: equation is missing the salt — ${S.equation()}`);
    chk(S.ionicEq() === 'CO₃²⁻ + 2H⁺ → H₂O + CO₂', 'the ionic equation should not vary');
    chk(S.CB.fizz > 0 && S.CB.fizz <= 1, `${ck}: fizz must be in (0,1]`);

    checkTimeline(S, 19, {macro:0, micro1:7.0, micro2:28.0});
  }
  console.log(`    ${offered} pairs offered, ${blocked} blocked:`);
  combos.forEach(c => console.log('      ' + c));
  chk(blocked === 1, `expected exactly 1 blocked pair, got ${blocked}`);
  chk(S.forbidden('CaCO3','H2SO4'), 'calcium + sulfuric should be blocked');
  chk(!S.forbidden('MgCO3','H2SO4'), 'magnesium + sulfuric is fine and should be offered');

  /* the act this scene exists for: one oxygen leaves as water, and what is
     left has to straighten into CO₂ */
  section('    taking the carbonate apart');
  const grab       = window_(js, rampRe('const grab'), 'the protons close in');
  const ohOn       = window_(js, rampRe('const ohOn'), 'the O–H bonds form');
  const bondGone   = window_(js, rampRe('const bondGone'), 'the C–O bond breaks');
  const detach     = window_(js, rampRe('const detach'), 'the water leaves');
  const straighten = window_(js, rampRe('const straighten'), 'the remainder straightens');
  const dbl        = window_(js, rampRe('const dbl'), 'the double bonds appear');
  const rise       = window_(js, /const rise = Math\.max\(0, t-([0-9.]+)\)/, 'the CO₂ floats off');
  const angles     = js.match(/setO\(oA, lerp\(\s*([0-9.]+),\s*([0-9.]+), straighten\), coLen\)/);
  const anglesB    = js.match(/setO\(oB, lerp\(([0-9.]+), ([0-9.]+), straighten\), coLen\)/);

  if(grab && ohOn && bondGone && detach && straighten && dbl && rise){
    chk(ohOn[0] >= grab[0],
        `the O–H bonds appear at ${ohOn[0]}s before the protons set off (${grab[0]}s)`);
    chk(ohOn[1] <= bondGone[1],
        `the protons must be attached (${ohOn[1]}s) before the C–O bond finishes breaking (${bondGone[1]}s)`);
    chk(detach[0] >= bondGone[0],
        `the oxygen leaves at ${detach[0]}s before its bond starts breaking (${bondGone[0]}s)`);
    chk(straighten[0] >= bondGone[1] - 0.5,
        `it straightens at ${straighten[0]}s while still bonded to three oxygens (bond gone ${bondGone[1]}s)`);
    chk(dbl[0] >= straighten[0],
        `double bonds appear at ${dbl[0]}s before it has straightened (${straighten[0]}s)`);
    chk(rise[0] >= straighten[1],
        `the CO₂ floats off at ${rise[0]}s before it is CO₂ (${straighten[1]}s)`);
    console.log(`      protons in at ${grab[0]}s → water away ${detach[0]}s → straight by ${straighten[1]}s → gone ${rise[0]}s`);
  }
  if(angles && anglesB){
    const a0 = +angles[1], a1 = +angles[2], b0 = +anglesB[1], b1 = +anglesB[2];
    chk(Math.abs(Math.abs(a0-b0) - 120) < 0.01,
        `a carbonate ion must start with its oxygens 120° apart, not ${Math.abs(a0-b0)}°`);
    chk(Math.abs(Math.abs(a1-b1) - 180) < 0.01,
        `carbon dioxide must end up linear — 180°, not ${Math.abs(a1-b1)}°`);
    console.log(`      O–C–O goes from ${Math.abs(a0-b0)}° to ${Math.abs(a1-b1)}°`);
  }

  /* the pour: grains must leave while the spoon is tipping, and the fizz must
     not start before they are in the acid */
  section('    the pour and the fizz');
  const rel  = window_(js, /const RELEASE_A = ([0-9.]+), RELEASE_B = ([0-9.]+)/, 'grain release');
  const tip  = window_(js, /const TIP_A = ([0-9.]+), TIP_B = ([0-9.]+)/, 'the spoon tips');
  const fizz = window_(js, /const FIZZ_A = ([0-9.]+), FIZZ_B = ([0-9.]+)/, 'the fizz');
  if(rel && tip && fizz){
    chk(rel[0] >= tip[0], `grains leave at ${rel[0]}s but the spoon tips at ${tip[0]}s`);
    chk(rel[1] <= tip[1] + 0.3, `grains still leaving at ${rel[1]}s after the tip ended at ${tip[1]}s`);
    chk(fizz[0] >= rel[0], `the fizz starts at ${fizz[0]}s before any powder is released (${rel[0]}s)`);
    chk(fizz[1] <= 28.0, `bubbles still being born at ${fizz[1]}s, after the camera dives in`);
  }
  // the grains are analytic, so there must be no stepped simulation left behind
  chk(!/function stepSim/.test(js), 'scene 03 should have no stepped particle sim');
  chk(/const disc = v0\.y\*v0\.y - 14\*\(LIQ_TOP - p0\.y\)/.test(js),
      'the grains should solve for their own entry into the liquid');
}

/* ===========================================================================
   SCENE 06 — metal displacement.  Two timelines: the swap and the refusal.
=========================================================================== */
function scene06(){
  section('SCENE 06  metal-displacement.html');
  const js = scriptOf(read('metal-displacement.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'let TOTAL = 58', 'const camPos=');

  const S = evaluate(src,
    ['METALS','ANION','derive','equation','halves','saltName','saltOf','colourChanges',
     'buildCaptions','worldAt','CAM_MACRO','CAM_MICRO1','CAM_SWAP','CAM_REFUSE',
     'SEGS','TOTAL','TRANSITIONS','MT','SM','REACTS','SAME','GAP','RATE'],
    'metalKey=v[0];saltKey=v[1];');

  const names = Object.keys(S.METALS);
  let reacting = 0, inert = 0;
  const table = [];

  for(const mk of names) for(const sk of names){
    S.pick = [mk, sk];
    S.derive();
    S.buildCaptions();
    const R = S.REACTS;
    R ? reacting++ : inert++;
    table.push(`${mk} + ${S.saltOf(S.SM)}`.padEnd(14) + (R ? '→ ' + S.equation() : '  no reaction'));

    /* the reactivity series is the whole point: it must decide correctly */
    chk(R === (S.METALS[mk].react > S.METALS[sk].react),
        `${mk}+${sk}: REACTS disagrees with the reactivity series`);
    chk(!(mk === sk) || !R, `${mk}+${sk}: a metal cannot displace itself`);
    chk(S.SAME === (mk === sk), `${mk}+${sk}: SAME flag is wrong`);
    if(R) chk(S.GAP > 0 && S.RATE > 0, `${mk}+${sk}: a reacting pair needs a positive rate`);
    if(!R) chk(S.equation().includes('no reaction'),
               `${mk}+${sk}: a non-reacting pair should not show a product equation`);
    if(R){
      chk(S.equation().includes(S.saltOf(S.MT)) && S.equation().endsWith(S.SM.sym),
          `${mk}+${sk}: products are wrong — ${S.equation()}`);
      chk(S.halves().includes(S.MT.ion) && S.halves().includes(S.SM.ion),
          `${mk}+${sk}: half-equations should name both ions`);
    }

    /* whichever path it takes, the timeline must be well formed */
    const cam = {macro:S.CAM_MACRO, micro1:S.CAM_MICRO1, micro2: R?S.CAM_SWAP:S.CAM_REFUSE};
    checkTimeline({SEGS:S.SEGS, TOTAL:S.TOTAL, TRANSITIONS:S.TRANSITIONS,
                   worldAt:S.worldAt, CAM:cam},
                  R ? 20 : 14,
                  {macro:0, micro1:7.0, micro2:28.0});
    chk(S.TOTAL === (R ? 58 : 41), `${mk}+${sk}: unexpected TOTAL ${S.TOTAL}`);

    /* the colour story must match the ions actually involved */
    const changes = S.colourChanges();
    const bothPlain = !S.MT.sol && !S.SM.sol;
    chk(changes === !bothPlain || mk === sk,
        `${mk}+${sk}: colourChanges() says ${changes} but sol values suggest otherwise`);
  }

  console.log(`    ${reacting} reacting pairs, ${inert} that do nothing:`);
  table.forEach(r => console.log('      ' + r));
  chk(reacting === 6, `expected 6 reacting pairs from 4 metals, got ${reacting}`);
  chk(inert === 10, `expected 10 inert pairs, got ${inert}`);

  /* choreography: the electrons must reach the incoming ion before it
     becomes an atom, and it must become an atom before it joins the solid */
  section('    the swap');
  const outA    = window_(js, rampRe('const outA'), 'electron A leaves the atom');
  const travelA = window_(js, rampRe('const travelA'), 'electron A travels to the ion');
  const travelB = window_(js, /travelB = ramp\(t,([0-9.]+),([0-9.]+)\)/, 'electron B travels to the ion');
  const became  = window_(js, rampRe('const became'), 'the ion becomes an atom');
  const seat    = window_(js, /_pa\.lerp\(P\.inSeat, ramp\(t,([0-9.]+),([0-9.]+)\)\)/, 'it settles into the solid');
  const shrink  = window_(js, /lerp\(1, 0\.72, ramp\(t,([0-9.]+),([0-9.]+)\)\)/, 'the strip atom shrinks');
  const arrive  = window_(js, /path3\(_pa, P\.inStart, P\.inMid, P\.inFace, t, 28, 35, ([0-9.]+)\)/, 'the ion reaches the surface');

  if(outA && travelA && travelB && became && seat && shrink && arrive){
    chk(outA[1] <= travelA[0],
        `electrons must wait in the metal (parked by ${outA[1]}s) before travelling (${travelA[0]}s)`);
    chk(travelA[0] >= arrive[0] - 3.0,
        `electrons set off at ${travelA[0]}s — the ion is not near the surface until ~${arrive[0]}s`);
    chk(became[0] >= travelB[1] - 0.5,
        `the ion becomes an atom at ${became[0]}s but the second electron only arrives at ${travelB[1]}s`);
    chk(seat[0] >= became[1],
        `it joins the solid at ${seat[0]}s before it is even an atom (${became[1]}s)`);
    chk(shrink[0] >= outA[0],
        `the strip atom shrinks at ${shrink[0]}s before shedding anything at ${outA[0]}s`);
    console.log('      2 electrons out at ' + outA[0] + 's → ion at ' + travelB[1] + 's → atom → solid by ' + seat[1] + 's');
  }

  section('    the refusal');
  const refuseAway = window_(js, /_pa\.lerp\(P\.inAway, ramp\(t,([0-9.]+),([0-9.]+)\)\)/, 'the ion gives up and leaves');
  const refuseIn   = window_(js, /path3\(_pa, P\.inStart, P\.inMid, P\.inFace, t, 28, 31\.5, ([0-9.]+)\)/, 'the ion arrives');
  if(refuseAway && refuseIn){
    chk(refuseAway[0] >= refuseIn[0],
        `the ion leaves at ${refuseAway[0]}s before it has arrived (${refuseIn[0]}s)`);
  }
  // in the refusal path nothing may be handed over
  const refusal = region(js, 'function updateRefusal', 'function updateMicro2(t)');
  chk(/electronFade\(e1, 0\)/.test(refusal) && /electronFade\(e2, 0\)/.test(refusal),
      'the refusal path must keep both electrons hidden inside the metal');
  chk(!/P\.inSeat/.test(refusal), 'the refusal path must never seat the ion in the solid');
  chk(/inc\.scale\.setScalar\(SM\.r\*0\.82\)/.test(refusal),
      'the refused ion must stay an ion — never grow to atom size');
}

/* ===========================================================================
   SCENE 05 — metal + water
=========================================================================== */
function scene05(){
  section('SCENE 05  metal-water.html');
  const js = scriptOf(read('metal-water.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 60', 'const camPos=');

  const S = evaluate(src,
    ['METALS','derive','equation','halves','buildCaptions','CAM','TOTAL',
     'TRANSITIONS','worldAt','SEGS','MT'],
    'metalKey=v[0];');

  const rows = [];
  for(const mk of Object.keys(S.METALS)){
    S.pick = [mk];
    S.derive();
    S.buildCaptions();
    rows.push(`${mk.padEnd(3)} ${S.equation().padEnd(26)} vigour ${S.MT.vigour}  ${S.MT.rank}`);

    // group 1 gives up exactly one electron, so the equation needs 2M and 2H₂O
    chk(S.equation().startsWith(`2${mk}`), `${mk}: should start with 2${mk} — ${S.equation()}`);
    chk(S.equation().includes('2H₂O'), `${mk}: two waters are needed for one H₂ — ${S.equation()}`);
    chk(S.equation().includes(`2${S.MT.formula}`), `${mk}: should make 2 ${S.MT.formula}`);
    chk(S.equation().endsWith('H₂'), `${mk}: hydrogen is the other product — ${S.equation()}`);
    // the two halves carry different electron counts, so check them separately
    const [metalHalf, waterHalf] = S.halves().split('·');
    chk(metalHalf.includes('+ e⁻') && !metalHalf.includes('2e⁻'),
        `${mk}: a group 1 atom loses exactly ONE electron — ${metalHalf.trim()}`);
    chk(waterHalf.includes('2e⁻') && waterHalf.includes('2H₂O'),
        `${mk}: two waters must share the two electrons — ${waterHalf.trim()}`);
    chk(waterHalf.includes('2OH⁻'),
        `${mk}: the half-equation must show where the alkali comes from — ${waterHalf.trim()}`);
    chk(S.MT.vigour > 0 && S.MT.vigour <= 1, `${mk}: vigour out of range`);
    chk(S.MT.eGap > 0, `${mk}: the outer electron needs a distance`);

    checkTimeline(S, 22, {macro:0, micro1:7.0, micro2:30.0});
  }
  console.log('    3 metals:');
  rows.forEach(r => console.log('      ' + r));

  /* the trend is the lesson: bigger atom, electron further out, more reactive */
  const order = ['Li','Na','K'];
  for(let i=1;i<order.length;i++){
    const a = S.METALS[order[i-1]], b = S.METALS[order[i]];
    chk(b.r > a.r, `${order[i]} should be a bigger atom than ${order[i-1]}`);
    chk(b.eGap > a.eGap, `${order[i]}'s outer electron should sit further out than ${order[i-1]}'s`);
    chk(b.react > a.react, `${order[i]} should be more reactive than ${order[i-1]}`);
    chk(b.vigour > a.vigour, `${order[i]} should react more vigorously than ${order[i-1]}`);
  }
  console.log('      radius, electron distance, reactivity and vigour all rise Li → Na → K');

  /* choreography: both atoms must lose their electron before water takes one,
     and the water must break only after it has been given one */
  section('    two atoms, two waters');
  const out1 = window_(js, rampRe('const out1'), 'atom A sheds its electron');
  const out2 = window_(js, /out2 = ramp\(t,([0-9.]+),([0-9.]+)\)/, 'atom B sheds its electron');
  const take = js.match(/const take = \[ramp\(t,([0-9.]+),([0-9.]+)\), ramp\(t,([0-9.]+),([0-9.]+)\)\]/);
  const broke= js.match(/const broke= \[ramp\(t,([0-9.]+),([0-9.]+)\), ramp\(t,([0-9.]+),([0-9.]+)\)\]/);
  const pairUp = window_(js, rampRe('const pairUp'), 'the H atoms pair');
  const hhOn = window_(js, rampRe('const hhOn'), 'the H–H bond');
  const rise = window_(js, /const rise = Math\.max\(0, t-([0-9.]+)\)/, 'the H₂ leaves');

  if(out1 && out2 && take && broke && pairUp && hhOn && rise){
    const t1 = [+take[1],+take[2]], t2 = [+take[3],+take[4]];
    const b1 = [+broke[1],+broke[2]], b2 = [+broke[3],+broke[4]];
    chk(out2[0] > out1[0], `the second atom should go after the first (${out1[0]}s then ${out2[0]}s)`);
    chk(t1[0] >= out2[1], `water takes an electron at ${t1[0]}s but the second atom is still shedding at ${out2[1]}s`);
    chk(b1[0] >= t1[0] && b2[0] >= t2[0], 'a water must be given an electron before it breaks');
    chk(pairUp[0] >= b1[0], `the H atoms pair at ${pairUp[0]}s before the first water has broken (${b1[0]}s)`);
    chk(hhOn[0] >= pairUp[0], `the H–H bond forms at ${hhOn[0]}s before they are together (${pairUp[0]}s)`);
    chk(rise[0] >= hhOn[1], `H₂ leaves at ${rise[0]}s before the bond is finished (${hhOn[1]}s)`);
    console.log(`      atom A ${out1[0]}s, atom B ${out2[0]}s → waters take at ${t1[0]}s → H₂ away ${rise[0]}s`);
  }

  /* the macro act: it cannot fizz before it lands */
  const land = window_(js, /const LAND = ([0-9.]+)/, 'it lands on the water');
  const fizz = window_(js, /const FIZZ_A = ([0-9.]+), FIZZ_B = ([0-9.]+)/, 'the fizz');
  const open = window_(js, /const OPEN_A = ([0-9.]+), OPEN_B = ([0-9.]+)/, 'the tongs open');
  const skate= window_(js, /const SKATE_A = ([0-9.]+), SKATE_B = ([0-9.]+)/, 'it skates about');
  if(land && fizz && open && skate){
    chk(land[0] >= open[1], `it lands at ${land[0]}s before the tongs have opened (${open[1]}s)`);
    chk(fizz[0] >= land[0] - 0.01, `it fizzes at ${fizz[0]}s before it lands (${land[0]}s)`);
    chk(skate[0] >= land[0] - 0.01, `it skates at ${skate[0]}s before it lands (${land[0]}s)`);
    chk(fizz[1] <= 30.0, `bubbles still being born at ${fizz[1]}s, after the camera dives in`);
  }
}

/* ===========================================================================
   SCENE 07 — halogen displacement.  Two timelines, like scene 06.
=========================================================================== */
function scene07(){
  section('SCENE 07  halogen-displacement.html');
  const js = scriptOf(read('halogen-displacement.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'let TOTAL = 57', 'const camPos=');

  const S = evaluate(src,
    ['HALOGENS','CATION','derive','equation','ionicEq','halves','saltOf','buildCaptions',
     'worldAt','CAM_MACRO','CAM_MICRO1','CAM_SWAP','CAM_REFUSE',
     'SEGS','TOTAL','TRANSITIONS','HX','HY','REACTS','SAME'],
    'halKey=v[0];salKey=v[1];');

  const names = Object.keys(S.HALOGENS);
  let reacting = 0, inert = 0;
  const table = [];

  for(const xk of names) for(const yk of names){
    S.pick = [xk, yk];
    S.derive();
    S.buildCaptions();
    const R = S.REACTS;
    R ? reacting++ : inert++;
    table.push(`${S.HX.mol} + 2${S.saltOf(S.HY)}`.padEnd(16) + (R ? '→ ' + S.equation() : '  no reaction'));

    chk(R === (S.HALOGENS[xk].react > S.HALOGENS[yk].react),
        `${xk}+${yk}: REACTS disagrees with the group order`);
    chk(!(xk === yk) || !R, `${xk}+${yk}: a halogen cannot displace itself`);
    chk(S.SAME === (xk === yk), `${xk}+${yk}: SAME flag is wrong`);
    if(!R) chk(S.equation().includes('no reaction'),
               `${xk}+${yk}: a non-reacting pair should show no products`);
    if(R){
      chk(S.equation().includes(`2${S.saltOf(S.HX)}`) && S.equation().endsWith(S.HY.mol),
          `${xk}+${yk}: products are wrong — ${S.equation()}`);
      chk(S.ionicEq().includes(`2${S.HY.ion}`) && S.ionicEq().includes(`2${S.HX.ion}`),
          `${xk}+${yk}: the ionic equation needs two of each ion — ${S.ionicEq()}`);
      chk(S.halves().includes('+ 2e⁻ →') && S.halves().includes('+ 2e⁻'),
          `${xk}+${yk}: half-equations should move two electrons`);
    }

    const cam = {macro:S.CAM_MACRO, micro1:S.CAM_MICRO1, micro2: R?S.CAM_SWAP:S.CAM_REFUSE};
    checkTimeline({SEGS:S.SEGS, TOTAL:S.TOTAL, TRANSITIONS:S.TRANSITIONS,
                   worldAt:S.worldAt, CAM:cam},
                  R ? 19 : 14,
                  {macro:0, micro1:7.0, micro2:28.0});
    chk(S.TOTAL === (R ? 57 : 41), `${xk}+${yk}: unexpected TOTAL ${S.TOTAL}`);
  }

  console.log(`    ${reacting} reacting pairs, ${inert} that do nothing:`);
  table.forEach(r => console.log('      ' + r));
  chk(reacting === 3, `expected 3 reacting pairs from 3 halogens, got ${reacting}`);
  chk(inert === 6, `expected 6 inert pairs, got ${inert}`);

  /* an ion is bigger than its atom, and reactivity falls down the group */
  const order = ['Cl','Br','I'];
  for(const k of order){
    const h = S.HALOGENS[k];
    chk(h.ionR > h.r, `${k}⁻ should be bigger than a ${k} atom (${h.ionR} vs ${h.r})`);
  }
  for(let i=1;i<order.length;i++){
    const a = S.HALOGENS[order[i-1]], b = S.HALOGENS[order[i]];
    chk(b.r > a.r, `${order[i]} should be a bigger atom than ${order[i-1]}`);
    chk(b.react < a.react, `${order[i]} should be less reactive than ${order[i-1]}`);
  }
  console.log('      every ion is bigger than its atom; reactivity falls Cl → Br → I');

  /* choreography: the electrons must arrive before the halogen becomes an ion,
     and the bond can only break once it has */
  section('    the swap');
  const show     = window_(js, rampRe('const show'), 'the spare electrons are shown');
  const cross    = js.match(/const cross\s*=\s*\[ramp\(t,([0-9.]+),([0-9.]+)\), ramp\(t,([0-9.]+),([0-9.]+)\)\]/);
  const gained   = window_(js, rampRe('const gained'), 'the halogen gains them');
  const bondGone = window_(js, rampRe('const bondGone'), 'the X–X bond breaks');
  const lost     = window_(js, rampRe('const lost'), 'the halides lose theirs');
  const pairUp   = window_(js, rampRe('const pairUp'), 'the halogen atoms pair');
  const yyOn     = window_(js, rampRe('const yyOn'), 'the new bond forms');

  if(show && cross && gained && bondGone && lost && pairUp && yyOn){
    const c1 = [+cross[1],+cross[2]], c2 = [+cross[3],+cross[4]];
    chk(show[1] <= c1[0], `the electrons must be visible on the ions (${show[1]}s) before they cross (${c1[0]}s)`);
    chk(gained[0] >= c1[0], `the halogen becomes an ion at ${gained[0]}s before the electron sets off (${c1[0]}s)`);
    chk(gained[1] >= c2[1] - 0.6, `it is fully an ion at ${gained[1]}s but the second electron lands at ${c2[1]}s`);
    chk(bondGone[0] >= gained[1] - 0.6, `the bond breaks at ${bondGone[0]}s before the ions have formed (${gained[1]}s)`);
    chk(lost[0] >= c1[1] - 0.5, `the halides shrink at ${lost[0]}s before handing anything over (${c1[1]}s)`);
    chk(yyOn[0] >= pairUp[0], `the new bond forms at ${yyOn[0]}s before they are together (${pairUp[0]}s)`);
    console.log(`      electrons shown ${show[0]}s → cross ${c1[0]}s → X⁻ by ${gained[1]}s → Y₂ bonded ${yyOn[1]}s`);
  }

  section('    the refusal');
  const refusal = region(js, 'function updateRefusal', 'function updateMicro2(t)');
  chk(/xx\.material\.opacity = 1;/.test(refusal),
      'the refusal path must leave the X–X bond intact');
  chk(/y\.scale\.setScalar\(HY\.ionR\)/.test(refusal),
      'a refused halide must stay an ion — never shrink to atom size');
  chk(/yy\.visible = false/.test(refusal),
      'the refusal path must never form the new molecule');
  chk(!/gained|lost/.test(refusal),
      'the refusal path must not use the gain/loss ramps at all');
}

/* ===========================================================================
   SCENE 08 — thermal decomposition.  Decomposes, or holds.
=========================================================================== */
function scene08(){
  section('SCENE 08  thermal-decomposition.html');
  const js = scriptOf(read('thermal-decomposition.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'let TOTAL = 58', 'const camPos=');

  const S = evaluate(src,
    ['CARBONATES','derive','equation','ionicEq','colourChanges','buildCaptions','worldAt',
     'CAM_MACRO','CAM_MICRO1','CAM_BREAK','CAM_HOLD','SEGS','TOTAL','TRANSITIONS',
     'CB','DECOMPOSES','EASE'],
    'carbKey=v[0];');

  const rows = [];
  let goes = 0, holds = 0;
  for(const ck of Object.keys(S.CARBONATES)){
    S.pick = [ck];
    S.derive();
    S.buildCaptions();
    const D = S.DECOMPOSES;
    D ? goes++ : holds++;
    rows.push(`${ck.padEnd(7)} ${S.equation()}`);

    chk(D === (S.CARBONATES[ck].ease !== null), `${ck}: DECOMPOSES disagrees with ease`);
    if(D){
      chk(S.equation().includes(S.CB.oxide) && S.equation().includes('CO₂'),
          `${ck}: should make the oxide and CO₂ — ${S.equation()}`);
      chk(S.EASE > 0 && S.EASE <= 1, `${ck}: ease out of range`);
      chk(S.CB.oxideName, `${ck}: a decomposing carbonate needs an oxide name`);
    } else {
      chk(S.equation().includes('no reaction'), `${ck}: should report no reaction`);
      chk(S.CB.oxide === null, `${ck}: a carbonate that holds should have no oxide product`);
    }
    chk(S.ionicEq() === 'CO₃²⁻ → O²⁻ + CO₂', 'the ionic equation should not vary');
    chk(S.CB.nCat * (S.CB.nCat>1?1:2) === 2, `${ck}: cation count and charge do not balance CO₃²⁻`);

    const cam = {macro:S.CAM_MACRO, micro1:S.CAM_MICRO1, micro2: D?S.CAM_BREAK:S.CAM_HOLD};
    checkTimeline({SEGS:S.SEGS, TOTAL:S.TOTAL, TRANSITIONS:S.TRANSITIONS,
                   worldAt:S.worldAt, CAM:cam},
                  D ? 19 : 14, {macro:0, micro1:7.0, micro2:30.0});
    chk(S.TOTAL === (D ? 58 : 42), `${ck}: unexpected TOTAL ${S.TOTAL}`);
  }
  console.log(`    ${goes} decompose, ${holds} hold:`);
  rows.forEach(r => console.log('      ' + r));
  chk(holds === 1, `expected exactly 1 carbonate that holds, got ${holds}`);

  /* heat stability must fall as the metal gets less reactive — copper easiest */
  const order = ['CuCO3','ZnCO3','MgCO3','CaCO3'];
  for(let i=1;i<order.length;i++){
    chk(S.CARBONATES[order[i]].ease < S.CARBONATES[order[i-1]].ease,
        `${order[i]} should need more heat than ${order[i-1]}`);
  }
  console.log('      ease of decomposition falls CuCO₃ → ZnCO₃ → MgCO₃ → CaCO₃, Na₂CO₃ never');

  /* choreography: the third oxygen must leave before the remainder straightens */
  section('    coming apart');
  const bondGone   = window_(js, rampRe('const bondGone'), 'the C–O bond breaks');
  const pulled     = window_(js, rampRe('const pulled'), 'the oxygen is pulled off');
  const straighten = window_(js, rampRe('const straighten'), 'the remainder straightens');
  const dbl        = window_(js, rampRe('const dbl'), 'the double bonds appear');
  const oxOn       = window_(js, rampRe('const oxOn'), 'the oxide settles with the metal');
  const rise       = window_(js, /const rise = Math\.max\(0, t - ([0-9.]+)\)/, 'the CO₂ leaves');
  const angA = js.match(/setO\(oA, lerp\(\s*([0-9.]+),\s*([0-9.]+), straighten\), coLen\)/);
  const angB = js.match(/setO\(oB, lerp\(([0-9.]+), ([0-9.]+), straighten\), coLen\)/);

  if(bondGone && pulled && straighten && dbl && oxOn && rise){
    chk(pulled[0] >= bondGone[0],
        `the oxygen leaves at ${pulled[0]}s before its bond starts breaking (${bondGone[0]}s)`);
    chk(straighten[0] >= bondGone[1] - 0.5,
        `it straightens at ${straighten[0]}s while still holding three oxygens (${bondGone[1]}s)`);
    chk(dbl[0] >= straighten[0], `double bonds at ${dbl[0]}s before straightening (${straighten[0]}s)`);
    chk(rise[0] >= straighten[1] - 0.5,
        `the CO₂ leaves at ${rise[0]}s before it is CO₂ (${straighten[1]}s)`);
    chk(oxOn[0] >= pulled[1] - 0.5,
        `the oxide pairs with the metal at ${oxOn[0]}s before it has arrived (${pulled[1]}s)`);
    console.log(`      O pulled off ${pulled[0]}s → straight by ${straighten[1]}s → gas away ${rise[0]}s`);
  }
  if(angA && angB){
    chk(Math.abs(Math.abs(+angA[1] - +angB[1]) - 120) < 0.01, 'a carbonate must start at 120°');
    chk(Math.abs(Math.abs(+angA[2] - +angB[2]) - 180) < 0.01, 'CO₂ must end up linear');
    console.log(`      O–C–O goes from ${Math.abs(+angA[1]-+angB[1])}° to ${Math.abs(+angA[2]-+angB[2])}°`);
  }

  /* nothing may come through before the Bunsen is lit */
  const light = window_(js, /const LIGHT_A = ([0-9.]+), LIGHT_B = ([0-9.]+)/, 'the Bunsen is lit');
  if(light){
    chk(light[0] >= 15.0, `the Bunsen is lit at ${light[0]}s, before the macro act resumes`);
    // every carbonate that goes must start fizzing after the flame is on
    for(const ck of Object.keys(S.CARBONATES)){
      S.pick = [ck]; S.derive();
      if(!S.DECOMPOSES) continue;
      const fizzA = 23.0 + (19.4-23.0)*S.EASE;     // mirrors buildBubbles
      chk(fizzA > light[1], `${ck}: gas at ${fizzA.toFixed(1)}s, before the flame at ${light[1]}s`);
      chk(fizzA < 30.0, `${ck}: gas only at ${fizzA.toFixed(1)}s, after the camera dives in`);
    }
  }
  /* the refusal must not take anything apart */
  const holdFn = region(js, 'function updateHolds', 'function updateMicro2(t)');
  chk(/bA\.material\.opacity = 1; bB\.material\.opacity = 1;/.test(holdFn),
      'the holding path must keep both C–O bonds intact');
  chk(/bC\.material\.opacity = 1/.test(holdFn),
      'the holding path must keep the third C–O bond intact too');
  chk(!/straighten/.test(holdFn), 'the holding path must never straighten anything');
}

/* ===========================================================================
   SCENE 09 — metal oxide + carbon.  The reactivity series decides.
=========================================================================== */
function scene09(){
  section('SCENE 09  metal-oxide-carbon.html');
  const js = scriptOf(read('metal-oxide-carbon.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'let TOTAL = 60', 'const camPos=');

  const S = evaluate(src,
    ['OXIDES','SERIES','C_AT','below','derive','equation','redox','halves','buildCaptions',
     'worldAt','CAM_MACRO','CAM_MICRO1','CAM_GIVE','CAM_REFUSE','SEGS','TOTAL','TRANSITIONS',
     'OX','REACTS','EASE'],
    'oxideKey=v[0];');

  /* the series itself must be right, with carbon in the right place */
  chk(S.SERIES.indexOf('C') === S.C_AT, 'C_AT must point at carbon');
  chk(S.SERIES[S.C_AT-1] === 'Al' && S.SERIES[S.C_AT+1] === 'Zn',
      'carbon belongs between aluminium and zinc');
  ['Zn','Fe','Sn','Pb','Cu','Ag'].forEach(s=>
    chk(S.below(s), `${s} should be below carbon and so reducible by it`));
  ['K','Na','Ca','Mg','Al'].forEach(s=>
    chk(!S.below(s), `${s} is above carbon and must NOT be reducible by it`));
  console.log('      series: ' + S.SERIES.join(' ') + '   (carbon at index ' + S.C_AT + ')');

  const rows = [];
  let wins = 0, cannot = 0;
  for(const ok of Object.keys(S.OXIDES)){
    S.pick = [ok];
    S.derive();
    S.buildCaptions();
    const R = S.REACTS;
    R ? wins++ : cannot++;
    rows.push(`${ok.padEnd(6)} ${R ? S.equation() : S.equation() + '   (above carbon)'}`);

    chk(R === S.below(S.OX.sym), `${ok}: REACTS must come from the series, not a flag`);
    chk(R === (S.OX.ease !== null), `${ok}: ease and series position disagree`);
    if(R){
      chk(S.equation().startsWith('2') && S.equation().includes('+ C →'),
          `${ok}: needs two oxides per carbon — ${S.equation()}`);
      chk(S.equation().includes('CO₂'), `${ok}: carbon dioxide is the other product`);
      chk(S.halves().includes('4e⁻'), `${ok}: two oxides hand over four electrons — ${S.halves()}`);
      chk(S.redox().includes('reduced') && S.redox().includes('oxidised'),
          `${ok}: the redox line should name both`);
    } else {
      chk(S.equation().includes('no reaction'), `${ok}: should report no reaction`);
    }
    /* a metal atom is bigger than its ion — the scene animates that growth */
    chk(S.OX.r > S.OX.ionR, `${ok}: the atom (${S.OX.r}) must be bigger than the ion (${S.OX.ionR})`);

    const cam = {macro:S.CAM_MACRO, micro1:S.CAM_MICRO1, micro2: R?S.CAM_GIVE:S.CAM_REFUSE};
    checkTimeline({SEGS:S.SEGS, TOTAL:S.TOTAL, TRANSITIONS:S.TRANSITIONS,
                   worldAt:S.worldAt, CAM:cam},
                  R ? 19 : 14, {macro:0, micro1:7.0, micro2:30.0});
    chk(S.TOTAL === (R ? 60 : 42), `${ok}: unexpected TOTAL ${S.TOTAL}`);
  }
  console.log(`    ${wins} that carbon can reduce, ${cannot} that it cannot:`);
  rows.forEach(r => console.log('      ' + r));
  chk(wins === 2 && cannot === 2, `expected 2 and 2, got ${wins} and ${cannot}`);

  /* choreography: electrons cross, THEN the metal grows, THEN oxygen moves */
  section('    oxygen changes hands');
  const give   = js.match(/const give\s*=\s*\[ramp\(t,([0-9.]+),([0-9.]+)\), ramp\(t,([0-9.]+),([0-9.]+)\)\]/);
  const became = js.match(/const became\s*=\s*\[ramp\(t,([0-9.]+),([0-9.]+)\), ramp\(t,([0-9.]+),([0-9.]+)\)\]/);
  const joined = js.match(/const joined\s*=\s*\[ramp\(t,([0-9.]+),([0-9.]+)\), ramp\(t,([0-9.]+),([0-9.]+)\)\]/);
  const turn   = window_(js, rampRe('const turn'), 'the CO₂ swings flat');
  const gather = window_(js, rampRe('const gather'), 'the metal collects together');
  const lift   = window_(js, /const lift = Math\.max\(0, t - ([0-9.]+)\)/, 'the CO₂ leaves');

  if(give && became && joined && turn && gather && lift){
    const g1=[+give[1],+give[2]], b1=[+became[1],+became[2]], j1=[+joined[1],+joined[2]];
    chk(b1[0] >= g1[0], `the metal starts growing at ${b1[0]}s before electrons set off (${g1[0]}s)`);
    chk(j1[0] >= g1[1] - 0.5,
        `the oxygen moves to the carbon at ${j1[0]}s before handing over its electrons (${g1[1]}s)`);
    chk(turn[0] >= j1[1] - 1.0, `the CO₂ swings flat at ${turn[0]}s before both oxygens joined`);
    chk(lift[0] >= turn[1] - 0.5, `it leaves at ${lift[0]}s before it is a finished CO₂`);
    console.log(`      electrons ${g1[0]}s → metal atom by ${b1[1]}s → oxygen joins ${j1[1]}s → gas ${lift[0]}s`);
  }

  section('    the refusal');
  const refusal = region(js, 'function updateRefusal', 'function updateMicro2(t)');
  chk(/cat\.scale\.setScalar\(OX\.ionR\)/.test(refusal),
      'a refused metal must stay an ion — never grow to atom size');
  chk(/b\.ionic\.material\.opacity = 1/.test(refusal),
      'the refusal path must keep every metal–oxygen bond intact');
  chk(/b\.co\.visible = false/.test(refusal),
      'the refusal path must never bond oxygen to the carbon');
  chk(/electronFade\(es\[i\*2\+k\], 0\)/.test(refusal),
      'the refusal path must hand over no electrons at all');
}

/* ===========================================================================
   THE BLAST FURNACE — the three-step mechanism
=========================================================================== */
function blastFurnace(){
  section('BONUS  blast-furnace.html');
  const js = scriptOf(read('blast-furnace.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 64', 'const camPos=');

  const S = evaluate(src,
    ['ORES','derive','stepBurn','stepCO','stepRed','stepLime','stepSlag','overall',
     'buildCaptions','worldAt','CAM','SEGS','TOTAL','TRANSITIONS','STEP_BANDS','OR'],
    'oreKey=v[0];fluxOn=v[1];');

  const rows = [];
  for(const ore of Object.keys(S.ORES)) for(const flux of [true,false]){
    S.pick = [ore, flux];
    S.derive();
    S.buildCaptions();
    if(flux) rows.push(`${ore.padEnd(6)} ${S.stepRed().padEnd(34)} overall: ${S.overall()}`);

    /* every step must balance for oxygen, which is the whole mechanism */
    chk(S.stepBurn() === 'C + O₂ → CO₂', 'step 1 should not vary');
    chk(S.stepCO() === 'CO₂ + C → 2CO', 'step 2 should not vary');
    // step 3: ore + nCO → nFe Fe + nCO CO2, and the oxygens must come out even
    chk(S.OR.nO === S.OR.nCO,
        `${ore}: ${S.OR.nO} oxygens need exactly ${S.OR.nO} CO to carry them off, not ${S.OR.nCO}`);
    chk(S.stepRed().includes(S.OR.formula) && S.stepRed().includes('CO₂'),
        `${ore}: step 3 looks wrong — ${S.stepRed()}`);
    chk(S.stepRed().includes(`${S.OR.nFe>1?S.OR.nFe:''}Fe`),
        `${ore}: step 3 should make ${S.OR.nFe} iron — ${S.stepRed()}`);
    /* the overall equation must balance: oreCoef × nFe = fe,  oreCoef × nO = 2×coke */
    chk(S.OR.oreCoef * S.OR.nFe === S.OR.fe,
        `${ore}: iron does not balance overall (${S.OR.oreCoef}×${S.OR.nFe} ≠ ${S.OR.fe})`);
    chk(S.OR.oreCoef * S.OR.nO === 2 * S.OR.coke,
        `${ore}: oxygen does not balance overall (${S.OR.oreCoef}×${S.OR.nO} ≠ 2×${S.OR.coke})`);
    chk(S.stepLime() === 'CaCO₃ → CaO + CO₂', 'the limestone step should not vary');
    chk(S.stepSlag() === 'CaO + SiO₂ → CaSiO₃', 'the slag step should not vary');

    checkTimeline(S, 21, {macro:0, micro1:7.0, micro2:30.0});
    chk(S.TOTAL === 64, `unexpected TOTAL ${S.TOTAL}`);
  }
  console.log('    2 ores × 2 flux settings:');
  rows.forEach(r => console.log('      ' + r));

  /* the step markers must sit inside micro 2 and not overlap */
  const bands = S.STEP_BANDS;
  bands.forEach((b,i)=>{
    chk(b.a >= 30.0, `step band "${b.s}" starts at ${b.a}s, before micro 2`);
    chk(b.b <= S.TOTAL, `step band "${b.s}" runs past the end`);
    chk(b.b > b.a, `step band "${b.s}" is empty`);
    if(i) chk(b.a >= bands[i-1].a, 'step bands should be in order');
  });
  console.log('      4 step markers, all inside micro 2 and in order');

  /* choreography: each step must finish before the next one needs it */
  section('    bottom to top');
  const split  = window_(js, rampRe('const split'), 'the O=O bond breaks');
  const co2on  = window_(js, rampRe('const co2on'), 'the CO₂ bonds form');
  const lift1  = window_(js, rampRe('const lift1'), 'the CO₂ rises to step 2');
  const meet2  = window_(js, rampRe('const meet2'), 'the second carbon arrives');
  const handed = window_(js, rampRe('const handed'), 'an oxygen crosses to it');
  const part   = window_(js, rampRe('const part'), 'the two CO separate and rise');
  const arrive = window_(js, rampRe('const arrive'), 'the CO reach the ore');
  const freed  = window_(js, rampRe('const freed'), 'the iron comes loose');
  const fall   = window_(js, rampRe('const fall'), 'and runs down');

  if(split && co2on && lift1 && meet2 && handed && part && arrive && freed && fall){
    chk(co2on[0] >= split[0], `C=O bonds form at ${co2on[0]}s before O=O breaks (${split[0]}s)`);
    chk(lift1[0] >= co2on[1] - 0.5, `the CO₂ rises at ${lift1[0]}s before it exists (${co2on[1]}s)`);
    chk(meet2[0] >= lift1[0], `step 2 starts at ${meet2[0]}s before the CO₂ has set off (${lift1[0]}s)`);
    chk(handed[0] >= meet2[0], `the handover at ${handed[0]}s precedes the carbon arriving (${meet2[0]}s)`);
    chk(part[0] >= handed[0], `they separate at ${part[0]}s before the handover began (${handed[0]}s)`);
    chk(arrive[0] >= part[0], `the CO reach the ore at ${arrive[0]}s before they set off (${part[0]}s)`);
    chk(freed[0] >= arrive[1] - 1.0, `iron is freed at ${freed[0]}s before the CO arrive (${arrive[1]}s)`);
    chk(fall[0] >= freed[0], `iron runs down at ${fall[0]}s before it is free (${freed[0]}s)`);
    console.log(`      burn ${split[0]}s → CO made ${handed[1]}s → reach ore ${arrive[1]}s → iron falls ${fall[0]}s`);
  }

  /* the gas you follow must be the gas that was made — not a copy of it */
  const build2 = region(js, 'function buildMicro2', 'const _pa=new THREE.Vector3()');
  chk(/cos\.push\(\{c:c1, o:o1a, b:b1a/.test(build2) && /cos\.push\(\{c:c2, o:o1b, b:b2/.test(build2),
      'the first two CO must reuse the atoms from steps 1 and 2, not duplicate them');

  /* the furnace must light before anything melts or is tapped */
  const blast = window_(js, /const BLAST_A = ([0-9.]+), BLAST_B = ([0-9.]+), TAP_A = ([0-9.]+)/, 'blast and tap');
  if(blast){
    chk(blast[0] >= 14.0, `the blast starts at ${blast[0]}s, before the macro act resumes`);
    chk(blast[2] > blast[1], `tapping at ${blast[2]}s before the blast is on (${blast[1]}s)`);
    chk(blast[2] < 30.0, `tapping at ${blast[2]}s, after the camera goes inside`);
  }
}

/* ===========================================================================
   SCENE 10 — metal + oxygen.  Ionic bonding, two electrons at a time.
=========================================================================== */
function scene10(){
  section('SCENE 10  metal-oxygen.html');
  const js = scriptOf(read('metal-oxygen.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 62', 'const camPos=');

  const S = evaluate(src,
    ['METALS','O_ATOM_R','derive','equation','halves','buildCaptions','CAM','TOTAL',
     'TRANSITIONS','worldAt','SEGS','MT','FLAMES'],
    'metalKey=v[0];');

  const rows = [];
  let flaming = 0;
  for(const mk of Object.keys(S.METALS)){
    S.pick = [mk];
    S.derive();
    S.buildCaptions();
    if(S.FLAMES) flaming++;
    rows.push(`${mk.padEnd(3)} ${S.equation().padEnd(20)} ${S.MT.flameWord}`);

    chk(S.equation() === `2${mk} + O₂ → 2${S.MT.oxide}`,
        `${mk}: two metal atoms per O₂ — ${S.equation()}`);
    chk(S.halves().includes('2e⁻'), `${mk}: an M²⁺ metal gives up two electrons`);
    chk(S.halves().includes('O + 2e⁻ → O²⁻'), `${mk}: the oxygen half-equation is wrong`);
    chk(S.FLAMES === (S.MT.flame !== null), `${mk}: FLAMES disagrees with the flame colour`);
    /* a cation is smaller than its atom; an oxide ion is bigger than an O atom */
    chk(S.MT.ionR < S.MT.r, `${mk}: the ion (${S.MT.ionR}) must be smaller than the atom (${S.MT.r})`);
    chk(S.O_ATOM_R < 0.50, `an oxygen atom (${S.O_ATOM_R}) must be smaller than O²⁻ (0.50)`);
    chk(S.MT.glare >= 0 && S.MT.glare <= 0.8, `${mk}: screen glare out of range`);
    if(!S.FLAMES) chk(S.MT.glare === 0, `${mk}: something with no flame must not glare`);

    checkTimeline(S, 21, {macro:0, micro1:7.0, micro2:30.0});
  }
  console.log('    4 metals:');
  rows.forEach(r => console.log('      ' + r));
  chk(flaming === 3, `expected 3 metals that burn with a flame, got ${flaming}`);

  /* choreography: the O=O bond must break before any electron crosses */
  section('    building an ionic bond');
  const snap    = window_(js, rampRe('const snap'), 'the O=O bond breaks');
  const cross   = js.match(/const cross\s*=\s*\[ramp\(t,([0-9.]+),([0-9.]+)\)/);
  const charged = window_(js, rampRe('const charged'), 'the ions change size');
  const pull    = window_(js, rampRe('const pull'), 'they snap together');
  const build   = window_(js, rampRe('const build'), 'the lattice assembles');
  const linkOn  = window_(js, rampRe('const linkOn'), 'the attraction appears');

  if(snap && cross && charged && pull && build && linkOn){
    const c0 = [+cross[1],+cross[2]];
    chk(c0[0] >= snap[1] - 0.5,
        `electrons cross at ${c0[0]}s but the O=O bond is not broken until ${snap[1]}s`);
    chk(charged[0] >= c0[0], `the ions resize at ${charged[0]}s before electrons move (${c0[0]}s)`);
    chk(linkOn[0] >= charged[0],
        `the attraction appears at ${linkOn[0]}s before there is any charge (${charged[0]}s)`);
    chk(pull[0] >= charged[0], `they snap together at ${pull[0]}s before being charged`);
    chk(build[0] >= pull[0], `the lattice builds at ${build[0]}s before the first pair formed`);
    console.log(`      bond breaks ${snap[0]}s → 4 electrons cross ${c0[0]}s → pairs pull ${pull[0]}s → lattice ${build[1]}s`);
  }
  /* four electrons, because two metals each give two */
  chk(/for\(let i=0;i<4;i\+\+\)\{ const e = electron\(\)/.test(js),
      'scene 10 needs exactly four electrons — two from each of two metal atoms');

  /* regression: the metal must be a CHILD of the tongs.  Positioning it from
     tongs.position in world space leaves it beside the jaws whenever the tongs
     are rotated, which is exactly what it did the first time round. */
  chk(/tongs\.add\(piece\)/.test(js),
      'the metal must be parented to the tongs, not placed in world space');
  chk(!/piece\.position\.copy\(tongs\.position\)/.test(js),
      'the metal must not be positioned from the tongs world position — it will not stay in the jaws');
  chk(/piece\.position\.set\(0, -PIECE_H\*0\.5\*sy/.test(js),
      'the gripped end should stay against the jaws as the metal burns away');
}

/* ===========================================================================
   SCENE 11 — metal + halogen.  The same bond, one electron at a time.
=========================================================================== */
function scene11(){
  section('SCENE 11  metal-halogen.html');
  const js = scriptOf(read('metal-halogen.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 60', 'const camPos=');

  const S = evaluate(src,
    ['METALS','HALOGENS','derive','equation','halves','saltFormula','saltName',
     'isTableSalt','buildCaptions','CAM','TOTAL','TRANSITIONS','worldAt','SEGS','MT','HX'],
    'metalKey=v[0];halKey=v[1];');

  const rows = [];
  let tableSalt = 0;
  for(const mk of Object.keys(S.METALS)) for(const hk of Object.keys(S.HALOGENS)){
    S.pick = [mk, hk];
    S.derive();
    S.buildCaptions();
    if(S.isTableSalt()) tableSalt++;
    if(hk === 'Cl') rows.push(`${mk.padEnd(3)} ${S.equation().padEnd(22)} ${S.saltName()}`);

    chk(S.equation() === `2${mk} + ${S.HX.mol} → 2${S.saltFormula()}`,
        `${mk}+${hk}: wrong equation — ${S.equation()}`);
    chk(S.saltFormula() === mk + hk, `${mk}+${hk}: a 1+ and a 1− ion make a 1:1 formula`);
    /* one electron, not two — that is the whole difference from scene 10 */
    const mHalf = S.halves().split('·')[0];
    chk(mHalf.includes('+ e⁻') && !mHalf.includes('2e⁻'),
        `${mk}+${hk}: a group 1 atom gives up ONE electron — ${mHalf.trim()}`);
    /* the cation shrinks, the anion grows */
    chk(S.MT.ionR < S.MT.r, `${mk}: the cation must be smaller than the atom`);
    chk(S.HX.ionR > S.HX.r, `${hk}: the anion must be bigger than the atom`);

    checkTimeline(S, 20, {macro:0, micro1:7.0, micro2:30.0});
  }
  console.log('    3 metals × 3 halogens (chloride column shown):');
  rows.forEach(r => console.log('      ' + r));
  chk(tableSalt === 1, `exactly one pair should be table salt, got ${tableSalt}`);

  /* halogen numbers must agree with scene 07, which also defines them */
  const js07 = scriptOf(read('halogen-displacement.html'));
  ['Cl','Br','I'].forEach(sym=>{
    const re = new RegExp(`sym:'${sym}'[\\s\\S]{0,200}?col:(0x[0-9a-f]+), r:([0-9.]+), lblCol:'(#[0-9a-f]+)', ionR:([0-9.]+)`);
    const a = js.match(re), b = js07.match(re);
    if(a && b){
      chk(a[1]===b[1] && a[2]===b[2] && a[4]===b[4],
          `${sym} differs between scene 11 and scene 07 (${a[1]}/${a[2]}/${a[4]} vs ${b[1]}/${b[2]}/${b[4]})`);
    } else chk(false, `could not compare ${sym} between scenes 07 and 11`);
  });
  console.log('      Cl, Br and I agree with scene 07');

  section('    one electron across');
  const snap    = window_(js, rampRe('const snap'), 'the X–X bond breaks');
  const cross   = js.match(/const cross\s*=\s*\[ramp\(t,([0-9.]+),([0-9.]+)\)/);
  const charged = window_(js, rampRe('const charged'), 'the ions change size');
  const pull    = window_(js, rampRe('const pull'), 'they snap together');
  const build   = window_(js, rampRe('const build'), 'the lattice assembles');
  if(snap && cross && charged && pull && build){
    const c0 = [+cross[1],+cross[2]];
    chk(c0[0] >= snap[1] - 0.5,
        `the electron crosses at ${c0[0]}s but the bond holds until ${snap[1]}s`);
    chk(charged[0] >= c0[0], `ions resize before the electron moves`);
    chk(pull[0] >= charged[0], `they snap together before being charged`);
    chk(build[0] >= pull[0], `the lattice builds before the first pair exists`);
    console.log(`      bond breaks ${snap[0]}s → 1 electron each ${c0[0]}s → lattice by ${build[1]}s`);
  }
  /* the lattice must alternate, like rock salt really does */
  chk(/const flip = \(\(ix\+iy\+iz\)%2===0\) \? 1 : -1/.test(js),
      'the lattice should alternate which ion sits where');
}

/* ===========================================================================
   SCENE 12 — combustion.  Covalent, and the atoms must all be accounted for.
=========================================================================== */
function scene12(){
  section('SCENE 12  combustion.html');
  const js = scriptOf(read('combustion.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 62', 'const camPos=');

  const S = evaluate(src,
    ['FUELS','forbidden','derive','equation','inventory','makesCO2','hasCarbon',
     'buildCaptions','CAM','TOTAL','TRANSITIONS','worldAt','SEGS','FU','CO','FULL'],
    'fuelKey=v[0];airKey=v[1];');

  const rows = [];
  let offered = 0, blocked = 0;
  for(const fk of Object.keys(S.FUELS)) for(const air of ['full','low']){
    if(S.forbidden(fk, air)){ blocked++; rows.push(`${fk.padEnd(7)} ${air.padEnd(5)} not offered`); continue; }
    offered++;
    S.pick = [fk, air];
    S.derive();
    S.buildCaptions();
    rows.push(`${fk.padEnd(7)} ${air.padEnd(5)} ${S.equation()}`);

    const c = S.CO, comp = S.FU.comp;
    /* THE test for this scene: the equation must balance, atom by atom, from
       the coefficients the scene actually animates */
    const cIn  = c.fuel*comp.C;
    const hIn  = c.fuel*comp.H;
    const oIn  = c.fuel*comp.O + 2*c.o2;
    const cOut = c.co2 + c.co;
    const hOut = 2*c.h2o;
    const oOut = 2*c.co2 + c.co + c.h2o;
    chk(cIn === cOut, `${fk}/${air}: carbon does not balance (${cIn} in, ${cOut} out)`);
    chk(hIn === hOut, `${fk}/${air}: hydrogen does not balance (${hIn} in, ${hOut} out)`);
    chk(oIn === oOut, `${fk}/${air}: oxygen does not balance (${oIn} in, ${oOut} out)`);

    /* and the cast micro 2 builds must be exactly that inventory */
    const inv = S.inventory();
    chk(inv.C === cIn && inv.H === hIn && inv.O === oIn,
        `${fk}/${air}: the micro-2 inventory does not match the equation`);
    /* every product molecule must be fillable from it */
    chk(c.co2*3 + c.co*2 + c.h2o*3 === inv.C + inv.H + inv.O,
        `${fk}/${air}: product slots do not consume every atom`);

    chk(S.makesCO2() === (c.co2 > 0), `${fk}/${air}: makesCO2 is wrong`);
    chk(S.hasCarbon() === (comp.C > 0), `${fk}: hasCarbon is wrong`);
    if(air === 'low') chk(c.co > 0 && c.co2 === 0,
        `${fk}: a starved flame makes CO, not CO₂`);
    if(air === 'full' && comp.C > 0) chk(c.co === 0 && c.co2 > 0,
        `${fk}: a full flame makes CO₂, not CO`);
    chk(c.h2o > 0, `${fk}/${air}: burning a hydrocarbon always makes water`);

    checkTimeline(S, 20, {macro:0, micro1:7.0, micro2:30.0});
  }
  console.log(`    ${offered} combinations offered, ${blocked} blocked:`);
  rows.forEach(r => console.log('      ' + r));
  chk(blocked === 1, `expected exactly 1 blocked combination, got ${blocked}`);
  chk(S.forbidden('H2','low'), 'hydrogen cannot burn incompletely');
  chk(!S.forbidden('CH4','low'), 'methane certainly can');

  /* hydrogen is the interesting case: water only, and clear limewater */
  S.pick = ['H2','full']; S.derive();
  chk(S.equation() === '2H₂ + O₂ → 2H₂O', `hydrogen should burn to water only — ${S.equation()}`);
  chk(!S.makesCO2() && !S.hasCarbon(), 'hydrogen must produce no CO₂ at all');
  console.log('      hydrogen burns to water only, so the limewater stays clear');

  /* every fuel needs drawable geometry for micro 1 */
  const geom = region(js, 'const GEOM = {', 'function buildFuelMolecule');
  Object.keys(S.FUELS).forEach(fk=>{
    chk(geom.includes(fk + ':'), `${fk} has no molecular geometry for micro 1`);
  });

  section('    break, then make');
  const breakOn = window_(js, rampRe('const breakOn'), 'every bond breaks');
  const scatter = window_(js, rampRe('const scatter'), 'the atoms drift apart');
  const gather  = window_(js, rampRe('const gather'), 'they find new partners');
  const makeOn  = window_(js, rampRe('const makeOn'), 'new bonds appear');
  const apart   = window_(js, rampRe('const apart'), 'the products separate');
  if(breakOn && scatter && gather && makeOn && apart){
    chk(scatter[0] >= breakOn[0],
        `the atoms scatter at ${scatter[0]}s before the bonds start breaking (${breakOn[0]}s)`);
    chk(gather[0] >= breakOn[1],
        `they regroup at ${gather[0]}s while bonds are still breaking (until ${breakOn[1]}s)`);
    chk(makeOn[0] >= gather[0],
        `new bonds appear at ${makeOn[0]}s before the atoms have moved together (${gather[0]}s)`);
    chk(apart[0] >= makeOn[1] - 0.5,
        `the products separate at ${apart[0]}s before their bonds are finished (${makeOn[1]}s)`);
    console.log(`      break ${breakOn[0]}s → loose ${scatter[1]}s → regroup ${gather[0]}s → bonded ${makeOn[1]}s`);
  }
  /* the energy point has to be made visually, not only in words */
  chk(/barIn\.style\.width/.test(js) && /barOut\.style\.width/.test(js),
      'the energy ledger should show both bars');
  chk(/breakOn\*62/.test(js) && /makeOn\*100/.test(js),
      'the out bar must end up longer than the in bar — that is the exothermic point');
}

/* ===========================================================================
   SCENE 13 — electrolysis of a molten salt
=========================================================================== */
function scene13(){
  section('SCENE 13  electrolysis-molten.html');
  const js = scriptOf(read('electrolysis-molten.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 64', 'const camPos=');

  const S = evaluate(src,
    ['SALTS','derive','equation','atCathode','atAnode','buildCaptions','CAM','TOTAL',
     'TRANSITIONS','worldAt','SEGS','SA','MT','HX'],
    'saltKey=v[0];');

  const rows = [];
  for(const sk of Object.keys(S.SALTS)){
    S.pick = [sk];
    S.derive();
    S.buildCaptions();
    rows.push(`${sk.padEnd(6)} ${S.equation().padEnd(20)} ${S.atCathode().padEnd(22)} ${S.atAnode()}`);

    chk(S.equation() === `${S.SA.formula} → ${S.MT.sym} + ${S.HX.mol}`,
        `${sk}: wrong overall equation — ${S.equation()}`);
    /* the metal always goes to the cathode, the non-metal to the anode */
    chk(S.atCathode().includes(S.MT.ion) && S.atCathode().includes('+ 2e⁻ →'),
        `${sk}: the cathode should reduce the metal ion — ${S.atCathode()}`);
    chk(S.atAnode().startsWith('2' + S.HX.ion) && S.atAnode().includes('+ 2e⁻'),
        `${sk}: the anode should oxidise two halide ions — ${S.atAnode()}`);
    /* two electrons in, two out — the half-equations must balance each other */
    chk((S.atCathode().match(/2e⁻/g)||[]).length === 1 &&
        (S.atAnode().match(/2e⁻/g)||[]).length === 1,
        `${sk}: the two half-equations must move the same number of electrons`);
    /* a cation is smaller than its atom; an anion is bigger */
    chk(S.MT.ionR < S.MT.r, `${sk}: the metal ion must be smaller than the atom`);
    chk(S.HX.ionR > S.HX.r, `${sk}: the halide ion must be bigger than the atom`);

    checkTimeline(S, 21, {macro:0, micro1:7.0, micro2:34.0});
  }
  console.log('    3 molten salts:');
  rows.forEach(r => console.log('      ' + r));

  /* the point of the scene: nothing electrical happens until it melts */
  section('    it has to be molten');
  const meltAt = window_(js, /const MELT_AT = ([0-9.]+)/, 'when it melts');
  const light  = window_(js, /const LIGHT_A = ([0-9.]+), LIGHT_B = ([0-9.]+)/, 'the Bunsen');
  const lit    = window_(js, /const lit = ramp\(t, MELT_AT, MELT_AT\+([0-9.]+)\)/, 'the lamp');
  if(meltAt && light && lit){
    chk(light[1] <= meltAt[0], `the Bunsen must be lit (${light[1]}s) before it melts (${meltAt[0]}s)`);
    chk(lit[0] > 0, 'the lamp must come on after melting, not before');
    console.log(`      flame at ${light[0]}s → melts at ${meltAt[0]}s → lamp lights just after`);
  }
  /* micro 1 must actually melt the lattice */
  chk(/function meltedAt\(t\)\{ return ramp\(t, ([0-9.]+), ([0-9.]+)\); \}/.test(js),
      'micro 1 needs a melting ramp, so the lattice can come apart');

  section('    the cell');
  const catIn  = window_(js, rampRe('const catIn'), 'the cation reaches the cathode');
  const took   = window_(js, rampRe('const took'), 'it takes two electrons');
  const anIn   = window_(js, rampRe('const anIn'), 'the anions reach the anode');
  const gave   = js.match(/const gave\s*=\s*\[ramp\(t, ([0-9.]+), ([0-9.]+)\)/);
  const paired = window_(js, rampRe('const paired'), 'the two atoms pair');
  const flowing= window_(js, rampRe('const flowing'), 'the circuit current');
  if(catIn && took && anIn && gave && paired && flowing){
    chk(took[0] >= catIn[1] - 0.5,
        `it takes electrons at ${took[0]}s before arriving (${catIn[1]}s)`);
    chk(+gave[1] >= anIn[1] - 0.5,
        `the anions give up electrons at ${gave[1]}s before arriving (${anIn[1]}s)`);
    chk(paired[0] >= +gave[1],
        `the atoms pair at ${paired[0]}s before they are neutral (${gave[1]}s)`);
    console.log(`      cation arrives ${catIn[1]}s → discharged ${took[1]}s → anions ${gave[1]}s → molecule ${paired[1]}s`);
  }
  /* the electrons must go round the outside, which means a wire to go round */
  chk(/const WIRE = \[/.test(js) && /function alongWire/.test(js),
      'the external circuit needs a wire the electrons can actually run along');
  chk(/ions go through the middle/.test(js) && /electrons go round the outside/.test(js),
      'the scene should say which goes where — it is the point students miss');
}

/* ===========================================================================
   SCENE 14 — electrolysis of a solution.  Four ions, two rules.
=========================================================================== */
function scene14(){
  section('SCENE 14  electrolysis-aqueous.html');
  const js = scriptOf(read('electrolysis-aqueous.html'));

  const src = region(js, 'const EL = {', 'const MICRO1_Y')
            + region(js, 'function lerp(a,b,t)', 'function clearGroup')
            + region(js, 'const TOTAL = 64', 'const camPos=');

  const S = evaluate(src,
    ['SOLUTIONS','derive','equation','atCathode','atAnode','cathProduct','anProduct',
     'leftovers','buildCaptions','CAM','TOTAL','TRANSITIONS','worldAt','SEGS',
     'SO','CT','AN','METAL_WINS','HALIDE_WINS'],
    'solKey=v[0];');

  const rows = [];
  let metalWins = 0, halideWins = 0;
  for(const k of Object.keys(S.SOLUTIONS)){
    S.pick = [k];
    S.derive();
    S.buildCaptions();
    if(S.METAL_WINS) metalWins++;
    if(S.HALIDE_WINS) halideWins++;
    rows.push(`${k.padEnd(7)} cathode ${S.cathProduct().padEnd(10)} anode ${S.anProduct().padEnd(9)} left: ${S.leftovers()}`);

    /* the two rules must actually be applied, not hard-coded per solution */
    chk(S.METAL_WINS === S.CT.beatsH,
        `${k}: the cathode choice must come from reactivity vs hydrogen`);
    chk(S.HALIDE_WINS === S.AN.halide,
        `${k}: the anode choice must come from whether there is a halide`);
    /* and the half-equations must follow the rules */
    chk(S.atCathode() === (S.METAL_WINS ? `${S.CT.ion} + 2e⁻ → ${S.CT.sym}` : '2H⁺ + 2e⁻ → H₂'),
        `${k}: cathode half-equation does not match the rule — ${S.atCathode()}`);
    chk(S.atAnode() === (S.HALIDE_WINS ? `2${S.AN.label} → ${S.AN.mol} + 2e⁻`
                                       : '4OH⁻ → O₂ + 2H₂O + 4e⁻'),
        `${k}: anode half-equation does not match the rule — ${S.atAnode()}`);
    /* the oxygen route must balance: 4 OH⁻ has 4 O and 4 H; O₂ + 2H₂O has the same */
    if(!S.HALIDE_WINS){
      chk(S.atAnode().includes('4OH⁻') && S.atAnode().includes('O₂ + 2H₂O'),
          `${k}: 4OH⁻ → O₂ + 2H₂O is the only version that balances`);
    }
    /* The leftovers are whichever candidate LOST at each electrode — and the two
       electrodes decide independently, so this is checked per electrode rather
       than from one combined rule. (An earlier version of this test combined
       them, and passed a version of the scene that was wrong for Na2SO4.) */
    const left = S.leftovers();
    const cathWin  = S.METAL_WINS ? S.CT.ion : 'H⁺';
    const cathLose = S.METAL_WINS ? 'H⁺' : S.CT.ion;
    const anWin    = S.HALIDE_WINS ? S.AN.label : 'OH⁻';
    const anLose   = S.HALIDE_WINS ? 'OH⁻' : S.AN.label;
    chk(left.includes(cathLose),
        `${k}: ${cathLose} lost at the cathode, so it must stay in solution — got "${left}"`);
    chk(!left.includes(cathWin),
        `${k}: ${cathWin} was discharged, so it cannot also be left behind — got "${left}"`);
    chk(left.includes(anLose),
        `${k}: ${anLose} lost at the anode, so it must stay in solution — got "${left}"`);
    chk(!left.includes(anWin),
        `${k}: ${anWin} was discharged, so it cannot also be left behind — got "${left}"`);

    chk(S.equation().includes('→'), `${k}: no overall equation`);
    checkTimeline(S, 20, {macro:0, micro1:7.0, micro2:32.0});
  }
  console.log(`    ${rows.length} solutions:`);
  rows.forEach(r => console.log('      ' + r));
  /* the menu must exercise both rules both ways, or it teaches only half of it.
     How MANY solutions land on each side is a matter of taste — that every side
     is landed on at all is not. */
  chk(metalWins >= 1, 'at least one solution should deposit its metal');
  chk(metalWins < rows.length, 'at least one solution should give hydrogen at the cathode');
  chk(halideWins >= 1, 'at least one solution should give a halogen');
  chk(halideWins < rows.length, 'at least one solution should give oxygen at the anode');
  console.log('      both rules are exercised in both directions');

  /* sodium sulfate is the special case: neither salt ion is discharged */
  S.pick = ['Na2SO4']; S.derive();
  chk(!S.METAL_WINS && !S.HALIDE_WINS, 'sodium sulfate should discharge neither salt ion');
  chk(S.equation() === '2H₂O → 2H₂ + O₂',
      `splitting water is all that happens — got ${S.equation()}`);
  console.log('      sodium sulfate just splits the water: ' + S.equation());

  section('    the two contests');
  const arrive1 = window_(js, rampRe('const arrive1'), 'both candidates reach the cathode');
  const decided1= window_(js, rampRe('const decided1'), 'the cathode decides');
  const reject1 = window_(js, rampRe('const reject1'), 'the loser is turned away');
  const took1   = window_(js, rampRe('const took1'), 'the winner is discharged');
  const arrive2 = window_(js, rampRe('const arrive2'), 'both candidates reach the anode');
  const decided2= window_(js, rampRe('const decided2'), 'the anode decides');
  const gave2   = window_(js, rampRe('const gave2'), 'the anode winner is discharged');
  if(arrive1 && decided1 && reject1 && took1 && arrive2 && decided2 && gave2){
    chk(decided1[0] >= arrive1[1] - 0.5,
        `the cathode decides at ${decided1[0]}s before both candidates arrive (${arrive1[1]}s)`);
    chk(reject1[0] >= decided1[0], `the loser leaves before the decision`);
    chk(took1[0] >= decided1[0], `the winner is discharged before the decision`);
    chk(arrive2[0] >= decided1[0],
        `the anode contest should follow the cathode one, not precede it`);
    chk(decided2[0] >= arrive2[1] - 0.5, `the anode decides before both candidates arrive`);
    chk(gave2[0] >= decided2[0], `the anode winner is discharged before the decision`);
    console.log(`      cathode decides ${decided1[0]}s → anode decides ${decided2[0]}s`);
  }
  /* the loser really must go back into solution, not vanish */
  chk(/turned away — stays in solution/.test(js),
      'the rejected ion should be labelled as staying in solution');
  chk(/_pb\.lerp\(V\(2\.6 \+ k\*0\.8/.test(js) || /reject1 > 0/.test(js),
      'the rejected ion needs a path back out into the solution');
  /* four hydroxides for the oxygen route, because fewer would not balance */
  chk(/for\(let i=0;i<4;i\+\+\)\{\s*ohO\.push/.test(js),
      'the oxygen route needs four hydroxide ions to balance');
}

/* ===========================================================================
   cross-scene consistency — a student moving between scenes must never see
   an element change colour or name
=========================================================================== */
const FILES = ['acid-metal-oxide.html','acid-metal-hydroxide.html',
               'acid-metal-carbonate.html','metal-acid.html','metal-water.html',
               'metal-displacement.html','halogen-displacement.html',
               'thermal-decomposition.html','metal-oxide-carbon.html',
               'metal-oxygen.html','metal-halogen.html','combustion.html',
               'electrolysis-molten.html','electrolysis-aqueous.html',
               'blast-furnace.html'];

function palette(){
  section('PALETTE  shared across scenes');

  // non-metals, from each scene's EL table
  const seen = {};
  FILES.forEach(f=>{
    const js = scriptOf(read(f));
    const el = region(js, 'const EL = {', '};');
    const re = /(\w+):\s*\{name:'([^']+)',\s*col:(0x[0-9a-f]+),\s*r:([0-9.]+)/g;
    let m;
    while((m = re.exec(el))){
      const [,sym,name,col,r] = m;
      if(seen[sym]){
        chk(seen[sym].col === col, `${sym} is ${seen[sym].col} in ${seen[sym].file} but ${col} in ${f}`);
        chk(seen[sym].name === name, `${sym} is "${seen[sym].name}" in ${seen[sym].file} but "${name}" in ${f}`);
        chk(seen[sym].r === r, `${sym} has radius ${seen[sym].r} in ${seen[sym].file} but ${r} in ${f}`);
      } else seen[sym] = {col, name, r, file:f};
    }
    // electrons must be the same yellow everywhere they appear
    const e = js.match(/const E_COL = (0x[0-9a-f]+)/);
    if(e){
      if(seen['e⁻']) chk(seen['e⁻'].col === e[1],
        `electrons are ${seen['e⁻'].col} in ${seen['e⁻'].file} but ${e[1]} in ${f}`);
      else seen['e⁻'] = {col:e[1], name:'electron', r:'-', file:f};
    }
  });
  console.log('    non-metals: ' + Object.keys(seen).join(', '));

  // metals, wherever they are defined — colour, radius and solution colour
  const metals = {};
  FILES.forEach(f=>{
    const js = scriptOf(read(f));
    const re = /col:(0x[0-9a-f]+), r:([0-9.]+), lblCol:'(#[0-9a-f]+)'/g;
    const symRe = /sym:'(\w+)'/g;
    // walk the metal/oxide table line by line so each colour keeps its symbol
    const lines = js.split('\n');
    let sym = null;
    lines.forEach(line=>{
      const s = line.match(/sym:'(\w+)'/);
      if(s) sym = s[1];
      const c = line.match(/col:(0x[0-9a-f]+),\s*r:([0-9.]+),\s*lblCol:'(#[0-9a-f]+)'/);
      if(c && sym){
        const [,col,r,lbl] = c;
        if(metals[sym]){
          chk(metals[sym].col === col, `${sym} metal is ${metals[sym].col} in ${metals[sym].file} but ${col} in ${f}`);
          chk(metals[sym].r === r, `${sym} has radius ${metals[sym].r} in ${metals[sym].file} but ${r} in ${f}`);
          chk(metals[sym].lbl === lbl, `${sym} label is ${metals[sym].lbl} in ${metals[sym].file} but ${lbl} in ${f}`);
        } else metals[sym] = {col, r, lbl, file:f};
        sym = null;
      }
    });
    // solution colours for the same ion must agree between scenes
    const solRe = /sym:'(\w+)'[\s\S]{0,400}?sol:(\[[0-9.,\s]+\]|null)/g;
    let m;
    while((m = solRe.exec(js))){
      const [,s,sol] = m;
      const norm = sol.replace(/\s/g,'');
      if(!metals[s]) continue;
      if(metals[s].sol === undefined) { metals[s].sol = norm; metals[s].solFile = f; }
      else chk(metals[s].sol === norm,
               `${s} solution is ${metals[s].sol} in ${metals[s].solFile} but ${norm} in ${f}`);
    }
  });
  Object.keys(metals).forEach(s=>{
    console.log(`    ${s.padEnd(3)} ${metals[s].col}  r=${metals[s].r}  solution=${metals[s].sol}`);
  });
}

/* a slip I kept making by hand: writing p:[1,2,3} instead of p:[1,2,3] in a
   camera table. It is a syntax error, so it cannot reach a browser — but it
   wastes a round trip, so the suite looks for it directly. */
function brackets(){
  section('SYNTAX  camera tables');
  let slips = 0;
  FILES.forEach(f=>{
    const txt = read(f);
    const re = /[pl]:\[[-0-9.,\s]*\}/g;
    let m;
    while((m = re.exec(txt))){
      slips++;
      chk(false, `${f}: malformed vector — ${m[0]}`);
    }
  });
  chk(true, 'camera vectors are well formed');
  console.log('    ' + FILES.length + ' files scanned, ' + slips + ' malformed vectors');
}

/* every scene should offer the same controls and link home */
function shell(){
  section('SHELL  controls present in every scene');
  FILES.forEach(f=>{
    const h = read(f);
    ['id="play"','id="restart"','id="scrub"','id="gear"','id="caption"','id="key"','id="menu"']
      .forEach(id => chk(h.includes(id), `${f} is missing ${id}`));
    chk(h.includes('href="index.html"'), `${f} does not link back to the index`);
    chk(/<title>/.test(h), `${f} has no title`);
    const js = scriptOf(h);
    chk(js.includes("history.replaceState"), `${f} does not make its species bookmarkable`);
  });
  // and the index should link to every scene that exists
  const idx = read('index.html');
  FILES.forEach(f => chk(idx.includes(`href="${f}"`), `index.html does not link to ${f}`));
  console.log('    ' + FILES.length + ' scenes, all wired up');
}

/* =========================================================================== */
try {
  scene01();
  scene02();
  scene03();
  scene04();
  scene05();
  scene06();
  scene07();
  scene08();
  scene09();
  scene10();
  scene11();
  scene12();
  scene13();
  scene14();
  blastFurnace();
  palette();
  brackets();
  shell();
} catch (e) {
  console.log('\nharness error: ' + e.message);
  process.exitCode = 1;
}

console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`));
if(fails) process.exitCode = 1;
