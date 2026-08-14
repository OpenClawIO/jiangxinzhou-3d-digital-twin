"""Build original ferry terminal and Zhongshan-106 visitor-map assets.

Blender 5.2+:
  blender -b --python scripts/jiangxinzhou_ferry_models.py -- \
    --output-dir public/models/jiangxinzhou-v2

The geometry is a photo-calibrated visitor model, not a survey or BIM replica.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="public/models/jiangxinzhou-v2")
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


ARGS = arguments()
OUTPUT_DIR = (Path.cwd() / ARGS.output_dir).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


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
RED = material("Ferry safety red", (0.84, 0.08, 0.055, 1), 0.48)
WINDOW = material("Ferry smoked window", (0.025, 0.10, 0.14, 1), 0.24, 0.12)
METAL = material("Pier and ferry rail metal", (0.36, 0.41, 0.40, 1), 0.32, 0.72)
YELLOW = material("Safety yellow", (0.95, 0.62, 0.08, 1), 0.48)
LIGHT = material("Ferry navigation light", (1.0, 0.72, 0.18, 1), 0.25, emission=(1.0, 0.55, 0.08, 1))


def link(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def cube(name, location, scale, mat, collection, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
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


def rail(collection, start, end, radius=0.06, mat=METAL, name="Safety rail"):
    start_vec = bpy.mathutils.Vector(start) if hasattr(bpy, "mathutils") else None
    # Blender's Vector is imported lazily to keep the script readable in the UI.
    from mathutils import Vector
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    midpoint = (a + b) / 2
    obj = cylinder(name, midpoint, radius, delta.length, mat, collection, vertices=10)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def pier_platform(collection, detail):
    cube("Pier concrete platform", (0, 0, 0.45), (38, 9, 0.9), CONCRETE, collection, 0.28)
    cube("Pier deck", (0, 0, 0.95), (35, 7.8, 0.18), DECK, collection, 0.08)
    cube("Floating boarding apron", (13.8, 0, 0.62), (9.0, 7.1, 0.45), CONCRETE, collection, 0.18)
    cube("Boarding ramp", (9.4, 0, 1.05), (8.0, 5.8, 0.18), DECK, collection, 0.08)
    cube("Ramp side fender left", (13.8, -3.65, 0.86), (8.8, 0.25, 0.55), YELLOW, collection, 0.04)
    cube("Ramp side fender right", (13.8, 3.65, 0.86), (8.8, 0.25, 0.55), YELLOW, collection, 0.04)
    for y in (-3.2, 3.2):
        rail(collection, (-16, y, 1.0), (8, y, 1.0), name="Pier edge rail")
        for x in range(-14, 9, 4):
            cylinder("Rail post", (x, y, 1.55), 0.07, 1.1, METAL, collection, vertices=10)

    if detail == "lod1":
        cube("Simple waiting canopy", (-9.0, 0, 4.0), (12.5, 6.2, 0.24), WHITE, collection, 0.1)
        for x in (-14.5, -9.0, -3.5):
            cylinder("Canopy column", (x, -2.5, 2.35), 0.12, 3.0, METAL, collection, vertices=12)
            cylinder("Canopy column", (x, 2.5, 2.35), 0.12, 3.0, METAL, collection, vertices=12)
    else:
        cube("Waiting canopy roof", (-9.0, 0, 4.0), (13.5, 6.5, 0.22), WHITE, collection, 0.1)
        cube("Canopy fascia", (-9.0, -3.18, 3.75), (13.8, 0.18, 0.48), BLUE, collection, 0.04)
        for x in (-14.5, -9.0, -3.5):
            cylinder("Canopy column", (x, -2.5, 2.35), 0.12, 3.0, METAL, collection, vertices=12)
            cylinder("Canopy column", (x, 2.5, 2.35), 0.12, 3.0, METAL, collection, vertices=12)
            cylinder("Canopy light", (x, 0, 3.84), 0.11, 0.12, LIGHT, collection, vertices=12)
        cube("Human gate", (-15.8, -1.8, 1.8), (0.18, 3.6, 2.0), METAL, collection, 0.04)
        cube("Vehicle gate", (-15.8, 2.2, 1.8), (0.18, 1.7, 2.0), METAL, collection, 0.04)
        for x in (-15.2, -13.8):
            cylinder("Entrance bollard", (x, 0.3, 1.28), 0.12, 0.65, YELLOW, collection, vertices=12)
    return collection


def create_terminal(name, detail):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    pier_platform(collection, detail)
    return collection


def tapered_hull(collection):
    # A simple five-section hull with a narrower bow and stern, in metres.
    vertices = [
        (-8.8, -1.85, 0.3), (-8.8, 1.85, 0.3), (-8.8, -1.35, 1.45), (-8.8, 1.35, 1.45),
        (-3.0, -2.35, 0.3), (-3.0, 2.35, 0.3), (-3.0, -1.8, 1.45), (-3.0, 1.8, 1.45),
        (4.2, -2.2, 0.3), (4.2, 2.2, 0.3), (4.2, -1.7, 1.45), (4.2, 1.7, 1.45),
        (8.7, -1.35, 0.3), (8.7, 1.35, 0.3), (8.7, -1.05, 1.35), (8.7, 1.05, 1.35),
    ]
    faces = []
    for section in range(3):
        a = section * 4
        b = (section + 1) * 4
        faces.extend([(a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2), (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)])
    faces.extend([(0, 1, 3, 2), (12, 14, 15, 13)])
    mesh = bpy.data.meshes.new("Zhongshan106 hull mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Ferry hull", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(BLUE)
    return obj


def create_ferry():
    collection = bpy.data.collections.new("Zhongshan106")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("Zhongshan106", None)
    collection.objects.link(root)
    tapered_hull(collection)
    cube("Passenger deck", (-0.4, 0, 1.55), (15.8, 4.4, 0.35), WHITE, collection, 0.14)
    cube("Open passenger cabin", (-0.7, 0, 2.75), (10.2, 3.7, 2.15), WHITE, collection, 0.25)
    cube("Cabin front window", (4.45, 0, 2.85), (0.12, 2.7, 1.15), WINDOW, collection, 0.05)
    for side in (-1, 1):
        for x in (-4.0, -1.8, 0.4, 2.6):
            cube("Cabin side window", (x, side * 1.88, 2.85), (1.42, 0.08, 0.92), WINDOW, collection, 0.04)
        cube("Hull safety stripe", (-0.2, side * 2.3, 1.18), (14.6, 0.12, 0.24), RED, collection, 0.03)
        rail(collection, (-7.8, side * 2.05, 1.7), (7.8, side * 2.05, 1.7), radius=0.055, name="Passenger deck rail")
        for x in (-7.2, -4.4, -1.6, 1.2, 4.0, 6.8):
            cylinder("Passenger rail post", (x, side * 2.05, 1.25), 0.06, 0.9, METAL, collection, vertices=10)
    cube("Cabin roof", (-0.7, 0, 4.0), (11.0, 4.1, 0.22), WHITE, collection, 0.08)
    cylinder("Navigation mast", (-4.4, 0, 4.8), 0.08, 2.0, METAL, collection, vertices=10)
    cylinder("Navigation light", (-4.4, 0, 5.9), 0.14, 0.22, LIGHT, collection, vertices=12)
    cube("Bow bumper", (8.8, 0, 0.92), (0.35, 3.2, 0.35), RED, collection, 0.08)
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


def update_manifest(exports):
    manifest_path = OUTPUT_DIR / "scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"tiles": []}
    manifest["ferryAssets"] = [
        {
            "id": asset_id,
            "url": f"/models/jiangxinzhou-v2/{filename}",
            "units": "metres",
            "forward": "+X",
            "lod": lod,
            "evidenceRefs": ["ferry-official-2024", "ferry-media-2024", "ferry-map-crosscheck-2026"],
        }
        for asset_id, filename, lod in exports
    ]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


clean_scene()
exports = [
    ("qigan-pier-lod1", "ferry-qigan-pier-lod1.glb", 1),
    ("qigan-pier-lod2", "ferry-qigan-pier-lod2.glb", 2),
    ("mianhuadi-pier-lod1", "ferry-mianhuadi-pier-lod1.glb", 1),
    ("mianhuadi-pier-lod2", "ferry-mianhuadi-pier-lod2.glb", 2),
]
for asset_id, filename, lod in exports:
    collection = create_terminal(asset_id, "lod1" if lod == 1 else "lod2")
    export_collection(collection, filename)
    bpy.data.collections.remove(collection)

ferry_collection = create_ferry()
export_collection(ferry_collection, "transport-passenger-ferry.glb")
update_manifest(exports + [("zhongshan-106", "transport-passenger-ferry.glb", 1)])
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "ferry-assets.blend"))
print(f"Exported {len(exports) + 1} ferry assets to {OUTPUT_DIR}")
