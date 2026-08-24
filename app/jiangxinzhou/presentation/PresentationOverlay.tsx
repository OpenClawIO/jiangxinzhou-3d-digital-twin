"use client";

import type { Language } from "../locales";
import { languageLabels, localize } from "../locales";
import { lensCopy, lensOrder, type ExperienceLens } from "../presentation";

export function PresentationOverlay({
  lens,
  language,
  title,
  time,
  period,
  ready,
  onLanguageChange,
  onLensChange,
  onReset,
  onOpenSettings,
  onOpenTime,
}: {
  lens: ExperienceLens;
  language: Language;
  title: string;
  time: string;
  period: string;
  ready: boolean;
  onLanguageChange: (language: Language) => void;
  onLensChange: (lens: ExperienceLens) => void;
  onReset: () => void;
  onOpenSettings: () => void;
  onOpenTime: () => void;
}) {
  return <>
    <header className="v14-brand-lockup">
      <span>JIANGXINZHOU / 3D TIME-SPACE</span>
      <strong>{title}</strong>
      <small>{ready ? localize(lensCopy[lens].description, language) : (language === "zh" ? "正在建立江岛空间" : "Building the island space")}</small>
    </header>
    <div className="v14-top-controls">
      <button className="v14-time-chip" type="button" onClick={onOpenTime} aria-label={language === "zh" ? "打开时间与天空" : "Open time and sky"}>
        <i aria-hidden="true">{period === "night" ? "☾" : "☀"}</i>
        <span><b>{time}</b><small>{period === "night" ? (language === "zh" ? "南京 · 夜" : "Nanjing · night") : (language === "zh" ? "南京 · 实时" : "Nanjing · live")}</small></span>
      </button>
      <div className="v14-language" role="group" aria-label={language === "zh" ? "语言" : "Language"}>
        {(Object.keys(languageLabels) as Language[]).map((value) => <button key={value} type="button" className={language === value ? "active" : ""} aria-pressed={language === value} onClick={() => onLanguageChange(value)}>{languageLabels[value]}</button>)}
      </div>
      <button className="v14-icon-button" type="button" onClick={onReset} aria-label={language === "zh" ? "返回江岛总览" : "Reset island view"}>↺</button>
      <button className="v14-icon-button" type="button" onClick={onOpenSettings} aria-label={language === "zh" ? "打开图层设置" : "Open layer settings"}>◫</button>
    </div>
    <nav className="v14-lens-dock" aria-label={language === "zh" ? "体验模式" : "Experience lens"}>
      {lensOrder.map((entry) => <button key={entry} type="button" className={lens === entry ? "active" : ""} aria-pressed={lens === entry} onClick={() => onLensChange(entry)}>
        <span>{lensCopy[entry].label[language]}</span>
        <small>{lensCopy[entry].eyebrow[language]}</small>
      </button>)}
    </nav>
  </>;
}

export function CinematicPrompt({ language, onOpenAtlas, onFocusLandmark }: { language: Language; onOpenAtlas: () => void; onFocusLandmark: () => void }) {
  return <div className="v14-cinematic-prompt" role="status">
    <span className="v14-prompt-mark" aria-hidden="true"><i /></span>
    <div><b>{language === "zh" ? "江心洲，正在呼吸" : "Jiangxinzhou is alive"}</b><small>{language === "zh" ? "拖拽旋转 · 滚轮缩放 · 选择一个地标开始" : "Drag to orbit · scroll to zoom · choose a landmark to begin"}</small></div>
    <div className="v14-prompt-actions"><button type="button" onClick={onFocusLandmark}>{language === "zh" ? "看一处地标" : "View a landmark"}</button><button type="button" onClick={onOpenAtlas}>{language === "zh" ? "打开图谱" : "Open atlas"}</button></div>
  </div>;
}

