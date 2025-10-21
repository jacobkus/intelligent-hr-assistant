import pino from "pino";
import { env } from "@/lib/env.mjs";

/**
 * Structured logging via Pino. Redacts auth headers.
 * Per spec: log request IDs, timestamps, endpoints, status codes, latency.
 */

const isDevelopment = env.NODE_ENV === "development";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-access-token']",
      "headers.authorization",
      "headers['x-access-token']",
    ],
    remove: true,
  },
  base: {
    env: env.NODE_ENV,
  },
});

export function createRequestLogger(
  requestId: string,
  context?: Record<string, unknown>,
) {
  return logger.child({
    request_id: requestId,
    ...context,
  });
}

export function logRequest(
  logger: pino.Logger,
  req: {
    method: string;
    path: string;
    status: number;
    userAgent?: string;
  },
  startTime: number,
) {
  const latency = Date.now() - startTime;

  logger.info(
    {
      method: req.method,
      path: req.path,
      status: req.status,
      latency_ms: latency,
      user_agent: req.userAgent,
    },
    `${req.method} ${req.path} ${req.status} - ${latency}ms`,
  );
}

export function logError(
  logger: pino.Logger,
  error: unknown,
  context?: Record<string, unknown>,
) {
  if (error instanceof Error) {
    logger.error(
      {
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        ...context,
      },
      error.message,
    );
  } else {
    logger.error(
      {
        error: String(error),
        ...context,
      },
      "Unknown error occurred",
    );
  }
}
