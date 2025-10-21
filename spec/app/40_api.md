# REST API Plan (Minimal per High-Level Specs)

## 1. Resources

- **retrieve**: Computed resource that executes semantic search over chunk embeddings (no dedicated table).
- **chat**: Orchestrates retrieval, prompt assembly, and LLM streaming (no dedicated table).

Notes
- Data lives in `documents` and `chunks` tables; ingestion and embeddings are handled by scripts (not API).
- Retrieval queries operate over `chunks.embedding` (vector, 1536 dims) and join `documents` for metadata.

## 2. Endpoints

General conventions
- Base path: `/api/v1` (versioned for future compatibility)
- Runtime implementation: Next.js 15 App Router route handlers under `app/api/v1/**` (export `POST` or `GET`).
- Content types: `application/json` for standard responses; chat streaming uses `text/event-stream` (SSE). Debug mode for chat returns JSON.
- Authentication: All endpoints (except `/health`) require a token (see section 3).
- Error model: JSON `{ error: { code: string, message: string, details?: object }, request_id: string }`
- Request IDs: All responses include a unique `request_id` for debugging and tracing.

### 2.1 Retrieval (Semantic Search)

#### POST /api/v1/retrieve
- Description: Compute query embedding and return top‑k similar chunks using pgvector.
- Request JSON:
  ```json
  {
    "query": "How many vacation days do I get?",
    "top_k": 8,
    "min_similarity": 0.7,
    "filters": { "document_id": "uuid" }
  }
  ```
- Behavior:
  - Use embeddings model `text-embedding-3-small` (1536 dims).
  - Filter on `embedding IS NOT NULL`.
  - Order by `embedding <=> :queryEmbedding` ascending and return `top_k` results.
  - Convert pgvector distance to similarity: `similarity = 1 - distance` (verified via `tests/similarity-test.ts` - OpenAI embeddings are normalized, distances ∈ [0, 1]).
  - Filter results to only include chunks where `similarity >= min_similarity`.
- Validations:
  - `query`: required, 1–500 chars.
  - `top_k`: optional, 1–50 (default 8).
  - `min_similarity`: optional, 0.0–1.0 (similarity threshold; higher is better; default 0.7).
- Response 200 JSON:
  ```json
  {
    "query": "...",
    "request_id": "req_abc123",
    "results": [
      {
        "chunk": {"id":"uuid","document_id":"uuid","chunk_index":0,"content":"...","section_title":"..."},
        "document": {"id":"uuid","title":"...","source_file":"content/hr/...md"},
        "similarity": 0.85
      }
    ]
  }
  ```
- Errors:
  - **400** (Bad Request): Malformed JSON, invalid field types.
  - **422** (Unprocessable Entity): Validation failed (e.g., query too long, top_k out of range).
  - **401** (Unauthorized): Missing or invalid authentication token.
  - **429** (Too Many Requests): Rate limit exceeded.
  - **500** (Internal Server Error): Unexpected server error.
  - **503** (Service Unavailable): Embedding provider unavailable.
  - **504** (Gateway Timeout): Embedding generation timed out (>10s).

### 2.2 Chat (RAG Orchestration)

#### POST /api/v1/chat
- Description: Validate input, call retrieval internally, build system prompt, invoke the LLM, and stream response. Supports multi-turn conversations.
- Request JSON (compatible with Vercel AI SDK):
  ```json
  {
    "messages": [
      {"role": "user", "content": "What is our parental leave policy?"},
      {"role": "assistant", "content": "Our parental leave policy provides..."},
      {"role": "user", "content": "What about remote employees?"}
    ],
    "max_output_tokens": 800,
    "locale": "en"
  }
  ```
- Message roles:
  - `user`: User messages (questions/prompts)
  - `assistant`: Previous AI responses (for conversation history)
  - `system`: System-level instructions (reserved, not accepted from clients)
- Default behavior: streams `text/event-stream` with incremental tokens.
- Debug mode: if query parameter `?debug=1`, return 200 JSON (no streaming):
  ```json
  {
    "answer": "full final answer text",
    "request_id": "req_abc123",
    "retrieved_docs": [
      {"chunk_id":"uuid","content":"...","similarity":0.85,"source_file":"content/hr/05-benefits-overview.md","document_title":"Benefits Overview"}
    ]
  }
  ```
