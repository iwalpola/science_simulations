#!/usr/bin/env node
/* The Z-Anatomy workflow: build custom .glb files of named body parts.
 *
 *   node tools/anatomy/zanatomy.js setup              download Blender + the model (once)
 *   node tools/anatomy/zanatomy.js catalogue          rewrite tools/anatomy/catalogue.json
 *   node tools/anatomy/zanatomy.js build <recipe>     recipe .json -> .glb + .manifest.json
 *   node tools/anatomy/zanatomy.js find <words...>    search the catalogue (no Blender needed)
 *
 * Nothing big lives in the repo. Blender and the 307 MB source .blend go in
 * ZANATOMY_HOME (default: %LOCALAPPDATA%\z-anatomy-workflow on Windows,
 * ~/.z-anatomy-workflow elsewhere). Set BLENDER to use a Blender you already
 * have; it must be 4.2 or later (the file is saved by 3.5).
 *
 * Blender always runs with --disable-autoexec: the .blend carries its own
 * Python add-on (z-anatomy.py), and nothing in it needs to run to export.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const HOME = process.env.ZANATOMY_HOME ||
  (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'z-anatomy-workflow')
    : path.join(os.homedir(), '.z-anatomy-workflow'));

/* Pinned inputs. If Z-Anatomy ever changes the zip, the checksum fails
   loudly rather than the catalogue silently drifting from the model. */
const BLENDER_VERSION = '4.2.23';
const BLENDER_BUILD = { win32: 'windows-x64', linux: 'linux-x64' }[process.platform];
const ZIP_URL = 'https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip';
const ZIP_SHA = 'e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736';
const BLEND_SHA = '9f08a17ea0115fed80b2a73ecdf0a1bc2ab2f6956f37c593ce23d513ea35afcd';

const BLEND = path.join(HOME, 'source', 'Startup.blend');
const RULES = path.join(HERE, 'licence-rules.json');
const CATALOGUE = path.join(HERE, 'catalogue.json');

function die(msg) { console.error('zanatomy: ' + msg); process.exit(1); }
function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(1 << 22);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}
async function download(url, dest) {
  console.log('downloading ' + url);
  const res = await fetch(url);
  if (!res.ok) die(url + ': HTTP ' + res.status);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}
function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ stdio: 'inherit' }, opts));
  if (r.error) die(cmd + ': ' + r.error.message);
  if (r.status !== 0) die(path.basename(cmd) + ' exited ' + r.status);
}

function blenderExe() {
  if (process.env.BLENDER) return process.env.BLENDER;
  if (!BLENDER_BUILD) die('no automatic Blender for ' + process.platform + '; set BLENDER to a Blender 4.2+ executable');
  const dir = path.join(HOME, 'blender-' + BLENDER_VERSION + '-' + BLENDER_BUILD);
  return path.join(dir, process.platform === 'win32' ? 'blender.exe' : 'blender');
}

/* Run a script in Blender against the source file, and hide the noise the
   file always produces (a harmless dependency cycle in the oesophagus rig,
   a missing UI region, Blender's own memory report). */
