import assert from "node:assert/strict";
import {
  allLandmarkIds,
  defaultExplorationProgress,
  expeditions,
  explorationReducer,
  getExpeditionProgress,
  getNextObjective,
} from "../app/jiangxinzhou/exploration.ts";

const validLandmarks = new Set(allLandmarkIds);
const validRoutes = new Set(["island-loop", "riverwalk", "innovation-axis"]);

assert.equal(new Set(expeditions.map((item) => item.id)).size, expeditions.length, "Expedition IDs must be unique");
for (const expedition of expeditions) {
  assert.ok(expedition.landmarkIds.length > 0, `${expedition.id} needs at least one landmark`);
  assert.equal(new Set(expedition.landmarkIds).size, expedition.landmarkIds.length, `${expedition.id} contains duplicate landmarks`);
  assert.ok(expedition.landmarkIds.every((id) => validLandmarks.has(id)), `${expedition.id} references an unknown landmark`);
  assert.ok(!expedition.routeId || validRoutes.has(expedition.routeId), `${expedition.id} references an unknown route`);
}

const firstExpedition = expeditions[0];
const firstObjective = firstExpedition.landmarkIds[0];
const afterDiscovery = explorationReducer(defaultExplorationProgress, { type: "discover", landmarkId: firstObjective });
assert.deepEqual(afterDiscovery.discoveredLandmarkIds, [firstObjective], "A discovery should be recorded once");
assert.equal(getNextObjective(firstExpedition, afterDiscovery.discoveredLandmarkIds), firstExpedition.landmarkIds[1], "The next objective should advance");
assert.equal(getExpeditionProgress(firstExpedition, afterDiscovery.discoveredLandmarkIds).completed, 1, "Mission progress should advance");

const completedState = firstExpedition.landmarkIds.reduce(
  (state, landmarkId) => explorationReducer(state, { type: "discover", landmarkId }),
  defaultExplorationProgress,
);
assert.ok(completedState.completedExpeditionIds.includes(firstExpedition.id), "Completing every objective should complete the expedition");

console.log(`Validated ${expeditions.length} expeditions across ${allLandmarkIds.length} explorable landmarks.`);
