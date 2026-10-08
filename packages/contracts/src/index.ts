import { z } from "zod";

export const generationCapabilitySchema = z.enum([
  "product_white_background",
  "image_retouche",
  "product_detail_set",
  "virtual_try_on",
  "product_use",
  "clothing_redesign",
  "face_three_view",
  "person_four_view",
  "model_face_swap",
  "face_fusion",
  "person_in_scene",
  "person_realism",
  "director_video",
  "video_recreation",
]);

export type GenerationCapability = z.infer<typeof generationCapabilitySchema>;

export const generationTaskStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

export type GenerationTaskStatus = z.infer<typeof generationTaskStatusSchema>;

export interface HealthResponse {
  service: "api" | "worker";
  status: "ok" | "degraded";
  timestamp: string;
}

export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(50).optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface CurrentUserResponse extends AuthUser {
  credits: {
    balance: number;
    held: number;
    available: number;
  };
}

export const createUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().regex(/^(image|video|audio)\/[a-zA-Z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

export const completeUploadRequestSchema = z.object({ fileId: z.string().cuid() });
export type CompleteUploadRequest = z.infer<typeof completeUploadRequestSchema>;

export const assetListQuerySchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"]).optional(),
  cursor: z.string().cuid().optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface AssetResponse {
  id: string;
  name: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  source: string;
  createdAt: string;
}

export interface AssetListResponse {
  items: AssetResponse[];
  nextCursor: string | null;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
}

export const agentRouteRequestSchema = z.object({
  message: z.string().trim().max(2000),
  assetIds: z.array(z.string().cuid()).max(10).default([]),
  history: z
    .array(z.object({ role: z.enum(["user", "agent"]), text: z.string().max(2000) }))
    .max(20)
    .default([]),
  slots: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(80)).default({}),
}).refine((input) => input.message.length > 0 || input.assetIds.length > 0, {
  message: "请输入文字或上传至少一个素材",
  path: ["message"],
});
export type AgentRouteRequest = z.infer<typeof agentRouteRequestSchema>;

export const directorScriptRequestSchema = z.object({
  assetIds: z.array(z.string().cuid()).max(4).default([]),
  category: z.enum(["电商带货", "同城到店", "剧情短片", "品牌广告"]),
  template: z.string().trim().min(1).max(40),
  requirement: z.string().trim().max(10000).default(""),
});
export type DirectorScriptRequest = z.infer<typeof directorScriptRequestSchema>;

export const agentIntentSchema = z.enum([
  "product_detail_set",
  "video_recreation",
  "virtual_try_on",
  "director_video",
  "product_white_background",
  "image_retouche",
  "product_use",
  "clothing_redesign",
  "face_three_view",
  "person_four_view",
  "model_face_swap",
  "face_fusion",
  "person_in_scene",
  "person_realism",
  "unclear",
]);
export type AgentIntent = z.infer<typeof agentIntentSchema>;

export interface AgentRouteResponse {
  intent: AgentIntent;
  confidence: number;
  reply: string;
  targetPath: string | null;
  transferredAssetIds: string[];
  requiresClarification: boolean;
  /** 已确认（含本轮提取）的生成参数键值，如 { resolution: "2K", format: "PNG" } */
  slots: Record<string, string>;
}

export const generationParametersSchema = z.object({
  model: z.string().min(1).max(80),
  ratio: z.enum(["9:16", "16:9", "1:1", "3:4"]),
  resolution: z.enum(["480p", "720p", "1080p", "1K", "2K"]),
  duration: z.enum(["4s", "5s", "10s", "15s", "30s", "60s"]).optional(),
  format: z.enum(["PNG", "JPG", "MP4"]).optional(),
  count: z.number().int().min(1).max(5).default(1),
  authorizationConfirmed: z.boolean().optional(),
});
export type GenerationParameters = z.infer<typeof generationParametersSchema>;

export const createGenerationTaskSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  capability: generationCapabilitySchema,
  assetIds: z.array(z.string().cuid()).max(10).default([]),
  prompt: z.string().max(10000).default(""),
  parameters: generationParametersSchema,
});
export type CreateGenerationTask = z.infer<typeof createGenerationTaskSchema>;

