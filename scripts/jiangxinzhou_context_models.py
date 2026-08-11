"""Create original low-poly bridge models for the Jiangxinzhou regional context.

The models use the normalized WGS84 crossing centerlines and metre-scale local
ENU coordinates. Reference imagery is never embedded in the GLB.
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
    parser.add_argument("--data-dir", default="data/jiangxinzhou-v2")
    parser.add_argument("--output-dir", default="public/models/jiangxinzhou-v2")
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


ARGS = arguments()
ROOT = Path.cwd()
DATA_DIR = (ROOT / ARGS.data_dir).resolve()
OUTPUT_DIR = (ROOT / ARGS.output_dir).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load(name):
    with open(DATA_DIR / name, "r", encoding="utf-8") as handle:
        return json.load(handle)


MANIFEST = load("manifest.json")
CROSSINGS = load("crossings.geojson")
ORIGIN_LNG, ORIGIN_LAT = MANIFEST["origin"]
LON_METERS = MANIFEST["projection"]["metersPerDegreeLongitude"]
LAT_METERS = MANIFEST["projection"]["metersPerDegreeLatitude"]


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    default = bpy.data.collections.get("Collection")
    if default:
        default.name = "ContextBridges"
    else:
        default = bpy.data.collections.new("ContextBridges")
        bpy.context.scene.collection.children.link(default)
    return default


BRIDGES = clean_scene()


def move_to_collection(obj, collection=BRIDGES):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def mat(name, rgba, roughness=0.72, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


STEEL = mat("Regional bridge steel", (0.45, 0.60, 0.63, 1), 0.38, 0.48)
LIGHT_STEEL = mat("Regional bridge cable", (0.82, 0.90, 0.88, 1), 0.36, 0.32)
ROAD_DECK = mat("Regional road deck", (0.18, 0.25, 0.27, 1), 0.86, 0.05)
WALK_DECK = mat("Pedestrian deck", (0.70, 0.80, 0.72, 1), 0.78, 0.08)
LIGHT = mat("Bridge marker lights", (1.0, 0.70, 0.24, 1), 0.35, 0.05)


def geo_to_xy(coordinate, z=0.0):
    lng, lat = coordinate
    return ((lng - ORIGIN_LNG) * LON_METERS, (lat - ORIGIN_LAT) * LAT_METERS, z)


def cube(name, location, size, material, rotation=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    move_to_collection(obj)
    if bevel:
        modifier = obj.modifiers.new("Soft bridge edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def cylinder(name, location, radius, depth, material, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj)
    return obj


def beam(name, start, end, thickness, material):
    start_v, end_v = Vector(start), Vector(end)
    direction = end_v - start_v
    obj = cylinder(name, (start_v + end_v) / 2, thickness, direction.length, material, 8)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def xy_length(points):
    return sum((Vector(points[index + 1]) - Vector(points[index])).length for index in range(len(points) - 1))


def point_at(points, fraction):
    fraction = max(0.0, min(1.0, fraction))
    lengths = [0.0]
    for index in range(len(points) - 1):
        lengths.append(lengths[-1] + (Vector(points[index + 1]) - Vector(points[index])).length)
    target = lengths[-1] * fraction
    for index in range(len(points) - 1):
        if target <= lengths[index + 1]:
            portion = (target - lengths[index]) / max(0.001, lengths[index + 1] - lengths[index])
            return Vector(points[index]).lerp(Vector(points[index + 1]), portion)
    return Vector(points[-1])


def length(vector):
    return math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z)


def deck_segments(name, points, width, height, material):
    for index in range(len(points) - 1):
        start, end = Vector(points[index]), Vector(points[index + 1])
        direction = end - start
        midpoint = (start + end) / 2
        angle = math.atan2(direction.y, direction.x)
        cube(f"{name} deck {index + 1}", (midpoint.x, midpoint.y, height), (max(8, direction.length + 2), width, 2.0), material, angle, 0.65)


def add_pier_line(name, points, height, spacing=160.0, radius=3.0):
    total = xy_length(points)
    count = max(1, int(total / spacing))
    for index in range(1, count):
        position = point_at(points, index / count)
        cylinder(f"{name} pier {index}", (position.x, position.y, height / 2), radius, height, STEEL, 10)


def create_yangtze_bridge(feature):
    points = [geo_to_xy(coordinate) for coordinate in feature["geometry"]["coordinates"]]
    deck_height = 32.0
    deck_segments("Jiangxinzhou Yangtze Bridge", points, 23, deck_height, ROAD_DECK)
    add_pier_line("Jiangxinzhou Yangtze Bridge", points, deck_height, 250.0, 4.0)
    for tower_index, fraction in enumerate((0.30, 0.70), start=1):
        tower = point_at(points, fraction)
        previous = point_at(points, max(0.0, fraction - 0.01))
        following = point_at(points, min(1.0, fraction + 0.01))
        direction = following - previous
        direction.normalize()
        side = Vector((-direction.y, direction.x, 0))
        for side_index, offset in enumerate((-18.0, 18.0), start=1):
            base = tower + side * offset
            beam(f"Jiangxinzhou bridge tower {tower_index}-{side_index}", (base.x, base.y, deck_height), (base.x, base.y, 112.0), 3.0, STEEL)
            for stay_index in range(1, 6):
                deck_position = point_at(points, fraction + (stay_index - 3) * 0.035)
                beam(f"Jiangxinzhou bridge stay {tower_index}-{side_index}-{stay_index}", (base.x, base.y, 105.0 - stay_index * 1.5), (deck_position.x + side.x * offset * 0.72, deck_position.y + side.y * offset * 0.72, deck_height + 2.0), 0.42, LIGHT_STEEL)
        cube(f"Jiangxinzhou bridge marker {tower_index}", (tower.x, tower.y, deck_height + 3.0), (18, 5, 1.0), LIGHT, math.atan2(direction.y, direction.x), 0.3)


def create_jiajiang_bridge(feature):
    points = [geo_to_xy(coordinate) for coordinate in feature["geometry"]["coordinates"]]
    deck_height = 14.0
    deck_segments("Jiajiang Bridge", points, 18, deck_height, ROAD_DECK)
    add_pier_line("Jiajiang Bridge", points, deck_height, 75.0, 2.4)
    for index, coordinate in enumerate((points[0], points[-1]), start=1):
        cylinder(f"Jiajiang Bridge gate {index}", (coordinate[0], coordinate[1], deck_height + 5), 2.0, 10, STEEL, 10)


def export():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in BRIDGES.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(BRIDGES.all_objects), None)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_DIR / "bridges-context.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


yangtze = next(item for item in CROSSINGS["features"] if item["id"] == "jiangxinzhou-yangtze-bridge")
jiajiang = next(item for item in CROSSINGS["features"] if item["id"] == "jiajiang-bridge")
create_yangtze_bridge(yangtze)
create_jiajiang_bridge(jiajiang)
export()

manifest_path = OUTPUT_DIR / "scene-manifest.json"
with open(manifest_path, "r", encoding="utf-8") as handle:
    asset_manifest = json.load(handle)
asset_manifest["version"] = MANIFEST["version"]
asset_manifest["contextTiles"] = [{
    "id": "ContextBridges",
    "url": "/models/jiangxinzhou-v2/bridges-context.glb",
    "bytes": (OUTPUT_DIR / "bridges-context.glb").stat().st_size,
    "lod": 1,
    "crossings": ["jiangxinzhou-yangtze-bridge", "jiajiang-bridge"],
}]
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(asset_manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

print(f"Context bridge assets exported to {OUTPUT_DIR / 'bridges-context.glb'}")
