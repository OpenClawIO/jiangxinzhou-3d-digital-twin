import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { geodesicDistanceM, polylineLengthM } from "./lib/geodesy.mjs";

const root = process.cwd();
const outputDir = path.join(root, "data/jiangxinzhou-v2");
await mkdir(outputDir, { recursive: true });
const roadsPath = path.join(outputDir, "roads.geojson");
const roads = JSON.parse(await readFile(roadsPath, "utf8"));

const snapshot = "2026-08-09";
const feature = (id, geometry, properties) => ({ type: "Feature", id, geometry, properties: { id, ...properties } });
const collection = (features) => ({ type: "FeatureCollection", features });

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

const stopDefinitions = [
  ["park-tanyuan", "公园道·檀园", "Park Avenue · Tan Garden", [118.7061, 32.0508], "bus", "estimated"],
  ["park-huayuan", "公园道·桦园", "Park Avenue · Birch Garden", [118.7044, 32.0488], "bus", "estimated"],
  ["jinji-huizhi", "金基汇智园", "Jinji Huizhi Park", [118.7026, 32.0477], "bus", "estimated"],
  ["changdao-north", "长岛观澜沁园北", "Changdao Guanlan Qinyuan North", [118.7031, 32.0446], "bus", "estimated"],
  ["changdao-east", "长岛观澜沁园东", "Changdao Guanlan Qinyuan East", [118.707977, 32.041853], "bus", "triangulated", "GCJ-02"],
  ["zijing-north", "紫荆公馆北", "Zijing Residence North", [118.7049, 32.0411], "bus", "estimated"],
  ["zijing-south", "紫荆公馆南", "Zijing Residence South", [118.7012, 32.0388], "bus", "estimated"],
  ["weather-bureau", "市气象局", "Municipal Meteorological Bureau", [118.6991, 32.0364], "bus", "estimated"],
  ["jiangxinzhou-metro-bus", "江心洲地铁站", "Jiangxinzhou Metro Bus Stop", [118.703401, 32.031758], "interchange", "triangulated", "GCJ-02"],
  ["jiangxinzhou-metro", "江心洲站", "Jiangxinzhou Station", [118.703335, 32.031632], "metro", "triangulated", "GCJ-02"],
  ["jiangxinzhou-terminal", "江心洲总站", "Jiangxinzhou Bus Terminal", [118.6962, 32.0319], "terminal", "estimated"],
  ["lanjiang-zhongxin", "揽江街·中新大道", "Lanjiang Street · Zhongxin Avenue", [118.6944, 32.0302], "bus", "estimated"],
  ["green-island-west", "绿洲新岛西", "Green Island West", [118.6917, 32.0291], "bus", "estimated"],
  ["green-island-qingshan", "揽江街·绿洲新岛青杉园", "Lanjiang Street · Qingshan Garden", [118.6921, 32.0283], "shuttle", "estimated"],
  ["redstar-green-home", "红星街·洲岛家园绿洲苑", "Red Star Street · Green Home", [118.6927, 32.0268], "shuttle", "estimated"],
  ["primary-school", "生态科技岛小学", "Eco-Tech Island Primary School", [118.6915, 32.0252], "bus", "estimated"],
  ["fanghua-north", "芳华苑北", "Fanghua Garden North", [118.6911, 32.0224], "bus", "estimated"],
  ["zhongxin-minan", "中新大道·民安路", "Zhongxin Avenue · Min'an Road", [118.6871, 32.0141], "bus", "estimated"],
  ["wentai-east", "文泰街东", "Wentai Street East", [118.6928, 32.0103], "bus", "estimated"],
  ["huandao-wentai", "环岛东路·文泰街", "Island East Road · Wentai Street", [118.6954, 32.0089], "bus", "estimated"],
  ["qingao-north", "青奥森林公园北", "Qing'ao Forest Park North", [118.6935, 32.0061], "bus", "estimated"],
  ["longen-xiyi", "龙恩街·熙怡路", "Long'en Street · Xiyi Road", [118.6882, 32.0048], "bus", "estimated"],
  ["longen-middle", "龙恩街中", "Long'en Street Middle", [118.6840, 32.0062], "bus", "estimated"],
  ["heping-garden", "洲岛和园·和平苑", "Zhoudao Heyuan · Heping Garden", [118.685087, 32.007652], "bus", "triangulated", "GCJ-02"],
  ["huandao-fenglin", "环岛西路·风林街", "Island West Road · Fenglin Street", [118.6777, 32.0032], "bus", "estimated"],
  ["jiangxin-impression", "江心印园西", "Jiangxin Impression West", [118.6773, 32.0017], "bus", "estimated"],
  ["xingyuan-west", "洲岛兴园·兴锦苑西", "Zhoudao Xingyuan · Xingjin West", [118.6768, 31.9999], "bus", "estimated"],
  ["huijin-east", "汇锦国际东", "Huijin International East", [118.6796, 31.9978], "bus", "estimated"],
  ["bridge-east", "江心洲大桥东", "Jiangxinzhou Bridge East", [118.6742, 31.9987], "terminal", "estimated"],
  ["jiangxinzhou-south", "江心洲南", "Jiangxinzhou South", [118.6718, 31.9953], "terminal", "estimated"],
  ["qigan-pier", "旗杆渡口", "Qigan Ferry Pier", [118.6975913, 32.009866], "ferry", "triangulated"],
  ["mianhuadi-pier", "棉花堤渡口", "Mianhuadi Ferry Pier", [118.6999968, 32.0087366], "ferry", "triangulated"],
  ["porpoise-center-stop", "江豚科教中心", "Finless Porpoise Center", [118.7114518, 32.0469491], "tourism", "estimated"],
  ["xiaokenting-stop", "小垦丁灯塔", "Xiaokenting Lighthouse", [118.7075, 32.0524], "tourism", "estimated"],
  ["rocho-stop", "ROCHO灯塔咖啡", "ROCHO Lighthouse Café", [118.7115, 32.0525], "tourism", "estimated"],
  ["imo-stop", "iMO江岛新天地", "iMO Jiangdao New World", [118.6992, 32.0399], "shuttle", "estimated"],
  ["e3-park-stop", "E³ PARK体育公园", "E³ PARK Sports Park", [118.7125401, 32.0494233], "tourism", "estimated"],
  ["church-stop", "基督教江心洲堂", "Jiangxinzhou Christian Church", [118.6872599, 32.0247363], "tourism", "estimated"],
  ["pink-field-stop", "粉黛花海", "Pink Muhly Field", [118.6868, 32.0042], "tourism", "estimated"],
  ["cypress-stop", "池杉林四季花海", "Pond Cypress Garden", [118.6812, 32.0191], "tourism", "estimated"],
  ["city-portal", "夹江大桥·河西方向", "Jiajiang Bridge · Hexi", [118.7118, 32.0334], "portal", "estimated"],
  ["metro-greenexpo", "绿博园站", "Lüboyuan Station", [118.7102574, 32.0268513], "metro", "triangulated"],
  ["metro-linjiang", "临江·青奥体育公园站", "Linjiang · Youth Olympic Sports Park", [118.660314, 32.059584], "metro", "triangulated"],
];

