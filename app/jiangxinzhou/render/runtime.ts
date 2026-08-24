import type { QualityMode, SceneQuality } from "../interactionState";

export type RenderTier = SceneQuality;
export type RenderMode = "webgl-v6" | "legacy";
export type RenderContextState = "ready" | "lost" | "recovering" | "failed";

export type RenderCapabilities = {
  webgl2: boolean;
  maxTextureSize: number;
  maxSamples: number;
  timerQuery: boolean;
  parallelCompile: boolean;
};

export type RenderProfile = {
  tier: RenderTier;
  dpr: [number, number];
  postprocessing: "full" | "lite" | "off";
  shadowMapSize: 2048 | 1024 | 0;
  environmentSize: 128 | 64 | 0;
  ambientFps: 20 | 12 | 0;
  trafficFps: 30 | 15 | 0;
  multisampling: 4 | 2 | 0;
};

export type RenderTelemetry = {
  tier: RenderTier;
  fps: number;
  dpr: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  contextState: RenderContextState;
  contextLosses: number;
};

export type AdaptiveQualityState = {
  tier: RenderTier;
  lowWindows: number;
  highWindows: number;
  flipFlops: number;
  lastDirection?: "up" | "down";
  locked: boolean;
};

const TIER_ORDER: RenderTier[] = ["efficiency", "balanced", "high"];

const PROFILE_BY_TIER: Record<RenderTier, RenderProfile> = {
  high: {
    tier: "high",
    dpr: [1, 1.75],
    postprocessing: "full",
    shadowMapSize: 2048,
    environmentSize: 128,
    ambientFps: 20,
    trafficFps: 30,
    multisampling: 4,
  },
  balanced: {
    tier: "balanced",
    dpr: [0.9, 1.4],
    postprocessing: "lite",
    shadowMapSize: 1024,
    environmentSize: 64,
    ambientFps: 12,
    trafficFps: 15,
    multisampling: 2,
  },
  efficiency: {
    tier: "efficiency",
    dpr: [0.75, 1],
    postprocessing: "off",
    shadowMapSize: 0,
    environmentSize: 0,
    ambientFps: 0,
    trafficFps: 0,
    multisampling: 0,
  },
};

export function renderProfileFor(tier: RenderTier, options: { reducedMotion?: boolean; mode?: RenderMode } = {}): RenderProfile {
  const profile = PROFILE_BY_TIER[tier];
  if (options.mode === "legacy") return {
    ...profile,
    postprocessing: "off",
    shadowMapSize: 0,
    environmentSize: 0,
    multisampling: 0,
    ambientFps: options.reducedMotion ? 0 : profile.ambientFps,
    trafficFps: options.reducedMotion ? 0 : profile.trafficFps,
  };
  if (!options.reducedMotion) return profile;
  return { ...profile, ambientFps: 0, trafficFps: 0 };
}

export function detectRenderCapabilities(): RenderCapabilities {
  if (typeof document === "undefined" || typeof window === "undefined" || !window.WebGL2RenderingContext) {
    return { webgl2: false, maxTextureSize: 0, maxSamples: 0, timerQuery: false, parallelCompile: false };
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return { webgl2: false, maxTextureSize: 0, maxSamples: 0, timerQuery: false, parallelCompile: false };
    const capabilities = {
      webgl2: true,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      maxSamples: gl.getParameter(gl.MAX_SAMPLES) as number,
      timerQuery: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2")),
      parallelCompile: Boolean(gl.getExtension("KHR_parallel_shader_compile")),
    };
    // Do not call WEBGL_lose_context here. This probe runs after the real
    // canvas is mounted; on Chromium it can invalidate the shared GPU
    // context during a refresh even though the temporary canvas is separate.
    return capabilities;
  } catch {
    return { webgl2: false, maxTextureSize: 0, maxSamples: 0, timerQuery: false, parallelCompile: false };
  }
}

export function initialAutoTier(capabilities: RenderCapabilities, hardware: { memoryGb?: number; cores?: number } = {}): RenderTier {
  const memory = hardware.memoryGb ?? 8;
  const cores = hardware.cores ?? 8;
  if (!capabilities.webgl2 || capabilities.maxTextureSize < 8192 || capabilities.maxSamples < 2 || memory <= 4 || cores <= 4) return "efficiency";
  return "balanced";
}

export function createAdaptiveQualityState(tier: RenderTier): AdaptiveQualityState {
  return { tier, lowWindows: 0, highWindows: 0, flipFlops: 0, locked: false };
}

function adjacentTier(tier: RenderTier, direction: "up" | "down"): RenderTier {
  const index = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, index + (direction === "up" ? 1 : -1)))];
}

function changeTier(state: AdaptiveQualityState, direction: "up" | "down"): AdaptiveQualityState {
  if (state.locked || (direction === "up" && state.tier === "high") || (direction === "down" && state.tier === "efficiency")) {
    return { ...state, lowWindows: 0, highWindows: 0 };
  }
  const nextTier = adjacentTier(state.tier, direction);
  const flipFlops = state.lastDirection && state.lastDirection !== direction ? state.flipFlops + 1 : state.flipFlops;
  if (flipFlops >= 3) {
    const lowerTier = TIER_ORDER.indexOf(nextTier) < TIER_ORDER.indexOf(state.tier) ? nextTier : state.tier;
    return { tier: lowerTier, lowWindows: 0, highWindows: 0, flipFlops, lastDirection: "down", locked: true };
  }
  return { tier: nextTier, lowWindows: 0, highWindows: 0, flipFlops, lastDirection: direction, locked: false };
}

export function sampleAdaptiveQuality(state: AdaptiveQualityState, fps: number, mobile: boolean): AdaptiveQualityState {
  if (state.locked || !Number.isFinite(fps) || fps <= 0) return state;
  const lowThreshold = mobile ? 27 : 45;
  const highThreshold = mobile ? 50 : 55;
  if (fps < lowThreshold) {
    const next = { ...state, lowWindows: state.lowWindows + 1, highWindows: 0 };
    return next.lowWindows >= 3 ? changeTier(next, "down") : next;
  }
  if (fps > highThreshold) {
    const next = { ...state, highWindows: state.highWindows + 1, lowWindows: 0 };
    return next.highWindows >= 5 ? changeTier(next, "up") : next;
  }
  return { ...state, lowWindows: 0, highWindows: 0 };
}

export function resolveRenderTier(mode: QualityMode, autoTier: RenderTier): RenderTier {
  return mode === "auto" ? autoTier : mode;
}

export function scheduledFrameRate(profile: RenderProfile, activities: { ambient: boolean; traffic: boolean; hidden?: boolean }): number {
  if (activities.hidden) return 0;
  return Math.max(activities.ambient ? profile.ambientFps : 0, activities.traffic ? profile.trafficFps : 0);
}

export function parseRenderMode(search: string | URLSearchParams): RenderMode {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  return params.get("renderer") === "legacy" ? "legacy" : "webgl-v6";
}

export function timestampBucket(timestamp: number, intervalMs: number): number {
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

export function contextRecoveryPolicy(contextLosses: number): { forceTier?: RenderTier; retry: boolean; fallback: boolean } {
  if (contextLosses <= 0) return { retry: false, fallback: false };
  if (contextLosses === 1) return { retry: true, fallback: false };
  if (contextLosses === 2) return { forceTier: "efficiency", retry: true, fallback: false };
  return { forceTier: "efficiency", retry: false, fallback: true };
}
