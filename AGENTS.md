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
particles/                  particle-theory scenes (Brownian motion, melting)
energy/                     energy stores and transfers (+ test-energy-scenes.js)
electricity/                conduction and resistance (+ test-wire.js)
human_anatomy/reflex-arc/   2D reflex arc story over a baked 3D model (+ bake-backdrop.js, test-reflex-arc.js)
human_anatomy/heart/        heart, valves and double circulation, 3D over the Z-Anatomy heart (+ test-heart.js);
                            heart-viewer.html, the same heart to inspect: beat paused/slowed, cut at any angle (+ test-heart-viewer.js)
human_anatomy/respiration/  the respiration equation: glucose in through the real gut, oxygen through the real airways,
                            villi, alveoli, three diffusing walls, a muscle cell, the atoms rearranged (+ test-respiration.js)
mechanics/                  projectiles: launch, up to three markers, a click-to-reveal s u v a t matrix (+ test-projectiles.js)
genetics/                   cell → chromosome → DNA → gene → base, mitosis + the cell cycle, meiosis + fertilisation: three.js stories (+ test-genetics.js, test-mitosis.js, test-meiosis.js)
tools/                      one-off colour-migration scripts (animcolour.mjs, colourfix.mjs)
tools/anatomy/              build .glb files of named body parts from Z-Anatomy (see its README.md)
```

---

## The catalogue and its search list

`index.html` shows one card per category folder (`electricity/`, `waves/`, `mechanics/`,
`energy/`, `particles/`, `3dreactionscenes/`, `reactionbuilder/`,
`chemsheet_help/`, `cell_biology/`, `human_anatomy/`, `genetics/`). Each folder has its own `index.html` that
lists its sims. A sim lives in the one folder that fits best; other folders link
to it with a relative `../` path rather than holding a copy.

**The main page search covers every sim, not just the cards.** It reads the
`SIMS` array at the top of the `<script>` in the root `index.html`; when the
search box is non-empty it hides the cards and lists matching sims from that
array. The array is hand-maintained, so whenever you add, move, rename or remove
a simulation you must:

1. update that folder's `index.html` (and the `../` cross-links in any other
   index that should point to it);
2. add, edit or delete its entry in `SIMS` in the root `index.html` — `t` title,
   `u` path from the repo root, `s` the folder's section name, `c` the
   filter categories (`physics` / `chemistry` / `biology`), `d` description,
   optional `k` extra search words;
3. add a new category folder as a card in the root grid too.

An entry whose `u` no longer exists is a dead search result, so check that every
`u` resolves to a file.

---

## Tests — run these before and after any change

```bash
cd 3dreactionscenes && node test-scenes.js      # ~14,500 checks
cd particles        && node test-particles.js   # ~3,200 checks
cd particles        && node test-render.js      # runs the scenes headlessly
cd energy           && node test-energy-scenes.js  # ~530 checks, incl. headless render
cd reactionbuilder  && node test.js             # needs: npm install jsdom
cd mechanics        && node test-projectiles.js # SUVAT identities for random segments, the worked examples' answers, drag, every frame, catalogue
cd electricity      && node test-wire.js        # model + render path
cd human_anatomy/reflex-arc && node test-reflex-arc.js  # choreography + headless render
cd human_anatomy/reflex-arc && node test-reflex-arc-3d.js  # 3D story: routes, the arc, every frame, labels in view
cd human_anatomy/heart      && node test-heart.js        # the cut, valves, one-way flow, vessel routes, every frame
cd human_anatomy/heart      && node test-heart-viewer.js # viewer's copied code is still heart.html's (--sync re-copies), any-angle cuts, picking
cd human_anatomy/respiration && node test-respiration.js # food and air routes, grown bronchioles, diffusion directions, atoms balance, labels clear of the HTML
cd genetics         && node test-genetics.js   # pairs, band position, base pairing, flat ladder, quoted figures, every frame
cd genetics         && node test-mitosis.js    # copying, one copy of each chromosome per daughter, half volume, pie times, tissue, every frame
cd genetics         && node test-meiosis.js    # pairing, crossing over, one of each pair per cell, four different gametes, fertilisation
node tools/anatomy/test-anatomy.js              # anatomy catalogue, recipes, licence, built .glb files
```

They read the HTML as text, pull out the species tables, captions, camera
tracks and timing windows, and check them. They catch: unbalanced equations,
captions out of order, camera tracks that do not cover their act, choreography
that is causally impossible (something arriving before it departs), element
colours drifting apart between scenes, and malformed camera vectors.

### What each of them can and cannot see

`test-scenes.js` and `test-particles.js` read the HTML as **text** and execute
only the parts with no three.js in them. That is most of what is worth
checking — and none of it touches the code that draws a frame.

`test-render.js` covers that gap. It loads the real three.js the page loads
(the URL is read out of the scene's own `<script src>`, so they cannot drift),
stubs out `WebGLRenderer` and `PMREMGenerator` — the only two parts that need a
graphics context — and drives every frame of the timeline through `frame()`
with the clock scrubbed by hand. It is looking for **thrown errors and bad
arithmetic**: a frame that throws, a camera or a mote or an instance matrix
that goes non-finite, a NaN reaching the 2D canvas, a frame that draws nothing.

It exists because of a real bug that everything else missed. A squiggle added
to the melting scene's motes read a loop variable declared inside an `if/else`
branch, so it was out of scope where it was used. `node --check` sees nothing
— that is a runtime resolution error, not a syntax error — and the text-based
suite never executes that function. In the browser `updateMotes()` threw on the
**first** frame, before `sampleCam()` and `renderer.render()` could run, so
nothing ever drew: a blank page with the captions still sitting on top of it.
Add a scene to `test-render.js` when you add a scene.

None of them can tell you whether anything **looks** right. `test-render.js`
rasterises nothing and compares nothing against anything — a scene can pass
every check in it and still be pointing the camera at the floor. There is no
screenshot harness in this repo and none should be added: the user checks the
visual result themselves. Do not spawn a browser to render or screenshot a
scene as part of your own workflow.

---

## The `energy/` folder is 2D canvas, not three.js

`energy-resources.html` is a three.js story like the rest of the repo, but
`energy-physical-change.html` and `energy-chemical-change.html` are plain 2D
canvas. That is deliberate: a flame, an ice cube, a thermometer column, a
dashed bond and a reaction profile are all cheaper and more legible drawn flat,
and none of them gains anything from a camera. Do not port them to three.js.

Everything above about colour management, environment maps and `linearise()`
applies only to the three.js scenes and can be ignored here.

What they do share with the rest of the repo, and must keep:

- **The energy block.** An orange rounded square with a `T` on it, a rim at
  `shade(colour, 0.5)` and a gloss down the top half — the same block as
  `energy-resources.html`, `T` = `#e5531a` and `C` = `#1ed31e`. It is the
  vocabulary pupils have already met; do not restyle it in one scene only.
