/* ===========================================================================
   Tests for electricity/wire-resistance.html.   Run with:

       node test-wire.js

   Two halves, for the two things that can go wrong.

   THE MODEL  (no three.js needed)

   The PHYSICS block is lifted straight out of the page as text and run under
   node. Everything the scene puts on screen as a number comes out of that
   block, so this is where the teaching gets checked: that resistance rises
   with temperature, that the mean free path shortens, that switching the
   battery off really does stop the drift and the heating, and that an
   electron never changes direction except by hitting something.

   That last one is the point of the whole simulation, so it is asserted
   directly rather than trusted: the run is replayed step by step and the
   velocity is required to be bit-for-bit unchanged on every step where no ion
   and no wall was struck.

   The reference drift V_REF is quoted in the page and used to normalise the
   current and resistance readouts. It is re-derived here from the same model,
   so it cannot silently drift away from what the page actually does.

   THE RENDER PATH  (needs the three.js the page itself loads)

   The scene is evaluated for real and every scene in the story is driven for
   a few hundred frames, looking for thrown errors and bad arithmetic — a
   frame that throws, an instance matrix or a camera that goes non-finite, a
   frame that draws nothing. This exists for the same reason particles/
   test-render.js does: a runtime error in a draw function leaves a blank page
   with the sidebar still sitting on top of it, and nothing else catches it.

   It rasterises nothing and compares nothing, so it cannot tell you whether
   any of it LOOKS right. The user checks that.

   With no network and no cached three.js it says so and skips that half
   rather than failing — a machine being offline is not a bug in the scene.
=========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CACHE_DIR = path.join(__dirname, '.three-cache');
const HTML = fs.readFileSync(path.join(__dirname, 'wire-resistance.html'), 'utf8');

let fails = 0, checks = 0;
function chk(ok, msg){
  checks++;
  if(!ok){ fails++; console.log('    FAIL  ' + msg); }
}
function section(s){ console.log('\n' + s); }
function note(s){ console.log('      ' + s); }

/* the page's one inline <script> — the other tag is three.js, which has a src */
function pageScript(){
  const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
  if(!m) throw new Error('no inline <script> in the page');
  return m[1];
}

/* ===========================================================================
   THE MODEL
=========================================================================== */
function loadPhysics(){
  const js = pageScript();
  const a = js.indexOf('/* ============================ PHYSICS ');
  const b = js.indexOf('/* ========================== END PHYSICS ');
  if(a < 0 || b < 0) throw new Error('the PHYSICS block markers have moved');
  const src = js.slice(a, b);
  const sandbox = {module:{exports:{}}, console, Math, Float32Array, Int32Array,
                   Uint8Array, Uint32Array};
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, {filename:'PHYSICS'});
  return sandbox.module.exports;
}

/* the same loop the page runs, with the totals read off at the end */
function run(P, kind, TK, field, secs, opts){
  opts = opts || {};
  const cfg = P.LATTICES[kind];
  const lat = P.buildLattice(cfg.nx, cfg.ny, cfg.nz, 7);
  const st  = P.makeElectrons(lat, opts.ne || cfg.nsim, 11);
  const sim = {t:0};
  const dt = 1/60, N = Math.round(secs/dt);
  for(let i=0;i<(N>>2);i++) P.tick(st, lat, sim, dt, field, TK);   // settle first
  st.path = 0; st.coll = 0; st.work = 0; st.xt = 0;
  for(let i=0;i<N;i++) P.tick(st, lat, sim, dt, field, TK);
  const m = P.measure(st, secs);
  m.lat = lat; m.st = st;
  return m;
}

