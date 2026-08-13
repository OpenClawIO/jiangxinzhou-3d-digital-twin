import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  bd09ToWgs84,
  gcj02ToWgs84,
  wgs84ToBd09,
  wgs84ToGcj02,
} from "./lib/geodesy.mjs";

const root = process.cwd();
const directory = path.join(root, "data/jiangxinzhou-v2/road-layer");
const read = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
const [manifest, corridors, junctions, facilities, graph, evidence, aggregate] = await Promise.all([
  read("road-manifest.json"),
  read("road-corridors.geojson"),
  read("road-junctions.geojson"),
  read("road-facilities.geojson"),
  read("road-network.graph.json"),
  read("road-evidence.json"),
  read("road-layer.json"),
]);

assert.equal(manifest.canonicalCrs, "EPSG:4326");
assert.equal(graph.canonicalCrs, "EPSG:4326");
assert.ok(corridors.features.length >= 250, "road layer must retain the full corridor set");
assert.ok(corridors.features.length === manifest.counts.corridors, "corridor count drifted");
assert.ok(junctions.features.length >= 100, "junction layer is unexpectedly sparse");
assert.ok(facilities.features.length >= corridors.features.length * 2, "road facilities are missing");
assert.ok(graph.nodes.length >= junctions.features.length, "graph nodes must cover junctions");
assert.ok(graph.edges.length >= corridors.features.length, "graph edges must cover corridors");
assert.ok(graph.metrics.connectedComponents <= 20, "road graph has too many disconnected components");
assert.ok(evidence.sources.some((source) => source.id === "amap"), "Amap evidence is missing");
assert.ok(evidence.sources.some((source) => source.id === "baidu-coordinate"), "Baidu coordinate evidence is missing");
assert.ok(evidence.sources.some((source) => source.id === "baidu-route-reference"), "Baidu route reference is missing");
assert.equal(aggregate.manifest.version, manifest.version, "aggregate manifest is stale");

const referenceWgs84 = [118.7068, 32.0055];
const gcj02 = wgs84ToGcj02(referenceWgs84);
const bd09 = wgs84ToBd09(referenceWgs84);
const gcjRoundTrip = gcj02ToWgs84(gcj02);
const bdRoundTrip = bd09ToWgs84(bd09);
const coordinateError = (left, right) => Math.hypot(left[0] - right[0], left[1] - right[1]);
assert.ok(coordinateError(gcj02, referenceWgs84) > 0.0001, "GCJ-02 transform should offset mainland coordinates");
assert.ok(coordinateError(bd09, referenceWgs84) > 0.0001, "BD-09 transform should offset mainland coordinates");
assert.ok(coordinateError(gcjRoundTrip, referenceWgs84) < 0.00002, "GCJ-02 round trip is outside tolerance");
assert.ok(coordinateError(bdRoundTrip, referenceWgs84) < 0.00003, "BD-09 round trip is outside tolerance");

const corridorIds = new Set();
const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
const allowedClasses = new Set(["major", "arterial", "collector", "local", "greenway"]);
const allowedAgreements = new Set(["dual-confirmed", "amap-confirmed", "baidu-confirmed", "osm-derived", "conflict"]);
for (const road of corridors.features) {
  assert.ok(!corridorIds.has(road.properties.roadId), `${road.id}: duplicate road id`);
  corridorIds.add(road.properties.roadId);
  assert.ok(allowedClasses.has(road.properties.class), `${road.id}: invalid road class`);
  assert.ok(road.properties.widthM >= 3 && road.properties.widthM <= 30, `${road.id}: invalid metre width`);
  assert.ok(road.properties.name && typeof road.properties.name.zh === "string", `${road.id}: bilingual name object missing`);
  assert.ok(Array.isArray(road.properties.sourceRefs) && road.properties.sourceRefs.includes("osm"), `${road.id}: source refs missing OSM seed`);
  assert.ok(allowedAgreements.has(road.properties.sourceAgreement), `${road.id}: invalid source agreement`);
  assert.ok(nodeIds.has(road.properties.fromNodeId) && nodeIds.has(road.properties.toNodeId), `${road.id}: dangling corridor endpoint`);
  for (const [longitude, latitude] of road.geometry.coordinates) {
    assert.ok(longitude >= 118.64 && longitude <= 118.75 && latitude >= 31.96 && latitude <= 32.10, `${road.id}: coordinate outside study area`);
  }
}

const edgeIds = new Set();
for (const edge of graph.edges) {
  assert.ok(!edgeIds.has(edge.edgeId), `${edge.edgeId}: duplicate edge id`);
  edgeIds.add(edge.edgeId);
  assert.ok(nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId), `${edge.edgeId}: dangling graph edge`);
  assert.ok(edge.lengthM > 0 && edge.lengthM < 5_000, `${edge.edgeId}: abnormal edge length`);
  assert.ok(edge.allowedModes.length > 0, `${edge.edgeId}: no allowed travel mode`);
}

for (const node of graph.nodes) {
  assert.ok(node.connectedRoadIds.every((roadId) => corridorIds.has(roadId)), `${node.nodeId}: unknown road connection`);
}

const sourceAgreementCounts = corridors.features.reduce((counts, road) => {
  counts[road.properties.sourceAgreement] = (counts[road.properties.sourceAgreement] ?? 0) + 1;
  return counts;
}, {});
console.log(`Validated road layer ${manifest.version}: ${corridors.features.length} corridors, ${junctions.features.length} junctions, ${facilities.features.length} facilities, ${graph.edges.length} edges, ${graph.metrics.connectedComponents} components.`);
console.log(`Source agreement: ${JSON.stringify(sourceAgreementCounts)}; Amap/Baidu evidence recorded without client-side provider keys.`);
