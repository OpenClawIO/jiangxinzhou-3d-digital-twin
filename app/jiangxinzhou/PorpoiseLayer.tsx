"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { projectPolyline, waterBodies, type Point3 } from "./mapGeometry";
import {
  motionFor,
  pointAtPolyline,
  polylineLengthM,
  PORPOISE_AGENTS,
  PORPOISE_WATERLINE_Y,
  type PorpoiseAgent,
  type PorpoiseMotion,
  type PorpoiseZoneId,
} from "./porpoise";
import type { SceneQuality } from "./sceneTypes";

const PORPOISE_URL = "/models/jiangxinzhou-v2/finless-porpoise.glb";
const ZONES: readonly PorpoiseZoneId[] = ["yangtze-main-channel", "jiajiang"];

type PorpoisePathMap = Record<PorpoiseZoneId, Point3[]>;
type PorpoiseLengthMap = Record<PorpoiseZoneId, number>;

type PorpoiseLayerProps = {
  visible: boolean;
  quality: SceneQuality;
  reducedMotion: boolean;
  legacy: boolean;
};

type PorpoisePart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  localMatrix: THREE.Matrix4;
};

const PORPOISE_SIGNAL_Y = PORPOISE_WATERLINE_Y + 0.16;

function buildPorpoisePaths(): PorpoisePathMap {
  const result: PorpoisePathMap = {
    "yangtze-main-channel": [],
    jiajiang: [],
  };
  for (const zoneId of ZONES) {
    const feature = waterBodies.find((candidate) => candidate.id === zoneId || candidate.properties.kind === zoneId);
    const centerline = feature?.properties.centerline;
    if (centerline && centerline.length > 1) result[zoneId] = projectPolyline(centerline, PORPOISE_WATERLINE_Y);
  }
  return result;
}

function deriveLengths(paths: PorpoisePathMap): PorpoiseLengthMap {
  return {
    "yangtze-main-channel": polylineLengthM(paths["yangtze-main-channel"]),
    jiajiang: polylineLengthM(paths.jiajiang),
  };
}

function motionWithZoneLimit(
  agents: readonly PorpoiseAgent[],
  elapsedMs: number,
  lengths: PorpoiseLengthMap,
): PorpoiseMotion[] {
  const raw = agents.map((agent) => motionFor(agent, elapsedMs, lengths[agent.zoneId]));
  const selected = new Map<PorpoiseZoneId, number>();
  for (const zoneId of ZONES) {
    let bestIndex = -1;
    let bestEmergence = 0;
    raw.forEach((motion, index) => {
      if (agents[index].zoneId !== zoneId || motion.emergence <= bestEmergence) return;
      bestIndex = index;
      bestEmergence = motion.emergence;
    });
    if (bestIndex >= 0) selected.set(zoneId, bestIndex);
  }
  return raw.map((motion, index) => {
    if (motion.emergence <= 0 || selected.get(agents[index].zoneId) === index) return motion;
    return { ...motion, state: "submerged", emergence: 0 };
  });
}

function setAgentMatrix(
  target: THREE.Matrix4,
  agent: PorpoiseAgent,
  path: Point3[],
  motion: PorpoiseMotion,
  partMatrix: THREE.Matrix4,
  scratch: {
    position: THREE.Vector3;
    scale: THREE.Vector3;
    quaternion: THREE.Quaternion;
    euler: THREE.Euler;
    root: THREE.Matrix4;
  },
) {
  if (path.length < 2 || motion.emergence <= 0.001) {
    target.makeScale(0.0001, 0.0001, 0.0001);
    return;
  }
  const { point, tangent } = pointAtPolyline(path, motion.progress);
  const yaw = -Math.atan2(tangent[2], tangent[0]);
  scratch.position.set(point[0], PORPOISE_WATERLINE_Y - 0.42 + motion.emergence * 0.86, point[2]);
  scratch.euler.set(motion.roll, yaw, motion.pitch, "XYZ");
  scratch.quaternion.setFromEuler(scratch.euler);
  const size = agent.scale * (0.2 + motion.emergence * 0.8);
  scratch.scale.setScalar(size);
  scratch.root.compose(scratch.position, scratch.quaternion, scratch.scale);
  target.copy(scratch.root).multiply(partMatrix);
}