function testModel(P){
  section('THE MODEL  (lifted out of the page, run under node)');

  /* ---------- the vibration, and the lattice surviving it ---------- */
  section('    ions vibrate harder but stay on their sites');
  chk(Math.abs(P.ampAt(P.T_AMB) - P.VIB0) < 1e-9,
      'amplitude at room temperature is not VIB0');
  chk(Math.abs(P.ampAt(4*P.T_AMB) - 2*P.VIB0) < 1e-9,
      'amplitude does not go as the square root of temperature');

  const nn = P.LAT_A/Math.SQRT2;                 // fcc nearest neighbour
  const ampHot = P.ampAt(P.T_MAX);
  /* worst case: two neighbours at opposite ends of their swing, closing on
     each other along the line between them */
  const approach = 2.4*ampHot;
  chk(nn - 2*P.R_ION - approach > 0.15,
      `the lattice comes apart at T_MAX: cores get within ${(nn-2*P.R_ION-approach).toFixed(3)}`);
  note(`nearest neighbour ${nn.toFixed(2)}, ion core ${P.R_ION}, ` +
       `swing ${P.ampAt(P.T_AMB).toFixed(2)} → ${ampHot.toFixed(2)}, ` +
       `closest approach of two cores ${(nn-2*P.R_ION-approach).toFixed(2)}`);

  chk(P.collR(P.T_MAX) > P.collR(P.T_AMB),
      'a hot ion is not harder to get past than a cold one');

  /* ---------- an electron cannot steer ---------- */
  section('    an electron only turns when something turns it');
  {
    const lat = P.buildLattice(6, 3, 1, 7);
    const st  = P.makeElectrons(lat, 24, 11);
    const sim = {t:0}, dt = 1/60;
    let steps = 0, free = 0, turnedForNoReason = 0, collisions = 0, walls = 0;
    const before = new Float64Array(3);
    for(let i=0;i<3000;i++){
      P.ionsAt(lat, sim.t += dt, P.ampAt(P.T_AMB));
      for(let e=0;e<st.n;e++){
        before[0] = st.vel[3*e]; before[1] = st.vel[3*e+1]; before[2] = st.vel[3*e+2];
        P.advance(st, lat, e, dt, P.FIELD, P.collR(P.T_AMB));
        steps++;
        if(st.hit[e] >= 0){ collisions++; continue; }
        /* the wire's surface turns it too, and says so by pinning the
           coordinate exactly to the boundary */
        const aty = Math.abs(Math.abs(st.pos[3*e+1]) - lat.by) < 1e-12;
        const atz = Math.abs(Math.abs(st.pos[3*e+2]) - lat.bz) < 1e-12;
        if(aty || atz){ walls++; continue; }
        free++;
        /* the battery adds to vx and nothing else: vy and vz must be untouched
           and vx must only ever have gone up by exactly the push */
        /* vx is stored as float32, so allow the rounding; vy and vz are
           written back unchanged and must match exactly */
        const dvx = st.vel[3*e] - before[0] - P.FIELD*dt;
        if(Math.abs(dvx) > 1e-4 ||
           st.vel[3*e+1] !== before[1] || st.vel[3*e+2] !== before[2]) turnedForNoReason++;
      }
    }
    chk(turnedForNoReason === 0,
        `${turnedForNoReason} of ${free} free steps changed direction with nothing to hit`);
    chk(collisions > 200, `barely any collisions happened at all (${collisions})`);
    note(`${steps} steps: ${free} free, ${collisions} into an ion, ${walls} into the surface`);
  }

  /* ---------- battery off ---------- */
  section('    battery off: no drift, no heating');
  for(const kind of ['slab','tunnel']){
    const off = run(P, kind, P.T_AMB, 0, 90);
    chk(Math.abs(off.drift) < 0.08,
        `${kind}: electrons drift ${off.drift.toFixed(3)} with the battery off`);
    chk(off.coll > 0.2, `${kind}: electrons stopped moving entirely`);
    note(`${kind}: drift ${off.drift.toFixed(4)}, still colliding ${off.coll.toFixed(2)}/s`);
  }

  /* ---------- the reference the readouts are quoted against ---------- */
  section('    the 1.00 that current and resistance are measured from');
  for(const kind of ['slab','tunnel']){
    const r = run(P, kind, P.T_AMB, P.FIELD, 140);
    const want = P.V_REF[kind];
    const err = Math.abs(r.drift - want)/want;
    chk(err < 0.025,
        `${kind}: V_REF says ${want}, the model gives ${r.drift.toFixed(3)} (${(err*100).toFixed(1)}% out)`);
    note(`${kind}: V_REF ${want}, measured ${r.drift.toFixed(3)}`);
  }

  /* ---------- the whole teaching point ---------- */
  section('    hotter lattice → shorter runs, more collisions, more resistance');
  const TEMPS = [293, 500, 700, 900, 1100, 1250];
  for(const kind of ['slab','tunnel']){
    const rows = TEMPS.map(TK => {
      const r = run(P, kind, TK, P.FIELD, 110);
      return {TK, mfp:r.mfp, coll:r.coll, drift:r.drift,
              res: P.V_REF[kind]/r.drift};
    });
    note(kind + ':  T(°C)   free run      collisions   drift    resistance');
    rows.forEach(r => note(
      `        ${String(r.TK-273).padStart(5)}   ` +
      `${(r.mfp/P.LAT_A).toFixed(2)} cells    ` +
      `${r.coll.toFixed(2)} /s     ` +
      `${r.drift.toFixed(3)}    ${r.res.toFixed(2)}`));

    for(let i=1;i<rows.length;i++){
      chk(rows[i].mfp < rows[i-1].mfp,
          `${kind}: the free run got LONGER from ${rows[i-1].TK-273} to ${rows[i].TK-273} °C`);
      chk(rows[i].coll > rows[i-1].coll,
          `${kind}: collisions got RARER from ${rows[i-1].TK-273} to ${rows[i].TK-273} °C`);
      chk(rows[i].res > rows[i-1].res,
          `${kind}: resistance FELL from ${rows[i-1].TK-273} to ${rows[i].TK-273} °C`);
    }
    const lift = rows[rows.length-1].res / rows[0].res;
    chk(lift > 1.35,
        `${kind}: resistance only rose ${lift.toFixed(2)}x over the whole range — too small to teach from`);
    chk(rows[0].mfp / rows[rows.length-1].mfp > 1.5,
        `${kind}: the free run barely shortened`);
    note(`        resistance x${lift.toFixed(2)} and the free run ` +
         `÷${(rows[0].mfp/rows[rows.length-1].mfp).toFixed(2)} across the range`);
  }

  /* ---------- the heating is the battery's work, and nothing else ---------- */
  section('    the heating comes from the battery doing work');
  {
    const on  = run(P, 'slab', P.T_AMB, P.FIELD, 110);
    const off = run(P, 'slab', P.T_AMB, 0, 110);
    chk(on.work > off.work,
        'switching the battery on does not put any more energy into the lattice');
    note(`work handed to the lattice: ${off.work.toFixed(2)}/s off, ${on.work.toFixed(2)}/s on`);
  }

  /* ---------- and it settles somewhere sensible ---------- */
  section('    the wire settles at a steady temperature');
  {
    /* the page's balance: K_HEAT x (push x drift) against COOL x (T - T_AMB) */
    let TK = P.T_AMB, last = 0;
    for(let i=0;i<40;i++){
      const r = run(P, 'slab', TK, P.FIELD, 30, {ne:80});
      const power = P.FIELD*r.drift;
      last = TK;
      TK += (P.K_HEAT*power - P.COOL*(TK - P.T_AMB))*1.2;
      TK = Math.max(P.T_AMB, Math.min(P.T_MAX, TK));
      if(Math.abs(TK - last) < 1) break;
    }
    chk(TK > 700 && TK < P.T_MAX,
        `the wire settles at ${Math.round(TK-273)} °C — wanted somewhere visibly hot but short of the cap`);
    note(`steady state ${Math.round(TK - 273)} °C`);
  }
}

