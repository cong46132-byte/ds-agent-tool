import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { createCanvasSchema, updateCanvasSchema, type CreateCanvas, type UpdateCanvas } from "@ds/contracts";
import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CanvasesService } from "./canvases.service.js";

@Controller("canvases")
@UseGuards(AccessTokenGuard)
export class CanvasesController {
  constructor(@Inject(CanvasesService) private readonly canvasesService: CanvasesService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.canvasesService.list(request.auth.userId); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createCanvasSchema)) input: CreateCanvas) { return this.canvasesService.create(request.auth.userId, input); }
  @Get(":id") get(@Req() request: AuthenticatedRequest, @Param("id") id: string) { return this.canvasesService.get(request.auth.userId, id); }
  @Put(":id") update(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(updateCanvasSchema)) input: UpdateCanvas) { return this.canvasesService.update(request.auth.userId, id, input); }
  @Delete(":id") @HttpCode(HttpStatus.NO_CONTENT) async delete(@Req() request: AuthenticatedRequest, @Param("id") id: string) { await this.canvasesService.delete(request.auth.userId, id); }
}
