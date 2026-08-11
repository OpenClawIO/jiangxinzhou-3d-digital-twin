import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "data/jiangxinzhou-v2");
const snapshot = "2026-08-11";

const feature = (id, geometry, properties) => ({
  type: "Feature",
  id,
  geometry,
  properties: { id, ...properties },
});
const collection = (features) => ({ type: "FeatureCollection", features });
const name = (zh, en) => ({ zh, en });
const existing = "existing";
const triangulated = "triangulated";
const estimated = "estimated";

// These are generalized, original context polygons. They establish a readable
// regional frame without redistributing Amap or Google Earth raster tiles.
const contextLands = collection([
  feature("jiangbei-west-bank", {
    type: "Polygon",
    coordinates: [[
      [118.620, 31.970], [118.647, 31.970], [118.661, 31.987], [118.667, 32.008],
      [118.668, 32.034], [118.665, 32.061], [118.674, 32.085], [118.620, 32.085], [118.620, 31.970],
    ]],
  }, {
    name: name("江北新区西岸", "Jiangbei New Area · West Bank"),
    kind: "west-bank",
    color: "#315864",
    opacity: 0.84,
    source: "Nanjing government geography cross-checked with OSM and Google Earth",
    confidence: triangulated,
    status: existing,
  }),
  feature("hexi-east-bank", {
    type: "Polygon",
    coordinates: [[
      [118.722, 31.970], [118.748, 31.970], [118.748, 32.085], [118.718, 32.085],
      [118.722, 32.066], [118.723, 32.045], [118.718, 32.026], [118.708, 32.008], [118.694, 31.985], [118.686, 31.970],
      [118.722, 31.970],
    ]],
  }, {
    name: name("河西新城东岸", "Hexi New City · East Bank"),
    kind: "east-bank",
    color: "#3a6268",
    opacity: 0.88,
    source: "Nanjing government geography cross-checked with OSM and Google Earth",
    confidence: triangulated,
    status: existing,
  }),
  feature("north-bank", {
    type: "Polygon",
    coordinates: [[[118.620, 32.073], [118.748, 32.073], [118.748, 32.092], [118.620, 32.092], [118.620, 32.073]]],
  }, {
    name: name("北岸城市界面", "Northern Urban Edge"),
    kind: "north-bank",
    color: "#294b55",
    opacity: 0.78,
    source: "Generalized regional context from OSM and Google Earth",
    confidence: estimated,
    status: existing,
  }),
  feature("south-bank", {
    type: "Polygon",
    coordinates: [[[118.620, 31.960], [118.748, 31.960], [118.748, 31.982], [118.620, 31.982], [118.620, 31.960]]],
  }, {
    name: name("南岸城市界面", "Southern Urban Edge"),
    kind: "south-bank",
    color: "#294b55",
    opacity: 0.78,
    source: "Generalized regional context from OSM and Google Earth",
    confidence: estimated,
    status: existing,
  }),
]);

const waterBodies = collection([
  feature("yangtze-main-channel", {
    type: "Polygon",
    coordinates: [[
      [118.620, 31.960], [118.620, 32.092], [118.675, 32.092], [118.674, 32.078],
      [118.672, 32.064], [118.671, 32.048], [118.670, 32.032], [118.666, 32.015],
      [118.659, 31.995], [118.648, 31.978], [118.638, 31.966], [118.620, 31.960],
    ]],
  }, {
    name: name("长江主江（大江）", "Yangtze Main Channel"),
    kind: "yangtze-main-channel",
    color: "#2d8eaa",
    opacity: 0.78,
    source: "OSM waterways cross-checked with Google Earth shoreline form",
    confidence: triangulated,
    status: existing,
    centerline: [[118.635, 32.082], [118.646, 32.060], [118.654, 32.038], [118.655, 32.015], [118.643, 31.981]],
  }),
  feature("jiajiang", {
    type: "Polygon",
    coordinates: [[
      [118.686, 31.960], [118.748, 31.960], [118.748, 32.092], [118.718, 32.092],
      [118.719, 32.075], [118.721, 32.059], [118.720, 32.044], [118.713, 32.028],
      [118.705, 32.012], [118.695, 31.992], [118.686, 31.975], [118.686, 31.960],
    ]],
  }, {
    name: name("夹江", "Jiajiang"),
    kind: "jiajiang",
    color: "#3da6b3",
    opacity: 0.72,
    source: "OSM named waterways cross-checked with Google Earth shoreline form",
    confidence: triangulated,
    status: existing,
    centerline: [[118.735, 32.084], [118.727, 32.064], [118.719, 32.044], [118.707, 32.025], [118.692, 31.980]],
  }),
]);

