"use client";

import { AdaptiveDpr, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LineMaterial, LineSegments2, LineSegmentsGeometry, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { routes, type Landmark } from "./landmarks";
import { experienceCopy, landmarkCopy, localize, transportModeLabels, type Language } from "./locales";
import {
  anchorPosition,
  contextLands,
  contextRoads,
  crossings,
  landscapeShapes,
  localizeFeatureName,
  mapBounds,
  mapRoads,
  projectPoint,
  projectPolyline,
  regionalBounds,
  roadColor,
  roadsByName,
  stopsForTransportLine,
  transportLines,
  unprojectPoint,
  waterBodies,
  type Point3,
  type CrossingType,
  type RoadClass,
  type TransitMode,
} from "./mapGeometry";
import type { JiangxinzhouSceneProps, LayerVisibility, SceneQuality, ViewMode } from "./sceneTypes";

const modelUrls = {
  terrain: "/models/jiangxinzhou-v2/terrain.glb",
  south: "/models/jiangxinzhou-v2/buildings-south.glb",
  center: "/models/jiangxinzhou-v2/buildings-center.glb",
  north: "/models/jiangxinzhou-v2/buildings-north.glb",
  vegetation: "/models/jiangxinzhou-v2/vegetation.glb",
  landmarks: "/models/jiangxinzhou-v2/landmarks.glb",
  "city-bus": "/models/jiangxinzhou-v2/transport-city-bus.glb",
  "autonomous-shuttle": "/models/jiangxinzhou-v2/transport-autonomous-shuttle.glb",
  "shuttle-bus": "/models/jiangxinzhou-v2/transport-shuttle-bus.glb",
  "metro-line10": "/models/jiangxinzhou-v2/transport-metro-line10.glb",
  "passenger-ferry": "/models/jiangxinzhou-v2/transport-passenger-ferry.glb",
  contextBridges: "/models/jiangxinzhou-v2/bridges-context.glb",
} as const;

// Start only the two critical visual assets when this dynamically loaded module arrives.
// Buildings are requested by Suspense and the largest GLB (vegetation) waits for idle time.
useGLTF.preload(modelUrls.terrain);
useGLTF.preload(modelUrls.landmarks);
useGLTF.preload(modelUrls.contextBridges);

function Asset({ url, onReady }: { url: string; onReady?: () => void }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      object.frustumCulled = true;
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    return clone;
  }, [gltf.scene]);
  useEffect(() => onReady?.(), [onReady]);
  return <primitive object={scene} dispose={null} />;
}

