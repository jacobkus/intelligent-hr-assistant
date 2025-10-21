import { z } from "zod/v4";
import { checkPayloadSize, ErrorResponses } from "@/lib/api/errors";
import { createJsonResponse } from "@/lib/api/headers";
import { createRequestLogger, logError } from "@/lib/api/logger";
import {
  recordError,
  recordRateLimitHit,
  recordRequest,
} from "@/lib/api/metrics";
import { checkRateLimit, RateLimits } from "@/lib/api/rate-limit";
import { generateRequestId } from "@/lib/api/request-id";
import { TimeoutError } from "@/lib/api/timeout";
import { extractToken, validateBearerToken } from "@/lib/auth/bearer";
import { semanticSearch } from "@/lib/services/retrieval";

const retrieveRequestSchema = z.object({
  query: z.string().min(1).max(500, "Query must be between 1-500 characters"),
  top_k: z.number().int().min(1).max(50).optional().default(8),
  min_similarity: z.number().min(0).max(1).optional().default(0.5),
  filters: z
    .object({
      document_id: z.string().uuid().optional(),
    })
    .optional(),
});

type RetrieveRequest = z.infer<typeof retrieveRequestSchema>;

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const requestLogger = createRequestLogger(requestId, {
    endpoint: "/api/v1/retrieve",
    method: "POST",
  });

  try {
    const authResult = validateBearerToken(request);
    if (!authResult.authorized) {
      return ErrorResponses.unauthorized(
        authResult.reason || "unknown",
        requestId,
      );
    }

    if (!checkPayloadSize(request)) {
      return ErrorResponses.payloadTooLarge(requestId);
    }

    // Use extracted token to prevent rate limit bypass (not "Bearer <token>")
    const token = extractToken(request) || "";
    const rateLimitResult = checkRateLimit(token, RateLimits.retrieve);

    if (!rateLimitResult.allowed) {
      recordRateLimitHit("/api/v1/retrieve");
      const retryAfterSeconds = rateLimitResult.retryAfter || 60;
      const response = ErrorResponses.rateLimitExceeded(
        retryAfterSeconds,
        requestId,
      );
      response.headers.set("Retry-After", String(retryAfterSeconds));
      return response;
    }

    let body: RetrieveRequest;
    try {
      const rawBody = await request.json();
      body = retrieveRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return ErrorResponses.validationFailed(error.issues, requestId);
      }
      return ErrorResponses.badRequest("Invalid JSON", requestId);
    }

    const results = await semanticSearch({
      query: body.query,
      topK: body.top_k,
      minSimilarity: body.min_similarity,
      filters: body.filters
        ? { documentId: body.filters.document_id }
        : undefined,
    });

    recordRequest("/api/v1/retrieve", Date.now() - startTime);

    return createJsonResponse(
      {
        query: body.query,
        results,
      },
      { requestId },
    );
  } catch (error) {
    recordError("/api/v1/retrieve");

    logError(requestLogger, error, {
      endpoint: "/api/v1/retrieve",
      latency_ms: Date.now() - startTime,
    });

    if (error instanceof TimeoutError) {
      requestLogger.warn(
        { timeout_operation: "embedding" },
        "Request timed out",
      );
      return ErrorResponses.gatewayTimeout("Embedding generation", requestId);
    }

    if (error instanceof Error) {
      if (error.message.includes("OpenAI") || error.message.includes("API")) {
        requestLogger.error({ error_type: "openai_api" }, "OpenAI API error");
        return ErrorResponses.serviceUnavailable(
          "Embedding provider",
          requestId,
        );
      }
    }

    requestLogger.error("Unexpected error in retrieve endpoint");
    return ErrorResponses.internalError(requestId);
  }
}

export async function OPTIONS(request: Request) {
  const { getCorsHeaders } = await import("@/lib/api/headers");
  const origin = request.headers.get("origin");

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin || undefined),
  });
}
