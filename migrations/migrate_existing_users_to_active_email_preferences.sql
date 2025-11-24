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
  u.id AS user_id,
  true AS weekly_recap_enabled,  -- Active by default
  'sarah' AS preferred_meditation_voice,
  '{"used": [], "available": ["campfire", "ocean", "singing_bowl"]}'::jsonb AS meditation_rotation_state,
  NOW() AS created_at,
  NOW() AS updated_at
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

-- Verify the migration
-- Uncomment the line below to check the results:
-- SELECT COUNT(*) as total_users_with_active_emails FROM user_email_preferences WHERE weekly_recap_enabled = true;
