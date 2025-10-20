# Product Requirements Document (PRD) - Intelligent HR Assistant

## 1. Product Overview

The Intelligent HR Assistant is a Retrieval-Augmented Generation (RAG) chatbot that enables employees to self-serve accurate, up-to-date answers about HR topics such as vacation policy, benefits, remote work, and onboarding. The assistant ingests an internal HR knowledge base, generates vector embeddings, retrieves the most relevant content using pgvector similarity, and composes grounded answers via a large language model with response streaming for a fast, conversational user experience.

Primary platform and architecture:
- Next.js 15 (App Router) full-stack application
- Database: PostgreSQL with pgvector extension (Neon serverless)
- ORM: Drizzle ORM
- AI: Vercel AI SDK with OpenAI models
- Styling: Tailwind CSS v4 and shadcn/ui components
- Runtime and tooling: Bun, Biome for lint/format

Key outcomes for MVP:
- Employees can ask HR questions and receive accurate, streamed answers grounded in the approved knowledge base
- HR can seed and update the knowledge base via a script, with embeddings generated and searchable
- The system validates configuration, secures endpoints, and handles missing context gracefully

Assumptions:
- Initial usage is internal-only for a single organization
- No multi-tenant support in MVP
- Authentication may be minimal gating for MVP while enabling stricter options later

## 2. User Problem

Employees frequently ask repetitive HR questions and struggle to find correct information across static documents and intranet pages. HR teams spend significant time triaging and answering common questions, leading to delays, inconsistent answers, and lower satisfaction. A conversational assistant that provides fast, accurate, and grounded answers reduces HR workload, improves employee experience, and centralizes policy knowledge in a searchable system.

Primary pain points:
- Hard-to-search policy documents and scattered sources
- Slow turnaround from HR for routine questions
- Inconsistent or outdated answers
- Limited support across time zones and working hours

## 3. Functional Requirements

FR-001 Secure access gating
- Gate the application and APIs for internal use. MVP may use a simple access token or deployment-level restriction. Future versions may integrate SSO.

FR-002 Chat interface
- Responsive chat UI with message list, input box, send action, and ability to start a new conversation. Static elements as Server Components; interactive parts as Client Components.

FR-003 Suggested questions
- Display a set of sample questions on first load to help users begin a conversation.

FR-004 Main Chat API orchestration
- Route handler accepts a user question, requests retrieval for context, constructs a system prompt, calls the LLM, and streams the answer.

FR-005 Retrieval API (semantic search)
- Route handler generates a query embedding and executes pgvector similarity search to return top-k document chunks with scores.

FR-006 Embedding generation
- Process to compute and store embeddings for each document chunk using a chosen OpenAI embedding model.

FR-007 Data seeding
- Script connects to PostgreSQL, creates schema via Drizzle migrations, and loads at least 10 HR documents into the knowledge base.

FR-008 Prompt engineering
- System prompt template that instructs the model to answer strictly from provided context and to clearly state when context is insufficient.

FR-009 Response streaming
- Stream LLM responses to the client using ReadableStream for responsive UX.

FR-010 Error handling and fallbacks
- Handle network, provider, and retrieval errors gracefully with user-friendly messages and retry guidance.

FR-011 State management
- Use Vercel AI SDK hooks (useChat) to manage conversation state and streaming on the client.

FR-012 Environment validation
- Validate required environment variables (DATABASE_URL, OPENAI_API_KEY, NODE_ENV) at startup with Zod-based schemas.

FR-013 Database and pgvector
- Drizzle schema and migrations to create tables and enable pgvector. Store documents, chunks, embeddings, and metadata.

FR-014 Observability
- Minimal structured logging for requests, errors, and retrieval stats. Safe to run in production.

FR-015 Rate limiting and input constraints
- Basic per-session or per-IP rate limits. Enforce input size limits and reject prompt injections via basic guards.

FR-016 Internationalization (MVP-ready)
- Enable queries and answers in English; provide groundwork to handle Polish as a near-term enhancement.

