-- Migration: Therapist-Client Disconnect and Archive
-- Description: Adds columns for relationship termination, client session archival,
--              and therapist account archival support.
-- Date: 2026-02-11

-- ============================================================================
-- 1a. Add termination columns to therapist_client_relationships
-- ============================================================================
ALTER TABLE therapist_client_relationships
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminated_by VARCHAR(50),
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS relationship_end_date TIMESTAMPTZ;

COMMENT ON COLUMN therapist_client_relationships.terminated_at IS 'Timestamp when the relationship was terminated';
COMMENT ON COLUMN therapist_client_relationships.terminated_by IS 'Who initiated: therapist_initiated or client_requested';
COMMENT ON COLUMN therapist_client_relationships.termination_reason IS 'Required reason for HIPAA audit trail';
COMMENT ON COLUMN therapist_client_relationships.relationship_end_date IS 'Cutoff date: therapist can only see sessions before this date';

-- ============================================================================
-- 1b. Add archival columns to user_profiles
-- ============================================================================
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.account_status IS 'active or archived';
COMMENT ON COLUMN user_profiles.archived_at IS 'When the account was archived';
COMMENT ON COLUMN user_profiles.archive_expires_at IS '7 years from archived_at for clinical record retention';

-- ============================================================================
-- 1c. Create archived_client_sessions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS archived_client_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES therapist_client_relationships(id),

  -- Client identity snapshot (preserved even after client deletes their account)
  original_client_id UUID NOT NULL, -- DO NOT add FK — client may be deleted later
  client_email VARCHAR(255) NOT NULL,
  client_full_name VARCHAR(255),

  -- Session data snapshot
  call_id TEXT,
  session_date TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 0,
  agent_name VARCHAR(50),
  summary_content TEXT,
  transcript_text TEXT,

  -- Metadata
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_sessions_therapist ON archived_client_sessions(therapist_id);
CREATE INDEX IF NOT EXISTS idx_archived_sessions_relationship ON archived_client_sessions(relationship_id);
CREATE INDEX IF NOT EXISTS idx_archived_sessions_client ON archived_client_sessions(original_client_id);

-- ============================================================================
-- 1d. RLS for archived_client_sessions
-- ============================================================================
ALTER TABLE archived_client_sessions ENABLE ROW LEVEL SECURITY;

-- Therapists can only read their own archived sessions
DROP POLICY IF EXISTS "Therapists can read own archived sessions" ON archived_client_sessions;
CREATE POLICY "Therapists can read own archived sessions"
  ON archived_client_sessions FOR SELECT
  USING (
    therapist_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Service role (backend) can insert archived sessions
DROP POLICY IF EXISTS "Service role can insert archived sessions" ON archived_client_sessions;
CREATE POLICY "Service role can insert archived sessions"
  ON archived_client_sessions FOR INSERT
  WITH CHECK (true);

-- Service role (backend) can select archived sessions
DROP POLICY IF EXISTS "Service role can select archived sessions" ON archived_client_sessions;
CREATE POLICY "Service role can select archived sessions"
  ON archived_client_sessions FOR SELECT
  USING (true);
