// Checks for projectiles.html. Reads the page as text, runs the MODEL and DRAW
// regions under node (no DOM, no three.js), and checks the catalogue.
//   cd mechanics && node test-projectiles.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const here = __dirname, root = path.join(here, '..');
const html = fs.readFileSync(path.join(here, 'projectiles.html'), 'utf8');

let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('FAIL  ' + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); }
function region(name) {
    const a = html.indexOf(`/* ${name}:BEGIN */`), b = html.indexOf(`/* ${name}:END */`);
    if (a < 0 || b < 0 || b < a) throw new Error('region ' + name + ' not found');
    return html.slice(a, b);
}

const M = vm.runInNewContext(
    region('MODEL') + region('DRAW') +
    ';({launch,posAt,velAt,timeAtHeight,timeAtX,resolveSpec,segment,CELLS,howText,fmt,dragPath,dragAt,PRESETS,' +
    'niceStep,tickText,fitView,toScreen,nearestT,drawScene})', { Math, String, Number, isFinite });

function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }

// ── the model against the textbook ─────────────────────────────────────
{
    const L = M.launch({ u: 21, ang: 45, h: 0, g: 9.81 });
    near(L.vx, 21 * Math.cos(Math.PI / 4), 1e-12, 'vx');
    near(L.T, 2 * 21 * Math.sin(Math.PI / 4) / 9.81, 1e-12, 'flat-ground time of flight 2u sinθ/g');
    near(M.posAt(L, L.T).y, 0, 1e-9, 'lands at y = 0');
    near(L.apexT, L.vy / 9.81, 1e-12, 'apex time');
    near(L.apexY, L.vy * L.vy / (2 * 9.81), 1e-12, 'apex height');
    near(L.range, 21 * 21 * Math.sin(Math.PI / 2) / 9.81, 1e-9, 'range u² sin2θ / g');
    near(M.velAt(L, L.apexT).vy, 0, 1e-12, 'vertical velocity is zero at the top');
    ok(M.launch({ u: 15, ang: 90, h: 0, g: 9.81 }).vx === 0, 'straight up has exactly zero horizontal speed');
    ok(M.launch({ u: 0, ang: 0, h: 0, g: 9.81 }).T === 0, 'no speed and no height is no flight');
}

// ── every cell obeys the equations it claims, for random launches and segments ──
{
    const r = rng(7);
    let n = 0;
    for (let i = 0; i < 400; i++) {
        const h = r() < 0.5 ? 0 : r() * 100;
        const p = { u: 1 + r() * 80, ang: (h > 0 ? -50 : 0) + r() * (h > 0 ? 140 : 90), h, g: 1 + r() * 20 };
        const L = M.launch(p);
        if (L.T <= 0) continue;
        const t0 = r() * L.T, t1 = t0 + r() * (L.T - t0);
        for (const sign of [1, -1]) {
            const m = M.segment(L, t0, t1, sign), v = m.v, hz = m.h;
            n++;
            near(v.S, v.U * v.T + 0.5 * v.A * v.T * v.T, 1e-7 * (1 + Math.abs(v.S)), 's = ut + ½at²');
            near(v.V, v.U + v.A * v.T, 1e-7 * (1 + Math.abs(v.V)), 'v = u + at');
            near(v.V * v.V, v.U * v.U + 2 * v.A * v.S, 1e-6 * (1 + v.V * v.V), 'v² = u² + 2as');
            near(hz.S, hz.U * hz.T, 1e-7 * (1 + Math.abs(hz.S)), 'horizontal s = ut');
            ok(v.T === hz.T, 'the same t in both columns');
            near(v.A, -sign * p.g, 1e-12, 'a is ∓g');
        }
        const up = M.segment(L, t0, t1, 1), dn = M.segment(L, t0, t1, -1);
        for (const k of ['S', 'U', 'V', 'A']) near(dn.v[k], -up.v[k], 1e-9, 'flipping the sign flips vertical ' + k);
        ok(dn.v.T === up.v.T && dn.h.S === up.h.S && dn.h.U === up.h.U, 'the sign leaves time and the horizontal alone');
    }
    ok(n > 500, 'random segments checked: ' + n);
}

