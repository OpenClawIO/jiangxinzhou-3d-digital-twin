export type ExpeditionId = "island-quest" | "nature-trail" | "architecture-tour" | "free-explore";

export type Expedition = {
  id: ExpeditionId;
  routeId?: "island-loop" | "riverwalk" | "innovation-axis";
  landmarkIds: readonly number[];
  estimatedMinutes: number;
  difficulty: "easy" | "standard";
  accent: string;
};

export type ExplorationProgress = {
  version: 1;
  activeExpeditionId: ExpeditionId;
  discoveredLandmarkIds: number[];
  completedExpeditionIds: ExpeditionId[];
  briefingSeen: boolean;
};

export type ExplorationAction =
  | { type: "hydrate"; progress: ExplorationProgress }
  | { type: "start"; expeditionId: ExpeditionId }
  | { type: "discover"; landmarkId: number }
  | { type: "dismiss-briefing" }
  | { type: "reset" };

export const allLandmarkIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export const expeditions: readonly Expedition[] = [
  {
    id: "island-quest",
    routeId: "island-loop",
    landmarkIds: [4, 11, 3, 5, 6, 7, 9, 10, 1, 2],
    estimatedMinutes: 18,
    difficulty: "standard",
    accent: "#e8bd55",
  },
  {
    id: "nature-trail",
    routeId: "riverwalk",
    landmarkIds: [9, 10, 1, 8],
    estimatedMinutes: 8,
    difficulty: "easy",
    accent: "#72c9a0",
  },
  {
    id: "architecture-tour",
    routeId: "innovation-axis",
    landmarkIds: [4, 11, 3, 5, 6, 7, 2],
    estimatedMinutes: 12,
    difficulty: "standard",
    accent: "#72b8e5",
  },
  {
    id: "free-explore",
    landmarkIds: allLandmarkIds,
    estimatedMinutes: 0,
    difficulty: "easy",
    accent: "#d79dd2",
  },
] as const;

export const defaultExplorationProgress: ExplorationProgress = {
  version: 1,
  activeExpeditionId: "island-quest",
  discoveredLandmarkIds: [],
  completedExpeditionIds: [],
  briefingSeen: false,
};

export const findExpedition = (id: ExpeditionId) => expeditions.find((expedition) => expedition.id === id) ?? expeditions[0];

export function getExpeditionProgress(expedition: Expedition, discoveredIds: readonly number[]) {
  const discovered = new Set(discoveredIds);
  const completed = expedition.landmarkIds.filter((id) => discovered.has(id)).length;
  return { completed, total: expedition.landmarkIds.length, percent: Math.round((completed / expedition.landmarkIds.length) * 100) };
}

export function getNextObjective(expedition: Expedition, discoveredIds: readonly number[]) {
  const discovered = new Set(discoveredIds);
  return expedition.landmarkIds.find((id) => !discovered.has(id));
}

export function normalizeExplorationProgress(value: unknown): ExplorationProgress {
  if (!value || typeof value !== "object") return defaultExplorationProgress;
  const candidate = value as Partial<ExplorationProgress>;
  const validExpeditionIds = new Set(expeditions.map((item) => item.id));
  const validLandmarkIds = new Set<number>(allLandmarkIds);
  const activeExpeditionId = candidate.activeExpeditionId && validExpeditionIds.has(candidate.activeExpeditionId) ? candidate.activeExpeditionId : defaultExplorationProgress.activeExpeditionId;
  const discoveredLandmarkIds = Array.isArray(candidate.discoveredLandmarkIds)
    ? [...new Set(candidate.discoveredLandmarkIds.filter((id): id is number => typeof id === "number" && validLandmarkIds.has(id)))]
    : [];
  const completedExpeditionIds = Array.isArray(candidate.completedExpeditionIds)
    ? [...new Set(candidate.completedExpeditionIds.filter((id): id is ExpeditionId => typeof id === "string" && validExpeditionIds.has(id as ExpeditionId)))]
    : [];
  return {
    version: 1,
    activeExpeditionId,
    discoveredLandmarkIds,
    completedExpeditionIds,
    briefingSeen: candidate.briefingSeen === true,
  };
}

export function explorationReducer(state: ExplorationProgress, action: ExplorationAction): ExplorationProgress {
  if (action.type === "hydrate") return normalizeExplorationProgress(action.progress);
  if (action.type === "reset") return { ...defaultExplorationProgress };
  if (action.type === "dismiss-briefing") return state.briefingSeen ? state : { ...state, briefingSeen: true };
  if (action.type === "start") return { ...state, activeExpeditionId: action.expeditionId, briefingSeen: true };
  if (state.discoveredLandmarkIds.includes(action.landmarkId)) return state;

  const discoveredLandmarkIds = [...state.discoveredLandmarkIds, action.landmarkId];
  const activeExpedition = findExpedition(state.activeExpeditionId);
  const activeComplete = activeExpedition.landmarkIds.every((id) => discoveredLandmarkIds.includes(id));
  const completedExpeditionIds = activeComplete && !state.completedExpeditionIds.includes(activeExpedition.id)
    ? [...state.completedExpeditionIds, activeExpedition.id]
    : state.completedExpeditionIds;
  return { ...state, discoveredLandmarkIds, completedExpeditionIds };
}
