/* Tests for the Z-Anatomy workflow. Needs no Blender.
 *
 *   node tools/anatomy/test-anatomy.js
 *
 *   1. CATALOGUE  names are unique and their side agrees with their suffix;
 *                 the licence block the Python applied is exactly the one
 *                 licence-rules.json gives when JS applies it (two
 *                 implementations of one rule, checked against each other).
 *   2. RECIPES    every *.recipe.json in the repo: every selector finds
 *                 something in the catalogue, and nothing it reaches is
 *                 blocked unless named in allow_nc.
 *   3. BUILDS     every .glb with a manifest: the nodes are exactly the
 *                 manifest's parts, named as in the catalogue; it is within
 *                 budget; it carries the licence; nothing in it is blocked;
 *                 its numbers are finite; and every part faces OUTWARDS -- a
 *                 mirrored .l part whose normals were not flipped comes out
 *                 inside out, which nothing else here would notice.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
let checks = 0, fails = 0;
function chk(ok, msg) { checks++; if (!ok) { fails++; console.log('    ✗ ' + msg); } }
function section(s) { console.log('\n' + s); }

const RULES = JSON.parse(fs.readFileSync(path.join(HERE, 'licence-rules.json'), 'utf8'));
const rx = r => new RegExp(r.pattern, 'i');
const CAT = JSON.parse(fs.readFileSync(path.join(HERE, 'catalogue.json'), 'utf8'));
const BY = new Map(CAT.parts.map(p => [p.name, p]));
const hay = p => [p.name, p.system || '', ''].concat(p.groups, p.regions, p.lineage).join('\n');
const SIDE = /\.(e|o)?(\d+)?([lr])$/;

/* ------------------------------------------------------------------ */
function catalogue() {
  section('CATALOGUE  ' + CAT.parts.length + ' parts');
  chk(CAT.parts.length > 3000, 'the catalogue is suspiciously small');
  chk(BY.size === CAT.parts.length, 'part names are not unique');
  CAT.parts.forEach(p => {
    const m = p.name.match(SIDE);
    const side = m ? m[3] : 'mid';
    if (side !== p.side) chk(false, p.name + ': side ' + p.side + ' but the name says ' + side);
    if (/\.(j|t|g|i|s|st)$/.test(p.name)) chk(false, p.name + ': a label got into the catalogue');
    const blk = RULES.block.filter(r => rx(r).test(hay(p))).map(r => r.id);
    if (blk.join() !== (p.blocked || []).join())
      chk(false, p.name + ': Python blocked [' + (p.blocked || []) + '] but the rules say [' + blk + ']');
  });
  chk(CAT.parts.some(p => p.blocked && p.blocked.includes('kidney')), 'nothing is blocked as kidney: the rule has stopped matching');
  chk(CAT.parts.some(p => p.blocked && p.blocked.includes('inner-ear')), 'nothing is blocked as inner ear: the rule has stopped matching');
  /* Nearly every left part is the right one mirrored (same mesh, x
     negated), which is what tells us the x axis is left-right. Not all:
     the body is not symmetric (kidneys sit at different heights, the
     iliac vessels and the vagus nerves differ), and those are modelled
     separately. So assert "nearly all", and list the rest. */
  let pairs = 0;
  const asym = [];
  CAT.parts.forEach(p => {
    if (p.side !== 'l' || !p.bbox) return;
    const r = BY.get(p.name.replace(/l$/, 'r'));
    if (!r || !r.bbox) return;
    pairs++;
    if (Math.abs(p.bbox[0][0] + r.bbox[1][0]) > 0.002 || p.tris !== r.tris) asym.push(p.name.replace(/\.\w+$/, ''));
  });
  chk(pairs > 1000, 'only ' + pairs + ' left/right pairs found');
  chk(asym.length < pairs * 0.03, asym.length + ' of ' + pairs + ' left/right pairs are not mirror images; the axes may have changed');
  /* +x is the body's left. The source mislabels a few sides; each of those
     must be flagged, and there must only be a few, or the convention itself
     has changed. */
  let sided = 0, wrong = 0;
  CAT.parts.forEach(p => {
    if (!p.bbox || p.side === 'mid') return;
    sided++;
    const cx = (p.bbox[0][0] + p.bbox[1][0]) / 2;
    const pos = cx > 0.005 ? 'l' : cx < -0.005 ? 'r' : 'mid';
    const mis = pos !== 'mid' && pos !== p.side;
    if (mis) wrong++;
    if (mis !== !!p.side_mismatch) chk(false, p.name + ': lies on the ' + pos + ' but side_mismatch is ' + p.side_mismatch);
  });
  chk(wrong < sided * 0.02, wrong + ' of ' + sided + ' sided parts lie on the other side: the left/right convention has changed');
  console.log('    ' + pairs + ' left/right pairs, ' + asym.length + ' modelled asymmetrically (' + asym.slice(0, 4).join(', ') + '...), ' +
    CAT.parts.filter(p => p.blocked).length + ' blocked');
}

