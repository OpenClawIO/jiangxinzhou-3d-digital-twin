"use client";

import { Environment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Outline, SSAO } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { CelestialState } from "../celestial";
import { celestialDirection } from "../celestial";
import { regionalBounds, type Point3 } from "../mapGeometry";
import type { RenderProfile } from "./runtime";

function blendColor(from: string, to: string, amount: number) {
  return new THREE.Color(from).lerp(new THREE.Color(to), THREE.MathUtils.clamp(amount, 0, 1));
}

function skyColors(state: CelestialState) {
  const twilight = blendColor("#06111d", "#b96f62", state.twilight);
  const horizon = twilight.clone().lerp(new THREE.Color("#7faeb2"), state.daylight);
  horizon.lerp(new THREE.Color("#db936f"), state.horizonGlow * 0.34);
  const zenith = blendColor("#020812", "#2b6687", state.daylight).lerp(new THREE.Color("#26395b"), state.twilight * 0.22);
  const ground = blendColor("#07131d", "#4f7474", state.daylight * 0.76);
  return { horizon, zenith, ground };
}

const skyVertex = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDirection;
  uniform float uDaylight;
  varying vec3 vDirection;
  void main() {
    vec3 direction = normalize(vDirection);
    float upper = smoothstep(-0.06, 0.7, direction.y);
    vec3 color = mix(uGround, mix(uHorizon, uZenith, upper), smoothstep(-0.32, 0.02, direction.y));
    float sunGlow = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 64.0) * (0.35 + uDaylight * 0.85);
    color += vec3(1.0, 0.66, 0.36) * sunGlow;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function SkySphere({ state, radius, environment = false }: { state: CelestialState; radius: number; environment?: boolean }) {
  const colors = skyColors(state);
  const sunDirection = celestialDirection(state.sun.azimuthDeg, state.sun.altitudeDeg, 1);
  return <mesh scale={radius} frustumCulled={false} renderOrder={-20}>
    <sphereGeometry args={[1, environment ? 18 : 32, environment ? 10 : 16]} />
    <shaderMaterial
      side={THREE.BackSide}
      depthWrite={false}
      fog={false}
      vertexShader={skyVertex}
      fragmentShader={skyFragment}
      uniforms={{
        uZenith: { value: colors.zenith },
        uHorizon: { value: colors.horizon },
        uGround: { value: colors.ground },
        uSunDirection: { value: new THREE.Vector3(...sunDirection) },
        uDaylight: { value: state.daylight },
      }}
    />
  </mesh>;
}

export function ProceduralSky({ state }: { state: CelestialState }) {
  return <group position={regionalBounds.center}><SkySphere state={state} radius={54_000} /></group>;
}

export function ProceduralEnvironment({ state, profile }: { state: CelestialState; profile: RenderProfile }) {
  if (profile.environmentSize === 0) return null;
  const sunDirection = celestialDirection(state.sun.azimuthDeg, state.sun.altitudeDeg, 32);
  return <Environment
    frames={1}
    resolution={profile.environmentSize}
    background={false}
    environmentIntensity={profile.tier === "high" ? 0.34 : 0.22}
  >
    <SkySphere state={state} radius={48} environment />
    <mesh position={sunDirection} visible={state.sun.visible}>
      <sphereGeometry args={[2.3, 12, 8]} />
      <meshBasicMaterial color="#fff0c2" toneMapped={false} />
    </mesh>
  </Environment>;
}

const waterVertex = `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying float vWave;
  #include <fog_pars_vertex>
  void main() {
    vec3 transformed = position;
    float waveA = sin(position.x * 0.0017 + uTime * 0.42);
    float waveB = sin(position.y * 0.0024 - uTime * 0.31);
    float waveC = sin((position.x + position.y) * 0.0011 + uTime * 0.19);
    vWave = waveA * 0.5 + waveB * 0.3 + waveC * 0.2;
    transformed.z += vWave * 1.15;
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFragment = `
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSunDirection;
  uniform float uDaylight;
  varying vec3 vWorldPosition;
  varying float vWave;
  #include <fog_pars_fragment>
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vec3(-dFdx(vWave) * 7.0, 1.0, -dFdy(vWave) * 7.0));
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    vec3 reflected = reflect(-normalize(uSunDirection), normal);
    float specular = pow(max(dot(reflected, viewDirection), 0.0), 72.0) * uDaylight;
    vec3 color = mix(uDeepColor, uShallowColor, 0.24 + fresnel * 0.52 + vWave * 0.035);
    color += vec3(1.0, 0.86, 0.62) * specular * 0.5;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function WaterSurface({ visible, state, profile }: { visible: boolean; state: CelestialState; profile: RenderProfile }) {
  const span = Math.max(regionalBounds.width, regionalBounds.depth) * 1.18;
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uDeepColor: { value: blendColor("#061522", "#174d67", state.daylight) },
      uShallowColor: { value: blendColor("#123447", "#4f9ca9", state.daylight) },
      uSunDirection: { value: new THREE.Vector3(...celestialDirection(state.sun.azimuthDeg, state.sun.altitudeDeg, 1)) },
      uDaylight: { value: state.daylight },
    }]),
  }), [state.daylight, state.sun.altitudeDeg, state.sun.azimuthDeg]);
  const materialRef = useRef(material);
  useEffect(() => { materialRef.current = material; }, [material]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    if (visible && profile.ambientFps > 0) materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });
  if (!visible) return null;
  return <mesh position={[regionalBounds.center[0], -40, regionalBounds.center[2]]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
    <planeGeometry args={[span, span, 96, 96]} />
  </mesh>;
}

export function RenderEffects({ profile, nightFactor, closeFocus, selection }: {
  profile: RenderProfile;
  nightFactor: number;
  closeFocus: boolean;
  selection: RefObject<THREE.Object3D | null>;
}) {
  if (profile.postprocessing === "off") return null;
  const full = profile.postprocessing === "full";
  const ambientOcclusion = full || closeFocus;
  return <EffectComposer
    key={`${profile.tier}:${ambientOcclusion ? "normal" : "color"}`}
    multisampling={profile.multisampling}
    resolutionScale={ambientOcclusion ? 0.5 : 1}
    enableNormalPass={ambientOcclusion}
    depthBuffer
    stencilBuffer={false}
  >
    {ambientOcclusion ? <SSAO
      samples={full ? 12 : 7}
      rings={4}
      radius={full ? 0.14 : 0.09}
      intensity={full ? 1.05 : 0.72}
      luminanceInfluence={0.78}
      bias={0.025}
      resolutionScale={0.5}
    /> : null}
    <Bloom luminanceThreshold={1} luminanceSmoothing={0.12} mipmapBlur intensity={nightFactor * (full ? 0.32 : 0.2)} radius={0.42} />
    {closeFocus ? <Outline selection={selection} edgeStrength={1.45} pulseSpeed={0} visibleEdgeColor={0xbceedd} hiddenEdgeColor={0x000000} xRay={false} blur={false} resolutionScale={0.72} /> : null}
  </EffectComposer>;
}

export function celestialPosition(state: CelestialState, kind: "sun" | "moon", radius: number): Point3 {
  const body = kind === "sun" ? state.sun : state.moon;
  const direction = celestialDirection(body.azimuthDeg, body.altitudeDeg, radius);
  return [regionalBounds.center[0] + direction[0], direction[1], regionalBounds.center[2] + direction[2]];
}
