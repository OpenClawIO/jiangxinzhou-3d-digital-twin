import type { GameMode } from "./types.ts";

export function parseGameMode(search: string): GameMode {
  const mode = new URLSearchParams(search).get("mode");
  return mode === "room" ? "room" : "solo";
}

export function parseRoomId(search: string): string | undefined {
  const roomId = new URLSearchParams(search).get("room")?.trim();
  return roomId ? roomId.slice(0, 48) : undefined;
}
