This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 1. Environment Setup

Create a `.env.local` file with:

```bash
DATABASE_URL="your-neon-postgres-connection-string"
OPENAI_API_KEY="your-openai-api-key"
NODE_ENV="development"
```

### 2. Database Setup

Reset and migrate the database (development only):

```bash
bun run db:reset
```

Or run migrations manually:

```bash
bun run db:migrate
```

Other database commands:

```bash
bun run db:generate    # Generate migrations from schema changes
bun run db:studio      # Open Drizzle Studio GUI
bun run db:push        # Push schema changes directly (dev only)
```

### 3. Run Development Server

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
