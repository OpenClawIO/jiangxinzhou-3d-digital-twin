"use client";

import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LineMaterial, LineSegments2, LineSegmentsGeometry, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { landmarks as defaultLandmarks, routes, type Landmark } from "./landmarks";
import {
  categoryLabels,
  experienceCopy,
  landmarkCopy,
  languageLabels,
  localize,
  routeCopy,
  type Language,
} from "./locales";
import {
  anchorPosition,
  evidenceSources,
  findAnchor,
  landscapeShapes,
  mapBounds,
  mapManifest,
  mapRoads,
  projectPolyline,
  roadColor,
  roadsByName,
  type Point3,
  type RoadClass,
} from "./mapGeometry";

type ViewMode = "overview" | "route" | "landmark";
type LayerKey = "roads" | "buildings" | "landscape" | "landmarks";
type LayerVisibility = Record<LayerKey, boolean>;

const modelUrls = {
  terrain: "/models/jiangxinzhou-v2/terrain.glb",
  south: "/models/jiangxinzhou-v2/buildings-south.glb",
  center: "/models/jiangxinzhou-v2/buildings-center.glb",
  north: "/models/jiangxinzhou-v2/buildings-north.glb",
  vegetation: "/models/jiangxinzhou-v2/vegetation.glb",
  landmarks: "/models/jiangxinzhou-v2/landmarks.glb",
} as const;

Object.values(modelUrls).forEach((url) => useGLTF.preload(url));

function Asset({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={scene} dispose={null} />;
}

function Water() {
  const span = Math.max(mapBounds.width, mapBounds.depth) * 1.8;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mapBounds.center[0], -3.4, mapBounds.center[2]]} receiveShadow>
      <planeGeometry args={[span, span]} />
      <meshStandardMaterial color="#4f9eaa" roughness={0.38} metalness={0.08} />
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
    const material = new LineMaterial({ color: new THREE.Color(roadColor(roadClass)).getHex(), linewidth: roadPixelWidth[roadClass], transparent: true, opacity });
    return new LineSegments2(geometry, material);
  }, [opacity, positions, roadClass]);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); }, [line]);
  useFrame(() => line.material.resolution.set(size.width, size.height));
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

function CameraRig({ target, view, controls, lowPower }: { target: Point3; view: ViewMode; controls: React.RefObject<OrbitControlsImpl | null>; lowPower: boolean }) {
  const { camera } = useThree();
  const cameraGoal = useRef(new THREE.Vector3());
  const targetGoal = useRef(new THREE.Vector3());

  useEffect(() => {
    const span = Math.max(mapBounds.width, mapBounds.depth);
    if (view === "overview") cameraGoal.current.set(mapBounds.center[0] + span * (lowPower ? 0 : 0.06), span * (lowPower ? 2.65 : 1.75), mapBounds.center[2] + span * (lowPower ? 0.08 : 0.22));
    else if (view === "route") cameraGoal.current.set(mapBounds.center[0] + span * 0.12, span * (lowPower ? 1.42 : 1.12), mapBounds.center[2] + span * 0.3);
    else cameraGoal.current.set(target[0] + 620, Math.max(430, target[1] + 520), target[2] + 660);
    targetGoal.current.set(...target);
  }, [lowPower, target, view]);

  useFrame(() => {
    camera.position.lerp(cameraGoal.current, 0.055);
    if (controls.current) {
      controls.current.target.lerp(targetGoal.current, 0.075);
      controls.current.update();
    }
  });
  return null;
}

