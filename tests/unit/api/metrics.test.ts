import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMetrics,
  recordError,
  recordRequest,
  resetMetrics,
} from "@/lib/api/metrics";

/**
 * Focused regression tests for metrics collection.
 * Only tests critical paths that prevent production failures:
 * 1. Percentile calculation accuracy (dashboards depend on this)
 * 2. Division by zero prevention (prevents crashes)
 * 3. Error rate calculation (monitoring depends on this)
 */
describe("Metrics Collection - Critical Paths", () => {
  let originalDateNow: () => number;
  let currentTime: number;

  beforeEach(() => {
    resetMetrics();
    originalDateNow = Date.now;
    currentTime = 1_700_000_000_000; // Fixed timestamp
    Date.now = vi.fn(() => currentTime);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    resetMetrics();
  });

  it("calculates P50, P95, P99 correctly with known dataset (CRITICAL: dashboard accuracy)", () => {
    /**
     * CRITICAL: Percentile math must be correct for production dashboards.
     * Incorrect percentiles lead to wrong performance conclusions.
     * This tests with known dataset to verify calculation correctness.
     */
    // Dataset: [100, 200, 300, 400, 500]
    const latencies = [100, 200, 300, 400, 500];
    for (const latency of latencies) {
      recordRequest("/api/v1/chat", latency);
    }

    const metrics = getMetrics("/api/v1/chat");
    expect(metrics.latency.p50).toBe(300); // Median
    expect(metrics.latency.p95).toBe(500); // 95th percentile
    expect(metrics.latency.p99).toBe(500); // 99th percentile (same as max for small dataset)
    expect(metrics.latency.avg).toBe(300); // (100+200+300+400+500)/5
  });

  it("handles empty latency array without crashing (REGRESSION: division by zero)", () => {
    /**
     * CRITICAL: Prevents crashes when no requests have been recorded yet.
     * Division by zero or NaN values break monitoring dashboards.
     */
    const metrics = getMetrics("/api/v1/chat");

    expect(metrics.latency.p50).toBe(0);
    expect(metrics.latency.p95).toBe(0);
    expect(metrics.latency.p99).toBe(0);
    expect(metrics.latency.avg).toBe(0);
    expect(Number.isNaN(metrics.latency.avg)).toBe(false);
    expect(Number.isNaN(metrics.error_rate)).toBe(false);
  });

  it("calculates error rate correctly (monitoring depends on this)", () => {
    /**
     * Error rate drives alerting. Must be accurate.
     * Formula: errors / total_requests
     */
    recordRequest("/api/v1/chat", 100);
    recordRequest("/api/v1/chat", 100);
    recordRequest("/api/v1/chat", 100);
    recordRequest("/api/v1/chat", 100);
    recordError("/api/v1/chat");

    const metrics = getMetrics("/api/v1/chat");
    expect(metrics.count).toBe(4);
    expect(metrics.errors).toBe(1);
    expect(metrics.error_rate).toBe(0.25); // 1/4 = 0.25 = 25%

    // Edge case: errors with zero requests (should return 0, not NaN)
    resetMetrics();
    recordError("/api/v1/retrieve");
    const edgeCaseMetrics = getMetrics("/api/v1/retrieve");
    expect(edgeCaseMetrics.error_rate).toBe(0);
    expect(Number.isNaN(edgeCaseMetrics.error_rate)).toBe(false);
  });
});
