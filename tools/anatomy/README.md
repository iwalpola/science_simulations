# Building anatomy models from Z-Anatomy

Custom `.glb` files of **named** body parts, cut out of the Z-Anatomy Blender
atlas: 3,936 parts, every one with its real anatomical name, organised by
system and region. Use it when a scene needs real anatomy — a skeleton, a
nerve, a muscle — rather than something drawn.

```
node tools/anatomy/zanatomy.js setup              once per machine: Blender + the model
node tools/anatomy/zanatomy.js find median nerve  search the catalogue (no Blender needed)
node tools/anatomy/zanatomy.js build <recipe>     recipe -> .glb + .manifest.json
node tools/anatomy/zanatomy.js catalogue          rebuild catalogue.json (rarely)
node tools/anatomy/test-anatomy.js                checks; no Blender needed
```

## What lives where

| | |
|---|---|
| `catalogue.json` | every part: name, side, kind, system, lineage (its group tree), regions, triangle count, bounding box, licence flags. **Committed** — search it instead of opening Blender. |
| `licence-rules.json` | which parts may not be published, and the attribution text. Read by the exporter AND the test. |
| `zanatomy.js` | the runner. Pins Blender 4.2.23 and the model's SHA-256. |
| `zanatomy_*.py` | run inside Blender: shared rules, catalogue, export, and a raw inspector. |
| `<scene>/*.recipe.json` | what a scene wants. Lives next to the scene. **Committed.** |
| `<scene>/*.manifest.json` | what a build produced: parts, sizes, warnings, licence. **Committed.** |
| `<scene>/*.glb` | the build. **Not committed** (`.gitignore`) — rebuild it. |
| `%LOCALAPPDATA%\z-anatomy-workflow` | Blender and the 307 MB `Startup.blend`. Never in the repo. Override with `ZANATOMY_HOME`, or point `BLENDER` at a Blender 4.2+ you already have. |

## A recipe

```json
{
  "out": "parts.glb",
  "budget_kb": 3000,
  "decimate": 0.5,
  "include": [
    {"collection": "Bones of upper limb", "side": "l"},
    {"collection": "Brachial plexus", "side": "l", "system": "Nervous system & Sense organs"},
    {"name": "Long head of biceps brachii.l"},
    {"match": "^Vertebra C[5-7]$"},
    {"name": "Median nerve.l", "decimate": 1.0}
  ],
  "exclude": [{"name": "Scapula.l"}],
  "tissues": {"nerve": "#e8c040"}
}
```

- **Selectors** — `name` (exact), `match` (regex), or `collection`: any name
  in a part's system, collections, regions or lineage. Narrow with `side`
  (`l`, `r`; midline parts always pass) and `system`. A selector that matches
  nothing is an error, so a typo cannot silently drop a part.
- **Use `system` with region collections.** "Brachial plexus" also holds the
  muscles that plexus supplies; without `"system"` you get half the arm's
  muscles.
- **`kinds`** defaults to `["part"]`. Muscle origin and insertion patches
  (`.ol`, `.el`, `.e3l`...) hang off the *bones* in the tree, so selecting
  bones would otherwise drag them in. An exact `name` always gets through.
- **`"as": "centreline"`** on a selector of curves (vessels, nerves): no
  mesh is built, only a node carrying the curve's centreline and a radius at
  every point of it, measured from the evaluated tube (so a tapering vessel
  keeps its taper). The page rebuilds the tube. Every vessel in the atlas
  this way costs about 300 KB in a page; as meshes it is 3 million
  triangles. Later selectors override earlier ones, so ask for a collection
  as centrelines first and then for the few parts you want as meshes.
- **`decimate`** is the fraction of triangles kept, per recipe or per
  selector. The arm at 0.5 is about 2.7 MB; keep `budget_kb` honest — the
  build fails over it.

## What comes out

- One node per part, its world transform **baked into the vertices**, in the
  model's coordinates converted to glTF's y up: metres, **+x is the body's
  left**, the front of the body faces +z. Parts from different builds line up
  with each other and with the old Sketchfab export (the same model).
- **three.js rewrites node names** — `Median nerve.l` loads as
  `Median_nervel`. Read the real name from `object.userData.part`.
- One material per **tissue** (`zanat-bone`, `zanat-nerve`, `zanat-muscle`,
  ...), not the 170 source materials, so a scene recolours a tissue at once.
