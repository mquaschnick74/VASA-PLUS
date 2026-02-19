# FORENSIC AUDIT REPORT — VASA-PLUS Vapi Configuration & Runtime Pipeline

**Date:** 2026-02-19
**Scope:** Inline Vapi assistant config, webhook pipeline, memory/context injection, mid-call controlUrl usage, RAG, and summary generation.

---

## 1. Executive Summary

| Capability | Status | Evidence |
|---|---|---|
| **controlUrl injection** | **YES — Fully implemented and active** | `server/services/sensing-layer/guidance-injector.ts` — POST to controlUrl with `add-message` |
| **Tool/function-calling** | **NO — Not implemented** | No `tools` property in assistant config (`client/src/hooks/use-vapi.ts:416-492`) |
| **Mid-call DB query by assistant** | **NO — Impossible** | Assistant has no tool definitions; cannot call Supabase |
| **Memory context injection** | **YES — Working but often small** | `server/services/memory-service.ts:367-832` builds context; `use-vapi.ts:348-354` injects |
| **RAG guidance** | **BROKEN — Returns 0 chunks** | RPC function `match_knowledge_chunks` likely not deployed; code passes `filter_user_id` param that the SQL function doesn't accept |
| **Summary generation** | **BROKEN — Produces thin summaries** | Model `gpt-5.1` in `summary-service.ts:166,181` is invalid; falls back to duration-only text |

---

## 2. Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ USER CLICKS "START SESSION"                                                     │
│   voice-interface.tsx → fetches /api/auth/user-context/:userId                  │
│   ↓                                                                             │
│ SERVER BUILDS MEMORY CONTEXT                                                    │
│   auth-routes.ts:600 → buildMemoryContextWithSummary()                          │
│   memory-service.ts:891-1084 → queries 8 tables, assembles ≤12000 chars         │
│   ↓                                                                             │
│ FRONTEND ASSEMBLES SYSTEM PROMPT                                                │
│   use-vapi.ts:248-363                                                           │
│   base agent prompt + greeting + onboarding + lastSessionSummary                │
│   + uploadContext + memoryContext + firstName                                    │
│   ↓                                                                             │
│ vapi.start(assistantConfig)                                                     │
│   model: gpt-5.2, provider: openai, maxTokens: 300                             │
│   voice: 11labs, transcriber: deepgram nova-2                                   │
│   serverUrl: /api/vapi/webhook                                                  │
│   metadata: { userId, agentName, agentId }                                      │
└─────────────┬───────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ VAPI CALL ACTIVE — WEBHOOK EVENTS                                               │
│                                                                                 │
│  call-started (webhook-routes.ts:369)                                           │
│    → extract & store controlUrl from message.call.monitor.controlUrl             │
│    → initialize sensing layer session                                            │
│    → start silence monitor                                                       │
│                                                                                 │
│  conversation-update (webhook-routes.ts:419)                                    │
│    → update conversation history                                                 │
│    → async: run sensing layer (5s rate limit)                                    │
│    → sensing layer → generate guidance → POST to controlUrl (add-message)        │
│                                                                                 │
│  speech-update (webhook-routes.ts:663)                                          │
│    → track agent speaking state                                                  │
│    → on "stopped": flush queued guidance via controlUrl                          │
│                                                                                 │
│  status-update (webhook-routes.ts:642)                                          │
│    → secondary controlUrl extraction                                             │
│                                                                                 │
│  end-of-call-report (webhook-routes.ts:529)                                     │
│    → finalize sensing layer                                                      │
│    → generate summaries (summary-service.ts)                                     │
│    → store call_summary + conversational_summary → therapeutic_context table      │
│    → detect CSS patterns → css_patterns table                                    │
│    → track usage                                                                 │
│    → cleanup call state                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. controlUrl Status

**Implemented? YES.**
**Used? YES — actively during live calls.**

### Lifecycle

