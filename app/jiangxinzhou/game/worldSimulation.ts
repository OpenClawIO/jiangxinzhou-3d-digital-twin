import type { PlayerState, TeamObjective, WorldEvent, WorldSnapshot, WorldWeather } from "./types.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const LOCAL_ROOM_CAPACITY = 32;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicUnit(seed: string | number): number {
  const value = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return (Math.imul(value ^ (value >>> 16), 2246822519) >>> 0) / 4294967296;
}

export function simulationTick(serverTimeMs: number): number {
  return Math.floor(serverTimeMs / 1000);
}

export function weatherForTick(tick: number): WorldWeather {
  const phase = Math.floor(tick / (15 * 60));
  const value = deterministicUnit(`weather:${phase}`);
  if (value > 0.89) return "rain";
  if (value > 0.58) return "cloudy";
  return "clear";
}

export function trafficForTick(tick: number): number {
  const secondsOfDay = ((tick % Math.floor(DAY_MS / 1000)) + Math.floor(DAY_MS / 1000)) % Math.floor(DAY_MS / 1000);
  const hour = secondsOfDay / 3600;
  const morning = Math.exp(-((hour - 8) ** 2) / 2.4);
  const evening = Math.exp(-((hour - 18) ** 2) / 3.2);
  const base = 0.18 + morning * 0.42 + evening * 0.52;
  const variation = (deterministicUnit(`traffic:${Math.floor(tick / 60)}`) - 0.5) * 0.08;
  return Math.min(1, Math.max(0, base + variation));
}

export function transitPhaseForTick(tick: number, lineIds: readonly string[]): Record<string, number> {
  return Object.fromEntries(lineIds.map((lineId, index) => {
    const period = 4_800 + index * 530;
    return [lineId, ((tick % period) / period + deterministicUnit(`line:${lineId}`)) % 1];
  }));
}

export function teamObjectivesForSnapshot(previous?: TeamObjective[]): TeamObjective[] {
  const previousDiscoveries = previous?.find((objective) => objective.id === "team-landmark-scan");
  const previousRoute = previous?.find((objective) => objective.id === "team-green-axis");
  return [
    {
      id: "team-landmark-scan",
      title: { zh: "共同发现 · 江心洲地标", en: "Shared discovery · Jiangxinzhou landmarks" },
      description: { zh: "房间成员合计记录 6 个地标，解锁团队观景章。", en: "Log six landmarks together to unlock the team viewing badge." },
      kind: "discover-landmarks",
      targetCount: 6,
      progress: previousDiscoveries?.progress ?? 0,
      completed: previousDiscoveries?.completed ?? false,
      landmarkIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    },
    {
      id: "team-green-axis",
      title: { zh: "一起走完科创绿轴", en: "Walk the innovation green axis" },
      description: { zh: "至少一名成员到达科创绿轴线的目标节点。", en: "Have a room member reach a node on the Innovation Green Axis." },
      kind: "complete-route",
      targetCount: 1,
      progress: previousRoute?.progress ?? 0,
      completed: previousRoute?.completed ?? false,
      routeId: "innovation-axis",
    },
  ];
}

export function worldEventsForTick(tick: number, serverTimeMs: number, objectives: TeamObjective[]): WorldEvent[] {
  const currentDay = Math.floor(serverTimeMs / DAY_MS);
  const secondsOfDay = ((tick % Math.floor(DAY_MS / 1000)) + Math.floor(DAY_MS / 1000)) % Math.floor(DAY_MS / 1000);
  const events: WorldEvent[] = [];
  const dawn = 5 * 3600 + 30 * 60;
  const dusk = 18 * 3600 + 30 * 60;
  if (Math.abs(secondsOfDay - dawn) < 1_800) {
    events.push({ id: `dawn-${currentDay}`, type: "celestial", startsAt: serverTimeMs - 1_800_000, endsAt: serverTimeMs + 1_800_000, payload: { phase: "dawn" }, version: 1 });
  }
  if (Math.abs(secondsOfDay - dusk) < 1_800) {
    events.push({ id: `dusk-${currentDay}`, type: "celestial", startsAt: serverTimeMs - 1_800_000, endsAt: serverTimeMs + 1_800_000, payload: { phase: "dusk" }, version: 1 });
  }
  const activeTeam = objectives.find((objective) => !objective.completed);
  if (activeTeam) events.push({ id: activeTeam.id, type: "team", startsAt: serverTimeMs, endsAt: serverTimeMs + 86_400_000, payload: { progress: activeTeam.progress, targetCount: activeTeam.targetCount }, version: 1 });
  return events;
}

export function buildWorldSnapshot({ roomId, serverTimeMs, players, lineIds = [], objectives }: {
  roomId: string;
  serverTimeMs: number;
  players: PlayerState[];
  lineIds?: readonly string[];
  objectives?: TeamObjective[];
}): WorldSnapshot {
  const tick = simulationTick(serverTimeMs);
  const teamObjectives = teamObjectivesForSnapshot(objectives);
  return {
    roomId,
    tick,
    serverTimeMs,
    weather: weatherForTick(tick),
    trafficLevel: trafficForTick(tick),
    transitPhase: transitPhaseForTick(tick, lineIds),
    activeEvents: worldEventsForTick(tick, serverTimeMs, teamObjectives),
    players: players.map((player) => ({ ...player, position: [...player.position] as [number, number], badges: [...player.badges] })),
    teamObjectives,
    version: 7,
  };
}

export function moveTowards(position: [number, number], target: [number, number], maxDistance: number): { position: [number, number]; heading: number; arrived: boolean } {
  const dx = target[0] - position[0];
  const dz = target[1] - position[1];
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDistance || distance < 0.001) return { position: [...target], heading: Math.atan2(dx, dz), arrived: true };
  const ratio = maxDistance / distance;
  return { position: [position[0] + dx * ratio, position[1] + dz * ratio], heading: Math.atan2(dx, dz), arrived: false };
}
