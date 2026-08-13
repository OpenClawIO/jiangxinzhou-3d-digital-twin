import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { geodesicDistanceM, polylineLengthM } from "./lib/geodesy.mjs";

const root = process.cwd();
const dataDir = path.join(root, "data/jiangxinzhou-v2");
const outputDir = path.join(dataDir, "road-layer");
await mkdir(outputDir, { recursive: true });

const [manifest, roads, crossings] = await Promise.all([
  readFile(path.join(dataDir, "manifest.json"), "utf8").then(JSON.parse),
  readFile(path.join(dataDir, "roads.geojson"), "utf8").then(JSON.parse),
  readFile(path.join(dataDir, "crossings.geojson"), "utf8").then(JSON.parse),
]);

const VERSION = "2026-08-13-road-v8";
const NODE_TOLERANCE_M = 6;
const WIDTHS = { major: 22, arterial: 16, collector: 10.5, local: 6, greenway: 3.5 };
const laneCounts = { major: 4, arterial: 3, collector: 2, local: 1, greenway: 0 };
const accessFor = (roadClass) => roadClass === "greenway" ? "shared" : "vehicle";
const surfaceFor = (roadClass) => roadClass === "greenway" ? "paving" : "asphalt";
const sourceAgreementFor = (source, name) => {
  if (!name) return "osm-derived";
  if (source.includes("Amap")) return "amap-confirmed";
  return "osm-derived";
};

function localPoint([longitude, latitude]) {
  const [originLongitude, originLatitude] = manifest.origin;
  return [
    (longitude - originLongitude) * manifest.projection.metersPerDegreeLongitude,
    (latitude - originLatitude) * manifest.projection.metersPerDegreeLatitude,
  ];
}

function geoPoint([x, y]) {
  const [originLongitude, originLatitude] = manifest.origin;
  return [
    Number((originLongitude + x / manifest.projection.metersPerDegreeLongitude).toFixed(7)),
    Number((originLatitude + y / manifest.projection.metersPerDegreeLatitude).toFixed(7)),
  ];
}

function feature(id, geometry, properties) {
  return { type: "Feature", id, geometry, properties: { id, ...properties } };
}

function collection(features) {
  return { type: "FeatureCollection", features };
}

function unique(values) {
  return [...new Set(values)];
}

function isBridgeName(name) {
  return /桥|bridge/i.test(name ?? "");
}

function nodeKey([x, y]) {
  return `${Math.round(x / NODE_TOLERANCE_M)}:${Math.round(y / NODE_TOLERANCE_M)}`;
}

const nodeBuckets = new Map();
const nodeRecords = [];
function findOrCreateNode(coordinate) {
  const key = nodeKey(coordinate);
  const bucket = nodeBuckets.get(key) ?? [];
  const existing = bucket.find((node) => Math.hypot(node.local[0] - coordinate[0], node.local[1] - coordinate[1]) <= NODE_TOLERANCE_M);
  if (existing) return existing;
  const node = { index: nodeRecords.length, local: [...coordinate], connectedRoadIds: new Set(), degree: 0, bridge: false };
  bucket.push(node);
  nodeBuckets.set(key, bucket);
  nodeRecords.push(node);
  return node;
}

