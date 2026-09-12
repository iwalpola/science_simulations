# Working in this repo

GCSE science simulations, by a teacher, for use on a projector. Every simulation
is a **single self-contained HTML file** with inline CSS and JS. That is a
deliberate constraint, not an accident: they get opened straight off disk, shared
as one file, and hosted on GitHub Pages. Do not introduce a build step, a bundler,
`node_modules` at runtime, or an external asset the page needs in order to work.

```
index.html                  the catalogue everything is listed in
reactionbuilder/            drag-and-drop reaction builder (+ test.js)
3dreactionscenes/           15 three.js scenes, one per GCSE reaction type
particles/                  particle-theory scenes (Brownian motion so far)
tools/                      one-off colour-migration scripts (animcolour.mjs, colourfix.mjs)
```

---

## Tests — run these before and after any change

```bash
cd 3dreactionscenes && node test-scenes.js      # ~14,500 checks
cd particles        && node test-particles.js   # ~500 checks
cd reactionbuilder  && node test.js             # needs: npm install jsdom
```

They read the HTML as text, pull out the species tables, captions, camera
tracks and timing windows, and check them. They catch: unbalanced equations,
captions out of order, camera tracks that do not cover their act, choreography
that is causally impossible (something arriving before it departs), element
colours drifting apart between scenes, and malformed camera vectors.

They cannot tell you whether anything **looks** right — there is no screenshot
harness in this repo, and none should be added. The user checks the visual
result themselves; do not spawn a browser to render or screenshot a scene as
part of your own workflow.

---

## Colour management — read this before touching any material

The scenes use **three.js r128** (old, and deliberately pinned; r152 renamed the
colour properties and r155 changed light intensities, so upgrading is a
15-file migration). r128 has two traps that are invisible in code:

**1. Output encoding is off by default.** Without this, everything renders
darker and flatter than authored:

```js
renderer.outputEncoding      = THREE.sRGBEncoding;   // r128 spelling
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
```

**2. Material colours are treated as linear, but hex codes are picked as sRGB.**
So `0x3d6f39` (a deep green) renders as mint. Fix once, after everything is
built:

```js
function linearise(root){
  root.traverse(o=>{
    if(!o.material) return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m || m.userData.__lin) return;
      m.userData.__lin = true;              // idempotent: rebuilds are safe
      if(m.color)    m.color.convertSRGBToLinear();
      if(m.emissive) m.emissive.convertSRGBToLinear();
    });
  });
}
```

> ⚠️ **`linearise()` is NOT safe to apply blindly.** There are ~35 places across
> the scenes where a colour is animated every frame — `liquidMat.color.setRGB(…)`,
> `piece.material.emissive.setRGB(…)`, `poolMat.color.copy(…)`. Those overwrite
> the converted value with an sRGB one on the next frame. Each such site needs
> `.convertSRGBToLinear()` appending at the point of assignment instead. Find
> them with:
> ```bash
> grep -n "\.color\.setRGB\|\.color\.set(\|\.color\.copy(\|\.color\.lerp\|emissive\.set" scene.html
> ```

Colour **textures** must also be declared: `tex.encoding = THREE.sRGBEncoding`
on any `CanvasTexture` used as a `map` or as an environment source.

### Environment maps are lights, not just reflections

Every surface takes diffuse light from `scene.environment`. A panorama painted
at the brightness of a real sky behaves like a floodlight with no off switch and
washes the entire scene out. Keep the environment **dim**, with small bright
blobs for highlights, and use `envMapIntensity` per material to taper it —
roughly: glass `1.4`, polished metal `0.9`, dark metal `0.55`, matte props
`0.25–0.35`, large background surfaces `0.10`.

#### The overhead panel is the usual culprit

The reaction scenes build their environment from a small box room with a white
ceiling panel. Because that panel is directly overhead, it lands on every
**upward-facing** face in the scene, and its specular term is not multiplied by
albedo — so a near-black material still returns cream. The symptom is always the
same: a flat horizontal surface reads as a pale lid while its own sides look
right. Slag on molten iron, a strip lying in a beaker, powder in a dish.

All fifteen scenes shipped with that panel at gain `3.2` (blast furnace `2.2`).
They are now `1.1` and `0.9`. If a top face blows out, check the panel gain
before you touch the material.

Two things that look like this bug but are not, so rule them out first:

* **A light metal against a black scene.** Magnesium at `0xc3cbd6` renders about
  `(175,186,196)` — a legitimate light grey that only *reads* as white because
  everything around it is near-black. Setting `envMapIntensity` to `0` barely
  moves it. Measure before you tune.
* **A milky liquid in front of it.** A "colourless" solution painted
  `(0.87,0.91,0.96)` at opacity `0.34` veils whatever stands in it. Forcing the
  submerged object to pure red and seeing salmon is the quick proof. Colourless
  solutions are now `(0.58,0.72,0.84)` at `0.20`.

