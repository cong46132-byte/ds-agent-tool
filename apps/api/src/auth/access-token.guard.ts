import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  auth: { userId: string; sessionId: string };
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException({ code: "MISSING_ACCESS_TOKEN", message: "缺少访问令牌" });
    }
    request.auth = await this.authService.verifyAccessToken(token);
    return true;
  }
}
