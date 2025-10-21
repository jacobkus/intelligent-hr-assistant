#!/usr/bin/env bun
/**
 * Database Reset Script
 * Drops all tables and runs migrations from scratch
 * WARNING: This will delete all data - use only in development!
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env.mjs";

const sql = neon(env.DATABASE_URL);

async function resetDatabase() {
  console.log("⚠️  WARNING: This will drop all tables and data!");
  console.log("🗄️  Database:", env.DATABASE_URL.split("@")[1]?.split("/")[0]);

  try {
    console.log("\n🗑️  Dropping existing tables and extensions...");

    // Drop tables in correct order (respecting foreign keys)
    await sql`DROP TABLE IF EXISTS chunks CASCADE`;
    await sql`DROP TABLE IF EXISTS documents CASCADE`;

    // Drop Drizzle migration tracking schema
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;

    // Drop extensions for complete reset
    await sql`DROP EXTENSION IF EXISTS vector CASCADE`;
    await sql`DROP EXTENSION IF EXISTS pgcrypto CASCADE`;

    console.log(
      "✅ Tables, extensions, and migration journal dropped successfully",
    );
    console.log("💡 Run 'bun run db:migrate' next to recreate schema");
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    process.exit(1);
  }
}

resetDatabase();
