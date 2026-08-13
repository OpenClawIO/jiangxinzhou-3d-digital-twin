"use client";

import dynamic from "next/dynamic";
import {
  Component,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ErrorInfo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { calculateCelestialEvents, calculateCelestialState, formatShanghaiEventDateTime, formatShanghaiEventTime, formatShanghaiTime, shanghaiDateParts, shanghaiPreviewTimestamp, type CelestialEvents, type CelestialPeriod, type CelestialState } from "./celestial";
import { DiscoveryToast, ExpeditionDeck } from "./ExplorationUI";
import { CollectionBook, GameHud, IdentityPicker, NearbyInteractionPrompt, QuestTracker, ReconnectBanner, RoomPresencePanel, TeamObjectivePanel, WorldEventBanner } from "./GameUI";
import { allLandmarkIds, findExpedition, type ExpeditionId } from "./exploration";
import {
  createInitialInteractionState,
  interactionReducer,
  nextSheetSnap,
  parseSceneFocus,
  settleSheetSnap,
  viewModeFromFocus,
  writeSceneFocus,
  type FocusCatalog,
  type LayerKey,
  type LayerVisibility,
  type QualityMode,
  type RoadSublayerKey,
  type RoadSublayerVisibility,
  type SceneFocus,
} from "./interactionState";
import { landmarks as defaultLandmarks, routes, type Landmark } from "./landmarks";
import {
  categoryLabels,
  experienceCopy,
  expeditionCopy,
  landmarkCopy,
  languageLabels,
  localize,
  type Language,
} from "./locales";
import { contextEvidenceSources, crossings, evidenceSources, findAnchor, localizeFeatureName, mapManifest, projectPoint, transportEvidenceSources, transportLines, transportStops } from "./mapGeometry";
import { findRoadCorridor, roadName } from "./roadLayer";
import { nanjingEyeEvidence, nanjingEyeLod2, nanjingEyeSpecification } from "./nanjingEye";
import {
  contextRecoveryPolicy,
  createAdaptiveQualityState,
  detectRenderCapabilities,
  initialAutoTier,
  parseRenderMode,
  renderProfileFor,
  resolveRenderTier,
  sampleAdaptiveQuality,
  type RenderContextState,
  type RenderMode,
  type RenderTelemetry,
} from "./render/runtime";
import type { JiangxinzhouSceneProps, ViewportInsets } from "./sceneTypes";
import { TransportPanel } from "./TransportPanel";
import { useExplorationProgress } from "./useExplorationProgress";
import { useSynchronizedClock, type ClockSource } from "./useSynchronizedClock";
import { parseGameMode, parseRoomId } from "./game/gateway";
import { targetIdForLandmark } from "./game/worldCatalog";
import { useGameSession } from "./game/useGameSession";
import type { GameMode } from "./game/types";
import { useTransitRealtime } from "./useTransitRealtime";

const JiangxinzhouScene = dynamic<JiangxinzhouSceneProps>(() => import("./JiangxinzhouScene"), {
  ssr: false,
  loading: () => <div className="scene-module-loading" aria-hidden="true"><span /><b>THREE.JS</b></div>,
});
const MemoizedJiangxinzhouScene = memo(JiangxinzhouScene);

type TimeMode = "live" | "preview";
type ViewportMode = "desktop" | "tablet" | "mobile";

const qualityModes: QualityMode[] = ["auto", "high", "balanced", "efficiency"];
const panelEntries = [
  ["overview", experienceCopy.panelOverview],
  ["transport", experienceCopy.panelTransport],
  ["landmarks", experienceCopy.panelLandmarks],
  ["explore", experienceCopy.panelExplore],
  ["evidence", experienceCopy.panelEvidence],
] as const;

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError?: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Jiangxinzhou WebGL scene failed", error, info.componentStack);
    this.props.onError?.(error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (value: Language) => void }) {
  return <div className="language-toggle" role="group" aria-label={localize(experienceCopy.languageToggle, language)}>{(Object.keys(languageLabels) as Language[]).map((value) => (
    <button key={value} className={value === language ? "active" : ""} aria-pressed={value === language} onClick={() => onChange(value)}>{languageLabels[value]}</button>
  ))}</div>;
}

function LayerToggles({ layers, roadSublayers, language, onToggle, onToggleRoad }: { layers: LayerVisibility; roadSublayers: RoadSublayerVisibility; language: Language; onToggle: (key: LayerKey) => void; onToggleRoad: (key: RoadSublayerKey) => void }) {
  const labels: Record<Exclude<LayerKey, "coordinates">, typeof experienceCopy.roads> = {
    water: experienceCopy.water,
    surroundings: experienceCopy.surroundings,
    roads: experienceCopy.roads,
    buildings: experienceCopy.buildings,
    landscape: experienceCopy.landscape,
    landmarks: experienceCopy.landmarkLayer,
    crossings: experienceCopy.crossingLayer,
    transport: experienceCopy.transportLayer,
  };
  const roadLabels: Record<RoadSublayerKey, typeof experienceCopy.roads> = {
    pavement: experienceCopy.roadPavement,
    curbs: experienceCopy.roadCurbs,
    walkways: experienceCopy.roadWalkways,
    greenways: experienceCopy.roadGreenways,
    markings: experienceCopy.roadMarkings,
    junctions: experienceCopy.roadJunctions,
    bridges: experienceCopy.roadBridges,
    labels: experienceCopy.roadLabelsLayer,
    trafficOverlay: experienceCopy.roadTraffic,
  };
  return <div className="layer-toggles" role="group" aria-label={localize(experienceCopy.layers, language)}>
    {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => <button key={key} className={layers[key] ? "active" : ""} aria-pressed={layers[key]} onClick={() => onToggle(key)}>{localize(labels[key], language)}</button>)}
    {layers.roads && <fieldset className="road-sublayer-toggles"><legend>{localize(experienceCopy.roadInfrastructure, language)}</legend>{(Object.keys(roadLabels) as RoadSublayerKey[]).map((key) => <button type="button" key={key} className={roadSublayers[key] ? "active" : ""} aria-pressed={roadSublayers[key]} onClick={() => onToggleRoad(key)}>{localize(roadLabels[key], language)}</button>)}</fieldset>}
  </div>;
}

