#!/usr/bin/env node
/* Pack a built .glb into a page, so the page needs nothing but itself.
 *
 *   node tools/anatomy/zanatomy-pack.js <built.glb> <page.html>
 *
 * Writes `const ANATOMY = {...}` between the markers
 *     /* ANATOMY:BEGIN ... *\/   and   /* ANATOMY:END *\/
 * in the page. Never edit that block by hand; re-run this.
 *
 * WHY NOT JUST INLINE THE .glb
 * A .glb carries float positions and float normals: 24 bytes a vertex. This
 * carries 16-bit positions, quantised inside one box round the whole body
 * (1.9 m / 65535 = 0.03 mm, far below anything a projector shows), and no
 * normals at all -- the page recomputes them, which on these smooth, indexed
 * meshes looks the same. So 6 bytes a vertex and 6 a triangle, about half,
 * and the page decodes it synchronously with no loader.
 *
 * What goes across per part: the exact name, side, system, group, lineage,
 * one index range per tissue, and the centrelines of curves (nerves, and
 * the path the spinal cord is built along), already in glTF's y-up metres.
 * A part built "as": "centreline" has no mesh: it goes across with v = 0,
 * i = 0, and `n`, the number of points in each of its splines; the points
 * themselves follow in the binary data, x y z quantised in the same box as
 * the meshes and then a radius each, in units of 10 micrometres:
 *     [x y z] * N, [r] * N        (all 16-bit, N = the sum of n)
 * The page rebuilds the tube from them. As text, the 650 vessels of the
 * heart page came to 2.4 MB; this is about a tenth of that.
 *
 * Every centreline is first THINNED: the exporter samples each Bezier
 * segment at 7 points, straight or not, so a point is dropped wherever the
 * line between the points kept on either side passes within TOL of it, and
 * the radius there is within RTOL of what the line between their radii says.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function die(m) { console.error('zanatomy-pack: ' + m); process.exit(1); }
const [glbArg, htmlArg] = process.argv.slice(2);
if (!glbArg || !htmlArg) die('usage: zanatomy-pack.js <built.glb> <page.html>');
const glbPath = path.resolve(glbArg), htmlPath = path.resolve(htmlArg);
const manifestPath = glbPath.replace(/\.glb$/, '') + '.manifest.json';
if (!fs.existsSync(manifestPath)) die('no manifest beside ' + glbArg + '; build it with zanatomy.js');
const M = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/* --- read the .glb ------------------------------------------------------ */
const b = fs.readFileSync(glbPath);
if (b.readUInt32LE(0) !== 0x46546c67) die('not a .glb');
const jlen = b.readUInt32LE(12);
const G = JSON.parse(b.toString('utf8', 20, 20 + jlen));
const binOff = 20 + jlen + 8;
const BIN = b.subarray(binOff, binOff + b.readUInt32LE(20 + jlen));
function acc(i) {
  const a = G.accessors[i], v = G.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC3: 3 }[a.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  if (v.byteStride && v.byteStride !== comps * T.BYTES_PER_ELEMENT) die('interleaved buffers are not handled');
  const off = BIN.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  return new T(BIN.buffer.slice(off, off + a.count * comps * T.BYTES_PER_ELEMENT));
}

/* --- thinning ------------------------------------------------------------ */
const TOL = 0.00025, RTOL = 0.1;
function thin(pts, rad) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const seg = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const u = L2 > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2)) : 0;
    return { d: Math.hypot(ap[0] - ab[0] * u, ap[1] - ab[1] * u, ap[2] - ab[2] * u), u };
  };
  (function dp(i, j) {
    let worst = -1, wi = -1;
    for (let k = i + 1; k < j; k++) {
      const { d, u } = seg(pts[k], pts[i], pts[j]);
      let bad = d / TOL;
      if (rad) { const r = rad[i] + (rad[j] - rad[i]) * u; bad = Math.max(bad, Math.abs(rad[k] - r) / Math.max(1e-4, RTOL * rad[k])); }
      if (bad > worst) { worst = bad; wi = k; }
    }
    if (worst > 1) { keep[wi] = 1; dp(i, wi); dp(wi, j); }
  })(0, pts.length - 1);
  const idx = []; keep.forEach((k, i) => { if (k) idx.push(i); });
  return idx;
}

/* --- one box round everything ------------------------------------------- */
const nodes = G.nodes.filter(n => n.mesh !== undefined || (n.extras && n.extras.centreline));
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
nodes.filter(n => n.mesh !== undefined).forEach(n => G.meshes[n.mesh].primitives.forEach(p => {
  const a = G.accessors[p.attributes.POSITION];
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
}));
nodes.filter(n => n.mesh === undefined).forEach(n => JSON.parse(n.extras.centreline).flat().forEach(p => {
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
}));
const pad = 0.001;
for (let k = 0; k < 3; k++) { lo[k] -= pad; hi[k] += pad; }
const q = (v, k) => Math.round((v - lo[k]) / (hi[k] - lo[k]) * 65535);

