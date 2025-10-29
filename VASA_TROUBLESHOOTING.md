# VASA Session Troubleshooting Guide

## Issue: Sessions Don't Start or Agent Doesn't Talk

### Root Causes Identified

1. **Missing VAPI Public Key**
2. **Incorrect Webhook URL Configuration**
3. **Microphone Permission Issues**
4. **Silent Error Handling (Now Fixed)**

---

## Quick Fixes

### 1. Check Environment Variables

**Required Variables:**
```bash
VITE_VAPI_PUBLIC_KEY=your_actual_vapi_public_key
VAPI_SECRET_KEY=your_actual_vapi_secret_key
VITE_SERVER_URL=https://your-production-domain.com  # For production only
```

**Where to Set Them:**

#### For Replit:
1. Click on "Tools" → "Secrets" (or the lock icon in sidebar)
2. Add the following secrets:
   - Key: `VITE_VAPI_PUBLIC_KEY` → Value: Your VAPI public key
   - Key: `VAPI_SECRET_KEY` → Value: Your VAPI server secret
   - Key: `VITE_SERVER_URL` → Value: Your production URL (e.g., `https://vasa-plus.replit.app`)

#### For Local Development:
1. Create a `.env` file in the project root
2. Copy contents from `.env.example`
3. Fill in your actual values

### 2. Get Your VAPI Keys

1. Go to [VAPI Dashboard](https://dashboard.vapi.ai)
2. Navigate to **Settings** → **API Keys**
3. Copy your **Public Key** (starts with `pk_`)
4. Copy your **Server Secret** (for webhook validation)

### 3. Verify the Fix

After setting environment variables:
1. **Restart your server** (in Replit, click Stop → Run)
2. **Hard refresh the browser** (Ctrl+Shift+R / Cmd+Shift+R)
3. Click "Start Session"
4. If there's still an error, you'll now see a **red error message** explaining what went wrong

---

## Error Messages You Might See (Post-Fix)

### "VAPI is not configured. Please contact support..."
**Cause:** Missing `VITE_VAPI_PUBLIC_KEY` environment variable

**Fix:**
1. Add the environment variable (see above)
2. Restart the server
3. Hard refresh browser

### "Failed to initialize voice assistant..."
**Cause:** VAPI SDK failed to load

**Fix:**
1. Check your internet connection
2. Clear browser cache
3. Try a different browser

### "Unable to start session: ... Please check your microphone permissions..."
**Cause:** Browser doesn't have microphone access

**Fix:**
1. Click the microphone icon in browser address bar
2. Select "Allow" for microphone access
3. Refresh the page
4. Try starting the session again

### "Voice assistant is not initialized. Please refresh the page."
**Cause:** VAPI failed to initialize on page load

**Fix:**
1. Hard refresh the browser (Ctrl+Shift+R)
2. Check browser console for additional errors (F12 → Console tab)
3. Verify environment variables are set

---

## Debugging Steps

### 1. Check Browser Console (F12)
Look for these log messages:
- ✅ `Call started` - Session started successfully
- 📍 `Webhook URL: ...` - Shows webhook configuration
- 📍 `User ID: ...` - Confirms user is identified
- ❌ `VAPI public key not found` - Missing env variable
- ❌ `VAPI start failed` - Session start error

### 2. Verify Webhook Configuration
**Expected Webhook URL Format:**
- Development: `http://localhost:5000/api/vapi/webhook`
- Production: `https://your-domain.com/api/vapi/webhook`

**How to Check:**
1. Open browser console (F12)
2. Click "Start Session"
3. Look for log: `📍 Webhook URL: ...`
4. Verify it matches your server's URL

### 3. Test Microphone
1. Visit [WebRTC Test](https://test.webrtc.org/)
2. Grant microphone permissions
3. Verify microphone is detected
4. Return to VASA and try again

### 4. Check Server Logs
Look for these on the server side:
- `📥 VAPI webhook received: call-started`
- `🚀 CALL-STARTED event received for call: ...`
- `✅ call-started event processed successfully`

If you don't see these logs when starting a session, the webhook URL is likely incorrect.

---

## Common Scenarios

### Scenario 1: "Connecting..." appears then disappears, no error shown
**Before the fix:** This was the main symptom
**After the fix:** You'll now see a red error alert explaining the issue

**Most likely causes:**
1. Missing VITE_VAPI_PUBLIC_KEY
2. Microphone permission denied
3. Invalid VAPI key

### Scenario 2: Session starts but agent never talks
**Possible causes:**
1. Webhook URL not reaching your server
2. Server not processing webhooks properly
3. VAPI configuration error

**Fix:**
1. Check server logs for webhook events
2. Verify `VITE_SERVER_URL` is correct
3. Test webhook URL manually:
   ```bash
   curl -X POST https://your-domain.com/api/vapi/webhook \
     -H "Content-Type: application/json" \
     -d '{"message":{"type":"test"}}'
   ```

### Scenario 3: Session immediately shuts off
**Possible causes:**
1. VAPI authentication failure
2. Invalid assistant configuration
3. OpenAI API key issue (if using OpenAI models)

**Fix:**
1. Verify all API keys are correct
2. Check VAPI dashboard for error logs
3. Review server console for error messages

---

## Production Deployment Checklist

- [ ] Set `VITE_VAPI_PUBLIC_KEY` in production environment
- [ ] Set `VAPI_SECRET_KEY` in production environment
- [ ] Set `VITE_SERVER_URL` to your production domain
- [ ] Verify webhook URL is publicly accessible
- [ ] Test microphone permissions in production environment
- [ ] Monitor server logs for webhook events
- [ ] Test a full session end-to-end

---

## Changes Made (Technical)

### 1. Enhanced Error Handling in `use-vapi.ts`
- Added `error` and `clearError` to hook return values
- Set user-friendly error messages for all failure points:
  - Missing public key
  - VAPI initialization failure
  - Session start failure
  - VAPI runtime errors

### 2. Error UI in `voice-interface.tsx`
- Added error alert display with dismiss button
- Shows errors above the session interface
- Uses red color scheme for visibility

### 3. Webhook URL Configuration
- Changed from `window.location.origin` only
- Now uses `VITE_SERVER_URL` if available
- Falls back to `window.location.origin` for local dev
- Added logging for debugging

---

## Still Having Issues?

1. **Check the browser console** (F12) for detailed error logs
2. **Check the server logs** for webhook processing errors
3. **Verify all environment variables** are set and correct
4. **Test with a different browser** to rule out browser-specific issues
5. **Contact VAPI support** if you suspect API key issues

## Support

If issues persist after following this guide:
1. Export browser console logs (F12 → Console → Right-click → Save as)
2. Export server logs
3. Contact technical support with both log files
