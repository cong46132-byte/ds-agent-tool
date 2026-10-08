import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillingController } from "./billing.controller.js";

@Module({ imports: [AuthModule], controllers: [BillingController] })
export class BillingModule {}
