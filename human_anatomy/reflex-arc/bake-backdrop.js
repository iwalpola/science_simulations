/* Bakes the 3D model behind the reflex arc story into the page.
 *
 *   node human_anatomy/reflex-arc/bake-backdrop.js          (rewrites scene.html)
 *   node human_anatomy/reflex-arc/bake-backdrop.js --debug  (also writes debug-*.png)
 *
 * WHY THIS EXISTS
 * scene.gltf + scene.bin is the Z-Anatomy "Neurology" model: 84 MB, two
 * million triangles, and no usable labels (Sketchfab's export merged every
 * part that shares a material and renamed the lot Object_N). It is far too
 * big to ship to a classroom, and a page that fetch()es a .gltf cannot be
 * opened off disk. So the story does not load it at all. This script
 * rasterises it once, side on, into a few small transparent PNGs, and writes
 * them into scene.html as data URIs between the BAKED markers. The page needs
 * nothing but itself.
 *
 * The rasteriser is a plain z-buffer with per-pixel normals, supersampled
 * 2x2. No three.js, no GPU, no dependencies -- just node.
 *
 * WHAT COMES OUT
 *   body   bones, nerves and brain of everything except the near forearm
 *   arm    the near forearm and hand, as its own layer, so the page can swing
 *          it about the elbow when the biceps contracts
 *   flesh  a soft outline round each skeleton layer. The model has no skin
 *          or muscle at all; this is DRAWN IN, offset from the bones, and the
 *          page says so.
 * plus landmarks the page lays the drawn neurones along: elbow pivot,
 * fingertip, wrist, shoulder, the line of the spinal canal, the brain.
 *
 * The far arm is dropped: side on it would sit exactly behind the near one.
 *
 * Licence: the model is CC-BY-SA-4.0 (Z-Anatomy). What this writes is a
 * derivative of it, so the baked images carry that licence and the page
 * credits it on screen.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HERE = __dirname;
const DEBUG = process.argv.includes('--debug');

/* ===================================================================
   THE VIEW
   Model space is z up, metres. -y is the front of the body (the eyes sit
   at y = -0.07), +x is the near side. The camera sits out at +x looking
   back along -x, so the screen shows y across (front of the body on the
   LEFT) and z up. Orthographic: no perspective to fight with when the page
   lays its own drawing on top.
   =================================================================== */
const K = 1100;            /* final pixels per metre */
const SS = 2;              /* supersampling, each way */
const FAR_X = -0.16;       /* anything further over than this is the far arm */
const ARM_X = 0.17;        /* the near arm hangs beyond this */
const Z_CUT = 0.62;        /* the bench hides everything below about here */
const BODY = { y0: -0.170, y1: 0.150, z0: 0.64, z1: 1.765 };
/* the drawn-in outline: offset R from the bones, with gaps narrower than
   2A closed over, so the neck and armpit read as solid */
const FLESH_R = 0.018, FLESH_A = 0.045;

/* Which material is which tissue. Everything else -- eyes, teeth, arteries,
   the fluid spaces of the brain -- is left out of the backdrop. */
const TISSUE = {
  'Bone': 'bone', 'Bone.003': 'bone', 'Suture': 'bone',
  'Cartilage': 'bone', 'Cartilage.001': 'bone', 'Cartilage.002': 'bone', 'Cartilage.003': 'bone',
  'Nerve.001': 'nerve',
  'Brain.001': 'brain', 'Cerebellum.001': 'brain', 'White_matter.001': 'brain',
  'None': 'cord'
};
const COLOUR = {
  bone: [0.94, 0.90, 0.81],
  nerve: [0.88, 0.70, 0.26],
  brain: [0.93, 0.66, 0.68],
  cord: [0.93, 0.66, 0.68]
};

/* ===================================================================
   READING THE MODEL
   =================================================================== */
const gltf = JSON.parse(fs.readFileSync(path.join(HERE, 'scene.gltf'), 'utf8'));
const bin = fs.readFileSync(path.join(HERE, 'scene.bin'));
function accessor(i) {
  const a = gltf.accessors[i], bv = gltf.bufferViews[a.bufferView];
  const off = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type] * a.count;
  const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
  return new C(bin.buffer.slice(off, off + n * C.BYTES_PER_ELEMENT));
}
/* The scene graph is one root matrix (z-up to y-up) over a flat list of
   meshes with no transforms of their own, so raw positions are model space. */
