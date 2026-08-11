import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { metersPerDegreeAt, polygonAreaM2, polylineLengthM } from "./lib/geodesy.mjs";

const root = process.cwd();
const dir = path.join(root, "data/jiangxinzhou-v2");
const read = async (name) => JSON.parse(await readFile(path.join(dir, name), "utf8"));
const [manifest, island, roads, buildings, landmarks, landscapes, evidence] = await Promise.all([
  read("manifest.json"), read("island.geojson"), read("roads.geojson"), read("buildings.geojson"),
  read("landmarks.geojson"), read("landscapes.geojson"), read("evidence.json"),
]);

assert.equal(manifest.canonicalCrs, "EPSG:4326");
assert.equal(manifest.units, "metres");
assert.equal(manifest.projection.method, "WGS84-local-equirectangular");
assert.equal(manifest.officialAreaKm2, 15.21);
assert.equal(manifest.officialEmbankmentKm, 22.5);
assert.ok(buildings.features.length >= 286, "expected all OSM building footprints");
assert.ok(roads.features.length >= 250, "expected detailed road and greenway segments");
assert.ok(landmarks.features.length >= 13, "expected verified and estimated landmarks");
assert.ok(evidence.sources.length >= 8, "expected a multi-source evidence ledger");

const islandRing = island.features[0].geometry.coordinates[0];
const projectionScale = metersPerDegreeAt(manifest.origin[1]);
assert.ok(Math.abs(manifest.projection.metersPerDegreeLongitude - projectionScale.longitude) < 0.001, "longitude scale must use WGS84 ellipsoid");
assert.ok(Math.abs(manifest.projection.metersPerDegreeLatitude - projectionScale.latitude) < 0.001, "latitude scale must use WGS84 ellipsoid");
const measuredAreaKm2 = polygonAreaM2(islandRing) / 1_000_000;
const measuredBoundaryKm = polylineLengthM(islandRing) / 1_000;
assert.ok(Math.abs(measuredAreaKm2 - 15.0795761803) < 0.002, "island area drifted from Wolfram audit baseline");
assert.ok(Math.abs(measuredBoundaryKm - 25.0116224637) < 0.002, "island boundary drifted from Wolfram audit baseline");
assert.ok(Math.abs(manifest.geometryMetrics.islandAreaKm2 - measuredAreaKm2) < 0.00001, "manifest island area is stale");
assert.ok(Math.abs(manifest.geometryMetrics.islandBoundaryKm - measuredBoundaryKm) < 0.00001, "manifest island boundary is stale");
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
  assert.ok(feature.properties.widthM >= 3 && feature.properties.widthM <= 30, `${feature.id}: abnormal metre-scale road width`);
  for (const coordinate of feature.geometry.coordinates) validateCoordinate(coordinate, feature.id);
}
for (const feature of landmarks.features) {
  validateCoordinate(feature.geometry.coordinates, feature.id);
  assert.ok(["triangulated", "estimated", "planned"].includes(feature.properties.confidence), `${feature.id}: invalid confidence`);
  assert.ok(feature.properties.sourceCrs, `${feature.id}: source CRS missing`);
  assert.ok(feature.properties.name.zh && feature.properties.name.en, `${feature.id}: bilingual name missing`);
}
const chapel = landmarks.features.find((feature) => feature.id === "chapel");
assert.deepEqual(chapel.properties.sourceCoordinate, chapel.geometry.coordinates, "chapel source coordinate must match its OSM geometry");
for (const id of ["xiaokenting-lighthouse", "seasonal-garden"]) {
  const landmark = landmarks.features.find((feature) => feature.id === id);
  const [longitude, latitude] = landmark.geometry.coordinates;
  assert.ok(longitude >= minLng && longitude <= maxLng && latitude >= minLat && latitude <= maxLat, `${id}: corrected estimate outside island bounds`);
}
for (const feature of landscapes.features) assert.ok(feature.properties.name.zh && feature.properties.name.en);

const requiredLandmarks = ["nanjing-eye", "xiaokenting-lighthouse", "rocho-cafe", "dolphin-center", "water-center", "e3-park", "chapel"];
for (const id of requiredLandmarks) {
  const landmark = landmarks.features.find((feature) => feature.id === id);
  assert.ok(landmark, `${id}: landmark missing`);
  assert.ok(landmark.properties.lod >= 2, `${id}: expected LOD2 designation`);
}

console.log(`Validated ${buildings.features.length} buildings, ${roads.features.length} roads, ${landmarks.features.length} landmarks, and ${evidence.sources.length} evidence sources.`);
