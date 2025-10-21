import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, type RateLimitConfig } from "@/lib/api/rate-limit";

/**
 * Focused regression tests for rate limiting.
 * Only tests critical paths that prevent production failures:
 * 1. Sliding window algorithm correctness (easy to break)
 * 2. Security isolation (cross-user leakage)
 * 3. Off-by-one errors
 * 4. User-facing accuracy (remaining count)
 */
describe("Rate Limiting - Critical Paths", () => {
  let originalDateNow: () => number;
  let currentTime: number;

  beforeEach(() => {
    // Mock Date.now() for deterministic timing
    originalDateNow = Date.now;
    currentTime = 1_700_000_000_000; // Fixed timestamp
    Date.now = vi.fn(() => currentTime);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  const chatConfig: RateLimitConfig = {
    endpoint: "chat",
    maxRequests: 20,
    windowMs: 60_000, // 1 minute
  };

  it("blocks request exceeding limit (prevents abuse)", () => {
    // Make 20 requests (at limit)
    for (let i = 0; i < 20; i++) {
      checkRateLimit("token-exceed-limit", chatConfig);
    }

    // 21st request should be blocked
    const result = checkRateLimit("token-exceed-limit", chatConfig);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("allows requests after sliding window expires (REGRESSION: algorithm correctness)", () => {
    /**
     * CRITICAL: Sliding window math is subtle and error-prone.
     * This is the core behavior that must work correctly.
     */
    // Make 20 requests at t=0
    for (let i = 0; i < 20; i++) {
      checkRateLimit("token-window-expire", chatConfig);
    }

    // Verify we're at limit
    let result = checkRateLimit("token-window-expire", chatConfig);
    expect(result.allowed).toBe(false);

    // Fast-forward 61 seconds (past the window)
    currentTime += 61_000;

    // Should allow new requests now
    result = checkRateLimit("token-window-expire", chatConfig);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it("isolates limits per token (SECURITY: prevents cross-user leakage)", () => {
    /**
     * CRITICAL: Different tokens must have separate limits.
     * Prevents one user from consuming another user's quota.
     */
    // Token A: use up limit
    for (let i = 0; i < 20; i++) {
      checkRateLimit("tokenA", chatConfig);
    }

    const resultA = checkRateLimit("tokenA", chatConfig);
    expect(resultA.allowed).toBe(false);

    // Token B: should have full limit available
    const resultB = checkRateLimit("tokenB", chatConfig);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(19);
  });

  it("handles partial window expiration correctly (edge case)", () => {
    /**
     * Tests correct sliding window behavior when requests span multiple time periods.
     * This edge case breaks in production if window calculation is wrong.
     */
    // Make 10 requests at t=0
    for (let i = 0; i < 10; i++) {
      checkRateLimit("token-partial-window", chatConfig);
    }

    // Fast-forward 30 seconds
    currentTime += 30_000;

    // Make 10 more requests at t=30s
    for (let i = 0; i < 10; i++) {
      checkRateLimit("token-partial-window", chatConfig);
    }

    // At limit now (20 requests within 60s window)
    let result = checkRateLimit("token-partial-window", chatConfig);
    expect(result.allowed).toBe(false);

    // Fast-forward 31 seconds (t=61s total)
    // First 10 requests should have expired
    currentTime += 31_000;

    // Should allow new requests (only 10 requests in current window)
    result = checkRateLimit("token-partial-window", chatConfig);
    expect(result.allowed).toBe(true);
  });

  it("tracks remaining count accurately (user-facing)", () => {
    /**
     * Users see remaining count in headers. Must be accurate.
     */
    const result1 = checkRateLimit("token-remaining-count", chatConfig);
    expect(result1.remaining).toBe(19);

    const result2 = checkRateLimit("token-remaining-count", chatConfig);
    expect(result2.remaining).toBe(18);

    const result3 = checkRateLimit("token-remaining-count", chatConfig);
    expect(result3.remaining).toBe(17);
  });
});