- **The element palette.** `EL` in `energy-chemical-change.html` carries the
  same colours and radii as the `EL` table in every `3dreactionscenes/` scene,
  and `test-energy-scenes.js` asserts it. Hydrogen is `#d8402f`, oxygen
  `#2f47b8`, carbon `#4d5560`, nitrogen `#8f6fd8`, chlorine `#4fbf72`.
- **Everything is a pure function of `t`.** Block streams sit at arc length
  `(t*speed + k*spacing) mod L` along a polyline; the fire's tongues are sums
  of sines; gas particles reflect off the box with triangle waves. Nothing
  accumulates between frames, so replay is exact. **Do not introduce per-frame
  integration**, and do not reach for `Math.random()` inside a draw call — use
  `hash(index)` so a given block always does the same thing.
- **The numbers are derived, not typed.** The heating curve's slopes are
  `1/c` and its plateaux are the latent heats, all out of `WATER`; the
  reaction profile's three heights and the exothermic/endothermic verdict all
  come out of the bond-energy lists. `test-energy-scenes.js` pulls those tables
  out of the page and runs them, so a caption cannot quote a figure the picture
  is not using. If you add a number to a caption, derive it.

- **The teaching is on the canvas, not beside it.** These two deliberately have
  no prose panel — they are meant to be read off a projector from the back of a
  room, so every point a pupil needs is a banner, a pill or a labelled arrow
  drawn in the scene. There is a slim bar along the bottom carrying the chapter
  title, Back/Next, replay and at most one per-chapter control. If you find
  yourself wanting a paragraph, find a way to draw it instead; if you genuinely
  cannot, that is worth raising rather than reinstating the panel.

