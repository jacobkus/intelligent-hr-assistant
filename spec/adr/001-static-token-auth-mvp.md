# ADR-001: Static Bearer Token Authentication for MVP

**Status**: Accepted
**Date**: 2025-10-21
**Decision Makers**: Engineering Team
**Related**: `spec/app/40_api.md` (Section 3)

## Context

The HR Assistant API requires authentication to:
1. Prevent unauthorized access to company HR knowledge base
2. Enable basic usage tracking and rate limiting
3. Comply with security requirements for internal tools
4. Protect against abuse of LLM/embedding API costs

For the MVP phase, we need a simple authentication mechanism that:
- Can be implemented quickly (minimal infrastructure)
- Provides sufficient security for internal-only deployment
- Doesn't require user management system
- Can be easily tested and deployed

## Decision

We will implement **static bearer token authentication** using a single shared token stored in environment variables.

### Implementation Details

- **Token storage**: `API_SECRET_TOKEN` environment variable
- **Token format**: Random, cryptographically secure string (min 32 characters, alphanumeric)
- **Validation method**: Constant-time string comparison (prevents timing attacks)
- **Header support**:
  - `Authorization: Bearer <token>` (primary, follows HTTP standards)
  - `X-Access-Token: <token>` (alternative for scripts/tooling)
- **Scope**: Required for `/api/v1/chat` and `/api/v1/retrieve`; `/api/v1/health` remains public

### Example Token Generation

```bash
# Generate secure random token (32 bytes = 64 hex chars)
openssl rand -hex 32

# Set in .env.local
API_SECRET_TOKEN=a3f8d9c2e1b4f7a6d8e2c5b9f1a4d7e0c3b6a9f2e5d8c1b4a7f0e3d6c9b2a5f8
```

### Token Validation Implementation

**Critical**: Use constant-time comparison to prevent timing attacks.

```typescript
import { timingSafeEqual } from 'node:crypto';

function validateBearerToken(request: Request): boolean {
  // Extract token from Authorization header or X-Access-Token
  const authHeader = request.headers.get('authorization');
  const accessTokenHeader = request.headers.get('x-access-token');

  let providedToken: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    providedToken = authHeader.slice(7); // Remove "Bearer " prefix
  } else if (accessTokenHeader) {
    providedToken = accessTokenHeader;
  }

  if (!providedToken) {
    return false; // No token provided
  }

  const expectedToken = process.env.API_SECRET_TOKEN;

  if (!expectedToken) {
    throw new Error('API_SECRET_TOKEN not configured');
  }

  // ❌ WRONG - Vulnerable to timing attacks:
  // if (providedToken === expectedToken) { ... }

  // ✅ CORRECT - Constant-time comparison:
  try {
    return timingSafeEqual(
      Buffer.from(providedToken),
      Buffer.from(expectedToken)
    );
  } catch {
    // timingSafeEqual throws if lengths don't match
    // This is safe - length info isn't sensitive
    return false;
  }
}
```

