#!/usr/bin/env node
/* =====================================================================
   test.js — headless tests for reaction-builder.html

   Runs the page in jsdom and drives the state functions directly, so
   the board logic (sides, mirroring, electrons, delete/reset flows) can
   be checked without a browser. It does NOT test pointer handling or
   the fly-in animation; those need a real browser.

   Setup:   npm install jsdom
   Run:     node test.js            (expects reaction-builder.html beside it)
            node test.js path/to/other.html

   Adding a test: call test("name", () => { ... }) with plain
   node:assert checks. Use fresh() to start from an empty board. All
   helpers below run inside the page's scope via win.eval, so anything
   defined in the page (groups, onSide, reverseAtom, ...) is available.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const file = process.argv[2] || path.join(__dirname, "reaction-builder.html");
const html = fs.readFileSync(file, "utf8");

/* ---------- boot the page ---------- */

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
const win = dom.window;

// jsdom lacks <dialog> methods, pointer capture and matchMedia
win.__dialogs = [];
win.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
  win.__dialogs.push({ title: this.querySelector(".dlg-title").textContent, el: this });
};
win.HTMLDialogElement.prototype.close = function () { this.open = false; };
win.Element.prototype.setPointerCapture = () => {};
win.matchMedia = () => ({ matches: true });   // reduced motion: fly-in commits synchronously

// Everything the tests call is evaluated inside the page so it sees
// the page's own globals.
const run = (code) => win.eval(code);
run("fitToWidth(); render();");

/* ---------- helpers (page scope) ---------- */

run(`
  window.fresh = () => { resetBoard(); flashMsg = ""; render(); };   // flash timers never fire in jsdom
  window.find = (side, pred) => onSide(side).find(pred);
  window.lone = (side, sym, kind) => find(side, g =>
    g.pieces.length === 1 && speciesOf(g.pieces[0]).sym === sym && speciesOf(g.pieces[0]).kind === kind);
  window.freeE = side => onSide(side).filter(g =>
    g.pieces.length === 1 && speciesOf(g.pieces[0]).kind === "electron").length;
  window.libIndex = label => library.findIndex(e => e.label.startsWith(label));
  window.preset = name => PRESETS.find(p => p.name.startsWith(name));
  window.park = (g, col, row) => { g.pieces[0].col = col; g.pieces[0].row = row; };
  window.atomsOf = sym => onSide("R").filter(g => g.pieces.length === 1 &&
    speciesOf(g.pieces[0]).kind === "atom" && speciesOf(g.pieces[0]).sym === sym);
  window.statusText = () => document.getElementById("status").textContent.replace(/\\s+/g, " ").trim();
  window.logText = () => eqLog.map(e => e.type + ": " + e.text);
`);

const lastDialog = () => win.__dialogs.length ? win.__dialogs[win.__dialogs.length - 1] : null;
const clickDialog = (label) => {
  const d = lastDialog();
  assert.ok(d, "expected a dialog to be open");
  const btn = [...d.el.querySelectorAll("button")].find(b => b.textContent === label);
  assert.ok(btn, `dialog has no button "${label}"`);
  btn.click();
};

/* ---------- tiny runner ---------- */

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    win.__dialogs = [];
    run("fresh()");
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (e.message || e).toString().split("\n").join("\n       "));
  }
}

/* ===================== tests ===================== */

test("board has two sides with an arrow channel between them", () => {
  const [lLo, lHi] = run('rangeOf("L")');
  const [rLo, rHi] = run('rangeOf("R")');
  assert.equal(lLo, 0);
  assert.equal(rLo - lHi, 2, "channel is two columns wide");
  assert.equal(rHi, run("COLS"));
  assert.equal(lHi - lLo, rHi - rLo, "both sides are the same width so mirroring keeps layout");
});

test("adding a reactant mirrors it to the products side", () => {
  run('dropEntry(libIndex("Lithium"))');
  assert.equal(run('onSide("L").length'), 1);
  assert.equal(run('onSide("R").length'), 1);
  assert.equal(run("productsUntouched()"), true);
  const l = run('groupBounds(onSide("L")[0])'), r = run('groupBounds(onSide("R")[0])');
  assert.equal(r.minC - l.minC, run("mirrorShift()"));
  assert.equal(r.minR, l.minR);
});

