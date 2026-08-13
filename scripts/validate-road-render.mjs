import assert from "node:assert/strict";
import * as THREE from "three";
import { buildRibbonGeometry } from "../app/jiangxinzhou/render/roadGeometry.ts";

const geometry = buildRibbonGeometry([{ points: [[0, 7.5, 0], [100, 7.5, 0]], widthM: 22 }]);
assert.ok(geometry.index && geometry.index.count > 6, "road must be triangulated with round caps");
assert.ok(geometry.getAttribute("uv"), "route distance UVs must exist");
assert.ok(geometry.boundingBox);
assert.ok(Math.abs((geometry.boundingBox.max.z - geometry.boundingBox.min.z) - 22) < 0.01, "major road must retain its 22m width");
const index = geometry.index;
const roadPositions = geometry.getAttribute("position");
const first = new THREE.Vector3().fromBufferAttribute(roadPositions, index.getX(0));
const second = new THREE.Vector3().fromBufferAttribute(roadPositions, index.getX(1));
const third = new THREE.Vector3().fromBufferAttribute(roadPositions, index.getX(2));
const faceNormal = new THREE.Vector3().crossVectors(second.clone().sub(first), third.clone().sub(first));
assert.ok(faceNormal.y > 0, "road triangles must face upward for WebGL back-face culling");

const corner = buildRibbonGeometry([{ points: [[0, 0, 0], [20, 0, 0], [21, 0, 30]], widthM: 6 }], { miterLimit: 2 });
const positions = corner.getAttribute("position");
for (let index = 0; index < positions.count; index += 1) {
  assert.ok(Number.isFinite(positions.getX(index)) && Number.isFinite(positions.getZ(index)), "acute joins must not produce invalid vertices");
}

geometry.dispose();
corner.dispose();
console.log("Validated physical road widths, triangulation, distance UVs and bounded acute joins.");
