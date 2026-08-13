import type { GeoPoint, TransitMode } from "../mapGeometry.ts";

export type TransitFeedMode = "simulated" | "live" | "stale";
export type TransitOperationalStatus = "running" | "delayed" | "suspended" | "not-running";

export type TransitLineRealtime = {
  lineId: string;
  status: TransitOperationalStatus;
  delaySec: number;
  phase: number;
  vehicleCount: number;
  updatedAt: number;
};

export type TransitVehicleRealtime = {
  vehicleId: string;
  lineId: string;
  mode: TransitMode;
  progress: number;
  position?: GeoPoint;
  headingDeg: number;
  status: TransitOperationalStatus;
  delaySec: number;
  updatedAt: number;
};

export type TransitArrivalRealtime = {
  id: string;
  lineId: string;
  stopId: string;
  predictedAt: number;
  delaySec: number;
  status: TransitOperationalStatus;
  updatedAt: number;
};

export type TransitServiceAlert = {
  id: string;
  lineId?: string;
  severity: "info" | "warning" | "critical";
  title: { zh: string; en: string };
  startsAt: number;
  endsAt: number;
};

export type TransitRealtimeSnapshot = {
  version: 1;
  mode: TransitFeedMode;
  provider: string;
  fetchedAt: number;
  expiresAt: number;
  lines: Record<string, TransitLineRealtime>;
  vehicles: TransitVehicleRealtime[];
  arrivals: TransitArrivalRealtime[];
  alerts: TransitServiceAlert[];
};

/**
 * Small structural inputs keep the deterministic simulator independent from
 * the map JSON module. This makes it usable in the browser, the API route and
 * a plain Node validation script without importing a bundler-only JSON asset.
 */
export type TransitSimulationLine = {
  id: string;
  properties: {
    mode: TransitMode;
    stopIds: string[];
  };
};

export type TransitSimulationStop = {
  id: string;
};

const SNAPSHOT_TTL_MS = 30_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NANJING_OFFSET_MS = 8 * 60 * MINUTE_MS;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function transitUnit(seed: string | number): number {
  const value = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return (Math.imul(value ^ (value >>> 16), 2246822519) >>> 0) / 4_294_967_296;
}

function secondsOfDay(timestamp: number): number {
  const seconds = Math.floor((timestamp + NANJING_OFFSET_MS) / 1000) % (DAY_MS / 1000);
  return seconds < 0 ? seconds + DAY_MS / 1000 : seconds;
}

function serviceActive(mode: TransitMode, timestamp: number): boolean {
  const hour = secondsOfDay(timestamp) / 3600;
  if (mode === "metro") return hour >= 5.9 && hour < 23.95;
  if (mode === "ferry") return hour >= 7 && hour < 19.5;
  if (mode === "cycle") return true;
  if (mode === "tourism") return hour >= 8 && hour < 18.5;
  if (mode === "shuttle") return hour >= 7 && hour < 21;
  return hour >= 5.5 && hour < 22.5;
}

function phaseForLine(lineId: string, index: number, timestamp: number): number {
  const periodMs = 4_800_000 + index * 530_000;
  return ((timestamp % periodMs) / periodMs + transitUnit(`line:${lineId}`)) % 1;
}

function delayForLine(lineId: string, timestamp: number): number {
  const window = Math.floor(timestamp / (5 * MINUTE_MS));
  const signal = transitUnit(`delay:${lineId}:${window}`);
  if (signal > 0.92) return 420;
  if (signal > 0.72) return 180;
  if (signal > 0.46) return 60;
  return 0;
}

function statusForLine(lineId: string, mode: TransitMode, timestamp: number): TransitOperationalStatus {
  if (!serviceActive(mode, timestamp)) return "not-running";
  const delay = delayForLine(lineId, timestamp);
  return delay >= 420 ? "suspended" : delay > 0 ? "delayed" : "running";
}