test("a chain molecule mirrors with its bonds", () => {
  run('dropEntry(libIndex("Carbon dioxide"))');
  const r = run('onSide("R")[0]');
  assert.equal(r.pieces.length, 3);
  assert.equal(r.bonds.length, 2);
  assert.equal(run('chainFormula(onSide("R")[0])'), "CO₂");
});

test("presets load on the left and are mirrored", () => {
  run('loadPreset(preset("Metal + acid"))');
  assert.equal(run('onSide("L").length'), 3);
  assert.equal(run('onSide("R").length'), 3);
  assert.equal(run("productsUntouched()"), true);
});

test("groups cannot be dragged across the arrow", () => {
  run('loadPreset(preset("Metal + acid"))');const gid = run('lone("R","Mg","atom").gid');
  const before = run(`groupBounds(findGroup("${gid}")).minC`);
  run(`moveMany(["${gid}"], -30, 0)`);
  assert.equal(run(`groupBounds(findGroup("${gid}")).minC`), before);
  assert.equal(run(`findGroup("${gid}").side`), "R");
  assert.match(run("flashMsg"), /stay on the right/);
});

test("moves within a side still work", () => {
  run('loadPreset(preset("Metal + acid"))');const gid = run('lone("R","Mg","atom").gid');
  const before = run(`groupBounds(findGroup("${gid}")).minR`);
  run(`moveMany(["${gid}"], 0, 3)`);
  assert.equal(run(`groupBounds(findGroup("${gid}")).minR`), before + 3);
});

test("oxidation frees electrons that do not plug back into the ion", () => {
  run('loadPreset(preset("Metal + acid"))');run('reverseAtom(lone("R","Mg","atom").gid)');
  const mg = run('lone("R","Mg","ion")');
  assert.ok(mg, "Mg²⁺ exists as a lone group");
  assert.equal(run('freeE("R")'), 2);
  assert.ok(run("logText()").includes("Oxidation: Mg → Mg²⁺ + 2e⁻"));
});

test("a bare cation pulls in free electrons to become an atom", () => {
  run('loadPreset(preset("Metal + acid"))');run('reverseAtom(lone("R","Mg","atom").gid)');
  run('fuseFree(lone("R","Mg","ion").gid)');
  assert.ok(run('lone("R","Mg","atom")'));
  assert.equal(run('freeE("R")'), 0);
  assert.ok(run("logText()").includes("Reduction: Mg²⁺ + 2e⁻ → Mg"));
});

test("anion formation consumes a real electron", () => {
  run('loadPreset(preset("Metal + acid"))');run('scissorGroup(find("R", g => g.pieces.length === 2).gid)');   // HCl -> H+ + Cl-
  run('stripAnion(lone("R","Cl","ion").gid)');                       // Cl- -> Cl + e-
  assert.equal(run('freeE("R")'), 1);
  run('reverseAtom(lone("R","Cl","atom").gid)');                     // Cl + e- -> Cl-
  assert.equal(run('freeE("R")'), 0);
  assert.ok(run('lone("R","Cl","ion")'));
  assert.equal(win.__dialogs.length, 0, "no error dialog");
  assert.ok(run("logText()").includes("Reduction: Cl + e⁻ → Cl⁻"));
});

test("anion formation with no free electron shows an error and changes nothing", () => {
  run('loadPreset(preset("Metal + halogen"))');
  run('scissorGroup(find("R", g => g.pieces.length === 2).gid)');   // Cl2 -> 2Cl
  const before = run('onSide("R").length');
  run('reverseAtom(lone("R","Cl","atom").gid)');
  assert.equal(lastDialog().title, "Not enough free electrons");
  assert.equal(run('onSide("R").length'), before);
  assert.equal(run('lone("R","Cl","ion")'), undefined);
});

test("electrons on the reactants side are never used", () => {
  run('dropEntry(libIndex("Electron"))');
  run('dropEntry(libIndex("Chlorine"))');
  assert.equal(run('freeE("L")'), 1);
  // remove the mirrored electron so only the left one exists
  run('groups = groups.filter(g => !(g.side === "R" && speciesOf(g.pieces[0]).kind === "electron"))');
  run('reverseAtom(lone("R","Cl","atom").gid)');
  assert.equal(lastDialog().title, "Not enough free electrons");
  assert.equal(run('freeE("L")'), 1);
});

