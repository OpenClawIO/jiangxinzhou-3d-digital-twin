"use client";

import { useState } from "react";
import type { Landmark } from "./landmarks";
import { landmarkCopy, localize, type Language, type LocalizedText } from "./locales";
import type { CollectionEntry, PlayerState, RoomStatus, TeamObjective, WorldEvent } from "./game/types";

function t(language: Language, value: LocalizedText): string {
  return localize(value, language);
}

export function GameHud({ language, mode, status, playerCount, capacity, player, collectionCount, xp, onOpenIdentity, onJoinRoom, onLeaveRoom }: {
  language: Language;
  mode: "solo" | "room";
  status: RoomStatus;
  playerCount: number;
  capacity: number;
  player?: PlayerState;
  collectionCount: number;
  xp: number;
  onOpenIdentity: () => void;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
}) {
  const room = mode === "room";
  const statusText = status === "ready" ? (room ? (language === "zh" ? "共享中" : "Shared") : (language === "zh" ? "本地" : "Local")) : status === "joining" ? (language === "zh" ? "连接中" : "Joining") : (language === "zh" ? "离线" : "Offline");
  return <div className="game-hud" aria-label={language === "zh" ? "游戏状态" : "Game status"}>
    <div className="game-hud-main">
      <span className="game-hud-kicker"><i />{room ? (language === "zh" ? "共享世界" : "SHARED WORLD") : (language === "zh" ? "单人探索" : "SOLO EXPEDITION")}</span>
      <strong>{player?.displayName ?? (language === "zh" ? "游客" : "Visitor")}</strong>
      <small>{statusText} · {playerCount}/{capacity} · {collectionCount} {language === "zh" ? "已记录" : "logged"} · {xp} XP</small>
    </div>
    <div className="game-hud-actions">
      <button type="button" onClick={onOpenIdentity} aria-label={language === "zh" ? "编辑身份" : "Edit identity"}>◉</button>
      {room ? <button type="button" onClick={onLeaveRoom}>{language === "zh" ? "离开房间" : "Leave"}</button> : <button type="button" onClick={onJoinRoom}>{language === "zh" ? "共同探索" : "Join room"}</button>}
    </div>
  </div>;
}

export function NearbyInteractionPrompt({ language, landmark, localPlayer, isNearby, isCompleted, onMove, onObserve }: {
  language: Language;
  landmark?: Landmark;
  localPlayer?: PlayerState;
  isNearby: boolean;
  isCompleted?: boolean;
  onMove: () => void;
  onObserve: () => void;
}) {
  if (!landmark || !localPlayer) return null;
  const name = landmarkCopy[landmark.id] ? t(language, landmarkCopy[landmark.id].name) : landmark.name;
  if (isCompleted) return <div className="nearby-interaction-prompt is-complete" role="status"><div className="nearby-interaction-copy"><span>✓</span><div><small>{language === "zh" ? "个人图鉴已记录" : "Already in your collection"}</small><strong>{name}</strong></div></div></div>;
  const moving = localPlayer.status === "moving";
  return <div className={`nearby-interaction-prompt ${isNearby ? "is-nearby" : ""}`} role="dialog" aria-label={language === "zh" ? "地标互动" : "Landmark interaction"}>
    <div className="nearby-interaction-copy"><span>{isNearby ? "◉" : "◎"}</span><div><small>{isNearby ? (language === "zh" ? "已进入观察范围" : "Within observation range") : (language === "zh" ? "前往目标" : "Reach target")}</small><strong>{name}</strong></div></div>
    {isNearby ? <button type="button" onClick={onObserve}>{language === "zh" ? "观察 · 记录" : "Observe · log"}<b>＋</b></button> : <button type="button" onClick={onMove} disabled={moving}>{moving ? (language === "zh" ? "沿道路移动中…" : "Moving on route…") : (language === "zh" ? "沿道路前往" : "Move along route")}<b>→</b></button>}
  </div>;
}

export function QuestTracker({ language, title, progress, nextTarget, onFocus }: { language: Language; title: string; progress: { completed: number; total: number; percent: number }; nextTarget?: string; onFocus: () => void }) {
  return <section className="quest-tracker" aria-label={language === "zh" ? "当前探索任务" : "Current quest"}>
    <div className="quest-tracker-heading"><span>{language === "zh" ? "当前任务" : "CURRENT QUEST"}</span><b>{progress.percent}%</b></div>
    <strong>{title}</strong>
    <div className="quest-tracker-bar"><i style={{ width: `${progress.percent}%` }} /></div>
    <button type="button" onClick={onFocus}><span>{nextTarget ?? (language === "zh" ? "自由探索" : "Free exploration")}</span><b>→</b></button>
  </section>;
}