FR-017 Evaluation and quality gates
- Maintain a versioned evaluation dataset located at `tests/eval/hr_dataset.yaml`.
- Use Promptfoo to run both prompt-only and end-to-end (HTTP provider) evaluations.
- Metrics: model-graded `context-faithfulness`, `context-relevance`, `answer-relevance`, flexible `llm-rubric`; deterministic checks like `icontains`, `javascript` length/latency heuristics.
- No‑context cases must trigger a clear fallback answer (no hallucinations).
- CI gate: pass rate ≥ 80% overall; no‑context subset ≥ 95%.
- Document commands in `README.md` and add `eval`, `eval:promptfoo`, and `eval:ci` scripts in `package.json`.

FR-018 Accessibility
- Keyboard navigation, screen-reader friendly labels, and sufficient color contrast.

## 4. Product Boundaries

In scope (MVP):
- Chat UI with streaming responses
- RAG pipeline: ingestion, embeddings, retrieval, and prompt assembly
- Suggested questions and basic error/loading states
- Environment validation, minimal security gating, rate limiting
- Drizzle ORM with PostgreSQL + pgvector schema and migrations

Out of scope (MVP):
- Advanced admin UI for content editing (use scripts instead)
- Multi-tenant or role-based authorization beyond simple gating
- Document uploads via UI
- Complex analytics dashboard (may log minimal telemetry)
- Persistent conversation history across sessions
- Rich citations UI or source highlighting

Constraints and considerations:
- Must run on serverless-friendly Postgres (Neon) with HTTP driver
- Use Vercel AI SDK and OpenAI for embeddings and chat in MVP
- Keep latency acceptable for global users; leverage streaming for perceived speed

## 5. User Stories

US-001 Secure access gating
Description: As an employee, I can only access the assistant when internal access is allowed so company information stays protected.
Acceptance Criteria:
- Requests without the configured access mechanism are denied with 401/403
- Valid requests reach the UI and APIs
- Access mechanism is documented in README and is configurable per environment

US-002 Landing with suggested questions
Description: As an employee, I see suggested questions on first load so I can get started quickly.
Acceptance Criteria:
- At least 4 suggested questions are rendered on first page load
- Clicking a suggestion triggers the same flow as typing the question
- Suggestions disappear or become secondary after the first user message

US-003 Ask a free-form question
Description: As an employee, I can type a question and send it to start a conversation.
Acceptance Criteria:
- Input accepts at least 500 characters
- Pressing Enter or clicking Send submits the question
- Disabled state prevents duplicate submissions while a response is in flight

US-004 Streamed response display
Description: As an employee, I see the assistant’s answer appear progressively while it is being generated.
Acceptance Criteria:
- Tokens stream to the UI with visible incremental updates
- The final message state is set when streaming completes or errors
- The UI scrolls to keep the newest message visible

US-005 Loading and skeleton states
Description: As an employee, I see clear loading indicators while the system processes my question.
Acceptance Criteria:
- A spinner or skeleton appears while waiting for retrieval/LLM
- Loading states are removed immediately after completion or error
- Buttons and inputs are disabled appropriately while loading

US-006 Graceful no-context fallback
Description: As an employee, I am told when the system cannot find an answer in the knowledge base.
Acceptance Criteria:
- When retrieval returns low or no confidence, the assistant replies that it lacks sufficient context
- The response suggests how to rephrase or where to look for help
- No hallucinated policy content is presented

US-007 Error messages
Description: As an employee, I see readable error messages when something goes wrong.
Acceptance Criteria:
- Network or server errors show a non-technical message with retry guidance
- Rate limit errors clearly state the limit condition and cooldown
- Errors do not expose stack traces or secrets in the UI

US-008 New conversation
Description: As an employee, I can start a new conversation to reset context.
Acceptance Criteria:
- A New chat action clears the current message list
- Suggested questions are shown again after reset
- No prior messages bleed into the new conversation

US-009 Suggested question click behavior
Description: As an employee, clicking a suggestion fills and sends the question.
Acceptance Criteria:
- The clicked suggestion appears as a user message
- The system immediately begins retrieval and streaming
- The suggestion remains clickable until first request begins

US-010 Input validation and limits
Description: As an employee, I receive clear feedback if my question is too long or invalid.
Acceptance Criteria:
- Inputs exceeding the configured length are rejected client-side and server-side
- Disallowed content patterns are rejected with a friendly message
- The server validates payload shape with Zod

