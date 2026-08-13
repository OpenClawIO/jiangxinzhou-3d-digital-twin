import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "data/jiangxinzhou-v2/road-layer");
const [manifest, corridors, evidence] = await Promise.all([
  readFile(path.join(directory, "road-manifest.json"), "utf8").then(JSON.parse),
  readFile(path.join(directory, "road-corridors.geojson"), "utf8").then(JSON.parse),
  readFile(path.join(directory, "road-evidence.json"), "utf8").then(JSON.parse),
]);

const agreementCounts = corridors.features.reduce((counts, road) => {
  const agreement = road.properties.sourceAgreement;
  counts[agreement] = (counts[agreement] ?? 0) + 1;
  return counts;
}, {});
const sourceIds = new Set(evidence.sources.map((source) => source.id));
const report = {
  version: manifest.version,
  generatedAt: new Date().toISOString(),
  canonicalCrs: evidence.canonicalCrs,
  sourceIds: [...sourceIds],
  agreementCounts,
  namedRoads: [...new Set(corridors.features.map((road) => road.properties.name.zh).filter(Boolean))],
  limitations: [
    "Amap and Baidu provider payloads are not embedded in the browser bundle.",
    "No Amap or Baidu client key is stored in this repository; the current layer retains OSM geometry and records provider documentation/public route references.",
    "Road geometry is a visitor-scale reconstruction, not cadastral or survey-grade data.",
  ],
  nextLicensedRefresh: "Append dated Amap and Baidu route snapshots to road-evidence.json and promote only matching roads to dual-confirmed.",
};
await writeFile(path.join(directory, "road-source-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Audited ${corridors.features.length} road corridors against ${sourceIds.size} recorded sources.`);
console.log(`Current source agreements: ${JSON.stringify(agreementCounts)}.`);
