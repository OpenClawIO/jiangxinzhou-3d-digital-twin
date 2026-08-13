import { loadProfile, saveProfile } from "./storage.ts";
import { buildWorldSnapshot, LOCAL_ROOM_CAPACITY, moveTowards, simulationTick, teamObjectivesForSnapshot } from "./worldSimulation.ts";
import type { CommandAck, GameGateway, GameMode, GamePathResolver, GameTargetResolver, LandmarkTargetResolver, PlayerCommand, PlayerProfile, PlayerState, WorldEvent, WorldSnapshot } from "./types.ts";

type LocalGatewayOptions = {
  mode: GameMode;
  roomId?: string;
  resolveTarget: GameTargetResolver;
  resolveLandmark: LandmarkTargetResolver;
  resolvePath?: GamePathResolver;
  lineIds?: readonly string[];
};

type LocalChannelMessage =
  | { type: "presence"; roomId: string; player: PlayerState }
  | { type: "leave"; roomId: string; playerId: string }
  | { type: "snapshot"; roomId: string; snapshot: WorldSnapshot };

const PLAYER_SPEED_MPS = 55;
const OBSERVATION_RADIUS_M = 58;

function clonePlayer(player: PlayerState): PlayerState {
  return { ...player, position: [...player.position] as [number, number], badges: [...player.badges] };
}

function initialPlayer(profile: PlayerProfile, resolveLandmark: LandmarkTargetResolver): PlayerState {
  const position = resolveLandmark(1) ?? [0, 0];
  return { playerId: profile.playerId, displayName: profile.displayName, color: profile.color, position, heading: 0, status: "idle", badges: [...profile.badges], lastAcceptedTick: 0 };
}