function Water({ visible }: { visible: boolean }) {
  const span = Math.max(regionalBounds.width, regionalBounds.depth) * 1.18;
  if (!visible) return null;
  return (
    <mesh position={[regionalBounds.center[0], -12, regionalBounds.center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[span, span]} />
      <meshPhysicalMaterial color="#245e78" roughness={0.46} metalness={0.04} clearcoat={0.18} clearcoatRoughness={0.7} />
    </mesh>
  );
}

const contextPalette = {
  land: "#0c1821",
  landNorth: "#13232d",
  block: "#172a34",
  blockAlt: "#223a45",
  yangtze: "#429fbe",
  jiajiang: "#55b7c3",
  yangtzeEdge: "#8ad6e1",
  jiajiangEdge: "#a6e5dc",
} as const;

function shapeFromRing(ring: [number, number][]) {
  const shape = new THREE.Shape();
  ring.forEach(([x, y], index) => index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function RegionalContext({ waterVisible, surroundingsVisible, language }: { waterVisible: boolean; surroundingsVisible: boolean; language: Language }) {
  const waters = useMemo(() => mapDataShapes(), []);
  const blocks = useMemo(() => [
    [118.635, 32.055, 34, 116, 26], [118.646, 32.044, 42, 150, 34], [118.634, 32.004, 28, 82, 20],
    [118.740, 32.062, 38, 128, 28], [118.733, 32.043, 54, 178, 42], [118.740, 32.011, 30, 104, 24],
    [118.699, 32.084, 24, 90, 18], [118.675, 31.970, 32, 120, 22],
  ] as [number, number, number, number, number][], []);
  if (!waterVisible && !surroundingsVisible) return null;
  return <group>
    {waterVisible && waters.water.map((water) => (
      <group key={water.id}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.05, 0]}>
          <shapeGeometry args={[water.shape]} />
          <meshBasicMaterial color={water.id === "jiajiang" ? contextPalette.jiajiang : contextPalette.yangtze} transparent opacity={water.id === "jiajiang" ? 0.92 : 0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <WideColorLine positions={water.borderPositions} color={water.id === "jiajiang" ? contextPalette.jiajiangEdge : contextPalette.yangtzeEdge} width={1.7} opacity={0.68} />
        <Html position={[water.label[0], -1.4, water.label[2]]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
          <div className={`water-label ${water.id === "jiajiang" ? "jiajiang" : "yangtze"}`}><span>{water.id === "jiajiang" ? "RIVER 02" : "RIVER 01"}</span><strong>{localizeFeatureName(water.feature, language)}</strong></div>
        </Html>
      </group>
    ))}
    {surroundingsVisible && <>
      {waters.land.map((land) => (
        <group key={land.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.55, 0]}>
            <shapeGeometry args={[land.shape]} />
            <meshBasicMaterial color={land.feature.properties.kind === "north-bank" ? contextPalette.landNorth : contextPalette.land} transparent opacity={0.98} depthWrite={true} side={THREE.DoubleSide} />
          </mesh>
          <Html position={[land.label[0], 9, land.label[2]]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
            <div className="context-bank-label"><span>{land.feature.properties.kind.replace("-", " ").toUpperCase()}</span><strong>{localizeFeatureName(land.feature, language)}</strong></div>
          </Html>
        </group>
      ))}
      {blocks.map(([longitude, latitude, width, depth, height], index) => {
        const [x, , z] = projectPoint([longitude, latitude], height / 2);
        return <mesh key={`context-block-${index}`} position={[x, height / 2 - 1.8, z]} rotation={[0, (index % 3) * 0.18, 0]}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial color={index % 2 ? contextPalette.blockAlt : contextPalette.block} transparent opacity={0.94} />
        </mesh>;
      })}
    </>}
  </group>;
}

function mapDataShapes() {
  const create = (features: typeof contextLands, labelHeight: number) => features.map((feature) => {
    const ring = feature.geometry.coordinates[0].map(([longitude, latitude]) => {
      const [x, , z] = projectPoint([longitude, latitude]);
      return [x, -z] as [number, number];
    });
    const center = ring.reduce(([x, y], [nextX, nextY]) => [x + nextX, y + nextY], [0, 0] as [number, number]);
    const label = [center[0] / ring.length, labelHeight, -center[1] / ring.length] as Point3;
    return { feature, id: feature.id, shape: shapeFromRing(ring), color: feature.properties.color, opacity: feature.properties.opacity, label };
  });
  const water = waterBodies.map((feature) => {
    const ring = feature.geometry.coordinates[0].map(([longitude, latitude]) => {
      const [x, , z] = projectPoint([longitude, latitude]);
      return [x, -z] as [number, number];
    });
    const shape = shapeFromRing(ring);
    const borderPoints = feature.geometry.coordinates[0].map((coordinate) => projectPoint(coordinate, -2.92));
    const center = ring.reduce(([x, y], [nextX, nextY]) => [x + nextX, y + nextY], [0, 0] as [number, number]);
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    return {
      feature,
      id: feature.id,
      center: [(Math.min(...xs) + Math.max(...xs)) / 2, -3.05, (Math.min(...ys) + Math.max(...ys)) / 2] as Point3,
      shape,
      borderPositions: lineSegments([...borderPoints, borderPoints[0]]),
      color: feature.properties.color,
      opacity: feature.properties.opacity,
      label: [center[0] / ring.length, -1.4, -center[1] / ring.length] as Point3,
    };
  });
  return { land: create(contextLands, 9), water };
}

function LandscapeZones({ visible }: { visible: boolean }) {
  const shapes = useMemo(() => landscapeShapes().map((zone) => {
    const shape = new THREE.Shape();
    zone.points.forEach(([x, y], index) => index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
    shape.closePath();
    return { ...zone, shape };
  }), []);
  if (!visible) return null;
  return <group>{shapes.map((zone) => (
    <mesh key={zone.id} rotation={[-Math.PI / 2, 0, 0]} position={[0, 4.5, 0]}>
      <shapeGeometry args={[zone.shape]} />
      <meshStandardMaterial color={zone.color} transparent opacity={Math.min(zone.opacity, 0.065)} depthWrite={false} roughness={1} />
    </mesh>
  ))}</group>;
}

const roadPixelWidth: Record<RoadClass, number> = { major: 3.5, arterial: 2.8, collector: 2.1, local: 1.15, greenway: 2.4 };

function WideRoadGroup({ roadClass, positions, opacity }: { roadClass: RoadClass; positions: Float32Array; opacity: number }) {
  const { size } = useThree();
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color: new THREE.Color(roadColor(roadClass)).getHex(),
      linewidth: roadPixelWidth[roadClass],
      transparent: true,
      opacity,
    });
    return new LineSegments2(geometry, material);
  }, [opacity, positions, roadClass]);
  useEffect(() => {
    line.material.resolution.set(size.width, size.height);
  }, [line, size.height, size.width]);
  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);
  return <primitive object={line} />;
}

