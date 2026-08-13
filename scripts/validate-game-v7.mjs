import assert from "node:assert/strict";
import { createLocalGameGateway } from "../app/jiangxinzhou/game/localGateway.ts";
import { gameReducer, initialGameState } from "../app/jiangxinzhou/game/gameState.ts";
import { parseGameMode, parseRoomId } from "../app/jiangxinzhou/game/url.ts";
import { migrateLegacyExploration } from "../app/jiangxinzhou/game/storage.ts";
import { buildWorldSnapshot, moveTowards, simulationTick } from "../app/jiangxinzhou/game/worldSimulation.ts";

assert.equal(parseGameMode("?mode=room&room=test"), "room");
assert.equal(parseGameMode("?mode=invalid"), "solo");
assert.equal(parseRoomId("?room=alpha"), "alpha");
assert.equal(parseRoomId("?room="), undefined);

const first = buildWorldSnapshot({ roomId: "test", serverTimeMs: 1_754_000_123_000, players: [] });
const second = buildWorldSnapshot({ roomId: "test", serverTimeMs: 1_754_000_123_000, players: [] });
assert.deepEqual(first, second, "the same server tick must be deterministic");
assert.equal(first.tick, simulationTick(1_754_000_123_000));

const moved = moveTowards([0, 0], [100, 0], 25);
assert.deepEqual(moved.position, [25, 0]);
assert.equal(moved.arrived, false);
assert.equal(moveTowards([98, 0], [100, 0], 25).arrived, true);

let state = initialGameState("solo");
const profile = { playerId: "p1", displayName: "Tester", color: "#f0bd5a", badges: [], xp: 0, createdAt: 1, lastActiveAt: 1 };
state = gameReducer(state, { type: "hydrate", profile, collection: [], xp: 0, badges: [] });
state = gameReducer(state, { type: "joined", room: { roomId: "solo", mode: "solo", status: "ready", capacity: 32, playerCount: 1 } });
state = gameReducer(state, { type: "command-sent", seq: 1 });
state = gameReducer(state, { type: "command-ack", source: "solo", ack: { seq: 1, accepted: true, tick: 1, completedLandmarkId: 2 } });
assert.equal(state.collection.length, 1);
assert.equal(state.xp, 25);
assert.ok(state.badges.includes("nanjing-eye-observer"));
state = gameReducer(state, { type: "command-sent", seq: 2 });
state = gameReducer(state, { type: "command-ack", source: "solo", ack: { seq: 2, accepted: true, tick: 2, completedLandmarkId: 2 } });
assert.equal(state.collection.length, 1, "duplicate discovery must not reward twice");

const migrated = migrateLegacyExploration({ version: 1, activeExpeditionId: "island-quest", discoveredLandmarkIds: [1, 2, 2, 999], completedExpeditionIds: [], briefingSeen: true });
assert.deepEqual(migrated.collection.map((entry) => entry.landmarkId), [1, 2]);
assert.equal(migrated.version, 2);

const gateway = createLocalGameGateway({ mode: "solo", resolveTarget: (targetId) => targetId === "landmark:1" ? [0, 0] : [100, 0], resolveLandmark: (landmarkId) => landmarkId === 1 ? [0, 0] : undefined });
await gateway.bootstrap();
const room = await gateway.joinRoom();
assert.equal(room.status, "ready");
const accepted = await gateway.sendCommand({ seq: 1, kind: "observe", landmarkId: 1 });
assert.equal(accepted.completedLandmarkId, 1);
const duplicate = await gateway.sendCommand({ seq: 1, kind: "observe", landmarkId: 1 });
assert.equal(duplicate.reason, "duplicate");
await gateway.leaveRoom();

console.log("V7 game validation passed");
