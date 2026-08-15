"""Build evidence-calibrated Jiangxinzhou ferry terminals and Zhongshan 106.

Blender 5.2+:
  blender -b --python scripts/jiangxinzhou_ferry_models.py -- \
    --output-dir public/models/jiangxinzhou-v2 \
    --review-dir output/ferry-review-v13

The assets are original visitor-grade reconstructions. Qigan and Zhongshan 106
use official editorial reference photographs. Mianhuadi's water anchor and
approach are mapped, but its minor facilities remain an explicitly estimated
interpretation because sufficient public multi-angle photographs were not found.
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
    parser.add_argument("--review-dir", default="output/ferry-review-v13")
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


def make_material(name, rgba, roughness=0.6, metallic=0.0, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = rgba
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = 1.8
    return value


IVORY = make_material("Qigan warm ivory masonry", (0.78, 0.75, 0.65, 1), 0.78)
GRAY_BRICK = make_material("Qigan gray brick", (0.31, 0.32, 0.29, 1), 0.9)
CONCRETE = make_material("Terminal concrete", (0.42, 0.45, 0.43, 1), 0.9)
LIGHT_CONCRETE = make_material("Weathered light concrete", (0.62, 0.63, 0.58, 1), 0.88)
PAVING = make_material("Terminal paving", (0.22, 0.25, 0.24, 1), 0.84)
ASPHALT = make_material("Approach asphalt", (0.105, 0.12, 0.12, 1), 0.92)
WHITE = make_material("Zhongshan 106 warm white", (0.88, 0.88, 0.82, 1), 0.58)
HULL_DARK = make_material("Zhongshan 106 dark hull", (0.035, 0.055, 0.055, 1), 0.4, 0.2)
ORANGE = make_material("Zhongshan 106 orange red band", (0.94, 0.20, 0.055, 1), 0.5)
DECK_GREEN = make_material("Zhongshan 106 deck green", (0.20, 0.38, 0.31, 1), 0.75)
WINDOW = make_material("Zhongshan 106 blue gray glass", (0.035, 0.12, 0.14, 1), 0.2, 0.18)
METAL = make_material("Galvanized rail metal", (0.40, 0.43, 0.40, 1), 0.31, 0.72)
DARK_METAL = make_material("Gate and marine dark metal", (0.055, 0.065, 0.06, 1), 0.35, 0.72)
YELLOW = make_material("Safety yellow", (0.94, 0.63, 0.06, 1), 0.52)
WOOD = make_material("Passenger bench timber", (0.37, 0.20, 0.085, 1), 0.68)
LIFE_ORANGE = make_material("Life ring orange", (1.0, 0.24, 0.035, 1), 0.45)
LIGHT = make_material("Terminal warm lamp", (1.0, 0.78, 0.35, 1), 0.22, emission=(1.0, 0.55, 0.12, 1))
GREEN_LIGHT = make_material("Starboard navigation light", (0.04, 0.9, 0.28, 1), 0.2, emission=(0.02, 0.8, 0.15, 1))
RED_LIGHT = make_material("Port navigation light", (1.0, 0.04, 0.02, 1), 0.2, emission=(0.9, 0.01, 0.005, 1))
WATER = make_material("Review water", (0.06, 0.20, 0.25, 1), 0.28, 0.04)


def link(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def cube(name, location, size, mat, collection, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Evidence-scale edge softness", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return link(obj, collection)


def cylinder(name, location, radius, depth, mat, collection, rotation=(0, 0, 0), vertices=14):
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


def beam(collection, start, end, radius=0.055, mat=METAL, name="Metal beam"):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    obj = cylinder(name, (a + b) / 2, radius, delta.length, mat, collection, vertices=10)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def curve_tube(name, points, bevel_depth, mat, collection):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    collection.objects.link(obj)
    return obj


def rail_run(collection, x0, x1, y, floor_z=0.75, top_z=1.72, posts=9, name="Terminal rail"):
    beam(collection, (x0, y, top_z), (x1, y, top_z), name=name)
    beam(collection, (x0, y, top_z - 0.48), (x1, y, top_z - 0.48), radius=0.042, name=name)
    for index in range(posts):
        x = x0 + (x1 - x0) * index / max(1, posts - 1)
        beam(collection, (x, y, floor_z), (x, y, top_z), radius=0.045, name=f"{name} post")


def bollards(collection, xs, y, z=0.9):
    for x in xs:
        cylinder("Marine mooring bollard", (x, y, z + 0.3), 0.18, 0.62, DARK_METAL, collection, vertices=12)
        cylinder("Marine mooring bollard cap", (x, y, z + 0.64), 0.27, 0.1, DARK_METAL, collection, vertices=12)


def gate_bars(collection, x, opening_width, bottom, top, detail, name):
    count = 13 if detail == "lod2" else 7
    for index in range(count):
        y = -opening_width / 2 + opening_width * index / max(1, count - 1)
        beam(collection, (x, y, bottom), (x, y, top), radius=0.045, mat=DARK_METAL, name=name)
    beam(collection, (x, -opening_width / 2, top), (x, opening_width / 2, top), radius=0.07, mat=DARK_METAL, name=name)
    beam(collection, (x, -opening_width / 2, bottom), (x, opening_width / 2, bottom), radius=0.07, mat=DARK_METAL, name=name)


def arch_backing(collection, name, x, radius, spring_z, bottom_z):
    points_yz = [(-radius, bottom_z), (-radius, spring_z)]
    for index in range(17):
        angle = math.pi - math.pi * index / 16
        points_yz.append((math.cos(angle) * radius, spring_z + math.sin(angle) * radius))
    points_yz.extend([(radius, spring_z), (radius, bottom_z)])
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata([(x, y, z) for y, z in points_yz], [], [tuple(range(len(points_yz)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(DARK_METAL)
    collection.objects.link(obj)
    return obj


def qigan_arch(collection, detail):
    facade_x = -56.2
    cube("Qigan gray brick left wing", (facade_x, -8.3, 3.5), (1.3, 10.4, 7.0), GRAY_BRICK, collection, 0.06)
    cube("Qigan gray brick right wing", (facade_x, 8.3, 3.5), (1.3, 10.4, 7.0), GRAY_BRICK, collection, 0.06)
    cube("Qigan gray brick upper facade", (facade_x, 0, 7.5), (1.3, 6.2, 2.0), GRAY_BRICK, collection, 0.06)
    for y in (-13.0, -7.0, 7.0, 13.0):
        cube("Qigan ivory facade pier", (facade_x - 0.18, y, 4.1), (1.7, 1.25, 8.2), IVORY, collection, 0.08)
    cube("Qigan ivory facade parapet", (facade_x - 0.18, 0, 8.65), (1.7, 27.4, 1.15), IVORY, collection, 0.08)
    cube("Qigan ivory facade base", (facade_x - 0.18, 0, 0.45), (1.7, 27.4, 0.9), IVORY, collection, 0.05)
    radius = 3.1
    points = [(facade_x - 0.88, -radius, 0.7), (facade_x - 0.88, -radius, 4.6)]
    for index in range(17):
        angle = math.pi - math.pi * index / 16
        points.append((facade_x - 0.88, math.cos(angle) * radius, 4.6 + math.sin(angle) * radius))
    points.extend([(facade_x - 0.88, radius, 4.6), (facade_x - 0.88, radius, 0.7)])
    curve_tube("Qigan ivory semicircular arch trim", points, 0.33, IVORY, collection)
    arch_backing(collection, "Qigan recessed rounded arch opening", facade_x - 0.90, radius - 0.34, 4.6, 0.7)
    gate_bars(collection, facade_x - 0.94, 5.7, 0.72, 4.7, detail, "Qigan black entrance gate")
    cube("Qigan terminal recessed name panel", (facade_x - 0.96, 0, 8.5), (0.08, 7.0, 0.58), DARK_METAL, collection, 0.02)
    if detail == "lod2":
        for z in (1.15, 2.15, 3.15, 4.15, 5.15, 6.15):
            for y in (-10.5, -5.8, 5.8, 10.5):
                cube("Qigan brick course accent", (facade_x - 0.69, y, z), (0.06, 3.6, 0.06), LIGHT_CONCRETE, collection)
        for y in (-2.15, 0, 2.15):
            cylinder("Qigan arch lamp", (facade_x - 1.05, y, 6.6), 0.11, 0.16, LIGHT, collection, rotation=(0, math.pi / 2, 0), vertices=12)


def qigan_terminal(detail):
    collection = bpy.data.collections.new(f"Qigan Ferry Terminal V13 {detail}")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("QiganTerminalRoot", None)
    collection.objects.link(root)
    cube("QiganTerminal", (-50.4, 0, 0.1), (0.02, 0.02, 0.02), CONCRETE, collection)
    qigan_arch(collection, detail)
    cube("Qigan approach road", (-27, 0, 0.4), (57, 10.5, 0.8), LIGHT_CONCRETE, collection, 0.18)
    cube("Qigan pedestrian lane", (-25, -3.1, 0.84), (52, 2.5, 0.12), PAVING, collection, 0.04)
    cube("Qigan vehicle lane", (-25, 1.4, 0.85), (52, 5.8, 0.14), ASPHALT, collection, 0.04)
    cube("Qigan boarding transition", (-3.3, 0, 0.76), (8.0, 7.4, 0.22), PAVING, collection, 0.08, rotation=(0, math.radians(-2), 0))
    cube("Qigan floating pontoon", (1.8, 0, 0.56), (8.0, 7.7, 0.58), CONCRETE, collection, 0.16)
    rail_run(collection, -51.5, 5.0, -5.05, posts=13, name="Qigan south safety rail")
    rail_run(collection, -51.5, 5.0, 5.05, posts=13, name="Qigan north safety rail")
    bollards(collection, (-0.6, 3.3), -3.2)
    cube("Qigan lane divider", (-25, -0.9, 1.02), (48, 0.14, 0.32), YELLOW, collection, 0.02)
    if detail == "lod2":
        cube("Qigan modest waiting shelter roof", (-42.0, 6.8, 3.45), (11.0, 4.2, 0.22), IVORY, collection, 0.08)
        for x in (-46.5, -37.5):
            for y in (5.2, 8.4):
                cylinder("Qigan shelter support", (x, y, 2.1), 0.085, 2.7, METAL, collection, vertices=10)
        for x in (-45, -41, -37):
            cube("Qigan waiting bench", (x, 6.8, 1.25), (2.8, 0.65, 0.42), WOOD, collection, 0.06)
        for x in (-18, -8, 2):
            cylinder("Qigan approach lamp pole", (x, -4.5, 2.35), 0.07, 3.2, METAL, collection, vertices=10)
            sphere("Qigan approach lamp glow", (x, -4.5, 4.0), (0.15, 0.15, 0.15), LIGHT, collection, 12)
        for x in (-48, -43, -38):
            cylinder("Qigan separation bollard", (x, -1.0, 1.18), 0.1, 0.68, YELLOW, collection, vertices=12)
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    return collection


def mianhuadi_terminal(detail):
    collection = bpy.data.collections.new(f"Mianhuadi Ferry Terminal V13 {detail}")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("MianhuadiTerminalRoot", None)
    collection.objects.link(root)
    cube("MianhuadiTerminal", (-25.5, 0, 0.1), (0.02, 0.02, 0.02), CONCRETE, collection)
    cube("Mianhuadi concrete embankment", (-18, 0, 0.1), (34, 13, 1.8), CONCRETE, collection, 0.18, rotation=(0, math.radians(-2.2), 0))
    cube("Mianhuadi vehicle approach", (-17, 1.7, 1.0), (35, 6.0, 0.18), ASPHALT, collection, 0.04)
    cube("Mianhuadi pedestrian approach", (-17, -3.1, 1.0), (35, 2.7, 0.16), PAVING, collection, 0.04)
    cube("Mianhuadi sloped boarding ramp", (-4.8, 0, 0.8), (12, 8.0, 0.24), PAVING, collection, 0.07, rotation=(0, math.radians(-4.5), 0))
    cube("Mianhuadi floating apron", (1.2, 0, 0.52), (8.5, 8.2, 0.56), CONCRETE, collection, 0.14)
    rail_run(collection, -34, 4.5, -6.1, floor_z=0.85, posts=11, name="Mianhuadi south embankment rail")
    rail_run(collection, -34, 4.5, 6.1, floor_z=0.85, posts=11, name="Mianhuadi north embankment rail")
    bollards(collection, (-1.5, 2.5), 3.45)
    cube("Mianhuadi flat roof service booth", (-26.3, 4.0, 2.65), (6.0, 4.5, 4.3), LIGHT_CONCRETE, collection, 0.12)
    cube("Mianhuadi service booth flat roof", (-26.3, 4.0, 4.96), (6.8, 5.3, 0.32), CONCRETE, collection, 0.08)
    cube("Mianhuadi service booth window", (-23.23, 4.0, 3.1), (0.08, 2.9, 1.25), WINDOW, collection, 0.02)
    gate_bars(collection, -30.5, 7.0, 0.95, 3.8, detail, "Mianhuadi utilitarian entrance gate")
    cube("Mianhuadi modest name board", (-30.65, 0, 4.2), (0.14, 6.5, 0.72), DARK_METAL, collection, 0.03)
    cube("Mianhuadi human vehicle divider", (-13, -0.9, 1.18), (27, 0.15, 0.35), YELLOW, collection, 0.02)
    if detail == "lod2":
        cube("Mianhuadi waiting shelter roof", (-20.5, -4.7, 3.7), (10.5, 3.1, 0.2), LIGHT_CONCRETE, collection, 0.07)
        for x in (-24.7, -16.3):
            for y in (-5.8, -3.6):
                cylinder("Mianhuadi shelter post", (x, y, 2.35), 0.08, 2.7, METAL, collection, vertices=10)
        for x in (-23.5, -20.5, -17.5):
            cube("Mianhuadi waiting bench", (x, -4.7, 1.42), (2.3, 0.6, 0.4), WOOD, collection, 0.06)
        for x in (-13, -5, 2):
            cylinder("Mianhuadi pier lamp pole", (x, 5.4, 2.45), 0.07, 3.2, METAL, collection, vertices=10)
            sphere("Mianhuadi pier lamp glow", (x, 5.4, 4.1), (0.15, 0.15, 0.15), LIGHT, collection, 12)
        for x in (-27, -24, -21):
            cylinder("Mianhuadi gate bollard", (x, -1.0, 1.3), 0.1, 0.68, YELLOW, collection, vertices=12)
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    return collection


def vessel_hull(collection, detail):
    sections = [
        (-10.8, 1.55, 0.45, 1.35), (-9.2, 2.55, 0.18, 1.58),
        (-5.0, 3.05, 0.05, 1.7), (4.8, 3.0, 0.05, 1.7),
        (9.0, 2.25, 0.2, 1.5), (10.9, 0.55, 0.62, 1.22),
    ]
    vertices = []
    for x, half_width, keel, top in sections:
        vertices.extend([(x, -half_width * 0.65, keel), (x, half_width * 0.65, keel), (x, -half_width, top), (x, half_width, top)])
    faces = []
    for section in range(len(sections) - 1):
        a = section * 4
        b = (section + 1) * 4
        faces.extend([(a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2), (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)])
    faces.extend([(0, 1, 3, 2), (len(vertices) - 4, len(vertices) - 2, len(vertices) - 1, len(vertices) - 3)])
    mesh = bpy.data.meshes.new(f"Zhongshan 106 hull mesh {detail}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Zhongshan 106 dark displacement hull", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(HULL_DARK)
    return obj


def slanted_wheelhouse(collection, detail):
    vertices = [
        (3.7, -2.25, 1.8), (3.7, 2.25, 1.8), (7.3, -1.75, 1.8), (7.3, 1.75, 1.8),
        (4.2, -1.85, 4.35), (4.2, 1.85, 4.35), (6.75, -1.45, 4.35), (6.75, 1.45, 4.35),
    ]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 4, 6, 2), (1, 3, 7, 5), (2, 6, 7, 3), (0, 1, 5, 4)]
    mesh = bpy.data.meshes.new(f"Zhongshan 106 wheelhouse mesh {detail}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    house = bpy.data.objects.new("Zhongshan 106 slanted wheelhouse", mesh)
    collection.objects.link(house)
    house.data.materials.append(WHITE)
    cube("Zhongshan 106 forward windscreen", (7.08, 0, 3.2), (0.09, 2.55, 1.25), WINDOW, collection, 0.03, rotation=(0, math.radians(-12), 0))
    for side in (-1, 1):
        cube("Zhongshan 106 wheelhouse side window", (5.45, side * 1.72, 3.2), (2.2, 0.08, 1.22), WINDOW, collection, 0.03)


def vessel_side_rail(collection, side, detail):
    beam(collection, (-9.2, side * 2.62, 2.05), (8.8, side * 2.15, 2.05), radius=0.048, name="Zhongshan 106 passenger rail")
    count = 11 if detail == "lod2" else 7
    for index in range(count):
        x = -9.0 + 17.2 * index / max(1, count - 1)
        y = side * (2.6 - max(0, x - 5.0) * 0.085)
        beam(collection, (x, y, 1.42), (x, y, 2.07), radius=0.04, name="Zhongshan 106 passenger rail post")


def create_ferry(detail):
    collection = bpy.data.collections.new(f"Zhongshan 106 V13 {detail}")
    bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("Zhongshan106Root", None)
    collection.objects.link(root)
    cube("Zhongshan106", (0, 0, 1.6), (0.02, 0.02, 0.02), WHITE, collection)
    vessel_hull(collection, detail)
    cube("Zhongshan 106 green vehicle deck", (-0.2, 0, 1.68), (19.8, 5.3, 0.26), DECK_GREEN, collection, 0.1)
    cube("Zhongshan 106 orange hull band port", (-0.5, 2.76, 1.55), (18.8, 0.12, 0.42), ORANGE, collection, 0.03)
    cube("Zhongshan 106 orange hull band starboard", (-0.5, -2.76, 1.55), (18.8, 0.12, 0.42), ORANGE, collection, 0.03)
    cube("Zhongshan 106 open passenger shelter roof", (-3.4, 0, 4.55), (11.8, 5.0, 0.25), WHITE, collection, 0.09)
    cube("Zhongshan 106 orange roof fascia port", (-3.4, 2.51, 4.35), (11.8, 0.12, 0.46), ORANGE, collection, 0.02)
    cube("Zhongshan 106 orange roof fascia starboard", (-3.4, -2.51, 4.35), (11.8, 0.12, 0.46), ORANGE, collection, 0.02)
    post_xs = (-8.4, -4.6, -0.8, 2.3) if detail == "lod2" else (-8.4, -2.6, 2.3)
    for x in post_xs:
        for y in (-2.3, 2.3):
            cylinder("Zhongshan 106 open shelter support", (x, y, 3.2), 0.075, 2.65, METAL, collection, vertices=10)
    slanted_wheelhouse(collection, detail)
    cube("Zhongshan 106 wheelhouse roof", (5.45, 0, 4.48), (3.2, 4.25, 0.22), WHITE, collection, 0.08)
    for side in (-1, 1):
        vessel_side_rail(collection, side, detail)
        cube("Zhongshan 106 boarding safety gate", (8.15, side * 2.05, 1.95), (2.1, 0.1, 1.25), METAL, collection, 0.03)
    cube("Zhongshan 106 bow rubber fender", (10.35, 0, 1.15), (0.4, 3.1, 0.48), DARK_METAL, collection, 0.06)
    cube("Zhongshan 106 stern machinery casing", (-9.6, 0, 2.18), (2.0, 4.2, 1.15), WHITE, collection, 0.12)
    cylinder("Zhongshan 106 mast", (4.8, 0, 5.7), 0.075, 2.35, DARK_METAL, collection, vertices=10)
    beam(collection, (4.8, -1.05, 6.25), (4.8, 1.05, 6.25), radius=0.045, mat=ORANGE, name="Zhongshan 106 mast crossbar")
    cylinder("Zhongshan 106 amber navigation light", (4.8, 0, 6.95), 0.12, 0.2, LIGHT, collection, vertices=12)
    if detail == "lod2":
        for row in (-1.35, 1.35):
            for x in (-7.2, -5.0, -2.8, -0.6, 1.4):
                cube("Zhongshan 106 passenger bench", (x, row, 2.2), (1.5, 0.55, 0.48), WOOD, collection, 0.06)
                cube("Zhongshan 106 passenger bench back", (x - 0.55, row, 2.58), (0.14, 0.56, 0.72), WOOD, collection, 0.04)
        for side in (-1, 1):
            for x in (-6.0, -1.5):
                bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.075, major_segments=18, minor_segments=8, location=(x, side * 2.55, 3.1), rotation=(math.pi / 2, 0, 0))
                ring = bpy.context.object
                ring.name = "Zhongshan 106 life ring"
                ring.data.materials.append(LIFE_ORANGE)
                link(ring, collection)
        cylinder("Zhongshan 106 port navigation light", (5.8, 1.9, 4.72), 0.1, 0.16, RED_LIGHT, collection, vertices=12)
        cylinder("Zhongshan 106 starboard navigation light", (5.8, -1.9, 4.72), 0.1, 0.16, GREEN_LIGHT, collection, vertices=12)
        cylinder("Zhongshan 106 radar dome", (3.9, 0, 4.9), 0.32, 0.38, WHITE, collection, vertices=20)
        for x in (-8.2, -4.2, 0, 4.2, 8.0):
            cylinder("Zhongshan 106 side rubber fender", (x, 2.95, 1.2), 0.17, 0.72, DARK_METAL, collection, rotation=(math.pi / 2, 0, 0), vertices=12)
            cylinder("Zhongshan 106 side rubber fender", (x, -2.95, 1.2), 0.17, 0.72, DARK_METAL, collection, rotation=(math.pi / 2, 0, 0), vertices=12)
    for obj in collection.objects:
        if obj != root and obj.parent is None:
            obj.parent = root
    return collection


def select_collection(collection):
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(collection.all_objects)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(obj for obj in objects if obj.type == "MESH")


def export_collection(collection, filename):
    select_collection(collection)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_DIR / filename), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)


def render_review(collection, asset_id, views, water_start=-2):
    if ARGS.skip_review:
        return
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1120
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.055, 0.075, 0.085)
    review_collection = bpy.data.collections.new("Temporary review environment")
    scene.collection.children.link(review_collection)
    cube("Review water plane", (28, 0, water_start), (58, 100, 0.2), WATER, review_collection)
    cube("Review land plane", (-50, 0, water_start - 0.04), (95, 100, 0.18), LIGHT_CONCRETE, review_collection)
    bpy.ops.object.light_add(type="SUN", location=(10, -20, 35))
    sun = bpy.context.object
    sun.data.energy = 2.3
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(24))
    bpy.ops.object.light_add(type="AREA", location=(0, -28, 22))
    area = bpy.context.object
    area.data.energy = 1100
    area.data.shape = "DISK"
    area.data.size = 16
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.lens = 52
    scene.camera = camera
    for suffix, location, target in views:
        camera.location = location
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(REVIEW_DIR / f"{asset_id}-{suffix}.png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.objects.remove(area, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.collections.remove(review_collection)


def update_manifest(exports):
    manifest_path = OUTPUT_DIR / "scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"tiles": []}
    manifest["version"] = "2026-08-15-v13"
    manifest["ferryAssets"] = [
        {"id": asset_id, "url": f"/models/jiangxinzhou-v2/{filename}", "units": "metres", "forward": "+X", "lod": lod, "assetKind": kind, "evidenceLevel": evidence_level, "evidenceRefs": evidence_refs}
        for asset_id, filename, lod, kind, evidence_level, evidence_refs in exports
    ]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


clean_scene()
terminal_exports = [
    ("qigan-pier-v13-lod1", "ferry-qigan-pier-v13-lod1.glb", 1, qigan_terminal, "triangulated", ["ferry-official-image-set-2024", "ferry-osm-qigan-building", "ferry-position-audit-v13"]),
    ("qigan-pier-v13-lod2", "ferry-qigan-pier-v13-lod2.glb", 2, qigan_terminal, "triangulated", ["ferry-official-image-set-2024", "ferry-osm-qigan-building", "ferry-position-audit-v13"]),
    ("mianhuadi-pier-v13-lod1", "ferry-mianhuadi-pier-v13-lod1.glb", 1, mianhuadi_terminal, "estimated", ["ferry-official-2024", "ferry-position-audit-v13"]),
    ("mianhuadi-pier-v13-lod2", "ferry-mianhuadi-pier-v13-lod2.glb", 2, mianhuadi_terminal, "estimated", ["ferry-official-2024", "ferry-position-audit-v13"]),
]
manifest_exports = []
for asset_id, filename, lod, factory, evidence_level, evidence_refs in terminal_exports:
    collection = factory("lod1" if lod == 1 else "lod2")
    export_collection(collection, filename)
    if lod == 2:
        render_review(collection, asset_id, [("shore", (-78, -52, 26), (-28, 0, 2.5)), ("river", (38, 48, 23), (-15, 0, 2.5)), ("boarding", (19, -19, 9), (-3, 0, 1.2)), ("entrance", (-82, 0, 8), (-55, 0, 4.2))], water_start=-0.65)
    manifest_exports.append((asset_id, filename, lod, "terminal", evidence_level, evidence_refs))
    bpy.data.collections.remove(collection)

for lod in (1, 2):
    collection = create_ferry(f"lod{lod}")
    filename = f"transport-zhongshan-106-v13-lod{lod}.glb"
    export_collection(collection, filename)
    if lod == 2:
        render_review(collection, "zhongshan-106-v13", [("broadside", (2, -40, 12), (0, 0, 2.5)), ("bow-oblique", (34, -28, 18), (0, 0, 2.5)), ("stern-oblique", (-31, 25, 16), (-1, 0, 2.5)), ("deck", (14, -14, 10), (-1, 0, 2.8))], water_start=-0.15)
    manifest_exports.append((f"zhongshan-106-v13-lod{lod}", filename, lod, "vessel", "triangulated", ["ferry-official-image-set-2024", "ferry-public-video-2024"]))
    bpy.data.collections.remove(collection)

update_manifest(manifest_exports)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "ferry-assets-v13.blend"))
print(f"Exported {len(manifest_exports)} V13 ferry assets and review renders to {OUTPUT_DIR}")
