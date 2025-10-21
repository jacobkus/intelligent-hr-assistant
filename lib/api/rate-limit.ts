/**
 * In-memory sliding window rate limiter. Uses lazy per-key cleanup (O(1)) instead of
 * global sweeps (O(n)) for better performance as token count grows.
 * Limits per spec: Chat 20/min, Retrieval 60/min.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Lazy cleanup: only clean this key's timestamps instead of scanning all keys.
// Prevents performance degradation as total key count grows (O(1) vs O(n)).
function cleanupExpiredTimestamps(
  key: string,
  now: number,
  windowMs: number,
): void {
  const entry = store.get(key);
  if (!entry) return;

  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length === 0) {
    store.delete(key);
  }
}

export interface RateLimitConfig {
  endpoint: string;
  maxRequests: number;
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export function checkRateLimit(
  token: string,
  config: RateLimitConfig,
): RateLimitResult {
  const { endpoint, maxRequests, windowMs = 60000 } = config;
  const key = `${endpoint}:${token}`;
  const now = Date.now();

  cleanupExpiredTimestamps(key, now, windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  if (entry.timestamps.length >= maxRequests) {
    const oldestTimestamp = entry.timestamps[0];
    const resetAt = oldestTimestamp + windowMs;
    const retryAfter = Math.ceil((resetAt - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter,
    };
  }

  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}

export const RateLimits = {
  chat: { endpoint: "chat", maxRequests: 20 },
  retrieve: { endpoint: "retrieve", maxRequests: 60 },
} as const;
