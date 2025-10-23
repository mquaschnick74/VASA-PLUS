# Subscription Update Investigation & Fixes

## Issue Summary

**User ID:** `b7b65e58-f98a-43de-b7ed-8268bb345944`
**Stripe Customer ID:** `cus_THkr3xhcP3F0cy`
**Problem:** User's subscription did not update after upgrading
**Date:** 2025-10-15 12:29:33 UTC

### Database State (Before Fix)

```sql
user_id: b7b65e58-f98a-43de-b7ed-8268bb345944
subscription_tier: trial
subscription_status: trialing
stripe_customer_id: NULL  ⚠️ MISSING
stripe_subscription_id: NULL  ⚠️ MISSING
created_at: 2025-10-15 12:29:33.717055+00
updated_at: 2025-10-15 12:29:33.717055+00  ⚠️ NO UPDATE
```

**Key Indicators:**
- ❌ `stripe_customer_id` is NULL (should be `cus_THkr3xhcP3F0cy`)
- ❌ `stripe_subscription_id` is NULL (should have `sub_...` value)
- ❌ `created_at` = `updated_at` (no webhook processing occurred)
- ❌ Still on trial tier/status

---

## Root Cause Analysis

### What Should Have Happened

1. User completes payment on Stripe checkout page
2. Stripe sends `checkout.session.completed` webhook to `/api/stripe/webhook`
3. Webhook handler extracts user ID from `client_reference_id`
4. Handler fetches product metadata for tier and minutes
5. Handler UPSERTS subscription record with:
   - `stripe_customer_id` = session.customer
   - `stripe_subscription_id` = session.subscription
   - `subscription_tier` = tier from metadata
   - `subscription_status` = 'active'
   - `usage_minutes_used` = 0 (reset)
   - `current_period_end` = 30 days from now

### What Actually Happened

The webhook was either:
1. **Never received** - Most likely cause
2. **Signature verification failed**
3. **Missing `client_reference_id`** in checkout session
4. **Database upsert failed** silently

### Evidence

1. **Database unchanged** - `updated_at` timestamp matches `created_at`
2. **No Stripe IDs stored** - Both customer and subscription IDs are NULL
3. **Still on trial** - Tier and status never updated

---

## Probable Causes

### 1. Webhook Not Configured (Most Likely)

**Symptoms:**
- No webhook event received by server
- No console logs showing `💳 Stripe webhook received`
- Stripe Dashboard shows webhook endpoint not configured

**How to Check:**
```
Stripe Dashboard → Developers → Webhooks
- Verify endpoint exists: https://beta.ivasa.ai/api/stripe/webhook
- Check if listening for: checkout.session.completed
- Verify webhook secret matches STRIPE_WEBHOOK_SECRET env var
```

**How to Fix:**
```
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. URL: https://beta.ivasa.ai/api/stripe/webhook
4. Events: Select all checkout and customer.subscription.* events
5. Copy webhook signing secret to STRIPE_WEBHOOK_SECRET env var
6. Restart server
```

### 2. Signature Verification Failed

**Symptoms:**
- Webhook received but returns 400 error
- Console log shows: `⚠️ Stripe webhook signature verification failed`
- Stripe Dashboard shows 400 response

**How to Check:**
```bash
# Check server logs for signature failures
grep "Stripe webhook signature verification failed" server.log
```

**How to Fix:**
```bash
# Ensure STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
# Get correct secret from: Stripe Dashboard → Developers → Webhooks → Click endpoint → Signing secret
```

### 3. Missing client_reference_id

**Symptoms:**
- Webhook received and processed
- Console log shows: `❌ No user_id in checkout session`
- Webhook returns success but does nothing

**How to Check:**
```sql
-- Check webhook events table (after deploying new schema)
SELECT event_data->'data'->'object'->>'client_reference_id' as client_ref
FROM stripe_webhook_events
WHERE stripe_customer_id = 'cus_THkr3xhcP3F0cy'
  AND event_type = 'checkout.session.completed';
```

**How to Fix:**
- Ensure Stripe Pricing Table has `client-reference-id={userId}` attribute
- Ensure `userId` is loaded before rendering pricing table
- For custom checkout, ensure `client_reference_id` is set in session creation

### 4. Database Upsert Failed (Old Code)

**Symptoms:**
- Webhook received and processed
- Console log shows: `❌ Failed to activate subscription`
- Webhook returned success (200) anyway ⚠️ **BUG IN OLD CODE**

