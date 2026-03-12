-- Enable pgvector extension (must be done before adding vector columns)
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

-- Add embedding column to abstraction_profiles
ALTER TABLE "abstraction_profiles" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint

-- HNSW index for fast approximate cosine similarity search
-- Builds after data is loaded; concurrent so it doesn't lock the table
CREATE INDEX CONCURRENTLY IF NOT EXISTS "abstraction_profiles_embedding_hnsw"
  ON "abstraction_profiles" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