/* --- parts ---------------------------------------------------------------- */
const tissueOf = m => (G.materials[m] && G.materials[m].name || 'zanat-other').replace(/^zanat-/, '');
const chunks = [];
let bytes = 0, maxErr = 0, points = 0, pointsBefore = 0;
const parts = nodes.map(n => {
  const prims = n.mesh !== undefined ? G.meshes[n.mesh].primitives : [];
  let nv = 0, ni = 0;
  prims.forEach(p => { nv += G.accessors[p.attributes.POSITION].count; ni += G.accessors[p.indices].count; });
  if (nv > 65535) die(n.name + ': ' + nv + ' vertices will not index in 16 bits; decimate it');
  const P = new Uint16Array(nv * 3), I = new Uint16Array(ni), groups = [];
  let vo = 0, io = 0;
  prims.forEach(p => {
    const pos = acc(p.attributes.POSITION), idx = acc(p.indices);
    for (let i = 0; i < pos.length; i++) {
      const k = i % 3, v = q(pos[i], k);
      P[vo * 3 + i] = v;
      maxErr = Math.max(maxErr, Math.abs(lo[k] + v / 65535 * (hi[k] - lo[k]) - pos[i]));
    }
    for (let i = 0; i < idx.length; i++) I[io + i] = idx[i] + vo;
    groups.push([io, idx.length, tissueOf(p.material)]);
    vo += pos.length / 3; io += idx.length;
  });
  chunks.push(Buffer.from(P.buffer), Buffer.from(I.buffer));
  bytes += P.byteLength + I.byteLength;
  const x = n.extras || {};
  const rec = { name: x.part || n.name, side: x.side, system: x.system, group: x.group || null,
    lineage: x.lineage ? JSON.parse(x.lineage) : [], v: nv, i: ni, groups };
  if (x.centreline && !x.radius) rec.cl = JSON.parse(x.centreline).map(sp => thin(sp).map(i => sp[i]));
  if (x.radius) {
    /* a centreline-only part: its thinned points and radii go in the binary */
    const cl = JSON.parse(x.centreline), rad = JSON.parse(x.radius);
    const kept = cl.map((sp, s) => thin(sp, rad[s]));
    rec.as = 'centreline';
    rec.n = kept.map(k => k.length);
    const N = rec.n.reduce((a, b) => a + b, 0), C = new Uint16Array(N * 4);
    let o = 0;
    kept.forEach((k, s) => k.forEach(i => { for (let j = 0; j < 3; j++) C[o * 3 + j] = q(cl[s][i][j], j); o++; }));
    o = 0;
    kept.forEach((k, s) => k.forEach(i => { C[N * 3 + o] = Math.min(65535, Math.round(rad[s][i] / 1e-5)); o++; }));
    chunks.push(Buffer.from(C.buffer));
    bytes += C.byteLength;
    points += N; pointsBefore += cl.flat().length;
  }
  return rec;
});
const data = Buffer.concat(chunks).toString('base64');
const ANATOMY = {
  source: { glb: path.basename(glbPath), bytes: b.length, recipe: M.recipe },
  licence: M.licence, attribution: M.attribution,
  box: [lo, hi].map(v => v.map(x => +x.toFixed(5))),
  tissues: M.tissues, parts, data
};

/* --- write it into the page ------------------------------------------------ */
const html = fs.readFileSync(htmlPath, 'utf8');
const BEGIN = '/* ANATOMY:BEGIN -- written by tools/anatomy/zanatomy-pack.js, do not edit by hand */';
const END = '/* ANATOMY:END */';
const i0 = html.indexOf(BEGIN), i1 = html.indexOf(END);
if (i0 < 0 || i1 < i0) die(path.basename(htmlPath) + ' has no ANATOMY markers');
fs.writeFileSync(htmlPath, html.slice(0, i0) + BEGIN + '\nconst ANATOMY = ' + JSON.stringify(ANATOMY) + ';\n' + html.slice(i1));
console.log(path.basename(htmlPath) + ': ' + parts.length + ' parts, ' + (bytes / 1024).toFixed(0) + ' KB of geometry (' +
  (data.length / 1024).toFixed(0) + ' KB as base64), worst quantisation error ' + (maxErr * 1000).toFixed(3) + ' mm' +
  (points ? '; ' + points + ' centreline points (thinned from ' + pointsBefore + ')' : ''));
