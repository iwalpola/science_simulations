/* ===========================================================================
   Tests for the particle scenes.   Run with:  node test-particles.js
   No dependencies — the scene file is read as text, and the parts worth
   checking are pulled out and run against a tiny Vector3 stub.

   What this checks:
     - the hard-sphere simulation is deterministic, so scrubbing is repeatable
     - its collisions are elastic: molecular energy holds, and the grains come
       out obeying equipartition, which nothing in the code arranges
     - nothing escapes — molecules stay in the box, grains stay in the drop
     - the grains behave like a random WALK, not a drift: net displacement is
       far shorter than the path travelled
     - the teaching MEASURES up: GRAINS.jiggle and TEMPS.jig are predictions,
       and the simulation is run at all nine settings to check them
     - the molecule motion is a true reflecting billiard (speed preserved), and
       triSlope agrees with the slope of tri, which the impulses depend on
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
  const src = region(js, 'const GRAINS = {', '/* ---------- renderer')
            + region(js, 'function lerp(a,b,t)', 'const lab = new THREE.Group()')
            + region(js, 'const TOTAL = 68', 'const camPos=');

  const S = evaluate(src,
    ['GRAINS','TEMPS','derive','GR','TP','JIG','SPEED','SIM','runSim','molAt',
     'grainAt','firstHit','tri','triSlope','rng','buildCaptions','SEGS','TOTAL',
     'TRANSITIONS','worldAt','CAM'],
    'grainKey=v[0];tempKey=v[1];');

  /* ---------- the knobs ---------- */
  section('    the physics knobs');
  const sizes = ['small','medium','large'];
  for(let i=1;i<sizes.length;i++){
    chk(S.GRAINS[sizes[i]].um > S.GRAINS[sizes[i-1]].um,
        `${sizes[i]} should be a bigger grain than ${sizes[i-1]}`);
    /* jiggle is a PREDICTION here, not a setting — what the simulation
       actually does with it is measured further down */
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
  console.log(`      smallest+hottest is predicted to jiggle ${(hi/lo).toFixed(1)}× the largest+coldest`);

  /* =====================================================================
     THE SIMULATION

     The grains are no longer walked along precomputed waypoints — they are
     hit by molecules. So the things worth checking have changed: not "is the
     scripted path shaped like a walk", but "does hard-sphere dynamics come
     out of this, and does the scene's teaching fall out of it".

     runSim() is written with no three.js in it for exactly this reason: it
     runs here, under node, unchanged.
  ===================================================================== */
  section('    the simulation');

  /* six grains all the same size, spread out, for measurements that need more
     than one walk to mean anything */
  const ensemble = () => {
    const out = [];
    for(let i=0;i<6;i++)
      out.push({r:S.GR.r, keep:true, x:Math.cos(i*1.0472)*3.2,
                y:Math.sin(i*1.0472)*3.2, z:(i%2?0.8:-0.8)});
    return out;
  };
  /* and the six the scene actually builds, so containment is checked on the
     shape that ships rather than on a convenient one */
  const sceneShape = () => {
    const out = [];
    for(let i=0;i<6;i++){
      const hero = i===0, r = S.GR.r*(hero?1:0.62+(i%3)*0.18);
      out.push({r, keep:hero, x: hero?-1.2:Math.cos(i*1.9)*9.0*0.44,
                   y: hero? 0.6:Math.sin(i*1.9)*9.0*0.40,
                   z: hero? 0.0:(i%2?1.2:-1.4)});
    }
    return out;
  };
  const T0 = 22.0;

  S.pick = ['medium','room']; S.derive();
  const P = S.runSim(sceneShape(), T0, S.TOTAL);

  /* ---------- determinism: the whole point of precomputing ---------- */
  const P2 = S.runSim(sceneShape(), T0, S.TOTAL);
  let identical = P.rec.length === P2.rec.length && P.hitT.length === P2.hitT.length;
  for(let i=0; identical && i<P.rec.length; i++)
    if(P.rec[i] !== P2.rec[i]) identical = false;
  chk(identical, 'two runs of the same settings must agree exactly, or scrubbing is not repeatable');

  /* sampling is a pure function of t, and continuous between samples */
  const a = new V3(), b = new V3();
  S.grainAt(P,0,7.3,a); S.grainAt(P,0,7.3,b);
  chk(a.x===b.x && a.y===b.y && a.z===b.z, 'grainAt must be a pure function of t');
  S.grainAt(P,0,7.30,a); S.grainAt(P,0,7.34,b);
  chk(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z) < 0.25, 'the grain path should be continuous, not a jump');
  S.molAt(P.ev[17],5.1,a); S.molAt(P.ev[17],5.1,b);
  chk(a.x===b.x && a.y===b.y && a.z===b.z, 'molAt must be a pure function of t');

  /* ---------- nothing escapes ---------- */
  let worstXY = 0, worstZ = 0;
  for(let t=0; t<=S.TOTAL-T0; t+=1.7)
    for(let i=0;i<S.SIM.N;i+=3){
      S.molAt(P.ev[i], t, a);
      worstXY = Math.max(worstXY, Math.abs(a.x), Math.abs(a.y));
      worstZ  = Math.max(worstZ, Math.abs(a.z));
    }
  chk(worstXY <= S.SIM.BX + 1e-4 && worstZ <= S.SIM.BZ + 1e-4,
      `a molecule left the box (${worstXY.toFixed(2)} of ${S.SIM.BX.toFixed(2)}, ` +
      `${worstZ.toFixed(2)} of ${S.SIM.BZ})`);
  chk(worstXY > S.SIM.BX*0.97, 'the molecules should actually reach the walls');

  let worstGrain = 0;
  for(let g=0; g<6; g++){
    const gr = sceneShape()[g].r;
    for(let t=0; t<=S.TOTAL-T0; t+=0.2){
      S.grainAt(P,g,t,a);
      worstGrain = Math.max(worstGrain, Math.hypot(a.x,a.y) + gr);
    }
  }
  chk(worstGrain <= S.SIM.DROP_R + 1e-3,
      `a grain left the drop (reached ${worstGrain.toFixed(2)} of ${S.SIM.DROP_R.toFixed(2)})`);
  console.log(`      molecules reach ${worstXY.toFixed(2)}/${S.SIM.BX.toFixed(2)} across the box, ` +
              `grains stay inside ${worstGrain.toFixed(2)}/${S.SIM.DROP_R.toFixed(2)} of the drop`);

  /* ---------- the collisions are elastic ----------
     Two independent ways to catch a collision routine that quietly creates or
     destroys energy, which is the classic way a hard-sphere loop goes wrong:

     1. the molecular kinetic energy must come out where it went in. The grains
        hold a share too, but they are heavy and slow, so this is nearly all
        of it and must not drift.
     2. equipartition. Whatever the grain's mass, the collisions must leave it
        with ½M⟨v²⟩ = ½m⟨u²⟩ per axis — so its RMS speed must be the
        molecules' scaled by √(m/M). Nothing in the code arranges that; it is
        only true if momentum and energy are being handed over correctly. */
  const molKE = tAt => {
    let e = 0;
    for(let i=0;i<S.SIM.N;i++){
      const A = P.ev[i]; let k = A.length-7;
      while(k>0 && A[k]>tAt) k -= 7;
      e += 0.5*S.SIM.M*(A[k+4]*A[k+4] + A[k+5]*A[k+5] + A[k+6]*A[k+6]);
    }
    return e;
  };
  const ke0 = molKE(0), ke1 = molKE(S.TOTAL-T0);
  chk(Math.abs(ke1/ke0 - 1) < 0.03,
      `the molecules gained or lost energy (${((ke1/ke0-1)*100).toFixed(1)}%) — the collisions are not elastic`);
  console.log(`      molecular kinetic energy holds to ${((ke1/ke0-1)*100).toFixed(2)}% over ${(S.TOTAL-T0).toFixed(0)}s`);

  /* ---------- the impact log the last act is built on ---------- */
  chk(P.hitT.length > 100, `only ${P.hitT.length} impacts on the hero grain — too few to read as a barrage`);
  let sorted = true, unit = true, positive = true;
  for(let k=0;k<P.hitT.length;k++){
    if(k && P.hitT[k] < P.hitT[k-1]) sorted = false;
    const n = Math.hypot(P.hitN[k*3], P.hitN[k*3+1], P.hitN[k*3+2]);
    if(Math.abs(n-1) > 1e-3) unit = false;
    if(!(P.hitJ[k] > 0)) positive = false;
  }
  chk(sorted, 'the impact log must be in time order, or firstHit() searches nonsense');
  chk(unit, 'every impact normal must be a unit vector');
  chk(positive, 'an impact must transfer a positive impulse — a negative one would pull the grain in');
  chk(P.hitT[0] >= T0 && P.hitT[P.hitT.length-1] <= S.TOTAL,
      'the impacts must be stamped with scene time, inside the timeline');
  console.log(`      ${P.hitT.length} impacts on the hero grain, ` +
              `${(P.hitT.length/(S.TOTAL-T0)).toFixed(1)} a second, all in order`);

  /* ---------- a walk, not a drift ----------
     The signature: the net displacement grows like √t, so it ends up far
     shorter than the distance actually travelled. A grain being pushed by a
     current, or one with a bug letting momentum accumulate, would not. */
  let path = 0;
  for(let k=1;k<P.nRec;k++){
    const o = k*P.nG*3, q = (k-1)*P.nG*3;
    path += Math.hypot(P.rec[o]-P.rec[q], P.rec[o+1]-P.rec[q+1], P.rec[o+2]-P.rec[q+2]);
  }
  S.grainAt(P,0,0,a); S.grainAt(P,0,S.TOTAL-T0,b);
  const net = Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
  chk(net < path*0.35, `this is meant to be a walk, not a drift — net ${net.toFixed(1)} vs path ${path.toFixed(1)}`);
  chk(net > 0.2, 'it should still get somewhere, not return exactly to the start');
  console.log(`      the hero travels ${path.toFixed(1)} units to end up ${net.toFixed(1)} from where it began`);

  /* ---------- and now the teaching, measured ----------
     GRAINS.jiggle and TEMPS.jig are predictions, not settings. Nothing feeds
     them into the simulation, so this is a real check: run all nine, measure
     how far the grains actually get, and see whether the numbers on the menu
     are the numbers that come out.

     Measured over an 8-second lag, from six grains, at every start time — one
     grain over one run is a single throw of the dice and says nothing. The
     remaining tolerance is wide because two known effects bias it: below the
     grain's momentum relaxation time the motion is still ballistic rather
     than diffusive, and at the lively end the pool's edge starts to cut the
     spread short. Both flatten the ratios slightly. What must not happen is a
     trend going the wrong way, or an exponent being wrong. */
  section('    what the simulation produces');
  const LAG = 8, rms = {};
  for(const g of sizes) for(const tp of temps){
    S.pick = [g, tp]; S.derive();
    const R = S.runSim(ensemble(), T0, S.TOTAL);
    let s2 = 0, c = 0;
    for(let gi=0; gi<6; gi++)
      for(let t=0; t+LAG <= S.TOTAL-T0; t+=0.25){
        S.grainAt(R,gi,t,a); S.grainAt(R,gi,t+LAG,b);
        s2 += (a.x-b.x)*(a.x-b.x) + (a.y-b.y)*(a.y-b.y);   // in the plane we watch
        c++;
      }
    rms[g+'/'+tp] = Math.sqrt(s2/c);

    /* equipartition, from the recorded path */
    let v2 = 0, n = 0;
    for(let k=1;k<R.nRec;k++)
      for(let gi=0; gi<6; gi++){
        const o = (k*R.nG+gi)*3, q = ((k-1)*R.nG+gi)*3;
        v2 += ((R.rec[o]-R.rec[q])**2 + (R.rec[o+1]-R.rec[q+1])**2 +
               (R.rec[o+2]-R.rec[q+2])**2)/(S.SIM.REC*S.SIM.REC);
        n++;
      }
    const measured = Math.sqrt(v2/n/3);
    const M = S.SIM.M*S.SIM.MASS*Math.pow(S.GR.r/S.GRAINS.medium.r, 3);
    const expect = S.SIM.SIGMA*S.SPEED*Math.sqrt(S.SIM.M/M);
    chk(Math.abs(measured/expect - 1) < 0.2,
        `${g}/${tp}: equipartition is broken — grain RMS speed ${measured.toFixed(3)}, ` +
        `expected ${expect.toFixed(3)} from ½M⟨v²⟩ = ½m⟨u²⟩`);
  }
  console.log(`      RMS displacement over ${LAG}s, and what jiggle × jig predicts:`);
  for(const g of sizes){
    console.log('      ' + g.padEnd(7) + temps.map(tp=>{
      S.pick=[g,tp]; S.derive();
      const r = rms[g+'/'+tp]/rms['medium/room'];
      return `${tp} ${r.toFixed(2)}/${S.JIG.toFixed(2)}`;
    }).join('  '));
  }
  /* the two trends, at every setting of the other knob */
  for(const tp of temps) for(let i=1;i<sizes.length;i++)
    chk(rms[sizes[i]+'/'+tp] < rms[sizes[i-1]+'/'+tp],
        `in ${tp} water the ${sizes[i]} grain wandered further than the ${sizes[i-1]} one ` +
        `(${rms[sizes[i]+'/'+tp].toFixed(2)} vs ${rms[sizes[i-1]+'/'+tp].toFixed(2)}) — the size trend is backwards`);
  for(const g of sizes) for(let i=1;i<temps.length;i++)
    chk(rms[g+'/'+temps[i]] > rms[g+'/'+temps[i-1]],
        `a ${g} grain wandered less in ${temps[i]} water than in ${temps[i-1]} ` +
        `(${rms[g+'/'+temps[i]].toFixed(2)} vs ${rms[g+'/'+temps[i-1]].toFixed(2)}) — the temperature trend is backwards`);
  /* and the predictions on the menu have to be roughly what comes out */
  for(const g of sizes) for(const tp of temps){
    S.pick=[g,tp]; S.derive();
    const got = rms[g+'/'+tp]/rms['medium/room'];
    chk(Math.abs(got/S.JIG - 1) < 0.45,
        `${g}/${tp}: the menu predicts ${S.JIG.toFixed(2)}× the medium/room wander, ` +
        `the simulation gives ${got.toFixed(2)}×`);
  }
  const spread = rms['small/hot']/rms['large/cold'];
  chk(spread > 3, `the liveliest setting should be clearly livelier than the dullest (${spread.toFixed(1)}×)`);
  console.log(`      smallest+hottest really does wander ${spread.toFixed(1)}× the largest+coldest`);

  /* ---------- the closed forms the playback rests on ---------- */
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
  let badSlope = 0, badSign = 0;
  for(let i=0;i<2000;i++){
    const x = -30 + i*0.017, d = 1e-4;
    const s = (S.tri(x+d,H) - S.tri(x,H))/d;
    if(Math.abs(Math.abs(s) - 1) > 1e-3) badSlope++;     // turning points are allowed
    /* triSlope IS that slope, and the collision code reads the molecule's
       velocity off it — so if the two ever disagree, every impulse computed
       near a wall is wrong */
    else if(Math.sign(s) !== S.triSlope(x,H)) badSign++;
  }
  chk(badSlope < 20, `speed is not preserved on reflection (${badSlope} bad samples)`);
  chk(badSign === 0, `triSlope disagrees with the slope of tri at ${badSign} samples`);
  chk(Math.abs(S.tri(0,H)) < 1e-9, 'tri(0) should sit at the centre');
  chk(Math.abs(S.tri(4*H,H)) < 1e-9, 'tri should repeat every 4 half-widths');
  console.log('      straight lines, perfect reflection, speed preserved, velocity sign agrees');

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
