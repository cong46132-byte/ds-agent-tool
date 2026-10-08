import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { prisma } from "@ds/database";
import { grantSubscriptionCredits } from "@ds/credits";
import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard.js";

@Controller("billing")
@UseGuards(AccessTokenGuard)
export class BillingController {
  @Get("overview")
  async overview(@Req() request: AuthenticatedRequest) {
    const subscription = await prisma.subscription.findUnique({ where: { userId: request.auth.userId } });
    const active = subscription?.status === "ACTIVE" && subscription.tier !== "FREE" && (!subscription.expiresAt || subscription.expiresAt > new Date());
    if (active) await grantSubscriptionCredits(prisma, request.auth.userId, subscription.tier);
    const account = await prisma.creditAccount.findUnique({ where: { userId: request.auth.userId } });
    return { credits: { balance: account?.balance ?? 0, held: account?.held ?? 0, available: (account?.balance ?? 0) - (account?.held ?? 0) }, subscription: { tier: subscription?.tier ?? "FREE", status: subscription?.status ?? "ACTIVE", expiresAt: subscription?.expiresAt?.toISOString() ?? null } };
  }

  @Get("transactions")
  async transactions(@Req() request: AuthenticatedRequest) {
    const account = await prisma.creditAccount.findUnique({ where: { userId: request.auth.userId } });
    if (!account) return { items: [] };
    const items = await prisma.creditTransaction.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  }
}