function blender(script, args) {
  const exe = blenderExe();
  if (!fs.existsSync(exe)) die('Blender not found at ' + exe + '; run "node tools/anatomy/zanatomy.js setup"');
  if (!fs.existsSync(BLEND)) die('model not found at ' + BLEND + '; run "node tools/anatomy/zanatomy.js setup"');
  const r = spawnSync(exe, ['-b', '--factory-startup', '--disable-autoexec', BLEND,
    '--python-exit-code', '1', '--python', path.join(HERE, script), '--', ...args],
    { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) die(r.error.message);
  const noise = /^(\d\d:\d\d:\d\d \| INFO|INFO Draco|TBBmalloc|Dependency cycle|Detected \d+ dependency|  (OB|CU|ME)\S+\/|Warning: region type|scripts disabled for|Blender quit|Error: Not freed memory|Read blend:|$)/;
  const lines = (r.stdout + '\n' + r.stderr).split(/\r?\n/).filter(l => !noise.test(l));
  if (lines.length) console.log(lines.join('\n'));
  if (r.status !== 0) die('Blender exited ' + r.status);
}

async function setup() {
  fs.mkdirSync(path.join(HOME, 'downloads'), { recursive: true });
  fs.mkdirSync(path.join(HOME, 'source'), { recursive: true });
  /* Blender, checked against blender.org's own checksum file */
  if (!process.env.BLENDER && !fs.existsSync(blenderExe())) {
    if (!BLENDER_BUILD) die('no automatic Blender for ' + process.platform + '; install 4.2+ and set BLENDER');
    const series = BLENDER_VERSION.split('.').slice(0, 2).join('.');
    const name = 'blender-' + BLENDER_VERSION + '-' + BLENDER_BUILD + (process.platform === 'win32' ? '.zip' : '.tar.xz');
    const base = 'https://download.blender.org/release/Blender' + series + '/';
    const file = path.join(HOME, 'downloads', name);
    if (!fs.existsSync(file)) await download(base + name, file);
    const sums = await (await fetch(base + 'blender-' + BLENDER_VERSION + '.sha256')).text();
    const want = (sums.split('\n').find(l => l.includes(name)) || '').split(/\s+/)[0];
    if (!want || want !== sha256(file)) die(name + ': checksum does not match blender.org\'s');
    run('tar', ['-xf', file, '-C', HOME]);
  }
  console.log('Blender: ' + blenderExe());
  /* the model */
  if (!fs.existsSync(BLEND) || sha256(BLEND) !== BLEND_SHA) {
    const zip = path.join(HOME, 'downloads', 'Z-Anatomy.zip');
    if (!fs.existsSync(zip)) await download(ZIP_URL, zip);
    if (sha256(zip) !== ZIP_SHA) die('Z-Anatomy.zip has changed upstream (checksum differs). Inspect it, then update ZIP_SHA/BLEND_SHA and rebuild the catalogue.');
    run('tar', ['-xf', zip, '-C', path.join(HOME, 'downloads'), 'Z-Anatomy/Startup.blend']);
    fs.renameSync(path.join(HOME, 'downloads', 'Z-Anatomy', 'Startup.blend'), BLEND);
    if (sha256(BLEND) !== BLEND_SHA) die('Startup.blend checksum differs from the pinned one');
  }
  console.log('model:   ' + BLEND);
}

function find(words) {
  const cat = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
  const ws = words.map(w => w.toLowerCase());
  const hits = cat.parts.filter(p => {
    const hay = [p.name, p.system].concat(p.lineage, p.groups, p.regions).join(' ').toLowerCase();
    return ws.every(w => hay.includes(w));
  });
  hits.slice(0, 60).forEach(p => console.log(
    (p.name).padEnd(52) + ' ' + p.side.padEnd(3) + ' ' + String(p.tris).padStart(7) + ' tris  ' +
    (p.system || '') + (p.blocked ? '  BLOCKED:' + p.blocked : '') + (p.empty ? '  (no geometry)' : '')));
  console.log(hits.length + ' match' + (hits.length === 1 ? '' : 'es') + (hits.length > 60 ? ' (first 60 shown)' : ''));
}

function build(recipeArg) {
  if (!recipeArg) die('usage: zanatomy.js build <recipe.json>');
  const recipe = path.resolve(recipeArg);
  const r = JSON.parse(fs.readFileSync(recipe, 'utf8'));
  if (!r.out) die(recipe + ': no "out" (path of the .glb, relative to the recipe)');
  const glb = path.resolve(path.dirname(recipe), r.out);
  const manifest = glb.replace(/\.glb$/, '') + '.manifest.json';
  blender('zanatomy_export.py', [recipe, RULES, glb, manifest, sha256(BLEND)]);
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  console.log(path.relative(ROOT, glb) + ': ' + m.parts.length + ' parts, ' + m.totals.tris.toLocaleString() +
    ' triangles, ' + (m.totals.bytes / 1024).toFixed(0) + ' KB' + (m.warnings.length ? '\nwarnings:\n  ' + m.warnings.join('\n  ') : ''));
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'setup') await setup();
  else if (cmd === 'catalogue') blender('zanatomy_catalogue.py', [CATALOGUE, RULES, BLEND_SHA]);
  else if (cmd === 'build') build(rest[0]);
  else if (cmd === 'find') find(rest);
  else die('usage: zanatomy.js setup | catalogue | build <recipe.json> | find <words...>');
})();
