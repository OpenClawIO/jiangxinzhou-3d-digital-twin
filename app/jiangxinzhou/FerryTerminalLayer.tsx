"use client";

import { Html, useGLTF } from "@react-three/drei";
import { Component, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ferryAssetUrl, ferryTerminals, type FerryTerminalProfile } from "./ferry";
import type { Language } from "./locales";
import { projectPoint, type Point3 } from "./mapGeometry";

type Props = {
  visible: boolean;
  selectedStopId?: string;
  selectedLineId: string;
  language: Language;
  legacy: boolean;
  detailed: boolean;
  onSelectStop: (id: string) => void;
};

class FerryAssetBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("Ferry terminal GLB unavailable; using procedural fallback", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ProceduralTerminal({ position, detailed }: { position: Point3; detailed: boolean }) {
  return <group position={position}>
    <mesh position={[0, 0.55, 0]}><boxGeometry args={[38, 0.9, 9]} /><meshStandardMaterial color="#667575" roughness={0.86} /></mesh>
    <mesh position={[10, 1.02, 0]}><boxGeometry args={[14, 0.18, 7]} /><meshStandardMaterial color="#27383c" roughness={0.82} /></mesh>
    <mesh position={[-9, 3.8, 0]}><boxGeometry args={[13, 0.2, 6]} /><meshStandardMaterial color="#e1e6df" roughness={0.55} /></mesh>
    {detailed && <>
      <mesh position={[-15.5, 1.8, 0]}><boxGeometry args={[0.18, 2.0, 4.0]} /><meshStandardMaterial color="#606d6d" metalness={0.5} roughness={0.38} /></mesh>
      <mesh position={[10, 0.85, 3.6]}><boxGeometry args={[9, 0.5, 0.22]} /><meshStandardMaterial color="#efb72b" roughness={0.6} /></mesh>
      <mesh position={[10, 0.85, -3.6]}><boxGeometry args={[9, 0.5, 0.22]} /><meshStandardMaterial color="#efb72b" roughness={0.6} /></mesh>
    </>}
  </group>;
}

function TerminalAsset({ terminal, detailed }: { terminal: FerryTerminalProfile; detailed: boolean }) {
  const gltf = useGLTF(ferryAssetUrl(terminal, detailed));
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf.scene]);
  return <primitive object={scene} dispose={null} />;
}

function FerryTerminal({ terminal, detailed, language, selected, onSelectStop }: { terminal: FerryTerminalProfile; detailed: boolean; language: Language; selected: boolean; onSelectStop: (id: string) => void }) {
  const position = projectPoint(terminal.coordinate, 0.4);
  return <group position={position}>
    <FerryAssetBoundary fallback={<ProceduralTerminal position={[0, 0, 0]} detailed={detailed} />}>
      <TerminalAsset terminal={terminal} detailed={detailed} />
    </FerryAssetBoundary>
    <mesh position={[0, 2.2, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta <= 6) onSelectStop(terminal.id); }}>
      <sphereGeometry args={[selected ? 15 : 11, 12, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    <Html position={[0, 8, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <div className={`ferry-terminal-label ${selected ? "active" : ""}`}>
        <span>{selected ? "⛴" : "•"}</span>
        <strong>{terminal.name[language] ?? terminal.name.zh ?? terminal.name.en ?? ""}</strong>
      </div>
    </Html>
  </group>;
}

export default function FerryTerminalLayer({ visible, selectedStopId, selectedLineId, language, legacy, detailed, onSelectStop }: Props) {
  const { size } = useThree();
  if (!visible || legacy && size.width < 560) return null;
  return <group>
    {ferryTerminals.map((terminal) => <FerryTerminal
      key={terminal.id}
      terminal={terminal}
      detailed={detailed && selectedStopId === terminal.id && selectedLineId === "ferry-qigan"}
      language={language}
      selected={selectedStopId === terminal.id}
      onSelectStop={onSelectStop}
    />)}
  </group>;
}
