-- Query Stripe Webhook Events for Debugging
-- Check if webhooks were received for a specific customer

-- ================================================================================
-- STEP 1: Check all webhook events for customer cus_THkr3xhcP3F0cy
-- ================================================================================
SELECT
  id,
  stripe_event_id,
  event_type,
  processing_status,
  error_message,
  stripe_customer_id,
  user_id,
  created_at,
  processed_at
FROM stripe_webhook_events
WHERE stripe_customer_id = 'cus_THkr3xhcP3F0cy'
ORDER BY created_at DESC;

-- ================================================================================
-- STEP 2: Check all webhook events for user b7b65e58-f98a-43de-b7ed-8268bb345944
-- ================================================================================
SELECT
  id,
  stripe_event_id,
  event_type,
  processing_status,
  error_message,
  stripe_customer_id,
  user_id,
  created_at,
  processed_at
FROM stripe_webhook_events
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944'
ORDER BY created_at DESC;

-- ================================================================================
-- STEP 3: Check for checkout.session.completed events around the subscription creation time
-- ================================================================================
-- Subscription was created at 2025-10-15 12:29:33
SELECT
  id,
  stripe_event_id,
  event_type,
  processing_status,
  error_message,
  stripe_customer_id,
  user_id,
  event_data->>'id' as session_id,
  event_data->'data'->'object'->>'customer' as customer_from_event,
  event_data->'data'->'object'->>'client_reference_id' as client_ref_id,
  created_at,
  processed_at
FROM stripe_webhook_events
WHERE event_type = 'checkout.session.completed'
  AND created_at BETWEEN '2025-10-15 12:00:00' AND '2025-10-15 13:00:00'
ORDER BY created_at DESC;

-- ================================================================================
-- STEP 4: Check ALL webhook events around that time
-- ================================================================================
SELECT
  id,
  stripe_event_id,
  event_type,
  processing_status,
  error_message,
  stripe_customer_id,
  user_id,
  created_at,
  processed_at
FROM stripe_webhook_events
WHERE created_at BETWEEN '2025-10-15 12:00:00' AND '2025-10-15 13:00:00'
ORDER BY created_at DESC;

-- ================================================================================
-- STEP 5: Check for failed webhooks
-- ================================================================================
SELECT
  id,
  stripe_event_id,
  event_type,
  processing_status,
  error_message,
  stripe_customer_id,
  user_id,
  retry_count,
  created_at,
  processed_at
FROM stripe_webhook_events
WHERE processing_status = 'failed'
ORDER BY created_at DESC
LIMIT 20;

-- ================================================================================
-- STEP 6: Get summary of webhook events
-- ================================================================================
SELECT
  event_type,
  processing_status,
  COUNT(*) as count,
  MAX(created_at) as last_received
FROM stripe_webhook_events
GROUP BY event_type, processing_status
ORDER BY last_received DESC;

-- ================================================================================
-- NOTES
-- ================================================================================
-- If the stripe_webhook_events table doesn't exist yet:
-- 1. Run the database migration to create the table (see shared/schema.ts)
-- 2. The table will only contain events received AFTER it was created
-- 3. For historical events, check:
--    - Stripe Dashboard → Developers → Webhooks → Click your endpoint
--    - Look for events around 2025-10-15 12:29:33
--    - Check if they were delivered successfully or failed
--
-- If no rows are returned for this customer:
-- - The webhook was likely never received by the server
-- - Check Stripe webhook configuration
-- - Verify the endpoint URL is correct
-- - Check if webhook secret matches
-- ================================================================================
