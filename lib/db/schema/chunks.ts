import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { documents } from "./documents";

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    sectionTitle: text("section_title"),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => ({
    documentIdChunkIndexUnique: uniqueIndex(
      "chunks_document_id_chunk_index_key",
    ).on(table.documentId, table.chunkIndex),
    documentIdIdx: index("idx_chunks_document_id").on(table.documentId),
    chunkIndexCheck: check(
      "chunks_chunk_index_check",
      sql`${table.chunkIndex} >= 0`,
    ),
  }),
);