test("products side never adds or deletes matter", () => {
  run('loadPreset(preset("Metal + acid"))');const gid = run('lone("R","Mg","atom").gid');
  run(`requestDelete(["${gid}"])`);
  assert.ok(run(`findGroup("${gid}")`), "delete is ignored on the right");
  run(`duplicateGroups(["${gid}"])`);
  assert.equal(run('onSide("R").length'), 3, "duplicate is ignored on the right");
  assert.match(run("flashMsg"), /can't be duplicated/);
});

test("deleting a reactant while products are untouched removes the twin", () => {
  run('loadPreset(preset("Metal + acid"))');run('requestDelete([lone("L","Mg","atom").gid])');
  assert.equal(win.__dialogs.length, 0);
  assert.equal(run('onSide("L").length'), 2);
  assert.equal(run('onSide("R").length'), 2);
  assert.equal(run('lone("R","Mg","atom")'), undefined);
});

test("deleting a reactant after products changed asks to reset", () => {
  run('loadPreset(preset("Metal + acid"))');run('reverseAtom(lone("R","Mg","atom").gid)');
  assert.equal(run("productsUntouched()"), false);
  run('requestDelete([lone("L","Mg","atom").gid])');
  assert.equal(lastDialog().title, "The products have already changed");
  assert.equal(run('onSide("L").length'), 3, "nothing removed yet");
  clickDialog("Delete and reset products");
  assert.equal(run('onSide("L").length'), 2);
  assert.equal(run('onSide("R").length'), 2);
  assert.equal(run("productsUntouched()"), true);
});

test("cancelling the delete dialog leaves everything alone", () => {
  run('loadPreset(preset("Metal + acid"))');run('reverseAtom(lone("R","Mg","atom").gid)');
  run('requestDelete([lone("L","Mg","atom").gid])');
  clickDialog("Cancel");
  assert.equal(run('onSide("L").length'), 3);
  assert.ok(run('lone("R","Mg","ion")'));
});

test("reset products re-mirrors the reactants", () => {
  run('loadPreset(preset("Metal + acid"))');run('reverseAtom(lone("R","Mg","atom").gid)');
  run("resetProducts()");
  assert.equal(run("productsUntouched()"), true);
  assert.equal(run('freeE("R")'), 0);
});

test("duplicating a reactant mirrors the copy", () => {
  run('dropEntry(libIndex("Lithium"))');
  run('duplicateGroups([onSide("L")[0].gid])');
  assert.equal(run('onSide("L").length'), 2);
  assert.equal(run('onSide("R").length'), 2);
  assert.equal(run("productsUntouched()"), true);
});

test("decomposition stays on the products side", () => {
  run('loadPreset(preset("Thermal decomposition"))');
  run('scissorGroup(onSide("R")[0].gid)');
  run('decomposeGroup(lone("R","CO3","ion").gid)');
  assert.ok(run('onSide("R").every(g => groupBounds(g).minC >= rangeOf("R")[0])'));
  assert.ok(run('find("R", g => chainFormula(g) === "CO₂")'));
  assert.ok(run('lone("R","O","ion")'));
  assert.ok(run("logText()").includes("Decomposition: CO₃²⁻ → O²⁻ + CO₂"));
});

test("status strip reports loose electrons and bare ions, then completion", () => {
  run('loadPreset(preset("Metal + halogen"))');
  run('reverseAtom(lone("R","Na","atom").gid)');
  assert.match(run("statusText()"), /1 electron still loose/);
  assert.match(run("statusText()"), /still charged: Na⁺/);
  run('scissorGroup(find("R", g => g.pieces.length === 2 && diatomicOf(g)).gid)');
  run('reverseAtom(lone("R","Cl","atom").gid)');                       // Cl + e- -> Cl-
  // snap the two ions together: put Cl- at the Na+ socket
  const na = run('lone("R","Na","ion").pieces[0]');
  run(`(() => { const cl = lone("R","Cl","ion"); cl.pieces[0].col = ${na.col + 2}; cl.pieces[0].row = ${na.row}; })()`);
  run("resolveBonds(); render();");
  assert.ok(run('find("R", g => compoundEquation(g) === "Na⁺ + Cl⁻ → NaCl")'));
  assert.ok(run("logText()").includes("Formation: Na⁺ + Cl⁻ → NaCl"));
});

test("an [H+][OH-] pair condenses into one H2O molecule", () => {
  run('loadPreset(preset("Metal + water"))');
  const gid = run('find("R", g => g.pieces.length === 2 && condenseCandidate(g)).gid');
  assert.equal(run(`compoundEquation(findGroup("${gid}"))`), "H⁺ + OH⁻ → H₂O");
  run(`condenseGroup("${gid}")`);
  assert.equal(run(`findGroup("${gid}")`), undefined, "the ion pair is gone");
  const w = run('find("R", g => chainFormula(g) === "H₂O")');
  assert.ok(w, "a covalent H₂O chain took its place");
  assert.equal(w.pieces.length, 3);
  assert.equal(w.bonds.length, 2);
  assert.ok(run("logText()").includes("Condensation: H⁺ + OH⁻ → H₂O"));
});

test("2H+ and an oxide ion condense into the same H2O, no third form", () => {
  // The carbonate + acid route: CO₃²⁻ decomposes to O²⁻, which then meets 2H⁺.
  const gid = run(`(() => {
    const c = rangeOf("R")[0] + 2;
    groups.push(single(speciesByKey("O-2"), c, 1, "R"));
    groups.push(single(speciesByKey("H+1"), c - 2, 1, "R"));
    groups.push(single(speciesByKey("H+1"), c - 2, 2, "R"));
    resolveBonds(); render();
    return onSide("R")[0].gid;
  })()`);
  assert.equal(run(`findGroup("${gid}").pieces.length`), 3, "both H⁺ snapped onto the oxide sockets");
  assert.equal(run(`compoundEquation(findGroup("${gid}"))`), "2H⁺ + O²⁻ → H₂O");
  run(`condenseGroup("${gid}")`);
  assert.ok(run('find("R", g => chainFormula(g) === "H₂O")'));
  assert.equal(run('onSide("R").length'), 1, "one molecule, nothing left over");
});

test("a group holding twice the atoms condenses into 2 H2O", () => {
  // Built directly: on the board these ions would sit as two separate
  // pairs, but the arithmetic has to hold for whatever does end up joined.
  const gid = run(`(() => {
    const c = rangeOf("R")[0] + 2;
    const at = (k, col, row) =>
      ({ pid: nextId("p"), spId: speciesByKey(k).id, col, row });
    const g = mkGroup([at("H+1", c - 2, 1), at("OH-1", c, 1),
                       at("H+1", c - 2, 2), at("OH-1", c, 2)], [], "R");
    groups.push(g); render();
    return g.gid;
  })()`);
  assert.equal(run(`condenseCandidate(findGroup("${gid}")).n`), 2);
  assert.equal(run(`compoundEquation(findGroup("${gid}"))`), "2H⁺ + 2OH⁻ → 2H₂O");
  run(`condenseGroup("${gid}")`);
  assert.equal(run('onSide("R").filter(g => chainFormula(g) === "H₂O").length'), 2);
});

test("an acid pair is not offered condensation", () => {
  run('loadPreset(preset("Metal + acid"))');
  assert.equal(run('find("R", g => g.pieces.length === 2 && condenseCandidate(g))'), undefined,
    "[H⁺][Cl⁻] must not quietly become HCl gas");
});

test("condensing is undone by the scissors", () => {
  run('loadPreset(preset("Metal + water"))');const gid = run('find("R", g => g.pieces.length === 2 && condenseCandidate(g)).gid');
  run(`condenseGroup("${gid}")`);
  const w = run('find("R", g => chainFormula(g) === "H₂O").gid');
  run(`scissorGroup("${w}")`);
  assert.equal(run('onSide("R").filter(g => g.pieces.length === 1 && speciesOf(g.pieces[0]).kind === "atom" && speciesOf(g.pieces[0]).sym === "H").length'), 2,
    "two H atoms, distinct from the H⁺ still in the other water pair");
  assert.ok(run('lone("R","O","atom")'));
});

test("a molecule already built is not offered condensation again", () => {
  run('dropEntry(libIndex("Water (H₂O)"))');
  const w = run('find("R", g => chainFormula(g) === "H₂O")');
  assert.ok(w, "the H₂O chain is on the products side");
  assert.equal(run(`condenseCandidate(findGroup("${w.gid}"))`), null,
    "its atoms tally to H₂O but it is already bonded");
});

test("CH4 breaks into its atoms", () => {
  run('dropEntry(libIndex("Methane"))');
  const gid = run('onSide("R")[0].gid');
  assert.equal(run(`findGroup("${gid}").pieces.length`), 1, "one tile, so no bonds to cut");
  assert.ok(run(`moleculeAtoms(findGroup("${gid}")) !== null`), "but it can still be opened");
  run(`splitMolecule("${gid}")`);
  assert.equal(run('onSide("R").filter(g => speciesOf(g.pieces[0]).sym === "C").length'), 1);
  assert.equal(run(`onSide("R").reduce((n, g) => n + g.pieces.filter(p =>
    speciesOf(p).sym === "H").length, 0)`), 4);
  assert.ok(run("logText()").includes("Bond broken: CH₄ → C + 4H"));
});

test("an oxygen plugs onto each side of carbon and condenses into CO2", () => {
  run(`(() => {
    const c = rangeOf("R")[0];
    groups.push(single(atomFor("O"), c,     1, "R"));
    groups.push(single(atomFor("C"), c + 2, 1, "R"));
    groups.push(single(atomFor("O"), c + 4, 1, "R"));
    resolveBonds(); render();
  })()`);
  assert.equal(run('onSide("R").length'), 1, "the three atoms plugged into one group");
  const gid = run('onSide("R")[0].gid');
  assert.equal(run(`condenseCandidate(findGroup("${gid}")).rule.sym`), "CO2");
  run(`condenseGroup("${gid}")`);
  assert.equal(run('chainFormula(onSide("R")[0])'), "CO₂");
  assert.ok(run("logText()").includes("Condensation: 2O + C → CO₂"));
});

test("carbon with only one oxygen is not condensable", () => {
  run(`(() => {
    const c = rangeOf("R")[0];
    groups.push(single(atomFor("C"), c,     1, "R"));
    groups.push(single(atomFor("O"), c + 2, 1, "R"));
    resolveBonds(); render();
  })()`);
  assert.equal(run('onSide("R").length'), 1, "they still plug together");
  assert.equal(run('condenseCandidate(onSide("R")[0])'), null, "but CO is not in CONDENSE");
});

test("covalent tabs never plug into an ion", () => {
  run(`(() => {
    const c = rangeOf("R")[0];
    groups.push(single(speciesByKey("Na+1"), c,     1, "R"));
    groups.push(single(atomFor("C"),         c + 2, 1, "R"));
    resolveBonds(); render();
  })()`);
  assert.equal(run('onSide("R").length'), 2, "a carbon block is not an anion");
});

test("an atom inside a finished molecule offers no sockets", () => {
  run('dropEntry(libIndex("Carbon dioxide"))');
  assert.equal(run(`(() => { const g = onSide("R")[0];
    return socketsOf(g.pieces.find(p => speciesOf(p).sym === "O"), g).length; })()`), 0,
    "its valency is spent, so it advertises nothing");
  const before = run('onSide("R").length');
  run(`(() => { const b = groupBounds(onSide("R")[0]);
    groups.push(single(atomFor("C"), b.maxC + 1, b.minR, "R"));
    resolveBonds(); render(); })()`);
  assert.equal(run('onSide("R").length'), before + 1, "a loose carbon stays separate");
});

test("two loose oxygens still pair into O2 rather than plugging", () => {
  run(`(() => {
    const c = rangeOf("R")[0];
    groups.push(single(atomFor("O"), c,     1, "R"));
    groups.push(single(atomFor("O"), c + 2, 1, "R"));
    resolveBonds(); render();
  })()`);
  assert.equal(run('chainFormula(onSide("R")[0])'), "O₂");
});

test("metal oxide + carbon can be taken to completion", () => {
  run(`loadPreset(preset("Metal oxide + carbon"))`);
  run('onSide("R").filter(g => g.pieces.length === 2).forEach(g => scissorGroup(g.gid))');
  run(`onSide("R").filter(g => g.pieces.length === 1 && speciesOf(g.pieces[0]).sym === "O" &&
    speciesOf(g.pieces[0]).kind === "ion").forEach(g => stripAnion(g.gid))`);
  run(`onSide("R").filter(g => g.pieces.length === 1 && speciesOf(g.pieces[0]).sym === "Cu" &&
    speciesOf(g.pieces[0]).kind === "ion").forEach(g => fuseFree(g.gid))`);
  run(`(() => { const c = rangeOf("R")[0], os = atomsOf("O"), cc = atomsOf("C")[0];
    park(cc, c + 2, 6); park(os[0], c, 6); park(os[1], c + 4, 6);
    resolveBonds(); render(); })()`);
  run('condenseGroup(find("R", g => condenseCandidate(g)).gid)');
  assert.ok(run('find("R", g => chainFormula(g) === "CO₂")'), "CO₂ was built on the carbon block");
  assert.equal(run('atomsOf("Cu").length'), 2);
  assert.match(run("statusText()"), /Products complete/);
});

test("a reactant at the far right of its side still mirrors intact", () => {
  // The last column that fits a tile must map onto the last column of the
  // products side; if the shift overshoots, placeCopy cannot use the mirror
  // position and scatters the group instead.
  const far = run("rangeOf('L')[1] - 2");
  run(`(() => {
    groups.push(single(speciesByKey("Na+1"), ${far} - 2, 1, "L"));
    groups.push(single(speciesByKey("Cl-1"), ${far}, 1, "L"));
    resetProducts();
  })()`);
  assert.equal(run('onSide("L").length'), 1, "Na⁺ and Cl⁻ bonded on the left");
  assert.equal(run('onSide("R").length'), 1, "and mirrored as one group, not scattered");
  assert.equal(run("productsUntouched()"), true);
  const l = run('groupBounds(onSide("L")[0])'), r = run('groupBounds(onSide("R")[0])');
  assert.equal(r.minC - l.minC, run("mirrorShift()"));
  assert.equal(r.minR, l.minR);
  assert.ok(r.maxC <= run("rangeOf('R')[1] - 1"), "the mirror stays on the board");
});

test("every preset loads on the board and mirrors cleanly", () => {
  const bad = JSON.parse(run(`JSON.stringify(PRESETS.map((p, i) => {
    fresh(); flashMsg = ""; loadPreset(p);
    const [lo, hi] = rangeOf("L");
    const off = onSide("L").some(g => g.pieces.some(pc => {
      const sp = speciesOf(pc);
      return pc.col < lo || pc.col + widthCells(sp) > hi
          || pc.row < 0 || pc.row + heightRows(sp) > ROWS;
    }));
    const unresolved = p.place.some(([w]) => !Array.isArray(w) && !speciesByKey(w));
    const charged = onSide("L").reduce((t, g) =>
      t + g.pieces.reduce((s, pc) => s + speciesOf(pc).charge, 0), 0) !== 0;
    const ok = !off && !unresolved && !charged && !flashMsg
      && productsUntouched() && onSide("R").length === onSide("L").length;
    return ok ? null : p.name;
  }).filter(Boolean))`));
  assert.deepEqual(bad, [], "presets that do not load cleanly");
});

test("clear board empties both sides and the log", () => {
  run('loadPreset(preset("Metal + water"))');run("resetBoard(); render();");
  assert.equal(run("groups.length"), 0);
  assert.equal(run("eqLog.length"), 0);
  assert.equal(run("statusText()"), "");
});

test("stable species keys resolve", () => {
  assert.equal(run('speciesByKey("Mg").kind'), "atom");
  assert.equal(run('speciesByKey("Mg+2").charge'), 2);
  assert.equal(run('speciesByKey("CO3-2").poly'), true);
  assert.equal(run('speciesByKey("e").kind'), "electron");
  assert.equal(run('speciesByKey("CH4").kind'), "molecule");
});

/* ===================== summary ===================== */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
