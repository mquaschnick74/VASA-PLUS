-- Migration: Add upload analysis support
-- Description: Adds columns to support the "Analyze" vs "Add to Record" upload paths
-- and stores upload analysis metadata in therapeutic_context
--
-- Run this in your Supabase SQL Editor
--
-- Changes:
-- 1. user_content.analysis_mode - User's choice at upload time ('analyze' or 'record')
-- 2. therapeutic_context.metadata - JSONB column for upload analysis metadata
--    (source_content_id, analysis_status, addressed_in_session, key_quotes)

-- ============================================
-- PART 1: Add analysis_mode to user_content
-- ============================================

-- Check if column exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_content' AND column_name = 'analysis_mode'
  ) THEN
    ALTER TABLE user_content
    ADD COLUMN analysis_mode TEXT DEFAULT 'record'
    CHECK (analysis_mode IN ('analyze', 'record'));

    RAISE NOTICE 'Added analysis_mode column to user_content table';
  ELSE
    RAISE NOTICE 'analysis_mode column already exists in user_content table';
  END IF;
END $$;

-- Create index for querying by analysis_mode
CREATE INDEX IF NOT EXISTS idx_user_content_analysis_mode
  ON user_content(analysis_mode);

-- ============================================
-- PART 2: Add metadata JSONB to therapeutic_context
-- ============================================

-- Check if column exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'therapeutic_context' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE therapeutic_context
    ADD COLUMN metadata JSONB DEFAULT '{}';

    RAISE NOTICE 'Added metadata column to therapeutic_context table';
  ELSE
    RAISE NOTICE 'metadata column already exists in therapeutic_context table';
  END IF;
END $$;

-- Create GIN index for JSONB queries (efficient for contains/exists checks)
CREATE INDEX IF NOT EXISTS idx_therapeutic_context_metadata
  ON therapeutic_context USING GIN (metadata);

-- Create index for querying upload analyses specifically
CREATE INDEX IF NOT EXISTS idx_therapeutic_context_upload_analysis
  ON therapeutic_context(user_id, context_type, created_at DESC)
  WHERE context_type = 'upload_analysis';

-- ============================================
-- PART 3: Add helper function to get unaddressed uploads
-- ============================================

-- Function to get unaddressed upload analyses for a user
-- Returns upload analyses that haven't been discussed in session yet
CREATE OR REPLACE FUNCTION get_unaddressed_upload_analyses(
  p_user_id UUID,
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  age_days INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.content,
    tc.metadata,
    tc.created_at,
    EXTRACT(DAY FROM (NOW() - tc.created_at))::INT as age_days
  FROM therapeutic_context tc
  WHERE tc.user_id = p_user_id
    AND tc.context_type = 'upload_analysis'
    AND (tc.metadata->>'addressed_in_session')::boolean IS NOT TRUE
  ORDER BY tc.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_unaddressed_upload_analyses(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unaddressed_upload_analyses(UUID, INT) TO service_role;

-- ============================================
-- PART 4: Add function to mark upload as addressed
-- ============================================

-- Function to mark an upload analysis as addressed in session
CREATE OR REPLACE FUNCTION mark_upload_addressed(
  p_context_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE therapeutic_context
  SET metadata = metadata || '{"addressed_in_session": true}'::jsonb
  WHERE id = p_context_id
    AND user_id = p_user_id
    AND context_type = 'upload_analysis';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION mark_upload_addressed(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_upload_addressed(UUID, UUID) TO service_role;

-- ============================================
-- VERIFICATION
-- ============================================

-- Success message and verification
DO $$
DECLARE
  user_content_col_exists BOOLEAN;
  therapeutic_context_col_exists BOOLEAN;
BEGIN
  -- Check user_content.analysis_mode
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_content' AND column_name = 'analysis_mode'
  ) INTO user_content_col_exists;

  -- Check therapeutic_context.metadata
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'therapeutic_context' AND column_name = 'metadata'
  ) INTO therapeutic_context_col_exists;

  IF user_content_col_exists AND therapeutic_context_col_exists THEN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '   - user_content.analysis_mode: EXISTS';
    RAISE NOTICE '   - therapeutic_context.metadata: EXISTS';
    RAISE NOTICE '   - get_unaddressed_upload_analyses(): CREATED';
    RAISE NOTICE '   - mark_upload_addressed(): CREATED';
  ELSE
    RAISE WARNING '⚠️ Migration may have issues:';
    RAISE WARNING '   - user_content.analysis_mode: %', CASE WHEN user_content_col_exists THEN 'EXISTS' ELSE 'MISSING' END;
    RAISE WARNING '   - therapeutic_context.metadata: %', CASE WHEN therapeutic_context_col_exists THEN 'EXISTS' ELSE 'MISSING' END;
  END IF;
END $$;

-- ============================================
-- DOCUMENTATION
-- ============================================

COMMENT ON COLUMN user_content.analysis_mode IS
  'User choice at upload time: "analyze" triggers PCA analysis, "record" stores as-is for background context';

COMMENT ON COLUMN therapeutic_context.metadata IS
  'JSONB metadata for flexible context storage. For upload_analysis type: {source_content_id, analysis_status, addressed_in_session, key_quotes}';

COMMENT ON FUNCTION get_unaddressed_upload_analyses(UUID, INT) IS
  'Returns upload analyses that have not been discussed in session yet, ordered by most recent first';

COMMENT ON FUNCTION mark_upload_addressed(UUID, UUID) IS
  'Marks an upload analysis as having been addressed in a therapy session';
