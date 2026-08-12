import modelReport from "../../public/models/jiangxinzhou-v2/nanjing-eye-model-report.json";
import evidenceLedger from "../../data/jiangxinzhou-v2/nanjing-eye-evidence.json";

export type LandmarkModelBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type LandmarkModelLod = {
  id: string;
  landmarkId: number;
  lod: number;
  url: string;
  bytes: number;
  triangles: number;
  drawCalls: number;
  cableCount: number;
  bounds: LandmarkModelBounds;
  lightingMaterials: string[];
};

export const nanjingEyeLods = modelReport.lods as LandmarkModelLod[];
export const nanjingEyeLod1 = nanjingEyeLods.find((lod) => lod.lod === 1)!;
export const nanjingEyeLod2 = nanjingEyeLods.find((lod) => lod.lod === 2)!;
export const nanjingEyeBounds = nanjingEyeLod2.bounds;
export const nanjingEyeEvidence = evidenceLedger;
export const nanjingEyeSpecification = evidenceLedger.specification;
