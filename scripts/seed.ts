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
import matter from "gray-matter";
import { chunkMarkdownBySections } from "@/lib/ai/chunking";
import { generateEmbeddings } from "@/lib/ai/embedding";
import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { env } from "@/lib/env.mjs";

const CONTENT_DIR = join(process.cwd(), "content", "hr");

/**
 * Generate SHA-256 checksum for content deduplication
 */
function generateChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Load and parse a single markdown file
 */
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

/**
 * Main seeding function
 */
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

      // Check if document already exists (idempotent seeding)
      const [existingDoc] = await db
        .insert(documents)
        .values({
          checksum: doc.checksum,
          sourceFile: doc.sourceFile,
          title,
        })
        .onConflictDoNothing({ target: documents.checksum })
        .returning({ id: documents.id });

      if (!existingDoc) {
        console.log(`  ⏭️  Skipped (already exists)`);
        skippedDuplicates++;
        continue;
      }

      totalDocuments++;

      // Chunk the content
      const documentChunks = chunkMarkdownBySections(doc.content);
      console.log(`  ✂️  Created ${documentChunks.length} chunks`);

      // Generate embeddings for all chunks
      const chunkContents = documentChunks.map((c) => c.content);
      const embeddingResults = await generateEmbeddings(chunkContents);
      console.log(`  🔢 Generated ${embeddingResults.length} embeddings`);

      // Insert chunks with embeddings (batch insert)
      const chunksToInsert = [];
      for (let i = 0; i < documentChunks.length; i++) {
        const chunk = documentChunks[i];
        const embedding = embeddingResults[i]?.embedding;

        if (!embedding) {
          console.warn(`  ⚠️  Missing embedding for chunk ${i}`);
          continue;
        }

        chunksToInsert.push({
          documentId: existingDoc.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          sectionTitle: chunk.sectionTitle,
          embedding: embedding,
        });
      }

      if (chunksToInsert.length > 0) {
        await db.insert(chunks).values(chunksToInsert);
        totalChunks += chunksToInsert.length;
        totalEmbeddings += chunksToInsert.length;
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
