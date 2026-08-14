import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { geodesicDistanceM, polylineLengthM, bd09ToWgs84, gcj02ToWgs84 } from "./lib/geodesy.mjs";
import { ferryCruiseAt, ferryServiceState, nextFerryDeparture } from "../app/jiangxinzhou/ferry.ts";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const root = process.cwd();
const dataDir = path.join(root, "data/jiangxinzhou-v2");
const modelDir = path.join(root, "public/models/jiangxinzhou-v2");
const readJson = async (file) => JSON.parse(await readFile(path.join(dataDir, file), "utf8"));
const [terminals, schedule, evidence, island, manifest] = await Promise.all([
  readJson("ferry-terminals.geojson"),
  readJson("ferry-schedule.json"),
  readJson("ferry-evidence.json"),
  readJson("island.geojson"),
  JSON.parse(await readFile(path.join(modelDir, "scene-manifest.json"), "utf8")),
]);

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const intersects = ((y > point[1]) !== (previousY > point[1]))
      && point[0] < (previousX - x) * (point[1] - y) / (previousY - y) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

assert.equal(terminals.type, "FeatureCollection");
assert.equal(terminals.crs.properties.name, "EPSG:4326");
assert.deepEqual(terminals.features.map((feature) => feature.id), ["qigan-pier", "mianhuadi-pier"]);
assert.equal(terminals.route.id, "ferry-qigan");
assert.equal(terminals.route.lengthStatus, "mapped");
assert.equal(terminals.route.osmWayId, 137693220);
assert.equal("officialLengthM" in terminals.route, false, "unsupported official route length must not return");
assert.ok(terminals.route.measuredGeometryLengthM >= 240 && terminals.route.measuredGeometryLengthM <= 300);
assert.ok(polylineLengthM(terminals.route.coordinates) > 0);
assert.ok(geodesicDistanceM(terminals.features[0].geometry.coordinates, terminals.features[1].geometry.coordinates) < 500);
const islandRing = island.features[0].geometry.coordinates[0];
for (const point of terminals.route.coordinates) assert.equal(pointInRing(point, islandRing), false, "ferry route must remain outside the island polygon");
for (const feature of terminals.features) {
  const [longitude, latitude] = feature.geometry.coordinates;
  assert.ok(longitude > 118 && longitude < 119 && latitude > 31 && latitude < 33, `${feature.id}: invalid Nanjing bounds`);
  assert.equal(feature.properties.sourceCrs, "EPSG:4326");
  assert.ok(feature.properties.modelLod1.endsWith(".glb"));
  assert.ok(feature.properties.modelLod2.endsWith(".glb"));
}

assert.deepEqual(schedule.publishedWindow, { start: "07:00", end: "18:00" });
assert.deepEqual(schedule.serviceBoundary, {
  firstDeparture: "07:00",
  lastMianhuadiDeparture: "18:00",
  finalReturnDeparture: "18:10",
  serviceEnd: "18:15",
});
assert.equal(schedule.crossingDurationMin, 5);
assert.equal(schedule.departures.qigan.length + schedule.departures.mianhuadi.length, 18);
assert.ok(schedule.departures.qigan.every((value) => /^\d{2}:\d{2}$/.test(value)));
assert.ok(schedule.departures.mianhuadi.every((value) => /^\d{2}:\d{2}$/.test(value)));
assert.equal(schedule.sourceStatus, "published");
const nanjingTime = (hours, minutes, seconds = 0) => Date.UTC(2026, 7, 13, hours - 8, minutes, seconds);
const atNine = nanjingTime(9, 0);
assert.equal(ferryServiceState(atNine), "running");
assert.equal(ferryCruiseAt(atNine).state, "crossing-to-qigan");
assert.equal(ferryCruiseAt(nanjingTime(6, 59)).state, "moored-mianhuadi");
assert.equal(ferryServiceState(nanjingTime(6, 59)), "not-running");
assert.equal(ferryCruiseAt(nanjingTime(7, 0)).state, "crossing-to-qigan");
assert.equal(ferryCruiseAt(nanjingTime(7, 5)).state, "moored-qigan");
assert.equal(ferryCruiseAt(nanjingTime(7, 10)).state, "crossing-to-mianhuadi");
assert.equal(ferryCruiseAt(nanjingTime(7, 15)).state, "moored-mianhuadi");
assert.equal(ferryCruiseAt(nanjingTime(9, 5)).state, "moored-qigan");
assert.equal(ferryCruiseAt(nanjingTime(9, 15)).state, "moored-mianhuadi");
assert.equal(ferryCruiseAt(nanjingTime(18, 5)).state, "moored-qigan");
assert.equal(ferryServiceState(nanjingTime(18, 5)), "running");
assert.equal(nextFerryDeparture(nanjingTime(18, 6))?.departure, "18:10");
assert.equal(ferryCruiseAt(nanjingTime(18, 10)).state, "crossing-to-mianhuadi");
assert.equal(ferryCruiseAt(nanjingTime(18, 15)).state, "moored-mianhuadi");
assert.equal(ferryServiceState(nanjingTime(18, 15)), "not-running");
assert.equal(ferryCruiseAt(nanjingTime(21, 0)).state, "moored-mianhuadi");
assert.equal(nextFerryDeparture(atNine, "qigan-pier")?.departure, "09:10");
assert.ok(evidence.sources.length >= 5);
assert.ok(evidence.sources.some((source) => source.id === "ferry-official-2024"));
assert.ok(evidence.sources.some((source) => source.id === "ferry-map-crosscheck-2026"));
assert.doesNotMatch(JSON.stringify(evidence), /0\.8\s*(?:km|公里)/i, "unsupported 0.8km claim must not return");

