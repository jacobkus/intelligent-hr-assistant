# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Intelligent HR Assistant application built with Next.js 15, using the App Router architecture. The application integrates AI capabilities via Vercel AI SDK with OpenAI, uses Drizzle ORM with Neon PostgreSQL for data persistence, and is styled with Tailwind CSS v4 and shadcn/ui components.

## Tech Stack

- **Framework**: Next.js 15.5.6 (App Router)
- **Runtime**: Bun (preferred package manager)
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle ORM
- **AI/ML**: Vercel AI SDK (@ai-sdk/openai, @ai-sdk/react)
- **Styling**: Tailwind CSS v4, shadcn/ui components (New York style)
- **Linting/Formatting**: Biome.js (replaces ESLint/Prettier)
- **Icons**: Lucide React

## Development Commands

```bash
# Start development server with Turbopack
bun dev

# Build for production (with Turbopack)
bun run build

# Start production server
bun start

# Lint code with Biome
bun run lint

# Format code with Biome
bun run format

# Auto-fix linting issues with Biome
bun run check:fix
```

## Database Commands

```bash
# Generate database migrations
bunx drizzle-kit generate

# Run migrations
bunx drizzle-kit migrate

# Open Drizzle Studio (database GUI)
bunx drizzle-kit studio

# Push schema changes directly (development)
bunx drizzle-kit push
```

## Architecture

### Database Configuration

- **Connection**: Neon serverless PostgreSQL via HTTP
- **Client**: `@neondatabase/serverless` with Drizzle ORM
- **Schema location**: `lib/db/schema/` (configured but not yet populated)
- **Migrations**: `lib/db/migrations/`
- **Database instance**: Exported from `lib/db/index.ts` as `db`

### Environment Variables

Environment variables are validated using `@t3-oss/env-nextjs` with Zod schemas in `lib/env.mjs`. Required variables:
- `DATABASE_URL`: Neon PostgreSQL connection string
- `OPENAI_API_KEY`: OpenAI API key for AI SDK integration
- `NODE_ENV`: development | test | production (defaults to development)

### Path Aliases

TypeScript path alias `@/*` maps to the root directory:
- `@/components` → components
- `@/lib` → lib
- `@/lib/utils` → lib/utils
- `@/components/ui` → components/ui
- `@/hooks` → hooks

### Component Library

The project uses shadcn/ui components with:
- Style variant: "new-york"
- Base color: "neutral"
- CSS variables enabled
- RSC (React Server Components) mode enabled
- Components installable via: `bunx shadcn add [component-name]`

### AI Integration

The application is set up to use Vercel AI SDK with OpenAI:
- AI SDK packages: `@ai-sdk/openai`, `@ai-sdk/react`, `ai`
- React hooks available for streaming responses and AI interactions

## Code Quality

### Biome Configuration

Biome is configured for both linting and formatting:
- **Indent**: 2 spaces
- **Rules**: Recommended rules enabled for React and Next.js
- **Import organization**: Automatic on save
- **VCS integration**: Git-aware, respects .gitignore

### Important Notes

1. **Turbopack**: Both dev and build commands use `--turbopack` flag for faster builds
2. **React 19**: This project uses React 19, be aware of any breaking changes from React 18
3. **Tailwind v4**: Using the latest major version with PostCSS integration
4. **Database schema**: Schema directory exists but is empty - migrations need to be created as the data model evolves
5. **Environment validation**: All environment variables must be added to `lib/env.mjs` for type-safe access via the `env` object
