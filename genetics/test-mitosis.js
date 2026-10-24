/* ===========================================================================
   Tests for mitosis-3d-story.html.   Run with:

       node test-mitosis.js

   It runs the page the way test-genetics.js does: the real three.js the page
   loads (its URL is read out of the page's own <script src>), with only
   WebGLRenderer and PMREMGenerator stubbed out, and every chapter driven
   frame by frame through frame(t).

   On top of "nothing throws, nothing goes NaN", it checks that the picture is
   what the captions say it is -- as properties, not by re-running the
   page's own formulas:

     - interphase: the cell grows from half volume to full; mitochondria
       double; until copying starts there is one thread per chromosome, and
       by the end of it two, identical, side by side; every thread stays
       inside the nucleus while the nucleus is whole
     - mitosis: the envelope is gone before the chromosomes reach the
       equator; at metaphase every centromere is on the equator, each sister
       held by a fibre from its own pole, and no two chromosomes touch; in
       anaphase each chromatid only ever moves towards its own pole
     - the nucleus is never pinched: no envelope piece crosses the middle
     - cytokinesis: the membrane's waist only ever narrows, then the cell
       is two; each daughter has exactly half the parent's volume, one copy
       of every chromosome inside its own nucleus, and half the mitochondria
     - everything (chromatids, fibres, organelles) stays inside the membrane
     - the pie chart's slices are the cycle's times; the hand only goes
       forwards, sits in the slice its chapter is about, and ends at the top
     - the tissue doubles to 16 in a 4 x 4 square and no two cells overlap
     - every number a caption quotes is one FIG works out, in both modes
     - every label's anchors are on screen while it is showing

   It cannot tell whether anything LOOKS right. Nothing is rasterised.
=========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, checks = 0;
function chk(ok, msg){
  checks++;
  if(!ok){ fails++; console.log('    FAIL  ' + msg); }
}
function section(s){ console.log('\n' + s); }
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---------------------------------------------------------------- three.js */
function threeUrlOf(html){
  const m = html.match(/<script src="([^"]*three[^"]*\.js)"><\/script>/);
  if(!m) throw new Error('no three.js <script src> found in the page');
  return m[1];
}
async function ensureThree(url){
  const name = url.split('/').slice(-3).join('-').replace(/[^\w.-]/g, '_');
  for(const dir of [path.join(__dirname, '.three-cache'), path.join(__dirname, '..', 'particles', '.three-cache')]){
    const f = path.join(dir, name);
    if(fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  }
  if(typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url);
    if(!res.ok) return null;
    const src = await res.text();
    const dir = path.join(__dirname, '.three-cache');
    fs.mkdirSync(dir, {recursive:true});
    fs.writeFileSync(path.join(dir, name), src);
    return src;
  } catch(e){ return null; }
}
function loadThree(src){
  const exports = {};
  const sandbox = {module:{exports}, exports, console};
  sandbox.self = sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, {filename:'three.js'});
  for(const cand of [sandbox.exports, sandbox.module.exports, sandbox.THREE])
    if(cand && cand.Vector3) return cand;
  return null;
}

/* the shared organelles (../cell_biology/organelles.js), read out of the
   page's own <script src> like three.js, so the two cannot drift */
function loadOrganelles(THREE, html){
  const m = html.match(/<script src="([^"]*organelles\.js)"><\/script>/);
  if(!m) return undefined;
  const win = {};
  new Function('THREE', 'window', read(m[1]))(THREE, win);
  return win.Organelles;
}

/* ------------------------------------------------------- just enough DOM */
function makeDom(){
  const els = new Map();
  function mkEl(id){
    const el = {
      id, width:300, height:150, innerHTML:'', textContent:'', hidden:false,
      clientWidth:1280, clientHeight:720, offsetWidth:110, offsetHeight:22,
      style:{}, children:[],
      classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }},
      addEventListener(){}, removeEventListener(){}, setPointerCapture(){},
      appendChild(c){ this.children.push(c); }, remove(){},
      querySelectorAll(){ return []; }, querySelector(){ return null; },
      setAttribute(){}, getAttribute(){ return null; }
    };
    return el;
  }
  return {
    getElementById(id){ if(!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag){ return mkEl(tag); },
    querySelectorAll(){ return []; },
    addEventListener(){}, body:mkEl('body')
  };
}
function stubRenderer(THREE, dom){
  THREE.WebGLRenderer = class {
    constructor(){ this.domElement = dom.createElement('canvas'); this.__renders = 0; this.shadowMap = {}; }
    setPixelRatio(){} setSize(){} setClearColor(){} dispose(){}
    render(){ this.__renders++; }
  };
  THREE.PMREMGenerator = class {
    fromScene(){ return {texture:new THREE.Texture()}; } dispose(){}
  };
}

