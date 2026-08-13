import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadProfile, saveProfile } from "./storage.ts";
import { landmarkPosition } from "./worldCatalog.ts";
import type { CommandAck, GameGateway, GameMode, PlayerCommand, PlayerProfile, PlayerState, RoomState, WorldEvent, WorldSnapshot } from "./types.ts";

type SupabaseGatewayOptions = { mode: GameMode; roomId?: string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

function profilePresence(profile: PlayerProfile): PlayerState {
  return { playerId: profile.playerId, displayName: profile.displayName, color: profile.color, position: landmarkPosition(1) ?? [0, 0], heading: 0, status: "idle", badges: profile.badges, lastAcceptedTick: 0 };
}

function flattenPresence(state: Record<string, Array<Record<string, unknown>>>): PlayerState[] {
  return Object.values(state).flatMap((entries) => entries.map((entry) => {
    const position: [number, number] = Array.isArray(entry.position) && entry.position.length === 2 ? [Number(entry.position[0]), Number(entry.position[1])] : [0, 0];
    return {
      playerId: String(entry.playerId ?? "unknown"),
      displayName: String(entry.displayName ?? "Explorer"),
      color: String(entry.color ?? "#f0bd5a"),
      position,
      heading: Number(entry.heading ?? 0),
      routeId: typeof entry.routeId === "string" ? entry.routeId : undefined,
      targetId: typeof entry.targetId === "string" ? entry.targetId : undefined,
      status: entry.status === "moving" || entry.status === "observing" ? entry.status : "idle",
      badges: Array.isArray(entry.badges) ? entry.badges.filter((badge): badge is string => typeof badge === "string") : [],
      lastAcceptedTick: Number(entry.lastAcceptedTick ?? 0),
    } satisfies PlayerState;
  }));
}

export function createSupabaseGameGateway(options: SupabaseGatewayOptions): GameGateway {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const client: SupabaseClient = createClient(supabaseUrl!, supabaseKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  let profile: PlayerProfile | undefined;
  let roomId = options.roomId || "shared-world";
  let channel: ReturnType<SupabaseClient["channel"]> | undefined;
  let currentSnapshot: WorldSnapshot | undefined;
  const snapshotListeners = new Set<(snapshot: WorldSnapshot) => void>();
  const presenceListeners = new Set<(players: PlayerState[]) => void>();
  const eventListeners = new Set<(event: WorldEvent) => void>();

  const emitPresence = () => {
    if (!channel) return;
    const players = flattenPresence(channel.presenceState() as Record<string, Array<Record<string, unknown>>>);
    presenceListeners.forEach((listener) => listener(players));
  };

  const gateway: GameGateway = {
    kind: "supabase",
    bootstrap: async () => {
      const session = await client.auth.getSession();
      let user = session.data.session?.user;
      if (!session.data.session) {
        const result = await client.auth.signInAnonymously();
        if (result.error) throw result.error;
        user = result.data.user ?? undefined;
      }
      if (!user) throw new Error("Supabase anonymous session was not created");
      profile = { ...loadProfile(), playerId: user.id };
      saveProfile(profile);
      return profile;
    },
    joinRoom: async (requestedRoomId) => {
      await gateway.bootstrap();
      roomId = requestedRoomId || roomId;
      channel = client.channel(`jiangxinzhou-room:${roomId}`, { config: { presence: { key: profile!.playerId } } });
      channel
        .on("presence", { event: "sync" }, emitPresence)
        .on("presence", { event: "join" }, emitPresence)
        .on("presence", { event: "leave" }, emitPresence)
        .on("broadcast", { event: "world-snapshot" }, ({ payload }) => {
          if (!payload?.snapshot) return;
          currentSnapshot = payload.snapshot as WorldSnapshot;
          snapshotListeners.forEach((listener) => listener(currentSnapshot!));
        })
        .on("broadcast", { event: "world-event" }, ({ payload }) => {
          if (payload?.event) eventListeners.forEach((listener) => listener(payload.event as WorldEvent));
        });
      const status = await new Promise<string>((resolve) => {
        channel!.subscribe((value) => resolve(value));
      });
      if (status !== "SUBSCRIBED") throw new Error(`Supabase Realtime ${status}`);
      const roomInsert = await client.from("rooms").insert({ id: roomId, owner_id: profile!.playerId, max_players: 32, status: "ready" });
      if (roomInsert.error && roomInsert.error.code !== "23505") throw roomInsert.error;
      const profileInsert = await client.from("player_profiles").upsert({ id: profile!.playerId, display_name: profile!.displayName, color: profile!.color, badges: profile!.badges, xp: profile!.xp, updated_at: new Date().toISOString() });
      if (profileInsert.error) throw profileInsert.error;
      const memberInsert = await client.from("room_members").upsert({ room_id: roomId, player_id: profile!.playerId, last_seen_at: new Date().toISOString() });
      if (memberInsert.error) throw memberInsert.error;
      await channel.track(profilePresence(profile!));
      emitPresence();
      return { roomId, mode: "room", status: "ready", capacity: 32, playerCount: flattenPresence(channel.presenceState() as Record<string, Array<Record<string, unknown>>>).length, snapshot: currentSnapshot } satisfies RoomState;
    },
    sendCommand: async (command: PlayerCommand): Promise<CommandAck> => {
      if (!profile) return { seq: command.seq, accepted: false, tick: Math.floor(Date.now() / 1000), reason: "not-joined" };
      const endpoint = process.env.NEXT_PUBLIC_GAME_COMMAND_URL || "/api/game/command";
      try {
        const session = await client.auth.getSession();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...(session.data.session?.access_token ? { authorization: `Bearer ${session.data.session.access_token}` } : {}) },
          body: JSON.stringify({ roomId, playerId: profile.playerId, command }),
        });
        if (!response.ok) return { seq: command.seq, accepted: false, tick: Math.floor(Date.now() / 1000), reason: "offline", snapshot: currentSnapshot };
        return await response.json() as CommandAck;
      } catch {
        return { seq: command.seq, accepted: false, tick: Math.floor(Date.now() / 1000), reason: "offline", snapshot: currentSnapshot };
      }
    },
    subscribe: (onSnapshot, onPresence, onEvent) => {
      snapshotListeners.add(onSnapshot);
      presenceListeners.add(onPresence);
      eventListeners.add(onEvent);
      if (currentSnapshot) onSnapshot(currentSnapshot);
      emitPresence();
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
      if (channel) await channel.track(profilePresence(profile));
      await client.from("player_profiles").upsert({ id: profile.playerId, display_name: profile.displayName, color: profile.color, updated_at: new Date().toISOString() });
      return profile;
    },
    leaveRoom: async () => {
      if (channel) {
        await channel.untrack();
        await client.removeChannel(channel);
      }
      channel = undefined;
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
