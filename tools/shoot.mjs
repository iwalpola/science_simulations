/* ===========================================================================
   shoot.mjs — screenshot any scene at chosen points on its timeline.

   Setup, once:
       cd tools && npm install puppeteer-core
   (puppeteer-core does NOT download a browser; it drives the Chrome or Edge
    you already have. Set CHROME below if yours lives somewhere else.)

   Use:
       node shoot.mjs ../particles/brownian-motion.html ./shots 2 6.5 24 47
       node shoot.mjs ../3dreactionscenes/combustion.html ./shots 0 18 34 47

   Paths must use forward slashes. Times are seconds on the scene's own clock.

   How the seeking works: every scene declares `let t` at the top level of a
   classic script, which puts it in the global lexical scope — so an eval in
   the page can assign to it by name. Nothing has to be added to the scenes
   themselves, and there is no debug hook to remember to strip out later.
=========================================================================== */

import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const CHROME = process.env.BROWSER || CANDIDATES.find(p => fs.existsSync(p));
if(!CHROME){
  console.error('No Chrome or Edge found. Set BROWSER=/path/to/chrome.exe');
  process.exit(1);
}

const file   = process.argv[2];
const outDir = process.argv[3] || './shots';
const times  = process.argv.slice(4).map(Number);
if(!file || !times.length){
  console.error('usage: node shoot.mjs <scene.html> <outDir> <t> [t...]');
  process.exit(1);
}
const abs = path.resolve(file).replace(/\\/g, '/');
const tag = path.basename(file, '.html');
fs.mkdirSync(outDir, {recursive:true});

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    /* there is no GPU in a headless session, so WebGL has to fall back to
       software rendering — without these the canvas comes out blank */
    '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--hide-scrollbars', '--mute-audio',
    '--allow-file-access-from-files'
  ]
});
const page = await browser.newPage();
await page.setViewport({width:1600, height:900, deviceScaleFactor:1});

const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if(m.type()==='error') errs.push('console: ' + m.text()); });

await page.goto('file:///' + abs, {waitUntil:'load'});
await page.waitForFunction('typeof THREE !== "undefined" && typeof TOTAL !== "undefined"',
                           {timeout:20000});
await new Promise(r=>setTimeout(r, 1500));

const gl = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if(!c) return 'no canvas';
  const g = c.getContext('webgl2') || c.getContext('webgl');
  return g ? g.getParameter(g.VERSION) : 'no context';
});
console.log('WebGL: ' + gl);

for(const tt of times){
  await page.evaluate('t = ' + tt + '; playing = false; curSeg = -1;');
  /* long enough for a few frames AND for the CSS transitions on the caption,
     the microscope vignette and any side panels to finish */
  await new Promise(r=>setTimeout(r, 950));
  const out = path.join(outDir, tag + '-t' + String(tt).replace('.','_') + '.png');
  await page.screenshot({path: out});
  console.log('  ' + path.basename(out));
}

if(errs.length){
  console.log('\nPAGE ERRORS (first 8):');
  errs.slice(0,8).forEach(e => console.log('  ' + e));
}
await browser.close();
