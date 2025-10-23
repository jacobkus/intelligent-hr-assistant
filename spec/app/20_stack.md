# Technology Stack Decisions and Architectural Choices

Status: MVP scope

Source: Derived from `spec/app/10_app.md` (PRD) and repository conventions.

## 1) Guiding Principles
- **Serverless-first**: Optimize for cold-start and scalability on serverless Postgres and edge-friendly runtimes.
- **Streaming UX**: Prioritize time-to-first-token; all chat responses stream.
- **Simplicity > novelty**: Prefer one database (PostgreSQL + pgvector) over introducing a separate vector store.
- **Type-safety**: End-to-end TypeScript with validated environment configuration.
- **Security & privacy**: Minimal gating in MVP, no PII persistence, safe logging.

## 2) Summary of the Stack
- **Framework**: Next.js 15 (App Router, React Server Components) on React 19.
- **Runtime & tooling**: Bun for scripts and dev; Turbopack for dev/build.
- **Language**: TypeScript.
- **Database**: Neon serverless PostgreSQL with `pgvector` extension.
- **ORM**: Drizzle ORM with Neon HTTP driver (`@neondatabase/serverless`).
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) with OpenAI models.
- **Styling**: Tailwind CSS v4 + shadcn/ui (New York), Lucide icons.
- **Lint/format**: Biome.
- **Env validation**: `@t3-oss/env-nextjs` + Zod in `lib/env.ts`.

## 3) Application Architecture
### 3.1 Rendering model
- **App Router + RSC**: Static/layout pieces as Server Components; interactive chat input as Client Components.
- **Streaming**: Use Vercel AI SDK response streaming to progressively render assistant output.

### 3.2 API boundaries
- **`/api/chat`**: Orchestrates RAG: validates input, calls retrieval, assembles system prompt, invokes LLM, streams response.
- **`/api/retrieve`**: Accepts query, computes embedding, executes `pgvector` similarity search, returns top‑k chunks with scores.

### 3.3 State management (client)
- **Vercel AI SDK hooks**: `useChat` for message state, input handling, and streaming updates.

## 4) Data & Retrieval Layer
### 4.1 Database
- **PostgreSQL (Neon)**: Single data store for documents, chunks, metadata, and embeddings.
- **`pgvector`**: Similarity search using cosine distance (or appropriate operator) for top‑k retrieval.

### 4.2 ORM & schema
- **Drizzle ORM**: Type-safe schema, queries, and migrations.
- **Schema location**: `lib/db/schema/` (to be populated) with migrations in `lib/db/migrations/`.
- **DB client**: Export `db` from `lib/db/index.ts` using Neon HTTP driver for serverless.

### 4.3 Ingestion & embeddings
- **Seeding script**: Loads ≥10 HR documents, chunks them, stores metadata.
- **Embedding job**: Computes embeddings with an OpenAI embedding model; writes vectors to `pgvector` column.
- **Idempotency**: Both processes designed to be safely re-runnable.

## 5) AI Orchestration
- **Model provider**: OpenAI via Vercel AI SDK; streaming enabled.
- **Prompting**: System prompt instructs grounded answers strictly from retrieved context; explicit no‑context fallback.
- **Guardrails**: Basic prompt‑injection guards, input length limits, and shape validation with Zod.

## 6) Security, Privacy, and Compliance
- **Access gating (MVP)**: Simple token or deployment‑level restriction to limit internal access.
- **Rate limiting**: Per‑IP or per‑session limits on chat endpoint; 429 with `Retry-After` as applicable.
- **Privacy**: No PII persisted by default; logs exclude sensitive headers/tokens; prompts discourage sensitive data disclosure.

## 7) Observability & Operations
- **Structured logs**: Minimal request/error logs; retrieval logs include top‑k scores for debugging relevance.
- **Toggles**: Enable/disable logging by environment.
- **Operational docs**: README covers env setup, migrations, seeding, embeddings, and troubleshooting.

## 8) Styling & UX
- **Tailwind v4**: Utility‑first styling; PostCSS integrated.
- **shadcn/ui**: New York style system; accessible components; CSS variables enabled.
- **Icons**: Lucide React.
- **Accessibility**: Keyboard navigation, labeled controls, WCAG AA contrast.

## 9) Internationalization
- **MVP**: English end‑to‑end.
- **Near‑term**: Encapsulate language handling to support Polish without core refactors.

## 10) Environment & Configuration
- **Validated env**: `DATABASE_URL`, `OPENAI_API_KEY`, `NODE_ENV` validated in `lib/env.ts` via Zod; imported as a single `env` accessor.
- **Type safety**: All runtime code uses the validated `env` to avoid undefined configuration.

