-- ================================================================================
-- CREATE STRIPE WEBHOOK EVENTS TABLE
-- ================================================================================
-- This table stores all Stripe webhook events for audit trail and debugging
-- Run this with: psql $DATABASE_URL -f scripts/create-webhook-events-table.sql
-- ================================================================================

-- Create the table
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR UNIQUE,                -- Stripe's event ID (evt_...)
  event_type VARCHAR(100) NOT NULL,              -- e.g., "checkout.session.completed"
  event_data JSONB NOT NULL,                     -- Full event payload from Stripe
  processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'success', 'failed', 'retrying'
  error_message TEXT,                            -- Error details if processing failed
  retry_count INTEGER DEFAULT 0,                 -- How many times we've retried
  user_id UUID REFERENCES users(id),             -- Extracted user_id if available
  stripe_customer_id VARCHAR,                    -- Extracted customer_id if available
  processed_at TIMESTAMP WITH TIME ZONE,         -- When processing completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() -- When webhook was received
);

-- ================================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ================================================================================

-- Index on stripe_event_id for quick lookup and deduplication
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_stripe_event_id
  ON stripe_webhook_events(stripe_event_id);

-- Index on event_type for filtering by webhook type
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type
  ON stripe_webhook_events(event_type);

-- Index on processing_status for finding failed webhooks
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processing_status
  ON stripe_webhook_events(processing_status);

-- Index on user_id for finding all webhooks for a user
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_user_id
  ON stripe_webhook_events(user_id);

-- Index on stripe_customer_id for finding all webhooks for a customer
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_stripe_customer_id
  ON stripe_webhook_events(stripe_customer_id);

-- Index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
  ON stripe_webhook_events(created_at DESC);

-- Composite index for failed webhook queries
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_created
  ON stripe_webhook_events(processing_status, created_at DESC);

-- ================================================================================
-- GRANT PERMISSIONS (if using RLS)
-- ================================================================================
-- Uncomment if you're using Row Level Security on Supabase
-- ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- ================================================================================
-- VERIFICATION QUERY
-- ================================================================================
-- Check that the table was created successfully
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'stripe_webhook_events'
ORDER BY ordinal_position;

-- ================================================================================
-- SUCCESS MESSAGE
-- ================================================================================
\echo '✅ stripe_webhook_events table created successfully!'
\echo ''
\echo 'You can now:'
\echo '  1. Deploy the updated webhook code'
\echo '  2. Query webhook events with: psql $DATABASE_URL -f scripts/check-webhook-logs.sql'
\echo '  3. Monitor failed webhooks with:'
\echo '     SELECT * FROM stripe_webhook_events WHERE processing_status = '\''failed'\'';'
\echo ''
