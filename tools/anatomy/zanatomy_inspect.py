"""Dump every object in the Z-Anatomy Startup.blend to JSON, for inspection.

Run headless, with the file's own scripts disabled:

    blender -b --factory-startup --disable-autoexec Startup.blend \
        --python tools/anatomy/zanatomy_inspect.py -- out.json

One record per object: type, mesh data name and size, parent, every
collection it is in (with the path up to the top-level system), world
bounding box, modifiers, materials, and whether it is hidden.
"""
import bpy, json, sys
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]

# collection -> its parents, so each object can carry the full path
parents = {}
for c in bpy.data.collections:
    for ch in c.children:
        parents.setdefault(ch.name, []).append(c.name)
for ch in bpy.context.scene.collection.children:
    parents.setdefault(ch.name, []).append('<scene>')

def paths(name, seen=()):
    if name in seen:
        return [[name]]
    ps = [p for p in parents.get(name, []) if p != '<scene>']
    if not ps:
        return [[name]]
    out = []
    for p in ps:
        for q in paths(p, seen + (name,)):
            out.append(q + [name])
    return out

recs = []
for o in bpy.data.objects:
    r = {
        'name': o.name, 'type': o.type,
        'data': o.data.name if o.data else None,
        'parent': o.parent.name if o.parent else None,
        'collections': [' / '.join(p) for c in o.users_collection for p in paths(c.name)],
        'hide_viewport': o.hide_viewport, 'hide_render': o.hide_render,
        'scale': list(o.matrix_world.to_scale()),
        'det': o.matrix_world.determinant(),
        'modifiers': [m.type for m in o.modifiers],
        'materials': [s.material.name for s in o.material_slots if s.material],
    }
    if o.type == 'MESH':
        me = o.data
        r['verts'] = len(me.vertices)
        r['polys'] = len(me.polygons)
        r['edges'] = len(me.edges)
        r['mesh_users'] = me.users
    if o.type in ('MESH', 'CURVE', 'FONT', 'SURFACE'):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        r['bbox'] = [[min(v[i] for v in bb) for i in range(3)], [max(v[i] for v in bb) for i in range(3)]]
    # NOT o.data.body: some of the file's text labels have a null body, and
    # reading one crashes Blender 4.2 outright (access violation in
    # RNA_property_string_get), which no try/except can catch.
    recs.append(r)

with open(out, 'w', encoding='utf-8') as f:
    json.dump({'blender': bpy.app.version_string, 'file': bpy.data.filepath,
               'objects': recs,
               'collections': {c.name: [' / '.join(p) for p in paths(c.name)] for c in bpy.data.collections}},
              f, ensure_ascii=False)
print('wrote', len(recs), 'objects to', out)
