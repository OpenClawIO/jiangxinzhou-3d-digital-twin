"""Generate metre-scale Jiangxinzhou V2 GLB tiles and a reference render.

Blender 5.2+:
  blender -b --python scripts/jiangxinzhou_scene_v2.py -- \
    --data-dir data/jiangxinzhou-v2 --output-dir public/models/jiangxinzhou-v2

The script consumes only the normalized WGS84 data produced by
build-jiangxinzhou-v2.mjs. It never embeds reference imagery.
"""

import argparse
import json
import math
import os
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


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
ISLAND = load("island.geojson")
BUILDINGS = load("buildings.geojson")
LANDMARKS = load("landmarks.geojson")
LANDSCAPES = load("landscapes.geojson")
ORIGIN_LNG, ORIGIN_LAT = MANIFEST["origin"]
LON_METERS = MANIFEST["projection"]["metersPerDegreeLongitude"]
LAT_METERS = MANIFEST["projection"]["metersPerDegreeLatitude"]


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    root = bpy.context.scene.collection
    default = bpy.data.collections.get("Collection")
    if default:
        default.name = "Terrain"
    else:
        default = bpy.data.collections.new("Terrain")
        root.children.link(default)
    return default


TERRAIN = clean_scene()
BUILDING_COLLECTIONS = {}
for name in ("BuildingsSouth", "BuildingsCenter", "BuildingsNorth", "Vegetation", "Landmarks"):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    if name.startswith("Buildings"):
        BUILDING_COLLECTIONS[name] = collection
