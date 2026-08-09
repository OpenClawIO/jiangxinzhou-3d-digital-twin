"use client";

import { expeditions, type Expedition, type ExpeditionId } from "./exploration";
import { experienceCopy, expeditionCopy, landmarkCopy, localize, type Language } from "./locales";

export function ExplorationBriefing({ language, onStart }: { language: Language; onStart: (id: ExpeditionId) => void }) {
  return <div className="briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
    <div className="briefing-card">
      <div className="briefing-kicker"><span>FIELD 01</span><i /></div>
      <h3 id="briefing-title">{localize(experienceCopy.briefingTitle, language)}</h3>
      <p>{localize(experienceCopy.briefingBody, language)}</p>
      <div className="briefing-missions">
        {expeditions.filter((item) => item.id !== "free-explore").map((expedition, index) => <button key={expedition.id} onClick={() => onStart(expedition.id)} style={{ "--mission-color": expedition.accent } as React.CSSProperties}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{localize(expeditionCopy[expedition.id].name, language)}</strong><small>{localize(expeditionCopy[expedition.id].description, language)}</small></div>
          <b>→</b>
        </button>)}
      </div>
      <div className="briefing-actions">
        <small>{localize(experienceCopy.briefingHint, language)}</small>
        <button onClick={() => onStart("free-explore")}>{localize(experienceCopy.briefingSkip, language)}</button>
      </div>
    </div>
  </div>;
}

export function MissionHud({ expedition, completed, total, percent, nextObjectiveId, language }: {
  expedition: Expedition;
  completed: number;
  total: number;
  percent: number;
  nextObjectiveId?: number;
  language: Language;
}) {
  return <div className="mission-hud" style={{ "--mission-color": expedition.accent } as React.CSSProperties}>
    <div className="mission-hud-top"><span>{localize(experienceCopy.currentExpedition, language)}</span><b>{completed}/{total}</b></div>
    <strong>{localize(expeditionCopy[expedition.id].name, language)}</strong>
    <div className="mission-progress" aria-label={`${localize(experienceCopy.expeditionProgress, language)} ${percent}%`}><i style={{ width: `${percent}%` }} /></div>
    <small>{nextObjectiveId ? <>{localize(experienceCopy.nextObjective, language)} · {localize(landmarkCopy[nextObjectiveId].name, language)}</> : localize(experienceCopy.missionComplete, language)}</small>
  </div>;
}

export function ExpeditionDeck({ activeId, completedIds, discoveredIds, language, onStart, onReset }: {
  activeId: ExpeditionId;
  completedIds: readonly ExpeditionId[];
  discoveredIds: readonly number[];
  language: Language;
  onStart: (id: ExpeditionId) => void;
  onReset: () => void;
}) {
  return <div className="expedition-deck">
    {expeditions.map((expedition) => {
      const active = expedition.id === activeId;
      const completed = completedIds.includes(expedition.id);
      const found = expedition.landmarkIds.filter((id) => discoveredIds.includes(id)).length;
      return <button key={expedition.id} className={active ? "active" : ""} onClick={() => onStart(expedition.id)} style={{ "--mission-color": expedition.accent } as React.CSSProperties}>
        <i />
        <span><strong>{localize(expeditionCopy[expedition.id].name, language)}</strong><small>{expedition.estimatedMinutes ? `${expedition.estimatedMinutes} ${localize(experienceCopy.minutes, language)} · ` : ""}{found}/{expedition.landmarkIds.length}</small></span>
        <b>{completed ? "✓" : active ? localize(experienceCopy.activeMission, language) : "→"}</b>
      </button>;
    })}
    <button className="reset-progress-action" onClick={onReset}>{localize(experienceCopy.resetProgress, language)}</button>
    <small className="local-progress-note">{localize(experienceCopy.localProgress, language)}</small>
  </div>;
}

export function DiscoveryToast({ landmarkId, language }: { landmarkId?: number; language: Language }) {
  if (!landmarkId) return null;
  return <div className="discovery-toast" role="status" aria-live="polite">
    <span>✓</span><div><b>{localize(experienceCopy.discoveryUnlocked, language)}</b><small>{localize(landmarkCopy[landmarkId].name, language)}</small></div>
  </div>;
}
