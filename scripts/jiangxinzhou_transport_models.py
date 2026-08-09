"""Create lightweight, original transport vehicles for the Jiangxinzhou Three.js map.

Blender 5.2+:
  blender -b --python scripts/jiangxinzhou_transport_models.py -- \
    --output-dir public/models/jiangxinzhou-v2

The models are representative visitor-map assets, not manufacturer CAD replicas.
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
        bsdf.inputs["Emission Strength"].default_value = 0.7
    return value


WHITE = material("Transport white", (0.88, 0.92, 0.91, 1), 0.46)
WINDOW = material("Smoked window", (0.035, 0.12, 0.16, 1), 0.22, 0.15)
BLACK = material("Tyre", (0.025, 0.03, 0.03, 1), 0.9)
METAL = material("Wheel metal", (0.28, 0.32, 0.33, 1), 0.3, 0.65)
BUS_RED = material("Nanjing bus coral", (0.80, 0.11, 0.12, 1), 0.5)
BUS_GOLD = material("Bus route gold", (0.92, 0.58, 0.11, 1), 0.52)
SHUTTLE_TEAL = material("Shuttle teal", (0.03, 0.55, 0.52, 1), 0.38)
SHUTTLE_BLUE = material("Island city blue", (0.05, 0.38, 0.68, 1), 0.38)
METRO_GOLD = material("Metro line 10 gold", (0.78, 0.62, 0.31, 1), 0.34, 0.08)
FERRY_BLUE = material("Ferry blue", (0.035, 0.39, 0.62, 1), 0.42)
FERRY_RED = material("Ferry safety red", (0.88, 0.16, 0.08, 1), 0.46)
LIGHT = material("Vehicle light", (0.95, 0.93, 0.66, 1), 0.2, emission=(1.0, 0.86, 0.45, 1))


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
        modifier = obj.modifiers.new("Soft vehicle edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return link(obj, collection)


def cylinder(name, location, radius, depth, mat, collection, rotation=(math.pi / 2, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return link(obj, collection)


def wheel_pair(collection, x, y_offset, z=0.62, radius=0.52):
    for y in (-y_offset, y_offset):
        cylinder("Tyre", (x, y, z), radius, 0.28, BLACK, collection)
        cylinder("Wheel hub", (x, y + (0.15 if y > 0 else -0.15), z), radius * 0.48, 0.3, METAL, collection)


def add_windows(collection, length, half_width, z, count, window_height=1.15):
    spacing = length / count
    for side in (-1, 1):
        for index in range(count):
            x = -length / 2 + spacing * (index + 0.5)
            cube("Side window", (x, side * half_width, z), (spacing * 0.68, 0.08, window_height), WINDOW, collection, 0.05)


def create_city_bus():
    collection = bpy.data.collections.new("CityBus")
    bpy.context.scene.collection.children.link(collection)
    cube("Bus lower body", (0, 0, 1.35), (10.6, 2.55, 1.65), WHITE, collection, 0.28)
    cube("Bus upper body", (0, 0, 2.55), (10.25, 2.48, 1.55), WHITE, collection, 0.35)
    cube("Bus red belt", (0, 1.29, 1.48), (10.15, 0.08, 0.36), BUS_RED, collection, 0.03)
    cube("Bus red belt", (0, -1.29, 1.48), (10.15, 0.08, 0.36), BUS_RED, collection, 0.03)
    add_windows(collection, 8.8, 1.27, 2.63, 6)
    cube("Front windscreen", (5.22, 0, 2.58), (0.1, 2.05, 1.25), WINDOW, collection, 0.06)
    cube("Route display", (5.30, 0, 3.20), (0.08, 1.35, 0.26), BUS_GOLD, collection, 0.03)
    cube("Headlamp left", (5.34, -0.76, 1.20), (0.08, 0.3, 0.22), LIGHT, collection)
    cube("Headlamp right", (5.34, 0.76, 1.20), (0.08, 0.3, 0.22), LIGHT, collection)
    wheel_pair(collection, -3.25, 1.28)
    wheel_pair(collection, 3.25, 1.28)
    return collection


def create_shuttle(name, accent):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    cube("Shuttle body", (0, 0, 1.45), (5.5, 2.25, 2.65), WHITE, collection, 0.48)
    cube("Shuttle accent", (0, 1.15, 1.12), (4.7, 0.08, 0.42), accent, collection, 0.03)
    cube("Shuttle accent", (0, -1.15, 1.12), (4.7, 0.08, 0.42), accent, collection, 0.03)
    add_windows(collection, 4.4, 1.13, 2.02, 4, 1.0)
    cube("Panoramic windscreen", (2.72, 0, 1.97), (0.1, 1.78, 1.25), WINDOW, collection, 0.12)
    cube("Sensor roof", (1.35, 0, 3.02), (0.55, 0.55, 0.18), accent, collection, 0.08)
    cylinder("Lidar", (1.35, 0, 3.19), 0.16, 0.22, WINDOW, collection, rotation=(0, 0, 0), vertices=20)
    wheel_pair(collection, -1.65, 1.13, 0.55, 0.42)
    wheel_pair(collection, 1.65, 1.13, 0.55, 0.42)
    return collection


def create_metro():
    collection = bpy.data.collections.new("MetroLine10")
    bpy.context.scene.collection.children.link(collection)
    cube("Metro carriage", (0, 0, 1.95), (19.2, 3.0, 3.55), WHITE, collection, 0.42)
    cube("Line 10 belt left", (0, 1.52, 1.45), (18.2, 0.08, 0.32), METRO_GOLD, collection)
    cube("Line 10 belt right", (0, -1.52, 1.45), (18.2, 0.08, 0.32), METRO_GOLD, collection)
    add_windows(collection, 16.8, 1.51, 2.45, 10, 1.12)
    for side in (-1, 1):
        for x in (-5.7, 0, 5.7):
            cube("Metro door", (x, side * 1.53, 1.65), (1.45, 0.07, 2.55), METRO_GOLD, collection, 0.04)
            cube("Metro door glass", (x, side * 1.57, 2.25), (0.92, 0.04, 1.0), WINDOW, collection, 0.03)
    cube("Metro front glass", (9.62, 0, 2.43), (0.1, 2.35, 1.28), WINDOW, collection, 0.08)
    cube("Metro destination", (9.69, 0, 3.22), (0.05, 1.2, 0.24), METRO_GOLD, collection)
    for x in (-6.1, 6.1):
        cube("Metro bogie", (x, 0, 0.55), (2.8, 2.25, 0.42), BLACK, collection, 0.06)
    return collection


def create_ferry():
    collection = bpy.data.collections.new("PassengerFerry")
    bpy.context.scene.collection.children.link(collection)
    cube("Ferry hull", (0, 0, 0.72), (17.2, 4.4, 1.25), FERRY_BLUE, collection, 0.62)
    cube("Ferry deck", (-0.4, 0, 1.45), (14.6, 4.0, 0.35), WHITE, collection, 0.18)
    cube("Passenger cabin", (-0.8, 0, 2.65), (10.2, 3.65, 2.2), WHITE, collection, 0.4)
    add_windows(collection, 8.4, 1.84, 2.83, 6, 0.92)
    cube("Cabin windscreen", (4.35, 0, 2.85), (0.1, 2.55, 1.0), WINDOW, collection, 0.08)
    cube("Safety stripe left", (-0.5, 2.05, 1.55), (14.8, 0.08, 0.22), FERRY_RED, collection)
    cube("Safety stripe right", (-0.5, -2.05, 1.55), (14.8, 0.08, 0.22), FERRY_RED, collection)
    cylinder("Ferry mast", (-3.1, 0, 4.55), 0.08, 3.2, METAL, collection, rotation=(0, 0, 0), vertices=10)
    cube("Navigation light", (-3.1, 0, 6.12), (0.26, 0.26, 0.22), LIGHT, collection, 0.05)
    return collection


def merge_collection(collection):
    meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
    for obj in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    meshes[0].name = collection.name


def export_collection(collection, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(collection.all_objects), None)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_DIR / filename), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)


clean_scene()
exports = [
    (create_city_bus(), "transport-city-bus.glb", "city-bus"),
    (create_shuttle("AutonomousShuttle", SHUTTLE_TEAL), "transport-autonomous-shuttle.glb", "autonomous-shuttle"),
    (create_shuttle("IslandCityShuttle", SHUTTLE_BLUE), "transport-shuttle-bus.glb", "shuttle-bus"),
    (create_metro(), "transport-metro-line10.glb", "metro-line10"),
    (create_ferry(), "transport-passenger-ferry.glb", "passenger-ferry"),
]
for collection, _, _ in exports:
    merge_collection(collection)
for collection, filename, _ in exports:
    export_collection(collection, filename)

bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "transport-vehicles.blend"))

manifest_path = OUTPUT_DIR / "scene-manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"tiles": []}
manifest["transportVehicles"] = [
    {"id": model_key, "url": f"/models/jiangxinzhou-v2/{filename}", "bytes": (OUTPUT_DIR / filename).stat().st_size, "units": "metres", "forward": "+X"}
    for _, filename, model_key in exports
]
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Exported {len(exports)} transport vehicle models to {OUTPUT_DIR}")
