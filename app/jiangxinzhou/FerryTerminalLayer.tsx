"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import {
  ferryAssetUrl,
  ferryBerthPoint,
  ferryCruiseAt,
  ferryRoutePoints,
  ferryTerminalById,
  ferryTerminals,
  type FerryCruiseSnapshot,
  type FerryTerminalId,
  type FerryTerminalProfile,
} from "./ferry";
import type { Language } from "./locales";
import { projectPoint, projectPolyline } from "./mapGeometry";

const FERRY_LOD1 = "/models/jiangxinzhou-v2/transport-passenger-ferry-lod1.glb";
const FERRY_LOD2 = "/models/jiangxinzhou-v2/transport-passenger-ferry-lod2.glb";

type Props = {
  visible: boolean;
  selectedStopId?: string;
  selectedLineId: string;
  language: Language;
  legacy: boolean;
  detailed: boolean;
  timestamp: number;
  animate: boolean;
  onSelectStop: (id: string) => void;
};

class FerryAssetBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn("Ferry GLB unavailable; using procedural fallback", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ProceduralTerminal({ detailed }: { detailed: boolean }) {
  return <group>
    <mesh position={[0, 0.55, 0]}><boxGeometry args={[42, 0.9, 9]} /><meshStandardMaterial color="#667575" roughness={0.86} /></mesh>
    <mesh position={[13, 0.94, 0]}><boxGeometry args={[12, 0.22, 7]} /><meshStandardMaterial color="#27383c" roughness={0.82} /></mesh>
    <mesh position={[-10, 4.1, 0]}><boxGeometry args={[15, 0.24, 6.4]} /><meshStandardMaterial color="#e1e6df" roughness={0.55} /></mesh>
    {detailed && <>
      <mesh position={[-18, 2.1, 0]}><boxGeometry args={[0.22, 2.4, 4.6]} /><meshStandardMaterial color="#606d6d" metalness={0.5} roughness={0.38} /></mesh>
      <mesh position={[14, 1.2, 3.7]}><boxGeometry args={[10, 0.55, 0.22]} /><meshStandardMaterial color="#efb72b" roughness={0.6} /></mesh>
      <mesh position={[14, 1.2, -3.7]}><boxGeometry args={[10, 0.55, 0.22]} /><meshStandardMaterial color="#efb72b" roughness={0.6} /></mesh>
    </>}
  </group>;
}

function TerminalAsset({ terminal, detailed }: { terminal: FerryTerminalProfile; detailed: boolean }) {
  const gltf = useGLTF(ferryAssetUrl(terminal, detailed));
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = detailed;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [detailed, gltf.scene]);
  return <primitive object={scene} dispose={null} />;
}

function FerryTerminal({ terminal, detailed, language, selected, onSelectStop }: {
  terminal: FerryTerminalProfile;
  detailed: boolean;
  language: Language;
  selected: boolean;
  onSelectStop: (id: string) => void;
}) {
  const position = projectPoint(terminal.placement.waterAnchor, 0.4);
  const rotationY = THREE.MathUtils.degToRad(terminal.placement.headingDeg);
  return <group position={position} rotation={[0, rotationY, 0]}>
    <FerryAssetBoundary fallback={<ProceduralTerminal detailed={detailed} />}>
      <TerminalAsset terminal={terminal} detailed={detailed} />
    </FerryAssetBoundary>
    <mesh position={[0, 3, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta <= 6) onSelectStop(terminal.id); }}>
      <boxGeometry args={[58, 14, 24]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    <Html position={[0, 11, 0]} rotation={[0, -rotationY, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <div className={`ferry-terminal-label ${selected ? "active" : ""}`}>
        <span>{selected ? "⛴" : "◆"}</span>
        <strong>{terminal.name[language] ?? terminal.name.zh ?? terminal.name.en ?? ""}</strong>
      </div>
    </Html>
  </group>;
}

function ProceduralFerry() {
  return <group>
    <mesh position={[0, 1.1, 0]}><boxGeometry args={[18, 2.2, 4.8]} /><meshStandardMaterial color="#176688" roughness={0.45} metalness={0.12} /></mesh>
    <mesh position={[-0.5, 2.8, 0]}><boxGeometry args={[10.5, 2.3, 3.8]} /><meshStandardMaterial color="#e7eeea" roughness={0.52} /></mesh>
    <mesh position={[0, 1.7, 2.42]}><boxGeometry args={[15, 0.22, 0.14]} /><meshStandardMaterial color="#d32e28" /></mesh>
    <mesh position={[0, 1.7, -2.42]}><boxGeometry args={[15, 0.22, 0.14]} /><meshStandardMaterial color="#d32e28" /></mesh>
  </group>;
}

function VesselAsset({ detailed }: { detailed: boolean }) {
  const gltf = useGLTF(detailed ? FERRY_LOD2 : FERRY_LOD1);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) { object.castShadow = detailed; object.receiveShadow = true; }
    });
    return clone;
  }, [detailed, gltf.scene]);
  return <primitive object={scene} dispose={null} />;
}

