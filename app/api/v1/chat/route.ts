import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Logger } from "pino";
import { z } from "zod";
import { checkPayloadSize, ErrorResponses } from "@/lib/api/errors";
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
import { env } from "@/lib/env";
import {
  buildSystemPrompt,
  detectSuspiciousInput,
  type RetrievedDoc,
  retrieveContext,
} from "@/lib/services/chat";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1)
    .max(500, "Message must be between 1-500 characters"),
});

const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1, "At least one message is required")
    .max(50, "Maximum 50 messages allowed in conversation history")
    .refine(
      (messages) => messages[messages.length - 1].role === "user",
      "Last message must be from user",
    ),
  max_output_tokens: z.number().int().min(1).max(2000).optional().default(800),
  locale: z.string().optional().default("en"),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;
type ChatMessage = { role: "user" | "assistant"; content: string };

async function validateChatRequest(
  request: Request,
  requestId: string,
): Promise<
  | { success: true; body: ChatRequest; token: string }
  | { success: false; error: Response }
> {
  const authResult = validateBearerToken(request);
  if (!authResult.authorized) {
    return {
      success: false,
      error: ErrorResponses.unauthorized(
        authResult.reason || "unknown",
        requestId,
      ),
    };
  }

  if (!checkPayloadSize(request)) {
    return {
      success: false,
      error: ErrorResponses.payloadTooLarge(requestId),
    };
  }

  // Use extracted token to prevent rate limit bypass (not "Bearer <token>")
  const token = extractToken(request) || "";
  const rateLimitResult = checkRateLimit(token, RateLimits.chat);

  if (!rateLimitResult.allowed) {
    recordRateLimitHit("/api/v1/chat");
    const retryAfterSeconds = rateLimitResult.retryAfter || 60;
    const response = ErrorResponses.rateLimitExceeded(
      retryAfterSeconds,
      requestId,
    );
    response.headers.set("Retry-After", String(retryAfterSeconds));
    return { success: false, error: response };
  }

  let body: ChatRequest;
  try {
    const rawBody = await request.json();
    body = chatRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: ErrorResponses.validationFailed(error.issues, requestId),
      };
    }
    return {
      success: false,
      error: ErrorResponses.badRequest("Invalid JSON", requestId),
    };
  }

  for (const message of body.messages) {
    if (message.role === "user" && detectSuspiciousInput(message.content)) {
      return {
        success: false,
        error: ErrorResponses.validationFailed(
          {
            reason: "suspicious_input",
            message: "Input contains suspicious patterns",
          },
          requestId,
        ),
      };
    }
  }

  return { success: true, body, token };
}

async function executeRagPipeline(messages: ChatMessage[]) {
  const retrievedDocs = await retrieveContext(messages);
  return {
    systemPrompt: buildSystemPrompt(retrievedDocs),
    retrievedDocs,
  };
}

async function createChatResponse(
  result: ReturnType<typeof streamText>,
  debugMode: boolean,
  retrievedDocs: RetrievedDoc[],
  requestId: string,
  startTime: number,
  origin: string | null,
): Promise<Response> {
  if (debugMode) {
    const text = await result.text;

    return Response.json(
      {
        answer: text,
        request_id: requestId,
        retrieved_docs: retrievedDocs.map((doc) => ({
          chunk_id: doc.chunkId,
          content: doc.content,
          similarity: doc.similarity,
          source_file: doc.sourceFile,
          document_title: doc.documentTitle,
        })),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  }

  const { getCorsHeaders } = await import("@/lib/api/headers");

  recordRequest("/api/v1/chat", Date.now() - startTime);

  return result.toTextStreamResponse({
    headers: {
      ...getCorsHeaders(origin || undefined),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function handleChatError(
  error: unknown,
  requestLogger: Logger,
  requestId: string,
  startTime: number,
): Response {
  recordError("/api/v1/chat");

  logError(requestLogger, error, {
    endpoint: "/api/v1/chat",
    latency_ms: Date.now() - startTime,
  });

  if (error instanceof TimeoutError) {
    const operation = (error as TimeoutError).message.includes("Embedding")
      ? "Embedding generation"
      : "LLM response";
    requestLogger.warn({ timeout_operation: operation }, "Request timed out");
    return ErrorResponses.gatewayTimeout(operation, requestId);
  }

  if (error instanceof Error) {
    if (
      error.message.includes("content-filter") ||
      error.message.includes("content_filter")
    ) {
      requestLogger.warn({ error_type: "content_filter" }, "Content filtered");
      return ErrorResponses.validationFailed(
        {
          reason: "content_filtered",
          message: "Content was filtered by provider",
        },
        requestId,
      );
    }

    if (error.message.includes("OpenAI") || error.message.includes("API")) {
      requestLogger.error({ error_type: "openai_api" }, "OpenAI API error");
      return ErrorResponses.serviceUnavailable("LLM provider", requestId);
    }
  }

  requestLogger.error("Unexpected error in chat endpoint");
  return ErrorResponses.internalError(requestId);
}

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const requestLogger = createRequestLogger(requestId, {
    endpoint: "/api/v1/chat",
    method: "POST",
  });

  try {
    const validation = await validateChatRequest(request, requestId);
    if (!validation.success)
      return (validation as { success: false; error: Response }).error;

    const { body } = validation;

    const { systemPrompt, retrievedDocs } = await executeRagPipeline(
      body.messages,
    );

    const result = streamText({
      model: openai(env.LLM_MODEL),
      system: systemPrompt,
      messages: body.messages,
    });

    const debugMode = new URL(request.url).searchParams.get("debug") === "1";
    const origin = request.headers.get("origin");

    return await createChatResponse(
      result,
      debugMode,
      retrievedDocs,
      requestId,
      startTime,
      origin,
    );
  } catch (error) {
    return handleChatError(error, requestLogger, requestId, startTime);
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
