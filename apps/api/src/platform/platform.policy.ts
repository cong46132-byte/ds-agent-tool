import type { GenerationCapability, GenerationParameters } from "@ds/contracts";

export const models = [
  { id: "doubao-seedance-1-0-pro-fast-251015", name: "豆包 Seedance 1.0 Pro Fast", kind: "video", requiredTier: "FREE" },
  { id: "doubao-seedance-2-5-260628", name: "豆包 Seedance 2.5", kind: "video", requiredTier: "FREE" },
  { id: "seedream-image-flash", name: "豆包 Seedream 5.0 Flash", kind: "image", requiredTier: "FREE" },
  { id: "doubao-seedream-4-0-20260415", name: "豆包 Seedream 4.0", kind: "image", requiredTier: "FREE" },
  { id: "wanxiang-image", name: "通义万相 · 商业图片", kind: "image", requiredTier: "FREE" },
  { id: "hunyuan-image", name: "腾讯混元 · 图片创作", kind: "image", requiredTier: "PRO" },
] as const;

export const tierRank = { FREE: 0, BASIC: 1, PRO: 2, VIP: 3 } as const;

/** 深度复刻的时长/分辨率上限，随订阅档位提升（PRD F-010）。 */
export const videoRecreationLimits: Record<keyof typeof tierRank, { duration: "15s" | "30s" | "60s"; resolution: "720p" | "1080p" }> = {
  FREE: { duration: "15s", resolution: "720p" },
  BASIC: { duration: "30s", resolution: "720p" },
  PRO: { duration: "60s", resolution: "1080p" },
  VIP: { duration: "60s", resolution: "1080p" },
};

export function estimateCredits(capability: GenerationCapability, parameters: GenerationParameters) {
  const video = capability === "director_video" || capability === "video_recreation";
  const base: Record<GenerationCapability, number> = {
    product_white_background: 10, image_retouche: 10, product_detail_set: 10,
    virtual_try_on: 20, product_use: 15, clothing_redesign: 15, face_three_view: 10, person_four_view: 10, model_face_swap: 15, face_fusion: 15, person_in_scene: 15, person_realism: 10, director_video: 60, video_recreation: 90,
  };
  const seconds = parameters.duration ? Number.parseInt(parameters.duration, 10) : 15;
  const durationMultiplier = video ? seconds / 15 : 1;
  const qualityMultiplier = parameters.resolution === "1080p" || parameters.resolution === "2K" ? 2 : parameters.resolution === "480p" ? 0.5 : 1;
  const count = capability === "product_detail_set" ? parameters.count : 1;
  return Math.ceil(base[capability] * durationMultiplier * qualityMultiplier * count);
}

export function defaultsFor(capability: GenerationCapability) {
  const video = capability === "director_video" || capability === "video_recreation";
  return video
    ? { model: "doubao-seedance-1-0-pro-fast-251015", ratio: "9:16", resolution: "720p", duration: "5s", format: "MP4", count: 1 }
    : { model: capability === "product_white_background" || capability === "product_detail_set" || capability === "image_retouche" || capability === "virtual_try_on" || capability === "product_use" || capability === "clothing_redesign" || capability === "face_three_view" || capability === "person_four_view" || capability === "model_face_swap" || capability === "face_fusion" || capability === "person_in_scene" || capability === "person_realism" ? "seedream-image-flash" : "wanxiang-image", ratio: "1:1", resolution: "1K", format: "PNG", count: capability === "product_detail_set" ? 4 : 1 };
}
