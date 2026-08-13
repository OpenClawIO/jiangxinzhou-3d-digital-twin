import assert from "node:assert/strict";
import {
  contextRecoveryPolicy,
  createAdaptiveQualityState,
  initialAutoTier,
  parseRenderMode,
  renderProfileFor,
  resolveRenderTier,
  sampleAdaptiveQuality,
  scheduledFrameRate,
  timestampBucket,
} from "../app/jiangxinzhou/render/runtime.ts";

const capable = { webgl2: true, maxTextureSize: 16384, maxSamples: 4, timerQuery: true, parallelCompile: true };
assert.equal(initialAutoTier(capable, { memoryGb: 8, cores: 8 }), "balanced");
assert.equal(initialAutoTier({ ...capable, maxSamples: 1 }, { memoryGb: 8, cores: 8 }), "efficiency");
assert.equal(initialAutoTier(capable, { memoryGb: 4, cores: 8 }), "efficiency");

let adaptive = createAdaptiveQualityState("balanced");
adaptive = sampleAdaptiveQuality(adaptive, 40, false);
adaptive = sampleAdaptiveQuality(adaptive, 40, false);
assert.equal(adaptive.tier, "balanced");
adaptive = sampleAdaptiveQuality(adaptive, 40, false);
assert.equal(adaptive.tier, "efficiency", "three low desktop windows should downgrade");
for (let index = 0; index < 5; index += 1) adaptive = sampleAdaptiveQuality(adaptive, 58, false);
assert.equal(adaptive.tier, "balanced", "five high desktop windows should upgrade");

assert.equal(resolveRenderTier("auto", "balanced"), "balanced");
assert.equal(resolveRenderTier("high", "efficiency"), "high", "manual selection must win");
assert.equal(renderProfileFor("high").multisampling, 4);
assert.equal(renderProfileFor("balanced", { reducedMotion: true }).ambientFps, 0);
assert.equal(renderProfileFor("balanced", { mode: "legacy" }).postprocessing, "off");
assert.equal(scheduledFrameRate(renderProfileFor("balanced"), { ambient: true, traffic: false }), 12);
assert.equal(scheduledFrameRate(renderProfileFor("high"), { ambient: true, traffic: true }), 30);
assert.equal(scheduledFrameRate(renderProfileFor("high"), { ambient: true, traffic: true, hidden: true }), 0);
assert.equal(parseRenderMode("?renderer=legacy"), "legacy");
assert.equal(parseRenderMode("?renderer=unknown"), "webgl-v6");
assert.equal(timestampBucket(601_234, 600_000), 600_000);
assert.deepEqual(contextRecoveryPolicy(1), { retry: true, fallback: false });
assert.deepEqual(contextRecoveryPolicy(2), { forceTier: "efficiency", retry: true, fallback: false });
assert.equal(contextRecoveryPolicy(3).fallback, true);

console.log("Validated WebGL2 profiles, adaptive hysteresis, motion reduction, renderer mode and context recovery.");
