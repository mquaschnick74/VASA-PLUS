-- ================================================================================
-- FIX USER SUBSCRIPTION - SIMPLE VERSION
-- ================================================================================
-- User: b7b65e58-f98a-43de-b7ed-8268bb345944
-- Stripe Customer: cus_THkr3xhcP3F0cy
--
-- BEFORE RUNNING:
-- 1. Go to Stripe Dashboard → Customers → cus_THkr3xhcP3F0cy
-- 2. Click on the active subscription
-- 3. Copy the Subscription ID (starts with "sub_")
-- 4. Note the plan tier (intro/plus/pro)
-- 5. Note the "Current period ends" date
--
-- Then replace the values in the UPDATE statement below
-- ================================================================================

-- ================================================================================
-- STEP 1: CHECK CURRENT STATE
-- ================================================================================
\echo '========================================='
\echo 'CURRENT STATE (BEFORE FIX):'
\echo '========================================='

SELECT
  user_id,
  subscription_tier,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  usage_minutes_limit,
  usage_minutes_used,
  current_period_end,
  created_at,
  updated_at
FROM subscriptions
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';

\echo ''

-- ================================================================================
-- STEP 2: FIX THE SUBSCRIPTION
-- ================================================================================
-- ⚠️ IMPORTANT: Replace these values before running:
--    - REPLACE_WITH_SUBSCRIPTION_ID: Get from Stripe (e.g., sub_1ABC123...)
--    - REPLACE_WITH_TIER: 'intro', 'plus', or 'pro'
--    - REPLACE_WITH_MINUTES: 60 (intro), 180 (plus), 600 (pro)
--    - REPLACE_WITH_PERIOD_END: Date from Stripe (e.g., '2025-11-15 12:29:33+00')
-- ================================================================================

UPDATE subscriptions
SET
  stripe_customer_id = 'cus_THkr3xhcP3F0cy',
  stripe_subscription_id = 'REPLACE_WITH_SUBSCRIPTION_ID',  -- ⚠️ GET FROM STRIPE
  subscription_tier = 'REPLACE_WITH_TIER',                   -- ⚠️ intro/plus/pro
  subscription_status = 'active',
  plan_type = 'recurring',
  trial_ends_at = NULL,
  usage_minutes_limit = 60,  -- ⚠️ 60 (intro), 180 (plus), 600 (pro)
  usage_minutes_used = 0,
  current_period_end = 'REPLACE_WITH_PERIOD_END',           -- ⚠️ GET FROM STRIPE
  updated_at = NOW()
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';

-- ================================================================================
-- STEP 3: VERIFY THE FIX
-- ================================================================================
\echo ''
\echo '========================================='
\echo 'NEW STATE (AFTER FIX):'
\echo '========================================='

SELECT
  user_id,
  subscription_tier,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  usage_minutes_limit,
  usage_minutes_used,
  current_period_end,
  created_at,
  updated_at
FROM subscriptions
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';

\echo ''
\echo '✅ Subscription updated successfully!'
\echo ''
\echo 'Verify these fields changed:'
\echo '  - stripe_customer_id: Should be cus_THkr3xhcP3F0cy'
\echo '  - stripe_subscription_id: Should be sub_...'
\echo '  - subscription_tier: Should be intro/plus/pro'
\echo '  - subscription_status: Should be active'
\echo '  - updated_at: Should be current timestamp'
\echo ''
