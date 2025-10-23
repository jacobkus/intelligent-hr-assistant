# Intelligent HR Assistant Code Standards (TypeScript · Next.js 15 · React 19 · Zod · UUID)

This document defines rules to keep the codebase readable, maintainable, reliable, and pragmatic for a full-stack Next.js RAG app with PostgreSQL + pgvector. The philosophy is functional-first: pure logic at the core, side effects at the edges.

### Core Principles

- Purity first: business logic is composed of small, pure functions. Perform I/O (HTTP, FS, env, time) at the edges.
- Immutability by default: avoid mutation; use `readonly` arrays/records and return new values.
- Composition over inheritance: prefer function composition and modules over classes and deep hierarchies.
- Explicitness: explicit types, narrow interfaces, descriptive names. No magic, no implicit behavior.
- Defensive boundaries: validate all external inputs at module boundaries with Zod; never trust runtime data.
- YAGNI and small surface area: build only what is necessary; remove dead or demo code promptly.

## TypeScript Rules

### Strict typing

- `tsconfig.json` uses strict mode; do not weaken it.
- Do not use `any`. Prefer `unknown` at boundaries, then narrow via Zod or TypeScript guards.
- Prefer `type` aliases for unions/intersections; use `interface` only for extensible object shapes.
- Use `readonly` in arrays/tuples/object properties for intent and safety.
- Model precise domain types. Avoid over-generic types that hide meaning.

### Names and structure

- Functions are verbs; values are nouns. Avoid abbreviations. Prefer clarity over brevity.
- Exported APIs must have full, explicit signatures. Avoid optional output shapes.
- Co-locate types with their modules if scope is local; lift only shared, stable types.

### Error typing

- Treat `unknown` errors explicitly. Convert to domain errors early.
- Never throw strings. If throwing, throw `Error` (or a narrow subclass), and prefer returning typed Results at boundaries.

## Next.js & Runtime Practices

### Runtime and modules

- Use ESM and modern ES2022 features. Prefer `import`/`export` consistently.
- Centralize environment access in `src/config/env.ts`. Do not read `process.env` elsewhere.
- Avoid top-level I/O side effects. Wire apps in `src/index.ts` only.
- Pick runtime explicitly per route:
  - DB, pgvector, and Node-only libs → export const runtime = 'nodejs'.
  - Only pure compute/LLM calls that support Edge → edge.
- Turbopack is default for next dev; production builds support --turbopack. Use where it doesn’t break your pipeline.

### Async, timeouts, and cancellation

- All I/O must have a timeout. Prefer `AbortSignal.timeout(ms)` or an `AbortController` passed through.
- Parallelize independent work with `Promise.all`, never `await` sequentially in loops.
- Propagate `AbortSignal` where possible.

### Logging

- Use the central `logger` only. No `console.log` outside very early boot or final fatal exits.
- Log structured objects with stable keys. Include `message`, `category`, and minimal context.

## Route Handler Guidelines

- One purpose per route handler. Validate inputs with Zod, then call pure services.
- Prefer a global app.onError to normalize failures. If not present, ensure route handlers and middlewares normalize errors consistently.
- Keep handler code thin: parse input → call service → format output.

Example request validation and handler composition:

```ts
import { z } from "zod";
import { NextRequest } from "next/server";

const SearchQuery = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function POST(req: NextRequest) {
  const parsed = SearchQuery.safeParse({
    q: c.req.query("q"),
    limit: Number(c.req.query("limit")) || undefined,
  });
  if (!parsed.success) {
    return Response.json({ ok: false, code: "bad_input", error: parsed.error.format() }, { status: 400 });
  }

  const { q, limit } = parsed.data;
  const results = await searchService({
    q,
    limit,
    signal: AbortSignal.timeout(10_000),
  });

  return Response.json({ ok: true, results });
}
```

## Zod Schema Patterns

- Define all external input/output with Zod. Co-locate schema with the module that owns it.
- Prefer `z.enum([...])` for finite sets over `z.string()` with comments.
- Use `.describe()` to document schema fields; this improves tool metadata and self-documentation.
- For tool outputs, define a `z.object(...)` and export both the schema and `z.infer` type.

