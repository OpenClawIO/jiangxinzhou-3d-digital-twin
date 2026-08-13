"""Build a continuous-surface Yangtze finless porpoise asset in Blender."""

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
    collection = bpy.data.collections.get("Collection")
    if collection:
        collection.name = "Porpoise"
    else:
        collection = bpy.data.collections.new("Porpoise")
        bpy.context.scene.collection.children.link(collection)
    return collection


PORPOISE = clean_scene()


def move_to_collection(obj):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    PORPOISE.objects.link(obj)
    return obj


def make_material(name, color, roughness=0.62, metallic=0.0, coat=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = coat
    elif "Clearcoat" in shader.inputs:
        shader.inputs["Clearcoat"].default_value = coat
    return value


SKIN = make_material("Porpoise skin", (0.18, 0.29, 0.31), 0.48, 0.02, 0.16)
BELLY = make_material("Porpoise belly", (0.42, 0.51, 0.51), 0.60, 0.01, 0.08)
RIDGE = make_material("Porpoise back ridge", (0.11, 0.21, 0.23), 0.55, 0.02, 0.12)
FLIPPER = make_material("Porpoise flippers", (0.13, 0.24, 0.26), 0.58, 0.02, 0.10)
EYE = make_material("Porpoise eye", (0.006, 0.012, 0.014), 0.16, 0.02, 0.34)
EYE_HIGHLIGHT = make_material("Porpoise eye highlight", (0.80, 0.94, 0.90), 0.12, 0.0, 0.10)


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def subdivide(obj, levels=1):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("Continuous surface smoothing", "SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = levels
    modifier.render_levels = levels
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    return smooth(obj)


def make_body():
    # X is nose-to-tail. The broad front rings produce a rounded head and
    # short blunt rostrum instead of a pointed dolphin muzzle.
    profiles = [
        (-1.18, 0.035, 0.045, 0.01), (-1.08, 0.13, 0.12, 0.01),
        (-0.92, 0.24, 0.20, 0.00), (-0.68, 0.33, 0.27, -0.01),
        (-0.38, 0.385, 0.31, -0.02), (-0.08, 0.40, 0.325, -0.015),
        (0.20, 0.375, 0.31, 0.00), (0.43, 0.335, 0.28, 0.015),
        (0.62, 0.285, 0.245, 0.025), (0.75, 0.205, 0.18, 0.03),
        (0.83, 0.10, 0.10, 0.03), (0.86, 0.025, 0.03, 0.03),
    ]
    radial = 40
    vertices = []
    for x, radius_y, radius_z, center_z in profiles:
        for index in range(radial):
            theta = math.tau * index / radial
            vertices.append((x, radius_y * math.cos(theta), center_z + radius_z * math.sin(theta)))
    faces = []
    for ring in range(len(profiles) - 1):
        for index in range(radial):
            next_index = (index + 1) % radial
            faces.append((ring * radial + index, ring * radial + next_index, (ring + 1) * radial + next_index, (ring + 1) * radial + index))
    front = len(vertices)
    vertices.append((profiles[0][0] - 0.015, 0.0, profiles[0][3]))
    rear = len(vertices)
    vertices.append((profiles[-1][0] + 0.012, 0.0, profiles[-1][3]))
    for index in range(radial):
        next_index = (index + 1) % radial
        faces.append((front, next_index, index))
        start = (len(profiles) - 1) * radial
        faces.append((rear, start + index, start + next_index))
    mesh = bpy.data.meshes.new("PorpoiseBodyMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(SKIN)
    mesh.materials.append(BELLY)
    mesh.update()
    obj = bpy.data.objects.new("PorpoiseBody", mesh)
    PORPOISE.objects.link(obj)
    for polygon in mesh.polygons:
        average_z = sum(mesh.vertices[index].co.z for index in polygon.vertices) / len(polygon.vertices)
        polygon.material_index = 1 if average_z < -0.055 else 0
    return subdivide(obj, 2)


def ellipsoid(name, location, scale, value, segments=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(value)
    move_to_collection(obj)
    return subdivide(obj, 1)


def swept_fin(name, points, widths, thicknesses, value):
    vertices = []
    for index, point in enumerate(points):
        current = Vector(point)
        previous = Vector(points[max(0, index - 1)])
        following = Vector(points[min(len(points) - 1, index + 1)])
        tangent = following - previous
        tangent.z = 0
        tangent.normalize()
        side = Vector((-tangent.y, tangent.x, 0.0))
        side.normalize()
        width = widths[index]
        thickness = thicknesses[index]
        vertices.extend([
            tuple(current - side * width + Vector((0, 0, thickness))),
            tuple(current + side * width + Vector((0, 0, thickness))),
            tuple(current + side * width - Vector((0, 0, thickness))),
            tuple(current - side * width - Vector((0, 0, thickness))),
        ])
    faces = []
    for index in range(len(points) - 1):
        current = index * 4
        following = (index + 1) * 4
        faces.extend([
            (current, following, following + 1, current + 1),
            (current + 3, current + 2, following + 2, following + 3),
            (current + 1, following + 1, following + 2, current + 2),
            (current + 3, following + 3, following, current),
        ])
    end = (len(points) - 1) * 4
    faces.extend([(0, 1, 2, 3), (end, end + 3, end + 2, end + 1)])
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(value)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    PORPOISE.objects.link(obj)
    bevel = obj.modifiers.new("Soft fin edge", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return subdivide(obj, 1)


def join_meshes(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


body = make_body()
body["species"] = "Yangtze finless porpoise"
body["common_name_zh"] = "长江江豚"
body["length_m"] = 1.82
body["model_precision"] = "visitor-scale continuous surface reconstruction"

# A low, broad dorsal contour: explicitly not a triangular dorsal fin.
ellipsoid("PorpoiseBackRidge", (-0.12, 0.0, 0.305), (0.52, 0.075, 0.045), RIDGE, 28, 12)

left_flipper = swept_fin("PorpoiseFlipperLeft", [(0.22, 0.275, -0.08), (0.08, 0.40, -0.13), (-0.12, 0.55, -0.19), (-0.32, 0.64, -0.22)], [0.105, 0.13, 0.10, 0.025], [0.040, 0.035, 0.022, 0.008], FLIPPER)
right_flipper = swept_fin("PorpoiseFlipperRight", [(0.22, -0.275, -0.08), (0.08, -0.40, -0.13), (-0.12, -0.55, -0.19), (-0.32, -0.64, -0.22)], [0.105, 0.13, 0.10, 0.025], [0.040, 0.035, 0.022, 0.008], FLIPPER)
join_meshes([left_flipper, right_flipper], "PorpoiseFlipperSurface")

tail_left = swept_fin("PorpoiseTailLeft", [(-1.03, 0.0, 0.015), (-1.18, 0.16, 0.045), (-1.34, 0.38, 0.075), (-1.47, 0.60, 0.06)], [0.14, 0.17, 0.12, 0.025], [0.04, 0.032, 0.02, 0.008], FLIPPER)
tail_right = swept_fin("PorpoiseTailRight", [(-1.03, 0.0, 0.015), (-1.18, -0.16, 0.045), (-1.34, -0.38, 0.075), (-1.47, -0.60, 0.06)], [0.14, 0.17, 0.12, 0.025], [0.04, 0.032, 0.02, 0.008], FLIPPER)
join_meshes([tail_left, tail_right], "PorpoiseTail")

eye_left = ellipsoid("PorpoiseEyeLeft", (0.60, 0.255, 0.095), (0.052, 0.030, 0.052), EYE, 20, 10)
eye_right = ellipsoid("PorpoiseEyeRight", (0.60, -0.255, 0.095), (0.052, 0.030, 0.052), EYE, 20, 10)
blowhole = ellipsoid("PorpoiseBlowhole", (0.46, 0.0, 0.282), (0.055, 0.035, 0.012), EYE, 16, 8)
join_meshes([eye_left, eye_right, blowhole], "PorpoiseEyes")
highlight_left = ellipsoid("PorpoiseEyeHighlightLeft", (0.632, 0.278, 0.112), (0.014, 0.009, 0.014), EYE_HIGHLIGHT, 10, 6)
highlight_right = ellipsoid("PorpoiseEyeHighlightRight", (0.632, -0.278, 0.112), (0.014, 0.009, 0.014), EYE_HIGHLIGHT, 10, 6)
join_meshes([highlight_left, highlight_right], "PorpoiseEyeHighlights")

# Semantic empties keep the existing loader and evidence tooling stable while
# the visible surfaces remain combined for efficient instancing.
semantic_root = bpy.data.objects.new("PorpoiseAssetRoot", None)
PORPOISE.objects.link(semantic_root)
for node_name in ("PorpoiseHead", "PorpoiseBackRidge", "PorpoiseFlipperLeft", "PorpoiseFlipperRight", "PorpoiseTail"):
    node = bpy.data.objects.new(node_name, None)
    PORPOISE.objects.link(node)
    node.parent = semantic_root
semantic_root["asset_role"] = "porpoise"
semantic_root["species"] = "Yangtze finless porpoise"
semantic_root["common_name_zh"] = "长江江豚"
semantic_root["length_m"] = 1.82
semantic_root["model_precision"] = "visitor-scale continuous surface reconstruction"

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
bpy.ops.object.select_all(action="DESELECT")
for obj in PORPOISE.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body

output_path = OUTPUT_DIR / "finless-porpoise.glb"
for obj in PORPOISE.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
triangle_count = sum(len(obj.data.loop_triangles) for obj in PORPOISE.objects if obj.type == "MESH")
draw_call_count = sum(max(1, len(obj.data.materials)) for obj in PORPOISE.objects if obj.type == "MESH")
world_vertices = [obj.matrix_world @ vertex.co for obj in PORPOISE.objects if obj.type == "MESH" for vertex in obj.data.vertices]
asset_bounds = {
    "min": [round(min(vertex.x for vertex in world_vertices), 4), round(min(vertex.z for vertex in world_vertices), 4), round(-max(vertex.y for vertex in world_vertices), 4)],
    "max": [round(max(vertex.x for vertex in world_vertices), 4), round(max(vertex.z for vertex in world_vertices), 4), round(-min(vertex.y for vertex in world_vertices), 4)],
}
bpy.ops.export_scene.gltf(filepath=str(output_path), export_format="GLB", use_selection=True, export_apply=True, export_cameras=False, export_lights=False, export_materials="EXPORT")

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
    "source": "original Blender continuous-surface geometry; public morphology reference only",
    "materials": ["Porpoise skin", "Porpoise belly", "Porpoise back ridge", "Porpoise flippers", "Porpoise eye", "Porpoise eye highlight"],
}]
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(scene_manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
print(f"Continuous finless porpoise asset exported to {output_path}: {triangle_count} triangles, {draw_call_count} draws")
