import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  if (item.properties.mainSpanM !== null) assert.ok(item.properties.mainSpanM > 0, `${item.id}: invalid span`);
  if (item.properties.totalRouteM !== null) assert.ok(item.properties.totalRouteM > 0, `${item.id}: invalid route length`);
  assert.ok(["bridge", "tunnel"].includes(item.properties.type), `${item.id}: invalid crossing type`);
}
const contextCoordinates = [...lands.features, ...waters.features, ...roads.features, ...crossings.features].flatMap((item) => allCoordinates(item.geometry));
const contextBounds = {
  minLng: Math.min(...contextCoordinates.map(([lng]) => lng)), maxLng: Math.max(...contextCoordinates.map(([lng]) => lng)),
  minLat: Math.min(...contextCoordinates.map(([, lat]) => lat)), maxLat: Math.max(...contextCoordinates.map(([, lat]) => lat)),
};
assert.ok(contextBounds.minLng < islandBounds.minLng && contextBounds.maxLng > islandBounds.maxLng, "context must extend east and west of island");
assert.ok(contextBounds.minLat < islandBounds.minLat && contextBounds.maxLat > islandBounds.maxLat, "context must extend north and south of island");

console.log(`Validated ${lands.features.length} surrounding lands, ${waters.features.length} water bodies, ${roads.features.length} context roads, ${crossings.features.length} crossings and ${evidence.sources.length} regional sources.`);