const stopFeatures = stopDefinitions.map(([id, zh, en, coordinate, kind, confidence, sourceCrs = "EPSG:4326"]) => {
  const canonical = sourceCrs === "GCJ-02" ? gcj02ToWgs84(coordinate) : coordinate;
  return feature(id, { type: "Point", coordinates: canonical }, {
    name: { zh, en }, kind, confidence, status: "existing", sourceCrs,
    sourceCoordinate: coordinate,
    source: confidence === "triangulated" ? "Amap/OSM cross-check" : "Official stop order snapped to verified road corridor",
    snapshot,
  });
});
const stops = new Map(stopFeatures.map((item) => [item.id, item]));

const lineDefinitions = [
  { id: "metro-10", ref: "10", mode: "metro", color: "#d6b36a", zh: "地铁10号线", en: "Metro Line 10", status: "existing", service: "05:56—23:58（江心洲站双向范围）", stops: ["metro-greenexpo", "jiangxinzhou-metro", "metro-linjiang"], source: "Amap + Nanjing Metro/OSM", model: "metro-line10" },
  { id: "bus-486", ref: "486", mode: "bus", color: "#ef6b4a", zh: "公交486路", en: "Bus 486", status: "existing", service: "06:00—20:30", stops: ["park-tanyuan", "zijing-north", "changdao-east", "zijing-south", "weather-bureau", "jiangxinzhou-metro-bus", "lanjiang-zhongxin", "primary-school", "fanghua-north", "zhongxin-minan", "wentai-east", "huandao-wentai", "qingao-north", "longen-xiyi", "longen-middle", "heping-garden", "huandao-fenglin", "bridge-east", "jiangxinzhou-south"], source: "2026 route listing cross-checked with Amap", model: "city-bus" },
  { id: "bus-552", ref: "552", mode: "bus", color: "#e14355", zh: "公交552路", en: "Bus 552", status: "existing", service: "江心洲总站05:20—21:40", stops: ["jiangxinzhou-terminal", "primary-school", "fanghua-north", "green-island-west", "jiangxinzhou-metro-bus", "weather-bureau", "city-portal"], source: "Nanjing government + 2026 route listing", model: "city-bus" },
  { id: "bus-552-short", ref: "552区间", mode: "bus", color: "#f09a46", zh: "公交552路区间", en: "Bus 552 Short", status: "existing", service: "工作日早晚高峰", stops: ["qigan-pier", "qingao-north", "heping-garden", "primary-school", "jiangxinzhou-metro-bus", "weather-bureau", "zijing-south", "changdao-east", "zijing-north", "park-tanyuan", "park-huayuan", "changdao-north", "jinji-huizhi"], source: "Nanjing Bus 2026-01-16 notice", model: "city-bus" },
  { id: "bus-553-outer", ref: "553外圈", mode: "bus", color: "#7f6de0", zh: "公交553路外圈", en: "Bus 553 Outer Loop", status: "existing", service: "06:30—19:00", stops: ["jiangxinzhou-south", "city-portal", "weather-bureau", "jiangxinzhou-metro-bus", "green-island-qingshan", "redstar-green-home", "huandao-fenglin", "jiangxin-impression", "xingyuan-west", "huijin-east", "bridge-east", "jiangxinzhou-south"], source: "Nanjing Bus 2026-06-03 adjustment + Amap", model: "city-bus" },
  { id: "bus-553-inner", ref: "553内圈", mode: "bus", color: "#9a84ee", zh: "公交553路内圈", en: "Bus 553 Inner Loop", status: "existing", service: "06:30—19:00", stops: ["jiangxinzhou-south", "bridge-east", "huijin-east", "xingyuan-west", "jiangxin-impression", "huandao-fenglin", "redstar-green-home", "green-island-qingshan", "jiangxinzhou-metro-bus", "weather-bureau", "city-portal", "jiangxinzhou-south"], source: "Nanjing Bus 2026-06-03 adjustment + Amap", model: "city-bus" },
  { id: "shuttle-new-energy", ref: "接驳1号线", mode: "shuttle", color: "#31b7a2", zh: "园区新能源接驳线", en: "Park New-Energy Shuttle", status: "existing", service: "全年免费 · 约10—20分钟", stops: ["qingao-north", "heping-garden", "redstar-green-home", "jiangxinzhou-metro-bus", "weather-bureau", "primary-school", "jinji-huizhi", "zijing-north", "changdao-east", "imo-stop", "jiangxinzhou-metro-bus", "redstar-green-home", "heping-garden", "qingao-north"], source: "Eco-Tech Island public service information + Amap", model: "autonomous-shuttle" },
  { id: "shuttle-island-city", ref: "岛城接驳", mode: "shuttle", color: "#2f8ec9", zh: "生态科技岛—岛城接驳线", en: "Island–City Shuttle", status: "existing", service: "工作日07:00—19:00 · 约60分钟", stops: ["wentai-east", "zhongxin-minan", "redstar-green-home", "jiangxinzhou-metro-bus", "green-island-qingshan", "imo-stop", "city-portal"], source: "Jianye Government 2026-06-01 adjustment", model: "shuttle-bus" },
  { id: "tour-north", ref: "观光北线", mode: "tourism", color: "#40a872", zh: "假日环岛观光北线", en: "Holiday Sightseeing North", status: "existing", service: "周末及法定节假日 · 预约制", stops: ["jiangxinzhou-metro-bus", "imo-stop", "rocho-stop", "xiaokenting-stop", "porpoise-center-stop", "park-tanyuan", "jinji-huizhi", "jiangxinzhou-metro-bus"], source: "Jiangxinzhou public visitor information; stop positions estimated", model: "autonomous-shuttle" },
  { id: "tour-south", ref: "观光南线", mode: "tourism", color: "#76ad43", zh: "假日环岛观光南线", en: "Holiday Sightseeing South", status: "existing", service: "周末及法定节假日 · 预约制", stops: ["jiangxinzhou-metro-bus", "church-stop", "e3-park-stop", "cypress-stop", "pink-field-stop", "qigan-pier", "qingao-north", "heping-garden", "huandao-fenglin", "bridge-east", "jiangxinzhou-south", "zhongxin-minan", "primary-school", "green-island-qingshan", "jiangxinzhou-metro-bus"], source: "Jiangxinzhou public visitor information; stop positions estimated", model: "autonomous-shuttle" },
  { id: "ferry-qigan", ref: "轮渡", mode: "ferry", color: "#3f9fc4", zh: "棉花堤—旗杆渡口", en: "Mianhuadi–Qigan Ferry", status: "existing", service: "以当日航班公告为准", stops: ["qigan-pier", "mianhuadi-pier"], source: "Nanjing government + OSM GPS", model: "passenger-ferry" },
  { id: "cycle-loop", ref: "22.5 km", mode: "cycle", color: "#d6be56", zh: "环岛江堤骑行环线", en: "22.5 km Island Cycling Loop", status: "existing", service: "全天开放（活动管制除外）", stops: ["xiaokenting-stop", "rocho-stop", "qigan-pier", "qingao-north", "pink-field-stop", "jiangxinzhou-south", "porpoise-center-stop", "xiaokenting-stop"], source: "Nanjing Government 22.5 km embankment reference", model: null },
];

