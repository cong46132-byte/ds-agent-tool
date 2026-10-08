import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CanvasesController } from "./canvases.controller.js";
import { CanvasesService } from "./canvases.service.js";

@Module({ imports: [AuthModule], controllers: [CanvasesController], providers: [CanvasesService] })
export class CanvasesModule {}
