import { Prisma, type PrismaClient } from "@ds/database";

export type DbClient = PrismaClient | Prisma.TransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * 结算生成任务的冻结积分。
 * - commit：任务成功，冻结转实扣（balance 与 held 同步减少）。
 * - refund：任务失败/取消，释放冻结（held 减少，balance 不变，流水记正数便于追溯）。
 * 通过 businessKey 唯一约束保证幂等，重复调用直接跳过。
 */
export async function settleGenerationHold(
  db: DbClient,
  taskId: string,
  outcome: "commit" | "refund",
  reason?: string,
): Promise<boolean> {
  const task = await db.generationTask.findUnique({ where: { id: taskId } });
  if (!task) return false;
  const account = await db.creditAccount.findUnique({ where: { userId: task.userId } });
  if (!account) return false;

  const businessKey = `${taskId}:${outcome}`;
  const existing = await db.creditTransaction.findUnique({ where: { businessKey } });
  if (existing) return false;

  const amount = task.estimatedCredits;
  if (account.held < amount) return false;

  try {
    await db.creditTransaction.create({
      data: {
        accountId: account.id,
        businessKey,
        type: outcome === "commit" ? "GENERATION_COMMIT" : "GENERATION_REFUND",
        amount: outcome === "commit" ? -amount : amount,
        balanceAfter: outcome === "commit" ? account.balance - amount : account.balance,
        metadata: { taskId, capability: task.capability, ...(reason ? { reason } : {}) },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }

  await db.creditAccount.update({
    where: { id: account.id },
    data: outcome === "commit"
      ? { balance: { decrement: amount }, held: { decrement: amount }, version: { increment: 1 } }
      : { held: { decrement: amount }, version: { increment: 1 } },
  });
  return true;
}

const SUBSCRIPTION_CREDIT_QUOTA: Record<string, number> = {
  BASIC: 500,
  PRO: 2000,
  VIP: 6000,
};

export function subscriptionQuota(tier: string): number {
  return SUBSCRIPTION_CREDIT_QUOTA[tier] ?? 0;
}

/** 按周期发放订阅积分（businessKey 按自然月去重，重复发放自动跳过）。 */
export async function grantSubscriptionCredits(db: DbClient, userId: string, tier: string): Promise<number> {
  const quota = subscriptionQuota(tier);
  if (quota <= 0) return 0;
  const account = await db.creditAccount.findUnique({ where: { userId } });
  if (!account) return 0;

  const period = new Date().toISOString().slice(0, 7);
  const businessKey = `subgrant:${userId}:${period}`;
  const existing = await db.creditTransaction.findUnique({ where: { businessKey } });
  if (existing) return 0;

  try {
    await db.creditTransaction.create({
      data: {
        accountId: account.id,
        businessKey,
        type: "SUBSCRIPTION_GRANT",
        amount: quota,
        balanceAfter: account.balance + quota,
        metadata: { tier, period },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 0;
    throw error;
  }
  await db.creditAccount.update({
    where: { id: account.id },
    data: { balance: { increment: quota }, version: { increment: 1 } },
  });
  return quota;
}

/** 管理端手工调整积分（正数增发、负数扣减，扣减不允许扣成负数）。 */
export async function adjustCredits(db: DbClient, userId: string, amount: number, reason: string) {
  const account = await db.creditAccount.findUnique({ where: { userId } });
  if (!account) throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
  if (amount < 0 && account.balance - account.held < -amount) throw new Error("CREDIT_ADJUST_EXCEEDS_AVAILABLE");
  const businessKey = `adjust:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await db.creditTransaction.create({
    data: {
      accountId: account.id,
      businessKey,
      type: "ADMIN_ADJUSTMENT",
      amount,
      balanceAfter: account.balance + amount,
      metadata: { reason },
    },
  });
  return db.creditAccount.update({
    where: { id: account.id },
    data: { balance: { increment: amount }, version: { increment: 1 } },
  });
}