## 11) Developer Experience
- **Package manager/runtime**: Bun for fast dev scripts.
- **Build tooling**: Turbopack for dev/build performance.
- **Lint/format**: Biome (`bun run lint`, `bun run format`, `bun run check:fix`).
- **Path aliases**: `@/*` to reference `components`, `lib`, `hooks`, and `components/ui`.

## 12) Performance Targets (from PRD)
- **Latency**: TTFT ≤ 1.5s (median); P95 end‑to‑end ≤ 6s.
- **Throughput**: Rate limits sized for internal usage; streaming reduces perceived latency.

## 13) Alternatives Considered
- **Vector store**: External services (e.g., Pinecone, Weaviate) vs `pgvector` in Postgres. Chosen: `pgvector` to keep a single durable datastore, simplify ops, and reduce cost.
- **ORM**: Prisma vs Drizzle. Chosen: Drizzle for lightweight, HTTP‑driver friendliness, and explicit schema‑first migrations.
- **Runtime**: Node/npm vs Bun. Chosen: Bun for speed; validated against Next.js 15 workflows.
- **UI kit**: MUI/Chakra vs shadcn/ui. Chosen: shadcn for composable, accessible components aligned with Tailwind and RSC.
- **LLM SDK**: Direct OpenAI API vs Vercel AI SDK. Chosen: Vercel AI SDK for streaming primitives, React hooks, and model abstraction.

## 14) Risks & Mitigations
- **Cold starts on serverless Postgres**: Use Neon HTTP driver; keep queries simple and indexed; warm paths via health checks where feasible.
- **RSC compatibility issues**: Isolate Client Components; avoid server‑incompatible libraries in Server Components.
- **Embedding cost/latency**: Batch embedding jobs; cache computed vectors; prefer smaller embedding model where quality permits.
- **Hallucinations**: Strict system prompt; confidence thresholds for no‑context fallback; citations considered post‑MVP.
- **Rate limiting false positives**: Calibrate limits and provide clear user feedback with `Retry-After`.

## 15) Directory & Ownership Conventions
- **API routes**: `app/api/**` (App Router route handlers).
- **DB**: `lib/db/index.ts` (client), `lib/db/schema/**` (tables), `lib/db/migrations/**` (drizzle‑kit output).
- **Env**: `lib/env.ts` (Zod schemas and validated accessor).
- **UI**: `components/**`, `components/ui/**` (shadcn/ui), global styles in `app/globals.css`.
- **Specs**: `spec/app/**` for product and architecture documents.

## 16) Operational Runbook (quick reference)
- **Dev**: `bun dev`
- **Build**: `bun run build`
- **Start**: `bun start`
- **Lint/format**: `bun run lint` / `bun run format` / `bun run check:fix`
- **Migrations**: `bunx drizzle-kit generate` → `bunx drizzle-kit migrate`
- **Studio**: `bunx drizzle-kit studio`

## 17) MVP Scope Boundaries (alignment with PRD)
- In scope: Chat UI with streaming, RAG pipeline (ingestion → embeddings → retrieval → prompt), suggested questions, minimal gating, basic rate limiting, env validation, Drizzle + Postgres + pgvector.
- Out of scope: Admin UI for content editing, multi‑tenant RBAC, document uploads via UI, complex analytics dashboard, persistent conversation history, rich citation UI.



## 18) Evaluation & Quality

- Tooling: Promptfoo for prompt-level and end-to-end (HTTP provider) evaluations.
- Providers:
  - Prompt-only: OpenAI (e.g., `openai:gpt-5-mini`) with explicit `context` variables.
  - End-to-end: HTTP provider calling `POST /api/chat?debug=1` with `transformResponse` to extract `answer`, and `contextTransform` to extract `retrieved_docs` for context metrics.
- Metrics:
  - Model-graded: `context-faithfulness`, `context-relevance`, `answer-relevance`, and configurable `llm-rubric`.
  - Deterministic: `icontains`, `contains-all/any`, `regex`, `javascript` for brevity/latency heuristics.
- Dataset: Versioned at `tests/eval/hr_dataset.yaml` with representative HR queries and expected key facts; include no‑context cases.
- CI gates: ≥ 80% overall pass rate; ≥ 95% on no‑context subset. Fail build on threshold miss.
- API support: `?debug=1` (or `X-Debug: 1`) returns `answer`, `retrieved_docs` (content, score, source_uri, chunk_id) to power `contextTransform`.
