-- Migration: Add onboarding feature tables and columns
-- Created: 2025-10-22
-- Description: Adds user_onboarding_responses table and last_onboarding_completed_at column to user_profiles

-- Add last_onboarding_completed_at column to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS last_onboarding_completed_at TIMESTAMPTZ;

-- Create user_onboarding_responses table
CREATE TABLE IF NOT EXISTS user_onboarding_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voice_response TEXT,
  journey_response TEXT,
  was_skipped BOOLEAN DEFAULT false,
  session_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Create index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_user_id ON user_onboarding_responses(user_id);

-- Enable Row Level Security
ALTER TABLE user_onboarding_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own onboarding responses
CREATE POLICY IF NOT EXISTS "Users can view own onboarding responses"
  ON user_onboarding_responses FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own onboarding responses
CREATE POLICY IF NOT EXISTS "Users can insert own onboarding responses"
  ON user_onboarding_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comment the table for documentation
COMMENT ON TABLE user_onboarding_responses IS 'Stores user responses from the onboarding questionnaire shown after consent acceptance';
COMMENT ON COLUMN user_onboarding_responses.voice_response IS 'Response to "Your Voice" questions - what user wants to discuss';
COMMENT ON COLUMN user_onboarding_responses.journey_response IS 'Response to "Your Journey" questions - significant experiences and hopes';
COMMENT ON COLUMN user_onboarding_responses.was_skipped IS 'True if user clicked X button to skip onboarding';
COMMENT ON COLUMN user_onboarding_responses.session_number IS 'Supports showing onboarding multiple times (future feature)';