const roadCorridorFeatures = roads.features.map((road, index) => {
  const source = String(road.properties.source ?? "");
  const name = road.properties.name ?? { zh: null, en: null };
  const roadClass = road.properties.class;
  const roadId = String(road.properties.id ?? road.id ?? `road-${index + 1}`);
  const coordinates = road.geometry.coordinates.map((point) => [Number(point[0]), Number(point[1])]);
  const firstNode = findOrCreateNode(localPoint(coordinates[0]));
  const lastNode = findOrCreateNode(localPoint(coordinates.at(-1)));
  firstNode.connectedRoadIds.add(roadId);
  lastNode.connectedRoadIds.add(roadId);
  firstNode.degree += 1;
  lastNode.degree += 1;
  const bridge = isBridgeName(name.zh) || isBridgeName(name.en);
  firstNode.bridge ||= bridge;
  lastNode.bridge ||= bridge;
  return feature(roadId, { type: "LineString", coordinates }, {
    roadId,
    name,
    class: roadClass,
    widthM: Number(road.properties.widthM ?? WIDTHS[roadClass]),
    laneCount: laneCounts[roadClass],
    access: accessFor(roadClass),
    surface: surfaceFor(roadClass),
    status: road.properties.status === "under-construction" ? "construction" : road.properties.status === "planned" ? "planned" : "open",
    fromNodeId: `road-node-${firstNode.index + 1}`,
    toNodeId: `road-node-${lastNode.index + 1}`,
    sourceRefs: ["osm", ...(source.includes("Amap") ? ["amap", "nanjing-official"] : [])],
    sourceAgreement: sourceAgreementFor(source, name.zh),
    confidence: source.includes("Amap") ? "triangulated" : "estimated",
    crossingId: bridge ? (crossings.features.find((crossing) => {
      const crossingName = `${crossing.properties.name?.zh ?? ""}${crossing.properties.name?.en ?? ""}`;
      return crossingName.includes(name.zh ?? "") || (name.zh ?? "").includes(crossing.properties.name?.zh ?? "not-a-name");
    })?.id ?? null) : null,
    sourceGeometry: "existing WGS84 road centerline",
  });
});

const roadById = new Map(roadCorridorFeatures.map((road) => [road.properties.roadId, road]));

const graphSegments = roadCorridorFeatures.flatMap((road) => road.geometry.coordinates.slice(1).map((coordinate, index) => ({
  road,
  index,
  start: road.geometry.coordinates[index],
  end: coordinate,
  startLocal: localPoint(road.geometry.coordinates[index]),
  endLocal: localPoint(coordinate),
  cuts: [
    { t: 0, point: localPoint(road.geometry.coordinates[index]) },
    { t: 1, point: localPoint(coordinate) },
  ],
})));

function cross([ax, ay], [bx, by]) {
  return ax * by - ay * bx;
}

function subtract([ax, ay], [bx, by]) {
  return [ax - bx, ay - by];
}

function addIntersections(left, right) {
  const directionA = subtract(left.endLocal, left.startLocal);
  const directionB = subtract(right.endLocal, right.startLocal);
  const denominator = cross(directionA, directionB);
  if (Math.abs(denominator) < 0.000001) return;
  const offset = subtract(right.startLocal, left.startLocal);
  const t = cross(offset, directionB) / denominator;
  const u = cross(offset, directionA) / denominator;
  if (t < 0.0001 || t > 0.9999 || u < 0.0001 || u > 0.9999) return;
  const point = [left.startLocal[0] + directionA[0] * t, left.startLocal[1] + directionA[1] * t];
  left.cuts.push({ t, point });
  right.cuts.push({ t: u, point });
}

for (let leftIndex = 0; leftIndex < graphSegments.length; leftIndex += 1) {
  const left = graphSegments[leftIndex];
  const leftMinX = Math.min(left.startLocal[0], left.endLocal[0]) - NODE_TOLERANCE_M;
  const leftMaxX = Math.max(left.startLocal[0], left.endLocal[0]) + NODE_TOLERANCE_M;
  const leftMinY = Math.min(left.startLocal[1], left.endLocal[1]) - NODE_TOLERANCE_M;
  const leftMaxY = Math.max(left.startLocal[1], left.endLocal[1]) + NODE_TOLERANCE_M;
  for (let rightIndex = leftIndex + 1; rightIndex < graphSegments.length; rightIndex += 1) {
    const right = graphSegments[rightIndex];
    if (Math.max(right.startLocal[0], right.endLocal[0]) + NODE_TOLERANCE_M < leftMinX) continue;
    if (Math.min(right.startLocal[0], right.endLocal[0]) - NODE_TOLERANCE_M > leftMaxX) continue;
    if (Math.max(right.startLocal[1], right.endLocal[1]) + NODE_TOLERANCE_M < leftMinY) continue;
    if (Math.min(right.startLocal[1], right.endLocal[1]) - NODE_TOLERANCE_M > leftMaxY) continue;
    addIntersections(left, right);
  }
}