/* ===========================================================================
   THE RENDER PATH
=========================================================================== */
function threeUrlOf(html){
  const m = html.match(/<script src="([^"]*three[^"]*\.js)"><\/script>/);
  if(!m) throw new Error('no three.js <script src> found in the page');
  return m[1];
}
async function ensureThree(url){
  const name = url.split('/').slice(-3).join('-').replace(/[^\w.-]/g, '_');
  const file = path.join(CACHE_DIR, name);
  if(fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const shared = path.join(__dirname, '..', 'particles', '.three-cache', name);
  if(fs.existsSync(shared)) return fs.readFileSync(shared, 'utf8');
  if(typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url);
    if(!res.ok) return null;
    const src = await res.text();
    fs.mkdirSync(CACHE_DIR, {recursive:true});
    fs.writeFileSync(file, src);
    console.log('  fetched ' + url);
    return src;
  } catch(e){ return null; }
}
function loadThree(src){
  /* the UMD wrapper sniffs its environment; given both it fills `exports`,
     which has to be the same object we then read back */
  const exports = {};
  const sandbox = {module:{exports}, exports, console};
  sandbox.self = sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, {filename:'three.js'});
  for(const cand of [sandbox.exports, sandbox.module.exports, sandbox.THREE])
    if(cand && cand.Vector3) return cand;
  return null;
}