function activeVehicleCount(mode: TransitMode, status: TransitOperationalStatus): number {
  if (status === "not-running" || status === "suspended") return 0;
  if (mode === "metro") return 2;
  if (mode === "bus" || mode === "shuttle") return 2;
  return 1;
}

export function simulateTransitRealtime(
  timestamp = Date.now(),
  lineCatalog: readonly TransitSimulationLine[] = [],
  stopCatalog: readonly TransitSimulationStop[] = [],
): TransitRealtimeSnapshot {
  const lines: Record<string, TransitLineRealtime> = {};
  const vehicles: TransitVehicleRealtime[] = [];
  const arrivals: TransitArrivalRealtime[] = [];
  const stopsById = new Map(stopCatalog.map((stop) => [stop.id, stop]));

  lineCatalog.forEach((feature, index) => {
    const lineId = feature.id;
    const mode = feature.properties.mode;
    const status = statusForLine(lineId, mode, timestamp);
    const delaySec = delayForLine(lineId, timestamp);
    const phase = phaseForLine(lineId, index, timestamp);
    const vehicleCount = activeVehicleCount(mode, status);
    lines[lineId] = { lineId, status, delaySec, phase, vehicleCount, updatedAt: timestamp };

    for (let vehicleIndex = 0; vehicleIndex < vehicleCount; vehicleIndex += 1) {
      const progress = (phase + vehicleIndex / Math.max(1, vehicleCount) + transitUnit(`vehicle:${lineId}:${vehicleIndex}`) * 0.08) % 1;
      vehicles.push({
        vehicleId: `sim-${lineId}-${vehicleIndex + 1}`,
        lineId,
        mode,
        progress,
        headingDeg: (progress * 360 + transitUnit(`heading:${lineId}`) * 20) % 360,
        status,
        delaySec,
        updatedAt: timestamp,
      });
    }

    if (status === "not-running" || status === "suspended") return;
    const stops = feature.properties.stopIds
      .map((stopId) => stopsById.get(stopId))
      .filter(Boolean);
    stops.slice(0, 4).forEach((stop, stopIndex) => {
      if (!stop) return;
      const baseMinutes = 2 + ((stopIndex * 3 + Math.floor(phase * 10)) % 9);
      arrivals.push({
        id: `sim-arrival-${lineId}-${stop.id}`,
        lineId,
        stopId: stop.id,
        predictedAt: timestamp + (baseMinutes * 60 + delaySec) * 1000,
        delaySec,
        status,
        updatedAt: timestamp,
      });
    });
  });

  return {
    version: 1,
    mode: "simulated",
    provider: "jiangxinzhou-local-simulation",
    fetchedAt: timestamp,
    expiresAt: timestamp + SNAPSHOT_TTL_MS,
    lines,
    vehicles,
    arrivals,
    alerts: [],
  };
}

export function snapshotAgeMs(snapshot: TransitRealtimeSnapshot, now = Date.now()): number {
  return Math.max(0, now - snapshot.fetchedAt);
}

export function isSnapshotStale(snapshot: TransitRealtimeSnapshot, now = Date.now()): boolean {
  return now >= snapshot.expiresAt;
}

export function statusLabel(status: TransitOperationalStatus, language: "zh" | "en"): string {
  const labels: Record<TransitOperationalStatus, { zh: string; en: string }> = {
    running: { zh: "正常运行", en: "Running" },
    delayed: { zh: "晚点", en: "Delayed" },
    suspended: { zh: "暂停服务", en: "Suspended" },
    "not-running": { zh: "非运营时段", en: "Out of service" },
  };
  return labels[status][language];
}

export function formatArrivalCountdown(predictedAt: number, now = Date.now(), language: "zh" | "en" = "zh"): string {
  const minutes = Math.max(0, Math.round((predictedAt - now) / MINUTE_MS));
  if (language === "en") return minutes <= 0 ? "Arriving" : `${minutes} min`;
  return minutes <= 0 ? "即将到站" : `${minutes} 分钟`;
}
