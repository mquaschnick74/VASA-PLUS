-- Migration: Create user_analyses table for storing all analysis types
-- This table supports: session_summary, intent_analysis, concept_insights, and pca_master

-- Create user_analyses table
CREATE TABLE IF NOT EXISTS user_analyses (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,  -- 'session_summary', 'intent_analysis', 'concept_insights', 'pca_master'
  content TEXT,                         -- NULL for pca_master (agent-only)
  analyzed_sessions JSONB NOT NULL,     -- Array of call_ids that were analyzed
  session_count INTEGER NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_user_analyses_user_id ON user_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analyses_type ON user_analyses(analysis_type);
CREATE INDEX IF NOT EXISTS idx_user_analyses_created ON user_analyses(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own analyses
CREATE POLICY "Users can view own analyses"
  ON user_analyses FOR SELECT
  USING (auth.uid()::text = user_id::text OR auth.role() = 'service_role');

-- Policy: Users can insert their own analyses
CREATE POLICY "Users can insert own analyses"
  ON user_analyses FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text OR auth.role() = 'service_role');

-- Policy: Service role has full access
CREATE POLICY "Service role full access"
  ON user_analyses FOR ALL
  USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE user_analyses IS 'Stores all user-facing analysis types (session_summary, intent_analysis, concept_insights) and agent-only pca_master analyses';
COMMENT ON COLUMN user_analyses.analysis_type IS 'Type of analysis: session_summary, intent_analysis, concept_insights, or pca_master';
COMMENT ON COLUMN user_analyses.content IS 'Full analysis content - NULL for pca_master type which is agent-only';
COMMENT ON COLUMN user_analyses.analyzed_sessions IS 'JSON array of call_ids that were analyzed';
