"""Export the body parts a recipe asks for to one .glb, plus a manifest.

    node tools/anatomy/zanatomy.js build <recipe.json>

(which runs this headless). A recipe:

  {
    "out": "parts.glb",                       relative to the recipe
    "budget_kb": 1500,                        the build fails if the .glb is bigger
    "decimate": 0.5,                          default fraction of triangles to keep
    "include": [                              each selector must match something
      {"name": "Humerus.l"},                  exact object name
      {"match": "^Median nerve\\.l$"},        regular expression on the name
      {"collection": "Bones of upper limb", "side": "l"},
                                              everything under that name: a
                                              system, a collection, a region, or
                                              a group in the label tree (lineage)
      {"name": "Median nerve.l", "decimate": 1.0, "tissue": "nerve"},
      {"collection": "Brachial plexus", "system": "Nervous system & Sense organs"}
                                              system: only parts of that system
    ],
    "exclude": [ ...same selectors... ],
    "kinds": ["part"],                        default: muscle origin/insertion
                                              patches are left out
    "tissues": {"nerve": "#e8c040", ...},     colour per tissue, overriding defaults
    "allow_nc": []                            names allowed past the NC licence
                                              block -- only with a reason, and
                                              never for anything published
  }

Every part comes out as its own node, named exactly as in the catalogue (and,
because three.js rewrites node names on load, with that name again in
extras.part -- read it as object.userData.part), with
its world transform baked into the vertices (so the mirrored .l parts are
ordinary geometry), in the model's own coordinates converted to y up. Each
node carries extras: side, system, parent group. Materials are one per
TISSUE (bone, cartilage, muscle, tendon, nerve, brain, ...), not the 170
source materials, so a scene can recolour a whole tissue at once.
"""
import bpy, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zanatomy_common import (is_part, side_of, kind_of, collection_paths, placement,
                             lineage, load_rules, licence_hits, haystack)

recipe_path, rules_path, out_glb, out_manifest, source_sha = sys.argv[sys.argv.index('--') + 1:][:5]
with open(recipe_path, encoding='utf-8') as f:
    R = json.load(f)
rules = load_rules(rules_path)
cpaths = collection_paths()

def fail(msg):
    print('RECIPE ERROR: ' + msg)
    sys.exit(1)

# --- every candidate part, with where it sits -----------------------------
cands = {}
for o in bpy.data.objects:
    if not is_part(o):
        continue
    system, groups, bonus, parent = placement(o, cpaths)
    lin = lineage(o)
    segs = set(lin)
    for p in groups + bonus:
        segs.update(p.split(' / '))
    if system:
        segs.add(system)
    cands[o.name] = dict(obj=o, side=side_of(o.name), kind=kind_of(o.name), system=system,
                         groups=groups, bonus=bonus, parent=parent, segs=segs,
                         hay=haystack(o.name, system, groups, bonus, parent, lin))

def select(sel):
    if 'name' in sel:
        hits = [sel['name']] if sel['name'] in cands else []
    elif 'match' in sel:
        rx = re.compile(sel['match'])
        hits = [n for n in cands if rx.search(n)]
    elif 'collection' in sel:
        hits = [n for n, c in cands.items() if sel['collection'] in c['segs']]
    else:
        fail('selector needs name, match or collection: ' + json.dumps(sel))
    if 'side' in sel:
        hits = [n for n in hits if cands[n]['side'] in (sel['side'], 'mid')]
    if 'system' in sel:
        # the region collections mix systems: "Brachial plexus" also holds
        # the muscles it supplies
        hits = [n for n in hits if cands[n]['system'] == sel['system']]
    return hits

kinds = set(R.get('kinds', ['part']))
chosen = {}
for sel in R.get('include', []):
    hits = [n for n in select(sel) if cands[n]['kind'] in kinds or 'name' in sel]
    if not hits:
        fail('matches nothing: ' + json.dumps(sel) + ' (check the name with: node tools/anatomy/zanatomy.js find ...)')
    for n in hits:
        chosen[n] = sel
for sel in R.get('exclude', []):
    for n in select(sel):
        chosen.pop(n, None)
if not chosen:
    fail('the recipe selects no parts')

