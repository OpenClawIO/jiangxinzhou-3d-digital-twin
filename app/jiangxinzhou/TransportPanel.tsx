import { useEffect, useState, type CSSProperties } from "react";
import { experienceCopy, localize, transportModeLabels, type Language } from "./locales";
import { localizeFeatureName, stopsForTransportLine, transportLines, transportStops, type TransitMode } from "./mapGeometry";
import { formatArrivalCountdown, snapshotAgeMs, statusLabel } from "./transit/realtime";
import type { TransitRealtimeState } from "./useTransitRealtime";

const modeOrder: TransitMode[] = ["bus", "metro", "shuttle", "tourism", "ferry", "cycle"];

export function TransportPanel({ language, selectedLineId, selectedStopId, onSelectLine, onSelectStop, realtime }: {
  language: Language;
  selectedLineId: string;
  selectedStopId?: string;
  onSelectLine: (id: string) => void;
  onSelectStop: (id: string) => void;
  realtime: TransitRealtimeState;
}) {
  const selectedLine = transportLines.find((line) => line.id === selectedLineId) ?? transportLines[0];
  const stops = stopsForTransportLine(selectedLine.id);
  const [expandedLineId, setExpandedLineId] = useState<string>();
  const stopsExpanded = expandedLineId === selectedLine.id;
  const visibleStops = stopsExpanded ? stops : stops.slice(0, 6);
  const geometryLabel = selectedLine.properties.geometryKind === "verified-road-centerline"
    ? experienceCopy.transportGeometryVerified
    : selectedLine.properties.geometryKind === "road-network-derived"
      ? experienceCopy.transportGeometryDerived
      : selectedLine.properties.geometryKind === "partially-road-network-derived"
        ? experienceCopy.transportGeometryPartial
        : experienceCopy.transportGeometrySchematic;
  const formatLength = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`;
  const snapshot = realtime.snapshot;
  const [now, setNow] = useState(() => Date.now());
  const lineRealtime = snapshot.lines[selectedLine.id];
  const selectedArrivals = snapshot.arrivals.filter((arrival) => arrival.lineId === selectedLine.id && (!selectedStopId || arrival.stopId === selectedStopId)).slice(0, 3);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const ageSeconds = Math.round(snapshotAgeMs(snapshot, now) / 1000);
  const feedLabel = snapshot.mode === "simulated" ? experienceCopy.transportSimulated : snapshot.mode === "stale" ? experienceCopy.transportDataStale : experienceCopy.transportLive;

  return <div className="transport-panel" style={{ "--transit-color": selectedLine.properties.color } as CSSProperties}>
    <div className="transport-summary">
      <span>{transportLines.length} {localize(experienceCopy.lineCount, language)}</span>
      <span>{new Set(transportLines.flatMap((line) => line.properties.stopIds)).size} {localize(experienceCopy.stopCount, language)}</span>
    </div>
    <div className={`transit-feed-card is-${realtime.connection}`}>
      <div><small>{localize(experienceCopy.transportRealtime, language)}</small><strong>{localize(feedLabel, language)}</strong><span>{localize(experienceCopy.transportUpdated, language)} · {ageSeconds}{language === "zh" ? " 秒前" : "s ago"}</span></div>
      <button type="button" onClick={realtime.refresh} aria-label={localize(experienceCopy.transportRefresh, language)}>↻</button>
    </div>
    <div className="transport-mode-tabs" aria-label={localize(experienceCopy.transportModes, language)}>
      {modeOrder.map((mode) => {
        const firstLine = transportLines.find((line) => line.properties.mode === mode);
        if (!firstLine) return null;
        return <button key={mode} className={selectedLine.properties.mode === mode ? "active" : ""} aria-pressed={selectedLine.properties.mode === mode} onClick={() => onSelectLine(firstLine.id)}>{transportModeLabels[language][mode]}</button>;
      })}
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
      <div><small>{transportModeLabels[language][selectedLine.properties.mode]} · {localize(experienceCopy.transportCurrent, language)}</small><strong>{localizeFeatureName(selectedLine, language)}</strong><span>{selectedLine.properties.service[language] ?? selectedLine.properties.service.zh}</span>{lineRealtime && <em className={`transit-status status-${lineRealtime.status}`}>{statusLabel(lineRealtime.status, language)}{lineRealtime.delaySec > 0 ? ` · +${Math.round(lineRealtime.delaySec / 60)}${language === "zh" ? " 分钟" : " min"}` : ""}</em>}</div>
      <b>{selectedLine.properties.ref}</b>
    </div>
    <div className="transport-meta">
      <span>{localize(experienceCopy.transportVehicle, language)} · {selectedLine.properties.modelKey ? "Blender GLB" : "—"}</span>
      <span>{localize(geometryLabel, language)} · {localize(experienceCopy.transportMeasuredLength, language)} {formatLength(selectedLine.properties.measuredGeometryLengthM)}</span>
      {selectedLine.properties.officialLengthM && <span>{localize(experienceCopy.transportOfficialLength, language)} {formatLength(selectedLine.properties.officialLengthM)}</span>}
    </div>
    <div className="transit-arrival-card">
      <div className="transit-arrival-heading"><b>{localize(experienceCopy.transportNextArrivals, language)}</b><span>{lineRealtime?.vehicleCount ?? 0} {localize(experienceCopy.transportVehicles, language)}</span></div>
      {selectedArrivals.length > 0 ? selectedArrivals.map((arrival) => {
        const stop = transportStops.find((candidate) => candidate.id === arrival.stopId);
        return <button type="button" key={arrival.id} onClick={() => onSelectStop(arrival.stopId)}><span>{stop ? localizeFeatureName(stop, language) : arrival.stopId}</span><strong>{formatArrivalCountdown(arrival.predictedAt, now, language)}</strong></button>;
      }) : <p>{localize(lineRealtime?.status === "not-running" ? experienceCopy.transportNotRunning : experienceCopy.transportNoArrivals, language)}</p>}
    </div>
    <div className="transport-stop-heading"><b>{localize(experienceCopy.transportStops, language)}</b><span>{stops.length}</span></div>
    <div className="transport-stop-list" role="list">
      {visibleStops.map((stop, index) => <button key={`${selectedLine.id}-${stop.id}-${index}`} role="listitem" className={selectedStopId === stop.id ? "active" : ""} onClick={() => onSelectStop(stop.id)}>
        <span className="stop-sequence">{String(index + 1).padStart(2, "0")}</span>
        <span><strong>{localizeFeatureName(stop, language)}</strong><small>{localize(stop.properties.confidence === "triangulated" ? experienceCopy.transportCrossChecked : experienceCopy.transportEstimated, language)}</small></span>
        <b>↗</b>
      </button>)}
    </div>
    {stops.length > 6 && <button className="transport-stops-toggle" aria-expanded={stopsExpanded} onClick={() => setExpandedLineId(stopsExpanded ? undefined : selectedLine.id)}>{localize(stopsExpanded ? experienceCopy.collapseStops : experienceCopy.showAllStops, language)} <span>{stopsExpanded ? "↑" : `+${stops.length - 6}`}</span></button>}
  </div>;
}
