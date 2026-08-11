import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { metersPerDegreeAt, polygonAreaM2, polylineLengthM } from "./lib/geodesy.mjs";

const root = process.cwd();
const legacy = JSON.parse(await readFile(path.join(root, "data/jiangxinzhou-map.json"), "utf8"));
const outputDir = path.join(root, "data/jiangxinzhou-v2");
await mkdir(outputDir, { recursive: true });

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSM_RELATION_AREA = 3611630502;
const VERSION = "2026-08-11.1";

const outOfChina = (lng, lat) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
const transformLat = (x, y) => {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  value += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return value;
};
const transformLng = (x, y) => {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  value += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return value;
};
function gcj02ToWgs84([lng, lat]) {
  if (outOfChina(lng, lat)) return [lng, lat];
  const a = 6378245;
  const ee = 0.006693421622965943;
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [Number((lng * 2 - (lng + dLng)).toFixed(7)), Number((lat * 2 - (lat + dLat)).toFixed(7))];
}

function feature(id, geometry, properties) {
  return { type: "Feature", id, geometry, properties: { id, ...properties } };
}
const collection = (features) => ({ type: "FeatureCollection", features });

async function fetchBuildings() {
  const query = `[out:json][timeout:60];way(area:${OSM_RELATION_AREA})[building];out tags geom;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "JiangxinzhouDigitalTwin/2.0" },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) throw new Error(`Overpass failed: ${response.status}`);
  return response.json();
}

const signedAreaMeters = polygonAreaM2;

function buildingProfile(tags, areaM2) {
  const explicitHeight = Number.parseFloat(tags.height);
  const explicitLevels = Number.parseFloat(tags["building:levels"]);
  if (Number.isFinite(explicitHeight)) return { heightM: explicitHeight, levels: Math.max(1, Math.round(explicitHeight / 3.4)), heightMethod: "osm-height", confidence: "triangulated" };
  if (Number.isFinite(explicitLevels)) return { heightM: explicitLevels * 3.4, levels: explicitLevels, heightMethod: "osm-levels", confidence: "triangulated" };
  const levels = areaM2 > 2500 ? 7 : areaM2 > 1200 ? 5 : areaM2 > 500 ? 4 : areaM2 > 180 ? 3 : 2;
  return { heightM: levels * 3.4, levels, heightMethod: "footprint-area-estimate", confidence: "estimated" };
}

let osm;
try {
  osm = await fetchBuildings();
} catch (error) {
  const cachePath = path.join(outputDir, "overpass-buildings-cache.json");
  console.warn(`${error.message}; using ${cachePath}`);
  osm = JSON.parse(await readFile(cachePath, "utf8"));
}
await writeFile(path.join(outputDir, "overpass-buildings-cache.json"), `${JSON.stringify(osm)}\n`);

const buildingFeatures = osm.elements.map((element) => {
  const ring = element.geometry.map(({ lon, lat }) => [lon, lat]);
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push(ring[0]);
  const areaM2 = signedAreaMeters(ring);
  const profile = buildingProfile(element.tags ?? {}, areaM2);
  const zhName = element.tags?.["name:zh"] ?? element.tags?.name ?? null;
  const enName = element.tags?.["name:en"] ?? null;
  return feature(`osm-building-${element.id}`, { type: "Polygon", coordinates: [ring] }, {
    name: { zh: zhName, en: enName },
    category: element.tags?.building ?? "yes",
    source: "OpenStreetMap",
    sourceId: element.id,
    sourceCrs: "EPSG:4326",
    areaM2: Math.round(areaM2),
    lod: zhName ? 1 : 0,
    status: "existing",
    ...profile,
  });
});

const islandRing = [...legacy.island.boundary];
if (islandRing[0][0] !== islandRing.at(-1)[0] || islandRing[0][1] !== islandRing.at(-1)[1]) islandRing.push(islandRing[0]);
const measuredIslandAreaKm2 = polygonAreaM2(islandRing) / 1_000_000;
const measuredIslandBoundaryKm = polylineLengthM(islandRing) / 1_000;
const island = collection([
  feature("jiangxinzhou-island", { type: "Polygon", coordinates: [islandRing] }, {
    name: { zh: "江心洲", en: "Jiangxinzhou" },
    officialAreaKm2: 15.21,
    measuredGeometryAreaKm2: Number(measuredIslandAreaKm2.toFixed(6)),
    measuredGeometryBoundaryKm: Number(measuredIslandBoundaryKm.toFixed(6)),
    source: "OpenStreetMap boundary cross-checked with Amap and Google Earth",
    sourceCrs: "EPSG:4326",
    confidence: "triangulated",
    status: "existing",
  }),
]);

const roadFeatures = legacy.roads.flatMap((road) => road.segments.map((segment, index) => feature(
  `${road.id}-${index}`,
  { type: "LineString", coordinates: segment },
  {
    name: { zh: road.name, en: null },
    class: road.class,
    // The legacy value was a visual scale token (0.035—0.22), not metres.
    widthM: ({ major: 22, arterial: 16, collector: 10.5, local: 6, greenway: 3.5 })[road.class],
    renderWidthPx: ({ major: 3.5, arterial: 2.8, collector: 2.1, local: 1.15, greenway: 2.4 })[road.class],
    source: road.source,
    sourceCrs: "EPSG:4326",
    confidence: "triangulated",
    status: "existing",
  },
)));

const landmarkEnglish = {
  "jiangxinzhou-center": "Jiangxinzhou",
  "jiangxinzhou-metro": "Jiangxinzhou Metro Station",
  "nanjing-eye": "Nanjing Eye Pedestrian Bridge",
  "qingao-forest-park": "Qing'ao Forest Park",
  "dolphin-center": "Yangtze Finless Porpoise Science & Education Center",
  "e3-park": "Jiangdao Smart Cube · E³ PARK",
  "water-center": "Sembcorp International Water Center",
  "xiaokenting-lighthouse": "Xiaokenting Lighthouse Group",
  "rocho-cafe": "ROCHO Lighthouse Café",
  chapel: "Jiangxinzhou Christian Church",
  riverwalk: "Riverside Embankment Walk",
  "pink-field": "Riverside Pink Muhly Field",
  "seasonal-garden": "Pond Cypress Seasonal Garden",
};
const highDetailIds = new Set(["nanjing-eye", "xiaokenting-lighthouse", "rocho-cafe", "dolphin-center", "water-center", "e3-park", "chapel"]);
const correctedEstimatedCoordinates = {
  "xiaokenting-lighthouse": [118.7075, 32.0524],
  "seasonal-garden": [118.6812, 32.0191],
};
const landmarkFeatures = legacy.anchors.map((anchor) => {
  const isGcj = anchor.confidence === "verified";
  const osmChurchCoordinate = [118.6872599, 32.0247363];
  const sourceCoordinate = correctedEstimatedCoordinates[anchor.id] ?? anchor.coordinates;
  const coordinates = anchor.id === "chapel" ? osmChurchCoordinate : isGcj ? gcj02ToWgs84(sourceCoordinate) : sourceCoordinate;
  const churchVerified = anchor.id === "chapel";
  return feature(anchor.id, { type: "Point", coordinates }, {
    name: { zh: anchor.id === "chapel" ? "基督教江心洲堂" : anchor.name, en: landmarkEnglish[anchor.id] ?? anchor.name },
    category: anchor.type,
    modelKey: anchor.modelKey ?? null,
    lod: highDetailIds.has(anchor.id) ? 2 : 1,
    status: "existing",
    confidence: anchor.confidence === "verified" || churchVerified ? "triangulated" : "estimated",
    source: churchVerified ? "OpenStreetMap named building footprint cross-checked with guide map" : anchor.source,
    sourceUrl: churchVerified ? "https://www.openstreetmap.org/way/1092530479" : anchor.sourceUrl ?? null,
    sourceCoordinate: churchVerified ? osmChurchCoordinate : sourceCoordinate,
    sourceCrs: isGcj ? "GCJ-02" : "EPSG:4326",
  });
});

const landscapes = collection(legacy.zones.map((zone) => feature(zone.id, { type: "Polygon", coordinates: [[...zone.polygon, zone.polygon[0]]] }, {
  name: { zh: zone.name, en: zone.id === "north-green-belt" ? "Northern ecological belt" : zone.id === "central-innovation-axis" ? "Central innovation green axis" : "Southern forest garden" },
  category: zone.kind,
  color: zone.color,
  opacity: zone.opacity,
  source: zone.source,
  sourceCrs: "EPSG:4326",
  confidence: "estimated",
  status: "existing",
})));

const evidence = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  policy: {
    canonicalCrs: "EPSG:4326",
    renderProjection: "WGS84 local equirectangular metres",
    precision: "public visitor map; not cadastral or survey grade",
    redistribution: "Reference imagery is not redistributed. Runtime geometry is original or OpenStreetMap ODbL data.",
    confidence: {
      triangulated: "Position or form checked against at least two independent references.",
      estimated: "Position, height, or form is inferred and disclosed in the interface.",
      planned: "Officially announced or under construction; hidden from the default current-state layer.",
    },
  },
  sources: [
    { id: "amap", title: "高德地图江心洲", type: "map", date: "2026-08-09", url: "https://ditu.amap.com/search?query=%E6%B1%9F%E5%BF%83%E6%B4%B2&city=320100", verifies: ["POI", "road names", "relative position", "map scale"], redistribution: "reference-only" },
    { id: "google-earth", title: "Google Earth Jiangxinzhou", type: "satellite", imageryDate: "2024-10-04", url: "https://earth.google.com/web/search/Jiangxinzhou,+Nanjing,+Jiangsu,+China", verifies: ["shoreline", "footprints", "roof forms", "vegetation massing"], redistribution: "reference-only" },
    { id: "osm", title: "OpenStreetMap relation 11630502", type: "open-data", date: "2026-08-09", url: "https://www.openstreetmap.org/relation/11630502", license: "ODbL", verifies: ["boundary", "roads", "building footprints"] },
    { id: "nanjing-2025", title: "南京市政府江心洲生态文旅资料", type: "government", date: "2025-12-03", url: "https://www.nanjing.gov.cn/xxgkn/jytabljggk/2025njytabl/shizxta/202512/t20251203_5704828.html", verifies: ["15.21 km² area", "22.5 km embankment road", "landscape inventory"] },
    { id: "nanjing-eye", title: "南京眼步行桥项目资料", type: "government", date: "2025-09-03", url: "https://gjzx.nanjing.gov.cn/xmqk/qabxq/202509/t20250903_5641986.html", verifies: ["240 m main span", "twin inclined elliptical towers", "cable-stayed structure"] },
    { id: "rocho", title: "新华社 ROCHO 灯塔咖啡", type: "media", date: "2024-11-28", url: "https://js.news.cn/20241128/15a557840dbe42dc8c853055a6e64270/c.html", verifies: ["circular massing", "orange-pink stairs", "waterfront setting"] },
    { id: "wetland", title: "新华社江心洲池杉与青奥森林公园", type: "media", date: "2025-03-29", url: "https://js.news.cn/20250329/2cddff261f45494281cb2214e7b2f1e7/c.html", verifies: ["pond cypress wetland", "Qing'ao Forest Park", "greenway"] },
    { id: "school", title: "金陵中学江心洲校区", type: "media", date: "2023-05-26", url: "https://js.news.cn/2023-05/26/c_1129647670.htm", verifies: ["campus position", "garden/courtyard layout", "building massing"] },
    { id: "sembcorp", title: "胜科国际水务中心", type: "institution", date: "2016", url: "https://www.sembcorp.com/cn/news/news-landing/2016/%E5%8D%97%E4%BA%AC%E5%9B%BD%E9%99%85%E6%B0%B4%E5%8A%A1%E4%B8%AD%E5%BF%83%E5%9C%A8%E5%8D%97%E4%BA%AC%E6%B1%9F%E5%BF%83%E6%B4%B2%E4%B8%BE%E8%A1%8C%E5%A5%A0%E5%9F%BA%E4%BB%AA%E5%BC%8F/", verifies: ["site area", "program", "campus identity"] },
  ],
};

const origin = gcj02ToWgs84(legacy.reference.origin);
const projectionScale = metersPerDegreeAt(origin[1]);
const manifest = {
  version: VERSION,
  title: { zh: "南京江心洲3D时空", en: "Nanjing Jiangxinzhou 3D Time-Space" },
  snapshot: "2026-08-11",
  canonicalCrs: "EPSG:4326",
  origin,
  units: "metres",
  projection: {
    method: "WGS84-local-equirectangular",
    metersPerDegreeLongitude: projectionScale.longitude,
    metersPerDegreeLatitude: projectionScale.latitude,
  },
  officialAreaKm2: 15.21,
  officialEmbankmentKm: 22.5,
  geometryMetrics: {
    islandAreaKm2: Number(measuredIslandAreaKm2.toFixed(6)),
    islandBoundaryKm: Number(measuredIslandBoundaryKm.toFixed(6)),
  },
  counts: { buildings: buildingFeatures.length, roads: roadFeatures.length, landmarks: landmarkFeatures.length },
  layers: {
    island: "island.geojson",
    roads: "roads.geojson",
    buildings: "buildings.geojson",
    landmarks: "landmarks.geojson",
    landscapes: "landscapes.geojson",
    evidence: "evidence.json",
  },
};

const outputs = {
  "manifest.json": manifest,
  "island.geojson": island,
  "roads.geojson": collection(roadFeatures),
  "buildings.geojson": collection(buildingFeatures),
  "landmarks.geojson": collection(landmarkFeatures),
  "landscapes.geojson": landscapes,
  "evidence.json": evidence,
  "runtime.json": { manifest, island, roads: collection(roadFeatures), landmarks: collection(landmarkFeatures), landscapes, evidence },
};
await Promise.all(Object.entries(outputs).map(([name, value]) => writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`)));
console.log(`Generated Jiangxinzhou V2 ${VERSION}: ${buildingFeatures.length} buildings, ${roadFeatures.length} roads, ${landmarkFeatures.length} landmarks.`);