// ── the worked examples have the answers the teacher's notes give ──
{
    const P = Object.fromEntries(M.PRESETS.map(p => [p.id, p]));
    const get = id => { const p = P[id], L = M.launch(p.p); return { p, L, ts: p.markers.map(s => M.resolveSpec(L, s)) }; };

    const coin = get('coin'); // down is positive, as the notes have it
    near(M.segment(coin.L, 0, coin.ts[0], coin.p.sign).v.S, 1.226, 0.001, 'table height 1.23 m');
    near(M.segment(coin.L, 0, coin.ts[0], coin.p.sign).h.S, 0.2, 1e-9, 'coin lands 0.20 m out');
    near(coin.ts[0], 0.5, 1e-9, 'coin falls for 0.50 s');

    const can = get('cannon');
    near(M.posAt(can.L, can.ts[0]).y, 9, 1e-9, 'hoop is 9.0 m up');
    ok(can.ts[0] < can.L.apexT, 'the hoop is passed on the way up');
    near(M.posAt(can.L, can.ts[1]).y, 0, 1e-9, 'the net is at cannon height');
    near(M.posAt(can.L, can.ts[0]).x, 12.45, 0.01, 'hoop 12.5 m away');
    near(M.posAt(can.L, can.ts[1]).x, 44.95, 0.01, 'net 45.0 m away');

    const cat = get('catapult');
    near(M.posAt(cat.L, cat.ts[0]).x, 76, 1e-9, 'tree is 76 m out');
    near(M.posAt(cat.L, cat.ts[0]).y - 75, 15.0, 0.1, 'the rock clears the 75 m tree by about 15 m');
    near(M.segment(cat.L, 0, cat.ts[1], 1).v.S, -60, 1e-9, 'castle to ground is −60 m');

    const apex = get('apex');
    near(M.segment(apex.L, 0, apex.ts[0], 1).v.V, 0, 1e-9, 'v = 0 at the top');
    const up = get('up');
    near(M.segment(up.L, 0, up.ts[1], 1).v.S, 0, 1e-9, 'thrown up and caught: s = 0');
    near(M.segment(up.L, 0, up.ts[1], 1).v.V, -15, 1e-9, 'thrown up and caught: v = −u');

    ok(new Set(M.PRESETS.map(p => p.id)).size === M.PRESETS.length, 'preset ids are unique');
    for (const p of M.PRESETS) {
        const { L, ts } = get(p.id);
        ok(L.T > 0, p.id + ' flies');
        ok(ts.every(t => t != null && t >= 0 && t <= L.T), p.id + ' markers resolve onto the path');
        ok(p.markers.length <= 3, p.id + ' has at most three markers');
        ok(p.p.u >= 0 && p.p.u <= 100 && p.p.h >= 0 && p.p.h <= 150 && p.p.g >= 0.5 && p.p.g <= 30, p.id + ' inside the slider ranges');
        ok(p.p.ang >= (p.p.h > 0 ? -60 : 0) && p.p.ang <= 90, p.id + ' angle in range');
        if (p.id !== 'free') ok(p.q && p.q.length > 20, p.id + ' carries its question');
    }
    ok(M.timeAtHeight(M.launch({ u: 10, ang: 45, h: 0, g: 9.81 }), 100, 'up') === null, 'an unreachable height gives no time');
}

