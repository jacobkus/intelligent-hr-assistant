import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().notNull().default(sql`gen_random_uuid()`),
  checksum: text("checksum").notNull().unique(),
  sourceFile: text("source_file"),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
