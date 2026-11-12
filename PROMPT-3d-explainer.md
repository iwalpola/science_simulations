# Prompt: make a 3D science explainer with Claude

Copy everything below the line into Claude (claude.ai, or Claude Code). Fill in
the **Brief** first; leave the rest as it is. It comes out of `AGENTS.md`, the
rules this repo's 3D scenes are built to, so a new explainer looks and behaves
like the existing ones.

---

You are building a 3D explainer for a GCSE science lesson. It will be shown on a
classroom projector and read from the back of the room. I am a science teacher:
**accuracy is the product**, and I will check the result in a browser myself.

## Brief (teacher fills this in)

- **Topic / specification point:** e.g. "thermal decomposition of copper carbonate"
- **Exam board and tier:** e.g. AQA Combined Science, Foundation and Higher
- **What pupils must be able to say afterwards (2–4 points):**
  1. …
  2. …
- **Misconceptions to tackle:** e.g. "the mass disappears"
- **Variants to offer in a menu (optional):** e.g. copper, zinc, calcium carbonate
- **Anything that must NOT happen in the picture:** e.g. "no reaction for a metal below carbon"
- **Length:** about 60–120 seconds of animation, in 3–6 chapters

Before writing code, reply with: (a) the chapter list, each with its caption
and what the camera looks at; (b) every number you will put on screen and where
it comes from; (c) anything you will simplify or show not to scale. Wait for me
to approve or correct that plan, then build it.

## Hard constraints on the file

1. **One self-contained `.html` file**, inline CSS and JS. It must work opened
   straight off disk (`file://`), shared as one file, or hosted on GitHub Pages.
   No build step, no bundler, no `fetch()` of models, textures or JSON, no other
   files beside it.
2. The only external resource is three.js **r128**, pinned exactly:
   `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>`.
   Use r128 API names (`outputEncoding`, `sRGBEncoding`), not later ones. No
   OrbitControls or other add-on scripts: write any camera control inline.
3. Everything is generated in code (geometry, canvas textures). If real anatomy
   is needed, tell me and stop. Do not draw anatomy freehand and present it as real.

## How the scene is built

- **Acts and worlds.** A macro world (the beaker, the organ, the apparatus) at
  the origin, and one or two particle-level worlds parked far away
  (e.g. `MICRO1_Y = 400`, `MICRO2_Y = -400`). Move between them with a
  short fade at fixed times in a `TRANSITIONS` array; `worldAt(t)` decides which
  world the camera is in. Do not juggle visibility.
- **Every frame is a pure function of time `t`.** No state carried between
  frames, no per-frame integration (`pos += vel*dt`), no `Math.random()` in
  the draw loop. Use closed forms: ballistic arcs, sines, triangle waves for
  particles bouncing in a box, `(t*speed + k*spacing) mod L` along a path. This
  makes the scrubber instant and replay exact.
- **If real dynamics are needed** (a gas, diffusion, Brownian motion),
  simulate once at load with a seeded `rng(seed)`, record the result, and play
  it back by lookup so frames stay a function of `t`.
- **Data tables drive everything.** If there is a species/variant menu, the
  equation, captions, colours, legend and number of particles all come from one
  table, so adding a variant needs no new choreography. Timings and camera keys
  belong to the reaction type, not the variant: switching the metal must not
  move the camera.
- **Refusals are animated.** If a variant does not react, show the attempt
  and nothing happening, with the reason on screen. Do not hide the option.
- **Controls:** a slim bar along the bottom with the chapter title, Back /
  Next, play/pause, replay and a time scrubber. A legend (key) for every colour
  used. Large text, high contrast, readable at projector distance.
- **Camera:** a table of keyframes per act (`{t, p:[x,y,z], look:[x,y,z]}`),
  eased between. Every act's track must cover the whole act. The camera must be
  looking at whatever the current caption is talking about.

## Rendering (r128 traps, both invisible in code)

1. Turn on output encoding or everything looks dark and flat:
   ```js
   renderer.outputEncoding      = THREE.sRGBEncoding;
   renderer.toneMapping         = THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure = 1.08;
   ```