| Step | File | Line(s) | What happens |
|---|---|---|---|
| Extract | `server/routes/webhook-routes.ts` | 390-397 | `message.call.monitor.controlUrl` extracted from `call-started` |
| Extract (backup) | `server/routes/webhook-routes.ts` | 647-655 | Also extracted from `status-update` |
| Store | `server/services/sensing-layer/call-state.ts` | 81-104 | `setControlUrl()` stores in in-memory `Map<string, CallState>` |
| Retrieve | `server/services/sensing-layer/call-state.ts` | 109-111 | `getControlUrl(callId)` |
| Inject | `server/services/sensing-layer/guidance-injector.ts` | 28-103 | `injectGuidance()` — POST to controlUrl |
| Queue gate | `server/services/sensing-layer/guidance-injector.ts` | 46-52 | If agent is speaking → queue in `pendingGuidance` Map |
| Flush | `server/services/sensing-layer/guidance-injector.ts` | 382-394 | `flushPendingGuidance()` on `speech-update: stopped` |
| Cleanup | `server/services/sensing-layer/call-state.ts` | 224 | Auto-cleanup stale states after 2 hours |

### HTTP Call Details (`guidance-injector.ts:55-83`)

```json
POST {controlUrl}
Content-Type: application/json

{
  "type": "add-message",
  "message": {
    "role": "system",
    "content": "[THERAPEUTIC GUIDANCE]\n\nPOSTURE: PROBE\n..."
  },
  "triggerResponseEnabled": true
}
```

### Error handling

- Call-active gate (line 33-36)
- HTTPS-only validation (line 40-44)
- Agent-speaking gate with queue (line 46-52)
- HTTP response check (line 85-96)
- **No retries** — fire-and-forget with logging

### Additional injection functions

| Function | File:Lines | Purpose |
|---|---|---|
| `injectImmediateIntervention()` | `guidance-injector.ts:295-340` | Crisis/flooding scenarios |
| `injectSystemMessage()` | `guidance-injector.ts:345-376` | Generic system message utility |

---

## 4. Tool/Function-Calling Status

**Implemented? NO.**

Evidence:

- `client/src/hooks/use-vapi.ts:416-492` — the `assistantConfig` object has **no `tools` property**
- `client/src/config/agent-configs.ts` — **no `tools` or `functions` field** on any agent definition
- `server/routes/webhook-routes.ts` — **no handler for `tool-calls` or `function-call`** message types
- Grep for `tools`, `function_call`, `tool_choice` across both files returned **zero matches**

**The assistant CANNOT query Supabase mid-call.** It receives only the pre-call system prompt and mid-call sensing layer injections. All DB access is server-side only.

---

## 5. Memory Context Composition

### Where built

`server/services/memory-service.ts:367-832` — function `buildMemoryContext(userId)`

### Where fetched

`GET /api/auth/user-context/:userId` — defined in `server/routes/auth-routes.ts:547-694`

### Where injected into system prompt

`client/src/hooks/use-vapi.ts:348-354`:
```typescript
systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====\n${memoryContext}\n===== END HISTORY =====\n...`;
```

### System prompt assembly order (`use-vapi.ts:248-363`)

```
1. Base agent systemPrompt (from agent-configs.ts, hardcoded per agent)
2. + GREETING GENERATION INSTRUCTION (lines 251-265)
3. + [IF onboarding exists] USER'S INITIAL CONTEXT (lines 275-290)
4. + [IF lastSessionSummary AND shouldReference] LAST SESSION CONTEXT (lines 300-305)
5. + [IF uploadContext] CONTENT THE USER SHARED FOR DISCUSSION (lines 310-345)
6. + [IF memoryContext > 50 chars] PREVIOUS SESSION HISTORY (lines 349-354)
   ELSE [IF first session] FIRST_SESSION_INTRODUCTION (lines 358-359)
