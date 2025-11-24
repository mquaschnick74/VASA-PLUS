-- Migration: Set email preferences to Active for all existing users
-- Run this in your Supabase SQL Editor
-- Description: This migration ensures all existing users have email preferences
-- with weekly_recap_enabled set to true (Active)

-- Step 1: Insert email preferences for users who don't have them yet
INSERT INTO user_email_preferences (
  user_id,
  weekly_recap_enabled,
  preferred_meditation_voice,
  meditation_rotation_state,
  created_at,
  updated_at
)
SELECT
  u.id,
  true,
  'sarah',
  '{"used": [], "available": ["campfire", "ocean", "singing_bowl"]}'::jsonb,
  NOW(),
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM user_email_preferences uep
  WHERE uep.user_id = u.id
);

-- Step 2: Update existing email preferences to set weekly_recap_enabled to true
UPDATE user_email_preferences
SET
  weekly_recap_enabled = true,
  updated_at = NOW()
WHERE weekly_recap_enabled = false OR weekly_recap_enabled IS NULL;
