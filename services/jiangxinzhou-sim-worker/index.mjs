import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by the authoritative worker.");
  process.exitCode = 1;
}

const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const runtime = JSON.parse(readFileSync(new URL("../../data/jiangxinzhou-v2/runtime.json", import.meta.url), "utf8"));
const origin = runtime.manifest.origin;
const projection = runtime.manifest.projection;
const anchorIds = ["qingao-forest-park", "nanjing-eye", "dolphin-center", "xiaokenting-lighthouse", "e3-park", "water-center", "chapel", "riverwalk", "pink-field", "seasonal-garden", "rocho-cafe"];
const anchors = new Map(runtime.landmarks.features.map((feature) => [feature.id, feature.geometry.coordinates]));
const rooms = new Map();
const channels = new Map();

function project([longitude, latitude]) {
  return [(longitude - origin[0]) * projection.metersPerDegreeLongitude, -(latitude - origin[1]) * projection.metersPerDegreeLatitude];
}

function targetPosition(targetId) {
  if (!targetId?.startsWith("landmark:")) return undefined;
  const id = Number(targetId.slice("landmark:".length));
  const anchor = anchors.get(anchorIds[id - 1]);
  return anchor ? project(anchor) : undefined;
}

function deterministic(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 10000) / 10000;
}

function tickFor(now) { return Math.floor(now / 1000); }

function roomState(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { players: new Map(), sequences: new Map(), objectives: { progress: 0, completed: false } };
    rooms.set(roomId, room);
  }
  return room;
}

function ensurePlayer(room, playerId) {
  let player = room.players.get(playerId);
  if (!player) {
    player = { playerId, displayName: "Explorer", color: "#f0bd5a", position: targetPosition("landmark:1") || [0, 0], heading: 0, status: "idle", badges: [], lastAcceptedTick: 0 };
    room.players.set(playerId, player);
  }
  return player;
}

