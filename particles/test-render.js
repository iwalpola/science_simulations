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
    console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED`
                               : `all ${checks} checks pass`));
    if(fails) process.exitCode = 1;
  } catch (e) {
    console.log('\nharness error after only ' + checks + ' checks: ' + e.message);
    console.log(e.stack.split('\n').slice(1, 5).join('\n'));
    process.exitCode = 1;
  }
})();
