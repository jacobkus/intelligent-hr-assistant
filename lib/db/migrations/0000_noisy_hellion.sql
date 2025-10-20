-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"section_title" text,
	"embedding" vector(1536),
	CONSTRAINT "chunks_chunk_index_check" CHECK ("chunks"."chunk_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checksum" text NOT NULL,
	"source_file" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_checksum_unique" UNIQUE("checksum")
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_document_id_chunk_index_key" ON "chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_chunks_document_id" ON "chunks" USING btree ("document_id");