import assert from "node:assert/strict";
import * as THREE from "three";
import { prepareScene } from "../app/jiangxinzhou/render/materials.ts";

const fogUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
assert.ok(fogUniforms.fogColor && fogUniforms.fogNear && fogUniforms.fogFar, "custom fog shaders must register Three.js fog uniforms");

const source = new THREE.Group();
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ name: "Mid-rise pale stone" });
source.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
const prepared = prepareScene(source, { role: "buildings", tier: "balanced", shadows: true });
const meshes = [];
prepared.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
assert.equal(meshes.length, 2);
assert.notEqual(meshes[0].material, material, "patched material must be cloned");
assert.equal(meshes[0].material, meshes[1].material, "shared source material should produce one shared clone");
assert.equal(meshes[0].geometry, geometry, "cached GLTF geometry must stay shared");
assert.equal(meshes[0].castShadow, true);
let disposed = false;
meshes[0].material.addEventListener("dispose", () => { disposed = true; });
prepared.dispose();
assert.equal(disposed, true, "owned material clones must be disposed");

geometry.dispose();
material.dispose();
console.log("Validated shared geometry ownership, single material cloning, shader patching and cleanup.");