2. Hex colours are sRGB but r128 materials treat them as linear. After
   building, run a `linearise(root)` pass that calls
   `color.convertSRGBToLinear()` and `emissive.convertSRGBToLinear()` once per
   material (mark it with `m.userData.__lin` so it is idempotent). **Any colour
   set every frame** (`.color.setRGB`, `.color.copy`, `.lerp`, `emissive.set`)
   must call `.convertSRGBToLinear()` at that point, or it overwrites the fix.
   `CanvasTexture`s used as a `map` need `tex.encoding = THREE.sRGBEncoding`.
3. Keep the environment map **dim**, with small bright highlights; it lights
   every surface. Taper with `envMapIntensity`: glass ~1.4, polished metal ~0.9,
   dark metal ~0.55, matte props 0.25–0.35, big background surfaces ~0.10. A
   bright overhead panel turns every upward face into a pale lid; keep its gain
   about 1.
4. Never put two surfaces at the same height (a liquid's top disc on its
   cylinder's cap): lift one by ~0.004 or it z-fights.
5. A large dark floor still reads as a grey dome once sRGB is right; paint a
   radial falloff into its texture so it fades to darkness.
6. Colourless solutions: about `(0.58, 0.72, 0.84)` at opacity `0.20`, not milky white.

## Code habits that avoid known bugs

- Parent an object to whatever holds it (a strip in tongs is a child of the tongs).
- Do not reuse one scratch vector as two arguments to the same call.
- Displace vertices by a function of direction, not a per-vertex random number,
  or the mesh tears at its seams. `LatheGeometry` is open: bring the profile
  back to `x = 0` to cap it.
- Check every camera vector table for typos like `p:[1,2,3}`.
- Make sure `frame()` cannot throw on the first frame; a thrown error leaves a
  blank canvas with the captions still on top.

## Teaching conventions

- **One colour per element, always.** Use exactly this palette and these
  relative radii:
  hydrogen `#d8402f` (0.34), oxygen `#2f47b8` (0.50), carbon `#4d5560` (0.58),
  nitrogen `#8f6fd8` (0.55), sulfur `#e8c33a` (0.60), chlorine `#4fbf72` (0.62).
  Electrons `#ffe070`. Energy blocks: an orange rounded square marked `T`
  (`#e5531a`) for thermal, green `C` (`#1ed31e`) for chemical.
- **Ion sizes carry meaning:** a cation is drawn smaller than its atom, an
  anion bigger, and the change is animated.
- **Spectator ions visibly do nothing** and are labelled as spectators.
- **Equations balance**, and atoms are conserved one for one across any
  rearrangement you animate.
- **Numbers are derived, not typed.** Put physical constants and data in one
  table and compute every figure a caption quotes from it. If a caption says
  "4200 J/kg°C" or "six oxygen molecules", that number must come from the
  same data the picture uses.
- **Say what is not to scale**, on screen, when it first appears: size,
  number, speed, mass, whichever apply.
- **Do not let the model overrule the curriculum.** If a simplification
  contradicts what pupils are taught, say so on screen or choose the
  curriculum's picture.
- **Do not offer chemistry that does not work.** Block it with the reason on
  the button, or leave it out with a note.
- **Captions carry the teaching**: written out in full for each variant,
  roughly 16–21 per scene, in order, none empty, plain English, UK spelling.
  Energy is *transferred*, never "produced" or "made".

## Self-check before you hand it over

Write a short `test.js` (plain Node, no dependencies) that reads the HTML as
text, pulls out the data tables, captions, camera tracks and timings, and checks:
equations balance; captions are in time order and non-empty; each act's camera
track covers the act; nothing arrives before it departs; every number in a
caption comes from the data table; element colours match the palette above.
Run what you can and tell me what passed and what you could not check.

Then tell me plainly what I should look at in the browser, because no test
can tell whether it *looks* right: where the camera points at each caption,
whether anything is too dark, too pale or hidden behind something.

Deliver: the `.html` file, `test.js`, and a short list of every simplification
the scene makes.
