/* ============================================================
   SHARED ORGANELLES — one source of truth for how organelles look
   across every cell model. Appearance is taken from
   generic_plant_cell.html.

   Load after three.js:
     <script src="organelles.js"></script>

   Organelles are built whole here (mitochondrion, nucleus,
   chloroplast, ribosome). Structures whose shape depends on the
   model (wall, membrane, vacuole, cytoplasm) are built by each
   page, but take their material from here so the colours match.
   ============================================================ */
window.Organelles = (() => {
  const phong = (base, over) => new THREE.MeshPhongMaterial(Object.assign({}, base, over || {}));
  const see = { transparent:true, side:THREE.DoubleSide, depthWrite:false };

  /* ---- organelle materials: one instance per page, shared by every copy ---- */
  const materials = {
    nucleus:       phong({ color:0x7e3f9d, shininess:35, specular:0xd9a8ee, emissive:0x30103f, emissiveIntensity:0.5 }),
    nucleolus:     phong({ color:0x4d1f66, shininess:25, specular:0xa878c4, emissive:0x1d0a28, emissiveIntensity:0.6 }),
    envelope:      phong({ color:0xb478d0, shininess:50, specular:0xf0d8ff, opacity:0.30, ...see }),
    mitochondrion: phong({ color:0xe0847f, shininess:30, specular:0xffc9c2, emissive:0x5a201d, emissiveIntensity:0.4, opacity:0.55, ...see }),
    cristae:       phong({ color:0x5aa8e8, shininess:65, specular:0xcfe8ff, emissive:0x0d3a5c, emissiveIntensity:0.55 }),
    chloroplast:   phong({ color:0x74b354, shininess:35, specular:0xc8f0aa, emissive:0x1e3d14, emissiveIntensity:0.45 }),
    grana:         phong({ color:0x3d7a2b, shininess:20, specular:0x6aa855 }),
    ribosome:      phong({ color:0x6a2f8a, shininess:60, specular:0xe0b8f0, emissive:0x2a0d38, emissiveIntensity:0.55 }),
    roughER:       phong({ color:0xc07ad8, shininess:45, specular:0xf2ddff, emissive:0x3d1a4d, emissiveIntensity:0.45 })
  };

  /* ---- model-shaped structures: a fresh material per call, so a page can
     hold several at different opacities; pass overrides as needed ---- */
  const cytoplasmMaterial = o => phong({ color:0xf4efc4, shininess:6,  specular:0x55553a, opacity:0.16, ...see, side:THREE.FrontSide }, o);
  const wallMaterial      = o => phong({ color:0x8ac46a, shininess:30, specular:0xd9ffc2, emissive:0x2c4a1e, emissiveIntensity:0.35, opacity:0.42, ...see }, o);
  const wallInnerMaterial = o => phong({ color:0x6ba84c, shininess:15, specular:0x8fbf72, opacity:0.45, ...see, side:THREE.BackSide }, o);
  const membraneMaterial  = o => phong({ color:0xe0664a, shininess:45, specular:0xffc2b0, emissive:0x5e1c10, emissiveIntensity:0.4, opacity:0.55, ...see }, o);
  const membraneInnerMaterial = o => phong({ color:0xc4503a, shininess:20, specular:0x8a4a45, opacity:0.55, ...see, side:THREE.BackSide }, o);
  const vacuoleMaterial   = o => phong({ color:0xeef6f8, shininess:70, specular:0xffffff, emissive:0x35434a, emissiveIntensity:0.3, opacity:0.42, ...see }, o);

  // an opaque membrane has to write depth or it sorts wrongly
  function setOpacity(mat, opacity) {
    mat.opacity = opacity;
    mat.transparent = opacity < 1;
    mat.depthWrite = opacity >= 1;
    mat.needsUpdate = true;
  }

  /* ---- MITOCHONDRION ----
     Translucent outer membrane with a zigzag ridge inside standing in for
     the cristae. The ridge is built in the body's unit-sphere space and
     parented to it, so it stretches with the body's non-uniform scale.
     Returns a maker so every copy shares the same two geometries. */
  const MITO = { length:0.30, width:0.11, cristae:true, folds:5, amplitude:0.46, thickness:0.15 };

  function cristaeGeometry(o) {
    const pts = [];
    const N = Math.max(2, Math.round(o.folds));
    for (let i = 0; i <= N; i++) {
      pts.push(new THREE.Vector3(-0.55 + (i / N) * 1.10, (i % 2 === 0 ? 1 : -1) * o.amplitude, 0));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 6, o.thickness, 6, false);
  }

  function mitochondrionMaker(opts) {
    const o = Object.assign({}, MITO, opts);
    const bodyGeo = new THREE.SphereGeometry(1, 12, 9);
    const ridgeGeo = o.cristae ? cristaeGeometry(o) : null;
    // roll spins the ridge about the long axis so the folds don't all line up
    return function make(roll = 0) {
      const m = new THREE.Mesh(bodyGeo, materials.mitochondrion);
      m.scale.set(o.length, o.width, o.width);
      if (ridgeGeo) {
        const zz = new THREE.Mesh(ridgeGeo, materials.cristae);
        zz.rotation.x = roll;
        m.add(zz);
      }
      return m;
    };
  }

  /* ---- NUCLEUS ----
     Nucleus with nucleolus and a translucent envelope, centred on the
     returned group's origin. */
  const NUC = { radius:0.72, flatten:0.88, nucleolusSize:0.34, envelopeGap:0.10 };

  function nucleus(opts) {
    const o = Object.assign({}, NUC, opts);
    const R = o.radius;
    const group = new THREE.Group();

    const geo = new THREE.SphereGeometry(R, 32, 24);
    geo.scale(1, o.flatten, 1);
    const nuc = new THREE.Mesh(geo, materials.nucleus);
    group.add(nuc);

    if (o.nucleolusSize > 0.01) {
      const nl = new THREE.Mesh(new THREE.SphereGeometry(R * o.nucleolusSize, 16, 12), materials.nucleolus);
      nl.position.set(R * 0.28, R * 0.12 * o.flatten, R * 0.22);
      nuc.add(nl);
    }

    if (o.envelopeGap > 0.005) {
      const eg = new THREE.SphereGeometry(R * (1 + o.envelopeGap), 28, 20);
      eg.scale(1, o.flatten, 1);
      group.add(new THREE.Mesh(eg, materials.envelope));
    }
    return group;
  }

  /* ---- CHLOROPLAST ----
     Lens shape: long, moderately wide, squashed through the third axis,
     with a darker stacked interior standing in for grana at this scale. */
  const CHLORO = { length:0.40, width:0.22, flatten:0.62, grana:true };

  function chloroplastMaker(opts) {
    const o = Object.assign({}, CHLORO, opts);
    const geo = new THREE.SphereGeometry(1, 14, 10);
    return function make() {
      const c = new THREE.Mesh(geo, materials.chloroplast);
      c.scale.set(o.length, o.width, o.width * o.flatten);
      if (o.grana) {
        const g = new THREE.Mesh(geo, materials.grana);
        g.scale.set(0.6, 0.55, 0.5);
        c.add(g);
      }
      return c;
    };
  }

  /* ---- RIBOSOMES ---- */
  const ribosomeGeometry = size => new THREE.SphereGeometry(size, 7, 6);
  const ribosome = geo => new THREE.Mesh(geo, materials.ribosome);

  /* ---- ROUGH ENDOPLASMIC RETICULUM ----
     A serpentine path folded back on itself, tubed, then squashed flat so
     the tubes read as stacked cisternae rather than pipes. Ribosomes are
     studded along the same curve on random sides. Returns a group centred
     on its origin; the page positions it. Pass the page's seeded random
     so a rebuild keeps the ribosomes in place. */
  const ER = { folds:5, width:1.35, spacing:0.28, ripple:0.12, tube:0.060, flatten:0.55, tilt:73,
               riboSize:0.045, riboDensity:40, random:Math.random };

  function roughER(opts) {
    const o = Object.assign({}, ER, opts);
    const er = new THREE.Group();
    const F = Math.max(1, Math.round(o.folds));
    const W = o.width;
    const pts = [];

    for (let i = 0; i < F; i++) {
      const y = (i - (F - 1) / 2) * o.spacing;
      const dir = i % 2 === 0 ? 1 : -1;
      const N = 12;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const x = (-W / 2 + t * W) * dir;
        const z = Math.sin(t * Math.PI * 2 + i * 1.3) * o.ripple;
        pts.push(new THREE.Vector3(x, y + Math.sin(t * Math.PI) * o.spacing * 0.12, z));
      }
      // a rounded U-turn out past the end so the folds do not pinch
      if (i < F - 1) {
        const nextY = (i + 1 - (F - 1) / 2) * o.spacing;
        pts.push(new THREE.Vector3((W / 2 + o.spacing * 0.5) * dir, (y + nextY) / 2, 0));
      }
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    er.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, o.tube, 8, false), materials.roughER));

    const count = Math.round(o.riboDensity) * F;
    if (count > 0 && o.riboSize > 0.005) {
      const rg = ribosomeGeometry(o.riboSize);
      for (let i = 0; i < count; i++) {
        const t = Math.min((i + 0.5) / count, 0.999);
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const ref = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const side = new THREE.Vector3().crossVectors(tan, ref).normalize()
          .applyAxisAngle(tan, o.random() * Math.PI * 2);
        const r = ribosome(rg);
        r.position.copy(p).addScaledVector(side, o.tube * 0.9);
        er.add(r);
      }
    }

    er.scale.set(1, 1, o.flatten);
    er.rotation.set(0, THREE.MathUtils.degToRad(o.tilt), THREE.MathUtils.degToRad(o.tilt * 0.4));
    return er;
  }

  return {
    materials,
    setOpacity,
    cytoplasmMaterial, wallMaterial, wallInnerMaterial,
    membraneMaterial, membraneInnerMaterial, vacuoleMaterial,
    mitochondrionMaker, nucleus, chloroplastMaker,
    ribosomeGeometry, ribosome, roughER
  };
})();
