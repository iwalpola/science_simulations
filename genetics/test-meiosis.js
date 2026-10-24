/* ===========================================================================
   Tests for meiosis-3d-story.html.   Run with:

       node test-meiosis.js

   It runs the page the way test-mitosis.js does: the real three.js the page
   loads, WebGLRenderer and PMREMGenerator stubbed out, every chapter driven
   frame by frame through frame(t). Then it checks the biology as properties:

     - copying: a copy appears only once copying starts, and by the end
       every chromosome is two identical copies, side by side
     - pairing: the two chromosomes of each pair end up touching, side by
       side; different pairs never touch
     - crossing over: only between the two partners, never between sisters;
       one section each way, the same length, from the same place
     - first division: each pair straddles the equator; each chromosome
       goes, both copies together, only towards its own end; afterwards
       each of the two cells has exactly one chromosome of each pair, and
       the two cells have different mixes
     - second division: in each cell the chromosomes sit on that cell's
       equator, each copy held from its own pole, and each copy moves only
       towards its own pole
     - the end: four cells, a quarter of the volume each, each with a
       nucleus holding one chromatid of each pair, all four different
     - everything stays inside the membrane; new nuclei never sit across a
       cell's middle; mitochondria are shared out evenly
     - fertilisation: the sperm carries exactly one of the four gametes'
       chromosomes; the zygote's nucleus holds 4, in 2 pairs, one of each
       pair from the sperm and one from the egg
     - every number a caption quotes is one FIG works out
     - every label's anchors are on screen while it shows, and the cell is
       in view wherever the story is about the whole cell

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
    return {
      id, width:300, height:150, innerHTML:'', textContent:'', hidden:false,
      clientWidth:1280, clientHeight:720, offsetWidth:110, offsetHeight:22,
      style:{}, children:[],
      classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }},
      addEventListener(){}, removeEventListener(){}, setPointerCapture(){},
      appendChild(c){ this.children.push(c); }, remove(){},
      querySelectorAll(){ return []; }, querySelector(){ return null; },
      setAttribute(){}, getAttribute(){ return null; }
    };
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
  const expose = ['CH','frame','enterChapter','camera','renderer','scene','FIG','HUMAN','CHROMS','CROSS','OWNERS','TUBES',
    'tubeOf','NS','F','ENV','FIB','GAMETES','MITO','N_MITO','state1','state2','cellsSdf','cellSdf','rhoAt','lobeRange',
    'CELL_R','CELL_R1','CELL_R2','NUC_G','D1','OFF0','HW','TL','SPLIT1','chromatidRod','copiedAt','ORIG','STEPS','stepAt',
    'FCHR','FS','FN','FT','EGG_R','MEET','ZYG_R','SPERM_FROM','ALL_LABELS','LAYOUT','toScreen','VW','VH','W1','W2',
    'innerJ','BIV2','SIZE_UM'].join(',');
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
  let curCh = -1;
  const enter = i => { S.enterChapter(i); curCh = i; };
  function atT(T){
    const i = cellCh.find(i => T >= S.CH[i].T0 - 1e-9 && T <= S.CH[i].T0 + S.CH[i].Tlen + 1e-9);
    if(curCh !== i) enter(i);
    return S.frame(T - S.CH[i].T0);
  }
  const last = S.CH[cellCh[cellCh.length-1]], Tend = last.T0 + last.Tlen;
  const pairOf = k => S.CHROMS[k].pair;
  const partner = k => S.CHROMS.findIndex((c, m) => m !== k && c.pair === pairOf(k));
  const tubeDist = (a, b, step) => {
    let d = Infinity;
    for(let i=0;i<=S.NS;i+=step||4) for(let n=0;n<=S.NS;n+=step||4)
      d = Math.min(d, a.P[i].distanceTo(b.P[n]) - a.R[i] - b.R[n]);
    return d;
  };
  const sig = tb => { let s = (tb.k !== undefined ? pairOf(tb.k) : tb.pair) + '', last = -1; for(const c of tb.cid){ if(c !== last){ s += S.OWNERS[c][3]; last = c; } } return s; };

  /* the cell is drawn with cell_biology/organelles.js, so it looks as it does
     in every model there (the page linearises colours, so compare that way) */
  section('the organelles are the ones in cell_biology/organelles.js');
  chk(!!ORGS, 'the page does not load ../cell_biology/organelles.js');
  if(ORGS){
    const lin = m => m.color.clone().convertSRGBToLinear().getHex();
    const isMito = o => o.material === ORGS.materials.mitochondrion && o.children.some(c => c.material === ORGS.materials.cristae);
    chk(S.MITO.every(o => o.mesh && isMito(o.mesh)), "a mitochondrion is not organelles.js's, cristae and all");
    const eggMito = [];
    S.W2.traverse(o => { if(o.material === ORGS.materials.mitochondrion) eggMito.push(o); });
    chk(eggMito.length > 0 && eggMito.every(isMito), "the egg's mitochondria are not organelles.js's");
    chk(S.ENV.every(E => E.mat.color.getHex() === lin(ORGS.materials.envelope)), "a nuclear envelope is not organelles.js's colour");
    chk(Object.values(S.FN).every(m => m.material.color.getHex() === lin(ORGS.materials.envelope)), "a nucleus in the egg is not organelles.js's colour");
  }

  /* ---------------------------------------------------------- every frame */
  section('every frame of every chapter');
  const instanced = [];
  S.scene.traverse(o => { if(o.isInstancedMesh) instanced.push(o); });
  for(let ch=0; ch<S.CH.length; ch++){
    enter(ch);
    const before = S.renderer.__renders;
    let bad = 0, badGeo = 0, worlds = new Set();
    try {
      for(let t=0; t<=S.CH[ch].len + 1; t += 1/30){
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
    for(const m of instanced) chk(m.instanceMatrix.array.slice(0, m.count*16).every(isFinite), `chapter ${ch}: an instance matrix went non-finite`);
    console.log(`      ${ch} ${S.CH[ch].part.padEnd(16)} ${[...worlds].join(' → ')}`);
  }

  section('the chapters are one timeline');
  for(let n=1; n<cellCh.length; n++){
    const a = S.CH[cellCh[n-1]], b = S.CH[cellCh[n]];
    chk(Math.abs(a.T0 + a.Tlen - b.T0) < 1e-9, `chapter "${b.part}" does not start where "${a.part}" ends`);
  }

  /* ------------------------------------------------------- chromosomes */
  section('chromosomes');
  chk(S.CHROMS.length === 4 && S.TUBES.length === 8, 'expected 4 chromosomes, 8 chromatids');
  for(const p of [0, 1]){
    const ks = S.CHROMS.map((c, k) => k).filter(k => pairOf(k) === p);
    chk(ks.length === 2 && S.CHROMS[ks[0]].L === S.CHROMS[ks[1]].L, `pair ${p} is not two chromosomes of the same size`);
    chk(new Set(ks.map(k => S.CHROMS[k].from)).size === 2, `pair ${p} is not one from his mother and one from his father`);
    chk(new Set(ks.map(k => S.CHROMS[k].side)).size === 2, `pair ${p}'s chromosomes do not go to opposite ends`);
  }
  const redLeft = p => S.CHROMS.find(c => c.pair === p && c.from === 'hisMother').side < 0;
  chk(redLeft(0) && !redLeft(1), 'the caption says the long pair has red on the left and the short pair red on the right');

  /* ------------------------------------------------------- copying */
  section('copying');
  atT(S.TL.copy0 - 0.1);
  chk(S.TUBES.filter(t => t.j > 0).every(t => Math.max(...t.R) === 0), 'a copy is visible before copying starts');
  atT(S.CH[byPart('Copying')].T0 + S.CH[byPart('Copying')].Tlen - 0.01);
  let notCopied = 0, apart = 0;
  for(let k=0;k<4;k++){
    const a = S.tubeOf(k, -1), b = S.tubeOf(k, 1), full = Math.max(...a.R);
    for(let i=0;i<=S.NS;i++){
      if(Math.abs(a.R[i] - b.R[i]) > 1e-9) notCopied++;
      if(a.R[i] < 0.95*full) continue;
      const d = a.P[i].distanceTo(b.P[i]);
      if(d < 0.95*(a.R[i] + b.R[i]) || d > 1.3*(a.R[i] + b.R[i])) apart++;
    }
  }
  chk(notCopied === 0, `${notCopied} points are not copied by the end of copying`);
  chk(apart === 0, `${apart} points of a copy are not beside the original`);
  let outNuc = 0;
  for(let T=0; T<=S.TL.envOff[0]; T+=0.5){
    atT(T);
    for(const tb of S.TUBES) for(let i=0;i<=S.NS;i+=3)
      if(tb.R[i] > 0 && tb.P[i].length() + tb.R[i] > 1.9) outNuc++;
  }
  chk(outNuc === 0, `${outNuc} chromosome points poke out of the nucleus while it is whole`);

  /* ------------------------------------------------------- pairing */
  section('pairing and crossing over');
  atT(S.TL.pair[1] + 0.3);
  for(let k=0;k<4;k++){
    const m = partner(k);
    if(m < k) continue;
    const near = Math.min(...[-1, 1].flatMap(a => [-1, 1].map(b => tubeDist(S.tubeOf(k, a), S.tubeOf(m, b)))));
    chk(near < 0.03, `the partners of pair ${pairOf(k)} are not side by side (${near.toFixed(3)} apart)`);
    const inner = tubeDist(S.tubeOf(k, S.innerJ(S.CHROMS[k].side)), S.tubeOf(m, S.innerJ(S.CHROMS[m].side)));
    chk(inner < 0.03, `the two chromatids that cross over are not next to each other in pair ${pairOf(k)}`);
  }
  for(const k of [0, 1]) for(const m of [2, 3]) for(const a of [-1, 1]) for(const b of [-1, 1])
    chk(tubeDist(S.tubeOf(k, a), S.tubeOf(m, b)) > 0, `chromosomes of different pairs touch while pairing (${k}, ${m})`);
  /* crossing over: one swap each way between partners, never sisters */
  for(const X of S.CROSS){
    const ks = S.CHROMS.map((c, k) => k).filter(k => pairOf(k) === X.pair);
    const foreign = S.TUBES.filter(t => ks.includes(t.k) && t.cid.some(c => c !== t.own));
    chk(foreign.length === 2, `pair ${X.pair}: ${foreign.length} chromatids carry a swapped section, not 2`);
    if(foreign.length === 2){
      const [a, b] = foreign;
      chk(a.k !== b.k, `pair ${X.pair}: sisters swapped sections with each other`);
      /* the two that swapped are the ones lying next to each other in the pair */
      const T0 = S.TL.pair[1] + 0.3;
      atT(T0);
      /* the four lie in a row 2*OFF0 apart: neighbours are one step apart, not three */
      const gap = S.chromatidRod(a.k, a.j, T0).Cc.clone().distanceTo(S.chromatidRod(b.k, b.j, T0).Cc);
      chk(Math.abs(gap - 2*S.OFF0) < 1e-6, `pair ${X.pair}: the chromatids that swap are not next to each other in the row (${(gap/S.OFF0).toFixed(2)} x OFF0)`);
      const segA = [...a.cid].map((c, i) => c !== a.own ? i : -1).filter(i => i >= 0);
      const segB = [...b.cid].map((c, i) => c !== b.own ? i : -1).filter(i => i >= 0);
      chk(segA.join() === segB.join(), `pair ${X.pair}: the swapped sections are not the same piece`);
      chk(segA.every(i => a.cid[i] === b.own) && segB.every(i => b.cid[i] === a.own), `pair ${X.pair}: the sections did not go each way`);
    }
    chk(ks.every(k => S.tubeOf(k, -1).cid.join() === S.tubeOf(k, 1).cid.join() || S.TUBES.filter(t => t.k === k && t.cid.some(c => c !== t.own)).length === 1),
        `pair ${X.pair}: a chromosome has both copies changed`);
  }
  /* before crossing over every chromatid is one colour; after, it shows */
  atT(S.TL.cross[0] - 0.05);
  chk(S.TUBES.every(t => t.lastX === 0), 'colours change before crossing over');
  atT(S.TL.cross[1] + 0.05);
  chk(S.TUBES.every(t => t.lastX === 1), 'crossing over is not finished when it should be');

  /* ------------------------------------------------------- first division */
  section('first division');
  const met1 = S.CH[byPart('Lining up')];
  atT(S.TL.cong1[0]);
  chk(!S.ENV[0].mesh.visible || S.ENV[0].op0 < 0.01, 'the pairs leave for the equator before the nuclear membrane has gone');
  atT(met1.T0 + met1.Tlen - 0.01);
  for(let k=0;k<4;k++){
    const c = S.CHROMS[k];
    const xs = [-1, 1].map(j => S.tubeOf(k, j).P.map(p => p.x));
    const mid = [-1, 1].map(j => S.chromatidRod(k, j, S.F.T).Cc.x);
    chk(mid.every(x => Math.sign(x) === c.side), `chromosome ${k} is on the wrong side of the equator at metaphase I`);
    const f = S.FIB.filter(f => f.kind === 'k1')[k];
    const pole = S.F.poles[c.side > 0 ? 1 : 0];
    chk(f.on && f.a.distanceTo(pole) < 1e-9 && f.b.distanceTo(S.F.fr[k].C) < 1e-9,
        `chromosome ${k} is not held by one fibre from the pole on its own side`);
    chk(Math.abs(Math.abs(S.F.fr[k].C.x) - S.HW) < 1e-6, `chromosome ${k} is not beside the equator, against its partner`);
  }
  let back1 = 0, sisters = 0;
  const lastX = {};
  for(let T=met1.T0 + met1.Tlen; T<=S.SPLIT1; T+=0.1){
    atT(T);
    for(let k=0;k<4;k++){
      const x = S.CHROMS[k].side*S.F.fr[k].C.x;
      if(k in lastX && x < lastX[k] - 1e-9) back1++;
      lastX[k] = x;
      const a = S.chromatidRod(k, -1, T).Cc.clone(), b = S.chromatidRod(k, 1, T).Cc.clone();
      if(Math.abs(a.distanceTo(b) - 2*S.OFF0) > 1e-6) sisters++;
    }
  }
  chk(back1 === 0, `a chromosome moves back towards the middle during the first division (${back1})`);
  chk(sisters === 0, `the copies of a chromosome come apart during the first division (${sisters})`);
  /* after: two cells, one of each pair in each, with different mixes */
  atT(S.SPLIT1 + 0.5);
  const mixes = [];
  for(const sx of [-1, 1]){
    const inCell = S.TUBES.filter(t => t.P.every(p => S.cellSdf(p.y, Math.hypot(p.x - sx*S.D1, p.z), S.state2(S.F.T)) < 0));
    const ks = [...new Set(inCell.map(t => t.k))];
    chk(inCell.length === 4 && ks.length === 2 && new Set(ks.map(pairOf)).size === 2,
        `cell ${sx} does not hold both copies of exactly one chromosome of each pair`);
    mixes.push(ks.map(k => S.CHROMS[k].from + ':' + pairOf(k)).sort().join());
  }
  chk(mixes[0] !== mixes[1], 'the two cells after the first division have the same mix');
  chk(S.CHROMS.filter(c => c.side < 0).map(c => c.from).sort().join() === 'hisFather,hisMother',
      'the first division gives one cell all of his mother\'s chromosomes: the mix is not shown');
  const vol = S2 => { const L = S.lobeRange(S2), n = 400; let v = 0;
    for(let i=0;i<n;i++){ const x = L.x0 + (L.x1 - L.x0)*(i + 0.5)/n; v += Math.PI*S.rhoAt(x, S2)**2*(L.x1 - L.x0)/n; } return v; };
  const V0 = 2*vol(S.state1(0));
  let dBack = 0;
  for(const st of [S.state1, S.state2]){ let ld = -1; for(let T=0; T<=Tend; T+=0.02){ const d = st(T).d; if(d < ld - 1e-9) dBack++; ld = d; } }
  chk(dBack === 0, `the two halves of a dividing cell move back towards each other (${dBack} steps)`);
  chk(Math.abs(vol(S.state1(S.SPLIT1))/V0 - 0.5) < 0.005, `after the first division each cell should be half the volume: ${(vol(S.state1(S.SPLIT1))/V0).toFixed(3)}`);

  /* ------------------------------------------------------- second division */
  section('second division');
  atT(S.TL.ana2[0] - 0.01);
  for(let k=0;k<4;k++){
    chk(Math.abs(S.F.fr[k].C.y) < 1e-9, `chromosome ${k} is not on its cell's equator at metaphase II`);
    chk(Math.abs(S.F.fr[k].C.x - S.CHROMS[k].side*S.D1) < 2, `chromosome ${k} is not in its own cell at metaphase II`);
    for(const j of [-1, 1]){
      const cc = S.chromatidRod(k, j, S.F.T).Cc;
      chk(Math.sign(cc.y) === j, `copy ${j} of chromosome ${k} does not face its own pole`);
      const f = S.FIB.filter(f => f.kind === 'k2')[2*k + (j > 0 ? 1 : 0)];
      chk(f.on && f.b.distanceTo(cc) < 1e-9 && Math.sign(f.a.y) === j && Math.abs(f.a.x - S.CHROMS[k].side*S.D1) < 1e-9,
          `copy ${j} of chromosome ${k} is not held by a fibre from its own pole in its own cell`);
    }
  }
  let back2 = 0;
  const lastY = {};
  for(let T=S.TL.ana2[0]; T<=S.TL.decondense[0]; T+=0.1){
    atT(T);
    for(let k=0;k<4;k++) for(const j of [-1, 1]){
      const y = j*S.chromatidRod(k, j, T).Cc.y, key = k + ':' + j;
      if(key in lastY && y < lastY[key] - 1e-9) back2++;
      lastY[key] = y;
    }
  }
  chk(back2 === 0, `a copy moves back towards the middle during the second division (${back2})`);

  /* ------------------------------------------------------- the gametes */
  section('the four gametes');
  atT(Tend);
  const S2 = S.state2(Tend);
  chk(!S.lobeRange(S2).open, 'the second division has not split the cells');
  chk(Math.abs(vol(S2)/V0 - 0.25) < 0.005, `each gamete should be a quarter of the volume: ${(vol(S2)/V0).toFixed(3)}`);
  chk(S.GAMETES.length === 4, 'there are not four gametes');
  const sigs = [];
  for(const g of S.GAMETES){
    const c = g.env.centre;
    chk(Math.abs(c.x - g.sx*S.D1) < 1e-9 && Math.abs(c.y - g.j*S2.d) < 1e-9, `gamete ${g.sx},${g.j}'s nucleus is not in the middle of its cell`);
    const held = S.TUBES.filter(t => t.P.every((p, i) => p.distanceTo(c) + t.R[i] < S.NUC_G));
    chk(held.length === 2 && new Set(held.map(t => pairOf(t.k))).size === 2,
        `gamete ${g.sx},${g.j} does not hold one chromatid of each pair in its nucleus (${held.length})`);
    sigs.push(held.map(sig).sort().join('|'));
    chk(S.MITO.filter(o => Math.sign(o.pos.x) === g.sx && Math.sign(o.pos.y) === g.j).length === S.N_MITO/4,
        `gamete ${g.sx},${g.j} does not get a quarter of the mitochondria`);
  }
  chk(new Set(sigs).size === 4, `the four gametes are not all different: ${sigs.join('  ')}`);
  for(let k=0;k<4;k++){
    const gs = [-1, 1].map(j => S.GAMETES.findIndex(g => g.sx === S.CHROMS[k].side && g.j === j));
    chk(gs[0] !== gs[1] && gs.every(i => i >= 0), `the two copies of chromosome ${k} do not go to different gametes`);
  }

  /* ------------------------------------------------- inside the membrane */
  section('everything stays inside the cells');
  let outC = 0, outF = 0, outO = 0, crossMid = 0;
  for(let T=0; T<=Tend; T+=0.25){
    atT(T);
    for(const tb of S.TUBES) for(let i=0;i<=S.NS;i+=6) if(tb.R[i] > 0 && S.cellsSdf(tb.P[i], T) > -tb.R[i]) outC++;
    for(const f of S.FIB) if(f.on && (S.cellsSdf(f.a, T) > -0.03 || S.cellsSdf(f.b, T) > -0.03)) outF++;
    for(const o of S.MITO) if(S.cellsSdf(o.pos, T) > -0.05) outO++;
    for(const g of S.GAMETES){
      if(!g.env.mesh.visible || g.env.op0 < 0.02) continue;
      const a = g.env.g.attributes.position.array;
      for(let i=0;i<a.length;i+=3) if(Math.abs(a[i+1]) < 0.3 || Math.abs(a[i]) < 0.3) crossMid++;
    }
  }
  chk(outC === 0, `${outC} chromosome points are outside the membrane`);
  chk(outF === 0, `${outF} spindle fibre ends are outside the membrane`);
  chk(outO === 0, `${outO} mitochondrion positions are outside the membrane`);
  chk(crossMid === 0, `${crossMid} vertices of a new nucleus lie across the middle of a cell`);

  /* the whole cell is in view where the story is about the whole cell */
  const wholeFrom = {'Lining up':6, 'First division':0, 'Second division':0, 'Four gametes':0};
  for(const p in wholeFrom){
    const i = byPart(p);
    enter(i);
    let off = 0, worst = '';
    for(let tt=wholeFrom[p]; tt<=S.CH[i].len; tt+=0.25){
      S.frame(tt);
      const T = S.F.T, ext = [];
      if(T < S.SPLIT1){
        const St = S.state1(T), L = S.lobeRange(St);
        let rmax = 0; for(let n=0;n<=40;n++) rmax = Math.max(rmax, S.rhoAt(L.x0 + (L.x1 - L.x0)*n/40, St));
        ext.push(new V3(L.x0, 0, 0), new V3(-L.x0, 0, 0), new V3(0, rmax, 0), new V3(0, -rmax, 0), new V3(-St.d, rmax, 0), new V3(St.d, -rmax, 0));
      } else {
        const St = S.state2(T), L = S.lobeRange(St);
        let rmax = 0; for(let n=0;n<=40;n++) rmax = Math.max(rmax, S.rhoAt(L.x0 + (L.x1 - L.x0)*n/40, St));
        for(const sx of [-1, 1]) ext.push(new V3(sx*S.D1, L.x0, 0), new V3(sx*S.D1, -L.x0, 0), new V3(sx*(S.D1 + rmax), 0, 0),
          new V3(sx*(S.D1 + rmax), sx*St.d, 0), new V3(sx*S.D1, St.d, rmax));
      }
      for(const e of ext){
        const q = S.toScreen(e);
        if(!(q.ok && q.x > 0 && q.x < S.VW && q.y > 0 && q.y < S.VH)){ off++; worst = `${tt.toFixed(2)} s (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`; break; }
      }
    }
    chk(off === 0, `"${p}": part of the cell is off screen on ${off} frames, e.g. at ${worst}`);
  }

  /* ------------------------------------------------------ fertilisation */
  section('fertilisation');
  const fc = byPart('Fertilisation');
  enter(fc);
  S.frame(S.FT.enter[1] + 0.01);
  chk(S.FS.head.length() + 0.8 < S.EGG_R, 'the sperm\'s head is not inside the egg once it has entered');
  S.frame(0.5);
  chk(S.FS.head.length() > S.EGG_R + 0.8, 'the sperm starts inside the egg');
  let eggOut = 0;
  for(let t=0; t<=S.CH[fc].len; t+=0.25){
    S.frame(t);
    for(const tb of S.FCHR) if(tb.mesh.visible) for(let i=0;i<=S.NS;i+=10) if(tb.P[i].length() > S.EGG_R) eggOut++;
  }
  chk(eggOut === 0, `${eggOut} chromosome points are outside the egg`);
  S.frame(S.CH[fc].len);
  chk(S.FCHR.length === S.FIG.chrom, `the zygote has ${S.FCHR.length} chromosomes, not ${S.FIG.chrom}`);
  chk(S.FCHR.every(tb => tb.P.every((p, i) => p.distanceTo(S.MEET) + tb.R[i] < S.ZYG_R)), 'a chromosome is not inside the zygote\'s nucleus');
  for(const p of [0, 1]){
    const inPair = S.FCHR.filter(f => f.pair === p);
    chk(inPair.length === 2 && new Set(inPair.map(f => f.from)).size === 2, `pair ${p} is not one from the sperm and one from the egg`);
  }
  const fromSperm = S.FCHR.filter(f => f.from === 'sperm').map(f => sig(f)).sort().join('|');
  chk(fromSperm === sigs[S.GAMETES.indexOf(S.SPERM_FROM)], 'the sperm\'s chromosomes are not one of the four gametes\'');
  chk(S.FCHR.filter(f => f.from === 'egg').every(f => f.cid.every(c => c >= 2)), 'the egg carries one of the man\'s chromosomes');
  chk(S.FN.zyg.visible && !S.FN.egg.visible && !S.FN.sperm.visible, 'the two nuclei have not become one');

  /* ------------------------------------------------- the diagram, the numbers */
  section('the diagram and every figure a caption quotes');
  let stepBack = 0, lastStep = -1;
  for(let T=0; T<=Tend; T+=0.1){ const s = S.stepAt(T); if(s < lastStep) stepBack++; lastStep = s; }
  chk(stepBack === 0 && S.stepAt(Tend) === 3 && S.stepAt(0) === 0, 'the diagram\'s steps do not run in order through the story');
  chk(S.stepAt(S.TL.ana1[0]) === 1 && S.stepAt(S.TL.ana2[0]) === 2, 'the diagram is on the wrong step during a division');
  chk(S.FIG.half*2 === S.FIG.chrom && S.FIG.humanHalf*2 === S.FIG.human && S.FIG.human === 46, 'the halves do not add up');
  chk(S.FIG.gametes === 4 && S.FIG.egg === Math.round(S.SIZE_UM.egg/S.SIZE_UM.spermHead), 'a figure is not worked out');
  const allowed = new Set(['1','2','3', String(S.FIG.chrom), String(S.FIG.pairs), String(S.FIG.half), String(S.FIG.human),
    String(S.FIG.humanHalf), String(S.FIG.humanPairs), String(S.FIG.gametes), String(S.FIG.egg)]);
  const text = C => plain([C.title, C.text, C.look, C.scale, ...C.terms.flat()].filter(Boolean).join(' '));
  for(let i=0;i<S.CH.length;i++){
    const nums = text(S.CH[i]).match(/\d+(\.\d+)?/g) || [];
    for(const n of nums) chk(allowed.has(n), `chapter ${i} quotes ${n}, which nothing works out`);
  }
  for(const st of S.STEPS) for(const n of (st.note.match(/\d+/g) || [])) chk(allowed.has(n), `the diagram quotes ${n}`);
  chk(text(S.CH[byPart('Fertilisation')]).includes(S.FIG.humanHalf + ' + ' + S.FIG.humanHalf + ' = ' + S.FIG.human), 'the fertilisation sum is missing');

  /* ---------------------------------------------------- labels in view */
  section('labels are on screen while they show');
  let shown = 0;
  for(let ch=0; ch<S.CH.length; ch++){
    enter(ch);
    for(const L of S.CH[ch].labels){
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
  const html = read('meiosis-3d-story.html');
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
