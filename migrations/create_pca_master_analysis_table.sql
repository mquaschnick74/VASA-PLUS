-- Migration: Create pca_master_analysis table
-- Description: Stores comprehensive PCA/PCP analysis results from Claude API
-- Run this in your Supabase SQL Editor

-- Create the pca_master_analysis table
CREATE TABLE IF NOT EXISTS pca_master_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Analysis metadata
  analysis_id VARCHAR(255) NOT NULL UNIQUE,
  analyzed_sessions JSONB NOT NULL,
  transcript_count INTEGER NOT NULL,

  -- Raw Claude response
  full_analysis TEXT NOT NULL,
  therapeutic_context TEXT NOT NULL,

  -- Extracted structured data
  current_css_stage VARCHAR(50),
  primary_cvdc JSONB,
  register_dominance VARCHAR(20),
  safety_assessment VARCHAR(20),

  -- Meta
  api_tokens_used INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pca_master_analysis_user_id
  ON pca_master_analysis(user_id);

CREATE INDEX IF NOT EXISTS idx_pca_master_analysis_created_at
  ON pca_master_analysis(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pca_master_analysis_analysis_id
  ON pca_master_analysis(analysis_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE pca_master_analysis ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own analyses
CREATE POLICY "Users can view own analyses"
  ON pca_master_analysis
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own analyses
CREATE POLICY "Users can insert own analyses"
  ON pca_master_analysis
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role has full access"
  ON pca_master_analysis
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE pca_master_analysis IS
  'Stores comprehensive PCA/PCP analysis results from Claude API integration';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully created pca_master_analysis table with indexes and RLS policies';
END $$;
