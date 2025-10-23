/**
 * Similarity Score Verification Test
 *
 * Purpose: Verify pgvector cosine distance ranges with OpenAI embeddings
 * to determine the correct similarity conversion formula.
 *
 * Theory:
 * - Cosine similarity ∈ [-1, 1]
 * - Cosine distance = 1 - cosine_similarity → distance ∈ [0, 2]
 * - BUT: OpenAI embeddings are normalized (magnitude = 1)
 * - For normalized vectors: cosine similarity ∈ [0, 1] → distance ∈ [0, 1]
 *
 * This test confirms which formula to use:
 * - Formula A: similarity = 1 - distance (for normalized, range [0,1])
 * - Formula B: similarity = 1 - (distance / 2) (for general, range [0,2])
 */

import { openai } from "@ai-sdk/openai";
import { neon } from "@neondatabase/serverless";
import { embed } from "ai";
import { env } from "@/lib/env";

interface TestCase {
  text1: string;
  text2: string;
  expectedSimilarity: "high" | "medium" | "low";
}

const testCases: TestCase[] = [
  {
    text1: "parental leave policy",
    text2: "parental leave policy", // Identical
    expectedSimilarity: "high",
  },
  {
    text1: "parental leave benefits",
    text2: "maternity and paternity leave", // Very similar
    expectedSimilarity: "high",
  },
  {
    text1: "vacation days",
    text2: "paid time off", // Related
    expectedSimilarity: "medium",
  },
  {
    text1: "health insurance",
    text2: "remote work policy", // Different topics
    expectedSimilarity: "low",
  },
  {
    text1: "employee benefits",
    text2: "quantum physics", // Completely unrelated
    expectedSimilarity: "low",
  },
];

async function testSimilarity() {
  console.log("🔬 Testing pgvector cosine distance with OpenAI embeddings\n");

  // Use Neon client directly for parameterized queries with vectors
  const sql = neon(env.DATABASE_URL);

  const results: Array<{
    pair: string;
    distance: number;
    similarityA: number;
    similarityB: number;
    expected: string;
  }> = [];

  for (const testCase of testCases) {
    // Generate embeddings using OpenAI
    const { embedding: embedding1 } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: testCase.text1,
    });

    const { embedding: embedding2 } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: testCase.text2,
    });

    // Calculate cosine distance using pgvector's <=> operator
    // Convert embeddings to PostgreSQL vector format and use parameterized query
    const vector1Str = `[${embedding1.join(",")}]`;
    const vector2Str = `[${embedding2.join(",")}]`;

    const result = await sql.query(
      "SELECT ($1::text::vector <=> $2::text::vector) as distance",
      [vector1Str, vector2Str],
    );

    const distance = Number(result[0].distance);

    // Test both formulas
    const similarityA = 1 - distance; // Assumes normalized (0-1 range)
    const similarityB = 1 - distance / 2; // Assumes general (0-2 range)

    results.push({
      pair: `"${testCase.text1}" vs "${testCase.text2}"`,
      distance,
      similarityA,
      similarityB,
      expected: testCase.expectedSimilarity,
    });

    console.log(`Pair: ${testCase.text1} <-> ${testCase.text2}`);
    console.log(`  Expected:    ${testCase.expectedSimilarity} similarity`);
    console.log(`  Distance:    ${distance.toFixed(4)}`);
    console.log(`  Formula A:   ${similarityA.toFixed(4)} (1 - distance)`);
    console.log(`  Formula B:   ${similarityB.toFixed(4)} (1 - distance/2)`);
    console.log("");
  }

  // Analyze results
  console.log("📊 Analysis:");
  console.log("─".repeat(60));

  const maxDistance = Math.max(...results.map((r) => r.distance));
  const minDistance = Math.min(...results.map((r) => r.distance));

  console.log(
    `Distance range observed: [${minDistance.toFixed(4)}, ${maxDistance.toFixed(4)}]`,
  );

  if (maxDistance <= 1.0) {
    console.log("\n✅ CONCLUSION: Distances are in [0, 1] range");
    console.log("   → OpenAI embeddings ARE normalized");
    console.log("   → Use Formula A: similarity = 1 - distance");
    console.log("   → Similarity scores will be in [0, 1] (intuitive)");
  } else if (maxDistance <= 2.0) {
    console.log("\n⚠️  CONCLUSION: Distances exceed 1.0, up to 2.0 range");
    console.log("   → OpenAI embeddings may NOT be normalized (unexpected!)");
    console.log("   → Use Formula B: similarity = 1 - (distance / 2)");
    console.log("   → Or verify OpenAI documentation");
  } else {
    console.log("\n❌ UNEXPECTED: Distances exceed 2.0!");
    console.log("   → pgvector issue or data corruption");
    console.log("   → Check vector dimensions and data integrity");
  }

  console.log("\n📝 Recommendation for spec:");
  if (maxDistance <= 1.0) {
    console.log("   Update 40_api.md with:");
    console.log("   similarity = 1 - distance");
    console.log("   min_similarity default: 0.7 (70% similar)");
  } else {
    console.log("   Update 40_api.md with:");
    console.log("   similarity = 1 - (distance / 2)");
    console.log("   min_similarity default: 0.7 (70% similar)");
  }
}

// Run test
testSimilarity()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
