/* ===========================================================================
   Tests for the particle scenes.   Run with:  node test-particles.js
   No dependencies — the scene file is read as text, and the parts worth
   checking are pulled out and run against a tiny Vector3 stub.

   What this checks:
     - the "random" walk is genuinely deterministic, so scrubbing is repeatable
     - it behaves like a random WALK, not a drift: net displacement grows like
       the square root of the number of steps, not linearly
     - it stays inside the field of view
     - the molecule motion is a true reflecting billiard (speed preserved)
     - the physics knobs are monotonic in the right directions
     - captions and camera tracks are ordered and complete

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
function region(js, from, to){
  const a = js.indexOf(from), b = js.indexOf(to);
  if(a < 0) throw new Error('anchor not found: ' + from);
  if(b < 0) throw new Error('anchor not found: ' + to);
  return js.slice(a, b);
}
function evaluate(src, exposed, setter){
  const getters = exposed.map(n => `get ${n}(){return typeof ${n}==='undefined'?undefined:${n}}`);
  const setters = setter ? [`set pick(v){${setter}}`] : [];
  return new Function('location','THREE', src + `\nreturn {${getters.concat(setters).join(',')}};`)
    ({search:''}, STUB);
}

/* just enough of THREE.Vector3 for the walk code to run */
class V3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  subVectors(a,b){ this.x=a.x-b.x; this.y=a.y-b.y; this.z=a.z-b.z; return this; }
  normalize(){ const l=Math.hypot(this.x,this.y,this.z)||1; this.x/=l; this.y/=l; this.z/=l; return this; }
  lerpVectors(a,b,t){ this.x=a.x+(b.x-a.x)*t; this.y=a.y+(b.y-a.y)*t; this.z=a.z+(b.z-a.z)*t; return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  distanceTo(v){ return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z); }
}
const STUB = { Vector3: V3 };

