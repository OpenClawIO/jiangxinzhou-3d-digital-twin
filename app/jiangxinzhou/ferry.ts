import type { GeoPoint, LocalizedName } from "./mapGeometry";
import { ferryDataGenerated } from "./ferryData.generated.ts";

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
  publishedWindow: { start: string; end: string };
  serviceBoundary: {
    firstDeparture: string;
    lastMianhuadiDeparture: string;
    finalReturnDeparture: string;
    serviceEnd: string;
  };
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
  placement: FerryTerminalPlacement;
  confidence: "verified" | "triangulated" | "estimated";
};

export type FerryTerminalPlacement = {
  terminalId: FerryTerminalId;
  waterAnchor: GeoPoint;
  landEntranceAnchor: GeoPoint;
  structureAnchor: GeoPoint;
  headingDeg: number;
  /** Local scene metres: east, south. */
  berthOffsetM: [number, number];
  /** Width, depth and height used for close camera framing. */
  cameraBoundsM: [number, number, number];
  sourceAgreement: string;
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

type FerryLeg = {
  origin: FerryTerminalId;
  destination: FerryTerminalId;
  departure: string;
  timestamp: number;
  arrivalTimestamp: number;
};

export const ferrySchedule: FerryScheduleProfile = {
  lineId: ferryDataGenerated.schedule.lineId,
  timezone: ferryDataGenerated.schedule.timezone,
  publishedWindow: { ...ferryDataGenerated.schedule.publishedWindow },
  serviceBoundary: { ...ferryDataGenerated.schedule.serviceBoundary },
  crossingDurationMin: ferryDataGenerated.schedule.crossingDurationMin,
  sourceStatus: ferryDataGenerated.schedule.sourceStatus,
  departures: {
    qigan: [...ferryDataGenerated.schedule.departures.qigan],
    mianhuadi: [...ferryDataGenerated.schedule.departures.mianhuadi],
  },
};

export const ferryRoute = {
  id: ferryDataGenerated.route.id,
  coordinates: ferryDataGenerated.route.coordinates.map((coordinate) => [...coordinate] as GeoPoint),
  measuredGeometryLengthM: ferryDataGenerated.route.measuredGeometryLengthM,
  lengthStatus: ferryDataGenerated.route.lengthStatus,
  osmWayId: ferryDataGenerated.route.osmWayId,
};
export const ferryRoutePoints = ferryRoute.coordinates;
export const ferryTerminals: FerryTerminalProfile[] = ferryDataGenerated.terminals.map((terminal) => ({
  id: terminal.id,
  name: { ...terminal.name },
  coordinate: [...terminal.coordinate] as GeoPoint,
  bank: terminal.bank,
  modelLod1: terminal.modelLod1,
  modelLod2: terminal.modelLod2,
  placement: {
    terminalId: terminal.id,
    waterAnchor: [...terminal.placement.waterAnchor] as GeoPoint,
    landEntranceAnchor: [...terminal.placement.landEntranceAnchor] as GeoPoint,
    structureAnchor: [...terminal.placement.structureAnchor] as GeoPoint,
    headingDeg: terminal.placement.headingDeg,
    berthOffsetM: [...terminal.placement.berthOffsetM] as [number, number],
    cameraBoundsM: [...terminal.placement.cameraBoundsM] as [number, number, number],
    sourceAgreement: terminal.placement.sourceAgreement,
    confidence: terminal.confidence,
  },
  confidence: terminal.confidence,
}));

export const ferryTerminalById = Object.fromEntries(ferryTerminals.map((terminal) => [terminal.id, terminal])) as Record<FerryTerminalId, FerryTerminalProfile>;

export function ferryBerthPoint(terminalId: FerryTerminalId, height = 3.4): [number, number, number] {
  const terminal = ferryTerminalById[terminalId];
  const [longitude, latitude] = terminal.placement.waterAnchor;
  const [originLongitude, originLatitude] = ferryDataGenerated.projection.origin;
  const east = (longitude - originLongitude) * ferryDataGenerated.projection.metersPerDegreeLongitude;
  const south = -(latitude - originLatitude) * ferryDataGenerated.projection.metersPerDegreeLatitude;
  return [east + terminal.placement.berthOffsetM[0], height, south + terminal.placement.berthOffsetM[1]];
}

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

function terminalForOrigin(origin: FerryOrigin): FerryTerminalId {
  return origin === "qigan" ? "qigan-pier" : "mianhuadi-pier";
}

function oppositeTerminal(id: FerryTerminalId): FerryTerminalId {
  return id === "qigan-pier" ? "mianhuadi-pier" : "qigan-pier";
}

function ferryLegsForDay(timestamp: number, dayOffset = 0): FerryLeg[] {
  const crossingMs = ferrySchedule.crossingDurationMin * MINUTE_MS;
  return (Object.entries(ferrySchedule.departures) as [FerryOrigin, string[]][])
    .flatMap(([origin, departures]) => departures.map((departure) => {
      const originTerminal = terminalForOrigin(origin);
      const departureTimestamp = scheduleTimestamp(timestamp, departure, dayOffset);
      return {
        origin: originTerminal,
        destination: oppositeTerminal(originTerminal),
        departure,
        timestamp: departureTimestamp,
        arrivalTimestamp: departureTimestamp + crossingMs,
      };
    }))
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function ferryServiceState(timestamp: number): "running" | "not-running" {
  const serviceStart = scheduleTimestamp(timestamp, ferrySchedule.serviceBoundary.firstDeparture);
  const serviceEnd = scheduleTimestamp(timestamp, ferrySchedule.serviceBoundary.serviceEnd);
  return timestamp >= serviceStart && timestamp < serviceEnd ? "running" : "not-running";
}

export function nextFerryDeparture(timestamp: number, terminal?: FerryTerminalId) {
  const candidates = [...ferryLegsForDay(timestamp), ...ferryLegsForDay(timestamp, 1)];
  const next = candidates.find((leg) => leg.timestamp >= timestamp && (!terminal || leg.origin === terminal));
  return next ? { origin: next.origin, departure: next.departure, timestamp: next.timestamp } : null;
}

export function activeFerryLeg(timestamp: number) {
  const leg = ferryLegsForDay(timestamp).find((candidate) => timestamp >= candidate.timestamp && timestamp < candidate.arrivalTimestamp);
  if (!leg) return null;
  return {
    origin: leg.origin,
    destination: leg.destination,
    departure: leg.departure,
    progress: (timestamp - leg.timestamp) / (leg.arrivalTimestamp - leg.timestamp),
  };
}

function mooredTerminalAt(timestamp: number): FerryTerminalId {
  let terminal: FerryTerminalId = "mianhuadi-pier";
  for (const leg of ferryLegsForDay(timestamp)) {
    if (timestamp < leg.timestamp) return terminal;
    if (timestamp < leg.arrivalTimestamp) return leg.origin;
    terminal = leg.destination;
  }
  return terminal;
}

export function ferryCruiseAt(timestamp: number, suspended = false): FerryCruiseSnapshot {
  const leg = activeFerryLeg(timestamp);
  const mooredAt = leg?.origin ?? mooredTerminalAt(timestamp);
  if (suspended) {
    return {
      state: "suspended",
      progress: mooredAt === "qigan-pier" ? 0 : 0.999999,
      origin: mooredAt,
      destination: oppositeTerminal(mooredAt),
    };
  }
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
  return {
    state: mooredAt === "qigan-pier" ? "moored-qigan" : "moored-mianhuadi",
    progress: mooredAt === "qigan-pier" ? 0 : 0.999999,
    origin: mooredAt,
    destination: oppositeTerminal(mooredAt),
    nextDeparture: nextFerryDeparture(timestamp, mooredAt) ?? undefined,
  };
}

export function ferryAssetUrl(terminal: FerryTerminalProfile, detailed: boolean): string {
  return detailed ? terminal.modelLod2 : terminal.modelLod1;
}
