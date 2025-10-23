#!/usr/bin/env bun

/**
 * API Endpoint Test Script
 *
 * Tests all three API endpoints with sample requests.
 * Requires:
 * - API_SECRET_TOKEN set in .env
 * - Database seeded with HR documents
 * - Dev server running: bun dev
 */

import { env } from "@/lib/env";

const BASE_URL = "http://localhost:3000/api/v1";
const TOKEN = env.API_SECRET_TOKEN;

interface TestResult {
  endpoint: string;
  status: "PASS" | "FAIL";
  statusCode?: number;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function testHealthEndpoint(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    const duration = Date.now() - start;

    if (response.ok && data.status) {
      return {
        endpoint: "GET /health",
        status: "PASS",
        statusCode: response.status,
        duration,
      };
    }

    return {
      endpoint: "GET /health",
      status: "FAIL",
      statusCode: response.status,
      error: `Unexpected response: ${JSON.stringify(data)}`,
      duration,
    };
  } catch (error) {
    return {
      endpoint: "GET /health",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

async function testRetrieveEndpoint(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        query: "What are the vacation day policies?",
        top_k: 5,
        min_similarity: 0.5,
      }),
    });

    const data = await response.json();
    const duration = Date.now() - start;

    if (response.ok && Array.isArray(data.results)) {
      console.log(`  Found ${data.results.length} results`);
      if (data.results.length > 0) {
        console.log(
          `  Top similarity: ${data.results[0].similarity.toFixed(3)}`,
        );
      }
      return {
        endpoint: "POST /retrieve",
        status: "PASS",
        statusCode: response.status,
        duration,
      };
    }

    return {
      endpoint: "POST /retrieve",
      status: "FAIL",
      statusCode: response.status,
      error: JSON.stringify(data),
      duration,
    };
  } catch (error) {
    return {
      endpoint: "POST /retrieve",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

async function testChatEndpoint(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/chat?debug=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "How many vacation days do employees get?",
          },
        ],
      }),
    });

    const data = await response.json();
    const duration = Date.now() - start;

    if (response.ok && data.answer) {
      console.log(`  Answer length: ${data.answer.length} chars`);
      console.log(`  Retrieved docs: ${data.retrieved_docs?.length || 0}`);
      return {
        endpoint: "POST /chat",
        status: "PASS",
        statusCode: response.status,
        duration,
      };
    }

    return {
      endpoint: "POST /chat",
      status: "FAIL",
      statusCode: response.status,
      error: JSON.stringify(data),
      duration,
    };
  } catch (error) {
    return {
      endpoint: "POST /chat",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

async function testAuthFailure(): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // No auth header
      },
      body: JSON.stringify({
        query: "test",
      }),
    });

    const duration = Date.now() - start;

    if (response.status === 401) {
      return {
        endpoint: "Auth Check (401)",
        status: "PASS",
        statusCode: response.status,
        duration,
      };
    }

    return {
      endpoint: "Auth Check (401)",
      status: "FAIL",
      statusCode: response.status,
      error: "Expected 401 for missing auth",
      duration,
    };
  } catch (error) {
    return {
      endpoint: "Auth Check (401)",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

async function main() {
  console.log("🧪 Testing API Endpoints");
  console.log("========================\n");

  console.log("Testing /health endpoint...");
  results.push(await testHealthEndpoint());

  console.log("\nTesting /retrieve endpoint...");
  results.push(await testRetrieveEndpoint());

  console.log("\nTesting /chat endpoint (debug mode)...");
  results.push(await testChatEndpoint());

  console.log("\nTesting authentication failure...");
  results.push(await testAuthFailure());

  console.log("\n📊 Test Results");
  console.log("===============\n");

  for (const result of results) {
    const icon = result.status === "PASS" ? "✅" : "❌";
    const statusInfo = result.statusCode ? `[${result.statusCode}]` : "";
    const durationInfo = result.duration ? `(${result.duration}ms)` : "";

    console.log(`${icon} ${result.endpoint} ${statusInfo} ${durationInfo}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const total = results.length;

  console.log(`\n${passed}/${total} tests passed`);

  if (passed === total) {
    console.log("\n✨ All tests passed! API is ready.");
    process.exit(0);
  } else {
    console.log("\n⚠️  Some tests failed. Check errors above.");
    process.exit(1);
  }
}

main();
