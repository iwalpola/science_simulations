/* ===========================================================================
   colourfix.mjs — apply the mechanical half of the colour-management fix.

       node colourfix.mjs ../3dreactionscenes/combustion.html

   What it does (all of it idempotent — running twice changes nothing):
     1. renderer outputEncoding / tone mapping / exposure
     2. the linearise() helper
     3. a linearise(scene) call at the end of build()
     4. sRGB encoding on label canvas textures
     5. the bench: a radial falloff map instead of a flat disc

   What it deliberately does NOT do: convert colours that are rewritten every
   frame. Those have to be handled at the point of assignment, and the script
   lists them at the end so they are not forgotten. See AGENTS.md.
=========================================================================== */

import fs from 'fs';

const file = process.argv[2];
if(!file){ console.error('usage: node colourfix.mjs <scene.html>'); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const before = s;
const done = [], skipped = [];

function sub(name, find, replace){
  if(s.includes(replace.slice(0, 60))){ skipped.push(name + ' (already)'); return; }
  if(!s.includes(find)){ skipped.push(name + ' (anchor not found)'); return; }
  s = s.replace(find, replace);
  done.push(name);
}

/* 1 — renderer ------------------------------------------------------------ */
sub('renderer',
`renderer.setSize(innerWidth,innerHeight);`,
`renderer.setSize(innerWidth,innerHeight);
/* Colour management. Without outputEncoding the render is never converted back
   to sRGB, so every colour comes out darker and flatter than it was chosen to
   be. r128 spelling — this became outputColorSpace in later versions. */
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;`);

/* 2 — the linearise helper ------------------------------------------------ */
sub('linearise()',
`function clearGroup(g){`,
`/* The other half of colour management. r128 uses a material colour in the
   lighting maths as if it were already linear, but hex codes are picked by eye
   and so are sRGB. Setting outputEncoding WITHOUT this leaves everything too
   light and desaturated. The flag keeps it idempotent, so rebuilding on a
   species change cannot double-convert. Colours rewritten every frame convert
   at the point of assignment instead. */
function linearise(root){
  root.traverse(o=>{
    if(!o.material) return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m || m.userData.__lin) return;
      m.userData.__lin = true;
      if(m.color)    m.color.convertSRGBToLinear();
      if(m.emissive) m.emissive.convertSRGBToLinear();
    });
  });
}

function clearGroup(g){`);

/* 3 — call it ------------------------------------------------------------- */
sub('linearise(scene) call',
`  buildLegend();\n`,
`  buildLegend();\n  linearise(scene);      // authored colours are sRGB; the renderer wants linear\n`);

/* 4 — label textures ------------------------------------------------------ */
sub('label texture encoding',
`  const tex = new THREE.CanvasTexture(c); tex.anisotropy=4;`,
`  const tex = new THREE.CanvasTexture(c); tex.anisotropy=4;
  tex.encoding = THREE.sRGBEncoding;`);

/* 5 — the bench ----------------------------------------------------------- */
sub('bench falloff',
`const bench = new THREE.Mesh(
  new THREE.CylinderGeometry(9,9,0.35,64),
  new THREE.MeshStandardMaterial({color:0x11151d, roughness:0.95, metalness:0})
);`,
`/* The bench gets a radial falloff painted into its colour map. Once the output
   is correctly sRGB-encoded even a near-black albedo lifts to a visible grey,
   and a flat 18-metre disc then sweeps across the lower frame as a pale dome.
   Darkening it further is not the fix; making it a pool of light is. A
   cylinder's cap UVs are a circle inscribed in the 0..1 square, so a radial
   gradient lands exactly on the disc. */
const benchMap = (function(){
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0,0,S,S);
  const g = x.createRadialGradient(S/2,S/2,0, S/2,S/2,S*0.5);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.11, 'rgba(226,232,242,0.80)');
  g.addColorStop(0.24, 'rgba(140,152,172,0.26)');
  g.addColorStop(0.36, 'rgba(56,64,78,0.06)');
  g.addColorStop(0.50, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0,0,S,S);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
})();
const bench = new THREE.Mesh(
  new THREE.CylinderGeometry(9,9,0.35,64),
  new THREE.MeshStandardMaterial({color:0x4a515d, map:benchMap,
    roughness:0.94, metalness:0, envMapIntensity:0.10})
);`);

if(s !== before) fs.writeFileSync(file, s);

console.log(file.split(/[\\/]/).pop());
console.log('  applied: ' + (done.join(', ') || 'nothing'));
if(skipped.length) console.log('  skipped: ' + skipped.join(', '));

/* what still needs doing by hand */
const anim = [];
s.split('\n').forEach((line, i)=>{
  if(/\.(color|emissive)\.(setRGB|set|copy|lerp)\(/.test(line)
     && !/convertSRGBToLinear/.test(line))
    anim.push('    line ' + (i+1) + ': ' + line.trim().slice(0, 74));
});
if(anim.length){
  console.log('  STILL TO CONVERT BY HAND (' + anim.length + '):');
  anim.forEach(a => console.log(a));
}
