import assert from "node:assert/strict";
import {
  JIANGXINZHOU_OBSERVER,
  calculateCelestialEvents,
  calculateCelestialState,
  celestialDirection,
  formatShanghaiEventTime,
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

const usnoReferenceDate = new Date("2026-08-12T04:00:00Z");
const events = calculateCelestialEvents(usnoReferenceDate);
const assertWithinMinutes = (actual, expectedIso, toleranceMinutes = 3) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual - Date.parse(expectedIso)) <= toleranceMinutes * 60_000, `${new Date(actual).toISOString()} differs from USNO by more than ${toleranceMinutes} minutes.`);
};
assertWithinMinutes(events.sunrise, "2026-08-11T21:27:00Z");
assertWithinMinutes(events.sunset, "2026-08-12T10:53:00Z");
assertWithinMinutes(events.moonrise, "2026-08-11T20:32:00Z");
assertWithinMinutes(events.moonset, "2026-08-12T10:41:00Z");
assert.equal(formatShanghaiEventTime(events.sunrise, "en"), "05:27");
assert.ok(calculateCelestialState(new Date("2026-08-11T21:30:00Z")).sun.visible);
assert.ok(!calculateCelestialState(new Date("2026-08-11T21:20:00Z")).sun.visible);

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

console.log("Validated synchronized sun/moon state, USNO rise/set times, Shanghai preview time and scene directions.");