function WideColorLine({ positions, color, width, opacity }: { positions: Float32Array; color: string; width: number; opacity: number }) {
  const { size } = useThree();
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity, depthTest: true });
    return new LineSegments2(geometry, material);
  }, [color, opacity, positions, width]);
  useEffect(() => { line.material.resolution.set(size.width, size.height); }, [line, size.height, size.width]);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); }, [line]);
  return <primitive object={line} />;
}

function coordinateLabel(value: number, axis: "longitude" | "latitude", language: Language) {
  const label = axis === "longitude" ? experienceCopy.coordinateLongitude : experienceCopy.coordinateLatitude;
  const hemisphere = axis === "longitude" ? (value >= 0 ? "E" : "W") : (value >= 0 ? "N" : "S");
  return `${localize(label, language)} ${hemisphere} ${Math.abs(value).toFixed(4)}°`;
}

function CoordinateGrid({ visible, view, language }: { visible: boolean; view: ViewMode; language: Language }) {
  const bounds = view === "regional" ? regionalBounds : mapBounds;
  const grid = useMemo(() => {
    const vertical = Array.from({ length: 5 }, (_, index) => bounds.minX + (bounds.width * index) / 4);
    const horizontal = Array.from({ length: 5 }, (_, index) => bounds.minZ + (bounds.depth * index) / 4);
    const labelInset = Math.min(Math.max(bounds.width, bounds.depth) * 0.045, 480);
    const verticalPositions = new Float32Array(vertical.flatMap((x) => [x, 15, bounds.minZ, x, 15, bounds.maxZ]));
    const horizontalPositions = new Float32Array(horizontal.flatMap((z) => [bounds.minX, 15, z, bounds.maxX, 15, z]));
    return {
      vertical,
      horizontal,
      verticalPositions,
      horizontalPositions,
      labelX: bounds.minX + labelInset,
      labelZ: bounds.maxZ - labelInset,
      latitude: horizontal.map((z) => unprojectPoint([0, 0, z])[1]),
      longitude: vertical.map((x) => unprojectPoint([x, 0, 0])[0]),
    };
  }, [bounds]);
  if (!visible) return null;
  return <group>
    <WideColorLine positions={grid.verticalPositions} color="#d5f1e6" width={1.05} opacity={view === "regional" ? 0.28 : 0.22} />
    <WideColorLine positions={grid.horizontalPositions} color="#d5f1e6" width={1.05} opacity={view === "regional" ? 0.28 : 0.22} />
    {grid.longitude.map((value, index) => <Html key={`longitude-${value}`} position={[grid.vertical[index], 22, grid.labelZ]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <span className="coordinate-label longitude">{index === 0 && <small>{localize(experienceCopy.coordinateDatum, language)}</small>}{coordinateLabel(value, "longitude", language)}</span>
    </Html>)}
    {grid.latitude.map((value, index) => <Html key={`latitude-${value}`} position={[grid.labelX, 22, grid.horizontal[index]]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <span className="coordinate-label latitude">{coordinateLabel(value, "latitude", language)}</span>
    </Html>)}
  </group>;
}

function lineSegments(points: Point3[]) {
  const positions: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) positions.push(...points[index], ...points[index + 1]);
  return new Float32Array(positions);
}

function SegmentLayer({ groups, opacity = 1 }: { groups: Partial<Record<RoadClass, Float32Array>>; opacity?: number }) {
  return <group>{(Object.entries(groups) as [RoadClass, Float32Array][]).map(([roadClass, positions]) => (
    <WideRoadGroup key={roadClass} roadClass={roadClass} positions={positions} opacity={opacity * (roadClass === "local" ? 0.68 : 0.96)} />
  ))}</group>;
}

function roadSegments(features = mapRoads, height = 7.5) {
  const groups: Partial<Record<RoadClass, number[]>> = {};
  for (const road of features) {
    const points = projectPolyline(road.geometry.coordinates, height);
    const values = groups[road.properties.class] ?? [];
    for (let index = 0; index < points.length - 1; index += 1) values.push(...points[index], ...points[index + 1]);
    groups[road.properties.class] = values;
  }
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, new Float32Array(values)])) as Partial<Record<RoadClass, Float32Array>>;
}

function RoadNetwork({ visible }: { visible: boolean }) {
  const groups = useMemo(() => roadSegments(), []);
  return visible ? <SegmentLayer groups={groups} /> : null;
}