US-011 Rate limiting
Description: As a platform owner, I can limit requests to protect the service from abuse.
Acceptance Criteria:
- Per-session or per-IP limits are enforced on the chat endpoint
- Exceeding limits returns a 429 with Retry-After where applicable
- Limits are configurable via environment variables

US-012 Seed the knowledge base
Description: As an HR operator, I can run a script to load at least 10 HR documents into the database.
Acceptance Criteria:
- Script connects to the configured database and writes documents and chunk metadata
- Script outputs a summary of imported files and counts
- Running the script is documented and idempotent

US-013 Generate embeddings
Description: As a system operator, I can generate embeddings for all stored chunks.
Acceptance Criteria:
- A job or script computes embeddings with an OpenAI embedding model
- Embeddings are stored in the pgvector column with correct dimensions
- Partial failures are reported with error counts and are retryable

US-014 Retrieval API returns top-k results
Description: As a developer, I can call a retrieval endpoint to get the most similar chunks for a query.
Acceptance Criteria:
- Endpoint accepts a validated query and returns top-k results with scores
- Uses pgvector cosine (or appropriate) similarity operator
- Returns within an acceptable latency budget for typical queries

US-015 Chat API orchestrates RAG and streams
Description: As a developer, I can call a chat endpoint that composes a grounded prompt and streams a response.
Acceptance Criteria:
- Endpoint calls retrieval, builds a system prompt with context, and invokes the LLM
- Response is streamed to the client as chunks until completion
- Errors propagate with appropriate status codes

US-016 Environment validation
Description: As a developer, I get early failures when required configuration is missing.
Acceptance Criteria:
- On startup, missing or invalid env vars cause a clear error and prevent serving
- Env schema is defined in a single module and imported consistently
- All runtime code uses the validated env accessor

US-017 Database migrations and pgvector
Description: As a developer, I can run migrations that create the schema and enable pgvector.
Acceptance Criteria:
- Migrations create tables for documents, chunks, and embeddings
- pgvector extension is enabled or verified
- Drizzle configuration targets Neon HTTP client

US-018 Observability and logs
Description: As a developer, I can view basic logs to diagnose issues.
Acceptance Criteria:
- Requests and errors are logged with minimal, non-sensitive metadata
- Retrieval logs include top-k scores for debugging relevance
- Logging can be toggled per environment

US-019 Accessibility
Description: As a user with assistive technology, I can use the chat interface effectively.
Acceptance Criteria:
- Inputs and buttons have accessible names and roles
- Keyboard navigation works for suggestions and send action
- Color contrast meets WCAG AA

US-020 Internationalization groundwork
Description: As an employee, I can ask in English today, with a path to support Polish soon.
Acceptance Criteria:
- English queries are fully supported end to end
- Language handling does not block Polish adoption later
- Any language switches or detection are encapsulated for future extension

US-021 Privacy-safe handling
Description: As a security officer, I need assurance that PII is not logged or leaked.
Acceptance Criteria:
- No raw prompts or answers containing PII are persisted by default
- Logs exclude sensitive tokens and headers
- The prompt instructs the model not to request or reveal sensitive data

US-022 Operational documentation
Description: As an operator, I have clear instructions to run and maintain the system.
Acceptance Criteria:
- README documents env setup, seeding, embeddings, migrations, and dev commands
- Troubleshooting notes cover common failures (missing env, migrations, provider errors)
- Clear versioning of model and embedding choices is recorded

## 6. Success Metrics

Adoption and engagement
- Weekly active users: target 30% of eligible employees within 60 days
- New conversations per week and average messages per conversation

Deflection and efficiency
- HR ticket deflection rate: target 40% of routine questions answered by the assistant
- Median time-to-first-token under 1.5s; P95 end-to-end response under 6s

Quality and accuracy
- Human-rated helpfulness/accuracy ≥ 80% on the evaluation question set
- No-context handling present in 100% of low-confidence cases
 - Promptfoo pass rate ≥ 80% overall; ≥ 95% on no‑context subset

Reliability and operations
- Uptime ≥ 99.5% for chat and retrieval endpoints

Data coverage
- At least 10 core HR documents ingested at launch; coverage grows monthly
- Embedding refresh completed within 24 hours of content changes

Security and privacy
- No sensitive data in logs verified by periodic checks
