import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "data/jiangxinzhou-v2");
const read = async (name) => JSON.parse(await readFile(path.join(dir, name), "utf8"));
const [manifest, island, roads, buildings, landmarks, landscapes, evidence] = await Promise.all([
  read("manifest.json"), read("island.geojson"), read("roads.geojson"), read("buildings.geojson"),
  read("landmarks.geojson"), read("landscapes.geojson"), read("evidence.json"),
]);

assert.equal(manifest.canonicalCrs, "EPSG:4326");
assert.equal(manifest.units, "metres");
assert.equal(manifest.officialAreaKm2, 15.21);
assert.equal(manifest.officialEmbankmentKm, 22.5);
assert.ok(buildings.features.length >= 286, "expected all OSM building footprints");
assert.ok(roads.features.length >= 250, "expected detailed road and greenway segments");
assert.ok(landmarks.features.length >= 13, "expected verified and estimated landmarks");
assert.ok(evidence.sources.length >= 8, "expected a multi-source evidence ledger");

const islandRing = island.features[0].geometry.coordinates[0];
const [minLng, maxLng] = [Math.min(...islandRing.map(([lng]) => lng)), Math.max(...islandRing.map(([lng]) => lng))];
const [minLat, maxLat] = [Math.min(...islandRing.map(([, lat]) => lat)), Math.max(...islandRing.map(([, lat]) => lat))];
assert.ok(maxLng - minLng > 0.03 && maxLat - minLat > 0.07, "island bounds must retain real geographic scale");

function validateCoordinate([lng, lat], label) {
  assert.ok(Number.isFinite(lng) && Number.isFinite(lat), `${label}: coordinates must be finite`);
  assert.ok(lng >= 118.64 && lng <= 118.75, `${label}: longitude outside Jiangxinzhou region`);
  assert.ok(lat >= 31.96 && lat <= 32.10, `${label}: latitude outside Jiangxinzhou region`);
}
for (const feature of buildings.features) {
  assert.ok(feature.properties.heightM >= 3 && feature.properties.heightM <= 160, `${feature.id}: abnormal building height`);
  assert.ok(feature.properties.heightMethod, `${feature.id}: height method missing`);
  for (const coordinate of feature.geometry.coordinates[0]) validateCoordinate(coordinate, feature.id);
}
for (const feature of roads.features) {
  assert.ok(feature.properties.widthM > 0 && feature.properties.widthM <= 80, `${feature.id}: abnormal road width`);
  for (const coordinate of feature.geometry.coordinates) validateCoordinate(coordinate, feature.id);
}
for (const feature of landmarks.features) {
  validateCoordinate(feature.geometry.coordinates, feature.id);
  assert.ok(["triangulated", "estimated", "planned"].includes(feature.properties.confidence), `${feature.id}: invalid confidence`);
  assert.ok(feature.properties.sourceCrs, `${feature.id}: source CRS missing`);
  assert.ok(feature.properties.name.zh && feature.properties.name.en, `${feature.id}: bilingual name missing`);
}
for (const feature of landscapes.features) assert.ok(feature.properties.name.zh && feature.properties.name.en);

const requiredLandmarks = ["nanjing-eye", "xiaokenting-lighthouse", "rocho-cafe", "dolphin-center", "water-center", "e3-park", "chapel"];
for (const id of requiredLandmarks) {
  const landmark = landmarks.features.find((feature) => feature.id === id);
  assert.ok(landmark, `${id}: landmark missing`);
  assert.ok(landmark.properties.lod >= 2, `${id}: expected LOD2 designation`);
}

console.log(`Validated ${buildings.features.length} buildings, ${roads.features.length} roads, ${landmarks.features.length} landmarks, and ${evidence.sources.length} evidence sources.`);
