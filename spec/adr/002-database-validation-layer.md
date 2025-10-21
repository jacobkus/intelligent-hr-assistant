# ADR-002: Database Validation Layer Architecture

**Status**: Accepted
**Date**: 2025-10-21
**Decision Makers**: Engineering Team
**Related**: `spec/app/20_stack.md` (Drizzle ORM + Zod validation)

## Context

The application uses Drizzle ORM with PostgreSQL and has multiple validation concerns:

1. **API Layer**: Validate incoming HTTP requests (format, size, authentication)
2. **Database Layer**: Validate data before database operations (business rules, data integrity)
3. **Database Constraints**: Enforce structural integrity (foreign keys, NOT NULL, CHECK constraints)

### Problem

Without a clear validation strategy, we risk:
- **Data corruption**: Invalid data reaching the database (e.g., wrong embedding dimensions)
- **Inconsistent patterns**: Some operations validate, others don't
- **Poor error messages**: Database constraint violations provide cryptic errors
- **Developer confusion**: No clear guidelines on when/where to validate

### Specific Issues Identified

1. **Embedding dimension validation**: Database can't enforce that vectors have exactly 1536 dimensions
2. **Business rules**: Content length, chunk index ranges need validation before DB operations
3. **Duplicate validation logic**: API routes had inline Zod schemas, DB operations had none
4. **Unused code**: `lib/db/schema/validation.ts` existed but was never used

## Decision

We will implement a **three-layer validation architecture**:

```
┌─────────────────────────────────────────────────┐
│ Layer 1: API Validation                         │
│ Purpose: Validate HTTP requests/responses       │
│ Location: app/api/**/route.ts (inline Zod)     │
│ Example: Request payload, headers, query params │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Layer 2: Database Validation                    │
│ Purpose: Validate data before DB operations     │
│ Location: lib/db/operations.ts                  │
│ Technology: drizzle-zod schemas                 │
│ Example: Embedding dimensions, content rules    │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Layer 3: Database Constraints                   │
│ Purpose: Last line of defense                   │
│ Location: Database schema                       │
│ Example: Foreign keys, NOT NULL, CHECK          │
└─────────────────────────────────────────────────┘
```

### Implementation

#### 1. Database Validation Utilities (`lib/db/operations.ts`)

Create validated wrappers around Drizzle operations:

```typescript
import { db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { chunkInsertSchema, documentInsertSchema } from "@/lib/db/schema/validation";

/**
 * Insert a document with automatic validation.
 * Throws ZodError if data is invalid.
 */
export async function insertDocument(data: unknown) {
  const validated = documentInsertSchema.parse(data);
  const [inserted] = await db.insert(documents).values(validated).returning();
  if (!inserted) throw new Error("Failed to insert document");
  return inserted;
}

/**
 * Batch insert chunks with validation.
 * All chunks are validated before ANY are inserted (fail-fast).
 */
export async function insertChunks(data: unknown[]) {
  const validated = data.map(d => chunkInsertSchema.parse(d));
  return db.insert(chunks).values(validated).returning();
}
```

**Key principles**:
- Accept `unknown` type to force validation (no implicit trust)
- Validate ALL items before ANY database operations (fail-fast, atomic)
- Return typed results (type-safe end-to-end)
- Throw descriptive errors (Zod errors > DB constraint errors)

#### 2. Validation Schemas (`lib/db/schema/validation.ts`)

Use drizzle-zod to generate schemas from Drizzle tables:

```typescript
import { createInsertSchema } from "drizzle-zod";
import { chunks, documents } from "./index";

// Document validation
export const documentInsertSchema = createInsertSchema(documents, {
  checksum: (schema) => schema.min(1, "Checksum cannot be empty"),
});

// Chunk validation with critical embedding dimension check
export const chunkInsertSchema = createInsertSchema(chunks, {
  content: (schema) => schema.min(1, "Content cannot be empty"),
  chunkIndex: (schema) => schema.min(0, "Chunk index must be non-negative"),
  embedding: (schema) =>
    schema
      .optional()
      .refine(
        (val) => val === undefined || val.length === 1536,
        "Embedding must have exactly 1536 dimensions",
      ),
});
```

