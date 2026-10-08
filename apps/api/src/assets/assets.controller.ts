import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  assetListQuerySchema,
  completeUploadRequestSchema,
  createUploadRequestSchema,
  type AssetListQuery,
  type AssetListResponse,
  type AssetReferencesResponse,
  type AssetResponse,
  type CompleteUploadRequest,
  type CreateUploadRequest,
  type DownloadUrlResponse,
  type UploadTicket,
} from "@ds/contracts";
import { AccessTokenGuard, type AuthenticatedRequest } from "../auth/access-token.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AssetsService } from "./assets.service.js";

@Controller()
@UseGuards(AccessTokenGuard)
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assetsService: AssetsService) {}

  @Post("uploads/presign")
  createUpload(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createUploadRequestSchema)) input: CreateUploadRequest,
  ): Promise<UploadTicket> {
    return this.assetsService.createUpload(request.auth.userId, input);
  }

  @Post("uploads/complete")
  completeUpload(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(completeUploadRequestSchema)) input: CompleteUploadRequest,
  ): Promise<AssetResponse> {
    return this.assetsService.completeUpload(request.auth.userId, input.fileId);
  }

  @Get("assets")
  listAssets(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(assetListQuerySchema)) query: AssetListQuery,
  ): Promise<AssetListResponse> {
    return this.assetsService.list(request.auth.userId, query);
  }

  @Get("assets/:id/download-url")
  getDownloadUrl(
    @Req() request: AuthenticatedRequest,
    @Param("id") assetId: string,
  ): Promise<DownloadUrlResponse> {
    return this.assetsService.createDownloadUrl(request.auth.userId, assetId);
  }

  @Get("assets/:id/references")
  getReferences(
    @Req() request: AuthenticatedRequest,
    @Param("id") assetId: string,
  ): Promise<AssetReferencesResponse> {
    return this.assetsService.references(request.auth.userId, assetId);
  }

  @Delete("assets/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAsset(
    @Req() request: AuthenticatedRequest,
    @Param("id") assetId: string,
    @Query("force") force?: string,
  ): Promise<void> {
    return this.assetsService.delete(request.auth.userId, assetId, force === "true");
  }
}
