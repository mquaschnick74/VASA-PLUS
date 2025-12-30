-- ============================================================================
-- iVASA Knowledge Retrieval: match_knowledge_chunks RPC Function
-- ============================================================================
-- This function performs vector similarity search on the knowledge_chunks table
-- using pgvector's cosine distance operator.
--
-- IMPORTANT: Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================================

-- Drop existing function if it exists (allows re-running this script)
DROP FUNCTION IF EXISTS match_knowledge_chunks(vector(1536), float, int, text[], text[]);

-- Create the vector similarity search function
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_types text[] DEFAULT NULL,
  filter_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.metadata,
    -- Cosine similarity: 1 - cosine_distance
    -- pgvector's <=> operator returns cosine distance (0 = identical, 2 = opposite)
    (1 - (kc.embedding <=> query_embedding))::float AS similarity
  FROM
    public.knowledge_chunks kc
  WHERE
    -- Filter by similarity threshold
    (1 - (kc.embedding <=> query_embedding)) >= match_threshold
    -- Filter by document type if provided
    AND (
      filter_types IS NULL
      OR kc.metadata->>'type' = ANY(filter_types)
    )
    -- Filter by tags if provided (check if ANY tag matches)
    AND (
      filter_tags IS NULL
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(kc.metadata->'tags') AS tag
        WHERE tag = ANY(filter_tags)
      )
    )
  ORDER BY
    kc.embedding <=> query_embedding ASC  -- Most similar first (lowest distance)
  LIMIT
    match_count;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector(1536), float, int, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector(1536), float, int, text[], text[]) TO service_role;

-- ============================================================================
-- VERIFICATION QUERY (run after creating the function)
-- ============================================================================
-- This query checks if the function was created successfully:
--
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_name = 'match_knowledge_chunks';
--
-- Expected result: One row with routine_name = 'match_knowledge_chunks'
-- ============================================================================
