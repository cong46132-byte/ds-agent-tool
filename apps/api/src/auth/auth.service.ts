import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, prisma } from "@ds/database";
import { grantSubscriptionCredits } from "@ds/credits";
import type {
  AuthResponse,
  AuthTokens,
  CurrentUserResponse,
  LoginRequest,
  ChangePasswordRequest,
  RegisterRequest,
} from "@ds/contracts";
import { compare, hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { parseApiEnv } from "../runtime-env.js";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const INITIAL_FREE_CREDITS = 0;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

type RefreshClaims = { sub: string; sid: string; type: "refresh" };

@Injectable()
export class AuthService {
  private readonly env = parseApiEnv(process.env);
  private readonly accessSecret = new TextEncoder().encode(this.env.JWT_ACCESS_SECRET);
  private readonly refreshSecret = new TextEncoder().encode(this.env.JWT_REFRESH_SECRET);
  private readonly loginFailures = new Map<string, { count: number; resetAt: number }>();

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const passwordHash = await hash(input.password, 12);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName ?? null,
          },
        });
        await tx.creditAccount.create({
          data: { userId: created.id, balance: INITIAL_FREE_CREDITS },
        });
        await tx.subscription.create({ data: { userId: created.id, tier: "FREE" } });
        return created;
      });
      return this.createAuthenticatedSession(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "EMAIL_EXISTS", message: "该邮箱已经注册" });
      }
      throw error;
    }
  }

  async login(input: LoginRequest, clientAddress = "unknown"): Promise<AuthResponse> {
    const attemptKey = `${clientAddress}:${input.email}`;
    const attempts = this.loginFailures.get(attemptKey);
    if (attempts && attempts.resetAt > Date.now() && attempts.count >= MAX_LOGIN_FAILURES) {
      throw new HttpException({ code: "LOGIN_RATE_LIMITED", message: "登录尝试过多，请 15 分钟后重试" }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (attempts && attempts.resetAt <= Date.now()) this.loginFailures.delete(attemptKey);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== "ACTIVE" || !(await compare(input.password, user.passwordHash))) {
      const current = this.loginFailures.get(attemptKey);
      this.loginFailures.set(attemptKey, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt ?? Date.now() + LOGIN_LOCK_MS,
      });
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" });
    }
    this.loginFailures.delete(attemptKey);
    return this.createAuthenticatedSession(user);
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: { creditAccount: true, subscription: true },
    });
    if (!user || user.status !== "ACTIVE" || !user.creditAccount) {
      throw new UnauthorizedException({ code: "INVALID_USER", message: "用户不可用" });
    }
    const subscription = user.subscription;
    const isActivePaidSubscription = subscription?.status === "ACTIVE"
      && subscription.tier !== "FREE"
      && (!subscription.expiresAt || subscription.expiresAt > new Date());
    if (isActivePaidSubscription) {
      const granted = await grantSubscriptionCredits(prisma, userId, subscription.tier);
      if (granted > 0) {
        user = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          include: { creditAccount: true, subscription: true },
        });
      }
    }
    const creditAccount = user.creditAccount;
    if (!creditAccount) {
      throw new UnauthorizedException({ code: "INVALID_USER", message: "用户积分账户不可用" });
    }
    return {
      ...this.toAuthUser(user),
      credits: {
        balance: creditAccount.balance,
        held: creditAccount.held,
        available: creditAccount.balance - creditAccount.held,
      },
    };
  }

  async verifyAccessToken(rawToken: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const { payload } = await jwtVerify(rawToken, this.accessSecret, { algorithms: ["HS256"] });
      if (payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
        throw new Error("Invalid claims");
      }
      const activeSession = await prisma.userSession.count({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: "ACTIVE" },
        },
      });
      if (activeSession !== 1) throw new Error("Inactive session");
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new UnauthorizedException({ code: "INVALID_ACCESS_TOKEN", message: "访问令牌无效" });
    }
  }

  async refresh(rawToken: string): Promise<AuthResponse> {
    const claims = await this.verifyRefreshToken(rawToken);
    const session = await prisma.userSession.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });

    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.refreshTokenHash !== this.hashToken(rawToken) ||
      session.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException({ code: "INVALID_SESSION", message: "会话已失效" });
    }

    const tokens = await this.issueTokens(session.user.id, session.id);
    await prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: this.hashToken(tokens.refreshToken) },
    });
    return { user: this.toAuthUser(session.user), tokens };
  }

  async logout(rawToken: string): Promise<void> {
    const claims = await this.verifyRefreshToken(rawToken);
    await prisma.userSession.updateMany({
      where: { id: claims.sid, userId: claims.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentSessionId: string, input: ChangePasswordRequest): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException({ code: "INVALID_CURRENT_PASSWORD", message: "当前密码不正确" });
    }
    const passwordHash = await hash(input.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.userSession.updateMany({ where: { userId, id: { not: currentSessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  private async createAuthenticatedSession(user: {
    id: string;
    email: string;
    displayName: string | null;
  }): Promise<AuthResponse> {
    const sessionId = randomUUID();
    const tokens = await this.issueTokens(user.id, sessionId);
    await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return { user: this.toAuthUser(user), tokens };
  }

  private async issueTokens(userId: string, sessionId: string): Promise<AuthTokens> {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ type: "access", sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
      .setJti(randomUUID())
      .sign(this.accessSecret);
    const refreshToken = await new SignJWT({ type: "refresh", sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(now + REFRESH_TOKEN_TTL_SECONDS)
      .setJti(randomUUID())
      .sign(this.refreshSecret);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  private async verifyRefreshToken(rawToken: string): Promise<RefreshClaims> {
    try {
      const { payload } = await jwtVerify(rawToken, this.refreshSecret, { algorithms: ["HS256"] });
      if (payload.type !== "refresh" || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
        throw new Error("Invalid claims");
      }
      return { sub: payload.sub, sid: payload.sid, type: "refresh" };
    } catch {
      throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN", message: "刷新令牌无效" });
    }
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private toAuthUser(user: { id: string; email: string; displayName: string | null }) {
    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}
