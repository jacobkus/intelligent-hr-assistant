import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v4";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    API_SECRET_TOKEN: z
      .string()
      .min(32, "API_SECRET_TOKEN must be at least 32 characters for security"),
    ALLOWED_ORIGINS: z
      .string()
      .optional()
      .default("http://localhost:3000")
      .transform((val) => val.split(",").map((origin) => origin.trim())),
    LLM_MODEL: z
      .string()
      .optional()
      .default("gpt-5-mini")
      .describe("OpenAI model for chat completions (e.g., gpt-5-mini, gpt-5)"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    API_SECRET_TOKEN: process.env.API_SECRET_TOKEN,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    LLM_MODEL: process.env.LLM_MODEL,
  },
  // Skip validation during build (when env vars might not be available)
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
