"use client";

import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import * as THREE from "three";
import { type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { calculateCelestialState, celestialDirection, type CelestialState } from "./celestial";
import { viewModeFromFocus, type CameraCommand, type CameraPhase, type SceneFocus } from "./interactionState";
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
  waterBodies,
  type Point3,
  type CrossingType,
  type RoadClass,
  type TransitMode,
} from "./mapGeometry";
import { nanjingEyeBounds, nanjingEyeLod1, nanjingEyeLod2 } from "./nanjingEye";
import PorpoiseLayer from "./PorpoiseLayer";
import PetLayer from "./PetLayer";
import RoadLayer from "./RoadLayerView";
import { prepareScene, type AssetRole, type PreparedScene } from "./render/materials";
import { RenderEffects, ProceduralEnvironment, ProceduralSky, WaterSurface, celestialPosition } from "./render/RenderEnvironment";
import { FrameBudgetScheduler, RendererLifecycle, RenderTelemetryProbe, ShaderCompiler } from "./render/RenderRuntime";
import { buildRibbonGeometry, type RibbonPath } from "./render/roadGeometry";
import type { RenderProfile } from "./render/runtime";
import type { JiangxinzhouSceneProps, LayerVisibility, SceneQuality, ViewMode, ViewportInsets } from "./sceneTypes";
import type { TransitRealtimeSnapshot, TransitVehicleRealtime } from "./transit/realtime";

const modelUrls = {
  terrain: "/models/jiangxinzhou-v2/terrain.glb",
  south: "/models/jiangxinzhou-v2/buildings-south.glb",
  center: "/models/jiangxinzhou-v2/buildings-center.glb",
  north: "/models/jiangxinzhou-v2/buildings-north.glb",
  vegetation: "/models/jiangxinzhou-v2/vegetation.glb",
  landmarks: "/models/jiangxinzhou-v2/landmarks.glb",
  nanjingEyeLod1: nanjingEyeLod1.url,
  nanjingEyeLod2: nanjingEyeLod2.url,
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
useGLTF.preload(modelUrls.nanjingEyeLod1);
useGLTF.preload(modelUrls.contextBridges);

class OptionalAssetBoundary extends Component<{ name: string; children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`Optional 3D asset ${this.props.name} was skipped`, error, info.componentStack);
    window.setTimeout(() => this.props.onError?.(), 0);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function PreparedAssetPrimitive({ prepared, role, tier, url, onReady, nightFactor, shadows, compileBeforeReveal }: {
  prepared: PreparedScene;
  role: AssetRole;
  tier: SceneQuality;
  url: string;
  onReady?: () => void;
  nightFactor: number;
  shadows: boolean;
  compileBeforeReveal: boolean;
}) {
  const { gl, invalidate, camera, scene: rootScene } = useThree();
  const rendererRef = useRef(gl);
  const uniformsRef = useRef(prepared.uniforms);
  const [compiled, setCompiled] = useState(!compileBeforeReveal);
  useEffect(() => {
    let cancelled = false;
    if (!compileBeforeReveal) {
      onReady?.();
      return undefined;
    }
    // Three 0.185 can race when several GLBs call compileAsync in parallel:
    // its readiness poll may observe a material before currentProgram exists.
    // Compile synchronously for the small, already-loaded asset and keep the
    // reveal atomic; the main scene remains demand-rendered.
    Promise.resolve().then(() => gl.compile(prepared.scene, camera, rootScene)).then(() => {
      if (cancelled) return;
      setCompiled(true);
      onReady?.();
      invalidate();
    }).catch((error) => {
      console.warn(`Unable to precompile ${url}`, error);
      if (!cancelled) {
        setCompiled(true);
        onReady?.();
      }
    });
    return () => { cancelled = true; };
  }, [camera, compileBeforeReveal, gl, invalidate, onReady, prepared.scene, rootScene, url]);
  useEffect(() => {
    uniformsRef.current.nightFactor.value = nightFactor;
    invalidate();
  }, [invalidate, nightFactor]);
  useEffect(() => {
    if (shadows) rendererRef.current.shadowMap.needsUpdate = true;
  }, [prepared, shadows]);
  useFrame(({ clock }) => {
    if (role === "vegetation" && tier !== "efficiency") uniformsRef.current.time.value = clock.elapsedTime;
  });
  return compiled ? <primitive object={prepared.scene} dispose={null} /> : null;
}

function Asset({ url, role, tier, onReady, nightFactor = 0, nightLighting = false, shadows = false, legacy = false, compileBeforeReveal = false }: {
  url: string;
  role: AssetRole;
  tier: SceneQuality;
  onReady?: () => void;
  nightFactor?: number;
  nightLighting?: boolean;
  shadows?: boolean;
  legacy?: boolean;
  compileBeforeReveal?: boolean;
}) {
  const gltf = useGLTF(url);
  const prepared = useMemo(() => prepareScene(gltf.scene, {
    role: legacy && !nightLighting ? "landmarks" : role,
    tier,
    nightLighting,
    shadows,
  }), [gltf.scene, legacy, nightLighting, role, shadows, tier]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  return <PreparedAssetPrimitive key={prepared.scene.uuid} prepared={prepared} role={role} tier={tier} url={url} onReady={onReady} nightFactor={nightFactor} shadows={shadows} compileBeforeReveal={compileBeforeReveal} />;
}

function blendColor(from: string, to: string, amount: number) {
  return `#${new THREE.Color(from).lerp(new THREE.Color(to), THREE.MathUtils.clamp(amount, 0, 1)).getHexString()}`;
}

function LegacyWater({ visible, daylight }: { visible: boolean; daylight: number }) {
  const span = Math.max(regionalBounds.width, regionalBounds.depth) * 1.18;
  if (!visible) return null;
  return (
    <mesh position={[regionalBounds.center[0], -40, regionalBounds.center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[span, span]} />
      <meshPhysicalMaterial color={blendColor("#071c2c", "#245e78", daylight)} roughness={0.46} metalness={0.04} clearcoat={0.18 + daylight * 0.12} clearcoatRoughness={0.7} />
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

function RegionalContext({ waterVisible, surroundingsVisible, language, daylight }: { waterVisible: boolean; surroundingsVisible: boolean; language: Language; daylight: number }) {
  const { size } = useThree();
  const waters = useMemo(() => mapDataShapes(), []);
  const showBankLabels = size.width >= 760;
  const blocks = useMemo(() => [
    [118.635, 32.055, 34, 116, 26], [118.646, 32.044, 42, 150, 34], [118.634, 32.004, 28, 82, 20],
    [118.740, 32.062, 38, 128, 28], [118.733, 32.043, 54, 178, 42], [118.740, 32.011, 30, 104, 24],
    [118.699, 32.084, 24, 90, 18], [118.675, 31.970, 32, 120, 22],
  ] as [number, number, number, number, number][], []);
  if (!waterVisible && !surroundingsVisible) return null;
  return <group>
    {waterVisible && waters.water.map((water) => (
      <group key={water.id}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -18, 0]} renderOrder={0}>
          <shapeGeometry args={[water.shape]} />
          <meshBasicMaterial color={water.id === "jiajiang" ? blendColor("#0b3144", contextPalette.jiajiang, daylight) : blendColor("#08283d", contextPalette.yangtze, daylight)} transparent opacity={water.id === "jiajiang" ? 0.92 : 0.9} depthWrite={false} side={THREE.DoubleSide} />
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
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} renderOrder={1}>
            <shapeGeometry args={[land.shape]} />
            <meshBasicMaterial color={land.feature.properties.kind === "north-bank" ? contextPalette.landNorth : contextPalette.land} depthWrite side={THREE.FrontSide} />
          </mesh>
          {showBankLabels && <Html position={[land.label[0], 9, land.label[2]]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
            <div className="context-bank-label"><span>{land.feature.properties.kind.replace("-", " ").toUpperCase()}</span><strong>{localizeFeatureName(land.feature, language)}</strong></div>
          </Html>}
        </group>
      ))}
      {blocks.map(([longitude, latitude, width, depth, height], index) => {
        const [x, , z] = projectPoint([longitude, latitude], height / 2);
        return <mesh key={`context-block-${index}`} position={[x, height / 2 + 0.2, z]} rotation={[0, (index % 3) * 0.18, 0]}>
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
    const borderPoints = feature.geometry.coordinates[0].map((coordinate) => projectPoint(coordinate, -17.8));
    const center = ring.reduce(([x, y], [nextX, nextY]) => [x + nextX, y + nextY], [0, 0] as [number, number]);
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    return {
      feature,
      id: feature.id,
      center: [(Math.min(...xs) + Math.max(...xs)) / 2, -18, (Math.min(...ys) + Math.max(...ys)) / 2] as Point3,
      shape,
      borderPositions: lineSegments([...borderPoints, borderPoints[0]]),
      color: feature.properties.color,
      opacity: feature.properties.opacity,
      label: [center[0] / ring.length, -8, -center[1] / ring.length] as Point3,
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

function StableSegmentLine({ positions, color, opacity, renderOrder = 1 }: { positions: Float32Array; color: string; opacity: number; renderOrder?: number }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: true, depthWrite: false });
    const segments = new THREE.LineSegments(geometry, material);
    segments.frustumCulled = true;
    segments.renderOrder = renderOrder;
    return segments;
  }, [color, opacity, positions, renderOrder]);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); }, [line]);
  return <primitive object={line} />;
}

function WideRoadGroup({ roadClass, positions, opacity }: { roadClass: RoadClass; positions: Float32Array; opacity: number }) {
  return <StableSegmentLine positions={positions} color={roadColor(roadClass)} opacity={opacity} renderOrder={2} />;
}

function WideColorLine({ positions, color, opacity }: { positions: Float32Array; color: string; width: number; opacity: number }) {
  return <StableSegmentLine positions={positions} color={color} opacity={opacity} renderOrder={3} />;
}

const routeRibbonVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const routeRibbonFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlow;
  varying vec2 vUv;
  void main() {
    float laneEdge = smoothstep(0.0, 0.09, vUv.x) * (1.0 - smoothstep(0.91, 1.0, vUv.x));
    float dash = 0.5 + 0.5 * sin(vUv.y * 0.055 - uTime * 1.8);
    float pulse = mix(1.0, 0.72 + dash * 0.4, uFlow);
    gl_FragColor = vec4(uColor * pulse, uOpacity * laneEdge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function RibbonMesh({ paths, color, opacity = 1, renderOrder = 2, flow = false, animate = false }: {
  paths: RibbonPath[];
  color: string;
  opacity?: number;
  renderOrder?: number;
  flow?: boolean;
  animate?: boolean;
}) {
  const geometry = useMemo(() => buildRibbonGeometry(paths), [paths]);
  const material = useMemo(() => {
    if (!flow) return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0.02,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    return new THREE.ShaderMaterial({
      vertexShader: routeRibbonVertex,
      fragmentShader: routeRibbonFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uTime: { value: 0 },
        uFlow: { value: animate ? 1 : 0 },
      },
    });
  }, [animate, color, flow, opacity]);
  const materialRef = useRef(material);
  useEffect(() => { materialRef.current = material; }, [material]);
  useFrame(({ clock }) => {
    if (animate && materialRef.current instanceof THREE.ShaderMaterial) materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh geometry={geometry} material={material} renderOrder={renderOrder} receiveShadow />;
}

function CoordinateGridLine({ positions, opacity }: { positions: Float32Array; opacity: number }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.LineDashedMaterial({ color: "#8eb7ad", transparent: true, opacity, dashSize: 140, gapSize: 230, depthTest: true, depthWrite: false });
    const segments = new THREE.LineSegments(geometry, material);
    segments.computeLineDistances();
    segments.renderOrder = 3;
    return segments;
  }, [opacity, positions]);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); }, [line]);
  return <primitive object={line} />;
}

