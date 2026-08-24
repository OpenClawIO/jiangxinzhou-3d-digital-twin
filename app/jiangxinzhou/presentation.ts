export type ExperienceLens = "cinematic" | "atlas" | "expedition";

export type LocalizedText = { zh: string; en: string };

export const lensCopy: Record<ExperienceLens, { label: LocalizedText; eyebrow: LocalizedText; description: LocalizedText }> = {
  cinematic: {
    label: { zh: "观景", en: "Cinematic" },
    eyebrow: { zh: "进入江岛", en: "Enter the island" },
    description: { zh: "以镜头感受江心洲的水岸、桥梁与光线", en: "Feel the island through water, bridges and light" },
  },
  atlas: {
    label: { zh: "图谱", en: "Atlas" },
    eyebrow: { zh: "查看图层", en: "Read the layers" },
    description: { zh: "打开道路、交通、地标与证据资料", en: "Open roads, transit, landmarks and evidence" },
  },
  expedition: {
    label: { zh: "共游", en: "Expedition" },
    eyebrow: { zh: "开始探索", en: "Start exploring" },
    description: { zh: "沿路线移动、记录地标并与房间同行者相遇", en: "Move, discover and meet fellow explorers" },
  },
};

export const lensOrder: ExperienceLens[] = ["cinematic", "atlas", "expedition"];

export function parseExperienceLens(search: string | URLSearchParams): ExperienceLens {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  const value = params.get("lens");
  return value === "atlas" || value === "expedition" ? value : "cinematic";
}

export function writeExperienceLens(params: URLSearchParams, lens: ExperienceLens) {
  if (lens === "cinematic") params.delete("lens");
  else params.set("lens", lens);
  return params;
}

