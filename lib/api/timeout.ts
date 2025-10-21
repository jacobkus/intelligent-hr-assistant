/**
 * Timeout utilities for external API calls.
 * Per spec (Section 5):
 * - Database queries: 5s
 * - Embedding generation: 10s
 * - LLM streaming: 30s
 */

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(operation, timeoutMs)),
        timeoutMs,
      ),
    ),
  ]);
}

export const Timeouts = {
  DATABASE: 5000,
  EMBEDDING: 10000,
  LLM: 30000,
  SSE: 60000,
} as const;