VEGETATION = bpy.data.collections["Vegetation"]
LANDMARK_COLLECTION = bpy.data.collections["Landmarks"]


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def mat(name, rgba, roughness=0.8, metallic=0.0, emission=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = 0.35
    return material


GRASS = mat("Island meadow", (0.30, 0.51, 0.29, 1))
GRASS_TOP = mat("Meadow highlights", (0.44, 0.66, 0.38, 1))
EMBANKMENT = mat("Embankment", (0.74, 0.69, 0.51, 1))
BUILDING_LOW = mat("Low-rise warm concrete", (0.70, 0.73, 0.68, 1), 0.86)
BUILDING_MID = mat("Mid-rise pale stone", (0.68, 0.72, 0.73, 1), 0.72)
BUILDING_HIGH = mat("High-rise blue glass", (0.24, 0.40, 0.46, 1), 0.34, 0.15)
ROOF = mat("Roof", (0.24, 0.29, 0.28, 1), 0.8)
WHITE = mat("Architectural white", (0.91, 0.92, 0.87, 1), 0.54)
RED = mat("Lighthouse red", (0.72, 0.035, 0.055, 1), 0.45)
GLASS = mat("Low-iron glass", (0.16, 0.43, 0.52, 1), 0.2, 0.22)
STEEL = mat("Bridge steel", (0.66, 0.73, 0.74, 1), 0.3, 0.55)
CABLE = mat("Bridge cables", (0.86, 0.90, 0.88, 1), 0.35, 0.4)
PINK = mat("ROCHO coral stair", (0.88, 0.24, 0.40, 1), 0.58)
BLUE = mat("Porpoise blue", (0.12, 0.49, 0.66, 1), 0.42)
WOOD = mat("Timber", (0.52, 0.31, 0.18, 1), 0.82)
TRUNK = mat("Tree trunk", (0.25, 0.16, 0.10, 1), 1)
TREE_DARK = mat("Tree dark", (0.10, 0.31, 0.17, 1), 1)
TREE_MID = mat("Tree mid", (0.20, 0.45, 0.23, 1), 1)
TREE_LIGHT = mat("Tree light", (0.43, 0.60, 0.26, 1), 1)
FLOWER_PINK = mat("Pink muhly", (0.76, 0.31, 0.46, 1), 0.95)
FLOWER_GOLD = mat("Seasonal flower", (0.88, 0.63, 0.18, 1), 0.95)


def geo_to_xy(coordinate, z=0.0):
    lng, lat = coordinate
    return ((lng - ORIGIN_LNG) * LON_METERS, (lat - ORIGIN_LAT) * LAT_METERS, z)


def prism(name, ring, height, material, collection, base=0.0):
    points = [geo_to_xy(point)[:2] for point in ring[:-1] if len(point) >= 2]
    if len(points) < 3:
        return None
    n = len(points)
    vertices = [(x, y, base) for x, y in points] + [(x, y, base + height) for x, y in points]
    polygon_vectors = [Vector((x, y, 0)) for x, y in points]
    index_by_coordinate = {(round(vector.x, 6), round(vector.y, 6)): index for index, vector in enumerate(polygon_vectors)}
    triangles = tessellate_polygon([polygon_vectors])
    triangle_indices = [tuple(
        vertex if isinstance(vertex, int) else index_by_coordinate[(round(vertex.x, 6), round(vertex.y, 6))]
        for vertex in triangle
    ) for triangle in triangles]
    faces = [tuple(reversed(triangle)) for triangle in triangle_indices]
    faces += [tuple(index + n for index in triangle) for triangle in triangle_indices]
    faces += [(index, (index + 1) % n, (index + 1) % n + n, index + n) for index in range(n)]
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def cube(name, location, size, material, collection=LANDMARK_COLLECTION, rotation=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    if bevel:
        modifier = obj.modifiers.new("Edge softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def cylinder(name, location, radius, depth, material, collection=LANDMARK_COLLECTION, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    return obj


def cone(name, location, radius1, radius2, depth, material, collection=LANDMARK_COLLECTION, vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    return obj


def beam(name, start, end, thickness, material, collection=LANDMARK_COLLECTION):
    start_v, end_v = Vector(start), Vector(end)
    direction = end_v - start_v
    obj = cylinder(name, (start_v + end_v) / 2, thickness, direction.length, material, collection, 10)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def local_offset(anchor, east, north, z):
    x, y, _ = geo_to_xy(anchor)
    return (x + east, y + north, z)


land_ring = ISLAND["features"][0]["geometry"]["coordinates"][0]
prism("Jiangxinzhou terrain", land_ring, 2.8, EMBANKMENT, TERRAIN, -2.8)
prism("Jiangxinzhou meadow", land_ring, 0.7, GRASS, TERRAIN, 0.0)


landmark_points = {feature["id"]: feature["geometry"]["coordinates"] for feature in LANDMARKS["features"]}
lod2_positions = [geo_to_xy(landmark_points[key]) for key in ("nanjing-eye", "xiaokenting-lighthouse", "rocho-cafe", "dolphin-center", "water-center", "e3-park", "chapel")]


def near_lod2(ring, distance=70):
    x, y, _ = geo_to_xy(ring[0])
    return any(math.hypot(x - lx, y - ly) < distance for lx, ly, _ in lod2_positions)


for feature in BUILDINGS["features"]:
    ring = feature["geometry"]["coordinates"][0]
    if near_lod2(ring):
        continue
    props = feature["properties"]
    height = float(props["heightM"])
    center_lat = sum(point[1] for point in ring[:-1]) / max(1, len(ring) - 1)
    tile = "BuildingsSouth" if center_lat < 32.018 else "BuildingsNorth" if center_lat > 32.047 else "BuildingsCenter"
    building_material = BUILDING_HIGH if height >= 20 else BUILDING_MID if height >= 12 else BUILDING_LOW
    obj = prism(feature["id"], ring, height, building_material, BUILDING_COLLECTIONS[tile], 0.7)
    if obj:
        obj["height_m"] = height
        obj["height_method"] = props["heightMethod"]
        obj["confidence"] = props["confidence"]


def lighthouse(anchor, suffix, east, north, height, radius):
    x, y, _ = local_offset(anchor, east, north, 0)
    segments = 10
    segment_height = height / segments
    for index in range(segments):
        cone(
            f"Xiaokenting {suffix} stripe {index + 1}",
            (x, y, 0.7 + segment_height * (index + 0.5)),
            radius * (1 - 0.022 * index),
            radius * (1 - 0.022 * (index + 1)),
            segment_height,
            RED if index % 2 == 0 else WHITE,
        )
    cylinder(f"Xiaokenting {suffix} lantern", (x, y, height + 2.3), radius * 1.12, 3.8, WHITE, vertices=20)
    cylinder(f"Xiaokenting {suffix} gallery", (x, y, height + 0.8), radius * 1.42, 0.5, RED, vertices=24)
    cone(f"Xiaokenting {suffix} roof", (x, y, height + 4.7), radius * 1.3, 0.15, 1.7, RED, vertices=24)
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        beam(f"Xiaokenting {suffix} rail {angle}", (x + math.cos(rad) * radius, y + math.sin(rad) * radius, height + 0.7), (x + math.cos(rad) * radius, y + math.sin(rad) * radius, height + 4.1), 0.08, STEEL)


lighthouse(landmark_points["xiaokenting-lighthouse"], "main", 0, 0, 25, 2.6)
lighthouse(landmark_points["xiaokenting-lighthouse"], "south", 38, -28, 15, 1.8)
lighthouse(landmark_points["xiaokenting-lighthouse"], "north", -31, 22, 12, 1.5)


rocho = landmark_points["rocho-cafe"]
rx, ry, _ = geo_to_xy(rocho)
cylinder("ROCHO lower glass ring", (rx, ry, 4.2), 22, 7, GLASS, vertices=48)
cylinder("ROCHO white roof", (rx, ry, 8.1), 24, 0.8, WHITE, vertices=48)
cylinder("ROCHO rooftop garden", (rx, ry, 8.8), 16, 0.6, GRASS_TOP, vertices=40)
for step in range(11):
    angle = math.radians(215 + step * 6)
    distance = 22 + step * 1.4
    cube("ROCHO coral stair", (rx + math.cos(angle) * distance, ry + math.sin(angle) * distance, 0.9 + step * 0.62), (8.5, 2.8, 0.6), PINK, rotation=angle)


dolphin = landmark_points["dolphin-center"]
dx, dy, _ = geo_to_xy(dolphin)
cube("Porpoise center main pavilion", (dx, dy, 7), (58, 34, 13), BLUE, bevel=2.2)
cube("Porpoise center glass hall", (dx + 32, dy - 4, 5), (28, 24, 9), GLASS, bevel=1.4)
cone("Porpoise center wave roof", (dx - 5, dy, 14.2), 28, 13, 3.6, WHITE, vertices=32)


water = landmark_points["water-center"]
wx, wy, _ = geo_to_xy(water)
for offset, size, height in [((-34, -8), (44, 18), 12), ((8, 8), (48, 22), 17), ((42, -10), (30, 17), 10)]:
    cube("Sembcorp water center wing", (wx + offset[0], wy + offset[1], 0.7 + height / 2), (size[0], size[1], height), GLASS, bevel=1.0)
    cube("Sembcorp green roof", (wx + offset[0], wy + offset[1], 0.9 + height), (size[0] - 3, size[1] - 3, 0.45), GRASS_TOP)


e3 = landmark_points["e3-park"]
e3x, e3y, _ = geo_to_xy(e3)
for row in range(2):
    for col in range(4):
        x = e3x + (col - 1.5) * 32
        y = e3y + (row - 0.5) * 34
        height = 14 + ((row + col) % 3) * 3
        cube("Jiangdao Smart Cube block", (x, y, 0.7 + height / 2), (24, 20, height), GLASS, bevel=1.2)
        cube("Jiangdao Smart Cube roof", (x, y, height + 1), (20, 16, 0.6), GRASS_TOP)


church = landmark_points["chapel"]
cx, cy, _ = geo_to_xy(church)
cube("Jiangxinzhou church nave", (cx, cy, 6.7), (30, 16, 12), WHITE, rotation=0.24, bevel=0.7)
beam("Jiangxinzhou church roof left", (cx - 16, cy - 8, 12), (cx, cy, 21), 0.9, ROOF)
beam("Jiangxinzhou church roof right", (cx + 16, cy + 8, 12), (cx, cy, 21), 0.9, ROOF)
cone("Jiangxinzhou church spire", (cx, cy, 28), 3.2, 0.15, 16, ROOF, vertices=8)


def inside_polygon(point, ring):
    x, y = point
    projected = [geo_to_xy(value)[:2] for value in ring]
    inside = False
    previous = len(projected) - 1
    for current in range(len(projected)):
        xi, yi = projected[current]
        xj, yj = projected[previous]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        previous = current
    return inside


random.seed(320105)
xs = [geo_to_xy(point)[0] for point in land_ring]
ys = [geo_to_xy(point)[1] for point in land_ring]
for index in range(280):
    for _ in range(30):
        x = random.uniform(min(xs), max(xs))
        y = random.uniform(min(ys), max(ys))
        if inside_polygon((x, y), land_ring) and all(math.hypot(x - lx, y - ly) > 45 for lx, ly, _ in lod2_positions):
            break
    scale = random.uniform(0.75, 1.45)
    trunk_height = 3.8 * scale
    cylinder(f"Tree {index} trunk", (x, y, 0.7 + trunk_height / 2), 0.28 * scale, trunk_height, TRUNK, VEGETATION, 7)
    cone(f"Tree {index} crown", (x, y, 0.7 + trunk_height + 2.4 * scale), 2.2 * scale, 0.55 * scale, 5.2 * scale, [TREE_DARK, TREE_MID, TREE_LIGHT][index % 3], VEGETATION, 8)


for landscape_id, material, count in (("pink-field", FLOWER_PINK, 45), ("seasonal-garden", FLOWER_GOLD, 36)):
    anchor = landmark_points[landscape_id]
    fx, fy, _ = geo_to_xy(anchor)
    for index in range(count):
        angle = index * 2.39996
        radius = 4.8 * math.sqrt(index)
        cone(f"{landscape_id} planting {index}", (fx + math.cos(angle) * radius, fy + math.sin(angle) * radius, 1.45), 0.42, 0.08, 1.5, material, VEGETATION, 5)


def export_collection(collection, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(collection.all_objects), None)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_DIR / filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


def merge_collection(collection):
    meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
    if len(meshes) < 2:
        return
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
    meshes[0].name = f"{collection.name} merged mesh"


exports = [
    (TERRAIN, "terrain.glb"),
    (BUILDING_COLLECTIONS["BuildingsSouth"], "buildings-south.glb"),
    (BUILDING_COLLECTIONS["BuildingsCenter"], "buildings-center.glb"),
    (BUILDING_COLLECTIONS["BuildingsNorth"], "buildings-north.glb"),
    (VEGETATION, "vegetation.glb"),
    (LANDMARK_COLLECTION, "landmarks.glb"),
]
for collection, _ in exports:
    merge_collection(collection)
for collection, filename in exports:
    export_collection(collection, filename)


scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUTPUT_DIR / "overview.png")
scene.world.color = (0.04, 0.09, 0.10)

scene_center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0))
bpy.ops.object.camera_add(location=(scene_center.x, scene_center.y - 1800, 14000))
camera = bpy.context.object
camera.name = "Overview camera"
target = scene_center
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 24
camera.data.clip_end = 30000
scene.camera = camera
bpy.ops.object.light_add(type="SUN", location=(-2000, -3000, 7000))
sun = bpy.context.object
sun.data.energy = 2.1
sun.rotation_euler = (math.radians(28), math.radians(-22), math.radians(-28))
bpy.ops.object.light_add(type="AREA", location=(2500, -1200, 4500))
area = bpy.context.object
area.data.energy = 1200
area.data.shape = "DISK"
area.data.size = 3500
area.rotation_euler = (target - area.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "jiangxinzhou-v2.blend"))
bpy.ops.render.render(write_still=True)

previous_asset_manifest = {}
manifest_path = OUTPUT_DIR / "scene-manifest.json"
if manifest_path.exists():
    with open(manifest_path, "r", encoding="utf-8") as handle:
        previous_asset_manifest = json.load(handle)

asset_manifest = {
    "version": MANIFEST["version"],
    "origin": MANIFEST["origin"],
    "units": "metres",
    "north": "+Y",
    "tiles": [],
    "landmarkTiles": previous_asset_manifest.get("landmarkTiles", []),
    "contextTiles": previous_asset_manifest.get("contextTiles", []),
    "transportVehicles": previous_asset_manifest.get("transportVehicles", []),
}
for collection, filename in exports:
    file_path = OUTPUT_DIR / filename
    asset_manifest["tiles"].append({
        "id": collection.name,
        "url": f"/models/jiangxinzhou-v2/{filename}",
        "bytes": file_path.stat().st_size,
        "lod": 2 if collection.name == "Landmarks" else 1,
    })
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(asset_manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

print(f"Jiangxinzhou V2 assets exported to {OUTPUT_DIR}")