The one trap specific to these two: the stage is a fixed 1000 × 620 space
scaled into whatever the bar and the key leave free, so **lay things out in
stage coordinates and never in pixels**. `resize()` is the only place that
knows about `innerWidth`, and it *measures* the bar and the legend with
`offsetHeight` rather than assuming a height — change their padding and the
stage still fits.

---

## Projectiles: a matrix per stretch of flight, hidden until clicked

`mechanics/projectiles.html` is plain 2D canvas, a pure function of `t`, with one
precomputed exception (air resistance, below). It follows the teacher's "Projectiles
Strategy" sheet: vertical `S U V A T` beside horizontal `S U T`, one matrix per
stretch of flight.

- **Points.** The launch point `L` plus up to three markers (1, 2, 3), so there are
  up to six stretches; the side panel picks From and To. Time always runs forward:
  if the pupil picks them backwards the matrix is for the earlier point to the later
  one, and says so. Markers store a time, so they slide along the path when the
  launch changes.
- **Every cell is hidden (`?`) until clicked**, with the equation that finds it shown
  after. Reveal state is kept per stretch and cell, and survives a change of launch.
  The typed-placement section is a closed `<details>` on purpose: typing a marker's
  `t` and `x` gives away two cells.
- **Sign convention** toggles up-positive / down-positive. Only vertical `S U V A`
  flip; `T` and the horizontal block never do. The tests check that and the
  identities (`s = ut + ½at²`, `v = u + at`, `v² = u² + 2as`) on random launches.
- **Air resistance is a comparison, not the model.** `a = −k|v|v`, RK4 once when a
  setting changes (`dragPath`), played back by lookup like the Brownian scene. The
  matrices stay the no-drag SUVAT ones and the page says so; SUVAT needs a constant
  acceleration.
- **The presets are the sheet's questions** (table, cannon, catapult and tree), with
  their answers asserted in the test. The marker specs (`y`, `x`, `apex`, `land`)
  are resolved against the launch, never typed as times.
- **`MODEL` and `DRAW` regions** (`/* MODEL:BEGIN */` …) hold all the physics and the
  canvas drawing with no DOM in them; the test runs both under node. Keep the DOM out
  of them.

---

## Real anatomy: build it from Z-Anatomy, do not draw it

When a scene needs real anatomy, get it from `tools/anatomy/` — read its
`README.md` first. In short: search `tools/anatomy/catalogue.json` (or
`node tools/anatomy/zanatomy.js find <words>`) for the exact part names,
write a `*.recipe.json` next to the scene, and
`node tools/anatomy/zanatomy.js build` it into a `.glb` whose nodes carry
those names. Blender and the 307 MB source live outside the repo
(`zanatomy.js setup`). Three rules that are easy to break:

- **Licence.** The output is CC BY-SA: credit Z-Anatomy on screen. The kidney
  and inner ear are non-commercial and the build refuses them; do not work
  round `licence-rules.json`.
- **Names.** three.js rewrites node names on load; read
  `object.userData.part`, never `object.name`.
- **Size.** A page must still be one file that opens off disk, so a `.glb`
  goes in inline and must be small: set `budget_kb`, decimate, include only
  what the camera sees — or bake it to images for a 2D story. For a three.js
  page, `node tools/anatomy/zanatomy-pack.js <glb> <page>` writes a compact
  16-bit form between `ANATOMY:BEGIN`/`END` markers (about half the bytes of
  the .glb, no loader needed); `reflex-arc-3d.html` is the worked example
  (`heart/heart.html` is the second, for vessels and a cut organ) —
  landmarks found in the geometry, routes found by searching the nerves'
  centrelines, and a test that projects every label through the camera.

---

## The reflex arc is a 2D story over a BAKED 3D model

`human_anatomy/reflex-arc/scene.html` is plain 2D canvas, like the energy
scenes, and everything in the section above about the stage, the bar and
"everything is a pure function of t" applies to it. What is different is the
backdrop: the skeleton, nerves and brain come from the Z-Anatomy "Neurology"
model (`scene.gltf` + `scene.bin`, 84 MB, CC-BY-SA-4.0).

