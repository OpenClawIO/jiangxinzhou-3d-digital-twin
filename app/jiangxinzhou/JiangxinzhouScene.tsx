"use client";

import { AdaptiveDpr, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LineMaterial, LineSegments2, LineSegmentsGeometry, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { routes, type Landmark } from "./landmarks";
import { landmarkCopy, localize, type Language } from "./locales";
import {
  anchorPosition,
  landscapeShapes,
  mapBounds,
  mapRoads,
  projectPolyline,
  roadColor,
  roadsByName,
  type Point3,
  type RoadClass,
} from "./mapGeometry";
import type { JiangxinzhouSceneProps, LayerVisibility, SceneQuality, ViewMode } from "./sceneTypes";

const modelUrls = {
  terrain: "/models/jiangxinzhou-v2/terrain.glb",
  south: "/models/jiangxinzhou-v2/buildings-south.glb",
  center: "/models/jiangxinzhou-v2/buildings-center.glb",
  north: "/models/jiangxinzhou-v2/buildings-north.glb",
  vegetation: "/models/jiangxinzhou-v2/vegetation.glb",
  landmarks: "/models/jiangxinzhou-v2/landmarks.glb",
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

function RouteNetwork({ routeId, visible }: { routeId: string; visible: boolean }) {
  const route = routes.find((item) => item.id === routeId) ?? routes[0];
  const groups = useMemo(() => roadSegments(roadsByName([...route.roadNames]), 9.5), [route]);
  if (!visible) return null;
  return <group><SegmentLayer groups={groups} /><pointLight position={[mapBounds.center[0], 120, mapBounds.center[2]]} color={route.color} intensity={0.25} distance={5000} /></group>;
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

function SceneContent({ items, selectedId, onSelect, onReady, routeId, view, target, layers, language, quality, objectiveId, expeditionLandmarkIds, discoveredLandmarkIds }: JiangxinzhouSceneProps) {
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
    <RouteNetwork routeId={routeId} visible={view === "route"} />
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