function MarkerLabels({ items, selectedId, onSelect, language }: { items: Landmark[]; selectedId: number; onSelect: (id: number) => void; language: Language }) {
  const { camera, size } = useThree();
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set([selectedId]));
  const tick = useRef(0);

  useFrame(() => {
    tick.current += 1;
    if (tick.current % 12 !== 0) return;
    const candidates = items.map((item) => {
      const point = new THREE.Vector3(...anchorPosition(item.anchorId, 48));
      const projected = point.clone().project(camera);
      return { item, x: (projected.x * 0.5 + 0.5) * size.width, y: (-projected.y * 0.5 + 0.5) * size.height, visible: projected.z < 1 };
    }).filter((candidate) => candidate.visible).sort((a, b) => Number(b.item.id === selectedId) - Number(a.item.id === selectedId) || a.item.priority - b.item.priority);
    const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const next = new Set<number>();
    const overviewLimit = camera.position.y > 7_500 ? 7 : items.length;
    for (const candidate of candidates) {
      if (next.size >= overviewLimit && candidate.item.id !== selectedId) continue;
      const width = language === "en" ? 164 : 112;
      const box = { x1: candidate.x - width / 2, y1: candidate.y - 18, x2: candidate.x + width / 2, y2: candidate.y + 18 };
      const collides = boxes.some((current) => !(box.x2 < current.x1 || box.x1 > current.x2 || box.y2 < current.y1 || box.y1 > current.y2));
      if (!collides || candidate.item.id === selectedId) {
        next.add(candidate.item.id);
        boxes.push(box);
      }
    }
    const current = [...visibleIds].sort().join(",");
    const upcoming = [...next].sort().join(",");
    if (current !== upcoming) setVisibleIds(next);
  });

  return <>{items.map((item) => {
    const selected = item.id === selectedId;
    const position = anchorPosition(item.anchorId, 26);
    return (
      <group key={item.id} position={position} onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
        <mesh scale={selected ? 1.22 : 1}>
          <sphereGeometry args={[selected ? 22 : 15, 16, 12]} />
          <meshStandardMaterial color={item.accent} emissive={item.accent} emissiveIntensity={selected ? 0.5 : 0.14} />
        </mesh>
        <mesh position={[0, -15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[selected ? 27 : 19, selected ? 34 : 24, 24]} />
          <meshBasicMaterial color={item.accent} transparent opacity={0.66} side={THREE.DoubleSide} />
        </mesh>
        {visibleIds.has(item.id) && <Html position={[0, 42, 0]} center style={{ pointerEvents: "none" }}>
          <div className={`map-label ${selected ? "is-selected" : ""}`} style={{ "--label-accent": item.accent } as React.CSSProperties}>
            <span>{String(item.id).padStart(2, "0")}</span><strong>{localize(landmarkCopy[item.id].name, language)}</strong>
          </div>
        </Html>}
      </group>
    );
  })}</>;
}

function MapScene({ items, selectedId, onSelect, routeId, view, target, layers, language, lowPower }: {
  items: Landmark[]; selectedId: number; onSelect: (id: number) => void; routeId: string; view: ViewMode; target: Point3;
  layers: LayerVisibility; language: Language; lowPower: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  return (
    <Canvas dpr={lowPower ? 1 : [1, 1.5]} camera={{ fov: 38, position: [6_000, 11_000, 7_000], near: 20, far: 30_000 }} gl={{ antialias: !lowPower, powerPreference: "high-performance" }}>
      <color attach="background" args={["#73b8c1"]} />
      <fog attach="fog" args={["#73b8c1", 12_000, 27_000]} />
      <hemisphereLight intensity={1.65} color="#f2f6e9" groundColor="#39747b" />
      <directionalLight position={[-4_000, 8_000, 3_000]} intensity={2.4} color="#fff2d0" />
      <Water />
      <Suspense fallback={null}>
        <Asset url={modelUrls.terrain} />
        {layers.buildings && <><Asset url={modelUrls.south} /><Asset url={modelUrls.center} /><Asset url={modelUrls.north} /></>}
        {layers.landscape && !lowPower && <Asset url={modelUrls.vegetation} />}
        {layers.landmarks && <Asset url={modelUrls.landmarks} />}
      </Suspense>
      <LandscapeZones visible={layers.landscape} />
      <RoadNetwork visible={layers.roads} />
      <RouteNetwork routeId={routeId} visible={view === "route"} />
      {layers.landmarks && <MarkerLabels items={items} selectedId={selectedId} onSelect={onSelect} language={language} />}
      <CameraRig target={target} view={view} controls={controls} lowPower={lowPower} />
      <OrbitControls ref={controls} enableDamping dampingFactor={0.08} minDistance={150} maxDistance={22_000} maxPolarAngle={Math.PI / 2.02} target={mapBounds.center} />
    </Canvas>
  );
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (value: Language) => void }) {
  return <div className="language-toggle" aria-label={localize(experienceCopy.languageToggle, language)}>{(Object.keys(languageLabels) as Language[]).map((value) => (
    <button key={value} className={value === language ? "active" : ""} aria-pressed={value === language} onClick={() => onChange(value)}>{languageLabels[value]}</button>
  ))}</div>;
}