/* ------------------------------------------------------------------ */
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}
const FILES = walk(ROOT, []);

function selectFrom(sel) {
  let hits;
  if (sel.name) hits = BY.has(sel.name) ? [BY.get(sel.name)] : [];
  else if (sel.match) { const r = new RegExp(sel.match); hits = CAT.parts.filter(p => r.test(p.name)); }
  else if (sel.collection) hits = CAT.parts.filter(p =>
    p.system === sel.collection || p.lineage.includes(sel.collection) ||
    p.groups.concat(p.regions).some(g => g.split(' / ').includes(sel.collection)));
  else return null;
  if (sel.side) hits = hits.filter(p => p.side === sel.side || p.side === 'mid');
  if (sel.system) hits = hits.filter(p => p.system === sel.system);
  return hits;
}
function recipes() {
  const list = FILES.filter(f => f.endsWith('.recipe.json'));
  section('RECIPES  ' + list.length);
  list.forEach(f => {
    const rel = path.relative(ROOT, f);
    let R;
    try { R = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { chk(false, rel + ': not JSON: ' + e.message); return; }
    chk(typeof R.out === 'string' && R.out.endsWith('.glb'), rel + ': "out" must name a .glb');
    chk(R.budget_kb > 0, rel + ': give it a budget_kb, so a build cannot quietly balloon');
    const kinds = new Set(R.kinds || ['part']), allow = new Set(R.allow_nc || []);
    /* what the exporter will build: each part goes by the LAST selector that
       reaches it, then the excludes are taken out */
    const reach = new Map();
    (R.include || []).forEach(sel => {
      const hits = selectFrom(sel);
      if (hits === null) { chk(false, rel + ': selector needs name, match or collection: ' + JSON.stringify(sel)); return; }
      const kept = hits.filter(p => kinds.has(p.kind) || sel.name);
      chk(kept.length > 0, rel + ': matches nothing in the catalogue: ' + JSON.stringify(sel));
      if (sel.as !== undefined) chk(sel.as === 'centreline', rel + ': "as" can only be "centreline": ' + JSON.stringify(sel));
      kept.forEach(p => reach.set(p.name, sel));
    });
    (R.exclude || []).forEach(sel => (selectFrom(sel) || []).forEach(p => reach.delete(p.name)));
    for (const [n, sel] of reach) {
      const p = BY.get(n);
      if (p.blocked && !allow.has(n)) chk(false, rel + ': reaches ' + n + ', which is blocked (' + p.blocked + ')');
      /* only a curve has a centreline to be exported as */
      if (sel.as === 'centreline' && p.type !== 'CURVE') chk(false, rel + ': asks for ' + n + ' as a centreline, but it is not a curve');
    }
  });
}

/* ------------------------------------------------------------------ */
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jlen = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jlen));
  const binStart = 20 + jlen + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jlen));
  return { json, bin, bytes: b.length };
}
function accessor(g, i) {
  const a = g.json.accessors[i], v = g.json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const off = g.bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  if (v.byteStride && v.byteStride !== comps * T.BYTES_PER_ELEMENT)
    throw new Error('interleaved buffer views are not handled; Blender does not write them');
  return new T(g.bin.buffer.slice(off, off + a.count * comps * T.BYTES_PER_ELEMENT));
}
function builds() {
  const list = FILES.filter(f => f.endsWith('.manifest.json'));
  section('BUILDS  ' + list.length);
  list.forEach(mf => {
    const rel = path.relative(ROOT, mf);
    const M = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const glbFile = path.join(path.dirname(mf), M.glb);
    /* built .glb files are not committed (see .gitignore); a clone without
       Blender has only the recipe and the manifest, and that is fine */
    if (!fs.existsSync(glbFile)) { console.log('    ' + rel + ': not built here, skipped'); return; }
    const recipeFile = path.join(path.dirname(mf), M.recipe);
    chk(fs.existsSync(recipeFile), rel + ': built from ' + M.recipe + ', which no longer exists');
    const R = fs.existsSync(recipeFile) ? JSON.parse(fs.readFileSync(recipeFile, 'utf8')) : {};
    chk(M.licence === RULES.licence && M.attribution === RULES.attribution, rel + ': the licence or attribution is not the current one');
    const g = readGlb(glbFile);
    chk(g.bytes === M.totals.bytes, rel + ': the .glb is not the one this manifest describes (rebuilt separately?)');
    if (R.budget_kb) chk(g.bytes <= R.budget_kb * 1024, rel + ': ' + (g.bytes / 1024).toFixed(0) + ' KB is over the budget of ' + R.budget_kb + ' KB');
    const nodes = g.json.nodes.filter(n => n.mesh !== undefined || (n.extras && n.extras.centreline));
    const want = M.parts.map(p => p.name).sort().join('\n'), got = nodes.map(n => n.name).sort().join('\n');
    chk(want === got, rel + ': the .glb nodes are not the manifest parts');
    let inside = [], bad = 0;
    nodes.forEach(n => {
      const p = BY.get(n.name);
      if (!p) { chk(false, rel + ': ' + n.name + ' is not in the catalogue'); return; }
      if (p.blocked && !(R.allow_nc || []).includes(n.name)) chk(false, rel + ': contains blocked part ' + n.name);
      chk(!n.matrix && !n.rotation && !n.scale && !n.translation, rel + ': ' + n.name + ' has a transform; they should be baked in');
      chk(n.extras && n.extras.side === p.side, rel + ': ' + n.name + ' has no side in its extras');
      /* three.js sanitises node names on load, so this is the only place a
         page can read the real one from (object.userData.part) */
      chk(n.extras && n.extras.part === n.name, rel + ': ' + n.name + ' does not carry its exact name in extras.part');
      /* built "as": "centreline": no mesh, but a centreline with a radius at
         every point, all finite and plausible for a body part */
      if (n.mesh === undefined) {
        const cl = JSON.parse(n.extras.centreline), rad = n.extras.radius ? JSON.parse(n.extras.radius) : null;
        chk(!!rad && rad.length === cl.length && rad.every((r, i) => r.length === cl[i].length), rel + ': ' + n.name + ' has no radius for every centreline point');
        if (rad) for (const r of rad.flat()) if (!(r > 0 && r < 0.03)) { chk(false, rel + ': ' + n.name + ' has a radius of ' + r + ' m'); break; }
        for (const p of cl.flat()) if (!p.every(Number.isFinite)) { bad++; break; }
        return;
      }
      /* outward-facing: the normals, weighted by area, point away from the
         part's own centre */
      let flux = 0;
      g.json.meshes[n.mesh].primitives.forEach(pr => {
        const P = accessor(g, pr.attributes.POSITION), I = accessor(g, pr.indices);
        for (let i = 0; i < P.length; i++) if (!Number.isFinite(P[i])) bad++;
        let cx = 0, cy = 0, cz = 0;
        const nv = P.length / 3;
        for (let i = 0; i < nv; i++) { cx += P[3 * i]; cy += P[3 * i + 1]; cz += P[3 * i + 2]; }
        cx /= nv; cy /= nv; cz /= nv;
        for (let t = 0; t < I.length; t += 3) {
          const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
          const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
          const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const mx = (P[a] + P[b] + P[c]) / 3 - cx, my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 - cy, mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3 - cz;
          flux += nx * mx + ny * my + nz * mz;
        }
      });
      if (flux < 0) inside.push(n.name);
    });
    chk(bad === 0, rel + ': ' + bad + ' non-finite vertex coordinates');
    /* a handful of open tubes and thin sheets can come out marginal; a whole
       side coming out inside out cannot */
    const meshed = nodes.filter(n => n.mesh !== undefined);
    const left = meshed.filter(n => /l$/.test(n.name)), leftIn = inside.filter(n => /l$/.test(n));
    chk(inside.length <= Math.max(2, meshed.length * 0.05), rel + ': ' + inside.length + ' parts face inwards: ' + inside.slice(0, 6).join(', '));
    chk(!left.length || leftIn.length < left.length * 0.5, rel + ': most left (mirrored) parts face inwards: normals not flipped after mirroring');
    console.log('    ' + rel + ': ' + nodes.length + ' parts, ' + (g.bytes / 1024).toFixed(0) + ' KB, ' + inside.length + ' facing inwards');
  });
}

catalogue();
recipes();
builds();
console.log('\n' + checks + ' checks, ' + fails + ' failure' + (fails === 1 ? '' : 's'));
process.exit(fails ? 1 : 0);
