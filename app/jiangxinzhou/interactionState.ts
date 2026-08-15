export type ViewMode = "regional" | "overview" | "route" | "landmark";
export type LayerKey = "water" | "surroundings" | "roads" | "buildings" | "landscape" | "landmarks" | "crossings" | "ferries" | "transport" | "coordinates";
export type LayerVisibility = Record<LayerKey, boolean>;
export type RoadSublayerKey = "pavement" | "curbs" | "walkways" | "greenways" | "markings" | "junctions" | "bridges" | "labels" | "trafficOverlay";
export type RoadSublayerVisibility = Record<RoadSublayerKey, boolean>;
export type SceneQuality = "high" | "balanced" | "efficiency";
export type QualityMode = "auto" | SceneQuality;
export type ControlPanel = "overview" | "transport" | "landmarks" | "explore" | "evidence";
export type MobileSheetSnap = "peek" | "half" | "full";
export type CameraPhase = "idle" | "guided" | "manual";
export type MapPopover = "settings" | "time" | "help" | null;
export type LayerPreset = "clean" | "transport" | "nature" | "custom";

export type SceneFocus =
  | { kind: "regional"; crossingId?: string }
  | { kind: "island" }
  | { kind: "landmark"; landmarkId: number }
  | { kind: "route"; routeId: string }
  | { kind: "transport"; lineId: string; stopId?: string };

export type CameraCommand = {
  id: number;
  focus: SceneFocus;
  reason: "select" | "history" | "reset";
};

export type FocusCatalog = {
  landmarkIds: ReadonlySet<number>;
  routeIds: ReadonlySet<string>;
  lineIds: ReadonlySet<string>;
  stopIds: ReadonlySet<string>;
  crossingIds: ReadonlySet<string>;
  defaultRouteId: string;
  defaultLineId: string;
};

export type InteractionState = {
  focus: SceneFocus;
  focusHistory: SceneFocus[];
  cameraCommand: CameraCommand;
  cameraPhase: CameraPhase;
  panel: ControlPanel;
  popover: MapPopover;
  sheetSnap: MobileSheetSnap;
  panelCollapsed: boolean;
  layers: LayerVisibility;
  roadSublayers: RoadSublayerVisibility;
  layerPreset: LayerPreset;
  qualityMode: QualityMode;
  selectedLandmarkId: number;
  selectedTransportLineId: string;
  selectedTransportStopId?: string;
  selectedCrossingId: string;
};

export type InteractionAction =
  | { type: "focus"; focus: SceneFocus; reason?: CameraCommand["reason"] }
  | { type: "restore-focus"; focus: SceneFocus }
  | { type: "back" }
  | { type: "set-panel"; panel: ControlPanel }
  | { type: "set-popover"; popover: MapPopover }
  | { type: "set-sheet"; snap: MobileSheetSnap }
  | { type: "set-panel-collapsed"; collapsed: boolean }
  | { type: "set-layer"; key: LayerKey; visible?: boolean }
  | { type: "set-road-sublayer"; key: RoadSublayerKey; visible?: boolean }
  | { type: "apply-layer-preset"; preset: Exclude<LayerPreset, "custom"> }
  | { type: "set-quality"; quality: QualityMode }
  | { type: "set-camera-phase"; phase: CameraPhase }
  | { type: "escape" };

export const defaultLayers: LayerVisibility = {
  // The water layer carries the porpoise ecology layer. Keep it on by
  // default so the feature is discoverable on first entry; users can still
  // hide the whole river system from Map Control.
  water: true,
  surroundings: false,
  roads: true,
  buildings: true,
  landscape: true,
  landmarks: true,
  crossings: true,
  ferries: true,
  transport: false,
  coordinates: false,
};

export const defaultRoadSublayers: RoadSublayerVisibility = {
  pavement: true,
  curbs: true,
  walkways: true,
  greenways: true,
  markings: true,
  junctions: true,
  bridges: true,
  labels: true,
  trafficOverlay: false,
};