const graphEdges = [];
for (const segment of graphSegments) {
  const cuts = segment.cuts
    .sort((left, right) => left.t - right.t)
    .filter((cut, index, values) => index === 0 || Math.hypot(cut.point[0] - values[index - 1].point[0], cut.point[1] - values[index - 1].point[1]) > 0.25);
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const startLocal = cuts[index].point;
    const endLocal = cuts[index + 1].point;
    const startCoordinate = geoPoint(startLocal);
    const endCoordinate = geoPoint(endLocal);
    const start = findOrCreateNode(startLocal);
    const end = findOrCreateNode(endLocal);
    start.connectedRoadIds.add(segment.road.properties.roadId);
    end.connectedRoadIds.add(segment.road.properties.roadId);
    start.degree += 1;
    end.degree += 1;
    const lengthM = geodesicDistanceM(startCoordinate, endCoordinate);
    if (lengthM < 0.5) continue;
    const allowedModes = segment.road.properties.class === "greenway"
      ? ["walk", "bike"]
      : ["walk", "bike", ...(segment.road.properties.class === "major" || segment.road.properties.class === "arterial" ? ["bus"] : []), "car"];
    graphEdges.push({
      edgeId: `edge-${segment.road.properties.roadId}-${segment.index + 1}-${index + 1}`,
      roadId: segment.road.properties.roadId,
      fromNodeId: `road-node-${start.index + 1}`,
      toNodeId: `road-node-${end.index + 1}`,
      lengthM: Number(lengthM.toFixed(2)),
      geometry: [startCoordinate, endCoordinate],
      allowedModes,
    });
  }
}

const roadNodes = nodeRecords.map((node) => {
  const uniqueRoadIds = unique([...node.connectedRoadIds]);
  const hasBridge = node.bridge || uniqueRoadIds.some((roadId) => isBridgeName(roadById.get(roadId)?.properties.name?.zh));
  const kind = hasBridge && uniqueRoadIds.length <= 2
    ? (node.degree > 1 ? "bridge-entry" : "bridge-exit")
    : uniqueRoadIds.length >= 3 || node.degree >= 3 ? "junction" : node.degree === 2 ? "turning" : "terminal";
  return {
    nodeId: `road-node-${node.index + 1}`,
    coordinate: geoPoint(node.local),
    kind,
    connectedRoadIds: uniqueRoadIds,
  };
});

const junctionFeatures = roadNodes
  .filter((node) => node.kind === "junction" || node.kind === "bridge-entry" || node.kind === "bridge-exit" || node.kind === "terminal")
  .map((node) => feature(node.nodeId, { type: "Point", coordinates: node.coordinate }, {
    nodeId: node.nodeId,
    kind: node.kind,
    connectedRoadIds: node.connectedRoadIds,
    armCount: node.connectedRoadIds.length,
    sourceRefs: ["osm"],
    confidence: node.connectedRoadIds.length >= 3 ? "triangulated" : "estimated",
  }));

const facilities = [];
for (const road of roadCorridorFeatures) {
  const coordinates = road.geometry.coordinates;
  if (road.properties.class !== "greenway") {
    facilities.push(feature(`${road.properties.roadId}-sidewalk-left`, { type: "LineString", coordinates }, {
      kind: "sidewalk",
      roadId: road.properties.roadId,
      side: "left",
      widthM: 1.8,
      offsetM: Number((road.properties.widthM / 2 + 1.15).toFixed(2)),
      sourceRefs: road.properties.sourceRefs,
      confidence: "estimated",
    }));
    facilities.push(feature(`${road.properties.roadId}-sidewalk-right`, { type: "LineString", coordinates }, {
      kind: "sidewalk",
      roadId: road.properties.roadId,
      side: "right",
      widthM: 1.8,
      offsetM: Number((road.properties.widthM / 2 + 1.15).toFixed(2)),
      sourceRefs: ["osm", "amap", "baidu-route-reference"],
      confidence: "estimated",
    }));
  } else {
    facilities.push(feature(`${road.properties.roadId}-shared-greenway`, { type: "LineString", coordinates }, {
      kind: "greenway",
      roadId: road.properties.roadId,
      side: "center",
      widthM: road.properties.widthM,
      offsetM: 0,
      sourceRefs: road.properties.sourceRefs,
      confidence: road.properties.confidence,
    }));
  }
  if (["major", "arterial", "collector"].includes(road.properties.class)) {
    facilities.push(feature(`${road.properties.roadId}-center-marking`, { type: "LineString", coordinates }, {
      kind: "centerline",
      roadId: road.properties.roadId,
      widthM: 0.16,
      dashM: road.properties.class === "collector" ? 2.5 : 4,
      gapM: road.properties.class === "collector" ? 6 : 8,
      sourceRefs: road.properties.sourceRefs,
      confidence: "estimated",
    }));
  }
}
for (const junction of junctionFeatures.filter((item) => item.properties.kind === "junction")) {
  facilities.push(feature(`${junction.id}-crossing`, { type: "Point", coordinates: junction.geometry.coordinates }, {
    kind: "junction-marking",
    nodeId: junction.properties.nodeId,
    widthM: 8,
    sourceRefs: ["osm", "amap", "baidu-route-reference"],
    confidence: "estimated",
  }));
}

