import type { Landmark } from "./landmarks";
import type { Language } from "./locales";
import type { Point3 } from "./mapGeometry";

export type ViewMode = "regional" | "overview" | "route" | "landmark";
export type LayerKey = "water" | "surroundings" | "roads" | "buildings" | "landscape" | "landmarks" | "crossings" | "transport" | "coordinates";
export type LayerVisibility = Record<LayerKey, boolean>;
export type SceneQuality = "high" | "balanced" | "efficiency";

export type JiangxinzhouSceneProps = {
  items: Landmark[];
  selectedId: number;
  onSelect: (id: number) => void;
  onReady: () => void;
  onScaleChange: (meters: number) => void;
  celestialTimestamp: number;
  routeId: string;
  view: ViewMode;
  target: Point3;
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