// Coordinate conversion smoke checks prevent accidental mixed CRS data in future updates.
const gcj = gcj02ToWgs84([118.7, 32.01]);
const bd = bd09ToWgs84([118.7, 32.01]);
assert.ok(gcj.every(Number.isFinite) && bd.every(Number.isFinite));
assert.ok(Math.abs(gcj[0] - 118.7) < 0.02 && Math.abs(bd[1] - 32.01) < 0.02);

const ferryAssets = manifest.ferryAssets ?? [];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
await MeshoptDecoder.ready;
for (const filename of [
  "ferry-qigan-pier-lod1.glb",
  "ferry-qigan-pier-lod2.glb",
  "ferry-mianhuadi-pier-lod1.glb",
  "ferry-mianhuadi-pier-lod2.glb",
  "transport-passenger-ferry.glb",
]) {
  const info = await stat(path.join(modelDir, filename));
  assert.ok(info.size > 1_000 && info.size < 2_000_000, `${filename}: unexpected asset size`);
  const entry = ferryAssets.find((asset) => path.basename(asset.url) === filename);
  assert.ok(entry, `${filename}: missing manifest entry`);
  assert.equal(info.size, entry.bytes, `${filename}: manifest byte count mismatch`);
  const document = await io.read(path.join(modelDir, filename));
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  assert.ok(scene, `${filename}: missing default scene`);
  const bounds = getBounds(scene);
  assert.ok(bounds.min.every(Number.isFinite) && bounds.max.every(Number.isFinite), `${filename}: invalid bounds`);
  assert.ok(document.getRoot().listMeshes().length > 0, `${filename}: no mesh data`);
}
assert.equal(ferryAssets.length, 5, "manifest should expose four terminal assets and one boat asset");
assert.ok(ferryAssets.some((asset) => asset.id === "zhongshan-106"));
assert.ok(ferryAssets.filter((asset) => asset.lod === 2).length === 2);
const ferryDocument = await io.read(path.join(modelDir, "transport-passenger-ferry.glb"));
const ferryNodes = new Set(ferryDocument.getRoot().listNodes().map((node) => node.getName()));
assert.ok(ferryNodes.has("Zhongshan106"), "boat GLB must retain Zhongshan106 semantic root");
for (const nodeName of ["Ferry hull", "Open passenger cabin", "Passenger deck rail", "Navigation light"]) {
  assert.ok(ferryNodes.has(nodeName), `boat GLB must retain ${nodeName}`);
}

const source = await readFile(path.join(root, "app/jiangxinzhou/ferry.ts"), "utf8");
assert.match(source, /ferryCruiseAt/);
assert.match(source, /nextFerryDeparture/);
assert.match(source, /Asia\/Shanghai/);

console.log(`Validated corrected ferry layer: 2 terminals, 18 reference departures, ${terminals.route.measuredGeometryLengthM}m OSM-mapped geometry, final return 18:10, 5 GLB assets.`);
