#!/usr/bin/env bun
/**
 * Database Seed Script
 * Loads HR documents from content/hr/, chunks them semantically,
 * generates embeddings, and stores everything in PostgreSQL with pgvector
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import { chunkMarkdownBySections } from "@/lib/ai/chunking";
import { generateEmbeddings } from "@/lib/ai/embedding";
import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { chunkInsertSchema } from "@/lib/db/schema/validation";
import { env } from "@/lib/env";

const CONTENT_DIR = join(process.cwd(), "content", "hr");

function generateChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function loadDocument(filePath: string) {
  const fileContent = await readFile(filePath, "utf-8");
  const { data: frontmatter, content } = matter(fileContent);

  return {
    frontmatter,
    content,
    sourceFile: filePath.split("/").pop() || filePath,
    checksum: generateChecksum(fileContent),
  };
}

async function seed() {
  console.log("🌱 Starting database seed...\n");
  console.log("📁 Content directory:", CONTENT_DIR);
  console.log("🗄️  Database:", env.DATABASE_URL.split("@")[1]?.split("/")[0]);
  console.log("");

  try {
    // Read all markdown files from content/hr
    const files = await readdir(CONTENT_DIR);
    const mdFiles = files.filter(
      (f) => f.endsWith(".md") && !f.startsWith("_"),
    );

    console.log(`📄 Found ${mdFiles.length} markdown files\n`);

    let totalDocuments = 0;
    let totalChunks = 0;
    let totalEmbeddings = 0;
    let skippedDuplicates = 0;

    for (const file of mdFiles) {
      const filePath = join(CONTENT_DIR, file);
      console.log(`📖 Processing: ${file}`);

      // Load and parse document
      const doc = await loadDocument(filePath);
      const title = doc.frontmatter.title || file.replace(".md", "");

      // Upsert document idempotently and always resolve the document id
      let documentId: string | null = null;

      const insertedDocs = await db
        .insert(documents)
        .values({
          checksum: doc.checksum,
          sourceFile: doc.sourceFile,
          title,
        })
        .onConflictDoNothing({ target: documents.checksum })
        .returning({ id: documents.id });

      if (insertedDocs.length > 0) {
        // Newly inserted document in this run
        documentId = insertedDocs[0].id;
        totalDocuments++;
      } else {
        // Document already existed — fetch its id so we can (re)insert chunks
        const existing = await db
          .select({ id: documents.id })
          .from(documents)
          .where(eq(documents.checksum, doc.checksum));

        documentId = existing[0]?.id ?? null;
        if (!documentId) {
          console.log(`  ❌ Could not resolve existing document id, skipping`);
          skippedDuplicates++;
          continue;
        }

        skippedDuplicates++;
        console.log(`  ℹ️  Document exists — continuing to (re)insert chunks`);
      }

      // Chunk the content
      const documentChunks = chunkMarkdownBySections(doc.content);
      console.log(`  ✂️  Created ${documentChunks.length} chunks`);

      // Generate embeddings for all chunks
      const chunkContents = documentChunks.map((c) => c.content);
      const embeddingResults = await generateEmbeddings(chunkContents);
      console.log(`  🔢 Generated ${embeddingResults.length} embeddings`);

      // Ensure we have a document id before proceeding
      if (!documentId) {
        throw new Error("Invariant violation: documentId not resolved");
      }

      // Insert chunks with embeddings (batch insert with validation)
      const chunksToInsert = [] as Array<{
        documentId: string;
        chunkIndex: number;
        content: string;
        sectionTitle: string | null;
        embedding: number[];
      }>;
      for (let i = 0; i < documentChunks.length; i++) {
        const chunk = documentChunks[i];
        const embedding = embeddingResults[i]?.embedding;

        if (!embedding) {
          console.warn(`  ⚠️  Missing embedding for chunk ${i}`);
          continue;
        }

        chunksToInsert.push({
          documentId: documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          sectionTitle: chunk.sectionTitle,
          embedding: embedding,
        });
      }

      if (chunksToInsert.length > 0) {
        // Validate and idempotently insert chunks; skip duplicates by unique (document_id, chunk_index)
        try {
          const validated = chunksToInsert.map((c) =>
            chunkInsertSchema.parse(c),
          );

          await db
            .insert(chunks)
            .values(validated)
            .onConflictDoNothing({
              target: [chunks.documentId, chunks.chunkIndex],
            });

          // Note: Using onConflictDoNothing means some may be skipped; we count attempted inserts
          totalChunks += validated.length;
          totalEmbeddings += validated.length;
        } catch (error) {
          if (error instanceof Error && error.name === "ZodError") {
            console.error(
              `  ❌ Validation failed for chunks in ${file}:`,
              error.message,
            );
            throw error;
          }
          throw error;
        }
      }

      console.log(`  ✅ Completed\n`);
    }

    // Summary
    console.log("━".repeat(50));
    console.log("📊 Seeding Summary:");
    console.log(`  Documents processed: ${totalDocuments}`);
    console.log(`  Documents skipped (duplicates): ${skippedDuplicates}`);
    console.log(`  Chunks created: ${totalChunks}`);
    console.log(`  Embeddings generated: ${totalEmbeddings}`);
    console.log("━".repeat(50));
    console.log("✨ Seeding completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Error during seeding:", error);
    process.exit(1);
  }
}

seed();