export function createLocalGameGateway(options: LocalGatewayOptions): GameGateway {
  let profile: PlayerProfile | undefined;
  let roomId = options.mode === "solo" ? "solo" : options.roomId || "local-open-room";
  let joined = false;
  let localPlayer: PlayerState | undefined;
  let tickTimer: number | undefined;
  let channel: BroadcastChannel | undefined;
  let lastAcceptedSeq = 0;
  let movementPath: [number, number][] = [];
  let movementPathIndex = 0;
  let objectives = teamObjectivesForSnapshot();
  const remotePlayers = new Map<string, PlayerState>();
  let currentSnapshot: WorldSnapshot | undefined;
  const snapshotListeners = new Set<(snapshot: WorldSnapshot) => void>();
  const presenceListeners = new Set<(players: PlayerState[]) => void>();
  const eventListeners = new Set<(event: WorldEvent) => void>();
  const announcedEventIds = new Set<string>();

  const players = () => [localPlayer, ...remotePlayers.values()].filter((player): player is PlayerState => Boolean(player)).map(clonePlayer);

  const publishPresence = () => {
    const visiblePlayers = players();
    presenceListeners.forEach((listener) => listener(visiblePlayers));
  };

  const createSnapshot = (now = Date.now()) => {
    if (!localPlayer) return undefined;
    currentSnapshot = buildWorldSnapshot({ roomId, serverTimeMs: now, players: players(), lineIds: options.lineIds ?? [], objectives });
    objectives = currentSnapshot.teamObjectives;
    snapshotListeners.forEach((listener) => listener(currentSnapshot!));
    currentSnapshot.activeEvents.forEach((event) => {
      if (announcedEventIds.has(event.id)) return;
      announcedEventIds.add(event.id);
      eventListeners.forEach((listener) => listener(event));
    });
    return currentSnapshot;
  };

  const post = (message: LocalChannelMessage) => {
    try { channel?.postMessage(message); } catch { /* BroadcastChannel is optional */ }
  };

  const onChannelMessage = (event: MessageEvent<LocalChannelMessage>) => {
    const message = event.data;
    if (!message || message.roomId !== roomId || !profile) return;
    if (message.type === "presence" && message.player.playerId !== profile.playerId) {
      if (!remotePlayers.has(message.player.playerId) && remotePlayers.size >= LOCAL_ROOM_CAPACITY - 1) return;
      remotePlayers.set(message.player.playerId, clonePlayer(message.player));
      publishPresence();
      createSnapshot();
    } else if (message.type === "leave") {
      remotePlayers.delete(message.playerId);
      publishPresence();
      createSnapshot();
    } else if (message.type === "snapshot" && message.snapshot.players.some((player) => player.playerId === profile?.playerId) === false) {
      message.snapshot.players.forEach((player) => {
        if (player.playerId !== profile?.playerId) remotePlayers.set(player.playerId, clonePlayer(player));
      });
      objectives = message.snapshot.teamObjectives;
      snapshotListeners.forEach((listener) => listener({ ...message.snapshot, players: players() }));
      publishPresence();
    }
  };

  const tick = () => {
    if (!joined || !localPlayer) return;
    if (localPlayer.targetId && localPlayer.status === "moving" && movementPath.length > 1) {
      let position = localPlayer.position;
      let remaining = PLAYER_SPEED_MPS;
      let heading = localPlayer.heading;
      while (remaining > 0 && movementPathIndex < movementPath.length) {
        const next = movementPath[movementPathIndex];
        const segmentDistance = Math.hypot(next[0] - position[0], next[1] - position[1]);
        const moved = moveTowards(position, next, remaining);
        position = moved.position;
        heading = moved.heading;
        if (!moved.arrived) {
          remaining = 0;
        } else {
          movementPathIndex += 1;
          remaining = Math.max(0, remaining - segmentDistance);
        }
      }
      const arrived = movementPathIndex >= movementPath.length;
      localPlayer = { ...localPlayer, position, heading, status: arrived ? "observing" : "moving", lastAcceptedTick: simulationTick(Date.now()) };
      post({ type: "presence", roomId, player: clonePlayer(localPlayer) });
    }
    const snapshot = createSnapshot();
    if (snapshot && options.mode === "room") post({ type: "snapshot", roomId, snapshot });
  };

  const startTick = () => {
    if (tickTimer !== undefined || typeof window === "undefined") return;
    tickTimer = window.setInterval(tick, 1000);
  };

  const gateway: GameGateway = {
    kind: "local",
    bootstrap: async () => {
      profile ??= loadProfile();
      profile = { ...profile, lastActiveAt: Date.now() };
      saveProfile(profile);
      localPlayer ??= initialPlayer(profile, options.resolveLandmark);
      return profile;
    },
    joinRoom: async (requestedRoomId) => {
      await gateway.bootstrap();
      if (requestedRoomId) roomId = requestedRoomId;
      if (options.mode === "solo") roomId = "solo";
      joined = true;
      if (typeof window !== "undefined" && options.mode === "room" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel(`jiangxinzhou-v7:${roomId}`);
        channel.addEventListener("message", onChannelMessage);
      }
      startTick();
      const snapshot = createSnapshot();
      post({ type: "presence", roomId, player: clonePlayer(localPlayer!) });
      publishPresence();
      return { roomId, mode: options.mode, status: "ready", capacity: LOCAL_ROOM_CAPACITY, playerCount: snapshot?.players.length ?? 1, snapshot };
    },
    sendCommand: async (command: PlayerCommand): Promise<CommandAck> => {
      const tickValue = simulationTick(Date.now());
      if (!joined || !localPlayer) return { seq: command.seq, accepted: false, tick: tickValue, reason: "not-joined" };
      if (command.seq <= lastAcceptedSeq) return { seq: command.seq, accepted: false, tick: tickValue, reason: "duplicate", snapshot: currentSnapshot };
      lastAcceptedSeq = command.seq;
      if (command.kind === "move-to") {
        const target = options.resolveTarget(command.targetId);
        if (!target) return { seq: command.seq, accepted: false, tick: tickValue, reason: "unknown-target", snapshot: currentSnapshot };
        movementPath = options.resolvePath?.(localPlayer.position, target) ?? [localPlayer.position, target];
        movementPathIndex = movementPath.length > 1 ? 1 : 0;
        localPlayer = { ...localPlayer, targetId: command.targetId, routeId: command.routeId, status: "moving", lastAcceptedTick: tickValue };
        post({ type: "presence", roomId, player: clonePlayer(localPlayer) });
        const snapshot = createSnapshot();
        return { seq: command.seq, accepted: true, tick: tickValue, snapshot };
      }
      if (command.kind === "cancel-move") {
        movementPath = [];
        movementPathIndex = 0;
        localPlayer = { ...localPlayer, targetId: undefined, status: "idle", lastAcceptedTick: tickValue };
        post({ type: "presence", roomId, player: clonePlayer(localPlayer) });
        return { seq: command.seq, accepted: true, tick: tickValue, snapshot: createSnapshot() };
      }
      if (command.kind === "observe") {
        const position = options.resolveLandmark(command.landmarkId);
        if (!position) return { seq: command.seq, accepted: false, tick: tickValue, reason: "unknown-target", snapshot: currentSnapshot };
        const distance = Math.hypot(position[0] - localPlayer.position[0], position[1] - localPlayer.position[1]);
        if (distance > OBSERVATION_RADIUS_M) return { seq: command.seq, accepted: false, tick: tickValue, reason: "too-far", snapshot: currentSnapshot };
        localPlayer = { ...localPlayer, status: "observing", targetId: `landmark:${command.landmarkId}`, lastAcceptedTick: tickValue };
        movementPath = [];
        movementPathIndex = 0;
        const objective = objectives.find((item) => item.id === "team-landmark-scan");
        if (objective && !objective.completed) {
          objective.progress = Math.min(objective.targetCount, objective.progress + 1);
          objective.completed = objective.progress >= objective.targetCount;
          objectives = objectives.map((item) => item.id === objective.id ? objective : item);
        }
        post({ type: "presence", roomId, player: clonePlayer(localPlayer) });
        return { seq: command.seq, accepted: true, tick: tickValue, completedLandmarkId: command.landmarkId, snapshot: createSnapshot() };
      }
      return { seq: command.seq, accepted: true, tick: tickValue, snapshot: createSnapshot() };
    },
    subscribe: (onSnapshot, onPresence, onEvent) => {
      snapshotListeners.add(onSnapshot);
      presenceListeners.add(onPresence);
      eventListeners.add(onEvent);
      if (currentSnapshot) onSnapshot(currentSnapshot);
      publishPresence();
      return () => {
        snapshotListeners.delete(onSnapshot);
        presenceListeners.delete(onPresence);
        eventListeners.delete(onEvent);
      };
    },
    updateProfile: async (patch) => {
      await gateway.bootstrap();
      profile = { ...profile!, displayName: patch.displayName.trim().slice(0, 24) || profile!.displayName, color: patch.color, lastActiveAt: Date.now() };
      saveProfile(profile);
      localPlayer = { ...localPlayer!, displayName: profile.displayName, color: profile.color };
      post({ type: "presence", roomId, player: clonePlayer(localPlayer) });
      createSnapshot();
      return profile;
    },
    leaveRoom: async () => {
      if (profile) post({ type: "leave", roomId, playerId: profile.playerId });
      joined = false;
      if (tickTimer !== undefined && typeof window !== "undefined") window.clearInterval(tickTimer);
      tickTimer = undefined;
      channel?.close();
      channel = undefined;
      remotePlayers.clear();
      announcedEventIds.clear();
    },
    dispose: () => {
      void gateway.leaveRoom();
      snapshotListeners.clear();
      presenceListeners.clear();
      eventListeners.clear();
    },
  };
  return gateway;
}
