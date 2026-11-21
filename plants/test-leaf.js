/* ===========================================================================
   Tests for leaf-photosynthesis-3d-story.html.   Run with:

       node test-leaf.js

   It runs the page the way the genetics tests do: the real three.js the page
   loads (its URL is read out of the page's own <script src>), and the shared
   cell_biology/organelles.js, with only WebGLRenderer and PMREMGenerator
   stubbed out, and every chapter driven frame by frame through frame(t).

   On top of "nothing throws, nothing goes NaN", it checks the leaf is a leaf:

     - the layers are in the right order and the leaf is about 0.2 mm thick
     - palisade cells are tall columns, upright, side by side and not
       overlapping, all in the palisade layer and clear of the vein
     - spongy cells are in the spongy layer, and that layer has far more air
       in it than the palisade layer (measured, not typed)
     - every chloroplast is inside its own cell; palisade cells have more
       than spongy cells; the epidermis has none except in guard cells
     - stomata are on the lower surface only, never over the vein; guard
       cells swell and the pore widens when they open; one stoma is cut
       through by the front face, as on a slide
     - the vein has its xylem above its phloem, everything inside the sheath
     - every way gas goes was searched through air: starts outside under the
       leaf, goes up through a pore, ends at a palisade cell, never enters a
       cell; and gas stops moving while the stomata are shut
     - the palisade layer absorbs most of the light; the epidermis none
     - the equation balances, and the cell's flows use its coefficients;
       molecules in the cell never cross the vacuole
     - the limiting-factor model: the rate is set by the scarcest factor,
       raising another changes nothing, light falls as 1/d^2, and moving a
       slider does not make the flow jump
     - every number a caption quotes is one of FIG's; energy is transferred,
       never produced; the AQA key words are all taught
     - every label's anchors are on screen, inside the stage and clear of the
       nav, the key and the equation bar, and labels do not overlap
     - the catalogue lists the page, and every entry's path exists

   It cannot tell whether anything LOOKS right. Nothing is rasterised.
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
const PAGE = 'leaf-photosynthesis-3d-story.html';

/* ---------------------------------------------------------------- three.js */
function threeUrlOf(html){
  const m = html.match(/<script src="([^"]*three[^"]*\.js)"><\/script>/);
  if(!m) throw new Error('no three.js <script src> found in the page');
  return m[1];
}
async function ensureThree(url){
  const name = url.split('/').slice(-3).join('-').replace(/[^\w.-]/g, '_');
  for(const dir of ['.three-cache', '../genetics/.three-cache', '../particles/.three-cache'].map(d => path.join(__dirname, d))){
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
  const vm = require('vm');
  const exports = {};
  const sandbox = {module:{exports}, exports, console};
  sandbox.self = sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, {filename:'three.js'});
  for(const cand of [sandbox.exports, sandbox.module.exports, sandbox.THREE])
    if(cand && cand.Vector3) return cand;
  return null;
}
function loadOrganelles(THREE, html){
  const m = html.match(/<script src="([^"]*organelles\.js)"><\/script>/);
  if(!m) return undefined;
  const win = {};
  new Function('THREE', 'window', read(m[1]))(THREE, win);
  return win.Organelles;
}

/* ------------------------------------------------------- just enough DOM */
const plain = s => String(s).replace(/<[^>]+>/g, '');
const STAGE_W = 920, STAGE_H = 720;      // a 1280 x 720 screen less the 360 px panel
function makeDom(){
  const els = new Map();
  function mkEl(id){
    const el = {
      id, width:300, height:150, innerHTML:'', textContent:'', hidden:false, value:undefined,
      clientWidth:id === 'stage' ? STAGE_W : 1280, clientHeight:STAGE_H,
      style:{}, children:[], dataset:{},
      classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }},
      addEventListener(){}, removeEventListener(){}, setPointerCapture(){},
      appendChild(c){ this.children.push(c); }, remove(){},
      querySelectorAll(){ return []; }, querySelector(){ return null; },
      setAttribute(){}, getAttribute(){ return null; }
    };
    /* a label's size, roughly as the browser lays it out: 16 px bold text,
       with an optional 12.5 px second line */
    Object.defineProperty(el, 'offsetWidth', {get(){
      const parts = String(this.innerHTML).split(/<span class="sub">/);
      const main = plain(parts[0]).length*9.2, sub = parts[1] ? plain(parts[1]).length*6.9 : 0;
      return Math.round(Math.max(main, sub)) + 4;
    }});
    Object.defineProperty(el, 'offsetHeight', {get(){ return /class="sub"/.test(this.innerHTML) ? 40 : 22; }});
    const grad = {addColorStop(){}};
    el.getContext = () => new Proxy({
      measureText(s){ return {width:String(s).length*8}; },
      createLinearGradient(){ return grad; }, createRadialGradient(){ return grad; }
    }, {get(t, k){ return k in t ? t[k] : () => {}; }, set(){ return true; }});
    return el;
  }
  return {
    els,
    getElementById(id){ if(!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag){ return mkEl(tag); },
    querySelectorAll(){ return []; },
    addEventListener(){}, body:mkEl('body')
  };
}
function stubRenderer(THREE, dom){
  THREE.WebGLRenderer = class {
    constructor(){ this.domElement = dom.createElement('canvas'); this.__renders = 0; this.shadowMap = {}; this.clippingPlanes = []; }
    setPixelRatio(){} setSize(){} setClearColor(){} dispose(){}
    render(){ this.__renders++; }
  };
  THREE.PMREMGenerator = class {
    fromScene(){ return {texture:new THREE.Texture()}; } dispose(){}
  };
}

