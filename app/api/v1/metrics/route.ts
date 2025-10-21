import { ErrorResponses } from "@/lib/api/errors";
import { getAllMetrics } from "@/lib/api/metrics";
import { generateRequestId } from "@/lib/api/request-id";
import { validateBearerToken } from "@/lib/auth/bearer";

/**
 * GET /api/v1/metrics
 *
 * Returns current metrics for all endpoints.
 * Requires authentication.
 *
 * Metrics include:
 * - Request counts
 * - Error rates
 * - Latency percentiles (P50, P95, P99)
 * - Rate limit hits
 */
export async function GET(request: Request) {
  const requestId = generateRequestId();

  // Require authentication
  const authResult = validateBearerToken(request);
  if (!authResult.authorized) {
    return ErrorResponses.unauthorized(
      authResult.reason || "unknown",
      requestId,
    );
  }

  const metrics = getAllMetrics();

  return Response.json(
    {
      metrics,
      request_id: requestId,
      timestamp: new Date().toISOString(),
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
