import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { Timeouts, withTimeout } from "@/lib/api/timeout";
import { env } from "@/lib/env.mjs";

const openaiClient = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const embeddingModel = openaiClient.embedding("text-embedding-3-small");

export async function generateEmbeddings(values: string[]): Promise<
  Array<{
    embedding: number[];
    content: string;
  }>
> {
  if (values.length === 0) {
    return [];
  }

  const result = await withTimeout(
    embedMany({
      model: embeddingModel,
      values,
    }),
    Timeouts.EMBEDDING,
    "Embedding generation",
  );

  return result.embeddings.map((embedding, i) => ({
    content: values[i],
    embedding,
  }));
}
