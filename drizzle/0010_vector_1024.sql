-- Switch embedding column from vector(1536) to vector(1024) to match Jina v3 max dimensions
-- Drop existing column (no embeddings stored yet) and recreate with correct size
ALTER TABLE abstraction_profiles DROP COLUMN IF EXISTS embedding;
ALTER TABLE abstraction_profiles ADD COLUMN embedding vector(1024);
