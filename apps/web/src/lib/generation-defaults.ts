/**
 * 平台目录与默认生成参数的客户端类型镜像。
 * 数据源：GET /api/v1/platform/catalog（见 apps/api/src/platform/platform.controller.ts）。
 */

export interface CapabilityDefaults {
  model: string;
  ratio: string;
  resolution: string;
  format: string;
  duration?: string;
  count: number;
}

export interface PlatformModel {
  id: string;
  name: string;
  kind: string;
  requiredTier: string;
}

export interface RecreationLimit {
  duration: string;
  resolution: string;
  label: string;
}

export interface PlatformCatalog {
  models: PlatformModel[];
  defaults: Record<string, CapabilityDefaults | undefined>;
  subscription: { tier: string; status: string; expiresAt: string | null };
  limits: { videoRecreation: Record<string, RecreationLimit> };
  historyLimit: number;
}

/** 拉取 /platform/catalog 之前的本地兜底值，与服务端 platform.policy.ts 的 defaultsFor 保持一致。 */
export const FALLBACK_GENERATION_DEFAULTS = {
  imageModel: "seedream-image-flash",
  imageResolution: "1K",
  imageFormat: "PNG",
  videoModel: "doubao-seedance-1-0-pro-fast-251015",
  videoRatio: "9:16",
  videoResolution: "720p",
  videoDuration: "5s",
} as const;

/** 深度复刻时长/分辨率上限（与服务端 platform.policy.ts 的 videoRecreationLimits 一致）。 */
export const VIDEO_RECREATION_LIMITS: Record<string, RecreationLimit> = {
  FREE: { duration: "15s", resolution: "720p", label: "免费版" },
  BASIC: { duration: "30s", resolution: "720p", label: "基础版" },
  PRO: { duration: "60s", resolution: "1080p", label: "专业版" },
  VIP: { duration: "60s", resolution: "1080p", label: "旗舰版" },
};
