import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { PET_AGENTS, petMotionFor, PET_GROUND_Y } from "../app/jiangxinzhou/pet.ts";

const root = process.cwd();
const modelDir = path.join(root, "public/models/jiangxinzhou-v2");
const manifest = JSON.parse(await readFile(path.join(modelDir, "scene-manifest.json"), "utf8"));
const asset = manifest.petAssets?.find((entry) => entry.id === "JiangxinzhouCompanionPets");
assert.ok(asset, "scene manifest must expose the Jiangxinzhou PET asset");
assert.equal(PET_AGENTS.length, 4, "the ambient PET layer must contain four deterministic agents");
assert.equal(new Set(PET_AGENTS.map((agent) => agent.species)).size, 4, "PET species must be unique in the first release");
assert.ok(PET_AGENTS.every((agent) => agent.radiusM >= 12 && agent.radiusM <= 30));
assert.ok(PET_AGENTS.every((agent) => agent.cycleMs >= 12_000 && agent.cycleMs <= 20_000));
assert.ok(PET_AGENTS.every((agent) => agent.scale > 0 && agent.scale <= 1.2));
assert.equal(PET_GROUND_Y, 0.32, "PET ground height must match the Blender asset baseline");

for (const agent of PET_AGENTS) {
  const samples = [0, 0.25, 0.5, 0.75].map((fraction) => petMotionFor(agent, fraction * agent.cycleMs));
  assert.ok(samples.every((motion) => Number.isFinite(motion.heading)));
  assert.ok(samples.every((motion) => motion.displacement.every(Number.isFinite)));
  assert.ok(samples.some((motion) => motion.action !== "wander"), `${agent.id} must have non-idle actions`);
}

const modelPath = path.join(root, "public", asset.url);
const modelBytes = (await stat(modelPath)).size;
assert.equal(modelBytes, asset.bytes, "manifest byte size must match the PET GLB");
assert.ok(modelBytes <= 180_000, `PET GLB is too large: ${modelBytes}`);
assert.ok(asset.triangles <= 10_000, `PET triangle budget exceeded: ${asset.triangles}`);
assert.ok(asset.drawCalls <= 24, `PET draw-call budget exceeded: ${asset.drawCalls}`);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const document = await io.read(modelPath);
const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
assert.ok(scene, "PET GLB must have a default scene");
const nodeNames = new Set(document.getRoot().listNodes().map((node) => node.getName()));
for (const name of ["PetDog", "PetCat", "PetRabbit", "PetEgret"]) assert.ok(nodeNames.has(name), `PET GLB is missing node ${name}`);

let triangles = 0;
let drawCalls = 0;
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.getMode() !== 4) continue;
    triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    drawCalls += 1;
  }
}
assert.equal(triangles, asset.triangles, "manifest triangle count must match the optimized PET GLB");
assert.equal(drawCalls, asset.drawCalls, "manifest draw-call count must match the optimized PET GLB");
const bounds = getBounds(scene);
for (const axis of [0, 1, 2]) {
  assert.ok(Math.abs(bounds.min[axis] - asset.bounds.min[axis]) <= 0.02, `PET bounds min axis ${axis} drifted`);
  assert.ok(Math.abs(bounds.max[axis] - asset.bounds.max[axis]) <= 0.02, `PET bounds max axis ${axis} drifted`);
}

const layerSource = await readFile(path.join(root, "app/jiangxinzhou/PetLayer.tsx"), "utf8");
assert.match(layerSource, /if \(!visible\) return null/);
assert.match(layerSource, /quality !== "efficiency" && !reducedMotion && !legacy/);
assert.match(layerSource, /useGLTF\(PET_URL\)/);
assert.match(layerSource, /PetAssetBoundary/);
assert.match(layerSource, /PetFallback/);

console.log(`Validated Jiangxinzhou PET ecology: ${asset.triangles.toLocaleString()} triangles, ${asset.drawCalls} draws, ${modelBytes.toLocaleString()} bytes and four deterministic companion agents.`);
