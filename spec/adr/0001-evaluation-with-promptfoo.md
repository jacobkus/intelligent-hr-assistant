# ADR-0001: Adopt Promptfoo for Evaluation and Quality Gates

Status: Accepted

Date: 2025-10-20

## Context

The HR Assistant is a RAG application where quality depends on both retrieval and generation. We need:
- Reproducible local and CI evaluation
- Support for prompt-only experiments and end-to-end (HTTP) checks
- Model-graded RAG metrics (faithfulness, relevance) and deterministic checks
- Clear pass/fail gates to prevent regressions

## Decision

Adopt Promptfoo for evaluations with two providers:
1. Prompt-only provider using OpenAI (e.g., `openai:gpt-5-mini`) to validate prompt engineering with explicit `context` variables
2. HTTP provider calling our `POST /api/chat?debug=1` endpoint to evaluate the full RAG pipeline

Metrics:
- Model-graded: `context-faithfulness`, `context-relevance`, `answer-relevance`, and `llm-rubric`
- Deterministic: `icontains`, `contains-all/any`, `regex`, `javascript` for brevity/latency heuristics

Dataset:
- Versioned at `tests/eval/hr_dataset.yaml` with representative HR queries, expected phrases/facts, and no-context cases

Gates:
- CI pass rate ≥ 80% overall; ≥ 95% on no-context subset

## Alternatives Considered

- Homegrown scripts only: Faster to start but less standard, limited UIs and metrics
- Other eval frameworks: Comparable features, Promptfoo offers simpler RAG/context transforms and broad CI guides

## Consequences

- Requires a debug JSON mode in `/api/chat` to return `answer` and `retrieved_docs` for `contextTransform`
- E2E evals depend on seeded DB + computed embeddings
- Small operational cost for LLM-graded metrics in CI

## Implementation

- Spec updates in `spec/app/**` to define endpoints, debug mode, metrics, and gates
- `promptfooconfig.yaml` defines the providers and references `tests/eval/hr_dataset.yaml`
- `package.json` scripts: `eval`, `eval:promptfoo`, `eval:ci`
- Optional local harness `scripts/eval.ts` to sanity-check the API

## Rollout

- Run locally during development
- Add GitHub Actions (or equivalent) step using `promptfoo eval --fail-on-error` and publish JSON/HTML reports as artifacts