// ── air resistance ──
{
    const L = M.launch({ u: 40, ang: 40, h: 0, g: 9.81 });
    const D0 = M.dragPath(L, 0);
    for (const f of [0.1, 0.4, 0.8, 1]) {
        const t = L.T * f, a = M.dragAt(D0, t), b = M.posAt(L, t);
        near(a.x, b.x, 1e-3, 'k = 0 reproduces the ideal x'); near(a.y, b.y, 1e-3, 'k = 0 reproduces the ideal y');
    }
    near(D0.T, L.T, 1e-3, 'k = 0 flight time');
    const D = M.dragPath(L, 0.004);
    ok(D.x1 < L.range * 0.95, 'drag shortens the range');
    ok(D.T < L.T, 'drag shortens the time of flight');
    ok(Math.max(...D.ys) < L.apexY, 'drag lowers the top of the flight');
    near(M.dragAt(D, D.T + 5).y, 0, 1e-12, 'drag path ends on the ground');
    let mono = true; for (let i = 1; i < D.xs.length; i++) if (D.xs[i] < D.xs[i - 1]) mono = false;
    ok(mono, 'drag never sends the ball backwards');
    const ideal = M.launch({ u: 40, ang: 40, h: 20, g: 9.81 }), Dh = M.dragPath(ideal, 0.004);
    ok(Dh.x1 < ideal.range && Dh.T > 0, 'drag from a height still lands, and short');
    ok(M.dragPath(M.launch({ u: 0, ang: 0, h: 0, g: 9.81 }), 0.004).T === 0, 'no flight, no drag path');
}

// ── number formatting ──
{
    ok(M.fmt(14.8492) === '14.8', '3 s.f.'); ok(M.fmt(-9.81) === '−9.81', 'minus sign is a real minus');
    ok(M.fmt(1e-14) === '0' && M.fmt(-1e-14) === '0', 'rounding noise is zero'); ok(M.fmt(1234.5) === '1230', 'large numbers do not go exponential');
    ok(M.fmt(0.4) === '0.4', 'short numbers stay short'); ok(M.fmt(NaN) === '–', 'NaN is a dash');
}

// ── every frame draws, and nothing it is handed is NaN ──
{
    let bad = 0, calls = 0, strokes = 0;
    const ctx = new Proxy({}, {
        get: (o, k) => (typeof k === 'symbol' ? undefined : (...a) => {
            calls++; if (k === 'stroke' || k === 'fill') strokes++;
            for (const x of a) if (typeof x === 'number' && !isFinite(x)) { bad++; if (bad < 4) console.log('  non-finite argument to', k, a); }
            return k === 'measureText' ? { width: 10 } : undefined;
        }),
        set: () => true
    });
    const th = { sky: '#fff', ground: '#ccc', grid: '#eee', muted: '#888', ink: '#000', path: '#f00', drag: '#888', plat: '#654', trunk: '#432', leaf: '#4a4', ball: '#000', hl: '#f008', m: ['#0a0', '#aa0', '#a0a'] };
    for (const p of M.PRESETS) {
        const L = M.launch(p.p), D = p.drag != null ? M.dragPath(L, p.drag) : M.dragPath(L, 0.003);
        const ts = p.markers.map(s => M.resolveSpec(L, s)); while (ts.length < 3) ts.push(null);
        for (const [W, H] of [[900, 500], [1400, 700], [400, 300]]) {
            const v = M.fitView(L, W, H, 0);
            ok(v.s > 0 && isFinite(v.s), p.id + ' view has a scale');
            const [ex, ey] = M.toScreen(v, L.range, 0);
            ok(ex <= W && ey <= H && M.toScreen(v, 0, L.apexY)[1] >= 0, `${p.id} path fits ${W}x${H}`);
            for (let i = 0; i <= 40; i++) {
                const t = L.T * i / 40, a = ts[0] != null ? ts[0] : 0, b = ts[1] != null ? ts[1] : L.T;
                M.drawScene(ctx, { W, H, dpr: 1, v, L, D: i % 2 ? D : null, th, fs: 14, markers: ts, armed: i % 3 === 0 ? 0 : null, t, playing: i % 2 === 0, vec: true, props: p.props || [], seg: { t0: Math.min(a, b), t1: Math.max(a, b) } });
            }
        }
    }
    ok(bad === 0, 'no non-finite number reached the canvas (' + bad + ')');
    ok(strokes > 1000 && calls > 10000, 'frames actually draw (' + calls + ' calls)');
    // a degenerate launch still draws
    const L0 = M.launch({ u: 0, ang: 0, h: 0, g: 9.81 }), v0 = M.fitView(L0, 800, 500, 0);
    M.drawScene(ctx, { W: 800, H: 500, dpr: 1, v: v0, L: L0, D: null, th, fs: 14, markers: [null, null, null], armed: null, t: 0, playing: false, vec: true, props: [], seg: null });
    ok(bad === 0, 'a launch with no flight draws without NaN');
}

