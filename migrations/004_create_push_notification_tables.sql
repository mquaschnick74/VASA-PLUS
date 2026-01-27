-- Migration: 004_create_push_notification_tables.sql
-- Description: Create tables for push notification device tokens and user preferences
-- Created: 2026-01-27

-- ============================================================================
-- DEVICE TOKENS TABLE
-- Stores device tokens for push notifications (one per device per user)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Device token from APNs/FCM
  token TEXT NOT NULL,

  -- Platform info
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),

  -- Device metadata (optional, for debugging)
  device_model VARCHAR(100),
  os_version VARCHAR(50),
  app_version VARCHAR(20),

  -- Token status
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  failed_delivery_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),

  -- Ensure unique token per user per platform
  UNIQUE(user_id, token)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- USER PUSH NOTIFICATION PREFERENCES TABLE
-- Stores per-user push notification preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_push_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

  -- Global push notification toggle
  push_notifications_enabled BOOLEAN DEFAULT TRUE,

  -- Individual notification type toggles
  session_reminders_enabled BOOLEAN DEFAULT TRUE,
  therapeutic_followups_enabled BOOLEAN DEFAULT TRUE,
  announcements_enabled BOOLEAN DEFAULT TRUE,

  -- Session reminder settings
  reminder_minutes_before INTEGER DEFAULT 30, -- Minutes before scheduled session

  -- Quiet hours (stored as HH:MM in UTC)
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME DEFAULT '22:00:00',
  quiet_hours_end TIME DEFAULT '08:00:00',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_push_prefs_user_id ON user_push_notification_preferences(user_id);

-- ============================================================================
-- SCHEDULED NOTIFICATIONS TABLE (for session reminders)
-- Stores scheduled notifications for later delivery
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification content
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('session_reminder', 'therapeutic_followup', 'announcement')),

  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,

  -- Reference data
  reference_id UUID, -- Can reference a therapeutic_session or other entity
  reference_type VARCHAR(50), -- 'therapeutic_session', 'announcement', etc.

  -- Custom data payload (JSON)
  data JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user_id ON scheduled_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status ON scheduled_notifications(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled_for ON scheduled_notifications(scheduled_for) WHERE status = 'pending';

-- ============================================================================
-- NOTIFICATION HISTORY TABLE (for audit trail)
-- Stores history of sent notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token_id UUID REFERENCES device_tokens(id) ON DELETE SET NULL,

  -- Notification content
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL,

  -- Delivery status
  delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'opened')),

  -- APNs/FCM response data
  apns_id VARCHAR(255), -- APNs unique identifier
  error_code VARCHAR(50),
  error_message TEXT,

  -- Engagement tracking
  opened_at TIMESTAMP WITH TIME ZONE,
  action_taken VARCHAR(50), -- 'dismiss', 'open_app', 'deep_link'

  -- Custom data payload
  data JSONB DEFAULT '{}',

  -- Timestamps
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);

-- ============================================================================
-- RLS POLICIES (if using Supabase RLS)
-- ============================================================================

-- Device tokens: Users can only access their own tokens
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own device tokens"
  ON device_tokens FOR SELECT
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = device_tokens.user_id));

CREATE POLICY "Users can insert their own device tokens"
  ON device_tokens FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = device_tokens.user_id));

CREATE POLICY "Users can update their own device tokens"
  ON device_tokens FOR UPDATE
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = device_tokens.user_id));

CREATE POLICY "Users can delete their own device tokens"
  ON device_tokens FOR DELETE
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = device_tokens.user_id));

-- Push notification preferences: Users can only access their own preferences
ALTER TABLE user_push_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push preferences"
  ON user_push_notification_preferences FOR SELECT
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = user_push_notification_preferences.user_id));

CREATE POLICY "Users can insert their own push preferences"
  ON user_push_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = user_push_notification_preferences.user_id));

CREATE POLICY "Users can update their own push preferences"
  ON user_push_notification_preferences FOR UPDATE
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = user_push_notification_preferences.user_id));

-- Notification history: Users can only view their own history
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification history"
  ON notification_history FOR SELECT
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = notification_history.user_id));

-- Scheduled notifications: Users can view their own scheduled notifications
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scheduled notifications"
  ON scheduled_notifications FOR SELECT
  USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE id = scheduled_notifications.user_id));

-- Service role has full access (for backend operations)
-- Note: Service role bypasses RLS by default in Supabase
