import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
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

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values,
  });

  return embeddings.map((embedding, i) => ({
    content: values[i],
    embedding,
  }));
}
