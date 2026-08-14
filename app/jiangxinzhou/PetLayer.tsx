"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { anchorPosition } from "./mapGeometry";
import {
  PET_AGENTS,
  petAnchorPosition,
  petMotionFor,
  PET_GROUND_Y,
  type PetSpecies,
} from "./pet";
import type { SceneQuality } from "./sceneTypes";

const PET_URL = "/models/jiangxinzhou-v2/jiangxinzhou-pets.glb";
const PET_ROOTS: Record<PetSpecies, string> = {
  dog: "PetDog",
  cat: "PetCat",
  rabbit: "PetRabbit",
  egret: "PetEgret",
};

type PetLayerProps = {
  visible: boolean;
  quality: SceneQuality;
  reducedMotion: boolean;
  legacy: boolean;
};

function configurePetModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = true;
  });
  return model;
}

function PetAssetLayer({ animate }: { animate: boolean }) {
  const gltf = useGLTF(PET_URL);
  const groupsRef = useRef<Array<THREE.Group | null>>([]);
  const models = useMemo(() => PET_AGENTS.map((agent) => {
    const source = gltf.scene.getObjectByName(PET_ROOTS[agent.species]);
    return configurePetModel(source?.clone(true) ?? new THREE.Group());
  }), [gltf.scene]);
  const anchors = useMemo(() => PET_AGENTS.map((agent) => petAnchorPosition(anchorPosition(agent.anchorId), agent)), []);

  useFrame(({ clock }) => {
    if (!animate) return;
    const elapsedMs = clock.elapsedTime * 1000;
    PET_AGENTS.forEach((agent, index) => {
      const group = groupsRef.current[index];
      if (!group) return;
      const motion = petMotionFor(agent, elapsedMs);
      const base = anchors[index];
      group.position.set(base[0] + motion.displacement[0], PET_GROUND_Y + motion.displacement[1] + motion.bodyBob, base[2] + motion.displacement[2]);
      group.rotation.set(motion.lift * 0.16, motion.heading, agent.species === "egret" ? Math.sin(elapsedMs / 180) * motion.wingOpen * 0.08 : 0);
      const bobScale = 1 + Math.abs(motion.bodyBob) * 0.18;
      const widthScale = agent.species === "egret" ? 1 + motion.wingOpen * 0.18 : 1;
      group.scale.set(agent.scale * bobScale, agent.scale * bobScale, agent.scale * widthScale);
    });
  });

  return <group name="jiangxinzhou-pet-ecology">
    {PET_AGENTS.map((agent, index) => <group key={agent.id} ref={(group) => { groupsRef.current[index] = group; }} position={anchors[index]}>
      <primitive object={models[index]} />
    </group>)}
  </group>;
}

function PetFallback({ animate }: { animate: boolean }) {
  const groupsRef = useRef<Array<THREE.Group | null>>([]);
  const anchors = useMemo(() => PET_AGENTS.map((agent) => petAnchorPosition(anchorPosition(agent.anchorId), agent)), []);
  const geometry = useMemo(() => ({
    body: new THREE.SphereGeometry(1, 10, 6),
    head: new THREE.SphereGeometry(1, 8, 6),
    ear: new THREE.ConeGeometry(0.18, 0.45, 6),
    beak: new THREE.ConeGeometry(0.10, 0.32, 6),
  }), []);
  const materials = useMemo(() => ({
    dog: new THREE.MeshStandardMaterial({ color: "#a2663a", roughness: 0.9 }),
    cat: new THREE.MeshStandardMaterial({ color: "#7a8589", roughness: 0.9 }),
    rabbit: new THREE.MeshStandardMaterial({ color: "#d7d0c3", roughness: 0.92 }),
    egret: new THREE.MeshStandardMaterial({ color: "#e5e7dc", roughness: 0.88 }),
    beak: new THREE.MeshStandardMaterial({ color: "#d88d2b", roughness: 0.82 }),
  }), []);

  useFrame(({ clock }) => {
    if (!animate) return;
    const elapsedMs = clock.elapsedTime * 1000;
    PET_AGENTS.forEach((agent, index) => {
      const group = groupsRef.current[index];
      if (!group) return;
      const motion = petMotionFor(agent, elapsedMs);
      const base = anchors[index];
      group.position.set(base[0] + motion.displacement[0], PET_GROUND_Y + motion.displacement[1] + motion.bodyBob, base[2] + motion.displacement[2]);
      group.rotation.y = motion.heading;
      group.scale.setScalar(agent.scale * (1 + Math.abs(motion.bodyBob) * 0.18));
    });
  });

  useEffect(() => () => {
    Object.values(geometry).forEach((item) => item.dispose());
    Object.values(materials).forEach((item) => item.dispose());
  }, [geometry, materials]);

  return <group name="jiangxinzhou-pet-ecology-fallback">
    {PET_AGENTS.map((agent, index) => <group key={agent.id} ref={(group) => { groupsRef.current[index] = group; }} position={anchors[index]}>
      <mesh geometry={geometry.body} material={materials[agent.species]} scale={[0.48, 0.28, 0.24]} />
      <mesh geometry={geometry.head} material={materials[agent.species]} position={[0.48, 0.28, 0]} scale={[0.24, 0.23, 0.21]} />
      {(agent.species === "dog" || agent.species === "cat" || agent.species === "rabbit") && <mesh geometry={geometry.ear} material={materials[agent.species]} position={[0.40, 0.58, -0.12]} scale={0.7} />}
      {agent.species === "egret" && <mesh geometry={geometry.beak} material={materials.beak} position={[0.73, 0.42, 0]} rotation={[0, Math.PI / 2, 0]} />}
    </group>)}
  </group>;
}

class PetAssetBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  componentDidCatch(error: Error) {
    console.warn("Jiangxinzhou PET GLB was skipped; using a procedural fallback", error);
    window.setTimeout(this.props.onError, 0);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function PetLayer({ visible, quality, reducedMotion, legacy }: PetLayerProps) {
  const [assetFailed, setAssetFailed] = useState(false);
  if (!visible) return null;
  const animate = quality !== "efficiency" && !reducedMotion && !legacy;
  const fallback = <PetFallback animate={animate} />;
  if (assetFailed) return fallback;
  return <Suspense fallback={fallback}>
    <PetAssetBoundary fallback={fallback} onError={() => setAssetFailed(true)}>
      <PetAssetLayer animate={animate} />
    </PetAssetBoundary>
  </Suspense>;
}
