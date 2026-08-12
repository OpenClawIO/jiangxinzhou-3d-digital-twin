"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { calculateCelestialEvents, calculateCelestialState, formatShanghaiEventDateTime, formatShanghaiEventTime, formatShanghaiTime, shanghaiDateParts, shanghaiPreviewTimestamp, type CelestialEvents, type CelestialPeriod, type CelestialState } from "./celestial";
import { DiscoveryToast, ExpeditionDeck, MissionHud } from "./ExplorationUI";
import { allLandmarkIds, findExpedition, type ExpeditionId } from "./exploration";
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
import { anchorPosition, contextEvidenceSources, crossings, evidenceSources, findAnchor, localizeFeatureName, mapBounds, mapManifest, projectPoint, regionalBounds, transportEvidenceSources, transportLines, transportStops } from "./mapGeometry";
import type { JiangxinzhouSceneProps, LayerKey, LayerVisibility, SceneQuality, ViewMode } from "./sceneTypes";
import { TransportPanel } from "./TransportPanel";
import { useExplorationProgress } from "./useExplorationProgress";
import { useSynchronizedClock, type ClockSource } from "./useSynchronizedClock";

const JiangxinzhouScene = dynamic<JiangxinzhouSceneProps>(() => import("./JiangxinzhouScene"), {
  ssr: false,
  loading: () => <div className="scene-module-loading" aria-hidden="true"><span /><b>THREE.JS</b></div>,
});

type QualityMode = "auto" | SceneQuality;
type ControlPanel = "overview" | "transport" | "landmarks" | "explore" | "evidence";
type TimeMode = "live" | "preview";

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Jiangxinzhou WebGL scene failed", error, info.componentStack); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (value: Language) => void }) {
  return <div className="language-toggle" aria-label={localize(experienceCopy.languageToggle, language)}>{(Object.keys(languageLabels) as Language[]).map((value) => (
    <button key={value} className={value === language ? "active" : ""} aria-pressed={value === language} onClick={() => onChange(value)}>{languageLabels[value]}</button>
  ))}</div>;
}

function LayerToggles({ layers, language, onToggle }: { layers: LayerVisibility; language: Language; onToggle: (key: LayerKey) => void }) {
  const labels: Record<LayerKey, typeof experienceCopy.roads> = {
    water: experienceCopy.water,
    surroundings: experienceCopy.surroundings,
    roads: experienceCopy.roads,
    buildings: experienceCopy.buildings,
    landscape: experienceCopy.landscape,
    landmarks: experienceCopy.landmarkLayer,
    crossings: experienceCopy.crossingLayer,
    transport: experienceCopy.transportLayer,
    coordinates: experienceCopy.coordinates,
  };
  return <div className="layer-toggles" aria-label={localize(experienceCopy.layers, language)}>{(Object.keys(labels) as LayerKey[]).map((key) => (
    <button key={key} className={layers[key] ? "active" : ""} aria-pressed={layers[key]} onClick={() => onToggle(key)}>{localize(labels[key], language)}</button>
  ))}</div>;
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
  return <section className={`celestial-clock ${mode}`} aria-live="polite" aria-label={localize(experienceCopy.realWorldTime, language)}>
    <header className="celestial-clock-header">
      <span className={`celestial-live-badge ${mode}`}><i />{localize(mode === "live" ? experienceCopy.live : experienceCopy.previewMode, language)}</span>
      <span>{localize(periodCopy[state.period], language)}</span>
      <button onClick={mode === "live" ? onPreview : onLive}>{localize(mode === "live" ? experienceCopy.timePreview : experienceCopy.returnToLive, language)}</button>
    </header>
    <div className="celestial-clock-main">
      <div className="celestial-readout">
        <small>{localize(mode === "live" ? experienceCopy.realWorldTime : experienceCopy.timePreview, language)}</small>
        <strong>{formatShanghaiTime(timestamp, language)}</strong>
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
      {visibleBodies.map((body) => <span
        key={body.key}
        className={`sky-track-body ${body.key}`}
        style={{ left: `${(body.state.azimuthDeg / 3.6).toFixed(3)}%`, top: `${(70 - Math.min(90, Math.max(0, body.state.altitudeDeg)) / 90 * 54).toFixed(3)}%` }}
        title={`${localize(body.name, language)} · ${localize(experienceCopy.azimuthShort, language)} ${body.state.azimuthDeg.toFixed(0)}° · ${localize(experienceCopy.altitudeShort, language)} ${body.state.altitudeDeg.toFixed(1)}°`}
      ><b aria-hidden="true">{body.symbol}</b><small>{body.state.altitudeDeg.toFixed(0)}°</small></span>)}
      {visibleBodies.length === 0 && <span className="sky-track-empty">{localize(experienceCopy.noBodyAboveHorizon, language)}</span>}
    </div>
  </section>;
}