/* Just enough browser. None of this models one: each stub answers what the
   page asks of it and nothing else, so a mis-typed element id sails straight
   past. It is looking for thrown errors and bad arithmetic. */
function makeDom(){
  const els = new Map();
  function mkEl(id){
    const el = {
      id, width:300, height:150, innerHTML:'', textContent:'', value:0, title:'',
      hidden:false, disabled:false, style:{},
      classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                  toggle(c,on){ on ? this._s.add(c) : this._s.delete(c); },
                  contains(c){ return this._s.has(c); } },
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
      setAttribute(){}, getAttribute(){ return null; },
      setPointerCapture(){}, focus(){}, blur(){},
      /* the cards read their own <b> back to write numbers into, so hand out
         real objects — otherwise the readout code has nothing to write to and
         throws, which is exactly the class of bug this file is here for */
      querySelectorAll(){ return [0,1,2,3,4,5,6,7].map(()=>mkEl('b')); },
      querySelector(){ return null; },
      getBoundingClientRect(){ return {left:0, top:0, width:1280, height:720}; }
    };
    el.getContext = () => ({
      canvas:el, measureText:s=>({width:String(s||'').length*8}),
      fillRect(){}, clearRect(){}, fillText(){}, beginPath(){}, closePath(){},
      moveTo(){}, lineTo(){}, arc(){}, fill(){}, stroke(){}, save(){}, restore(){},
      translate(){}, rotate(){}, scale(){}, setTransform(){},
      createLinearGradient(){ return {addColorStop(){}}; },
      createRadialGradient(){ return {addColorStop(){}}; }
    });
    return el;
  }
  return {
    getElementById(id){ if(!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag){ return mkEl(tag); },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){},
    body: mkEl('body'), documentElement: mkEl('html')
  };
}

/* WebGLRenderer and PMREMGenerator are the only parts of three.js that need a
   graphics context, so they are the only parts replaced. */
function stubRenderer(THREE, dom){
  THREE.WebGLRenderer = class {
    constructor(){
      this.domElement = dom.createElement('canvas');
      this.__renders = 0;
      this.outputEncoding = 0; this.toneMapping = 0; this.toneMappingExposure = 1;
    }
    setPixelRatio(){} setSize(){} setClearColor(){} dispose(){}
    getContext(){ return {}; }
    render(){ this.__renders++; }
  };
  THREE.PMREMGenerator = class {
    constructor(){}
    fromScene(){ return {texture: new THREE.Texture()}; }
    fromEquirectangular(){ return {texture: new THREE.Texture()}; }
    compileEquirectangularShader(){}
    dispose(){}
  };
}