- **The page never loads the model.** It is far too big to ship to a
  classroom, and a page that `fetch()`es a `.gltf` cannot be opened off disk.
  `bake-backdrop.js` rasterises it once, side on, in plain node (a z-buffer,
  no three.js, no GPU), into a handful of small transparent PNGs and writes
  them into `scene.html` as data URIs between the `BAKED:BEGIN`/`BAKED:END`
  markers, along with the landmarks the page lays its drawing on (elbow pivot,
  fingertip, wrist, shoulder, the line of the spinal canal, the brain). Never
  edit that block by hand; re-run the bake. `--debug` also writes PNGs you can
  look at, including a composite with the landmarks marked. The model files
  are gitignored, so a fresh clone cannot re-bake: download the glTF from the
  Sketchfab link in `license.txt` into the folder first.
- **The model's labels are unusable.** Sketchfab's export merged every part
  sharing a material and renamed the lot `Object_N`; one "mesh" can hold
  pieces of both arms and the face. Only the material names (tissue type)
  survive. So the page names nothing in the model: the neurones, spinal cord,
  biceps and body outline are DRAWN IN, and the page says so on screen. Do not
  label a part of the backdrop as a specific nerve. A labelled build of the
  same body now exists (`parts.recipe.json`, via `tools/anatomy/`, same
  coordinates): moving the bake onto it is how the drawn neurones could follow
  the real median and musculocutaneous nerves.
- **The forearm is its own layer**, cut at the elbow, so the page can swing it
  when the biceps contracts. Bones go whole by where their middle is (so the
  point of the elbow moves with the ulna); nerve tubes are cut at the pivot.
- **The licence travels with the picture.** The baked images are a derivative
  of a CC-BY-SA model, so they carry that licence, unlike the rest of the repo
  (MIT). The credit is on screen and in the page head; keep both.

---

## The heart: a real heart, cut, with valves and blood that obey the beat

`human_anatomy/heart/heart.html` is a three.js story like `reflex-arc-3d.html`
(same panel, nav, cue sheet and packed `ANATOMY` block), built from
`heart.recipe.json`. Everything about where things are is found in the
geometry when the page loads, and `test-heart.js` checks it is anatomy:

- **The valve rings are holes in the chamber meshes.** The chambers are
  hollow walls with an opening wherever blood goes in or out; a ring between
  atrium and ventricle is the opening the two meshes share, a semilunar ring
  the opening its cusps sit in. Ring centre, axis (pointing downstream) and
  radius come from those loops.
- **The cuts.** The chambers, valves and the trip through the heart use a
  FRONTAL cut (parallel to the chest, seen from the front), at the average
  depth of the four cavities; the test checks that depth opens all four
  more evenly than 5 mm either side. The user chose this over the plane
  through the apex and both AV rings, which opens every chamber through
  its middle but lies nearly horizontal in the body and has to be looked at
  from above. The cost, said on screen: the heart lies tilted, so a frontal
  cut only just opens the left atrium (back) and right ventricle (front).
  The walls chapter uses a SHORT-AXIS cut across both ventricles (thick
  ring, thin crescent), where both free walls can be measured.
  Each is a three.js clipping plane (`renderer.localClippingEnabled`).
  Each part that can be cut is drawn three times over ONE geometry: its
  outside, clipped; its back faces, flat and pale, which read as the cut
  surface of a solid wall; and a ghost of the cut-away half. Only the heart
  and the great vessels (`GREAT`) are cut and beat — widen that set and the
  lungs' own vessels clutter the cut view.
- **The beat** is one smooth squeeze field round the four cavity centres,
  applied to every part near the heart, so meshes that meet (the septum)
  move together and never tear.
- **Valves.** The atlas models the semilunar cusps SHUT and the AV leaflets
  hanging OPEN; each leaflet is a blend of an open and a shut pose. Where an
  AV leaflet's sheet ends and its tendons begin is found by where the arc it
  covers thins out. Opening a cusp by pushing vertices straight out to the
  wall turns the triangles at its tip into chords right across the opening
  — draw the tip towards the middle of its own cusp instead.
- **The atlas lacks the anterior leaflet of both AV valves.** Flaps are drawn
  into whatever arc of the ring no leaflet covers, and the page says so. The
  test checks the gap lands where those leaflets belong (the mitral one faces
  the aortic valve) and that each valve, shut, covers its ring.
