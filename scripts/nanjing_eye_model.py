"""Build photo-verified dual-LOD Nanjing Eye pedestrian bridge assets.

Blender 5.2+:
  blender -b --python scripts/nanjing_eye_model.py -- \
    --data-dir data/jiangxinzhou-v2 \
    --output-dir public/models/jiangxinzhou-v2 \
    --review-dir output/nanjing-eye-review

The runtime assets contain original geometry and procedural PBR materials only.
Reference photography is recorded in nanjing-eye-evidence.json and is never
embedded in the GLB files.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_LENGTH_M = 827.5
MAIN_BRIDGE_LENGTH_M = 531.5
APPROACH_LENGTH_M = 296.0
MAIN_SPAN_M = 240.0
TOWER_HEIGHT_M = 85.0
TOWER_SLANTED_LENGTH_M = 102.464
TOWER_INCLINATION_DEG = 35.0
MAX_DECK_WIDTH_M = 20.0
STAY_CABLE_COUNT = 36
SPAN_ARRANGEMENT_M = [45.0, 42.0, 58.0, 240.0, 58.0, 42.0, 46.5]
MAIN_BRIDGE_START_M = APPROACH_LENGTH_M / 2
TOWER_STATIONS_M = (
    MAIN_BRIDGE_START_M + sum(SPAN_ARRANGEMENT_M[:3]),
    MAIN_BRIDGE_START_M + sum(SPAN_ARRANGEMENT_M[:4]),
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="data/jiangxinzhou-v2")
    parser.add_argument("--output-dir", default="public/models/jiangxinzhou-v2")
    parser.add_argument("--review-dir", default="output/nanjing-eye-review")
    parser.add_argument("--skip-renders", action="store_true")
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


ARGS = arguments()
ROOT = Path.cwd()
DATA_DIR = (ROOT / ARGS.data_dir).resolve()
OUTPUT_DIR = (ROOT / ARGS.output_dir).resolve()
REVIEW_DIR = (ROOT / ARGS.review_dir).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
REVIEW_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


MANIFEST = load_json(DATA_DIR / "manifest.json")
ROADS = load_json(DATA_DIR / "roads.geojson")
EVIDENCE = load_json(DATA_DIR / "nanjing-eye-evidence.json")
ORIGIN_LNG, ORIGIN_LAT = MANIFEST["origin"]
LON_METERS = MANIFEST["projection"]["metersPerDegreeLongitude"]
LAT_METERS = MANIFEST["projection"]["metersPerDegreeLatitude"]


def geo_to_xy(coordinate):
    longitude, latitude = coordinate
    return Vector(((longitude - ORIGIN_LNG) * LON_METERS, (latitude - ORIGIN_LAT) * LAT_METERS, 0.0))


def road_feature(feature_id):
    return next(feature for feature in ROADS["features"] if feature["id"] == feature_id)


centerline_coordinates = road_feature("road-11-0")["geometry"]["coordinates"][:]
branch_coordinates = road_feature("road-11-2")["geometry"]["coordinates"]
if centerline_coordinates[-1] == branch_coordinates[0]:
    centerline_coordinates.extend(branch_coordinates[1:])
else:
    centerline_coordinates.extend(branch_coordinates)
CONTROL_POINTS = [geo_to_xy(coordinate) for coordinate in centerline_coordinates]


def cumulative_lengths(points):
    result = [0.0]
    for index in range(len(points) - 1):
        result.append(result[-1] + (points[index + 1] - points[index]).length)
    return result


CONTROL_LENGTHS = cumulative_lengths(CONTROL_POINTS)
GEOMETRY_LENGTH_M = CONTROL_LENGTHS[-1]


def point_at(station_m):
    station_m = max(0.0, min(PROJECT_LENGTH_M, station_m))
    geometry_station = station_m / PROJECT_LENGTH_M * GEOMETRY_LENGTH_M
    for index in range(len(CONTROL_POINTS) - 1):
        if geometry_station <= CONTROL_LENGTHS[index + 1]:
            segment_length = max(0.001, CONTROL_LENGTHS[index + 1] - CONTROL_LENGTHS[index])
            amount = (geometry_station - CONTROL_LENGTHS[index]) / segment_length
            return CONTROL_POINTS[index].lerp(CONTROL_POINTS[index + 1], amount)
    return CONTROL_POINTS[-1].copy()


def tangent_at(station_m):
    before = point_at(max(0.0, station_m - 5.0))
    after = point_at(min(PROJECT_LENGTH_M, station_m + 5.0))
    direction = after - before
    direction.z = 0.0
    return direction.normalized()


def lateral_at(station_m):
    tangent = tangent_at(station_m)
    return Vector((-tangent.y, tangent.x, 0.0))


def deck_elevation(station_m):
    rise = min(9.45, station_m * 0.035, (PROJECT_LENGTH_M - station_m) * 0.035)
    camber = 0.0
    if TOWER_STATIONS_M[0] <= station_m <= TOWER_STATIONS_M[1]:
        main_amount = (station_m - TOWER_STATIONS_M[0]) / MAIN_SPAN_M
        camber = math.sin(main_amount * math.pi) * 1.15
    return 7.0 + rise + camber


def deck_width(station_m):
    distance_to_center = abs(station_m - PROJECT_LENGTH_M / 2)
    if distance_to_center <= MAIN_SPAN_M / 2:
        return MAX_DECK_WIDTH_M - 2.0 * distance_to_center / (MAIN_SPAN_M / 2)
    if MAIN_BRIDGE_START_M <= station_m <= MAIN_BRIDGE_START_M + MAIN_BRIDGE_LENGTH_M:
        return 18.0 - min(5.0, (distance_to_center - MAIN_SPAN_M / 2) * 0.035)
    return 12.0


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    default = bpy.data.collections.get("Collection")
    if default:
        default.name = "NanjingEye"
    else:
        default = bpy.data.collections.new("NanjingEye")
        bpy.context.scene.collection.children.link(default)
    return default


COLLECTION = clean_scene()


def material(name, color, roughness=0.7, metallic=0.0, emission=None):
    value = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission and "Emission Color" in shader.inputs:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.0
    return value


MATERIALS = {
    "tower": material("Nanjing Eye White Painted Steel", (0.84, 0.87, 0.85), 0.34, 0.42),
    "deck": material("Nanjing Eye Steel Box Girder", (0.45, 0.51, 0.53), 0.45, 0.38),
    "surface": material("Nanjing Eye Deck Surface", (0.49, 0.51, 0.49), 0.92, 0.0),
    "cycle": material("Nanjing Eye Green Walking Lane", (0.20, 0.36, 0.25), 0.9, 0.0),
    "concrete": material("Nanjing Eye Pale Concrete", (0.64, 0.66, 0.62), 0.86, 0.0),
    "cable": material("Nanjing Eye Stay Cables", (0.79, 0.82, 0.80), 0.30, 0.65),
    "rail": material("Nanjing Eye White Railings", (0.90, 0.91, 0.87), 0.42, 0.35),
    "dark": material("Nanjing Eye Dark Fixtures", (0.09, 0.12, 0.13), 0.36, 0.72),
    "tower_light": material("Nanjing Eye Tower Light", (0.94, 0.92, 0.82), 0.28, 0.1, (1.0, 0.91, 0.72)),
    "deck_light": material("Nanjing Eye Deck Light", (0.94, 0.87, 0.68), 0.25, 0.1, (1.0, 0.78, 0.48)),
    "edge_light": material("Nanjing Eye Edge Light", (0.76, 0.87, 0.93), 0.28, 0.1, (0.72, 0.87, 1.0)),
}


def link_object(obj, target_collection=COLLECTION):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target_collection.objects.link(obj)
    return obj


def mesh_object(name, vertices, faces, mesh_material, smooth=False):
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mesh_material)
    mesh.update()
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    COLLECTION.objects.link(obj)
    return obj


def cylinder_between(name, start, end, radius, mesh_material, vertices=10):
    start_v, end_v = Vector(start), Vector(end)
    direction = end_v - start_v
    if direction.length < 0.001:
        return None
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(start_v + end_v) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(mesh_material)
    link_object(obj)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def oriented_box(name, location, size, mesh_material, angle=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0.0, 0.0, angle))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mesh_material)
    link_object(obj)
    if bevel:
        modifier = obj.modifiers.new("Edge softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def tube_mesh(name, points, radii, mesh_material, sides=8, fixed_axis=None):
    if len(points) < 2:
        return None
    vertices = []
    faces = []
    for index, point in enumerate(points):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        tangent = (following - previous).normalized()
        axis_one = fixed_axis.copy() if fixed_axis is not None else Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(axis_one)) > 0.92:
            axis_one = Vector((1.0, 0.0, 0.0))
        axis_two = tangent.cross(axis_one).normalized()
        axis_one = axis_two.cross(tangent).normalized()
        radius = radii[index] if isinstance(radii, list) else radii
        for side in range(sides):
            angle = side / sides * math.tau
            vertices.append(tuple(point + axis_one * math.cos(angle) * radius + axis_two * math.sin(angle) * radius))
    for row in range(len(points) - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            current = row * sides + side
            following = (row + 1) * sides + side
            faces.append((current, current - side + next_side, following - side + next_side, following))
    faces.append(tuple(reversed(range(sides))))
    last = (len(points) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return mesh_object(name, vertices, faces, mesh_material, smooth=True)


def tower_arch_mesh(name, station_m, outward_sign, detail, mesh_material):
    center = point_at(station_m)
    tangent = tangent_at(station_m)
    lateral = lateral_at(station_m)
    deck_z = deck_elevation(station_m)
    segments = 72 if detail == 1 else 224
    sides = 8 if detail == 1 else 12
    points = []
    section_depths = []
    section_widths = []
    for index in range(segments + 1):
        theta = index / segments * math.pi
        height = math.sin(theta) * TOWER_HEIGHT_M
        lateral_offset = math.cos(theta) * 18.2
        longitudinal_offset = outward_sign * height * math.tan(math.radians(TOWER_INCLINATION_DEG))
        points.append(center + tangent * longitudinal_offset + lateral * lateral_offset + Vector((0.0, 0.0, deck_z + height)))
        normalized_height = height / TOWER_HEIGHT_M
        if normalized_height < 0.5:
            width = 9.766 + (4.6 - 9.766) * normalized_height / 0.5
        else:
            width = 4.6 + (6.2 - 4.6) * (normalized_height - 0.5) / 0.5
        section_widths.append(width / 2)
        section_depths.append(2.5)

    tilted_vertical = (Vector((0.0, 0.0, 1.0)) + tangent * outward_sign * math.tan(math.radians(TOWER_INCLINATION_DEG))).normalized()
    plane_normal = lateral.cross(tilted_vertical).normalized()
    vertices = []
    faces = []
    for index, point in enumerate(points):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        path_tangent = (following - previous).normalized()
        radial = path_tangent.cross(plane_normal).normalized()
        for side in range(sides):
            angle = side / sides * math.tau
            vertices.append(tuple(point + plane_normal * math.cos(angle) * section_depths[index] + radial * math.sin(angle) * section_widths[index]))
    for row in range(len(points) - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            current = row * sides + side
            following = (row + 1) * sides + side
            faces.append((current, row * sides + next_side, (row + 1) * sides + next_side, following))
    faces.append(tuple(reversed(range(sides))))
    last = (len(points) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    obj = mesh_object(name, vertices, faces, mesh_material, smooth=True)
    return obj, points, plane_normal


def tower_anchor(station_m, outward_sign, cable_side, height):
    center = point_at(station_m)
    tangent = tangent_at(station_m)
    lateral = lateral_at(station_m)
    deck_z = deck_elevation(station_m)
    lateral_offset = cable_side * 18.2 * math.sqrt(max(0.0, 1.0 - (height / TOWER_HEIGHT_M) ** 2))
    longitudinal_offset = outward_sign * height * math.tan(math.radians(TOWER_INCLINATION_DEG))
    return center + tangent * longitudinal_offset + lateral * lateral_offset + Vector((0.0, 0.0, deck_z + height))


def station_samples(step):
    count = math.ceil(PROJECT_LENGTH_M / step)
    return [min(PROJECT_LENGTH_M, index * PROJECT_LENGTH_M / count) for index in range(count + 1)]


def deck_mesh(detail):
    stations = station_samples(7.5 if detail == 1 else 2.5)
    vertices = []
    faces = []
    for station in stations:
        center = point_at(station)
        lateral = lateral_at(station)
        top = deck_elevation(station)
        width = deck_width(station)
        cross_section = [
            center + lateral * (width / 2) + Vector((0.0, 0.0, top)),
            center + Vector((0.0, 0.0, top + 0.16)),
            center - lateral * (width / 2) + Vector((0.0, 0.0, top)),
            center - lateral * (width / 2 + 0.45) + Vector((0.0, 0.0, top - 2.8)),
            center + Vector((0.0, 0.0, top - 3.15)),
            center + lateral * (width / 2 + 0.45) + Vector((0.0, 0.0, top - 2.8)),
        ]
        vertices.extend(tuple(point) for point in cross_section)
    sides = 6
    for row in range(len(stations) - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            current = row * sides + side
            faces.append((current, row * sides + next_side, (row + 1) * sides + next_side, (row + 1) * sides + side))
    faces.append(tuple(reversed(range(sides))))
    last = (len(stations) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return mesh_object("Nanjing Eye variable-width steel box deck", vertices, faces, MATERIALS["deck"], smooth=True)


def surface_ribbon(name, stations, offset, width, z_offset, mesh_material):
    vertices = []
    faces = []
    for station in stations:
        center = point_at(station)
        lateral = lateral_at(station)
        z = deck_elevation(station) + z_offset
        vertices.append(tuple(center + lateral * (offset + width / 2) + Vector((0.0, 0.0, z))))
        vertices.append(tuple(center + lateral * (offset - width / 2) + Vector((0.0, 0.0, z))))
    for index in range(len(stations) - 1):
        start = index * 2
        faces.append((start, start + 1, start + 3, start + 2))
    return mesh_object(name, vertices, faces, mesh_material)


def build_deck_details(detail):
    stations = station_samples(8.0 if detail == 1 else 3.5)
    surface_ribbon("Nanjing Eye pedestrian surface", stations, 0.0, 10.5, 0.04, MATERIALS["surface"])
    if detail == 2:
        surface_ribbon("Nanjing Eye green walking lane", stations, -4.1, 2.3, 0.075, MATERIALS["cycle"])

    edge_points = {side: [] for side in (-1, 1)}
    for side in (-1, 1):
        for station in stations:
            center = point_at(station)
            lateral = lateral_at(station)
            width = deck_width(station)
            edge_points[side].append(center + lateral * side * (width / 2 - 0.18) + Vector((0.0, 0.0, deck_elevation(station) + 0.28)))
        tube_mesh(f"Nanjing Eye edge fairing {side}", edge_points[side], 0.22, MATERIALS["tower"], sides=6 if detail == 1 else 10)
        tube_mesh(f"Nanjing Eye edge light {side}", [point + Vector((0.0, 0.0, 0.12)) for point in edge_points[side]], 0.075 if detail == 1 else 0.095, MATERIALS["edge_light"], sides=5 if detail == 1 else 8)

    if detail == 1:
        return

    rail_stations = station_samples(4.0)
    for side in (-1, 1):
        for height in (0.48, 0.92, 1.36):
            rail_points = []
            for station in rail_stations:
                center = point_at(station)
                lateral = lateral_at(station)
                width = deck_width(station)
                rail_points.append(center + lateral * side * (width / 2 - 0.12) + Vector((0.0, 0.0, deck_elevation(station) + height)))
            tube_mesh(f"Nanjing Eye railing {side} {height}", rail_points, 0.07, MATERIALS["rail"], sides=8)
        for station in rail_stations[::2]:
            center = point_at(station)
            lateral = lateral_at(station)
            width = deck_width(station)
            bottom = center + lateral * side * (width / 2 - 0.12) + Vector((0.0, 0.0, deck_elevation(station) + 0.12))
            cylinder_between(f"Nanjing Eye railing post {side} {station:.1f}", bottom, bottom + Vector((0.0, 0.0, 1.42)), 0.075, MATERIALS["rail"], 8)

    for index, station in enumerate(station_samples(28.0)[1:-1]):
        side = -1 if index % 2 == 0 else 1
        center = point_at(station)
        lateral = lateral_at(station)
        tangent = tangent_at(station)
        width = deck_width(station)
        base = center + lateral * side * (width / 2 - 1.0) + Vector((0.0, 0.0, deck_elevation(station) + 0.1))
        top = base + Vector((0.0, 0.0, 4.6)) + tangent * 0.7
        cylinder_between(f"Nanjing Eye lamp post {index}", base, top, 0.11, MATERIALS["dark"], 10)
        oriented_box(f"Nanjing Eye lamp {index}", top + tangent * 0.45, (1.0, 0.32, 0.20), MATERIALS["deck_light"], angle=math.atan2(tangent.y, tangent.x), bevel=0.08)


def build_piers(detail):
    main_boundaries = [MAIN_BRIDGE_START_M]
    for span in SPAN_ARRANGEMENT_M:
        main_boundaries.append(main_boundaries[-1] + span)
    approach_stations = [32.0, 70.0, 108.0, PROJECT_LENGTH_M - 108.0, PROJECT_LENGTH_M - 70.0, PROJECT_LENGTH_M - 32.0]
    stations = sorted(set(round(value, 3) for value in main_boundaries + approach_stations))
    for index, station in enumerate(stations):
        if abs(station - TOWER_STATIONS_M[0]) < 0.1 or abs(station - TOWER_STATIONS_M[1]) < 0.1:
            continue
        center = point_at(station)
        tangent = tangent_at(station)
        deck_z = deck_elevation(station)
        pier_height = max(3.0, deck_z - 1.2)
        oriented_box(f"Nanjing Eye pier {index}", (center.x, center.y, pier_height / 2), (3.8 if detail == 1 else 4.6, min(14.0, deck_width(station) - 2.0), pier_height), MATERIALS["concrete"], angle=math.atan2(tangent.y, tangent.x), bevel=0.35 if detail == 2 else 0.15)
        oriented_box(f"Nanjing Eye pier cap {index}", (center.x, center.y, deck_z - 1.8), (5.8, deck_width(station) - 0.6, 1.3), MATERIALS["concrete"], angle=math.atan2(tangent.y, tangent.x), bevel=0.22)


def build_towers_and_cables(detail):
    cable_count = 0
    for tower_index, station in enumerate(TOWER_STATIONS_M):
        outward_sign = -1 if tower_index == 0 else 1
        tower, arch_points, plane_normal = tower_arch_mesh(f"Nanjing Eye elliptical arch pylon {tower_index + 1}", station, outward_sign, detail, MATERIALS["tower"])
        tangent = tangent_at(station)
        lateral = lateral_at(station)
        deck_z = deck_elevation(station)
        for side in (-1, 1):
            base = point_at(station) + lateral * side * 18.2
            oriented_box(f"Nanjing Eye tower transition {tower_index + 1} {side}", (base.x, base.y, deck_z - 1.6), (7.2, 10.4, 6.0), MATERIALS["concrete"], angle=math.atan2(tangent.y, tangent.x), bevel=0.7 if detail == 2 else 0.3)
        light_stride = 4 if detail == 1 else 2
        for face_sign in (-1, 1):
            light_points = [point + plane_normal * 2.65 * face_sign for point in arch_points[::light_stride]]
            final_light_point = arch_points[-1] + plane_normal * 2.65 * face_sign
            if (light_points[-1] - final_light_point).length > 0.001:
                light_points.append(final_light_point)
            tube_mesh(f"Nanjing Eye tower light {tower_index + 1} {face_sign}", light_points, 0.11 if detail == 1 else 0.14, MATERIALS["tower_light"], sides=5 if detail == 1 else 8)

        main_sign = 1 if tower_index == 0 else -1
        if detail == 1:
            cable_offsets = [main_sign * value for value in (58.0, 112.0)] + [-main_sign * value for value in (52.0, 104.0)]
        else:
            cable_offsets = [main_sign * value for value in (36.0, 72.0, 108.0, 146.0, 184.0)] + [-main_sign * value for value in (34.0, 68.0, 102.0, 134.0)]
        for cable_side in (-1, 1):
            for cable_index, offset in enumerate(cable_offsets):
                anchor_station = max(3.0, min(PROJECT_LENGTH_M - 3.0, station + offset))
                height = 47.0 + min(30.0, abs(offset) / 184.0 * 30.0)
                upper = tower_anchor(station, outward_sign, cable_side, height)
                deck_center = point_at(anchor_station)
                deck_lateral = lateral_at(anchor_station)
                lower = deck_center + deck_lateral * cable_side * (deck_width(anchor_station) / 2 - 1.15) + Vector((0.0, 0.0, deck_elevation(anchor_station) + 0.65))
                cylinder_between(f"Nanjing Eye stay {tower_index + 1} {cable_side} {cable_index + 1}", upper, lower, 0.13 if detail == 1 else 0.16, MATERIALS["cable"], 8 if detail == 1 else 12)
                cable_count += 1
    return cable_count


def build_entries(detail):
    if detail == 1:
        return
    for endpoint_index, station in enumerate((5.0, PROJECT_LENGTH_M - 5.0)):
        center = point_at(station)
        tangent = tangent_at(station)
        lateral = lateral_at(station)
        deck_z = deck_elevation(station)
        sign = 1 if endpoint_index == 0 else -1
        wall_center = center + tangent * sign * 3.0 + lateral * 8.0 + Vector((0.0, 0.0, deck_z + 2.5))
        oriented_box(f"Nanjing Eye entry marker {endpoint_index + 1}", wall_center, (0.8, 9.0, 5.0), MATERIALS["concrete"], angle=math.atan2(tangent.y, tangent.x), bevel=0.35)
        for bar in range(3):
            start = wall_center + Vector((0.0, 0.0, -1.2 + bar * 1.2)) - lateral * 2.5
            end = wall_center + Vector((0.0, 0.0, -1.2 + bar * 1.2)) + lateral * 2.5
            cylinder_between(f"Nanjing Eye entry relief {endpoint_index + 1} {bar}", start, end, 0.11, MATERIALS["dark"], 8)


def convert_and_apply(objects):
    for obj in list(objects):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if obj.type != "MESH":
            bpy.ops.object.convert(target="MESH")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for modifier in list(obj.modifiers):
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)


def merge_by_material():
    objects = [obj for obj in COLLECTION.all_objects if obj.type == "MESH"]
    convert_and_apply(objects)
    grouped = {}
    for obj in [obj for obj in COLLECTION.all_objects if obj.type == "MESH"]:
        key = obj.data.materials[0].name if obj.data.materials else "No Material"
        grouped.setdefault(key, []).append(obj)
    merged = []
    for key, group in grouped.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        group[0].name = key
        merged.append(group[0])
    return merged


def triangle_count(objects):
    return sum(sum(max(1, len(face.vertices) - 2) for face in obj.data.polygons) for obj in objects if obj.type == "MESH")


def object_bounds(objects):
    points = []
    for obj in objects:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return minimum, maximum


def three_bounds(minimum, maximum):
    return {
        "min": [round(minimum.x, 3), round(minimum.z, 3), round(-maximum.y, 3)],
        "max": [round(maximum.x, 3), round(maximum.z, 3), round(-minimum.y, 3)],
    }


def export_glb(objects, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    filepath = OUTPUT_DIR / filename
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    return filepath


def build_lod(detail):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    deck_mesh(detail)
    build_deck_details(detail)
    build_piers(detail)
    cable_count = build_towers_and_cables(detail)
    build_entries(detail)
    objects = merge_by_material()
    triangles = triangle_count(objects)
    bounds_min, bounds_max = object_bounds(objects)
    filename = f"nanjing-eye-lod{detail}.glb"
    filepath = export_glb(objects, filename)
    return objects, {
        "id": f"NanjingEyeLOD{detail}",
        "landmarkId": 2,
        "lod": detail,
        "url": f"/models/jiangxinzhou-v2/{filename}",
        "bytes": filepath.stat().st_size,
        "triangles": triangles,
        "drawCalls": len(objects),
        "cableCount": cable_count,
        "bounds": three_bounds(bounds_min, bounds_max),
        "lightingMaterials": ["Nanjing Eye Tower Light", "Nanjing Eye Deck Light", "Nanjing Eye Edge Light"],
    }


def set_light_strength(amount):
    for name in ("Nanjing Eye Tower Light", "Nanjing Eye Deck Light", "Nanjing Eye Edge Light"):
        shader = bpy.data.materials[name].node_tree.nodes.get("Principled BSDF")
        shader.inputs["Emission Strength"].default_value = amount


def look_at(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_reviews(objects):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    world_background = scene.world.node_tree.nodes.get("Background")

    bridge_center = point_at(PROJECT_LENGTH_M / 2)
    bridge_tangent = tangent_at(PROJECT_LENGTH_M / 2)
    bridge_lateral = lateral_at(PROJECT_LENGTH_M / 2)
    target = bridge_center + Vector((0.0, 0.0, 38.0))

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Nanjing Eye review camera"
    camera.data.lens = 48
    camera.data.clip_end = 5000
    scene.camera = camera

    bpy.ops.object.light_add(type="SUN", location=bridge_center + Vector((0.0, 0.0, 500.0)))
    sun = bpy.context.object
    sun.data.energy = 2.6
    sun.rotation_euler = (math.radians(28), math.radians(-24), math.radians(-32))
    bpy.ops.object.light_add(type="AREA", location=bridge_center - bridge_lateral * 180 + Vector((0.0, 0.0, 260.0)))
    area = bpy.context.object
    area.data.energy = 1100
    area.data.shape = "DISK"
    area.data.size = 240
    look_at(area, target)

    bpy.ops.mesh.primitive_plane_add(size=2400, location=(bridge_center.x, bridge_center.y, -0.3))
    water = bpy.context.object
    water.name = "Review water"
    water.data.materials.append(material("Review Water", (0.11, 0.32, 0.41), 0.24, 0.12))

    views = [
        ("01-side", bridge_center - bridge_lateral * 720 + Vector((0.0, 0.0, 86.0)), target, 58),
        ("02-plan", bridge_center + Vector((0.0, 0.0, 1080.0)), bridge_center, 52),
        ("03-deck", point_at(138.0) + Vector((0.0, 0.0, deck_elevation(138.0) + 2.1)), point_at(510.0) + Vector((0.0, 0.0, deck_elevation(510.0) + 34.0)), 30),
        ("04-oblique-day", bridge_center - bridge_lateral * 460 - bridge_tangent * 260 + Vector((0.0, 0.0, 235.0)), target, 52),
    ]
    world_background.inputs["Color"].default_value = (0.45, 0.70, 0.79, 1.0)
    world_background.inputs["Strength"].default_value = 0.48
    set_light_strength(0.0)
    for name, location, view_target, lens in views:
        camera.location = location
        camera.data.lens = lens
        look_at(camera, view_target)
        scene.render.filepath = str(REVIEW_DIR / f"{name}.png")
        bpy.ops.render.render(write_still=True)

    world_background.inputs["Color"].default_value = (0.006, 0.015, 0.035, 1.0)
    world_background.inputs["Strength"].default_value = 0.12
    sun.data.energy = 0.08
    area.data.energy = 190
    area.data.color = (0.32, 0.45, 0.75)
    set_light_strength(8.0)
    camera.location = bridge_center - bridge_lateral * 420 - bridge_tangent * 220 + Vector((0.0, 0.0, 190.0))
    camera.data.lens = 50
    look_at(camera, target)
    scene.render.filepath = str(REVIEW_DIR / "05-oblique-night.png")
    bpy.ops.render.render(write_still=True)
    set_light_strength(0.0)


lod1_objects, lod1_report = build_lod(1)
lod2_objects, lod2_report = build_lod(2)

if not ARGS.skip_renders:
    render_reviews(lod2_objects)
    bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW_DIR / "nanjing-eye-review.blend"))

report = {
    "version": "2026-08-12",
    "coordinateSystem": {"source": "EPSG:4326", "scene": "local metres", "north": "+Y in Blender / -Z in Three.js"},
    "specification": EVIDENCE["specification"],
    "centerline": {"sourceRoadIds": ["road-11-0", "road-11-2"], "coordinateCount": len(centerline_coordinates), "geometryLengthM": round(GEOMETRY_LENGTH_M, 3)},
    "towerStationsM": [round(value, 3) for value in TOWER_STATIONS_M],
    "lods": [lod1_report, lod2_report],
    "reviewRenders": [] if ARGS.skip_renders else [
        "output/nanjing-eye-review/01-side.png",
        "output/nanjing-eye-review/02-plan.png",
        "output/nanjing-eye-review/03-deck.png",
        "output/nanjing-eye-review/04-oblique-day.png",
        "output/nanjing-eye-review/05-oblique-night.png",
    ],
}
with open(OUTPUT_DIR / "nanjing-eye-model-report.json", "w", encoding="utf-8") as handle:
    json.dump(report, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

scene_manifest_path = OUTPUT_DIR / "scene-manifest.json"
scene_manifest = load_json(scene_manifest_path) if scene_manifest_path.exists() else {
    "version": MANIFEST["version"], "origin": MANIFEST["origin"], "units": "metres", "north": "+Y", "tiles": []
}
scene_manifest["landmarkTiles"] = [tile for tile in scene_manifest.get("landmarkTiles", []) if tile.get("landmarkId") != 2]
scene_manifest["landmarkTiles"].extend([lod1_report, lod2_report])
with open(scene_manifest_path, "w", encoding="utf-8") as handle:
    json.dump(scene_manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

print(json.dumps({"lod1": lod1_report, "lod2": lod2_report}, ensure_ascii=False, indent=2))
print(f"Nanjing Eye assets exported to {OUTPUT_DIR}")
