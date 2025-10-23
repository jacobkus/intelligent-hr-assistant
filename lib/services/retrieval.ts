import { and, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { generateEmbeddings } from "@/lib/ai/embedding";
import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";

export interface RetrievalOptions {
  query: string;
  topK?: number;
  minSimilarity?: number;
  filters?: {
    documentId?: string;
  };
}

export interface RetrievalResult {
  chunk: {
    id: string;
    documentId: string;
    chunkIndex: number;
    content: string;
    sectionTitle: string | null;
  };
  document: {
    id: string;
    title: string | null;
    sourceFile: string | null;
  };
  similarity: number;
}

/**
 * Executes semantic search over chunk embeddings using pgvector.
 * Formula: similarity = 1 - distance (verified via tests/similarity-test.ts).
 * OpenAI embeddings are L2-normalized, so cosine distances ∈ [0, 1].
 */
export async function semanticSearch(
  options: RetrievalOptions,
): Promise<RetrievalResult[]> {
  const { query, topK = 5, minSimilarity = 0.3, filters } = options;

  const embeddings = await generateEmbeddings([query]);
  const queryEmbedding = embeddings[0].embedding;

  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;

  const whereConditions = filters?.documentId
    ? and(
        isNotNull(chunks.embedding),
        eq(chunks.documentId, filters.documentId),
      )
    : isNotNull(chunks.embedding);

  const results = await db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      chunkIndex: chunks.chunkIndex,
      content: chunks.content,
      sectionTitle: chunks.sectionTitle,
      docId: documents.id,
      docTitle: documents.title,
      sourceFile: documents.sourceFile,
      similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(whereConditions)
    .orderBy(desc(similarity))
    .limit(topK);

  return results
    .filter((row) => row.similarity >= minSimilarity)
    .map((row) => ({
      chunk: {
        id: row.id,
        documentId: row.documentId,
        chunkIndex: row.chunkIndex,
        content: row.content,
        sectionTitle: row.sectionTitle,
      },
      document: {
        id: row.docId,
        title: row.docTitle,
        sourceFile: row.sourceFile,
      },
      similarity: row.similarity,
    }));
}