const serviceEnglish = {
  "metro-10": "05:56—23:58 (two-way range at Jiangxinzhou Station)",
  "bus-486": "06:00—20:30",
  "bus-552": "Jiangxinzhou Terminal 05:20—21:40",
  "bus-552-short": "Weekday morning and evening peaks",
  "bus-553-outer": "06:30—19:00",
  "bus-553-inner": "06:30—19:00",
  "shuttle-new-energy": "Free year-round · about every 10—20 min",
  "shuttle-island-city": "Weekdays 07:00—19:00 · about every 60 min",
  "tour-north": "Weekends and public holidays · reservation required",
  "tour-south": "Weekends and public holidays · reservation required",
  "ferry-qigan": "Refer to same-day sailing notices",
  "cycle-loop": "Open all day except during event controls",
};

const nodeKey = ([longitude, latitude]) => `${longitude.toFixed(7)},${latitude.toFixed(7)}`;
const graph = new Map();
const coordinatesByKey = new Map();
const connect = (from, to) => {
  const fromKey = nodeKey(from);
  const toKey = nodeKey(to);
  coordinatesByKey.set(fromKey, from);
  coordinatesByKey.set(toKey, to);
  const neighbors = graph.get(fromKey) ?? [];
  neighbors.push({ key: toKey, weight: geodesicDistanceM(from, to) });
  graph.set(fromKey, neighbors);
};
for (const road of roads.features) {
  const coordinates = road.geometry.coordinates;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    connect(coordinates[index], coordinates[index + 1]);
    connect(coordinates[index + 1], coordinates[index]);
  }
}