- **Blood through the heart is a closed form of the beat count.** Flow in
  and out of the ventricles is tabulated over one beat (`FLOWTAB`); cell `k`
  is wherever that puts it, so it moves only while the valve ahead is open.
  The test sweeps cells through many beats and asserts none crosses a shut
  valve or goes backwards. Do not add per-frame integration.
- **Every vessel in the atlas** (about 630) comes `"as": "centreline"`: a
  centreline and a radius at each point, packed in binary, from which the
  page builds the tubes, merged into four meshes. As meshes they would be
  3 million triangles. Only the heart's own parts and the great vessels
  where they join it are meshes.
- **Routes round the body are searched**, as the nerves are in the reflex
  arc — but a branch starts on its parent's WALL, so ends are joined by
  distance to the parent's LINE (centrelines are thinned; the nearest point
  can be centimetres off) minus the parent's radius. Joined to centreline
  points, the left common carotid hangs off the brachiocephalic trunk (the
  arch is 12 mm wide). Six named routes are searched on the main vessels and
  tested as anatomy; then the whole arterial and venous trees are searched
  once each (heap Dijkstra, `treeFrom`) and every reachable artery tip is
  paired with a vein tip beside it — about 50 loops through the body and 25
  through the lungs. Capillaries are not in the atlas; they are drawn
  between an artery's last tip and the vein beside it.
- **Blood cells are dots inside their vessel**: `cellSize` caps each at a
  share of the picture AND at three quarters of the vessel's radius there.
- **Colour follows the blood, not the name**: the pulmonary artery is blue.
  The page says real blood is always red.
- **The viewer (`heart-viewer.html`) is a debugging aid, not a lesson.** It
  copies seven blocks of `heart.html` verbatim (anatomy through landmarks,
  the beat, the valves, renderer setup, labels, materials through
  `poseHeart`, the semilunar plane) so what it shows is what the story
  draws. After editing any of those in `heart.html`, run
  `node test-heart-viewer.js --sync`; the test fails until you do. It is
  not listed in the catalogue.
- **Inside the muscle or not**: ray parity fails on these meshes (the right
  ventricle is open along the septum). The test uses the nearest vertex's
  normal and ignores vertices on an open edge.

---

## Respiration: one equation, two supply lines, and diffusion that emerges

`human_anatomy/respiration/respiration.html` is a three.js story in the
reflex arc's shell (panel, nav, key, cue sheet, packed `ANATOMY` from
`respiration.recipe.json`), with one addition: the equation bar across the
top of the stage, `glucose + oxygen -> carbon dioxide + water`, whose
terms each chapter lights (`Ch.eq`). The chapter's material preset is
`Ch.view`, not `Ch.look` — `look` is the "Watch for" caption.

