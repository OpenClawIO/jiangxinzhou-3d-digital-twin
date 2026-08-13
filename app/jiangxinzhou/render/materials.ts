import * as THREE from "three";
import type { RenderTier } from "./runtime";

export type AssetRole = "terrain" | "buildings" | "vegetation" | "landmarks" | "nanjing-eye" | "bridges" | "transport";

export type MaterialRuntimeUniforms = {
  time: { value: number };
  nightFactor: { value: number };
};

export type PreparedScene = {
  scene: THREE.Group;
  uniforms: MaterialRuntimeUniforms;
  emissiveObjects: THREE.Object3D[];
  dispose: () => void;
};

const VEGETATION_MATERIAL = /Tree (dark|mid|light)|Pink muhly|Seasonal flower/i;
const LIGHT_MATERIAL = /Tower Light|Deck Light|Edge Light|lighthouse|coral|porpoise|stay cables|bridge cables/i;

function shaderPrelude() {
  return `
    varying vec3 vJxzWorldPosition;
    varying vec3 vJxzWorldNormal;
  `;
}

function addWorldVaryings(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${shaderPrelude()}`)
    .replace("#include <project_vertex>", `
      vJxzWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vJxzWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      #include <project_vertex>
    `);
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${shaderPrelude()}`);
}

function patchBuildingMaterial(material: THREE.MeshStandardMaterial, uniforms: MaterialRuntimeUniforms) {
  material.roughness = THREE.MathUtils.clamp(material.roughness * 0.96, 0.28, 0.92);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uJxzNightFactor = uniforms.nightFactor;
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uJxzNightFactor;
        float jxzHash(vec2 point) {
          return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
        }
      `)
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
        float jxzRoof = smoothstep(0.58, 0.88, vJxzWorldNormal.y);
        float jxzSlope = 0.92 + 0.08 * max(vJxzWorldNormal.y, 0.0);
        float jxzHeightTone = 0.96 + 0.05 * smoothstep(5.0, 90.0, vJxzWorldPosition.y);
        gl_FragColor.rgb *= jxzSlope * jxzHeightTone * mix(1.0, 1.045, jxzRoof);

        float jxzVertical = 1.0 - smoothstep(0.42, 0.76, abs(vJxzWorldNormal.y));
        float jxzUseX = step(abs(vJxzWorldNormal.x), abs(vJxzWorldNormal.z));
        float jxzHorizontal = mix(vJxzWorldPosition.z, vJxzWorldPosition.x, jxzUseX);
        vec2 jxzCell = vec2(jxzHorizontal / 3.2, vJxzWorldPosition.y / 3.3);
        vec2 jxzPaneUv = fract(jxzCell);
        vec2 jxzAA = max(fwidth(jxzCell), vec2(0.002));
        float jxzPaneX = smoothstep(0.12 - jxzAA.x, 0.18 + jxzAA.x, jxzPaneUv.x) * (1.0 - smoothstep(0.82 - jxzAA.x, 0.88 + jxzAA.x, jxzPaneUv.x));
        float jxzPaneY = smoothstep(0.18 - jxzAA.y, 0.25 + jxzAA.y, jxzPaneUv.y) * (1.0 - smoothstep(0.72 - jxzAA.y, 0.82 + jxzAA.y, jxzPaneUv.y));
        float jxzOccupied = step(0.79, jxzHash(floor(jxzCell)));
        float jxzDistanceFade = 1.0 - smoothstep(1200.0, 2500.0, distance(cameraPosition, vJxzWorldPosition));
        float jxzWindow = jxzVertical * jxzPaneX * jxzPaneY * jxzOccupied * jxzDistanceFade * uJxzNightFactor;
        gl_FragColor.rgb += vec3(1.0, 0.66, 0.34) * jxzWindow * 1.15;
      `);
  };
  material.customProgramCacheKey = () => "jxz-building-v6";
  material.needsUpdate = true;
}

function patchTerrainMaterial(material: THREE.MeshStandardMaterial) {
  material.roughness = 0.94;
  material.onBeforeCompile = (shader) => {
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
      float jxzShore = smoothstep(-1.0, 8.0, vJxzWorldPosition.y);
      float jxzTerrainSlope = 0.9 + 0.1 * max(vJxzWorldNormal.y, 0.0);
      gl_FragColor.rgb *= mix(0.87, 1.0, jxzShore) * jxzTerrainSlope;
    `);
  };
  material.customProgramCacheKey = () => "jxz-terrain-v6";
  material.needsUpdate = true;
}

function patchVegetationMaterial(material: THREE.MeshStandardMaterial, uniforms: MaterialRuntimeUniforms) {
  material.roughness = Math.max(0.82, material.roughness);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uJxzTime = uniforms.time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uJxzTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float jxzWindMask = smoothstep(-1.8, 3.5, position.y);
        float jxzWind = sin(uJxzTime * 0.72 + position.x * 0.045 + position.z * 0.035) + sin(uJxzTime * 1.13 + position.z * 0.022) * 0.45;
        transformed.x += jxzWind * 0.28 * jxzWindMask;
        transformed.z += jxzWind * 0.11 * jxzWindMask;
      `);
  };
  material.customProgramCacheKey = () => "jxz-vegetation-wind-v6";
  material.needsUpdate = true;
}