const roadLengthM = roadCorridorFeatures.reduce((sum, road) => sum + polylineLengthM(road.geometry.coordinates), 0);
const namedRoads = unique(roadCorridorFeatures.map((road) => road.properties.name.zh).filter(Boolean));
const graphNodeIds = new Set(roadNodes.map((node) => node.nodeId));
const graphComponents = [];
const adjacency = new Map(roadNodes.map((node) => [node.nodeId, []]));
for (const edge of graphEdges) {
  adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
  adjacency.get(edge.toNodeId)?.push(edge.fromNodeId);
}
const unseen = new Set(graphNodeIds);
while (unseen.size) {
  const rootNode = unseen.values().next().value;
  const queue = [rootNode];
  unseen.delete(rootNode);
  let count = 0;
  while (queue.length) {
    const node = queue.shift();
    count += 1;
    for (const next of adjacency.get(node) ?? []) if (unseen.delete(next)) queue.push(next);
  }
  graphComponents.push(count);
}

const evidence = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  canonicalCrs: "EPSG:4326",
  coordinatePolicy: {
    storage: "WGS84 / EPSG:4326",
    amapInput: "GCJ-02; convert before comparing or storing",
    baiduInput: "BD-09LL or GCJ-02 depending on endpoint; convert before comparing or storing",
    conversion: "Offline source records retain original CRS; runtime never mixes provider coordinates.",
  },
  sourcePolicy: "Amap and Baidu are offline reference sources. Provider tiles, photos, API keys and undocumented payloads are not redistributed.",
  sources: [
    {
      id: "osm",
      title: "OpenStreetMap Jiangxinzhou road centerlines",
      type: "open-data",
      date: manifest.snapshot,
      url: "https://www.openstreetmap.org/relation/11630502",
      license: "ODbL",
      verifies: ["road centerline seed", "junction vertices", "island road network"],
    },
    {
      id: "amap",
      title: "高德地图路线规划与道路名称参考",
      type: "map-route-reference",
      date: "2026-08-13-accessed",
      url: "https://lbs.amap.com/api/web-service/guide/routes",
      verifies: ["road names", "route segment names", "multi-modal route behavior"],
      redistribution: "reference-only",
      notes: "Amap route outputs are time-sensitive; this build stores reconciled geometry rather than provider payloads.",
    },
    {
      id: "baidu-coordinate",
      title: "百度地图坐标系与坐标转换文档",
      type: "coordinate-reference",
      date: "2026-08-13-accessed",
      url: "https://lbs.baidu.com/docs/android?title=androidsdk%2Fguide%2Ftool%2Fcoordinate",
      verifies: ["BD-09/GCJ-02/WGS84 conversion policy"],
      redistribution: "reference-only",
    },
    {
      id: "baidu-route-reference",
      title: "百度地图公开路线规划参考",
      type: "public-route-reference",
      date: "2026-08-13-accessed",
      url: "https://map.baidu.com/mobile/webapp/drive/list",
      verifies: ["regional approach-road naming", "route-step naming format"],
      redistribution: "reference-only",
      notes: "Public route result is used as a contextual cross-check; it is not treated as complete island geometry.",
    },
    {
      id: "baidu-direction",
      title: "百度地图驾车/骑行路线 API 文档",
      type: "map-route-reference",
      date: "2026-08-13-accessed",
      url: "https://lbsyun.baidu.com/docs/webapi?title=directionv2%2Fwebservice-direction%2Fdirve",
      verifies: ["road names in route steps", "waypoint route validation"],
      redistribution: "reference-only",
      notes: "No client-side AK is embedded. A future licensed rebuild can append API snapshots without changing the schema.",
    },
    {
      id: "nanjing-official",
      title: "南京市江心洲生态文旅资料",
      type: "government",
      date: "2025-12-03",
      url: "https://www.nanjing.gov.cn/xxgkn/jytabljggk/2025njytabl/shizxta/202512/t20251203_5704828.html",
      verifies: ["22.5 km embankment road", "island-scale road context"],
    },
  ],
  reconciliation: {
    namedRoadCount: namedRoads.length,
    namedRoads,
    amapGeometryQuery: "not embedded; source names and route semantics recorded from offline review",
    baiduGeometryQuery: "not embedded without licensed AK; public route and official conversion docs recorded",
    sourceAgreementPolicy: "dual-confirmed is reserved for a future build with both provider route snapshots; current named geometry is amap-confirmed + OSM-derived and Baidu is contextual reference.",
  },
};

