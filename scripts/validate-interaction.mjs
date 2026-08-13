import assert from "node:assert/strict";
import {
  createInitialInteractionState,
  interactionReducer,
  nextSheetSnap,
  parseSceneFocus,
  settleSheetSnap,
  viewModeFromFocus,
  writeSceneFocus,
} from "../app/jiangxinzhou/interactionState.ts";

const catalog = {
  landmarkIds: new Set([1, 2, 3]),
  routeIds: new Set(["route-a"]),
  lineIds: new Set(["bus-486"]),
  stopIds: new Set(["stop-a"]),
  crossingIds: new Set(["eye"]),
  defaultRouteId: "route-a",
  defaultLineId: "bus-486",
};

let state = createInitialInteractionState({ landmarkId: 1, lineId: "bus-486", crossingId: "eye" });
assert.equal(viewModeFromFocus(state.focus), "overview");
state = interactionReducer(state, { type: "restore-focus", focus: { kind: "island" } });
assert.equal(state.sheetSnap, "peek", "initial URL restoration must preserve the map-first mobile sheet");
state = interactionReducer(state, { type: "focus", focus: { kind: "regional" } });
assert.equal(viewModeFromFocus(state.focus), "regional", "regional view must not reset to island overview");
state = interactionReducer(state, { type: "focus", focus: { kind: "landmark", landmarkId: 2 } });
assert.equal(state.panel, "landmarks");
assert.equal(state.selectedLandmarkId, 2);
assert.equal(state.cameraPhase, "guided");
assert.equal(state.sheetSnap, "half");
state = interactionReducer(state, { type: "set-camera-phase", phase: "manual" });
assert.equal(state.sheetSnap, "peek", "manual control should clear map space on mobile");
state = interactionReducer(state, { type: "focus", focus: { kind: "transport", lineId: "bus-486", stopId: "stop-a" } });
assert.equal(state.panel, "transport");
assert.equal(state.layers.transport, true);
assert.equal(state.selectedTransportStopId, "stop-a");
const priorFocus = state.focusHistory.at(-1);
state = interactionReducer(state, { type: "back" });
assert.deepEqual(state.focus, priorFocus, "back should restore the previous camera focus");

state = interactionReducer(state, { type: "set-popover", popover: "settings" });
state = interactionReducer(state, { type: "escape" });
assert.equal(state.popover, null, "Escape should close a popover first");
state = interactionReducer(state, { type: "set-sheet", snap: "full" });
state = interactionReducer(state, { type: "escape" });
assert.equal(state.sheetSnap, "peek", "Escape should collapse the mobile sheet");

assert.deepEqual(parseSceneFocus("?view=landmark&landmark=2", catalog), { kind: "landmark", landmarkId: 2 });
assert.deepEqual(parseSceneFocus("?view=landmark&landmark=99", catalog), { kind: "island" });
assert.deepEqual(parseSceneFocus("?view=route&line=bus-486&stop=stop-a", catalog), { kind: "transport", lineId: "bus-486", stopId: "stop-a" });
assert.deepEqual(parseSceneFocus("?view=regional&crossing=eye", catalog), { kind: "regional", crossingId: "eye" });
const params = writeSceneFocus(new URLSearchParams("lang=en&unused=1"), { kind: "landmark", landmarkId: 2 });
assert.equal(params.get("lang"), "en");
assert.equal(params.get("unused"), "1");
assert.equal(params.get("view"), "landmark");
assert.equal(params.get("landmark"), "2");

assert.equal(nextSheetSnap("peek", "up"), "half");
assert.equal(nextSheetSnap("full", "up"), "full");
assert.equal(settleSheetSnap(0.1, 0), "full");
assert.equal(settleSheetSnap(0.5, 0), "half");
assert.equal(settleSheetSnap(0.9, 0), "peek");
assert.equal(settleSheetSnap(0.8, -0.7), "half");
assert.equal(settleSheetSnap(0.2, 0.7), "half");

console.log("Validated synchronized focus, camera history, URL state, Escape priority and mobile sheet snapping.");
