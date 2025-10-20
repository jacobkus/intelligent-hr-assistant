## API Specification

### POST `/api/retrieve`

- Purpose: Generate a query embedding and return top‑k similar chunks from Postgres `pgvector`.
- Auth/Gating: Same as app gating; subject to rate limiting.

Request

```json
{
  "query": "How many vacation days do I have?",
  "topK": 5
}
```

Constraints
- `query`: string, 1..500 chars.
- `topK`: optional integer (default 5, max 20).

Response (200)

```json
{
  "results": [
    {
      "chunk_id": "uuid",
      "document_id": "uuid",
      "score": 0.1234,
      "content": "...chunk text...",
      "source_uri": "file://policies/vacation.md",
      "section_title": "Vacation policy",
      "page_number": 3
    }
  ]
}
```

Errors
- 400: invalid payload (Zod). Shape: `{ code: "BAD_REQUEST", message: string, issues?: any[] }`
- 429: rate limited. Optional `Retry-After` header.
- 500: server error.

---

### POST `/api/chat`

- Purpose: Orchestrate RAG. Validate input, call retrieval, assemble system prompt, invoke LLM, stream response.
- Streaming: Text/event-stream or chunked transfer to client.
- Debug Mode: `?debug=1` or header `X-Debug: 1` returns JSON body (no stream) with answer and retrieval artifacts for evaluation.

Request

```json
{
  "messages": [
    { "role": "user", "content": "What is our parental leave policy?" }
  ]
}
```

Constraints
- `messages`: non-empty array, last item must be user message, each `content` 1..1000 chars.

Response (streaming)
- Event stream of model tokens; terminal event indicates completion.

Response (debug JSON)

```json
{
  "answer": "Eligible employees receive ...",
  "retrieved_docs": [
    {
      "chunk_id": "uuid",
      "document_id": "uuid",
      "score": 0.087,
      "content": "...",
      "source_uri": "file://policies/parental-leave.md",
      "section_title": "Parental leave",
      "page_number": 1
    }
  ],
  "usage": { "promptTokens": 123, "completionTokens": 456, "totalTokens": 579 }
}
```

Errors
- 400: invalid payload (Zod). Shape: `{ code: "BAD_REQUEST", message: string, issues?: any[] }`
- 401/403: gated access failure
- 429: rate limited with `Retry-After`
- 500: server error

---

### Validation & Limits

- Zod schemas are enforced in route handlers; payloads exceeding size limits are rejected.
- Basic prompt‑injection guards and content allowlist/denylist may apply.

### Observability

- Log request id, latency, and retrieval scores (redacting sensitive data). Toggle per environment.


