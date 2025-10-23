import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export interface AuthResult {
  authorized: boolean;
  reason?: "token_missing" | "token_invalid" | "token_malformed";
}

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  const accessTokenHeader = request.headers.get("x-access-token");

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return accessTokenHeader || null;
}

export function validateBearerToken(request: Request): AuthResult {
  const authHeader = request.headers.get("authorization");
  const providedToken = extractToken(request);

  if (authHeader && !authHeader.startsWith("Bearer ") && !providedToken) {
    return { authorized: false, reason: "token_malformed" };
  }

  if (!providedToken) {
    return { authorized: false, reason: "token_missing" };
  }

  const expectedToken = env.API_SECRET_TOKEN;

  // Use constant-time comparison to prevent timing attacks
  try {
    const isValid = timingSafeEqual(
      Buffer.from(providedToken),
      Buffer.from(expectedToken),
    );

    return isValid
      ? { authorized: true }
      : { authorized: false, reason: "token_invalid" };
  } catch {
    return { authorized: false, reason: "token_invalid" };
  }
}
