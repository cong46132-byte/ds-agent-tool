import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { StorageService } from "./storage.service.js";
import { LocalStorageController } from "./local-storage.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [AssetsController, LocalStorageController],
  providers: [AssetsService, StorageService],
  exports: [StorageService],
})
export class AssetsModule {}