const contextRoads = collection([
  feature("context-jiajiang-approach", { type: "LineString", coordinates: [[118.748, 32.051], [118.729, 32.042], [118.707944, 32.031631]] }, {
    name: name("河西桥头接线", "Hexi Bridge Approach"), class: "major", widthM: 22, renderWidthPx: 2.3,
    color: "#c3a972", source: "OSM major-road context", confidence: triangulated, status: existing,
  }),
  feature("context-yangtze-approach", { type: "LineString", coordinates: [[118.620, 32.029], [118.635, 32.023], [118.641868, 32.019244]] }, {
    name: name("江北桥头接线", "Jiangbei Bridge Approach"), class: "major", widthM: 22, renderWidthPx: 2.3,
    color: "#c3a972", source: "OSM major-road context", confidence: triangulated, status: existing,
  }),
  feature("context-yangtze-south-approach", { type: "LineString", coordinates: [[118.68262, 32.002087], [118.675, 31.994], [118.662, 31.982]] }, {
    name: name("江心洲大桥南接线", "Jiangxinzhou Bridge South Approach"), class: "major", widthM: 22, renderWidthPx: 2.3,
    color: "#c3a972", source: "OSM major-road context", confidence: triangulated, status: existing,
  }),
]);

const crossings = collection([
  feature("jiangxinzhou-yangtze-bridge", { type: "LineString", coordinates: [[118.641868, 32.019244], [118.651, 32.0154], [118.662, 32.0107], [118.673, 32.0062], [118.68262, 32.002087]] }, {
    name: name("南京江心洲长江大桥", "Nanjing Jiangxinzhou Yangtze River Bridge"), type: "bridge", mode: "road", color: "#f1c46a",
    status: existing, confidence: triangulated, source: "OSM bridge geometry + Nanjing government bridge project资料", sourceId: "458525355/458709962",
    totalRouteM: 10335, mainSpanM: 600, modelKey: "jiangxinzhou-yangtze-bridge", layer: 1,
  }),
  feature("jiajiang-bridge", { type: "LineString", coordinates: [[118.702071, 32.034805], [118.7048, 32.0331], [118.707944, 32.031631]] }, {
    name: name("夹江大桥", "Jiajiang Bridge"), type: "bridge", mode: "road", color: "#e9b75f",
    status: existing, confidence: triangulated, source: "OSM bridge geometry + Nanjing transportation references", sourceId: "137972556/137972560",
    totalRouteM: null, mainSpanM: null, modelKey: "jiajiang-bridge", layer: 1,
  }),
  feature("nanjing-eye-crossing", { type: "LineString", coordinates: [[118.69399, 31.999741], [118.69655, 31.99755], [118.699348, 31.995421]] }, {
    name: name("南京眼步行桥", "Nanjing Eye Pedestrian Bridge"), type: "bridge", mode: "pedestrian", color: "#a7e0c2",
    status: existing, confidence: triangulated, source: "OSM bridge geometry + Nanjing Eye official project资料", sourceId: "321392362/445886857/445886858",
    totalRouteM: 827.5, mainSpanM: 240, modelKey: "nanjing-eye-context", layer: 2,
  }),
  feature("jiajiang-tunnel", { type: "LineString", coordinates: [[118.684867, 32.001322], [118.6939, 31.9970], [118.701921, 31.992288]] }, {
    name: name("夹江隧道", "Jiajiang Tunnel"), type: "tunnel", mode: "road", color: "#82a5bd",
    status: existing, confidence: triangulated, source: "OSM tunnel geometry + Nanjing government bridge project资料", sourceId: "458709944",
    totalRouteM: 1800, mainSpanM: null, modelKey: null, layer: -2,
  }),
  feature("qingao-axis-tunnel-north", { type: "LineString", coordinates: [[118.703292, 31.997225], [118.700816, 31.994358]] }, {
    name: name("青奥轴线隧道", "Qing'ao Axis Tunnel"), type: "tunnel", mode: "road", color: "#728da3",
    status: existing, confidence: triangulated, source: "OpenStreetMap tunnel geometry", sourceId: "321394415", totalRouteM: null, mainSpanM: null, modelKey: null, layer: -1,
  }),
  feature("qingao-axis-tunnel-south", { type: "LineString", coordinates: [[118.695413, 31.991451], [118.699937, 31.993537]] }, {
    name: name("青奥轴线隧道南段", "Qing'ao Axis Tunnel · South"), type: "tunnel", mode: "road", color: "#728da3",
    status: existing, confidence: triangulated, source: "OpenStreetMap tunnel geometry", sourceId: "321394417", totalRouteM: null, mainSpanM: null, modelKey: null, layer: -1,
  }),
  feature("yingtian-avenue-tunnel", { type: "LineString", coordinates: [[118.698383, 32.037478], [118.685, 32.045], [118.675, 32.052], [118.667667, 32.056265]] }, {
    name: name("应天大街长江隧道", "Yingtian Avenue Yangtze Tunnel"), type: "tunnel", mode: "road", color: "#637f96",
    status: existing, confidence: triangulated, source: "OpenStreetMap tunnel geometry", sourceId: "137978972", totalRouteM: null, mainSpanM: null, modelKey: null, layer: -1,
  }),
]);

