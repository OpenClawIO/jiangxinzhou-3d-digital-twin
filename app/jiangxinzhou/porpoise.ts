import type { Point3 } from "./mapGeometry";

export type PorpoiseZoneId = "yangtze-main-channel" | "jiajiang";

export type PorpoiseAgent = {
  id: string;
  zoneId: PorpoiseZoneId;
  phase: number;
  speedMps: number;
  scale: number;
  cycleMs: number;
};

export type PorpoiseMotionState = "submerged" | "rising" | "surfaced" | "diving";

export type PorpoiseMotion = {
  state: PorpoiseMotionState;
  emergence: number;
  progress: number;
  pitch: number;
  roll: number;
};

export const PORPOISE_WATERLINE_Y = -18;
export const PORPOISE_AGENTS: readonly PorpoiseAgent[] = [
  { id: "yangtze-porpoise-01", zoneId: "yangtze-main-channel", phase: 0.08, speedMps: 2.6, scale: 1.02, cycleMs: 13_000 },
  { id: "yangtze-porpoise-02", zoneId: "yangtze-main-channel", phase: 0.41, speedMps: 2.2, scale: 0.92, cycleMs: 16_000 },
  { id: "yangtze-porpoise-03", zoneId: "yangtze-main-channel", phase: 0.73, speedMps: 2.9, scale: 1.08, cycleMs: 18_000 },
  { id: "jiajiang-porpoise-01", zoneId: "jiajiang", phase: 0.21, speedMps: 2.4, scale: 0.98, cycleMs: 12_000 },
  { id: "jiajiang-porpoise-02", zoneId: "jiajiang", phase: 0.54, speedMps: 2.8, scale: 1.06, cycleMs: 15_000 },
  { id: "jiajiang-porpoise-03", zoneId: "jiajiang", phase: 0.84, speedMps: 2.1, scale: 0.9, cycleMs: 17_000 },
];

const RISE_START = 0.78;
const SURFACE_START = 0.84;
const DIVE_START = 0.93;

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function normalizedCycle(agent: PorpoiseAgent, elapsedMs: number): number {
  const phase = ((elapsedMs / agent.cycleMs) + agent.phase) % 1;
  return phase < 0 ? phase + 1 : phase;
}

export function motionFor(agent: PorpoiseAgent, elapsedMs: number, pathLengthM = 1): PorpoiseMotion {
  const cycle = normalizedCycle(agent, elapsedMs);
  let state: PorpoiseMotionState = "submerged";
  let emergence = 0;
  if (cycle >= RISE_START && cycle < SURFACE_START) {
    state = "rising";
    emergence = smoothstep((cycle - RISE_START) / (SURFACE_START - RISE_START));
  } else if (cycle >= SURFACE_START && cycle < DIVE_START) {
    state = "surfaced";
    emergence = 1;
  } else if (cycle >= DIVE_START) {
    state = "diving";
    emergence = 1 - smoothstep((cycle - DIVE_START) / (1 - DIVE_START));
  }
  const distanceM = (elapsedMs / 1000) * agent.speedMps;
  const progress = ((distanceM / Math.max(1, pathLengthM)) + agent.phase) % 1;
  return {
    state,
    emergence,
    progress: progress < 0 ? progress + 1 : progress,
    pitch: Math.sin(elapsedMs / 620 + agent.phase * 11) * 0.045 + emergence * 0.08,
    roll: Math.sin(elapsedMs / 790 + agent.phase * 7) * 0.035,
  };
}

export function pointAtPolyline(points: Point3[], progress: number): { point: Point3; tangent: Point3 } {
  if (points.length === 0) return { point: [0, PORPOISE_WATERLINE_Y, 0], tangent: [1, 0, 0] };
  if (points.length === 1) return { point: points[0], tangent: [1, 0, 0] };
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    lengths.push(lengths[index - 1] + Math.hypot(current[0] - previous[0], current[2] - previous[2]));
  }
  const total = Math.max(0.001, lengths.at(-1) ?? 0);
  const target = ((progress % 1) + 1) % 1 * total;
  const segment = Math.max(0, Math.min(points.length - 2, lengths.findIndex((length) => length >= target) - 1));
  const start = points[segment];
  const end = points[segment + 1];
  const segmentLength = Math.max(0.001, lengths[segment + 1] - lengths[segment]);
  const local = (target - lengths[segment]) / segmentLength;
  const tangentLength = Math.hypot(end[0] - start[0], end[2] - start[2]) || 1;
  return {
    point: [
      start[0] + (end[0] - start[0]) * local,
      start[1],
      start[2] + (end[2] - start[2]) * local,
    ],
    tangent: [(end[0] - start[0]) / tangentLength, 0, (end[2] - start[2]) / tangentLength],
  };
}

export function polylineLengthM(points: Point3[]): number {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(
    point[0] - points[index][0],
    point[2] - points[index][2],
  ), 0);
}