gltf.nodes.forEach((n, i) => {
  if (i > 1 && (n.matrix || n.translation || n.rotation || n.scale))
    throw new Error('node ' + i + ' has its own transform; the bake assumes none');
});

/* Weld coincident positions and split a mesh into connected pieces. A bone
   is a piece, a stretch of nerve tube is a piece. */
function pieces(P, I) {
  const nv = P.length / 3, key = new Map(), weld = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = Math.round(P[3 * i] * 1e5) + ',' + Math.round(P[3 * i + 1] * 1e5) + ',' + Math.round(P[3 * i + 2] * 1e5);
    let w = key.get(k); if (w === undefined) { w = i; key.set(k, i); }
    weld[i] = w;
  }
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) {
    const a = find(weld[I[t]]), b = find(weld[I[t + 1]]), c = find(weld[I[t + 2]]);
    par[b] = a; par[find(c)] = a;
  }
  const root = new Int32Array(nv);
  for (let i = 0; i < nv; i++) root[i] = find(weld[i]);
  return root;
}

/* Every triangle we keep, flattened: positions, normals, tissue, and which
   piece it came from (so a bone is never split between layers). */
const meshes = [];
gltf.meshes.forEach((m, mi) => {
  const p = m.primitives[0];
  if ((p.mode ?? 4) !== 4) return;
  const tissue = TISSUE[gltf.materials[p.material].name];
  if (!tissue) return;
  const P = accessor(p.attributes.POSITION), N = accessor(p.attributes.NORMAL), I = accessor(p.indices);
  meshes.push({ mi, tissue, P, N, I, root: pieces(P, I) });
});

/* Per-piece statistics, used to find the arm bones and the landmarks. */
function pieceStats(m) {
  const S = new Map();
  for (let i = 0; i < m.P.length / 3; i++) {
    const r = m.root[i];
    let s = S.get(r);
    if (!s) S.set(r, s = { n: 0, sx: 0, sy: 0, sz: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], verts: [] });
    const x = m.P[3 * i], y = m.P[3 * i + 1], z = m.P[3 * i + 2];
    s.n++; s.sx += x; s.sy += y; s.sz += z; s.verts.push(i);
    s.min[0] = Math.min(s.min[0], x); s.min[1] = Math.min(s.min[1], y); s.min[2] = Math.min(s.min[2], z);
    s.max[0] = Math.max(s.max[0], x); s.max[1] = Math.max(s.max[1], y); s.max[2] = Math.max(s.max[2], z);
  }
  S.forEach(s => { s.c = [s.sx / s.n, s.sy / s.n, s.sz / s.n]; });
  return S;
}
meshes.forEach(m => { m.stats = pieceStats(m); });

/* ===================================================================
   LANDMARKS
   Found from the geometry, not typed in, so a different model of the same
   body would still put the drawing in the right place.
   =================================================================== */
function vertsOf(filter) {
  const out = [];
  meshes.forEach(m => {
    if (m.tissue !== 'bone') return;
    m.stats.forEach(s => {
      if (!filter(s)) return;
      s.verts.forEach(i => out.push([m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2]]));
    });
  });
  return out;
}
const mean = vs => { const c = [0, 0, 0]; vs.forEach(v => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }); return c.map(x => x / vs.length); };

/* The humerus: the near-side bone that runs furthest down the upper arm. */
let humerus = null;
meshes.forEach(m => {
  if (m.tissue !== 'bone') return;
  m.stats.forEach(s => {
    if (s.c[0] < ARM_X - 0.02 || s.min[2] < 0.95 || s.min[2] > 1.2) return;
    const len = s.max[2] - s.min[2];
    if (len > 0.2 && (!humerus || len > humerus.max[2] - humerus.min[2])) humerus = s;
  });
});
if (!humerus) throw new Error('could not find the humerus');
const humVerts = vertsOf(s => s === humerus);
/* The elbow turns about the middle of the rounded end of the humerus, a
   centimetre or so above its lowest point. */
