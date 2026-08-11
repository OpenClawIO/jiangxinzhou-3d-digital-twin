import assert from "node:assert/strict";
import {
  JIANGXINZHOU_OBSERVER,
  calculateCelestialState,
  celestialDirection,
  shanghaiDateParts,
  shanghaiPreviewTimestamp,
} from "../app/jiangxinzhou/celestial.ts";

assert.equal(JIANGXINZHOU_OBSERVER.timeZone, "Asia/Shanghai");
assert.ok(Math.abs(JIANGXINZHOU_OBSERVER.longitude - 118.6982074) < 1e-9);
assert.ok(Math.abs(JIANGXINZHOU_OBSERVER.latitude - 32.0354297) < 1e-9);

const noon = calculateCelestialState(new Date("2026-08-11T04:00:00Z"));
const dusk = calculateCelestialState(new Date("2026-08-11T11:30:00Z"));
const night = calculateCelestialState(new Date("2026-08-11T12:00:00Z"));

assert.equal(noon.period, "day");
assert.ok(noon.sun.altitudeDeg > 70 && noon.daylight > 0.99);
assert.equal(dusk.period, "dusk");
assert.ok(dusk.sun.altitudeDeg < -6 && dusk.horizonGlow > 0.25);
assert.equal(night.period, "night");
assert.ok(night.sun.altitudeDeg < -12 && night.night > 0.95);
assert.ok(night.moon.illumination >= 0 && night.moon.illumination <= 1);

const north = celestialDirection(0, 0, 100);
const east = celestialDirection(90, 0, 100);
const zenith = celestialDirection(0, 90, 100);
assert.ok(Math.abs(north[0]) < 1e-9 && Math.abs(north[2] + 100) < 1e-9);
assert.ok(Math.abs(east[0] - 100) < 1e-9 && Math.abs(east[2]) < 1e-9);
assert.ok(Math.abs(zenith[1] - 100) < 1e-9);

const preview = shanghaiPreviewTimestamp(new Date("2026-08-11T23:00:00Z"), 6 * 60 + 15);
const previewParts = shanghaiDateParts(new Date(preview));
assert.deepEqual(
  [previewParts.year, previewParts.month, previewParts.day, previewParts.hour, previewParts.minute],
  [2026, 8, 12, 6, 15],
);
assert.throws(() => calculateCelestialState(Number.NaN), /valid date/i);

console.log("Validated real-time sun/moon state, Shanghai preview time and scene directions.");
