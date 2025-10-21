import { generateRequestId } from "./request-id";

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  request_id: string;
}

export interface ApiErrorOptions {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;
}

export function createErrorResponse(options: ApiErrorOptions): Response {
  const { code, message, status, details, requestId } = options;

  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
    request_id: requestId || generateRequestId(),
  };

  return Response.json(body, { status });
}

export const ErrorResponses = {
  unauthorized: (reason: string, requestId?: string) =>
    createErrorResponse({
      code: "unauthorized",
      message: "Invalid or missing authentication token",
      status: 401,
      details: { reason },
      requestId,
    }),

  badRequest: (message: string, requestId?: string) =>
    createErrorResponse({
      code: "bad_request",
      message,
      status: 400,
      requestId,
    }),

  validationFailed: (errors: unknown, requestId?: string) =>
    createErrorResponse({
      code: "validation_failed",
      message: "Request validation failed",
      status: 422,
      details: { errors },
      requestId,
    }),

  rateLimitExceeded: (retryAfterSeconds: number, requestId?: string) =>
    createErrorResponse({
      code: "rate_limit_exceeded",
      message: "Too many requests. Please try again later.",
      status: 429,
      details: { retry_after_seconds: retryAfterSeconds },
      requestId,
    }),

  internalError: (requestId?: string) =>
    createErrorResponse({
      code: "internal_error",
      message: "An unexpected error occurred",
      status: 500,
      requestId,
    }),

  serviceUnavailable: (service: string, requestId?: string) =>
    createErrorResponse({
      code: "service_unavailable",
      message: `${service} is currently unavailable`,
      status: 503,
      requestId,
    }),

  gatewayTimeout: (operation: string, requestId?: string) =>
    createErrorResponse({
      code: "gateway_timeout",
      message: `${operation} timed out`,
      status: 504,
      requestId,
    }),

  payloadTooLarge: (requestId?: string) =>
    createErrorResponse({
      code: "payload_too_large",
      message: "Request payload exceeds maximum size (50KB)",
      status: 413,
      requestId,
    }),
};

export function checkPayloadSize(request: Request, maxSize = 51200): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    // If no Content-Length header, let request.json() fail naturally
    return true;
  }

  const size = Number.parseInt(contentLength, 10);
  return !Number.isNaN(size) && size <= maxSize;
}