export const layerPresets: Record<Exclude<LayerPreset, "custom">, LayerVisibility> = {
  clean: { ...defaultLayers },
  transport: { ...defaultLayers, buildings: false, landscape: false, transport: true },
  nature: { ...defaultLayers, buildings: false, roads: false, landscape: true },
};

const focusEquals = (left: SceneFocus, right: SceneFocus) => JSON.stringify(left) === JSON.stringify(right);

export function viewModeFromFocus(focus: SceneFocus): ViewMode {
  if (focus.kind === "regional") return "regional";
  if (focus.kind === "landmark") return "landmark";
  if (focus.kind === "route" || focus.kind === "transport") return "route";
  return "overview";
}

function panelForFocus(focus: SceneFocus): ControlPanel {
  if (focus.kind === "landmark") return "landmarks";
  if (focus.kind === "transport") return "transport";
  if (focus.kind === "route") return "explore";
  return "overview";
}

function focusSelection(state: InteractionState, focus: SceneFocus) {
  if (focus.kind === "landmark") return { selectedLandmarkId: focus.landmarkId };
  if (focus.kind === "transport") return { selectedTransportLineId: focus.lineId, selectedTransportStopId: focus.stopId };
  if (focus.kind === "regional" && focus.crossingId) return { selectedCrossingId: focus.crossingId };
  return {};
}

function applyFocus(state: InteractionState, focus: SceneFocus, reason: CameraCommand["reason"], pushHistory: boolean): InteractionState {
  if (focusEquals(state.focus, focus) && reason !== "reset") return {
    ...state,
    popover: null,
    panel: panelForFocus(focus),
    sheetSnap: reason === "select" ? "half" : state.sheetSnap,
  };
  const history = pushHistory && !focusEquals(state.focus, focus)
    ? [...state.focusHistory.slice(-11), state.focus]
    : state.focusHistory;
  const transport = focus.kind === "transport";
  return {
    ...state,
    ...focusSelection(state, focus),
    focus,
    focusHistory: history,
    cameraCommand: { id: state.cameraCommand.id + 1, focus, reason },
    cameraPhase: "guided",
    panel: panelForFocus(focus),
    popover: null,
    sheetSnap: "half",
    panelCollapsed: false,
    layers: transport ? { ...state.layers, transport: true, coordinates: false } : state.layers,
    layerPreset: transport ? "custom" : state.layerPreset,
  };
}

export function createInitialInteractionState(defaults: { landmarkId: number; lineId: string; crossingId: string }): InteractionState {
  const focus: SceneFocus = { kind: "island" };
  return {
    focus,
    focusHistory: [],
    cameraCommand: { id: 0, focus, reason: "reset" },
    cameraPhase: "idle",
    panel: "overview",
    popover: null,
    sheetSnap: "peek",
    panelCollapsed: false,
    layers: { ...defaultLayers },
    roadSublayers: { ...defaultRoadSublayers },
    layerPreset: "clean",
    qualityMode: "auto",
    selectedLandmarkId: defaults.landmarkId,
    selectedTransportLineId: defaults.lineId,
    selectedCrossingId: defaults.crossingId,
  };
}