function setSplashMatrix(
  target: THREE.Matrix4,
  agent: PorpoiseAgent,
  path: Point3[],
  motion: PorpoiseMotion,
  scratch: { position: THREE.Vector3; scale: THREE.Vector3; quaternion: THREE.Quaternion },
) {
  if (path.length < 2) {
    target.makeScale(0.0001, 0.0001, 0.0001);
    return;
  }
  const { point } = pointAtPolyline(path, motion.progress);
  scratch.position.set(point[0], PORPOISE_SIGNAL_Y, point[2]);
  scratch.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  // A real 1.8 m animal is intentionally tiny at full-island scale. The
  // low-contrast surface signal keeps its location discoverable without
  // scaling the GLB into an unrealistic landmark.
  const size = agent.scale * (2.2 + motion.emergence * 3.8);
  scratch.scale.set(size * 1.55, size, size);
  target.compose(scratch.position, scratch.quaternion, scratch.scale);
}

function PorpoiseActivityMarkers({ paths, lengths, animate }: { paths: PorpoisePathMap; lengths: PorpoiseLengthMap; animate: boolean }) {
  const groupsRef = useRef<Array<THREE.Group | null>>([]);
  const markerRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const initialMotions = useMemo(() => PORPOISE_AGENTS.map((agent) => motionFor(agent, 0, lengths[agent.zoneId])), [lengths]);

  useFrame(({ clock }) => {
    if (!animate) return;
    PORPOISE_AGENTS.forEach((agent, index) => {
      const group = groupsRef.current[index];
      const marker = markerRefs.current[index];
      if (!group || !marker) return;
      const motion = motionFor(agent, clock.elapsedTime * 1000, lengths[agent.zoneId]);
      const { point } = pointAtPolyline(paths[agent.zoneId], motion.progress);
      group.position.set(point[0], PORPOISE_SIGNAL_Y, point[2]);
      marker.dataset.state = motion.state;
      marker.style.setProperty("--porpoise-opacity", `${0.34 + motion.emergence * 0.62}`);
    });
  });

  return <group name="porpoise-activity-markers">
    {PORPOISE_AGENTS.map((agent, index) => {
      const motion = initialMotions[index];
      const { point } = pointAtPolyline(paths[agent.zoneId], motion.progress);
      return <group key={agent.id} ref={(group) => { groupsRef.current[index] = group; }} position={[point[0], PORPOISE_SIGNAL_Y, point[2]]}>
        <Html center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <span ref={(marker) => { markerRefs.current[index] = marker; }} className="porpoise-map-marker" data-state={motion.state} aria-hidden="true"><i /></span>
        </Html>
      </group>;
    })}
  </group>;
}

function StaticPorpoiseLayer({ paths }: { paths: PorpoisePathMap }) {
  const { invalidate } = useThree();
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const ridgeRef = useRef<THREE.InstancedMesh>(null);
  const signalRef = useRef<THREE.InstancedMesh>(null);
  const bodyGeometry = useMemo(() => new THREE.SphereGeometry(1, 16, 8), []);
  const ridgeGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.1, 0.18), []);
  const signalGeometry = useMemo(() => new THREE.RingGeometry(0.72, 1, 24), []);
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#52747b", roughness: 0.88, metalness: 0.02 }), []);
  const ridgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3c6269", roughness: 0.92, metalness: 0.01 }), []);
  const signalMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#9fe8e4", transparent: true, opacity: 0.46, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const body = bodyRef.current;
    const ridge = ridgeRef.current;
    const signal = signalRef.current;
    if (!body || !ridge) return;
    PORPOISE_AGENTS.forEach((agent, index) => {
      const path = paths[agent.zoneId];
      const { point, tangent } = pointAtPolyline(path, agent.phase);
      const yaw = -Math.atan2(tangent[2], tangent[0]);
      dummy.position.set(point[0], PORPOISE_WATERLINE_Y - 0.04, point[2]);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1.12 * agent.scale, 0.22 * agent.scale, 0.4 * agent.scale);
      dummy.updateMatrix();
      body.setMatrixAt(index, dummy.matrix);
      dummy.position.y += 0.19;
      dummy.scale.set(0.7 * agent.scale, 0.07 * agent.scale, 0.13 * agent.scale);
      dummy.updateMatrix();
      ridge.setMatrixAt(index, dummy.matrix);
      if (signal) {
        dummy.position.set(point[0], PORPOISE_SIGNAL_Y, point[2]);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(2.8 * agent.scale, 1.8 * agent.scale, 2.8 * agent.scale);
        dummy.updateMatrix();
        signal.setMatrixAt(index, dummy.matrix);
      }
    });
    body.instanceMatrix.needsUpdate = true;
    ridge.instanceMatrix.needsUpdate = true;
    if (signal) signal.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [dummy, invalidate, paths]);

  useEffect(() => () => {
    bodyGeometry.dispose();
    ridgeGeometry.dispose();
    signalGeometry.dispose();
    bodyMaterial.dispose();
    ridgeMaterial.dispose();
    signalMaterial.dispose();
  }, [bodyGeometry, bodyMaterial, ridgeGeometry, ridgeMaterial, signalGeometry, signalMaterial]);

  return <group name="porpoise-static-silhouettes">
    <instancedMesh ref={bodyRef} args={[bodyGeometry, bodyMaterial, PORPOISE_AGENTS.length]} frustumCulled={false} />
    <instancedMesh ref={ridgeRef} args={[ridgeGeometry, ridgeMaterial, PORPOISE_AGENTS.length]} frustumCulled={false} />
    <instancedMesh ref={signalRef} args={[signalGeometry, signalMaterial, PORPOISE_AGENTS.length]} frustumCulled={false} renderOrder={5} />
  </group>;
}

