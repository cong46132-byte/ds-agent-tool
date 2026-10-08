import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  STORAGE_DRIVER: z.enum(["local", "tos"]).default("local"),
  LOCAL_STORAGE_SIGNING_SECRET: z.string().min(32).default("development-local-storage-secret-32-chars"),
  TOS_ENDPOINT: z.string().min(1).default("tos-cn-beijing.volces.com"),
  TOS_REGION: z.string().min(1).default("cn-beijing"),
  TOS_BUCKET: optionalNonEmptyString,
  TOS_ACCESS_KEY: optionalNonEmptyString,
  TOS_SECRET_KEY: optionalNonEmptyString,
});

export function parseApiEnv(env: NodeJS.ProcessEnv) {
  return apiEnvSchema.parse(env);
}
