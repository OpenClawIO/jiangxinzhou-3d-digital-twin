import type { Point3 } from "./mapGeometry";

export type PetSpecies = "dog" | "cat" | "rabbit" | "egret";

export type PetAction =
  | "wander"
  | "sniff"
  | "sit"
  | "stretch"
  | "rest"
  | "hop"
  | "graze"
  | "alert"
  | "wade"
  | "preen"
  | "takeoff";

export type PetAgent = {
  id: string;
  species: PetSpecies;
  anchorId: string;
  offset: [number, number, number];
  radiusM: number;
  phase: number;
  cycleMs: number;
  scale: number;
};

export type PetMotion = {
  action: PetAction;
  progress: number;
  displacement: [number, number, number];
  heading: number;
  lift: number;
  bodyBob: number;
  wingOpen: number;
};

export const PET_GROUND_Y = 0.32;

export const PET_AGENTS: readonly PetAgent[] = [
  {
    id: "island-dog-01",
    species: "dog",
    anchorId: "qingao-forest-park",
    offset: [-30, 0, 16],
    radiusM: 26,
    phase: 0.12,
    cycleMs: 15_000,
    scale: 1.0,
  },
  {
    id: "island-cat-01",
    species: "cat",
    anchorId: "rocho-cafe",
    offset: [18, 0, -12],
    radiusM: 17,
    phase: 0.37,
    cycleMs: 20_000,
    scale: 0.88,
  },
  {
    id: "island-rabbit-01",
    species: "rabbit",
    anchorId: "pink-field",
    offset: [-14, 0, 10],
    radiusM: 22,
    phase: 0.63,
    cycleMs: 12_000,
    scale: 0.82,
  },
  {
    id: "island-egret-01",
    species: "egret",
    anchorId: "riverwalk",
    offset: [22, 0, -8],
    radiusM: 19,
    phase: 0.81,
    cycleMs: 18_000,
    scale: 0.92,
  },
];

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value: number): number {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function cycle(agent: PetAgent, elapsedMs: number): number {
  const value = elapsedMs / agent.cycleMs + agent.phase;
  return ((value % 1) + 1) % 1;
}

function actionFor(species: PetSpecies, value: number): { action: PetAction; progress: number } {
  const phases: Record<PetSpecies, Array<[number, number, PetAction]>> = {
    dog: [[0, 0.48, "wander"], [0.48, 0.66, "sniff"], [0.66, 0.82, "sit"], [0.82, 1, "wander"]],
    cat: [[0, 0.46, "wander"], [0.46, 0.61, "stretch"], [0.61, 0.84, "rest"], [0.84, 1, "wander"]],
    rabbit: [[0, 0.35, "hop"], [0.35, 0.58, "graze"], [0.58, 0.72, "alert"], [0.72, 1, "hop"]],
    egret: [[0, 0.42, "wade"], [0.42, 0.64, "preen"], [0.64, 0.76, "takeoff"], [0.76, 1, "wade"]],
  };
  const phase = phases[species].find(([start, end]) => value >= start && value < end) ?? phases[species][0];
  return { action: phase[2], progress: clamp((value - phase[0]) / (phase[1] - phase[0])) };
}

export function petMotionFor(agent: PetAgent, elapsedMs: number): PetMotion {
  const value = cycle(agent, elapsedMs);
  const { action, progress } = actionFor(agent.species, value);
  const travel = action === "wander" || action === "hop" || action === "wade" || action === "takeoff";
  const angle = value * Math.PI * 2;
  const stride = travel ? Math.sin(angle) : Math.sin(angle * 0.5) * 0.12;
  const hop = action === "hop" ? Math.max(0, Math.sin(progress * Math.PI * 2)) * 0.52 : 0;
  const takeoff = action === "takeoff" ? smoothstep(progress) : 0;
  const displacement: [number, number, number] = [
    Math.cos(angle) * agent.radiusM * 0.72,
    hop + takeoff * 1.8,
    Math.sin(angle * 1.18) * agent.radiusM * 0.46,
  ];
  const heading = Math.atan2(Math.cos(angle * 1.18), -Math.sin(angle));
  return {
    action,
    progress,
    displacement,
    heading,
    lift: takeoff,
    bodyBob: stride * (action === "sit" || action === "rest" ? 0.025 : 0.07),
    wingOpen: action === "takeoff" ? smoothstep(progress) : action === "preen" ? 0.16 + Math.sin(progress * Math.PI * 2) * 0.12 : 0.04,
  };
}

export function petDisplayName(species: PetSpecies, language: "zh" | "en"): string {
  const names: Record<PetSpecies, { zh: string; en: string }> = {
    dog: { zh: "岛岛 · 小狗", en: "Daodao · Dog" },
    cat: { zh: "樱樱 · 小猫", en: "Yingying · Cat" },
    rabbit: { zh: "花花 · 小兔", en: "Huahua · Rabbit" },
    egret: { zh: "鹭鹭 · 白鹭", en: "Lulu · Egret" },
  };
  return names[species][language];
}

export function petAnchorPosition(anchor: Point3, agent: PetAgent): Point3 {
  return [anchor[0] + agent.offset[0], PET_GROUND_Y + agent.offset[1], anchor[2] + agent.offset[2]];
}
