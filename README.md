This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 1. Environment Setup

Create a `.env.local` file (or `.env` for local development) with:

```bash
DATABASE_URL="your-neon-postgres-connection-string"
OPENAI_API_KEY="your-openai-api-key"
NODE_ENV="development"
```

**Getting a Neon database:**
1. Sign up at [Neon](https://neon.tech)
2. Create a new project
3. Copy the connection string (starts with `postgresql://`)
4. Enable pgvector extension in your Neon project (see Troubleshooting below)

**Getting an OpenAI API key:**
1. Sign up at [OpenAI Platform](https://platform.openai.com)
2. Generate an API key from the API keys section
3. Copy the key (starts with `sk-`)

### 2. Database Setup

Run migrations to create tables and enable extensions:

```bash
bun run db:migrate
```

### 3. Seed HR Content

Load the HR knowledge base and generate embeddings:

```bash
bun run db:seed
```

This will:
- Read markdown files from `content/hr/`
- Chunk documents into semantic sections
- Generate embeddings using OpenAI's `text-embedding-3-small` model
- Store everything in PostgreSQL with pgvector

**Other database commands:**

```bash
bun run db:generate    # Generate migrations from schema changes
bun run db:reset       # Drop all tables/extensions (dev only - WARNING: destroys data!)
bun run db:studio      # Open Drizzle Studio GUI
bun run db:push        # Push schema changes directly (dev only)
```

### 4. Run Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Evaluation (Promptfoo)

Prerequisites:
- Seed the database and generate embeddings per specs.
- Start the dev server: `bun dev`.

Run a quick local sanity check (debug mode JSON):

```bash
bun run eval "What is the parental leave policy?"
```

Run Promptfoo evaluations (prompt-only + E2E via HTTP provider):

```bash
bun run eval:promptfoo
```

CI-friendly gate with reports (fails on assertion failures):

```bash
bun run eval:ci
```

Dataset lives in `tests/eval/hr_dataset.yaml`. Providers and assertions are configured in `promptfooconfig.yaml`.

## Content and Data

HR knowledge base content is stored in `content/hr/` as Markdown files. These documents are seeded into the database for retrieval-augmented generation. Each file includes front matter with metadata (title, jurisdiction, version, etc.) for proper ingestion and tracking.

## Model Configuration

This project uses the following AI models:

- **Embeddings**: `text-embedding-3-small` (1536 dimensions)
  - Used for semantic search via pgvector
  - Configured in: `lib/ai/embedding.ts`

- **Chat/Evaluation**: `gpt-5-mini` (placeholder for latest mini model)
  - Used in Promptfoo evaluations
  - Configured in: `promptfooconfig.yaml`

To change models, update the respective configuration files. Note: changing embedding models requires re-seeding the database.

## Troubleshooting

### Environment variable validation errors

**Problem**: `Environment variable validation failed` on startup

**Solution**:
- Ensure `.env.local` (or `.env`) exists with all required variables
- Check that `DATABASE_URL` and `OPENAI_API_KEY` are not empty
- For build-time scripts (drizzle-kit), make sure `dotenv/config` is imported

### pgvector extension not available

**Problem**: `ERROR: type "vector" does not exist`

**Solution**:
1. In Neon console, go to your project
2. Navigate to "SQL Editor"
3. Run: `CREATE EXTENSION IF NOT EXISTS vector;`
4. Re-run migrations: `bun run db:migrate`

### Migration fails with "relation already exists"

**Problem**: `ERROR: relation "documents" already exists`

**Solution**:
- If in development, run: `bun run db:reset && bun run db:migrate`
- If in production, ensure migrations are applied in correct order
- Check `lib/db/migrations/` for migration state

### Seeding fails with "Missing embedding for chunk"

**Problem**: Some chunks don't get embeddings

**Solution**:
- Check OpenAI API key is valid and has credits
- Check network connectivity to OpenAI API
- Verify rate limits aren't exceeded
- Re-run seed script (it's idempotent)

### Database connection fails

**Problem**: `Error: getaddrinfo ENOTFOUND` or connection timeout

**Solution**:
- Verify `DATABASE_URL` is correctly formatted
- Check Neon project is active (not suspended)
- Ensure database allows connections from your IP
- Test connection with: `bun run db:studio`

### Evaluation fails with "Connection refused"

**Problem**: `bun run eval` or `eval:promptfoo` fails to connect

**Solution**:
- Ensure dev server is running: `bun dev`
- Verify server is on port 3000: check terminal output
- Check `/api/chat` endpoint exists (when implemented)
- For `eval:promptfoo`, ensure dataset exists at `tests/eval/hr_dataset.yaml`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

### Prerequisites

1. **Neon Production Database**:
   - Create a production Neon project
   - Enable pgvector extension
   - Copy production connection string

2. **Environment Variables**:
   - Set `DATABASE_URL` to production Neon connection string
   - Set `OPENAI_API_KEY` to your production OpenAI key
   - Set `NODE_ENV=production`

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com/new)
3. Add environment variables in Vercel project settings
4. Deploy

**Post-deployment steps**:
```bash
# Run migrations on production database
DATABASE_URL="your-prod-db-url" bun run db:migrate

# Seed production data
DATABASE_URL="your-prod-db-url" OPENAI_API_KEY="your-key" bun run db:seed
```

Alternatively, set `SKIP_ENV_VALIDATION=1` during build if env vars are runtime-only.

For more details, see [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying).
