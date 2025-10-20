import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

const embeddingModel = openai.embedding("text-embedding-3-small");

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
