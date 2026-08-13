import { createLocalGameGateway } from "./localGateway.ts";
import { isSupabaseConfigured, createSupabaseGameGateway } from "./supabaseGateway.ts";
import { resolveGamePath, resolveGameTarget, landmarkPosition } from "./worldCatalog.ts";
import type { GameGateway, GameMode } from "./types.ts";
export { parseGameMode, parseRoomId } from "./url.ts";

export function createGameGateway(mode: GameMode, roomId?: string): GameGateway {
  if (mode === "room" && isSupabaseConfigured()) {
    try { return createSupabaseGameGateway({ mode, roomId }); } catch { /* local fallback below */ }
  }
  return createLocalGameGateway({ mode, roomId, resolveTarget: resolveGameTarget, resolveLandmark: landmarkPosition, resolvePath: resolveGamePath });
}
