"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { localize, type Language } from "./locales";
import { mapBounds, projectPoint, type Point3, type RoadClass } from "./mapGeometry";
import { roadCorridors, roadJunctions, roadName, type RoadCorridor } from "./roadLayer";
import type { RoadSublayerVisibility, SceneQuality } from "./interactionState";
import { buildRibbonGeometry, type RibbonPath } from "./render/roadGeometry";

const roadClasses: RoadClass[] = ["major", "arterial", "collector", "local", "greenway"];
const pavementColors: Record<RoadClass, string> = {
  major: "#c7b27a",
  arterial: "#b8aa83",
  collector: "#aaa694",
  local: "#929b93",
  greenway: "#3e8e7b",
};
const underRoadColor = "#3c4e52";
const curbColor = "#b1b4a2";
const walkwayColor = "#d1cbb0";
const bridgeColor = "#d8c794";
const markingColor = "#f5e7b1";

type RoadLayerProps = {
  visible: boolean;
  sublayers: RoadSublayerVisibility;
  selectedRoadId?: string;
  language: Language;
  quality: SceneQuality;
  onSelectRoad?: (roadId: string) => void;
};

function compactPoints(points: Point3[]): Point3[] {
  return points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[2] - points[index - 1][2]) > 0.25);
}

function offsetPolyline(points: Point3[], offsetM: number): Point3[] {
  if (Math.abs(offsetM) < 0.001) return points;
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - previous[0];
    const dz = next[2] - previous[2];
    const length = Math.hypot(dx, dz) || 1;
    return [point[0] + (-dz / length) * offsetM, point[1], point[2] + (dx / length) * offsetM];
  });
}

function projectedPath(road: RoadCorridor, height: number, offsetM = 0, widthM = road.properties.widthM): RibbonPath {
  const points = compactPoints(road.geometry.coordinates.map((coordinate) => projectPoint(coordinate, height)));
  return { points: offsetPolyline(points, offsetM), widthM };
}

function RibbonBatch({
  paths,
  roads,
  color,
  opacity = 1,
  renderOrder = 2,
  onSelectRoad,
}: {
  paths: RibbonPath[];
  roads: RoadCorridor[];
  color: string;
  opacity?: number;
  renderOrder?: number;
  onSelectRoad?: (roadId: string) => void;
}) {
  const geometry = useMemo(() => buildRibbonGeometry(paths), [paths]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.02,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), [color, opacity]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const select = (event: ThreeEvent<PointerEvent>) => {
    if (!onSelectRoad || event.faceIndex == null) return;
    event.stopPropagation();
    const attribute = geometry.getAttribute("pathIndex");
    const pathIndex = attribute ? attribute.getX(event.faceIndex * 3) : 0;
    const road = roads[pathIndex];
    if (road) onSelectRoad(road.properties.roadId);
  };
  return <mesh geometry={geometry} material={material} renderOrder={renderOrder} receiveShadow onPointerDown={onSelectRoad ? select : undefined} />;
}

function DashedMarkings({ roads, height }: { roads: RoadCorridor[]; height: number }) {
  const positions = useMemo(() => {
    const values: number[] = [];
    for (const road of roads) {
      const points = road.geometry.coordinates.map((coordinate) => projectPoint(coordinate, height));
      const dashM = road.properties.class === "collector" ? 2.5 : 4;
      const gapM = road.properties.class === "collector" ? 6 : 8;
      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        const dx = end[0] - start[0];
        const dz = end[2] - start[2];
        const length = Math.hypot(dx, dz);
        if (length < 0.5) continue;
        for (let distance = 0; distance < length; distance += dashM + gapM) {
          const from = distance / length;
          const to = Math.min(length, distance + dashM) / length;
          values.push(start[0] + dx * from, start[1], start[2] + dz * from, start[0] + dx * to, start[1], start[2] + dz * to);
        }
      }
    }
    return new Float32Array(values);
  }, [height, roads]);
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.computeBoundingSphere();
    return next;
  }, [positions]);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: markingColor, transparent: true, opacity: 0.72, depthWrite: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <lineSegments geometry={geometry} material={material} renderOrder={5} />;
}