export const regenerateTaskRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
});
export type RegenerateTaskRequest = z.infer<typeof regenerateTaskRequestSchema>;

export const estimateQuerySchema = z.object({
  capability: generationCapabilitySchema,
  model: z.string().min(1).max(80),
  ratio: z.enum(["9:16", "16:9", "1:1", "3:4"]),
  resolution: z.enum(["480p", "720p", "1080p", "1K", "2K"]),
  duration: z.enum(["4s", "5s", "10s", "15s", "30s", "60s"]).optional(),
  format: z.enum(["PNG", "JPG", "MP4"]).optional(),
  count: z.coerce.number().int().min(1).max(5).default(1),
});
export type EstimateQuery = z.infer<typeof estimateQuerySchema>;

export interface EstimateResponse {
  estimatedCredits: number;
  modelRequiredTier: string;
  allowedForCurrentTier: boolean;
}

export interface GenerationTaskOutput {
  id: string;
  assetId: string;
  position: number;
  asset: AssetResponse;
}

export interface GenerationTaskResponse {
  id: string;
  capability: string;
  status: GenerationTaskStatus;
  progress: number;
  estimatedCredits: number;
  errorCode: string | null;
  errorMessage: string | null;
  outputs: GenerationTaskOutput[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskListResponse {
  items: GenerationTaskResponse[];
  limit: number;
  count: number;
}

export const canvasNodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["text", "image", "video", "audio"]),
  x: z.number(),
  y: z.number(),
  title: z.string().max(80).optional(),
  text: z.string().max(4000).optional(),
  assetId: z.string().max(64).nullable().optional(),
  assetName: z.string().max(120).nullable().optional(),
  mediaUrl: z.string().max(2048).nullable().optional(),
  taskId: z.string().max(64).nullable().optional(),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]).nullable().optional(),
  progress: z.number().min(0).max(100).optional(),
  error: z.string().max(500).nullable().optional(),
  contentRev: z.number().int().min(0).default(0),
  sources: z.array(z.string().max(80)).max(20).optional(),
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasContentSchema = z.object({
  nodes: z.array(canvasNodeSchema).max(500),
  connections: z
    .array(z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64) }))
    .max(1000),
  zoom: z.number().min(0.05).max(4),
  pan: z.object({ x: z.number(), y: z.number() }),
});
export type CanvasContent = z.infer<typeof canvasContentSchema>;

export const createCanvasSchema = z.object({
  name: z.string().trim().min(1).max(60),
  content: canvasContentSchema.optional(),
});
export type CreateCanvas = z.infer<typeof createCanvasSchema>;

export const updateCanvasSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  content: canvasContentSchema.optional(),
});
export type UpdateCanvas = z.infer<typeof updateCanvasSchema>;

export interface CanvasSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
}

export interface CanvasResponse extends CanvasSummary {
  content: CanvasContent;
}

export interface AssetReferenceItem {
  taskId: string;
  capability: string;
  createdAt: string;
  relation: "INPUT" | "OUTPUT";
}

export interface AssetReferencesResponse {
  items: AssetReferenceItem[];
  count: number;
}

export const deleteAccountRequestSchema = z.object({
  password: z.string().min(1).max(72),
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
}).refine((input) => input.currentPassword !== input.newPassword, { message: "新密码不能与当前密码相同", path: ["newPassword"] });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const adminSetSubscriptionSchema = z.object({
  tier: z.enum(["FREE", "BASIC", "PRO", "VIP"]),
});
export type AdminSetSubscriptionRequest = z.infer<typeof adminSetSubscriptionSchema>;

export const adminAdjustCreditsSchema = z.object({
  userId: z.string().cuid(),
  amount: z.number().int().min(-100000).max(100000).refine((value) => value !== 0, "调整金额不能为 0"),
  reason: z.string().trim().min(1).max(100),
});
export type AdminAdjustCreditsRequest = z.infer<typeof adminAdjustCreditsSchema>;

export interface AdminGrantResult {
  userId: string;
  tier: string;
  grantedCredits: number;
  balance: number;
}
