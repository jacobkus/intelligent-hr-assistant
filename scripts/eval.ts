#!/usr/bin/env bun

import "dotenv/config";

// Minimal local harness to sanity-check /api/chat debug mode without Promptfoo
const question =
  process.argv.slice(2).join(" ") || "What is the parental leave policy?";

async function main() {
  const token = process.env.API_SECRET_TOKEN;
  if (!token) {
    console.error("API_SECRET_TOKEN not found in environment");
    process.exit(1);
  }

  const res = await fetch("http://localhost:3000/api/v1/chat?debug=1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok) {
    console.error("Request failed", res.status, res.statusText);
    const text = await res.text().catch(() => "");
    if (text) console.error(text);
    process.exit(1);
  }
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