function evaluateScene(THREE, dom){
  const expose = [
    'SCENES','M','LATTICES','V_REF','enterScene','animate','renderer','camera','sm',
    'get lat_(){ return lat; }', 'get els_(){ return els; }', 'get sim_(){ return sim; }',
    'get TK_(){ return TK; }',   'get field_(){ return field; }',
    'get ionMesh_(){ return ionMesh; }', 'get elMesh_(){ return elMesh; }',
    'get hazeMesh_(){ return hazeMesh; }',
    'get trail_(){ return trail; }', 'get latKind_(){ return latKind; }'
  ].join(',');

  let clock = 1000;
  const perf = { now(){ clock += 4; return clock; } };
  const win = {addEventListener(){}, innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  const src = pageScript() + '\nreturn {' + expose + '};';
  const fn = new Function(
    'THREE','document','window','performance','requestAnimationFrame',
    'navigator','module',
    src);
  return fn(THREE, dom, win, perf, () => 0, {userAgent:'node'}, undefined);
}

function allFinite(arr){
  for(let i=0;i<arr.length;i++) if(!isFinite(arr[i])) return false;
  return true;
}

function testRender(THREE){
  section('THE RENDER PATH  (the real three.js, every scene driven)');
  const dom = makeDom();
  stubRenderer(THREE, dom);

  let S = null;
  try {
    S = evaluateScene(THREE, dom);
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log('      ' + (e.stack||'').split('\n').slice(0,4).join('\n      '));
    return;
  }
  chk(true, 'the scene loads');

  /* ---------- the story table ---------- */
  section('    the story table');
  chk(S.SCENES.length >= 6, 'there are barely any scenes');
  S.SCENES.forEach((sc, i) => {
    const w = `scene ${i+1} (${sc.title || 'untitled'})`;
    chk(!!sc.part,  `${w} has no part`);
    chk(!!sc.title, `${w} has no title`);
    chk(!!sc.text && sc.text.length > 20, `${w} has no text`);
    chk(sc.world === 'macro' || sc.world === 'micro', `${w} has no world`);
    if(sc.world === 'micro'){
      chk(!!S.LATTICES[sc.lattice], `${w} asks for lattice "${sc.lattice}", which does not exist`);
      chk(S.V_REF[sc.lattice] > 0, `${w} uses a lattice with no V_REF`);
    }
    if(sc.ride){
      ['back','up','ahead'].forEach(k =>
        chk(isFinite(sc.cam[k]), `${w} rides an electron but has no cam.${k}`));
    } else {
      ['dist','az','el'].forEach(k =>
        chk(isFinite(sc.cam[k]), `${w} has no cam.${k}`));
      chk(Array.isArray(sc.cam.look) && sc.cam.look.length === 3,
          `${w} has a malformed cam.look`);
    }
    (sc.cards||[]).forEach(c => {
      chk(!!c.who, `${w} has a card with no name`);
      c.metrics.forEach(k => chk(!!S.M[k], `${w} asks for metric "${k}", which does not exist`));
    });
  });
  chk(S.SCENES.some(s => s.ride), 'nothing is shown from an electron');
  chk(S.SCENES.some(s => s.world === 'micro' && !s.field),
      'the battery is never off, so there is nothing to compare the drift with');

  /* ---------- every scene, frame by frame ---------- */
  section('    every scene, driven');
  const FR = 500, results = [];
  let now = 5000;              // monotonic across the whole story, as a browser's is
  for(let i=0;i<S.SCENES.length;i++){
    const sc = S.SCENES[i];
    let threw = null, threwAt = -1, badCam = -1, badInst = -1, missed = 0;
    try { S.enterScene(i); }
    catch(e){ chk(false, `scene ${i+1} threw on entry: ${e.message}`); continue; }

    const T0 = S.TK_;
    for(let f=0; f<FR; f++){
      const before = S.renderer.__renders;
      now += 16;
      try { S.animate(now); }
      catch(e){ threw = e; threwAt = f; break; }
      if(S.renderer.__renders === before) missed++;

      const c = S.camera.position;
      if(badCam < 0 && !(isFinite(c.x) && isFinite(c.y) && isFinite(c.z))) badCam = f;

      if(badInst < 0 && sc.world === 'micro'){
        for(const mesh of [S.ionMesh_, S.hazeMesh_, S.elMesh_]){
          if(mesh && !allFinite(mesh.instanceMatrix.array)){ badInst = f; break; }
        }
        if(badInst < 0 && S.trail_ &&
           !allFinite(S.trail_.geometry.attributes.position.array)) badInst = f;
      }
    }

    const nm = `scene ${i+1} "${sc.title}"`;
    if(threw){
      chk(false, `${nm}: frame ${threwAt} threw: ${threw.message}`);
      console.log('      ' + (threw.stack||'').split('\n').slice(1,3).join('\n      '));
    } else {
      chk(true, `${nm} runs`);
    }
    chk(badCam < 0,  `${nm}: the camera went non-finite at frame ${badCam}`);
    chk(badInst < 0, `${nm}: an instance matrix went non-finite at frame ${badInst}`);
    chk(missed === 0, `${nm}: ${missed} frames drew nothing`);

    const drift = S.sm.drift, TK = S.TK_;
    results.push({i, sc, T0, TK, drift, res: S.sim_.vref/Math.max(0.02, drift)});
    note(`${nm}: ${Math.round(TK-273)} °C, drift ${drift.toFixed(3)}, ` +
         `resistance ${(S.sim_.vref/Math.max(0.02,drift)).toFixed(2)}`);
  }

  /* ---------- and it has to behave, not just survive ---------- */
  section('    what the scenes actually did');
  const offScene = results.find(r => r.sc.world === 'micro' && !r.sc.field);
  if(offScene){
    chk(Math.abs(offScene.drift) < 0.25,
        `the battery is off but the electrons drift at ${offScene.drift.toFixed(3)}`);
    chk(Math.abs(offScene.TK - 293) < 2,
        `the battery is off but the lattice warmed to ${Math.round(offScene.TK-273)} °C`);
  }
  const onScene = results.find(r => r.sc.world === 'micro' && r.sc.field && !r.sc.heat);
  if(onScene) chk(onScene.drift > 0.5,
    `the battery is on but the drift is only ${onScene.drift.toFixed(3)}`);

  const hotScenes = results.filter(r => r.sc.heat && r.sc.world === 'micro');
  hotScenes.forEach(r => {
    chk(r.TK > 600, `scene ${r.i+1} is meant to heat up but only reached ${Math.round(r.TK-273)} °C`);
    chk(r.TK <= 1250 + 1e-6, `scene ${r.i+1} ran past the temperature cap`);
  });
  if(onScene && hotScenes.length){
    const hot = hotScenes[hotScenes.length-1];
    chk(hot.drift < onScene.drift,
        'heating the lattice did not slow the drift down');
    note(`cold drift ${onScene.drift.toFixed(3)} → hot drift ${hot.drift.toFixed(3)} ` +
         `(resistance ${(onScene.res).toFixed(2)} → ${hot.res.toFixed(2)})`);
  }
}

/* =========================================================================== */
(async function main(){
  console.log('wire-resistance.html');

  const P = loadPhysics();
  testModel(P);

  const url = threeUrlOf(HTML);
  const src = await ensureThree(url);
  if(!src){
    section('THE RENDER PATH');
    note('skipped: no cached three.js and no network.');
  } else {
    const THREE = loadThree(src);
    if(!THREE) chk(false, 'three.js did not load from ' + url);
    else testRender(THREE);
  }

  console.log(`\n${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
