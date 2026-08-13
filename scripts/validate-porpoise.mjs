import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import {
  motionFor,
  pointAtPolyline,
  polylineLengthM,
  PORPOISE_AGENTS,
  PORPOISE_WATERLINE_Y,
} from "../app/jiangxinzhou/porpoise.ts";

const root = process.cwd();
const dataDir = path.join(root, "data/jiangxinzhou-v2");
const modelDir = path.join(root, "public/models/jiangxinzhou-v2");
const readJson = async (file, directory = dataDir) => JSON.parse(await readFile(path.join(directory, file), "utf8"));

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

const [waters, island, manifest] = await Promise.all([
  readJson("water-bodies.geojson"),
  readJson("island.geojson"),
  readJson("scene-manifest.json", modelDir),
]);

const expectedZones = ["yangtze-main-channel", "jiajiang"];
assert.deepEqual(waters.features.map((feature) => feature.id), expectedZones, "porpoise zones must match the two existing water bodies");
const islandRing = island.features[0].geometry.coordinates[0];
for (const zoneId of expectedZones) {
  const feature = waters.features.find((candidate) => candidate.id === zoneId);
  assert.ok(feature, `${zoneId}: missing water body`);
  const centerline = feature.properties.centerline;
  assert.ok(Array.isArray(centerline) && centerline.length >= 3, `${zoneId}: centerline must have at least three points`);
  const waterRing = feature.geometry.coordinates[0];
  const waterXs = waterRing.map(([longitude]) => longitude);
  const waterYs = waterRing.map(([, latitude]) => latitude);
  const envelope = {
    minX: Math.min(...waterXs) - 0.01,
    maxX: Math.max(...waterXs) + 0.01,
    minY: Math.min(...waterYs) - 0.01,
    maxY: Math.max(...waterYs) + 0.01,
  };
  for (const point of centerline) {
    const inWaterEnvelope = pointInRing(point, waterRing)
      || (point[0] >= envelope.minX && point[0] <= envelope.maxX && point[1] >= envelope.minY && point[1] <= envelope.maxY);
    assert.ok(inWaterEnvelope, `${zoneId}: centerline point is outside its water envelope`);
    assert.equal(pointInRing(point, islandRing), false, `${zoneId}: centerline point must remain outside Jiangxinzhou island`);
    assert.ok(point.every(Number.isFinite), `${zoneId}: centerline contains a non-finite coordinate`);
  }
}

assert.equal(PORPOISE_WATERLINE_Y, -18, "porpoise waterline must align with the context water layer");
assert.equal(PORPOISE_AGENTS.length, 6, "the ambient layer is capped at six porpoises");
assert.equal(PORPOISE_AGENTS.filter((agent) => agent.zoneId === "yangtze-main-channel").length, 3);
assert.equal(PORPOISE_AGENTS.filter((agent) => agent.zoneId === "jiajiang").length, 3);
assert.ok(PORPOISE_AGENTS.every((agent) => agent.cycleMs >= 12_000 && agent.cycleMs <= 18_000));
assert.ok(PORPOISE_AGENTS.every((agent) => agent.speedMps > 0 && agent.scale > 0));

for (const agent of PORPOISE_AGENTS) {
  const cycleSamples = [0.1, 0.8, 0.86, 0.96].map((cycle) => {
    const elapsedMs = ((cycle - agent.phase + 1) % 1) * agent.cycleMs;
    return motionFor(agent, elapsedMs, 100);
  });
  assert.equal(cycleSamples[0].state, "submerged");
  assert.equal(cycleSamples[1].state, "rising");
  assert.equal(cycleSamples[2].state, "surfaced");
  assert.equal(cycleSamples[3].state, "diving");
  assert.ok(cycleSamples.every((motion) => motion.progress >= 0 && motion.progress < 1));
}

const testPath = [[0, PORPOISE_WATERLINE_Y, 0], [30, PORPOISE_WATERLINE_Y, 0], [30, PORPOISE_WATERLINE_Y, 40]];
assert.ok(polylineLengthM(testPath) > 0);
const sampled = pointAtPolyline(testPath, 0.5);
assert.ok(sampled.point.every(Number.isFinite) && sampled.tangent.every(Number.isFinite));

const asset = manifest.porpoiseAssets?.find((entry) => entry.id === "FinlessPorpoise");
assert.ok(asset, "scene manifest must expose the finless porpoise asset");
const modelPath = path.join(root, "public", asset.url);
const modelBytes = (await stat(modelPath)).size;
assert.equal(modelBytes, asset.bytes, "manifest byte size must match the GLB");
assert.ok(modelBytes <= 350_000, `porpoise GLB is too large: ${modelBytes}`);
assert.ok(asset.triangles <= 12_000, `porpoise triangle budget exceeded: ${asset.triangles}`);
assert.ok(asset.drawCalls <= 10, `porpoise draw-call budget exceeded: ${asset.drawCalls}`);
assert.ok(asset.bounds?.min && asset.bounds?.max, "manifest must record the porpoise bounds");

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const document = await io.read(modelPath);
const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
assert.ok(scene, "porpoise GLB must have a default scene");
const nodeNames = new Set(document.getRoot().listNodes().map((node) => node.getName()));
for (const name of ["PorpoiseBody", "PorpoiseHead", "PorpoiseBackRidge", "PorpoiseFlipperLeft", "PorpoiseFlipperRight", "PorpoiseTail"]) {
  assert.ok(nodeNames.has(name), `porpoise GLB is missing semantic node ${name}`);
}
const materialNames = new Set(document.getRoot().listMaterials().map((material) => material.getName()));
for (const name of asset.materials) assert.ok(materialNames.has(name), `porpoise GLB is missing material ${name}`);

let triangles = 0;
let drawCalls = 0;
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.getMode() !== 4) continue;
    triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    drawCalls += 1;
  }
}
assert.equal(triangles, asset.triangles, "manifest triangle count must match the optimized GLB");
assert.equal(drawCalls, asset.drawCalls, "manifest draw-call count must match the optimized GLB");
const bounds = getBounds(scene);
for (const axis of [0, 1, 2]) {
  assert.ok(Math.abs(bounds.min[axis] - asset.bounds.min[axis]) <= 0.02, `bounds min axis ${axis} drifted`);
  assert.ok(Math.abs(bounds.max[axis] - asset.bounds.max[axis]) <= 0.02, `bounds max axis ${axis} drifted`);
  assert.ok(bounds.min[axis] < bounds.max[axis], `bounds axis ${axis} is not ordered`);
}

const layerSource = await readFile(path.join(root, "app/jiangxinzhou/PorpoiseLayer.tsx"), "utf8");
assert.match(layerSource, /if \(!visible\) return null/);
assert.match(layerSource, /quality === "efficiency" \|\| reducedMotion \|\| legacy/);
assert.match(layerSource, /useGLTF\(PORPOISE_URL\)/);
assert.match(layerSource, /motionWithZoneLimit/);
assert.match(layerSource, /PORPOISE_SIGNAL_Y/);
assert.match(layerSource, /surface signal/);

console.log(`Validated porpoise ecology: ${asset.triangles.toLocaleString()} triangles, ${asset.drawCalls} draws, ${modelBytes.toLocaleString()} bytes, two water zones and six deterministic agents.`);
