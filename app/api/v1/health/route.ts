import { sql } from "drizzle-orm";
import { generateRequestId } from "@/lib/api/request-id";
import { db } from "@/lib/db";

interface HealthCheck {
  healthy: boolean;
  latency_ms?: number;
}

interface HealthResponse {
  status: "ok" | "degraded" | "unhealthy";
  request_id: string;
  checks: {
    database: HealthCheck;
    vector_extension: HealthCheck;
    embedding_provider: HealthCheck;
  };
  timestamp: string;
}

export async function GET() {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  const checks = {
    database: { healthy: false, latency_ms: 0 },
    vector_extension: { healthy: false },
    embedding_provider: { healthy: true }, // Cached/skipped per spec
  };

  try {
    const dbStart = performance.now();
    await db.execute(sql`SELECT 1`);
    const dbLatency = Math.round(performance.now() - dbStart);

    checks.database = {
      healthy: true,
      latency_ms: dbLatency,
    };

    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'vector'
        ) as has_vector
      `);

      checks.vector_extension = {
        healthy: Boolean(result.rows[0]?.has_vector),
      };
    } catch {
      checks.vector_extension = { healthy: false };
    }

    // Per spec/app/40_api.md:162: "Embedding check: cached result or skipped"
    // Rationale: Avoid exposing provider details (security via obscurity) and excessive latency
    // Security note: Provider names and version info omitted to prevent reconnaissance
    // Future enhancement: Implement cached health check with TTL or async background probe
    checks.embedding_provider = { healthy: true };

    // Determine overall status
    const allHealthy = Object.values(checks).every((check) => check.healthy);
    const criticalHealthy = checks.database.healthy; // Database is critical

    let status: "ok" | "degraded" | "unhealthy";
    if (allHealthy) {
      status = "ok";
    } else if (criticalHealthy) {
      status = "degraded"; // Non-critical issues
    } else {
      status = "unhealthy"; // Critical dependency down
    }

    const response: HealthResponse = {
      status,
      request_id: requestId,
      checks,
      timestamp,
    };

    // Return 200 for ok/degraded, 503 for unhealthy
    return Response.json(response, {
      status: status === "unhealthy" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);

    // Critical failure - database unavailable
    const response: HealthResponse = {
      status: "unhealthy",
      request_id: requestId,
      checks,
      timestamp,
    };

    return Response.json(response, {
      status: 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }
}
