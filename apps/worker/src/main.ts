import { applyImageComplianceMarkings, createModelProvider } from "@ds/ai-providers";
import { generationCapabilitySchema, generationParametersSchema } from "@ds/contracts";
import { settleGenerationHold } from "@ds/credits";
import { Prisma, prisma } from "@ds/database";
import { LocalFileObjectStorage } from "@ds/storage";
import { z } from "zod";
import { randomUUID } from "node:crypto";

const env = z.object({ DATABASE_URL: z.string().url(), TASK_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(30000).default(1500), LOCAL_STORAGE_SIGNING_SECRET: z.string().min(32).default("development-local-storage-secret-32-chars") }).parse(process.env);
// Provider 在 Worker 启动时读取当前国产模型、商详方案与质量策略。
const provider = createModelProvider();
const storage = new LocalFileObjectStorage(env.LOCAL_STORAGE_SIGNING_SECRET);
let stopping = false;

async function claimNextTask() {
  const candidate = await prisma.generationTask.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const claimed = await prisma.generationTask.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "RUNNING", progress: 1, startedAt: new Date() } });
  if (claimed.count !== 1) return null;
  await prisma.generationTaskEvent.create({ data: { taskId: candidate.id, type: "RUNNING", payload: { provider: provider.id } } });
  return prisma.generationTask.findUnique({ where: { id: candidate.id } });
}

async function runTask(task: NonNullable<Awaited<ReturnType<typeof claimNextTask>>>) {
  const startedAt = Date.now();
  let providerRequestId: string | null = null;
  try {
    const input = task.input as { assetIds?: string[]; prompt?: string; parameters?: unknown };
    const capability = generationCapabilitySchema.parse(task.capability);
    const parameters = generationParametersSchema.parse(input.parameters);
    const policy = task.modelPolicy as { requestedModel?: string } | null;
    const foundAssets = input.assetIds?.length ? await prisma.asset.findMany({ where: { id: { in: input.assetIds }, ownerId: task.userId }, include: { file: true } }) : [];
    // 保持用户选择顺序，商详方案中的 referenceIndexes 才能稳定对应到“图 1…图 5”。
    const assets = input.assetIds?.map((assetId) => foundAssets.find((asset) => asset.id === assetId)).filter((asset): asset is (typeof foundAssets)[number] => Boolean(asset)) ?? [];
    const providerAssets = await Promise.all(assets.map(async (asset) => ({ id: asset.id, name: asset.name, contentType: asset.file.mimeType, data: await storage.getObject(asset.file.objectKey) })));
    const providerRequest = await prisma.providerRequest.create({ data: {
      taskId: task.id, provider: provider.id, model: policy?.requestedModel ?? parameters.model, status: "RUNNING",
      requestMeta: { capability, assetCount: providerAssets.length, resolution: parameters.resolution, format: parameters.format ?? null },
    } });
    providerRequestId = providerRequest.id;
    const generatedFiles = await provider.generate({ taskId: task.id, capability, model: policy?.requestedModel ?? parameters.model, prompt: input.prompt ?? "", parameters, assets: providerAssets }, async (progress) => {
      await prisma.generationTask.update({ where: { id: task.id }, data: { progress: Math.max(1, Math.min(99, Math.round(progress))) } });
    });
    // 永久母版只写入不可关闭的 AI 标识；平台水印在预览/下载时按实时会员权益动态生成。
    const files = await Promise.all(generatedFiles.map((file) => applyImageComplianceMarkings(file, false)));
    await prisma.providerRequest.update({ where: { id: providerRequest.id }, data: { status: "SUCCEEDED", latencyMs: Date.now() - startedAt, responseMeta: { outputCount: files.length } } });
    for (const [position, file] of files.entries()) {
      const objectKey = `users/${task.userId}/generated/${task.id}/${randomUUID()}-${file.name}`;
      await storage.putObject(objectKey, file.data, file.contentType);
      await prisma.$transaction(async (tx) => {
        const stored = await tx.fileObject.create({ data: { ownerId: task.userId, bucket: storage.bucket, objectKey, originalName: file.name, mimeType: file.contentType, sizeBytes: BigInt(file.data.length), status: "READY", width: file.width, height: file.height, durationMs: file.durationMs ?? null } });
        const asset = await tx.asset.create({ data: { ownerId: task.userId, fileId: stored.id, kind: file.contentType.startsWith("video/") ? "VIDEO" : "IMAGE", name: file.name, source: "AI_GENERATED", metadata: { taskId: task.id, provider: provider.id, aiGenerated: true, platformWatermark: false, watermarkPolicy: "DYNAMIC_V1", masterHasAiLabel: true } } });
        await tx.generationOutput.create({ data: { taskId: task.id, assetId: asset.id, position } });
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.generationTask.update({ where: { id: task.id }, data: { status: "SUCCEEDED", progress: 100, completedAt: new Date() } });
      await tx.generationTaskEvent.create({ data: { taskId: task.id, type: "SUCCEEDED", payload: { provider: provider.id, outputCount: files.length } } });
      await settleGenerationHold(tx, task.id, "commit");
    });
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error("未知生成错误");
    const code = "code" in error && typeof error.code === "string" ? error.code : "GENERATION_FAILED";
    if (providerRequestId) await prisma.providerRequest.update({ where: { id: providerRequestId }, data: { status: "FAILED", latencyMs: Date.now() - startedAt, responseMeta: { code, message: error.message } } }).catch(() => undefined);
    await prisma.$transaction(async (tx) => {
      await tx.generationTask.update({ where: { id: task.id }, data: { status: "FAILED", progress: 0, errorCode: code, errorMessage: error.message, completedAt: new Date() } });
      await tx.generationTaskEvent.create({ data: { taskId: task.id, type: "FAILED", payload: { code, message: error.message } as Prisma.InputJsonValue } });
      await settleGenerationHold(tx, task.id, "refund", code);
    });
  }
}

async function loop() {
  console.info(JSON.stringify({ service: "worker", status: "ready", provider: provider.id }));
  while (!stopping) {
    const task = await claimNextTask().catch((error) => { console.error("claim task failed", error); return null; });
    if (task) await runTask(task); else await new Promise((resolve) => setTimeout(resolve, env.TASK_POLL_INTERVAL_MS));
  }
  await prisma.$disconnect();
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
void loop();
