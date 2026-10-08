import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { prisma } from "@ds/database";
import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard.js";
import { defaultsFor, models, videoRecreationLimits } from "./platform.policy.js";

@Controller("platform")
@UseGuards(AccessTokenGuard)
export class PlatformController {
  @Get("catalog")
  async catalog(@Req() request: AuthenticatedRequest) {
    const subscription = await prisma.subscription.findUnique({ where: { userId: request.auth.userId } });
    return {
      models,
      defaults: {
        video_recreation: defaultsFor("video_recreation"), director_video: defaultsFor("director_video"),
        product_detail_set: defaultsFor("product_detail_set"), virtual_try_on: defaultsFor("virtual_try_on"),
        product_white_background: defaultsFor("product_white_background"), image_retouche: defaultsFor("image_retouche"),
      },
      subscription: { tier: subscription?.tier ?? "FREE", status: subscription?.status ?? "ACTIVE", expiresAt: subscription?.expiresAt?.toISOString() ?? null },
      limits: { videoRecreation: videoRecreationLimits },
      historyLimit: 40,
    };
  }
}