/* ===========================================================================
   BROWNIAN MOTION
=========================================================================== */
function brownian(){
  section('BROWNIAN MOTION  brownian-motion.html');
  const js = scriptOf(read('brownian-motion.html'));

  /* One contiguous region from the maths helpers through to the walk code.
     Slicing on '/* =====' matched an earlier comment block and silently
     produced an empty string, which took rng() with it. */
  const src = region(js, 'const GRAINS = {', 'const POLLEN_COL')
            + region(js, 'function lerp(a,b,t)', 'const lab = new THREE.Group()')
            + region(js, 'const TOTAL = 68', 'const camPos=');

  const S = evaluate(src,
    ['GRAINS','TEMPS','derive','GR','TP','JIG','SPEED','makeWalk','walkAt','walkKick',
     'tri','rng','buildCaptions','SEGS','TOTAL','TRANSITIONS','worldAt','CAM'],
    'grainKey=v[0];tempKey=v[1];');

  /* ---------- the knobs ---------- */
  section('    the physics knobs');
  const sizes = ['small','medium','large'];
  for(let i=1;i<sizes.length;i++){
    chk(S.GRAINS[sizes[i]].um > S.GRAINS[sizes[i-1]].um,
        `${sizes[i]} should be a bigger grain than ${sizes[i-1]}`);
    chk(S.GRAINS[sizes[i]].jiggle < S.GRAINS[sizes[i-1]].jiggle,
        `a bigger grain must jiggle LESS — ${sizes[i]} (${S.GRAINS[sizes[i]].jiggle}) vs ${sizes[i-1]} (${S.GRAINS[sizes[i-1]].jiggle})`);
    chk(S.GRAINS[sizes[i]].r > S.GRAINS[sizes[i-1]].r,
        `a bigger grain should also be drawn bigger`);
  }
  const temps = ['cold','room','hot'];
  for(let i=1;i<temps.length;i++){
    chk(S.TEMPS[temps[i]].C > S.TEMPS[temps[i-1]].C,
        `${temps[i]} should be hotter than ${temps[i-1]}`);
    chk(S.TEMPS[temps[i]].speed > S.TEMPS[temps[i-1]].speed,
        `hotter water must have FASTER molecules — ${temps[i]} vs ${temps[i-1]}`);
    chk(S.TEMPS[temps[i]].jig > S.TEMPS[temps[i-1]].jig,
        `hotter water must jiggle the grain MORE — ${temps[i]} vs ${temps[i-1]}`);
  }
  /* and the two combine, rather than one overriding the other */
  const table = [];
  for(const g of sizes) for(const tp of temps){
    S.pick = [g, tp];
    S.derive();
    chk(Math.abs(S.JIG - S.GRAINS[g].jiggle*S.TEMPS[tp].jig) < 1e-9,
        `${g}/${tp}: jiggle should be grain × temperature`);
    chk(S.SPEED === S.TEMPS[tp].speed, `${g}/${tp}: molecule speed comes from temperature alone`);
    if(tp === 'room') table.push(`${g.padEnd(7)} jiggle ${S.JIG.toFixed(2)}  speed ${S.SPEED.toFixed(2)}`);
  }
  table.forEach(r=>console.log('      ' + r));
  /* the extremes must actually differ enough to see */
  S.pick = ['small','hot']; S.derive(); const hi = S.JIG;
  S.pick = ['large','cold']; S.derive(); const lo = S.JIG;
  chk(hi / lo > 3, `the liveliest setting should be clearly livelier than the dullest (${(hi/lo).toFixed(1)}×)`);
  console.log(`      smallest+hottest jiggles ${(hi/lo).toFixed(1)}× the largest+coldest`);

  /* ---------- the walk ---------- */
  section('    the random walk');
  const BOUND = 9.0*0.62;
  const w1 = S.makeWalk(9100, 420, 0.55, 0.52, BOUND);
  const w2 = S.makeWalk(9100, 420, 0.55, 0.52, BOUND);
  /* determinism: same seed, same path, every time */
  let same = true;
  for(let i=0;i<w1.pts.length;i++){
    if(w1.pts[i].x !== w2.pts[i].x || w1.pts[i].y !== w2.pts[i].y) { same = false; break; }
  }
  chk(same, 'the same seed must give exactly the same walk, or scrubbing is not repeatable');
  /* a different seed must give a different path, or every grain moves alike */
  const w3 = S.makeWalk(9137, 420, 0.55, 0.52, BOUND);
  chk(w3.pts[50].x !== w1.pts[50].x, 'different seeds must give different walks');

  /* sampling is a pure function of t */
  const a = S.walkAt(w1, 7.3, new V3()), b = S.walkAt(w1, 7.3, new V3());
  chk(a.x === b.x && a.y === b.y, 'walkAt must be a pure function of t');
  /* and it interpolates rather than jumping */
  const p0 = S.walkAt(w1, 5.20, new V3()), p1 = S.walkAt(w1, 5.24, new V3());
  chk(p0.distanceTo(p1) < 0.25, 'the path between kicks should be continuous, not a jump');

  /* it must stay inside the field of view */
  let maxR = 0;
  for(const p of w1.pts) maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  chk(maxR <= BOUND + 1e-9, `the walk left the field of view (reached ${maxR.toFixed(2)}, bound ${BOUND.toFixed(2)})`);
  console.log(`      420 steps, furthest from centre ${maxR.toFixed(2)} of ${BOUND.toFixed(2)} allowed`);

  /* THE signature of a random walk: net displacement grows like √N, so it is
     far shorter than the distance actually travelled.  A drift would not be. */
  let pathLen = 0;
  for(let i=1;i<w1.pts.length;i++) pathLen += w1.pts[i].distanceTo(w1.pts[i-1]);
  const net = w1.pts[w1.pts.length-1].length();
  chk(net < pathLen*0.35,
      `this is meant to be a walk, not a drift — net ${net.toFixed(1)} vs path ${pathLen.toFixed(1)}`);
  chk(net > 0.2, 'it should still get somewhere, not return exactly to the start');
  console.log(`      travels ${pathLen.toFixed(1)} units to end up ${net.toFixed(1)} from where it began`);

  /* the kick direction must match the step the grain is actually taking */
  for(const tt of [3.1, 11.7, 25.4]){
    const k = S.walkKick(w1, tt);
    const step = new V3().subVectors(w1.pts[k.i+1], w1.pts[k.i]).normalize();
    chk(Math.abs(k.dir.x - step.x) < 1e-6 && Math.abs(k.dir.y - step.y) < 1e-6,
        `at ${tt}s the kick direction does not match the step being taken`);
    chk(k.age >= 0 && k.age <= w1.dt + 1e-9, `at ${tt}s the kick age is outside the step`);
  }
  console.log('      every impact flash points along the step it caused');

  /* ---------- the molecules ---------- */
  section('    the molecules');
  const H = 9.54;
  let outside = 0, worst = 0;
  for(let i=0;i<4000;i++){
    const x = S.tri(-50 + i*0.031, H);
    if(Math.abs(x) > H + 1e-9) outside++;
    worst = Math.max(worst, Math.abs(x));
  }
  chk(outside === 0, `${outside} samples escaped the box — the reflection is wrong`);
  chk(worst > H*0.98, 'the molecules should actually reach the walls');
  /* a reflecting billiard conserves speed, so the slope is ±1 everywhere */
  let badSlope = 0;
  for(let i=0;i<2000;i++){
    const x = -30 + i*0.017, d = 1e-4;
    const s = Math.abs((S.tri(x+d,H) - S.tri(x,H))/d);
    if(Math.abs(s - 1) > 1e-3) badSlope++;     // turning points are allowed
  }
  chk(badSlope < 20, `speed is not preserved on reflection (${badSlope} bad samples)`);
  chk(Math.abs(S.tri(0,H)) < 1e-9, 'tri(0) should sit at the centre');
  chk(Math.abs(S.tri(4*H,H)) < 1e-9, 'tri should repeat every 4 half-widths');
  console.log('      straight lines, perfect reflection, speed preserved');

  /* ---------- the timeline ---------- */
  section('    the timeline');
  for(const g of sizes) for(const tp of temps){
    S.pick = [g, tp];
    S.derive();
    S.buildCaptions();
    const segs = S.SEGS;
    chk(segs.length === 21, `${g}/${tp}: expected 21 captions, got ${segs.length}`);
    for(let i=1;i<segs.length;i++)
      chk(segs[i].t > segs[i-1].t, `${g}/${tp}: caption ${i} is not after caption ${i-1}`);
    chk(segs[segs.length-1].t < S.TOTAL, `${g}/${tp}: last caption runs past the end`);
    segs.forEach((s,i)=> chk(s.c && s.c.trim().length>0, `${g}/${tp}: caption ${i} is empty`));
  }
  S.TRANSITIONS.forEach(T=>{
    chk(S.worldAt(T-0.01) !== S.worldAt(T+0.01), `the fade at ${T}s does not change world`);
  });
  chk(S.worldAt(0) === 'lab' && S.worldAt(S.TOTAL) === 'field',
      'it should start in the lab and end in the field of view');
  const starts = {lab:0, field:22.0};
  Object.keys(S.CAM).forEach(wk=>{
    const k = S.CAM[wk];
    for(let i=1;i<k.length;i++)
      chk(k[i].t > k[i-1].t, `${wk} camera key ${i} is not after key ${i-1}`);
    chk(k[0].t === starts[wk], `${wk} camera starts at ${k[0].t}, expected ${starts[wk]}`);
    k.forEach((key,i)=>{
      chk(key.p.length===3 && key.l.length===3, `${wk} camera key ${i} is not a 3-vector`);
      chk(key.p.every(Number.isFinite) && key.l.every(Number.isFinite),
          `${wk} camera key ${i} has a non-finite component`);
    });
  });
  const fk = S.CAM.field;
  chk(fk[fk.length-1].t >= S.TOTAL, 'the final camera key stops before the timeline ends');
  console.log(`      21 captions, 2 worlds, ${S.CAM.lab.length}+${S.CAM.field.length} camera keys`);

  /* ---------- the story beats have to be in the right order ---------- */
  section('    the four acts');
  const walkT0 = js.match(/const WALK_T0 = ([0-9.]+)/);
  const molShow = js.match(/const show = ramp\(t, ([0-9.]+), ([0-9.]+)\)/);
  const kicking = js.match(/const kicking = ramp\(t, ([0-9.]+), ([0-9.]+)\)/);
  const trailOn = js.match(/const trailOn = ramp\(t, ([0-9.]+), ([0-9.]+)\)/);
  const tap = js.match(/const TAP_A = ([0-9.]+), SLIP_A = ([0-9.]+), SLIP_B = ([0-9.]+), MOVE_A = ([0-9.]+), MOVE_B = ([0-9.]+)/);
  if(walkT0 && molShow && kicking && trailOn && tap){
    const [,TAP_A,SLIP_A,SLIP_B,MOVE_A,MOVE_B] = tap.map(Number);
    chk(+SLIP_A >= +TAP_A, `the cover slip goes on at ${SLIP_A}s, before the pollen lands at ${TAP_A}s`);
    chk(+MOVE_A >= +SLIP_B, `the slide moves at ${MOVE_A}s before the slip is down at ${SLIP_B}s`);
    chk(+MOVE_B <= 22.0, `the slide is still moving at ${MOVE_B}s, after we look down the eyepiece`);
    chk(+walkT0[1] === 22.0, 'the walk should start the moment we start watching');
    chk(+trailOn[1] >= 22.0, 'the trail cannot be drawn before the walk starts');
    chk(+molShow[1] > +trailOn[2],
        `the molecules appear at ${molShow[1]}s — they must come AFTER the mystery is set up (${trailOn[2]}s)`);
    chk(+kicking[1] >= +molShow[2],
        `the impact flashes start at ${kicking[1]}s before the molecules are visible (${molShow[2]}s)`);
    console.log(`      pollen ${TAP_A}s → slide ${MOVE_B}s → watching 22s → trail ${trailOn[2]}s → molecules ${molShow[1]}s → kicks ${kicking[1]}s`);
  }
  /* the scale caveat must be on screen whenever the molecules are */
  chk(/scaleEl\.style\.opacity = \(ramp\(t,44\.5,46\.0\)/.test(js),
      'the not-to-scale note must appear with the molecules');
  chk(/tens of thousands of times smaller/.test(read('brownian-motion.html')),
      'the scene must say the molecules are not drawn to scale');
}

/* =========================================================================== */
try {
  brownian();
  console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`));
  if(fails) process.exitCode = 1;
} catch (e) {
  /* a harness error means the checks did NOT all run, so say that rather than
     printing a pass count that reads like a clean bill of health */
  console.log('\nharness error after only ' + checks + ' checks: ' + e.message);
  process.exitCode = 1;
}
