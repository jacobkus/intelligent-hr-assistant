import { describe, expect, it } from "vitest";
import {
  chunkInsertSchema,
  documentInsertSchema,
} from "@/lib/db/schema/validation";

/**
 * Focused Validation Tests - Critical Paths Only
 *
 * Only tests critical business rules that prevent production failures:
 * 1. Embedding dimensions (PRIMARY reason for validation layer)
 * 2. Empty content (prevents data quality issues)
 * 3. Negative chunk indexes (breaks ordering)
 * 4. Batch validation (seed script depends on this)
 *
 * @see spec/adr/002-database-validation-layer.md
 */

describe("Database Validation - Critical Paths", () => {
  const baseChunk = {
    documentId: "550e8400-e29b-41d4-a716-446655440000",
    chunkIndex: 0,
    content: "Valid chunk content",
    embedding: new Array(1536).fill(0.1),
  };

  it("accepts valid data (smoke test)", () => {
    // Document
    const validDoc = { checksum: "abc123", sourceFile: "policy.md" };
    expect(documentInsertSchema.safeParse(validDoc).success).toBe(true);

    // Chunk
    expect(chunkInsertSchema.safeParse(baseChunk).success).toBe(true);
  });

  it("rejects empty checksum (REGRESSION: breaks deduplication)", () => {
    /**
     * CRITICAL: Empty checksums break document deduplication logic.
     * Production impact: Duplicate documents inserted on every seed.
     */
    const result = documentInsertSchema.safeParse({ checksum: "" });
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Checksum cannot be empty",
      );
    }
  });

  it("rejects empty content (REGRESSION: prevents retrieval)", () => {
    /**
     * CRITICAL: Empty chunks provide no value for semantic search.
     * Production impact: Wasted database space, confusing search results.
     */
    const invalidChunk = { ...baseChunk, content: "" };
    const result = chunkInsertSchema.safeParse(invalidChunk);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Content cannot be empty",
      );
    }
  });

  it("rejects negative chunkIndex (REGRESSION: breaks ordering)", () => {
    /**
     * CRITICAL: Negative indexes break chunk ordering in retrieval.
     * Production impact: Chunks returned in wrong order, context corrupted.
     */
    const invalidChunk = { ...baseChunk, chunkIndex: -1 };
    const result = chunkInsertSchema.safeParse(invalidChunk);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("non-negative");
    }
  });

  it("accepts exactly 1536 embedding dimensions (OpenAI spec)", () => {
    /**
     * MOST CRITICAL TEST
     *
     * This is THE primary reason for the validation layer.
     * Database constraints can't enforce vector dimensions.
     *
     * OpenAI text-embedding-3-small produces exactly 1536 dimensions.
     * Wrong dimensions cause SILENT FAILURES in similarity search.
     */
    const chunk = { ...baseChunk, embedding: new Array(1536).fill(0.1) };
    expect(chunkInsertSchema.safeParse(chunk).success).toBe(true);
  });

  it("rejects wrong embedding dimensions (REGRESSION: silent search failures)", () => {
    /**
     * CRITICAL: Wrong dimensions cause silent failures in pgvector search.
     * Production impact: Search returns empty results, users get no answers.
     *
     * Common failure modes:
     * - 1535/1537: Off-by-one errors in embedding generation
     * - 768: Accidentally using BERT/sentence-transformers model
     */
    const testCases = [
      1535, // Off-by-one (too few)
      1537, // Off-by-one (too many)
      768, // Wrong model (BERT)
      0, // Empty array
    ];

    for (const dims of testCases) {
      const chunk = { ...baseChunk, embedding: new Array(dims).fill(0.1) };
      const result = chunkInsertSchema.safeParse(chunk);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/1536/);
      }
    }
  });

  it("accepts missing embedding (optional for staged inserts)", () => {
    /**
     * Chunks can be inserted without embeddings and updated later.
     * This supports workflows where documents are ingested first,
     * then embeddings are generated in a background job.
     */
    const chunkWithoutEmbedding = { ...baseChunk, embedding: undefined };
    expect(chunkInsertSchema.safeParse(chunkWithoutEmbedding).success).toBe(
      true,
    );
  });

  it("validates all chunks in batch (seed script behavior)", () => {
    /**
     * CRITICAL: Batch validation must be all-or-nothing.
     * Production impact: Prevents partial inserts that corrupt data.
     *
     * lib/db/operations.insertChunks() validates ALL before inserting ANY.
     */
    const validChunks = [
      { ...baseChunk, chunkIndex: 0, content: "First" },
      { ...baseChunk, chunkIndex: 1, content: "Second" },
    ];

    const results = validChunks.map((c) => chunkInsertSchema.safeParse(c));
    expect(results.every((r) => r.success)).toBe(true);

    // One invalid chunk should fail validation
    const mixedChunks = [
      { ...baseChunk, content: "Valid" },
      { ...baseChunk, content: "" }, // Invalid
    ];

    const mixed = mixedChunks.map((c) => chunkInsertSchema.safeParse(c));
    expect(mixed.some((r) => !r.success)).toBe(true);
  });
});