- Validations:
  - `messages`: required array with at least one message.
  - Last message must have `role: "user"`.
  - Each user message content: 1–500 chars.
  - Basic input filtering: reject inputs containing suspicious patterns (e.g., "ignore previous instructions", "system:", encoded commands). See section 3 for details and limitations.
  - `locale`: optional string (BCP 47 format, e.g., "en", "en-US"). Currently accepted but not used; reserved for future i18n. Default: "en".
  - Total request payload: max 50KB (see Request Size Limits in section 5).
- Behavior:
  - API is stateless - client must send full conversation history each request.
  - Only the latest user message is used for retrieval; conversation history provides LLM context.
  - **Non-idempotent**: Same query may produce different responses due to LLM variability.
  - **Retry policy**: Clients should NOT automatically retry failed requests. LLM responses have inherent randomness; retrying could produce duplicate/different answers. On 5xx errors, prompt user for confirmation before retrying.
- Streaming format (Vercel AI SDK compatible):
  ```
  0:"Our"
  0:" parental"
  0:" leave"
  0:" policy"
  0:" provides..."

  d:{"finishReason":"stop","usage":{"promptTokens":120,"completionTokens":45}}
  ```
  - Event format (newline-delimited):
    - `0:"text"` - Text delta (incremental chunk)
    - `d:{...}` - Done/finish event with metadata
    - `e:"message"` - Error event (stream interrupted)
  - Metadata in done event:
    - `finishReason`: `stop` (normal), `length` (max tokens), `content-filter` (rejected)
    - `usage`: Token counts (optional for monitoring)
  - Connection timeout: 60 seconds
  - Client compatibility: Works with Vercel AI SDK's `useChat` hook
  - Client should NOT retry on 4xx errors
- No‑context fallback: If retrieval yields no confident results (all chunks < min_similarity), respond that context is insufficient and suggest rephrasing or contacting HR.
- Errors:
  - **400** (Bad Request): Malformed JSON, invalid message structure, messages array empty.
  - **422** (Unprocessable Entity): Validation failed (message too long, last message not user role, suspicious input detected).
  - **401** (Unauthorized): Missing or invalid authentication token.
  - **429** (Too Many Requests): Rate limit exceeded.
  - **500** (Internal Server Error): Unexpected server error.
  - **503** (Service Unavailable): LLM provider unavailable.
  - **504** (Gateway Timeout): LLM response timed out (>30s).

### 2.3 Health

#### GET /api/v1/health
- Description: Liveness and dependency health check.
- Response 200 JSON:
  ```json
  {
    "status": "ok",
    "request_id": "req_abc123",
    "checks": {
      "database": {"healthy": true, "latency_ms": 12},
      "vector_extension": {"healthy": true},
      "embedding_provider": {"healthy": true, "latency_ms": 145}
    },
    "timestamp": "2025-10-21T10:30:00Z"
  }
  ```
- Behavior:
  - Performs lightweight connectivity checks (not full integration tests).
  - Database check: simple `SELECT 1` query.
  - Vector check: verifies pgvector extension is loaded.
  - Embedding check: cached result or skipped (avoid exposing provider details or excessive latency).
  - **Security note**: Provider names and detailed version info intentionally omitted to prevent reconnaissance.
- Public: does not require authentication token.
- Status codes:
  - **200**: All checks passed or degraded (some non-critical failures).
  - **503**: Critical dependency unavailable (database down).

## 3. Authentication and Authorization

### Token-Based Authentication (MVP)

- **Mechanism**: Static bearer token validated against environment variable.
- **Token source**: `API_SECRET_TOKEN` environment variable (see ADR-001).
- **Headers accepted**:
  - `Authorization: Bearer <token>` (primary, standard HTTP auth)
  - `X-Access-Token: <token>` (alternative for local tooling/scripts)
- **Validation**:
  - Extract token from header (try `Authorization` first, fallback to `X-Access-Token`).
  - Compare using constant-time comparison to prevent timing attacks.
  - Reject if token missing, empty, or does not match `API_SECRET_TOKEN`.