- Each node's extras also carry its `lineage` and, for curves (every nerve)
  and for anything bent along a curve (the spinal cord), its **centreline**:
  the spline itself, sampled, in the same y-up metres. Nerve splines meet end
  to end, so a page can join them into a graph and search it for a route —
  `reflex-arc-3d.html` finds fingertip → median nerve → posterior root that
  way, and the length it quotes is that route's.
- It loads in the repo's pinned three.js r128 with `GLTFLoader.parse()` on an
  ArrayBuffer. But for a page, **pack it** instead:
  `node tools/anatomy/zanatomy-pack.js <built.glb> <page.html>` writes
  `const ANATOMY` between `ANATOMY:BEGIN`/`ANATOMY:END` markers — 16-bit
  positions in one box round the body, 16-bit indices, no normals (the page
  recomputes them): about half the bytes, decoded synchronously, no loader.
  Never edit that block by hand; rebuild and re-pack.
  Centrelines are THINNED (a point goes where the line past it misses it by
  under 0.25 mm), so join curves by distance to a line, not to its nearest
  point. A part built as a centreline has `v = 0, i = 0` and `n` (points per
  spline); its points and radii follow in the binary data — see the packer's
  header for the layout and `heart.html`'s `unpack()` for reading it.
- Size is still the constraint: decimate hard, include only what is seen.
  The reflex arc's 246 parts pack to 0.9 MB (1.2 MB as base64). For a 2D
  story, bake to images instead, as `human_anatomy/reflex-arc/bake-backdrop.js` does.
- The atlas has **no lateral or medial cord** of the brachial plexus: the
  median and musculocutaneous nerves start ~1.5 cm short of the divisions.
  Joining nerve ends within 2 cm bridges it; 1.5 cm finds no route.
- **Blood vessels are curves too**, and meet end to end the same way — but a
  branch starts on its parent's *wall*, so join an end to the vessel whose
  surface it is nearest (distance to the centreline minus that vessel's
  radius, measured from its mesh). Joined by plain distance, the left common
  carotid hangs off the brachiocephalic trunk instead of the 12 mm-wide aortic
  arch. `human_anatomy/heart/heart.html` searches the arteries and veins that
  way to every limb and lobe of the lungs.
- **The heart's chambers are hollow walls** with a hole wherever blood goes in
  or out: those boundary loops are the valve rings. The atlas has **no
  anterior leaflet** on either atrioventricular valve (the mitral's posterior
  leaflet is also filed under the right valve), and only one of the left
  ventricle's two papillary muscles.

## How the source file is organised (so you do not have to rediscover it)

- `Name.r` / `Name.l` are the right and left parts; the `.l` is usually the
  `.r` mesh mirrored (negative scale). The exporter flips normals on mirrored
  parts; the test checks every part faces outwards.
- `Name` with no suffix is a midline part (vertebrae, spinal cord).
- `.t .s` are label text, `.j .i` label leader lines, `.g` group labels. The
  `.g` labels parent the parts and form the real tree (`lineage`).
- Nerves are bevelled **curves** and the spinal cord is **procedural**
  (mirror + array + curve modifiers on a small profile). Everything is
  evaluated before export.
- **The source mislabels a few sides** (`Eyelashes.l`, several `.el` patches
  sit on the right). The catalogue flags them `side_mismatch`, and a build
  that includes one says so in its warnings.
- There is no skin.

## Licence — read before publishing

Z-Anatomy is CC BY-SA 4.0, built on BodyParts3D (CC BY-SA 2.1 JP). A built
`.glb` and anything baked from it are derivatives: **credit Z-Anatomy on
screen and keep the CC BY-SA licence on that asset**, even though the rest
of this repo is MIT. The manifest carries the attribution text.

Two pieces of the atlas are **non-commercial** and cannot be published here:
the kidney (CC BY-NC) and the inner ear (CC BY-NC-SA). The file does not
record which polygons came from where, so `licence-rules.json` blocks them by
name — the build refuses, and the test checks every recipe. Brain-surface
parts carry a warning (source licence not stated).

## Traps already hit

- **Never read `.data.body` on the file's text labels** — some are null and
  Blender 4.2 crashes outright, uncatchably.
- **`hide_render` is not a filter.** Most real geometry has it set. Visible
  parts are the ones not hidden in the viewport.
- **Blender always runs with `--disable-autoexec`.** The file carries its own
  add-on (`z-anatomy.py`); nothing in it is needed to export.
- `tools/package.json` makes `.js` files ES modules; `tools/anatomy/package.json`
  switches this folder back to CommonJS like the rest of the repo's scripts.
- Heredocs eat the backslashes in regexes — edit these files with an editor.