/* =========================================================================== */
function run(THREE, html){
  const dom = makeDom();
  stubRenderer(THREE, dom);
  const expose = ['CH','CHI','frame','enterChapter','camera','renderer','scene','FIG','Y','UM','BX','BZ','MARGIN','VEIN',
    'PAL','SPO','STO','PALS','SPOS','CHLS','STOMATA','FEAT_CUT','FEAT_VIEW','UPPER','LOWER','BUNDLE','GAS','AIR','AIRGRID',
    'isSolid','inSpongy','inPalisade','inVein','inEpidermis','stomaLocal','guardShape','spoRadius','inColumn','PAL_P',
    'lightLeft','LIGHT_FALL','stomaCycle','stomaCycleInt','SHUT','EQN','FORMULA','MOL','coef','CPATH','UPATH','NITRATE_PATH',
    'inCellCyto','CELL','CY','VAC','SITES','CELL_CHL','CELLS','rateOf','lightIntensity','tempFactor','LF','lfState','lfPhase',
    'lfChange','lfEls','ALL_LABELS','LAYOUT','SCOPE','STATE','toScreen','VW','VH','WL','WB','WC','MOLB','MOLC','LIGHTB',
    'palMesh','chlMesh','gcMesh','searchPath','GRID','BLOCK_O','CELL_O','LEAF','LEAF_VEINS','leafHalfW','PIECE','EL','COL','KEYS'].join(',');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const win = {addEventListener(){}, innerWidth:1280, innerHeight:720, devicePixelRatio:1};
  const ORGS = loadOrganelles(THREE, html);
  let S;
  const t0 = Date.now();
  try {
    S = new Function('THREE','document','window','requestAnimationFrame','performance','Organelles',
      js + '\nreturn {' + expose + '};')(THREE, dom, win, () => 0, {now(){ return 0; }}, ORGS);
  } catch(e){
    chk(false, 'the page threw while loading: ' + e.message);
    console.log((e.stack || '').split('\n').slice(0, 6).join('\n'));
    return;
  }
  console.log('  built in ' + (Date.now() - t0) + ' ms');
  const V3 = THREE.Vector3;
  const fin = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const B = (x, y, z) => new V3(x, y, z).add(S.BLOCK_O);

  /* ---------------------------------------------------------- every frame */
  section('every frame of every chapter');
  let frames = 0, bad = 0;
  const finiteMatrices = m => { const a = m.instanceMatrix.array; for(let i=0;i<m.count*16;i++) if(!Number.isFinite(a[i])) return false; return true; };
  S.CH.forEach((C, ch) => {
    S.enterChapter(ch);
    for(let t=0;t<=C.len + 1e-9;t+=0.25){
      let shot;
      try { shot = S.frame(t); } catch(e){
        bad++; if(bad < 4){ chk(false, C.id + ' t=' + t + ' threw: ' + e.message); console.log((e.stack||'').split('\n').slice(0,4).join('\n')); }
        continue;
      }
      frames++;
      if(!fin(S.camera.position)){ bad++; chk(false, C.id + ' t=' + t + ': camera is not finite'); }
      for(const L of [S.MOLB, S.MOLC]) for(const m of Object.values(L.mesh).concat([L.glu]))
        if(!finiteMatrices(m)){ bad++; chk(false, C.id + ' t=' + t + ': a molecule matrix is not finite'); }
      if(!finiteMatrices(S.LIGHTB.mesh)){ bad++; chk(false, C.id + ' t=' + t + ': a light matrix is not finite'); }
    }
  });
  chk(bad === 0, bad + ' bad frames');
  chk(S.renderer.__renders === frames, 'every frame rendered');
  console.log('  ' + frames + ' frames');
  chk(finiteMatrices(S.palMesh) && finiteMatrices(S.chlMesh) && finiteMatrices(S.gcMesh), 'cell and chloroplast matrices are finite');

  /* ------------------------------------------------------------ the layers */
  section('the layers');
  const Y = S.Y, order = ['le0','le1','sp1','pa1','ue1','cu1'];
  chk(order.every((k, i) => !i || Y[k] > Y[order[i-1]]), 'layers bottom to top: lower epidermis, spongy, palisade, upper epidermis, cuticle');
  const thick = (Y.cu1 - Y.le0)*S.UM;
  chk(thick > 150 && thick < 300, 'a leaf about 0.2 mm thick (' + thick + ' um)');
  chk(Y.pa1 - Y.sp1 > 0.6*(Y.sp1 - Y.le1) && Y.pa1 - Y.sp1 < 1.4*(Y.sp1 - Y.le1), 'palisade and spongy layers of similar depth');
  chk(Y.cu1 - Y.ue1 < Y.ue1 - Y.pa1, 'the cuticle is thinner than the epidermis');

  /* --------------------------------------------------------- the palisade */
  section('palisade cells: tall columns, upright, side by side');
  const P = S.PALS;
  chk(P.length > 200, P.length + ' palisade cells');
  chk(P.every(c => c.bot >= Y.sp1 - 1e-9 && c.top <= Y.pa1 + 1e-9), 'every palisade cell is in the palisade layer');
  chk(P.every(c => Math.hypot(c.x - S.VEIN.x, c.bot - S.VEIN.y) > S.VEIN.r - 0.6*c.r || Math.abs(c.x - S.VEIN.x) > S.VEIN.r), 'no palisade cell sits in the vein');
  const aspect = P.reduce((s, c) => s + c.h/(2*c.r), 0)/P.length;
  chk(aspect > 3, 'columns about ' + aspect.toFixed(1) + ' times as tall as they are wide');
  chk(P.every(c => Math.abs(c.tx) < 0.1 && Math.abs(c.tz) < 0.1), 'all upright');
  let overl = 0, nearest = [];
  P.forEach((c, i) => {
    let best = Infinity;
    P.forEach((o, j) => { if(i !== j){ const d = Math.hypot(c.x - o.x, c.z - o.z); best = Math.min(best, d);
      if(d < c.r + o.r - 0.05 && Math.min(c.top, o.top) > Math.max(c.bot, o.bot)) overl++; } });
    nearest.push(best);
  });
  chk(overl === 0, 'no two palisade cells overlap (' + overl/2 + ' pairs)');
  const gap = nearest.reduce((s, d) => s + d, 0)/nearest.length - 2*S.PAL.r;
  chk(gap > 0 && gap < 0.5, 'packed closely: about ' + (gap*S.UM).toFixed(1) + ' um between neighbours');

  /* ----------------------------------------------------------- the spongy */
  section('spongy mesophyll: loose, with air spaces');
  chk(S.SPOS.length > 150, S.SPOS.length + ' spongy cells');
  chk(S.SPOS.every(c => c.p.y > Y.le1 && c.p.y < Y.sp1), 'every spongy cell centre is in the spongy layer');
  chk(S.SPOS.every(c => Math.hypot(c.p.x - S.VEIN.x, c.p.y - S.VEIN.y) > S.VEIN.r), 'no spongy cell centre in the vein');
  chk(S.SPOS.every(c => !S.STOMATA.some(s => Math.hypot(s.x - c.p.x, s.z - c.p.z) < 1.9 && c.p.y < Y.le1 + 2.6)), 'an air space is left above every stoma');
  chk(S.AIR.spo > S.AIR.pal + 0.15, 'the spongy layer is ' + Math.round(100*S.AIR.spo) + '% air, the palisade ' + Math.round(100*S.AIR.pal) + '%');
  chk(S.AIR.spo > 0.3 && S.AIR.spo < 0.75, 'spongy air fraction is believable');
  chk(S.FIG.spoAir === Math.round(100*S.AIR.spo) && S.FIG.palAir === Math.round(100*S.AIR.pal), 'the caption quotes the measured air fractions');
  chk(S.SPOS.some(c => c.lobes.length >= 3), 'spongy cells reach arms to their neighbours');

  /* ------------------------------------------------------- chloroplasts */
  section('chloroplasts');
  let outside = 0, inEpi = 0;
  S.CHLS.forEach(c => {
    if(c.cell === 'pal'){
      const p = S.PALS[c.ci];
      if(!S.inColumn(Math.hypot(c.p.x - p.x, c.p.z - p.z), c.p.y - p.y, p.r, p.h, S.PAL_P)) outside++;
    } else {
      const s = S.SPOS[c.ci], d = c.p.distanceTo(s.p), n = c.p.clone().sub(s.p).normalize();
      if(d > S.spoRadius(s, n.x, n.y, n.z)) outside++;
    }
    if(c.p.y > Y.pa1 || c.p.y < Y.le1) inEpi++;
  });
  chk(outside === 0, outside + ' chloroplasts outside their own cell');
  chk(inEpi === 0, 'no chloroplasts in the epidermis cells (' + inEpi + ')');
  chk(S.CHLS.filter(c => c.cell === 'pal' && c.p.z > S.BZ - 1.2).length > 100 && S.CHLS.filter(c => c.cell === 'spo' && c.p.z > S.BZ - 2).length > 20,
      'the cells the front cut opens show their chloroplasts');
  chk(S.FIG.palChl > 2*S.FIG.spoChl, 'palisade cells have more chloroplasts (' + S.FIG.palChl + ') than spongy cells (' + S.FIG.spoChl + ')');

  /* ------------------------------------------------------------ stomata */
  section('stomata and guard cells');
  chk(S.STOMATA.length > 5, S.STOMATA.length + ' stomata');
  chk(S.STO.yc > Y.le0 && S.STO.yc < Y.le1, 'guard cells sit in the lower epidermis');
  chk(!S.UPPER.sites.some(s => s.stoma), 'there are no stomata in the upper epidermis');
  chk(S.FIG.stomaTop === 0, 'the caption says none on top');
  chk(S.STOMATA.every(s => Math.abs(s.x - S.VEIN.x) > S.VEIN.r), 'no stoma over the vein');
  const open = S.guardShape(1), shut = S.guardShape(0);
  chk(open.w > 5*shut.w, 'the pore is far wider open (' + (2*open.w*S.UM).toFixed(1) + ' um) than shut (' + (2*shut.w*S.UM).toFixed(1) + ' um)');
  chk(open.tr > shut.tr, 'guard cells are swollen when the stoma is open');
  chk(Math.abs(S.FEAT_CUT.z - S.BZ) < 1e-9, 'one stoma is cut through by the front face');
  const fl = S.stomaLocal(Object.assign({c:Math.cos(S.FEAT_CUT.rot), s:Math.sin(S.FEAT_CUT.rot)}, S.FEAT_CUT), S.FEAT_CUT.x, S.BZ - 1);
  chk(Math.abs(fl.lx) > 0.9 && Math.abs(fl.lz) < 1e-6, 'and cut across its pore, as a section shows it');
  const lo = S.FEAT_CUT.x - (open.w + open.tr), hi = S.FEAT_CUT.x + (open.w + open.tr);
  chk(!S.isSolid(new V3(S.FEAT_CUT.x, 0.75, S.BZ - 0.2)) && S.isSolid(new V3(S.FEAT_CUT.x + 1.9, 0.75, S.BZ - 0.2)),
      'the cut face shows the pore open between its guard cells (' + lo.toFixed(2) + ' to ' + hi.toFixed(2) + ')');
  const stIn = S.STOMATA.filter(s => Math.abs(s.x) <= S.BX && Math.abs(s.z) <= S.BZ).length;
  const dens = stIn/((2*S.BX*S.UM/1000)*(2*S.BZ*S.UM/1000));
  chk(dens > 50 && dens < 400, 'about ' + Math.round(dens) + ' stomata per mm2 underneath');
  chk(Math.abs(S.FIG.stomaDens - dens) <= 5, 'the caption quotes that density');

  /* --------------------------------------------------------------- vein */
  section('the vein');
  const my = a => a.reduce((s, c) => s + c.y, 0)/a.length;
  chk(my(S.BUNDLE.xylem) > my(S.BUNDLE.phloem) + 1, 'xylem on the upper side, phloem on the lower');
  const inner = S.VEIN.r - 2*0.78;
  chk(S.BUNDLE.xylem.concat(S.BUNDLE.phloem, S.BUNDLE.comp, S.BUNDLE.paren).every(c => Math.hypot(c.x, c.y) + c.r < S.VEIN.r - 0.5),
      'every xylem, phloem and other cell is inside the bundle sheath');
  chk(S.BUNDLE.xylem.every(c => c.wall > 2*S.BUNDLE.phloem[0].wall), 'xylem walls are thick (lignin), phloem walls thin');
  chk(S.BUNDLE.comp.length === S.BUNDLE.phloem.length, 'each sieve tube has a companion cell');
  chk(S.VEIN.y + S.VEIN.r < Y.pa1 && S.VEIN.y - S.VEIN.r > Y.le1, 'the vein is inside the mesophyll');

  /* -------------------------------------------------- the ways gas goes */
  section('gas: searched through the air spaces');
  chk(S.GAS.length >= 3, S.GAS.length + ' paths found');
  chk(S.GAS.some(g => g.stoma === S.STOMATA[0]), 'one goes through the stoma cut by the front face');
  S.GAS.forEach((g, i) => {
    const pts = g.P;
    chk(pts[0].y < Y.le0, 'path ' + i + ' starts outside, under the leaf');
    chk(pts[pts.length-1].y > Y.sp1 - 1 && !!S.inPalisade(pts[pts.length-1].clone().setY(pts[pts.length-1].y + 0.45)), 'path ' + i + ' ends at the bottom of a palisade cell');
    const inCell = pts.filter(p => S.isSolid(p)).length;
    chk(inCell === 0, 'path ' + i + ' never goes through a cell (' + inCell + ' of ' + pts.length + ' points do)');
    const through = pts.filter(p => p.y > Y.le0 && p.y < Y.le1);
    chk(through.every(p => S.STOMATA.some(s => { const l = S.stomaLocal(s, p.x, p.z); return Math.abs(l.lx) < S.STO.a && Math.abs(l.lz) < 0.5; })),
        'path ' + i + ' crosses the epidermis only through a stoma');
    chk(pts.every(p => p.z <= S.BZ + 1e-6 && p.z > S.BZ - 6.5), 'path ' + i + ' stays near the cut face, in view');
    chk(g.L > (Y.sp1 - Y.le0), 'path ' + i + ' is longer than the straight way up (' + g.L.toFixed(1) + ')');
  });
  const st = S.CH[S.CHI.stomata];
  const A = st.blk.gasT;
  chk(Math.abs(A(10.9) - A(8.1)) < 0.01 && st.blk.open(9) < 0.01, 'while the stomata are shut, the gas does not move');
  chk(A(5) > A(4) && A(15) > A(14), 'while they are open it does');
  let worst = 0;
  for(let t=0;t<st.len;t+=0.01){ const num = (A(t + 0.01) - A(t))/0.01; worst = Math.max(worst, Math.abs(num - st.blk.open(t + 0.005))); }
  chk(worst < 0.02, 'the gas clock is the integral of the opening (worst ' + worst.toFixed(4) + ')');
  chk(st.blk.open(0) > 0.99 && st.blk.open(st.len) > 0.99, 'open at the start and the end of the chapter');

  /* -------------------------------------------------------------- light */
  section('light');
  chk(S.lightLeft(Y.pa1) === 1 && S.lightLeft(Y.ue1) === 1, 'none absorbed by the clear epidermis');
  chk(S.lightLeft(Y.sp1) < 0.1, 'most absorbed in the palisade layer (' + Math.round(100*(1 - S.lightLeft(Y.sp1))) + '%)');
  chk(S.lightLeft(Y.le1) < S.lightLeft(Y.sp1), 'and more in the spongy layer');

  /* ---------------------------------------------------------------- cell */
  section('inside a palisade cell');
  const atoms = side => { const n = {}; side.forEach(([sp, k]) => Object.entries(S.FORMULA[sp]).forEach(([e, c]) => n[e] = (n[e]||0) + k*c)); return n; };
  const L = atoms(S.EQN.lhs), R = atoms(S.EQN.rhs);
  chk(['C','H','O'].every(e => L[e] === R[e]), 'the equation balances: ' + JSON.stringify(L) + ' -> ' + JSON.stringify(R));
  chk(S.coef('CO2') === 6 && S.coef('H2O') === 6 && S.coef('GLU') === 1 && S.coef('O2') === 6, '6CO2 + 6H2O -> C6H12O6 + 6O2');
  ['CO2','H2O','O2'].forEach(sp => chk(['C','H','O'].every(e => (S.FORMULA[sp][e]||0) === S.MOL[sp].atoms.filter(a => a[0] === e).length), sp + ' is drawn with the right atoms'));
  const inVac = p => S.inColumn(Math.hypot(p.x, p.z), p.y, S.VAC.r + 0.05, S.VAC.h + 0.1, S.CELL.p);
  Object.entries(S.CPATH).forEach(([k, path]) => chk(path.P.every(p => !inVac(p)), k + ' never crosses the vacuole'));
  Object.entries(S.UPATH).forEach(([k, path]) => chk(path.P.every(p => !inVac(p)), 'glucose to ' + k + ' never crosses the vacuole'));
  chk(S.NITRATE_PATH.P.every(p => !inVac(p)), 'nitrate never crosses the vacuole');
  ['CO2','H2O'].forEach(k => {
    const P = S.CPATH[k].P, first = P.findIndex(p => S.inCellCyto(p));
    chk(first > 0 && !S.inCellCyto(P[0]), k + ' comes from outside the cell');
    chk(P.slice(first + 2).every(p => S.inCellCyto(p) || p.distanceTo(S.SITES.T) < 0.7), k + ' then stays in the cytoplasm until it reaches the chloroplast');
  });
  chk(!S.inCellCyto(S.CPATH.O2.P[S.CPATH.O2.P.length-1]), 'oxygen leaves the cell');
  chk(Object.entries(S.SITES).every(([k, p]) => S.inCellCyto(p)), 'every organelle the story uses is in the cytoplasm');
  const main = S.CELL_CHL.filter(c => c.g === S.CELLS[0]);
  chk(main.every(c => S.inCellCyto(c.p)), 'every chloroplast is in the cytoplasm, round the vacuole');
  chk(main.length > 30, main.length + ' chloroplasts in the cell');
  /* every chloroplast is a true rotation (a mirrored basis breaks the quaternion) */
  let badQ = 0;
  S.CELLS.forEach(g => g.traverse(o => { if(o.quaternion && Math.abs(o.quaternion.length() - 1) > 1e-6) badQ++;
    if(o.isMesh){ o.updateMatrixWorld(true); if(o.matrixWorld.determinant() <= 0) badQ++; } }));
  chk(badQ === 0, 'no part of the cell is mirrored or has a broken rotation (' + badQ + ')');
  let lying = 0, nChl = 0;
  S.CELLS.forEach(g => g.children.forEach(o => {
    if(!o.isMesh || !o.userData || o.material !== S.CELLS[0].userData.chlMat) return;
    nChl++;
    const e = o.matrixWorld.elements, ax = new THREE.Vector3(e[0], e[1], e[2]).normalize(), az = new THREE.Vector3(e[8], e[9], e[10]).normalize();
    const rad = new THREE.Vector3(o.position.x, 0, o.position.z).normalize();
    if(Math.abs(ax.y) < 0.85 || Math.abs(az.dot(rad)) < 0.85) lying++;
  }));
  chk(nChl > 60 && lying === 0, 'every chloroplast lies flat against the wall, long way up (' + lying + ' of ' + nChl + ' do not)');

  /* ---------------------------------------------------- limiting factors */
  section('limiting factors');
  chk(Math.abs(S.lightIntensity(10) - 4*S.lightIntensity(20)) < 1e-12, 'inverse square: half the distance, four times the light');
  const r0 = S.rateOf(20, 0.04, 20);
  chk(r0.rate === Math.min(r0.parts.light, r0.parts.co2, r0.parts.temp), 'the rate is the smallest of the three');
  let ok = true;
  const R_ = (d, c, T) => S.rateOf(d, c, T);
  for(const d of [10, 14, 20, 30, 50]) for(const c of [0.01, 0.04, 0.08, 0.16]) for(const T of [5, 15, 25, 35, 44]){
    const r = R_(d, c, T);
    /* raising a factor that is not limiting changes nothing */
    if(r.lim !== 'light' && Math.abs(R_(d*0.8, c, T).rate - r.rate) > 1e-12) ok = false;
    if(r.lim !== 'co2' && Math.abs(R_(d, Math.min(0.16, c*1.5), T).rate - r.rate) > 1e-12 && r.parts.co2 < 1) ok = false;
    /* raising the one that is limiting raises the rate */
    if(r.lim === 'light' && r.parts.light < Math.min(r.parts.co2, r.parts.temp) - 1e-9 && !(R_(d*0.9, c, T).rate > r.rate)) ok = false;
    if(r.lim === 'co2' && r.parts.co2 < Math.min(r.parts.light, r.parts.temp) - 1e-9 && !(R_(d, c*1.2, T).rate > r.rate)) ok = false;
  }
  chk(ok, 'raising the limiting factor raises the rate; raising any other does not');
  chk(S.rateOf(10, 0.16, S.LF.Tden).rate === 0, 'no photosynthesis once the enzymes have denatured');
  chk(S.tempFactor(S.LF.Topt) === 1 && S.tempFactor(S.LF.Topt - 10) < 1 && S.tempFactor(S.LF.Topt + 5) < 1, 'fastest at the optimum temperature');
  chk(S.rateOf(20, 0.04, 20).lim === 'light' && S.rateOf(10, 0.04, 25).lim === 'co2' && S.rateOf(10, 0.16, 5).lim === 'temp',
      'each of the three can be the limiting factor');
  /* a slider moved half way through: the flow carries on from where it was */
  S.enterChapter(S.CHI.limit);
  S.frame(6);
  const before = S.lfPhase(6);
  S.lfEls.d.value = '10'; S.lfEls.c.value = '0.12'; S.lfEls.T.value = '28';
  S.lfChange();
  chk(Math.abs(S.lfPhase(6) - before) < 1e-12, 'moving the sliders does not make the flow jump');
  chk(S.lfPhase(7) - S.lfPhase(6) > 0 && S.lfState.d === 10, 'and it then runs at the new rate');
  S.lfEls.T.value = '0'; S.lfChange();
  chk(S.lfState.T === 0, 'a temperature of 0 is read as 0, not ignored');

  /* ---------------------------------------------------------- captions */
  section('captions');
  const allText = C => [C.title, C.text, C.look || '', C.scale || ''].concat(C.terms.map(x => x.join(' '))).map(plain).join(' ');
  const allowed = new Set(Object.values(S.FIG).map(String));
  ['6', '1', '12'].forEach(x => allowed.add(x));                            // the equation
  Object.values(S.SHUT).forEach(v => allowed.add(String(v)));
  S.CH.forEach(C => {
    const txt = allText(C).replace(/CO₂|H₂O|O₂|C₆H₁₂O₆|mm²|distance²/g, '');
    const nums = txt.match(/\d+(\.\d+)?/g) || [];
    const stray = nums.filter(n => !allowed.has(n));
    chk(!stray.length, C.id + ': quotes numbers that are not worked out by the page: ' + stray.join(', '));
  });
  const every = S.CH.map(allText).join(' ').toLowerCase();
  chk(!/energy (is )?(produced|made|created|released)|(produce|make|create)s? energy/.test(every), 'energy is transferred, never produced or made');
  chk(/energy transferred|is transferred/.test(every), 'photosynthesis is described as energy transferred by light');
  chk(/endothermic/.test(every), 'photosynthesis is called endothermic');
  ['epidermis','palisade mesophyll','spongy mesophyll','xylem','phloem','guard cells','stomata','waxy cuticle','lignin',
   'translocation','chlorophyll','chloroplast','limiting factor','inversely proportional','light intensity','carbon dioxide concentration',
   'temperature','amount of chlorophyll','respiration','insoluble starch','fats or oils','cellulose','amino acids','nitrate ions',
   'sieve plates','water and mineral ions','dissolved sugars','air spaces','diffuse','organ','tissue','section','microscope',
   'water vapour','reduces water loss']
    .forEach(w => chk(every.includes(w), 'teaches "' + w + '"'));
  S.CH.forEach(C => {
    chk(C.text && C.title && C.len > 8, C.id + ' has a title, text and a length');
    C.shots.forEach(sh => { const k = sh.keys; chk(k.every((x, i) => !i || x[0] >= k[i-1][0]), C.id + ': camera keys in order');
      chk(k.every(x => S.CH && x[1] && typeof x[1] === 'string'), C.id + ': camera keys named'); });
    C.labels.forEach(L => chk(L.t0 < C.len - 1, C.id + ': label "' + plain(L.text) + '" shows before the chapter ends'));
    (C.key || []).forEach(k => chk(!!S.KEYS[k], C.id + ': key entry ' + k + ' exists'));
  });
  const ids = S.CH.map(C => C.id);
  chk(ids.indexOf('epidermis') < ids.indexOf('palisade') && ids.indexOf('palisade') < ids.indexOf('spongy') &&
      ids.indexOf('section') < ids.indexOf('epidermis') && ids.indexOf('photo') < ids.indexOf('uses') && ids.indexOf('uses') < ids.indexOf('limit'),
      'chapters go outside in, top to bottom, then the reaction');

  /* ------------------------------------------------------------- labels */
  section('labels on screen, clear of the HTML, not on top of each other');
  const VW = STAGE_W, VH = STAGE_H;
  /* the nav (bottom middle), the key (top right), the equation bar (top middle) */
  const NAV = {l:VW/2 - 210, r:VW/2 + 210, t:VH - 70, b:VH};
  const KEY = {l:VW - 190, r:VW, t:0, b:250};
  const EQB = {l:VW/2 - 280, r:VW/2 + 280, t:0, b:76};
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  S.CH.forEach((C, ch) => {
    const times = new Set();
    C.labels.forEach(L => { times.add(L.t0 + 0.7); times.add(Math.min(C.len, (L.t1 || C.len) - 0.6)); });
    times.add(C.len);
    S.enterChapter(ch);
    times.forEach(t => {
      if(t < 0) return;
      const shot = S.frame(t);
      const boxes = [];
      S.LAYOUT.forEach(({L, left, top, pts}) => {
        if(L.ch !== ch) return;
        const name = C.id + ' "' + plain(L.text) + '" t=' + t.toFixed(1);
        chk(pts.length === L.at().length, name + ': every anchor in front of the camera');
        chk(pts.every(p => p.x > 4 && p.x < VW - 4 && p.y > 4 && p.y < VH - 4), name + ': anchors on screen');
        const box = {l:left, r:left + L.w, t:top, b:top + L.h, name};
        chk(box.l >= 8 - 1e-6 && box.r <= VW - 8 + 1e-6 && box.t >= 8 - 1e-6 && box.b <= VH - 8 + 1e-6, name + ': inside the stage');
        chk(!hit(box, NAV), name + ': clear of the buttons');
        if(C.key && C.key.length) chk(!hit(box, {l:KEY.l, r:KEY.r, t:C.eq ? 76 : 0, b:(C.eq ? 76 : 0) + 30 + 20*C.key.length}), name + ': clear of the key');
        if(C.eq) chk(!hit(box, EQB), name + ': clear of the equation bar');
        if(S.SCOPE.r && C.blk && C.blk.scope && C.blk.scope(t) > 0.5)
          chk(pts.every(p => Math.hypot(p.x - S.SCOPE.cx, p.y - S.SCOPE.cy) < S.SCOPE.r - 4), name + ': anchors inside the microscope\'s field');
        boxes.push(box);
      });
      for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++)
        chk(!hit(boxes[i], boxes[j]), 'labels overlap: ' + boxes[i].name + ' and ' + boxes[j].name);
    });
  });
  /* the scale bar is inside the microscope's field */
  S.enterChapter(S.CHI.slide); S.frame(S.CH[S.CHI.slide].len);
  chk(!!S.SCOPE.bar && S.SCOPE.bar.every(p => Math.hypot(p.x - S.SCOPE.cx, p.y - S.SCOPE.cy) < S.SCOPE.r - 8), 'the scale bar is inside the microscope\'s field');
  /* the block in the slide view fills the field across its thickness */
  const topS = S.toScreen(B(0, Y.cu1, S.BZ)), botS = S.toScreen(B(0, Y.le0, S.BZ));
  chk(Math.abs(topS.y - botS.y) > 0.5*S.SCOPE.r && Math.abs(topS.y - botS.y) < 2*S.SCOPE.r - 30, 'the whole thickness of the leaf fits the field, and fills it');

  /* the subjects are in view when the camera has settled */
  [['palisade', B(-6, 14.6, S.BZ)], ['spongy', B(-6, 6, S.BZ)], ['vein', B(S.VEIN.x, S.VEIN.y, 3)]].forEach(([id, p]) => {
    S.enterChapter(S.CHI[id]); S.frame(S.CH[S.CHI[id]].len);
    const q = S.toScreen(p);
    chk(q.ok && q.x > 0.15*VW && q.x < 0.85*VW && q.y > 0.15*VH && q.y < 0.85*VH, id + ': the subject is in the middle of the picture');
  });
}

