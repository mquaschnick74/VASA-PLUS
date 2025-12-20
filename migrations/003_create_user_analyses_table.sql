-- Migration: Create user_analyses table
-- Description: Stores all user analysis results (session_summary, intent_analysis, concept_insights, pca_master)
-- This makes all analysis types persistent instead of ephemeral

-- Create the user_analyses table
CREATE TABLE IF NOT EXISTS user_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Analysis metadata
  analysis_type VARCHAR(50) NOT NULL,  -- session_summary, intent_analysis, concept_insights, pca_master
  analyzed_sessions JSONB NOT NULL,    -- Array of call_ids that were analyzed
  session_count INTEGER NOT NULL DEFAULT 1,

  -- Analysis content
  content TEXT NOT NULL,               -- The full analysis result

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),

  -- Constraint to ensure valid analysis types
  CONSTRAINT valid_analysis_type CHECK (
    analysis_type IN ('session_summary', 'intent_analysis', 'concept_insights', 'pca_master')
  )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_analyses_user_id
  ON user_analyses(user_id);

CREATE INDEX IF NOT EXISTS idx_user_analyses_created_at
  ON user_analyses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_analyses_type
  ON user_analyses(user_id, analysis_type);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own analyses
CREATE POLICY "Users can view own analyses"
  ON user_analyses
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own analyses
CREATE POLICY "Users can insert own analyses"
  ON user_analyses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own analyses
CREATE POLICY "Users can delete own analyses"
  ON user_analyses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role has full access"
  ON user_analyses
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE user_analyses IS
  'Stores all user analysis results - making session_summary, intent_analysis, concept_insights, and pca_master persistent';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully created user_analyses table with indexes and RLS policies';
END $$;
