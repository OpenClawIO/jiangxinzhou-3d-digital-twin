import * as THREE from "three";
import type { Point3 } from "../mapGeometry";

export type RibbonPath = {
  points: Point3[];
  widthM: number;
};

const EPSILON = 0.0001;

function compactPath(points: Point3[]): THREE.Vector3[] {
  const compact: THREE.Vector3[] = [];
  for (const point of points) {
    const next = new THREE.Vector3(...point);
    const previous = compact.at(-1);
    if (!previous || Math.hypot(next.x - previous.x, next.z - previous.z) > EPSILON) compact.push(next);
  }
  return compact;
}

function perpendicular(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return new THREE.Vector3(-dz / length, 0, dx / length);
}

export function buildRibbonGeometry(paths: RibbonPath[], options: { miterLimit?: number; capSegments?: number } = {}): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pathIndices: number[] = [];
  const indices: number[] = [];
  const miterLimit = options.miterLimit ?? 2;
  const capSegments = Math.max(6, options.capSegments ?? 10);

  const pushVertex = (point: THREE.Vector3, u: number, distance: number, pathIndex: number) => {
    positions.push(point.x, point.y, point.z);
    normals.push(0, 1, 0);
    uvs.push(u, distance);
    pathIndices.push(pathIndex);
    return positions.length / 3 - 1;
  };

  const pushRoundCap = (center: THREE.Vector3, radius: number, distance: number, pathIndex: number) => {
    const centerIndex = pushVertex(center, 0.5, distance, pathIndex);
    const firstRing = positions.length / 3;
    for (let index = 0; index <= capSegments; index += 1) {
      const angle = index / capSegments * Math.PI * 2;
      pushVertex(new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius), 0.5, distance, pathIndex);
    }
    for (let index = 0; index < capSegments; index += 1) indices.push(centerIndex, firstRing + index + 1, firstRing + index);
  };

  for (const [pathIndex, path] of paths.entries()) {
    const points = compactPath(path.points);
    if (points.length < 2 || !Number.isFinite(path.widthM) || path.widthM <= 0) continue;
    const halfWidth = path.widthM / 2;
    const cumulative: number[] = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z));
    }
    const firstVertex = positions.length / 3;
    for (let index = 0; index < points.length; index += 1) {
      const previousNormal = index === 0 ? perpendicular(points[0], points[1]) : perpendicular(points[index - 1], points[index]);
      const nextNormal = index === points.length - 1 ? previousNormal.clone() : perpendicular(points[index], points[index + 1]);
      const miter = previousNormal.clone().add(nextNormal);
      if (miter.lengthSq() < EPSILON) miter.copy(nextNormal);
      miter.normalize();
      const denominator = Math.max(0.25, Math.abs(miter.dot(nextNormal)));
      const miterLength = Math.min(halfWidth * miterLimit, halfWidth / denominator);
      const offset = miter.multiplyScalar(miterLength);
      pushVertex(points[index].clone().add(offset), 0, cumulative[index], pathIndex);
      pushVertex(points[index].clone().sub(offset), 1, cumulative[index], pathIndex);
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      const left = firstVertex + index * 2;
      const right = left + 1;
      const nextLeft = left + 2;
      const nextRight = left + 3;
      indices.push(left, nextLeft, right, right, nextLeft, nextRight);
    }
    pushRoundCap(points[0], halfWidth, 0, pathIndex);
    pushRoundCap(points.at(-1)!, halfWidth, cumulative.at(-1)!, pathIndex);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("pathIndex", new THREE.Uint16BufferAttribute(pathIndices, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