function ContextRoadNetwork({ visible }: { visible: boolean }) {
  const positions = useMemo(() => new Float32Array(contextRoads.flatMap((road) => {
    const points = projectPolyline(road.geometry.coordinates, 7.8);
    return points.slice(0, -1).flatMap((point, index) => [...point, ...points[index + 1]]);
  })), []);
  return visible ? <WideColorLine positions={positions} color="#c8b879" width={2.6} opacity={0.68} /> : null;
}

function RoadNameLabels({ visible, language }: { visible: boolean; language: Language }) {
  const { camera, invalidate } = useThree();
  const [detailTier, setDetailTier] = useState(0);
  const lastTier = useRef(-1);
  const labels = useMemo(() => {
    const byName = new Map<string, (typeof mapRoads)[number]>();
    for (const road of mapRoads) {
      const name = localizeFeatureName(road, language);
      if (name === "—") continue;
      const current = byName.get(name);
      if (!current || road.geometry.coordinates.length > current.geometry.coordinates.length) byName.set(name, road);
    }
    return [...byName.entries()].map(([name, road]) => {
      const midpoint = road.geometry.coordinates[Math.floor(road.geometry.coordinates.length / 2)];
      return { name, roadClass: road.properties.class, position: projectPoint(midpoint, 11) };
    });
  }, [language]);
  useFrame(() => {
    const tier = camera.position.y < 3_800 ? 2 : camera.position.y < 7_500 ? 1 : 0;
    if (tier !== lastTier.current) {
      lastTier.current = tier;
      startTransition(() => setDetailTier(tier));
      invalidate();
    }
  });
  if (!visible) return null;
  return <>{labels.filter((label) => detailTier === 2 || (detailTier === 1 && label.roadClass !== "local") || (detailTier === 0 && ["major", "arterial"].includes(label.roadClass))).map((label) => (
    <Html key={`${label.name}-${label.position[0]}`} position={label.position} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
      <span className={`road-name-label ${label.roadClass}`}>{label.name}</span>
    </Html>
  ))}</>;
}

function RouteNetwork({ routeId, visible }: { routeId: string; visible: boolean }) {
  const route = routes.find((item) => item.id === routeId) ?? routes[0];
  const groups = useMemo(() => roadSegments(roadsByName([...route.roadNames]), 9.5), [route]);
  if (!visible) return null;
  return <group><SegmentLayer groups={groups} /><pointLight position={[mapBounds.center[0], 120, mapBounds.center[2]]} color={route.color} intensity={0.25} distance={5000} /></group>;
}

const vehicleUrls: Record<string, string> = {
  "city-bus": modelUrls["city-bus"],
  "autonomous-shuttle": modelUrls["autonomous-shuttle"],
  "shuttle-bus": modelUrls["shuttle-bus"],
  "metro-line10": modelUrls["metro-line10"],
  "passenger-ferry": modelUrls["passenger-ferry"],
};

const modeHeight: Record<TransitMode, number> = { bus: 15, metro: 18, shuttle: 15, tourism: 15, ferry: 4, cycle: 13 };