**Why these refinements**:
- **checksum**: Empty checksums break deduplication logic
- **content**: Empty chunks provide no retrieval value
- **chunkIndex**: Negative indexes break ordering
- **embedding**: Wrong dimensions break vector similarity search (can't be enforced by DB)

#### 3. API Validation (Keep As-Is)

API routes continue to use inline Zod schemas for request validation:

```typescript
// app/api/v1/chat/route.ts
const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  max_output_tokens: z.number().int().min(1).max(2000).optional().default(800),
});
```

**This is correct** because:
- API validation serves a different purpose (HTTP contracts)
- Inline schemas are more readable for API documentation
- API validation can be more permissive than DB validation

### When to Use Each Layer

| Scenario | Layer to Use | Rationale |
|----------|--------------|-----------|
| Validate HTTP request body | API Layer (inline Zod) | Enforce API contract |
| Validate before `db.insert()` | DB Layer (`lib/db/operations`) | Enforce business rules |
| Insert from external data source | DB Layer | Untrusted data source |
| Insert from seed script | DB Layer | Catch data quality issues early |
| Prevent NULL in required field | DB Constraint (`NOT NULL`) | Last line of defense |
| Prevent orphaned records | DB Constraint (`FOREIGN KEY`) | Referential integrity |

### Anti-Patterns to Avoid

❌ **Don't: Direct `db.insert()` without validation**
```typescript
// BAD - No validation, could insert invalid embeddings
await db.insert(chunks).values({ embedding: new Array(768).fill(0) });
```

✅ **Do: Use validated operations**
```typescript
// GOOD - Validates embedding dimensions automatically
await insertChunks([{ embedding: new Array(1536).fill(0) }]);
```

❌ **Don't: Duplicate validation logic**
```typescript
// BAD - Validation logic duplicated in multiple places
if (embedding.length !== 1536) throw new Error("...");
await db.insert(chunks).values({ embedding });
```

✅ **Do: Centralized validation in schemas**
```typescript
// GOOD - Validation logic in one place (schema)
await insertChunks([{ embedding }]); // Schema validates automatically
```

## Considered Alternatives

### Alternative 1: No Database Validation Layer

**Pros**:
- Simpler architecture (fewer layers)
- Rely entirely on database constraints
- Less code to maintain

**Cons**:
- Can't enforce embedding dimensions (no DB constraint for this)
- Poor error messages ("CHECK constraint failed" vs "Embedding must have 1536 dimensions")
- Invalid data wastes DB round-trip
- No early detection of data quality issues

**Decision**: Rejected. Embedding dimension validation alone justifies this layer.

### Alternative 2: Validate Inside API Routes Only

**Pros**:
- All validation in one place (API layer)
- No separate validation utilities needed

**Cons**:
- Scripts (seed.ts) bypass API, no validation
- Internal code can insert invalid data
- Tight coupling between API contracts and DB rules
- No protection for direct DB operations

**Decision**: Rejected. Seed scripts and future background jobs need validation too.

### Alternative 3: Custom Validation Functions (Not Using drizzle-zod)

**Pros**:
- Full control over validation logic
- No dependency on drizzle-zod

**Cons**:
- Duplicates type information (schema defined twice)
- Manual maintenance (schema changes require validation updates)
- More code to write and test
- Loses type inference from schemas

**Decision**: Rejected. drizzle-zod provides type-safe validation with minimal boilerplate.

### Alternative 4: Runtime Type Checking (e.g., io-ts, runtypes)

**Pros**:
- Alternative validation libraries available
- Different API/ergonomics

**Cons**:
- Already using Zod throughout the stack (consistency)
- drizzle-zod specifically designed for Drizzle ORM
- Would require additional dependencies
- Less ecosystem integration

**Decision**: Rejected. Zod is already a dependency and integrates well with Drizzle.

## Consequences

### Positive

1. **Data integrity**: Invalid data caught before database operations
2. **Better error messages**: "Embedding must have 1536 dimensions" vs "CHECK constraint failed"
3. **Consistent pattern**: All DB operations go through validated helpers
4. **Type safety**: End-to-end type checking from input to database
5. **Early detection**: Validation errors fail fast (before DB round-trip)
6. **Self-documenting**: Schemas document expected data shape
7. **Testable**: Validation logic can be unit tested independently

### Negative

1. **Additional layer**: More code to understand and maintain
2. **Performance overhead**: Validation adds ~1-2ms per operation (negligible)
3. **Learning curve**: Developers must know to use `lib/db/operations` helpers
4. **Edge cases**: Some operations (e.g., `onConflictDoNothing`) can't use helpers

### Mitigation Strategies

1. **Documentation**: Clear guidelines in CLAUDE.md and code comments
2. **Code review**: Enforce usage of validated operations in PR reviews
3. **Linting**: Future: Create ESLint rule to flag direct `db.insert()` calls
4. **Examples**: Comprehensive examples in `lib/db/operations.ts`

## Migration Strategy

### Phase 1: Create Infrastructure ✅ COMPLETED
- [x] Create `lib/db/operations.ts` with validated helpers
- [x] Update `lib/db/schema/validation.ts` refinements
- [x] Add unit tests for validation layer

### Phase 2: Migrate Existing Code ✅ COMPLETED
- [x] Update `scripts/seed.ts` to use `insertChunks()`
- [x] Add error handling for validation failures

### Phase 3: Documentation and Guidelines ⏳ IN PROGRESS
- [ ] Create ADR-002 (this document)
- [ ] Update CLAUDE.md with validation guidelines
- [ ] Add inline comments explaining when to use each layer

### Phase 4: Future Enhancements (Post-MVP)
- [ ] Add `updateDocument()` and `updateChunk()` validated helpers (when needed)
- [ ] Create ESLint rule to enforce validated operations
- [ ] Add integration tests for DB operations
- [ ] Consider soft validation mode (log warnings vs throw errors)

## Validation Rules Reference

### Document Validation Rules

| Field | Rule | Validation Type | Error Message |
|-------|------|-----------------|---------------|
| `checksum` | Non-empty string | Zod refinement | "Checksum cannot be empty" |
| `checksum` | Unique | DB constraint | (Database unique violation) |
| `sourceFile` | Optional string | Drizzle schema | - |
| `title` | Optional string | Drizzle schema | - |

### Chunk Validation Rules

| Field | Rule | Validation Type | Error Message |
|-------|------|-----------------|---------------|
| `content` | Non-empty string | Zod refinement | "Content cannot be empty" |
| `chunkIndex` | Non-negative integer | Zod refinement + DB CHECK | "Chunk index must be non-negative" |
| `embedding` | Exactly 1536 dimensions OR undefined | Zod refinement | "Embedding must have exactly 1536 dimensions" |
| `documentId` | Valid UUID, references document | Drizzle schema + DB FK | (Database foreign key violation) |
| `documentId + chunkIndex` | Unique pair | DB unique index | (Database unique violation) |

## Testing Strategy

### Unit Tests (`tests/unit/db/operations.test.ts`)

Test validation logic in isolation:
- ✅ Valid data passes through
- ✅ Invalid embedding dimensions rejected (1535, 1537, 768, 0)
- ✅ Empty content rejected
- ✅ Negative chunk indexes rejected
- ✅ Type mismatches caught
- ✅ Batch validation (all-or-nothing)

### Integration Tests (Future)

Test actual database operations:
- Insert valid document/chunk → success
- Insert invalid data → descriptive error
- Batch insert with one invalid → entire batch fails
- Database constraints still enforced (defense in depth)

## Success Metrics

1. **No invalid embeddings in production**: Zero occurrences of wrong-dimension embeddings
2. **Validation coverage**: 100% of DB inserts go through validated helpers
3. **Error clarity**: Users get actionable error messages (not "constraint failed")
4. **Developer adoption**: New DB operations use validated helpers by default

## References

- Drizzle Zod Documentation: https://orm.drizzle.team/docs/zod
- Zod Documentation: https://zod.dev
- Related ADR: `spec/adr/001-static-token-auth-mvp.md`
- Stack Decisions: `spec/app/20_stack.md`
- Database Schema: `lib/db/schema/chunks.ts`, `lib/db/schema/documents.ts`

## Appendix: Example Usage

### Example 1: Seed Script

```typescript
// scripts/seed.ts
import { insertChunks } from "@/lib/db/operations";

const chunks = documentChunks.map((chunk, i) => ({
  documentId: doc.id,
  chunkIndex: i,
  content: chunk.content,
  embedding: embeddings[i],
}));

try {
  await insertChunks(chunks); // Validates all chunks before insert
} catch (error) {
  if (error instanceof ZodError) {
    console.error("Validation failed:", error.issues);
  }
  throw error;
}
```

### Example 2: Future API Endpoint (Document Upload)

```typescript
// app/api/v1/documents/route.ts
import { insertDocument, insertChunks } from "@/lib/db/operations";

export async function POST(request: Request) {
  // Layer 1: API validation
  const body = documentUploadSchema.parse(await request.json());

  // Layer 2: DB validation (automatic)
  const doc = await insertDocument({
    checksum: generateChecksum(body.content),
    sourceFile: body.filename,
    title: body.title,
  });

  const chunks = chunkContent(body.content);
  await insertChunks(chunks.map((c, i) => ({
    documentId: doc.id,
    chunkIndex: i,
    content: c,
  })));

  return Response.json({ document_id: doc.id });
}
```

### Example 3: Edge Case (onConflictDoNothing)

```typescript
// When using advanced Drizzle features, validation is still enforced
import { documentInsertSchema } from "@/lib/db/schema/validation";

// Manual validation for advanced operations
const validated = documentInsertSchema.parse({
  checksum: doc.checksum,
  sourceFile: doc.sourceFile,
  title: doc.title,
});

const [existingDoc] = await db
  .insert(documents)
  .values(validated) // Still validated!
  .onConflictDoNothing({ target: documents.checksum })
  .returning();
```

## Acceptance Criteria

- [x] `lib/db/operations.ts` created with validated helpers
- [x] `scripts/seed.ts` uses `insertChunks()` with validation
- [x] Unit tests verify all validation rules
- [x] Embedding dimension validation enforced (1536)
- [x] Error messages are descriptive and actionable
- [ ] CLAUDE.md documents when to use each validation layer
- [ ] All future DB inserts use validated operations

## Approval

This ADR has been reviewed and approved by the engineering team on 2025-10-21.

**Next Steps**:
1. Update CLAUDE.md with validation guidelines
2. Monitor seed script for validation errors
3. Apply pattern to future DB operations
4. Consider ESLint rule for enforcement (post-MVP)
