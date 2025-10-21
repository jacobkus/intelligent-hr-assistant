# API Implementation Complete

## What Was Built

The REST API has been fully implemented according to `spec/app/40_api.md` and `spec/adr/001-static-token-auth-mvp.md`.

### Endpoints Implemented

1. **POST /api/v1/retrieve** - Semantic search over HR knowledge base
2. **POST /api/v1/chat** - RAG-powered chat with streaming support
3. **GET /api/v1/health** - Health check endpoint (no auth required)

### Infrastructure Created

- **Authentication**: Bearer token validation with constant-time comparison (`lib/auth/bearer.ts`)
- **Rate Limiting**: In-memory sliding window rate limiter (`lib/api/rate-limit.ts`)
  - Chat: 20 requests/minute
  - Retrieve: 60 requests/minute
- **Error Handling**: Standardized error responses with request IDs (`lib/api/errors.ts`)
- **Headers**: Cache control and CORS configuration (`lib/api/headers.ts`)
- **Services**:
  - Retrieval service with pgvector similarity search (`lib/services/retrieval.ts`)
  - Chat service with RAG orchestration (`lib/services/chat.ts`)

### Key Features

✅ Bearer token authentication (Authorization header or X-Access-Token)
✅ Constant-time token comparison (prevents timing attacks)
✅ Rate limiting per endpoint
✅ Request ID generation for tracing
✅ Similarity formula: `similarity = 1 - distance` (verified formula)
✅ Input validation with Zod
✅ Basic prompt injection defense
✅ Streaming responses with Vercel AI SDK
✅ Debug mode for chat (`?debug=1`)
✅ CORS support
✅ Cache control headers (no-store)

## Setup Instructions

### 1. Set API Secret Token

Generate a secure token (minimum 32 characters):

```bash
openssl rand -hex 32
```

Add to `.env`:

```bash
API_SECRET_TOKEN=<your-generated-token>
```

### 2. Ensure Database Is Seeded

```bash
# Reset database and seed with HR documents
bun run db:reset

# Or just seed if database already exists
bun run db:seed
```

### 3. Start Development Server

```bash
bun dev
```

Server will start on http://localhost:3000

## Testing

### Option 1: Automated Test Script

```bash
bun run scripts/test-api.ts
```

This will test all endpoints and verify:
- Health check responds correctly
- Retrieve endpoint returns semantic search results
- Chat endpoint responds with debug mode
- Authentication properly rejects unauthorized requests

### Option 2: Manual Testing with curl

#### Health Check (No Auth Required)

```bash
curl http://localhost:3000/api/v1/health
```

Expected: `{ "status": "ok", ... }`

#### Retrieve Endpoint

```bash
curl -X POST http://localhost:3000/api/v1/retrieve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "query": "What are the vacation policies?",
    "top_k": 5,
    "min_similarity": 0.7
  }'
```

Expected: JSON with `results` array containing chunks, documents, and similarity scores

#### Chat Endpoint (Debug Mode)

```bash
curl -X POST "http://localhost:3000/api/v1/chat?debug=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "How many vacation days do employees get?"
      }
    ]
  }'
```

Expected: JSON with `answer` and `retrieved_docs`

#### Chat Endpoint (Streaming)

```bash
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Tell me about parental leave"
      }
    ]
  }'
```

Expected: Text stream with incremental tokens

### Option 3: Run Evaluation Suite

```bash
# Quick sanity check
bun run eval "How many vacation days do I get?"

# Full Promptfoo evaluation
bun run eval:promptfoo

# CI-friendly evaluation with reports
bun run eval:ci
```

## API Error Responses

All errors follow the standard format:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable message",
    "details": {}
  },
  "request_id": "req_abc123"
}
```

### Common Error Codes

- **401 Unauthorized**: Missing or invalid token
  - Reasons: `token_missing`, `token_invalid`, `token_malformed`
- **422 Validation Failed**: Request validation failed
  - Includes Zod validation errors in `details`
- **429 Rate Limit Exceeded**: Too many requests
  - Includes `retry_after_seconds` in `details`
- **500 Internal Error**: Unexpected server error
- **503 Service Unavailable**: Embedding or LLM provider unavailable
- **504 Gateway Timeout**: Operation timed out

## Rate Limits

Per spec (ADR-001):
- `/retrieve`: 60 requests/minute per token
- `/chat`: 20 requests/minute per token

Exceeded limits return 429 with `Retry-After` header.

## Security Features

1. **Authentication**: Constant-time token comparison prevents timing attacks
2. **Input Validation**: Zod schemas on all payloads
3. **Input Filtering**: Basic prompt injection detection (keyword blocklist)
4. **Cache Control**: No-store headers prevent caching of sensitive HR data
5. **CORS**: Configurable allowed origins
6. **Logging**: Auth headers redacted from logs

## Next Steps

1. ✅ Test all endpoints locally
2. ✅ Run evaluation suite: `bun run eval:promptfoo`
3. Configure CORS allowed origins for production
4. Set up structured logging (e.g., Pino, Winston)
5. Deploy to production with environment variables
6. Monitor error rates and latency
7. Consider migrating to JWT/per-user tokens (see ADR-001 migration path)

## Troubleshooting

### "API_SECRET_TOKEN must be at least 32 characters"

Generate a new token: `openssl rand -hex 32`

### "No results returned from /retrieve"

Ensure database is seeded: `bun run db:seed`

### "Service unavailable (embedding provider)"

Check `OPENAI_API_KEY` is set and valid in `.env`

### Build errors

Run `bun run check:fix` to auto-fix linting issues

## File Structure

```
app/api/v1/
├── chat/route.ts          # Chat endpoint (streaming + debug)
├── retrieve/route.ts      # Semantic search endpoint
└── health/route.ts        # Health check endpoint

lib/
├── auth/
│   └── bearer.ts          # Token validation
├── api/
│   ├── request-id.ts      # Request ID generation
│   ├── errors.ts          # Error responses
│   ├── rate-limit.ts      # Rate limiting
│   └── headers.ts         # Response headers
└── services/
    ├── retrieval.ts       # Semantic search logic
    └── chat.ts            # RAG orchestration

scripts/
└── test-api.ts            # API testing script
```

## References

- API Spec: `spec/app/40_api.md`
- Auth ADR: `spec/adr/001-static-token-auth-mvp.md`
- Database Spec: `spec/app/30_database.md`
- Similarity Test: `tests/similarity-test.ts`
