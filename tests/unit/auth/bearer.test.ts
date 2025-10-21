import { describe, expect, it, vi } from "vitest";

// Mock the env module to return our test token
vi.mock("@/lib/env.mjs", () => ({
  env: {
    API_SECRET_TOKEN: "test-token-12345678901234567890123456789012",
    NODE_ENV: "test",
    DATABASE_URL: "mock-db-url",
    OPENAI_API_KEY: "mock-key",
    ALLOWED_ORIGINS: ["http://localhost:3000"],
    LLM_MODEL: "gpt-5-mini",
  },
}));

import { extractToken, validateBearerToken } from "@/lib/auth/bearer";

/**
 * Focused regression tests for bearer token authentication.
 * Only tests critical paths that prevent production failures:
 * 1. Rate limit bypass (actual bug from Phase 1)
 * 2. Security bypasses (missing auth, invalid tokens)
 * 3. Core extraction logic
 */
describe("Bearer Token Authentication - Critical Paths", () => {
  const VALID_TOKEN = "test-token-12345678901234567890123456789012";

  it("extracts and validates correct Bearer token", () => {
    const request = new Request("http://localhost", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });

    const token = extractToken(request);
    expect(token).toBe(VALID_TOKEN);

    const result = validateBearerToken(request);
    expect(result.authorized).toBe(true);
  });

  it("extracts token value without 'Bearer' prefix (REGRESSION: prevents rate limit bypass)", () => {
    /**
     * CRITICAL: Phase 1 bug allowed rate limit bypass by using full "Bearer <token>"
     * string as rate limit key. Different header formats created different keys.
     * This test prevents that regression.
     */
    const request = new Request("http://localhost", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });

    const token = extractToken(request);
    expect(token).toBe(VALID_TOKEN);
    expect(token).not.toContain("Bearer");

    // Verify it works as rate limit key
    const request2 = new Request("http://localhost", {
      headers: { "X-Access-Token": VALID_TOKEN },
    });

    const token2 = extractToken(request2);
    expect(token).toBe(token2); // Same token value regardless of header
  });

  it("rejects missing or invalid tokens (SECURITY: prevent auth bypass)", () => {
    /**
     * CRITICAL: Auth bypass prevention. Must block unauthorized requests.
     */
    // Missing auth
    const noAuth = new Request("http://localhost");
    expect(validateBearerToken(noAuth).authorized).toBe(false);
    expect(validateBearerToken(noAuth).reason).toBe("token_missing");

    // Invalid token
    const invalidAuth = new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(validateBearerToken(invalidAuth).authorized).toBe(false);
    expect(validateBearerToken(invalidAuth).reason).toBe("token_invalid");
  });
});