function detectSceneQuality(): SceneQuality {
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (mobile || reducedMotion || memory <= 4 || cores <= 4) return "efficiency";
  if (memory <= 8 || cores <= 8) return "balanced";
  return "high";
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGL2RenderingContext && canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }));
  } catch {
    return false;
  }
}

export default function JiangxinzhouExperience({ landmarks: items = defaultLandmarks, language, onLanguageChange }: { landmarks: Landmark[]; language: Language; onLanguageChange: (language: Language) => void }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? 1);
  const [selectedTransportLineId, setSelectedTransportLineId] = useState(transportLines.find((line) => line.id === "bus-486")?.id ?? transportLines[0]?.id ?? "");
  const [selectedTransportStopId, setSelectedTransportStopId] = useState<string>();
  const [view, setView] = useState<ViewMode>("overview");
  const [layers, setLayers] = useState<LayerVisibility>({ water: false, surroundings: false, roads: true, buildings: true, landscape: true, landmarks: true, crossings: true, transport: false, coordinates: false });
  const [selectedCrossingId, setSelectedCrossingId] = useState("jiangxinzhou-yangtze-bridge");
  const [crossingFocused, setCrossingFocused] = useState(false);
  const [controlPanel, setControlPanel] = useState<ControlPanel>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>("auto");
  const [autoQuality, setAutoQuality] = useState<SceneQuality>("balanced");
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [scaleMeters, setScaleMeters] = useState(1000);
  const [sceneKey, setSceneKey] = useState(0);
  const [toastLandmarkId, setToastLandmarkId] = useState<number>();
  const [timeMode, setTimeMode] = useState<TimeMode>("live");
  const [previewMinutes, setPreviewMinutes] = useState(720);
  const synchronizedClock = useSynchronizedClock();
  const exploration = useExplorationProgress();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAutoQuality(detectSceneQuality());
      setWebglSupported(supportsWebGL());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!toastLandmarkId) return undefined;
    const timeout = window.setTimeout(() => setToastLandmarkId(undefined), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastLandmarkId]);

  const quality = qualityMode === "auto" ? autoQuality : qualityMode;
  const qualityModes: QualityMode[] = ["auto", "high", "balanced", "efficiency"];
  const qualityCopy = {
    auto: experienceCopy.qualityAuto,
    high: experienceCopy.qualityHigh,
    balanced: experienceCopy.qualityBalanced,
    efficiency: experienceCopy.qualityEfficiency,
  } satisfies Record<QualityMode, typeof experienceCopy.qualityAuto>;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedAnchor = selected ? findAnchor(selected.anchorId) : undefined;
  const selectedTransportStop = transportStops.find((stop) => stop.id === selectedTransportStopId);
  const selectedCrossing = crossings.find((crossing) => crossing.id === selectedCrossingId) ?? crossings[0];
  const target = useMemo(() => {
    if (view === "landmark" && selected) return anchorPosition(selected.anchorId, 18);
    if (view === "route" && selectedTransportStop) return projectPoint(selectedTransportStop.geometry.coordinates, 14);
    if (view === "regional" && crossingFocused && selectedCrossing) {
      const coordinates = selectedCrossing.geometry.coordinates;
      return projectPoint(coordinates[Math.floor(coordinates.length / 2)], 18);
    }
    if (view === "regional") return regionalBounds.center;
    return mapBounds.center;
  }, [crossingFocused, selected, selectedCrossing, selectedTransportStop, view]);
  const routeId = exploration.activeExpedition.routeId ?? routes[0].id;
  const selectedDiscovered = exploration.state.discoveredLandmarkIds.includes(selectedId);
  const missionComplete = exploration.activeProgress.completed === exploration.activeProgress.total;
  const worldPercent = Math.round((exploration.state.discoveredLandmarkIds.length / allLandmarkIds.length) * 100);
  const scaleLabel = scaleMeters >= 1000 ? `${(scaleMeters / 1000).toFixed(scaleMeters >= 10_000 ? 0 : 1)} km` : `${Math.round(scaleMeters / 10) * 10} m`;
  const liveTimestamp = synchronizedClock.timestamp;
  const celestialTimestamp = timeMode === "live" ? liveTimestamp : shanghaiPreviewTimestamp(new Date(liveTimestamp), previewMinutes);
  const celestialState = useMemo(() => calculateCelestialState(celestialTimestamp), [celestialTimestamp]);
  const celestialEventTick = Math.floor(celestialTimestamp / (10 * 60_000));
  const celestialEvents = useMemo(() => calculateCelestialEvents(celestialEventTick * 10 * 60_000), [celestialEventTick]);

  const chooseLandmark = useCallback((id: number) => {
    setSelectedId(id);
    setControlPanel("landmarks");
    setView("landmark");
  }, []);
  const resetView = useCallback(() => { setCrossingFocused(false); setView("overview"); }, []);
  const chooseTransportLine = useCallback((id: string) => {
    setSelectedTransportLineId(id);
    setSelectedTransportStopId(undefined);
    setControlPanel("transport");
    setLayers((current) => ({ ...current, transport: true }));
    setView("route");
  }, []);
  const chooseTransportStop = useCallback((id: string) => {
    setSelectedTransportStopId(id);
    setControlPanel("transport");
    setLayers((current) => ({ ...current, transport: true }));
    setView("route");
  }, []);
  const chooseCrossing = useCallback((id: string) => {
    setSelectedCrossingId(id);
    setCrossingFocused(true);
    setControlPanel("overview");
    setLayers((current) => ({ ...current, water: false, surroundings: false, crossings: true, transport: false, coordinates: false }));
    setView("regional");
  }, []);
  const focusObjective = useCallback(() => {
    if (exploration.nextObjectiveId) chooseLandmark(exploration.nextObjectiveId);
  }, [chooseLandmark, exploration.nextObjectiveId]);
  const startMission = useCallback((expeditionId: ExpeditionId) => {
    const expedition = findExpedition(expeditionId);
    exploration.startExpedition(expeditionId);
    const firstTarget = expedition.landmarkIds.find((id) => !exploration.state.discoveredLandmarkIds.includes(id));
    if (firstTarget) setSelectedId(firstTarget);
    setView(expedition.routeId ? "route" : "overview");
    setControlPanel("explore");
    setSidebarCollapsed(false);
  }, [exploration]);
  const discoverSelected = useCallback(() => {
    if (!selected || selectedDiscovered || view !== "landmark") return;
    exploration.discoverLandmark(selected.id);
    setToastLandmarkId(selected.id);
  }, [exploration, selected, selectedDiscovered, view]);
  const resetProgress = useCallback(() => {
    exploration.resetProgress();
    setSelectedId(items[0]?.id ?? 1);
    setCrossingFocused(false);
    setControlPanel("overview");
    setView("regional");
  }, [exploration, items]);
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
    const presets = {
      sunrise,
      noon: Math.round((sunrise + sunset) / 2),
      sunset,
      night: Math.min(1439, sunset + 90),
    };
    setPreviewMinutes(presets[preset]);
  }, [celestialEvents.sunrise, celestialEvents.sunset]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const targetElement = event.target as HTMLElement | null;
      if (targetElement?.closest("input, select, textarea, button")) return;
      if (event.key.toLowerCase() === "n" && exploration.nextObjectiveId) focusObjective();
      if (event.key === "Escape") resetView();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exploration.nextObjectiveId, focusObjective, resetView]);

  const sceneFallback = <div className="map-fallback" role="alert">
    <div><b>{localize(experienceCopy.webglUnavailable, language)}</b><span>{localize(experienceCopy.webglFallback, language)}</span><button onClick={() => { setSceneReady(false); setWebglSupported(supportsWebGL()); setSceneKey((value) => value + 1); }}>{localize(experienceCopy.retryScene, language)}</button></div>
  </div>;

  return (
    <section className="jiangxinzhou-experience game-mode" data-celestial-period={celestialState.period} aria-label={localize(experienceCopy.ariaLabel, language)}>
      <div className="map-toolbar">
        <div className="toolbar-title">
          <span className="toolbar-kicker">FIELD MAP · {mapManifest.snapshot} · WGS84</span>
          <h2>{localize(experienceCopy.heading, language)}</h2>
        </div>
        <div className="toolbar-actions">
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <div className="view-tabs" role="tablist" aria-label={localize(experienceCopy.viewTabs, language)}>
            <button className={view === "regional" ? "active" : ""} onClick={resetView}>{localize(experienceCopy.regional, language)}</button>
            <button className={view === "overview" ? "active" : ""} onClick={() => { setCrossingFocused(false); setView("overview"); }}>{localize(experienceCopy.overview, language)}</button>
            <button className={view === "route" ? "active" : ""} onClick={() => setView("route")}>{localize(experienceCopy.route, language)}</button>
            <button className={view === "landmark" ? "active" : ""} onClick={() => setView("landmark")}>{localize(experienceCopy.landmark, language)}</button>
          </div>
          <button className={`settings-toggle ${settingsOpen ? "active" : ""}`} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}>{localize(experienceCopy.settings, language)} <span>⌄</span></button>
        </div>
        {settingsOpen && <div className="settings-drawer"><LayerToggles layers={layers} language={language} onToggle={(key) => setLayers((current) => ({ ...current, [key]: !current[key] }))} /></div>}
      </div>

      <div className={`map-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="map-stage">
          {webglSupported !== false ? <SceneErrorBoundary key={sceneKey} fallback={sceneFallback}>
            <JiangxinzhouScene
              items={items}
              selectedId={selectedId}
              onSelect={chooseLandmark}
              onReady={() => setSceneReady(true)}
              onScaleChange={(meters) => setScaleMeters((current) => Math.abs(current - meters) / Math.max(1, current) > 0.01 ? meters : current)}
              celestialTimestamp={celestialTimestamp}
              routeId={routeId}
              view={view}
              target={target}
              layers={layers}
              language={language}
              quality={quality}
              objectiveId={controlPanel === "explore" ? exploration.nextObjectiveId : undefined}
              expeditionLandmarkIds={exploration.activeExpedition.landmarkIds}
              discoveredLandmarkIds={exploration.state.discoveredLandmarkIds}
              selectedTransportLineId={selectedTransportLineId}
              selectedTransportStopId={selectedTransportStopId}
              onSelectTransportStop={chooseTransportStop}
              selectedCrossingId={selectedCrossingId}
              onSelectCrossing={chooseCrossing}
            />
          </SceneErrorBoundary> : sceneFallback}
          {!sceneReady && webglSupported !== false && <div className="scene-loading-overlay" role="status" aria-live="polite"><span className="loading-orbit" /><b>{localize(experienceCopy.loadingScene, language)}</b><small>{localize(experienceCopy.loadingSceneDetail, language)}</small></div>}
          <CelestialClock timestamp={celestialTimestamp} mode={timeMode} source={synchronizedClock.source} uncertaintyMs={synchronizedClock.uncertaintyMs} state={celestialState} events={celestialEvents} previewMinutes={previewMinutes} language={language} onPreview={beginTimePreview} onPreviewChange={setPreviewMinutes} onPreset={chooseTimePreset} onLive={() => setTimeMode("live")} />
          <CelestialSkyTrack state={celestialState} language={language} />
          {controlPanel === "explore" && <MissionHud expedition={exploration.activeExpedition} {...exploration.activeProgress} nextObjectiveId={exploration.nextObjectiveId} language={language} />}
          <DiscoveryToast landmarkId={toastLandmarkId} language={language} />
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={localize(sidebarCollapsed ? experienceCopy.expandPanel : experienceCopy.collapsePanel, language)}>{sidebarCollapsed ? "‹" : "›"}</button>
          <div className="map-scale"><span>0</span><i /><span>{scaleLabel}</span></div>
          <div className="north-marker" aria-label={localize(experienceCopy.north, language)}><span>N</span><b>↑</b></div>
          <div className="stage-note"><span className="stage-pulse" />{localize(experienceCopy.stageNote, language)} · N {language === "zh" ? "前往目标" : "next objective"}</div>
          <div className="stage-controls">
            <button className="reset-view" onClick={resetView}>{localize(experienceCopy.resetView, language)}</button>
            <button className="quality-control" aria-label={localize(experienceCopy.qualityControl, language)} onClick={() => setQualityMode((current) => qualityModes[(qualityModes.indexOf(current) + 1) % qualityModes.length])}>
              <span>{localize(experienceCopy.quality, language)}</span><b>{localize(qualityCopy[qualityMode], language)}{qualityMode === "auto" ? ` · ${localize(qualityCopy[quality], language)}` : ""}</b>
            </button>
          </div>
        </div>

        <aside className="map-sidebar" aria-label={localize(experienceCopy.informationPanel, language)}>
          <nav className="panel-tabs" aria-label={localize(experienceCopy.panelNavigation, language)}>
            {([
              ["overview", experienceCopy.panelOverview],
              ["transport", experienceCopy.panelTransport],
              ["landmarks", experienceCopy.panelLandmarks],
              ["explore", experienceCopy.panelExplore],
              ["evidence", experienceCopy.panelEvidence],
            ] as [ControlPanel, typeof experienceCopy.overview][]).map(([panel, label], index) => <button key={panel} className={controlPanel === panel ? "active" : ""} aria-pressed={controlPanel === panel} onClick={() => setControlPanel(panel)}><span>{String(index + 1).padStart(2, "0")}</span>{localize(label, language)}</button>)}
          </nav>

          <div className="panel-content">
            {controlPanel === "overview" && <>
              <div className="sidebar-section island-profile">
                <span className="sidebar-index">01 / {localize(experienceCopy.regionalContext, language)}</span>
                <h3>{localize(experienceCopy.regionalOverview, language)}</h3>
                <p>{localize(experienceCopy.regionalContextBody, language)}</p>
                <div className="metric-grid">
                  <div><strong>{mapManifest.officialAreaKm2}</strong><span>km²</span><small>{localize(experienceCopy.area, language)}</small></div>
                  <div><strong>{mapManifest.officialEmbankmentKm}</strong><span>km</span><small>{localize(experienceCopy.embankment, language)}</small></div>
                  <div><strong>{mapManifest.counts.buildings}</strong><span>+</span><small>{localize(experienceCopy.buildingFootprints, language)}</small></div>
                </div>
                {!exploration.state.briefingSeen && <button className="panel-primary-action" onClick={() => setControlPanel("explore")}><span><small>{localize(experienceCopy.briefingTitle, language)}</small><strong>{localize(experienceCopy.briefingBody, language)}</strong></span><b>→</b></button>}
              </div>
              <div className="sidebar-section crossing-section">
                <span className="sidebar-index">02 / {localize(experienceCopy.crossingNetwork, language)}</span>
                <div className="crossing-list">
                  {crossings.filter((crossing) => crossing.properties.type === "bridge").map((crossing) => {
                    const isSelected = crossing.id === selectedCrossingId;
                    const measure = crossing.properties.officialMainSpanM
                      ? `${localize(experienceCopy.crossingSpan, language)} ${crossing.properties.officialMainSpanM} m`
                      : crossing.properties.officialStructureLengthM
                        ? `${localize(experienceCopy.crossingStructureLength, language)} ${(crossing.properties.officialStructureLengthM / 1000).toFixed(1)} km`
                        : crossing.properties.officialProjectLengthM
                          ? `${localize(experienceCopy.crossingProjectLength, language)} ${(crossing.properties.officialProjectLengthM / 1000).toFixed(3)} km`
                          : `${localize(experienceCopy.crossingGeometryLength, language)} ${(crossing.properties.measuredGeometryLengthM / 1000).toFixed(2)} km`;
                    return <button key={crossing.id} className={isSelected ? "active" : ""} onClick={() => chooseCrossing(crossing.id)} style={{ "--crossing-color": crossing.properties.color } as React.CSSProperties}><i /><span><strong>{localizeFeatureName(crossing, language)}</strong><small>{crossing.properties.type === "bridge" ? localize(experienceCopy.crossingTypeBridge, language) : localize(experienceCopy.crossingTypeTunnel, language)}{measure ? ` · ${measure}` : ""}</small></span><b>↗</b></button>;
                  })}
                </div>
              </div>
            </>}

            {controlPanel === "transport" && <div className="sidebar-section transport-section">
              <span className="sidebar-index">02 / {localize(experienceCopy.transportNetwork, language)}</span>
              <p className="transport-intro">{localize(experienceCopy.transportSummary, language)}</p>
              <TransportPanel language={language} selectedLineId={selectedTransportLineId} selectedStopId={selectedTransportStopId} onSelectLine={chooseTransportLine} onSelectStop={chooseTransportStop} />
            </div>}

            {controlPanel === "landmarks" && selected && <div className="sidebar-section selected-landmark" style={{ "--selected-color": selected.accent } as React.CSSProperties}>
              <span className="sidebar-index">03 / {localize(experienceCopy.selectedLandmark, language)}</span>
              <label className="landmark-select"><span>{localize(experienceCopy.landmarkIndex, language)}</span><select value={selectedId} onChange={(event) => chooseLandmark(Number(event.target.value))}>{items.map((item) => <option key={item.id} value={item.id}>{exploration.state.discoveredLandmarkIds.includes(item.id) ? "✓" : "◇"} {String(item.id).padStart(2, "0")} · {localize(landmarkCopy[item.id].name, language)}</option>)}</select></label>
              <div className="selected-title"><span className={`selected-symbol ${selectedDiscovered ? "discovered" : ""}`}>{selectedDiscovered ? "✓" : String(selected.id).padStart(2, "0")}</span><div><h3>{localize(landmarkCopy[selected.id].name, language)}</h3><span>{categoryLabels[language][selected.category]} · {localize(selectedDiscovered ? experienceCopy.discovered : experienceCopy.undiscovered, language)}</span></div></div>
              <p>{localize(landmarkCopy[selected.id].description, language)}</p>
              <div className="detail-chips"><span>{localize(experienceCopy.bestExperience, language)} · {localize(landmarkCopy[selected.id].season, language)}</span>{selectedAnchor && <span className={selectedAnchor.properties.confidence}>{selectedAnchor.properties.confidence === "triangulated" ? localize(experienceCopy.triangulated, language) : localize(experienceCopy.estimated, language)}</span>}{selectedAnchor && <span>LOD {selectedAnchor.properties.lod}</span>}</div>
              {selectedDiscovered ? <button className="discovery-action is-complete" disabled>✓ {localize(experienceCopy.discoveredLandmark, language)}</button> : view === "landmark" ? <button className="discovery-action" onClick={discoverSelected}>{localize(experienceCopy.discoverLandmark, language)} <span>＋</span></button> : <button className="focus-button" onClick={() => setView("landmark")}>{localize(experienceCopy.focusLandmark, language)} <span>↗</span></button>}
            </div>}

            {controlPanel === "explore" && <>
              <div className="sidebar-section mission-control-panel" style={{ "--mission-color": exploration.activeExpedition.accent } as React.CSSProperties}>
                <span className="sidebar-index">04 / {localize(experienceCopy.missionControl, language)}</span>
                {!exploration.state.briefingSeen && <div className="inline-briefing"><h3>{localize(experienceCopy.briefingTitle, language)}</h3><p>{localize(experienceCopy.briefingBody, language)}</p></div>}
                <div className="mission-title-row"><div><small>{localize(experienceCopy.currentExpedition, language)}</small><h3>{localize(expeditionCopy[exploration.activeExpedition.id].name, language)}</h3></div><b>{exploration.activeProgress.percent}%</b></div>
                <div className="sidebar-progress"><i style={{ width: `${exploration.activeProgress.percent}%` }} /></div>
                {missionComplete ? <div className="mission-complete-message"><b>✓ {localize(experienceCopy.missionComplete, language)}</b><p>{localize(experienceCopy.missionCompleteBody, language)}</p></div> : <button className="objective-action" onClick={focusObjective}><span><small>{localize(experienceCopy.nextObjective, language)}</small><strong>{exploration.nextObjectiveId ? localize(landmarkCopy[exploration.nextObjectiveId].name, language) : "—"}</strong></span><b>{localize(experienceCopy.locate, language)} →</b></button>}
                <div className="world-progress"><span>{localize(experienceCopy.worldProgress, language)}</span><strong>{exploration.state.discoveredLandmarkIds.length}/{allLandmarkIds.length}</strong><i><b style={{ width: `${worldPercent}%` }} /></i></div>
              </div>
              <div className="sidebar-section expedition-section"><span className="sidebar-index">05 / {localize(experienceCopy.chooseMission, language)}</span><ExpeditionDeck activeId={exploration.state.activeExpeditionId} completedIds={exploration.state.completedExpeditionIds} discoveredIds={exploration.state.discoveredLandmarkIds} language={language} onStart={startMission} onReset={resetProgress} /></div>
            </>}

            {controlPanel === "evidence" && <div className="sidebar-section evidence-section">
              <div className="evidence-heading"><span><b>05 / {localize(experienceCopy.evidence, language)}</b><small>{evidenceSources.length + transportEvidenceSources.length + contextEvidenceSources.length} {localize(experienceCopy.sources, language)} · WGS84</small></span></div>
              <div className="evidence-list is-open">{[...evidenceSources, ...transportEvidenceSources, ...contextEvidenceSources].map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.type} · {source.date ?? source.imageryDate ?? "—"}</span></a>)}</div>
            </div>}
          </div>
        </aside>
      </div>

      <footer className="map-footer"><span>{localize(experienceCopy.dataLayer, language)}</span><span>{localize(experienceCopy.precisionNote, language)}</span></footer>
    </section>
  );
}
