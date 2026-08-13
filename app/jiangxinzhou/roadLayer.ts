import roadLayerJson from "../../data/jiangxinzhou-v2/road-layer/road-layer.json";
import type { GeoPoint, LocalizedName, RoadClass } from "./mapGeometry";

export type RoadAccess = "vehicle" | "pedestrian" | "cycle" | "shared";
export type RoadSurface = "asphalt" | "concrete" | "paving" | "estimated";
export type RoadStatus = "open" | "construction" | "planned" | "closed";
export type RoadSourceAgreement = "dual-confirmed" | "amap-confirmed" | "baidu-confirmed" | "osm-derived" | "conflict";
export type RoadConfidence = "verified" | "triangulated" | "estimated";

export type RoadCorridorProperties = {
  id: string;
  roadId: string;
  name: LocalizedName;
  class: RoadClass;
  widthM: number;
  laneCount: number;
  access: RoadAccess;
  surface: RoadSurface;
  status: RoadStatus;
  fromNodeId: string;
  toNodeId: string;
  sourceRefs: string[];
  sourceAgreement: RoadSourceAgreement;
  confidence: RoadConfidence;
  crossingId: string | null;
  sourceGeometry: string;
};

export type RoadCorridor = {
  type: "Feature";
  id: string;
  geometry: { type: "LineString"; coordinates: GeoPoint[] };
  properties: RoadCorridorProperties;
};

export type RoadNode = {
  nodeId: string;
  coordinate: GeoPoint;
  kind: "junction" | "turning" | "bridge-entry" | "bridge-exit" | "terminal";
  connectedRoadIds: string[];
};

export type RoadEdge = {
  edgeId: string;
  roadId: string;
  fromNodeId: string;
  toNodeId: string;
  lengthM: number;
  geometry: [GeoPoint, GeoPoint];
  allowedModes: ("walk" | "bike" | "bus" | "car")[];
};

export type RoadFacility = {
  type: "Feature";
  id: string;
  geometry: { type: "LineString" | "Point"; coordinates: GeoPoint[] | GeoPoint };
  properties: {
    id: string;
    kind: "sidewalk" | "greenway" | "centerline" | "junction-marking";
    roadId?: string;
    nodeId?: string;
    side?: "left" | "right" | "center";
    widthM: number;
    offsetM?: number;
    dashM?: number;
    gapM?: number;
    sourceRefs: string[];
    confidence: RoadConfidence;
  };
};

export type RoadLayerData = {
  manifest: {
    version: string;
    title: LocalizedName;
    snapshot: string;
    canonicalCrs: "EPSG:4326";
    counts: Record<string, number>;
    metrics: { corridorCount: number; edgeCount: number; nodeCount: number; junctionCount: number; connectedComponents: number; componentSizes: number[]; totalCenterlineLengthM: number };
  };
  corridors: { type: "FeatureCollection"; features: RoadCorridor[] };
  junctions: { type: "FeatureCollection"; features: Array<{ type: "Feature"; id: string; geometry: { type: "Point"; coordinates: GeoPoint }; properties: { id: string; nodeId: string; kind: RoadNode["kind"]; connectedRoadIds: string[]; armCount: number; sourceRefs: string[]; confidence: RoadConfidence } }> };
  facilities: { type: "FeatureCollection"; features: RoadFacility[] };
  graph: { canonicalCrs: "EPSG:4326"; nodes: RoadNode[]; edges: RoadEdge[] };
  evidence: { version: string; generatedAt: string; canonicalCrs: "EPSG:4326"; coordinatePolicy: Record<string, string>; sourcePolicy: string; sources: Array<Record<string, unknown>>; reconciliation: Record<string, unknown> };
};

export const roadLayerData = roadLayerJson as unknown as RoadLayerData;
export const roadCorridors = roadLayerData.corridors.features;
export const roadJunctions = roadLayerData.junctions.features;
export const roadFacilities = roadLayerData.facilities.features;
export const roadGraph = roadLayerData.graph;
export const roadEvidence = roadLayerData.evidence;

export function findRoadCorridor(roadId?: string): RoadCorridor | undefined {
  return roadId ? roadCorridors.find((road) => road.properties.roadId === roadId) : undefined;
}

export function roadName(road: RoadCorridor, language: "zh" | "en"): string {
  return road.properties.name[language] || road.properties.name.zh || road.properties.name.en || "—";
}