**How to Check:**
```sql
-- Check webhook events table
SELECT processing_status, error_message
FROM stripe_webhook_events
WHERE stripe_customer_id = 'cus_THkr3xhcP3F0cy';
```

**How to Fix:**
- **FIXED** in new code - now returns 500 on error so Stripe retries
- Old code incorrectly returned 200 on error

---

## Fixes Implemented

### 1. ✅ Manual SQL Fix Script

**File:** `scripts/fix-subscription-b7b65e58.sql`

**Purpose:** Manually fix this specific user's subscription

**Usage:**
```bash
# 1. Get subscription ID from Stripe
# Go to: Stripe Dashboard → Customers → cus_THkr3xhcP3F0cy
# Copy the subscription ID (sub_...)

# 2. Update the script variables
# Edit: scripts/fix-subscription-b7b65e58.sql
# Set: stripe_subscription_id, subscription_tier, usage_minutes_limit

# 3. Run the script
psql $DATABASE_URL -f scripts/fix-subscription-b7b65e58.sql
```

### 2. ✅ Subscription Sync Endpoint

**File:** `server/routes/stripe-checkout.ts` (new endpoint)

**Purpose:** Fallback mechanism to sync subscription from Stripe when webhooks fail

**Endpoint:** `POST /api/stripe/sync-subscription`

**Usage:**
```typescript
// User calls this from frontend if subscription doesn't update
const response = await fetch('/api/stripe/sync-subscription', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const result = await response.json();
console.log(result); // { success: true, subscription: {...} }
```

**What it does:**
1. Authenticates user
2. Looks up their `stripe_customer_id` from subscriptions table
3. Fetches active subscription from Stripe API
4. Gets product metadata for tier/minutes
5. Updates local database with Stripe data
6. Returns success + subscription details

**When to use:**
- After upgrade if subscription doesn't update within 30 seconds
- After webhook failures
- For debugging/manual sync

### 3. ✅ Improved Webhook Error Handling

**File:** `server/routes/stripe-webhook.ts` (updated)

**Changes:**

#### A. Webhook Event Logging
- **New table:** `stripe_webhook_events` (added to schema.ts)
- Logs ALL webhook events to database
- Tracks processing status: pending → success/failed
- Stores error messages for debugging
- Creates audit trail

**Benefits:**
- Can query which webhooks were received
- Can see which failed and why
- Can manually retry failed webhooks
- Historical record for compliance

#### B. Proper Error Responses
**Old behavior:**
```typescript
if (error) {
  console.error('❌ Failed:', error);
  // ⚠️ Still returns 200 success
} else {
  console.log('✅ Success');
}
```

**New behavior:**
```typescript
if (error) {
  console.error('❌ Failed:', error);
  // Update webhook log as failed
  await updateWebhookLog('failed', error.message);
  // ✅ Return 500 so Stripe retries
  return res.status(500).json({ error: 'Failed to activate subscription' });
} else {
  console.log('✅ Success');
  // Update webhook log as success
  await updateWebhookLog('success');
}
```

**Benefits:**
- Stripe automatically retries failed webhooks (up to 3 days)
- No need for manual intervention on transient errors
- Database records show what failed and when

#### C. Database Schema Addition

**New table:** `stripe_webhook_events`

