"""Build distinct Qigan/Mianhuadi terminals and Zhongshan-106 ferry assets.

Blender 5.2+:
  blender -b --python scripts/jiangxinzhou_ferry_models.py -- \
    --output-dir public/models/jiangxinzhou-v2

The geometry is an original public-visitor model calibrated from public
reference photography. It is not a survey, naval plan or BIM replica.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="public/models/jiangxinzhou-v2")
    parser.add_argument("--review-dir", default="output/ferry-review")
    parser.add_argument("--skip-review", action="store_true")
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


ARGS = arguments()
OUTPUT_DIR = (Path.cwd() / ARGS.output_dir).resolve()
REVIEW_DIR = (Path.cwd() / ARGS.review_dir).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
REVIEW_DIR.mkdir(parents=True, exist_ok=True)


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def material(name, rgba, roughness=0.6, metallic=0.0, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = rgba
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = 1.2
    return value


WHITE = material("Ferry superstructure white", (0.88, 0.91, 0.88, 1), 0.52)
CONCRETE = material("Pier concrete", (0.46, 0.51, 0.50, 1), 0.86)
DECK = material("Pier deck paving", (0.22, 0.28, 0.28, 1), 0.82)
BLUE = material("Ferry hull blue", (0.035, 0.28, 0.43, 1), 0.43, 0.18)
SIGN_BLUE = material("Terminal sign blue", (0.035, 0.34, 0.56, 1), 0.5, 0.1)
RED = material("Ferry safety red", (0.84, 0.08, 0.055, 1), 0.48)
RUST_RED = material("Mianhuadi gate red", (0.43, 0.10, 0.075, 1), 0.62)
WINDOW = material("Ferry smoked window", (0.025, 0.10, 0.14, 1), 0.24, 0.12)
METAL = material("Pier and ferry rail metal", (0.36, 0.41, 0.40, 1), 0.32, 0.72)
DARK_METAL = material("Ferry dark metal", (0.08, 0.11, 0.12, 1), 0.28, 0.78)
YELLOW = material("Safety yellow", (0.95, 0.62, 0.08, 1), 0.48)
WOOD = material("Waiting bench timber", (0.35, 0.19, 0.09, 1), 0.68)
LIGHT = material("Ferry navigation light", (1.0, 0.72, 0.18, 1), 0.25, emission=(1.0, 0.55, 0.08, 1))
GREEN_LIGHT = material("Starboard navigation light", (0.1, 0.85, 0.34, 1), 0.25, emission=(0.03, 0.8, 0.2, 1))
RED_LIGHT = material("Port navigation light", (0.95, 0.08, 0.05, 1), 0.25, emission=(0.9, 0.02, 0.01, 1))


def link(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def cube(name, location, scale, mat, collection, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return link(obj, collection)


def cylinder(name, location, radius, depth, mat, collection, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return link(obj, collection)


def sphere(name, location, scale, mat, collection, segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return link(obj, collection)


def rail(collection, start, end, radius=0.055, mat=METAL, name="Safety rail"):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    obj = cylinder(name, (a + b) / 2, radius, delta.length, mat, collection, vertices=10)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def rail_run(collection, x0, x1, y, z=1.7, posts=7, name="Pier safety rail"):
    rail(collection, (x0, y, z), (x1, y, z), name=name)
    rail(collection, (x0, y, z - 0.48), (x1, y, z - 0.48), radius=0.04, name=name)
    for index in range(posts):
        x = x0 + (x1 - x0) * index / max(1, posts - 1)
        rail(collection, (x, y, 0.9), (x, y, z), radius=0.045, name=f"{name} post")


def bollards(collection, xs, y):
    for x in xs:
        cylinder("Mooring bollard", (x, y, 1.12), 0.18, 0.65, DARK_METAL, collection, vertices=12)
        cylinder("Mooring bollard cap", (x, y, 1.5), 0.27, 0.12, DARK_METAL, collection, vertices=12)


def qigan_terminal(detail):
    collection = bpy.data.collections.new("Qigan Ferry Terminal")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("QiganTerminalRoot", None)
    collection.objects.link(root)
    cube("QiganTerminal", (-8, 0, 0.52), (0.02, 0.02, 0.02), CONCRETE, collection)
    cube("Qigan shore platform", (-8, 0, 0.48), (48, 9.2, 0.96), CONCRETE, collection, 0.28)
    cube("Qigan deck paving", (-7, 0, 1.02), (45, 8.0, 0.18), DECK, collection, 0.08)
    cube("Qigan floating pontoon", (20, 0, 0.58), (11, 7.4, 0.5), CONCRETE, collection, 0.18)
    cube("Qigan boarding ramp", (13.5, 0, 1.13), (10, 5.9, 0.22), DECK, collection, 0.08, rotation=(0, math.radians(-4), 0))
    rail_run(collection, -28, 22, -4.15, posts=12, name="Qigan riverside rail")
    rail_run(collection, -28, 22, 4.15, posts=12, name="Qigan riverside rail")
    bollards(collection, (17, 21.5), -3.0)
    # The island-side entrance is a broad blue-and-white portal in public photographs.
    for y in (-3.0, 3.0):
        cube("Qigan entrance column", (-28.2, y, 3.25), (0.8, 0.8, 5.8), WHITE, collection, 0.12)
    cube("Qigan entrance lintel", (-28.2, 0, 6.05), (0.9, 7.0, 0.75), SIGN_BLUE, collection, 0.1)
    cube("Qigan terminal sign panel", (-27.72, 0, 5.25), (0.12, 5.1, 1.05), SIGN_BLUE, collection, 0.04)
    cube("Qigan waiting canopy roof", (-14, 0, 4.45), (14.5, 6.6, 0.24), WHITE, collection, 0.12)
    for x in (-19.8, -14.0, -8.2):
        for y in (-2.7, 2.7):
            cylinder("Qigan canopy column", (x, y, 2.7), 0.11, 3.5, METAL, collection, vertices=12)
    if detail == "lod2":
        for x in (-18, -13, -8):
            cylinder("Qigan canopy light", (x, 0, 4.27), 0.13, 0.14, LIGHT, collection, vertices=12)
        for x in (-18, -12, -6):
            cube("Qigan waiting bench", (x, 0, 1.45), (3.2, 0.65, 0.42), WOOD, collection, 0.08)
        for x in (-25.5, -24.1, -22.7):
            cylinder("Qigan separation bollard", (x, 0, 1.32), 0.12, 0.7, YELLOW, collection, vertices=12)
        cube("Qigan pedestrian gate", (-25.7, -2.1, 2.0), (0.18, 2.5, 2.2), METAL, collection, 0.04)
        cube("Qigan vehicle gate", (-25.7, 2.1, 2.0), (0.18, 2.5, 2.2), METAL, collection, 0.04)
        for x in (8, 13, 18):
            cylinder("Qigan approach lamp", (x, -3.55, 2.9), 0.07, 3.7, METAL, collection, vertices=10)
            sphere("Qigan approach lamp glow", (x, -3.55, 4.8), (0.16, 0.16, 0.16), LIGHT, collection, 12)
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    return collection


def mianhuadi_terminal(detail):
    collection = bpy.data.collections.new("Mianhuadi Ferry Terminal")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("MianhuadiTerminalRoot", None)
    collection.objects.link(root)
    cube("MianhuadiTerminal", (-9, 0, 0.55), (0.02, 0.02, 0.02), CONCRETE, collection)
    cube("Mianhuadi embankment platform", (-9, 0, 0.52), (52, 10.5, 1.04), CONCRETE, collection, 0.32)
    cube("Mianhuadi deck paving", (-8, 0, 1.08), (49, 9.1, 0.18), DECK, collection, 0.08)
    cube("Mianhuadi floating apron", (21, 0, 0.62), (12, 8.0, 0.52), CONCRETE, collection, 0.18)
    cube("Mianhuadi sloped gangway", (13.5, 0, 1.35), (12.5, 6.4, 0.24), DECK, collection, 0.08, rotation=(0, math.radians(-6), 0))
    rail_run(collection, -31, 23, -4.75, posts=13, name="Mianhuadi embankment rail")
    rail_run(collection, -31, 23, 4.75, posts=13, name="Mianhuadi embankment rail")
    bollards(collection, (18, 22.5), 3.35)
    # The mainland terminal is distinguished by a gated embankment entrance.
    cube("Mianhuadi gatehouse", (-25.5, 0, 3.3), (8.0, 8.4, 4.4), WHITE, collection, 0.3)
    cube("Mianhuadi gatehouse roof", (-25.5, 0, 5.7), (9.3, 9.4, 0.48), RUST_RED, collection, 0.16)
    cube("Mianhuadi passage opening", (-21.42, 0, 3.0), (0.18, 5.1, 3.6), DARK_METAL, collection, 0.02)
    cube("Mianhuadi name board", (-21.25, 0, 5.0), (0.12, 5.7, 0.9), SIGN_BLUE, collection, 0.04)
    cube("Mianhuadi waiting canopy", (-11.5, 0, 4.25), (13.0, 7.2, 0.26), RUST_RED, collection, 0.12)
    for x in (-16.5, -11.5, -6.5):
        for y in (-3.0, 3.0):
            cylinder("Mianhuadi canopy column", (x, y, 2.65), 0.12, 3.2, METAL, collection, vertices=12)
    if detail == "lod2":
        cube("Mianhuadi pedestrian channel", (-1, -2.1, 1.2), (24, 0.12, 0.5), YELLOW, collection, 0.03)
        cube("Mianhuadi vehicle channel", (-1, 2.1, 1.2), (24, 0.12, 0.5), WHITE, collection, 0.03)
        for x in (-15.5, -11.5, -7.5):
            cylinder("Mianhuadi canopy light", (x, 0, 4.04), 0.13, 0.14, LIGHT, collection, vertices=12)
        for x in (-15, -10, -5):
            cube("Mianhuadi waiting bench", (x, 0, 1.48), (3.0, 0.68, 0.44), WOOD, collection, 0.08)
        for x in (7, 12, 17):
            cylinder("Mianhuadi pier lamp", (x, 3.9, 3.0), 0.07, 3.8, METAL, collection, vertices=10)
            sphere("Mianhuadi pier lamp glow", (x, 3.9, 4.95), (0.16, 0.16, 0.16), LIGHT, collection, 12)
        for x in (-19.5, -18.0, -16.5):
            cylinder("Mianhuadi gate bollard", (x, 0, 1.34), 0.12, 0.72, YELLOW, collection, vertices=12)
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    return collection


def tapered_hull(collection, detail):
    sections = [
        (-9.6, 1.25, 1.0), (-7.8, 1.95, 1.35), (-3.6, 2.45, 1.58),
        (3.8, 2.35, 1.58), (7.6, 1.75, 1.42), (9.7, 0.55, 1.15),
    ]
    vertices = []
    for x, half_width, top in sections:
        vertices.extend([(x, -half_width * 0.76, 0.18), (x, half_width * 0.76, 0.18), (x, -half_width, top), (x, half_width, top)])
    faces = []
    for section in range(len(sections) - 1):
        a = section * 4
        b = (section + 1) * 4
        faces.extend([(a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2), (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)])
    faces.extend([(0, 1, 3, 2), (len(vertices) - 4, len(vertices) - 2, len(vertices) - 1, len(vertices) - 3)])
    mesh = bpy.data.meshes.new(f"Zhongshan106 hull mesh {detail}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Ferry hull", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(BLUE)
    return obj


def ferry_rail(collection, side, detail):
    rail(collection, (-8.4, side * 2.18, 1.9), (8.1, side * 1.55, 1.9), radius=0.05, name="Passenger deck rail")
    count = 9 if detail == "lod2" else 6
    for index in range(count):
        x = -8.0 + index * 15.6 / max(1, count - 1)
        y = side * (2.12 - max(0, x - 5.2) * 0.09)
        rail(collection, (x, y, 1.25), (x, y, 1.92), radius=0.045, name="Passenger rail post")


def create_ferry(detail):
    collection = bpy.data.collections.new(f"Zhongshan106 {detail}")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("Zhongshan106Root", None)
    collection.objects.link(root)
    cube("Zhongshan106", (0, 0, 1.55), (0.02, 0.02, 0.02), WHITE, collection)
    tapered_hull(collection, detail)
    cube("Passenger deck", (-0.3, 0, 1.62), (17.0, 4.55, 0.32), WHITE, collection, 0.12)
    cube("Open passenger cabin", (-1.1, 0, 2.95), (10.8, 3.82, 2.25), WHITE, collection, 0.22)
    cube("Wheelhouse", (4.7, 0, 3.15), (2.5, 3.35, 2.6), WHITE, collection, 0.2)
    cube("Cabin front window", (6.0, 0, 3.45), (0.12, 2.6, 1.22), WINDOW, collection, 0.04)
    for side in (-1, 1):
        ferry_rail(collection, side, detail)
        cube("Hull safety stripe", (-0.2, side * 2.34, 1.22), (15.8, 0.12, 0.25), RED, collection, 0.03)
        window_count = 5 if detail == "lod2" else 3
        for index in range(window_count):
            x = -5.0 + index * 8.0 / max(1, window_count - 1)
            cube("Cabin side window", (x, side * 1.94, 3.05), (1.2, 0.08, 0.94), WINDOW, collection, 0.03)
    cube("Cabin roof", (-0.7, 0, 4.2), (12.0, 4.2, 0.24), WHITE, collection, 0.08)
    cylinder("Navigation mast", (-4.7, 0, 5.15), 0.08, 2.0, DARK_METAL, collection, vertices=10)
    cylinder("Navigation light", (-4.7, 0, 6.23), 0.14, 0.22, LIGHT, collection, vertices=12)
    cube("Bow bumper", (9.25, 0, 1.0), (0.38, 2.8, 0.4), RED, collection, 0.08)
    cube("Stern engine casing", (-8.2, 0, 2.05), (2.0, 3.2, 1.1), WHITE, collection, 0.15)
    if detail == "lod2":
        for row in (-1.0, 1.0):
            for x in (-4.8, -2.6, -0.4, 1.8):
                cube("Passenger seat", (x, row, 2.05), (1.35, 0.55, 0.55), WOOD, collection, 0.08)
                cube("Passenger seat back", (x - 0.5, row, 2.42), (0.16, 0.55, 0.72), WOOD, collection, 0.05)
        for side in (-1, 1):
            cylinder("Cabin roof support", (-5.7, side * 1.72, 3.2), 0.06, 1.95, METAL, collection, vertices=10)
            cylinder("Cabin roof support", (3.1, side * 1.72, 3.2), 0.06, 1.95, METAL, collection, vertices=10)
            bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.08, major_segments=16, minor_segments=8, location=(-2.2, side * 2.02, 2.7), rotation=(math.pi / 2, 0, 0))
            ring = bpy.context.object
            ring.name = "Life ring"
            ring.data.materials.append(RED)
            link(ring, collection)
        cylinder("Port navigation light", (4.2, 1.8, 4.55), 0.11, 0.18, RED_LIGHT, collection, vertices=12)
        cylinder("Starboard navigation light", (4.2, -1.8, 4.55), 0.11, 0.18, GREEN_LIGHT, collection, vertices=12)
        cylinder("Radar dome", (-3.4, 0, 4.6), 0.38, 0.42, WHITE, collection, vertices=20)
        rail(collection, (-4.7, 0, 5.65), (-3.2, 0, 5.65), radius=0.045, mat=DARK_METAL, name="Mast crossbar")
        cube("Boarding gate port", (7.1, 2.05, 1.7), (2.0, 0.12, 1.2), METAL, collection, 0.04)
        cube("Boarding gate starboard", (7.1, -2.05, 1.7), (2.0, 0.12, 1.2), METAL, collection, 0.04)
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    return collection


def select_collection(collection):
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(collection.all_objects)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def export_collection(collection, filename):
    select_collection(collection)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_DIR / filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


def render_review(collection, asset_id, views):
    if ARGS.skip_review:
        return
    scene = bpy.context.scene
    # Blender 5.2 exposes Eevee as BLENDER_EEVEE in background mode.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.035, 0.055, 0.075)
    bpy.ops.object.light_add(type="SUN", location=(10, -20, 35))
    sun = bpy.context.object
    sun.data.energy = 2.2
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(24))
    bpy.ops.object.light_add(type="AREA", location=(5, -18, 16))
    area = bpy.context.object
    area.data.energy = 900
    area.data.shape = "DISK"
    area.data.size = 12
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    scene.camera = camera
    for suffix, location, target in views:
        camera.location = location
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(REVIEW_DIR / f"{asset_id}-{suffix}.png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.objects.remove(area, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)


def update_manifest(exports):
    manifest_path = OUTPUT_DIR / "scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"tiles": []}
    manifest["version"] = "2026-08-15"
    manifest["ferryAssets"] = [
        {
            "id": asset_id,
            "url": f"/models/jiangxinzhou-v2/{filename}",
            "units": "metres",
            "forward": "+X",
            "lod": lod,
            "assetKind": kind,
            "evidenceRefs": ["ferry-official-2024", "ferry-media-2024", "ferry-map-crosscheck-2026"],
        }
        for asset_id, filename, lod, kind in exports
    ]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


clean_scene()
terminal_exports = [
    ("qigan-pier-lod1", "ferry-qigan-pier-lod1.glb", 1, "terminal", qigan_terminal),
    ("qigan-pier-lod2", "ferry-qigan-pier-lod2.glb", 2, "terminal", qigan_terminal),
    ("mianhuadi-pier-lod1", "ferry-mianhuadi-pier-lod1.glb", 1, "terminal", mianhuadi_terminal),
    ("mianhuadi-pier-lod2", "ferry-mianhuadi-pier-lod2.glb", 2, "terminal", mianhuadi_terminal),
]
manifest_exports = []
for asset_id, filename, lod, kind, factory in terminal_exports:
    collection = factory("lod1" if lod == 1 else "lod2")
    export_collection(collection, filename)
    if lod == 2:
        render_review(collection, asset_id, [
            ("shore", (-72, -58, 38), (-4, 0, 2)),
            ("river", (70, 52, 30), (1, 0, 2)),
        ])
    manifest_exports.append((asset_id, filename, lod, kind))
    bpy.data.collections.remove(collection)

for lod in (1, 2):
    collection = create_ferry(f"lod{lod}")
    filename = f"transport-passenger-ferry-lod{lod}.glb"
    export_collection(collection, filename)
    if lod == 1:
        export_collection(collection, "transport-passenger-ferry.glb")
    else:
        render_review(collection, "zhongshan-106", [
            ("side", (4, -42, 13), (0, 0, 2)),
            ("oblique", (34, -32, 22), (0, 0, 2.3)),
        ])
    manifest_exports.append((f"zhongshan-106-lod{lod}", filename, lod, "vessel"))
    bpy.data.collections.remove(collection)

update_manifest(manifest_exports)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "ferry-assets.blend"))
print(f"Exported {len(manifest_exports)} ferry assets and review renders to {OUTPUT_DIR}")
