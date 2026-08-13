import { defaultExplorationProgress, normalizeExplorationProgress, type ExplorationProgress } from "../exploration.ts";
import type { CollectionEntry, PlayerProfile } from "./types.ts";

export const GAME_PROFILE_KEY = "jiangxinzhou-game-profile-v2";
export const GAME_COLLECTION_KEY = "jiangxinzhou-game-collection-v2";

type StoredGameState = {
  version: 2;
  collection: CollectionEntry[];
  xp: number;
  badges: string[];
  lastActiveAt: number;
};

function randomId(prefix: string): string {
  const cryptoObject = typeof crypto !== "undefined" ? crypto : undefined;
  const uuid = cryptoObject?.randomUUID?.();
  return `${prefix}-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultProfile(now = Date.now()): PlayerProfile {
  const shortId = randomId("visitor").slice(-4).toUpperCase();
  return {
    playerId: randomId("player"),
    displayName: `游客 ${shortId}`,
    color: "#f0bd5a",
    badges: [],
    xp: 0,
    createdAt: now,
    lastActiveAt: now,
  };
}

export function loadProfile(): PlayerProfile {
  if (typeof window === "undefined") return createDefaultProfile();
  try {
    const stored = window.localStorage.getItem(GAME_PROFILE_KEY);
    if (!stored) return createDefaultProfile();
    const value = JSON.parse(stored) as Partial<PlayerProfile>;
    if (typeof value.playerId !== "string" || typeof value.displayName !== "string" || typeof value.color !== "string") return createDefaultProfile();
    return {
      ...createDefaultProfile(value.createdAt ?? Date.now()),
      ...value,
      badges: Array.isArray(value.badges) ? value.badges.filter((badge): badge is string => typeof badge === "string") : [],
      xp: typeof value.xp === "number" && Number.isFinite(value.xp) ? Math.max(0, value.xp) : 0,
      createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
      lastActiveAt: typeof value.lastActiveAt === "number" ? value.lastActiveAt : Date.now(),
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(GAME_PROFILE_KEY, JSON.stringify(profile)); } catch { /* private mode */ }
}

export function loadStoredGameState(): StoredGameState {
  if (typeof window === "undefined") return { version: 2, collection: [], xp: 0, badges: [], lastActiveAt: Date.now() };
  try {
    const stored = window.localStorage.getItem(GAME_COLLECTION_KEY);
    if (stored) {
      const value = JSON.parse(stored) as Partial<StoredGameState>;
      return {
        version: 2,
        collection: Array.isArray(value.collection) ? value.collection.filter((entry): entry is CollectionEntry => Boolean(entry && typeof entry === "object" && typeof (entry as CollectionEntry).landmarkId === "number")) : [],
        xp: typeof value.xp === "number" ? Math.max(0, value.xp) : 0,
        badges: Array.isArray(value.badges) ? value.badges.filter((badge): badge is string => typeof badge === "string") : [],
        lastActiveAt: typeof value.lastActiveAt === "number" ? value.lastActiveAt : Date.now(),
      };
    }
    return migrateLegacyExploration();
  } catch {
    return { version: 2, collection: [], xp: 0, badges: [], lastActiveAt: Date.now() };
  }
}

export function saveStoredGameState(state: StoredGameState): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(GAME_COLLECTION_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

export function migrateLegacyExploration(value: unknown = undefined): StoredGameState {
  let legacy: ExplorationProgress = defaultExplorationProgress;
  try {
    const raw = value ?? (typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem("jiangxinzhou-exploration-v1") ?? "null") : null);
    legacy = normalizeExplorationProgress(raw);
  } catch { legacy = defaultExplorationProgress; }
  const now = Date.now();
  const collection = legacy.discoveredLandmarkIds.map((landmarkId) => ({ landmarkId, discoveredAt: now, evidenceLevel: "triangulated" as const, source: "solo" as const }));
  const badges = legacy.completedExpeditionIds.map((id) => `expedition:${id}`);
  return { version: 2, collection, xp: collection.length * 25 + badges.length * 50, badges, lastActiveAt: now };
}