# --- licence ---------------------------------------------------------------
allow = set(R.get('allow_nc', []))
warnings = []
for n in sorted(chosen):
    blk = licence_hits(rules, 'block', cands[n]['hay'])
    if blk and n not in allow:
        fail('"%s" may come from a non-commercial source (%s); see tools/anatomy/licence-rules.json' % (n, ', '.join(blk)))
    for w in licence_hits(rules, 'warn', cands[n]['hay']):
        warnings.append('%s: %s' % (n, w))

# --- tissue: from the source material, so a whole tissue recolours at once --
TISSUE_OF = [
    (r'^bone|suture|teeth|tooth|enamel', 'bone'),
    (r'cartilage|disc|meniscus', 'cartilage'),
    (r'tendon|aponeurosis|ligament|fascia|retinaculum|bursa|capsule', 'connective'),
    (r'nerve|ganglion|plexus', 'nerve'),
    (r'brain|white matter|grey|gray|cerebell|nucleus|cortex|spinal', 'brain'),
    (r'arter', 'artery'), (r'vein|venous|sinus', 'vein'), (r'lymph', 'lymph'),
    (r'flexion|extension|biarticular|muscle|abduct|adduct|rotat|origin|end-', 'muscle'),
]
DEFAULT_COLOUR = {
    'bone': '#efe6d2', 'cartilage': '#bcd7e0', 'connective': '#e9e2cf', 'nerve': '#e8c040',
    'brain': '#eba6aa', 'artery': '#c8382c', 'vein': '#3a5bb0', 'lymph': '#7fbf6a',
    'muscle': '#c4473f', 'other': '#c9bfb2',
}
colours = dict(DEFAULT_COLOUR, **R.get('tissues', {}))

def tissue_of(matname):
    m = (matname or '').lower()
    for rx, t in TISSUE_OF:
        if re.search(rx, m):
            return t
    return 'other'

def hex_rgba(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # glTF baseColorFactor is linear
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return lin + [1.0]

mats = {}
def material(tissue):
    if tissue not in mats:
        m = bpy.data.materials.new('zanat-' + tissue)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = hex_rgba(colours.get(tissue, colours['other']))
        bsdf.inputs['Roughness'].default_value = 0.6
        m['zanatomy_tissue'] = tissue
        mats[tissue] = m
    return mats[tissue]

# --- centrelines -------------------------------------------------------------
# Nerves are bevelled curves, and the spinal cord is a mesh bent along a
# curve by a CURVE modifier. Either way the path itself is the useful thing
# for a scene -- an impulse can travel along it -- and it survives decimation
# where ring order in the tube mesh does not. Each spline is sampled into a
# polyline in world space and converted to glTF's y up, (x, y, z) -> (x, z, -y).
# Splines meet end to end (a digital branch starts where the median nerve
# ends), so a page can join them into a graph and find a route through it.
from mathutils.geometry import interpolate_bezier

def centrelines(src):
    cu_obj = None
    if src.type == 'CURVE':
        cu_obj = src
    else:
        for m in src.modifiers:
            if m.type == 'CURVE' and m.object is not None and m.object.type == 'CURVE':
                cu_obj = m.object
                break
    if cu_obj is None:
        return None
    mw = cu_obj.matrix_world
    out = []
    for s in cu_obj.data.splines:
        pts = []
        if s.type == 'BEZIER':
            bp = list(s.bezier_points)
            if len(bp) < 2:
                continue
            segs = list(zip(bp, bp[1:])) + ([(bp[-1], bp[0])] if s.use_cyclic_u else [])
            for a, b in segs:
                ps = interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, 7)
                pts.extend(ps if not pts else ps[1:])
        else:
            pts = [p.co.xyz for p in s.points]
            if len(pts) < 2:
                continue
        w = [mw @ p for p in pts]
        out.append([[round(v.x, 4), round(v.z, 4), round(-v.y, 4)] for v in w])
    return out or None

# --- build: evaluate, bake the world transform, decimate --------------------
# Rename the sources out of the way so each export node can take the exact
# anatomical name. The .blend is never saved, so this touches nothing.
for n in chosen:
    cands[n]['obj'].name = '~src~' + n
