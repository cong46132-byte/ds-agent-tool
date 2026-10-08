import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../packages/database/dist/index.js";

const apply = process.argv.includes("--apply");
const storageRoot = resolve(process.cwd(), ".local-storage");

function replaceAssetId(value, duplicateId, canonicalId) {
  if (Array.isArray(value)) return value.map((item) => item === duplicateId ? canonicalId : replaceAssetId(item, duplicateId, canonicalId));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "assetId" && item === duplicateId ? canonicalId : replaceAssetId(item, duplicateId, canonicalId)]));
}

const assets = await prisma.asset.findMany({ include: { file: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
const groups = new Map();
for (const asset of assets) {
  if (asset.file.status !== "READY") continue;
  let sha256 = asset.file.sha256;
  if (!sha256) {
    if (asset.file.bucket !== "local-private-assets") continue;
    const data = await readFile(resolve(storageRoot, asset.file.objectKey));
    sha256 = createHash("sha256").update(data).digest("hex");
    if (apply) await prisma.fileObject.update({ where: { id: asset.fileId }, data: { sha256 } });
  }
  const key = `${asset.ownerId}:${asset.file.mimeType}:${asset.file.sizeBytes}:${sha256}`;
  const list = groups.get(key) ?? [];
  list.push(asset);
  groups.set(key, list);
}

const duplicates = [...groups.values()].filter((group) => group.length > 1);
const duplicateCount = duplicates.reduce((sum, group) => sum + group.length - 1, 0);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", assets: assets.length, duplicateGroups: duplicates.length, duplicateAssets: duplicateCount }, null, 2));

if (apply) {
  for (const group of duplicates) {
    const canonical = group[0];
    for (const duplicate of group.slice(1)) {
      const [tasks, canvases] = await Promise.all([
        prisma.generationTask.findMany({ where: { userId: duplicate.ownerId }, select: { id: true, input: true } }),
        prisma.canvas.findMany({ where: { userId: duplicate.ownerId }, select: { id: true, content: true } }),
      ]);
      await prisma.$transaction(async (tx) => {
        await tx.generationOutput.updateMany({ where: { assetId: duplicate.id }, data: { assetId: canonical.id } });
        for (const task of tasks) {
          const next = replaceAssetId(task.input, duplicate.id, canonical.id);
          if (JSON.stringify(next) !== JSON.stringify(task.input)) await tx.generationTask.update({ where: { id: task.id }, data: { input: next } });
        }
        for (const canvas of canvases) {
          const next = replaceAssetId(canvas.content, duplicate.id, canonical.id);
          if (JSON.stringify(next) !== JSON.stringify(canvas.content)) await tx.canvas.update({ where: { id: canvas.id }, data: { content: next } });
        }
        await tx.asset.delete({ where: { id: duplicate.id } });
        await tx.fileObject.delete({ where: { id: duplicate.fileId } });
      });
      if (duplicate.file.bucket === "local-private-assets") {
        await rm(resolve(storageRoot, duplicate.file.objectKey), { force: true });
        await rm(resolve(storageRoot, `${duplicate.file.objectKey}.free-watermark-v1`), { force: true });
      }
    }
  }
}

await prisma.$disconnect();