function CoordinateGrid({ visible, view }: { visible: boolean; view: ViewMode }) {
  const bounds = view === "regional" ? regionalBounds : mapBounds;
  const grid = useMemo(() => {
    const vertical = Array.from({ length: 5 }, (_, index) => bounds.minX + (bounds.width * index) / 4);
    const horizontal = Array.from({ length: 5 }, (_, index) => bounds.minZ + (bounds.depth * index) / 4);
    const verticalPositions = new Float32Array(vertical.flatMap((x) => [x, 15, bounds.minZ, x, 15, bounds.maxZ]));
    const horizontalPositions = new Float32Array(horizontal.flatMap((z) => [bounds.minX, 15, z, bounds.maxX, 15, z]));
    return { verticalPositions, horizontalPositions };
  }, [bounds]);
  if (!visible) return null;
  return <group>
    <CoordinateGridLine positions={grid.verticalPositions} opacity={view === "regional" ? 0.12 : 0.08} />
    <CoordinateGridLine positions={grid.horizontalPositions} opacity={view === "regional" ? 0.12 : 0.08} />
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

function LegacyRoadNetwork({ visible }: { visible: boolean }) {
  const groups = useMemo(() => roadSegments(mapRoads, 8.2), []);
  if (!visible) return null;
  return <SegmentLayer groups={groups} />;
}

function ContextRoadNetwork({ visible, legacy }: { visible: boolean; legacy: boolean }) {
  const positions = useMemo(() => new Float32Array(contextRoads.flatMap((road) => {
    const points = projectPolyline(road.geometry.coordinates, 7.8);
    return points.slice(0, -1).flatMap((point, index) => [...point, ...points[index + 1]]);
  })), []);
  const paths = useMemo<RibbonPath[]>(() => contextRoads.map((road) => ({ points: projectPolyline(road.geometry.coordinates, 7.8), widthM: road.properties.widthM })), []);
  if (!visible) return null;
  return legacy ? <WideColorLine positions={positions} color="#c8b879" width={2.6} opacity={0.68} /> : <RibbonMesh paths={paths} color="#756d54" opacity={0.7} />;
}

function RouteNetwork({ routeId, visible, legacy, animate }: { routeId: string; visible: boolean; legacy: boolean; animate: boolean }) {
  const route = routes.find((item) => item.id === routeId) ?? routes[0];
  const groups = useMemo(() => roadSegments(roadsByName([...route.roadNames]), 9.5), [route]);
  const paths = useMemo(() => roadsByName([...route.roadNames]).map((road) => ({ points: projectPolyline(road.geometry.coordinates, 9.6), widthM: road.properties.widthM + 4 })), [route]);
  if (!visible) return null;
  return legacy
    ? <group><SegmentLayer groups={groups} /><pointLight position={[mapBounds.center[0], 120, mapBounds.center[2]]} color={route.color} intensity={0.25} distance={5000} /></group>
    : <RibbonMesh paths={paths} color={route.color} opacity={0.92} renderOrder={4} flow animate={animate} />;
}

const vehicleUrls: Record<string, string> = {
  "city-bus": modelUrls["city-bus"],
  "autonomous-shuttle": modelUrls["autonomous-shuttle"],
  "shuttle-bus": modelUrls["shuttle-bus"],
  "metro-line10": modelUrls["metro-line10"],
  "passenger-ferry": modelUrls["passenger-ferry"],
};

const modeHeight: Record<TransitMode, number> = { bus: 15, metro: 18, shuttle: 15, tourism: 15, ferry: 4, cycle: 13 };

function MovingTransportVehicle({ modelKey, points, color, label, profile, realtimeVehicle }: { modelKey: string; points: Point3[]; color: string; label: string; profile: RenderProfile; realtimeVehicle?: TransitVehicleRealtime }) {
  const url = vehicleUrls[modelKey];
  const gltf = useGLTF(url);
  const ref = useRef<THREE.Group>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, "centripetal"), [points]);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; } });
    return clone;
  }, [gltf.scene]);
  const start = useMemo(() => curve.getPointAt(0.23), [curve]);
  const lastTick = useRef(0);
  const progressRef = useRef(realtimeVehicle?.progress ?? 0.23);
  const targetProgressRef = useRef(realtimeVehicle?.progress ?? 0.23);
  const realtimeProgress = realtimeVehicle?.progress;
  useEffect(() => {
    if (realtimeProgress !== undefined) targetProgressRef.current = realtimeProgress;
  }, [realtimeProgress]);
  useFrame((state) => {
    if (!ref.current || profile.trafficFps === 0) return;
    if (state.clock.elapsedTime - lastTick.current < 1 / profile.trafficFps) return;
    const frameDelta = state.clock.elapsedTime - lastTick.current;
    lastTick.current = state.clock.elapsedTime;
    if (realtimeVehicle) {
      const current = progressRef.current;
      const target = targetProgressRef.current;
      const delta = ((target - current + 1.5) % 1) - 0.5;
      progressRef.current = (current + delta * Math.min(1, frameDelta * 4) + 0.0018) % 1;
    } else {
      progressRef.current = (state.clock.elapsedTime * 0.018 + 0.23) % 1;
    }
    const progress = progressRef.current;
    const position = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    ref.current.position.copy(position);
    ref.current.rotation.y = -Math.atan2(tangent.z, tangent.x);
  });
  return <group ref={ref} position={start} scale={modelKey === "metro-line10" ? 3 : 4}>
    <primitive object={scene} dispose={null} />
    <Html position={[0, 7, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><span className="transport-vehicle-label" style={{ "--vehicle-color": color } as React.CSSProperties}>{label}</span></Html>
  </group>;
}

function TransportNetwork({ visible, lineId, stopId, onSelectStop, language, profile, legacy, transitSnapshot }: {
  visible: boolean;
  lineId: string;
  stopId?: string;
  onSelectStop: (id: string) => void;
  language: Language;
  profile: RenderProfile;
  legacy: boolean;
  transitSnapshot?: TransitRealtimeSnapshot;
}) {
  const { gl, size } = useThree();
  const selectedLine = transportLines.find((line) => line.id === lineId) ?? transportLines[0];
  const stops = stopsForTransportLine(selectedLine.id);
  const lines = useMemo(() => transportLines.map((line) => {
    const points = projectPolyline(line.geometry.coordinates, modeHeight[line.properties.mode]);
    return { line, points, positions: lineSegments(points), ribbon: [{ points, widthM: 4 }] as RibbonPath[] };
  }), []);
  const selectedGeometry = lines.find(({ line }) => line.id === selectedLine.id);
  const selectedRealtimeVehicle = transitSnapshot?.vehicles.find((vehicle) => vehicle.lineId === selectedLine.id);
  const selectedRibbon = useMemo<RibbonPath[]>(() => selectedGeometry ? [{ points: selectedGeometry.points, widthM: 12 }] : [], [selectedGeometry]);
  if (!visible) return null;
  return <group>
    {lines.filter(({ line }) => line.id !== selectedLine.id).map(({ line, positions, ribbon }) => legacy
      ? <WideColorLine key={line.id} positions={positions} color={line.properties.color} width={1.35} opacity={0.22} />
      : <RibbonMesh key={line.id} paths={ribbon} color={line.properties.color} opacity={0.2} renderOrder={3} />)}
    {selectedGeometry && (legacy
      ? <WideColorLine positions={selectedGeometry.positions} color={selectedLine.properties.color} width={5.2} opacity={0.96} />
      : <RibbonMesh paths={selectedRibbon} color={selectedLine.properties.color} opacity={0.94} renderOrder={4} flow animate={profile.trafficFps > 0} />)}
    {stops.map((stop, index) => {
      const selected = stop.id === stopId;
      const important = selected || (size.width >= 760 && (["metro", "ferry", "terminal", "interchange", "portal"].includes(stop.properties.kind) || index === 0 || index === stops.length - 1));
      return <group key={`${selectedLine.id}-${stop.id}-${index}`} position={projectPoint(stop.geometry.coordinates, modeHeight[selectedLine.properties.mode] + 2)} onPointerOver={(event) => { event.stopPropagation(); gl.domElement.classList.add("is-targeting"); }} onPointerOut={() => { gl.domElement.classList.remove("is-targeting"); }} onClick={(event) => { event.stopPropagation(); if (event.delta <= 6) onSelectStop(stop.id); }}>
        <mesh><sphereGeometry args={[selected ? 24 : 20, 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        <mesh scale={selected ? 1.5 : 1}><sphereGeometry args={[selected ? 10 : 7, 16, 12]} /><meshStandardMaterial color={selected ? "#fff4b5" : "#f8fbef"} emissive={selectedLine.properties.color} emissiveIntensity={selected ? 0.85 : 0.35} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}><ringGeometry args={[selected ? 16 : 11, selected ? 20 : 14, 24]} /><meshBasicMaterial color={selectedLine.properties.color} transparent opacity={0.72} side={THREE.DoubleSide} /></mesh>
        {important && <Html position={[0, 28, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}><div className={`transport-stop-label ${selected ? "active" : ""}`} style={{ "--stop-color": selectedLine.properties.color } as React.CSSProperties}><span>{String(index + 1).padStart(2, "0")}</span><strong>{localizeFeatureName(stop, language)}</strong></div></Html>}
      </group>;
    })}
    {selectedGeometry && selectedLine.properties.modelKey && (!transitSnapshot || selectedRealtimeVehicle) && <OptionalAssetBoundary name={`transport-${selectedLine.properties.modelKey}`}><Suspense fallback={null}><MovingTransportVehicle modelKey={selectedLine.properties.modelKey} points={selectedGeometry.points} color={selectedLine.properties.color} label={`${transportModeLabels[language][selectedLine.properties.mode]} · ${selectedLine.properties.ref}`} profile={profile} realtimeVehicle={selectedRealtimeVehicle} /></Suspense></OptionalAssetBoundary>}
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
  if (crossing.properties.officialMainSpanM) return `${localize(experienceCopy.crossingSpan, language)} ${crossing.properties.officialMainSpanM} m`;
  if (crossing.properties.officialStructureLengthM) return `${localize(experienceCopy.crossingStructureLength, language)} ${(crossing.properties.officialStructureLengthM / 1000).toFixed(1)} km`;
  if (crossing.properties.officialProjectLengthM) return `${localize(experienceCopy.crossingProjectLength, language)} ${(crossing.properties.officialProjectLengthM / 1000).toFixed(3)} km`;
  return `${localize(experienceCopy.crossingGeometryLength, language)} ${(crossing.properties.measuredGeometryLengthM / 1000).toFixed(2)} km`;
}

function CrossingNetwork({ visible, selectedId, onSelect, language, legacy }: { visible: boolean; selectedId: string; onSelect: (id: string) => void; language: Language; legacy: boolean }) {
  const { gl, size } = useThree();
  const lineData = useMemo(() => crossings.filter((crossing) => crossing.properties.type === "bridge").map((crossing) => {
    const height = crossingHeight(crossing.id, crossing.properties.type);
    const points = projectPolyline(crossing.geometry.coordinates, height);
    const midpoint = points[Math.floor(points.length / 2)] ?? points[0];
    return { crossing, height, points, midpoint, positions: lineSegments(points), ribbon: [{ points, widthM: crossing.properties.mode === "pedestrian" ? 8 : 18 }] as RibbonPath[] };
  }), []);
  if (!visible) return null;
  return <group>
    {lineData.map(({ crossing, midpoint, positions, ribbon }) => {
      const selected = crossing.id === selectedId;
      const important = selected || size.width >= 760;
      return <group key={crossing.id}>
        {legacy
          ? <WideColorLine positions={positions} color={crossing.properties.color} width={selected ? 6 : crossing.properties.type === "tunnel" ? 2.2 : 3.4} opacity={selected ? 1 : crossing.properties.type === "tunnel" ? 0.66 : 0.82} />
          : <RibbonMesh paths={ribbon} color={crossing.properties.color} opacity={selected ? 1 : 0.76} renderOrder={3} />}
        <mesh position={midpoint} onPointerOver={(event) => { event.stopPropagation(); gl.domElement.classList.add("is-targeting"); }} onPointerOut={() => { gl.domElement.classList.remove("is-targeting"); }} onClick={(event) => { event.stopPropagation(); if (event.delta <= 6) onSelect(crossing.id); }}>
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

function targetForFocus(focus: SceneFocus, items: Landmark[]): Point3 {
  if (focus.kind === "landmark") {
    const landmark = items.find((item) => item.id === focus.landmarkId);
    if (landmark) return anchorPosition(landmark.anchorId, 18);
  }
  if (focus.kind === "transport" && focus.stopId) {
    const stop = stopsForTransportLine(focus.lineId).find((item) => item.id === focus.stopId);
    if (stop) return projectPoint(stop.geometry.coordinates, 14);
  }
  if (focus.kind === "regional" && focus.crossingId) {
    const crossing = crossings.find((item) => item.id === focus.crossingId);
    if (crossing) return projectPoint(crossing.geometry.coordinates[Math.floor(crossing.geometry.coordinates.length / 2)], 18);
  }
  if (focus.kind === "regional") return regionalBounds.center;
  return mapBounds.center;
}

function CameraRig({ command, phase, items, controls, quality, reducedMotion, viewportInsets, onPhaseChange }: {
  command: CameraCommand;
  phase: CameraPhase;
  items: Landmark[];
  controls: React.RefObject<OrbitControlsImpl | null>;
  quality: SceneQuality;
  reducedMotion: boolean;
  viewportInsets: ViewportInsets;
  onPhaseChange: (phase: CameraPhase) => void;
}) {
  const { camera, invalidate, size } = useThree();
  const framing = useRef({ quality, reducedMotion, size, viewportInsets });
  const flight = useRef<{
    active: boolean;
    startedAt: number;
    duration: number;
    startPosition: THREE.Vector3;
    startTarget: THREE.Vector3;
    endPosition: THREE.Vector3;
    endTarget: THREE.Vector3;
    arc: number;
  } | undefined>(undefined);

  useEffect(() => {
    framing.current = { quality, reducedMotion, size, viewportInsets };
  }, [quality, reducedMotion, size, viewportInsets]);

  useEffect(() => {
    const { quality: framingQuality, reducedMotion: framingReducedMotion, size: framingSize, viewportInsets: framingInsets } = framing.current;
    const span = Math.max(mapBounds.width, mapBounds.depth);
    const regionalSpan = Math.max(regionalBounds.width, regionalBounds.depth);
    const view = viewModeFromFocus(command.focus);
    const target = targetForFocus(command.focus, items);
    const cameraGoal = new THREE.Vector3();
    const targetGoal = new THREE.Vector3(...target);
    const availableWidth = Math.max(280, framingSize.width - framingInsets.left - framingInsets.right);
    const availableHeight = Math.max(240, framingSize.height - framingInsets.top - framingInsets.bottom);
    const safeScale = Math.max(framingSize.width / availableWidth, framingSize.height / availableHeight);
    if (command.focus.kind === "landmark" && command.focus.landmarkId === 2) {
      const minimum = new THREE.Vector3(...nanjingEyeBounds.min);
      const maximum = new THREE.Vector3(...nanjingEyeBounds.max);
      const center = minimum.clone().add(maximum).multiplyScalar(0.5);
      const dimensions = maximum.clone().sub(minimum);
      const radius = minimum.distanceTo(maximum) * 0.5;
      const verticalFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.6, availableWidth / availableHeight));
      const footprintDiagonal = Math.hypot(dimensions.x, dimensions.z);
      const margin = framingSize.width < 720 ? 1.2 : 1.08;
      const fitDistance = Math.max(footprintDiagonal * 0.5 / Math.tan(horizontalFov / 2), dimensions.y * 0.8 / Math.tan(verticalFov / 2)) * margin * Math.min(1.75, safeScale);
      const eyeCrossing = crossings.find((crossing) => crossing.id === "nanjing-eye-crossing");
      const endpoints = eyeCrossing ? projectPolyline([eyeCrossing.geometry.coordinates[0], eyeCrossing.geometry.coordinates.at(-1)!]) : [[0, 0, 0], [1, 0, 1]] as Point3[];
      const axis = new THREE.Vector3(endpoints[1][0] - endpoints[0][0], 0, endpoints[1][2] - endpoints[0][2]).normalize();
      const side = new THREE.Vector3(-axis.z, 0, axis.x);
      const viewDirection = axis.multiplyScalar(-0.72).add(side.multiplyScalar(0.69)).normalize();
      const landmarkDistance = fitDistance * 0.98;
      cameraGoal.copy(center).addScaledVector(viewDirection, landmarkDistance).add(new THREE.Vector3(0, landmarkDistance * 0.2, 0));
      targetGoal.copy(center).add(new THREE.Vector3(0, -radius * 0.08, 0));
    } else {
      if (command.focus.kind === "regional" && command.focus.crossingId) {
        const crossingId = command.focus.crossingId;
        const crossing = crossings.find((item) => item.id === crossingId);
        const points = crossing ? projectPolyline(crossing.geometry.coordinates) : [];
        const bounds = points.length > 1 ? new THREE.Box3().setFromPoints(points.map((point) => new THREE.Vector3(...point))) : undefined;
        const dimensions = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(420, 0, 420);
        const fit = Math.max(360, Math.hypot(dimensions.x, dimensions.z) * 0.72) * Math.min(1.5, safeScale);
        cameraGoal.set(target[0] + fit * 0.36, Math.max(260, fit * 0.72), target[2] + fit * 0.52);
      } else if (view === "regional") cameraGoal.set(regionalBounds.center[0] + regionalSpan * 0.06, regionalSpan * (framingQuality === "efficiency" ? 2.6 : 1.85) * Math.min(1.35, safeScale), regionalBounds.center[2] + regionalSpan * 0.2);
      else if (view === "overview") cameraGoal.set(mapBounds.center[0] + span * 0.06, span * (framingQuality === "efficiency" ? 2.65 : 1.75) * Math.min(1.35, safeScale), mapBounds.center[2] + span * 0.22);
      else if (view === "route" && Math.hypot(target[0] - mapBounds.center[0], target[2] - mapBounds.center[2]) > 20) cameraGoal.set(target[0] + 240, Math.max(220, target[1] + 210) * Math.min(1.35, safeScale), target[2] + 290);
      else if (view === "route") cameraGoal.set(mapBounds.center[0] + span * 0.12, span * (framingQuality === "efficiency" ? 1.42 : 1.12) * Math.min(1.35, safeScale), mapBounds.center[2] + span * 0.3);
      else cameraGoal.set(target[0] + 180, Math.max(165, target[1] + 160) * Math.min(1.35, safeScale), target[2] + 220);
    }

    const viewDirection = targetGoal.clone().sub(cameraGoal).normalize();
    const right = new THREE.Vector3().crossVectors(viewDirection, camera.up).normalize();
    const focusDistance = cameraGoal.distanceTo(targetGoal);
    const horizontalBias = (framingInsets.right - framingInsets.left) / Math.max(1, framingSize.width) * focusDistance * 0.18;
    const verticalBias = (framingInsets.bottom - framingInsets.top) / Math.max(1, framingSize.height) * focusDistance * 0.12;
    targetGoal.addScaledVector(right, horizontalBias).y -= verticalBias;

    const startTarget = controls.current?.target.clone() ?? new THREE.Vector3(...regionalBounds.center);
    const distance = camera.position.distanceTo(cameraGoal);
    const duration = THREE.MathUtils.clamp(450 + Math.sqrt(distance) * 8, 450, 1_000);
    if (framingReducedMotion) {
      camera.position.set(cameraGoal.x, cameraGoal.y, cameraGoal.z);
      controls.current?.target.copy(targetGoal);
      controls.current?.update();
      onPhaseChange("idle");
      invalidate();
      return;
    }
    flight.current = {
      active: true,
      startedAt: performance.now(),
      duration,
      startPosition: camera.position.clone(),
      startTarget,
      endPosition: cameraGoal,
      endTarget: targetGoal,
      arc: Math.min(560, distance * 0.08),
    };
    onPhaseChange("guided");
    invalidate();
  }, [camera, command, controls, invalidate, items, onPhaseChange]);

  useEffect(() => {
    if (phase === "manual" && flight.current) flight.current.active = false;
  }, [phase]);

  useFrame(() => {
    const current = flight.current;
    if (!current?.active) return;
    const raw = THREE.MathUtils.clamp((performance.now() - current.startedAt) / current.duration, 0, 1);
    const eased = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
    camera.position.set(
      THREE.MathUtils.lerp(current.startPosition.x, current.endPosition.x, eased),
      THREE.MathUtils.lerp(current.startPosition.y, current.endPosition.y, eased) + Math.sin(Math.PI * eased) * current.arc,
      THREE.MathUtils.lerp(current.startPosition.z, current.endPosition.z, eased),
    );
    if (controls.current) {
      controls.current.target.lerpVectors(current.startTarget, current.endTarget, eased);
      controls.current.update();
    }
    if (raw >= 1) {
      current.active = false;
      onPhaseChange("idle");
    } else invalidate();
  });
  return null;
}

function MarkerLabels({ items, selectedId, onSelect, language, view, objectiveId, discoveredIds, expeditionIds, selectionRef }: {
  items: Landmark[];
  selectedId: number;
  onSelect: (id: number) => void;
  language: Language;
  view: ViewMode;
  objectiveId?: number;
  discoveredIds: readonly number[];
  expeditionIds: readonly number[];
  selectionRef?: React.RefObject<THREE.Group | null>;
}) {
  const { camera, gl, size, invalidate } = useThree();
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
    const overviewLimit = camera.position.y > 7_500 ? (size.width < 720 ? 3 : 7) : size.width < 720 ? 5 : items.length;
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
      <group ref={selected ? selectionRef : undefined} key={item.id} position={anchorPosition(item.anchorId, 26)} onPointerOver={(event) => { event.stopPropagation(); gl.domElement.classList.add("is-targeting"); }} onPointerOut={() => { gl.domElement.classList.remove("is-targeting"); }} onClick={(event) => { event.stopPropagation(); if (event.delta <= 6) onSelect(item.id); }}>
        <mesh><sphereGeometry args={[Math.max(27, radius + 9), 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        {!focused && <mesh scale={selected ? 1.22 : 1}>
          <sphereGeometry args={[radius, 16, 12]} />
          <meshStandardMaterial color={objective ? "#f5d36f" : found ? "#8fd5aa" : item.accent} emissive={objective ? "#f5d36f" : item.accent} emissiveIntensity={objective ? 0.8 : selected ? 0.5 : 0.14} />
        </mesh>}
        <mesh position={[0, -15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[focused ? 7 : selected ? 23 : 17, focused ? 10 : selected ? 29 : 22, 24]} />
          <meshBasicMaterial color={item.accent} transparent opacity={0.66} side={THREE.DoubleSide} />
        </mesh>
        {visibleIds.has(item.id) && <Html position={[0, focused && item.id === 2 ? 132 : 42, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <div className={`map-label ${selected ? "is-selected" : ""} ${objective ? "is-objective" : ""} ${found ? "is-discovered" : ""}`} style={{ "--label-accent": objective ? "#d7a923" : found ? "#4e9b6a" : item.accent } as React.CSSProperties}>
            <span>{String(item.id).padStart(2, "0")}</span><strong>{localize(landmarkCopy[item.id].name, language)}</strong>
          </div>
        </Html>}
      </group>
    );
  })}</>;
}

function PlayerMarkerLayer({ players, localPlayerId, selectedPlayerId, onSelectPlayer }: {
  players: readonly import("./game/types").PlayerState[];
  localPlayerId?: string;
  selectedPlayerId?: string;
  onSelectPlayer?: (playerId: string) => void;
}) {
  const { gl, invalidate } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const markerGeometry = useMemo(() => new THREE.CylinderGeometry(13, 10, 24, 10), []);
  const markerMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.12, vertexColors: true }), []);
  const markerObject = useMemo(() => new THREE.Object3D(), []);
  const visiblePlayers = useMemo(() => players.slice(0, 32), [players]);
  const localPlayer = visiblePlayers.find((player) => player.playerId === localPlayerId);
  const selectedPlayer = visiblePlayers.find((player) => player.playerId === selectedPlayerId);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.count = visiblePlayers.length;
    visiblePlayers.forEach((player, index) => {
      markerObject.position.set(player.position[0], 28, player.position[1]);
      markerObject.rotation.set(0, player.heading, 0);
      markerObject.updateMatrix();
      mesh.setMatrixAt(index, markerObject.matrix);
      mesh.setColorAt(index, new THREE.Color(player.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [invalidate, markerObject, visiblePlayers]);

  useEffect(() => () => {
    markerGeometry.dispose();
    markerMaterial.dispose();
  }, [markerGeometry, markerMaterial]);

  if (visiblePlayers.length === 0) return null;
  return <group name="shared-world-player-markers">
    <instancedMesh
      ref={meshRef}
      args={[markerGeometry, markerMaterial, 32]}
      frustumCulled={false}
      onPointerOver={(event) => { event.stopPropagation(); gl.domElement.classList.add("is-targeting"); }}
      onPointerOut={() => gl.domElement.classList.remove("is-targeting")}
      onClick={(event) => {
        event.stopPropagation();
        if (event.delta > 6 || event.instanceId === undefined) return;
        const player = visiblePlayers[event.instanceId];
        if (player) onSelectPlayer?.(player.playerId);
      }}
    />
    {localPlayer && <>
      <mesh position={[localPlayer.position[0], 15, localPlayer.position[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[23, 29, 28]} />
        <meshBasicMaterial color="#ffe07b" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Html position={[localPlayer.position[0], 72, localPlayer.position[1]]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
        <div className="player-marker-label is-self"><span>YOU</span><strong>{localPlayer.displayName}</strong></div>
      </Html>
    </>}
    {selectedPlayer && selectedPlayer.playerId !== localPlayerId && <Html position={[selectedPlayer.position[0], 72, selectedPlayer.position[1]]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
      <div className="player-marker-label"><span>EXPLORER</span><strong>{selectedPlayer.displayName}</strong></div>
    </Html>}
  </group>;
}

function SceneControls({ controls, onInteractionStart, onPhaseChange }: { controls: React.RefObject<OrbitControlsImpl | null>; onInteractionStart: () => void; onPhaseChange: (phase: CameraPhase) => void }) {
  const { gl, invalidate, performance } = useThree();
  return <OrbitControls
    ref={controls}
    makeDefault
    enableDamping
    dampingFactor={0.075}
    zoomToCursor
    minDistance={150}
    maxDistance={52_000}
    maxPolarAngle={Math.PI / 2.02}
    target={regionalBounds.center}
    onStart={() => {
      gl.domElement.classList.add("is-interacting");
      performance.regress();
      onInteractionStart();
      onPhaseChange("manual");
    }}
    onChange={() => invalidate()}
    onEnd={() => {
      gl.domElement.classList.remove("is-interacting");
      invalidate();
    }}
  />;
}

function ScaleReporter({ onScaleChange }: { onScaleChange: (meters: number) => void }) {
  const { camera, size } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const left = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const lastValue = useRef(0);
  useFrame(() => {
    if (size.width <= 0) return;
    const halfScaleNdc = 70 / size.width;
    raycaster.setFromCamera(new THREE.Vector2(-halfScaleNdc, 0), camera);
    if (!raycaster.ray.intersectPlane(ground, left)) return;
    raycaster.setFromCamera(new THREE.Vector2(halfScaleNdc, 0), camera);
    if (!raycaster.ray.intersectPlane(ground, right)) return;
    const meters = left.distanceTo(right);
    if (!Number.isFinite(meters) || meters <= 0) return;
    if (Math.abs(lastValue.current - meters) / Math.max(1, lastValue.current) > 0.01) {
      lastValue.current = meters;
      onScaleChange(meters);
    }
  });
  return null;
}

function DetailedNanjingEyeAsset({ nightFactor, tier, shadows, legacy, onStateChange }: {
  nightFactor: number;
  tier: SceneQuality;
  shadows: boolean;
  legacy: boolean;
  onStateChange: (state: "idle" | "loading" | "ready") => void;
}) {
  const [lod2Ready, setLod2Ready] = useState(false);
  useEffect(() => onStateChange("loading"), [onStateChange]);
  const reportReady = useCallback(() => {
    setLod2Ready(true);
    onStateChange("ready");
  }, [onStateChange]);
  return <>
    {!lod2Ready && <Asset url={modelUrls.nanjingEyeLod1} role="nanjing-eye" tier={tier} shadows={shadows} legacy={legacy} nightFactor={nightFactor} nightLighting />}
    <OptionalAssetBoundary name="nanjing-eye-lod2" onError={() => onStateChange("ready")}>
      <Suspense fallback={null}>
        <Asset url={modelUrls.nanjingEyeLod2} role="nanjing-eye" tier={tier} shadows={shadows} legacy={legacy} onReady={reportReady} nightFactor={nightFactor} nightLighting compileBeforeReveal />
      </Suspense>
    </OptionalAssetBoundary>
  </>;
}

function NanjingEyeAsset({ highDetail, nightFactor, tier, shadows, legacy, onStateChange }: {
  highDetail: boolean;
  nightFactor: number;
  tier: SceneQuality;
  shadows: boolean;
  legacy: boolean;
  onStateChange: (state: "idle" | "loading" | "ready") => void;
}) {
  useEffect(() => onStateChange(highDetail ? "loading" : "idle"), [highDetail, onStateChange]);
  if (!highDetail) return <Asset url={modelUrls.nanjingEyeLod1} role="nanjing-eye" tier={tier} shadows={shadows} legacy={legacy} nightFactor={nightFactor} nightLighting />;
  return <DetailedNanjingEyeAsset key={`${tier}:${shadows}:${legacy}`} nightFactor={nightFactor} tier={tier} shadows={shadows} legacy={legacy} onStateChange={onStateChange} />;
}

function DeferredAssets({ layers, quality, onCoreReady, nightFactor, selectedId, view, profile, legacy, onDetailedAssetStateChange }: {
  layers: LayerVisibility;
  quality: SceneQuality;
  onCoreReady: () => void;
  nightFactor: number;
  selectedId: number;
  view: ViewMode;
  profile: RenderProfile;
  legacy: boolean;
  onDetailedAssetStateChange: (state: "idle" | "loading" | "ready") => void;
}) {
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

  const focusShadows = profile.shadowMapSize > 0 && view === "landmark";
  return <Suspense fallback={null}>
    <Asset url={modelUrls.terrain} role="terrain" tier={quality} shadows={focusShadows} legacy={legacy} onReady={onCoreReady} />
    {layers.buildings && <>
      <OptionalAssetBoundary name="buildings-south"><Asset url={modelUrls.south} role="buildings" tier={quality} shadows={focusShadows} legacy={legacy} nightFactor={nightFactor} nightLighting /></OptionalAssetBoundary>
      <OptionalAssetBoundary name="buildings-center"><Asset url={modelUrls.center} role="buildings" tier={quality} shadows={focusShadows} legacy={legacy} nightFactor={nightFactor} nightLighting /></OptionalAssetBoundary>
      <OptionalAssetBoundary name="buildings-north"><Asset url={modelUrls.north} role="buildings" tier={quality} shadows={focusShadows} legacy={legacy} nightFactor={nightFactor} nightLighting /></OptionalAssetBoundary>
    </>}
    {layers.landscape && quality !== "efficiency" && idleAssets && <OptionalAssetBoundary name="vegetation"><Asset url={modelUrls.vegetation} role="vegetation" tier={quality} legacy={legacy} /></OptionalAssetBoundary>}
    {layers.landmarks && <>
      <OptionalAssetBoundary name="landmarks"><Asset url={modelUrls.landmarks} role="landmarks" tier={quality} shadows={focusShadows} legacy={legacy} nightFactor={nightFactor} nightLighting /></OptionalAssetBoundary>
      <OptionalAssetBoundary name="nanjing-eye"><NanjingEyeAsset highDetail={selectedId === 2 && view === "landmark" && quality !== "efficiency"} nightFactor={nightFactor} tier={quality} shadows={focusShadows} legacy={legacy} onStateChange={onDetailedAssetStateChange} /></OptionalAssetBoundary>
    </>}
    {layers.crossings && <OptionalAssetBoundary name="context-bridges"><Asset url={modelUrls.contextBridges} role="bridges" tier={quality} shadows={focusShadows} legacy={legacy} /></OptionalAssetBoundary>}
  </Suspense>;
}

function CelestialDisc({ kind, state, position }: { kind: "sun" | "moon"; state: CelestialState; position: Point3 }) {
  const mesh = useRef<THREE.Mesh>(null);
  const moonMaterial = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      phaseAngle: { value: THREE.MathUtils.degToRad(state.moon.phaseAngleDeg) },
      phaseSign: { value: state.moon.phaseCycleDeg < 180 ? -1 : 1 },
      opacity: { value: 0.5 + state.moon.illumination * 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float phaseAngle;
      uniform float phaseSign;
      uniform float opacity;
      void main() {
        vec2 point = vUv * 2.0 - 1.0;
        float radius2 = dot(point, point);
        if (radius2 > 1.0) discard;
        float surface = sqrt(max(0.0, 1.0 - radius2));
        vec3 normal = normalize(vec3(point.x, point.y, surface));
        vec3 lightDirection = normalize(vec3(phaseSign * sin(phaseAngle), 0.12, cos(phaseAngle)));
        float lit = max(dot(normal, lightDirection), 0.0);
        float rim = smoothstep(1.0, 0.82, sqrt(radius2));
        vec3 darkSide = vec3(0.08, 0.11, 0.16);
        vec3 litSide = vec3(0.92, 0.93, 0.82) * (0.35 + lit * 0.85);
        gl_FragColor = vec4(mix(darkSide, litSide, smoothstep(0.01, 0.15, lit)), rim * opacity);
      }
    `,
  }), [state.moon.illumination, state.moon.phaseAngleDeg, state.moon.phaseCycleDeg]);

  useEffect(() => () => moonMaterial.dispose(), [moonMaterial]);
  useFrame(({ camera }) => {
    if (mesh.current) mesh.current.quaternion.copy(camera.quaternion);
  });

  if (kind === "sun") {
    return <group position={position} visible={state.sun.visible}>
      <sprite scale={[1_700, 1_700, 1]} renderOrder={-1}>
        <spriteMaterial color="#ffd58a" transparent opacity={0.2 + state.daylight * 0.32} depthWrite={false} depthTest={false} fog={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite scale={[650, 650, 1]} renderOrder={-1}>
        <spriteMaterial color="#fff3c4" transparent opacity={0.96} depthWrite={false} depthTest={false} fog={false} />
      </sprite>
    </group>;
  }

  return <mesh ref={mesh} position={position} visible={state.moon.visible} renderOrder={-1}>
    <planeGeometry args={[720, 720]} />
    <primitive object={moonMaterial} attach="material" />
  </mesh>;
}

function NightStars({ opacity, quality }: { opacity: number; quality: SceneQuality }) {
  const count = quality === "high" ? 620 : quality === "balanced" ? 380 : 180;
  const positions = useMemo(() => {
    let seed = 24681357;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const azimuth = random() * Math.PI * 2;
      const altitude = THREE.MathUtils.degToRad(8 + random() * 76);
      const radius = 28_000 + random() * 5_000;
      values[index * 3] = regionalBounds.center[0] + Math.sin(azimuth) * Math.cos(altitude) * radius;
      values[index * 3 + 1] = Math.sin(altitude) * radius;
      values[index * 3 + 2] = regionalBounds.center[2] - Math.cos(azimuth) * Math.cos(altitude) * radius;
    }
    return values;
  }, [count]);
  if (opacity <= 0.01) return null;
  return <points renderOrder={-2}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color="#dbe9ff" size={quality === "high" ? 30 : 42} sizeAttenuation transparent opacity={opacity * 0.82} depthWrite={false} fog={false} />
  </points>;
}

function FocusSunLight({ state, profile, target, enabled }: { state: CelestialState; profile: RenderProfile; target: Point3; enabled: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const targetObject = useMemo(() => new THREE.Object3D(), []);
  const { gl, scene } = useThree();
  const rendererRef = useRef(gl);
  useEffect(() => {
    scene.add(targetObject);
    return () => { scene.remove(targetObject); };
  }, [scene, targetObject]);
  useEffect(() => {
    if (!light.current) return;
    const direction = new THREE.Vector3(...celestialDirection(state.sun.azimuthDeg, Math.max(8, state.sun.altitudeDeg), 6_000));
    targetObject.position.set(...target);
    targetObject.updateMatrixWorld();
    light.current.position.copy(targetObject.position).add(direction);
    light.current.target = targetObject;
    const range = enabled ? 520 : 1;
    const camera = light.current.shadow.camera;
    camera.left = -range;
    camera.right = range;
    camera.top = range;
    camera.bottom = -range;
    camera.near = 100;
    camera.far = 13_000;
    camera.updateProjectionMatrix();
    light.current.shadow.mapSize.set(profile.shadowMapSize || 1, profile.shadowMapSize || 1);
    light.current.shadow.bias = -0.00012;
    light.current.shadow.normalBias = 0.35;
    light.current.shadow.radius = profile.tier === "high" ? 2 : 1;
    rendererRef.current.shadowMap.enabled = enabled;
    rendererRef.current.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current.shadowMap.autoUpdate = false;
    rendererRef.current.shadowMap.needsUpdate = enabled;
  }, [enabled, profile.shadowMapSize, profile.tier, state.sun.altitudeDeg, state.sun.azimuthDeg, target, targetObject]);
  return <directionalLight ref={light} castShadow={enabled} intensity={state.daylight * 2.2 + state.horizonGlow * 0.38} color={blendColor("#f19a69", "#fff1cf", state.daylight)} />;
}

function CelestialEnvironment({ state, quality, profile, shadowTarget, shadowEnabled, legacy }: {
  state: CelestialState;
  quality: SceneQuality;
  profile: RenderProfile;
  shadowTarget: Point3;
  shadowEnabled: boolean;
  legacy: boolean;
}) {
  const sunPosition = useMemo(() => celestialPosition(state, "sun", 24_000), [state]);
  const moonPosition = useMemo(() => celestialPosition(state, "moon", 23_000), [state]);
  const twilightSky = blendColor("#071321", "#b86e62", state.twilight);
  const skyColor = blendColor(twilightSky, "#72b7c0", state.daylight);
  const finalSky = blendColor(skyColor, "#d98e68", state.horizonGlow * 0.42);
  const fogColor = blendColor("#091824", finalSky, 0.8);
  const moonStrength = state.night * (0.12 + state.moon.illumination * 0.58) * (state.moon.visible ? 1 : 0.35);

  return <>
    <color attach="background" args={[finalSky]} />
    <fog attach="fog" args={[fogColor, 18_000, 48_000]} />
    {!legacy && <><ProceduralSky state={state} /><ProceduralEnvironment state={state} profile={profile} /></>}
    <hemisphereLight intensity={legacy ? 0.16 + state.twilight * 0.52 + state.daylight * 0.92 : 0.12 + state.twilight * 0.38 + state.daylight * 0.58} color={blendColor("#7183a5", "#f5f6e9", state.daylight)} groundColor={blendColor("#07151f", "#315f63", state.daylight)} />
    <FocusSunLight state={state} profile={profile} target={shadowTarget} enabled={shadowEnabled} />
    <directionalLight position={moonPosition} intensity={moonStrength} color="#9ebae8" />
    <CelestialDisc kind="sun" state={state} position={sunPosition} />
    <CelestialDisc kind="moon" state={state} position={moonPosition} />
    <NightStars opacity={state.night} quality={quality} />
  </>;
}

function SceneContent({ items, selectedId, onSelect, onReady, onScaleChange, celestialTimestamp, routeId, focus, cameraCommand, cameraPhase, reducedMotion, viewportInsets, onCameraPhaseChange, onSceneInteractionStart, onDetailedAssetStateChange, layers, roadSublayers, selectedRoadId, onSelectRoad, language, quality, renderMode, renderProfile, renderContextState, renderContextLosses, onPerformanceSample, onRenderTelemetry, onRenderContextStateChange, objectiveId, expeditionLandmarkIds, discoveredLandmarkIds, selectedTransportLineId, selectedTransportStopId, transitSnapshot, onSelectTransportStop, selectedCrossingId, onSelectCrossing, gamePlayers = [], localPlayerId, selectedPlayerId, onSelectPlayer }: JiangxinzhouSceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const selectionRef = useRef<THREE.Group>(null);
  const reportedReady = useRef(false);
  const celestialTick = Math.floor(celestialTimestamp / 60_000) * 60_000;
  const celestialState = useMemo(() => calculateCelestialState(celestialTick), [celestialTick]);
  const reportReady = useCallback(() => {
    if (reportedReady.current) return;
    reportedReady.current = true;
    onReady();
  }, [onReady]);
  const view = viewModeFromFocus(focus);
  const landmarkFocus = view === "landmark";
  const legacy = renderMode === "legacy";
  const shadowTarget = useMemo(() => targetForFocus(focus, items), [focus, items]);
  const shadowEnabled = !legacy && renderProfile.shadowMapSize > 0 && landmarkFocus;
  const rendererReady = renderContextState === "ready";
  const ambientActive = rendererReady && !reducedMotion && !legacy && renderProfile.ambientFps > 0 && (layers.water || layers.landscape || (view === "route" && !layers.transport));
  const trafficActive = rendererReady && !reducedMotion && layers.transport && renderProfile.trafficFps > 0;
  const closeFocus = landmarkFocus || (focus.kind === "transport" && Boolean(focus.stopId));
  const compileRevision = `${renderProfile.tier}:${view}:${selectedId}:${layers.buildings}:${layers.landmarks}:${layers.landscape}:${Math.floor(celestialTick / 600_000)}`;

  return <>
    <CelestialEnvironment state={celestialState} quality={quality} profile={renderProfile} shadowTarget={shadowTarget} shadowEnabled={shadowEnabled} legacy={legacy} />
    {legacy ? <LegacyWater visible={layers.water} daylight={celestialState.daylight} /> : <WaterSurface visible={layers.water} state={celestialState} profile={renderProfile} />}
    <RegionalContext waterVisible={layers.water} surroundingsVisible={layers.surroundings} language={language} daylight={celestialState.daylight} />
    <PorpoiseLayer visible={layers.water} quality={quality} reducedMotion={reducedMotion} legacy={legacy} />
    <PetLayer visible={layers.landscape} quality={quality} reducedMotion={reducedMotion} legacy={legacy} />
    <CoordinateGrid visible={layers.coordinates} view={view} />
    <DeferredAssets layers={layers} quality={quality} profile={renderProfile} legacy={legacy} onCoreReady={reportReady} nightFactor={celestialState.night} selectedId={selectedId} view={view} onDetailedAssetStateChange={onDetailedAssetStateChange} />
    <LandscapeZones visible={layers.landscape} />
    <ContextRoadNetwork visible={layers.surroundings} legacy={legacy} />
    {legacy ? <LegacyRoadNetwork visible={layers.roads} /> : <RoadLayer visible={layers.roads} sublayers={roadSublayers} selectedRoadId={selectedRoadId} language={language} quality={quality} onSelectRoad={onSelectRoad} />}
    <CrossingNetwork visible={layers.crossings && !landmarkFocus} selectedId={selectedCrossingId} onSelect={onSelectCrossing} language={language} legacy={legacy} />
    <RouteNetwork routeId={routeId} visible={view === "route" && !layers.transport} legacy={legacy} animate={ambientActive} />
    <TransportNetwork visible={layers.transport} lineId={selectedTransportLineId} stopId={selectedTransportStopId} onSelectStop={onSelectTransportStop} language={language} profile={renderProfile} legacy={legacy} transitSnapshot={transitSnapshot} />
    {gamePlayers.length > 0 && <PlayerMarkerLayer players={gamePlayers} localPlayerId={localPlayerId} selectedPlayerId={selectedPlayerId} onSelectPlayer={onSelectPlayer} />}
    {layers.landmarks && <ObjectiveBeacon objectiveId={objectiveId} items={items} />}
    {layers.landmarks && <MarkerLabels items={items} selectedId={selectedId} onSelect={onSelect} language={language} view={view} objectiveId={objectiveId} discoveredIds={discoveredLandmarkIds} expeditionIds={expeditionLandmarkIds} selectionRef={selectionRef} />}
    <CameraRig command={cameraCommand} phase={cameraPhase} items={items} controls={controls} quality={quality} reducedMotion={reducedMotion} viewportInsets={viewportInsets} onPhaseChange={onCameraPhaseChange} />
    <SceneControls controls={controls} onInteractionStart={onSceneInteractionStart} onPhaseChange={onCameraPhaseChange} />
    <ScaleReporter onScaleChange={onScaleChange} />
    <FrameBudgetScheduler profile={renderProfile} ambientActive={ambientActive} trafficActive={trafficActive} />
    <RenderTelemetryProbe profile={renderProfile} contextState={renderContextState} contextLosses={renderContextLosses} monitorActive={cameraPhase !== "idle"} onPerformanceSample={onPerformanceSample} onTelemetry={onRenderTelemetry} />
    <RendererLifecycle onContextStateChange={onRenderContextStateChange} />
    {!legacy && <ShaderCompiler revision={compileRevision} />}
    {!legacy && rendererReady && <RenderEffects profile={renderProfile} nightFactor={celestialState.night} closeFocus={closeFocus} selection={selectionRef} />}
  </>;
}

export default function JiangxinzhouScene(props: JiangxinzhouSceneProps) {
  return (
    <Canvas
      dpr={props.renderProfile.dpr}
      frameloop="demand"
      camera={{ fov: 38, position: [6_000, 17_000, 7_000], near: 20, far: 60_000 }}
      gl={{ antialias: props.renderMode === "legacy" && props.quality !== "efficiency", powerPreference: "high-performance", alpha: false, stencil: false }}
      performance={{ min: 0.62, max: 1, debounce: 500 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = props.renderMode === "legacy" ? 1.03 : 0.96;
        gl.shadowMap.enabled = props.renderProfile.shadowMapSize > 0 && props.renderMode !== "legacy";
        gl.shadowMap.autoUpdate = false;
        gl.domElement.classList.add("is-map-canvas");
        gl.domElement.dataset.renderer = props.renderMode;
        gl.domElement.dataset.renderTier = props.renderProfile.tier;
      }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