function nearestRoadNode(coordinate) {
  let bestKey = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [key, candidate] of coordinatesByKey) {
    const distance = geodesicDistanceM(coordinate, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  }
  return { key: bestKey, distance: bestDistance };
}

function shortestRoadPath(startCoordinate, endCoordinate) {
  const start = nearestRoadNode(startCoordinate);
  const end = nearestRoadNode(endCoordinate);
  if (!start.key || !end.key || start.distance > 500 || end.distance > 500) return null;
  const distances = new Map([[start.key, 0]]);
  const previous = new Map();
  const unvisited = new Set(graph.keys());
  while (unvisited.size > 0) {
    let current = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const key of unvisited) {
      const distance = distances.get(key) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = key;
        currentDistance = distance;
      }
    }
    if (current === null || currentDistance === Number.POSITIVE_INFINITY) return null;
    if (current === end.key) break;
    unvisited.delete(current);
    for (const neighbor of graph.get(current) ?? []) {
      if (!unvisited.has(neighbor.key)) continue;
      const candidate = currentDistance + neighbor.weight;
      if (candidate < (distances.get(neighbor.key) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.key, candidate);
        previous.set(neighbor.key, current);
      }
    }
  }
  const keys = [end.key];
  while (keys[0] !== start.key) {
    const predecessor = previous.get(keys[0]);
    if (!predecessor) return null;
    keys.unshift(predecessor);
  }
  return [startCoordinate, ...keys.map((key) => coordinatesByKey.get(key)), endCoordinate];
}