Example of input/output schemas and type inference:

```ts
import { z } from "zod";

export const SpotifySearchInput = z.object({
  query: z.string().min(1).describe("Search query"),
  type: z.enum(["track", "album", "artist"]).default("track"),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SpotifySearchInput = z.infer<typeof SpotifySearchInput>;

export const SpotifySearchResult = z.object({
  items: z.array(
    z.object({ id: z.string(), name: z.string(), uri: z.string() })
  ),
  count: z.number().int(),
});
export type SpotifySearchResult = z.infer<typeof SpotifySearchResult>;
```

## UUID Usage

- Prefer `crypto.randomUUID()` in Node 20+ for simplicity. If using the `uuid` package, use v4 for non-ordered, collision-resistant IDs.
- Generate IDs at the edges (e.g., when creating new records). Do not generate IDs for transient in-memory values unless necessary.
- Treat incoming IDs as untrusted strings; validate with a regex or Zod (`z.string().uuid()`). Do not parse without validation.

```ts
import { randomUUID } from "node:crypto";

const id = randomUUID(); // RFC 4122 v4
```

## Error Handling and Results

- Validate early, fail fast, and return structured errors. Prefer returning Result-like objects at module boundaries.
- Don’t leak internals. Map DB/model errors to concise messages.

## Concurrency, Timeouts, and Retries

- Default network timeout: 10–30s depending on endpoint. No unbounded awaits.
- Parallelize independent calls via `Promise.all`. Never fire-and-forget; always await or explicitly detach with reasoning.
- Retries: use limited retries with backoff only for idempotent operations. No retries on 4xx unless specified.

```ts
const [tracks, artists] = await Promise.all([
  fetchTracks(q, { signal }),
  fetchArtists(q, { signal }),
]);
```

## Security Baselines

- Validate all inputs from clients, env, and external APIs. Never trust strings.
- Redact secrets in logs. Never log tokens, cookies, or Authorization headers.
- Enforce CORS/origin checks for HTTP surfaces where applicable. Bind to localhost for local servers.
- Limit payload sizes and concurrency to prevent resource exhaustion.

## Performance and Pragmatism

- Avoid premature optimization and caching. Measure first; optimize only hotspots.
- Keep modules small. Split when files exceed reasonable cognitive load.
- Prefer streaming or pagination for large data.

## Typical Mistakes to Avoid

- Using `any` or implicit `any`, weakening strictness, or bypassing type errors instead of fixing design.
- Throwing raw values or catching and swallowing errors, resulting in silent failures.
- Performing input validation deep inside logic rather than at the edges.
- Mutating inputs, shared state, or global singletons; causing hidden coupling.
- Mixing concerns: embedding transport logic into business logic modules.
- Sequential `await` in loops when work is independent; ignoring timeouts and cancellation.
- Logging unstructured strings, secrets, or excessive data; hindering observability.
- Overengineering generic abstractions and utility layers before real use cases exist.
- Creating classes for simple data transformations that are better expressed as pure functions.

## Implementation Checklist

- Inputs validated with Zod at boundaries; outputs typed and validated where practical.
- Pure functions for core logic; side effects isolated in thin adapters.
- Timeouts and `AbortSignal` wired through I/O calls; no unbounded awaits.
- Structured logging with stable keys; no console noise.
- No usage of `any`; minimal `unknown` with prompt narrowing.
- No dead code; remove scaffolding and examples not in use.

Adhering to these rules yields predictable, testable, and maintainable code with minimal surprises.

## Project Scripts

