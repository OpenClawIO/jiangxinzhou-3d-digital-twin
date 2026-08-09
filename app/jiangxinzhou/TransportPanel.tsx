import type { CSSProperties } from "react";
import { experienceCopy, localize, transportModeLabels, type Language } from "./locales";
import { localizeFeatureName, stopsForTransportLine, transportLines, type TransitMode } from "./mapGeometry";

const modeOrder: TransitMode[] = ["bus", "metro", "shuttle", "tourism", "ferry", "cycle"];

export function TransportPanel({ language, selectedLineId, selectedStopId, onSelectLine, onSelectStop }: {
  language: Language;
  selectedLineId: string;
  selectedStopId?: string;
  onSelectLine: (id: string) => void;
  onSelectStop: (id: string) => void;
}) {
  const selectedLine = transportLines.find((line) => line.id === selectedLineId) ?? transportLines[0];
  const stops = stopsForTransportLine(selectedLine.id);

  return <div className="transport-panel" style={{ "--transit-color": selectedLine.properties.color } as CSSProperties}>
    <div className="transport-summary">
      <span>{transportLines.length} {localize(experienceCopy.lineCount, language)}</span>
      <span>{new Set(transportLines.flatMap((line) => line.properties.stopIds)).size} {localize(experienceCopy.stopCount, language)}</span>
    </div>
    <label className="transport-select">
      <span>{localize(experienceCopy.transportLine, language)}</span>
      <select value={selectedLine.id} onChange={(event) => onSelectLine(event.target.value)}>
        {modeOrder.map((mode) => <optgroup key={mode} label={transportModeLabels[language][mode]}>
          {transportLines.filter((line) => line.properties.mode === mode).map((line) => <option key={line.id} value={line.id}>{line.properties.ref} · {localizeFeatureName(line, language)}</option>)}
        </optgroup>)}
      </select>
    </label>
    <div className="transport-line-card">
      <i />
      <div><small>{transportModeLabels[language][selectedLine.properties.mode]} · {localize(experienceCopy.transportCurrent, language)}</small><strong>{localizeFeatureName(selectedLine, language)}</strong><span>{selectedLine.properties.service[language] ?? selectedLine.properties.service.zh}</span></div>
      <b>{selectedLine.properties.ref}</b>
    </div>
    <div className="transport-meta">
      <span>{localize(experienceCopy.transportVehicle, language)} · {selectedLine.properties.modelKey ? "Blender GLB" : "—"}</span>
      <span>{localize(experienceCopy.roadLabels, language)}</span>
    </div>
    <div className="transport-stop-heading"><b>{localize(experienceCopy.transportStops, language)}</b><span>{stops.length}</span></div>
    <div className="transport-stop-list" role="list">
      {stops.map((stop, index) => <button key={stop.id} role="listitem" className={selectedStopId === stop.id ? "active" : ""} onClick={() => onSelectStop(stop.id)}>
        <span className="stop-sequence">{String(index + 1).padStart(2, "0")}</span>
        <span><strong>{localizeFeatureName(stop, language)}</strong><small>{localize(stop.properties.confidence === "triangulated" ? experienceCopy.transportCrossChecked : experienceCopy.transportEstimated, language)}</small></span>
        <b>↗</b>
      </button>)}
    </div>
  </div>;
}