function CelestialClock({ timestamp, mode, source, uncertaintyMs, state, events, previewMinutes, language, onPreview, onPreviewChange, onPreset, onLive }: {
  timestamp: number;
  mode: TimeMode;
  source: ClockSource;
  uncertaintyMs: number;
  state: CelestialState;
  events: CelestialEvents;
  previewMinutes: number;
  language: Language;
  onPreview: () => void;
  onPreviewChange: (minutes: number) => void;
  onPreset: (preset: "sunrise" | "noon" | "sunset" | "night") => void;
  onLive: () => void;
}) {
  const periodCopy = {
    day: experienceCopy.celestialDay,
    dawn: experienceCopy.celestialDawn,
    dusk: experienceCopy.celestialDusk,
    night: experienceCopy.celestialNight,
  } satisfies Record<CelestialPeriod, typeof experienceCopy.celestialDay>;
  const previewTime = `${String(Math.floor(previewMinutes / 60)).padStart(2, "0")}:${String(previewMinutes % 60).padStart(2, "0")}`;
  const eventItems = [
    ["sunrise", experienceCopy.sunrise, events.sunrise, "☀"],
    ["sunset", experienceCopy.sunset, events.sunset, "◒"],
    ["moonrise", experienceCopy.moonrise, events.moonrise, "☾"],
    ["moonset", experienceCopy.moonset, events.moonset, "◐"],
  ] as const;
  return <section className={`celestial-clock ${mode}`} aria-label={localize(experienceCopy.realWorldTime, language)}>
    <header className="celestial-clock-header">
      <span className={`celestial-live-badge ${mode}`}><i />{localize(mode === "live" ? experienceCopy.live : experienceCopy.previewMode, language)}</span>
      <span>{localize(periodCopy[state.period], language)}</span>
      <button onClick={mode === "live" ? onPreview : onLive}>{localize(mode === "live" ? experienceCopy.timePreview : experienceCopy.returnToLive, language)}</button>
    </header>
    <div className="celestial-clock-main">
      <div className="celestial-readout">
        <small>{localize(mode === "live" ? experienceCopy.realWorldTime : experienceCopy.timePreview, language)}</small>
        <time dateTime={new Date(timestamp).toISOString()}>{formatShanghaiTime(timestamp, language)}</time>
        <span>{mode === "live" ? localize(source === "network" ? experienceCopy.networkClock : experienceCopy.deviceClock, language) : `${localize(experienceCopy.sunAltitude, language)} ${state.sun.altitudeDeg.toFixed(1)}°`} · {localize(experienceCopy.moonIllumination, language)} {Math.round(state.moon.illumination * 100)}%</span>
        {mode === "live" && source === "network" && <em>{localize(experienceCopy.clockAccuracy, language)} ±{Math.ceil(uncertaintyMs)} ms</em>}
        {(!state.sun.visible || !state.moon.visible) && <em className="celestial-next-rise">{!state.sun.visible && `☀ ${localize(experienceCopy.nextRise, language)} ${formatShanghaiEventDateTime(events.nextSunrise, language)}`}{!state.sun.visible && !state.moon.visible && " · "}{!state.moon.visible && `☾ ${localize(experienceCopy.nextRise, language)} ${formatShanghaiEventDateTime(events.nextMoonrise, language)}`}</em>}
      </div>
      <div className="celestial-events">{eventItems.map(([key, label, value, icon]) => <div key={key}><span aria-hidden="true">{icon}</span><small>{localize(label, language)}</small><b>{formatShanghaiEventTime(value, language)}</b></div>)}</div>
    </div>
    {mode === "preview" && <div className="celestial-preview-controls">
      <div className="celestial-presets">{(["sunrise", "noon", "sunset", "night"] as const).map((preset) => <button key={preset} onClick={() => onPreset(preset)}>{localize({ sunrise: experienceCopy.previewSunrise, noon: experienceCopy.previewNoon, sunset: experienceCopy.previewSunset, night: experienceCopy.previewNight }[preset], language)}</button>)}</div>
      <label><span>{previewTime}</span><input type="range" min="0" max="1439" step="1" value={previewMinutes} aria-label={localize(experienceCopy.timePreview, language)} onChange={(event) => onPreviewChange(Number(event.target.value))} /></label>
    </div>}
  </section>;
}

function CelestialSkyTrack({ state, language }: { state: CelestialState; language: Language }) {
  const moonPhases = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const phaseIndex = Math.round(state.moon.phaseCycleDeg / 45) % moonPhases.length;
  const bodies = [
    { key: "sun", state: state.sun, name: experienceCopy.sun, symbol: "☀" },
    { key: "moon", state: state.moon, name: experienceCopy.moon, symbol: moonPhases[phaseIndex] },
  ] as const;
  const visibleBodies = bodies.filter((body) => body.state.visible);
  return <section className="celestial-sky-track" aria-label={localize(experienceCopy.skyPosition, language)}>
    <header><span>{localize(experienceCopy.skyPosition, language)}</span><small>{localize(experienceCopy.azimuthShort, language)} 0–360°</small></header>
    <div className="sky-track-field">
      <div className="sky-track-grid" aria-hidden="true"><span>N</span><span>E</span><span>S</span><span>W</span><span>N</span></div>
      {visibleBodies.map((body) => <span key={body.key} className={`sky-track-body ${body.key}`} style={{ left: `${(body.state.azimuthDeg / 3.6).toFixed(3)}%`, top: `${(70 - Math.min(90, Math.max(0, body.state.altitudeDeg)) / 90 * 54).toFixed(3)}%` }} title={`${localize(body.name, language)} · ${localize(experienceCopy.azimuthShort, language)} ${body.state.azimuthDeg.toFixed(0)}° · ${localize(experienceCopy.altitudeShort, language)} ${body.state.altitudeDeg.toFixed(1)}°`}><b aria-hidden="true">{body.symbol}</b><small>{body.state.altitudeDeg.toFixed(0)}°</small></span>)}
      {visibleBodies.length === 0 && <span className="sky-track-empty">{localize(experienceCopy.noBodyAboveHorizon, language)}</span>}
    </div>
  </section>;
}

function onRovingTabKeyDown<T extends string>(event: ReactKeyboardEvent<HTMLButtonElement>, entries: readonly T[], current: T, onSelect: (value: T) => void) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = Math.max(0, entries.indexOf(current));
  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + entries.length) % entries.length;
  onSelect(entries[nextIndex]);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
}

