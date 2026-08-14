import type { GeoPoint, LocalizedName } from "./mapGeometry";

export type FerryTerminalId = "qigan-pier" | "mianhuadi-pier";
export type FerryOrigin = "qigan" | "mianhuadi";
export type FerryCruiseState =
  | "moored-qigan"
  | "departing-qigan"
  | "crossing-to-mianhuadi"
  | "moored-mianhuadi"
  | "departing-mianhuadi"
  | "crossing-to-qigan"
  | "suspended";

export type FerryScheduleProfile = {
  lineId: "ferry-qigan";
  timezone: "Asia/Shanghai";
  operatingWindow: { start: string; end: string };
  departures: { qigan: string[]; mianhuadi: string[] };
  crossingDurationMin: number;
  sourceStatus: "published" | "simulated" | "same-day-notice";
};

export type FerryTerminalProfile = {
  id: FerryTerminalId;
  name: LocalizedName;
  coordinate: GeoPoint;
  bank: string;
  modelLod1: string;
  modelLod2: string;
  confidence: "verified" | "triangulated" | "estimated";
};

export type FerryCruiseSnapshot = {
  state: FerryCruiseState;
  progress: number;
  origin: FerryTerminalId;
  destination: FerryTerminalId;
  departure?: string;
  nextDeparture?: { origin: FerryTerminalId; departure: string; timestamp: number };
};

export const ferrySchedule: FerryScheduleProfile = {
  lineId: "ferry-qigan",
  timezone: "Asia/Shanghai",
  operatingWindow: { start: "07:00", end: "18:00" },
  crossingDurationMin: 5,
  sourceStatus: "published",
  departures: {
    qigan: ["07:10", "07:40", "08:10", "08:40", "09:10", "12:10", "17:10", "17:40", "18:10"],
    mianhuadi: ["07:00", "07:30", "08:00", "08:30", "09:00", "12:00", "17:00", "17:30", "18:00"],
  },
};

export const ferryRoute = {
  id: "ferry-qigan",
  coordinates: [
    [118.6975913, 32.009866],
    [118.6987921, 32.0093063],
    [118.6999968, 32.0087366],
  ] as GeoPoint[],
  measuredGeometryLengthM: 260,
  officialLengthM: 800,
  lengthStatus: "conflict" as const,
};
export const ferryRoutePoints = ferryRoute.coordinates;
export const ferryTerminals: FerryTerminalProfile[] = [
  {
    id: "qigan-pier",
    name: { zh: "旗杆渡口", en: "Qigan Ferry Pier" },
    coordinate: [118.6975913, 32.009866],
    bank: "jiangxinzhou",
    modelLod1: "/models/jiangxinzhou-v2/ferry-qigan-pier-lod1.glb",
    modelLod2: "/models/jiangxinzhou-v2/ferry-qigan-pier-lod2.glb",
    confidence: "triangulated",
  },
  {
    id: "mianhuadi-pier",
    name: { zh: "棉花堤渡口", en: "Mianhuadi Ferry Pier" },
    coordinate: [118.6999968, 32.0087366],
    bank: "south-bank",
    modelLod1: "/models/jiangxinzhou-v2/ferry-mianhuadi-pier-lod1.glb",
    modelLod2: "/models/jiangxinzhou-v2/ferry-mianhuadi-pier-lod2.glb",
    confidence: "triangulated",
  },
];

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NANJING_OFFSET_MS = 8 * 60 * MINUTE_MS;

function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function nanjingMinutes(timestamp: number): number {
  const value = Math.floor((timestamp + NANJING_OFFSET_MS) / MINUTE_MS) % (DAY_MS / MINUTE_MS);
  return value < 0 ? value + DAY_MS / MINUTE_MS : value;
}

function dayTimestamp(timestamp: number): number {
  return Math.floor((timestamp + NANJING_OFFSET_MS) / DAY_MS) * DAY_MS - NANJING_OFFSET_MS;
}

export function scheduleTimestamp(timestamp: number, departure: string, dayOffset = 0): number {
  return dayTimestamp(timestamp) + dayOffset * DAY_MS + clockMinutes(departure) * MINUTE_MS;
}

export function ferryServiceState(timestamp: number): "running" | "not-running" {
  const minute = nanjingMinutes(timestamp);
  return minute >= clockMinutes(ferrySchedule.operatingWindow.start) && minute <= clockMinutes(ferrySchedule.operatingWindow.end)
    ? "running"
    : "not-running";
}

function terminalForOrigin(origin: FerryOrigin): FerryTerminalId {
  return origin === "qigan" ? "qigan-pier" : "mianhuadi-pier";
}

function oppositeTerminal(id: FerryTerminalId): FerryTerminalId {
  return id === "qigan-pier" ? "mianhuadi-pier" : "qigan-pier";
}

export function nextFerryDeparture(timestamp: number, terminal: FerryTerminalId = "qigan-pier") {
  const origin: FerryOrigin = terminal === "qigan-pier" ? "qigan" : "mianhuadi";
  const minute = nanjingMinutes(timestamp);
  const departures = ferrySchedule.departures[origin];
  const sameDay = departures.find((value) => clockMinutes(value) >= minute);
  if (sameDay) return { origin: terminalForOrigin(origin), departure: sameDay, timestamp: scheduleTimestamp(timestamp, sameDay) };
  const tomorrow = departures[0];
  return tomorrow ? { origin: terminalForOrigin(origin), departure: tomorrow, timestamp: scheduleTimestamp(timestamp, tomorrow, 1) } : null;
}

export function activeFerryLeg(timestamp: number) {
  const minute = nanjingMinutes(timestamp);
  for (const origin of ["qigan", "mianhuadi"] as const) {
    for (const departure of ferrySchedule.departures[origin]) {
      const start = clockMinutes(departure);
      const elapsed = minute - start;
      if (elapsed >= 0 && elapsed < ferrySchedule.crossingDurationMin) {
        return {
          origin: terminalForOrigin(origin),
          destination: oppositeTerminal(terminalForOrigin(origin)),
          departure,
          progress: elapsed / ferrySchedule.crossingDurationMin,
        };
      }
    }
  }
  return null;
}

export function ferryCruiseAt(timestamp: number, suspended = false): FerryCruiseSnapshot {
  if (suspended) return { state: "suspended", progress: 0, origin: "qigan-pier", destination: "mianhuadi-pier" };
  const leg = activeFerryLeg(timestamp);
  if (leg) {
    const forward = leg.origin === "qigan-pier";
    return {
      state: forward ? "crossing-to-mianhuadi" : "crossing-to-qigan",
      progress: forward ? leg.progress : Math.min(0.999999, 1 - leg.progress),
      origin: leg.origin,
      destination: leg.destination,
      departure: leg.departure,
      nextDeparture: nextFerryDeparture(timestamp, leg.destination) ?? undefined,
    };
  }
  const next = nextFerryDeparture(timestamp);
  const mooredAt = next?.origin ?? "qigan-pier";
  return {
    state: mooredAt === "qigan-pier" ? "moored-qigan" : "moored-mianhuadi",
    progress: mooredAt === "qigan-pier" ? 0 : 0.999999,
    origin: mooredAt,
    destination: oppositeTerminal(mooredAt),
    nextDeparture: next ?? undefined,
  };
}

export function ferryAssetUrl(terminal: FerryTerminalProfile, detailed: boolean): string {
  return detailed ? terminal.modelLod2 : terminal.modelLod1;
}
