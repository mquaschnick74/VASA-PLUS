-- Ensure idempotency at the database layer for Stripe webhook retries
CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_stripe_event_id_unique_idx
ON stripe_webhook_events (stripe_event_id);
