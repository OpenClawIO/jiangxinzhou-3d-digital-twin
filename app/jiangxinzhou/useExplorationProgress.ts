"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  defaultExplorationProgress,
  explorationReducer,
  findExpedition,
  getExpeditionProgress,
  getNextObjective,
  normalizeExplorationProgress,
  type ExpeditionId,
} from "./exploration";

const STORAGE_KEY = "jiangxinzhou-exploration-v1";

export function useExplorationProgress() {
  const [state, dispatch] = useReducer(explorationReducer, defaultExplorationProgress);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) dispatch({ type: "hydrate", progress: normalizeExplorationProgress(JSON.parse(stored)) });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const activeExpedition = findExpedition(state.activeExpeditionId);
  const activeProgress = useMemo(
    () => getExpeditionProgress(activeExpedition, state.discoveredLandmarkIds),
    [activeExpedition, state.discoveredLandmarkIds],
  );
  const nextObjectiveId = useMemo(
    () => getNextObjective(activeExpedition, state.discoveredLandmarkIds),
    [activeExpedition, state.discoveredLandmarkIds],
  );
  const startExpedition = useCallback((expeditionId: ExpeditionId) => dispatch({ type: "start", expeditionId }), []);
  const discoverLandmark = useCallback((landmarkId: number) => dispatch({ type: "discover", landmarkId }), []);
  const dismissBriefing = useCallback(() => dispatch({ type: "dismiss-briefing" }), []);
  const resetProgress = useCallback(() => dispatch({ type: "reset" }), []);

  return {
    hydrated,
    state,
    activeExpedition,
    activeProgress,
    nextObjectiveId,
    startExpedition,
    discoverLandmark,
    dismissBriefing,
    resetProgress,
  };
}