Use Bun for CLI tasks; Next.js for dev/build/start.

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "biome check .", // Lint + format check (no writes)
    "lint:fix": "biome check --write .", // Apply safe lint fixes
    "format": "biome format --write .", // Apply formatting
    "format:check": "biome format .", // Check formatting only
    "typecheck": "tsc --noEmit", // TypeScript type checking
    "check": "bun run format:check && bun run lint && bun run typecheck", // Format check + lint + typecheck
    "validate": "bun run format && bun run lint:fix && bun run typecheck",
    "clean": "rm -rf dist", // Clean build artifacts
    "db:generate": "bunx drizzle-kit generate",
    "db:migrate": "bunx drizzle-kit migrate",
    "db:reset": "bun run scripts/db-reset.ts && bun run db:migrate && bun run db:seed",
    "db:studio": "bunx drizzle-kit studio",
    "db:push": "bunx drizzle-kit push",
    "db:seed": "bun run scripts/seed.ts",
    "eval": "bun run scripts/eval.ts",
    "eval:promptfoo": "npx promptfoo@latest eval -c promptfooconfig.yaml",
    "eval:ci": "npx promptfoo@latest eval -c promptfooconfig.yaml --fail-on-error -o results.json -o report.html",
    "test": "vitest"
  }
}
```

Notes:

- Always run `bun run check` before committing. CI should invoke `validate`.

## Linting/Formatting Policy

- Biome handles formatting and linting. Keep rules pragmatic to avoid churn.
- Avoid `any` where feasible; warnings are acceptable when interoperating with SDK internals.
- Prefer optional chaining over non-null assertions; where unavoidable, document why.

## Readability & Style (Addendum)

- Favor clarity over brevity. Prefer vertical whitespace between logical blocks (imports, config, decoding, mapping, return) and between unrelated statements.
- Line wrapping: keep lines under ~100 chars; split complex expressions across lines.
- No inline unknown casts like (x as unknown as T). Decode external JSON via Zod codecs.
- Extract mappers/validators; don’t inline large mapping logic in route handlers.
- Inputs/outputs: schemas live next to their owner module; tools import and call `.parse(...)` at the boundary. Avoid creating “schema-like objects” that aren’t `z.object`.
- Naming: functions are verbs; data are nouns. Avoid abbreviations. Use descriptive variable names (e.g., `playlistDetailsResponse` vs `json`).

### Naming conventions

- Avoid single-letter identifiers for variables, parameters, and functions. Exceptions: conventional loop indexes (`i`, `j`) inside short, local loops only.
- Prefer explicit descriptive names (`response`, `devicesResponse`, `playlistTracks`, `normalizedTracks`).

## Error Handling Policy (Addendum)

- Always check Response status. Treat 204 as a successful empty response where expected; otherwise require `response.ok`.
- Map common errors into stable tool error codes and human messages:
  - 401 → `unauthorized` (ask user to authenticate)
  - 403 → `forbidden` (scope/premium restrictions)
  - 429 → `rate_limited` (respect `Retry-After` when present)
  - other non-2xx → `bad_response`
- Do not parse JSON before validating `response.ok` or handling the 204 case.
- Prefer a shared helper to enforce status checks uniformly (e.g., `expectOkOr204(response, context)`), used by all tools/services.

## Functional Modularity (Addendum)

- Replace stateful class-style services with pure modules that accept explicit dependencies and return functions. Keep transient caches (like app-token) in thin closures only.

## Input/Output Schemas (Addendum)

- Wrap tool inputs in `z.object({...})`. Avoid exporting a plain object of field schemas.
- Call `InputSchema.parse(args)` at tool boundaries.
- For outputs, prefer `OutputSchema.parse(structured)` in development to catch drift early (guard by NODE_ENV).

## Cancellation & Timeouts (Addendum)

- Continue enforcing per-request timeouts in the HTTP client.
- Accept and propagate an optional `AbortSignal` through service functions into `fetch`.

## Environment & Security (Addendum)

- No direct `process.env` outside `lib/env.ts`. Add any new env like `ALLOWED_ORIGINS` to `env.ts` and consume via `config`.
- Validate Origins via a centralized utility that reads from `config.ALLOWED_ORIGINS` (comma-separated allowlist). Keep permissive localhost defaults in development only.

## Refactor Acceptance Criteria (Addendum)

- No `process.env` outside `env.ts`.
- New functional service modules introduced as described.
