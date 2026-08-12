"use client";

import { useEffect, useRef, useState } from "react";

export type ClockSource = "network" | "device";

type ClockAnchor = {
  epochMs: number;
  performanceMs: number;
  source: ClockSource;
  uncertaintyMs: number;
  lastSyncedAt: number;
};

export type SynchronizedClock = {
  timestamp: number;
  source: ClockSource;
  uncertaintyMs: number;
  lastSyncedAt: number;
};

const RESYNC_INTERVAL_MS = 5 * 60 * 1_000;

function deviceAnchor(): ClockAnchor {
  return {
    epochMs: Date.now(),
    performanceMs: performance.now(),
    source: "device",
    uncertaintyMs: 1_000,
    lastSyncedAt: Date.now(),
  };
}

async function sampleNetworkTime(signal: AbortSignal): Promise<ClockAnchor> {
  const requestEpoch = Date.now();
  const requestPerformance = performance.now();
  const response = await fetch(`/api/time?sample=${requestEpoch}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Time synchronization failed with ${response.status}.`);
  const payload = await response.json() as { serverTimeMs?: number };
  const responsePerformance = performance.now();
  if (!Number.isFinite(payload.serverTimeMs)) throw new TypeError("Time endpoint returned an invalid timestamp.");
  const roundTripMs = responsePerformance - requestPerformance;
  return {
    epochMs: payload.serverTimeMs! + roundTripMs / 2,
    performanceMs: responsePerformance,
    source: "network",
    uncertaintyMs: Math.max(1, roundTripMs / 2),
    lastSyncedAt: requestEpoch + roundTripMs,
  };
}

export function useSynchronizedClock(): SynchronizedClock {
  const anchor = useRef<ClockAnchor | null>(null);
  const [clock, setClock] = useState<SynchronizedClock>(() => ({
    timestamp: Date.UTC(2026, 7, 12, 4, 0, 0),
    source: "device",
    uncertaintyMs: 1_000,
    lastSyncedAt: 0,
  }));

  useEffect(() => {
    if (!anchor.current) anchor.current = deviceAnchor();
    const current = anchor.current;
    setClock({
      timestamp: current.epochMs,
      source: current.source,
      uncertaintyMs: current.uncertaintyMs,
      lastSyncedAt: current.lastSyncedAt,
    });
    const controller = new AbortController();
    const synchronize = async () => {
      try {
        const samples = await Promise.all(Array.from({ length: 3 }, () => sampleNetworkTime(controller.signal)));
        anchor.current = samples.reduce((best, sample) => sample.uncertaintyMs < best.uncertaintyMs ? sample : best);
      } catch {
        // Preserve the monotonic device-backed anchor when the endpoint is unavailable.
      }
    };
    void synchronize();
    const syncTimer = window.setInterval(synchronize, RESYNC_INTERVAL_MS);
    const tickTimer = window.setInterval(() => {
      const current = anchor.current ?? deviceAnchor();
      setClock({
        timestamp: current.epochMs + performance.now() - current.performanceMs,
        source: current.source,
        uncertaintyMs: current.uncertaintyMs,
        lastSyncedAt: current.lastSyncedAt,
      });
    }, 1_000);
    return () => {
      controller.abort();
      window.clearInterval(syncTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  return clock;
}
