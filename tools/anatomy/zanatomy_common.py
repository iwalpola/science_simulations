"""Shared by the Z-Anatomy Blender scripts: what counts as a body part,
which side it is on, where it sits in the collection tree, and what its
licence allows. Runs inside Blender's Python.

What the file's naming means (worked out by tools/anatomy/zanatomy_inspect.py):

  Name.r / Name.l     the right / left part. The .l is the .r mesh mirrored
                      (negative scale), sharing its mesh data.
  Name.er / Name.el   a muscle's END (insertion) patch, right / left; numbered
                      .e1l .e2l ... when it has several
  (Attachment patches hang off the BONE in the label tree, not the muscle,
  so selecting a group of bones brings them in unless kinds filters them.)
  Name.or / Name.ol   a muscle's ORIGIN patch, right / left
  Name                a midline part (spinal cord, brainstem, sternum...)
  Name.t, Name.s      a label's text (FONT), right / left
  Name.j, Name.i      a label's leader line (2-vertex MESH), right / left
  Name.g              a group label (FONT); parents the parts in that group
  Name.st             a few stray label texts

Labels are never body parts. Nerves are CURVE objects with a bevel, and the
spinal cord is built procedurally (mirror + array + curve modifiers on a
small profile), so a part must be EVALUATED to get its real geometry.

hide_render is NOT a usable filter: most real geometry has it set. The
visible parts are the ones not hidden in the viewport.
"""
import bpy, json, re

LABEL = re.compile(r'\.(j|t|g|i|s|st)$')
# .l / .r, and the muscle attachment patches .el .er .ol .or -- which also
# come numbered when a muscle has several: .e1l, .o3r, up to .e26l
SIDE = re.compile(r'\.(e|o)?(\d+)?([lr])$')


def is_part(o):
    return o.type in ('MESH', 'CURVE') and not LABEL.search(o.name) and not o.hide_viewport


def side_of(name):
    m = SIDE.search(name)
    return m.group(3) if m else 'mid'


def kind_of(name):
    m = SIDE.search(name)
    if not m or not m.group(1):
        return 'part'
    return 'insertion' if m.group(1) == 'e' else 'origin'


def collection_paths():
    """collection name -> list of paths (each a list of names from the top)"""
    parents = {}
    for c in bpy.data.collections:
        for ch in c.children:
            parents.setdefault(ch.name, []).append(c.name)

    memo = {}

    def paths(name, seen=()):
        if name in memo:
            return memo[name]
        ps = [p for p in parents.get(name, []) if p not in seen]
        res = [[name]] if not ps else [q + [name] for p in ps for q in paths(p, seen + (name,))]
        memo[name] = res
        return res

    return {c.name: paths(c.name) for c in bpy.data.collections}


def placement(o, cpaths):
    """The anatomical system (top-level collection), the specific collections,
    and the 'Bonus collection' regional/functional paths."""
    system, groups, bonus = None, [], []
    for c in o.users_collection:
        for p in cpaths.get(c.name, [[c.name]]):
            if p[0] == 'Bonus collection':
                if len(p) > 1:
                    bonus.append(' / '.join(p[1:]))
            elif re.match(r'^\d+: ', p[0]):
                system = system or p[0].split(': ', 1)[1]
                if len(p) > 1:
                    groups.append(' / '.join(p[1:]))
            else:
                groups.append(' / '.join(p))
    parent = o.parent.name if o.parent else None
    if parent and parent.endswith('.g'):
        parent = parent[:-2]
    return system, sorted(set(groups)), sorted(set(bonus)), parent


def lineage(o):
    """The chain of group labels above a part, nearest first: Humerus.l ->
    ['Bones of free part of upper limb', 'Bones of upper limb', ...]. This is
    the file's real anatomical tree; the collections are flatter."""
    out, p, seen = [], o.parent, set()
    while p is not None and p.name not in seen:
        seen.add(p.name)
        if p.name.endswith('.g'):
            out.append(p.name[:-2])
        p = p.parent
    return out


def load_rules(path):
    with open(path, encoding='utf-8') as f:
        rules = json.load(f)
    for r in rules['block'] + rules['warn']:
        r['re'] = re.compile(r['pattern'], re.I)
    return rules


def licence_hits(rules, kind, haystack):
    return [r['id'] for r in rules[kind] if r['re'].search(haystack)]


def haystack(name, system, groups, bonus, parent, lin=()):
    return '\n'.join([name, system or '', parent or ''] + groups + bonus + list(lin))