function snapshot(roomId, room, now) {
  const tick = tickFor(now);
  const hour = ((tick % 86400) + 86400) % 86400 / 3600;
  const traffic = Math.min(1, Math.max(0, 0.18 + Math.exp(-((hour - 8) ** 2) / 2.4) * 0.42 + Math.exp(-((hour - 18) ** 2) / 3.2) * 0.52 + (deterministic(`traffic:${Math.floor(tick / 60)}`) - 0.5) * 0.08));
  return {
    roomId,
    tick,
    serverTimeMs: now,
    weather: deterministic(`weather:${Math.floor(tick / 900)}`) > 0.89 ? "rain" : deterministic(`weather:${Math.floor(tick / 900)}`) > 0.58 ? "cloudy" : "clear",
    trafficLevel: traffic,
    transitPhase: {},
    activeEvents: [],
    players: [...room.players.values()].map((player) => ({ ...player, position: [...player.position], badges: [...player.badges] })),
    teamObjectives: [{ id: "team-landmark-scan", title: { zh: "共同发现 · 江心洲地标", en: "Shared discovery · Jiangxinzhou landmarks" }, description: { zh: "房间成员合计记录 6 个地标。", en: "Log six landmarks together." }, kind: "discover-landmarks", targetCount: 6, progress: room.objectives.progress, completed: room.objectives.completed, landmarkIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    version: 7,
  };
}

async function broadcastSnapshot(roomId, room, now = Date.now()) {
  if (!admin) return;
  let channel = channels.get(roomId);
  if (!channel) {
    channel = admin.channel(`jiangxinzhou-room:${roomId}`);
    await new Promise((resolve, reject) => channel.subscribe((status) => status === "SUBSCRIBED" ? resolve() : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? reject(new Error(status)) : undefined));
    channels.set(roomId, channel);
  }
  await channel.send({ type: "broadcast", event: "world-snapshot", payload: { snapshot: snapshot(roomId, room, now) } });
}

async function authenticate(request) {
  if (!admin) return undefined;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return undefined;
  const { data, error } = await admin.auth.getUser(token);
  return error ? undefined : data.user;
}

async function ensureRoomMember(roomId, playerId) {
  if (!admin) return false;
  const { data } = await admin.from("room_members").select("player_id").eq("room_id", roomId).eq("player_id", playerId).maybeSingle();
  return Boolean(data);
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function command(request, response) {
  try {
    const user = await authenticate(request);
    const body = await parseBody(request);
    const roomId = String(body.roomId || "").slice(0, 48);
    const playerId = String(body.playerId || "");
    const playerCommand = body.command;
    if (!user || user.id !== playerId || !roomId || !playerCommand) return sendJson(response, 401, { error: "unauthorized" });
    if (!(await ensureRoomMember(roomId, playerId))) return sendJson(response, 403, { error: "room membership required" });
    const room = roomState(roomId);
    const player = ensurePlayer(room, playerId);
    const { data: profile } = await admin.from("player_profiles").select("display_name, color, badges").eq("id", playerId).maybeSingle();
    if (profile) {
      player.displayName = profile.display_name;
      player.color = profile.color;
      player.badges = Array.isArray(profile.badges) ? profile.badges : [];
    }
    const now = Date.now();
    const tick = tickFor(now);
    const previousSeq = room.sequences.get(playerId) || 0;
    if (!Number.isInteger(playerCommand.seq) || playerCommand.seq <= previousSeq) return sendJson(response, 200, { seq: playerCommand.seq, accepted: false, tick, reason: "duplicate", snapshot: snapshot(roomId, room, now) });
    room.sequences.set(playerId, playerCommand.seq);
    if (playerCommand.kind === "move-to") {
      if (!targetPosition(playerCommand.targetId)) return sendJson(response, 200, { seq: playerCommand.seq, accepted: false, tick, reason: "unknown-target" });
      player.targetId = playerCommand.targetId;
      player.routeId = playerCommand.routeId;
      player.status = "moving";
      player.lastAcceptedTick = tick;
      await broadcastSnapshot(roomId, room, now);
      return sendJson(response, 200, { seq: playerCommand.seq, accepted: true, tick, snapshot: snapshot(roomId, room, now) });
    }
    if (playerCommand.kind === "cancel-move") {
      player.targetId = undefined;
      player.status = "idle";
      player.lastAcceptedTick = tick;
      await broadcastSnapshot(roomId, room, now);
      return sendJson(response, 200, { seq: playerCommand.seq, accepted: true, tick, snapshot: snapshot(roomId, room, now) });
    }
    if (playerCommand.kind === "observe") {
      const target = targetPosition(`landmark:${playerCommand.landmarkId}`);
      if (!target) return sendJson(response, 200, { seq: playerCommand.seq, accepted: false, tick, reason: "unknown-target" });
      if (Math.hypot(target[0] - player.position[0], target[1] - player.position[1]) > 70) return sendJson(response, 200, { seq: playerCommand.seq, accepted: false, tick, reason: "too-far", snapshot: snapshot(roomId, room, now) });
      player.status = "observing";
      room.objectives.progress = Math.min(6, room.objectives.progress + 1);
      room.objectives.completed = room.objectives.progress >= 6;
      await admin.from("player_collections").upsert({ player_id: playerId, landmark_id: playerCommand.landmarkId, evidence_level: "triangulated", source: "room" }, { onConflict: "player_id,landmark_id" });
      if (room.objectives.completed) await admin.from("player_badges").upsert({ player_id: playerId, badge_id: "team-landmark-scan" }, { onConflict: "player_id,badge_id" });
      await admin.from("team_objectives").upsert({ room_id: roomId, objective_id: "team-landmark-scan", progress: room.objectives.progress, target_count: 6, completed: room.objectives.completed, updated_at: new Date().toISOString() }, { onConflict: "room_id,objective_id" });
      await broadcastSnapshot(roomId, room, now);
      return sendJson(response, 200, { seq: playerCommand.seq, accepted: true, tick, completedLandmarkId: playerCommand.landmarkId, snapshot: snapshot(roomId, room, now) });
    }
    return sendJson(response, 200, { seq: playerCommand.seq, accepted: true, tick, snapshot: snapshot(roomId, room, now) });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "simulation error" });
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return sendJson(response, 204, {});
  if (request.method === "GET" && request.url === "/healthz") return sendJson(response, 200, { ok: Boolean(admin), rooms: rooms.size, tick: tickFor(Date.now()) });
  if (request.method === "POST" && request.url === "/command") return command(request, response);
  return sendJson(response, 404, { error: "not found" });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    for (const player of room.players.values()) {
      const target = player.targetId ? targetPosition(player.targetId) : undefined;
      if (!target || player.status !== "moving") continue;
      const dx = target[0] - player.position[0];
      const dz = target[1] - player.position[1];
      const distance = Math.hypot(dx, dz);
      const step = 55;
      if (distance <= step) {
        player.position = [...target];
        player.status = "observing";
      } else {
        player.position = [player.position[0] + dx / distance * step, player.position[1] + dz / distance * step];
        player.heading = Math.atan2(dx, dz);
      }
      player.lastAcceptedTick = tickFor(now);
    }
    void broadcastSnapshot(roomId, room, now).catch((error) => console.error("broadcast failed", error));
  }
}, 1000);

server.listen(PORT, () => console.log(`Jiangxinzhou simulation worker listening on :${PORT}`));