function routeAlongRoads(stopIds) {
  const output = [];
  let derivedSegments = 0;
  for (let index = 0; index < stopIds.length - 1; index += 1) {
    const start = stops.get(stopIds[index]).geometry.coordinates;
    const end = stops.get(stopIds[index + 1]).geometry.coordinates;
    const path = shortestRoadPath(start, end);
    const segment = path ?? [start, end];
    if (path) derivedSegments += 1;
    output.push(...(index === 0 ? segment : segment.slice(1)));
  }
  return { coordinates: output, complete: derivedSegments === stopIds.length - 1 };
}

function stitchedEmbankmentLoop() {
  const remaining = roads.features
    .filter((road) => road.properties.name.zh === "江堤路")
    .map((road) => [...road.geometry.coordinates]);
  const output = remaining.shift() ?? [];
  while (remaining.length > 0) {
    const endpoint = output.at(-1);
    let best = { index: -1, reverse: false, distance: Number.POSITIVE_INFINITY };
    remaining.forEach((segment, index) => {
      const forward = geodesicDistanceM(endpoint, segment[0]);
      const reverse = geodesicDistanceM(endpoint, segment.at(-1));
      if (forward < best.distance) best = { index, reverse: false, distance: forward };
      if (reverse < best.distance) best = { index, reverse: true, distance: reverse };
    });
    const [next] = remaining.splice(best.index, 1);
    if (best.reverse) next.reverse();
    output.push(...next.slice(best.distance < 2 ? 1 : 0));
  }
  if (geodesicDistanceM(output[0], output.at(-1)) > 2) output.push(output[0]);
  return output;
}