function vesselPose(snapshot: FerryCruiseSnapshot, curve: THREE.CatmullRomCurve3) {
  if (snapshot.state.startsWith("crossing")) {
    const progress = THREE.MathUtils.clamp(snapshot.progress, 0.001, 0.999);
    const position = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).multiplyScalar(snapshot.state === "crossing-to-qigan" ? -1 : 1);
    return { position, rotationY: -Math.atan2(tangent.z, tangent.x) };
  }
  const terminalId: FerryTerminalId = snapshot.state === "moored-qigan" || snapshot.origin === "qigan-pier" ? "qigan-pier" : "mianhuadi-pier";
  return {
    position: new THREE.Vector3(...ferryBerthPoint(terminalId)),
    rotationY: THREE.MathUtils.degToRad(ferryTerminalById[terminalId].placement.headingDeg),
  };
}

function FerryVessel({ timestamp, animate, detailed, language, onSelectStop }: {
  timestamp: number;
  animate: boolean;
  detailed: boolean;
  language: Language;
  onSelectStop: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const clockRef = useRef({ timestamp, anchoredAt: 0 });
  const routePoints = useMemo(() => {
    const points = projectPolyline(ferryRoutePoints, 3.4);
    points[0] = ferryBerthPoint("qigan-pier");
    points[points.length - 1] = ferryBerthPoint("mianhuadi-pier");
    return points;
  }, []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(routePoints.map((point) => new THREE.Vector3(...point)), false, "centripetal"), [routePoints]);
  const initial = useMemo(() => vesselPose(ferryCruiseAt(timestamp), curve), [curve, timestamp]);
  useEffect(() => { clockRef.current = { timestamp, anchoredAt: performance.now() }; }, [timestamp]);
  useFrame(() => {
    if (!ref.current) return;
    const elapsed = animate && clockRef.current.anchoredAt > 0 ? performance.now() - clockRef.current.anchoredAt : 0;
    const projectedTimestamp = clockRef.current.timestamp + elapsed;
    const pose = vesselPose(ferryCruiseAt(projectedTimestamp), curve);
    ref.current.position.lerp(pose.position, animate ? 0.18 : 1);
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, pose.rotationY, animate ? 0.14 : 1);
  });
  const snapshot = ferryCruiseAt(timestamp);
  const clickTarget = snapshot.state.startsWith("crossing") ? snapshot.destination : snapshot.origin;
  return <group ref={ref} position={initial.position} rotation={[0, initial.rotationY, 0]}>
    <FerryAssetBoundary fallback={<ProceduralFerry />}><VesselAsset detailed={detailed} /></FerryAssetBoundary>
    <mesh position={[0, 3, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta <= 6) onSelectStop(clickTarget); }}>
      <boxGeometry args={[24, 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    <Html position={[0, 9, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <div className="transport-vehicle-label">{language === "zh" ? "中山106 · 模拟班次" : "Zhongshan 106 · Simulated"}</div>
    </Html>
  </group>;
}

export default function FerryTerminalLayer({ visible, selectedStopId, selectedLineId, language, legacy, detailed, timestamp, animate, onSelectStop }: Props) {
  const { size } = useThree();
  if (!visible) return null;
  const closeDetail = detailed && selectedLineId === "ferry-qigan";
  return <group>
    {ferryTerminals.map((terminal) => <FerryTerminal
      key={terminal.id}
      terminal={terminal}
      detailed={!legacy && closeDetail && selectedStopId === terminal.id}
      language={language}
      selected={selectedStopId === terminal.id}
      onSelectStop={onSelectStop}
    />)}
    <FerryVessel timestamp={timestamp} animate={animate} detailed={!legacy && closeDetail && size.width >= 560} language={language} onSelectStop={onSelectStop} />
  </group>;
}
