"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { DiscoveryToast, ExpeditionDeck, ExplorationBriefing, MissionHud } from "./ExplorationUI";
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
import { anchorPosition, evidenceSources, findAnchor, mapBounds, mapManifest } from "./mapGeometry";
import type { JiangxinzhouSceneProps, LayerKey, LayerVisibility, SceneQuality, ViewMode } from "./sceneTypes";
import { useExplorationProgress } from "./useExplorationProgress";

const JiangxinzhouScene = dynamic<JiangxinzhouSceneProps>(() => import("./JiangxinzhouScene"), {
  ssr: false,
  loading: () => <div className="scene-module-loading" aria-hidden="true"><span /><b>THREE.JS</b></div>,
});

type QualityMode = "auto" | SceneQuality;

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
  const labels: Record<LayerKey, typeof experienceCopy.roads> = { roads: experienceCopy.roads, buildings: experienceCopy.buildings, landscape: experienceCopy.landscape, landmarks: experienceCopy.landmarkLayer };
  return <div className="layer-toggles" aria-label={localize(experienceCopy.layers, language)}>{(Object.keys(labels) as LayerKey[]).map((key) => (
    <button key={key} className={layers[key] ? "active" : ""} aria-pressed={layers[key]} onClick={() => onToggle(key)}>{localize(labels[key], language)}</button>
  ))}</div>;
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
  const [view, setView] = useState<ViewMode>("overview");
  const [layers, setLayers] = useState<LayerVisibility>({ roads: true, buildings: true, landscape: true, landmarks: true });
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>("auto");
  const [autoQuality, setAutoQuality] = useState<SceneQuality>("balanced");
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [toastLandmarkId, setToastLandmarkId] = useState<number>();
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
  const target = useMemo(() => view === "landmark" && selected ? anchorPosition(selected.anchorId, 18) : mapBounds.center, [selected, view]);
  const routeId = exploration.activeExpedition.routeId ?? routes[0].id;
  const selectedDiscovered = exploration.state.discoveredLandmarkIds.includes(selectedId);
  const missionComplete = exploration.activeProgress.completed === exploration.activeProgress.total;
  const worldPercent = Math.round((exploration.state.discoveredLandmarkIds.length / allLandmarkIds.length) * 100);

  const chooseLandmark = useCallback((id: number) => {
    setSelectedId(id);
    setView("landmark");
  }, []);
  const resetView = useCallback(() => setView("overview"), []);
  const focusObjective = useCallback(() => {
    if (exploration.nextObjectiveId) chooseLandmark(exploration.nextObjectiveId);
  }, [chooseLandmark, exploration.nextObjectiveId]);
  const startMission = useCallback((expeditionId: ExpeditionId) => {
    const expedition = findExpedition(expeditionId);
    exploration.startExpedition(expeditionId);
    const firstTarget = expedition.landmarkIds.find((id) => !exploration.state.discoveredLandmarkIds.includes(id));
    if (firstTarget) setSelectedId(firstTarget);
    setView(expedition.routeId ? "route" : "overview");
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
    setView("overview");
  }, [exploration, items]);

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
    <section className="jiangxinzhou-experience game-mode" aria-label={localize(experienceCopy.ariaLabel, language)}>
      <div className="map-toolbar">
        <div className="toolbar-title">
          <span className="toolbar-kicker">FIELD MAP · {mapManifest.snapshot} · WGS84</span>
          <h2>{localize(experienceCopy.heading, language)}</h2>
        </div>
        <div className="toolbar-actions">
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <div className="view-tabs" role="tablist" aria-label={localize(experienceCopy.viewTabs, language)}>
            <button className={view === "overview" ? "active" : ""} onClick={resetView}>{localize(experienceCopy.overview, language)}</button>
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
              routeId={routeId}
              view={view}
              target={target}
              layers={layers}
              language={language}
              quality={quality}
              objectiveId={exploration.nextObjectiveId}
              expeditionLandmarkIds={exploration.activeExpedition.landmarkIds}
              discoveredLandmarkIds={exploration.state.discoveredLandmarkIds}
            />
          </SceneErrorBoundary> : sceneFallback}
          {!sceneReady && webglSupported !== false && <div className="scene-loading-overlay" role="status" aria-live="polite"><span className="loading-orbit" /><b>{localize(experienceCopy.loadingScene, language)}</b><small>{localize(experienceCopy.loadingSceneDetail, language)}</small></div>}
          {exploration.hydrated && !exploration.state.briefingSeen && <ExplorationBriefing language={language} onStart={startMission} />}
          <MissionHud expedition={exploration.activeExpedition} {...exploration.activeProgress} nextObjectiveId={exploration.nextObjectiveId} language={language} />
          <DiscoveryToast landmarkId={toastLandmarkId} language={language} />
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={localize(sidebarCollapsed ? experienceCopy.expandPanel : experienceCopy.collapsePanel, language)}>{sidebarCollapsed ? "‹" : "›"}</button>
          <div className="map-scale"><span>0</span><i /><span>1 km</span></div>
          <div className="north-marker" aria-label={localize(experienceCopy.north, language)}><span>N</span><b>↑</b></div>
          <div className="stage-note"><span className="stage-pulse" />{localize(experienceCopy.stageNote, language)} · N {language === "zh" ? "前往目标" : "next objective"}</div>
          <div className="stage-controls">
            <button className="reset-view" onClick={resetView}>{localize(experienceCopy.resetView, language)}</button>
            <button className="quality-control" aria-label={localize(experienceCopy.qualityControl, language)} onClick={() => setQualityMode((current) => qualityModes[(qualityModes.indexOf(current) + 1) % qualityModes.length])}>
              <span>{localize(experienceCopy.quality, language)}</span><b>{localize(qualityCopy[qualityMode], language)}{qualityMode === "auto" ? ` · ${localize(qualityCopy[quality], language)}` : ""}</b>
            </button>
          </div>
        </div>

        <aside className="map-sidebar" aria-label={localize(experienceCopy.missionControl, language)}>
          <div className="sidebar-section mission-control-panel" style={{ "--mission-color": exploration.activeExpedition.accent } as React.CSSProperties}>
            <span className="sidebar-index">01 / {localize(experienceCopy.missionControl, language)}</span>
            <div className="mission-title-row"><div><small>{localize(experienceCopy.currentExpedition, language)}</small><h3>{localize(expeditionCopy[exploration.activeExpedition.id].name, language)}</h3></div><b>{exploration.activeProgress.percent}%</b></div>
            <div className="sidebar-progress"><i style={{ width: `${exploration.activeProgress.percent}%` }} /></div>
            {missionComplete ? <div className="mission-complete-message"><b>✓ {localize(experienceCopy.missionComplete, language)}</b><p>{localize(experienceCopy.missionCompleteBody, language)}</p></div> : <button className="objective-action" onClick={focusObjective}><span><small>{localize(experienceCopy.nextObjective, language)}</small><strong>{exploration.nextObjectiveId ? localize(landmarkCopy[exploration.nextObjectiveId].name, language) : "—"}</strong></span><b>{localize(experienceCopy.locate, language)} →</b></button>}
            <div className="world-progress"><span>{localize(experienceCopy.worldProgress, language)}</span><strong>{exploration.state.discoveredLandmarkIds.length}/{allLandmarkIds.length}</strong><i><b style={{ width: `${worldPercent}%` }} /></i></div>
          </div>

          {selected && <div className="sidebar-section selected-landmark" style={{ "--selected-color": selected.accent } as React.CSSProperties}>
            <span className="sidebar-index">02 / {localize(experienceCopy.selectedLandmark, language)}</span>
            <label className="landmark-select"><span>{localize(experienceCopy.landmarkIndex, language)}</span><select value={selectedId} onChange={(event) => chooseLandmark(Number(event.target.value))}>{items.map((item) => <option key={item.id} value={item.id}>{exploration.state.discoveredLandmarkIds.includes(item.id) ? "✓" : "◇"} {String(item.id).padStart(2, "0")} · {localize(landmarkCopy[item.id].name, language)}</option>)}</select></label>
            <div className="selected-title"><span className={`selected-symbol ${selectedDiscovered ? "discovered" : ""}`}>{selectedDiscovered ? "✓" : String(selected.id).padStart(2, "0")}</span><div><h3>{localize(landmarkCopy[selected.id].name, language)}</h3><span>{categoryLabels[language][selected.category]} · {localize(selectedDiscovered ? experienceCopy.discovered : experienceCopy.undiscovered, language)}</span></div></div>
            <p>{localize(landmarkCopy[selected.id].description, language)}</p>
            <div className="detail-chips">
              <span>{localize(experienceCopy.bestExperience, language)} · {localize(landmarkCopy[selected.id].season, language)}</span>
              {selectedAnchor && <span className={selectedAnchor.properties.confidence}>{selectedAnchor.properties.confidence === "triangulated" ? localize(experienceCopy.triangulated, language) : localize(experienceCopy.estimated, language)}</span>}
              {selectedAnchor && <span>LOD {selectedAnchor.properties.lod}</span>}
            </div>
            {selectedDiscovered ? <button className="discovery-action is-complete" disabled>✓ {localize(experienceCopy.discoveredLandmark, language)}</button> : view === "landmark" ? <button className="discovery-action" onClick={discoverSelected}>{localize(experienceCopy.discoverLandmark, language)} <span>＋</span></button> : <button className="focus-button" onClick={() => setView("landmark")}>{localize(experienceCopy.focusLandmark, language)} <span>↗</span></button>}
          </div>}

          <div className="sidebar-section expedition-section">
            <span className="sidebar-index">03 / {localize(experienceCopy.chooseMission, language)}</span>
            <ExpeditionDeck activeId={exploration.state.activeExpeditionId} completedIds={exploration.state.completedExpeditionIds} discoveredIds={exploration.state.discoveredLandmarkIds} language={language} onStart={startMission} onReset={resetProgress} />
          </div>

          <div className="sidebar-section evidence-section">
            <button className="evidence-toggle" onClick={() => setEvidenceOpen((value) => !value)} aria-expanded={evidenceOpen}><span><b>04 / {localize(experienceCopy.evidence, language)}</b><small>{evidenceSources.length} {localize(experienceCopy.sources, language)} · WGS84</small></span><span>{evidenceOpen ? "−" : "+"}</span></button>
            {evidenceOpen && <div className="evidence-list">{evidenceSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.type} · {source.date ?? source.imageryDate ?? "—"}</span></a>)}</div>}
          </div>
        </aside>
      </div>

      <footer className="map-footer"><span>{localize(experienceCopy.dataLayer, language)}</span><span>{localize(experienceCopy.precisionNote, language)}</span></footer>
    </section>
  );
}