function DetailedPorpoiseLayer({ paths, lengths }: { paths: PorpoisePathMap; lengths: PorpoiseLengthMap }) {
  const { invalidate } = useThree();
  const gltf = useGLTF(PORPOISE_URL);
  const parts = useMemo<PorpoisePart[]>(() => {
    gltf.scene.updateMatrixWorld(true);
    const next: PorpoisePart[] = [];
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material;
      if (!material) return;
      next.push({ geometry: object.geometry, material, localMatrix: object.matrixWorld.clone() });
    });
    return next;
  }, [gltf.scene]);
  const meshesRef = useRef<Array<THREE.InstancedMesh | null>>([]);
  const splashRef = useRef<THREE.InstancedMesh>(null);
  const splashGeometry = useMemo(() => new THREE.RingGeometry(0.72, 1, 24), []);
  const splashMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#9fe8e4", transparent: true, opacity: 0.52, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }), []);
  const scratch = useMemo(() => ({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    euler: new THREE.Euler(),
    root: new THREE.Matrix4(),
    matrix: new THREE.Matrix4(),
    splashMatrix: new THREE.Matrix4(),
  }), []);

  useFrame(({ clock }) => {
    const motions = motionWithZoneLimit(PORPOISE_AGENTS, clock.elapsedTime * 1000, lengths);
    parts.forEach((part, partIndex) => {
      const mesh = meshesRef.current[partIndex];
      if (!mesh) return;
      PORPOISE_AGENTS.forEach((agent, agentIndex) => {
        setAgentMatrix(scratch.matrix, agent, paths[agent.zoneId], motions[agentIndex], part.localMatrix, scratch);
        mesh.setMatrixAt(agentIndex, scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    const splash = splashRef.current;
    if (splash) {
      PORPOISE_AGENTS.forEach((agent, index) => {
        setSplashMatrix(scratch.splashMatrix, agent, paths[agent.zoneId], motions[index], scratch);
        splash.setMatrixAt(index, scratch.splashMatrix);
      });
      splash.instanceMatrix.needsUpdate = true;
    }
  });

  useEffect(() => {
    invalidate();
    return () => {
      splashGeometry.dispose();
      splashMaterial.dispose();
    };
  }, [invalidate, splashGeometry, splashMaterial]);

  if (parts.length === 0) return null;
  return <group name="porpoise-dynamic-activity">
    {parts.map((part, index) => <instancedMesh
      key={`${part.geometry.uuid}-${index}`}
      ref={(mesh) => { meshesRef.current[index] = mesh; }}
      args={[part.geometry, part.material, PORPOISE_AGENTS.length]}
      frustumCulled={false}
      dispose={null}
    />)}
    <instancedMesh ref={splashRef} args={[splashGeometry, splashMaterial, PORPOISE_AGENTS.length]} frustumCulled={false} renderOrder={5} />
  </group>;
}

class PorpoiseAssetBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("Finless porpoise GLB was skipped; using a procedural fallback", error);
    window.setTimeout(this.props.onError, 0);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function PorpoiseLayer({ visible, quality, reducedMotion, legacy }: PorpoiseLayerProps) {
  const paths = useMemo(() => buildPorpoisePaths(), []);
  const lengths = useMemo(() => deriveLengths(paths), [paths]);
  const [assetFailed, setAssetFailed] = useState(false);
  if (!visible) return null;
  const animateMarkers = quality !== "efficiency" && !reducedMotion && !legacy;
  const activityMarkers = <PorpoiseActivityMarkers paths={paths} lengths={lengths} animate={animateMarkers} />;
  if (quality === "efficiency" || reducedMotion || legacy || assetFailed) return <group>{activityMarkers}<StaticPorpoiseLayer paths={paths} /></group>;
  return <group>{activityMarkers}<Suspense fallback={<StaticPorpoiseLayer paths={paths} />}>
    <PorpoiseAssetBoundary fallback={<StaticPorpoiseLayer paths={paths} />} onError={() => setAssetFailed(true)}>
      <DetailedPorpoiseLayer paths={paths} lengths={lengths} />
    </PorpoiseAssetBoundary>
  </Suspense></group>;
}
