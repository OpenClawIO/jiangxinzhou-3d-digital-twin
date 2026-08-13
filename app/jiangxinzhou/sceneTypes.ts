import type { Landmark } from "./landmarks";
import type { Language } from "./locales";
import type { CameraCommand, CameraPhase, LayerVisibility, SceneFocus, SceneQuality } from "./interactionState";

export type { LayerKey, LayerVisibility, SceneQuality, ViewMode } from "./interactionState";

export type ViewportInsets = { top: number; right: number; bottom: number; left: number };

export type JiangxinzhouSceneProps = {
  items: Landmark[];
  selectedId: number;
  onSelect: (id: number) => void;
  onReady: () => void;
  onScaleChange: (meters: number) => void;
  celestialTimestamp: number;
  routeId: string;
  focus: SceneFocus;
  cameraCommand: CameraCommand;
  cameraPhase: CameraPhase;
  reducedMotion: boolean;
  viewportInsets: ViewportInsets;
  onCameraPhaseChange: (phase: CameraPhase) => void;
  onSceneInteractionStart: () => void;
  onDetailedAssetStateChange: (state: "idle" | "loading" | "ready") => void;
  layers: LayerVisibility;
  language: Language;
  quality: SceneQuality;
  objectiveId?: number;
  expeditionLandmarkIds: readonly number[];
  discoveredLandmarkIds: readonly number[];
  selectedTransportLineId: string;
  selectedTransportStopId?: string;
  onSelectTransportStop: (id: string) => void;
  selectedCrossingId: string;
  onSelectCrossing: (id: string) => void;
};
