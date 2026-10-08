import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";

@Module({ imports: [AuthModule, AssetsModule], controllers: [AgentController], providers: [AgentService] })
export class AgentModule {}
