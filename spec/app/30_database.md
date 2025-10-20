## 1. List of tables with columns, data types, and constraints

### Table: `documents`
- **`id`**: UUID, PRIMARY KEY, NOT NULL, DEFAULT `gen_random_uuid()`
- **`checksum`**: TEXT, NOT NULL, UNIQUE
- **`source_file`**: TEXT, NULL
- **`title`**: TEXT, NULL
- **`created_at`**: TIMESTAMPTZ, NOT NULL, DEFAULT `now()`

Constraints
- `documents_checksum_key` UNIQUE (`checksum`)

Notes
- `checksum` enables idempotent seeding (e.g., `INSERT ... ON CONFLICT (checksum) DO NOTHING`)
- `source_file` stores the local markdown filename/path
- No raw document text is stored here; chunk text lives in `chunks.content`

---

### Table: `chunks`
- **`id`**: UUID, PRIMARY KEY, NOT NULL, DEFAULT `gen_random_uuid()`
- **`document_id`**: UUID, NOT NULL, REFERENCES `documents(id)` ON DELETE CASCADE
- **`chunk_index`**: INTEGER, NOT NULL, CHECK `chunk_index >= 0`
- **`content`**: TEXT, NOT NULL
- **`section_title`**: TEXT, NULL
- **`embedding`**: VECTOR(1536), NULL

Constraints
- `chunks_document_id_chunk_index_key` UNIQUE (`document_id`, `chunk_index`)

Notes
- Embeddings stored per-chunk using `pgvector` with dimension 1536 (OpenAI `text-embedding-3-small`)
- Embeddings may be NULL during ingestion; retrieval must filter on `embedding IS NOT NULL`


## 2. Relationships between tables
- **`documents` 1 — N `chunks`**
  - `chunks.document_id` → `documents.id` (ON DELETE CASCADE)
  - Each chunk belongs to exactly one document; a document may have many chunks.


## 3. Indexes

MVP indexes
- `documents_pkey` on `documents(id)` (implicit via PK)
- `documents_checksum_key` UNIQUE on `documents(checksum)`
- `chunks_pkey` on `chunks(id)` (implicit via PK)
- `chunks_document_id_chunk_index_key` UNIQUE on `chunks(document_id, chunk_index)`
- `idx_chunks_document_id` BTREE on `chunks(document_id)` (for fetching all chunks of a document)

Vector search
- Start without HNSW/IVF index; use `ORDER BY embedding <=> :query_embedding LIMIT k` with `WHERE embedding IS NOT NULL`
- Add HNSW index later if needed: `CREATE INDEX CONCURRENTLY idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;`


## 4. PostgreSQL policies (RLS)
- RLS is NOT enabled in the MVP. Access gating is enforced at the application layer.
- No RLS policies are defined for `documents` or `chunks`.


## 5. Additional notes and design decisions

**Extensions** (install in first migration)
- `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (for `gen_random_uuid()`)
- `CREATE EXTENSION IF NOT EXISTS vector;` (for `pgvector`)

**Idempotent seeding**
- Use `documents.checksum` UNIQUE with `INSERT ... ON CONFLICT (checksum) DO NOTHING` for reruns

**Embeddings lifecycle**
- May be NULL during ingestion; populate in seeding/background job
- Retrieval must filter on `embedding IS NOT NULL`

**Design philosophy**
- Minimal schema for MVP: only fields actually used by the application
- No premature optimization (token counts, update timestamps, page numbers for markdown files)
- Can extend later with ALTER TABLE when needed

**Evaluation posture**
- No schema changes required for Promptfoo evaluations
- Deterministic retrieval via `WHERE embedding IS NOT NULL` and consistent `<=>` ordering
