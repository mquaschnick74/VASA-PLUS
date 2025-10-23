# Quick Fix Guide - Subscription Update Failure

## User Info
- **User ID:** `b7b65e58-f98a-43de-b7ed-8268bb345944`
- **Stripe Customer ID:** `cus_THkr3xhcP3F0cy`
- **Problem:** Subscription didn't update after payment

---

## Option 1: Manual SQL Fix (5 minutes)

### Step 1: Get Values from Stripe Dashboard

1. Go to: https://dashboard.stripe.com/customers/cus_THkr3xhcP3F0cy
2. You should see their active subscription
3. Click on the subscription to view details
4. Note these values:

```
Subscription ID: sub_________________  ← Copy this
Plan/Product: _____________ (Basic/Premium/Intro/Plus/Pro)
Current period ends: ____/____/______ at __:__
```

### Step 2: Map Values

Based on the plan, use these values:

| Plan Name | `subscription_tier` | `usage_minutes_limit` |
|-----------|--------------------|-----------------------|
| Intro     | `'intro'`          | `60`                  |
| Plus      | `'plus'`           | `180`                 |
| Pro       | `'pro'`            | `600`                 |
| Basic (Therapist) | `'basic'`  | `180`                 |
| Premium (Therapist) | `'premium'` | `600`              |

### Step 3: Edit the SQL File

Open `scripts/fix-user-subscription-simple.sql` and replace:

```sql
-- REPLACE THESE 4 VALUES:

stripe_subscription_id = 'sub_YOUR_VALUE_HERE',  -- From Step 1
subscription_tier = 'intro',                      -- From Step 2
usage_minutes_limit = 60,                         -- From Step 2
current_period_end = '2025-11-15 12:29:33+00',   -- From Step 1 (convert to timestamp)
```

**Example:**
If Stripe shows:
- Subscription ID: `sub_1SGAbc123xyz`
- Plan: "Plus"
- Period ends: Nov 15, 2025 at 12:29 PM UTC

Then use:
```sql
stripe_subscription_id = 'sub_1SGAbc123xyz',
subscription_tier = 'plus',
usage_minutes_limit = 180,
current_period_end = '2025-11-15 12:29:33+00',
```

### Step 4: Run the SQL

```bash
psql $DATABASE_URL -f scripts/fix-user-subscription-simple.sql
```

### Step 5: Verify

The script will show BEFORE and AFTER state. Verify:
- ✅ `stripe_customer_id`: `cus_THkr3xhcP3F0cy`
- ✅ `stripe_subscription_id`: `sub_...` (the value you entered)
- ✅ `subscription_tier`: The tier you selected
- ✅ `subscription_status`: `active`
- ✅ `updated_at`: Current timestamp

---

## Option 2: Copy-Paste SQL (1 minute)

If you just want to run something NOW, here's a ready-to-run example.
**You MUST replace the placeholder values with real ones from Stripe!**

```sql
-- Quick fix - REPLACE THE PLACEHOLDER VALUES
UPDATE subscriptions
SET
  stripe_customer_id = 'cus_THkr3xhcP3F0cy',
  stripe_subscription_id = 'sub_PASTE_FROM_STRIPE',  -- ⚠️ REQUIRED
  subscription_tier = 'intro',                        -- ⚠️ Change if needed
  subscription_status = 'active',
  plan_type = 'recurring',
  trial_ends_at = NULL,
  usage_minutes_limit = 60,                          -- ⚠️ Change if needed
  usage_minutes_used = 0,
  current_period_end = '2025-11-15 12:29:33+00',     -- ⚠️ REQUIRED
  updated_at = NOW()
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';

-- Verify it worked
SELECT
  subscription_tier,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  usage_minutes_limit,
  current_period_end
FROM subscriptions
WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';
```

Save this to a file and run:
```bash
psql $DATABASE_URL -f your-file.sql
```

---

## Option 3: One-Line psql (30 seconds)

Replace `sub_XXX`, `intro`, `60`, and the date, then run:

```bash
psql $DATABASE_URL -c "UPDATE subscriptions SET stripe_customer_id = 'cus_THkr3xhcP3F0cy', stripe_subscription_id = 'sub_PASTE_HERE', subscription_tier = 'intro', subscription_status = 'active', plan_type = 'recurring', trial_ends_at = NULL, usage_minutes_limit = 60, usage_minutes_used = 0, current_period_end = '2025-11-15 12:29:33+00', updated_at = NOW() WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';"
```

Then verify:
```bash
psql $DATABASE_URL -c "SELECT subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id FROM subscriptions WHERE user_id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';"
```

---

## After Running the Fix

1. **User sees updated subscription immediately** - The UI updates via Supabase realtime
2. **User can now access billing portal** - "Manage Subscription" button will work
3. **Usage tracking works** - Minutes will be tracked correctly
4. **No further action needed** - Unless you want to investigate why webhook failed

---

## Create the Webhook Events Table

This enables better debugging for future webhook failures:

```bash
psql $DATABASE_URL -f scripts/create-webhook-events-table.sql
```

This is optional but **highly recommended** for monitoring.

---

## Quick Commands Summary

```bash
# 1. Create webhook events table (optional but recommended)
psql $DATABASE_URL -f scripts/create-webhook-events-table.sql

# 2. Fix the user's subscription (edit the file first!)
psql $DATABASE_URL -f scripts/fix-user-subscription-simple.sql

# 3. Check webhook logs (after deploying new code)
psql $DATABASE_URL -f scripts/check-webhook-logs.sql
```

---

## What Values You Need from Stripe

1. **Subscription ID** (required): `sub_...`
   - Location: Dashboard → Customers → cus_THkr3xhcP3F0cy → Click subscription

2. **Tier** (required): `intro`, `plus`, `pro`, `basic`, or `premium`
   - Map from the product name in Stripe

3. **Minutes Limit** (required): `60`, `180`, or `600`
   - Depends on tier (see table above)

4. **Current Period End** (required): Timestamp
   - Location: Same subscription page
   - Format: `'2025-11-15 12:29:33+00'`
   - Convert from displayed date/time

---

## Troubleshooting

### "Column 'stripe_customer_id' does not exist"
The subscriptions table might have different column names. Check schema:
```bash
psql $DATABASE_URL -c "\d subscriptions"
```

### "User not found"
Verify the user ID is correct:
```bash
psql $DATABASE_URL -c "SELECT id, email FROM user_profiles WHERE id = 'b7b65e58-f98a-43de-b7ed-8268bb345944';"
```

### "Timestamp format error"
Use this format exactly: `'YYYY-MM-DD HH:MM:SS+00'`
Example: `'2025-11-15 12:29:33+00'`

### "Permission denied"
Make sure you're using the correct database connection string with write permissions.

---

## Need Help?

Check the full investigation report:
- `scripts/SUBSCRIPTION_FIX_INVESTIGATION.md`

Or contact the team with:
- User ID: `b7b65e58-f98a-43de-b7ed-8268bb345944`
- Stripe Customer ID: `cus_THkr3xhcP3F0cy`
- Error message from the SQL execution
