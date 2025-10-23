-- Manual Subscription Fix for User: b7b65e58-f98a-43de-b7ed-8268bb345944
-- Stripe Customer: cus_THkr3xhcP3F0cy
-- Issue: Subscription did not update after upgrade (webhook likely failed)
-- Date: 2025-10-23

-- ================================================================================
-- STEP 1: GATHER INFORMATION FROM STRIPE
-- ================================================================================
-- Before running this script, get the following from Stripe Dashboard:
-- 1. Go to: Stripe Dashboard → Customers → Search for "cus_THkr3xhcP3F0cy"
-- 2. Find the active subscription and note:
--    - Subscription ID (sub_...)
--    - Plan/Product name (Intro/Plus/Pro)
--    - Current period end date
--    - Price ID and amount
--
-- UPDATE THE VARIABLES BELOW:
-- ================================================================================

-- REPLACE THESE VALUES WITH ACTUAL DATA FROM STRIPE:
\set stripe_subscription_id 'sub_XXXXXX'              -- e.g., 'sub_1SG123...'
\set subscription_tier 'intro'                         -- Options: 'intro', 'plus', 'pro'
\set usage_minutes_limit 60                            -- 60 for intro, 180 for plus, 600 for pro
\set current_period_end '2025-11-15 12:29:33+00'      -- Get from Stripe subscription

-- ================================================================================
-- STEP 2: VERIFY CURRENT STATE (READ-ONLY)
-- ================================================================================
-- Check current subscription state before making changes
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

-- Expected output:
-- stripe_customer_id: null
-- stripe_subscription_id: null
-- subscription_tier: trial
-- subscription_status: trialing

-- ================================================================================
-- STEP 3: FIX THE SUBSCRIPTION
-- ================================================================================
-- This will update the subscription record with the correct Stripe data

UPDATE subscriptions
SET
  stripe_customer_id = 'cus_THkr3xhcP3F0cy',
  stripe_subscription_id = :'stripe_subscription_id',
  subscription_tier = :'subscription_tier',
  subscription_status = 'active',
  plan_type = 'recurring',
  trial_ends_at = NULL,  -- Clear trial since they paid
  usage_minutes_limit = :usage_minutes_limit,
  usage_minutes_used = 0,  -- Reset to 0 for fresh billing period
  current_period_end = :'current_period_end',
  updated_at = NOW()
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';

-- ================================================================================
-- STEP 4: VERIFY THE FIX (READ-ONLY)
-- ================================================================================
-- Check that subscription was updated correctly
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

-- Expected output:
-- stripe_customer_id: cus_THkr3xhcP3F0cy
-- stripe_subscription_id: sub_... (the value you set)
-- subscription_tier: intro/plus/pro (the value you set)
-- subscription_status: active
-- usage_minutes_used: 0
-- updated_at: (current timestamp)

-- ================================================================================
-- STEP 5: CHECK USER PROFILE
-- ================================================================================
-- Verify the user exists and check their type
SELECT
  id,
  email,
  user_type,
  promo_code,
  promo_discount_expires_at
FROM user_profiles
WHERE id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';

-- ================================================================================
-- ALTERNATIVE: If you need to use direct values (without psql variables)
-- ================================================================================
-- Uncomment and modify the section below if running directly:

/*
UPDATE subscriptions
SET
  stripe_customer_id = 'cus_THkr3xhcP3F0cy',
  stripe_subscription_id = 'sub_REPLACE_WITH_ACTUAL_SUB_ID',  -- Get from Stripe
  subscription_tier = 'intro',  -- Replace with: 'intro', 'plus', or 'pro'
  subscription_status = 'active',
  plan_type = 'recurring',
  trial_ends_at = NULL,
  usage_minutes_limit = 60,  -- Replace with: 60 (intro), 180 (plus), 600 (pro)
  usage_minutes_used = 0,
  current_period_end = '2025-11-15 12:29:33+00',  -- Replace with actual date from Stripe
  updated_at = NOW()
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';
*/

-- ================================================================================
-- NOTES
-- ================================================================================
-- Tier to Minutes Mapping (Individual Users):
--   - intro: 60 minutes
--   - plus: 180 minutes
--   - pro: 600 minutes
--
-- Tier to Minutes Mapping (Therapists):
--   - basic: 180 minutes (3 hours)
--   - premium: 600 minutes (10 hours)
--
-- After running this fix:
-- 1. User should be able to access billing portal via "Manage Subscription" button
-- 2. Usage tracking will work correctly
-- 3. Subscription status will show as "Active" in the UI
-- 4. The user's Supabase realtime subscription will update the UI automatically
-- ================================================================================