- **Scope**:
  - Protected: `/api/v1/retrieve`, `/api/v1/chat`
  - Public: `/api/v1/health`

### Authentication Errors

- **401 Unauthorized** responses:
  ```json
  {
    "error": {
      "code": "unauthorized",
      "message": "Invalid or missing authentication token",
      "details": {"reason": "token_missing"}
    },
    "request_id": "req_abc123"
  }
  ```
  - `details.reason` values: `token_missing`, `token_invalid`, `token_malformed`

### Rate Limiting (MVP Defaults)

**Note**: Rate limiting kept simple for MVP. See production concerns (section 5) for future enhancements.

- **Chat**: 20 requests/minute per bearer token
- **Retrieval**: 60 requests/minute per bearer token
- **Scope**: Since MVP uses a single static token, all users share these limits
- **Future**: When migrating to per-user tokens, limits will apply individually per user
- **429 Too Many Requests** response:
  ```json
  {
    "error": {
      "code": "rate_limit_exceeded",
      "message": "Too many requests. Please try again later.",
      "details": {"retry_after_seconds": 45}
    },
    "request_id": "req_abc123"
  }
  ```
- Include `Retry-After` header (seconds until rate limit resets)

### Security & Privacy

- **Input validation**: Zod schemas on all payloads (strict type checking).
- **Basic input filtering** (defense-in-depth, not foolproof):
  - Keyword blocklist: "ignore previous instructions", "system:", "assistant:", "\<|im_start|\>", etc.
  - Pattern detection: base64-encoded commands, excessive special characters, role manipulation attempts.
  - Rejected requests return **422** with `details.reason: "suspicious_input"`.
  - **Important**: Sophisticated prompt injection attacks may bypass these filters. This is a basic layer of defense, not comprehensive protection.
  - **Future enhancements**: LLM-based input analysis, output filtering to detect leaked system prompts.
- **Payload limits**: Max 50KB request body (prevents DoS, see section 5).
- **Logging**:
  - Redact `Authorization` and `X-Access-Token` headers from logs.
  - Log request IDs, timestamps, endpoints, status codes, latency.
  - Do NOT persist user prompts or AI responses by default (GDPR/privacy).
- **HTTPS only**: Enforce in production (Next.js middleware or reverse proxy).

## 4. Validation and Business Logic

### Retrieval (Semantic Search)

- Filter chunks where `embedding IS NOT NULL`.
- Generate query embedding using OpenAI `text-embedding-3-small` (1536 dimensions).
- Query pgvector: `ORDER BY embedding <=> :queryEmbedding ASC LIMIT top_k`.
- Convert distance to similarity:
  - **Formula**: `similarity = 1 - distance`
  - **Rationale**: OpenAI `text-embedding-3-small` embeddings are L2-normalized (magnitude = 1).
  - **Verified**: `tests/similarity-test.ts` confirmed distances ∈ [0, 1] range.
  - **Result**: Similarity scores are intuitive percentages (0.7 = 70% similar).
- Filter results: only return chunks where `similarity >= min_similarity` (default 0.7).
- Return results with chunk content, document metadata, and similarity score.
- **Example**: Distance 0.2856 → Similarity 0.7144 (71% similar, above 0.7 threshold).

### Chat (RAG Orchestration)

- **Message validation**:
  - Require at least one message in array.
  - Last message must be `role: "user"`.
  - Each user message content: 1–500 characters.
  - Reject `role: "system"` messages from clients (reserved for internal use).
- **Retrieval** (internal, not separate HTTP call):
  - Extract latest user message content as query.
  - Call shared retrieval logic (same implementation as `/api/v1/retrieve` endpoint).
  - Generate embedding once using OpenAI `text-embedding-3-small`.
  - Query pgvector with defaults: `top_k: 8`, `min_similarity: 0.7`.
  - **Performance note**: No double-embedding; query is embedded once per chat request.
- **Prompt assembly**:
  - System prompt: "Answer based strictly on provided context. If context insufficient, say so and suggest contacting HR."
  - Include retrieved chunks as context.
  - Include conversation history (previous user/assistant messages).
