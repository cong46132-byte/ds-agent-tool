import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { prisma } from "@ds/database";
import type {
  AssetListQuery,
  AssetListResponse,
  AssetReferencesResponse,
  AssetResponse,
  CreateUploadRequest,
  DownloadUrlResponse,
  UploadTicket,
} from "@ds/contracts";
import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { StorageService } from "./storage.service.js";
import { applyPlatformWatermark } from "@ds/ai-providers";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/wav", "audio/mp4",
]);
const FREE_WATERMARK_VERSION = "free-watermark-v1";

@Injectable()
export class AssetsService {
  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  async createUpload(userId: string, input: CreateUploadRequest): Promise<UploadTicket> {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new UnprocessableEntityException({ code: "UNSUPPORTED_FILE_TYPE", message: "暂不支持该文件类型" });
    }
    const extension = extname(input.fileName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const objectKey = `users/${userId}/${date}/${randomUUID()}${extension}`;
    const storage = this.storageService.get();
    const upload = await storage.createUploadUrl(objectKey, input.mimeType);
    const file = await prisma.fileObject.create({
      data: {
        ownerId: userId,
        bucket: storage.bucket,
        objectKey,
        originalName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        sha256: input.sha256 ?? null,
      },
    });
    return {
      fileId: file.id,
      uploadUrl: upload.url,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  async completeUpload(userId: string, fileId: string): Promise<AssetResponse> {
    const file = await prisma.fileObject.findFirst({ where: { id: fileId, ownerId: userId } });
    if (!file) throw new NotFoundException({ code: "FILE_NOT_FOUND", message: "文件不存在" });
    if (file.status === "READY") {
      const existing = await prisma.asset.findFirst({ where: { fileId, ownerId: userId } });
      if (existing) return this.toResponse(existing, file);
    }
    if (file.status !== "PENDING") {
      throw new ConflictException({ code: "FILE_NOT_COMPLETABLE", message: "当前文件状态不可确认" });
    }

    const storage = this.storageService.get();
    const remote = await storage.headObject(file.objectKey);
    if (!Number.isFinite(remote.sizeBytes) || BigInt(remote.sizeBytes) !== file.sizeBytes) {
      throw new UnprocessableEntityException({ code: "FILE_SIZE_MISMATCH", message: "上传文件大小与登记信息不一致" });
    }
    const uploadedData = await storage.getObject(file.objectKey);
    const verifiedSha256 = createHash("sha256").update(uploadedData).digest("hex");
    const duplicate = await prisma.asset.findFirst({
      where: {
        ownerId: userId,
        file: { status: "READY", sha256: verifiedSha256, sizeBytes: file.sizeBytes, mimeType: file.mimeType },
      },
      include: { file: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (duplicate) {
      await prisma.fileObject.delete({ where: { id: file.id } });
      await storage.deleteObject(file.objectKey).catch(() => undefined);
      return this.toResponse(duplicate, duplicate.file);
    }
    const kind = this.kindFromMimeType(file.mimeType);
    const asset = await prisma.$transaction(async (tx) => {
      await tx.fileObject.update({ where: { id: file.id }, data: { status: "READY", sha256: verifiedSha256 } });
      return tx.asset.create({
        data: { ownerId: userId, fileId: file.id, kind, name: file.originalName, source: "UPLOAD" },
      });
    });
    return this.toResponse(asset, file);
  }

  async list(userId: string, query: AssetListQuery): Promise<AssetListResponse> {
    const items = await prisma.asset.findMany({
      where: { ownerId: userId, ...(query.kind ? { kind: query.kind } : {}) },
      include: { file: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > query.pageSize;
    const page = hasMore ? items.slice(0, query.pageSize) : items;
    return {
      items: page.map((asset) => this.toResponse(asset, asset.file)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async createDownloadUrl(userId: string, assetId: string): Promise<DownloadUrlResponse> {
    const asset = await prisma.asset.findFirst({ where: { id: assetId, ownerId: userId }, include: { file: true } });
    if (!asset) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "资产不存在" });
    const expiresInSeconds = 10 * 60;
    const storage = this.storageService.get();
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    const paidActive = subscription?.status === "ACTIVE"
      && subscription.tier !== "FREE"
      && (!subscription.expiresAt || subscription.expiresAt > new Date());
    const metadata = asset.metadata as { platformWatermark?: boolean; watermarkPolicy?: string } | null;
    let objectKey = asset.file.objectKey;

    // 仅新策略下的 AI 图片拥有干净母版。历史已烧入水印的资产不能无损去除，也不能再次叠加。
    if (asset.kind === "IMAGE" && asset.source === "AI_GENERATED" && metadata?.watermarkPolicy === "DYNAMIC_V1" && !paidActive) {
      objectKey = this.freeWatermarkKey(asset.file.objectKey);
      const cached = await storage.headObject(objectKey).then(() => true).catch(() => false);
      if (!cached) {
        const master = await storage.getObject(asset.file.objectKey);
        const marked = await applyPlatformWatermark({
          name: asset.file.originalName,
          contentType: asset.file.mimeType,
          data: master,
          width: asset.file.width ?? 0,
          height: asset.file.height ?? 0,
        });
        await storage.putObject(objectKey, marked.data, marked.contentType);
      }
    }
    return {
      url: await storage.createDownloadUrl(objectKey, expiresInSeconds, { fileName: asset.file.originalName, contentType: asset.file.mimeType }),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async references(userId: string, assetId: string): Promise<AssetReferencesResponse> {
    const asset = await prisma.asset.findFirst({ where: { id: assetId, ownerId: userId } });
    if (!asset) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "资产不存在" });
    const [outputTasks, allTasks] = await Promise.all([
      prisma.generationTask.findMany({
        where: { userId, outputs: { some: { assetId } } },
        select: { id: true, capability: true, createdAt: true },
      }),
      prisma.generationTask.findMany({
        where: { userId },
        select: { id: true, capability: true, createdAt: true, input: true },
      }),
    ]);
    const items = [
      ...outputTasks.map((task) => ({ taskId: task.id, capability: task.capability, createdAt: task.createdAt.toISOString(), relation: "OUTPUT" as const })),
      ...allTasks.filter((task) => {
        const input = task.input as { assetIds?: unknown };
        return Array.isArray(input.assetIds) && input.assetIds.includes(assetId);
      }).map((task) => ({ taskId: task.id, capability: task.capability, createdAt: task.createdAt.toISOString(), relation: "INPUT" as const })),
    ].filter((item, index, all) => all.findIndex((candidate) => candidate.taskId === item.taskId && candidate.relation === item.relation) === index);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, count: items.length };
  }

  async delete(userId: string, assetId: string, force = false): Promise<void> {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, ownerId: userId },
      include: { file: true },
    });
    if (!asset) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "资产不存在" });
    const references = await this.references(userId, assetId);
    if (references.count > 0 && !force) {
      throw new ConflictException({ code: "ASSET_IN_USE", message: `资产正在被 ${references.count} 个任务关系引用，请确认后删除`, references: references.items });
    }
    await prisma.$transaction([
      prisma.generationOutput.deleteMany({ where: { assetId: asset.id } }),
      prisma.asset.delete({ where: { id: asset.id } }),
      prisma.fileObject.delete({ where: { id: asset.fileId } }),
    ]);
    await this.storageService.get().deleteObject(asset.file.objectKey).catch(() => undefined);
    await this.storageService.get().deleteObject(this.freeWatermarkKey(asset.file.objectKey)).catch(() => undefined);
  }

  private freeWatermarkKey(masterKey: string): string {
    return `${masterKey}.${FREE_WATERMARK_VERSION}`;
  }

  private kindFromMimeType(mimeType: string): "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" {
    if (mimeType.startsWith("image/")) return "IMAGE";
    if (mimeType.startsWith("video/")) return "VIDEO";
    if (mimeType.startsWith("audio/")) return "AUDIO";
    return "DOCUMENT";
  }

  private toResponse(
    asset: { id: string; name: string; kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT"; source: string; createdAt: Date },
    file: { mimeType: string; sizeBytes: bigint; width: number | null; height: number | null; durationMs: number | null },
  ): AssetResponse {
    return {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      width: file.width,
      height: file.height,
      durationMs: file.durationMs,
      source: asset.source,
      createdAt: asset.createdAt.toISOString(),
    };
  }
}