// ── picking a point on the path ──
{
    const L = M.launch({ u: 21, ang: 45, h: 0, g: 9.81 }), v = M.fitView(L, 1000, 600, 0);
    for (const f of [0, 0.13, 0.5, 0.77, 1]) {
        const t = L.T * f, p = M.posAt(L, t), q = M.toScreen(v, p.x, p.y), n = M.nearestT(L, v, q[0], q[1]);
        near(n.t, t, 0.02 * L.T, 'clicking the path at f = ' + f + ' finds that time'); ok(n.d < 1, 'and is on it');
    }
    const far = M.nearestT(L, v, 5, 5);
    ok(far.d > 70, 'a click far from the path is far from it');
    const tall = M.launch({ u: 15, ang: 90, h: 0, g: 9.81 }), vt = M.fitView(tall, 1000, 600, 0);
    const q = M.toScreen(vt, 0, tall.apexY), n = M.nearestT(tall, vt, q[0] + 3, q[1]);
    near(n.t, tall.apexT, 0.05, 'the top of a vertical throw is found even though x never changes');
    const lock = M.fitView(L, 1000, 600, 1e-3);
    near(lock.s, 1e-3, 1e-12, 'locked zoom keeps the scale it was given');
}

// ── the page itself ──
ok(!/<script[^>]+src=/i.test(html), 'no external script: one self-contained file');
ok(!/<link[^>]+stylesheet/i.test(html), 'no external stylesheet');
ok(!/Math\.random/.test(html), 'nothing random');
{
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    const tour = [...html.matchAll(/sel: '#([\w-]+)'/g)].map(m => m[1]);
    ok(tour.length >= 8, 'the tour has its steps (' + tour.length + ')');
    tour.forEach(t => ok(ids.has(t), 'tour step points at #' + t));
    ['u', 'ang', 'h', 'g'].forEach(k => { ids.add('n_' + k); ids.add('s_' + k); }); // built from PARS
    const used = [...html.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]);
    used.filter(u => !ids.has(u)).forEach(u => ok(false, 'script reads #' + u + ' but the page has no such id'));
    ok(M.CELLS.length === 8 && M.CELLS.filter(c => c[0] === 'v').map(c => c[1]).join('') === 'SUVAT', 'vertical block is S U V A T');
    ok(M.CELLS.filter(c => c[0] === 'h').map(c => c[1]).join('') === 'SUT', 'horizontal block is S U T');
    ok(/Math\.min\(Math\.max\(/.test(html), 'times are clamped');
    ok(/9\.81/.test(html), 'default g is 9.81');
}

// ── catalogue ──
{
    const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const m = idx.match(/const SIMS = (\[[\s\S]*?\n    \]);/);
    ok(!!m, 'SIMS array found');
    const sims = JSON.parse(m[1].replace(/,\s*\]$/, ']'));
    const e = sims.find(s => s.u === 'mechanics/projectiles.html');
    ok(e && e.s === 'Mechanics' && e.c.includes('physics') && e.d.length > 40, 'projectiles is in the search list');
    sims.forEach(s => ok(fs.existsSync(path.join(root, s.u)), 'search entry resolves: ' + s.u));
    ok(/href="\.\/mechanics\/index\.html"/.test(idx), 'root page has a Mechanics card');
    const sub = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
    ok(/href="projectiles\.html"/.test(sub), 'mechanics/index.html links to the sim');
    ok(/href="index\.html"/.test(html), 'the sim links back to Mechanics');
}

console.log(`${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
