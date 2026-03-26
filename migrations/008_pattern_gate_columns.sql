-- Pattern gate columns on subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pattern_gate_fired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pattern_gate_description text,
  ADD COLUMN IF NOT EXISTS pattern_gate_fired_at timestamptz;

-- Index for fast lookup when Stripe webhook fires
CREATE INDEX IF NOT EXISTS idx_subscriptions_pattern_gate
  ON subscriptions (user_id, pattern_gate_fired);
