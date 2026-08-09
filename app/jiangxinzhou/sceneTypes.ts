import type { Landmark } from "./landmarks";
import type { Language } from "./locales";
import type { Point3 } from "./mapGeometry";

export type ViewMode = "overview" | "route" | "landmark";
export type LayerKey = "roads" | "buildings" | "landscape" | "landmarks";
export type LayerVisibility = Record<LayerKey, boolean>;
export type SceneQuality = "high" | "balanced" | "efficiency";

export type JiangxinzhouSceneProps = {
  items: Landmark[];
  selectedId: number;
  onSelect: (id: number) => void;
  onReady: () => void;
  routeId: string;
  view: ViewMode;
  target: Point3;
  layers: LayerVisibility;
  language: Language;
  quality: SceneQuality;
};
