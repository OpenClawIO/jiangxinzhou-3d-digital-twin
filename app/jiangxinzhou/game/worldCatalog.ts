import { anchorPosition, crossings, projectPoint, stopsForTransportLine, transportLines, transportStops } from "../mapGeometry.ts";
import { landmarks } from "../landmarks.ts";
import { roadGraph } from "../roadLayer.ts";
import type { GeoPoint } from "../mapGeometry.ts";
import type { GameTargetResolver, LandmarkTargetResolver } from "./types.ts";

function pointForGeo(point: GeoPoint): [number, number] {
  const [x, , z] = projectPoint(point, 10);
  return [x, z];
}

export const landmarkPosition: LandmarkTargetResolver = (landmarkId) => {
  const landmark = landmarks.find((item) => item.id === landmarkId);
  if (!landmark) return undefined;
  const [x, , z] = anchorPosition(landmark.anchorId, 10);
  return [x, z];
};

export const resolveGameTarget: GameTargetResolver = (targetId) => {
  if (targetId.startsWith("landmark:")) return landmarkPosition(Number(targetId.slice("landmark:".length)));
  if (targetId.startsWith("stop:")) {
    const stop = transportStops.find((item) => item.id === targetId.slice("stop:".length));
    return stop ? pointForGeo(stop.geometry.coordinates) : undefined;
  }
  if (targetId.startsWith("crossing:")) {
    const crossing = crossings.find((item) => item.id === targetId.slice("crossing:".length));
    if (!crossing) return undefined;
    return pointForGeo(crossing.geometry.coordinates[Math.floor(crossing.geometry.coordinates.length / 2)]);
  }
  if (targetId.startsWith("line:")) {
    const line = transportLines.find((item) => item.id === targetId.slice("line:".length));
    const stop = line ? stopsForTransportLine(line.id)[0] : undefined;
    return stop ? pointForGeo(stop.geometry.coordinates) : undefined;
  }
  return undefined;
};

export function targetIdForLandmark(landmarkId: number): string {
  return `landmark:${landmarkId}`;
}

export function targetIdForStop(stopId: string): string {
  return `stop:${stopId}`;
}

const roadNodePositions = new Map(roadGraph.nodes.map((node) => [node.nodeId, pointForGeo(node.coordinate)]));
const roadAdjacency = new Map<string, Array<{ to: string; lengthM: number }>>();
for (const edge of roadGraph.edges) {
  const forward = roadAdjacency.get(edge.fromNodeId) ?? [];
  const backward = roadAdjacency.get(edge.toNodeId) ?? [];
  forward.push({ to: edge.toNodeId, lengthM: edge.lengthM });
  backward.push({ to: edge.fromNodeId, lengthM: edge.lengthM });
  roadAdjacency.set(edge.fromNodeId, forward);
  roadAdjacency.set(edge.toNodeId, backward);
}

function distance2D(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function nearestRoadNode(position: [number, number]): string | undefined {
  let nearest: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [nodeId, nodePosition] of roadNodePositions) {
    const distance = distance2D(position, nodePosition);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = nodeId;
    }
  }
  return nearest;
}

/** Find a deterministic bidirectional path through the shared road graph. */
export function resolveGamePath(from: [number, number], to: [number, number]): [number, number][] | undefined {
  const start = nearestRoadNode(from);
  const goal = nearestRoadNode(to);
  if (!start || !goal) return undefined;
  if (start === goal) return [from, to];
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const open = new Set<string>([start]);
  while (open.size) {
    let current: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of open) {
      const distance = distances.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (distance < best) {
        current = candidate;
        best = distance;
      }
    }
    if (!current) break;
    open.delete(current);
    if (current === goal) break;
    for (const neighbor of roadAdjacency.get(current) ?? []) {
      const nextDistance = best + neighbor.lengthM;
      if (nextDistance < (distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.to, nextDistance);
        previous.set(neighbor.to, current);
        open.add(neighbor.to);
      }
    }
  }
  if (!distances.has(goal)) return undefined;
  const nodePath = [goal];
  while (nodePath[0] !== start) {
    const parent = previous.get(nodePath[0]);
    if (!parent) return undefined;
    nodePath.unshift(parent);
  }
  const path: [number, number][] = [from];
  for (const nodeId of nodePath) {
    const position = roadNodePositions.get(nodeId);
    if (position && distance2D(path.at(-1)!, position) > 0.5) path.push(position);
  }
  if (distance2D(path.at(-1)!, to) > 0.5) path.push(to);
  return path;
}
