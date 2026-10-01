/* ===========================================================================
   Render-path smoke test for the particle scenes.   Run with:

       node test-render.js

   WHY THIS EXISTS

   test-particles.js reads the scenes as text and runs the parts that have no
   three.js in them — the simulations, the energy balance, the timeline. That
   is most of what is worth checking, and none of it touches the code that
   actually draws a frame.

   Which means a whole class of mistake sails straight past it. The one that
   prompted this file: a squiggle added to the sun's motes read a loop variable
   that was declared inside an if/else branch, so it was out of scope by the
   time it was used. `node --check` sees nothing wrong — it is a runtime
   resolution error, not a syntax error — and the text-based suite never
   executes that function. What happened in the browser was that updateMotes()
   threw on the FIRST frame, before sampleCam() and renderer.render() could
   run, so the scene never drew anything at all. A blank page with the captions
   still sitting on top of it.

   So this runs the scene. Properly: the real three.js the page itself loads,
   the real module evaluation, and then every frame of the timeline driven
   through frame() with the clock scrubbed by hand.

   WHAT IT CHECKS

     - the scene evaluates at all, without throwing
     - every frame of the timeline runs without throwing
     - the camera never goes non-finite
     - the numbers handed to the 2D canvas — the whole heating curve — are
       finite, so the graph cannot quietly draw itself to NaN
     - mote positions and colours stay finite, and colours stay positive
     - the molecules' instance matrices stay finite
     - something is actually submitted for drawing on every frame

   WHAT IT CANNOT CHECK

   Whether any of it LOOKS right. There is no renderer here and no screenshot:
   WebGLRenderer and PMREMGenerator are stubbed out, so nothing is rasterised
   and nothing is compared against anything. A scene can pass every check in
   here and still be pointing the camera at the floor. The user checks that.

   It is also deliberately permissive about the DOM. The stubs below answer
   whatever the scene asks of them rather than modelling a browser, so this
   will not catch a mis-typed element id or a CSS class that does not exist.
   It is looking for thrown errors and bad arithmetic, and nothing else.

   THE THREE.JS IT USES

   The same build the page does. The URL is read out of the scene's own
   <script src>, so the two cannot drift apart, and the file is cached in
   .three-cache/ after the first run. With no network and no cache it says so
   and exits 0 rather than failing — a machine being offline is not a bug in
   the scene.
=========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CACHE_DIR = path.join(__dirname, '.three-cache');

let fails = 0, checks = 0;
function chk(ok, msg){
  checks++;
  if(!ok){ fails++; console.log('    FAIL  ' + msg); }
}
function section(s){ console.log('\n' + s); }

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---------------------------------------------------------------------------
   three.js, fetched once and kept
--------------------------------------------------------------------------- */
function threeUrlOf(html){
  const m = html.match(/<script src="([^"]*three[^"]*\.js)"><\/script>/);
  if(!m) throw new Error('no three.js <script src> found in the scene');
  return m[1];
}
async function ensureThree(url){
  const name = url.split('/').slice(-3).join('-').replace(/[^\w.-]/g, '_');
  const file = path.join(CACHE_DIR, name);
  if(fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if(typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url);
    if(!res.ok) return null;
    const src = await res.text();
    fs.mkdirSync(CACHE_DIR, {recursive:true});
    fs.writeFileSync(file, src);
    console.log('  fetched ' + url + '\n  cached  ' + path.relative(__dirname, file));
    return src;
  } catch(e){
    return null;
  }
}
function loadThree(src){
  /* The UMD wrapper picks a target by sniffing the environment. Given both
     `exports` and `module` it populates `exports`, which has to be the SAME
     object node would have given it, not a second one — otherwise the bundle
     fills in one and we read the other, and it looks as though three.js did
     not load at all. */
  const exports = {};
  const sandbox = {module:{exports}, exports, console};
  sandbox.self = sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, {filename:'three.js'});
  for(const cand of [sandbox.exports, sandbox.module.exports, sandbox.THREE])
    if(cand && cand.Vector3) return cand;
  return null;
}

/* ---------------------------------------------------------------------------
   just enough browser

   None of this models a browser. Each stub answers what the scene asks of it
   and records the numbers worth checking; anything it is not asked for is not
   here. See the note at the top about what that means for what this can catch.
--------------------------------------------------------------------------- */
function makeCtx2d(numbers){
  const grad = { addColorStop(){} };
  const ctx = {
    canvas:null,
    createLinearGradient(){ return grad; },
    createRadialGradient(){ return grad; },
    measureText(s){ return {width: (s ? String(s).length : 0) * 8}; },
    getImageData(){ return {data:new Uint8ClampedArray(4)}; },
    putImageData(){}, drawImage(){}, setTransform(){}, resetTransform(){},
    save(){}, restore(){}, clip(){}, setLineDash(){}, closePath(){}, beginPath(){}
  };
  /* every drawing call that takes coordinates gets its numbers recorded, so a
     NaN in the graph's arithmetic shows up here rather than silently painting
     nothing */
  for(const name of ['fillRect','clearRect','strokeRect','rect','moveTo','lineTo',
                     'arc','arcTo','quadraticCurveTo','bezierCurveTo','fillText',
                     'strokeText','translate','rotate','scale','ellipse']){
    ctx[name] = (...args) => {
      for(const a of args) if(typeof a === 'number') numbers.push([name, a]);
    };
  }
  for(const name of ['fill','stroke']) ctx[name] = () => {};
  return ctx;
}

function makeDom(graphW, graphH, numbers){
  const els = new Map();
  const mkStyle = () => ({ setProperty(){}, removeProperty(){} });
  function mkEl(id){
    const el = {
      id,
      width: id === 'graph' ? graphW : 300,
      height: id === 'graph' ? graphH : 150,
      innerHTML: '', textContent: '', value: 0,
      style: mkStyle(),
      classList: {
        _s: new Set(),
        add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); },
        toggle(c, on){ on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c))
                                        : (on ? this._s.add(c) : this._s.delete(c)); },
        contains(c){ return this._s.has(c); }
      },
      addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
      querySelectorAll(){ return []; }, querySelector(){ return null; },
      setAttribute(){}, getAttribute(){ return null; },
      getBoundingClientRect(){ return {left:0, top:0, width:1280, height:720}; },
      focus(){}, blur(){}
    };
    el.getContext = () => { const c = makeCtx2d(numbers); c.canvas = el; return c; };
    return el;
  }
  return {
    getElementById(id){
      if(!els.has(id)) els.set(id, mkEl(id));
      return els.get(id);
    },
    createElement(tag){ return mkEl(tag); },
    addEventListener(){}, removeEventListener(){},
    body: mkEl('body'),
    documentElement: mkEl('html')
  };
}

/* WebGLRenderer and PMREMGenerator are the only parts of three.js that need a
   real graphics context, so they are the only parts replaced. Everything else
   — the maths, the geometry, the scene graph — is the genuine article. */
function stubRenderer(THREE, dom, numbers){
  const Real = { PMREMGenerator: THREE.PMREMGenerator };
  THREE.WebGLRenderer = class {
    constructor(){
      this.domElement = dom.createElement('canvas');
      this.shadowMap = {enabled:false, type:0, autoUpdate:true};
      this.__renders = 0;
      this.outputEncoding = 0; this.toneMapping = 0; this.toneMappingExposure = 1;
    }
    setPixelRatio(){} setSize(){} setClearColor(){} setAnimationLoop(){}
    getContext(){ return {}; } dispose(){}
    render(){ this.__renders++; }
  };
  THREE.PMREMGenerator = class {
    constructor(){}
    compileEquirectangularShader(){}
    fromEquirectangular(){ return {texture: new THREE.Texture()}; }
    fromScene(){ return {texture: new THREE.Texture()}; }
    dispose(){}
  };
  return Real;
}

/* ---------------------------------------------------------------------------
   run a scene
--------------------------------------------------------------------------- */
function evaluateScene(THREE, html, dom, numbers, expose){
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let clock = 1000;
  const perf = { now(){ clock += 4; return clock; } };
  const src = js + '\nreturn {' + expose + '};';
  const fn = new Function(
    'THREE','document','window','location','history','performance',
    'requestAnimationFrame','addEventListener','innerWidth','innerHeight',
    'devicePixelRatio','navigator',
    src);
  return fn(
    THREE, dom, {}, {search:''}, {replaceState(){}}, perf,
    () => 0, () => {}, 1280, 720, 1, {userAgent:'node'});
}

