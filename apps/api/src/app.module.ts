import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { TasksModule } from "./tasks/tasks.module.js";
import { CanvasesModule } from "./canvases/canvases.module.js";

@Module({ imports: [AuthModule, AssetsModule, AgentModule, BillingModule, PlatformModule, TasksModule, CanvasesModule], controllers: [HealthController] })
export class AppModule {}