export default function JiangxinzhouExperience({ landmarks: items = defaultLandmarks, language, onLanguageChange }: { landmarks: Landmark[]; language: Language; onLanguageChange: (language: Language) => void }) {
  const defaultLineId = transportLines.find((line) => line.id === "bus-486")?.id ?? transportLines[0]?.id ?? "";
  const defaultCrossingId = crossings.find((crossing) => crossing.id === "jiangxinzhou-yangtze-bridge")?.id ?? crossings[0]?.id ?? "";
  const [ui, dispatch] = useReducer(interactionReducer, { landmarkId: items[0]?.id ?? 1, lineId: defaultLineId, crossingId: defaultCrossingId }, createInitialInteractionState);
  const [adaptiveQuality, setAdaptiveQuality] = useState(() => createAdaptiveQualityState("balanced"));
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>("webgl-v6");
  const [renderContextState, setRenderContextState] = useState<RenderContextState>("ready");
  const [renderContextLosses, setRenderContextLosses] = useState(0);
  const [forceEfficiency, setForceEfficiency] = useState(false);
  const [renderTelemetry, setRenderTelemetry] = useState<RenderTelemetry>();
  const [debugRender, setDebugRender] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [scaleMeters, setScaleMeters] = useState(1000);
  const [sceneKey, setSceneKey] = useState(0);
  const [toastLandmarkId, setToastLandmarkId] = useState<number>();
  const [timeMode, setTimeMode] = useState<TimeMode>("live");
  const [previewMinutes, setPreviewMinutes] = useState(720);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("desktop");
  const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [detailedAssetState, setDetailedAssetState] = useState<"idle" | "loading" | "ready">("idle");
  const [hasMapInteracted, setHasMapInteracted] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("solo");
  const [roomId, setRoomId] = useState<string>();
  const [identityOpen, setIdentityOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>();
  const [selectedRoadId, setSelectedRoadId] = useState<string>();
  const sheetRef = useRef<HTMLElement>(null);
  const sheetDrag = useRef<{ startY: number; startTranslate: number; lastY: number; lastTime: number; moved: boolean } | undefined>(undefined);
  const suppressSheetClick = useRef(false);
  const synchronizedClock = useSynchronizedClock();
  const exploration = useExplorationProgress();
  const game = useGameSession({ mode: gameMode, roomId });
  const transitRealtime = useTransitRealtime({ enabled: ui.layers.transport || ui.panel === "transport" });
  const recordExplorationLandmark = exploration.discoverLandmark;
  const clearCompletedLandmark = game.clearCompletedLandmark;
  const completedLandmarkId = game.lastCompletedLandmarkId;

  const focusCatalog = useMemo<FocusCatalog>(() => ({
    landmarkIds: new Set(items.map((item) => item.id)),
    routeIds: new Set(routes.map((route) => route.id)),
    lineIds: new Set(transportLines.map((line) => line.id)),
    stopIds: new Set(transportStops.map((stop) => stop.id)),
    crossingIds: new Set(crossings.map((crossing) => crossing.id)),
    defaultRouteId: routes[0].id,
    defaultLineId,
  }), [defaultLineId, items]);

  useEffect(() => {
    const mediaMobile = window.matchMedia("(max-width: 720px)");
    const mediaTablet = window.matchMedia("(max-width: 1099px)");
    const mediaMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateViewport = () => {
      const mode: ViewportMode = mediaMobile.matches ? "mobile" : mediaTablet.matches ? "tablet" : "desktop";
      setViewportMode(mode);
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      setReducedMotion(mediaMotion.matches);
      if (mode === "tablet") dispatch({ type: "set-panel-collapsed", collapsed: true });
    };
    updateViewport();
    mediaMobile.addEventListener("change", updateViewport);
    mediaTablet.addEventListener("change", updateViewport);
    mediaMotion.addEventListener("change", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      mediaMobile.removeEventListener("change", updateViewport);
      mediaTablet.removeEventListener("change", updateViewport);
      mediaMotion.removeEventListener("change", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const capabilities = detectRenderCapabilities();
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const tier = initialAutoTier(capabilities, { memoryGb: memory, cores: navigator.hardwareConcurrency });
      setAdaptiveQuality(createAdaptiveQualityState(tier));
      setWebglSupported(capabilities.webgl2);
      setRenderMode(parseRenderMode(window.location.search));
      const hostname = window.location.hostname;
      const previewHost = hostname === "localhost" || hostname === "127.0.0.1" || (hostname.endsWith(".vercel.app") && hostname !== "jiangxinzhou-3d-digital-twin.vercel.app");
      setDebugRender(previewHost && new URLSearchParams(window.location.search).get("debug") === "render");
      const savedQuality = window.localStorage.getItem("jiangxinzhou-quality-v1");
      if (qualityModes.includes(savedQuality as QualityMode)) dispatch({ type: "set-quality", quality: savedQuality as QualityMode });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const restoreGameUrl = () => {
      setGameMode(parseGameMode(window.location.search));
      setRoomId(parseRoomId(window.location.search));
    };
    restoreGameUrl();
    window.addEventListener("popstate", restoreGameUrl);
    return () => window.removeEventListener("popstate", restoreGameUrl);
  }, []);

  useEffect(() => {
    const restoreFromUrl = () => dispatch({ type: "restore-focus", focus: parseSceneFocus(window.location.search, focusCatalog) });
    restoreFromUrl();
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, [focusCatalog]);

  useEffect(() => {
    if (!toastLandmarkId) return undefined;
    const timeout = window.setTimeout(() => setToastLandmarkId(undefined), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastLandmarkId]);

  useEffect(() => {
    if (!completedLandmarkId) return;
    recordExplorationLandmark(completedLandmarkId);
    clearCompletedLandmark();
  }, [clearCompletedLandmark, completedLandmarkId, recordExplorationLandmark]);

  const quality = forceEfficiency ? "efficiency" : resolveRenderTier(ui.qualityMode, adaptiveQuality.tier);
  const renderProfile = useMemo(() => renderProfileFor(quality, { reducedMotion, mode: renderMode }), [quality, reducedMotion, renderMode]);
  const qualityCopy = {
    auto: experienceCopy.qualityAuto,
    high: experienceCopy.qualityHigh,
    balanced: experienceCopy.qualityBalanced,
    efficiency: experienceCopy.qualityEfficiency,
  } satisfies Record<QualityMode, typeof experienceCopy.qualityAuto>;
  const selectedId = ui.selectedLandmarkId;
  const selectedTransportLineId = ui.selectedTransportLineId;
  const selectedTransportStopId = ui.selectedTransportStopId;
  const selectedCrossingId = ui.selectedCrossingId;
  const controlPanel = ui.panel;
  const view = viewModeFromFocus(ui.focus);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedRoad = findRoadCorridor(selectedRoadId);
  const selectedRoadLengthM = useMemo(() => {
    if (!selectedRoad) return 0;
    const points = selectedRoad.geometry.coordinates.map((coordinate) => projectPoint(coordinate));
    return Math.round(points.slice(1).reduce((total, point, index) => total + Math.hypot(point[0] - points[index][0], point[2] - points[index][2]), 0));
  }, [selectedRoad]);
  const selectedAnchor = selected ? findAnchor(selected.anchorId) : undefined;
  const routeId = ui.focus.kind === "route" ? ui.focus.routeId : exploration.activeExpedition.routeId ?? routes[0].id;
  const selectedDiscovered = exploration.state.discoveredLandmarkIds.includes(selectedId) || game.collection.some((entry) => entry.landmarkId === selectedId);
  const missionComplete = exploration.activeProgress.completed === exploration.activeProgress.total;
  const discoveredLandmarkIds = useMemo(() => [...new Set([...exploration.state.discoveredLandmarkIds, ...game.collection.map((entry) => entry.landmarkId)])], [exploration.state.discoveredLandmarkIds, game.collection]);
  const worldPercent = Math.round((discoveredLandmarkIds.length / allLandmarkIds.length) * 100);
  const selectedAnchorPosition = useMemo(() => selectedAnchor ? projectPoint(selectedAnchor.geometry.coordinates, 0) : undefined, [selectedAnchor]);
  const selectedIsNearby = Boolean(game.localPlayer && selectedAnchorPosition && Math.hypot(game.localPlayer.position[0] - selectedAnchorPosition[0], game.localPlayer.position[1] - selectedAnchorPosition[2]) <= 70);
  const scaleLabel = scaleMeters >= 1000 ? `${(scaleMeters / 1000).toFixed(scaleMeters >= 10_000 ? 0 : 1)} km` : `${Math.round(scaleMeters / 10) * 10} m`;
  const liveTimestamp = synchronizedClock.timestamp;
  const celestialTimestamp = timeMode === "live" ? liveTimestamp : shanghaiPreviewTimestamp(new Date(liveTimestamp), previewMinutes);
  const sceneCelestialTimestamp = Math.floor(celestialTimestamp / 60_000) * 60_000;
  const celestialState = useMemo(() => calculateCelestialState(celestialTimestamp), [celestialTimestamp]);
  const celestialEventTick = Math.floor(celestialTimestamp / (10 * 60_000));
  const celestialEvents = useMemo(() => calculateCelestialEvents(celestialEventTick * 10 * 60_000), [celestialEventTick]);
  const timeParts = shanghaiDateParts(new Date(celestialTimestamp));
  const compactTime = `${String(timeParts.hour).padStart(2, "0")}:${String(timeParts.minute).padStart(2, "0")}`;
  const viewportInsets = useMemo<ViewportInsets>(() => {
    if (viewportMode === "mobile") {
      const bottom = ui.sheetSnap === "peek" ? 96 : ui.sheetSnap === "half" ? Math.round(viewportSize.height * 0.44) : Math.round(viewportSize.height * 0.72);
      return { top: 60, right: 0, bottom, left: 0 };
    }
    const right = !ui.panelCollapsed && viewportMode === "tablet" ? 344 : 0;
    return { top: 0, right, bottom: 0, left: 0 };
  }, [ui.panelCollapsed, ui.sheetSnap, viewportMode, viewportSize.height]);

  const selectedTargetName = useMemo(() => {
    const focus = ui.focus;
    if (focus.kind === "landmark") {
      const copy = landmarkCopy[focus.landmarkId];
      return copy ? localize(copy.name, language) : localize(experienceCopy.overview, language);
    }
    if (focus.kind === "transport") {
      const feature = transportStops.find((stop) => stop.id === focus.stopId) ?? transportLines.find((line) => line.id === focus.lineId);
      return feature ? localizeFeatureName(feature, language) : localize(experienceCopy.transportNetwork, language);
    }
    if (focus.kind === "route") return localize(expeditionCopy[exploration.activeExpedition.id].name, language);
    if (focus.kind === "regional" && focus.crossingId) {
      const crossing = crossings.find((item) => item.id === focus.crossingId);
      return crossing ? localizeFeatureName(crossing, language) : localize(experienceCopy.regional, language);
    }
    return localize(focus.kind === "regional" ? experienceCopy.regional : experienceCopy.overview, language);
  }, [exploration.activeExpedition.id, language, ui.focus]);

  const navigateFocus = useCallback((focus: SceneFocus, reason: "select" | "reset" = "select") => {
    const url = new URL(window.location.href);
    writeSceneFocus(url.searchParams, focus);
    window.history.pushState({ jiangxinzhouFocus: true }, "", url);
    dispatch({ type: "focus", focus, reason });
  }, []);

  const chooseLandmark = useCallback((id: number) => navigateFocus({ kind: "landmark", landmarkId: id }), [navigateFocus]);
  const chooseTransportLine = useCallback((id: string) => navigateFocus({ kind: "transport", lineId: id }), [navigateFocus]);
  const chooseTransportStop = useCallback((id: string) => navigateFocus({ kind: "transport", lineId: selectedTransportLineId, stopId: id }), [navigateFocus, selectedTransportLineId]);
  const chooseCrossing = useCallback((id: string) => navigateFocus({ kind: "regional", crossingId: id }), [navigateFocus]);
  const chooseRoad = useCallback((id: string) => {
    setSelectedRoadId(id);
    dispatch({ type: "set-panel", panel: "overview" });
  }, []);
  const resetView = useCallback(() => navigateFocus({ kind: "island" }, "reset"), [navigateFocus]);
  const enterSharedRoom = useCallback(() => {
    const generatedRoom = roomId || `jx-${Math.random().toString(36).slice(2, 8)}`;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "room");
    url.searchParams.set("room", generatedRoom);
    window.history.pushState({ jiangxinzhouGame: true }, "", url);
    setRoomId(generatedRoom);
    setGameMode("room");
  }, [roomId]);
  const leaveSharedRoom = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    url.searchParams.delete("room");
    window.history.pushState({ jiangxinzhouGame: true }, "", url);
    setRoomId(undefined);
    setGameMode("solo");
    setSelectedPlayerId(undefined);
  }, []);
  useEffect(() => {
    if (gameMode !== "room" || !game.isSupabaseGateway || (game.status !== "offline" && game.status !== "full")) return;
    const fallbackTimer = window.setTimeout(leaveSharedRoom, 0);
    return () => window.clearTimeout(fallbackTimer);
  }, [game.isSupabaseGateway, game.status, gameMode, leaveSharedRoom]);
  const previousView = useCallback(() => {
    if (ui.focusHistory.length > 0) window.history.back();
    else dispatch({ type: "back" });
  }, [ui.focusHistory.length]);
  const focusObjective = useCallback(() => {
    if (exploration.nextObjectiveId) chooseLandmark(exploration.nextObjectiveId);
  }, [chooseLandmark, exploration.nextObjectiveId]);
  const startMission = useCallback((expeditionId: ExpeditionId) => {
    const expedition = findExpedition(expeditionId);
    exploration.startExpedition(expeditionId);
    if (expedition.routeId) navigateFocus({ kind: "route", routeId: expedition.routeId });
    else {
      const firstTarget = expedition.landmarkIds.find((id) => !exploration.state.discoveredLandmarkIds.includes(id));
      navigateFocus(firstTarget ? { kind: "landmark", landmarkId: firstTarget } : { kind: "island" });
    }
    dispatch({ type: "set-panel", panel: "explore" });
  }, [exploration, navigateFocus]);
  const observeSelected = useCallback(() => {
    if (!selected || selectedDiscovered || view !== "landmark" || !selectedIsNearby) return;
    void game.observeLandmark(selected.id).then((ack) => {
      if (ack.accepted && ack.completedLandmarkId) setToastLandmarkId(ack.completedLandmarkId);
    });
  }, [game, selected, selectedDiscovered, selectedIsNearby, view]);
  const discoverSelected = useCallback(() => {
    if (!selected || selectedDiscovered || view !== "landmark") return;
    if (!selectedIsNearby) {
      void game.moveTo(targetIdForLandmark(selected.id), routeId);
      return;
    }
    void observeSelected();
  }, [game, observeSelected, routeId, selected, selectedDiscovered, selectedIsNearby, view]);
  const resetProgress = useCallback(() => {
    exploration.resetProgress();
    resetView();
  }, [exploration, resetView]);
  const beginTimePreview = useCallback(() => {
    const parts = shanghaiDateParts(new Date(liveTimestamp));
    setPreviewMinutes(parts.hour * 60 + parts.minute);
    setTimeMode("preview");
  }, [liveTimestamp]);
  const chooseTimePreset = useCallback((preset: "sunrise" | "noon" | "sunset" | "night") => {
    const minuteOfDay = (timestamp: number | null, fallback: number) => {
      if (timestamp === null) return fallback;
      const parts = shanghaiDateParts(new Date(timestamp));
      return parts.hour * 60 + parts.minute;
    };
    const sunrise = minuteOfDay(celestialEvents.sunrise, 360);
    const sunset = minuteOfDay(celestialEvents.sunset, 1080);
    setPreviewMinutes({ sunrise, noon: Math.round((sunrise + sunset) / 2), sunset, night: Math.min(1439, sunset + 90) }[preset]);
  }, [celestialEvents.sunrise, celestialEvents.sunset]);
  const setQualityMode = useCallback((qualityMode: QualityMode) => {
    dispatch({ type: "set-quality", quality: qualityMode });
    window.localStorage.setItem("jiangxinzhou-quality-v1", qualityMode);
  }, []);
  const handleCameraPhaseChange = useCallback((phase: "idle" | "guided" | "manual") => {
    dispatch({ type: "set-camera-phase", phase });
  }, []);
  const handleSceneInteractionStart = useCallback(() => {
    setHasMapInteracted(true);
    dispatch({ type: "set-camera-phase", phase: "manual" });
  }, []);
  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
    setRenderContextState("ready");
  }, []);
  const handleScaleChange = useCallback((meters: number) => {
    setScaleMeters((current) => Math.abs(current - meters) / Math.max(1, current) > 0.01 ? meters : current);
  }, []);
  const handlePerformanceSample = useCallback((fps: number) => {
    if (ui.qualityMode !== "auto" || forceEfficiency) return;
    setAdaptiveQuality((current) => sampleAdaptiveQuality(current, fps, viewportMode === "mobile"));
  }, [forceEfficiency, ui.qualityMode, viewportMode]);
  const handleRenderTelemetry = useCallback((telemetry: RenderTelemetry) => {
    setRenderTelemetry((current) => debugRender || current === undefined ? telemetry : current);
  }, [debugRender]);
  const handleRenderContextStateChange = useCallback((state: RenderContextState) => {
    setRenderContextState(state);
    if (state === "lost") {
      setRenderContextLosses((current) => {
        const next = current + 1;
        const policy = contextRecoveryPolicy(next);
        if (policy.forceTier === "efficiency") setForceEfficiency(true);
        if (policy.fallback) setWebglSupported(false);
        return next;
      });
    } else if (state === "recovering") {
      setSceneReady(false);
      setSceneKey((current) => current + 1);
    }
  }, []);
  const handleSceneFailure = useCallback(() => {
    setSceneReady(false);
    if (renderMode === "webgl-v6") {
      setRenderMode("legacy");
      setSceneKey((current) => current + 1);
    } else {
      setWebglSupported(false);
      setRenderContextState("failed");
    }
  }, [renderMode]);
  const retryScene = useCallback(() => {
    const capabilities = detectRenderCapabilities();
    setSceneReady(false);
    setRenderContextLosses(0);
    setForceEfficiency(false);
    setRenderContextState(capabilities.webgl2 ? "recovering" : "failed");
    setWebglSupported(capabilities.webgl2);
    setRenderMode(parseRenderMode(window.location.search));
    setSceneKey((current) => current + 1);
  }, []);

  const chooseView = useCallback((nextView: string) => {
    if (nextView === "regional") navigateFocus({ kind: "regional" });
    else if (nextView === "overview") resetView();
    else if (nextView === "route") navigateFocus({ kind: "route", routeId });
    else chooseLandmark(selectedId);
  }, [chooseLandmark, navigateFocus, resetView, routeId, selectedId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const targetElement = event.target as HTMLElement | null;
      if (event.key === "Escape") {
        if (!ui.popover && ui.cameraPhase !== "guided" && ui.sheetSnap === "peek" && ui.focusHistory.length > 0) previousView();
        else dispatch({ type: "escape" });
        return;
      }
      if (targetElement?.closest("input, select, textarea, button, a")) return;
      if (event.key.toLowerCase() === "n" && exploration.nextObjectiveId) focusObjective();
      if (event.key === "1") chooseView("regional");
      if (event.key === "2") chooseView("overview");
      if (event.key === "3") chooseView("route");
      if (event.key === "4") chooseView("landmark");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chooseView, exploration.nextObjectiveId, focusObjective, previousView, ui.cameraPhase, ui.focusHistory.length, ui.popover, ui.sheetSnap]);

  const sheetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (viewportMode !== "mobile" || !sheetRef.current?.parentElement) return;
    const sheetRect = sheetRef.current.getBoundingClientRect();
    const workspaceRect = sheetRef.current.parentElement.getBoundingClientRect();
    sheetDrag.current = { startY: event.clientY, startTranslate: sheetRect.top - workspaceRect.top, lastY: event.clientY, lastTime: performance.now(), moved: false };
    suppressSheetClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetRef.current.style.transition = "none";
  };
  const sheetPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDrag.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet?.parentElement) return;
    const maxTranslate = Math.max(0, sheet.parentElement.getBoundingClientRect().height - 96);
    const translate = Math.max(0, Math.min(maxTranslate, drag.startTranslate + event.clientY - drag.startY));
    drag.moved ||= Math.abs(event.clientY - drag.startY) > 5;
    drag.lastY = event.clientY;
    drag.lastTime = performance.now();
    sheet.style.transform = `translate3d(0, ${translate}px, 0)`;
  };
  const finishSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDrag.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet?.parentElement) return;
    const now = performance.now();
    const maxTranslate = Math.max(1, sheet.parentElement.getBoundingClientRect().height - 96);
    const translate = Number.parseFloat(sheet.style.transform.match(/,\s*([\d.-]+)px/)?.[1] ?? String(drag.startTranslate));
    const velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastTime);
    if (drag.moved) dispatch({ type: "set-sheet", snap: settleSheetSnap(translate / maxTranslate, velocity) });
    suppressSheetClick.current = drag.moved;
    sheet.style.removeProperty("transform");
    sheet.style.removeProperty("transition");
    sheetDrag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const sheetHandleClick = () => {
    if (suppressSheetClick.current) {
      suppressSheetClick.current = false;
      return;
    }
    dispatch({ type: "set-sheet", snap: ui.sheetSnap === "full" ? "half" : nextSheetSnap(ui.sheetSnap, "up") });
  };

  const sceneFallback = <div className="map-fallback" role="alert"><div><b>{localize(experienceCopy.webglUnavailable, language)}</b><span>{localize(experienceCopy.webglFallback, language)}</span><button onClick={retryScene}>{localize(experienceCopy.retryScene, language)}</button></div></div>;

  return (
    <section className="jiangxinzhou-experience game-mode v5-interaction v6-webgl" data-celestial-period={celestialState.period} data-viewport={viewportMode} data-camera-phase={ui.cameraPhase} data-map-interacted={hasMapInteracted} data-render-tier={quality} data-renderer={renderMode} data-render-context={renderContextState} aria-label={localize(experienceCopy.ariaLabel, language)}>
      <div className="map-toolbar">
        <div className="toolbar-title"><span className="toolbar-kicker">FIELD MAP · {mapManifest.snapshot} · WGS84</span><h2>{localize(experienceCopy.heading, language)}</h2></div>
        <div className="toolbar-actions">
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <div className="view-tabs" role="tablist" aria-label={localize(experienceCopy.viewTabs, language)}>
            {(["regional", "overview", "route", "landmark"] as const).map((entry) => <button key={entry} role="tab" aria-selected={view === entry} tabIndex={view === entry ? 0 : -1} className={view === entry ? "active" : ""} onClick={() => chooseView(entry)} onKeyDown={(event) => onRovingTabKeyDown(event, ["regional", "overview", "route", "landmark"] as const, view, chooseView)}>{localize({ regional: experienceCopy.regional, overview: experienceCopy.overview, route: experienceCopy.route, landmark: experienceCopy.landmark }[entry], language)}</button>)}
          </div>
        </div>
      </div>

      <div className={`map-layout ${ui.panelCollapsed ? "sidebar-collapsed" : ""}`} data-sheet-snap={ui.sheetSnap}>
        <div className="map-stage">
          {webglSupported !== false ? <SceneErrorBoundary key={sceneKey} fallback={sceneFallback} onError={handleSceneFailure}>
            <MemoizedJiangxinzhouScene
              items={items}
              selectedId={selectedId}
              onSelect={chooseLandmark}
              onReady={handleSceneReady}
              onScaleChange={handleScaleChange}
              celestialTimestamp={sceneCelestialTimestamp}
              routeId={routeId}
              focus={ui.focus}
              cameraCommand={ui.cameraCommand}
              cameraPhase={ui.cameraPhase}
              reducedMotion={reducedMotion}
              viewportInsets={viewportInsets}
              onCameraPhaseChange={handleCameraPhaseChange}
              onSceneInteractionStart={handleSceneInteractionStart}
              onDetailedAssetStateChange={setDetailedAssetState}
              layers={ui.layers}
              roadSublayers={ui.roadSublayers}
              selectedRoadId={selectedRoadId}
              onSelectRoad={chooseRoad}
              language={language}
              quality={quality}
              renderMode={renderMode}
              renderProfile={renderProfile}
              renderContextState={renderContextState}
              renderContextLosses={renderContextLosses}
              onPerformanceSample={handlePerformanceSample}
              onRenderTelemetry={handleRenderTelemetry}
              onRenderContextStateChange={handleRenderContextStateChange}
              objectiveId={controlPanel === "explore" ? exploration.nextObjectiveId : undefined}
              expeditionLandmarkIds={exploration.activeExpedition.landmarkIds}
              discoveredLandmarkIds={exploration.state.discoveredLandmarkIds}
              selectedTransportLineId={selectedTransportLineId}
              selectedTransportStopId={selectedTransportStopId}
              transitSnapshot={transitRealtime.snapshot}
              onSelectTransportStop={chooseTransportStop}
              selectedCrossingId={selectedCrossingId}
              onSelectCrossing={chooseCrossing}
              gameMode={gameMode}
              gamePlayers={game.players}
              localPlayerId={game.profile?.playerId}
              selectedPlayerId={selectedPlayerId}
              onSelectPlayer={setSelectedPlayerId}
            />
          </SceneErrorBoundary> : sceneFallback}
          {!sceneReady && webglSupported !== false && <div className="scene-loading-overlay" role="status" aria-live="polite"><span className="loading-orbit" /><b>{localize(experienceCopy.loadingScene, language)}</b><small>{localize(experienceCopy.loadingSceneDetail, language)}</small></div>}
          <GameHud language={language} mode={gameMode} status={game.status} playerCount={game.players.length} capacity={game.room?.capacity ?? 32} player={game.localPlayer} collectionCount={game.collection.length} xp={game.xp} onOpenIdentity={() => setIdentityOpen(true)} onJoinRoom={enterSharedRoom} onLeaveRoom={leaveSharedRoom} />
          {selectedRoad && <aside className="road-inspector" aria-label={localize(experienceCopy.roadInspector, language)}>
            <header><div><small>{localize(experienceCopy.roadInfrastructure, language)}</small><strong>{roadName(selectedRoad, language)}</strong></div><button type="button" aria-label={localize(experienceCopy.close, language)} onClick={() => setSelectedRoadId(undefined)}>×</button></header>
            <div className="road-inspector-grid"><span><small>{localize(experienceCopy.roadClass, language)}</small><b>{selectedRoad.properties.class}</b></span><span><small>{localize(experienceCopy.roadWidth, language)}</small><b>{selectedRoad.properties.widthM} m</b></span><span><small>{localize(experienceCopy.roadLength, language)}</small><b>{selectedRoadLengthM.toLocaleString()} m</b></span><span><small>{localize(experienceCopy.roadStatus, language)}</small><b>{selectedRoad.properties.status}</b></span></div>
            <footer><span>{localize(experienceCopy.roadSourceAgreement, language)} · {selectedRoad.properties.sourceAgreement}</span><span>{localize(experienceCopy.roadConfidence, language)} · {selectedRoad.properties.confidence}</span></footer>
          </aside>}
          <WorldEventBanner language={language} event={game.lastEvent} now={liveTimestamp} />
          <ReconnectBanner language={language} status={game.status} onReconnect={game.reconnect} />
          <NearbyInteractionPrompt language={language} landmark={view === "landmark" ? selected : undefined} localPlayer={game.localPlayer} isNearby={selectedIsNearby} isCompleted={selectedDiscovered} onMove={() => { if (selected) void game.moveTo(targetIdForLandmark(selected.id), routeId); }} onObserve={observeSelected} />
          {controlPanel === "explore" && <QuestTracker language={language} title={localize(expeditionCopy[exploration.activeExpedition.id].name, language)} progress={exploration.activeProgress} nextTarget={exploration.nextObjectiveId ? localize(landmarkCopy[exploration.nextObjectiveId].name, language) : undefined} onFocus={focusObjective} />}
          {debugRender && renderTelemetry && <aside className="render-debug-hud" aria-label="WebGL render telemetry">
            <b>WEBGL2 · {renderMode === "legacy" ? "LEGACY" : "V6"}</b>
            <span>{renderTelemetry.tier.toUpperCase()} · {renderTelemetry.fps.toFixed(1)} FPS · DPR {renderTelemetry.dpr.toFixed(2)}</span>
            <span>{renderTelemetry.calls} calls · {renderTelemetry.triangles.toLocaleString()} tris</span>
            <span>{renderTelemetry.geometries} geo · {renderTelemetry.textures} tex · {renderTelemetry.programs} programs</span>
            <span>{renderTelemetry.contextState} · losses {renderTelemetry.contextLosses}</span>
          </aside>}

          <button className="time-status-pill" aria-expanded={ui.popover === "time"} aria-controls="map-popover" onClick={() => dispatch({ type: "set-popover", popover: "time" })}><span aria-hidden="true">{celestialState.period === "night" ? "☾" : "☀"}</span><b>{compactTime}</b><small>{localize(timeMode === "live" ? experienceCopy.live : experienceCopy.previewMode, language)}</small></button>

          {ui.popover && <>
            <div className="map-popover-scrim" onPointerDown={() => dispatch({ type: "set-popover", popover: null })} />
            <section id="map-popover" className={`map-popover ${ui.popover}`} role="dialog" aria-modal="false" aria-label={localize(ui.popover === "settings" ? experienceCopy.settings : ui.popover === "time" ? experienceCopy.timeAndSky : experienceCopy.controlsHelp, language)}>
              <header><div><small>MAP CONTROL</small><h3>{localize(ui.popover === "settings" ? experienceCopy.settings : ui.popover === "time" ? experienceCopy.timeAndSky : experienceCopy.controlsHelp, language)}</h3></div><button autoFocus aria-label={localize(experienceCopy.close, language)} onClick={() => dispatch({ type: "set-popover", popover: null })}>×</button></header>
              {ui.popover === "settings" && <div className="settings-content">
                <fieldset className="layer-presets"><legend>{localize(experienceCopy.layerPreset, language)}</legend>{(["clean", "transport", "nature"] as const).map((preset) => <button type="button" key={preset} aria-pressed={ui.layerPreset === preset} className={ui.layerPreset === preset ? "active" : ""} onClick={() => dispatch({ type: "apply-layer-preset", preset })}>{localize({ clean: experienceCopy.layerPresetClean, transport: experienceCopy.layerPresetTransport, nature: experienceCopy.layerPresetNature }[preset], language)}</button>)}</fieldset>
                <LayerToggles layers={ui.layers} roadSublayers={ui.roadSublayers} language={language} onToggle={(key) => dispatch({ type: "set-layer", key })} onToggleRoad={(key) => dispatch({ type: "set-road-sublayer", key })} />
                <fieldset className="quality-options"><legend>{localize(experienceCopy.renderingQuality, language)}</legend>{qualityModes.map((mode) => <label key={mode}><input type="radio" name="render-quality" checked={ui.qualityMode === mode} onChange={() => setQualityMode(mode)} /><span>{localize(qualityCopy[mode], language)}</span>{mode === "auto" && <small>· {localize(qualityCopy[quality], language)}</small>}</label>)}</fieldset>
              </div>}
              {ui.popover === "time" && <div className="time-popover-content"><CelestialClock timestamp={celestialTimestamp} mode={timeMode} source={synchronizedClock.source} uncertaintyMs={synchronizedClock.uncertaintyMs} state={celestialState} events={celestialEvents} previewMinutes={previewMinutes} language={language} onPreview={beginTimePreview} onPreviewChange={setPreviewMinutes} onPreset={chooseTimePreset} onLive={() => setTimeMode("live")} /><CelestialSkyTrack state={celestialState} language={language} /></div>}
              {ui.popover === "help" && <div className="controls-help"><p><kbd>1–4</kbd><span>{localize(experienceCopy.viewTabs, language)}</span></p><p><kbd>N</kbd><span>{localize(experienceCopy.focusObjective, language)}</span></p><p><kbd>Esc</kbd><span>{localize(experienceCopy.previousView, language)}</span></p><p><i>↔</i><span>{localize(experienceCopy.helpRotate, language)}</span></p><p><i>⌁</i><span>{localize(experienceCopy.helpZoom, language)}</span></p><p><i>◎</i><span>{localize(experienceCopy.helpSelect, language)}</span></p></div>}
            </section>
          </>}

          <DiscoveryToast landmarkId={toastLandmarkId} language={language} />
          <div className="camera-status" role="status" aria-live="polite"><i />{detailedAssetState === "loading" ? localize(experienceCopy.detailedModelLoading, language) : ui.cameraPhase === "guided" ? localize(experienceCopy.cameraGuided, language) : localize(experienceCopy.cameraManual, language)}</div>
          <nav className="map-action-rail" aria-label={localize(experienceCopy.controlsHelp, language)}>
            <button disabled={ui.focusHistory.length === 0} onClick={previousView} aria-label={localize(experienceCopy.previousView, language)}><b>↶</b><span>{localize(experienceCopy.previousView, language)}</span></button>
            <button onClick={resetView} aria-label={localize(experienceCopy.islandHome, language)}><b>⌂</b><span>{localize(experienceCopy.islandHome, language)}</span></button>
            <button className="panel-action" aria-expanded={!ui.panelCollapsed} onClick={() => dispatch({ type: "set-panel-collapsed", collapsed: !ui.panelCollapsed })} aria-label={localize(experienceCopy.information, language)}><b>▤</b><span>{localize(experienceCopy.information, language)}</span></button>
            <button aria-expanded={ui.popover === "settings"} onClick={() => dispatch({ type: "set-popover", popover: "settings" })} aria-label={localize(experienceCopy.settings, language)}><b>◫</b><span>{localize(experienceCopy.layers, language)}</span></button>
            <button aria-expanded={ui.popover === "time"} onClick={() => dispatch({ type: "set-popover", popover: "time" })} aria-label={localize(experienceCopy.timeAndSky, language)}><b>◐</b><span>{localize(experienceCopy.timeAndSky, language)}</span></button>
            <button aria-expanded={ui.popover === "help"} onClick={() => dispatch({ type: "set-popover", popover: "help" })} aria-label={localize(experienceCopy.controlsHelp, language)}><b>?</b><span>{localize(experienceCopy.controlsHelp, language)}</span></button>
          </nav>
          <div className="map-scale"><span>0</span><i /><span>{scaleLabel}</span></div>
          <div className="north-marker" aria-label={localize(experienceCopy.north, language)}><span>N</span><b>↑</b></div>
          <div className="stage-note"><span className="stage-pulse" />{localize(experienceCopy.stageNote, language)} · N {language === "zh" ? "前往目标" : "next objective"}</div>
          {identityOpen && game.profile && <IdentityPicker language={language} displayName={game.profile.displayName} color={game.profile.color} onSave={(name, color) => void game.updateIdentity(name, color)} onClose={() => setIdentityOpen(false)} />}
        </div>

        <aside ref={sheetRef} className="map-sidebar" data-snap={ui.sheetSnap} aria-label={localize(experienceCopy.informationPanel, language)} aria-hidden={viewportMode !== "mobile" && ui.panelCollapsed} inert={viewportMode !== "mobile" && ui.panelCollapsed}>
          <button className="mobile-sheet-handle" aria-label={localize(ui.sheetSnap === "peek" ? experienceCopy.expandDetails : experienceCopy.collapseDetails, language)} aria-expanded={ui.sheetSnap !== "peek"} onClick={sheetHandleClick} onPointerDown={sheetPointerDown} onPointerMove={sheetPointerMove} onPointerUp={finishSheetDrag} onPointerCancel={finishSheetDrag} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); dispatch({ type: "set-sheet", snap: nextSheetSnap(ui.sheetSnap, event.key === "ArrowUp" ? "up" : "down") }); } }}><i /><span><small>{localize(experienceCopy.selectedTarget, language)}</small><strong>{selectedTargetName}</strong></span><b>{ui.sheetSnap === "peek" ? "⌃" : "⌄"}</b></button>
          <nav className="panel-tabs" role="tablist" aria-label={localize(experienceCopy.panelNavigation, language)} aria-hidden={viewportMode === "mobile" && ui.sheetSnap === "peek"} inert={viewportMode === "mobile" && ui.sheetSnap === "peek"}>
            {panelEntries.map(([panel, label], index) => <button id={`panel-tab-${panel}`} role="tab" aria-controls="map-panel-content" aria-selected={controlPanel === panel} tabIndex={controlPanel === panel ? 0 : -1} key={panel} className={controlPanel === panel ? "active" : ""} onClick={() => dispatch({ type: "set-panel", panel })} onKeyDown={(event) => onRovingTabKeyDown(event, panelEntries.map(([entry]) => entry), controlPanel, (next) => dispatch({ type: "set-panel", panel: next }))}><span>{String(index + 1).padStart(2, "0")}</span>{localize(label, language)}</button>)}
          </nav>

          <div id="map-panel-content" className="panel-content" role="tabpanel" aria-labelledby={`panel-tab-${controlPanel}`} aria-hidden={viewportMode === "mobile" && ui.sheetSnap === "peek"} inert={viewportMode === "mobile" && ui.sheetSnap === "peek"}>
            {controlPanel === "overview" && <>
              <div className="sidebar-section island-profile">
                <span className="sidebar-index">01 / {localize(experienceCopy.regionalContext, language)}</span>
                <h3>{localize(experienceCopy.regionalOverview, language)}</h3>
                <p>{localize(experienceCopy.regionalContextBody, language)}</p>
                <div className="metric-grid"><div><strong>{mapManifest.officialAreaKm2}</strong><span>km²</span><small>{localize(experienceCopy.area, language)}</small></div><div><strong>{mapManifest.officialEmbankmentKm}</strong><span>km</span><small>{localize(experienceCopy.embankment, language)}</small></div><div><strong>{mapManifest.counts.buildings}</strong><span>+</span><small>{localize(experienceCopy.buildingFootprints, language)}</small></div></div>
                {!exploration.state.briefingSeen && <button className="panel-primary-action" onClick={() => dispatch({ type: "set-panel", panel: "explore" })}><span><small>{localize(experienceCopy.briefingTitle, language)}</small><strong>{localize(experienceCopy.briefingBody, language)}</strong></span><b>→</b></button>}
              </div>
              <div className="sidebar-section crossing-section">
                <span className="sidebar-index">02 / {localize(experienceCopy.crossingNetwork, language)}</span>
                <div className="crossing-list">{crossings.filter((crossing) => crossing.properties.type === "bridge").map((crossing) => {
                  const isSelected = crossing.id === selectedCrossingId;
                  const measure = crossing.properties.officialMainSpanM ? `${localize(experienceCopy.crossingSpan, language)} ${crossing.properties.officialMainSpanM} m` : crossing.properties.officialStructureLengthM ? `${localize(experienceCopy.crossingStructureLength, language)} ${(crossing.properties.officialStructureLengthM / 1000).toFixed(1)} km` : crossing.properties.officialProjectLengthM ? `${localize(experienceCopy.crossingProjectLength, language)} ${(crossing.properties.officialProjectLengthM / 1000).toFixed(3)} km` : `${localize(experienceCopy.crossingGeometryLength, language)} ${(crossing.properties.measuredGeometryLengthM / 1000).toFixed(2)} km`;
                  return <button key={crossing.id} className={isSelected ? "active" : ""} onClick={() => chooseCrossing(crossing.id)} style={{ "--crossing-color": crossing.properties.color } as React.CSSProperties}><i /><span><strong>{localizeFeatureName(crossing, language)}</strong><small>{localize(experienceCopy.crossingTypeBridge, language)} · {measure}</small></span><b>↗</b></button>;
                })}</div>
              </div>
            </>}

            {controlPanel === "transport" && <div className="sidebar-section transport-section"><span className="sidebar-index">02 / {localize(experienceCopy.transportNetwork, language)}</span><p className="transport-intro">{localize(experienceCopy.transportSummary, language)}</p><TransportPanel language={language} selectedLineId={selectedTransportLineId} selectedStopId={selectedTransportStopId} onSelectLine={chooseTransportLine} onSelectStop={chooseTransportStop} realtime={transitRealtime} /></div>}

            {controlPanel === "landmarks" && selected && <div className="sidebar-section selected-landmark" style={{ "--selected-color": selected.accent } as React.CSSProperties}>
              <span className="sidebar-index">03 / {localize(experienceCopy.selectedLandmark, language)}</span>
              <label className="landmark-select"><span>{localize(experienceCopy.landmarkIndex, language)}</span><select value={selectedId} onChange={(event) => chooseLandmark(Number(event.target.value))}>{items.map((item) => <option key={item.id} value={item.id}>{discoveredLandmarkIds.includes(item.id) ? "✓" : "◇"} {String(item.id).padStart(2, "0")} · {localize(landmarkCopy[item.id].name, language)}</option>)}</select></label>
              <div className="selected-title"><span className={`selected-symbol ${selectedDiscovered ? "discovered" : ""}`}>{selectedDiscovered ? "✓" : String(selected.id).padStart(2, "0")}</span><div><h3>{localize(landmarkCopy[selected.id].name, language)}</h3><span>{categoryLabels[language][selected.category]} · {localize(selectedDiscovered ? experienceCopy.discovered : experienceCopy.undiscovered, language)}</span></div></div>
              <p>{localize(landmarkCopy[selected.id].description, language)}</p>
              <div className="detail-chips"><span>{localize(experienceCopy.bestExperience, language)} · {localize(landmarkCopy[selected.id].season, language)}</span>{selectedAnchor && <span className={selectedAnchor.properties.confidence}>{selectedAnchor.properties.confidence === "triangulated" ? localize(experienceCopy.triangulated, language) : localize(experienceCopy.estimated, language)}</span>}{selectedAnchor && <span>LOD {selectedAnchor.properties.lod}</span>}</div>
              {selected.id === 2 && <div className="nanjing-eye-model-card"><div className="model-card-heading"><span>{localize(experienceCopy.photoVerifiedModel, language)}</span><b>LOD 2 · {(nanjingEyeLod2.triangles / 1000).toFixed(0)}K</b></div><div className="bridge-spec-grid"><span><small>{localize(experienceCopy.bridgeProjectLength, language)}</small><strong>{nanjingEyeSpecification.projectLengthM} m</strong></span><span><small>{localize(experienceCopy.bridgeMainSpan, language)}</small><strong>{nanjingEyeSpecification.mainSpanM} m</strong></span><span><small>{localize(experienceCopy.bridgeTowerHeight, language)}</small><strong>{nanjingEyeSpecification.towerVerticalHeightM} m</strong></span><span><small>{localize(experienceCopy.bridgeStayCables, language)}</small><strong>{nanjingEyeSpecification.stayCableCount}</strong></span></div><div className="bridge-evidence-links"><small>{localize(experienceCopy.bridgeEvidenceUpdated, language)} · {nanjingEyeEvidence.version}</small>{nanjingEyeEvidence.sources.filter((source) => ["nanjing-eye-official-project", "nanjing-eye-technical-centre", "nanjing-eye-commons-category"].includes(source.id)).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.id === "nanjing-eye-commons-category" ? localize(experienceCopy.bridgeEvidenceSources, language) : source.type === "government" ? (language === "zh" ? "官方资料" : "Official data") : (language === "zh" ? "工程参数" : "Engineering data")} ↗</a>)}</div></div>}
              {selectedDiscovered ? <button className="discovery-action is-complete" disabled>✓ {localize(experienceCopy.discoveredLandmark, language)}</button> : view === "landmark" ? <button className="discovery-action" onClick={discoverSelected}>{localize(selectedIsNearby ? experienceCopy.discoverLandmark : experienceCopy.moveToLandmark, language)} <span>{selectedIsNearby ? "＋" : "→"}</span></button> : <button className="focus-button" onClick={() => chooseLandmark(selected.id)}>{localize(experienceCopy.focusLandmark, language)} <span>↗</span></button>}
              <CollectionBook language={language} entries={game.collection} landmarks={items} />
            </div>}

            {controlPanel === "explore" && <><div className="sidebar-section mission-control-panel" style={{ "--mission-color": exploration.activeExpedition.accent } as React.CSSProperties}><span className="sidebar-index">04 / {localize(experienceCopy.missionControl, language)}</span>{!exploration.state.briefingSeen && <div className="inline-briefing"><h3>{localize(experienceCopy.briefingTitle, language)}</h3><p>{localize(experienceCopy.briefingBody, language)}</p></div>}<div className="mission-title-row"><div><small>{localize(experienceCopy.currentExpedition, language)}</small><h3>{localize(expeditionCopy[exploration.activeExpedition.id].name, language)}</h3></div><b>{exploration.activeProgress.percent}%</b></div><div className="sidebar-progress"><i style={{ width: `${exploration.activeProgress.percent}%` }} /></div>{missionComplete ? <div className="mission-complete-message"><b>✓ {localize(experienceCopy.missionComplete, language)}</b><p>{localize(experienceCopy.missionCompleteBody, language)}</p></div> : <button className="objective-action" onClick={focusObjective}><span><small>{localize(experienceCopy.nextObjective, language)}</small><strong>{exploration.nextObjectiveId ? localize(landmarkCopy[exploration.nextObjectiveId].name, language) : "—"}</strong></span><b>{localize(experienceCopy.locate, language)} →</b></button>}<div className="world-progress"><span>{localize(experienceCopy.worldProgress, language)}</span><strong>{discoveredLandmarkIds.length}/{allLandmarkIds.length}</strong><i><b style={{ width: `${worldPercent}%` }} /></i></div></div>{gameMode === "room" && <><TeamObjectivePanel language={language} objectives={game.snapshot?.teamObjectives ?? []} /><RoomPresencePanel language={language} players={game.players} localPlayerId={game.profile?.playerId} /></>}<div className="sidebar-section expedition-section"><span className="sidebar-index">05 / {localize(experienceCopy.chooseMission, language)}</span><ExpeditionDeck activeId={exploration.state.activeExpeditionId} completedIds={exploration.state.completedExpeditionIds} discoveredIds={discoveredLandmarkIds} language={language} onStart={startMission} onReset={resetProgress} /></div></>}

            {controlPanel === "evidence" && <div className="sidebar-section evidence-section"><div className="evidence-heading"><span><b>05 / {localize(experienceCopy.evidence, language)}</b><small>{evidenceSources.length + transportEvidenceSources.length + contextEvidenceSources.length} {localize(experienceCopy.sources, language)} · WGS84</small></span></div><div className="evidence-list is-open">{[...evidenceSources, ...transportEvidenceSources, ...contextEvidenceSources].map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.type} · {source.date ?? source.imageryDate ?? "—"}</span></a>)}</div></div>}
          </div>
        </aside>
      </div>

      <footer className="map-footer"><span>{localize(experienceCopy.dataLayer, language)}</span><span>{localize(experienceCopy.precisionNote, language)}</span></footer>
    </section>
  );
}
