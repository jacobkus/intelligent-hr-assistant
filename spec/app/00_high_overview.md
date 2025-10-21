# 🚀 Recruitment Task: Intelligent HR Assistant (Full-stack Next.js + PostgreSQL)

Build a fully functional, intelligent HR chatbot based on RAG (Retrieval-Augmented Generation) architecture. The entire application should be implemented as a full-stack Next.js project. Use PostgreSQL with the pgvector extension for vector operations as your database.

## ⚙ Backend (API Logic in Next.js Route Handlers)

All server-side logic should be implemented directly in Next.js. Use Drizzle ORM for database interactions.

- **Data seeding:** Prepare a script (e.g., in TypeScript) that connects to the PostgreSQL database and loads sample HR documents into the appropriate table.
- **Generating embeddings:** Implement a process that calculates and saves vectors (embeddings) for each document in the knowledge base using a chosen model (e.g., from OpenAI).
- **Search API (Retrieval):** Create a Route Handler (API endpoint) that:
  - Accepts a user query.
  - Generates an embedding for that query.
  - Executes a query to the PostgreSQL database (using pgvector operators) to find the most semantically similar document fragments.
- **Main Chat API:** Create a key Route Handler that will be the heart of the application:
  - Orchestrates the entire process: accepts a question, queries the search endpoint for context, creates the final prompt, and sends it to the language model (LLM).
  - **Response streaming:** Implement streaming of responses from the LLM using ReadableStream so the user sees text appearing in real-time.
- **Prompt engineering:** Develop an effective system prompt template that precisely instructs the model on how to answer questions based on the provided context from the knowledge base.
- **Validation and security:** Secure the endpoints. Apply input data validation (e.g., with the Zod library) directly in Route Handlers.

## 🎨 Frontend (Interface in Next.js)

Create a modern and intuitive user interface, fully leveraging the potential of React components in Next.js.

- **Chat interface:** Build a responsive conversational interface in React that displays message history. Use Server Components for static elements and Client Components for interactive parts. Consider using a component library like Shadcn/ui
- **Suggested questions:** At the start of the conversation, display sample questions (e.g., "How many vacation days do I have?", "What benefits does the company offer?") to make it easier for users to begin interaction.
- **Application state handling:** Implement loading indicators (e.g., skeleton loaders) during response generation and clear handling of potential API errors.
- **State management:** Ensure proper conversation state management. It's recommended to use the Vercel AI SDK library (useChat hook), which integrates perfectly with Next.js and extremely simplifies streaming handling.

## 🛠 Configuration, Data, and Code Quality

Ensure solid project foundations.

- **Database configuration:** Prepare migrations using Drizzle ORM to create necessary tables and activate the pgvector extension in your PostgreSQL instance.
- **Environment variables:** Configure the project so that API keys and database connection strings are loaded from the .env.local file, following Next.js standards.
- **HR knowledge base:** Prepare at least 10 diverse text documents, e.g., about vacation policy, benefits, remote work, onboarding, etc.
- **Sample questions:** Create a list of test queries with expected answers to facilitate verification of system functionality.

## ✅ Evaluation Loop (Promptfoo)

- Maintain an HR eval dataset at `tests/eval/hr_dataset.yaml`.
- Run prompt-level and end-to-end (HTTP provider) evals locally and in CI.
- Use `context-faithfulness`, `context-relevance`, `answer-relevance`, and `llm-rubric` metrics; enforce pass-rate gates.

## 💡 Tips and Best Practices

- **Use Vercel AI SDK:** This library is the standard in the Next.js ecosystem and will save you tons of work when implementing streaming.
- **Prompt design:** Spend time creating a good system prompt for the assistant. This is a key element of RAG that defines the bot's "personality" and accuracy.
- **Handling missing context:** Anticipate situations where the system won't find an answer to the user's question in the knowledge base, and communicate this in an understandable way.

## 📦 Delivery Method

- **Source code:** Link to a public GitHub repository.
- **README.md:** File with clear instructions for installation, configuration (.env.example with required variables, including connection string), and running the project.
- **Working application:** Link to the deployed application on Vercel (you can use e.g., Vercel Postgres, Neon, or another Vercel-compatible database provider).

## 🏆 Bonus Points

Want to stand out? Consider implementing one of the following features:

- **Question categorization:** System for tagging questions (e.g., vacations, benefits, IT).
- **Rating system:** Ability for users to rate response quality (👍 / 👎).
- **Analytics:** Collecting and displaying data on the most popular queries.
- **Multilingualism:** Support for queries in Polish (MVP supports English with groundwork for Polish).