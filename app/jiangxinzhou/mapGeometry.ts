import runtimeJson from "../../data/jiangxinzhou-v2/runtime.json";

export type GeoPoint = [number, number];
export type Point3 = [number, number, number];
export type RoadClass = "major" | "arterial" | "collector" | "local" | "greenway";
export type Confidence = "triangulated" | "estimated" | "planned";
export type TransitMode = "bus" | "metro" | "shuttle" | "tourism" | "ferry" | "cycle";

export type LocalizedName = { zh: string | null; en: string | null };
export type PointGeometry = { type: "Point"; coordinates: GeoPoint };
export type LineStringGeometry = { type: "LineString"; coordinates: GeoPoint[] };
export type PolygonGeometry = { type: "Polygon"; coordinates: GeoPoint[][] };
export type FeatureEvidence = {
  id: string;
  title: string;
  type: string;
  date?: string;
  imageryDate?: string;
  url: string;
  verifies: string[];
  redistribution?: string;
  license?: string;
};
export type SpatialFeature<G = PointGeometry | LineStringGeometry | PolygonGeometry, P = Record<string, unknown>> = {
  type: "Feature";
  id: string;
  geometry: G;
  properties: P & { id: string };
};
export type LandmarkProperties = {
  id: string;
  name: LocalizedName;
  category: string;
  modelKey: string | null;
  lod: number;
  status: "existing" | "under-construction" | "planned";
  confidence: Confidence;
  source: string;
  sourceUrl: string | null;
  sourceCoordinate: GeoPoint;
  sourceCrs: "GCJ-02" | "EPSG:4326";
};
export type MapLandmarkFeature = SpatialFeature<PointGeometry, LandmarkProperties>;
export type RoadProperties = {
  id: string;
  name: LocalizedName;
  class: RoadClass;
  widthM: number;
  renderWidthPx: number;
  source: string;
  sourceCrs: string;
  confidence: Confidence;
  status: string;
};
export type MapRoadFeature = SpatialFeature<LineStringGeometry, RoadProperties>;
export type TransitLineProperties = {
  id: string;
  name: LocalizedName;
  ref: string;
  mode: TransitMode;
  color: string;
  status: "existing" | "temporary" | "planned";
  service: LocalizedName;
  stopIds: string[];
  source: string;
  confidence: Confidence;
  snapshot: string;
  modelKey: string | null;
};
export type TransitStopProperties = {
  id: string;
  name: LocalizedName;
  kind: "bus" | "metro" | "shuttle" | "tourism" | "ferry" | "terminal" | "interchange" | "portal";
  confidence: Exclude<Confidence, "planned">;
  status: "existing";
  sourceCrs: string;
  source: string;
  snapshot: string;
  lineIds: string[];
};
export type MapTransitLineFeature = SpatialFeature<LineStringGeometry, TransitLineProperties>;
export type MapTransitStopFeature = SpatialFeature<PointGeometry, TransitStopProperties>;

type RuntimeData = {
  manifest: {
    version: string;
    snapshot: string;
    canonicalCrs: string;
    origin: GeoPoint;
    units: string;
    officialAreaKm2: number;
    officialEmbankmentKm: number;
    counts: { buildings: number; roads: number; landmarks: number; transitLines?: number; transitStops?: number };
  };
  island: { type: "FeatureCollection"; features: SpatialFeature<PolygonGeometry>[] };
  roads: { type: "FeatureCollection"; features: SpatialFeature<LineStringGeometry, RoadProperties>[] };
  landmarks: { type: "FeatureCollection"; features: SpatialFeature<PointGeometry, LandmarkProperties>[] };
  landscapes: { type: "FeatureCollection"; features: SpatialFeature<PolygonGeometry, {
    id: string;
    name: LocalizedName;
    category: string;
    color: string;
    opacity: number;
    confidence: Confidence;
  }>[] };
  evidence: {
    policy: { precision: string; redistribution: string; confidence: Record<Confidence, string> };
    sources: FeatureEvidence[];
  };
  transit: {
    lines: { type: "FeatureCollection"; features: SpatialFeature<LineStringGeometry, TransitLineProperties>[] };
    stops: { type: "FeatureCollection"; features: SpatialFeature<PointGeometry, TransitStopProperties>[] };
    hubs: { type: "FeatureCollection"; features: SpatialFeature<PointGeometry>[] };
    evidence: { sources: FeatureEvidence[] };
  };
};