function MovingTransportVehicle({ modelKey, points, color, label, quality }: { modelKey: string; points: Point3[]; color: string; label: string; quality: SceneQuality }) {
  const url = vehicleUrls[modelKey];
  const gltf = useGLTF(url);
  const { invalidate } = useThree();
  const ref = useRef<THREE.Group>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, "centripetal"), [points]);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; } });
    return clone;
  }, [gltf.scene]);
  const start = useMemo(() => curve.getPointAt(0.23), [curve]);
  useFrame((state) => {
    if (!ref.current || quality === "efficiency") return;
    const progress = (state.clock.elapsedTime * 0.018 + 0.23) % 1;
    const position = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    ref.current.position.copy(position);
    ref.current.rotation.y = -Math.atan2(tangent.z, tangent.x);
    invalidate();
  });
  return <group ref={ref} position={start} scale={modelKey === "metro-line10" ? 3 : 4}>
    <primitive object={scene} dispose={null} />
    <Html position={[0, 7, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><span className="transport-vehicle-label" style={{ "--vehicle-color": color } as React.CSSProperties}>{label}</span></Html>
  </group>;
}

function TransportNetwork({ visible, lineId, stopId, onSelectStop, language, quality }: {
  visible: boolean;
  lineId: string;
  stopId?: string;
  onSelectStop: (id: string) => void;
  language: Language;
  quality: SceneQuality;
}) {
  const selectedLine = transportLines.find((line) => line.id === lineId) ?? transportLines[0];
  const stops = stopsForTransportLine(selectedLine.id);
  const lines = useMemo(() => transportLines.map((line) => {
    const points = projectPolyline(line.geometry.coordinates, modeHeight[line.properties.mode]);
    return { line, points, positions: lineSegments(points) };
  }), []);
  const selectedGeometry = lines.find(({ line }) => line.id === selectedLine.id);
  if (!visible) return null;
  return <group>
    {lines.filter(({ line }) => line.id !== selectedLine.id).map(({ line, positions }) => <WideColorLine key={line.id} positions={positions} color={line.properties.color} width={1.35} opacity={0.22} />)}
    {selectedGeometry && <WideColorLine positions={selectedGeometry.positions} color={selectedLine.properties.color} width={5.2} opacity={0.96} />}
    {stops.map((stop, index) => {
      const selected = stop.id === stopId;
      const important = selected || ["metro", "ferry", "terminal", "interchange", "portal"].includes(stop.properties.kind) || index === 0 || index === stops.length - 1;
      return <group key={stop.id} position={projectPoint(stop.geometry.coordinates, modeHeight[selectedLine.properties.mode] + 2)} onClick={(event) => { event.stopPropagation(); onSelectStop(stop.id); }}>
        <mesh scale={selected ? 1.5 : 1}><sphereGeometry args={[selected ? 10 : 7, 16, 12]} /><meshStandardMaterial color={selected ? "#fff4b5" : "#f8fbef"} emissive={selectedLine.properties.color} emissiveIntensity={selected ? 0.85 : 0.35} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}><ringGeometry args={[selected ? 16 : 11, selected ? 20 : 14, 24]} /><meshBasicMaterial color={selectedLine.properties.color} transparent opacity={0.72} side={THREE.DoubleSide} /></mesh>
        {important && <Html position={[0, 28, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><div className={`transport-stop-label ${selected ? "active" : ""}`} style={{ "--stop-color": selectedLine.properties.color } as React.CSSProperties}><span>{String(index + 1).padStart(2, "0")}</span><strong>{localizeFeatureName(stop, language)}</strong></div></Html>}
      </group>;
    })}
    {selectedGeometry && selectedLine.properties.modelKey && <Suspense fallback={null}><MovingTransportVehicle modelKey={selectedLine.properties.modelKey} points={selectedGeometry.points} color={selectedLine.properties.color} label={`${transportModeLabels[language][selectedLine.properties.mode]} · ${selectedLine.properties.ref}`} quality={quality} /></Suspense>}
    <Html position={selectedGeometry?.points[Math.floor((selectedGeometry?.points.length ?? 1) / 2)] ?? mapBounds.center} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <div className="transport-line-label" style={{ "--line-color": selectedLine.properties.color } as React.CSSProperties}><b>{selectedLine.properties.ref}</b><span>{localizeFeatureName(selectedLine, language)}</span><small>{localize(experienceCopy.transportVehicleScale, language)}</small></div>
    </Html>
  </group>;
}

function crossingHeight(id: string, type: CrossingType) {
  if (type === "tunnel") return 10;
  if (id === "jiangxinzhou-yangtze-bridge") return 34;
  if (id === "nanjing-eye-crossing") return 24;
  return 17;
}

function crossingLengthLabel(crossing: (typeof crossings)[number], language: Language) {
  if (crossing.properties.mainSpanM) return `${localize(experienceCopy.crossingSpan, language)} ${crossing.properties.mainSpanM} m`;
  if (crossing.properties.totalRouteM) return `${localize(experienceCopy.crossingLength, language)} ${(crossing.properties.totalRouteM / 1000).toFixed(1)} km`;
  return localize(crossing.properties.type === "bridge" ? experienceCopy.crossingTypeBridge : experienceCopy.crossingTypeTunnel, language);
}

function CrossingNetwork({ visible, selectedId, onSelect, language }: { visible: boolean; selectedId: string; onSelect: (id: string) => void; language: Language }) {
  const lineData = useMemo(() => crossings.map((crossing) => {
    const height = crossingHeight(crossing.id, crossing.properties.type);
    const points = projectPolyline(crossing.geometry.coordinates, height);
    const midpoint = points[Math.floor(points.length / 2)] ?? points[0];
    return { crossing, height, points, midpoint, positions: lineSegments(points) };
  }), []);
  if (!visible) return null;
  return <group>
    {lineData.map(({ crossing, midpoint, positions }) => {
      const selected = crossing.id === selectedId;
      const important = selected || ["jiangxinzhou-yangtze-bridge", "jiajiang-bridge", "nanjing-eye-crossing", "jiajiang-tunnel"].includes(crossing.id);
      return <group key={crossing.id}>
        <WideColorLine positions={positions} color={crossing.properties.color} width={selected ? 6 : crossing.properties.type === "tunnel" ? 2.2 : 3.4} opacity={selected ? 1 : crossing.properties.type === "tunnel" ? 0.66 : 0.82} />
        <mesh position={midpoint} onClick={(event) => { event.stopPropagation(); onSelect(crossing.id); }}>
          <sphereGeometry args={[selected ? 22 : 15, 12, 8]} />
          <meshBasicMaterial color={crossing.properties.color} transparent opacity={0.02} depthWrite={false} />
        </mesh>
        {important && <Html position={[midpoint[0], midpoint[1] + 35, midpoint[2]]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <div className={`crossing-label ${selected ? "active" : ""} ${crossing.properties.type}`} style={{ "--crossing-color": crossing.properties.color } as React.CSSProperties}>
            <span>{crossing.properties.type === "bridge" ? "BRIDGE" : "TUNNEL"}</span>
            <strong>{localizeFeatureName(crossing, language)}</strong>
            <small>{crossingLengthLabel(crossing, language)}</small>
          </div>
        </Html>}
      </group>;
    })}
  </group>;
}

function ObjectiveBeacon({ objectiveId, items }: { objectiveId?: number; items: Landmark[] }) {
  const objective = objectiveId ? items.find((item) => item.id === objectiveId) : undefined;
  if (!objective) return null;
  return <group position={anchorPosition(objective.anchorId, 8)}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[34, 45, 40]} />
      <meshBasicMaterial color="#f5d36f" transparent opacity={0.82} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
    <mesh position={[0, 60, 0]}>
      <cylinderGeometry args={[3, 14, 120, 20, 1, true]} />
      <meshBasicMaterial color="#f7d76f" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
    <mesh position={[0, 122, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[13, 24, 20]} />
      <meshBasicMaterial color="#fff0a8" />
    </mesh>
  </group>;
}

function CameraRig({ target, view, controls, quality }: { target: Point3; view: ViewMode; controls: React.RefObject<OrbitControlsImpl | null>; quality: SceneQuality }) {
  const { camera, invalidate } = useThree();
  const cameraGoal = useRef(camera.position.clone());
  const targetGoal = useRef(new THREE.Vector3(...regionalBounds.center));
  const moving = useRef(true);

  useEffect(() => {
    const span = Math.max(mapBounds.width, mapBounds.depth);
    const regionalSpan = Math.max(regionalBounds.width, regionalBounds.depth);
    if (view === "regional") cameraGoal.current.set(regionalBounds.center[0] + regionalSpan * 0.06, regionalSpan * (quality === "efficiency" ? 2.6 : 1.85), regionalBounds.center[2] + regionalSpan * 0.2);
    else if (view === "overview") cameraGoal.current.set(mapBounds.center[0] + span * 0.06, span * (quality === "efficiency" ? 2.65 : 1.75), mapBounds.center[2] + span * 0.22);
    else if (view === "route" && Math.hypot(target[0] - mapBounds.center[0], target[2] - mapBounds.center[2]) > 20) cameraGoal.current.set(target[0] + 240, Math.max(220, target[1] + 210), target[2] + 290);
    else if (view === "route") cameraGoal.current.set(mapBounds.center[0] + span * 0.12, span * (quality === "efficiency" ? 1.42 : 1.12), mapBounds.center[2] + span * 0.3);
    else cameraGoal.current.set(target[0] + 180, Math.max(165, target[1] + 160), target[2] + 220);
    targetGoal.current.set(...target);
    moving.current = true;
    invalidate();
  }, [invalidate, quality, target, view]);

  useFrame((_, delta) => {
    if (!moving.current) return;
    camera.position.set(
      THREE.MathUtils.damp(camera.position.x, cameraGoal.current.x, 5.5, delta),
      THREE.MathUtils.damp(camera.position.y, cameraGoal.current.y, 5.5, delta),
      THREE.MathUtils.damp(camera.position.z, cameraGoal.current.z, 5.5, delta),
    );
    if (controls.current) {
      controls.current.target.set(
        THREE.MathUtils.damp(controls.current.target.x, targetGoal.current.x, 7, delta),
        THREE.MathUtils.damp(controls.current.target.y, targetGoal.current.y, 7, delta),
        THREE.MathUtils.damp(controls.current.target.z, targetGoal.current.z, 7, delta),
      );
      controls.current.update();
    }
    const cameraSettled = camera.position.distanceToSquared(cameraGoal.current) < 0.45;
    const targetSettled = !controls.current || controls.current.target.distanceToSquared(targetGoal.current) < 0.2;
    moving.current = !(cameraSettled && targetSettled);
    if (moving.current) invalidate();
  });
  return null;
}

function MarkerLabels({ items, selectedId, onSelect, language, view, objectiveId, discoveredIds, expeditionIds }: {
  items: Landmark[];
  selectedId: number;
  onSelect: (id: number) => void;
  language: Language;
  view: ViewMode;
  objectiveId?: number;
  discoveredIds: readonly number[];
  expeditionIds: readonly number[];
}) {
  const { camera, size, invalidate } = useThree();
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set([selectedId]));
  const lastView = useRef("");
  const discovered = useMemo(() => new Set(discoveredIds), [discoveredIds]);
  const expedition = useMemo(() => new Set(expeditionIds), [expeditionIds]);

  useEffect(() => invalidate(), [discoveredIds, expeditionIds, invalidate, language, objectiveId, selectedId, size.height, size.width]);

  useFrame(() => {
    const signature = `${camera.position.x.toFixed(1)}:${camera.position.y.toFixed(1)}:${camera.position.z.toFixed(1)}:${camera.quaternion.x.toFixed(3)}:${camera.quaternion.y.toFixed(3)}:${size.width}:${size.height}:${selectedId}:${objectiveId ?? 0}:${discoveredIds.join("-")}:${language}`;
    if (signature === lastView.current) return;
    lastView.current = signature;
    const candidates = items.map((item) => {
      const projected = new THREE.Vector3(...anchorPosition(item.anchorId, 48)).project(camera);
      return {
        item,
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
        visible: projected.z < 1 && projected.x > -1.08 && projected.x < 1.08 && projected.y > -1.08 && projected.y < 1.08,
      };
    }).filter((candidate) => candidate.visible && (expedition.has(candidate.item.id) || candidate.item.id === selectedId)).sort((a, b) => Number(b.item.id === objectiveId) - Number(a.item.id === objectiveId) || Number(b.item.id === selectedId) - Number(a.item.id === selectedId) || a.item.priority - b.item.priority);
    const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const next = new Set<number>();
    const overviewLimit = camera.position.y > 7_500 ? (size.width < 720 ? 4 : 7) : items.length;
    for (const candidate of candidates) {
      if (next.size >= overviewLimit && candidate.item.id !== selectedId && candidate.item.id !== objectiveId) continue;
      const width = language === "en" ? (size.width < 720 ? 128 : 164) : (size.width < 720 ? 96 : 112);
      const box = { x1: candidate.x - width / 2, y1: candidate.y - 20, x2: candidate.x + width / 2, y2: candidate.y + 20 };
      const collides = boxes.some((current) => !(box.x2 < current.x1 || box.x1 > current.x2 || box.y2 < current.y1 || box.y1 > current.y2));
      if (!collides || candidate.item.id === selectedId) {
        next.add(candidate.item.id);
        boxes.push(box);
      }
    }
    const current = [...visibleIds].sort().join(",");
    const upcoming = [...next].sort().join(",");
    if (current !== upcoming) startTransition(() => setVisibleIds(next));
  });

  return <>{items.map((item) => {
    const selected = item.id === selectedId;
    const focused = view === "landmark" && selected;
    const objective = item.id === objectiveId;
    const found = discovered.has(item.id);
    const radius = objective ? 20 : selected ? 18 : 13;
    return (
      <group key={item.id} position={anchorPosition(item.anchorId, 26)} onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
        {!focused && <mesh scale={selected ? 1.22 : 1}>
          <sphereGeometry args={[radius, 16, 12]} />
          <meshStandardMaterial color={objective ? "#f5d36f" : found ? "#8fd5aa" : item.accent} emissive={objective ? "#f5d36f" : item.accent} emissiveIntensity={objective ? 0.8 : selected ? 0.5 : 0.14} />
        </mesh>}
        <mesh position={[0, -15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[focused ? 7 : selected ? 23 : 17, focused ? 10 : selected ? 29 : 22, 24]} />
          <meshBasicMaterial color={item.accent} transparent opacity={0.66} side={THREE.DoubleSide} />
        </mesh>
        {visibleIds.has(item.id) && <Html position={[0, 42, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <div className={`map-label ${selected ? "is-selected" : ""} ${objective ? "is-objective" : ""} ${found ? "is-discovered" : ""}`} style={{ "--label-accent": objective ? "#d7a923" : found ? "#4e9b6a" : item.accent } as React.CSSProperties}>
            <span>{String(item.id).padStart(2, "0")}</span><strong>{localize(landmarkCopy[item.id].name, language)}</strong>
          </div>
        </Html>}
      </group>
    );
  })}</>;
}

function SceneControls({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { invalidate, performance } = useThree();
  return <OrbitControls
    ref={controls}
    makeDefault
    enableDamping
    dampingFactor={0.075}
    minDistance={150}
    maxDistance={52_000}
    maxPolarAngle={Math.PI / 2.02}
    target={regionalBounds.center}
    onStart={() => performance.regress()}
    onChange={() => invalidate()}
    onEnd={() => invalidate()}
  />;
}

function DeferredAssets({ layers, quality, onCoreReady }: { layers: LayerVisibility; quality: SceneQuality; onCoreReady: () => void }) {
  const [idleAssets, setIdleAssets] = useState(false);
  useEffect(() => {
    if (quality === "efficiency") return undefined;
    const windowWithIdle = window as typeof window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (windowWithIdle.requestIdleCallback) {
      const id = windowWithIdle.requestIdleCallback(() => setIdleAssets(true), { timeout: 1800 });
      return () => windowWithIdle.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setIdleAssets(true), 900);
    return () => window.clearTimeout(id);
  }, [quality]);

  return <Suspense fallback={null}>
    <Asset url={modelUrls.terrain} onReady={onCoreReady} />
    {layers.buildings && <><Asset url={modelUrls.south} /><Asset url={modelUrls.center} /><Asset url={modelUrls.north} /></>}
    {layers.landscape && quality !== "efficiency" && idleAssets && <Asset url={modelUrls.vegetation} />}
    {layers.landmarks && <Asset url={modelUrls.landmarks} />}
    {layers.crossings && <Asset url={modelUrls.contextBridges} />}
  </Suspense>;
}

function SceneContent({ items, selectedId, onSelect, onReady, routeId, view, target, layers, language, quality, objectiveId, expeditionLandmarkIds, discoveredLandmarkIds, selectedTransportLineId, selectedTransportStopId, onSelectTransportStop, selectedCrossingId, onSelectCrossing }: JiangxinzhouSceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const reportedReady = useRef(false);
  const reportReady = useCallback(() => {
    if (reportedReady.current) return;
    reportedReady.current = true;
    onReady();
  }, [onReady]);

  return <>
    <color attach="background" args={["#72b7c0"]} />
    <fog attach="fog" args={["#72b7c0", 18_000, 48_000]} />
    <hemisphereLight intensity={1.55} color="#f5f6e9" groundColor="#39747b" />
    <directionalLight position={[-4_000, 8_000, 3_000]} intensity={2.25} color="#fff1cf" />
    <Water visible={layers.water} />
    <RegionalContext waterVisible={layers.water} surroundingsVisible={layers.surroundings} language={language} />
    <CoordinateGrid visible={layers.coordinates} view={view} language={language} />
    <DeferredAssets layers={layers} quality={quality} onCoreReady={reportReady} />
    <LandscapeZones visible={layers.landscape} />
    <ContextRoadNetwork visible={layers.surroundings} />
    <RoadNetwork visible={layers.roads} />
    <RoadNameLabels visible={layers.roads} language={language} />
    <CrossingNetwork visible={layers.crossings} selectedId={selectedCrossingId} onSelect={onSelectCrossing} language={language} />
    <RouteNetwork routeId={routeId} visible={view === "route" && !layers.transport} />
    <TransportNetwork visible={layers.transport} lineId={selectedTransportLineId} stopId={selectedTransportStopId} onSelectStop={onSelectTransportStop} language={language} quality={quality} />
    {layers.landmarks && <ObjectiveBeacon objectiveId={objectiveId} items={items} />}
    {layers.landmarks && <MarkerLabels items={items} selectedId={selectedId} onSelect={onSelect} language={language} view={view} objectiveId={objectiveId} discoveredIds={discoveredLandmarkIds} expeditionIds={expeditionLandmarkIds} />}
    <CameraRig target={target} view={view} controls={controls} quality={quality} />
    <SceneControls controls={controls} />
    <AdaptiveDpr pixelated={quality === "efficiency"} />
  </>;
}

export default function JiangxinzhouScene(props: JiangxinzhouSceneProps) {
  const dpr: [number, number] = props.quality === "high" ? [1, 1.75] : props.quality === "balanced" ? [0.9, 1.4] : [0.75, 1];
  return (
    <Canvas
      dpr={dpr}
      frameloop="demand"
      camera={{ fov: 38, position: [6_000, 17_000, 7_000], near: 20, far: 60_000 }}
      gl={{ antialias: props.quality !== "efficiency", powerPreference: "high-performance", alpha: false, stencil: false, preserveDrawingBuffer: true }}
      performance={{ min: 0.62, max: 1, debounce: 500 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.03;
      }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
