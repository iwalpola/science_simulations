# Science Simulations

Interactive physics and chemistry simulations for GCSE and KS3, built by a
teacher for use on a classroom projector.

**→ [iwalpola.github.io/science_simulations](https://iwalpola.github.io/science_simulations/)**

Every simulation is a **single self-contained HTML file**. Open one off a USB
stick, email it to a colleague, or run it straight from the link above — there
is nothing to install and nothing to build.

---

## What's here

Open `index.html` for the searchable catalogue, or go straight to one:

### Physics

| | |
|---|---|
| **[Circuit Energy Flow](voltage_energy_charge.html)** | Voltage, energy and charge made visible — follow the energy round a circuit rather than just the current. |
| **[Circuit Diagram Teacher Tool](circuit_quiz_teacher_tool.html)** | Build circuit diagrams on the board and quiz a class on them. |
| **[Ultrasonic NDT Explorer](ultrasonicv2.html)** | Slide a probe across a steel beam and watch the oscilloscope respond to hidden cracks. Pulse Trace mode gives a slow-motion view of the pulse travelling through the material. |
| **[Bat Echolocation](pulse_echo.html)** | Pulse-echo timing, from the bat's end of it. |
| **[Melting](particles/melting-snowman.html)** | A snowman melts. Where the energy comes from (mostly the air, not the sunshine — snow throws most of the light back), then inside the ice to watch molecules break out of their pattern, with a heating curve that holds dead flat at 0 °C through the whole melt. Change the weather to change how long it takes. |

### Chemistry

| | |
|---|---|
| **[3D Reaction Scenes](3dreactionscenes/index.html)** | Fifteen scenes, one per GCSE reaction type — acid + metal, electrolysis, displacement, the blast furnace, thermal decomposition and the rest. Swap the species from a menu and the equation, captions and cast all follow. |
| **[Reaction Builder](reactionbuilder/reaction-builder.html)** | Search a species, drop it on the reactant side, then model the products to see how atoms rearrange. |
| **[Brownian Motion](particles/brownian-motion.html)** | Follow pollen from a flower onto a drop of water, look down the microscope, and watch it jitter. Turn the water molecules visible to see what has been pushing it. Grain size and temperature are both adjustable. |

There is also `homework/` (lesson slides) and `tools/` (one-off colour-migration
scripts — not part of the site).

### A note on the 3D scenes

The 3D scenes load [three.js](https://threejs.org/) from a CDN, so they need a
network connection the first time. Everything else runs fully offline.

---

## How it's built

The constraint that shapes everything: **one file per simulation, inline CSS
and JS, no build step**. They get opened off disk, shared as a single
attachment, and hosted on GitHub Pages. There is no bundler, no `node_modules`
at runtime, and no asset a page needs in order to work.

A few principles the scenes hold to:

- **The physics is real, and it is computed.** Nothing is animated by a number
  typed in to look about right. The Brownian scene's pollen moves because
  simulated water molecules actually hit it. The melting scene runs a
  Lennard-Jones molecular dynamics simulation that comes apart on its own, and
  works the snowman's melt rate out from an energy balance — albedo, air
  temperature, latent heat — so the head disappearing first is a *prediction*.
- **Every frame is a pure function of the timeline position.** Where a scene
  needs real dynamics, it is computed once at build and what it leaves behind
  is a lookup table. So scrubbing is instant and every frame is reproducible.
- **Anything random is seeded**, so a rebuild looks identical.
- **Accuracy is the product.** These are a teacher's materials. Where a model
  is not the real thing, the scene says so on screen rather than leaving a
  wrong impression.

---

## Contributing

Contributions are welcome — bug reports and corrections especially. If
something is scientifically wrong, please open an issue; that matters more than
anything cosmetic.

`AGENTS.md` is the full working guide, and it is worth reading before changing
a scene — it records the traps that have already cost time. The short version:

**Run the tests before and after any change.**

```bash
cd 3dreactionscenes && node test-scenes.js      # ~14,500 checks
cd particles        && node test-particles.js   # ~3,200 checks
cd particles        && node test-render.js      # runs the scenes headlessly
cd reactionbuilder  && node test.js             # needs: npm install jsdom
```

They read the HTML as text and run the physics under Node, checking for
unbalanced equations, captions out of order, camera tracks that do not cover
their act, choreography that is causally impossible, and element colours
drifting apart between scenes. `test-render.js` additionally loads the real
three.js, stubs out the graphics context, and drives every frame of a scene's
timeline looking for thrown errors and NaNs.

None of them can tell you whether anything **looks** right. There is no
screenshot harness and none should be added — check the visual result yourself
in a browser.

**Things that have already caught people out:**

- **three.js is pinned at r128**, deliberately. r152 renamed the colour
  properties and r155 changed light intensities, so upgrading is a 15-file
  migration.
- **Colour management has two halves.** Set `renderer.outputEncoding =
  THREE.sRGBEncoding`, and convert material colours with
  `.convertSRGBToLinear()` — hex codes are picked as sRGB but r128 treats them
  as linear, so a deep green renders as mint. Anything whose colour is written
  every frame must be converted at the point of assignment instead.
- **Environment maps are lights, not just reflections.** Keep them dim; a
  panorama at the brightness of a real sky floodlights the whole scene.
- **Coplanar surfaces z-fight.** Lift a liquid's surface disc a few thousandths
  above the cylinder cap.
- **Displace vertices by a function of direction, not by a random number per
  vertex** — otherwise the mesh tears along every seam.
- **Prefer a number that emerges to a number that is typed in.** If a caption
  explains a trend, the simulation should produce that trend, and a test should
  check the two agree.
- **Say when something is not to scale**, on screen.

---

## Credits

Built by **[Isuru Walpola](https://github.com/iwalpola)**, a science teacher in
Aylesbury, Buckinghamshire.

Developed in collaboration with **Claude** (Anthropic) — Sonnet, Opus and Fable
— pair-programming the simulations, the physics engines and the test suites.

## Licence

[MIT](LICENSE) — free to use, adapt and share, in your classroom or anyone
else's.
