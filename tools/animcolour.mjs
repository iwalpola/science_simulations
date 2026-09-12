/* ===========================================================================
   animcolour.mjs — convert colours that are written every frame.

       node animcolour.mjs ../3dreactionscenes/combustion.html

   linearise() only runs once, so it cannot help a colour that gets rewritten
   on the next frame. Those have to convert at the point of assignment. This
   handles the two regular shapes:

       foo.color.setRGB(a, b, c);      ->  ... ; foo.color.convertSRGBToLinear();
       foo.emissive.setRGB(a, b, c);   ->  ... ; foo.emissive.convertSRGBToLinear();

   Anything else (.copy(), .lerp(), .set() chains) is reported, not touched —
   those need a human decision about where in the chain the conversion belongs.
   Idempotent: a site that already converts is left alone.
=========================================================================== */

import fs from 'fs';

const file = process.argv[2];
if(!file){ console.error('usage: node animcolour.mjs <scene.html>'); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const before = s;
let n = 0;

/* the argument list never contains ");" so a non-greedy match to the first one
   lands on the end of the call, even when it spans several lines */
for(const prop of ['color', 'emissive']){
  const re = new RegExp(
    '([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\.' + prop + '\\.setRGB\\(([\\s\\S]*?)\\);',
    'g');
  s = s.replace(re, (whole, target, args) => {
    /* already handled? */
    const tail = s.slice(s.indexOf(whole) + whole.length, s.indexOf(whole) + whole.length + 120);
    if(tail.includes(target + '.' + prop + '.convertSRGBToLinear')) return whole;
    n++;
    return whole + '\n' + ' '.repeat(4) + target + '.' + prop +
           '.convertSRGBToLinear();   // rewritten each frame, so convert here';
  });
}

if(s !== before) fs.writeFileSync(file, s);

const name = file.split(/[\\/]/).pop();
console.log(name + '  — converted ' + n + ' setRGB site(s)');

/* report anything the script will not touch */
const left = [];
s.split('\n').forEach((line, i)=>{
  if(/\.(color|emissive)\.(copy|lerp|set)\(/.test(line) && !/convertSRGBToLinear/.test(line))
    left.push('    line ' + (i+1) + ': ' + line.trim().slice(0, 78));
});
if(left.length){
  console.log('  needs a human (' + left.length + '):');
  left.forEach(l => console.log(l));
}