function tuneNightMaterial(material: THREE.MeshStandardMaterial, uniforms: MaterialRuntimeUniforms) {
  const name = material.name;
  const towerLight = /Nanjing Eye Tower Light/i.test(name);
  const deckLight = /Nanjing Eye Deck Light/i.test(name);
  const edgeLight = /Nanjing Eye Edge Light/i.test(name);
  const bridgeTower = /Nanjing Eye White Painted Steel/i.test(name);
  const bridgeRail = /Nanjing Eye White Railings/i.test(name);
  const glass = /glass|window|low-iron/i.test(name);
  const landmarkAccent = /lighthouse|coral|porpoise|bridge cables|stay cables/i.test(name);
  const color = towerLight || bridgeTower ? "#fff2d0" : deckLight ? "#ffd49a" : edgeLight ? "#c5e5ff" : bridgeRail ? "#f0f5ef" : glass ? "#ffd795" : landmarkAccent ? "#ffc78f" : "#e0a764";
  const intensity = towerLight ? 3.8 : deckLight ? 4.6 : edgeLight ? 2.8 : bridgeTower ? 0.86 : bridgeRail ? 0.22 : glass ? 0.72 : landmarkAccent ? 0.34 : 0.07;
  material.emissive.set(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uJxzNightFactor = uniforms.nightFactor;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uJxzNightFactor;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance *= uJxzNightFactor * ${intensity.toFixed(3)};
      `);
  };
  material.customProgramCacheKey = () => `jxz-night-v6-${intensity.toFixed(3)}`;
  if (towerLight || deckLight || edgeLight) material.toneMapped = false;
  if (/steel|cables|railings/i.test(name)) {
    material.metalness = Math.max(material.metalness, /cables/i.test(name) ? 0.72 : 0.38);
    material.roughness = /painted|railings/i.test(name) ? 0.32 : 0.24;
  }
  if (/concrete|deck surface/i.test(name)) {
    material.metalness = 0;
    material.roughness = 0.86;
  }
  material.needsUpdate = true;
}

function materialNeedsClone(material: THREE.Material, role: AssetRole, nightLighting: boolean) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  if (nightLighting || role === "terrain" || role === "buildings" || role === "nanjing-eye") return true;
  return role === "vegetation" && VEGETATION_MATERIAL.test(material.name);
}

export function prepareScene(source: THREE.Group, options: { role: AssetRole; tier: RenderTier; nightLighting?: boolean; shadows?: boolean }): PreparedScene {
  const scene = source.clone(true);
  const uniforms: MaterialRuntimeUniforms = { time: { value: 0 }, nightFactor: { value: 0 } };
  const materialClones = new Map<THREE.Material, THREE.Material>();
  const emissiveObjects: THREE.Object3D[] = [];

  scene.traverse((object) => {
    object.frustumCulled = true;
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = Boolean(options.shadows && options.role !== "terrain" && options.role !== "vegetation");
    object.receiveShadow = Boolean(options.shadows && options.role !== "vegetation" && options.role !== "transport");
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      if (!materialNeedsClone(sourceMaterial, options.role, Boolean(options.nightLighting))) return sourceMaterial;
      const existing = materialClones.get(sourceMaterial);
      if (existing) return existing;
      const clone = sourceMaterial.clone();
      materialClones.set(sourceMaterial, clone);
      if (clone instanceof THREE.MeshStandardMaterial) {
        if (options.role === "buildings" && options.tier !== "efficiency") patchBuildingMaterial(clone, uniforms);
        else if (options.role === "terrain") patchTerrainMaterial(clone);
        else if (options.role === "vegetation" && options.tier !== "efficiency" && VEGETATION_MATERIAL.test(clone.name)) patchVegetationMaterial(clone, uniforms);
        if ((options.nightLighting || options.role === "nanjing-eye") && options.role !== "buildings") tuneNightMaterial(clone, uniforms);
      }
      return clone;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
    if (materials.some((material) => LIGHT_MATERIAL.test(material.name))) emissiveObjects.push(object);
  });

  return {
    scene,
    uniforms,
    emissiveObjects,
    dispose: () => materialClones.forEach((material) => material.dispose()),
  };
}
