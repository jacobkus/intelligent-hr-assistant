# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL RULES

**IMPORTANT: Follow these rules strictly**

### Architecture Decisions (ADR)
- Create ADRs in `./spec/adr/{name}.md` for:
  1. Major dependency changes
  2. Architectural pattern changes
  3. New integration patterns
  4. Database schema changes

### Commit Standards
- Use conventional commits format: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore
- Include issue references in commit messages
- Mark breaking changes with `!:` or `BREAKING CHANGE:` footer

### Next.js 15 & React 19 Patterns
- Use App Router and Server Components (not pages directory)
- Route handlers for API endpoints (not pages/api)
- Server actions for form handling and data mutations
- Streaming and Suspense for loading states
- Parallel and intercepting routes for complex UIs

### Expert-Level Expectations
- Favor elegant, maintainable solutions over verbose code
- Proactively address edge cases, race conditions, and security considerations
- Frame solutions within broader architectural contexts
- Focus comments on 'why' not 'what'
- Provide targeted diagnostic approaches when debugging

## Project Overview

RAG-powered HR Assistant chatbot built with Next.js 15 App Router. Enables employees to self-serve HR answers grounded in company knowledge base using semantic search (pgvector) and LLM streaming.

**Stack**: Next.js 15, React 19, Vercel AI SDK, Drizzle ORM, Neon PostgreSQL (pgvector), Tailwind CSS v4, shadcn/ui, Bun, Biome

## Development Commands

```bash
# Development
bun dev                    # Start dev server with Turbopack
bun run build             # Build for production
bun start                 # Start production server

# Code Quality
bun run lint              # Lint with Biome
bun run format            # Format with Biome
bun run check:fix         # Auto-fix linting issues
```

## Database Commands

```bash
bunx drizzle-kit generate  # Generate migrations
bunx drizzle-kit migrate   # Run migrations
bunx drizzle-kit studio    # Open Drizzle Studio GUI
bunx drizzle-kit push      # Push schema changes (dev only)
```

## Architecture

### Database
- **Connection**: Neon serverless PostgreSQL via HTTP
- **Client**: `@neondatabase/serverless` with Drizzle ORM
- **Schema**: `lib/db/schema/` (migrations in `lib/db/migrations/`)
- **Instance**: Exported from `lib/db/index.ts` as `db`
- **Extensions**: pgvector for semantic search

### Environment Variables
Required variables validated via `@t3-oss/env-nextjs` with Zod in `lib/env.mjs`:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key for AI SDK
- `NODE_ENV` - development | test | production (default: development)

**IMPORTANT**: All env vars must be added to `lib/env.mjs` for type-safe access

### Path Aliases
TypeScript `@/*` maps to root:
- `@/components` → components
- `@/lib` → lib
- `@/components/ui` → components/ui
- `@/hooks` → hooks

### Component Library
shadcn/ui configuration:
- Variant: "new-york", Base color: "neutral"
- RSC mode enabled, CSS variables enabled
- Install: `bunx shadcn add [component-name]`

### AI Integration
Vercel AI SDK with OpenAI:
- Packages: `@ai-sdk/openai`, `@ai-sdk/react`, `ai`
- Use React hooks for streaming responses (e.g., `useChat`)

## Code Quality

### Biome
- Indent: 2 spaces
- React/Next.js recommended rules
- Automatic import organization on save
- Git-aware, respects .gitignore

### Important Notes
1. **Turbopack**: Dev and build use `--turbopack` flag
2. **React 19**: Be aware of breaking changes from React 18
3. **Tailwind v4**: Latest major version with PostCSS
4. **Schema evolution**: Create migrations as data model evolves
5. **Env validation**: All vars must go through `lib/env.mjs`

## Coding Guidelines

### Code Style
- Assume understanding of language idioms and design patterns
- Highlight performance implications and optimization opportunities
- Suggest design alternatives when appropriate
- Well-named functions/variables over excessive comments

### Testing Strategy
- Suggest comprehensive test approaches
- Include considerations for mocking, test organization, coverage
- Prefer quality over example-only tests

### Next.js Best Practices
- Server Components for data fetching (reduce client-side JS)
- Next.js Image component with proper sizing (Core Web Vitals)
- Metadata API for dynamic SEO
- New Link component (no child `<a>` tag required)

## Specification System

This project uses a comprehensive specification system located in the `./spec/` directory to maintain architectural consistency and development standards.

### Structure
- `./spec/app/*.md` - Core application specifications (PRD, stack, architecture)
- `./spec/lib/*.md` - Third-party library integration specs (future)
- `spec/tasks*.md` - Temporary task specifications (as needed)

### Key Files
- `00_high_overview.md` - Recruitment task overview
- `00_app.md` - Complete PRD (FR-001 to FR-018, US-001 to US-022)
- `10_stack.md` - Stack decisions, architecture, alternatives, risks

### Application Structure
```
app/              # Next.js App Router
├── api/         # Route handlers (chat, retrieve)
lib/
├── db/
│   ├── index.ts      # Database client
│   ├── schema/       # Drizzle schemas
│   └── migrations/   # DB migrations
├── env.mjs           # Env validation (Zod)
components/
└── ui/              # shadcn/ui components
spec/
├── app/             # App specs
└── lib/             # Library specs
```