```sql
CREATE TABLE stripe_webhook_events (
  id UUID PRIMARY KEY,
  stripe_event_id VARCHAR UNIQUE,  -- evt_...
  event_type VARCHAR,               -- checkout.session.completed
  event_data JSONB,                 -- Full event payload
  processing_status VARCHAR,        -- pending, success, failed
  error_message TEXT,               -- Error details if failed
  retry_count INTEGER,              -- How many retries
  user_id UUID,                     -- Extracted user_id
  stripe_customer_id VARCHAR,       -- Extracted customer_id
  processed_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### 4. ✅ Webhook Log Query Script

**File:** `scripts/check-webhook-logs.sql`

**Purpose:** Query webhook events for debugging

**Queries:**
1. All events for specific customer
2. All events for specific user
3. Events around subscription creation time
4. Failed events
5. Summary by event type

**Usage:**
```bash
psql $DATABASE_URL -f scripts/check-webhook-logs.sql
```

---

## Investigation Checklist

### For This Specific User

- [ ] **Check Stripe Dashboard**
  - Go to: Stripe → Customers → `cus_THkr3xhcP3F0cy`
  - Verify subscription exists and is active
  - Copy subscription ID (`sub_...`)
  - Note: tier, price, current period end

- [ ] **Check Stripe Webhooks**
  - Go to: Stripe → Developers → Webhooks → Your endpoint
  - Search for events with customer `cus_THkr3xhcP3F0cy`
  - Check if `checkout.session.completed` was sent
  - Check response code (200, 400, 500)
  - View request/response details

- [ ] **Check Database Webhook Logs** (after migration)
  ```sql
  SELECT * FROM stripe_webhook_events
  WHERE stripe_customer_id = 'cus_THkr3xhcP3F0cy';
  ```

- [ ] **Check Server Logs** (if available)
  ```bash
  # Search for webhook activity around subscription creation time
  grep -A 10 "cus_THkr3xhcP3F0cy" server.log
  grep -A 10 "2025-10-15 12:2" server.log | grep webhook
  ```

- [ ] **Fix the Subscription**
  - Option A: Run manual SQL fix script
  - Option B: Have user call sync endpoint
  - Option C: Manually trigger webhook resend from Stripe

### For Future Prevention

- [ ] **Verify Webhook Configuration**
  - Endpoint URL is correct
  - Webhook secret matches env var
  - All required events are selected
  - Endpoint is accessible from Stripe

- [ ] **Deploy Database Migration**
  ```bash
  # Run migration to create stripe_webhook_events table
  npm run migrate
  ```

- [ ] **Deploy Code Changes**
  - Improved webhook error handling
  - Webhook event logging
  - Subscription sync endpoint

- [ ] **Monitor Webhook Health**
  ```sql
  -- Daily check for failed webhooks
  SELECT COUNT(*) as failed_count
  FROM stripe_webhook_events
  WHERE processing_status = 'failed'
    AND created_at > NOW() - INTERVAL '24 hours';
  ```

- [ ] **Set Up Alerts**
  - Alert on webhook failures
  - Alert on subscription update failures
  - Alert on missing customer IDs

---

## Testing the Fix

### Test Webhook Locally

```bash
# 1. Install Stripe CLI
stripe login

# 2. Forward webhooks to local server
stripe listen --forward-to http://localhost:5000/api/stripe/webhook

# 3. Trigger test checkout.session.completed event
stripe trigger checkout.session.completed

# 4. Check console output for:
# ✅ "💳 Stripe webhook received: checkout.session.completed"
# ✅ "✅ Activated ... subscription for user ..."
```

### Test Sync Endpoint

```bash
# 1. Get user's access token
# 2. Call sync endpoint
curl -X POST http://localhost:5000/api/stripe/sync-subscription \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "success": true,
  "message": "Subscription synced successfully",
  "subscription": {
    "tier": "intro",
    "status": "active",
    "stripe_subscription_id": "sub_...",
    "stripe_customer_id": "cus_...",
    "current_period_end": "2025-11-15T12:29:33.000Z"
  }
}
```

---

## Recommendations

### Immediate Actions

1. **Fix this user's subscription** - Run SQL script or sync endpoint
2. **Check Stripe webhook configuration** - Ensure it's set up correctly
3. **Deploy code fixes** - Improved error handling + event logging
4. **Run database migration** - Create webhook events table

### Short-term (This Week)

1. **Audit all subscriptions** - Find other users with missing Stripe IDs
2. **Check Stripe webhook logs** - Identify other failed webhooks
3. **Set up monitoring** - Alert on webhook failures
4. **Document webhook setup** - For future deployments

### Long-term (This Month)

1. **Add frontend fallback** - Auto-call sync endpoint if subscription doesn't update
2. **Add admin panel** - View/retry failed webhooks
3. **Add health checks** - Monitor webhook endpoint availability
4. **Add e2e tests** - Test full subscription upgrade flow

---

## Reference Links

- **Stripe Dashboard:** https://dashboard.stripe.com/
- **Stripe Webhooks Docs:** https://stripe.com/docs/webhooks
- **Stripe CLI Docs:** https://stripe.com/docs/stripe-cli
- **Supabase Docs:** https://supabase.com/docs

---

## Files Modified

1. `shared/schema.ts` - Added `stripeWebhookEvents` table
2. `server/routes/stripe-webhook.ts` - Improved error handling + event logging
3. `server/routes/stripe-checkout.ts` - Added sync endpoint
4. `scripts/fix-subscription-b7b65e58.sql` - Manual fix script
5. `scripts/check-webhook-logs.sql` - Query script
6. `scripts/SUBSCRIPTION_FIX_INVESTIGATION.md` - This document

---

## Next Steps

1. Review this investigation with team
2. Decide which fix to use for this user
3. Deploy database migration
4. Deploy code changes
5. Monitor for future failures
6. Update documentation
