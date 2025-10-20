#!/usr/bin/env bun
/**
 * Database Reset Script
 * Drops all tables and runs migrations from scratch
 * WARNING: This will delete all data - use only in development!
 */

import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env.mjs";

const sql = neon(env.DATABASE_URL);

async function resetDatabase() {
  console.log("⚠️  WARNING: This will drop all tables and data!");
  console.log("🗄️  Database:", env.DATABASE_URL.split("@")[1]?.split("/")[0]);

  try {
    console.log("\n🗑️  Dropping existing tables...");

    // Drop tables in correct order (respecting foreign keys)
    await sql`DROP TABLE IF EXISTS chunks CASCADE`;
    await sql`DROP TABLE IF EXISTS documents CASCADE`;

    console.log("✅ Tables dropped successfully");
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    process.exit(1);
  }
}

resetDatabase();
