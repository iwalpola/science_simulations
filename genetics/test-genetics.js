/* ===========================================================================
   Tests for cell-to-dna-3d-story.html.   Run with:

       node test-genetics.js

   It runs the page the way test-render.js runs the particle scenes: the real
   three.js the page loads (its URL is read out of the page's own <script
   src>), with only WebGLRenderer and PMREMGenerator stubbed out, and every
   chapter driven frame by frame through frame(t).

   On top of "nothing throws, nothing goes NaN", it checks that the picture is
   what the captions say it is:

     - 46 chromosomes in 23 pairs; both of a pair are the same shape; every
       one sits inside the nucleus to start with; none overlap in the
       karyotype, and the two of a pair sit side by side
     - chromosome sizes follow the table, and the gold band sits at the
       CFTR gene's real position on chromosome 7
     - the DNA leaves the chromosome at that band, from inside the chromatid,
       and the coiled fibre joins the helix where the helix begins
     - every base pair is complementary (A-T, C-G); the helix turns once
       every 10.5 base pairs and rises 0.34 nm per pair, in its own units
     - unrolled, the ladder is flat, faces the camera, has its rungs level
       on screen and strand 1 on the left
     - the cut from chromosome 7 in the karyotype to the big chromosome 7 is
       seamless: it is the same size on screen either side of the fade
     - every number a caption quotes is the one FIG works out from the tables
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
  /* the particle tests keep a copy already; use theirs if it is there */
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
    const grad = {addColorStop(){}};
    el.getContext = () => new Proxy({
      measureText(s){ return {width:String(s).length*8}; },
      createLinearGradient(){ return grad; }, createRadialGradient(){ return grad; }
    }, {get(t, k){ return k in t ? t[k] : () => {}; }, set(){ return true; }});
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
  const expose = ['CH','frame','enterChapter','camera','renderer','CAM','CHROMS','TYPES','CHR_OBJS','KARY',
    'NUC_R','KK','KT','S_NUC','BIG','GENE','GENE_FRAC','big','BIGC','W2T','W2K','FIBRE','FIBRE_START','FIB_N',
    'L_JOIN','L_FLAT','L_END','axisAt','BPS','NBP','FLAT0','FLAT','DTH','RISE','SHAPE','dnaShape','GENE_BP',
    'FIG','PAIR','ALL_LABELS','LAYOUT','toScreen','karyU','chromatidRadius','chromatidOffset','scene',
    'SIG0','SIGMAX','TURN_BP','BP_NM','DNA_WIDTH_NM','GENES_IN_GENOME','PICK','VW','VH','W1','W2'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {addEventListener(){}, innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  let S;
  try {
    S = new Function('THREE','document','window','requestAnimationFrame','performance',
      js + '\nreturn {' + expose + '};')(THREE, dom, win, () => 0, {now(){ return 0; }});
  } catch(e){
    chk(false, 'the page threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 5).join('\n'));
    return;
  }
  chk(true, 'the page loads');
  const V3 = THREE.Vector3;

  /* ---------------------------------------------------------- every frame */
  section('every frame of every chapter');
  const instanced = [];
  S.scene.traverse(o => { if(o.isInstancedMesh) instanced.push(o); });
  for(let ch=0; ch<S.CH.length; ch++){
    S.enterChapter(ch);
    const before = S.renderer.__renders;
    let bad = 0, worlds = new Set();
    try {
      for(let t=0; t<=S.CH[ch].len + 1; t += 1/30){
        const shot = S.frame(t);
        worlds.add(shot.world);
        const c = S.camera.position;
        if(![c.x, c.y, c.z].every(isFinite)) bad++;
      }
    } catch(e){
      chk(false, `chapter ${ch} (${S.CH[ch].part}) threw: ${e.message}`);
      console.log('      ' + (e.stack || '').split('\n').slice(1, 4).join('\n      '));
      continue;
    }
    chk(bad === 0, `chapter ${ch}: the camera went non-finite on ${bad} frames`);
    chk(S.renderer.__renders > before, `chapter ${ch} drew nothing`);
    for(const m of instanced){
      const a = m.instanceMatrix.array;
      chk(a.slice(0, m.count*16).every(isFinite), `chapter ${ch}: an instance matrix went non-finite`);
    }
    console.log(`      ${ch} ${S.CH[ch].part.padEnd(11)} ${[...worlds].join(' → ')}`);
  }

  /* ------------------------------------------------------- chromosomes */
  section('chromosomes');
  chk(S.CHROMS.length === 23, `expected 23 kinds of chromosome, got ${S.CHROMS.length}`);
  chk(S.CHR_OBJS.length === 46, `expected 46 chromosomes, got ${S.CHR_OBJS.length}`);
  for(let ty=0; ty<23; ty++){
    const a = S.CHR_OBJS[2*ty], b = S.CHR_OBJS[2*ty+1];
    chk(a.ty === ty && b.ty === ty, `chromosomes ${2*ty} and ${2*ty+1} are not both of kind ${S.CHROMS[ty].n}`);
    chk(a.g.children[0].geometry === b.g.children[0].geometry, `the two of pair ${S.CHROMS[ty].n} are not the same shape`);
    const L = S.TYPES[ty].L;
    chk(Math.abs(L - S.CHROMS[ty].mb*S.KK) < 1e-9, `chromosome ${S.CHROMS[ty].n} is not drawn to its length`);
    chk(Math.abs(S.TYPES[ty].p/L - S.CHROMS[ty].p) < 1e-9, `chromosome ${S.CHROMS[ty].n}'s centromere is in the wrong place`);
  }
  chk(S.CHROMS.filter(c => c.n === 'X').length === 1 && !S.CHROMS.some(c => c.n === 'Y'),
      'the cell is meant to be female: one kind of X, no Y');

  /* inside the nucleus to start with */
  S.enterChapter(1); S.frame(6);
  let outside = 0;
  const box = new THREE.Box3();
  for(const o of S.CHR_OBJS){
    o.g.updateMatrixWorld(true);
    o.g.traverse(m => {
      if(!m.isMesh) return;
      const p = m.geometry.attributes.position, v = new V3();
      for(let i=0;i<p.count;i+=7){ v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if(v.length() > S.NUC_R) outside++; }
    });
  }
  chk(outside === 0, `${outside} chromosome vertices poke out of the nucleus`);

  /* the karyotype: no overlaps, pairs side by side */
  S.enterChapter(3); S.frame(0.5);
  const boxes = S.CHR_OBJS.map(o => { o.g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o.g); });
  let overlaps = 0;
  for(let i=0;i<46;i++) for(let j=i+1;j<46;j++){
    const a = boxes[i], b = boxes[j];
    if(a.min.x < b.max.x - 1e-6 && b.min.x < a.max.x - 1e-6 && a.min.y < b.max.y - 1e-6 && b.min.y < a.max.y - 1e-6) overlaps++;
  }
  chk(overlaps === 0, `${overlaps} pairs of chromosomes overlap in the karyotype`);
  for(let ty=0; ty<23; ty++){
    const a = S.CHR_OBJS[2*ty].g.position, b = S.CHR_OBJS[2*ty+1].g.position;
    chk(Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.x - a.x - S.KARY.IN_PAIR) < 1e-6,
        `pair ${S.CHROMS[ty].n} is not lined up side by side`);
  }
  chk(S.CHR_OBJS.every(o => o.g.quaternion.angleTo(new THREE.Quaternion()) < 1e-6), 'a chromosome in the karyotype is not upright');

  /* ---------------------------------------------------- the gene's band */
  section('the gene and the band');
  chk(S.BIG.n === S.GENE.chrom, 'the big chromosome is not the gene\'s chromosome');
  chk(Math.abs(S.GENE_FRAC - S.GENE.at/S.BIG.mb) < 1e-12, 'the band is not at the gene\'s position');
  chk(S.GENE_FRAC > S.BIG.p, 'CFTR is on the long arm (7q31): the band should be below the centromere');
  const bandY = S.big.p - S.GENE_FRAC*S.big.L;
  chk(Math.abs(S.big.band.y - bandY) < 1e-9, 'the big chromosome\'s band is not where the gene is');
  /* the band really is gold in the vertex colours, at that height and nowhere else */
  const geo = S.big.group.children[1].geometry, col = geo.attributes.color, pos = geo.attributes.position;
  let goldIn = 0, goldOut = 0;
  for(let i=0;i<pos.count;i++){
    const gold = col.getX(i) > col.getZ(i);
    const near = Math.abs(pos.getY(i) - bandY) < 0.5*S.big.band.w;
    if(gold && near) goldIn++;
    if(gold && !near) goldOut++;
  }
  chk(goldIn > 0 && goldOut === 0, `the gold band is in the wrong place (${goldIn} in, ${goldOut} out)`);

  /* the DNA comes out of the band, from inside the right-hand chromatid */
  const local = S.FIBRE_START.clone().sub(S.BIGC);
  const axisX = S.chromatidOffset(local.y, S.big.p, S.big.q, S.W2T);
  const r = S.chromatidRadius(local.y, S.big.p, S.big.q, S.W2T);
  chk(Math.abs(local.y - bandY) < 1e-9, 'the DNA does not leave the chromosome at the band');
  chk(Math.hypot(local.x - axisX, local.z) < r, 'the DNA starts outside the chromatid, in mid-air');
  chk(S.FIBRE.P[0].distanceTo(S.FIBRE_START) < 1e-6, 'the fibre does not start where the DNA leaves');
  const join = S.axisAt(S.L_JOIN).p;
  chk(S.FIBRE.P[S.FIB_N].distanceTo(join) < 1e-6, 'the coiled fibre does not end where the helix begins');
  chk(Math.abs(S.FIBRE.R[S.FIB_N] - S.SIG0) < 1e-9, 'the fibre is not as thick as the helix where they meet');

  /* --------------------------------------------------------- the helix */
  section('the double helix');
  let notPair = 0;
  for(const b of S.BPS) if(S.PAIR[b.b1] !== b.b2 || !'ATCG'.includes(b.b1)) notPair++;
  chk(notPair === 0, `${notPair} base pairs are not complementary`);
  chk(S.PAIR.A === 'T' && S.PAIR.T === 'A' && S.PAIR.C === 'G' && S.PAIR.G === 'C', 'the pairing rule is wrong');
  chk(Math.abs(S.DTH - 2*Math.PI/10.5) < 1e-12 && S.TURN_BP === 10.5, 'the helix does not turn once every 10.5 base pairs');
  chk(Math.abs(S.RISE - 0.34) < 1e-12, 'the rise per base pair is not 0.34 of the radius (0.34 nm on a 1 nm radius)');
  let badRise = 0;
  for(let i=1;i<S.NBP;i++) if(Math.abs((S.BPS[i].l - S.BPS[i-1].l) - S.RISE*S.BPS[i-1].s) > 1e-9) badRise++;
  chk(badRise === 0, `${badRise} base pairs are not 0.34 sigma apart`);
  chk(S.BPS.every((b, i) => i === 0 || b.s >= S.BPS[i-1].s - 1e-12), 'the magnification shrinks somewhere down the helix');
  chk(Math.abs(S.BPS[S.NBP-1].s - S.SIGMAX) < 1e-9, 'the bottom of the helix is not at full magnification');
  chk(S.GENE_BP.g1 < S.FLAT0 - 8, 'the gene runs into the stretch that gets unrolled');
  const sh0 = S.dnaShape(0);
  let badTurn = 0;
  for(let i=1;i<S.FLAT0 - 8;i++) if(Math.abs(sh0.a[i] - sh0.a[i-1] - S.DTH) > 1e-9) badTurn++;
  chk(badTurn === 0, 'twisted, the helix does not turn by 2pi/10.5 per base pair');
  console.log(`      ${S.NBP} base pairs drawn, ${S.NBP - S.FLAT0} on the flat stretch, gene ${S.GENE_BP.g0}-${S.GENE_BP.g1}`);

  /* ---------------------------------------------------- unrolled flat */
  section('the flat ladder');
  const bases = S.CH.findIndex(c => c.part === 'Bases');
  S.enterChapter(bases);
  S.frame(S.CH[bases].len);
  const sh = S.SHAPE;
  chk(sh.u === 1, 'the ladder is not fully unrolled by the end of the Bases chapter');
  const view = new V3(); S.camera.getWorldDirection(view);
  let notFlat = 0, notLevel = 0, wrongSide = 0;
  for(let i=S.FLAT0;i<S.NBP;i++){
    const d = new V3().subVectors(sh.P2[i], sh.P1[i]).normalize();
    if(Math.abs(d.dot(S.FLAT.dir) + 1) > 1e-6) notFlat++;                // strand 1 to 2 is -dir
    if(Math.abs(d.dot(view)) > 0.02) notFlat++;
    const a = S.toScreen(sh.P1[i]), b = S.toScreen(sh.P2[i]);
    if(Math.abs(b.y - a.y) > 0.03*Math.abs(b.x - a.x)) notLevel++;
    if(!(a.x < b.x)) wrongSide++;
  }
  chk(notFlat === 0, `${notFlat} rungs of the flat ladder are not parallel or not facing the camera`);
  chk(notLevel === 0, `${notLevel} rungs are not level on screen`);
  chk(wrongSide === 0, `strand 1 is not on the left for ${wrongSide} rungs`);
  for(const k of ['at','cg']){
    const i = S.PICK[k];
    chk(i >= S.FLAT0 && i < S.NBP, `the ${k} pair the labels point at is off the flat stretch`);
    chk((k === 'at' ? 'AT' : 'CG').includes(S.BPS[i].b1), `the ${k} label points at a ${S.BPS[i].b1}-${S.BPS[i].b2} pair`);
  }

  /* ----------------------------------------------- the seamless cut */
  section('the cut from the karyotype to the big chromosome');
  const chIdx = S.CH.findIndex(c => c.part === 'Chromosome');
  S.enterChapter(chIdx);
  const cut = S.CH[chIdx].shots[0].until;
  S.frame(cut - 0.01);
  const k7 = 2*S.CHROMS.indexOf(S.BIG), o7 = S.CHR_OBJS[k7], t7 = S.TYPES[o7.ty];
  const top7 = S.toScreen(o7.g.localToWorld(new V3(0, t7.p, 0))), bot7 = S.toScreen(o7.g.localToWorld(new V3(0, -t7.q, 0)));
  S.frame(cut + 0.01);
  const topB = S.toScreen(new V3(0, S.big.p, 0).add(S.BIGC)), botB = S.toScreen(new V3(0, -S.big.q, 0).add(S.BIGC));
  const hA = bot7.y - top7.y, hB = botB.y - topB.y;
  chk(Math.abs(hA - hB)/hA < 0.02, `chromosome 7 is ${hA.toFixed(0)} px tall before the cut and ${hB.toFixed(0)} px after`);
  chk(Math.abs(top7.y - topB.y) < 4, 'chromosome 7 jumps up or down across the cut');

  /* --------------------------------------------------- the numbers */
  section('every figure a caption quotes');
  const sum = S.CHROMS.reduce((s, c) => s + c.mb, 0);
  chk(S.FIG.total === 46 && S.FIG.kinds === 23, '46 chromosomes in 23 pairs');
  chk(S.FIG.genomeBn === (sum/1e3).toFixed(1), 'the genome size is not the sum of the chromosomes');
  chk(S.FIG.metres === Math.round(2*sum*1e6*0.34e-9), 'the metres of DNA per nucleus is not 2 x genome x 0.34 nm');
  chk(Math.abs(parseFloat(S.FIG.chr7cm) - S.BIG.mb*1e6*0.34e-9*100) < 0.06, 'chromosome 7\'s length of DNA is wrong');
  chk(S.FIG.geneDrawn === S.GENE_BP.g1 - S.GENE_BP.g0 + 1, 'the drawn gene length is not the gene drawn');
  chk(S.FIG.magnify === Math.round(S.SIGMAX/S.SIG0), 'the magnification quoted is not the one drawn');
  const text = i => plain(S.CH[i].title + ' ' + S.CH[i].text + ' ' + (S.CH[i].look||'') + ' ' + (S.CH[i].scale||''));
  const byPart = p => S.CH.findIndex(c => c.part === p);
  chk(text(byPart('Nucleus')).includes(String(S.FIG.total)), 'the nucleus chapter does not quote 46');
  chk(text(byPart('Pairs')).includes(S.FIG.kinds + ' pairs'), 'the pairs chapter does not quote 23 pairs');
  chk(text(byPart('Chromosome')).includes(S.FIG.chr7cm + ' cm'), 'the chromosome chapter quotes a different length of DNA');
  chk(text(byPart('Chromosome')).includes(S.BIG.mb + ' million'), 'the chromosome chapter quotes a different size');
  chk(text(byPart('DNA')).includes(S.FIG.magnify + ' times'), 'the DNA chapter quotes a different magnification');
  chk(text(byPart('Gene')).includes('has ' + S.FIG.geneDrawn + '.'), 'the gene chapter quotes a different number of base pairs drawn');
  chk(text(byPart('Gene')).includes(S.FIG.geneKbp + ' 000'), 'the gene chapter quotes a different real gene length');
  const g = text(byPart('Genome'));
  chk(g.includes(S.FIG.genomeBn + ' billion'), 'the genome chapter quotes a different genome size');
  chk(g.includes(S.FIG.cellBn + ' billion'), 'the genome chapter quotes a different size per nucleus');
  chk(g.includes(S.FIG.metres + ' metres'), 'the genome chapter quotes a different length of DNA');
  /* no stray figures: every number in the captions is one of these */
  const allowed = new Set(['46','23','7','3','2','1','10.5','2003', String(S.BIG.mb), S.FIG.chr7cm, String(S.FIG.magnify),
    String(S.FIG.geneKbp), '000', String(S.FIG.geneDrawn), S.FIG.genomeBn, String(S.FIG.cellBn), String(S.FIG.metres),
    String(S.DNA_WIDTH_NM), '20', '20 000']);
  for(let i=0;i<S.CH.length;i++){
    const nums = text(i).match(/\d+(\.\d+)?/g) || [];
    for(const n of nums) chk(allowed.has(n), `chapter ${i} quotes ${n}, which nothing works out`);
  }
  console.log(`      genome ${S.FIG.genomeBn} billion bp, ${S.FIG.metres} m per nucleus, chromosome 7 ${S.FIG.chr7cm} cm`);

  /* ---------------------------------------------------- labels in view */
  section('labels are on screen while they show');
  let shown = 0;
  for(let ch=0; ch<S.CH.length; ch++){
    S.enterChapter(ch);
    for(const L of S.CH[ch].labels){
      if(L.screen) continue;
      const t = L.t1 ? L.t1 - 0.6 : S.CH[ch].len;
      const shot = S.frame(t);
      if(shot.world !== L.world) continue;
      if(L.op && L.op(t) < 0.5) continue;
      shown++;
      for(const p of L.at()){
        const q = S.toScreen(p);
        chk(q.ok && q.x > 0 && q.x < S.VW && q.y > 0 && q.y < S.VH,
            `chapter ${ch}: "${plain(L.text)}" points at something off screen (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
      }
      const lay = S.LAYOUT.find(x => x.L === L);
      chk(!!lay, `chapter ${ch}: "${plain(L.text)}" was not laid out`);
    }
  }
  console.log(`      ${shown} labels checked`);
}

(async function main(){
  const html = read('cell-to-dna-3d-story.html');
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