const evidence = {
  version: `${snapshot}.context.1`, snapshot, canonicalCrs: "EPSG:4326",
  precision: "Regional visitor-scale context. Banks and generalized water polygons are original display geometry; crossing lines are position-checked against public OSM and official project references.",
  redistribution: "No Amap, Google Earth, Xiaohongshu or other reference imagery is redistributed. The runtime uses original generalized polygons plus ODbL geometry attribution.",
  sources: [
    { id: "nanjing-geography-context", title: "南京市政府江心洲生态文旅资料", type: "government", date: "2025-12-03", url: "https://www.nanjing.gov.cn/xxgkn/jytabljggk/2025njytabl/shizxta/202512/t20251203_5704828.html", verifies: ["island relationship to main channel and Jiajiang", "15.21 km² island scale", "22.5 km embankment loop"], redistribution: "reference-only" },
    { id: "osm-context-crossings", title: "OpenStreetMap Jiangxinzhou regional waterways and crossings", type: "open-data", date: snapshot, url: "https://www.openstreetmap.org/relation/11630502", verifies: ["named waterways", "bridge alignments", "tunnel alignments", "Metro 10 regional geometry"], license: "ODbL" },
    { id: "jiangxinzhou-bridge-official", title: "南京江心洲长江大桥及夹江隧道项目资料", type: "government", date: "2023-08-22", url: "https://www.nanjing.gov.cn/zgnjsjb/jrtt/202308/t20230822_3991869.html", verifies: ["2×600 m main spans", "about 1.8 km Jiajiang tunnel", "10.335 km route context"] },
    { id: "nanjing-eye-official", title: "南京眼步行桥项目资料", type: "government", date: "2025-09-03", url: "https://gjzx.nanjing.gov.cn/xmqk/qabxq/202509/t20250903_5641986.html", verifies: ["240 m main span", "double inclined elliptical towers", "double cable planes"] },
    { id: "google-earth-context", title: "Google Earth Jiangxinzhou", type: "satellite", imageryDate: "2024-10-04", url: "https://earth.google.com/web/search/Jiangxinzhou,+Nanjing,+Jiangsu,+China", verifies: ["shoreline curvature", "bank/green-space massing", "regional water separation"], redistribution: "reference-only" },
  ],
};

const [manifest, runtime] = await Promise.all([
  readFile(path.join(outputDir, "manifest.json"), "utf8").then(JSON.parse),
  readFile(path.join(outputDir, "runtime.json"), "utf8").then(JSON.parse),
]);
manifest.version = snapshot;
manifest.snapshot = snapshot;
manifest.layers.contextLands = "context-land.geojson";
manifest.layers.waterBodies = "water-bodies.geojson";
manifest.layers.contextRoads = "context-roads.geojson";
manifest.layers.crossings = "crossings.geojson";
manifest.layers.contextEvidence = "context-evidence.json";
manifest.counts.contextLands = contextLands.features.length;
manifest.counts.waterBodies = waterBodies.features.length;
manifest.counts.crossings = crossings.features.length;

runtime.manifest = manifest;
runtime.context = { lands: contextLands, waters: waterBodies, roads: contextRoads, crossings, evidence };

const outputs = {
  "context-land.geojson": contextLands,
  "water-bodies.geojson": waterBodies,
  "context-roads.geojson": contextRoads,
  "crossings.geojson": crossings,
  "context-evidence.json": evidence,
  "manifest.json": manifest,
  "runtime.json": runtime,
};
await Promise.all(Object.entries(outputs).map(([file, value]) => writeFile(path.join(outputDir, file), `${JSON.stringify(value, null, 2)}\n`)));
console.log(`Generated regional context: ${contextLands.features.length} land masses, ${waterBodies.features.length} water bodies, ${crossings.features.length} crossings.`);
