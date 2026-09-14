/* ============================================================
   ADAPTATION ANNOTATIONS — shared by the specialised-cell pages.
   A card on the left steps through the GCSE adaptations with
   previous / next buttons (or the arrow keys), and a leader line
   tracks the matching structure on the 3D model every frame.

   CellAdaptations.init({
     camera, heading, theme: { accent, text, bright, bg, border },
     items: [{ title, text, anchor: () => THREE.Vector3 | null }]
   })
   anchor returns a WORLD-space point, or null for "not shown".

   Returns { box, setPaused } — box is the card element (pages can
   append their own controls), setPaused(true) hides the card and
   its leader line and ignores the arrow keys.
   ============================================================ */
const CellAdaptations = (() => {
  function init(opts) {
    const { camera, items, heading = 'ADAPTATIONS' } = opts;
    const th = Object.assign({
      accent: '#f2b01e', text: '#b8c2ca', bright: '#eef3f6',
      bg: 'rgba(12,12,16,0.9)', border: '#2a2f38'
    }, opts.theme || {});

    const css = document.createElement('style');
    css.textContent = `
      #adapt {
        position:absolute; left:16px; top:84px; width:290px; max-height:calc(100vh - 130px);
        overflow-y:auto; box-sizing:border-box; background:${th.bg}; border:1px solid ${th.border};
        border-left:3px solid ${th.accent}; border-radius:6px; padding:12px 14px 12px;
        font-family:'Courier New', monospace; color:${th.text}; backdrop-filter:blur(4px);
        z-index:5;
      }
      #adapt .hd { display:flex; justify-content:space-between; font-size:10px; letter-spacing:1.5px; color:${th.accent}; }
      #adapt h3 { margin:8px 0 6px; font-size:14px; color:${th.bright}; letter-spacing:0.5px; line-height:1.3; }
      #adapt p { margin:0; font-size:12px; line-height:1.55; }
      #adapt p b { color:${th.bright}; font-weight:bold; }
      #adapt .ns { margin-top:6px; font-size:10px; font-style:italic; opacity:0.75; }
      #adapt .nav { display:flex; gap:6px; margin-top:12px; }
      #adapt button {
        flex:1; background:transparent; color:${th.bright}; border:1px solid ${th.border};
        border-radius:4px; font-family:inherit; font-size:12px; padding:6px 0; cursor:pointer;
      }
      #adapt button:hover { border-color:${th.accent}; color:${th.accent}; }
      #adapt .dots { display:flex; gap:5px; justify-content:center; margin-top:10px; }
      #adapt .dots span { width:7px; height:7px; border-radius:50%; background:${th.border}; cursor:pointer; }
      #adapt .dots span.on { background:${th.accent}; }
      #adaptSvg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:4; }
      #adaptSvg .pulse { transform-box:fill-box; transform-origin:center; animation:adaptPulse 1.6s ease-out infinite; }
      @keyframes adaptPulse { from { transform:scale(1); opacity:0.9; } to { transform:scale(3.2); opacity:0; } }
    `;
    document.head.appendChild(css);

    const box = document.createElement('div');
    box.id = 'adapt';
    box.innerHTML = `
      <div class="hd"><span>${heading}</span><span id="adaptCount"></span></div>
      <h3 id="adaptTitle"></h3>
      <p id="adaptText"></p>
      <div class="ns" id="adaptNote" hidden>not shown on this model</div>
      <div class="nav"><button id="adaptPrev">&#9664; previous</button><button id="adaptNext">next &#9654;</button></div>
      <div class="dots" id="adaptDots"></div>`;
    document.body.appendChild(box);
    ['mousedown', 'wheel', 'touchstart'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation()));

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'adaptSvg';
    svg.innerHTML = `
      <path id="adaptLine" fill="none" stroke="${th.accent}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.85"/>
      <circle id="adaptRing" class="pulse" r="6" fill="none" stroke="${th.accent}" stroke-width="1.5"/>
      <circle id="adaptDot" r="4" fill="${th.accent}" stroke="#000" stroke-width="1"/>`;
    document.body.appendChild(svg);

    const $ = id => document.getElementById(id);
    const line = $('adaptLine'), ring = $('adaptRing'), dot = $('adaptDot');
    const dots = items.map((_, i) => {
      const d = document.createElement('span');
      d.title = items[i].title;
      d.addEventListener('click', () => show(i));
      $('adaptDots').appendChild(d);
      return d;
    });

    let idx = 0, paused = false;
    function show(i) {
      idx = (i + items.length) % items.length;
      const it = items[idx];
      $('adaptCount').textContent = `${idx + 1} / ${items.length}`;
      $('adaptTitle').textContent = it.title;
      $('adaptText').innerHTML = it.text;
      $('adaptNote').hidden = !!it.anchor;
      dots.forEach((d, k) => d.classList.toggle('on', k === idx));
    }
    $('adaptPrev').addEventListener('click', () => show(idx - 1));
    $('adaptNext').addEventListener('click', () => show(idx + 1));
    window.addEventListener('keydown', e => {
      if (paused || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
    show(0);

    // registered after the page's own render loop, so it reads this frame's matrices
    function track() {
      requestAnimationFrame(track);
      if (paused) { svg.style.display = 'none'; return; }
      const it = items[idx];
      let p = null;
      try { p = it.anchor ? it.anchor() : null; } catch (err) { p = null; }
      let visible = false;
      if (p) {
        const v = p.clone().project(camera);
        if (v.z < 1 && v.z > -1) {
          const x = (v.x + 1) / 2 * window.innerWidth;
          const y = (1 - v.y) / 2 * window.innerHeight;
          const r = $('adaptTitle').getBoundingClientRect();
          const sx = box.getBoundingClientRect().right, sy = r.top + r.height / 2;
          line.setAttribute('d', `M${sx},${sy} H${sx + 22} L${x},${y}`);
          dot.setAttribute('cx', x); dot.setAttribute('cy', y);
          ring.setAttribute('cx', x); ring.setAttribute('cy', y);
          visible = true;
        }
      }
      svg.style.display = visible ? '' : 'none';
    }
    track();

    return {
      box,
      setPaused(p) { paused = p; box.hidden = p; }
    };
  }
  return { init };
})();