const plain = s => String(s).replace(/<[^>]+>/g, '');

/* =========================================================================== */
function run(THREE, html){
  const dom = makeDom();
  stubRenderer(THREE, dom);
  const expose = ['CH','frame','enterChapter','setPhases','camera','renderer','scene','FIG','CYCLE','STAGES','TOTAL',
    'HAND','handMin','stageAt','PIE','PHASES','phaseAt','CHROMS','TUBES','tubeOf','NS','F','ENV','FIB','KFM','ORDER',
    'MITO','RIBO','N_MITO','cellState','cellSdf','rhoAt','lobeRange','CELL_R','CELL_RD','NUC_R','NUC_R0','TL','XP',
    'tissueAt','TS','LAY','SLOTS','centromere','OFF0','ALL_LABELS','LAYOUT','toScreen','VW','VH','W1','W2','HUMAN','copiedAt','ORIG'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {addEventListener(){}, innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  const ORGS = loadOrganelles(THREE, html);
  let S;
  try {
    S = new Function('THREE','Organelles','document','window','requestAnimationFrame','performance',
      js + '\nreturn {' + expose + '};')(THREE, ORGS, dom, win, () => 0, {now(){ return 0; }});
  } catch(e){
    chk(false, 'the page threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 5).join('\n'));
    return;
  }
  chk(true, 'the page loads');
  const V3 = THREE.Vector3;
  const byPart = p => S.CH.findIndex(c => c.part === p);
  const cellCh = S.CH.map((c, i) => i).filter(i => S.CH[i].Tlen > 0);
  /* drive the cell to clock T, through whichever chapter plays it */
  let curCh = -1;
  function atT(T){
    const i = cellCh.find(i => T >= S.CH[i].T0 - 1e-9 && T <= S.CH[i].T0 + S.CH[i].Tlen + 1e-9);
    if(curCh !== i){ S.enterChapter(i); curCh = i; }
    return S.frame(T - S.CH[i].T0);
  }
  const enter = i => { S.enterChapter(i); curCh = i; };
  const inside = (p, St, margin) => S.cellSdf(p.x, Math.hypot(p.y, p.z), St) < -(margin || 0);

  /* the cell is drawn with cell_biology/organelles.js, so it looks as it does
     in every model there (the page linearises colours, so compare that way) */
  section('the organelles are the ones in cell_biology/organelles.js');
  chk(!!ORGS, 'the page does not load ../cell_biology/organelles.js');
  if(ORGS){
    const lin = m => m.color.clone().convertSRGBToLinear().getHex();
    chk(S.MITO.every(o => o.mesh && o.mesh.material === ORGS.materials.mitochondrion &&
      o.mesh.children.some(c => c.material === ORGS.materials.cristae)), "a mitochondrion is not organelles.js's, cristae and all");
    chk(S.ENV.every(E => E.mat.color.getHex() === lin(ORGS.materials.envelope)), "a nuclear envelope is not organelles.js's colour");
    const ribo = [];
    S.W1.traverse(o => { if(o.material === ORGS.materials.ribosome) ribo.push(o); });
    chk(ribo.length > 0, "the ribosomes are not organelles.js's");
  }

  /* ---------------------------------------------------------- every frame */
  section('every frame of every chapter');
  const instanced = [];
  S.scene.traverse(o => { if(o.isInstancedMesh) instanced.push(o); });
  for(const phases of [false, true]){
    S.setPhases(phases);
    for(let ch=0; ch<S.CH.length; ch++){
      enter(ch);
      const before = S.renderer.__renders;
      let bad = 0, badGeo = 0, worlds = new Set();
      try {
        for(let t=0; t<=S.CH[ch].len + 1; t += phases ? 1/6 : 1/30){
          const shot = S.frame(t);
          worlds.add(shot.world);
          const c = S.camera.position;
          if(![c.x, c.y, c.z].every(isFinite)) bad++;
          if(Math.round(t*30) % 15 === 0){
            S.scene.traverse(o => {
              if(!o.isMesh || !o.visible || !o.geometry.attributes.position) return;
              if(![o.position.x, o.position.y, o.position.z].every(isFinite)){ badGeo++; return; }
              const a = o.geometry.attributes.position.array;
              for(let i=0;i<a.length;i+=97) if(!isFinite(a[i])){ badGeo++; break; }
            });
          }
        }
      } catch(e){
        chk(false, `chapter ${ch} (${S.CH[ch].part}) threw: ${e.message}`);
        console.log('      ' + (e.stack || '').split('\n').slice(1, 4).join('\n      '));
        continue;
      }
      chk(bad === 0, `chapter ${ch}: the camera went non-finite on ${bad} frames`);
      chk(badGeo === 0, `chapter ${ch}: ${badGeo} meshes have non-finite vertices or positions`);
      chk(S.renderer.__renders > before, `chapter ${ch} drew nothing`);
      for(const m of instanced){
        const a = m.instanceMatrix.array;
        chk(a.slice(0, m.count*16).every(isFinite), `chapter ${ch}: an instance matrix went non-finite`);
      }
      if(!phases) console.log(`      ${ch} ${S.CH[ch].part.padEnd(12)} ${[...worlds].join(' → ')}`);
    }
  }
  S.setPhases(false);

  /* the cell chapters are one continuous timeline */
  section('the chapters are one timeline');
  for(let n=1; n<cellCh.length; n++){
    const a = S.CH[cellCh[n-1]], b = S.CH[cellCh[n]];
    chk(Math.abs(a.T0 + a.Tlen - b.T0) < 1e-9, `chapter "${b.part}" does not start where "${a.part}" ends`);
  }
  const Tend = S.CH[cellCh[cellCh.length-1]].T0 + S.CH[cellCh[cellCh.length-1]].Tlen;
  chk(S.CH[cellCh[0]].T0 === 0, 'the cell\'s story does not start at the start of interphase');

  /* ------------------------------------------------------- chromosomes */
  section('chromosomes');
  chk(S.CHROMS.length === 4, `expected 4 chromosomes, got ${S.CHROMS.length}`);
  const pairs = {};
  S.CHROMS.forEach(c => { (pairs[c.pair] = pairs[c.pair] || []).push(c); });
  for(const p in pairs){
    const [a, b] = pairs[p];
    chk(pairs[p].length === 2, `pair ${p} does not have two chromosomes`);
    chk(a.L === b.L && a.p === b.p, `the two of pair ${p} are not the same size and shape`);
    chk(new Set(pairs[p].map(c => c.from)).size === 2 && pairs[p].every(c => c.from === 'mother' || c.from === 'father'),
        `pair ${p} is not one from the mother and one from the father`);
  }
  chk(S.TUBES.length === 8, 'expected 8 chromatids: two copies of each of 4 chromosomes');

  /* ------------------------------------------------------- interphase */
  section('interphase: growing and copying');
  const vol = St => {           // volume inside the membrane, by slices
    const L = S.lobeRange(St), n = 400;
    let v = 0;
    for(let i=0;i<n;i++){ const x = L.x0 + (L.x1 - L.x0)*(i + 0.5)/n; v += Math.PI*S.rhoAt(x, St)**2*(L.x1 - L.x0)/n; }
    return v;
  };
  const V0 = 2*vol(S.cellState(0)), Vfull = 2*vol(S.cellState(29));
  chk(Math.abs(V0/Vfull - 0.5) < 0.005, `a new cell should have half the volume of a grown one: ${(V0/Vfull).toFixed(3)}`);
  const mitoAt = T => { atT(T); return S.MITO.filter(o => !o.born || S.F.T >= o.born[1]).length; };
  chk(mitoAt(0.2) === S.FIG.mito0, `a new cell should have ${S.FIG.mito0} mitochondria, has ${mitoAt(0.2)}`);
  chk(mitoAt(14) === S.FIG.mito1, `a grown cell should have ${S.FIG.mito1} mitochondria, has ${mitoAt(14)}`);
  chk(S.FIG.mito1 === 2*S.FIG.mito0, 'growth should double the mitochondria');
  /* a new mitochondrion starts where its parent is: it splits off it */
  {
    const o = S.MITO.find(o => o.born);
    atT(o.born[0] + 1e-3);
    const p = S.MITO[o.parent].pos;
    chk(o.pos.distanceTo(p) < 0.05, 'a new mitochondrion does not start at the one it splits from');
  }
  const copyR = T => { atT(T); return S.TUBES.filter(t => t.j > 0).map(t => Math.max(...t.R)); };
  chk(copyR(S.TL.copy0 - 0.1).every(r => r === 0), 'a copy of a chromosome is visible before copying starts');
  /* by the end of interphase every chromosome is wholly copied, and the
     copy is the same thickness as the original everywhere */
  atT(29.9);
  let notCopied = 0, notIdentical = 0, apart = 0;
  for(let k=0;k<4;k++){
    const a = S.tubeOf(k, -1), b = S.tubeOf(k, 1);
    const full = Math.max(...a.R);
    for(let i=0;i<=S.NS;i++){
      if(Math.abs(a.R[i] - b.R[i]) > 1e-9) notCopied++;
      if(a.R[i] < 0.95*full) continue;              // the tapered ends
      /* side by side: touching or nearly, not overlapping, not apart */
      const d = a.P[i].distanceTo(b.P[i]);
      if(d < 0.95*(a.R[i] + b.R[i]) || d > 1.3*(a.R[i] + b.R[i])) apart++;
    }
    /* identical: the copy is the original's shape, moved sideways */
    const da = new V3().subVectors(a.P[S.NS], a.P[0]), db = new V3().subVectors(b.P[S.NS], b.P[0]);
    if(da.distanceTo(db) > 0.25) notIdentical++;
  }
  chk(notCopied === 0, `${notCopied} points of the chromosomes are not copied by the end of interphase`);
  chk(apart === 0, `${apart} points of a copy are not lying beside the original`);
  chk(notIdentical === 0, 'a copy is not the same shape as its original');
  /* copying spreads from several origins, and never un-copies */
  let shrink = 0;
  for(let k=0;k<4;k++) for(const s of [0, 0.2, 0.5, 0.77, 1]){
    let last = 0;
    for(let T=14; T<=30; T+=0.25){ const c = S.copiedAt(k, s, T); if(c < last - 1e-12) shrink++; last = c; }
  }
  chk(shrink === 0, 'a stretch of DNA is un-copied');
  chk(S.ORIG.every(o => o.length > 1), 'copying should start in several places at once');
  /* inside the nucleus while it is whole */
  let outNuc = 0;
  for(let T=0; T<=S.TL.envOff[0]; T+=0.5){
    atT(T);
    for(const tb of S.TUBES) for(let i=0;i<=S.NS;i+=3)
      if(tb.R[i] > 0 && tb.P[i].length() + tb.R[i] > S.F.rn) outNuc++;
  }
  chk(outNuc === 0, `${outNuc} chromosome points poke out of the nucleus while it is whole`);

  /* ------------------------------------------------------------ mitosis */
  section('mitosis');
  const envOp = T => { atT(T); return S.ENV[0].mesh.visible ? S.ENV[0].op0 : 0; };
  chk(envOp(30) > 0.4, 'the nucleus should be whole at the start of mitosis');
  const meta = S.CH[byPart('Lining up')];
  const reachEq = S.TL.congress[0];
  chk(envOp(reachEq) < 0.01, 'the chromosomes leave for the equator before the nuclear membrane has gone');
  /* the nucleus is never pinched in two: no piece of an envelope ever lies
     across the middle while it is whole or forming */
  let pinch = 0;
  for(let T=0; T<=Tend; T+=0.5){
    atT(T);
    for(const E of S.ENV.slice(1)){
      if(!E.mesh.visible || E.op0 < 0.02) continue;
      const a = E.g.attributes.position.array;
      for(let i=0;i<a.length;i+=3) if(Math.abs(a[i]) < 0.3) pinch++;
    }
  }
  chk(pinch === 0, `${pinch} vertices of a new nucleus lie across the middle of the cell`);
  /* metaphase */
  atT(meta.T0 + meta.Tlen - 0.01);
  for(let k=0;k<4;k++){
    chk(Math.abs(S.F.fr[k].C.x) < 1e-9, `chromosome ${k}'s centromere is not on the equator at metaphase`);
    for(const j of [-1, 1]){
      const f = S.FIB[2*k + (j > 0 ? 1 : 0)];
      const pole = S.F.poles[j > 0 ? 1 : 0];
      chk(f.on && f.a.distanceTo(pole) < 1e-9, `chromatid ${k}${j > 0 ? '+' : '-'} is not held by a fibre from its own pole`);
      chk(Math.sign(pole.x) === j, `the pole for side ${j} is on the wrong side`);
      const cc = new V3().copy(S.F.fr[k].C).addScaledVector(S.F.fr[k].S, j*S.OFF0);
      chk(f.b.distanceTo(cc) < 1e-9, `chromatid ${k}${j > 0 ? '+' : '-'}'s fibre does not end at its centromere`);
    }
  }
  /* no two chromosomes touch on the equator */
  let touch = 0;
  for(let k=0;k<4;k++) for(let m=k+1;m<4;m++)
    for(const ja of [-1, 1]) for(const jb of [-1, 1]){
      const a = S.tubeOf(k, ja), b = S.tubeOf(m, jb);
      for(let i=0;i<=S.NS;i+=4) for(let n=0;n<=S.NS;n+=4)
        if(a.P[i].distanceTo(b.P[n]) < a.R[i] + b.R[n]) touch++;
    }
  chk(touch === 0, `chromosomes touch each other on the equator (${touch} near points)`);
  /* anaphase: each chromatid only moves towards its own pole */
  let back = 0, wrong = 0;
  const last = {};
  for(let T=meta.T0 + meta.Tlen; T<=S.TL.decondense[0]; T+=0.1){
    atT(T);
    for(let k=0;k<4;k++) for(const j of [-1, 1]){
      const x = j*S.centromere(k, j, new V3()).x;
      const key = k + ':' + j;
      if(key in last && x < last[key] - 1e-9) back++;
      if(x < 0) wrong++;
      last[key] = x;
      /* and every point of it ends on its own side */
      if(S.F.a >= 1) for(const p of S.tubeOf(k, j).P) if(j*p.x < 0.3) wrong++;
    }
  }
  chk(back === 0, `a chromatid moves back towards the equator during anaphase (${back} steps)`);
  chk(wrong === 0, `a chromatid is on the wrong side of the cell during anaphase (${wrong})`);

  /* --------------------------------------------------------- cytokinesis */
  section('cytokinesis and the daughters');
  let widen = 0, lastN = Infinity;
  for(let T=S.TL.furrow[0]; T<=S.TL.furrow[1]; T+=0.05){
    const n = S.rhoAt(0, S.cellState(T));
    if(n > lastN + 1e-6) widen++;
    lastN = n;
  }
  chk(widen === 0, 'the waist widens again during cytokinesis');
  let dBack = 0, ld = -1;
  for(let T=0; T<=Tend; T+=0.02){ const d = S.cellState(T).d; if(d < ld - 1e-9) dBack++; ld = d; }
  chk(dBack === 0, `the two halves of the dividing cell move back towards each other (${dBack} steps)`);
  chk(S.rhoAt(0, S.cellState(S.TL.furrow[1])) < 1e-3, 'the waist has not closed by the end of the furrow');
  chk(S.rhoAt(0, S.cellState(S.TL.apart[0] + 0.05)) === 0, 'the cell has not split once the halves move apart');
  const Send = S.cellState(Tend);
  chk(!S.lobeRange(Send).open, 'the two daughter cells are still joined at the end');
  chk(Math.abs(vol(Send)/Vfull - 0.5) < 0.005, `each daughter should have half the parent's volume: ${(vol(Send)/Vfull).toFixed(3)}`);
  /* a daughter is a plain sphere again by the end, the same as the cell we started with */
  const S0 = S.cellState(0);
  chk(Math.abs(Send.r - S0.r) < 1e-9 && Send.k === 0 && S0.k === 0, 'a daughter does not end as the cell the story started with');
  atT(Tend);
  for(const j of [-1, 1]){
    const nc = S.F.Nc[j > 0 ? 1 : 0];
    chk(Math.abs(nc.x - j*Send.d) < 1e-9, `daughter ${j}'s nucleus is not in the middle of its cell`);
    const kinds = new Set();
    for(const tb of S.TUBES){
      const all = tb.P.every((p, i) => p.distanceTo(nc) + tb.R[i] < S.NUC_R0);
      if(all) kinds.add(tb.k);
      if(all) chk(tb.j === j, `chromosome ${tb.k}'s copy ${tb.j} went to daughter ${j}`);
    }
    chk(kinds.size === 4, `daughter ${j} does not have one copy of each of the 4 chromosomes inside its nucleus (${[...kinds]})`);
    chk(S.MITO.filter(o => j*o.pos.x > 0).length === S.N_MITO, `daughter ${j} does not get half of the mitochondria`);
  }
  /* the daughters' chromosome threads are the shape the story started with */
  atT(0); const start = S.TUBES.filter(t => t.j < 0).map(t => t.P.map(p => p.clone()));
  atT(Tend);
  let sameShape = 0;
  S.TUBES.filter(t => t.j > 0).forEach((t, k) => {
    const off = new V3().subVectors(t.P[0], start[k][0]);
    t.P.forEach((p, i) => { if(p.clone().sub(off).distanceTo(start[k][i]) > 1e-6) sameShape++; });
  });
  chk(sameShape === 0, 'a daughter\'s chromosomes are not the same as the parent\'s at the start');

  /* ---------------------------------------------------- inside the membrane */
  section('everything stays inside the cell');
  let outC = 0, outF = 0, outO = 0;
  for(let T=0; T<=Tend; T+=0.25){
    atT(T);
    const St = S.F.cell;
    for(const tb of S.TUBES) for(let i=0;i<=S.NS;i+=6) if(tb.R[i] > 0 && !inside(tb.P[i], St, tb.R[i])) outC++;
    for(const f of S.FIB) if(f.on && (!inside(f.a, St, 0.03) || !inside(f.b, St, 0.03))) outF++;
    for(const o of S.MITO.concat(S.RIBO)) if(!inside(o.pos, St, 0.05)) outO++;
  }
  chk(outC === 0, `${outC} chromosome points are outside the membrane`);
  chk(outF === 0, `${outF} spindle fibre ends are outside the membrane`);
  chk(outO === 0, `${outO} organelle positions are outside the membrane`);
  /* the membrane's faces point outwards */
  atT(77);
  {
    const g = S.W1.children.find(o => o.isMesh && o.geometry.userData.lathe).geometry;
    const pos = g.attributes.position, idx = g.index.array, St = S.F.cell;
    let inward = 0;
    const a = new V3(), b = new V3(), c = new V3(), n = new V3(), m = new V3();
    for(let t=0;t<idx.length;t+=3*7){
      a.fromBufferAttribute(pos, idx[t]); b.fromBufferAttribute(pos, idx[t+1]); c.fromBufferAttribute(pos, idx[t+2]);
      n.subVectors(b, a).cross(m.subVectors(c, a));
      if(n.lengthSq() < 1e-12) continue;
      const centre = new V3().add(a).add(b).add(c).multiplyScalar(1/3);
      n.normalize();
      const out = centre.clone().addScaledVector(n, 0.02);
      if(S.cellSdf(out.x, Math.hypot(out.y, out.z), St) < S.cellSdf(centre.x, Math.hypot(centre.y, centre.z), St)) inward++;
    }
    chk(inward === 0, `${inward} membrane faces point inwards`);
  }

  /* the whole cell is in view wherever the story is about the whole cell
     (not while the camera is inside the nucleus, copying the DNA) */
  const wholeFrom = {'Growth':0, 'Lining up':10, 'Pulled apart':0, 'Two nuclei':0, 'Cytokinesis':0};
  for(const p in wholeFrom){
    const i = byPart(p);
    enter(i);
    let off = 0, worst = '';
    for(let tt=wholeFrom[p]; tt<=S.CH[i].len; tt+=0.25){
      S.frame(tt);
      const St = S.F.cell, L = S.lobeRange(St);
      let rmax = 0;
      for(let n=0;n<=40;n++) rmax = Math.max(rmax, S.rhoAt(L.x0 + (L.x1 - L.x0)*n/40, St));
      const ext = [new V3(L.x0, 0, 0), new V3(-L.x0, 0, 0), new V3(St.d*0, rmax, 0), new V3(0, -rmax, 0),
                   new V3(-St.d, rmax, 0), new V3(St.d, -rmax, 0), new V3(-St.d, 0, rmax), new V3(St.d, 0, -rmax)];
      for(const e of ext){
        const q = S.toScreen(e);
        if(!(q.ok && q.x > 0 && q.x < S.VW && q.y > 0 && q.y < S.VH)){ off++; worst = `${tt.toFixed(2)} s (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`; break; }
      }
    }
    chk(off === 0, `"${p}": part of the cell is off screen on ${off} frames, e.g. at ${worst}`);
  }

  /* ---------------------------------------------------------- the pie */
  section('the pie chart');
  chk(S.TOTAL === S.STAGES.reduce((s, x) => s + x.min, 0), 'the slices do not add up to the cycle');
  chk(S.STAGES[0].min === S.CYCLE.G1 + S.CYCLE.S + S.CYCLE.G2, 'interphase is not G1 + S + G2');
  chk(S.STAGES.map(s => s.n).join() === '1,2,3' && S.STAGES.map(s => s.name).join() === 'Interphase,Mitosis,Cytokinesis',
      'the three stages are not interphase, mitosis, cytokinesis in that order');
  let backwards = 0, lastM = -1;
  for(let T=0; T<=Tend; T+=0.05){ const m = S.handMin(T); if(m < lastM - 1e-9) backwards++; lastM = m; }
  chk(backwards === 0, 'the pie chart\'s hand goes backwards');
  chk(S.handMin(Tend) === S.TOTAL, 'the hand does not get all the way round');
  const want = {'Growth':0, 'Copying':0, 'Lining up':1, 'Pulled apart':1, 'Two nuclei':1, 'Cytokinesis':2};
  for(const p in want){
    const C = S.CH[byPart(p)];
    for(let t=0.05; t<C.Tlen; t+=0.5){
      const st = S.stageAt(S.handMin(C.T0 + t));
      if(st !== want[p]){ chk(false, `in "${p}" at ${t.toFixed(2)} s the hand is in ${S.STAGES[st].name}`); break; }
    }
  }
  /* the copying chapter is S phase: the hand crosses S while the forks run */
  const sFrom = S.CYCLE.G1, sTo = S.CYCLE.G1 + S.CYCLE.S;
  const fired = Math.min(...S.ORIG.flat().map(o => o.t));
  chk(S.handMin(fired) >= sFrom - 1e-9, 'copying starts before the hand reaches S phase');
  let doneT = 0;
  for(let T=14; T<=30; T+=0.05)
    if([0,1,2,3].some(k => { for(let i=0;i<=200;i++) if(S.copiedAt(k, i/200, T) < 1) return true; return false; })) doneT = T;
  chk(S.handMin(doneT) <= sTo + 1e-9, 'copying is still going on after the hand has left S phase');
  /* the speed-up quoted is the one the hand moves at */
  const rI = S.STAGES[0].min/(S.HAND[3][0] - S.HAND[0][0]), rM = S.CYCLE.mitosis/(S.HAND[4][0] - S.HAND[3][0]);
  chk(Math.abs(S.FIG.slowExact - rI/rM) < 1e-9, 'the slow-down quoted is not the hand\'s');
  chk(Math.abs(S.FIG.slow - rI/rM) <= 5, 'the slow-down quoted is not rounded to the nearest ten');
  /* phases line up with the cell's own timeline */
  chk(S.phaseAt(S.TL.condense[0] + 1).name === 'Prophase', 'condensing is not in prophase');
  chk(S.phaseAt(S.TL.congress[1] + 2.5).name === 'Metaphase', 'lined up is not in metaphase');
  chk(S.phaseAt(S.TL.ana[0] + 1).name === 'Anaphase', 'pulling apart is not in anaphase');
  chk(S.phaseAt(S.TL.envOn[0] + 1).name === 'Telophase', 'the nuclei forming is not in telophase');
  chk(S.PHASES.every((p, i) => i === 0 || p.T0 === S.PHASES[i-1].T1), 'the phases leave a gap or overlap');
  chk(S.PHASES[0].T0 === S.HAND[3][0] && S.PHASES[S.PHASES.length-1].T1 === S.HAND[4][0],
      'the four phases do not fill the mitosis slice of the timeline');

  /* ---------------------------------------------------------- the tissue */
  section('the tissue: doubling');
  const tis = S.CH[byPart('Doubling')];
  const counts = [];
  let overlaps = 0, offScreen = 0;
  enter(byPart('Doubling'));
  for(let t=0; t<=tis.len; t+=0.25){
    S.frame(t);
    const st = S.tissueAt(t);
    if(counts[counts.length-1] !== st.count) counts.push(st.count);
    /* sample each cell's membrane and check it is outside every other cell */
    const pts = st.cells.map(cl => {
      const L = S.lobeRange(cl.S), out = [];
      for(let i=0;i<=24;i++){
        const x = L.x0 + (L.x1 - L.x0)*i/24, r = S.rhoAt(x, cl.S);
        for(let a=0;a<12;a++){
          for(const m of [1, -1]){
            const loc = new V3(m*x, r*Math.cos(a*Math.PI/6), r*Math.sin(a*Math.PI/6));
            if(cl.axis === 'z') loc.set(-loc.z, loc.y, loc.x);
            out.push(loc.add(cl.c));
          }
        }
      }
      return out;
    });
    st.cells.forEach((A, ia) => st.cells.forEach((B, ib) => {
      if(ia === ib) return;
      for(const p of pts[ia]){
        const q = p.clone().sub(B.c);
        if(B.axis === 'z') q.set(q.z, q.y, -q.x);
        if(S.cellSdf(q.x, Math.hypot(q.y, q.z), B.S) < -0.01){ overlaps++; break; }
      }
    }));
    if(Math.round(t*4) % 4 === 0) for(const p of pts.flat()){
      const s = S.toScreen(p);
      if(!(s.x > 0 && s.x < S.VW && s.y > 0 && s.y < S.VH)){ offScreen++; break; }
    }
  }
  chk(counts.join() === S.FIG.seq.join(), `the number of cells goes ${counts.join(', ')}, not ${S.FIG.seq.join(', ')}`);
  chk(overlaps === 0, `cells overlap each other in ${overlaps} cases`);
  chk(offScreen === 0, `part of the tissue is off screen on ${offScreen} frames`);
  const fin = S.tissueAt(tis.len);
  const xs = [...new Set(fin.cells.map(c => c.c.x.toFixed(6)))], zs = [...new Set(fin.cells.map(c => c.c.z.toFixed(6)))];
  chk(fin.cells.length === 16 && xs.length === 4 && zs.length === 4, 'the 16 cells do not end as a 4 x 4 square');
  const gaps = xs.map(Number).sort((a, b) => a - b);
  chk(gaps.every((x, i) => i === 0 || Math.abs(x - gaps[i-1] - S.TS.s) < 1e-6), 'the square\'s spacing is uneven');
  chk(fin.cells.every(c => c.S.r === S.CELL_R), 'the cells have not grown back to full size by the end');
  chk(new Set(fin.cells.map(c => c.slot)).size === 16, 'two cells share a slot');

  /* --------------------------------------------------- the numbers */
  section('every figure a caption quotes');
  chk(S.FIG.cycleH === 24 && S.FIG.interH === 23, `the cycle should be 24 h with 23 h of interphase, not ${S.FIG.cycleH} and ${S.FIG.interH}`);
  chk(S.FIG.chrom === S.CHROMS.length && S.FIG.pairs === S.CHROMS.length/2, 'the chromosome count quoted is not the one drawn');
  chk(S.FIG.human === 46 && S.FIG.humanPairs === 23, 'a human body cell has 46 chromosomes in 23 pairs');
  chk(S.FIG.seq[S.FIG.seq.length-1] === fin.cells.length, 'the doubling sequence does not end at the number of cells drawn');
  chk(S.FIG.ten === Math.pow(2, S.FIG.tenN), 'the number after ten divisions is not 2 to the 10');
  const allowed = new Set(['1','2','3', String(S.FIG.cycleH), String(S.FIG.interH), String(S.FIG.sH), String(S.FIG.slow),
    String(S.FIG.chrom), String(S.FIG.pairs), String(S.FIG.human), String(S.FIG.humanPairs),
    String(S.FIG.mito0), String(S.FIG.mito1), String(S.FIG.tenN), String(S.FIG.ten), ...S.FIG.seq.map(String)]);
  const text = (C, phases) => plain([C.title, C.text, C.look, C.scale, phases ? C.phases : '',
    ...C.terms.flat(), ...(phases && C.phaseTerms ? C.phaseTerms.flat() : [])].filter(Boolean).join(' '));
  for(const phases of [false, true]) for(let i=0;i<S.CH.length;i++){
    const nums = text(S.CH[i], phases).match(/\d+(\.\d+)?/g) || [];
    for(const n of nums) chk(allowed.has(n), `chapter ${i} quotes ${n}, which nothing works out`);
  }
  const t = p => text(S.CH[byPart(p)], false);
  chk(t('Cycle').includes(S.FIG.interH + ' hours') && t('Cycle').includes(S.FIG.cycleH + '-hour'), 'the cycle chapter quotes other times');
  chk(t('Growth').includes('from ' + S.FIG.mito0 + ' to ' + S.FIG.mito1), 'the growth chapter quotes other counts');
  chk(t('Copying').includes(S.FIG.human + ' chromosomes') && t('Copying').includes(S.FIG.sH + ' hours'), 'the copying chapter quotes other figures');
  chk(t('Lining up').includes(S.FIG.slow + ' times slower'), 'the mitosis chapter quotes another slow-down');
  chk(t('Doubling').includes(S.FIG.seq.join(' → ')), 'the doubling chapter quotes another sequence');
  chk(['Lining up','Pulled apart','Two nuclei'].every(p => S.CH[byPart(p)].phases), 'a mitosis chapter has no phase notes for the toggle');
  const named = S.CH.map(c => plain(c.phases || '')).join(' ');
  chk(S.PHASES.every(p => named.includes(p.name + ':')), 'a phase is never described in the phase notes');
  console.log(`      cycle ${S.FIG.cycleH} h, interphase ${S.FIG.interH} h, mitosis played ${S.FIG.slowExact.toFixed(1)}x slower (quoted ${S.FIG.slow})`);

  /* ---------------------------------------------------- labels in view */
  section('labels are on screen while they show');
  let shown = 0;
  for(let ch=0; ch<S.CH.length; ch++){
    enter(ch);
    for(const L of S.CH[ch].labels){
      if(L.screen) continue;
      for(const tt of [L.t0 + 0.7, L.t1 ? L.t1 - 0.6 : S.CH[ch].len]){
        const shot = S.frame(tt);
        if(shot.world !== L.world) continue;
        shown++;
        for(const p of L.at()){
          const q = S.toScreen(p);
          chk(q.ok && q.x > 0 && q.x < S.VW && q.y > 0 && q.y < S.VH,
              `chapter ${ch} at ${tt.toFixed(1)} s: "${plain(L.text)}" points at something off screen (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
        }
        chk(!!S.LAYOUT.find(x => x.L === L), `chapter ${ch}: "${plain(L.text)}" was not laid out`);
      }
    }
  }
  console.log(`      ${shown} label placements checked`);
}

(async function main(){
  const html = read('mitosis-3d-story.html');
  const url = threeUrlOf(html);
  const src = await ensureThree(url);
  if(!src){
    console.log('\n  SKIPPED — could not fetch ' + url + ' and nothing is cached.');
    return;
  }
  const THREE = loadThree(src);
  console.log('  three.js r' + THREE.REVISION + ', WebGLRenderer stubbed out');
  try {
    run(THREE, html);
  } catch(e){
    console.log('\nharness error after ' + checks + ' checks: ' + e.message);
    console.log(e.stack.split('\n').slice(1, 5).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`));
  if(fails) process.exitCode = 1;
})();
