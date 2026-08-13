import { anchorPosition, crossings, projectPoint, stopsForTransportLine, transportLines, transportStops } from "../mapGeometry.ts";
import { landmarks } from "../landmarks.ts";
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
