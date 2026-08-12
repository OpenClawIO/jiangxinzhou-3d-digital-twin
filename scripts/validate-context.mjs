import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { polylineLengthM } from "./lib/geodesy.mjs";

const dir = path.join(process.cwd(), "data/jiangxinzhou-v2");
const read = async (file) => JSON.parse(await readFile(path.join(dir, file), "utf8"));
const [manifest, island, lands, waters, roads, crossings, evidence, runtime] = await Promise.all([
  read("manifest.json"), read("island.geojson"), read("context-land.geojson"), read("water-bodies.geojson"),
  read("context-roads.geojson"), read("crossings.geojson"), read("context-evidence.json"), read("runtime.json"),
]);

assert.equal(manifest.canonicalCrs, "EPSG:4326");
assert.equal(manifest.layers.crossings, "crossings.geojson");
assert.equal(runtime.context.crossings.features.length, crossings.features.length);
assert.ok(lands.features.length >= 4, "expected four surrounding land masses");
assert.ok(waters.features.some((item) => item.properties.kind === "yangtze-main-channel"), "Yangtze main channel missing");
assert.ok(waters.features.some((item) => item.properties.kind === "jiajiang"), "Jiajiang missing");
assert.ok(crossings.features.filter((item) => item.properties.type === "bridge").length >= 3, "expected major bridge crossings");
assert.ok(crossings.features.filter((item) => item.properties.type === "tunnel").length >= 3, "expected surrounding tunnels");
assert.ok(evidence.sources.length >= 4, "expected regional evidence ledger");

const ring = island.features[0].geometry.coordinates[0];
const islandBounds = {
  minLng: Math.min(...ring.map(([lng]) => lng)), maxLng: Math.max(...ring.map(([lng]) => lng)),
  minLat: Math.min(...ring.map(([, lat]) => lat)), maxLat: Math.max(...ring.map(([, lat]) => lat)),
};
const allCoordinates = (geometry) => geometry.type === "Point" ? [geometry.coordinates] : geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat();
const validateCoordinate = ([lng, lat], label) => {
  assert.ok(Number.isFinite(lng) && Number.isFinite(lat), `${label}: non-finite coordinate`);
  assert.ok(lng >= 118.61 && lng <= 118.76 && lat >= 31.95 && lat <= 32.10, `${label}: outside regional bbox`);
};
for (const layer of [lands, waters, roads, crossings]) for (const item of layer.features) {
  assert.ok(item.properties.name?.zh && item.properties.name?.en, `${item.id}: bilingual name missing`);
  assert.ok(["triangulated", "estimated", "planned"].includes(item.properties.confidence), `${item.id}: invalid confidence`);
  assert.equal(item.properties.status, "existing", `${item.id}: context default must not show planned features`);
  const coordinates = allCoordinates(item.geometry);
  assert.ok(coordinates.length >= 2, `${item.id}: geometry too short`);
  coordinates.forEach((coordinate) => validateCoordinate(coordinate, item.id));
}
for (const item of crossings.features) {
  if (item.properties.officialMainSpanM !== null) assert.ok(item.properties.officialMainSpanM > 0, `${item.id}: invalid span`);
  if (item.properties.officialProjectLengthM !== null) assert.ok(item.properties.officialProjectLengthM > 0, `${item.id}: invalid project length`);
  if (item.properties.officialStructureLengthM !== null) assert.ok(item.properties.officialStructureLengthM > 0, `${item.id}: invalid structure length`);
  assert.ok(Math.abs(item.properties.measuredGeometryLengthM - Math.round(polylineLengthM(item.geometry.coordinates))) <= 1, `${item.id}: stale geometry length`);
  assert.ok(["bridge", "tunnel"].includes(item.properties.type), `${item.id}: invalid crossing type`);
}
const yangtzeBridge = crossings.features.find((item) => item.id === "jiangxinzhou-yangtze-bridge");
assert.equal(yangtzeBridge.properties.officialProjectLengthM, 10_335, "10.335 km is the complete bridge/tunnel corridor");
assert.equal(yangtzeBridge.properties.officialMainSpanM, 600);
assert.ok(yangtzeBridge.properties.measuredGeometryLengthM >= 4_290 && yangtzeBridge.properties.measuredGeometryLengthM <= 4_300);
const nanjingEye = crossings.features.find((item) => item.id === "nanjing-eye-crossing");
assert.equal(nanjingEye.properties.officialMainSpanM, 240);
assert.equal(nanjingEye.properties.officialProjectLengthM, 827.5);
assert.equal(nanjingEye.properties.officialStructureLengthM, null, "827.5 m describes the complete project corridor, not one unsupported structure length");
assert.ok(Math.abs(nanjingEye.properties.measuredGeometryLengthM - 828) <= 2, "Nanjing Eye detailed centreline must match the official project corridor");
assert.equal(nanjingEye.geometry.coordinates.length, 9, "Nanjing Eye must use the detailed centreline rather than a three-point placeholder");
const jiajiangTunnel = crossings.features.find((item) => item.id === "jiajiang-tunnel");
assert.equal(jiajiangTunnel.properties.officialStructureLengthM, 1_800);
const contextCoordinates = [...lands.features, ...waters.features, ...roads.features, ...crossings.features].flatMap((item) => allCoordinates(item.geometry));
const contextBounds = {
  minLng: Math.min(...contextCoordinates.map(([lng]) => lng)), maxLng: Math.max(...contextCoordinates.map(([lng]) => lng)),
  minLat: Math.min(...contextCoordinates.map(([, lat]) => lat)), maxLat: Math.max(...contextCoordinates.map(([, lat]) => lat)),
};
assert.ok(contextBounds.minLng < islandBounds.minLng && contextBounds.maxLng > islandBounds.maxLng, "context must extend east and west of island");
assert.ok(contextBounds.minLat < islandBounds.minLat && contextBounds.maxLat > islandBounds.maxLat, "context must extend north and south of island");

console.log(`Validated ${lands.features.length} surrounding lands, ${waters.features.length} water bodies, ${roads.features.length} context roads, ${crossings.features.length} crossings and ${evidence.sources.length} regional sources.`);
