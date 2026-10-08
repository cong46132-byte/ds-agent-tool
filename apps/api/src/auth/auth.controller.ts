import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  loginRequestSchema,
  changePasswordRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type CurrentUserResponse,
  type LoginRequest,
  type ChangePasswordRequest,
  type RefreshRequest,
  type RegisterRequest,
} from "@ds/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthService } from "./auth.service.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "./access-token.guard.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("me")
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest): Promise<CurrentUserResponse> {
    return this.authService.getCurrentUser(request.auth.userId);
  }

  @Post("register")
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) input: RegisterRequest,
  ): Promise<AuthResponse> {
    return this.authService.register(input);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
    @Req() request: { ip?: string },
  ): Promise<AuthResponse> {
    return this.authService.login(input, request.ip ?? "unknown");
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) input: RefreshRequest,
  ): Promise<AuthResponse> {
    return this.authService.refresh(input.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ZodValidationPipe(refreshRequestSchema)) input: RefreshRequest,
  ): Promise<void> {
    await this.authService.logout(input.refreshToken);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) input: ChangePasswordRequest,
  ): Promise<void> {
    await this.authService.changePassword(request.auth.userId, request.auth.sessionId, input);
  }
}