const humLow = mean(humVerts.filter(v => v[2] < humerus.min[2] + 0.02));
const PIVOT = [humLow[0], humLow[1], humerus.min[2] + 0.012];
const humTop = mean(humVerts.filter(v => v[2] > humerus.max[2] - 0.03));
const SHOULDER = humTop;
/* the front of the humerus halfway down: the biceps lies along it */
const humMid = humVerts.filter(v => Math.abs(v[2] - (humerus.min[2] + humerus.max[2]) / 2) < 0.02);
const HUM_FRONT = [mean(humMid)[0], Math.min(...humMid.map(v => v[1])), (humerus.min[2] + humerus.max[2]) / 2];

/* Everything below the elbow on the near side is the forearm and hand.
   Bones go whole, by where their middle is, so the point of the elbow (on
   the ulna, above the pivot) swings with the rest of the ulna. */
const inForearmPiece = s => s.c[0] > ARM_X && s.c[2] < PIVOT[2] && s.c[2] > Z_CUT - 0.1;
const armVerts = vertsOf(inForearmPiece);
let tipV = armVerts[0];
armVerts.forEach(v => { if (v[2] < tipV[2]) tipV = v; });
const TIP = tipV;
/* the wrist: the lower ends of the two long forearm bones */
const longArm = [];
meshes.forEach(m => {
  if (m.tissue !== 'bone') return;
  m.stats.forEach(s => { if (inForearmPiece(s) && s.max[2] - s.min[2] > 0.15) longArm.push(s); });
});
const wristZ = Math.max(...longArm.map(s => s.min[2]));
const WRIST = mean(vertsOf(s => longArm.includes(s)).filter(v => v[2] < wristZ + 0.02));

/* The spinal canal. The unnamed 'None' material is a stack of pieces down
   the middle of the neck and upper back, inside the vertebral column; their
   centres trace the canal. The page draws its own cord along this line --
   it does not claim the model's pieces ARE the cord. */
const CANAL = [];
meshes.forEach(m => {
  if (m.tissue !== 'cord') return;
  m.stats.forEach(s => { if (s.n > 200 && Math.abs(s.c[0]) < 0.01) CANAL.push([s.c[1], s.c[2]]); });
});
CANAL.sort((a, b) => b[1] - a[1]);
if (CANAL.length < 8) throw new Error('could not trace the spinal canal');

/* The brain: its overall box, and the brainstem, which is the narrow piece
   that hangs lowest. */
const brainBox = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
let stem = null;
meshes.forEach(m => {
  if (m.tissue !== 'brain') return;
  m.stats.forEach(s => {
    if (s.n < 200) return;
    for (let k = 0; k < 3; k++) { brainBox.min[k] = Math.min(brainBox.min[k], s.min[k]); brainBox.max[k] = Math.max(brainBox.max[k], s.max[k]); }
    if (s.max[0] - s.min[0] < 0.04 && (!stem || s.min[2] < stem.min[2])) stem = s;
  });
});
if (!stem) throw new Error('could not find the brainstem');

/* ===================================================================
   THE RASTERISER
   =================================================================== */
function target(box) {
  const W = Math.ceil((box.y1 - box.y0) * K), H = Math.ceil((box.z1 - box.z0) * K);
  const w = W * SS, h = H * SS;
  return {
    box, W, H, w, h,
    depth: new Float32Array(w * h).fill(-Infinity),
    n: new Float32Array(w * h * 3)
  };
}
function rasterise(T, P, N, ia, ib, ic) {
  const k = K * SS, y0 = T.box.y0, z1 = T.box.z1;
  const ax = (P[3 * ia + 1] - y0) * k, ay = (z1 - P[3 * ia + 2]) * k, ad = P[3 * ia];
  const bx = (P[3 * ib + 1] - y0) * k, by = (z1 - P[3 * ib + 2]) * k, bd = P[3 * ib];
  const cx = (P[3 * ic + 1] - y0) * k, cy = (z1 - P[3 * ic + 2]) * k, cd = P[3 * ic];
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(T.w - 1, Math.ceil(Math.max(ax, bx, cx)));
  const yA = Math.max(0, Math.floor(Math.min(ay, by, cy))), yB = Math.min(T.h - 1, Math.ceil(Math.max(ay, by, cy)));
  if (x0 > x1 || yA > yB) return;
  const inv = 1 / area;
  for (let py = yA; py <= yB; py++) {
    const sy = py + 0.5;
    for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5;
      const w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) * inv;
      const w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const d = w0 * ad + w1 * bd + w2 * cd;
      const i = py * T.w + px;
      if (d <= T.depth[i]) continue;
      T.depth[i] = d;
      for (let q = 0; q < 3; q++)
        T.n[3 * i + q] = w0 * N[3 * ia + q] + w1 * N[3 * ib + q] + w2 * N[3 * ic + q];
    }
  }
}