export const mapData = runtimeJson as unknown as RuntimeData;
export const mapManifest = mapData.manifest;
export const evidenceSources = mapData.evidence.sources;
export const mapRoads = mapData.roads.features as unknown as MapRoadFeature[];
export const mapLandmarks = mapData.landmarks.features as unknown as MapLandmarkFeature[];
export const transportLines = mapData.transit.lines.features as unknown as MapTransitLineFeature[];
export const transportStops = mapData.transit.stops.features as unknown as MapTransitStopFeature[];
export const transportEvidenceSources = mapData.transit.evidence.sources;

const [originLng, originLat] = mapManifest.origin;
const longitudeScale = 111_320 * Math.cos((originLat * Math.PI) / 180);
const latitudeScale = 110_540;

/** Project canonical WGS84 coordinates into the shared Blender/Three.js metre scene. */
export function projectPoint([longitude, latitude]: GeoPoint, height = 0): Point3 {
  const east = (longitude - originLng) * longitudeScale;
  const north = (latitude - originLat) * latitudeScale;
  return [east, height, -north];
}

export function projectPolyline(points: GeoPoint[], height = 0): Point3[] {
  return points.map((point) => projectPoint(point, height));
}

const boundaryGeo = mapData.island.features[0].geometry.coordinates[0] as GeoPoint[];
export const projectedBoundary = projectPolyline(boundaryGeo, 0.9);

export const mapBounds = (() => {
  const xs = projectedBoundary.map(([x]) => x);
  const zs = projectedBoundary.map(([, , z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] as Point3,
  };
})();

export function findAnchor(anchorId: string): MapLandmarkFeature | undefined {
  return mapLandmarks.find((feature) => feature.id === anchorId);
}

export function anchorPosition(anchorId: string, height = 0): Point3 {
  const anchor = findAnchor(anchorId);
  return projectPoint((anchor?.geometry.coordinates ?? mapManifest.origin) as GeoPoint, height);
}

export function localizeFeatureName(feature: { properties: { name: LocalizedName } }, language: "zh" | "en"): string {
  return feature.properties.name[language] || feature.properties.name.zh || feature.properties.name.en || "—";
}

export function roadColor(roadClass: RoadClass): string {
  return ({ major: "#e8bd63", arterial: "#e8d39a", collector: "#f0e5bf", local: "#e6dfc9", greenway: "#4b9b87" })[roadClass];
}

export function roadsByName(names: string[]): MapRoadFeature[] {
  return mapRoads.filter((road) => names.includes(road.properties.name.zh ?? ""));
}

export function findTransportLine(lineId: string): MapTransitLineFeature | undefined {
  return transportLines.find((line) => line.id === lineId);
}

export function stopsForTransportLine(lineId: string): MapTransitStopFeature[] {
  const line = findTransportLine(lineId);
  if (!line) return [];
  return line.properties.stopIds.map((id) => transportStops.find((stop) => stop.id === id)).filter((stop): stop is MapTransitStopFeature => Boolean(stop));
}

export function landscapeShapes() {
  return mapData.landscapes.features.map((feature) => ({
    id: feature.id as string,
    points: (feature.geometry.coordinates[0] as GeoPoint[]).map((point) => {
      const [x, , z] = projectPoint(point);
      return [x, -z] as [number, number];
    }),
    color: feature.properties.color,
    opacity: feature.properties.opacity,
  }));
}
