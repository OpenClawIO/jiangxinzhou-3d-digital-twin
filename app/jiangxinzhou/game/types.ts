import type { LocalizedText } from "../locales.ts";

export type GameMode = "solo" | "room";
export type RoomStatus = "joining" | "ready" | "reconnecting" | "full" | "offline";
export type PlayerStatus = "idle" | "moving" | "observing";
export type WorldWeather = "clear" | "cloudy" | "rain";

export type PlayerState = {
  playerId: string;
  displayName: string;
  color: string;
  position: [number, number];
  heading: number;
  routeId?: string;
  targetId?: string;
  status: PlayerStatus;
  badges: string[];
  lastAcceptedTick: number;
};

export type WorldEvent = {
  id: string;
  type: "celestial" | "transit" | "landmark" | "team";
  startsAt: number;
  endsAt: number;
  payload: Record<string, unknown>;
  version: number;
};

export type TeamObjective = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  kind: "discover-landmarks" | "complete-route" | "ride-transit";
  targetCount: number;
  progress: number;
  completed: boolean;
  landmarkIds?: number[];
  routeId?: string;
};

export type WorldSnapshot = {
  roomId: string;
  tick: number;
  serverTimeMs: number;
  weather: WorldWeather;
  trafficLevel: number;
  transitPhase: Record<string, number>;
  activeEvents: WorldEvent[];
  players: PlayerState[];
  teamObjectives: TeamObjective[];
  version: number;
};

export type PlayerCommand =
  | { seq: number; kind: "move-to"; targetId: string; routeId?: string }
  | { seq: number; kind: "observe"; landmarkId: number }
  | { seq: number; kind: "cancel-move" }
  | { seq: number; kind: "ping" };

export type PlayerCommandInput =
  | { kind: "move-to"; targetId: string; routeId?: string }
  | { kind: "observe"; landmarkId: number }
  | { kind: "cancel-move" }
  | { kind: "ping" };

export type CommandAck = {
  seq: number;
  accepted: boolean;
  tick: number;
  reason?: "not-joined" | "unknown-target" | "too-far" | "duplicate" | "full" | "offline" | "invalid";
  completedLandmarkId?: number;
  snapshot?: WorldSnapshot;
};

export type PlayerProfile = {
  playerId: string;
  displayName: string;
  color: string;
  badges: string[];
  xp: number;
  createdAt: number;
  lastActiveAt: number;
};

export type RoomState = {
  roomId: string;
  mode: GameMode;
  status: RoomStatus;
  capacity: number;
  playerCount: number;
  snapshot?: WorldSnapshot;
};

export type CollectionEntry = {
  landmarkId: number;
  discoveredAt: number;
  evidenceLevel: "verified" | "triangulated" | "estimated";
  source: "solo" | "room";
};

export type GameGateway = {
  readonly kind: "local" | "supabase";
  bootstrap: () => Promise<PlayerProfile>;
  joinRoom: (roomId?: string) => Promise<RoomState>;
  sendCommand: (command: PlayerCommand) => Promise<CommandAck>;
  subscribe: (
    onSnapshot: (snapshot: WorldSnapshot) => void,
    onPresence: (players: PlayerState[]) => void,
    onEvent: (event: WorldEvent) => void,
  ) => () => void;
  updateProfile?: (patch: Pick<PlayerProfile, "displayName" | "color">) => Promise<PlayerProfile>;
  leaveRoom: () => Promise<void>;
  dispose?: () => void;
};

export type GameTargetResolver = (targetId: string) => [number, number] | undefined;
export type LandmarkTargetResolver = (landmarkId: number) => [number, number] | undefined;
export type GamePathResolver = (from: [number, number], to: [number, number]) => [number, number][] | undefined;
