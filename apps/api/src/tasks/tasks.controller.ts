import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { createGenerationTaskSchema, regenerateTaskRequestSchema, type CreateGenerationTask, type RegenerateTaskRequest } from "@ds/contracts";
import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { TasksService } from "./tasks.service.js";

@Controller("tasks")
@UseGuards(AccessTokenGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}
  @Post() create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createGenerationTaskSchema)) input: CreateGenerationTask) { return this.tasksService.create(request.auth.userId, input); }
  @Get() list(@Req() request: AuthenticatedRequest) { return this.tasksService.list(request.auth.userId); }
  @Get(":id") get(@Req() request: AuthenticatedRequest, @Param("id") id: string) { return this.tasksService.get(request.auth.userId, id); }
  @Post(":id/cancel") cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string) { return this.tasksService.cancel(request.auth.userId, id); }
  @Post(":id/regenerate") regenerate(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(regenerateTaskRequestSchema)) input: RegenerateTaskRequest) { return this.tasksService.regenerate(request.auth.userId, id, input.idempotencyKey); }
  @Delete(":id") @HttpCode(HttpStatus.NO_CONTENT) async delete(@Req() request: AuthenticatedRequest, @Param("id") id: string) { await this.tasksService.delete(request.auth.userId, id); }
}