function JunctionLayer({ visible }: { visible: boolean }) {
  const positions = useMemo(() => new Float32Array(roadJunctions.flatMap((junction) => {
    const [x, y, z] = projectPoint(junction.geometry.coordinates, 10.2);
    return [x, y, z];
  })), []);
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.computeBoundingSphere();
    return next;
  }, [positions]);
  const material = useMemo(() => new THREE.PointsMaterial({ color: "#f1da9a", size: 7, sizeAttenuation: true, transparent: true, opacity: 0.65, depthWrite: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  if (!visible) return null;
  return <points geometry={geometry} material={material} renderOrder={6} />;
}

function RoadLabels({ roads, language, tier }: { roads: RoadCorridor[]; language: Language; tier: number }) {
  const labels = useMemo(() => {
    const longest = new Map<string, RoadCorridor>();
    for (const road of roads) {
      const name = roadName(road, language);
      if (name === "—") continue;
      const current = longest.get(name);
      if (!current || road.geometry.coordinates.length > current.geometry.coordinates.length) longest.set(name, road);
    }
    return [...longest.values()].map((road) => {
      const midpoint = road.geometry.coordinates[Math.floor(road.geometry.coordinates.length / 2)];
      return { road, name: roadName(road, language), position: projectPoint(midpoint, 12) };
    });
  }, [language, roads]);
  const allowed = (roadClass: RoadClass) => tier >= 3 || (tier >= 2 && roadClass !== "local") || (tier >= 1 && ["major", "arterial"].includes(roadClass));
  return <>{labels.filter((label) => allowed(label.road.properties.class)).map((label) => (
    <Html key={`${label.name}-${label.position[0]}`} position={label.position} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
      <span className={`road-name-label v8-road-label ${label.road.properties.class}`}>{label.name}</span>
    </Html>
  ))}</>;
}

function RoadLayer({ visible, sublayers, selectedRoadId, language, quality, onSelectRoad }: RoadLayerProps) {
  const { camera, invalidate } = useThree();
  const [tier, setTier] = useState(0);
  const lastTier = useRef(-1);
  useFrame(() => {
    const nextTier = camera.position.y > 3500 ? 0 : camera.position.y > 1200 ? 1 : camera.position.y > 400 ? 2 : 3;
    if (nextTier !== lastTier.current) {
      lastTier.current = nextTier;
      setTier(nextTier);
      invalidate();
    }
  });

  const visibleRoads = useMemo(() => {
    const base = roadCorridors.filter((road) => !["planned", "closed"].includes(road.properties.status));
    if (tier === 0) return base.filter((road) => ["major", "arterial"].includes(road.properties.class) || Boolean(road.properties.crossingId));
    if (tier === 1) return base.filter((road) => road.properties.class !== "local" || Boolean(road.properties.crossingId));
    if (quality === "efficiency") return base.filter((road) => road.properties.class !== "local" || Boolean(road.properties.crossingId));
    return base;
  }, [quality, tier]);
  const grouped = useMemo(() => Object.fromEntries(roadClasses.map((roadClass) => [roadClass, visibleRoads.filter((road) => road.properties.class === roadClass)])) as Record<RoadClass, RoadCorridor[]>, [visibleRoads]);
  const selectedRoad = selectedRoadId ? roadCorridors.find((road) => road.properties.roadId === selectedRoadId) : undefined;
  const selectedPaths = useMemo(() => selectedRoad ? [projectedPath(selectedRoad, 11.2, 0, selectedRoad.properties.widthM + 2.8)] : [], [selectedRoad]);
  const markingsRoads = useMemo(() => visibleRoads.filter((road) => ["major", "arterial", "collector"].includes(road.properties.class)), [visibleRoads]);
  const showFineDetail = tier >= 2 && quality !== "efficiency";
  if (!visible) return null;
  return <group name="independent-road-layer">
    {sublayers.pavement && roadClasses.map((roadClass) => grouped[roadClass].length > 0 && <group key={`pavement-${roadClass}`}>
      <RibbonBatch roads={grouped[roadClass]} paths={grouped[roadClass].map((road) => projectedPath(road, 8.1, 0, road.properties.widthM * 1.08))} color={underRoadColor} opacity={0.96} />
      <RibbonBatch roads={grouped[roadClass]} paths={grouped[roadClass].map((road) => projectedPath(road, 8.5, 0, road.properties.widthM * 0.92))} color={pavementColors[roadClass]} opacity={roadClass === "local" ? 0.88 : 0.98} renderOrder={3} onSelectRoad={onSelectRoad} />
    </group>)}
    {sublayers.bridges && grouped.major.length > 0 && <RibbonBatch roads={grouped.major.filter((road) => Boolean(road.properties.crossingId))} paths={grouped.major.filter((road) => Boolean(road.properties.crossingId)).map((road) => projectedPath(road, 9.1, 0, road.properties.widthM * 0.9))} color={bridgeColor} opacity={0.9} renderOrder={4} />}
    {sublayers.walkways && showFineDetail && roadClasses.filter((roadClass) => roadClass !== "greenway").map((roadClass) => {
      const roads = grouped[roadClass];
      const paths = roads.flatMap((road) => [-1, 1].map((side) => projectedPath(road, 9.0, side * (road.properties.widthM / 2 + 1.2), 1.8)));
      return paths.length ? <RibbonBatch key={`walkway-${roadClass}`} roads={roads} paths={paths} color={walkwayColor} opacity={0.6} renderOrder={3} /> : null;
    })}
    {sublayers.curbs && showFineDetail && roadClasses.filter((roadClass) => roadClass !== "greenway").map((roadClass) => {
      const roads = grouped[roadClass];
      const paths = roads.flatMap((road) => [-1, 1].map((side) => projectedPath(road, 9.45, side * (road.properties.widthM / 2 - 0.12), 0.24)));
      return paths.length ? <RibbonBatch key={`curb-${roadClass}`} roads={roads} paths={paths} color={curbColor} opacity={0.8} renderOrder={4} /> : null;
    })}
    {sublayers.greenways && tier >= 1 && grouped.greenway.length > 0 && <RibbonBatch roads={grouped.greenway} paths={grouped.greenway.map((road) => projectedPath(road, 9.05, 0, road.properties.widthM * 0.76))} color={pavementColors.greenway} opacity={0.95} renderOrder={4} onSelectRoad={onSelectRoad} />}
    {sublayers.markings && showFineDetail && <DashedMarkings roads={markingsRoads} height={9.85} />}
    {sublayers.junctions && showFineDetail && <JunctionLayer visible />}
    {selectedRoad && selectedPaths.length > 0 && <RibbonBatch roads={[selectedRoad]} paths={selectedPaths} color="#f2c75c" opacity={0.5} renderOrder={7} />}
    {sublayers.labels && <RoadLabels roads={visibleRoads} language={language} tier={tier} />}
    {sublayers.trafficOverlay && <group name="road-traffic-overlay" />}
    <Html position={[mapBounds.minX + 120, 10, mapBounds.maxZ - 120]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
      <span className="road-layer-badge">{localize({ zh: "道路独立层", en: "ROAD LAYER" }, language)} · {visibleRoads.length}</span>
    </Html>
  </group>;
}

export default RoadLayer;