function LayerToggles({ layers, language, onToggle }: { layers: LayerVisibility; language: Language; onToggle: (key: LayerKey) => void }) {
  const labels: Record<LayerKey, typeof experienceCopy.roads> = { roads: experienceCopy.roads, buildings: experienceCopy.buildings, landscape: experienceCopy.landscape, landmarks: experienceCopy.landmarkLayer };
  return <div className="layer-toggles" aria-label={localize(experienceCopy.layers, language)}>{(Object.keys(labels) as LayerKey[]).map((key) => (
    <button key={key} className={layers[key] ? "active" : ""} aria-pressed={layers[key]} onClick={() => onToggle(key)}>{localize(labels[key], language)}</button>
  ))}</div>;
}

export default function JiangxinzhouExperience({ landmarks: items = defaultLandmarks, language, onLanguageChange }: { landmarks: Landmark[]; language: Language; onLanguageChange: (language: Language) => void }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? 1);
  const [view, setView] = useState<ViewMode>("overview");
  const [routeId, setRouteId] = useState<(typeof routes)[number]["id"]>(routes[0].id);
  const [layers, setLayers] = useState<LayerVisibility>({ roads: true, buildings: true, landscape: true, landmarks: true });
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [lowPower, setLowPower] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const limited = (navigator.hardwareConcurrency ?? 8) <= 4;
    const frame = window.requestAnimationFrame(() => setLowPower(mobile || limited));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedAnchor = selected ? findAnchor(selected.anchorId) : undefined;
  const target = view === "landmark" && selected ? anchorPosition(selected.anchorId, 18) : mapBounds.center;
  const chooseLandmark = (id: number) => { setSelectedId(id); setView("landmark"); };
  const reset = () => setView("overview");

  return (
    <section className="jiangxinzhou-experience" aria-label={localize(experienceCopy.ariaLabel, language)}>
      <div className="map-toolbar">
        <div className="toolbar-title">
          <span className="toolbar-kicker">WGS84 · {mapManifest.snapshot} · V{mapManifest.version}</span>
          <h2>{localize(experienceCopy.heading, language)}</h2>
        </div>
        <div className="toolbar-actions">
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <LayerToggles layers={layers} language={language} onToggle={(key) => setLayers((current) => ({ ...current, [key]: !current[key] }))} />
          <div className="view-tabs" role="tablist" aria-label={localize(experienceCopy.viewTabs, language)}>
            <button className={view === "overview" ? "active" : ""} onClick={reset}>{localize(experienceCopy.overview, language)}</button>
            <button className={view === "route" ? "active" : ""} onClick={() => setView("route")}>{localize(experienceCopy.route, language)}</button>
            <button className={view === "landmark" ? "active" : ""} onClick={() => setView("landmark")}>{localize(experienceCopy.landmark, language)}</button>
          </div>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-stage">
          <MapScene items={items} selectedId={selectedId} onSelect={chooseLandmark} routeId={routeId} view={view} target={target} layers={layers} language={language} lowPower={lowPower} />
          <div className="map-scale"><span>0</span><i /><span>1 km</span></div>
          <div className="north-marker" aria-label={localize(experienceCopy.north, language)}><span>N</span><b>↑</b></div>
          <div className="stage-note"><span className="stage-pulse" />{localize(experienceCopy.stageNote, language)}{lowPower ? ` · ${localize(experienceCopy.performanceMode, language)}` : ""}</div>
          <button className="reset-view" onClick={reset}>{localize(experienceCopy.resetView, language)}</button>
        </div>

        <aside className="map-sidebar">
          <div className="sidebar-section island-profile">
            <span className="sidebar-index">01 / {localize(experienceCopy.islandProfileTitle, language)}</span>
            <div className="metric-grid">
              <div><strong>{mapManifest.officialAreaKm2}</strong><span>km²</span><small>{localize(experienceCopy.area, language)}</small></div>
              <div><strong>{mapManifest.officialEmbankmentKm}</strong><span>km</span><small>{localize(experienceCopy.embankment, language)}</small></div>
              <div><strong>{mapManifest.counts.buildings}</strong><span>LOD0+</span><small>{localize(experienceCopy.buildingFootprints, language)}</small></div>
            </div>
            <p>{localize(experienceCopy.islandProfile, language)}</p>
          </div>

          {selected && <div className="sidebar-section selected-landmark" style={{ "--selected-color": selected.accent } as React.CSSProperties}>
            <span className="sidebar-index">02 / {localize(experienceCopy.selectedLandmark, language)}</span>
            <div className="selected-title"><span className="selected-symbol">{String(selected.id).padStart(2, "0")}</span><div><h3>{localize(landmarkCopy[selected.id].name, language)}</h3><span>{categoryLabels[language][selected.category]}</span></div></div>
            <p>{localize(landmarkCopy[selected.id].description, language)}</p>
            <div className="detail-chips">
              <span>{localize(experienceCopy.bestExperience, language)} · {localize(landmarkCopy[selected.id].season, language)}</span>
              {selectedAnchor && <span className={selectedAnchor.properties.confidence}>{selectedAnchor.properties.confidence === "triangulated" ? localize(experienceCopy.triangulated, language) : localize(experienceCopy.estimated, language)}</span>}
              {selectedAnchor && <span>LOD {selectedAnchor.properties.lod}</span>}
            </div>
            <button className="focus-button" onClick={() => setView("landmark")}>{localize(experienceCopy.focusLandmark, language)} <span>↗</span></button>
          </div>}

          <div className="sidebar-section route-section">
            <span className="sidebar-index">03 / {localize(experienceCopy.routeSelector, language)}</span>
            <div className="route-buttons">{routes.map((route) => <button key={route.id} className={routeId === route.id ? "active" : ""} onClick={() => { setRouteId(route.id); setView("route"); }}><i style={{ background: route.color }} /><span><strong>{localize(routeCopy[route.id].name, language)}</strong><small>{localize(routeCopy[route.id].description, language)}</small></span><b>→</b></button>)}</div>
          </div>

          <div className="sidebar-section evidence-section">
            <button className="evidence-toggle" onClick={() => setEvidenceOpen((value) => !value)} aria-expanded={evidenceOpen}><span><b>04 / {localize(experienceCopy.evidence, language)}</b><small>{evidenceSources.length} {localize(experienceCopy.sources, language)} · WGS84</small></span><span>{evidenceOpen ? "−" : "+"}</span></button>
            {evidenceOpen && <div className="evidence-list">{evidenceSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.type} · {source.date ?? source.imageryDate ?? "—"}</span></a>)}</div>}
          </div>
        </aside>
      </div>

      <footer className="map-footer"><span>{localize(experienceCopy.dataLayer, language)}</span><span>{localize(experienceCopy.precisionNote, language)}</span></footer>
    </section>
  );
}
