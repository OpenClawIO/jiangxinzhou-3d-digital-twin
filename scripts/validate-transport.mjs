import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { geodesicDistanceM, polylineLengthM } from "./lib/geodesy.mjs";

const root = process.cwd();
const dataDir = path.join(root, "data/jiangxinzhou-v2");
const read = async (name) => JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
const [lines, stops, hubs, roads, evidence] = await Promise.all([
  read("transit-lines.geojson"), read("transit-stops.geojson"), read("transport-hubs.geojson"), read("roads.geojson"), read("transport-evidence.json"),
]);

assert.ok(lines.features.length >= 12, "expected current transit, shuttle, ferry and cycle lines");
assert.ok(stops.features.length >= 40, "expected detailed Jiangxinzhou transport stops");
assert.ok(hubs.features.length >= 3, "expected key interchanges");
assert.ok(evidence.sources.length >= 6, "expected transport evidence ledger");

const stopIds = new Set(stops.features.map((item) => item.id));
assert.equal(stopIds.size, stops.features.length, "duplicate stop ids");
for (const stop of stops.features) {
  const [lng, lat] = stop.geometry.coordinates;
  assert.ok(lng >= 118.64 && lng <= 118.73 && lat >= 31.98 && lat <= 32.08, `${stop.id}: outside transport study area`);
  assert.ok(stop.properties.name.zh && stop.properties.name.en, `${stop.id}: bilingual name missing`);
  assert.ok(["triangulated", "estimated"].includes(stop.properties.confidence), `${stop.id}: invalid confidence`);
  assert.ok(Array.isArray(stop.properties.sourceCoordinate) && stop.properties.sourceCoordinate.length === 2, `${stop.id}: raw source coordinate missing`);
  assert.ok(Array.isArray(stop.properties.lineIds) && stop.properties.lineIds.length > 0, `${stop.id}: orphan transport stop`);
}

const lineIds = new Set(lines.features.map((item) => item.id));
assert.equal(lineIds.size, lines.features.length, "duplicate transport line ids");
for (const line of lines.features) {
  assert.ok(line.properties.name.zh && line.properties.name.en, `${line.id}: bilingual line name missing`);
  assert.ok(line.properties.color?.startsWith("#"), `${line.id}: line color missing`);
  assert.ok(line.properties.service?.zh && line.properties.service?.en, `${line.id}: bilingual service information missing`);
  assert.ok(line.properties.stopIds.length >= 2, `${line.id}: too few stops`);
  for (const stopId of line.properties.stopIds) assert.ok(stopIds.has(stopId), `${line.id}: unknown stop ${stopId}`);
  assert.ok(line.geometry.coordinates.length >= 2, `${line.id}: route geometry too short`);
  assert.ok(["verified-road-centerline", "road-network-derived", "partially-road-network-derived", "direct-water-connection", "schematic-stop-connection"].includes(line.properties.geometryKind), `${line.id}: geometry kind missing`);
  const measured = Math.round(polylineLengthM(line.geometry.coordinates));
  assert.ok(Math.abs(measured - line.properties.measuredGeometryLengthM) <= 1, `${line.id}: stale measured geometry length`);
}

const cycle = lines.features.find((line) => line.id === "cycle-loop");
assert.equal(cycle.properties.officialLengthM, 22_500);
assert.equal(cycle.properties.geometryKind, "verified-road-centerline");
assert.ok(cycle.properties.measuredGeometryLengthM >= 22_200 && cycle.properties.measuredGeometryLengthM <= 22_400, "cycle geometry must follow the complete 22.5 km embankment road");
assert.ok(Math.abs(cycle.properties.measuredGeometryLengthM - 17_531) > 4_000, "legacy stop-chord cycle geometry is still present");
for (const line of lines.features.filter((item) => !["cycle-loop", "ferry-qigan"].includes(item.id))) {
  assert.equal(line.properties.confidence, "estimated", `${line.id}: derived/schematic geometry cannot be marked triangulated`);
}
const ferry = lines.features.find((line) => line.id === "ferry-qigan");
const ferryStops = ferry.properties.stopIds.map((id) => stops.features.find((stop) => stop.id === id).geometry.coordinates);
assert.ok(Math.abs(polylineLengthM(ferry.geometry.coordinates) - geodesicDistanceM(ferryStops[0], ferryStops[1])) < 1, "ferry geometry must connect verified terminals");

for (const hub of hubs.features) for (const stopId of hub.properties.stopIds) assert.ok(stopIds.has(stopId), `${hub.id}: unknown stop ${stopId}`);
for (const road of roads.features) {
  assert.ok(road.properties.widthM >= 3 && road.properties.widthM <= 30, `${road.id}: width is not metre-scale`);
  assert.ok(road.properties.renderWidthPx > 0 && road.properties.renderWidthPx <= 6, `${road.id}: invalid render width`);
}

for (const filename of ["transport-city-bus.glb", "transport-autonomous-shuttle.glb", "transport-shuttle-bus.glb", "transport-metro-line10.glb", "transport-passenger-ferry.glb"]) {
  const info = await stat(path.join(root, "public/models/jiangxinzhou-v2", filename));
  assert.ok(info.size > 1_000 && info.size < 1_000_000, `${filename}: unexpected model size`);
}

console.log(`Validated ${lines.features.length} transport lines, ${stops.features.length} stops, ${hubs.features.length} hubs and 5 vehicle models.`);
