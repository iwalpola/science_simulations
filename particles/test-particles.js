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

   And for the melting scene:
     - the energy balance is the balance it claims: albedo, air, latent heat
     - the prediction that every surface loses the same DEPTH per hour, which
       is why the head goes first, holds for all three balls
     - the puddle at the end holds exactly the water the snowman was built from
     - the molecular run melts on its own, stays in its box, is deterministic,
       and gives the same answer whether it is run in one go or in slices
     - the flattening in the heating curve is real, and the caption quotes the
       factor that was actually measured
     - captions that name a moment agree with the frame that moment happens on

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

/* ===========================================================================
   MELTING
=========================================================================== */
function melting(){
  section('MELTING  melting-snowman.html');
  const html = read('melting-snowman.html');
  const js = scriptOf(html);

  /* Four contiguous regions, none of which touch three.js: the energy balance
     and the two clocks, the maths helpers, the molecular run, and the
     timeline. Anchor each on something unique — anchoring on '/* =====' picks
     up whichever comment block comes first and silently hands back the wrong
     slice, which is how rng() went missing from the brownian suite. */
  const src = region(js, 'const SUNS = {', '/* ---------- renderer')
            + region(js, 'function lerp(a,b,t)', 'const SPH = new THREE.SphereGeometry')
            + region(js, 'const MD = {', '/* =====================================================================\n   THE GARDEN')
            + region(js, 'const TOTAL = 96', 'const camPos =');

  const S = evaluate(src,
    ['SUNS','AIRS','SNOW','BALLS','derive','SN','AIR','MELT','radiusAt','simFrac',
     'lapseRate','hoursText','puddleRadius','PUDDLE_DEPTH','moteCounts','MOTE_N',
     'stack','supportUnder','ballPos','WATER','CURVE','curveParts','curveTemp',
     'meltProgress','curveEnergy',
     'MD','meltRun','runMelt','meltWindow','curveSlope','ensureSim','PHYS','PHYS_WIN',
     'buildCaptions','meltPhrase','SEGS','TOTAL','TRANSITIONS','worldAt','CAM',
     'ICE_T0','ICE_T1','SIM_KEYS'],
    /* one setter is all evaluate() gives, so it does double duty: an array
       picks the weather, an object hands the finished run back in so the
       captions that quote it can be checked */
    'if(v&&v.phys){PHYS=v.phys;PHYS_WIN=v.win;}else{sunKey=v[0];airKey=v[1];}');

  /* ---------- the weather knobs ---------- */
  section('    the weather');
  const suns = ['cloudy','hazy','bright'], airs = ['cold','mild','warm'];
  for(let i=1;i<suns.length;i++)
    chk(S.SUNS[suns[i]].G > S.SUNS[suns[i-1]].G,
        `${suns[i]} must be brighter than ${suns[i-1]}`);
  for(let i=1;i<airs.length;i++)
    chk(S.AIRS[airs[i]].C > S.AIRS[airs[i-1]].C,
        `${airs[i]} must be warmer than ${airs[i-1]}`);
  chk(S.SNOW.ALBEDO > 0.5 && S.SNOW.ALBEDO < 1,
      'snow throws back most of the light, but not all of it');
  chk(S.WATER.L_FUS === 334000, 'the specific latent heat of fusion of ice is 334,000 J/kg');
  chk(S.WATER.C_ICE === 2100, 'the specific heat capacity of ice is 2100 J/kg\u00b0C');
  chk(S.WATER.C_WATER === 4200, 'the specific heat capacity of water is 4200 J/kg\u00b0C');
  chk(S.WATER.C_WATER === 2*S.WATER.C_ICE,
      'water takes twice what ice takes, and a caption says so');

  /* ---------- the energy balance ---------- */
  section('    the energy balance');
  const table = [];
  for(const su of suns) for(const ai of airs){
    S.pick = [su, ai];
    S.derive();
    const M = S.MELT, tag = `${su}/${ai}`;
    chk(Math.abs(M.fromAir - S.SNOW.H*S.AIRS[ai].C) < 1e-9,
        `${tag}: the air term is h times the temperature difference`);
    chk(Math.abs(M.fromSun - (1-S.SNOW.ALBEDO)*S.SUNS[su].G/4) < 1e-9,
        `${tag}: the sun term is what is left after the albedo, spread over the sphere`);
    chk(Math.abs(M.flux - (M.fromAir+M.fromSun)) < 1e-9, `${tag}: the two add up`);
    chk(Math.abs(M.shrink - M.flux/(S.SNOW.RHO*S.WATER.L_FUS)) < 1e-15,
        `${tag}: the melt rate is the flux divided by density times latent heat`);
    chk(M.hours > 0 && isFinite(M.hours), `${tag}: the melt time is a real number`);
    chk(M.airShare > 0 && M.airShare < 1, `${tag}: both supplies contribute something`);
    table.push(`${tag.padEnd(14)} ${M.flux.toFixed(0).padStart(4)} W/m²   air ` +
               `${(M.airShare*100).toFixed(0).padStart(2)}%   ${hoursPad(M.hours)}`);
  }
  table.forEach(r=>console.log('      '+r));
  function hoursPad(h){ return (h<48? h.toFixed(0)+' h' : (h/24).toFixed(1)+' days').padStart(8); }

  /* the trends a pupil is asked to explain */
  const time = (su,ai)=>{ S.pick=[su,ai]; S.derive(); return S.MELT.hours; };
  chk(time('bright','warm') < time('bright','cold'),
      'warmer air must melt it faster');
  chk(time('bright','warm') < time('cloudy','warm'),
      'more sunshine must melt it faster');
  chk(time('cloudy','cold') > 5*time('bright','warm'),
      'the worst case should be a great deal slower than the best, or the menu says nothing');

  /* and the one that is not obvious: which supply wins depends on the day */
  S.pick=['bright','warm']; S.derive();
  const warmShare = S.MELT.airShare;
  S.pick=['bright','cold']; S.derive();
  const coldShare = S.MELT.airShare;
  chk(warmShare > 0.5, 'on a warm bright day most of the energy should come from the air');
  chk(coldShare < 0.5, 'on a cold bright day the sun should be the bigger supply');
  console.log(`      bright/warm: ${(warmShare*100).toFixed(0)}% from the air;` +
              `  bright/cold: ${(coldShare*100).toFixed(0)}%`);

  /* ---------- every surface loses the same depth ---------- */
  section('    the balls, and why the head goes first');
  S.pick=['bright','warm']; S.derive();
  const slopes = S.BALLS.map((b,i)=>{
    const a=S.radiusAt(i,0.10), c=S.radiusAt(i,0.30);
    return (a-c)/0.20;
  });
  for(let i=1;i<slopes.length;i++)
    chk(Math.abs(slopes[i]-slopes[0]) < 1e-9,
        `ball ${i} must shrink at the same rate as the base — that is the whole prediction`);
  const goneAt = S.BALLS.map((b,i)=>{
    let f=0; while(f<1.001 && S.radiusAt(i,f)>0) f+=0.001;
    return f;
  });
  chk(goneAt[2] < goneAt[1] && goneAt[1] < goneAt[0],
      `the smallest ball must run out first — got ${goneAt.map(x=>x.toFixed(2)).join(', ')}`);
  chk(Math.abs(goneAt[0]-1) < 0.01, 'the base should run out exactly at the end of the melt');
  console.log(`      gone at: head ${goneAt[2].toFixed(2)}, body ${goneAt[1].toFixed(2)}, base ${goneAt[0].toFixed(2)} of the melt`);
  for(let f=0; f<=1.0001; f+=0.1)
    for(let i=0;i<3;i++)
      chk(S.radiusAt(i,f) >= 0, `ball ${i} must never have a negative radius (at f=${f.toFixed(1)})`);

  /* ---------- the stack settles, and nothing ends up inside anything ---------- */
  section('    the stack');
  let lastY = [Infinity,Infinity,Infinity];
  for(let f=0; f<=1.0001; f+=0.02){
    const r = S.stack(f);
    const P0=S.ballPos[0], P1=S.ballPos[1], P2=S.ballPos[2];
    chk(P1.y >= P0.y - 1e-9 && P2.y >= P1.y - 1e-9,
        `the balls must stay stacked in order (at f=${f.toFixed(2)})`);
    chk(P0.y <= BALLS0(S)*1.001, 'the base can never rise above where it started');
    for(let i=0;i<3;i++){
      chk(S.ballPos[i].y <= lastY[i] + 1e-9,
          `ball ${i} must only ever settle downwards (at f=${f.toFixed(2)})`);
      lastY[i] = S.ballPos[i].y;
    }
    /* the balls have to keep touching, or the snowman comes apart in mid-air */
    if(r[1] > 0.02) chk(P1.y - P0.y <= r[0]+r[1]+1e-9, `the body floats off the base at f=${f.toFixed(2)}`);
    if(r[2] > 0.02) chk(P2.y - P1.y <= r[1]+r[2]+1e-9, `the head floats off the body at f=${f.toFixed(2)}`);
    /* a prop on the head must never be left underneath the body's surface */
    const sup = S.supportUnder(0, 0, 2, r, 0.026);
    const bodyTop = r[1] > 0.02 ? S.ballPos[1].y + r[1]*0.96 : -1;
    chk(sup >= bodyTop - 1e-6,
        `the hat would be buried in the body at f=${f.toFixed(2)}: support ${sup.toFixed(3)} vs top ${bodyTop.toFixed(3)}`);
    chk(sup >= 0.026 - 1e-9, `nothing may rest below the ground at f=${f.toFixed(2)}`);
  }
  function BALLS0(S){ return S.BALLS[0].r*0.90; }
  /* off to the side of everything, the only support is the ground */
  chk(Math.abs(S.supportUnder(5, 0, 2, S.stack(0), 0.026) - 0.026) < 1e-9,
      'something well clear of the snowman rests on the ground');

  /* ---------- the water is conserved ---------- */
  section('    mass conservation');
  let last = -1;
  for(let f=0; f<=1.0001; f+=0.05){
    const pr = S.puddleRadius(f);
    chk(pr >= last - 1e-9, `the puddle must never shrink (at f=${f.toFixed(2)})`);
    last = pr;
  }
  const endVol = Math.PI*S.puddleRadius(1)*S.puddleRadius(1)*S.PUDDLE_DEPTH;
  chk(Math.abs(endVol - S.MELT.water) < 1e-6,
      `the finished puddle must hold the whole snowman: ${endVol.toFixed(3)} m³ vs ${S.MELT.water.toFixed(3)} m³`);
  chk(Math.abs(S.puddleRadius(0)) < 1e-9, 'there should be no puddle before anything has melted');
  console.log(`      ${S.MELT.mass.toFixed(0)} kg of snow → ${(S.MELT.water*1000).toFixed(0)} litres, a puddle ${(S.puddleRadius(1)*2).toFixed(1)} m across`);

  /* ---------- the motes are drawn in the right proportion ---------- */
  section('    the picture agrees with the numbers');
  for(const su of suns) for(const ai of airs){
    S.pick=[su,ai]; S.derive();
    const c = S.moteCounts();
    chk(c.nSun + c.nAir === S.MOTE_N, `${su}/${ai}: the two clouds must use all the motes`);
    chk(c.nSun >= 0 && c.nAir >= 0, `${su}/${ai}: neither cloud can have a negative count`);
    const wantSun = (S.SUNS[su].G/4) / (S.SUNS[su].G/4 + S.SNOW.H*S.AIRS[ai].C);
    chk(Math.abs(c.nSun/S.MOTE_N - wantSun) < 1.5/S.MOTE_N,
        `${su}/${ai}: the gold motes should be the incoming sunlight's share, not a look`);
  }

  /* ---------- the two clocks ---------- */
  section('    the clocks');
  chk(S.simFrac(0) === 0, 'no time has passed at the start');
  chk(Math.abs(S.simFrac(S.TOTAL) - 1) < 1e-9, 'the melt must be complete by the end');
  let prev = -1;
  for(let t=0;t<=S.TOTAL;t+=0.25){
    const f = S.simFrac(t);
    chk(f >= prev - 1e-9, `simulated time must never run backwards (at ${t}s)`);
    chk(f >= 0 && f <= 1.0000001, `the melt fraction must stay in range (at ${t}s)`);
    prev = f;
  }
  chk(S.simFrac(66) - S.simFrac(30) < 0.10,
      'almost no time should pass while we are inside the ice — the head has to survive it');
  chk(S.radiusAt(2, S.simFrac(66)) > 0,
      'the snowman must still have a head when we come back outside');
  chk(S.lapseRate(80) > S.lapseRate(20),
      'the last act is a time lapse and should say so by running faster than the first');

  /* ---------- the molecular run ---------- */
  section('    the molecules');
  const t0 = Date.now();
  const P = S.runMelt(S.MD);
  const ms = Date.now() - t0;
  chk(P.N === 4*S.MD.nx*S.MD.ny*S.MD.nz, 'four molecules to a face-centred cell');
  chk(P.frames > 100, 'there must be enough frames to interpolate between');
  console.log(`      ${P.N} molecules, ${P.frames} frames, ${ms} ms to work out`);

  /* nothing escapes the box */
  let inside = true, worst = 0;
  for(let i=0;i<P.frames;i++){
    for(let k=0;k<P.N;k++){
      const x=P.pos[(i*P.N+k)*3], y=P.pos[(i*P.N+k)*3+1], z=P.pos[(i*P.N+k)*3+2];
      if(x<0||x>P.LX||y<0||y>P.LY||z<0||z>P.LZ) inside=false;
      if(y>worst) worst=y;
    }
  }
  chk(inside, 'every molecule must stay inside the box it is shut in');

  /* it starts as a crystal and ends as a liquid, and nothing says when */
  chk(P.frac[0] > 0.98, `it must start as a crystal — got ${P.frac[0].toFixed(2)}`);
  chk(P.frac[P.frames-1] < 0.05, `it must end with the pattern gone — got ${P.frac[P.frames-1].toFixed(2)}`);
  let mono = true;
  for(let i=1;i<P.frames;i++) if(P.E[i] < P.E[i-1]) mono = false;
  chk(mono, 'the energy put in must only ever go up');
  chk(P.E[0] === 0, 'no energy has gone in before the heating starts');

  const W = S.meltWindow(P);
  chk(W.a > 0 && W.b > W.a && W.b < P.frames, 'the melting window must be inside the run');
  chk(W.a > P.frames*0.15, 'it should spend a while as a solid before it starts melting');
  chk(W.b < P.frames*0.98, 'and a while as a liquid afterwards');
  console.log(`      melts between frames ${W.a} and ${W.b} of ${P.frames}` +
              ` (${(P.E[W.a]).toFixed(2)} → ${(P.E[W.b]).toFixed(2)} of energy per molecule)`);

  /* The run's own temperature is not drawn any more — the graph is worked out
     from water's figures instead, because a few hundred molecules cannot hold a
     temperature still and the flat part is the point. It is still recorded, and
     still worth checking, because it is what says the simulation is doing
     physics at all rather than shuffling positions about. */
  chk(P.T[P.frames-1] > P.T[0]*3,
      'putting energy in must make the molecules move faster');
  const meanT = (i0,i1)=>{ let s=0; for(let i=i0;i<=i1;i++) s+=P.T[i]; return s/(i1-i0+1); };
  chk(meanT(Math.round(W.a*0.6), W.a) > meanT(0, Math.round(W.a*0.2)),
      'the solid must warm up before it melts');
  chk(meanT(W.b, P.frames-1) > meanT(W.a, W.b),
      'and the liquid must go on warming after it has');

  /* ---------- the heating curve is calculated, not measured ---------- */
  section('    the heating curve');
  const C = S.curveParts();
  chk(Math.abs(C.iceE   - S.WATER.C_ICE*(0-S.CURVE.T0)) < 1e-9,
      'the first stretch must be c times the temperature rise, for ice');
  chk(Math.abs(C.meltE  - S.WATER.L_FUS) < 1e-9,
      'the flat stretch must be the specific latent heat, and nothing else');
  chk(Math.abs(C.waterE - S.WATER.C_WATER*(S.CURVE.T1-0)) < 1e-9,
      'the last stretch must be c times the temperature rise, for water');
  chk(Math.abs(C.total - (C.iceE+C.meltE+C.waterE)) < 1e-9, 'the three stretches make the whole');
  /* the shape of it is the teaching: the flat part dominates */
  chk(C.meltE > 5*C.iceE,
      `melting must dwarf warming the ice up to it: ${(C.meltE/1000).toFixed(0)} kJ against ${(C.iceE/1000).toFixed(0)} kJ`);
  chk(C.meltE > 3*C.waterE, 'and dwarf warming the water afterwards too');
  console.log(`      ice ${(C.iceE/1000).toFixed(0)} kJ/kg, melting ${(C.meltE/1000).toFixed(0)} kJ/kg,` +
              ` water ${(C.waterE/1000).toFixed(0)} kJ/kg` +
              `  (the flat part is ${(C.meltE/C.total*100).toFixed(0)}% of the curve)`);

  /* and the curve really is flat through it, which is the whole complaint the
     measured version could not answer */
  chk(Math.abs(S.curveTemp(0) - S.CURVE.T0) < 1e-9, 'it starts as ice below freezing');
  chk(Math.abs(S.curveTemp(C.iceE)) < 1e-9, 'it reaches 0 \u00b0C exactly as melting starts');
  chk(Math.abs(S.curveTemp(C.iceE+C.meltE)) < 1e-9, 'and is still at 0 \u00b0C when melting ends');
  for(let k=0;k<=20;k++){
    const e = C.iceE + C.meltE*(k/20);
    chk(S.curveTemp(e) === 0, `the temperature must not move at all while it melts (at ${(k*5)}% through)`);
  }
  chk(Math.abs(S.curveTemp(C.total) - S.CURVE.T1) < 1e-9, 'and finishes where the curve says');
  /* the two slopes, read back off the curve, must be the data-book ones */
  const slopeIce   = (S.curveTemp(C.iceE) - S.curveTemp(0))/C.iceE;
  const slopeWater = (S.curveTemp(C.total) - S.curveTemp(C.iceE+C.meltE))/C.waterE;
  chk(Math.abs(1/slopeIce - S.WATER.C_ICE) < 1e-6, 'the ice slope must be 1/c for ice');
  chk(Math.abs(1/slopeWater - S.WATER.C_WATER) < 1e-6, 'the water slope must be 1/c for water');
  chk(slopeWater < slopeIce, 'water must warm more slowly than ice, per joule');

  /* ---------- the marker is driven by the molecules ---------- */
  section('    the marker');
  P.melted = S.meltProgress(P, W);
  chk(P.melted[0] === 0, 'nothing has melted at the start');
  chk(P.melted[W.a] === 0, 'nothing has melted when the melting window opens');
  chk(P.melted[W.b] === 1, 'and all of it has by the time it closes');
  chk(P.melted[P.frames-1] === 1, 'and it stays melted');
  let climbing = true;
  for(let i=1;i<P.frames;i++) if(P.melted[i] < P.melted[i-1]) climbing = false;
  chk(climbing, 'the melted fraction must never go backwards, or the marker slides back up the flat part');

  let lastE = -1, onFlat = 0;
  for(let i=0;i<P.frames;i++){
    const e = S.curveEnergy(P, W, i);
    chk(e >= lastE - 1e-6, `the marker must only ever move forwards (at frame ${i})`);
    chk(e >= -1e-6 && e <= C.total + 1e-6, `the marker must stay on the curve (at frame ${i})`);
    if(i > W.a && i < W.b){
      chk(S.curveTemp(e) === 0,
          `while the pattern is coming apart the marker must be on the flat part (at frame ${i})`);
      onFlat++;
    }
    lastE = e;
  }
  chk(onFlat > 50, 'the marker should spend a good while on the flat part');
  chk(Math.abs(S.curveEnergy(P, W, W.a) - C.iceE) < 1e-6,
      'the moment the first molecule breaks free must be the moment it reaches 0 \u00b0C');
  chk(Math.abs(S.curveEnergy(P, W, W.b) - (C.iceE+C.meltE)) < 1e-6,
      'and the moment the last one does must be the far end of the flat part');
  chk(S.curveTemp(S.curveEnergy(P, W, P.frames-1)) > 0,
      'it must finish as liquid water above freezing');
  /* the molecules must reach the flat part part-way through the act, not at
     the very end of it, or there is nothing to watch while it is flat */
  const flatFrom = S.ICE_T0 + (S.ICE_T1-S.ICE_T0)*(W.a/(P.frames-1));
  const flatTo   = S.ICE_T0 + (S.ICE_T1-S.ICE_T0)*(W.b/(P.frames-1));
  chk(flatTo - flatFrom > 5, `the flat part should be on screen for a while, got ${(flatTo-flatFrom).toFixed(1)}s`);

  /* determinism, and the slicing that keeps the page responsive */
  const Q = S.runMelt(S.MD);
  let same = true;
  for(let i=0;i<P.frames;i++) if(P.T[i]!==Q.T[i] || P.frac[i]!==Q.frac[i]) same=false;
  chk(same, 'two runs of the same seed must agree, or scrubbing is not repeatable');
  const r = S.meltRun(S.MD);
  while(!r.done) r.advance(377);           // a slice size nothing divides evenly
  const R = r.result;
  let sliced = true;
  for(let i=0;i<P.frames;i++) if(P.T[i]!==R.T[i] || P.frac[i]!==R.frac[i]) sliced=false;
  for(let i=0;i<P.pos.length;i+=101) if(P.pos[i]!==R.pos[i]) sliced=false;
  chk(sliced, 'running it in slices must give exactly the run done in one go');

  /* ---------- captions ---------- */
  section('    captions and camera');
  S.pick=['bright','warm']; S.derive();
  S.buildCaptions();
  chk(S.SEGS.length >= 16, `expected a caption per beat, got ${S.SEGS.length}`);
  for(let i=1;i<S.SEGS.length;i++)
    chk(S.SEGS[i].t > S.SEGS[i-1].t, `caption ${i} is not after caption ${i-1}`);
  S.SEGS.forEach((g,i)=> chk(g.c && g.c.trim().length > 0, `caption ${i} is empty`));
  chk(S.SEGS[0].t === 0, 'there must be a caption from the first frame');
  chk(S.SEGS[S.SEGS.length-1].t < S.TOTAL, 'the last caption must land before the end');
  /* the captions that quote a number have to move when the weather does */
  const capsAt = k => { S.pick=k; S.derive(); S.buildCaptions(); return S.SEGS.map(g=>g.c).join('|'); };
  chk(capsAt(['bright','warm']) !== capsAt(['cloudy','cold']),
      'the captions quote the settings, so they must differ between them');

  /* ---------- camera ---------- */
  S.pick=['bright','warm']; S.derive(); S.buildCaptions();
  const starts = {garden:0, ice:30.0};
  Object.keys(S.CAM).forEach(w=>{
    const k = S.CAM[w];
    for(let i=1;i<k.length;i++)
      chk(k[i].t > k[i-1].t, `${w} camera key ${i} is not after key ${i-1}`);
    chk(k[0].t === starts[w], `${w} camera starts at ${k[0].t}, expected ${starts[w]}`);
    k.forEach((key,i)=>{
      chk(Array.isArray(key.p) && Array.isArray(key.l) && key.p.length===3 && key.l.length===3,
          `${w} camera key ${i} is not a pair of 3-vectors`);
      chk(key.p.every(Number.isFinite) && key.l.every(Number.isFinite),
          `${w} camera key ${i} has a non-finite component`);
    });
  });
  const g = S.CAM.garden, ic = S.CAM.ice;
  chk(g[g.length-1].t >= S.TOTAL, 'the last garden key stops before the timeline ends');
  chk(ic[ic.length-1].t >= 66.0, 'the ice track must cover its whole act');
  /* the garden track has to have a key waiting on the far side of the gap */
  chk(g.some(k=>k.t === 30.0) && g.some(k=>k.t === 66.0),
      'the garden track needs a key at each end of the trip into the ice');
  console.log(`      ${S.SEGS.length} captions, 2 worlds, ${g.length}+${ic.length} camera keys`);

  /* ---------- the acts are in the right order ---------- */
  section('    the four acts');
  S.TRANSITIONS.forEach(T=>{
    chk(S.worldAt(T-0.01) !== S.worldAt(T+0.01), `the fade at ${T}s does not change world`);
  });
  chk(S.worldAt(0) === 'garden', 'it starts outside');
  chk(S.worldAt(S.TOTAL) === 'garden', 'and ends outside');
  chk(S.worldAt(45) === 'ice', 'the middle act is inside the ice');
  chk(S.ICE_T0 >= S.TRANSITIONS[0] && S.ICE_T1 <= S.TRANSITIONS[1],
      `the molecular playback (${S.ICE_T0}–${S.ICE_T1}s) must sit inside its act`);

  const packOn  = js.match(/const packOn = ramp\(t, ([0-9.]+), ([0-9.]+)\)/);
  const graphIn = js.match(/graphEl\.style\.opacity\s*=\s*\(inIce \? \(1-f\)\*ramp\(t,([0-9.]+),([0-9.]+)\)/);
  const moteShow= js.match(/const show = ramp\(t,([0-9.]+),([0-9.]+)\)/);
  chk(!!packOn && !!graphIn && !!moteShow, 'the act timings should be readable from the source');
  if(packOn && graphIn && moteShow){
    chk(+moteShow[2] < 30.0, 'the energy arriving must be on screen during the first act');
    chk(+packOn[1] > S.ICE_T0, 'the packets cannot land before the molecules are there');
    chk(+graphIn[1] > +packOn[2],
        `the graph appears at ${graphIn[1]}s — it should come after the energy is shown arriving (${packOn[2]}s)`);
    const meltStartsAt = S.ICE_T0 + (S.ICE_T1-S.ICE_T0)*(W.a/(P.frames-1));
    const meltEndsAt   = S.ICE_T0 + (S.ICE_T1-S.ICE_T0)*(W.b/(P.frames-1));
    /* the caption that announces the pattern breaking must not arrive before
       the molecules on screen have actually started to break it */
    const breakCap = S.SEGS.find(sg=>/there goes the pattern/i.test(sg.c));
    chk(!!breakCap, 'there should be a caption for the moment the pattern goes');
    if(breakCap){
      chk(breakCap.t >= meltStartsAt - 1.0,
          `the caption calls it at ${breakCap.t}s but the melting only starts at ${meltStartsAt.toFixed(1)}s`);
      chk(breakCap.t <= meltEndsAt,
          `the caption calls it at ${breakCap.t}s, after it has all melted (${meltEndsAt.toFixed(1)}s)`);
    }
    const breakingCap = S.SEGS.find(sg=>/shaken hard enough to break away/i.test(sg.c));
    chk(!!breakingCap && Math.abs(breakingCap.t - meltStartsAt) < 2.5,
        `the caption about the first molecule breaking free should land near ${meltStartsAt.toFixed(1)}s`);
    /* the caption that tells pupils the temperature is not moving has to be
       on screen while the marker is actually on the flat part */
    const flatCap = S.SEGS.find(sg=>/the temperature is not moving at all/i.test(sg.c));
    chk(!!flatCap, 'there should be a caption for the temperature holding still');
    if(flatCap) chk(flatCap.t > meltStartsAt && flatCap.t < meltEndsAt,
        `the caption says the temperature is not moving at ${flatCap.t}s, outside the flat stretch ` +
        `(${meltStartsAt.toFixed(1)}\u2013${meltEndsAt.toFixed(1)}s)`);
    const flatCap2 = S.SEGS.find(sg=>/That is what the flat part is/i.test(sg.c));
    chk(!!flatCap2 && flatCap2.t > meltStartsAt && flatCap2.t < meltEndsAt,
        'the caption naming the flat part must be on screen while the marker is on it');
    /* and the one that says it is still warming UP has to come before it gets
       to zero, or the graph beside it contradicts it */
    const warmCap = S.SEGS.find(sg=>/until it reaches 0/i.test(sg.c));
    chk(!!warmCap, 'there should be a caption for the ice warming up to 0 \u00b0C');
    if(warmCap){
      chk(warmCap.t < meltStartsAt,
          `the ice is said to be warming at ${warmCap.t}s, after it started melting at ${meltStartsAt.toFixed(1)}s`);
      const fr = Math.round((P.frames-1)*(warmCap.t-S.ICE_T0)/(S.ICE_T1-S.ICE_T0));
      chk(S.curveTemp(S.curveEnergy(P, W, fr)) < 0,
          'and the marker must still be below freezing while it says so');
    }
    const liquidCap = S.SEGS.find(sg=>/the temperature climb again/i.test(sg.c));
    chk(!!liquidCap && liquidCap.t >= meltEndsAt - 0.5,
        'the caption about the temperature climbing again must wait until it does');
    console.log(`      motes by ${moteShow[2]}s → ice at 30s → packets ${packOn[1]}s → graph ${graphIn[1]}s` +
                ` → melting ${meltStartsAt.toFixed(1)}–${meltEndsAt.toFixed(1)}s → outside at 66s`);
  }
  /* and the head has to still be there when the caption says it goes */
  const headCap = S.SEGS.find(sg=>/The head goes/i.test(sg.c));
  chk(!!headCap, 'there should be a caption for the head going');
  if(headCap){
    chk(S.radiusAt(2, S.simFrac(headCap.t-2)) > 0, 'the head must still be there just before the caption');
    chk(S.radiusAt(2, S.simFrac(headCap.t+2)) === 0, 'and gone just after it');
  }

  /* every figure a caption quotes has to be one of the constants, so that
     changing a constant cannot leave a caption behind saying the old one */
  S.pick=['bright','warm']; S.derive(); S.buildCaptions();
  const allCaps = S.SEGS.map(sg=>sg.c).join(' ');
  chk(allCaps.indexOf(String(S.WATER.C_ICE)) >= 0, 'a caption should quote the heat capacity of ice');
  chk(allCaps.indexOf(String(S.WATER.C_WATER)) >= 0, 'a caption should quote the heat capacity of water');
  chk(allCaps.indexOf('334,000') >= 0, 'a caption should quote the latent heat');
  chk(allCaps.indexOf('latent heat') >= 0, 'and name it');
  const snowmanMJ = (S.MELT.mass*S.WATER.L_FUS/1e6).toFixed(0);
  chk(allCaps.indexOf(snowmanMJ + ' million joules') >= 0,
      `a caption should work the latent heat out for this snowman (${snowmanMJ} MJ)`);
  chk(!/measured from the molecules/i.test(html),
      'the graph is calculated now, so nothing should still claim it was measured off them');

  /* ---------- the arms falling off, and the heat motes' colour ---------- */
  section('    cosmetic: the arms and the heat motes');
  const fallT = html.match(/const ARM_FALL_T = ([0-9.]+), ARM_FALL_DUR = ([0-9.]+)/);
  chk(!!fallT, 'the arm-fall timing should be readable from the source');
  if(fallT){
    chk(+fallT[1] === 80, `the arms should fall at 80s, not ${fallT[1]}s`);
    chk(+fallT[2] > 0 && +fallT[2] < 66.5-80+96, 'the fall should finish before the scene ends');
    chk(+fallT[1] + +fallT[2] < 96, 'the fall must land before the timeline runs out');
    /* it has to happen in the outro, after the middle ball is back in view */
    chk(+fallT[1] >= 66.0, 'the arms cannot fall while we are still inside the ice');
  }
  /* this line runs inside a "for the two arms" loop, so it appears once in
     the source and tags both at runtime — check it is there, not how many
     times the text repeats */
  chk(/for\(const s of \[-1, 1\]\)\{[\s\S]{0,400}?\.userData\.isArm = true/.test(js),
      'both arms should be tagged inside the loop that builds them');
  chk(/HEAT_COL_ORANGE/.test(js) && /HEAT_COL_YELLOW/.test(js),
      'the sun\'s motes should be given two named shades to blend between');
  const orangeHex = js.match(/HEAT_COL_ORANGE = new THREE\.Color\((0x[0-9a-f]+)\)/);
  const yellowHex = js.match(/HEAT_COL_YELLOW = new THREE\.Color\((0x[0-9a-f]+)\)/);
  chk(!!orangeHex && !!yellowHex && orangeHex[1] !== yellowHex[1],
      'the two heat shades must actually be different colours');

  /* the scrubber and the clock have to agree with the timeline they drive */
  const range = html.match(/id="scrub"[^>]*max="([0-9.]+)"/);
  chk(!!range && +range[1] === S.TOTAL,
      `the scrubber runs to ${range?range[1]:'?'} but the timeline is ${S.TOTAL}s long`);
  chk(new RegExp('0\.0 / ' + S.TOTAL.toFixed(1) + 's').test(html),
      'the clock in the bar should start at the right total');

  /* ---------- the things it admits to ---------- */
  section('    what it says it is not');
  chk(/not to scale/i.test(html), 'the close-up must say it is not to scale');
  chk(/simpler pattern than real ice|simpler pattern/i.test(html),
      'it must admit the molecules are not in ice\'s real pattern');
  chk(/scaleEl\.style\.opacity\s*=\s*\(inIce/.test(js),
      'the caveat must be on screen while the molecules are');
  chk(/the same molecular run whatever the weather/i.test(html),
      'the menu should say the close-up does not change with the weather');
}

/* =========================================================================== */
try {
  brownian();
  melting();
  console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`));
  if(fails) process.exitCode = 1;
} catch (e) {
  /* a harness error means the checks did NOT all run, so say that rather than
     printing a pass count that reads like a clean bill of health */
  console.log('\nharness error after only ' + checks + ' checks: ' + e.message);
  process.exitCode = 1;
}
