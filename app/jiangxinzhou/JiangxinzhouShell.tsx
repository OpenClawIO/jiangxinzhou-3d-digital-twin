"use client";

import { useEffect, useState } from "react";
import JiangxinzhouExperience from "./JiangxinzhouExperience";
import type { Landmark } from "./landmarks";
import { pageCopy, type Language } from "./locales";

export default function JiangxinzhouShell({ landmarks }: { landmarks: Landmark[] }) {
  const [language, setLanguage] = useState<Language>("zh");

  useEffect(() => {
    const queryLanguage = new URLSearchParams(window.location.search).get("lang");
    if (queryLanguage === "zh" || queryLanguage === "en") {
      const frame = window.requestAnimationFrame(() => setLanguage(queryLanguage));
      return () => window.cancelAnimationFrame(frame);
    }
    const savedLanguage = window.localStorage.getItem("jiangxinzhou-language");
    if (savedLanguage !== "zh" && savedLanguage !== "en") return undefined;
    const frame = window.requestAnimationFrame(() => setLanguage(savedLanguage));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem("jiangxinzhou-language", nextLanguage);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLanguage);
    window.history.replaceState({}, "", url);
  };

  return (
    <>
      <header className="jiangxinzhou-seo-copy">
        <div><p className="jiangxinzhou-eyebrow">NANJING · JIANGXINZHOU / DIGITAL TWIN V2</p><h1>{pageCopy.title[language]}</h1></div>
        <p>{pageCopy.intro[language]}</p>
      </header>
      <JiangxinzhouExperience landmarks={landmarks} language={language} onLanguageChange={changeLanguage} />
    </>
  );
}