7. + User name injection (line 363)
```

### Sections breakdown

| Section | DB Table(s) | Query Location | Typical Size | Why small/empty |
|---|---|---|---|---|
| Assessment data | `user_profiles` | `memory-service.ts:383-505` | 200-500 chars | Only scores/register on repeat sessions; full responses only on 1st session |
| Session history | `therapeutic_sessions` | `memory-service.ts:507-521` | 50-150 chars | Only metadata: count + date + duration. No transcript content. |
| Insights | `therapeutic_context` | `memory-service.ts:403-409` | 0-400 chars | Filtered heavily (lines 529-538): excludes JSON metadata, excludes "session with sarah/mathew", excludes <20 chars. Thin summaries pass filter but carry no semantic value. |
| CSS patterns | `css_patterns` | `memory-service.ts:417-422` | 0-200 chars | Empty if no patterns detected yet |
| CSS stage guidance | `css_patterns` (PROCESS type) | `memory-service.ts:572-603` | 0-300 chars | Empty if no PROCESS pattern exists |
| PCA clinical | `pca_master_analysis` | `memory-service.ts:609-617` | 0-2500 chars | **Largest potential section.** Empty if PCA master analysis never ran. Capped at 2500 chars. |
| Upload analysis | `therapeutic_context` | `memory-service.ts:623-681` | 0-400 chars | Empty if user never uploaded content |
| User content (background) | `user_content` + `knowledge_chunks` | `memory-service.ts:689-743` | 0-600 chars | Only 2 chunks max, first 300 chars each |
| RAG guidance | `knowledge_chunks` via RPC | `memory-service.ts:779-783` | **0 chars** | **BROKEN** — see Section 6 |

### Total budget

- Hard limit: `MAX_CONTEXT_CHARS = 12000` (`memory-service.ts:802`)
- Typical actual: **500-2000 chars** when PCA exists, **200-683 chars** when it doesn't

### Why memoryContext is ~683 chars

With a user who has:

- Assessment completed → ~300 chars (summary mode)
- 1-3 sessions → ~100 chars (metadata only)
- Thin summaries as insights → ~150 chars (filtered "lasted X minutes" entries)
- No CSS patterns, no PCA, no uploads, no RAG → 0 chars each

**Total ≈ 550-700 chars.** This matches the observed ~683 chars.

---

## 6. RAG Diagnosis

### Architecture

| Component | Location | Status |
|---|---|---|
| Embedding generation | `server/services/sensing-layer/knowledge-base.ts:32-54` | Code is sound; uses `text-embedding-3-small` |
| RPC function SQL | `supabase/functions/match_knowledge_chunks.sql` | **Written but likely NOT deployed to Supabase** |
| Knowledge documents | `knowledge/` directory (9 files, ~128KB total) | **Files exist on disk but likely NOT ingested** |
| Ingestion script | `server/scripts/ingest-knowledge.ts` | Code is sound but must be manually run |
| Query function | `knowledge-base.ts:59-113` — `queryKnowledgeBase()` | Sends correct query but gets 0 results or error 42883 |

### Why 0 chunks returned

**Primary cause: The RPC function is probably not deployed.**

The error handling at `knowledge-base.ts:91-92` explicitly anticipates this:

```typescript
if (error.message?.includes('function') || error.code === '42883') {
  console.warn(`[RAG] RPC function not found - knowledge base not set up yet`);
  return [];
}
```

**Secondary cause: Parameter mismatch.**

The code passes `filter_user_id` (`knowledge-base.ts:85`):

```typescript
filter_user_id: userId || null
```

But the SQL function at `match_knowledge_chunks.sql:14-19` does **NOT** accept a `filter_user_id` parameter:

```sql
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_types text[] DEFAULT NULL,
  filter_tags text[] DEFAULT NULL
  -- NO filter_user_id parameter
)
```

Even if deployed, the extra parameter would cause a PostgreSQL error (no matching function signature).

**Tertiary cause: Knowledge chunks table is likely empty.**

The ingestion script (`server/scripts/ingest-knowledge.ts`) must be manually run. There are 9 knowledge files totaling ~128KB in `knowledge/`, but there's no evidence they've been ingested.

### Exact query payload (for the memory-context call)

Built at `memory-service.ts:751-775`:

```typescript
// Example: "CSS stage: pointed_origin | CVDC contradiction pattern | register: symbolic"
// Or fallback: "therapeutic guidance PCA methodology"
```

Passed to `queryKnowledgeBase()` at line 779-783:

```typescript
{ types: ['theory', 'guideline', 'technique'], limit: 3, threshold: 0.6 }
```

---

## 7. Summary Diagnosis

### Why summaries are thin ("lasted 1 minutes")

**Root cause: The model name `gpt-5.1` is invalid.**

- File: `server/services/summary-service.ts`
- Line 166: `model: 'gpt-5.1'` (greeting context generation)
- Line 181: `model: 'gpt-5.1'` (clinical notes generation)

This causes the OpenAI API call to fail every time. The error is caught at line 68-69:

```typescript
} catch (error) {
  console.error('❌ AI summary generation failed, using fallback:', error);
```

### Fallback chain

1. **AI summarization fails** (invalid model) → caught at line 68
2. **Fallback** `extractNarrativeFromTranscript()` (`summary-service.ts:216-264`) runs:
   - Splits transcript on `\n`, looks for lines containing `user:` (line 230)
   - Extracts user text between 20-200 chars (line 232)
   - Filters out filler words: "yeah", "okay", "um" (lines 243-246)
   - Requires remaining statements > 30 chars (line 246)
3. **If meaningful statements found** → `User shared: "..."` (line 250)
4. **If NO meaningful statements found** → line 255:

```typescript
narrative = `${userName}'s session with therapeutic agent ${agentName} lasted ${Math.floor(duration / 60)} minutes.`;
```

### Why the fallback also produces duration-only text

The transcript format from Vapi may not use `User:` prefixes — Vapi typically uses `"role": "user"` in JSON objects, not line-prefixed text. The fallback parser at line 230 looks for `user:` in each line of a newline-split string. If the transcript is JSON-formatted or uses a different role format, **zero user statements** are extracted, and the "lasted X minutes" string becomes the entire summary.

### Storage path

Both the thin `call_summary` and thin `conversational_summary` are stored identically via `storeSummaries()` (`summary-service.ts:270-305`):

- `call_summary` → `storeSessionContext()` → `therapeutic_context` table, `context_type = 'call_summary'`
- `conversational_summary` → direct insert → `therapeutic_context` table, `context_type = 'conversational_summary'`

### Downstream impact

These thin summaries flow into:

1. **Memory context insights** (`memory-service.ts:403-409`) — fetched as `call_summary` / `conversational_summary` entries
2. **Last session greeting** (`memory-service.ts:902-931`) — displayed as `lastSessionSummary` in next session's system prompt
3. **User display** (`memory-service.ts:837-868`) — shown in UI as previous session insight

Result: The assistant's next-session greeting references "lasted 1 minutes" instead of actual therapeutic content.

---

## 8. Webhook Handler Map

All handlers defined inline in `server/routes/webhook-routes.ts`:

| Message Type | Lines | What It Does | Logs callId | Uses controlUrl |
|---|---|---|---|---|
| `call-started` | 369-417 | Stores controlUrl, inits sensing layer, starts silence monitor | Yes (371) | Extracts and stores (390) |
| `conversation-update` | 419-527 | Updates conversation history, async sensing layer + guidance injection | Yes (422) | Retrieves for injection (223) |
| `end-of-call-report` | 529-640 | Finalizes session, generates summaries, stores patterns, tracks usage | Yes (530) | Cleans up |
| `status-update` | 642-661 | Extracts controlUrl (backup path), ensures session | Yes (645) | Extracts and stores (650) |
| `speech-update` | 663-677 | Tracks agent speaking state, flushes queued guidance | Yes (669) | Triggers flush (673) |

**Not handled:** `assistant-request`, `transcript` (transcript data comes embedded in `conversation-update` and `end-of-call-report`)

### Security

- Webhook signature validation: `server/routes/webhook-routes.ts:310-330`
- Uses `X-Vapi-Signature` header with HMAC-SHA256 against `VAPI_SECRET_KEY`
- **WARNING:** Currently only logs mismatch (line 327) — does NOT reject invalid signatures

### User ID extraction (`webhook-routes.ts:801-859`)

Checks (in order): `message.call.metadata.userId` → `message.metadata.userId` → `message.call.assistant.metadata.userId` → `message.assistant.metadata.userId` → `message.call.assistantOverrides.metadata.userId` → `message.call.customer.userId` → fallback DB lookup by callId

---

## 9. Assistant Config Object (Frontend)

Defined at `client/src/hooks/use-vapi.ts:416-492`, passed to `vapi.start()`:

```typescript
{
  name: `VASA-${selectedAgent.name}`,
  model: {
    provider: 'openai',
    model: selectedAgent.model.model,     // 'gpt-5.2'
    temperature: selectedAgent.model.temperature,  // 0.7-0.9
    messages: [{ role: 'system', content: systemPrompt }],
    maxTokens: 300
  },
  voice: {
    provider: '11labs',
    voiceId: selectedAgent.voice.voiceId,
    model: 'eleven_flash_v2_5',
    stability: 0.9,
    similarityBoost: 0.85,
    speed: 1.0,
    useSpeakerBoost: false
  },
  startSpeakingPlan: { waitSeconds: 3, smartEndpointingEnabled: true },
  stopSpeakingPlan: { numWords: 5, voiceSeconds: 0.5, backoffSeconds: 2 },
  serverUrl: getAbsoluteUrl('/api/vapi/webhook'),
  serverMessages: [
    "assistant.started", "conversation-update", "end-of-call-report",
    "status-update", "speech-update", "transcript"
  ],
  server: { url: serverUrl, timeoutSeconds: 20, secret: VITE_VAPI_SERVER_SECRET },
  firstMessage: null,
  firstMessageMode: "assistant-speaks-first-with-model-generated-message",
  transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
  recordingEnabled: true,
  maxDurationSeconds: sessionDurationLimit,
  metadata: { userId, agentName, agentId, hasSessionContinuity, timestamp }
}
```

### Agents (`client/src/config/agent-configs.ts:195-320`)

| Agent | Model | Temp | Voice ID | ElevenLabs Model | Speed |
|---|---|---|---|---|---|
| Sarah | gpt-5.2 | 0.7 | `Tfv2PGiTliSQ4XSXrJmA` | eleven_flash_v2_5 | 1.0 |
| Marcus | gpt-5.2 | 0.8 | `pNInz6obpgDQGcFmaJgB` | eleven_flash_v2_5 | 1.0 |
| Mathew | gpt-5.2 | 0.9 | `2hsbsDeRu57rsKFAC7uE` | eleven_flash_v2_5 | 1.1 |
| UNA | gpt-5.2 | 0.9 | `wJqPPQ618aTW29mptyoc` | eleven_turbo_v2_5 | 1.0 |

System prompts are **hardcoded inline** in `agent-configs.ts`, not fetched from server.

---

## 10. Actionable Next Steps

> **Do NOT implement yet** — these are targets for follow-up work.

### P0 — Critical (Breaks core functionality)

| # | Action | File:Line | Impact |
|---|---|---|---|
| 1 | **Fix summary model name** — change `'gpt-5.1'` to a valid model (e.g., `'gpt-4o'`) | `server/services/summary-service.ts:166,181` | Summaries will be AI-generated instead of "lasted X minutes" |
| 2 | **Fix fallback transcript parser** — handle Vapi's actual transcript format (JSON with `role` field, not `User:` line prefix) | `server/services/summary-service.ts:229-236` | Even when AI fails, meaningful quotes will be extracted |
| 3 | **Deploy RAG RPC function** — run the SQL in Supabase SQL Editor | `supabase/functions/match_knowledge_chunks.sql` | RAG queries will start working |
| 4 | **Fix RPC parameter mismatch** — either add `filter_user_id` param to SQL function, or stop passing it from code | `match_knowledge_chunks.sql:14-19` + `knowledge-base.ts:85` | Prevents signature-mismatch error |
| 5 | **Run knowledge ingestion** — execute ingestion script to populate `knowledge_chunks` from the 9 files in `knowledge/` | `server/scripts/ingest-knowledge.ts` | RAG will have data to retrieve |

### P1 — High (Reduces quality)

| # | Action | File:Line | Impact |
|---|---|---|---|
| 6 | **Add retry logic to guidance injection** — 1-2 retries with backoff on non-4xx failures | `server/services/sensing-layer/guidance-injector.ts:85-96` | Fewer missed mid-call guidance injections |
| 7 | **Enforce webhook signature validation** — currently only warns on mismatch, should reject with 401 | `server/routes/webhook-routes.ts:310-330` | Security improvement |
| 8 | **Add Vapi `tools` to assistant config for mid-call DB access** — add function-calling tool definitions + server-side `tool-calls` handler | `client/src/hooks/use-vapi.ts:416-492` + `server/routes/webhook-routes.ts` | Assistant can query Supabase during conversation |

### P2 — Medium (Enriches context)

| # | Action | File:Line | Impact |
|---|---|---|---|
| 9 | **Include transcript snippets in session history** — instead of just count/date/duration, include key quotes from `conversational_summary` | `server/services/memory-service.ts:507-521` | memoryContext grows from ~683 to ~2000+ chars |
| 10 | **Trigger PCA analysis automatically** — auto-run after every 3rd session | `server/services/pca-master-analyst-service.ts` | PCA context section (0-2500 chars) will populate |
| 11 | **Surface upload analysis proactively** — ensure `upload_analysis` entries are created when user uploads content | `server/services/memory-service.ts:623-681` | Upload context will appear in memory |