/* ===========================================================================
   MELTING
=========================================================================== */
function melting(THREE){
  section('MELTING  melting-snowman.html  (render path)');
  const html = read('melting-snowman.html');
  const gm = html.match(/<canvas id="graph" width="(\d+)" height="(\d+)"/);
  const graphW = gm ? +gm[1] : 560, graphH = gm ? +gm[2] : 330;

  const numbers = [];
  const dom = makeDom(graphW, graphH, numbers);
  stubRenderer(THREE, dom, numbers);

  const expose = [
    'frame','build','ensureSim','worldAt','TOTAL','sampleCam','applyCamera',
    'camera','camPos','camTgt','renderer','mols','sunMotes','airMotes',
    'iceFrame','simFrac','stack',
    'get PHYS_(){ return PHYS; }',
    'get t_(){ return t; }',
    'set clock(v){ t = v; curSeg = -1; }',
    'set playing_(v){ playing = v; }'
  ].join(',');

  let S = null;
  try {
    S = evaluateScene(THREE, html, dom, numbers, expose);
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log(e.stack.split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');

  /* the molecular run is normally spread over the first act; finish it now so
     every frame below has it to hand */
  section('    the molecular run');
  const t0 = Date.now();
  S.ensureSim();
  chk(!!S.PHYS_, 'the molecular run completes');
  console.log(`      ${S.PHYS_.N} molecules, ${S.PHYS_.frames} frames, ${Date.now()-t0} ms`);

  /* ---------- every frame of the timeline ---------- */
  section('    every frame');
  S.playing_ = false;                 // so the clock only moves where we put it
  const STEP = 0.05;
  let ran = 0, threw = null, threwAt = -1;
  let badCam = -1, badMote = -1, badMol = -1, rendersMissed = 0;
  let now = 5000;

  for(let t = 0; t <= S.TOTAL + 1e-9; t += STEP){
    S.clock = t;
    const before = S.renderer.__renders;
    now += 16;
    try {
      S.frame(now);
    } catch(e){
      threw = e; threwAt = t; break;
    }
    ran++;
    if(S.renderer.__renders === before) rendersMissed++;

    const c = S.camera.position, l = S.camTgt;
    if(badCam < 0 && !(isFinite(c.x) && isFinite(c.y) && isFinite(c.z) &&
                       isFinite(l.x) && isFinite(l.y) && isFinite(l.z))) badCam = t;

    if(badMote < 0){
      for(const cloud of [S.sunMotes, S.airMotes]){
        const p = cloud.geometry.attributes.position.array;
        const col = cloud.geometry.attributes.color.array;
        for(let k=0;k<p.length;k++){
          if(!isFinite(p[k]) || !isFinite(col[k]) || col[k] < 0){ badMote = t; break; }
        }
        if(badMote >= 0) break;
      }
    }
    if(badMol < 0 && S.worldAt(t) === 'ice'){
      const m = S.mols.instanceMatrix.array;
      for(let k=0;k<m.length;k++) if(!isFinite(m[k])){ badMol = t; break; }
    }
  }

  if(threw){
    chk(false, `frame() threw at t=${threwAt.toFixed(2)}s: ${threw.message}`);
    console.log('      ' + (threw.stack || '').split('\n').slice(1, 3).join('\n      '));
  } else {
    chk(true, 'every frame of the timeline runs');
  }
  chk(badCam < 0, `the camera went non-finite at t=${badCam.toFixed(2)}s`);
  chk(badMote < 0, `a mote went non-finite or negative at t=${badMote.toFixed(2)}s`);
  chk(badMol < 0, `a molecule's matrix went non-finite at t=${badMol.toFixed(2)}s`);
  chk(rendersMissed === 0, `${rendersMissed} frames drew nothing at all`);
  console.log(`      ${ran} frames at ${STEP}s, ${S.renderer.__renders} draws`);

  /* ---------- the graph's arithmetic ---------- */
  section('    what reaches the 2D canvas');
  const bad = numbers.filter(([, v]) => !isFinite(v));
  chk(bad.length === 0,
      `${bad.length} non-finite numbers reached the canvas, first via ${bad.length?bad[0][0]:''}()`);
  chk(numbers.length > 1000, `the graph barely drew anything (${numbers.length} numbers)`);
  console.log(`      ${numbers.length} coordinates drawn, all finite`);

  /* ---------- and it has to survive the weather being changed ---------- */
  section('    rebuilding');
  let rebuilt = true;
  try {
    S.build();
    S.clock = 12; S.frame(now += 16);
    S.clock = 50; S.frame(now += 16);
    S.clock = 88; S.frame(now += 16);
  } catch(e){
    rebuilt = false;
    chk(false, 'rebuilding after a weather change threw: ' + e.message);
  }
  if(rebuilt) chk(true, 'the scene survives a rebuild');
}

/* ===========================================================================
   BROWNIAN MOTION
=========================================================================== */
function brownian(THREE){
  section('BROWNIAN MOTION  brownian-motion.html  (render path)');
  const html = read('brownian-motion.html');
  const numbers = [];
  const dom = makeDom(560, 330, numbers);
  stubRenderer(THREE, dom, numbers);

  const expose = [
    'frame','build','TOTAL','camera','camTgt','renderer','worldAt',
    'set clock(v){ t = v; curSeg = -1; }',
    'set playing_(v){ playing = v; }'
  ].join(',');

  let S = null;
  try {
    S = evaluateScene(THREE, html, dom, numbers, expose);
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log(e.stack.split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');

  S.playing_ = false;
  let ran = 0, threw = null, threwAt = -1, badCam = -1;
  let now = 5000;
  for(let t = 0; t <= S.TOTAL + 1e-9; t += 0.05){
    S.clock = t;
    now += 16;
    try { S.frame(now); } catch(e){ threw = e; threwAt = t; break; }
    ran++;
    const c = S.camera.position, l = S.camTgt;
    if(badCam < 0 && !(isFinite(c.x) && isFinite(c.y) && isFinite(c.z) &&
                       isFinite(l.x) && isFinite(l.y) && isFinite(l.z))) badCam = t;
  }
  if(threw){
    chk(false, `frame() threw at t=${threwAt.toFixed(2)}s: ${threw.message}`);
    console.log('      ' + (threw.stack || '').split('\n').slice(1, 3).join('\n      '));
  } else {
    chk(true, 'every frame of the timeline runs');
  }
  chk(badCam < 0, `the camera went non-finite at t=${badCam.toFixed(2)}s`);
  console.log(`      ${ran} frames, ${S.renderer.__renders} draws`);
}

/* ===========================================================================
   ACID STRENGTH — the 3D story

   This scene has no timeline to scrub. It has six scenes, each of which resets
   the particle states and then runs free, so what is worth checking is that
   every scene survives a long run and that the claims the narration makes are
   actually what the model produces:

     - the strong acid ends up with all 24 hydrogens free, the weak acid with
       a handful at most            (scene "Water gets to work")
     - the same molecules do not split every time — the weak acid's
       equilibrium has to be dynamic
     - the H+ head-count reads 24 against roughly 1
                                    (scene "Count the free H+")

   If any of those stop being true the narration is lying to the class, which
   is worse than a crash.

   It also checks the detachable hydrogen actually tracks its own molecule:
   the H sits at the end of an O–H bond on a core that tumbles, so if the
   attach-point maths ever stops following the core's rotation the hydrogens
   drift off their molecules and nobody would see it in a headless run except
   by measuring the distance.
=========================================================================== */
function acidStory(THREE){
  section('ACID  acid-strength-3d-story.html  (render path)');
  const html = read('acid-strength-3d-story.html');

  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  /* this scene reads the step dots back out of the document; the shared stub
     only carries querySelectorAll on elements, not on the document */
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['animate','enterScene','SCENES','camera','renderer',
                  'unitsA','unitsB','beakerA','beakerB','attachPoint',
                  'freeCount','N','pHStrong','pHWeak','ONE_IN','MOL_SCALE'].join(',');

  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let clock = 1000;
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ clock += 16; return clock; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');
  chk(S.SCENES.length === 6, `expected 6 scenes, found ${S.SCENES.length}`);

  function finite(){
    for(const u of S.unitsA.concat(S.unitsB)){
      for(const v of [u.pos, u.hPos, u.core.position, u.h.position])
        if(!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) return false;
      if(!isFinite(u.bond.scale.y)) return false;
    }
    const c = S.camera.position;
    return isFinite(c.x) && isFinite(c.y) && isFinite(c.z);
  }

  let now = 5000;
  function run(frames){                       // a steady 60 fps
    for(let i=0;i<frames;i++){ now += 16.7; S.animate(now); }
  }

  /* ---------- every scene survives a long run ---------- */
  section('    every scene');
  let threw = null, threwAt = -1, badMath = -1;
  for(let i=0;i<S.SCENES.length;i++){
    S.enterScene(i);
    const before = S.renderer.__renders;
    try { run(360); }                         // 6 seconds of frames
    catch(e){ threw = e; threwAt = i; break; }
    if(!finite() && badMath < 0) badMath = i;
    chk(S.renderer.__renders > before, `scene ${i} drew nothing`);
  }
  if(threw){
    chk(false, `scene ${threwAt} ("${S.SCENES[threwAt].title}") threw: ${threw.message}`);
    console.log('      ' + (threw.stack || '').split('\n').slice(1, 3).join('\n      '));
    return;
  }
  chk(true, 'every scene runs for 6 s without throwing');
  chk(badMath < 0, `scene ${badMath} went non-finite`);

  /* ---------- the molecules hold together ---------- */
  section('    the molecules');
  S.enterScene(1);                            // everything still intact
  run(300);
  let worst = 0;
  for(const u of S.unitsA.concat(S.unitsB)){
    worst = Math.max(worst, u.hPos.distanceTo(S.attachPoint(u)));
  }
  chk(worst < 1e-6,
      `an attached hydrogen drifted ${worst.toFixed(4)} off its molecule`);
  /* the whole molecule must stay inside the liquid, not just its centre */
  let outside = 0;
  for(const u of S.unitsA.concat(S.unitsB)){
    for(const p of [u.pos, u.hPos]){
      if(Math.hypot(p.x, p.z) > 2.5 || p.y < 0 || p.y > 4.0) outside++;
    }
  }
  chk(outside === 0, `${outside} particles left the beaker`);
  console.log(`      24 + 24 molecules intact, hydrogens within ${worst.toExponential(1)} of their bonds`);

  /* ---------- does the picture say what the narration says? ---------- */
  section('    the story the particles tell');

  S.enterScene(2);                            // "Water gets to work"
  run(300);                                   // 5 s — past the staggered split
  const strongFree = S.freeCount(S.unitsA), weakFree = S.freeCount(S.unitsB);
  chk(strongFree === S.N,
      `the strong acid should free all ${S.N} hydrogens, freed ${strongFree}`);
  chk(weakFree >= 1 && weakFree <= 3,
      `the weak acid should sit at roughly one free H+, found ${weakFree}`);
  console.log(`      strong ${strongFree}/${S.N} free, weak ${weakFree}/${S.N} free`);

  /* the weak acid's equilibrium has to be DYNAMIC — a different molecule
     taking its turn each time — not one molecule frozen apart */
  const seen = new Set();
  for(let i=0;i<30;i++){
    run(60);
    S.unitsB.forEach((u,k)=>{ if(u.state === 'free' || u.state === 'leaving') seen.add(k); });
  }
  chk(seen.size >= 3,
      `the weak acid's equilibrium looks frozen: only ${seen.size} molecule(s) ever split`);
  console.log(`      ${seen.size} different weak-acid molecules took a turn splitting`);

  S.enterScene(3);                            // "Count the free H+"
  run(240);
  chk(S.beakerA.tallyShown === S.N,
      `strong tally read ${S.beakerA.tallyShown}, expected ${S.N}`);
  chk(S.beakerB.tallyShown >= 1 && S.beakerB.tallyShown <= 3,
      `weak tally read ${S.beakerB.tallyShown}, expected about 1`);
  console.log(`      tally: ${S.beakerA.tallyShown} free H+ vs ${S.beakerB.tallyShown}`);

  /* ---------- the numbers on the cards are the real chemistry ---------- */
  section('    the chemistry behind the numbers');
  chk(Math.abs(S.pHStrong - 0.301) < 0.01, `strong-acid pH should be 0.30, got ${S.pHStrong.toFixed(3)}`);
  chk(Math.abs(S.pHWeak - 3.324) < 0.01, `weak-acid pH should be 3.32, got ${S.pHWeak.toFixed(3)}`);
  chk(S.pHWeak > S.pHStrong, 'the weak acid must come out less acidic at equal concentration');
  chk(S.ONE_IN > 900 && S.ONE_IN < 1200,
      `the stated real dissociation should be about 1 in 1050, got 1 in ${S.ONE_IN}`);
  console.log(`      pH ${S.pHStrong.toFixed(2)} vs ${S.pHWeak.toFixed(2)},`
            + ` truly 1 in ${S.ONE_IN} dissociated`);

  /* ---------- nothing left over from the magnesium version ---------- */
  section('    the magnesium is gone');
  chk(!/magnesium|ribbon|syringe/i.test(html),
      'the scene still mentions magnesium, a ribbon or a syringe');
}

/* ===========================================================================
   ALKALI STRENGTH — the 3D story

   Same shape as the acid story, with the same claims to hold it to. The weak
   side is different in kind: ammonia takes a hydrogen from a water molecule
   rather than falling apart, so it also checks that the hydroxide sits on its
   site while attached, and that every reacted ammonia really has the
   hydrogen on its nitrogen (it is NH4+, not NH3 with an OH- wandering off).
=========================================================================== */
function alkaliStory(THREE){
  section('ALKALI  alkali-strength-3d-story.html  (render path)');
  const html = read('alkali-strength-3d-story.html');

  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['animate','enterScene','SCENES','camera','renderer',
                  'unitsA','unitsB','beakerA','beakerB','attachPoint','coreToBeaker',
                  'freeCount','N','pHStrong','pHWeak','ONE_IN'].join(',');

  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let clock = 1000;
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ clock += 16; return clock; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');
  chk(S.SCENES.length === 6, `expected 6 scenes, found ${S.SCENES.length}`);

  const all = () => S.unitsA.concat(S.unitsB);
  function finite(){
    for(const u of all()){
      for(const v of [u.pos, u.mPos, u.core.position, u.mob.position])
        if(!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) return false;
      if(u.bondW && !isFinite(u.bondW.scale.y)) return false;
    }
    const c = S.camera.position;
    return isFinite(c.x) && isFinite(c.y) && isFinite(c.z);
  }

  let now = 5000;
  function run(frames){ for(let i=0;i<frames;i++){ now += 16.7; S.animate(now); } }

  section('    every scene');
  let threw = null, threwAt = -1, badMath = -1;
  for(let i=0;i<S.SCENES.length;i++){
    S.enterScene(i);
    const before = S.renderer.__renders;
    try { run(360); }
    catch(e){ threw = e; threwAt = i; break; }
    if(!finite() && badMath < 0) badMath = i;
    chk(S.renderer.__renders > before, `scene ${i} drew nothing`);
  }
  if(threw){
    chk(false, `scene ${threwAt} ("${S.SCENES[threwAt].title}") threw: ${threw.message}`);
    console.log('      ' + (threw.stack || '').split('\n').slice(1, 3).join('\n      '));
    return;
  }
  chk(true, 'every scene runs for 6 s without throwing');
  chk(badMath < 0, `scene ${badMath} went non-finite`);

  section('    the particles');
  S.enterScene(1);
  run(300);
  let worst = 0;
  for(const u of all()) worst = Math.max(worst, u.mPos.distanceTo(S.attachPoint(u)));
  chk(worst < 1e-6, `an attached hydroxide drifted ${worst.toFixed(4)} off its site`);
  let outside = 0;
  const THREEv = new THREE.Vector3();
  for(const u of all()){
    const pts = [u.pos, u.mPos];
    if(u.ht) pts.push(S.coreToBeaker(u, u.ht.position, THREEv.clone()));
    for(const p of pts){
      if(Math.hypot(p.x, p.z) > 2.5 || p.y < 0 || p.y > 4.0) outside++;
    }
  }
  chk(outside === 0, `${outside} atoms left the beaker`);
  console.log(`      24 + 24 intact, hydroxides within ${worst.toExponential(1)} of their sites`);

  section('    the story the particles tell');
  S.enterScene(2);
  run(300);
  const strongFree = S.freeCount(S.unitsA), weakFree = S.freeCount(S.unitsB);
  chk(strongFree === S.N, `the strong alkali should free all ${S.N} OH-, freed ${strongFree}`);
  chk(weakFree >= 1 && weakFree <= 3, `the weak alkali should sit at roughly one free OH-, found ${weakFree}`);
  console.log(`      strong ${strongFree}/${S.N} free, weak ${weakFree}/${S.N} free`);

  /* a free hydroxide on the weak side must have left its hydrogen on the N */
  run(120);
  const stranded = S.unitsB.filter(u => u.state === 'free' && u.tf < 0.9).length;
  chk(stranded === 0, `${stranded} reacted ammonia molecule(s) have not taken the hydrogen`);

  const seen = new Set();
  for(let i=0;i<30;i++){
    run(60);
    S.unitsB.forEach((u,k)=>{ if(u.state === 'free' || u.state === 'leaving') seen.add(k); });
  }
  chk(seen.size >= 3, `the weak alkali's equilibrium looks frozen: only ${seen.size} molecule(s) ever reacted`);
  console.log(`      ${seen.size} different ammonia molecules took a turn reacting`);

  S.enterScene(3);
  run(240);
  chk(S.beakerA.tallyShown === S.N, `strong tally read ${S.beakerA.tallyShown}, expected ${S.N}`);
  chk(S.beakerB.tallyShown >= 1 && S.beakerB.tallyShown <= 3,
      `weak tally read ${S.beakerB.tallyShown}, expected about 1`);
  console.log(`      tally: ${S.beakerA.tallyShown} free OH- vs ${S.beakerB.tallyShown}`);

  section('    the chemistry behind the numbers');
  chk(Math.abs(S.pHStrong - 13.699) < 0.01, `strong-alkali pH should be 13.70, got ${S.pHStrong.toFixed(3)}`);
  chk(Math.abs(S.pHWeak - 11.476) < 0.01, `weak-alkali pH should be 11.48, got ${S.pHWeak.toFixed(3)}`);
  chk(S.pHWeak < S.pHStrong, 'the weak alkali must come out less alkaline at equal concentration');
  chk(S.ONE_IN > 150 && S.ONE_IN < 185, `the stated real fraction should be about 1 in 167, got 1 in ${S.ONE_IN}`);
  console.log(`      pH ${S.pHStrong.toFixed(2)} vs ${S.pHWeak.toFixed(2)}, truly 1 in ${S.ONE_IN} reacted`);
}

/* ===========================================================================
   ATOM, MOLECULE, COMPOUND, MIXTURE — the 3D story

   The tags over the boxes and the readout card are worked out from the
   particles by classify(), not typed in. So the checks that matter are that
   classify() gives the answer the narration gives, box by box, and that the
   periodic table lights the squares the narration talks about.
=========================================================================== */
function particleTypesStory(THREE){
  section('PARTICLE TYPES  atoms-molecules-compounds-mixtures-3d-story.html  (render path)');
  const html = read('atoms-molecules-compounds-mixtures-3d-story.html');

  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['animate','enterScene','SCENES','camera','renderer','BOXES',
                  'classify','atomTarget','HS',
                  'TABLE','PT_SYMBOLS','TABLE_X','bondFx','BOND_T'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let clock = 1000;
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ clock += 16; return clock; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');

  let now = 5000;
  function run(frames){ for(let i=0;i<frames;i++){ now += 16.7; S.animate(now); } }

  function sane(){
    for(const bx of S.BOXES){
      for(const a of bx.atoms){
        const p = a.disp;
        if(!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return 'non-finite atom';
        if(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) > S.HS + 1e-6) return 'atom outside its box';
      }
    }
    const c = S.camera.position;
    return (isFinite(c.x) && isFinite(c.y) && isFinite(c.z)) ? null : 'camera non-finite';
  }

  /* ---------- every scene survives a long run ---------- */
  section('    every scene');
  for(let i=0;i<S.SCENES.length;i++){
    S.enterScene(i);
    const before = S.renderer.__renders;
    try { run(600); }
    catch(e){
      chk(false, `scene ${i} ("${S.SCENES[i].title}") threw: ${e.message}`);
      console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
      return;
    }
    const bad = sane();
    chk(!bad, `scene ${i}: ${bad}`);
    chk(S.renderer.__renders > before, `scene ${i} drew nothing`);
  }
  chk(true, `all ${S.SCENES.length} scenes run for 10 s without throwing`);

  /* ---------- the tags say what the narration says ---------- */
  section('    classification');
  S.enterScene(0); run(30);
  const expect = [
    [0, 'Element',  'single atoms'],
    [1, 'Element',  'molecules'],
    [2, 'Compound', 'molecules'],
    [3, 'Mixture',  'molecules'],
    [4, 'Mixture',  'atoms and molecules']
  ];
  for(const [b, verdict, particles] of expect){
    const c = S.classify(S.BOXES[b]);
    chk(c.verdict === verdict, `box ${b} classified ${c.verdict}, narration says ${verdict}`);
    chk(c.particles === particles, `box ${b} holds "${c.particles}", expected "${particles}"`);
  }
  chk(S.classify(S.BOXES[1]).kinds.join() === 'O', 'the oxygen box should hold only oxygen atoms');
  chk(S.classify(S.BOXES[2]).kinds.length === 2, 'water should be made of two elements');

  /* the mixture box holds the same two elements as water, unbonded */
  const mix = S.classify(S.BOXES[3]);
  chk(mix.kinds.join() === S.classify(S.BOXES[2]).kinds.join(),
      'the mixture box should hold the same elements as the water box');
  chk(!mix.subs.H2O, 'the mixture box should contain no water');

  /* every box keeps its molecules in one piece */
  section('    the molecules');
  let worst = 0, atomsInMols = 0;
  const tmp = new THREE.Vector3();
  for(const bx of S.BOXES){
    const inUse = new Set();
    bx.molecules.forEach(m=>m.atoms.forEach((a,k)=>{
      inUse.add(a); atomsInMols++;
      worst = Math.max(worst, a.disp.distanceTo(S.atomTarget(m, k, tmp)));
    }));
    chk(inUse.size === bx.atoms.length, `box ${bx.index}: an atom is in no molecule, or in two`);
  }
  chk(worst < 1e-6, `an atom sits ${worst.toFixed(4)} away from its place in its molecule`);
  console.log(`      ${atomsInMols} atoms, all held in their molecules`);

  /* ---------- the bond callout ---------- */
  section('    the bond callout');
  const FX = S.bondFx;
  const heroScenes = S.SCENES.map((s,i)=>[s,i]).filter(p=>p[0].hero);
  for(const [s, i] of heroScenes){
    S.enterScene(i);
    run(Math.round((S.BOND_T + 1.8) * 60));       // well into the close-up, past the fade-in
    const m = S.BOXES[s.box].hero;
    const nb = m ? m.bonds.length : 0;
    if(nb === 0){
      chk(FX.label.material.opacity < 0.01 && FX.glows.every(g=>!g.visible),
          `"${s.title}": a lone atom has no bond, but the callout showed`);
      continue;
    }
    chk(FX.label.material.opacity > 0.9, `"${s.title}": the bond label never appeared`);
    chk(FX.glows.filter(g=>g.visible).length === nb, `"${s.title}": ${nb} bonds but a different number glow`);
    chk(FX.lines.filter(l=>l.visible).length === nb, `"${s.title}": ${nb} bonds but a different number of dotted lines`);
    let off = 0;
    m.bonds.forEach((b,k)=>{
      const mid = m.atoms[b.i].disp.clone().add(m.atoms[b.j].disp).multiplyScalar(0.5);
      const p = FX.lines[k].geometry.attributes.position;
      off = Math.max(off, mid.distanceTo(new THREE.Vector3(p.getX(1), p.getY(1), p.getZ(1))));
      chk(FX.glows[k].position.distanceTo(mid) < 1e-6, `"${s.title}": glow ${k} is not on its bond`);
      chk(b.mesh.material.emissive.r > 0.05, `"${s.title}": bond ${k} is not tinted`);
    });
    chk(off < 1e-6, `"${s.title}": a dotted line misses its bond by ${off.toFixed(4)}`);
    chk(FX.label.parent === S.BOXES[s.box].group, `"${s.title}": the callout is not in the molecule's box`);
    const wantText = nb > 1 ? 'chemical bonds' : 'chemical bond';
    chk(/chemical bond/.test(s.text), `"${s.title}": the narration should name the chemical bond`);
    console.log(`      "${s.title}": ${nb} bond(s) glowing, "${wantText}" label, dotted lines on target`);

    /* and it goes away with the close-up, leaving no tint behind */
    run(Math.round(((s.heroT || 5) + 1.5) * 60));
    chk(FX.label.material.opacity < 0.05, `"${s.title}": the bond label outlived the close-up`);
    S.enterScene(0); run(5);
    chk(m.bonds.every(b=>b.mesh.material.emissive.r === 0), `"${s.title}": a bond stayed tinted afterwards`);
  }

  /* the reaction step was cut: nothing in the story should still mention it */
  section('    no reaction');
  chk(!S.SCENES.some(s=>s.react), 'a scene is still flagged as a reaction');
  chk(!/spark|left over|leftover|rearrange/i.test(S.SCENES.map(s=>s.text + s.caveat).join(' ')),
      'the narration still describes the hydrogen–oxygen reaction');

  /* ---------- the periodic table ---------- */
  section('    the periodic table');
  const T = S.TABLE;
  chk(S.PT_SYMBOLS.length === 118, `the table should have 118 elements, has ${S.PT_SYMBOLS.length}`);
  chk(new Set(S.PT_SYMBOLS).size === 118, 'a symbol appears twice in the table');
  const spots = new Set(T.tiles.map(t=>t.col + ',' + t.row));
  chk(spots.size === 118, `two elements share a square (${spots.size} distinct places)`);
  chk(T.tiles.every(t=>t.col >= 1 && t.col <= 18), 'a square is outside columns 1–18');
  /* spot checks on the layout pupils know */
  const at = sym => { const t = T.bySym[sym]; return t.col + ',' + t.row; };
  for(const [sym, place] of [['H','1,1'],['He','18,1'],['C','14,2'],['N','15,2'],['O','16,2'],
                             ['Na','1,3'],['Cl','17,3'],['Ar','18,3'],['Fe','8,4'],['Au','11,6'],['Og','18,7']])
    chk(at(sym) === place, `${sym} is at ${at(sym)}, should be at ${place}`);
  /* every element the boxes use must have a lit square to point at */
  for(const bx of S.BOXES) for(const a of bx.atoms)
    chk(!!T.bySym[a.el].texL, `${a.el} is used in a box but its square cannot light up`);
  /* the atom floated beside a lit square has to go into an empty space */
  for(const t of T.tiles.filter(t=>t.texL)){
    const c2 = t.col + t.atomDir[0], r2 = t.row - t.atomDir[1];
    chk(!T.tiles.some(u=>u.col === c2 && u.row === r2),
        `the atom for ${t.sym} would sit over the square at ${c2},${r2}`);
  }

  const tableScenes = S.SCENES.map((s,i)=>[s,i]).filter(p=>p[0].table);
  chk(tableScenes.length >= 2, 'the story should visit the periodic table at least twice');
  for(const [s, i] of tableScenes){
    S.enterScene(i); run(600);
    const lit = T.tiles.filter(t=>t.lit).map(t=>t.sym).sort().join();
    const want = s.table.lights.map(l=>l[0]).sort().join();
    chk(lit === want, `"${s.title}": lit ${lit}, narration expects ${want}`);
    chk(Math.abs(S.camera.position.x - S.TABLE_X) < 20,
        `"${s.title}": the camera ended up at x=${S.camera.position.x.toFixed(1)}, not at the table`);
    const text = (s.text + s.caveat).replace(/<[^>]+>/g,'');
    chk(/periodic table/i.test(text), `"${s.title}" never names the periodic table`);
    console.log(`      "${s.title}": ${lit} lit, camera at the table`);
  }
  const wScene = tableScenes.find(p=>p[0].table.water !== undefined);
  chk(!!wScene, 'no scene shows water missing from the table');
  if(wScene){
    S.enterScene(wScene[1]); run(600);
    chk(T.waterAmt > 0.95, 'the water molecule never appeared by the table');
    chk(!S.PT_SYMBOLS.some(x=>/H2O|H₂O|water/i.test(x)), 'water has a square');
  }
  S.enterScene(0); run(300);
  chk(T.tiles.every(t=>!t.lit) && T.waterAmt < 0.05, 'the table should go dark once the story leaves it');
  /* the Ar scene's number must match the table */
  const argonText = tableScenes[0][0].text;
  chk(argonText.includes('number ' + T.bySym.Ar.z), `the narration gives argon the wrong number (it is ${T.bySym.Ar.z})`);
}

/* ===========================================================================
   PURE SUBSTANCE or MIXTURE — the 3D story

   Like the atoms story, the tags come from classify() counting substances.
   So: each sample must come out as the narration says, the tap water must be
   electrically neutral, the solids must stay solid (every atom near its
   lattice site), and the carat arithmetic the caption quotes must be right.
=========================================================================== */
function pureStory(THREE){
  section('PURE vs MIXTURE  pure-substances-vs-mixtures-3d-story.html  (render path)');
  const html = read('pure-substances-vs-mixtures-3d-story.html');
  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['animate','enterScene','SCENES','camera','renderer','STATIONS','classify',
                  'ALLOY','CARAT','CHARGE','HS','LATTICE_U','MASS'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let clock = 1000;
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ clock += 16; return clock; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');

  let now = 5000;
  function run(frames){ for(let i=0;i<frames;i++){ now += 16.7; S.animate(now); } }

  /* ---------- every scene ---------- */
  section('    every scene');
  for(let i=0;i<S.SCENES.length;i++){
    S.enterScene(i);
    const before = S.renderer.__renders;
    try { run(480); }
    catch(e){
      chk(false, `scene ${i} ("${S.SCENES[i].title}") threw: ${e.message}`);
      console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
      return;
    }
    chk(S.renderer.__renders > before, `scene ${i} drew nothing`);
    const c = S.camera.position;
    chk(isFinite(c.x) && isFinite(c.y) && isFinite(c.z), `scene ${i}: camera non-finite`);
    let bad = 0;
    for(const st of S.STATIONS){
      for(const p of st.particles){
        if(!isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z) ||
           Math.max(Math.abs(p.pos.x), Math.abs(p.pos.y), Math.abs(p.pos.z)) > S.HS + 1e-6) bad++;
      }
      for(const im of Object.values(st.meshes).concat(st.bondMesh ? [st.bondMesh] : [])){
        if(im.instanceMatrix.array.some(v=>!isFinite(v))) bad++;
      }
    }
    chk(bad === 0, `scene ${i}: ${bad} particles or instances out of the box or non-finite`);
  }
  chk(true, `all ${S.SCENES.length} scenes run for 8 s without throwing`);

  /* ---------- classification ---------- */
  section('    classification');
  const expect = [
    ['Orange juice',    'Mixture'],
    ['Tap water',       'Mixture'],
    ['Distilled water', 'Pure substance', 'a compound'],
    ['24 carat gold',   'Pure substance', 'an element'],
    ['20 carat gold',   'Mixture', 'an alloy']
  ];
  const sorted = S.SCENES[S.SCENES.length-1].text.replace(/<[^>]+>/g,'');
  const [pureHalf, mixHalf] = sorted.split(/Mixtures/);
  for(const [name, verdict, detail] of expect){
    const st = S.STATIONS.find(s=>s.name === name);
    chk(!!st, `no station called ${name}`);
    if(!st) continue;
    const c = S.classify(st);
    chk(c.verdict === verdict, `${name} classified ${c.verdict}, narration says ${verdict}`);
    if(detail) chk(c.detail === detail, `${name} is "${c.detail}", expected "${detail}"`);
    const half = verdict === 'Mixture' ? mixHalf : pureHalf;
    chk(half.toLowerCase().includes(name.toLowerCase()),
        `the summary does not list ${name} under ${verdict === 'Mixture' ? 'mixtures' : 'pure substances'}`);
    console.log(`      ${name}: ${c.verdict} — ${c.detail} (${c.subs.join(', ')})`);
  }

  const tap = S.STATIONS.find(s=>s.name === 'Tap water');
  const charge = tap.molecules.reduce((q,m)=>q + (S.CHARGE[m.sp] || 0), 0);
  chk(charge === 0, `the tap water's ions do not balance: net charge ${charge}`);
  const dist = S.classify(S.STATIONS.find(s=>s.name === 'Distilled water'));
  chk(dist.subs.length === 1 && dist.subs[0] === 'water', 'distilled water should hold only water');

  /* ---------- the solids stay solid ---------- */
  section('    the solids');
  let drift = 0;
  for(const st of S.STATIONS.filter(s=>s.lattice)){
    for(const p of st.particles) drift = Math.max(drift, p.pos.distanceTo(p.home));
  }
  chk(drift < 0.1 * S.LATTICE_U, `a metal atom wandered ${drift.toFixed(3)} from its site — the solid is not solid`);
  const pure = S.STATIONS.find(s=>s.name === '24 carat gold');
  chk(pure.particles.every(p=>p.el === 'Au'), '24 carat gold contains an atom that is not gold');

  /* ---------- carat arithmetic ---------- */
  section('    carat');
  const A = S.ALLOY;
  const alloy = S.STATIONS.find(s=>s.name === '20 carat gold');
  const n = el => alloy.particles.filter(p=>p.el === el).length;
  chk(n('Au') === A.Au && n('Ag') === A.Ag && n('Cu') === A.Cu, 'the 20 carat box does not hold the atoms ALLOY says');
  const mass = el => n(el) * S.MASS[el];
  const massFrac = mass('Au') / (mass('Au') + mass('Ag') + mass('Cu'));
  chk(Math.abs(massFrac - S.CARAT/24) < 0.01,
      `20 carat should be ${(S.CARAT/24*100).toFixed(1)}% gold by mass, the atoms give ${(massFrac*100).toFixed(1)}%`);
  chk(Math.abs(mass('Ag') - mass('Cu')) / mass('Ag') < 0.1, 'silver and copper should be roughly equal by mass');
  chk(A.atomAu < massFrac, 'gold should be a smaller share of the atoms than of the mass');
  const cap = S.SCENES.find(s=>s.title === '20 carat gold');
  chk(cap.caveat.includes(A.Au + ' of these ' + A.N), 'the caption quotes a different atom count');
  chk(cap.text.includes(Math.round(massFrac*100) + '%'), 'the caption quotes a different gold percentage');
  console.log(`      ${A.Au} Au + ${A.Ag} Ag + ${A.Cu} Cu: ${(massFrac*100).toFixed(1)}% gold by mass, ${(A.atomAu*100).toFixed(0)}% of atoms`);
}

/* ===========================================================================
   CONVECTION — the 3D story

   Every chapter is a pure function of its own clock, so each is driven
   straight through frame(t). On top of the render-path checks, the things a
   pupil is told must be what the picture does:

     - the hot box really holds fewer particles, and the counts on screen are
       the counts in the boxes
     - the heated parcel spreads by the amount WATER and EXAG say, and its
       particles do not get any bigger
     - every figure a caption quotes comes out of WATER
     - the flow goes up the middle, out along the top, down the wall and back
       along the bottom — and so do the arrows drawn on it
     - the dye starts at the crystal, reaches the top, comes down the sides,
       and never leaves the water
=========================================================================== */
function convectionStory(THREE){
  section('CONVECTION  convection.html  (render path)');
  const html = read('convection.html');
  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['frame','enterChapter','CH','camera','renderer','worldAt',
    'WATER','EXAG','REAL_EXPANSION','VOL_RATIO','KH','NC','NH','PR','pct',
    'parcelMesh','coldMesh','hotMesh','coldGrp','hotGrp','BOX_L','thermoLbl','countC','countH',
    'flowVel','LOOPS','LOOP_N','FLOW','POT','CRYSTAL','puffAt','dyeState','dyePos','dyeAlpha',
    'ARCS','warmthAt','CUES'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ return 0; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');

  const finiteArr = a => { for(let i=0;i<a.length;i++) if(!isFinite(a[i])) return false; return true; };
  const matrixOf = (mesh, i) => mesh.instanceMatrix.array.slice(i*16, i*16+16);
  const positions = (mesh, n) => {
    const P = [];
    for(let i=0;i<n;i++){ const m = matrixOf(mesh, i); P.push([m[12], m[13], m[14]]); }
    return P;
  };
  const meanNN = P => {
    let s = 0;
    for(let i=0;i<P.length;i++){
      let b = Infinity;
      for(let j=0;j<P.length;j++) if(i !== j){
        const d = Math.hypot(P[i][0]-P[j][0], P[i][1]-P[j][1], P[i][2]-P[j][2]);
        if(d < b) b = d;
      }
      s += b;
    }
    return s/P.length;
  };

  /* ---------- every chapter, every frame ---------- */
  section('    every chapter');
  for(let c=0;c<S.CH.length;c++){
    S.enterChapter(c);
    const before = S.renderer.__renders;
    let bad = 0, outside = 0, t = 0;
    try {
      for(t=0; t<=S.CH[c].len + 4; t+=1/30){
        S.frame(t);
        const p = S.camera.position;
        if(!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) bad++;
        if(S.worldAt(c, t) === 'macro' && S.CH[c].dye){
          if(!finiteArr(S.dyePos) || !finiteArr(S.dyeAlpha)) bad++;
          for(let i=0;i<S.dyeAlpha.length;i++){
            if(S.dyeAlpha[i] <= 0) continue;
            const x = S.dyePos[i*3], y = S.dyePos[i*3+1] - S.POT.yb, z = S.dyePos[i*3+2];
            if(Math.hypot(x, z) > S.POT.R + 1e-6 || y < 0 || y > S.POT.H) outside++;
          }
        }
        for(const m of [S.parcelMesh, S.coldMesh, S.hotMesh])
          if(m.parent.visible && !finiteArr(m.instanceMatrix.array)) bad++;
      }
    } catch(e){
      chk(false, `chapter ${c} ("${S.CH[c].title}") threw at t=${t.toFixed(2)}: ${e.message}`);
      console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
      return;
    }
    chk(S.renderer.__renders > before, `chapter ${c} drew nothing`);
    chk(bad === 0, `chapter ${c}: ${bad} frames with a non-finite camera, dye puff or particle`);
    chk(outside === 0, `chapter ${c}: ${outside} dye puffs outside the water`);
  }
  chk(true, `all ${S.CH.length} chapters run to the end without throwing`);
  chk(numbers.every(n=>isFinite(n[1])), 'a non-finite number reached a 2D canvas');

  /* ---------- the worlds ---------- */
  section('    the camera goes where the story says');
  chk(S.worldAt(0, 5) === 'macro', 'chapter 0 should be at the pan');
  chk(S.worldAt(1, 0.5) === 'macro' && S.worldAt(1, 5) === 'micro', 'chapter 1 should zoom from the pan into the particles');
  chk(S.worldAt(2, 5) === 'micro', 'chapter 2 should be among the particles');
  chk(S.worldAt(3, 5) === 'macro' && S.worldAt(4, 5) === 'macro', 'chapters 3 and 4 should be back at the pan');

  /* ---------- the numbers ---------- */
  section('    the numbers come out of WATER');
  const W = S.WATER;
  chk(W.hot.rho < W.cold.rho, 'hot water should be less dense than cold');
  chk(Math.abs(S.VOL_RATIO - (1 + S.EXAG*(W.cold.rho/W.hot.rho - 1))) < 1e-12, 'VOL_RATIO is not derived from WATER and EXAG');
  chk(S.NH === Math.round(S.NC/S.VOL_RATIO), 'NH is not NC shrunk by the volume ratio');
  chk(S.NH < S.NC, 'the hot box should hold fewer particles than the cold box');
  chk(S.hotMesh.count === S.NH && S.coldMesh.count === S.NC, 'the boxes do not hold the particles NC and NH say');
  chk(S.countC.userData.text === S.NC + ' particles', `the cold count on screen reads "${S.countC.userData.text}"`);
  chk(S.countH.userData.text === S.NH + ' particles', `the hot count on screen reads "${S.countH.userData.text}"`);
  const zoom = S.CH[1], side = S.CH[2];
  const plain = s => (s || '').replace(/<[^>]+>/g, '');
  chk(zoom.scale.includes(S.pct(S.REAL_EXPANSION)), 'chapter 1 does not quote the real expansion from WATER');
  chk(zoom.scale.includes(W.cold.rho.toFixed(1)) && zoom.scale.includes(W.hot.rho.toFixed(1)), 'chapter 1 does not quote the densities in WATER');
  chk(zoom.scale.includes(String(S.EXAG)) && side.scale.includes(String(S.EXAG)), 'a caption does not say how far it is exaggerated');
  chk(plain(side.text).includes(String(S.NC)) && plain(side.text).includes(String(S.NH)), 'chapter 2 quotes different particle counts');
  /* every percentage or kg/m³ figure the captions quote is one of ours */
  const allowed = new Set([S.pct(S.REAL_EXPANSION), W.cold.rho.toFixed(1), W.hot.rho.toFixed(1)]);
  for(const C of S.CH){
    const txt = plain(C.text) + ' ' + (C.scale || '') + ' ' + (C.look || '');
    for(const m of txt.match(/\d+(\.\d+)?%|\d+\.\d+(?= )/g) || [])
      chk(allowed.has(m), `chapter "${C.title}" quotes ${m}, which does not come from WATER`);
  }
  console.log(`      ${W.cold.T} °C: ${W.cold.rho}  ${W.hot.T} °C: ${W.hot.rho} kg/m³ → real ${S.pct(S.REAL_EXPANSION)}, shown ×${S.EXAG} = ${S.VOL_RATIO.toFixed(3)} → ${S.NC} vs ${S.NH} particles`);

  /* ---------- chapter 1: heating spreads the particles, not their size ---------- */
  section('    heating the parcel');
  S.enterChapter(1);
  S.frame(2.5);
  const P0 = positions(S.parcelMesh, S.NC), s0 = matrixOf(S.parcelMesh, 0)[0];
  S.frame(S.CH[1].len);
  const P1 = positions(S.parcelMesh, S.NC), s1 = matrixOf(S.parcelMesh, 0)[0];
  chk(Math.abs(s0 - S.PR) < 1e-6 && Math.abs(s1 - S.PR) < 1e-6, 'the particles changed size on heating');
  /* how far the parcel spread: the rms distance from its centre (the nearest
     neighbour is no good here — the hotter jiggle pulls neighbours together
     as often as it pushes them apart) */
  const rms = P => Math.sqrt(P.reduce((a,p)=>a + p[0]*p[0] + p[1]*p[1] + p[2]*p[2], 0)/P.length);
  const nnRatio = rms(P1)/rms(P0);
  chk(Math.abs(nnRatio/S.KH - 1) < 0.03, `the parcel grew ×${nnRatio.toFixed(3)}, WATER and EXAG say ×${S.KH.toFixed(3)}`);
  chk(S.thermoLbl.userData.text === W.hot.T + ' °C', `the thermometer ends at "${S.thermoLbl.userData.text}", not ${W.hot.T} °C`);
  const densityCue = S.CUES.find(c=>c.ch === 1 && c.obj.userData.text === 'density decreases');
  chk(!!densityCue, 'chapter 1 has no "density decreases" label');
  if(densityCue) chk(densityCue.t0 > 3.2, '"density decreases" appears before the heating has started');
  console.log(`      parcel spread ×${nnRatio.toFixed(3)} (expected ×${S.KH.toFixed(3)}), radius ${S.PR} throughout`);

  /* ---------- chapter 2: same volume, fewer particles ---------- */
  section('    hot beside cold');
  S.enterChapter(2);
  S.frame(3);
  const PC = positions(S.coldMesh, S.NC), PH = positions(S.hotMesh, S.NH);
  const inBox = P => P.every(p=>p.every(v=>Math.abs(v) + S.PR <= S.BOX_L/2 + 0.06));
  chk(inBox(PC) && inBox(PH), 'a particle sits outside its box');
  const pairRatio = meanNN(PH)/meanNN(PC);
  chk(Math.abs(pairRatio/S.KH - 1) < 0.08, `hot spacing is ×${pairRatio.toFixed(3)} the cold, should be ×${S.KH.toFixed(3)}`);
  console.log(`      nearest neighbour, hot ÷ cold: ×${pairRatio.toFixed(3)} (expected ×${S.KH.toFixed(3)})`);
  S.frame(S.CH[2].len);
  chk(S.hotGrp.position.y > 0.5 && S.coldGrp.position.y < -0.5, 'the hot box should rise and the cold one sink');

  /* ---------- the flow ---------- */
  section('    the flow');
  const F = S.FLOW;
  chk(S.flowVel(0.02, F.H/2)[1] > 0, 'the water should rise up the middle');
  chk(S.flowVel(F.R - 0.02, F.H/2)[1] < 0, 'the water should sink down the wall');
  chk(S.flowVel(F.R/2, F.H - 0.02)[0] > 0, 'the water should flow out along the top');
  chk(S.flowVel(F.R/2, 0.02)[0] < 0, 'the water should flow in along the bottom');
  let gap = 0;
  for(const L of S.LOOPS) gap = Math.max(gap, Math.hypot(L.r[0]-L.r[S.LOOP_N-1], L.y[0]-L.y[S.LOOP_N-1]));
  chk(gap < 0.05, `a streamline does not close: the ends are ${gap.toFixed(3)} apart`);

  /* ---------- the arrows follow the flow ---------- */
  section('    the arrows');
  const wantDir = [[0,1],[1,0],[0,-1],[-1,0]];         // rise, out, sink, in — on the right-hand side
  for(const A of S.ARCS){
    const want = wantDir[A.k], d = A.dirMid;
    const along = want[0]*A.side*d.x + want[1]*d.y;
    chk(along > 0.5, `arrow ${A.k} on the ${A.side > 0 ? 'right' : 'left'} points the wrong way`);
  }
  const warm = k => { const A = S.ARCS.find(a=>a.k === k && a.side === 1); return S.warmthAt(A.mid.x, A.mid.y - S.POT.yb); };
  chk(warm(0) > 0.8 && warm(2) < 0.2, `the rising arrow should be red and the sinking one blue (warmth ${warm(0).toFixed(2)}, ${warm(2).toFixed(2)})`);

  /* ---------- the dye ---------- */
  section('    the dye');
  const out = [0,0,0,0];
  const cfg3 = S.CH[3].dye;
  chk(S.puffAt(cfg3, 0, cfg3.emit + 0.01, out) && Math.hypot(out[0]-S.CRYSTAL.r, out[1]-S.CRYSTAL.y) < 0.1,
      'a new puff of dye does not start at the crystal');
  S.enterChapter(0); S.frame(S.CH[0].len);
  chk(S.dyeState.live > 0 && S.dyeState.maxY < 0.35*F.H, `before the water moves the dye should stay by the crystal (reaches ${S.dyeState.maxY.toFixed(2)})`);
  S.enterChapter(3); S.frame(S.CH[3].len);
  chk(S.dyeState.maxY > 0.85*F.H, `by the end of chapter 3 the dye should have reached the top (reaches ${S.dyeState.maxY.toFixed(2)} of ${F.H.toFixed(2)})`);
  S.enterChapter(4); S.frame(S.CH[4].len);
  chk(S.dyeState.nearWall > 20, `in the full current the dye should come down the sides (${S.dyeState.nearWall} puffs there)`);
  console.log(`      ${S.dyeState.live} puffs live, ${S.dyeState.nearWall} low down by the wall`);
}

/* ===========================================================================
   CONDUCTION — the 3D story

   Render path for all six chapters, and then what the narration claims:

     - the pins drop exactly when the heat equation says the wax reaches its
       melting point, nearest first; every copper pin drops inside the
       chapter and no glass pin does
     - every figure a caption quotes comes out of MAT
     - in the glass the heat creeps up from the flame side: the bottom is
       always at least as hot as the top, and the top starts cold
     - a kick up the chain is causal: nothing swings before the one below
       has swung far enough to touch it
     - chapter 4's two fronts differ by the real ratio of diffusivities
     - free electrons never pass through an ion, and the followed ones hit
       the ion they were aimed at, and only then does it light up
     - copper and electrons are the colours they are everywhere else
=========================================================================== */
function conductionStory(THREE){
  section('CONDUCTION  conduction.html  (render path)');
  const html = read('conduction.html');
  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['frame','enterChapter','CH','camera','renderer','worldAt',
    'MAT','T_ROOM','T_HOT','T_WAX','UNIT_M','SPEEDUP','ROD','PINS','RODS','rodTemp','meltSeconds',
    'FIG','fmtTime','clockLbl','ROD_HEAT0','ROD_MAX','rodClock',
    'SLAB','SLAB_B','slabFrac','SLAB_HEAT0','CHAIN','chainSwing','pulseStart','PULSE_TAU','PULSE0','PULSE_P',
    'slabMesh','waterMesh','glassMesh','ionMesh','elMesh','trMesh','ionPos','elPos','slabPos',
    'CU','R_ION','R_EL','TR_R','TRACERS','trState','ionKick','TR_FLY','TR_P','CH5_T',
    'CU_D','GL_D','pieceFrac','PIECE','COL','EL','N_EL'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ return 0; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');

  const finiteArr = a => { for(let i=0;i<a.length;i++) if(!isFinite(a[i])) return false; return true; };
  const meshes = [S.slabMesh, S.waterMesh, S.glassMesh, S.ionMesh, S.elMesh, S.trMesh,
                  S.RODS.copper.sleeve, S.RODS.glass.sleeve];

  /* ---------- every chapter, every frame; electrons against ions as we go ---------- */
  section('    every chapter');
  const gap = S.R_ION + S.R_EL, gapTr = S.R_ION + S.TR_R;
  let closest = Infinity, closestTr = Infinity;
  for(let c=0;c<S.CH.length;c++){
    S.enterChapter(c);
    const before = S.renderer.__renders;
    let bad = 0, t = 0;
    try {
      for(t=0; t<=S.CH[c].len + 4; t+=1/30){
        S.frame(t);
        const p = S.camera.position;
        if(!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) bad++;
        for(const m of meshes){
          if(!finiteArr(m.instanceMatrix.array)) bad++;
          if(m.instanceColor && !finiteArr(m.instanceColor.array)) bad++;
        }
        if(S.worldAt(c, t) === 'micro' && (c === 4 || c === 5)){
          for(let e=0;e<S.N_EL;e++) for(let m=0;m<S.CU.n;m++){
            const d = Math.hypot(S.elPos[e*3]-S.ionPos[m*3], S.elPos[e*3+1]-S.ionPos[m*3+1], S.elPos[e*3+2]-S.ionPos[m*3+2]);
            if(d < closest) closest = d;
          }
          if(c === 5) S.TRACERS.forEach((tr, i)=>{
            const st = S.trState[i];
            if(!st.visible) return;
            for(let m=0;m<S.CU.n;m++){
              if(m === tr.ion) continue;            // that one it is meant to hit
              const d = Math.hypot(st.p[0]-S.ionPos[m*3], st.p[1]-S.ionPos[m*3+1], st.p[2]-S.ionPos[m*3+2]);
              if(d < closestTr) closestTr = d;
            }
          });
        }
      }
    } catch(e){
      chk(false, `chapter ${c} ("${S.CH[c].title}") threw at t=${t.toFixed(2)}: ${e.message}`);
      console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
      return;
    }
    chk(S.renderer.__renders > before, `chapter ${c} drew nothing`);
    chk(bad === 0, `chapter ${c}: ${bad} non-finite camera positions, instance matrices or colours`);
  }
  chk(true, `all ${S.CH.length} chapters run to the end without throwing`);
  chk(numbers.every(n=>isFinite(n[1])), 'a non-finite number reached a 2D canvas');
  chk(closest >= gap - 1e-6, `a free electron passed through an ion: centres ${closest.toFixed(3)} apart, need ${gap.toFixed(3)}`);
  chk(closestTr >= gapTr - 1e-6, `a followed electron passed through an ion on its way: ${closestTr.toFixed(3)} apart, need ${gapTr.toFixed(3)}`);
  console.log(`      closest electron–ion approach ${closest.toFixed(3)} (touching at ${gap.toFixed(3)})`);

  /* ---------- worlds ---------- */
  section('    the camera goes where the story says');
  chk(S.worldAt(0, 5) === 'macro', 'chapter 0 should be at the pan');
  chk(S.worldAt(1, 0.5) === 'macro' && S.worldAt(1, 5) === 'micro', 'chapter 1 should zoom from the pan into the glass');
  chk(S.worldAt(2, 5) === 'micro', 'chapter 2 should be in the glass');
  chk(S.worldAt(3, 5) === 'macro', 'chapter 3 should be at the rods');
  chk(S.worldAt(4, 0.5) === 'macro' && S.worldAt(4, 5) === 'micro', 'chapter 4 should zoom from the rods into them');
  chk(S.worldAt(5, 5) === 'micro', 'chapter 5 should be inside the copper');

  /* ---------- the numbers ---------- */
  section('    the numbers come out of MAT');
  for(const m of Object.values(S.MAT))
    chk(Math.abs(m.alpha - m.k/(m.rho*m.c)) < 1e-15, `${m.name}: alpha is not k/(rho c)`);
  chk(S.MAT.copper.alpha > 100*S.MAT.glass.alpha, 'copper should conduct far faster than glass');
  const lastS = (S.PINS[S.PINS.length-1] - S.ROD.hot)*S.UNIT_M, firstS = (S.PINS[0] - S.ROD.hot)*S.UNIT_M;
  chk(S.FIG.lastCopper === Math.round(S.meltSeconds(lastS, S.MAT.copper.alpha)), 'FIG.lastCopper is not the last pin\'s melt time');
  chk(S.FIG.firstGlassMin === Math.floor(S.meltSeconds(firstS, S.MAT.glass.alpha)/60), 'FIG.firstGlassMin is not the first glass pin\'s melt time');
  chk(S.FIG.kRatio === Math.round(S.MAT.copper.k/S.MAT.glass.k/100)*100, 'FIG.kRatio is not from MAT');
  const rodsCh = S.CH[3];
  const plain = s => (s || '').replace(/<[^>]+>/g, '');
  chk(plain(rodsCh.text).includes('about ' + S.FIG.lastCopper + ' seconds'), 'chapter 3 quotes a different copper time');
  chk(plain(rodsCh.text).includes('more than ' + S.FIG.firstGlassMin + ' minutes'), 'chapter 3 quotes a different glass time');
  chk(rodsCh.terms.some(x=>x[1].includes('about ' + S.FIG.kRatio + ' times')), 'chapter 3 quotes a different conductivity ratio');
  chk(rodsCh.scale.includes('×' + S.SPEEDUP), 'chapter 3 does not say how much time is sped up');
  chk(Math.abs(S.GL_D/S.CU_D - S.MAT.glass.alpha/S.MAT.copper.alpha) < 1e-12, 'chapter 4 does not use the real ratio of diffusivities');
  console.log(`      copper α ${S.MAT.copper.alpha.toExponential(3)}, glass α ${S.MAT.glass.alpha.toExponential(3)} m²/s (×${(S.MAT.copper.alpha/S.MAT.glass.alpha).toFixed(0)})`);
  console.log(`      last copper pin ${S.FIG.lastCopper} s; nearest glass pin ${S.FIG.firstGlassMin}+ min; k ratio ${S.FIG.kRatio}`);

  /* ---------- the pins ---------- */
  section('    the pins');
  const len3 = S.CH[3].len;
  for(const mat of ['copper','glass']){
    const pins = S.RODS[mat].pins;
    for(let i=0;i<pins.length;i++){
      const p = pins[i];
      if(i) chk(p.drop > pins[i-1].drop, `${mat}: pin ${i} drops before the one nearer the flame`);
      if(isFinite(p.drop) && p.drop < 1e6){
        const T = S.rodTemp(p.r, p.drop, mat);
        chk(Math.abs(T - S.T_WAX) < 0.2, `${mat}: pin ${i} drops when the rod there is ${T.toFixed(2)} °C, not ${S.T_WAX}`);
        chk(S.rodTemp(p.r, p.drop - 0.05, mat) < S.T_WAX, `${mat}: pin ${i} is already past melting before it drops`);
      }
    }
  }
  chk(S.RODS.copper.pins.every(p=>p.drop < len3 - 1), 'a copper pin has not dropped by the end of chapter 3');
  chk(S.RODS.copper.pins.every(p=>p.drop < S.rodClock(1e9)), 'a copper pin drops after the clock has stopped');
  chk(S.RODS.glass.pins.every(p=>p.drop > S.rodClock(1e9) + 1), 'a glass pin drops before the clock stops — however long the chapter is left up');
  S.enterChapter(3); S.frame(len3);
  const rest = -S.ROD.y + 0.012;
  chk(S.RODS.copper.pins.every(p=>Math.abs(p.pin.position.y - rest) < 1e-9), 'a dropped copper pin is not lying on the hob');
  chk(S.RODS.glass.pins.every(p=>p.pin.position.y === p.hang), 'a glass pin has moved');
  chk(S.clockLbl.userData.text === S.fmtTime((len3 - S.ROD_HEAT0)*S.SPEEDUP), `the clock reads "${S.clockLbl.userData.text}"`);
  S.frame(600);
  chk(S.clockLbl.userData.text === S.fmtTime(S.ROD_MAX), `left up for ten minutes the clock reads "${S.clockLbl.userData.text}"`);
  chk(S.RODS.glass.pins.every(p=>p.pin.position.y === p.hang), 'left up for ten minutes, a glass pin drops');
  console.log(`      copper pins drop at ${S.RODS.copper.pins.map(p=>p.drop.toFixed(1)).join(', ')} s of chapter time`);

  /* ---------- the glass bottom ---------- */
  section('    heat creeps up through the glass');
  const ys = [-S.SLAB.Ly/2, -S.SLAB.Ly/4, 0, S.SLAB.Ly/4, S.SLAB.Ly/2];
  let order = true;
  for(let t=S.SLAB_HEAT0; t<S.SLAB_HEAT0 + 20; t+=0.25)
    for(let i=1;i<ys.length;i++) if(S.slabFrac(ys[i], t) > S.slabFrac(ys[i-1], t) + 1e-12) order = false;
  chk(order, 'somewhere higher up the glass is hotter than lower down');
  chk(S.slabFrac(S.SLAB.Ly/2, S.SLAB_HEAT0 + 0.5) < 0.01, 'the top of the glass is hot almost as soon as the flame starts');
  chk(S.slabFrac(S.SLAB.Ly/2, S.SLAB_HEAT0 + 8) > 0.3, 'the heat has not reached the top of the glass by the end of chapter 1');
  chk(S.slabFrac(0, S.SLAB_HEAT0 - 0.1) === 0, 'the glass warms before the flame starts');

  /* ---------- the chain ---------- */
  section('    passing it on');
  const P = S.SLAB_B.P;
  chk(S.CHAIN.length >= 4, `the chain is only ${S.CHAIN.length} particles long`);
  for(let j=1;j<S.CHAIN.length;j++)
    chk(P[S.CHAIN[j]*3+1] > P[S.CHAIN[j-1]*3+1], `chain link ${j} is not above link ${j-1}`);
  /* no link moves before the one below it has reached it */
  let causal = true;
  for(let t=0; t<S.PULSE0 + 3*S.PULSE_P; t+=0.005){
    for(let j=1;j<S.CHAIN.length;j++){
      if(S.chainSwing(j, t) <= 0) continue;
      const k = Math.floor((t - S.PULSE0 - j*S.PULSE_TAU/2)/S.PULSE_P);
      const touch = S.pulseStart(k, j-1) + S.PULSE_TAU/2;
      if(t < touch - 1e-9) causal = false;
    }
  }
  chk(causal, 'a link in the chain swings before the one below it has touched it');
  const peak = j => { let best = 0, at = 0;
    for(let t=S.PULSE0; t<S.PULSE0 + S.PULSE_P; t+=0.002){ const s = S.chainSwing(j, t); if(s > best){ best = s; at = t; } }
    return {best, at}; };
  for(let j=1;j<S.CHAIN.length;j++){
    const a = peak(j-1), b = peak(j);
    chk(b.best < a.best, `the kick grows going up the chain at link ${j}`);
    chk(b.at > a.at, `link ${j} peaks before link ${j-1}`);
  }

  /* ---------- the two rods, inside ---------- */
  section('    inside the rods');
  S.enterChapter(4); S.frame(S.CH[4].len);
  const tEnd = S.CH[4].len;
  const cuMid = S.pieceFrac(0, tEnd, S.CU_D), glNear = S.pieceFrac(-S.PIECE.Lx/2 + 2, tEnd, S.GL_D);
  chk(cuMid > 0.3, `the copper's front has not reached the middle (${cuMid.toFixed(2)})`);
  chk(glNear < 0.05, `the glass has warmed 2 units in already (${glNear.toFixed(3)}) — faster than it should`);

  /* ---------- the followed electrons ---------- */
  section('    free electrons');
  for(const tr of S.TRACERS){
    const m = tr.ion;
    const d = Math.hypot(tr.hit[0]-S.CU.P[m*3], tr.hit[1]-S.CU.P[m*3+1], tr.hit[2]-S.CU.P[m*3+2]);
    chk(Math.abs(d - 0.3) < 1e-6, `a followed electron stops ${d.toFixed(3)} from its ion, not beside it`);
    chk(tr.hit[0] > 1.5, 'a followed electron hits an ion near the hot end, not far down the rod');
    chk(S.pieceFrac(S.CU.P[m*3], S.CH5_T, S.CU_D) < S.pieceFrac(tr.start[0], S.CH5_T, S.CU_D) - 0.3,
        'a followed electron carries energy to somewhere no colder than where it started');
    chk(S.ionKick(m, tr.off + S.TR_FLY - 0.01) === 0, 'an ion lights up before its electron arrives');
    chk(S.ionKick(m, tr.off + S.TR_FLY + 0.01) > 0.9, 'an ion does not light up when its electron arrives');
  }

  /* ---------- palette ---------- */
  section('    palette');
  chk(S.COL.electron === 0xffe070, 'electrons are not 0xffe070');
  const wire = fs.readFileSync(path.join(__dirname, '..', 'electricity', 'wire-resistance.html'), 'utf8');
  const wm = wire.match(/ion\s*:\s*(0x[0-9a-f]{6})/i);
  chk(!!wm && parseInt(wm[1], 16) === S.COL.ion, `copper ions are ${S.COL.ion.toString(16)}, the wire scene has ${wm && wm[1]}`);
}

/* ===========================================================================
   DENSITY — the 3D story

   Render path for every chapter, and then that the story's arithmetic holds:

     - every volume, mass and cube side comes out of the density tables, and
       the things on screen are drawn at the size those numbers say
     - spinning the sugar never changes its mass: the scale reads the same
       from the moment the sugar is in to the end
     - every card's density is its mass ÷ its volume, the same-volume and
       same-mass chapters agree on each material's density, and each scale
       settles on the mass the table gives
     - every figure a caption quotes is one of those numbers
     - the molecules end up spread through a much bigger volume, without
       overlapping
=========================================================================== */
function densityStory(THREE){
  section('DENSITY  density.html  (render path)');
  const html = read('density.html');
  const numbers = [];
  const dom = makeDom(600, 400, numbers);
  dom.querySelectorAll = () => [];
  stubRenderer(THREE, dom, numbers);

  const expose = ['frame','enterChapter','CH','camera','renderer','worldAt','cardsAt',
    'SUGAR','SUGAR_V','FLOSS_V','FLOSS_RHO','FLOSS_R','UNIT_CM','CAKE_M','BROWNIE_M','CAKE_RHO','BROWNIE_RHO',
    'SLICE','SLICE_V','SOLIDS','SOLID_KEYS','massOfCube','volOfKilo','sideOfKilo','SAME_V','SAME_MASS','SAME_M',
    'CUBE_CM','CUBE_V_M3','PLAT_TOP','sugarState','sugarScale','POUR1','FALL','SPIN0','SPIN1','readingAt',
    'FIG','LADDER','ladX','MOL','MOL_R','molPos','molMesh','cryMesh','cake','brownie','cakeScale','brownieScale',
    'fmtG','fmtKg','grp','sig','AIR_RHO','WATER_RHO','CH_LADDER',
    'ATOM','PACK','CELLS','BOX_A','BOX_MISMATCH','FILL1','BAR1','GOLD_RHO','STATE_N','STATE_P','STATE_L','STATE_MESH','GAS_EXPECT',
    'WAX','ICE','WATER0','FLOAT_F','FCUBE','SURF','BEAK','iceCube','waxCube','updateFloat'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {addEventListener(){}, removeEventListener(){},
               innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S = null;
  try {
    S = new Function(
      'THREE','document','window','performance','requestAnimationFrame','navigator',
      js + '\nreturn {' + expose + '};'
    )(THREE, dom, win, {now(){ return 0; }}, () => 0, {userAgent:'node'});
  } catch(e){
    chk(false, 'the scene threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    return;
  }
  chk(true, 'the scene loads');
  const finiteArr = a => { for(let i=0;i<a.length;i++) if(!isFinite(a[i])) return false; return true; };
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9)*Math.max(1, Math.abs(b));
  const plain = s => (s || '').replace(/<[^>]+>/g, '');

  /* ---------- every chapter ---------- */
  section('    every chapter');
  for(let c=0;c<S.CH.length;c++){
    S.enterChapter(c);
    const before = S.renderer.__renders;
    let bad = 0, t = 0;
    try {
      for(t=0; t<=S.CH[c].len + 4; t+=1/30){
        S.frame(t);
        const p = S.camera.position;
        if(!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) bad++;
        for(const m of [S.molMesh, S.cryMesh]) if(!finiteArr(m.instanceMatrix.array)) bad++;
        for(const card of S.cardsAt(c, t))
          for(const f of card.fields) if(/NaN|Infinity|undefined/.test(f[1])) bad++;
      }
    } catch(e){
      chk(false, `chapter ${c} ("${S.CH[c].title}") threw at t=${t.toFixed(2)}: ${e.message}`);
      console.log('      ' + (e.stack || '').split('\n').slice(1, 3).join('\n      '));
      return;
    }
    chk(S.renderer.__renders > before, `chapter ${c} drew nothing`);
    chk(bad === 0, `chapter ${c}: ${bad} non-finite camera positions, instances or card values`);
  }
  chk(true, `all ${S.CH.length} chapters run to the end without throwing`);
  chk(S.worldAt(1, 0.5) === 'macro' && S.worldAt(1, 5) === 'micro', 'chapter 1 should zoom from the sugar into its molecules');
  [0,2,3,4,7,S.CH_LADDER].forEach(c=>chk(S.worldAt(c, 5) === 'macro', `chapter ${c} should be on the bench`));
  [5,6].forEach(c=>chk(S.worldAt(c, 5) === 'micro', `chapter ${c} should be among the atoms`));
  chk(S.CH[S.CH_LADDER].part === 'Everything together' && S.CH_LADDER === S.CH.length - 1, 'CH_LADDER does not point at the last chapter, the ladder');

  /* ---------- the numbers ---------- */
  section('    the numbers come out of the tables');
  chk(near(S.SUGAR_V, S.SUGAR.mass/S.SUGAR.rho), 'the sugar volume is not mass ÷ density');
  chk(near(S.FLOSS_RHO, S.SUGAR.mass/S.FLOSS_V), 'the floss density is not mass ÷ volume');
  chk(S.SLICE_V === S.SLICE.w*S.SLICE.d*S.SLICE.h, 'the slice volume is not w × d × h');
  chk(S.CAKE_M === Math.round(S.CAKE_RHO*S.SLICE_V) && S.BROWNIE_M === Math.round(S.BROWNIE_RHO*S.SLICE_V), 'a slice mass is not density × volume');
  for(const k of S.SOLID_KEYS){
    chk(near(S.massOfCube(k), S.SOLIDS[k].rho*S.CUBE_V_M3), `${k}: cube mass is not ρ × V`);
    chk(near(S.volOfKilo(k)*1e-6*S.SOLIDS[k].rho, S.SAME_M), `${k}: a kilogram's volume is not m ÷ ρ`);
    chk(near(Math.pow(S.sideOfKilo(k), 3), S.volOfKilo(k), 1e-9), `${k}: the side does not cube to the volume`);
  }
  chk(S.CUBE_V_M3 === 0.001, `the cube volume is ${S.CUBE_V_M3} m³, which will print badly`);

  /* drawn at real size: one unit is UNIT_CM centimetres */
  const cubeErr = [];
  S.SAME_V.forEach(c=>{ if(!near(c.mesh.scale.x*S.UNIT_CM, S.CUBE_CM, 1e-9)) cubeErr.push(c.k); });
  S.SAME_MASS.forEach(c=>{ if(!near(c.mesh.scale.x*S.UNIT_CM, S.sideOfKilo(c.k), 1e-9)) cubeErr.push(c.k); });
  chk(cubeErr.length === 0, `cubes drawn at the wrong size: ${cubeErr.join(', ')}`);
  const g = S.cake.geometry.parameters;
  chk(near(g.width*g.height*g.depth*Math.pow(S.UNIT_CM,3), S.SLICE_V, 1e-9), 'the slices are not drawn at their volume');
  chk(near(4/3*Math.PI*Math.pow(S.FLOSS_R*S.UNIT_CM, 3), S.FLOSS_V, 1e-9), 'the floss cloud is not drawn at its volume');

  /* ---------- the sugar ---------- */
  section('    spinning does not change the mass');
  let constant = true, rising = true, lastV = 0;
  S.enterChapter(0);
  for(let t=S.POUR1 + S.FALL + 0.01; t<S.CH[0].len + 4; t+=0.05){
    const st = S.sugarState(t);
    if(st.mass !== S.SUGAR.mass) constant = false;
    if(st.vol < lastV - 1e-9) rising = false;
    lastV = st.vol;
    S.frame(t);
    if(S.sugarScale.shown !== S.fmtG(S.SUGAR.mass)) constant = false;
  }
  chk(constant, 'the scale reading changes while the sugar is spun');
  chk(rising, 'the volume shrinks somewhere while the sugar is spun');
  const end = S.sugarState(S.CH[0].len);
  chk(end.spun === 1 && near(end.vol, S.FLOSS_V) && near(end.rho, S.FLOSS_RHO), 'by the end the sugar is not all floss');
  chk(S.sugarState(0).mass === 0, 'there is sugar on the scale before it is poured');

  /* ---------- the cards and scales ---------- */
  section('    the cards and the scales');
  const parse = s => parseFloat(String(s).replace(/,/g, ''));
  const F = (card, label) => { const f = card.fields.find(x=>x[0] === label); return f ? f[1] : undefined; };
  S.enterChapter(3); S.frame(S.CH[3].len);
  const std = cs => cs.map(c=>({name:c.name, mass:F(c,'Mass'), vol:F(c,'Volume'), rho:F(c,'Density')}));
  const c3 = std(S.cardsAt(3, S.CH[3].len)), c4 = std(S.cardsAt(4, S.CH[4].len));
  S.SOLID_KEYS.forEach((k, i)=>{
    chk(parse(c3[i].rho) === S.SOLIDS[k].rho, `${k}: same-volume card says ${c3[i].rho}`);
    chk(c3[i].rho === c4[i].rho, `${k}: the density changed between the same-volume and same-mass chapters (${c3[i].rho} vs ${c4[i].rho})`);
    chk(near(parse(c3[i].mass), S.massOfCube(k), 0.01), `${k}: the scale settles on ${c3[i].mass}`);
    chk(c4[i].mass === S.fmtKg(S.SAME_M), `${k}: a kilogram reads ${c4[i].mass}`);
    chk(S.SAME_V[i].sc.shown === S.fmtKg(S.massOfCube(k)), `${k}: the scale display reads ${S.SAME_V[i].sc.shown}`);
    chk(near(S.SAME_V[i].mesh.position.y - S.SAME_V[i].side/2, S.PLAT_TOP), `${k}: the cube is not sitting on the scale`);
  });
  for(let i=1;i<3;i++) chk(S.volOfKilo(S.SOLID_KEYS[i]) < S.volOfKilo(S.SOLID_KEYS[i-1]), 'a denser kilogram is not smaller');
  const c2 = std(S.cardsAt(2, S.CH[2].len));
  chk(parse(c2[0].rho) === S.CAKE_RHO && parse(c2[1].rho) === S.BROWNIE_RHO, `the cake cards say ${c2[0].rho} and ${c2[1].rho}`);
  chk(c2[0].mass === S.fmtG(S.CAKE_M) && c2[1].mass === S.fmtG(S.BROWNIE_M), 'a slice scale settles on the wrong mass');
  const c1 = std(S.cardsAt(1, 0));
  chk(c1[0].mass === c1[1].mass, 'the crystal and the floss should have the same mass');
  for(const card of c1.concat(c2)){
    const m = parse(card.mass), v = parse(card.vol), r = parse(card.rho);
    chk(Math.abs(m/v - r)/r < 0.02, `${card.name}: ${card.mass} ÷ ${card.vol} is not ${card.rho}`);
  }

  /* ---------- captions ---------- */
  section('    the captions quote the numbers');
  const txt = i => plain(S.CH[i].text);
  chk(txt(0).includes('about ' + S.grp(S.FIG.flossVolTimes) + ' times the volume'), 'chapter 0 quotes a different volume ratio');
  chk(near(S.FIG.flossVolTimes, Number((S.FLOSS_V/S.SUGAR_V).toPrecision(1))), 'FIG.flossVolTimes is not from the tables');
  chk(txt(1).includes(S.FIG.flossAir + '% air') && S.FIG.flossAir === ((1 - S.FLOSS_RHO/S.SUGAR.rho)*100).toFixed(1), 'chapter 1 quotes a different air fraction');
  chk(txt(2).includes(S.CAKE_M + ' g') && txt(2).includes(S.BROWNIE_M + ' g'), 'chapter 2 quotes different slice masses');
  const ratio = S.SOLIDS.iron.rho/S.SOLIDS.wood.rho, fl = Math.floor(ratio);
  chk(txt(3).includes('more than ' + fl + ' times') && ratio > fl, 'chapter 3\'s "more than N times" is not true');
  chk(txt(4).includes(S.grp(S.volOfKilo('wood')) + ' cm³') && txt(4).includes(S.grp(S.volOfKilo('iron')) + ' cm³'), 'chapter 4 quotes different volumes');

  /* ---------- the ladder ---------- */
  section('    the ladder');
  const sorted = S.LADDER.slice().sort((a,b)=>a.rho - b.rho);
  for(let i=1;i<sorted.length;i++) chk(S.ladX(sorted[i].rho) > S.ladX(sorted[i-1].rho), `${sorted[i].name} is not to the right of ${sorted[i-1].name}`);
  const rows = (S.CH[S.CH_LADDER].text.match(/<tr><td>([^<]+)<\/td>/g) || []).map(r=>r.replace(/<[^>]+>/g, ''));
  chk(rows.join('|') === sorted.map(it=>it.name).join('|'), 'the summary table is not in order of density');
  const fl2 = S.LADDER.find(x=>x.name === 'candy floss');
  chk(Math.abs(Math.log10(fl2.rho) - Math.log10(S.AIR_RHO)) < Math.abs(Math.log10(fl2.rho) - Math.log10(S.SUGAR.rho*1000)),
      'the caption says floss is closer to air than to sugar — on the ladder it is not');

  /* ---------- the molecules ---------- */
  section('    the molecules');
  S.enterChapter(1);
  const box = P => { const lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
    for(let i=0;i<S.MOL.n;i++) for(let a=0;a<3;a++){ lo[a] = Math.min(lo[a], P[i*3+a]); hi[a] = Math.max(hi[a], P[i*3+a]); }
    return (hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2]); };
  S.frame(1.6); const v0 = box(S.molPos);            // in the micro world, as the first molecule leaves
  S.frame(S.CH[1].len); const v1 = box(S.molPos);
  chk(v1 > 5*v0, `the molecules only spread to ${(v1/v0).toFixed(1)}× the volume`);
  let minD = Infinity;
  for(let i=0;i<S.MOL.n;i++) for(let j=i+1;j<S.MOL.n;j++)
    minD = Math.min(minD, Math.hypot(S.molPos[i*3]-S.molPos[j*3], S.molPos[i*3+1]-S.molPos[j*3+1], S.molPos[i*3+2]-S.molPos[j*3+2]));
  chk(minD > 1.8*S.MOL_R, `two molecules in the threads overlap (${minD.toFixed(3)} apart)`);
  console.log(`      the molecules spread through ${(v1/v0).toFixed(1)}× the volume; closest pair ${minD.toFixed(2)}`);
  console.log(`      floss ${S.sig(S.FLOSS_RHO,2)} g/cm³ (${S.FIG.flossAir}% air); cake ${S.CAKE_M} g, brownie ${S.BROWNIE_M} g; kilo cubes ${S.SOLID_KEYS.map(k=>S.sideOfKilo(k).toFixed(1)+' cm').join(', ')}`);

  /* ---------- heavier atoms ---------- */
  section('    why iron is denser than aluminium');
  const per = {fcc:4, bcc:2};
  for(const k of ['aluminium','iron']){
    const pk = S.PACK[k];
    chk(pk.n === per[S.ATOM[k].kind]*Math.pow(S.CELLS[k], 3), `${k}: ${pk.n} atoms is not whole cells of its pattern`);
    chk(pk.mesh.count === pk.n, `${k}: ${pk.mesh.count} atoms drawn, ${pk.n} counted`);
    chk(pk.mass === pk.n*S.ATOM[k].Ar, `${k}: the mass in the box is not atoms × relative mass`);
    const L = pk.mesh.parent.children.find(o=>o.isLineSegments).geometry;
    let out = 0;
    for(let i=0;i<pk.n*3;i++) if(Math.abs(pk.P[i]) > 1.3 + 1e-9) out++;
    chk(out === 0, `${k}: ${out} atom coordinates outside the box`);
  }
  chk(S.BOX_MISMATCH < 0.01, `the two patterns do not fit the same box: ${(S.BOX_MISMATCH*100).toFixed(1)}% apart`);
  chk(S.ATOM.iron.Ar > S.ATOM.aluminium.Ar && S.ATOM.iron.r < S.ATOM.aluminium.r, 'iron atoms should be heavier and smaller');
  chk(Math.abs(S.FIG.massRatio/S.FIG.rhoRatio - 1) < 0.03,
      `mass in the boxes is ×${S.FIG.massRatio.toFixed(2)}, but iron is ×${S.FIG.rhoRatio.toFixed(2)} as dense as aluminium`);
  chk(near(S.FIG.massRatio, S.FIG.arRatio*S.FIG.countRatio, 1e-12), 'mass ratio is not (mass of one) × (how many)');
  const t5 = plain(S.CH[5].text);
  chk(t5.includes(S.PACK.iron.n + ' against ' + S.PACK.aluminium.n), 'chapter 5 quotes different atom counts');
  chk(t5.includes(S.FIG.massRatio.toFixed(1) + ' times') && t5.includes(S.FIG.rhoRatio.toFixed(1) + ' times'), 'chapter 5 quotes different ratios');
  S.enterChapter(5); S.frame(S.CH[5].len);
  const c5 = S.cardsAt(5, S.CH[5].len);
  chk(c5.every((c, i)=>F(c,'Atoms in box') === String(S.PACK[['aluminium','iron'][i]].n)), 'the cards do not count every atom by the end');
  chk(F(c5[1],'Mass in box') === S.grp(S.PACK.iron.mass), 'the iron card shows a different mass');
  chk(S.cardsAt(5, 1).every(c=>F(c,'Atoms in box') === '0'), 'atoms are counted before any appear');
  console.log(`      ${S.PACK.aluminium.n} Al × ${S.ATOM.aluminium.Ar} vs ${S.PACK.iron.n} Fe × ${S.ATOM.iron.Ar}: mass ×${S.FIG.massRatio.toFixed(2)}, density ×${S.FIG.rhoRatio.toFixed(2)}`);

  /* ---------- states ---------- */
  section('    solid, liquid, gas');
  chk(S.GOLD_RHO.solid > S.GOLD_RHO.liquid && S.GOLD_RHO.liquid > 1000*S.GOLD_RHO.gas, 'gold should be densest solid, then liquid, then far less as gas');
  chk(S.STATE_N.solid === 108 && S.STATE_N.liquid === Math.round(108*S.GOLD_RHO.liquid/S.GOLD_RHO.solid), 'the liquid box does not hold the atoms the densities say');
  chk(S.STATE_MESH.solid.count === S.STATE_N.solid && S.STATE_MESH.liquid.count === S.STATE_N.liquid, 'the drawn gold does not match the counts');
  chk(near(S.GOLD_RHO.gas, 101325*0.19697/(8.314*(2856+273))/1000, 1e-9), 'the gas density is not pV = nRT at the boiling point');
  chk(S.GAS_EXPECT < 0.05, 'the gas box should really be nearly always empty');
  chk(plain(S.CH[6].text).includes(S.sig(S.GOLD_RHO.solid,3) + ' g/cm³') && plain(S.CH[6].text).includes(S.sig(S.GOLD_RHO.liquid,3) + ' g/cm³'), 'chapter 6 quotes different densities');
  const liq = S.STATE_P.liquid, d0 = S.STATE_L/Math.cbrt(S.STATE_N.liquid);
  let liqMin = Infinity;
  for(let i=0;i<S.STATE_N.liquid;i++) for(let j=i+1;j<S.STATE_N.liquid;j++)
    liqMin = Math.min(liqMin, Math.hypot(liq[i*3]-liq[j*3], liq[i*3+1]-liq[j*3+1], liq[i*3+2]-liq[j*3+2]));
  chk(liqMin > 0.7*d0, `two liquid gold atoms are piled on each other (${liqMin.toFixed(3)} apart)`);

  /* ---------- sink or float ---------- */
  section('    sink or float');
  chk(S.WAX.solid > S.WAX.liquid, 'solid wax should be denser than melted wax');
  chk(S.ICE < S.WATER0, 'ice should be less dense than water');
  chk(near(S.FLOAT_F, S.ICE/S.WATER0, 1e-12), 'the floating fraction is not ρ(ice) ÷ ρ(water)');
  S.enterChapter(7); S.updateFloat(60);
  const under = (S.SURF - (S.iceCube.position.y - S.FCUBE/2))/S.FCUBE;
  chk(Math.abs(under - S.FLOAT_F) < 0.005, `the ice settles ${(under*100).toFixed(1)}% under, should be ${(S.FLOAT_F*100).toFixed(1)}%`);
  chk(near(S.waxCube.position.y, S.BEAK.glass + S.FCUBE/2), 'the wax does not end on the bottom of its beaker');
  const c7 = S.cardsAt(7, 60);
  chk(F(c7[0],'The solid…') === 'sinks' && F(c7[1],'The solid…') === 'floats', 'the cards say the wrong thing sinks');
  chk(plain(S.CH[7].look).includes(S.FIG.icePct + '%'), 'chapter 7 quotes a different floating fraction');
  console.log(`      ice ${S.ICE} / water ${S.WATER0}: ${(under*100).toFixed(1)}% under the surface`);
}

/* =========================================================================== */
(async function main(){
  const url = threeUrlOf(read('melting-snowman.html'));
  const src = await ensureThree(url);
  if(!src){
    console.log('\n  SKIPPED — could not fetch ' + url + ' and nothing is cached.');
    console.log('  Run this once with a network connection; after that it works offline.');
    return;
  }
  let THREE;
  try {
    THREE = loadThree(src);
    if(!THREE || !THREE.Vector3) throw new Error('no THREE in the bundle');
  } catch(e){
    console.log('\n  SKIPPED — the cached three.js would not load: ' + e.message);
    return;
  }
  console.log('  three.js r' + THREE.REVISION + ', WebGLRenderer stubbed out');

  try {
    melting(THREE);
    brownian(THREE);
    acidStory(THREE);
    alkaliStory(THREE);
    particleTypesStory(THREE);
    pureStory(THREE);
    convectionStory(THREE);
    conductionStory(THREE);
    densityStory(THREE);
    console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED`
                               : `all ${checks} checks pass`));
    if(fails) process.exitCode = 1;
  } catch (e) {
    console.log('\nharness error after only ' + checks + ' checks: ' + e.message);
    console.log(e.stack.split('\n').slice(1, 5).join('\n'));
    process.exitCode = 1;
  }
})();
