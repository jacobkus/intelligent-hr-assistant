import { env } from "@/lib/env";

/**
 * Standard cache control headers to prevent caching of sensitive HR data.
 * Per spec: HR data is sensitive and must not be cached.
 */
export const CACHE_CONTROL_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function getCorsHeaders(requestOrigin?: string): HeadersInit {
  const allowedOrigins = env.ALLOWED_ORIGINS;

  let allowedOrigin = allowedOrigins[0];

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    allowedOrigin = requestOrigin;
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Access-Token",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function getStandardHeaders(includeCors = true): HeadersInit {
  return {
    ...CACHE_CONTROL_HEADERS,
    ...(includeCors ? getCorsHeaders() : {}),
  };
}

export function createJsonResponse(
  data: Record<string, unknown>,
  options: {
    status?: number;
    requestId: string;
    includeCors?: boolean;
  } = { status: 200, requestId: "", includeCors: true },
): Response {
  const { status = 200, requestId, includeCors = true } = options;

  return Response.json(
    { ...data, request_id: requestId },
    {
      status,
      headers: getStandardHeaders(includeCors),
    },
  );
}
