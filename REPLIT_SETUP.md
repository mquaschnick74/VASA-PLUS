# VASA on Replit - Quick Setup Guide

## Critical: You Must Set Environment Variables!

The error "An unknown error occurred with VAPI" and sessions ending after 5 seconds is **almost always** caused by missing environment variables.

---

## Step-by-Step Setup

### 1. Get Your VAPI API Keys

1. Go to **[VAPI Dashboard](https://dashboard.vapi.ai)**
2. Sign in or create an account
3. Navigate to **Settings** → **API Keys**
4. Copy these two keys:
   - **Public Key** (starts with `pk_` or similar)
   - **Server Secret** (for webhook validation)

### 2. Set Environment Variables in Replit

**Important:** Replit calls them "Secrets" - they're the same as environment variables.

1. In your Replit workspace, click **"Tools"** in the left sidebar
2. Click **"Secrets"** (lock icon 🔒)
3. Click **"Add new secret"**
4. Add each of these:

   **Secret 1:**
   - Key: `VITE_VAPI_PUBLIC_KEY`
   - Value: `pk_your_actual_key_here`

   **Secret 2:**
   - Key: `VAPI_SECRET_KEY`
   - Value: `your_server_secret_here`

   **Secret 3:**
   - Key: `VITE_SERVER_URL`
   - Value: Your Replit URL (e.g., `https://vasa-plus.your-username.repl.co`)

   **Secret 4 (if using OpenAI directly):**
   - Key: `OPENAI_API_KEY`
   - Value: `sk-your_openai_key_here`

### 3. Restart Your Replit

**This is critical!** Environment variables only load on server start.

1. Click the **"Stop"** button at the top
2. Wait for it to fully stop
3. Click **"Run"** to start again

### 4. Refresh Your Browser

1. **Hard refresh** the browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. This clears the old JavaScript bundle

### 5. Test the Session

1. Open browser console (F12)
2. Click "Start Session"
3. Look for these logs:
   - `⚠️ Configuration checks:`
   - `✅ Set` next to "VAPI Public Key"
   - `🚀 Calling vapi.start()...`
   - `✅ vapi.start() completed successfully`

---

## Diagnostic Card

After implementing the latest changes, you'll see a **"VAPI Configuration Status"** card on your dashboard that shows:

- ✅ Green checkmark = Configured correctly
- ❌ Red X = Missing (needs to be set)
- ⚠️ Yellow warning = Optional or needs attention

### What Each Check Means:

1. **VAPI Public Key**
   - Must be ✅ green
   - If ❌ red: Add `VITE_VAPI_PUBLIC_KEY` to Replit Secrets

2. **Webhook URL**
   - Shows where VAPI will send events
   - Should match your Replit URL
   - If wrong: Set `VITE_SERVER_URL` in Replit Secrets

3. **VAPI Server Secret**
   - ⚠️ Yellow is okay (it's optional for development)
   - ✅ Green is better (validates webhook signatures)

---

## Common Issues & Fixes

### Issue: "An unknown error occurred with VAPI"

**Most likely cause:** Missing `VITE_VAPI_PUBLIC_KEY`

**Fix:**
1. Go to Tools → Secrets
2. Verify `VITE_VAPI_PUBLIC_KEY` exists
3. Verify the value is correct (should start with `pk_`)
4. Stop and restart Replit
5. Hard refresh browser

### Issue: Session starts but agent doesn't talk

**Possible causes:**
1. Invalid OpenAI API key (if using OpenAI models)
2. Webhook URL not accessible
3. VAPI assistant configuration issue

**Fix:**
1. Check browser console for detailed error logs
2. Look for messages starting with `🔴 VAPI ERROR EVENT:`
3. Check server logs for webhook events:
   - Should see: `📥 VAPI webhook received: call-started`
   - Should see: `🚀 CALL-STARTED event received`

### Issue: Call ends after exactly 5 seconds

**This is VAPI's timeout** when the assistant can't initialize.

**Causes:**
- Invalid API keys
- Model provider (OpenAI) not responding
- Voice provider (ElevenLabs) not responding

**Fix:**
1. Verify all API keys are correct
2. Check browser console for the exact error
3. Try with a simpler model configuration

---

## Verifying Setup

### Check 1: Environment Variables Loaded

In browser console after page load:
```javascript
// This should return true
!!import.meta.env.VITE_VAPI_PUBLIC_KEY
```

### Check 2: Diagnostic Card

You should see the diagnostic card showing green checkmarks.

### Check 3: Console Logs

When clicking "Start Session", you should see:
```
⚠️ Configuration checks:
  - VAPI Public Key: ✅ Set
  - Webhook URL: https://your-url.repl.co/api/vapi/webhook
  - First Message Mode: assistant-speaks-first-with-model-generated-message
  - Model: gpt-4o-mini
🚀 Calling vapi.start()...
✅ vapi.start() completed successfully
✅ Call started
```

---

## Still Not Working?

### Get Detailed Error Information

1. Open browser console (F12)
2. Clear console
3. Click "Start Session"
4. Look for these specific logs:
   - `🔴 VAPI ERROR EVENT:` - This is the actual error
   - `🔍 Error type:` - Shows what kind of error
   - `🔍 Error keys:` - Shows the error structure

5. Take a screenshot of these logs
6. Check if error mentions:
   - **"API key"** → Wrong or missing VAPI key
   - **"unauthorized"** → Wrong or missing OpenAI key
   - **"timeout"** → Internet connection or API provider issue
   - **"voice"** → Voice provider (ElevenLabs) issue

### Check Server Logs

In your Replit console tab, look for:
```
📥 VAPI webhook received: call-started
🚀 CALL-STARTED event received for call: call-xxx
```

If you don't see these when starting a session, your webhook URL is wrong.

---

## Quick Troubleshooting Checklist

- [ ] Added `VITE_VAPI_PUBLIC_KEY` to Replit Secrets
- [ ] Added `VAPI_SECRET_KEY` to Replit Secrets
- [ ] Added `VITE_SERVER_URL` to Replit Secrets
- [ ] Stopped and restarted Replit server
- [ ] Hard refreshed browser (Ctrl+Shift+R)
- [ ] Granted microphone permissions
- [ ] Checked browser console for error details
- [ ] Verified VAPI keys are valid in VAPI dashboard
- [ ] Diagnostic card shows green checkmarks

---

## Support

If you've followed all these steps and it still doesn't work:

1. Export browser console logs (right-click in console → Save as)
2. Export Replit server logs
3. Take screenshot of the diagnostic card
4. Check the detailed `VASA_TROUBLESHOOTING.md` guide

The enhanced error messages should now tell you exactly what's wrong!