- **The way food goes is found, not drawn.** The oesophagus and the small
  intestine are curves in the atlas (it files the whole coil, 2 m in this
  model, as "Jejunum"), so they come as centrelines. The stomach and the
  duodenum are meshes with a hole wherever food passes (`openings()`:
  boundary loops); `march()` walks through each from hole to hole, re-centring
  on the walls. The test checks every point is inside the organ (nearest
  closed vertex's normal, as the heart test does).
- **The way air goes is searched**, as the reflex arc searches nerves: every
  bronchus is a curve, joined end to wall within `JOIN`, searched from the
  carina to a tip of the right middle lobe's lateral segmental bronchus.
  Where a route only clips one node of a neighbouring bronchus at a fork,
  that node is dropped, or the route reads as a trip into it.
- **Past the atlas, the airways are grown.** `TREE` forks `GEN` more times
  from every tip, keeping each branch inside a real lobe, and ends each in a
  sac of alveoli (`SAC_R`, drawn about ten times too big, and said so). The
  air's own tip is the one with most room beyond it.
- **Diffusion is a seeded random walk, precomputed at load** (`runDiffusion`,
  the three `WALLS`), and played back by lookup: frames stay a pure function
  of `t`. Nothing tells a molecule which way to go; the boundaries do what
  the body does (blood flows off and fresh arrives; breathing out removes
  CO2 at the top of the alveolus; red cells take up oxygen in the lung and
  let it go in the muscle; a mitochondrion turns oxygen into carbon dioxide
  and uses glucose). The test counts whole trips across the wall and
  asserts each species' net direction — keep those as assertions, not as
  rules in the walk.
- **The reaction is atoms, mapped one to one.** `EQN` and `MOL` build
  `C6H12O6 + 6O2 -> 6CO2 + 6H2O`; `RX.MAP` sends every atom to one slot of
  the same element, and the test checks the bijection and that atoms start
  and end where the molecules are drawn. Molecules use the repo's element
  palette (`EL`), so oxygen is the reaction scenes' blue.
- **Energy is transferred, never produced or made**; the test greps for it.
  The blocks are the energy stories' C, K and T.
- **Labels are tested against the HTML over the stage**, not just the frame:
  the equation bar (top middle), the key (below it, right) and the buttons
  (bottom middle), on the 920 x 720 stage a 1280 x 720 screen leaves. They
  are timed to appear once each shot's camera has settled.

## Mitosis: one cell's clock, and a nucleus that is never pinched

`genetics/mitosis-3d-story.html` is a three.js story in the same shell as
`cell-to-dna-3d-story.html` (panel, nav, key, labels with leaders). What is
particular to it:

- **One timeline.** Chapters 2-7 are consecutive windows `[T0, T0+Tlen]` of
  one clock `T` (`TL` holds every event's window), so the cell at the end of
  a chapter is the cell at the start of the next; the test asserts they join.
  The story ends with two cells identical to the one it began with.
- **A chromatid is one tube** whose centre line blends, by how condensed it
  is, between an interphase thread (`THREAD`, a tangle in units of the
  nucleus radius) and a coiled rod placed by the chromosome's frame. Do not
  draw interphase chromosomes as X shapes: copying happens while they are
  threads, and the page shows it there (bubbles from several origins).
- **The membrane is a smooth union of two spheres** (`cellSdf`); cytokinesis
  is `cytoState`: the waist narrows to nothing as the halves shrink to half
  the volume, then they part and round off. The sign of `cellSdf` is the
  inside test the organelles and the suite use.
- **The nucleus is never pinched in two.** The envelope breaks into patches
  and two new ones gather at the ends; the test fails if any new-nucleus
  vertex crosses the middle.
- **The pie chart is to scale** (`CYCLE`, a lab-grown human cell, about 24 h)
  and its hand is `handMin(T)`; how much slower mitosis is played than
  interphase is worked out from that, not typed in.
- **The phase names toggle** (prophase … telophase, for Edexcel/OCR) adds a
  banner, a panel note and a key word; it changes no geometry. Captions in
  both modes go through the number check.
- **The cell's own parts come from `cell_biology/organelles.js`** —
  membrane, cytoplasm, nuclear envelope, mitochondria (with cristae) and
  ribosomes — loaded with `<script src="../cell_biology/organelles.js">` as
  the cell_biology pages load it, so a cell looks the same in both folders.
  Both this page and the meiosis page therefore need that file beside them;
  their tests load it from the same `src` and check the materials are its.
  `COL` reads those colours off the materials, so the key and the pie chart
  follow. Clone a shared material (`ORG.envelope.clone()`) wherever one copy
  fades on its own.
- **Frames are cheap only because** the reshaped meshes have
  `frustumCulled = false` and skip `computeBoundingSphere()` (it was most of
  a 35 ms frame), and `writeLathe`/`updateCell` skip work when nothing moved.
  Keep that if you add a reshaped mesh.

### Meiosis: the same machinery, two divisions, and why crossing over is in it

`genetics/meiosis-3d-story.html` shares the mitosis page's tube, membrane,
envelope and label code (copied, as every page here is one file). What is
particular to it:

- **Crossing over is shown on purpose.** GCSE says the four gametes are "all
  genetically different"; without crossing over the four from one cell are
  two identical pairs, and the picture would contradict the caption. One
  swap per pair, between the two chromatids next to each other in the row
  of four (`CROSS`, `innerJ`), drawn as a colour change along the tube
  (`cid` per ring). The panel says not every course asks about it.
- **Which way each pair faces is chance**, fixed in `CHROMS[k].side`; the
  caption names the arrangement and the test checks it, so change both.
- **After the first division the membrane is two cells**, each a lathe about
  y (`MEM2`), swapped in at `SPLIT1` when both halves are exact spheres.
  `cellsSdf` is the inside test across both stages.
- **`cytoState` shrinks the halves early** (`ss(0, 0.7, p)`) so their centres
  only ever move apart; both pages' tests assert it. `D_SPLIT(r)` is where
  two parted halves' centres end up.
- **The sperm is one of the four gametes** (`SPERM_FROM`); the test checks the
  zygote holds exactly its chromosomes plus the egg's (green and gold: the
  woman's own parents).

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
- **Everything is a pure function of `t`.** No accumulated state between
  frames. Particles use closed forms — analytic ballistics, triangle waves for
  reflecting billiards. This is what makes scrubbing instant and every frame
  reproducible. **Do not introduce per-frame integration.**
- **If a scene needs real dynamics, precompute it and leave a closed form
  behind.** Two scenes do this. `particles/brownian-motion.html`: the
  water is a hard-sphere gas and the pollen grains move because molecules hit
  them, so there is genuine integration — but it happens once, in `runSim()`,
  at build. What it records is analytic again (a molecule is a straight line
  plus the moments a grain knocked it onto a new one; the grains' paths are
  sampled and interpolated), so playback is still a lookup and scrubbing is
  still instant. The hot loop is written with flat typed arrays and no
  three.js in it, which is also what lets `test-particles.js` run it under
  node and measure what it produces.

  `particles/melting-snowman.html` does the same for melting: a Lennard-Jones
  crystal integrated with velocity Verlet while energy is fed in at a steady
  rate, which comes apart on its own, and whose heating curve is measured
  rather than drawn. Two things there are worth knowing before touching it.
  The side walls and the floor are placed so that the crystal's mirror image
  in them IS the crystal continued — the lattice is offset a quarter of a cell
  from each wall — and that is what makes 216 molecules behave like the inside
  of a block. Earlier attempts with free faces melted gradually from every side
  at once and smeared the transition across the whole run, leaving no flat
  section at all; constant volume gave none either, since the coexistence line
  is not flat in T at fixed V. And the run takes about two seconds, far too
  long to freeze a projector on load, so `meltRun()` hands back a stepper and
  the scene advances it a few milliseconds a frame during the first act, while
  `runMelt()` drives it to completion in one go for the tests. The suite
  asserts the two agree exactly.

  The macro half of that scene needs no simulation at all. The energy balance
  says every snow surface loses the same DEPTH per hour whatever its radius, so
  each ball's radius is a straight line in time — which is also the reason the
  head goes first, and why the melt time is what it is. If you change the
  snowman, keep that: it is a prediction the tests check, not a shape the
  choreography was built around.
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
- **Do not let a model overrule the curriculum.** The melting scene's molecules
  are Lennard-Jones spheres in a close-packed lattice, which is not the open
  six-sided pattern hydrogen bonds actually build in ice — and there are no
  hydrogen bonds in the model at all. It says so on screen.

  The heating curve there used to be plotted from the run's own temperature.
  It was honest and it was wrong to teach from: a few hundred molecules is far
  too small a thermometer to hold a temperature still, so the curve sagged
  through the melt where a pupil is taught it stays flat. It is now calculated
  from `WATER` — 2100 and 4200 J/kg°C and 334,000 J/kg — and the simulation
  supplies only the marker, which crosses the flat part in step with the
  pattern measurably coming apart (`curveEnergy`, `meltProgress`). Keep that
  division: work the physics a pupil must read off the screen out from the data
  book, and let the simulation drive where on it we are. The suite asserts the
  flat part is dead flat at 0 °C, that the two slopes are 1/c, and that every
  figure a caption quotes is one of the constants.
- **Say when something is not to scale.** The Brownian scene puts a note on
  screen the moment the water molecules appear — size, number AND mass, since
  its molecules have to be thousands of times too heavy for a countable number
  of them to move a grain at all.
- **Prefer a number that emerges to a number that is typed in.** `GRAINS.jiggle`
  and `TEMPS.jig` in the Brownian scene used to drive the animation; they are
  now Einstein's prediction for how far a grain of that size wanders at that
  temperature, and `test-particles.js` runs the simulation at all nine settings
  and checks the prediction against what actually comes out. A trend that
  emerges cannot silently disagree with the caption explaining it.
- **Captions carry the teaching**, so they are per-species and written out in
  full. Roughly 16–21 per scene, checked for order and non-emptiness.