export function TeamObjectivePanel({ language, objectives }: { language: Language; objectives: readonly TeamObjective[] }) {
  if (objectives.length === 0) return null;
  return <section className="team-objective-panel" aria-label={language === "zh" ? "团队任务" : "Team objectives"}>
    <div className="game-panel-heading"><span>{language === "zh" ? "房间任务" : "ROOM OBJECTIVES"}</span><b>SYNC</b></div>
    {objectives.map((objective) => <div className="team-objective" key={objective.id} data-complete={objective.completed}>
      <div><strong>{t(language, objective.title)}</strong><small>{t(language, objective.description)}</small></div>
      <span>{objective.progress}/{objective.targetCount}</span>
      <i><b style={{ width: `${Math.min(100, objective.progress / Math.max(1, objective.targetCount) * 100)}%` }} /></i>
    </div>)}
  </section>;
}

export function CollectionBook({ language, entries, landmarks }: { language: Language; entries: readonly CollectionEntry[]; landmarks: readonly Landmark[] }) {
  return <section className="collection-book" aria-label={language === "zh" ? "个人地标图鉴" : "Personal collection"}>
    <div className="game-panel-heading"><span>{language === "zh" ? "个人图鉴" : "COLLECTION"}</span><b>{entries.length}/{landmarks.length}</b></div>
    <div className="collection-grid">{landmarks.map((landmark) => {
      const entry = entries.find((item) => item.landmarkId === landmark.id);
      return <span key={landmark.id} className={entry ? "is-found" : ""} title={entry ? t(language, landmarkCopy[landmark.id].name) : (language === "zh" ? "尚未记录" : "Not logged")}>{entry ? "✓" : "·"}<small>{String(landmark.id).padStart(2, "0")}</small></span>;
    })}</div>
  </section>;
}

export function RoomPresencePanel({ language, players, localPlayerId }: { language: Language; players: readonly PlayerState[]; localPlayerId?: string }) {
  if (players.length < 2) return null;
  return <section className="room-presence-panel" aria-label={language === "zh" ? "房间成员" : "Room members"}>
    <div className="game-panel-heading"><span>{language === "zh" ? "共同探索者" : "EXPLORERS"}</span><b>{players.length}</b></div>
    <div className="room-presence-list">{players.slice(0, 6).map((player) => <span key={player.playerId} className={player.playerId === localPlayerId ? "is-self" : ""}><i style={{ background: player.color }} />{player.displayName}{player.playerId === localPlayerId ? " · YOU" : ""}</span>)}</div>
  </section>;
}

export function WorldEventBanner({ language, event, now }: { language: Language; event?: WorldEvent; now: number }) {
  if (!event || event.endsAt <= now) return null;
  const label = event.type === "celestial" ? (event.payload.phase === "dawn" ? (language === "zh" ? "日出事件" : "DAWN EVENT") : (language === "zh" ? "日落事件" : "DUSK EVENT")) : event.type === "team" ? (language === "zh" ? "团队任务进行中" : "TEAM OBJECTIVE ACTIVE") : (language === "zh" ? "实时地图事件" : "LIVE MAP EVENT");
  return <div className="world-event-banner" role="status"><i />{label}</div>;
}

export function ReconnectBanner({ language, status, onReconnect }: { language: Language; status: RoomStatus; onReconnect: () => void }) {
  if (status === "ready") return null;
  return <div className="reconnect-banner" role="status"><span>{status === "joining" ? (language === "zh" ? "正在进入探索世界…" : "Entering exploration world…") : (language === "zh" ? "多人服务不可用，地图仍可继续探索" : "Multiplayer unavailable; the map remains playable")}</span><button type="button" onClick={onReconnect}>{language === "zh" ? "重试" : "Retry"}</button></div>;
}

export function IdentityPicker({ language, displayName, color, onSave, onClose }: { language: Language; displayName: string; color: string; onSave: (displayName: string, color: string) => void; onClose: () => void }) {
  const [name, setName] = useState(displayName);
  const [selectedColor, setSelectedColor] = useState(color);
  const colors = ["#f0bd5a", "#62c3b2", "#d97978", "#7fa8df", "#c58fdb", "#a8c56f"];
  return <div className="identity-picker-scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="identity-picker" role="dialog" aria-modal="true" aria-label={language === "zh" ? "游客身份" : "Visitor identity"}>
      <header><div><small>{language === "zh" ? "轻量身份" : "LIGHT IDENTITY"}</small><h3>{language === "zh" ? "设置你的探索标记" : "Set your explorer marker"}</h3></div><button type="button" onClick={onClose} aria-label={language === "zh" ? "关闭" : "Close"}>×</button></header>
      <label><span>{language === "zh" ? "昵称" : "Display name"}</span><input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} /></label>
      <fieldset><legend>{language === "zh" ? "颜色" : "Marker color"}</legend><div className="identity-colors">{colors.map((item) => <button type="button" key={item} className={selectedColor === item ? "active" : ""} style={{ "--identity-color": item } as React.CSSProperties} onClick={() => setSelectedColor(item)} aria-label={item} />)}</div></fieldset>
      <button type="button" className="identity-save" onClick={() => { onSave(name, selectedColor); onClose(); }}>{language === "zh" ? "保存身份" : "Save identity"} →</button>
    </section>
  </div>;
}