export function interactionReducer(state: InteractionState, action: InteractionAction): InteractionState {
  if (action.type === "focus") return applyFocus(state, action.focus, action.reason ?? "select", true);
  if (action.type === "restore-focus") {
    const last = state.focusHistory.at(-1);
    const restored = applyFocus(state, action.focus, "history", false);
    return last && focusEquals(last, action.focus) ? { ...restored, focusHistory: state.focusHistory.slice(0, -1) } : restored;
  }
  if (action.type === "back") {
    const previous = state.focusHistory.at(-1);
    if (!previous) return state;
    return { ...applyFocus(state, previous, "history", false), focusHistory: state.focusHistory.slice(0, -1) };
  }
  if (action.type === "set-panel") return { ...state, panel: action.panel, popover: null, panelCollapsed: false, sheetSnap: state.sheetSnap === "peek" ? "half" : state.sheetSnap };
  if (action.type === "set-popover") return { ...state, popover: state.popover === action.popover ? null : action.popover };
  if (action.type === "set-sheet") return { ...state, sheetSnap: action.snap };
  if (action.type === "set-panel-collapsed") return { ...state, panelCollapsed: action.collapsed };
  if (action.type === "set-layer") return {
    ...state,
    layers: { ...state.layers, [action.key]: action.visible ?? !state.layers[action.key], coordinates: false },
    layerPreset: "custom",
  };
  if (action.type === "set-road-sublayer") return {
    ...state,
    roadSublayers: { ...state.roadSublayers, [action.key]: action.visible ?? !state.roadSublayers[action.key] },
  };
  if (action.type === "apply-layer-preset") return { ...state, layers: { ...layerPresets[action.preset] }, layerPreset: action.preset };
  if (action.type === "set-quality") return { ...state, qualityMode: action.quality };
  if (action.type === "set-camera-phase") {
    const sheetSnap = action.phase === "manual" ? "peek" : state.sheetSnap;
    if (action.phase === state.cameraPhase && sheetSnap === state.sheetSnap) return state;
    return { ...state, cameraPhase: action.phase, sheetSnap };
  }
  if (action.type === "escape") {
    if (state.popover) return { ...state, popover: null };
    if (state.cameraPhase === "guided") return { ...state, cameraPhase: "manual", sheetSnap: "peek" };
    if (state.sheetSnap !== "peek") return { ...state, sheetSnap: "peek" };
    if (state.focusHistory.length > 0) return interactionReducer(state, { type: "back" });
  }
  return state;
}

export function parseSceneFocus(search: string | URLSearchParams, catalog: FocusCatalog): SceneFocus {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const view = params.get("view");
  if (view === "regional") {
    const crossingId = params.get("crossing") ?? undefined;
    return crossingId && catalog.crossingIds.has(crossingId) ? { kind: "regional", crossingId } : { kind: "regional" };
  }
  if (view === "landmark") {
    const landmarkId = Number(params.get("landmark"));
    return Number.isInteger(landmarkId) && catalog.landmarkIds.has(landmarkId) ? { kind: "landmark", landmarkId } : { kind: "island" };
  }
  if (view === "route") {
    const lineId = params.get("line");
    const stopId = params.get("stop") ?? undefined;
    if (lineId && catalog.lineIds.has(lineId)) return { kind: "transport", lineId, stopId: stopId && catalog.stopIds.has(stopId) ? stopId : undefined };
    const routeId = params.get("route") ?? catalog.defaultRouteId;
    return catalog.routeIds.has(routeId) ? { kind: "route", routeId } : { kind: "route", routeId: catalog.defaultRouteId };
  }
  return { kind: "island" };
}

export function writeSceneFocus(params: URLSearchParams, focus: SceneFocus) {
  ["view", "landmark", "route", "line", "stop", "crossing"].forEach((key) => params.delete(key));
  if (focus.kind === "island") return params;
  if (focus.kind === "regional") {
    params.set("view", "regional");
    if (focus.crossingId) params.set("crossing", focus.crossingId);
  } else if (focus.kind === "landmark") {
    params.set("view", "landmark");
    params.set("landmark", String(focus.landmarkId));
  } else if (focus.kind === "route") {
    params.set("view", "route");
    params.set("route", focus.routeId);
  } else {
    params.set("view", "route");
    params.set("line", focus.lineId);
    if (focus.stopId) params.set("stop", focus.stopId);
  }
  return params;
}

export function nextSheetSnap(current: MobileSheetSnap, direction: "up" | "down") {
  const order: MobileSheetSnap[] = ["peek", "half", "full"];
  const index = order.indexOf(current);
  return order[Math.max(0, Math.min(order.length - 1, index + (direction === "up" ? 1 : -1)))];
}

export function settleSheetSnap(progress: number, velocityY: number): MobileSheetSnap {
  if (velocityY < -0.45) return progress > 0.62 ? "half" : "full";
  if (velocityY > 0.45) return progress < 0.38 ? "half" : "peek";
  if (progress < 0.26) return "full";
  if (progress < 0.72) return "half";
  return "peek";
}