const roadGraph = {
  version: VERSION,
  canonicalCrs: "EPSG:4326",
  nodeToleranceM: NODE_TOLERANCE_M,
  nodes: roadNodes,
  edges: graphEdges,
  metrics: {
    corridorCount: roadCorridorFeatures.length,
    edgeCount: graphEdges.length,
    nodeCount: roadNodes.length,
    junctionCount: junctionFeatures.length,
    connectedComponents: graphComponents.length,
    componentSizes: graphComponents.sort((a, b) => b - a),
    totalCenterlineLengthM: Number(roadLengthM.toFixed(2)),
  },
};

const roadManifest = {
  version: VERSION,
  title: { zh: "江心洲独立道路基础设施层", en: "Jiangxinzhou Independent Road Infrastructure Layer" },
  snapshot: "2026-08-13",
  canonicalCrs: "EPSG:4326",
  projection: manifest.projection,
  sourcePolicy: evidence.sourcePolicy,
  counts: {
    corridors: roadCorridorFeatures.length,
    junctions: junctionFeatures.length,
    facilities: facilities.length,
    graphNodes: roadNodes.length,
    graphEdges: graphEdges.length,
    namedRoads: namedRoads.length,
  },
  metrics: roadGraph.metrics,
  layers: {
    corridors: "road-corridors.geojson",
    junctions: "road-junctions.geojson",
    facilities: "road-facilities.geojson",
    graph: "road-network.graph.json",
    evidence: "road-evidence.json",
  },
};

const aggregate = { manifest: roadManifest, corridors: collection(roadCorridorFeatures), junctions: collection(junctionFeatures), facilities: collection(facilities), graph: roadGraph, evidence };
const outputs = {
  "road-corridors.geojson": aggregate.corridors,
  "road-junctions.geojson": aggregate.junctions,
  "road-facilities.geojson": aggregate.facilities,
  "road-network.graph.json": roadGraph,
  "road-evidence.json": evidence,
  "road-manifest.json": roadManifest,
  "road-layer.json": aggregate,
};
await Promise.all(Object.entries(outputs).map(([name, value]) => writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`)));
const updatedManifest = { ...manifest, layers: { ...manifest.layers, roadLayer: "road-layer/road-manifest.json" } };
const runtimePath = path.join(dataDir, "runtime.json");
const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
runtime.manifest = updatedManifest;
await Promise.all([
  writeFile(path.join(dataDir, "manifest.json"), `${JSON.stringify(updatedManifest, null, 2)}\n`),
  writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`),
]);
console.log(`Generated road layer ${VERSION}: ${roadCorridorFeatures.length} corridors, ${junctionFeatures.length} junctions, ${facilities.length} facilities, ${graphEdges.length} graph edges, ${graphComponents.length} components.`);
