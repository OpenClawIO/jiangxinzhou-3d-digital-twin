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
  landscapeShapes,
  localizeFeatureName,
  mapBounds,
  mapRoads,
  projectPoint,
  projectPolyline,
  roadColor,
  roadsByName,
  stopsForTransportLine,
  transportLines,
  type Point3,
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
} as const;

// Start only the two critical visual assets when this dynamically loaded module arrives.
// Buildings are requested by Suspense and the largest GLB (vegetation) waits for idle time.
useGLTF.preload(modelUrls.terrain);
useGLTF.preload(modelUrls.landmarks);

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

function Water() {
  const span = Math.max(mapBounds.width, mapBounds.depth) * 1.9;
  return (
    <mesh position={[mapBounds.center[0], -3.4, mapBounds.center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[span, span]} />
      <meshPhysicalMaterial color="#4d9ca8" roughness={0.42} metalness={0.04} clearcoat={0.18} clearcoatRoughness={0.7} />
    </mesh>
  );
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
  const targetGoal = useRef(new THREE.Vector3(...mapBounds.center));
  const moving = useRef(true);

  useEffect(() => {
    const span = Math.max(mapBounds.width, mapBounds.depth);
    if (view === "overview") cameraGoal.current.set(mapBounds.center[0] + span * 0.06, span * (quality === "efficiency" ? 2.65 : 1.75), mapBounds.center[2] + span * 0.22);
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
    maxDistance={22_000}
    maxPolarAngle={Math.PI / 2.02}
    target={mapBounds.center}
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
  </Suspense>;
}

function SceneContent({ items, selectedId, onSelect, onReady, routeId, view, target, layers, language, quality, objectiveId, expeditionLandmarkIds, discoveredLandmarkIds, selectedTransportLineId, selectedTransportStopId, onSelectTransportStop }: JiangxinzhouSceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const reportedReady = useRef(false);
  const reportReady = useCallback(() => {
    if (reportedReady.current) return;
    reportedReady.current = true;
    onReady();
  }, [onReady]);

  return <>
    <color attach="background" args={["#72b7c0"]} />
    <fog attach="fog" args={["#72b7c0", 12_000, 27_000]} />
    <hemisphereLight intensity={1.55} color="#f5f6e9" groundColor="#39747b" />
    <directionalLight position={[-4_000, 8_000, 3_000]} intensity={2.25} color="#fff1cf" />
    <Water />
    <DeferredAssets layers={layers} quality={quality} onCoreReady={reportReady} />
    <LandscapeZones visible={layers.landscape} />
    <RoadNetwork visible={layers.roads} />
    <RoadNameLabels visible={layers.roads} language={language} />
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
      camera={{ fov: 38, position: [6_000, 11_000, 7_000], near: 20, far: 30_000 }}
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
