-- Migration: Add Inner Landscape Assessment fields to user_profiles
-- Created: 2025-11-08

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assessment_responses JSONB,
ADD COLUMN IF NOT EXISTS inner_landscape_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS assessment_insights TEXT;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.assessment_completed_at IS 'Timestamp when user completed the Inner Landscape Assessment';
COMMENT ON COLUMN user_profiles.assessment_responses IS 'JSON object containing all 5 question responses from the assessment';
COMMENT ON COLUMN user_profiles.inner_landscape_type IS 'The anxiety pattern/type identified from the assessment';
COMMENT ON COLUMN user_profiles.assessment_insights IS 'Summary insights and recommendations from the assessment';