const lineFeatures = lineDefinitions.map((line) => {
  const isRoadMode = ["bus", "shuttle", "tourism"].includes(line.mode);
  const derived = isRoadMode ? routeAlongRoads(line.stops) : null;
  const coordinates = line.id === "cycle-loop"
    ? stitchedEmbankmentLoop()
    : derived?.coordinates ?? line.stops.map((id) => stops.get(id).geometry.coordinates);
  const geometryKind = line.id === "cycle-loop"
    ? "verified-road-centerline"
    : isRoadMode
      ? derived.complete ? "road-network-derived" : "partially-road-network-derived"
      : line.mode === "ferry" ? "direct-water-connection" : "schematic-stop-connection";
  return feature(line.id, { type: "LineString", coordinates }, {
    name: { zh: line.zh, en: line.en }, ref: line.ref, mode: line.mode, color: line.color,
    status: line.status, service: { zh: line.service, en: serviceEnglish[line.id] }, stopIds: line.stops, source: line.source,
    confidence: line.id === "cycle-loop" || line.id === "ferry-qigan" ? "triangulated" : "estimated",
    geometryKind,
    officialLengthM: line.id === "cycle-loop" ? 22_500 : null,
    measuredGeometryLengthM: null,
    snapshot, modelKey: line.model,
  });
});
for (const line of lineFeatures) line.properties.measuredGeometryLengthM = Math.round(polylineLengthM(line.geometry.coordinates));

const memberships = new Map();
for (const line of lineDefinitions) for (const stopId of line.stops) {
  const current = memberships.get(stopId) ?? [];
  if (!current.includes(line.id)) current.push(line.id);
  memberships.set(stopId, current);
}
for (const stop of stopFeatures) stop.properties.lineIds = memberships.get(stop.id) ?? [];

const hubFeatures = [
  feature("hub-metro", stops.get("jiangxinzhou-metro").geometry, { name: { zh: "江心洲综合换乘节点", en: "Jiangxinzhou Interchange" }, stopIds: ["jiangxinzhou-metro", "jiangxinzhou-metro-bus"], modes: ["metro", "bus", "shuttle"], status: "existing" }),
  feature("hub-qigan", stops.get("qigan-pier").geometry, { name: { zh: "旗杆渡口换乘节点", en: "Qigan Ferry Interchange" }, stopIds: ["qigan-pier", "qingao-north"], modes: ["ferry", "bus", "cycle"], status: "existing" }),
  feature("hub-south", stops.get("jiangxinzhou-south").geometry, { name: { zh: "江心洲南公交节点", en: "Jiangxinzhou South Bus Hub" }, stopIds: ["jiangxinzhou-south", "bridge-east"], modes: ["bus", "shuttle"], status: "existing" }),
];

const evidence = {
  version: `${snapshot}.transport.1`, snapshot, canonicalCrs: "EPSG:4326",
  precision: "Public visitor transport map. Triangulated stops are coordinate-checked; estimated stops are snapped to a verified route corridor and are not navigation-grade.",
  sources: [
    { id: "amap-transit", title: "高德地图江心洲公交与地铁POI", date: snapshot, url: "https://www.amap.com/place/BV10053777", verifies: ["current lines at Jiangxinzhou metro interchange", "selected stop coordinates"], redistribution: "reference-only" },
    { id: "nanjing-government-transport", title: "南京市政府江心洲公共交通体系说明", date: "2025-12-03", url: "https://www.nanjing.gov.cn/xxgkn/jytabljggk/2025njytabl/shizxta/202512/t20251203_5704828.html", verifies: ["486/552/553", "four shuttle services", "ferry", "Metro Line 10", "22.5 km loop"] },
    { id: "nanjing-bus-552-short", title: "南京公交552路区间2026调整", date: "2026-01-16", url: "https://www.njgongjiao.com/tongzhi/8879", verifies: ["Qigan Ferry–Jinji Huizhi Park", "new stops", "service hours"] },
    { id: "nanjing-bus-553", title: "南京公交553路2026调整", date: "2026-05-30", url: "https://finance.sina.com.cn/wm/2026-05-30/doc-inhzshan7188825.shtml", verifies: ["2026-06-03 alignment", "added and removed stops"] },
    { id: "jianye-shuttle-2026", title: "建邺区岛城接驳线站点调整", date: "2026-05-29", url: "https://www.njjy.gov.cn/jyyw/202605/t20260529_5848823.html", verifies: ["2026-06-01 stop changes", "iMO stop"] },
    { id: "osm-transit", title: "OpenStreetMap public transport and ferry nodes", date: snapshot, url: "https://www.openstreetmap.org/relation/11630502", license: "ODbL", verifies: ["Metro Line 10 geometry", "ferry terminal GPS positions"] },
  ],
};