/* ----------------------------------------------------------- catalogue */
function catalogue(){
  section('catalogue');
  const root = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = root.match(/const SIMS = (\[[\s\S]*?\]);/);
  chk(!!m, 'the root index has a SIMS list');
  if(!m) return;
  const SIMS = JSON.parse(m[1]);
  const mine = SIMS.filter(s => s.u === 'plants/' + PAGE);
  chk(mine.length === 1, 'SIMS lists the leaf story once');
  if(mine[0]) chk(mine[0].c.includes('biology') && mine[0].s === 'Plants', 'as biology, in the Plants section');
  const dead = SIMS.filter(s => !fs.existsSync(path.join(__dirname, '..', s.u)));
  chk(!dead.length, 'every SIMS entry exists: ' + dead.map(s => s.u).join(', '));
  chk(/href="\.\/plants\/index\.html"/.test(root), 'the root grid has a Plants card');
  const idx = read('index.html');
  chk(idx.includes('href="./' + PAGE + '"'), 'plants/index.html links the story');
  const cb = fs.readFileSync(path.join(__dirname, '..', 'cell_biology', 'index.html'), 'utf8');
  chk(cb.includes('../plants/' + PAGE), 'cell_biology/index.html links to it');
}

(async function main(){
  const html = read(PAGE);
  const src = await ensureThree(threeUrlOf(html));
  if(!src){ console.log('could not get three.js'); process.exit(1); }
  const THREE = loadThree(src);
  run(THREE, html);
  catalogue();
  console.log('\n' + (checks - fails) + ' / ' + checks + ' checks passed' + (fails ? ', ' + fails + ' FAILED' : ''));
  process.exit(fails ? 1 : 0);
})();