/* Lit from the camera side, a little from the front and above. The rim
   darkening gives every bone and nerve a drawn edge without a line pass. */
const LIGHT = (() => { const l = [0.78, -0.32, 0.54], s = Math.hypot(...l); return l.map(x => x / s); })();
function shadeAndShrink(T, col) {
  const out = new Uint8Array(T.W * T.H * 4);
  for (let Y = 0; Y < T.H; Y++) for (let X = 0; X < T.W; X++) {
    let r = 0, g = 0, b = 0, cov = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const i = (Y * SS + sy) * T.w + X * SS + sx;
      if (T.depth[i] === -Infinity) continue;
      let nx = T.n[3 * i], ny = T.n[3 * i + 1], nz = T.n[3 * i + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (nx < 0) { nx = -nx; ny = -ny; nz = -nz; }   /* double-sided */
      const dif = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const edge = 1 - nx;
      const k = (0.50 + 0.55 * dif) * (1 - 0.42 * edge * edge * edge);
      r += col[0] * k; g += col[1] * k; b += col[2] * k; cov++;
    }
    const o = 4 * (Y * T.W + X);
    if (!cov) continue;
    out[o] = Math.min(255, Math.round(255 * r / cov));
    out[o + 1] = Math.min(255, Math.round(255 * g / cov));
    out[o + 2] = Math.min(255, Math.round(255 * b / cov));
    out[o + 3] = Math.round(255 * cov / (SS * SS));
  }
  return { W: T.W, H: T.H, rgba: out };
}

/* ===================================================================
   THE DRAWN-IN OUTLINE
   A closing (dilate by A, erode back to R) of the bone silhouette, via an
   exact Euclidean distance transform. Anti-aliased on the distance.
   =================================================================== */
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/* distance from every pixel to the nearest pixel where inside() is true */
function edt(W, H, inside) {
  const BIG = 1e20, g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = inside(i) ? 0 : BIG;
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    edt1(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1(f, W, d, v, z);
    for (let x = 0; x < W; x++) g[y * W + x] = Math.sqrt(d[x]);
  }
  return g;
}
/* The mask is the union of the given layers -- the brain counts, because
   the model has no skull cap and the head would otherwise stop at the
   eyebrows. The work is done on a canvas padded by A all round, so the
   edge of the image counts as outside and does not hold the shape open. */
function flesh(imgs) {
  const { W, H } = imgs[0];
  const A = Math.round(FLESH_A * K), R = FLESH_R * K;
  const PW = W + 2 * A, PH = H + 2 * A;
  const solid = new Uint8Array(PW * PH);
  imgs.forEach(img => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (img.rgba[4 * (y * W + x) + 3] > 127) solid[(y + A) * PW + x + A] = 1;
  });
  const outP = edt(PW, PH, i => solid[i] === 1);                /* distance outside the mask */
  const backP = edt(PW, PH, i => outP[i] > A);                  /* depth inside the grown shape */
  const res = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, j = (y + A) * PW + x + A;
    /* inside if deeper than A-R into the grown shape: that is the mask
       offset by R, with any gap narrower than about 2A closed over */
    const s = backP[j] - (A - R);
    const a = Math.max(0, Math.min(1, s + 0.5));
    if (a <= 0) continue;
    /* a darker band just inside the edge, so the outline reads */
    const rim = Math.max(0, Math.min(1, 1 - (s - 1) / 2.5));
    res[4 * i] = Math.round(lerp(236, 192, rim));
    res[4 * i + 1] = Math.round(lerp(219, 160, rim));
    res[4 * i + 2] = Math.round(lerp(208, 146, rim));
    res[4 * i + 3] = Math.round(255 * a);
  }
  return { W, H, rgba: res };
}
function lerp(a, b, t) { return a + (b - a) * t; }

