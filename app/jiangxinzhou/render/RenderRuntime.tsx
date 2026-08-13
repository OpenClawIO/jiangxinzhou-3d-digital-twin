"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { scheduledFrameRate, type RenderContextState, type RenderProfile, type RenderTelemetry } from "./runtime";

function collectSceneDrawStats(scene: THREE.Scene, profile: RenderProfile) {
  let calls = profile.postprocessing === "full" ? 12 : profile.postprocessing === "lite" ? 7 : 0;
  let triangles = profile.postprocessing === "off" ? 0 : 2 * calls;
  scene.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      const positionCount = geometry.getAttribute("position")?.count ?? 0;
      const indexedCount = geometry.index?.count ?? positionCount;
      const instanceCount = object instanceof THREE.InstancedMesh ? object.count : 1;
      const groups = geometry.groups.length;
      calls += Math.max(1, groups || (Array.isArray(object.material) ? object.material.length : 1));
      triangles += indexedCount / 3 * instanceCount;
    } else if (object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
      calls += 1;
    }
  });
  return { calls, triangles: Math.round(triangles) };
}

export function FrameBudgetScheduler({ profile, ambientActive, trafficActive }: { profile: RenderProfile; ambientActive: boolean; trafficActive: boolean }) {
  const { invalidate } = useThree();
  const requestedFps = scheduledFrameRate(profile, { ambient: ambientActive, traffic: trafficActive });
  useEffect(() => {
    if (requestedFps <= 0) return undefined;
    let interval: number | undefined;
    const start = () => {
      if (document.hidden || interval !== undefined) return;
      invalidate();
      interval = window.setInterval(invalidate, 1000 / requestedFps);
    };
    const stop = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    const onVisibility = () => document.hidden ? stop() : start();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [invalidate, requestedFps]);
  return null;
}

export function RenderTelemetryProbe({
  profile,
  contextState,
  contextLosses,
  monitorActive,
  onPerformanceSample,
  onTelemetry,
}: {
  profile: RenderProfile;
  contextState: RenderContextState;
  contextLosses: number;
  monitorActive: boolean;
  onPerformanceSample: (fps: number) => void;
  onTelemetry: (telemetry: RenderTelemetry) => void;
}) {
  const { camera, gl, invalidate, scene } = useThree();
  const telemetryWindow = useRef({ startedAt: 0, frames: 0, lastFrameAt: 0 });
  const performanceWindow = useRef({ startedAt: 0, frames: 0, lastFrameAt: 0 });
  const initialTelemetrySent = useRef(false);
  const previousCamera = useRef({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), initialized: false });

  useEffect(() => {
    performanceWindow.current = { startedAt: 0, frames: 0, lastFrameAt: 0 };
  }, [monitorActive]);

  useEffect(() => {
    initialTelemetrySent.current = false;
    invalidate();
  }, [contextLosses, contextState, invalidate]);

  useFrame(() => {
    const now = performance.now();
    if (!initialTelemetrySent.current) {
      const info = gl.info;
      const draw = collectSceneDrawStats(scene, profile);
      onTelemetry({
        tier: profile.tier,
        fps: 0,
        dpr: gl.getPixelRatio(),
        calls: draw.calls,
        triangles: draw.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        contextState,
        contextLosses,
      });
      initialTelemetrySent.current = true;
    }
    const telemetry = telemetryWindow.current;
    const telemetryGap = telemetry.lastFrameAt === 0 ? 0 : now - telemetry.lastFrameAt;
    telemetry.lastFrameAt = now;
    if (telemetry.startedAt === 0 || telemetryGap > 250) {
      telemetry.startedAt = now;
      telemetry.frames = 1;
    } else {
      telemetry.frames += 1;
      const elapsed = now - telemetry.startedAt;
      if (elapsed >= 650 && telemetry.frames >= 10) {
        const fps = telemetry.frames * 1000 / elapsed;
        const info = gl.info;
        const draw = collectSceneDrawStats(scene, profile);
        onTelemetry({
          tier: profile.tier,
          fps,
          dpr: gl.getPixelRatio(),
          calls: draw.calls,
          triangles: draw.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
          contextState,
          contextLosses,
        });
        telemetry.startedAt = now;
        telemetry.frames = 0;
      }
    }

    const previous = previousCamera.current;
    const cameraMoved = !previous.initialized
      || camera.position.distanceToSquared(previous.position) > 0.0004
      || 1 - Math.abs(camera.quaternion.dot(previous.quaternion)) > 0.0000002;
    previous.position.copy(camera.position);
    previous.quaternion.copy(camera.quaternion);
    previous.initialized = true;
    if (!monitorActive || !cameraMoved) {
      performanceWindow.current = { startedAt: 0, frames: 0, lastFrameAt: now };
      return;
    }
    const active = performanceWindow.current;
    const activeGap = active.lastFrameAt === 0 ? 0 : now - active.lastFrameAt;
    active.lastFrameAt = now;
    if (active.startedAt === 0 || activeGap > 80) {
      active.startedAt = now;
      active.frames = 1;
      return;
    }
    active.frames += 1;
    const elapsed = now - active.startedAt;
    if (elapsed >= 650 && active.frames >= 18) {
      onPerformanceSample(active.frames * 1000 / elapsed);
      active.startedAt = now;
      active.frames = 0;
    }
  });
  return null;
}

export function RendererLifecycle({ onContextStateChange }: { onContextStateChange: (state: RenderContextState) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      onContextStateChange("lost");
    };
    const onRestored = () => {
      onContextStateChange("recovering");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, onContextStateChange]);
  return null;
}

export function ShaderCompiler({ revision }: { revision: string }) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      gl.compileAsync(scene, camera).then(() => {
        if (!cancelled) invalidate();
      }).catch((error) => console.warn("WebGL shader precompile failed", error));
    };
    const idleWindow = window as typeof window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(run, { timeout: 1200 });
      return () => { cancelled = true; idleWindow.cancelIdleCallback?.(id); };
    }
    const id = window.setTimeout(run, 80);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [camera, gl, invalidate, revision, scene]);
  return null;
}
