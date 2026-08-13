import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
const dryRun = argv.includes("--dry-run");
const inputDir = path.resolve(argument("--input-dir", "public/models/jiangxinzhou-v2"));
const requestedFile = argument("--file", "");
const toleranceM = Number(argument("--bounds-tolerance", "0.15"));

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });

function collectSignature(document) {
  const root = document.getRoot();
  const names = {
    nodes: root.listNodes().map((item) => item.getName()).filter(Boolean).sort(),
    meshes: root.listMeshes().map((item) => item.getName()).filter(Boolean).sort(),
    materials: root.listMaterials().map((item) => item.getName()).filter(Boolean).sort(),
  };
  const extras = [
    ...root.listNodes().map((item) => ["node", item.getName(), item.getExtras()]),
    ...root.listMeshes().map((item) => ["mesh", item.getName(), item.getExtras()]),
    ...root.listMaterials().map((item) => ["material", item.getName(), item.getExtras()]),
  ].filter(([, , value]) => value && Object.keys(value).length > 0).map((value) => JSON.stringify(value)).sort();
  let triangles = 0;
  let drawCalls = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;
      const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
      triangles += count / 3;
      drawCalls += 1;
    }
  }
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  return { names, extras, triangles, drawCalls, bounds };
}

function maximumBoundsDelta(source, optimized) {
  let delta = 0;
  for (const key of ["min", "max"]) {
    for (let axis = 0; axis < 3; axis += 1) delta = Math.max(delta, Math.abs(source[key][axis] - optimized[key][axis]));
  }
  return delta;
}

function assertEquivalent(file, source, optimized) {
  const exactFields = ["names", "extras", "triangles", "drawCalls"];
  for (const field of exactFields) {
    if (JSON.stringify(source[field]) !== JSON.stringify(optimized[field])) throw new Error(`${file}: ${field} changed during optimization`);
  }
  const boundsDelta = maximumBoundsDelta(source.bounds, optimized.bounds);
  if (boundsDelta > toleranceM) throw new Error(`${file}: bounds changed by ${boundsDelta.toFixed(4)}m (limit ${toleranceM}m)`);
  return boundsDelta;
}

async function optimizeFile(filePath) {
  const sourceBytes = (await fs.stat(filePath)).size;
  const document = await io.read(filePath);
  const source = collectSignature(document);
  await document.transform(
    dedup({ keepUniqueNames: true }),
    weld({ overwrite: false }),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    meshopt({
      encoder: MeshoptEncoder,
      level: "high",
      quantizePosition: 16,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeWeight: 8,
      quantizeGeneric: 12,
    }),
  );
  const temporaryPath = `${filePath}.meshopt-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, await io.writeBinary(document));
  const optimizedDocument = await io.readBinary(new Uint8Array(await fs.readFile(temporaryPath)));
  const optimized = collectSignature(optimizedDocument);
  const boundsDelta = assertEquivalent(path.basename(filePath), source, optimized);
  const optimizedBytes = (await fs.stat(temporaryPath)).size;
  return { filePath, temporaryPath, sourceBytes, optimizedBytes, source, optimized, boundsDelta };
}

async function updateJsonSizes(jsonPath, sizes) {
  let value;
  try {
    value = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const visit = (entry) => {
    if (!entry || typeof entry !== "object") return;
    if (typeof entry.url === "string") {
      const size = sizes.get(path.basename(entry.url));
      if (size !== undefined) entry.bytes = size;
    }
    for (const child of Object.values(entry)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(value);
  const temporaryPath = `${jsonPath}.meshopt-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporaryPath, jsonPath);
}

const entries = requestedFile
  ? [path.resolve(inputDir, requestedFile)]
  : (await fs.readdir(inputDir)).filter((file) => file.endsWith(".glb")).sort().map((file) => path.join(inputDir, file));

if (entries.length === 0) throw new Error(`No GLB files found in ${inputDir}`);
const pending = [];
try {
  for (const filePath of entries) pending.push(await optimizeFile(filePath));
  for (const result of pending) {
    const reduction = (1 - result.optimizedBytes / result.sourceBytes) * 100;
    console.log(`${path.basename(result.filePath)}: ${result.sourceBytes} -> ${result.optimizedBytes} bytes (${reduction.toFixed(1)}%), bounds Δ ${result.boundsDelta.toFixed(4)}m`);
  }
  if (!dryRun) {
    for (const result of pending) await fs.rename(result.temporaryPath, result.filePath);
    const sizes = new Map(pending.map((result) => [path.basename(result.filePath), result.optimizedBytes]));
    await updateJsonSizes(path.join(inputDir, "scene-manifest.json"), sizes);
    await updateJsonSizes(path.join(inputDir, "nanjing-eye-model-report.json"), sizes);
  }
} finally {
  await Promise.all(pending.map(({ temporaryPath }) => fs.rm(temporaryPath, { force: true })));
}

console.log(dryRun ? "Meshopt dry run validated; source files unchanged." : `Meshopt optimization completed for ${pending.length} GLB files.`);
