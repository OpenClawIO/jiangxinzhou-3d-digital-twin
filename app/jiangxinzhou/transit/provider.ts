import { transportLines, transportStops } from "../mapGeometry.ts";
import { simulateTransitRealtime, type TransitRealtimeSnapshot } from "./realtime.ts";

export type TransitRealtimeProvider = {
  kind: "simulated" | "live";
  getSnapshot: (timestamp?: number) => Promise<TransitRealtimeSnapshot>;
};

export function simulateTransitFromMap(timestamp = Date.now()): TransitRealtimeSnapshot {
  return simulateTransitRealtime(timestamp, transportLines, transportStops);
}

/**
 * Provider boundary for V10. The live adapter will consume an authorized
 * operator feed later; the default is intentionally local and deterministic.
 */
export function createTransitRealtimeProvider(): TransitRealtimeProvider {
  return {
    kind: "simulated",
    getSnapshot: async (timestamp = Date.now()) => simulateTransitFromMap(timestamp),
  };
}
