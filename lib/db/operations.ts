/**
 * Validated database operations using drizzle-zod schemas to enforce business rules
 * (embedding dimensions, content requirements) before inserts.
 * @see spec/adr/002-database-validation-layer.md
 */

import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import {
  type ChunkInsert,
  chunkInsertSchema,
  type DocumentInsert,
  documentInsertSchema,
} from "@/lib/db/schema/validation";

export async function insertDocument(data: unknown) {
  const validated = documentInsertSchema.parse(data);
  const [inserted] = await db.insert(documents).values(validated).returning();

  if (!inserted) {
    throw new Error("Failed to insert document");
  }

  return inserted;
}

export async function insertDocuments(data: unknown[]) {
  const validated = data.map((d) => documentInsertSchema.parse(d));
  return db.insert(documents).values(validated).returning();
}

export async function insertChunk(data: unknown) {
  const validated = chunkInsertSchema.parse(data);
  const [inserted] = await db.insert(chunks).values(validated).returning();

  if (!inserted) {
    throw new Error("Failed to insert chunk");
  }

  return inserted;
}

export async function insertChunks(data: unknown[]) {
  const validated = data.map((d) => chunkInsertSchema.parse(d));
  return db.insert(chunks).values(validated).returning();
}

export function createDocumentData(
  data: Omit<DocumentInsert, "id" | "createdAt">,
): Omit<DocumentInsert, "id" | "createdAt"> {
  return data;
}

export function createChunkData(
  data: Omit<ChunkInsert, "id">,
): Omit<ChunkInsert, "id"> {
  return data;
}
