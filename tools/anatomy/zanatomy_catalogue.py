"""Write the catalogue of every body part in the Z-Anatomy file.

    node tools/anatomy/zanatomy.js catalogue

(which runs this headless). The catalogue is committed, so an agent can find
the exact name of a part, see where it is and how heavy it is, and write a
recipe, all without Blender.

Coordinates are the model's own: metres, z up, -y is the front of the body,
+x is the body's LEFT (the .l parts). An exported .glb converts to y up the
usual glTF way: (x, y, z) -> (x, z, -y).

Counts are of the EVALUATED part (modifiers applied, curves turned into
tubes), so they are what an export will actually carry before decimation.
"""
import bpy, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zanatomy_common import (is_part, side_of, kind_of, collection_paths, placement,
                             lineage, load_rules, licence_hits, haystack)
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out_path, rules_path, source_sha = args[0], args[1], args[2]
rules = load_rules(rules_path)
cpaths = collection_paths()
dg = bpy.context.evaluated_depsgraph_get()

parts = []
for o in sorted(bpy.data.objects, key=lambda o: o.name):
    if not is_part(o):
        continue
    oe = o.evaluated_get(dg)
    try:
        me = oe.to_mesh()
    except RuntimeError:
        me = None
    verts = tris = 0
    bbox = None
    if me is not None:
        verts = len(me.vertices)
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        if verts:
            mw = o.matrix_world
            ws = [mw @ v.co for v in me.vertices]
            bbox = [[round(min(v[i] for v in ws), 4) for i in range(3)],
                    [round(max(v[i] for v in ws), 4) for i in range(3)]]
        oe.to_mesh_clear()
    system, groups, bonus, parent = placement(o, cpaths)
    lin = lineage(o)
    hay = haystack(o.name, system, groups, bonus, parent, lin)
    rec = {
        'name': o.name, 'side': side_of(o.name), 'kind': kind_of(o.name),
        'type': o.type, 'system': system, 'lineage': lin,
        'groups': groups, 'regions': bonus,
        'verts': verts, 'tris': tris, 'bbox': bbox,
        'materials': [s.material.name for s in o.material_slots if s.material],
    }
    # The source mislabels a few sides (Eyelashes.l, several .el patches sit
    # on the right). Trust the position, and say so.
    if bbox and rec['side'] in ('l', 'r'):
        cx = (bbox[0][0] + bbox[1][0]) / 2
        pos = 'l' if cx > 0.005 else ('r' if cx < -0.005 else 'mid')
        if pos != 'mid' and pos != rec['side']:
            rec['side_mismatch'] = pos
    blk, wrn = licence_hits(rules, 'block', hay), licence_hits(rules, 'warn', hay)
    if blk:
        rec['blocked'] = blk
    if wrn:
        rec['warn'] = wrn
    if tris == 0:
        rec['empty'] = True
    parts.append(rec)

with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('{"source":%s,\n"parts":[\n' % json.dumps({
        'file': 'Startup.blend from Z-Anatomy.zip, https://github.com/Z-Anatomy/Models-of-human-anatomy',
        'sha256': source_sha, 'blender': bpy.app.version_string,
        'units': 'metres', 'axes': 'z up, -y front, +x is the body\'s LEFT (.l)',
        'counts': 'evaluated: modifiers applied, curves as tubes, before decimation'}))
    f.write(',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in parts))
    f.write('\n]}\n')
print('catalogue:', len(parts), 'parts ->', out_path)
