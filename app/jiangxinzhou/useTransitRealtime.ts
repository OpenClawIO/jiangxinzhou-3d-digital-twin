"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSnapshotStale, type TransitRealtimeSnapshot } from "./transit/realtime.ts";
import { simulateTransitFromMap } from "./transit/provider.ts";

export type TransitRealtimeState = {
  snapshot: TransitRealtimeSnapshot;
  connection: "idle" | "loading" | "ready" | "fallback";
  error?: string;
  refresh: () => void;
};

export function useTransitRealtime({ enabled, pollMs = 15_000 }: { enabled: boolean; pollMs?: number }): TransitRealtimeState {
  const [snapshot, setSnapshot] = useState<TransitRealtimeSnapshot>(() => simulateTransitFromMap());
  const [connection, setConnection] = useState<TransitRealtimeState["connection"]>("idle");
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setConnection("loading");
    void fetch("/api/transit/realtime", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`transit feed ${response.status}`);
        return response.json() as Promise<TransitRealtimeSnapshot>;
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        if (next.version !== 1 || !next.lines || !Array.isArray(next.vehicles)) throw new Error("invalid transit snapshot");
        setSnapshot(next);
        setError(undefined);
        setConnection(isSnapshotStale(next) ? "fallback" : "ready");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshot(simulateTransitFromMap());
        setError(cause instanceof Error ? cause.message : "transit feed unavailable");
        setConnection("fallback");
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      return undefined;
    }
    const refreshIfVisible = () => { if (!document.hidden) refresh(); };
    refreshIfVisible();
    const interval = window.setInterval(refreshIfVisible, pollMs);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      abortRef.current?.abort();
    };
  }, [enabled, pollMs, refresh]);

  return { snapshot, connection: enabled ? connection : "idle", error, refresh };
}