**Why constant-time matters**:
- String comparison (`===`) exits early on first mismatched character
- Attacker can measure response time to guess token character-by-character
- `timingSafeEqual` always compares full length, preventing timing leaks
- See: [Codahale's timing attack explanation](https://codahale.com/a-lesson-in-timing-attacks/)

## Considered Alternatives

### 1. JWT with Signature Validation

**Pros**:
- Industry standard
- Supports expiration, claims, and revocation
- Can encode user identity for per-user tracking

**Cons**:
- Requires token issuance infrastructure (who generates JWTs?)
- Needs key management (public/private keys or HMAC secret)
- Overkill for single internal tool with ~5-10 users
- Adds complexity: token refresh, expiration handling

**Decision**: Too complex for MVP scope.

### 2. Session-Based (Cookie + Database)

**Pros**:
- Supports per-user sessions
- Easy revocation (delete session record)
- Familiar pattern for web apps

**Cons**:
- Requires session store (database table or Redis)
- Cookie management complexity for API (CSRF, SameSite)
- Adds database dependency for every auth check
- Not suitable for non-browser clients (scripts, mobile)

**Decision**: Not appropriate for stateless API design.

### 3. API Keys per User

**Pros**:
- Per-user tracking and rate limiting
- Individual revocation

**Cons**:
- Requires user management system
- API key generation/storage infrastructure
- Key rotation policy needed
- Over-engineered for 5-10 internal users

**Decision**: Deferred to post-MVP when user base grows.

### 4. No Authentication (Public API)

**Pros**:
- Simplest possible implementation
- No auth code to maintain

**Cons**:
- Unacceptable security risk (exposes company HR data)
- No usage tracking or rate limiting
- Vulnerable to abuse (LLM costs could spike)
- Non-compliant with security policies

**Decision**: Rejected due to security requirements.

## Consequences

### Positive

- **Fast implementation**: ~30 minutes to implement and test
- **Simple deployment**: Single environment variable, no database changes
- **Easy testing**: One token shared across test environments
- **Sufficient security**: For internal-only MVP with trusted users
- **Cost protection**: Prevents public abuse of LLM/embedding APIs
- **Rate limiting enabled**: Can track requests by IP + token validation

### Negative

- **Single point of failure**: One compromised token = full access
- **No user tracking**: Can't attribute requests to individuals
- **Manual rotation**: Changing token requires redeploying all clients
- **Shared credential**: All users have same access level (no RBAC)
- **Token leakage risk**: If committed to git or logged, full compromise

### Mitigation Strategies

1. **Token rotation runbook**:

   **Frequency**: Quarterly (every 3 months) or immediately if compromise suspected.

   **Procedure**:
   ```bash
   # Step 1: Generate new token (32 bytes = 64 hex chars)
   NEW_TOKEN=$(openssl rand -hex 32)
   echo "New token: $NEW_TOKEN"

   # Step 2: Update environment variable (keep old token as fallback)
   # In deployment platform (Vercel, AWS, etc.):
   API_SECRET_TOKEN="$NEW_TOKEN"
   API_SECRET_TOKEN_OLD="<previous_token>"  # Fallback for 24h

   # Step 3: Deploy API with dual-token support
   # Auth middleware should accept both tokens for 24h grace period

   # Step 4: Notify all API clients (internal teams)
   # Send secure message with new token via 1Password/secure channel

   # Step 5: Wait 24 hours for clients to update

   # Step 6: Remove fallback token
   # Remove API_SECRET_TOKEN_OLD from environment
   unset API_SECRET_TOKEN_OLD

   # Step 7: Redeploy and verify
   # Confirm old token returns 401
   ```

   **Token entropy requirement**: Minimum 128 bits (32 hex characters = 128 bits). This provides sufficient randomness against brute-force attacks (2^128 possibilities).

   **Calendar reminder**: Set recurring quarterly reminder in team calendar.

2. **Access logging**:
   - Log IP addresses with timestamps (detect abnormal patterns)
   - Alert on requests from unexpected geolocations/IPs

3. **Leak prevention**:
   - Add `API_SECRET_TOKEN` to `.gitignore` examples
   - Redact from application logs (already specified in spec)
   - Configure pre-commit hook to detect token patterns:

   ```yaml
   # .pre-commit-config.yaml
   - repo: https://github.com/Yelp/detect-secrets
     rev: v1.4.0
     hooks:
       - id: detect-secrets
         args: ['--baseline', '.secrets.baseline']
   ```

   Run `detect-secrets scan --baseline .secrets.baseline` to initialize.

   - Enable GitHub secret scanning (automatic for public repos, requires GitHub Advanced Security for private repos)
   - Use environment-specific `.env` files (never commit `.env.local` or `.env.production`)

4. **Audit trail**:
   - Log all authenticated requests (endpoint, timestamp, IP, request_id)
   - Monitor for suspicious activity (rate limit hits, repeated 401s)

## Migration Path (Post-MVP)

When user base grows beyond 10 users or security requirements increase:

1. **Phase 1**: Add JWT support alongside static token
   - Generate JWTs with user claims (email, role)
   - Validate both JWT and static token (gradual migration)
   - Implement token issuance endpoint or integration with SSO

2. **Phase 2**: Per-user API keys
   - Add `api_keys` table (user_id, key_hash, created_at, expires_at)
   - Implement key generation/revocation UI
   - Migrate users from static token to individual keys

3. **Phase 3**: SSO integration
   - Integrate with corporate SAML/OAuth provider
   - Use session cookies or access tokens from IdP
   - Remove static token authentication entirely

## Acceptance Criteria

- [x] `API_SECRET_TOKEN` environment variable documented
- [x] Constant-time comparison implemented (prevents timing attacks)
- [x] Both `Authorization` and `X-Access-Token` headers supported
- [x] 401 error responses structured with reason codes
- [x] Token redacted from all logs
- [x] Health endpoint remains public (no auth required)
- [x] Token rotation procedure documented

## References

- OWASP API Security Top 10: https://owasp.org/API-Security/
- IETF RFC 6750 (Bearer Token Usage): https://tools.ietf.org/html/rfc6750
- Constant-time comparison: https://codahale.com/a-lesson-in-timing-attacks/