out_coll = bpy.data.collections.new('zanatomy-export')
bpy.context.scene.collection.children.link(out_coll)
dg = bpy.context.evaluated_depsgraph_get()
default_ratio = float(R.get('decimate', 1.0))
built = []
for n in sorted(chosen):
    c, sel = cands[n], chosen[n]
    src = c['obj']
    me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    if len(me.polygons) == 0:
        print('skipped (no geometry): ' + n)
        bpy.data.meshes.remove(me)
        continue
    mw = src.matrix_world.copy()
    me.transform(mw)
    if mw.determinant() < 0:
        me.flip_normals()               # a mirrored .l part would otherwise be inside out
    xs = [v.co.x for v in me.vertices]
    cx = (min(xs) + max(xs)) / 2
    pos = 'l' if cx > 0.005 else ('r' if cx < -0.005 else 'mid')
    if c['side'] in ('l', 'r') and pos not in ('mid', c['side']):
        warnings.append('%s: named %s but lies on the %s (the source mislabels a few sides)' % (n, c['side'], pos))
    # materials: one per tissue, mapped from the source's own slots
    src_mats = [s.material.name if s.material else None for s in src.material_slots] or [None]
    tissues = [sel.get('tissue') or tissue_of(m) for m in src_mats]
    me.materials.clear()
    for t in tissues:
        me.materials.append(material(t))
    me.name = n                         # the glTF mesh carries the part's name too
    o = bpy.data.objects.new(n, me)
    if o.name != n:
        fail('could not give the export node the exact name "%s" (got "%s")' % (n, o.name))
    out_coll.objects.link(o)
    # three.js rewrites node names ("Median nerve.l" -> "Median_nervel"), so
    # the exact name also travels in extras, which it keeps as userData.part
    o['part'] = n
    o['side'] = c['side']
    o['system'] = c['system'] or ''
    if c['parent']:
        o['group'] = c['parent']
    o['lineage'] = json.dumps(lineage(src))
    cl = centrelines(src)
    if cl:
        o['centreline'] = json.dumps(cl, separators=(',', ':'))
    ratio = float(sel.get('decimate', default_ratio))
    tris0 = sum(len(p.vertices) - 2 for p in me.polygons)
    if ratio < 1.0:
        mod = o.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = ratio
    built.append((o, c, tris0, ratio, sorted(set(tissues))))

# --- export ------------------------------------------------------------------
for ob in bpy.context.view_layer.objects:
    ob.select_set(False)
for o, *_ in built:
    o.select_set(True)
os.makedirs(os.path.dirname(out_glb), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_extras=True,
    export_texcoords=False, export_normals=True, export_tangents=False,
    export_materials='EXPORT', export_vertex_color='NONE',
    export_animations=False, export_skins=False, export_morph=False,
    export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False)

# --- manifest -----------------------------------------------------------------
dg = bpy.context.evaluated_depsgraph_get()
parts, tot_v, tot_t = [], 0, 0
for o, c, tris0, ratio, tissues in built:
    em = o.evaluated_get(dg).to_mesh()
    em.calc_loop_triangles()
    v, t = len(em.vertices), len(em.loop_triangles)
    xs = [p.co for p in em.vertices]
    bbox = [[round(min(p[i] for p in xs), 4) for i in range(3)], [round(max(p[i] for p in xs), 4) for i in range(3)]]
    o.evaluated_get(dg).to_mesh_clear()
    tot_v += v
    tot_t += t
    parts.append({'name': o.name, 'side': c['side'], 'system': c['system'], 'group': c['parent'],
                  'tissues': tissues, 'tris_source': tris0, 'decimate': ratio, 'verts': v, 'tris': t,
                  'bbox_model_zup': bbox})
size = os.path.getsize(out_glb)
lic = json.load(open(rules_path, encoding='utf-8'))
manifest = {
    'recipe': os.path.basename(recipe_path), 'glb': os.path.basename(out_glb),
    'source': {'sha256': source_sha, 'blender': bpy.app.version_string},
    'licence': lic['licence'], 'attribution': lic['attribution'],
    'axes': 'glTF y up: model (x, y, z) -> (x, z, -y). Metres. +x is the body\'s LEFT; the front of the body faces +z.',
    'tissues': {t: colours.get(t, colours['other']) for t in sorted(mats)},
    'totals': {'parts': len(parts), 'verts': tot_v, 'tris': tot_t, 'bytes': size},
    'warnings': warnings, 'parts': parts,
}
with open(out_manifest, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(manifest, f, indent=1, ensure_ascii=False)
budget = R.get('budget_kb')
if budget and size > budget * 1024:
    fail('%s is %d KB, over the recipe budget of %d KB: lower "decimate" or drop parts' % (os.path.basename(out_glb), size // 1024, budget))
print('exported %d parts' % len(parts))
