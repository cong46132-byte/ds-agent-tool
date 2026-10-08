import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@ds/database";
import type { CreateGenerationTask } from "@ds/contracts";
import { settleGenerationHold } from "@ds/credits";
import { estimateCredits, models, tierRank } from "../platform/platform.policy.js";

@Injectable()
export class TasksService {
  async create(userId: string, input: CreateGenerationTask) {
    const existing = await prisma.generationTask.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return this.toResponse(existing);
    const model = models.find((item) => item.id === input.parameters.model);
    if (!model) throw new ConflictException({ code: "MODEL_UNAVAILABLE", message: "所选模型当前不可用" });
    const isVideoCapability = input.capability === "director_video" || input.capability === "video_recreation";
    if ((isVideoCapability && model.kind !== "video") || (!isVideoCapability && model.kind !== "image")) {
      throw new ConflictException({ code: "MODEL_CAPABILITY_MISMATCH", message: "所选模型不支持当前生成类型" });
    }
    if (isVideoCapability) {
      const duration = Number.parseInt(input.parameters.duration ?? "0", 10);
      const maximumDuration = input.parameters.model === "doubao-seedance-1-0-pro-fast-251015" ? 10 : 30;
      if (!duration || duration > maximumDuration) throw new ConflictException({ code: "VIDEO_DURATION_UNSUPPORTED", message: `当前模型仅支持最长 ${maximumDuration} 秒视频` });
      if (input.capability === "director_video" && !input.prompt.trim()) throw new ConflictException({ code: "VIDEO_PROMPT_REQUIRED", message: "请输入视频提示词" });
    }
    const [subscription, ownedAssets, historyCount] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId } }),
      input.assetIds.length ? prisma.asset.findMany({ where: { ownerId: userId, id: { in: input.assetIds } }, select: { id: true, kind: true } }) : Promise.resolve([]),
      prisma.generationTask.count({ where: { userId } }),
    ]);
    if (ownedAssets.length !== input.assetIds.length) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "部分素材不存在或无权访问" });
    if (input.capability === "product_detail_set" && (ownedAssets.length < 1 || ownedAssets.length > 5 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_PRODUCT_IMAGES", message: "商详套图需要上传 1–5 张商品图片" });
    }
    if (input.capability === "virtual_try_on" && (ownedAssets.length < 2 || ownedAssets.length > 3 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_TRY_ON_IMAGES", message: "服装上身需要上传模特图和服装图，可选上传下装图" });
    }
    if (input.capability === "virtual_try_on" && input.parameters.authorizationConfirmed !== true) {
      throw new ConflictException({ code: "PORTRAIT_AUTHORIZATION_REQUIRED", message: "请确认已获得模特肖像与素材使用授权" });
    }
    if (input.capability === "product_use" && (ownedAssets.length !== 2 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_PRODUCT_USE_IMAGES", message: "商品使用需要上传人物参考图和产品图" });
    }
    if (input.capability === "clothing_redesign" && (ownedAssets.length < 1 || ownedAssets.length > 3 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_CLOTHING_REDESIGN_IMAGES", message: "服装改款需要上传服装图，可选上传面料图和印花图" });
    }
    if (input.capability === "image_retouche" && (ownedAssets.length !== 1 || ownedAssets[0]?.kind !== "IMAGE")) {
      throw new ConflictException({ code: "INVALID_RETOUCHE_IMAGE", message: "图片精修需要一张待优化图片" });
    }
    if (input.capability === "face_three_view" && (ownedAssets.length !== 1 || ownedAssets[0]?.kind !== "IMAGE" || input.parameters.count !== 1)) {
      throw new ConflictException({ code: "INVALID_FACE_THREE_VIEW_INPUT", message: "脸部三视图需要一张清晰人脸图并生成一张三视角排版图" });
    }
    if (input.capability === "person_four_view" && (ownedAssets.length !== 1 || ownedAssets[0]?.kind !== "IMAGE" || input.parameters.count !== 1)) {
      throw new ConflictException({ code: "INVALID_PERSON_FOUR_VIEW_INPUT", message: "人物四视图需要一张包含脸部和身形的人物图并生成一张四视角排版图" });
    }
    if (input.capability === "model_face_swap" && (ownedAssets.length !== 2 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_FACE_SWAP_IMAGES", message: "模特换脸需要一张模特图和一张人脸参考图" });
    }
    if (input.capability === "face_fusion" && (ownedAssets.length !== 2 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_FACE_FUSION_IMAGES", message: "人脸融合需要两张人脸参考图" });
    }
    if ((input.capability === "model_face_swap" || input.capability === "face_fusion") && input.parameters.authorizationConfirmed !== true) {
      throw new ConflictException({ code: "PORTRAIT_AUTHORIZATION_REQUIRED", message: "请确认已获得人物肖像与素材使用授权" });
    }
    if (input.capability === "person_in_scene" && (ownedAssets.length !== 2 || ownedAssets.some((asset) => asset.kind !== "IMAGE"))) {
      throw new ConflictException({ code: "INVALID_PERSON_SCENE_IMAGES", message: "人物入景需要一张模特图和一张背景图" });
    }
    if (input.capability === "person_realism" && (ownedAssets.length !== 1 || ownedAssets[0]?.kind !== "IMAGE")) {
      throw new ConflictException({ code: "INVALID_PERSON_REALISM_IMAGE", message: "人物真人感需要一张待优化人物图" });
    }
    if ((input.capability === "person_in_scene" || input.capability === "person_realism") && input.parameters.authorizationConfirmed !== true) {
      throw new ConflictException({ code: "PORTRAIT_AUTHORIZATION_REQUIRED", message: "请确认已获得人物肖像与素材使用授权" });
    }
    const subscriptionActive = subscription?.status === "ACTIVE" && (!subscription.expiresAt || subscription.expiresAt > new Date());
    const tier = subscriptionActive ? subscription.tier : "FREE";
    if (tierRank[tier] < tierRank[model.requiredTier]) throw new HttpException({ code: "SUBSCRIPTION_REQUIRED", message: `该模型需要 ${model.requiredTier} 订阅，请升级后使用` }, HttpStatus.FORBIDDEN);
    if (historyCount >= 40) throw new ConflictException({ code: "HISTORY_LIMIT_REACHED", message: "生成记录已达 40 条，请先清理历史记录" });
    const estimatedCredits = estimateCredits(input.capability, input.parameters);

    const task = await prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findUnique({ where: { userId } });
      const available = (account?.balance ?? 0) - (account?.held ?? 0);
      if (!account || available < estimatedCredits) throw new HttpException({ code: "INSUFFICIENT_CREDITS", message: `可用积分不足，需要 ${estimatedCredits} 积分，请升级订阅档位` }, HttpStatus.PAYMENT_REQUIRED);
      const created = await tx.generationTask.create({ data: {
        userId, idempotencyKey: input.idempotencyKey, capability: input.capability, status: "QUEUED",
        input: { assetIds: input.assetIds, prompt: input.prompt, parameters: input.parameters } as Prisma.InputJsonValue,
        modelPolicy: { requestedModel: model.id, requiredTier: model.requiredTier, userTier: tier } as Prisma.InputJsonValue,
        estimatedCredits,
      } });
      await tx.creditAccount.update({ where: { id: account.id }, data: { held: { increment: estimatedCredits }, version: { increment: 1 } } });
      await tx.creditTransaction.create({ data: { accountId: account.id, businessKey: `${created.id}:hold`, type: "GENERATION_HOLD", amount: -estimatedCredits, balanceAfter: account.balance, metadata: { taskId: created.id, capability: input.capability } } });
      await tx.generationTaskEvent.create({ data: { taskId: created.id, type: "QUEUED", payload: { estimatedCredits } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.toResponse(task);
  }

  async list(userId: string) {
    const items = await prisma.generationTask.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40, include: { outputs: { orderBy: { position: "asc" }, include: { asset: true } } } });
    return { items: items.map((item) => this.toResponse(item)), limit: 40, count: items.length };
  }

  async get(userId: string, id: string) {
    const task = await prisma.generationTask.findFirst({ where: { id, userId }, include: { events: { orderBy: { createdAt: "asc" } }, outputs: { orderBy: { position: "asc" }, include: { asset: true } } } });
    if (!task) throw new NotFoundException({ code: "TASK_NOT_FOUND", message: "任务不存在" });
    return this.toResponse(task);
  }

  async regenerate(userId: string, id: string, idempotencyKey: string) {
    const original = await prisma.generationTask.findFirst({ where: { id, userId } });
    if (!original) throw new NotFoundException({ code: "TASK_NOT_FOUND", message: "任务不存在" });
    if (original.status === "QUEUED" || original.status === "RUNNING") throw new ConflictException({ code: "TASK_STILL_ACTIVE", message: "当前任务尚未结束" });
    const saved = original.input as { assetIds?: string[]; prompt?: string; parameters?: unknown };
    const input: CreateGenerationTask = createGenerationTaskFromSaved(original.capability, idempotencyKey, saved);
    return this.create(userId, input);
  }

  async cancel(userId: string, id: string) {
    const task = await prisma.generationTask.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException({ code: "TASK_NOT_FOUND", message: "任务不存在" });
    if (task.status !== "QUEUED") {
      throw new ConflictException({
        code: "TASK_NOT_CANCELABLE",
        message: task.status === "RUNNING" ? "任务已开始调用模型，暂时无法取消" : "当前任务状态不可取消",
      });
    }
    await prisma.$transaction(async (tx) => {
      const canceled = await tx.generationTask.updateMany({
        where: { id, userId, status: "QUEUED" },
        data: { status: "CANCELED", progress: 0, completedAt: new Date(), errorCode: null, errorMessage: null },
      });
      if (canceled.count !== 1) {
        throw new ConflictException({ code: "TASK_ALREADY_CLAIMED", message: "任务已开始生成，取消未生效" });
      }
      await tx.generationTaskEvent.create({ data: { taskId: id, type: "CANCELED", payload: { reason: "USER_REQUEST" } } });
      await settleGenerationHold(tx, id, "refund", "USER_CANCELED");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.get(userId, id);
  }

  async delete(userId: string, id: string) {
    const task = await prisma.generationTask.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException({ code: "TASK_NOT_FOUND", message: "任务不存在" });
    if (task.status === "QUEUED" || task.status === "RUNNING") throw new ConflictException({ code: "TASK_STILL_ACTIVE", message: "排队或生成中的任务不能删除" });
    await prisma.generationTask.delete({ where: { id } });
  }

  private toResponse(task: { id: string; capability: string; status: string; input: unknown; modelPolicy: unknown; progress: number; estimatedCredits: number; errorCode: string | null; errorMessage: string | null; createdAt: Date; updatedAt: Date; startedAt: Date | null; completedAt: Date | null }) {
    return { ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(), startedAt: task.startedAt?.toISOString() ?? null, completedAt: task.completedAt?.toISOString() ?? null };
  }
}

function createGenerationTaskFromSaved(capability: string, idempotencyKey: string, saved: { assetIds?: string[]; prompt?: string; parameters?: unknown }): CreateGenerationTask {
  return {
    idempotencyKey,
    capability: capability as CreateGenerationTask["capability"],
    assetIds: saved.assetIds ?? [],
    prompt: saved.prompt ?? "",
    parameters: saved.parameters as CreateGenerationTask["parameters"],
  };
}