### Coplanar surfaces z-fight

Every beaker put its surface disc at exactly the liquid cylinder cap height.
It only shows at some angles, so it survived a long time: the water in
`metal-water.html` was crawling with dashed streaks. Discs now sit `+0.004`
above the cap (`+0.006` for the big trough).

### Camera keys drift off the subject

Several scenes had a caption talking about one thing while the camera looked at
another — the limewater in `thermal-decomposition.html`, the dish of oxide in
`metal-oxygen.html`, the melt hidden behind an opaque crucible wall in
`electrolysis-molten.html`. Nothing in the test suite can catch this — check a
camera key against its caption by reading the track and the segment text
together, and flag it to the user if the two disagree.

### Large flat surfaces

Once sRGB output is correct, even a near-black albedo lifts to a visible grey,
so a big bench disc sweeps across the frame as a pale dome. Darkening further is
not the fix — paint a radial falloff into its colour `map` so it reads as a pool
of light fading to darkness. See the bench in `particles/brownian-motion.html`.

---

## How a scene is built

Every scene follows the same shape. Keep it.

- **Acts and worlds.** A macro world at the origin and one or two molecular
  worlds parked far away (`MICRO1_Y = 400`, `MICRO2_Y = -400`). The camera
  teleports between them behind a fade at `TRANSITIONS`, rather than juggling
  visibility. `worldAt(t)` decides which.
- **Everything is a pure function of `t`.** No stepped simulation, no
  accumulated state. Particles use closed forms — analytic ballistics, triangle
  waves for reflecting billiards, precomputed seeded waypoints for random walks.
  This is what makes scrubbing instant and every frame reproducible. **Do not
  introduce per-frame integration.**
- **Determinism.** Any randomness comes from the seeded `rng(seed)` so a rebuild
  looks identical. `Math.random()` at build time is tolerable for decorative
  scatter; never for anything the timeline depends on.
- **Species menus.** The gear button rebuilds the scene from a data table.
  Everything derived — equations, captions, colours, legend, cast size — comes
  from that table, so a new species needs no new choreography.
- **Timings belong to the reaction type, not the species.** Swapping the metal
  must not move the camera keys.
- **Refusal paths.** Where the chemistry says nothing happens (a metal below
  carbon, a halogen that cannot displace), animate the refusal rather than
  hiding the option. Tests assert the refusal path never transfers anything.

---

## Traps that have already cost time here

- **`p:[1,2,3}` instead of `]`** in camera tables. Made four times. The suite
  now sweeps for it (`brackets()` in `test-scenes.js`).
- **Scratch-vector aliasing.** `_pb.lerpVectors(a, _pb, u)` happens to work;
  passing the same scratch vector as two different arguments to `path3` does
  not. Give each a name.
- **Parent things to what holds them.** A prop positioned from
  `tongs.position` plus a world-space offset drifts out of the jaws the moment
  the tongs rotate. Make it a child instead.
- **Non-indexed geometry.** Displacing vertices by a per-vertex random number
  tears the mesh along every seam. Displace by a function of the *direction*
  instead, so shared positions get the same result. See `grainMesh()`.
- **`LatheGeometry` is an open surface.** Return the profile to `x = 0` if you
  want the top capped.
- **Tests that mirror the implementation prove nothing.** `leftovers()` in
  `electrolysis-aqueous.html` coupled two independent decisions and was wrong
  for one solution — and the test encoded the same mistake, so it passed. Assert
  the *property* (the loser stays, the winner does not), not the formula.
- **Region anchors in the test harness.** `region(js, 'function rng', '/* =====')`
  matched an earlier comment block and silently returned an empty string. Anchor
  on something unique.
- **Heredocs eat backslashes.** Writing JS regexes through `bash <<'EOF'` mangles
  them. Use the Write tool for anything containing `\`.

---

## Teaching conventions

These are a teacher's materials. Accuracy is the product.

- **One palette across every scene.** An element must not change colour between
  scenes; `test-scenes.js` enforces it for 9 elements and 8 metals, plus radii
  and solution colours. Electrons are `0xffe070` everywhere.
- **Ion sizes carry meaning.** A cation is smaller than its atom; an anion is
  bigger. Scenes animate that change and tests assert it.
- **Spectator ions must visibly do nothing**, and be labelled as such.
- **Do not offer chemistry that does not work.** Pairs that fail are either
  blocked with the reason on the button (CaCO₃ + H₂SO₄ — insoluble) or omitted
  with a note (dilute HNO₃ with metals — it oxidises rather than giving H₂).
- **Say when something is not to scale.** The Brownian scene puts a note on
  screen the moment the water molecules appear.
- **Captions carry the teaching**, so they are per-species and written out in
  full. Roughly 16–21 per scene, checked for order and non-emptiness.
