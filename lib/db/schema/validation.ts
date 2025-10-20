import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod/v4";
import { chunks, documents } from "./index";

// Document schemas
export const documentInsertSchema = createInsertSchema(documents, {
  checksum: (schema) => schema.min(1, "Checksum cannot be empty"),
});

export const documentSelectSchema = createSelectSchema(documents);

// Chunk schemas
export const chunkInsertSchema = createInsertSchema(chunks, {
  content: (schema) => schema.min(1, "Content cannot be empty"),
  chunkIndex: (schema) => schema.min(0, "Chunk index must be non-negative"),
  embedding: (schema) =>
    schema
      .optional()
      .refine(
        (val) => val === undefined || val.length === 1536,
        "Embedding must have exactly 1536 dimensions",
      ),
});

export const chunkSelectSchema = createSelectSchema(chunks);

// Type exports for convenience
export type DocumentInsert = z.infer<typeof documentInsertSchema>;
export type DocumentSelect = z.infer<typeof documentSelectSchema>;
export type ChunkInsert = z.infer<typeof chunkInsertSchema>;
export type ChunkSelect = z.infer<typeof chunkSelectSchema>;
