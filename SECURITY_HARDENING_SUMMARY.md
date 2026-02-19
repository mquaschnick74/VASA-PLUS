# Security Hardening Summary

## What Changed

### 1) Stripe webhook hardening
- Enforced raw body requirement for Stripe webhook route (`Buffer` only).
- In production (`NODE_ENV=production`), webhook signature verification is mandatory.
- If Stripe webhook is misconfigured (missing secret/signature/non-buffer body), endpoint returns safe `500` config error.
- Replaced direct `fetch()` Stripe API calls with Stripe SDK:
  - `stripe.checkout.sessions.listLineItems(...)`
  - `stripe.products.retrieve(...)`
- Added DB-backed idempotency handling:
  - duplicate `stripe_event_id` short-circuits and returns `{ received: true }`.
- Webhook event storage now uses minimized metadata object instead of full payload body.

### 2) Privacy-safe logging
- Added centralized redaction helper in `server/utils/logger.ts`.
- Replaced verbose API body/response logging in `server/index.ts` with minimal request telemetry:
  - request id, method, path, status, duration.
- Removed auth header preview logging.
- Sanitized high-risk VAPI webhook logs to avoid payload and transcript leaks.

### 3) Environment validation (fail fast)
- Added feature-gated startup env validation in `server/utils/env.ts`.
- Startup now fails early with explicit missing variable names when required vars are absent.

### 4) Auth middleware hardening
- Auth middleware now fails fast if Supabase server credentials are missing.
- Preserved auth_user_id -> users.id -> user_type mapping.
- Added in-memory TTL cache for user context resolution to reduce repeated DB lookups.
- Removed sensitive token/header logging from middleware.

### 5) Migration and secret-shaped docs placeholders
- Added migration to enforce Stripe webhook id uniqueness at DB layer.
- Replaced secret-shaped placeholders in `CODEBASE_INDEX.md`.

## Files Changed
- `server/index.ts`
- `server/middleware/auth.ts`
- `server/routes/stripe-webhook.ts`
- `server/routes/webhook-routes.ts`
- `server/utils/logger.ts` (new)
- `server/utils/env.ts` (new)
- `migrations/005_ensure_stripe_webhook_event_id_unique.sql` (new)
- `CODEBASE_INDEX.md`
- `SECURITY_HARDENING_SUMMARY.md` (new)

## How To Validate Locally

### A) Type/syntax checks
```bash
# syntax-only for touched backend files
node -c server/index.ts
node -c server/middleware/auth.ts
node -c server/routes/stripe-webhook.ts
node -c server/routes/webhook-routes.ts
```

### B) Stripe webhook config behavior

#### Production mode should require signature
```bash
NODE_ENV=production curl -i -X POST http://localhost:5000/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed"}'
# Expect: 500 (Webhook configuration error) when signature/secret are missing
```

#### Dev mode allows unsigned only when not production
```bash
NODE_ENV=development curl -i -X POST http://localhost:5000/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed","id":"evt_test"}'
# Expect: no signature hard-fail path in development
```

### C) Auth middleware behavior
```bash
# authenticateToken route behavior is route-dependent, but requireAuth should reject invalid/missing tokens
curl -i http://localhost:5000/api/analysis/history
# Expect: 401 on requireAuth-protected route with no token
```

### D) Check for removed risky patterns
```bash
# should not find stringified req.body fallback for Stripe
rg -n "Buffer\.from\(JSON\.stringify\(req\.body\)\)" server/routes/stripe-webhook.ts

# should not find secret-shaped placeholders in CODEBASE_INDEX.md
rg -n "eyJ|sk-|whsec_" CODEBASE_INDEX.md
```

## Notes
- Existing repo-wide TypeScript errors outside touched files remain and are unrelated to this hardening sweep.
- One unrelated local modification remains in working tree: `ios/App/CapApp-SPM/Package.swift`.
