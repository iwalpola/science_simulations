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

/* --- one box round everything ------------------------------------------- */
const nodes = G.nodes.filter(n => n.mesh !== undefined);
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
nodes.forEach(n => G.meshes[n.mesh].primitives.forEach(p => {
  const a = G.accessors[p.attributes.POSITION];
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
}));
const pad = 0.001;
for (let k = 0; k < 3; k++) { lo[k] -= pad; hi[k] += pad; }
const q = (v, k) => Math.round((v - lo[k]) / (hi[k] - lo[k]) * 65535);

/* --- parts ---------------------------------------------------------------- */
const tissueOf = m => (G.materials[m] && G.materials[m].name || 'zanat-other').replace(/^zanat-/, '');
const chunks = [];
let bytes = 0, maxErr = 0;
const parts = nodes.map(n => {
  const prims = G.meshes[n.mesh].primitives;
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
  if (x.centreline) rec.cl = JSON.parse(x.centreline);
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
  (data.length / 1024).toFixed(0) + ' KB as base64), worst quantisation error ' + (maxErr * 1000).toFixed(3) + ' mm');