/* ===================================================================
   PNG
   =================================================================== */
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(img) {
  const { W, H, rgba } = img, stride = W * 4;
  /* transparent pixels carry no colour, so zero them: it compresses */
  for (let i = 0; i < W * H; i++) if (rgba[4 * i + 3] === 0) rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = 0;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    /* Paeth on every row: the images are smooth shading */
    raw[y * (stride + 1)] = 4;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = (x >= 4 && y > 0) ? rgba[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      raw[y * (stride + 1) + 1 + x] = (rgba[y * stride + x] - pr) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ===================================================================
   BAKE
   =================================================================== */
/* The forearm's box: wherever its bones go, plus room for the outline. */
const pad = FLESH_A + 0.01;
const ARMBOX = {
  y0: Math.min(...armVerts.map(v => v[1])) - pad, y1: Math.max(...armVerts.map(v => v[1])) + pad,
  z0: Math.min(...armVerts.map(v => v[2])) - pad, z1: PIVOT[2] + 0.04
};
const layers = {};
['body', 'arm'].forEach(L => ['bone', 'nerve', 'brain'].forEach(t => {
  layers[L + '.' + t] = target(L === 'body' ? BODY : ARMBOX);
}));

let kept = 0, dropped = 0;
meshes.forEach(m => {
  const tissue = m.tissue === 'cord' ? null : m.tissue;   /* the canal is a landmark, not a picture */
  if (!tissue) return;
  const { P, N, I, root, stats } = m;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const cx = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, cz = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
    if (cx < FAR_X || cz < Z_CUT) { dropped++; continue; }
    /* bones go whole; nerves are cut at the elbow, so they bend with it */
    const fore = tissue === 'bone'
      ? inForearmPiece(stats.get(root[a]))
      : (cx > ARM_X && cz < PIVOT[2]);
    rasterise(layers[(fore ? 'arm.' : 'body.') + tissue], P, N, a, b, c);
    kept++;
  }
});
console.log('triangles rasterised', kept.toLocaleString(), 'dropped', dropped.toLocaleString());

const IMG = {};
Object.keys(layers).forEach(k => { IMG[k] = shadeAndShrink(layers[k], COLOUR[k.split('.')[1]]); });
IMG['body.flesh'] = flesh([IMG['body.bone'], IMG['body.brain']]);
IMG['arm.flesh'] = flesh([IMG['arm.bone']]);
/* the forearm carries no brain */
delete IMG['arm.brain'];

/* the lowest point of the drawn-in fingertip, in model space: the hot plate
   sits exactly there */
const af = IMG['arm.flesh'];
let lowRow = -1, lowCols = [];
for (let y = af.H - 1; y >= 0 && lowRow < 0; y--)
  for (let x = 0; x < af.W; x++) if (af.rgba[4 * (y * af.W + x) + 3] > 127) { lowRow = y; lowCols.push(x); }
const SKIN_TIP = [ARMBOX.y0 + (lowCols.reduce((a, b) => a + b, 0) / lowCols.length + 0.5) / K, ARMBOX.z1 - (lowRow + 1) / K];

/* ===================================================================
   WRITE
   =================================================================== */
const r4 = x => Math.round(x * 1e4) / 1e4;
const p2 = v => [r4(v[1]), r4(v[2])];          /* model (x,y,z) -> screen plane (y,z) */
const p3 = v => v.map(r4);
const sizes = {};
const uri = k => { const b = png(IMG[k]); sizes[k] = b.length; if (DEBUG) fs.writeFileSync(path.join(HERE, 'debug-' + k.replace('.', '-') + '.png'), b); return 'data:image/png;base64,' + b.toString('base64'); };
const box = B => ({ y0: r4(B.y0), z1: r4(B.z1), w: null, h: null });
const bodyBox = box(BODY), armBox = box(ARMBOX);
bodyBox.w = IMG['body.bone'].W; bodyBox.h = IMG['body.bone'].H;
armBox.w = IMG['arm.bone'].W; armBox.h = IMG['arm.bone'].H;

const BAKED = {
  K,
  body: Object.assign(bodyBox, { flesh: uri('body.flesh'), bone: uri('body.bone'), nerve: uri('body.nerve'), brain: uri('body.brain') }),
  arm: Object.assign(armBox, { flesh: uri('arm.flesh'), bone: uri('arm.bone'), nerve: uri('arm.nerve') }),
  /* landmarks on the screen plane, (y, z) in metres */
  pivot: p2(PIVOT), tip: p2(TIP), skinTip: SKIN_TIP.map(r4), wrist: p2(WRIST),
  shoulder: p2(SHOULDER), humFront: p2(HUM_FRONT),
  canal: CANAL.map(c => c.map(r4)),
  brain: { y0: r4(brainBox.min[1]), y1: r4(brainBox.max[1]), z0: r4(brainBox.min[2]), z1: r4(brainBox.max[2]) },
  stem: [r4(stem.c[1]), r4(stem.min[2])],
  /* the same landmarks in 3D, so a length the page quotes is measured in
     the model rather than across a flat picture of it */
  tip3: p3(TIP), wrist3: p3(WRIST), pivot3: p3(PIVOT), shoulder3: p3(SHOULDER)
};
/* --debug: everything laid over everything, forearm in place, the canal
   and landmarks marked, so the bake can be checked by eye */
if (DEBUG) {
  const B = IMG['body.bone'], W = B.W, H = B.H, out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[4 * i] = 220; out[4 * i + 1] = 236; out[4 * i + 2] = 246; out[4 * i + 3] = 255; }
  const over = (img, ox, oy, alpha) => {
    for (let y = 0; y < img.H; y++) for (let x = 0; x < img.W; x++) {
      const X = x + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const s = 4 * (y * img.W + x), d = 4 * (Y * W + X), a = img.rgba[s + 3] / 255 * alpha;
      for (let q = 0; q < 3; q++) out[d + q] = Math.round(out[d + q] * (1 - a) + img.rgba[s + q] * a);
    }
  };
  const ox = Math.round((ARMBOX.y0 - BODY.y0) * K), oy = Math.round((BODY.z1 - ARMBOX.z1) * K);
  over(IMG['body.flesh'], 0, 0, 0.6); over(IMG['arm.flesh'], ox, oy, 0.6);
  over(IMG['body.bone'], 0, 0, 1); over(IMG['arm.bone'], ox, oy, 1);
  over(IMG['body.brain'], 0, 0, 0.8);
  over(IMG['body.nerve'], 0, 0, 0.8); over(IMG['arm.nerve'], ox, oy, 0.8);
  const dot = (y, z, c) => {
    const X = Math.round((y - BODY.y0) * K), Y = Math.round((BODY.z1 - z) * K);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = X + dx, yy = Y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const d = 4 * (yy * W + xx); out[d] = c[0]; out[d + 1] = c[1]; out[d + 2] = c[2];
    }
  };
  CANAL.forEach(c => dot(c[0], c[1], [40, 90, 220]));
  [PIVOT, TIP, WRIST, SHOULDER, HUM_FRONT].forEach(v => dot(v[1], v[2], [220, 30, 120]));
  dot(SKIN_TIP[0], SKIN_TIP[1], [20, 160, 60]);
  dot(stem.c[1], stem.min[2], [20, 160, 60]);
  fs.writeFileSync(path.join(HERE, 'debug-composite.png'), png({ W, H, rgba: out }));
}

const json = JSON.stringify(BAKED);
const htmlPath = path.join(HERE, 'scene.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const BEGIN = '/* BAKED:BEGIN -- written by bake-backdrop.js, do not edit by hand */';
const END = '/* BAKED:END */';
const i0 = html.indexOf(BEGIN), i1 = html.indexOf(END);
if (i0 < 0 || i1 < i0) throw new Error('scene.html has no BAKED markers');
fs.writeFileSync(htmlPath, html.slice(0, i0) + BEGIN + '\nconst BAKED=' + json + ';\n' + html.slice(i1));

Object.keys(sizes).forEach(k => console.log(k.padEnd(12), (IMG[k].W + 'x' + IMG[k].H).padEnd(10), (sizes[k] / 1024).toFixed(0) + ' KB'));
console.log('baked', (json.length / 1024).toFixed(0), 'KB into scene.html');
console.log('pivot', p2(PIVOT), 'tip', p2(TIP), 'skinTip', SKIN_TIP.map(r4), 'wrist', p2(WRIST), 'shoulder', p2(SHOULDER));
console.log('canal', CANAL.length, 'points', CANAL[0], '..', CANAL[CANAL.length - 1], 'stem', BAKED.stem);
