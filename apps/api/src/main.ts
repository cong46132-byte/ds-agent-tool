import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { parseApiEnv } from "./runtime-env.js";

async function bootstrap() {
  const env = parseApiEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: env.NODE_ENV === "production" ? false : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, "0.0.0.0");
}

void bootstrap();