const roadWidthM = { major: 22, arterial: 16, collector: 10.5, local: 6, greenway: 3.5 };
const roadEnglish = {
  "中新大道": "Zhongxin Avenue", "亚鹏路": "Yapeng Road", "南京江心洲长江大桥": "Nanjing Jiangxinzhou Yangtze River Bridge",
  "南京眼步行桥": "Nanjing Eye Pedestrian Bridge", "和韵路": "Heyun Road", "夹江大桥": "Jiajiang Bridge", "宏俊街": "Hongjun Street",
  "宏俊路": "Hongjun Road", "志坚街": "Zhijian Street", "思泽路": "Size Road", "揽江街": "Lanjiang Street", "文武街": "Wenwu Street",
  "文泰街": "Wentai Street", "文萃街": "Wencui Street", "星岛街": "Xingdao Street", "星影街": "Xingying Street", "星月街": "Xingyue Street",
  "星洲街": "Xingzhou Street", "林荫路": "Linyin Road", "桃园街": "Taoyuan Street", "梅子洲路": "Meizizhou Road", "民安路": "Min'an Road",
  "永定街": "Yongding Street", "江堤路": "Embankment Road", "洲宁街": "Zhouning Street", "熙怡路": "Xiyi Road", "环岛东路": "Island East Road",
  "环岛西路": "Island West Road", "科技路": "Keji Road", "红星街": "Hongxing Street", "绿水街": "Lüshui Street", "葡园路": "Puyuan Road",
  "贤坤路": "Xiankun Road", "贤达路": "Xianda Road", "龙恩街": "Long'en Street",
};
for (const road of roads.features) {
  road.properties.widthM = roadWidthM[road.properties.class];
  road.properties.renderWidthPx = { major: 3.5, arterial: 2.8, collector: 2.1, local: 1.15, greenway: 2.4 }[road.properties.class];
  road.properties.name.en = roadEnglish[road.properties.name.zh] ?? null;
}

const outputs = {
  "transit-lines.geojson": collection(lineFeatures),
  "transit-stops.geojson": collection(stopFeatures),
  "transport-hubs.geojson": collection(hubFeatures),
  "transport-evidence.json": evidence,
  "roads.geojson": roads,
};
await Promise.all(Object.entries(outputs).map(([name, value]) => writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`)));

const runtimePath = path.join(outputDir, "runtime.json");
const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
runtime.roads = roads;
runtime.transit = { lines: collection(lineFeatures), stops: collection(stopFeatures), hubs: collection(hubFeatures), evidence };
runtime.manifest.counts.transitLines = lineFeatures.length;
runtime.manifest.counts.transitStops = stopFeatures.length;
runtime.manifest.layers.transitLines = "transit-lines.geojson";
runtime.manifest.layers.transitStops = "transit-stops.geojson";
runtime.manifest.layers.transportHubs = "transport-hubs.geojson";
runtime.manifest.layers.transportEvidence = "transport-evidence.json";
await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`);

const manifestPath = path.join(outputDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.counts.transitLines = lineFeatures.length;
manifest.counts.transitStops = stopFeatures.length;
manifest.layers.transitLines = "transit-lines.geojson";
manifest.layers.transitStops = "transit-stops.geojson";
manifest.layers.transportHubs = "transport-hubs.geojson";
manifest.layers.transportEvidence = "transport-evidence.json";
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${lineFeatures.length} transport lines, ${stopFeatures.length} stops and ${hubFeatures.length} hubs.`);