- **LLM invocation**:
  - Stream response tokens using Server-Sent Events.
  - Timeout: 30 seconds.
  - Debug mode (`?debug=1`): return full JSON response instead of streaming.
- **No-context fallback**: If all retrieved chunks have `similarity < min_similarity`, respond with fallback message (no hallucination).

## 5. Production Concerns

### CORS Policy

For browser-based clients, configure Cross-Origin Resource Sharing:

```typescript
// Next.js middleware or route handler headers
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Access-Token
Access-Control-Max-Age: 86400
Access-Control-Allow-Credentials: true
```

- **Allowed origins**: Whitelist specific domains (not `*` wildcard for production).
- **Credentials**: Set to `true` if frontend needs to send cookies/auth headers.
- **Preflight caching**: `Max-Age: 86400` (24 hours) reduces OPTIONS requests.

### Cache Control

All API responses must include cache control headers to prevent caching of sensitive HR data:

```http
Cache-Control: no-store, no-cache, must-revalidate, private
Pragma: no-cache
Expires: 0
```

- **no-store**: Prevents caching in browser, CDN, or proxies
- **no-cache**: Forces revalidation on every request
- **must-revalidate**: Requires fresh data, never serve stale
- **private**: Response is user-specific, not cacheable by shared caches
- **Pragma: no-cache**: HTTP/1.0 backward compatibility
- **Expires: 0**: Legacy header to prevent caching

**Rationale**: HR data (benefits, policies) is sensitive and may contain personally identifiable information. Caching could expose data to unauthorized parties or serve outdated policy information.

### Request Size Limits

- **Max payload size**: 50KB (accommodates long conversations).
  - 50 messages × 500 chars × 2 bytes/char ≈ 50KB (reasonable upper bound)
  - Still small enough to prevent DoS attacks
- **Max message length**: 500 characters per user message.
- **Max conversation history**: 50 messages (prevent excessively large arrays).
- **Note**: For analyzing large documents, use `/api/v1/retrieve` instead of including full text in chat messages.
- Exceed limits → **413 Payload Too Large** response.

### Observability

**Request ID generation**:
- Generate unique ID per request (e.g., `req_${timestamp}_${randomHex}`).
- Include in all responses (`request_id` field).
- Propagate through logs, error messages, and spans.

**Structured logging** (JSON format):
```json
{
  "timestamp": "2025-10-21T10:30:00Z",
  "request_id": "req_abc123",
  "method": "POST",
  "path": "/api/v1/chat",
  "status": 200,
  "latency_ms": 1245,
  "user_agent": "Mozilla/5.0...",
  "ip": "203.0.113.42"
}
```

**Metrics to track**:
- Request counts per endpoint (success/error split)
- Latency percentiles (P50, P95, P99)
- Rate limit hit rate
- Embedding generation time
- LLM response time
- Vector search query time

**Error tracking**:
- Log stack traces for 5xx errors (not 4xx).
- Include request context (endpoint, payload size, auth status).
- Alert on error rate spikes (>5% for 5 minutes).

### Timeouts

- **Database queries**: 5 seconds
- **Embedding generation**: 10 seconds
- **LLM streaming**: 30 seconds
- **SSE connection**: 60 seconds idle timeout
- Return **504 Gateway Timeout** on timeout errors.

### Future Enhancements

Documented for post-MVP consideration:

1. **API versioning**: Already implemented (`/api/v1/`). For v2, add new endpoints without breaking v1.
2. **Authentication upgrade**: Migrate from static token to JWT with per-user tokens (see ADR-001).
3. **Rate limiting**: Move to distributed Redis-based rate limiting (per-user instead of per-IP).
4. **Pagination**: Add cursor-based pagination for large result sets (e.g., `?cursor=abc&limit=10`).
5. **Advanced filters**: Support date ranges, document categories, metadata filtering in `/retrieve`.
6. **Caching**: Cache embedding results for common queries (Redis TTL 5 minutes).
7. **Distributed tracing**: Integrate OpenTelemetry for end-to-end request tracing.
