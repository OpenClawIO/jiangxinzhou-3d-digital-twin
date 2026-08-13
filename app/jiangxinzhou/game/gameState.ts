import type { CollectionEntry, CommandAck, GameMode, PlayerProfile, PlayerState, RoomState, WorldEvent, WorldSnapshot } from "./types.ts";

export type GameState = {
  mode: GameMode;
  status: RoomState["status"];
  hydrated: boolean;
  profile?: PlayerProfile;
  room?: RoomState;
  snapshot?: WorldSnapshot;
  players: PlayerState[];
  localPlayer?: PlayerState;
  collection: CollectionEntry[];
  xp: number;
  badges: string[];
  pendingCommandCount: number;
  lastCommandSeq: number;
  lastAck?: CommandAck;
  lastCompletedLandmarkId?: number;
  lastEvent?: WorldEvent;
  error?: string;
};

export type GameAction =
  | { type: "hydrate"; profile: PlayerProfile; collection: CollectionEntry[]; xp: number; badges: string[] }
  | { type: "joining"; mode: GameMode }
  | { type: "joined"; room: RoomState }
  | { type: "snapshot"; snapshot: WorldSnapshot }
  | { type: "presence"; players: PlayerState[] }
  | { type: "event"; event: WorldEvent }
  | { type: "command-sent"; seq: number }
  | { type: "command-ack"; ack: CommandAck; source: "solo" | "room" }
  | { type: "profile"; profile: PlayerProfile }
  | { type: "status"; status: RoomState["status"]; error?: string }
  | { type: "leave" }
  | { type: "reset-collection" }
  | { type: "clear-completed" };

export const initialGameState = (mode: GameMode): GameState => ({
  mode,
  status: "joining",
  hydrated: false,
  players: [],
  collection: [],
  xp: 0,
  badges: [],
  pendingCommandCount: 0,
  lastCommandSeq: 0,
});

function collectionWith(entry: CollectionEntry, current: CollectionEntry[]): CollectionEntry[] {
  return current.some((item) => item.landmarkId === entry.landmarkId) ? current : [...current, entry].sort((a, b) => a.landmarkId - b.landmarkId);
}

function badgesWith(landmarkId: number, badges: string[]): string[] {
  const next = new Set(badges);
  next.add("first-discovery");
  if (landmarkId === 2) next.add("nanjing-eye-observer");
  return [...next];
}

function mergePlayers(current: PlayerState[], incoming: PlayerState[], localPlayerId?: string): PlayerState[] {
  const merged = new Map(current.map((player) => [player.playerId, player]));
  incoming.forEach((player) => {
    if (!localPlayerId || player.playerId !== localPlayerId) merged.set(player.playerId, player);
  });
  return [...merged.values()];
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "hydrate":
      return { ...state, hydrated: true, profile: action.profile, collection: action.collection, xp: action.xp, badges: action.badges };
    case "joining":
      return { ...state, mode: action.mode, status: "joining", error: undefined };
    case "joined": {
      const localPlayerId = state.profile?.playerId;
      const players = action.room.snapshot?.players ?? state.players;
      return { ...state, room: action.room, status: action.room.status, snapshot: action.room.snapshot, players, localPlayer: players.find((player) => player.playerId === localPlayerId), error: undefined };
    }
    case "snapshot": {
      const localPlayerId = state.profile?.playerId;
      const localPlayer = action.snapshot.players.find((player) => player.playerId === localPlayerId);
      return { ...state, snapshot: action.snapshot, players: action.snapshot.players, localPlayer, lastEvent: action.snapshot.activeEvents[0] ?? state.lastEvent, room: state.room ? { ...state.room, playerCount: action.snapshot.players.length, snapshot: action.snapshot } : state.room, status: "ready", error: undefined };
    }
    case "presence": {
      const localPlayerId = state.profile?.playerId;
      const players = mergePlayers(state.players, action.players, localPlayerId);
      return { ...state, players, localPlayer: players.find((player) => player.playerId === localPlayerId) };
    }
    case "event":
      return { ...state, lastEvent: action.event };
    case "command-sent":
      return { ...state, lastCommandSeq: Math.max(state.lastCommandSeq, action.seq), pendingCommandCount: state.pendingCommandCount + 1 };
    case "command-ack": {
      const completedLandmarkId = action.ack.accepted ? action.ack.completedLandmarkId : undefined;
      if (!completedLandmarkId) return { ...state, pendingCommandCount: Math.max(0, state.pendingCommandCount - 1), lastAck: action.ack, status: action.ack.reason === "offline" ? "offline" : state.status };
      const entry: CollectionEntry = { landmarkId: completedLandmarkId, discoveredAt: Date.now(), evidenceLevel: "triangulated", source: action.source };
      const alreadyCollected = state.collection.some((item) => item.landmarkId === completedLandmarkId);
      return {
        ...state,
        pendingCommandCount: Math.max(0, state.pendingCommandCount - 1),
        lastAck: action.ack,
        lastCompletedLandmarkId: alreadyCollected ? undefined : completedLandmarkId,
        collection: collectionWith(entry, state.collection),
        xp: alreadyCollected ? state.xp : state.xp + 25,
        badges: alreadyCollected ? state.badges : badgesWith(completedLandmarkId, state.badges),
      };
    }
    case "profile":
      return { ...state, profile: action.profile };
    case "status":
      return { ...state, status: action.status, error: action.error };
    case "leave":
      return { ...state, status: "offline", room: undefined, snapshot: undefined, players: state.profile ? state.players.filter((player) => player.playerId === state.profile?.playerId) : [], localPlayer: state.profile ? state.players.find((player) => player.playerId === state.profile?.playerId) : undefined };
    case "reset-collection":
      return { ...state, collection: [], xp: 0, badges: [], lastCompletedLandmarkId: undefined };
    case "clear-completed":
      return { ...state, lastCompletedLandmarkId: undefined };
    default:
      return state;
  }
}
