"""Create an original metre-scale Yangtze finless porpoise asset.

Blender 5.2+:
  blender -b --python scripts/jiangxinzhou_porpoise_model.py -- \
    --output-dir public/models/jiangxinzhou-v2

The model is an intentionally compact visitor-map asset. It uses original
geometry and materials only; no photographs or external textures are packed.
The local Blender axes are X=east, Y=north and Z=up, matching the existing
Jiangxinzhou GLB export pipeline.
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
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


ARGS = arguments()
ROOT = Path.cwd()
OUTPUT_DIR = (ROOT / ARGS.output_dir).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    root = bpy.context.scene.collection
    collection = bpy.data.collections.get("Collection")
    if collection:
        collection.name = "Porpoise"
    else:
        collection = bpy.data.collections.new("Porpoise")
        root.children.link(collection)
    return collection


PORPOISE = clean_scene()


def move_to_collection(obj):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    PORPOISE.objects.link(obj)
    return obj


def material(name, color, roughness=0.62, metallic=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return value


SKIN = material("Porpoise skin", (0.28, 0.38, 0.40), 0.48, 0.03)
BELLY = material("Porpoise belly", (0.55, 0.62, 0.61), 0.60, 0.01)
RIDGE = material("Porpoise back ridge", (0.19, 0.29, 0.31), 0.55, 0.02)
FLIPPER = material("Porpoise flippers", (0.22, 0.32, 0.34), 0.58, 0.02)
EYE = material("Porpoise eye", (0.015, 0.024, 0.027), 0.18, 0.02)
EYE_HIGHLIGHT = material("Porpoise eye highlight", (0.82, 0.91, 0.88), 0.14, 0.0)


def apply_material(obj, value):
    obj.data.materials.append(value)
    return obj


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def uv_ellipsoid(name, location, scale, value, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, value)
    smooth(obj)
    move_to_collection(obj)
    return obj


def paddle(name, points, value, thickness=0.055):
    """Create a small bevelled paddle from a top/bottom polygon pair."""
    vertices = [(x, y, z + thickness / 2) for x, y, z in points]
    vertices += [(x, y, z - thickness / 2) for x, y, z in points]
    count = len(points)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    faces += [
        (index, (index + 1) % count, (index + 1) % count + count, index + count)
        for index in range(count)
    ]
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(value)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    PORPOISE.objects.link(obj)
    bevel = obj.modifiers.new("Rounded paddle edge", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    smooth(obj)
    return obj


def eye(name, y):
    return uv_ellipsoid(name, (0.72, y, 0.13), (0.045, 0.035, 0.045), EYE, 16, 8)


# The body is 1.82 m long, close to the visitor-scale adult range. The broad
# head and low dorsal ridge intentionally distinguish a finless porpoise from
# a bottlenose dolphin silhouette.
body = uv_ellipsoid("PorpoiseBody", (-0.05, 0.0, 0.0), (0.88, 0.38, 0.30), SKIN, 40, 20)
body["species"] = "Yangtze finless porpoise"
body["common_name_zh"] = "长江江豚"
body["length_m"] = 1.82
body["model_precision"] = "visitor-scale original geometry"

head = uv_ellipsoid("PorpoiseHead", (0.66, 0.0, 0.02), (0.38, 0.34, 0.27), SKIN, 32, 16)
belly = uv_ellipsoid("PorpoiseBelly", (0.03, 0.0, -0.19), (0.72, 0.31, 0.11), BELLY, 32, 14)
tail_stock = uv_ellipsoid("PorpoiseTailStock", (-0.82, 0.0, -0.01), (0.34, 0.18, 0.14), SKIN, 24, 12)
ridge = uv_ellipsoid("PorpoiseBackRidge", (-0.08, 0.0, 0.285), (0.48, 0.075, 0.045), RIDGE, 24, 10)

left_flipper = paddle(
    "PorpoiseFlipperLeft",
    [(0.18, 0.24, -0.03), (0.05, 0.56, -0.12), (-0.22, 0.52, -0.15), (-0.04, 0.20, -0.13)],
    FLIPPER,
)
right_flipper = paddle(
    "PorpoiseFlipperRight",
    [(0.18, -0.24, -0.03), (0.05, -0.56, -0.12), (-0.22, -0.52, -0.15), (-0.04, -0.20, -0.13)],
    FLIPPER,
)

tail = paddle(
    "PorpoiseTail",
    [(-1.08, 0.0, 0.02), (-1.38, 0.24, 0.02), (-1.55, 0.10, 0.01), (-1.30, 0.0, 0.0), (-1.55, -0.10, 0.01), (-1.38, -0.24, 0.02)],
    FLIPPER,
    0.075,
)

eye("PorpoiseEyeLeft", 0.285)
eye("PorpoiseEyeRight", -0.285)
uv_ellipsoid("PorpoiseEyeHighlightLeft", (0.755, 0.315, 0.145), (0.012, 0.009, 0.012), EYE_HIGHLIGHT, 8, 6)
uv_ellipsoid("PorpoiseEyeHighlightRight", (0.755, -0.315, 0.145), (0.012, 0.009, 0.012), EYE_HIGHLIGHT, 8, 6)

def merge_material_groups():
    """Merge repeatable parts so six runtime instances stay under ten draws."""
    groups = {}
    for obj in list(PORPOISE.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for material_name, objects in groups.items():
        if len(objects) == 1:
            objects[0].name = f"PorpoiseSurface-{material_name}"
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f"PorpoiseSurface-{material_name}"


merge_material_groups()

# Preserve semantic node names for loaders and validators after material merge.
root = bpy.data.objects.new("PorpoiseAssetRoot", None)
PORPOISE.objects.link(root)
for node_name in (
    "PorpoiseBody",
    "PorpoiseHead",
    "PorpoiseBackRidge",
    "PorpoiseFlipperLeft",
    "PorpoiseFlipperRight",
    "PorpoiseTail",
):
    node = bpy.data.objects.new(node_name, None)
    PORPOISE.objects.link(node)
    node.parent = root

# Keep the asset centred at the waterline for predictable instancing in R3F.
root["asset_role"] = "porpoise"
root["species"] = "Yangtze finless porpoise"
root["common_name_zh"] = "长江江豚"
root["length_m"] = 1.82
root["model_precision"] = "visitor-scale original geometry"

bpy.ops.object.select_all(action="DESELECT")
for obj in PORPOISE.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body

output_path = OUTPUT_DIR / "finless-porpoise.glb"
for obj in PORPOISE.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
triangle_count = sum(
    len(obj.data.loop_triangles)
    for obj in PORPOISE.objects
    if obj.type == "MESH"
)
draw_call_count = sum(
    max(1, len(obj.data.materials))
    for obj in PORPOISE.objects
    if obj.type == "MESH"
)
world_vertices = [
    obj.matrix_world @ vertex.co
    for obj in PORPOISE.objects
    if obj.type == "MESH"
    for vertex in obj.data.vertices
]
asset_bounds = {
    # Blender's Z-up exporter maps Blender Z to glTF Y and Blender Y to
    # glTF -Z. Keep the manifest in the same coordinate convention as the
    # browser and the optimized GLB.
    "min": [round(min(vertex.x for vertex in world_vertices), 4), round(min(vertex.z for vertex in world_vertices), 4), round(-max(vertex.y for vertex in world_vertices), 4)],
    "max": [round(max(vertex.x for vertex in world_vertices), 4), round(max(vertex.z for vertex in world_vertices), 4), round(-min(vertex.y for vertex in world_vertices), 4)],
}
bpy.ops.export_scene.gltf(
    filepath=str(output_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_materials="EXPORT",
)

manifest_path = OUTPUT_DIR / "scene-manifest.json"
with open(manifest_path, "r", encoding="utf-8") as handle:
    scene_manifest = json.load(handle)

scene_manifest["porpoiseAssets"] = [{
    "id": "FinlessPorpoise",
    "url": "/models/jiangxinzhou-v2/finless-porpoise.glb",
    "bytes": output_path.stat().st_size,
    "triangles": triangle_count,
    "drawCalls": draw_call_count,
    "bounds": asset_bounds,
    "species": "Yangtze finless porpoise",
    "source": "original Blender geometry; public morphology reference only",
    "materials": [
        "Porpoise skin",
        "Porpoise belly",
        "Porpoise back ridge",
        "Porpoise flippers",
        "Porpoise eye",
        "Porpoise eye highlight",
    ],
}]
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(scene_manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

print(f"Finless porpoise asset exported to {output_path}")
