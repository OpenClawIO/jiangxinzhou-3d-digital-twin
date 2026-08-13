import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatArrivalCountdown,
  isSnapshotStale,
  simulateTransitRealtime,
  snapshotAgeMs,
  statusLabel,
} from "../app/jiangxinzhou/transit/realtime.ts";

const runtime = JSON.parse(await readFile("data/jiangxinzhou-v2/runtime.json", "utf8"));
const now = Date.UTC(2026, 7, 13, 1, 0, 0); // 09:00 Asia/Shanghai
const lineCatalog = runtime.transit.lines.features;
const stopCatalog = runtime.transit.stops.features;
const first = simulateTransitRealtime(now, lineCatalog, stopCatalog);
const second = simulateTransitRealtime(now, lineCatalog, stopCatalog);
const later = simulateTransitRealtime(now + 60_000, lineCatalog, stopCatalog);
const lineIds = new Set(runtime.transit.lines.features.map((line) => line.id));
const stopIds = new Set(runtime.transit.stops.features.map((stop) => stop.id));

assert.equal(first.version, 1);
assert.equal(first.mode, "simulated");
assert.equal(first.provider, "jiangxinzhou-local-simulation");
assert.deepEqual(first, second, "same timestamp must produce deterministic transit state");
assert.equal(Object.keys(first.lines).length, runtime.manifest.counts.transitLines);
assert.ok(first.vehicles.length > 0, "simulation must expose active vehicles during the validation window");
assert.ok(first.arrivals.length > 0, "simulation must expose predicted arrivals");
assert.ok(later.vehicles.some((vehicle) => vehicle.progress !== first.vehicles.find((candidate) => candidate.vehicleId === vehicle.vehicleId)?.progress), "vehicles must move with time");

for (const [lineId, line] of Object.entries(first.lines)) {
  assert.ok(lineIds.has(lineId));
  assert.ok(["running", "delayed", "suspended", "not-running"].includes(line.status));
  assert.ok(line.phase >= 0 && line.phase < 1);
  assert.ok(line.delaySec >= 0);
}
for (const vehicle of first.vehicles) {
  assert.ok(lineIds.has(vehicle.lineId));
  assert.ok(vehicle.progress >= 0 && vehicle.progress < 1);
  assert.ok(Number.isFinite(vehicle.headingDeg));
}
for (const arrival of first.arrivals) {
  assert.ok(lineIds.has(arrival.lineId));
  assert.ok(stopIds.has(arrival.stopId));
  assert.ok(arrival.predictedAt >= now);
}

assert.equal(snapshotAgeMs(first, now + 1_000), 1_000);
assert.equal(isSnapshotStale(first, first.expiresAt), true);
assert.equal(isSnapshotStale(first, first.expiresAt - 1), false);
assert.equal(statusLabel("running", "zh"), "正常运行");
assert.equal(statusLabel("delayed", "en"), "Delayed");
assert.equal(formatArrivalCountdown(now + 120_000, now, "zh"), "2 分钟");
assert.equal(formatArrivalCountdown(now - 1, now, "en"), "Arriving");

console.log(`Validated simulated transit feed: ${Object.keys(first.lines).length} lines, ${first.vehicles.length} vehicles and ${first.arrivals.length} arrivals.`);
