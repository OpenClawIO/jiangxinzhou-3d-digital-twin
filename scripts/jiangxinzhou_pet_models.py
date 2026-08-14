"""Build the small original companion-pet asset used by the Jiangxinzhou ecology layer.

The asset intentionally contains four separate low-poly roots. Three.js can clone
those roots, animate them with lightweight procedural motion, and keep the map's
main geometry independent from the companion layer.
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="public/models/jiangxinzhou-v2")
    known, _ = parser.parse_known_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    return known


ARGS = parse_args()
OUTPUT_DIR = os.path.abspath(ARGS.output_dir)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def material(name, color, roughness=0.82, metalness=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metalness
    return mat


MATS = {
    "dog_body": material("Pet dog warm coat", (0.56, 0.30, 0.15)),
    "dog_muzzle": material("Pet dog muzzle", (0.83, 0.64, 0.42)),
    "dog_collar": material("Pet dog collar", (0.12, 0.45, 0.47), 0.58),
    "cat_body": material("Pet cat silver coat", (0.42, 0.48, 0.52)),
    "cat_belly": material("Pet cat pale belly", (0.72, 0.70, 0.62)),
    "cat_collar": material("Pet cat collar", (0.82, 0.36, 0.48), 0.58),
    "rabbit_body": material("Pet rabbit soft white", (0.86, 0.82, 0.75)),
    "rabbit_ear": material("Pet rabbit ear pink", (0.76, 0.38, 0.43)),
    "rabbit_collar": material("Pet rabbit collar", (0.43, 0.59, 0.28), 0.58),
    "egret_body": material("Egret white feathers", (0.89, 0.90, 0.84)),
    "egret_wing": material("Egret wing shade", (0.62, 0.70, 0.70)),
    "egret_beak": material("Egret beak", (0.88, 0.55, 0.18)),
    "egret_leg": material("Egret legs", (0.36, 0.25, 0.15)),
    "eye": material("Companion dark eyes", (0.018, 0.022, 0.022), 0.28),
    "eye_glint": material("Companion eye glints", (0.98, 0.98, 0.90), 0.18),
}


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def parent(obj, root):
    obj.parent = root
    return obj


def sphere(name, location, scale, mat, root, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    return parent(obj, root)


def cone(name, location, radius1, radius2, depth, mat, root, vertices=8, rotation=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    return parent(obj, root)


def cylinder_between(name, start, end, radius, mat, root, vertices=8):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(start_v + end_v) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    smooth(obj)
    return parent(obj, root)


def rounded_box(name, location, scale, mat, root, bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("soft edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return parent(obj, root)


def eye_pair(root, x, y, z, spacing, scale=0.04):
    for index, side in enumerate((-1, 1)):
        sphere(f"{root.name}Eye{index}", (x, y, z + side * spacing), (scale, scale, scale), MATS["eye"], root, 8, 6)
        sphere(f"{root.name}EyeGlint{index}", (x + scale * 0.78, y + scale * 0.35, z + side * spacing - scale * 0.28), (scale * 0.28, scale * 0.28, scale * 0.28), MATS["eye_glint"], root, 6, 4)


def build_dog():
    root = bpy.data.objects.new("PetDog", None)
    bpy.context.collection.objects.link(root)
    body = sphere("DogBody", (0, 0.42, 0), (0.50, 0.27, 0.25), MATS["dog_body"], root)
    sphere("DogChest", (0.36, 0.45, 0), (0.26, 0.29, 0.24), MATS["dog_body"], root)
    sphere("DogHead", (0.52, 0.66, 0), (0.25, 0.24, 0.23), MATS["dog_body"], root)
    sphere("DogMuzzle", (0.74, 0.60, 0), (0.17, 0.13, 0.14), MATS["dog_muzzle"], root)
    cone("DogEarLeft", (0.43, 0.86, -0.17), 0.10, 0.025, 0.24, MATS["dog_body"], root, 7, (0.1, 0.16, -0.2))
    cone("DogEarRight", (0.43, 0.86, 0.17), 0.10, 0.025, 0.24, MATS["dog_body"], root, 7, (0.1, 0.16, 0.2))
    eye_pair(root, 0.70, 0.72, 0, 0.125, 0.038)
    rounded_box("DogCollar", (0.34, 0.59, 0), (0.035, 0.035, 0.21), MATS["dog_collar"], root, 0.02)
    for x in (-0.27, 0.25):
        for z in (-0.14, 0.14):
            cylinder_between("DogLeg", (x, 0.29, z), (x + 0.02, 0.03, z), 0.06, MATS["dog_body"], root, 7)
            sphere("DogPaw", (x + 0.03, 0.02, z), (0.08, 0.045, 0.07), MATS["dog_muzzle"], root)
    cylinder_between("DogTail", (-0.43, 0.56, 0), (-0.68, 0.77, 0.03), 0.065, MATS["dog_body"], root, 7)
    cylinder_between("DogTailTip", (-0.68, 0.77, 0.03), (-0.78, 0.92, 0.08), 0.045, MATS["dog_body"], root, 7)
    return root


def build_cat():
    root = bpy.data.objects.new("PetCat", None)
    bpy.context.collection.objects.link(root)
    sphere("CatBody", (0, 0.43, 0), (0.47, 0.24, 0.22), MATS["cat_body"], root)
    sphere("CatBelly", (0.26, 0.39, 0), (0.25, 0.19, 0.20), MATS["cat_belly"], root)
    sphere("CatHead", (0.47, 0.69, 0), (0.24, 0.23, 0.21), MATS["cat_body"], root)
    cone("CatEarLeft", (0.38, 0.93, -0.14), 0.11, 0.02, 0.29, MATS["cat_body"], root, 7, (0.0, 0.0, -0.18))
    cone("CatEarRight", (0.38, 0.93, 0.14), 0.11, 0.02, 0.29, MATS["cat_body"], root, 7, (0.0, 0.0, 0.18))
    eye_pair(root, 0.66, 0.74, 0, 0.115, 0.04)
    rounded_box("CatCollar", (0.32, 0.62, 0), (0.035, 0.035, 0.20), MATS["cat_collar"], root, 0.02)
    for x in (-0.25, 0.25):
        for z in (-0.13, 0.13):
            cylinder_between("CatLeg", (x, 0.30, z), (x + 0.04, 0.03, z), 0.05, MATS["cat_body"], root, 7)
    cylinder_between("CatTail", (-0.40, 0.52, 0), (-0.66, 0.77, 0.04), 0.055, MATS["cat_body"], root, 7)
    cylinder_between("CatTailTip", (-0.66, 0.77, 0.04), (-0.72, 1.01, 0.12), 0.04, MATS["cat_body"], root, 7)
    return root


def build_rabbit():
    root = bpy.data.objects.new("PetRabbit", None)
    bpy.context.collection.objects.link(root)
    sphere("RabbitBody", (0, 0.40, 0), (0.38, 0.27, 0.24), MATS["rabbit_body"], root)
    sphere("RabbitHead", (0.37, 0.69, 0), (0.24, 0.23, 0.21), MATS["rabbit_body"], root)
    sphere("RabbitEarLeft", (0.31, 1.02, -0.10), (0.075, 0.30, 0.07), MATS["rabbit_body"], root)
    sphere("RabbitEarRight", (0.31, 1.02, 0.10), (0.075, 0.30, 0.07), MATS["rabbit_body"], root)
    sphere("RabbitEarInnerLeft", (0.37, 1.02, -0.10), (0.035, 0.22, 0.026), MATS["rabbit_ear"], root, 8, 6)
    sphere("RabbitEarInnerRight", (0.37, 1.02, 0.10), (0.035, 0.22, 0.026), MATS["rabbit_ear"], root, 8, 6)
    sphere("RabbitMuzzle", (0.58, 0.65, 0), (0.14, 0.12, 0.13), MATS["rabbit_body"], root)
    eye_pair(root, 0.53, 0.74, 0, 0.12, 0.035)
    rounded_box("RabbitCollar", (0.26, 0.60, 0), (0.03, 0.03, 0.17), MATS["rabbit_collar"], root, 0.018)
    for x in (-0.20, 0.22):
        for z in (-0.13, 0.13):
            sphere("RabbitFoot", (x + 0.05, 0.11, z), (0.12, 0.09, 0.09), MATS["rabbit_body"], root)
    sphere("RabbitTail", (-0.36, 0.56, 0), (0.14, 0.14, 0.14), MATS["rabbit_body"], root)
    return root


def build_egret():
    root = bpy.data.objects.new("PetEgret", None)
    bpy.context.collection.objects.link(root)
    sphere("EgretBody", (0, 0.66, 0), (0.47, 0.24, 0.20), MATS["egret_body"], root)
    sphere("EgretWingLeft", (-0.05, 0.70, -0.22), (0.34, 0.10, 0.10), MATS["egret_wing"], root)
    sphere("EgretWingRight", (-0.05, 0.70, 0.22), (0.34, 0.10, 0.10), MATS["egret_wing"], root)
    cylinder_between("EgretNeck", (0.30, 0.70, 0), (0.42, 1.12, 0), 0.095, MATS["egret_body"], root, 8)
    sphere("EgretHead", (0.48, 1.20, 0), (0.16, 0.15, 0.15), MATS["egret_body"], root)
    cone("EgretBeak", (0.68, 1.18, 0), 0.075, 0.0, 0.32, MATS["egret_beak"], root, 7, (0, math.pi / 2, 0))
    eye_pair(root, 0.55, 1.24, 0, 0.10, 0.028)
    cylinder_between("EgretLegLeft", (-0.12, 0.48, -0.08), (-0.14, 0.04, -0.08), 0.028, MATS["egret_leg"], root, 6)
    cylinder_between("EgretLegRight", (0.12, 0.48, 0.08), (0.14, 0.04, 0.08), 0.028, MATS["egret_leg"], root, 6)
    return root


def setup_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.world.color = (0.02, 0.05, 0.06)


def merge_root_meshes(root):
    """Keep one mesh node per species while retaining material groups."""
    meshes = [child for child in root.children if child.type == "MESH"]
    if not meshes:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = f"{root.name}Mesh"
    joined.parent = root


def export_asset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.data.objects.get("PetDog")
    output = os.path.join(OUTPUT_DIR, "jiangxinzhou-pets.glb")
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print(f"Exported PET asset: {output}")


def main():
    setup_scene()
    roots = [build_dog(), build_cat(), build_rabbit(), build_egret()]
    for root in roots:
        merge_root_meshes(root)
    export_asset()


main()
