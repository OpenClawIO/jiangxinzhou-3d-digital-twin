import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data/jiangxinzhou-v2");
const modelDir = path.join(root, "public/models/jiangxinzhou-v2");
const read = async (filename, directory = dataDir) => JSON.parse(await readFile(path.join(directory, filename), "utf8"));

const [evidence, report, sceneManifest, crossings] = await Promise.all([
  read("nanjing-eye-evidence.json"),
  read("nanjing-eye-model-report.json", modelDir),
  read("scene-manifest.json", modelDir),
  read("crossings.geojson"),
]);

const specification = evidence.specification;
assert.equal(specification.projectLengthM, 827.5);
assert.equal(specification.mainBridgeLengthM, 531.5);
assert.equal(specification.approachLengthM, 296);
assert.deepEqual(specification.spanArrangementM, [45, 42, 58, 240, 58, 42, 46.5]);
assert.equal(specification.mainSpanM, 240);
assert.equal(specification.towerVerticalHeightM, 85);
assert.ok(Math.abs(specification.towerInclinationFromVerticalDeg - 35) <= 0.5);
assert.equal(specification.maximumDeckWidthM, 20);
assert.equal(specification.stayCableCount, 36);
assert.equal(evidence.photos.length, 12, "expected the complete licensed Commons reference set");
assert.ok(evidence.photos.every((photo) => photo.license === "CC BY-SA 4.0" && photo.url.startsWith("https://commons.wikimedia.org/wiki/File:")));
assert.ok(evidence.visualIdentityChecks.some((check) => check.includes("open at deck level")), "tower identity must describe the photo-verified open arch form");

assert.deepEqual(report.specification, specification);
assert.deepEqual(report.centerline.sourceRoadIds, ["road-11-0", "road-11-2"]);
assert.equal(report.centerline.coordinateCount, 9);
assert.ok(Math.abs(report.centerline.geometryLengthM - specification.projectLengthM) <= 2.5);
assert.equal(report.lods.length, 2);

const lod1 = report.lods.find((lod) => lod.lod === 1);
const lod2 = report.lods.find((lod) => lod.lod === 2);
assert.ok(lod1 && lod2, "both Nanjing Eye LODs must be generated");
assert.ok(lod1.triangles <= 20_000, `LOD1 triangle budget exceeded: ${lod1.triangles}`);
assert.ok(lod1.bytes <= 600_000, `LOD1 byte budget exceeded: ${lod1.bytes}`);
assert.ok(lod1.drawCalls <= 20, `LOD1 draw-call budget exceeded: ${lod1.drawCalls}`);
assert.equal(lod2.cableCount, 36);
assert.ok(lod2.triangles >= 40_000 && lod2.triangles <= 110_000, `LOD2 triangle target missed: ${lod2.triangles}`);
assert.ok(lod2.bytes <= 2_500_000, `LOD2 byte budget exceeded: ${lod2.bytes}`);
assert.ok(lod2.drawCalls <= 35, `LOD2 draw-call budget exceeded: ${lod2.drawCalls}`);
assert.deepEqual(lod1.lightingMaterials, lod2.lightingMaterials);

for (const lod of [lod1, lod2]) {
  const filepath = path.join(root, "public", lod.url);
  await access(filepath);
  assert.equal((await stat(filepath)).size, lod.bytes);
  assert.equal(lod.landmarkId, 2);
  assert.ok(lod.bounds.min.every(Number.isFinite) && lod.bounds.max.every(Number.isFinite));
  assert.ok(lod.bounds.min.every((value, index) => value < lod.bounds.max[index]), `${lod.id}: invalid ordered bounds`);
}

const manifestTiles = sceneManifest.landmarkTiles.filter((tile) => tile.landmarkId === 2);
assert.equal(manifestTiles.length, 2);
assert.deepEqual(manifestTiles.map((tile) => tile.lod).sort(), [1, 2]);

const crossing = crossings.features.find((feature) => feature.id === "nanjing-eye-crossing");
assert.equal(crossing.properties.officialProjectLengthM, 827.5);
assert.equal(crossing.properties.officialMainSpanM, 240);
assert.equal(crossing.geometry.coordinates.length, 9);

console.log(`Validated Nanjing Eye LOD1 ${lod1.triangles.toLocaleString()} tris/${lod1.bytes.toLocaleString()} bytes and LOD2 ${lod2.triangles.toLocaleString()} tris/${lod2.bytes.toLocaleString()} bytes.`);
