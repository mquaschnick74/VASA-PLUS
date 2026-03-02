# Custom LLM Endpoint Migration — Architectural Investigation

> Investigation completed 2026-03-02. This document answers three scoping questions for the custom LLM endpoint migration.

---

## Question 1: Webhook Handler Dual Responsibilities

### All Webhook Event Types

**File:** `server/routes/webhook-routes.ts` — switch statement begins at line 519

| Line | Event Type | Purpose |
|------|-----------|---------|
| 520–568 | `call-started` / `assistant.started` | Initializes session state, stores `controlUrl`, initializes sensing layer, starts silence monitor |
| 570–679 | `conversation-update` | Runs therapeutic tracker (`processConversationUpdate`), dispatches sensing layer (`processSensingLayerAsync`) for real-time guidance |
| 681–792 | `end-of-call-report` | Finalizes sensing layer session, stops silence monitor, processes end-of-call assessment, tracks usage, writes session summaries |
| 794–813 | `status-update` | Extracts and stores `controlUrl` from `message.call.monitor.controlUrl` |
| 815–829 | `speech-update` | Tracks agent speaking state, flushes pending guidance when agent stops speaking |
| 831–832 | default | Logs unhandled event types |

### `enhancedTherapeuticTracker.processConversationUpdate()` — Data Flow

**Defined in:** `server/services/enhanced-therapeutic-tracker.ts`, lines 31–112

**Database WRITES:**

1. **`therapeutic_movements` table** (lines 325–362) — Inserts detected therapeutic movements (deepening, resistance, integration) on each conversation turn.

2. **`css_patterns` table** (lines 286–295) — Inserts process-based CSS stage assessments at key exchange milestones (5, 10, 15, 20, 30, 40, 50 exchanges).

**Database READS during active session:** None. All therapeutic tracking state is held in-memory during the call. Tables are only read post-session for dashboard/analysis.

**Summary:** Writes per-turn data to `therapeutic_movements` and milestone data to `css_patterns`. Nothing reads these tables during the active call.

### `processSensingLayerAsync()` — Data Flow

**Defined in:** `server/routes/webhook-routes.ts`, lines 203–328

**Output chain:**
1. Calls `sensingLayer.processUtterance()` (line 276) → returns `TherapeuticGuidance`
2. Calls `injectGuidance(callId, guidance)` (line 301) → POSTs to VAPI `controlUrl` with `type: 'add-message'`

**Database writes:** **None during normal operation.** Guidance is purely ephemeral — injected as a system message into VAPI's active conversation and then gone. The only exception: if a "flooding" or "breakthrough" moment is detected (lines 246–251), it stores that to the `significant_moments` table. This is rare (emergency detection only).

**Summary:** The sensing layer's real-time output is entirely ephemeral. Guidance goes into VAPI and disappears.

### `end-of-call-report` Handler — Full Analysis

**File:** `server/routes/webhook-routes.ts`, lines 681–792

**Actions performed (in order):**

1. `sensingLayer.finalizeSession(callId)` (line 685) — writes to:
   - `session_register_analysis` — register summary
   - `significant_moments` — any flagged moments
   - `user_patterns` — via `persistSessionProfile()`
   - `user_historical_material` — via `persistSessionProfile()`
   - `symbolic_mappings` — via `persistSessionProfile()`

2. `stopSilenceMonitor(callId)` (line 697)

3. `clearPendingGuidance(callId)` (line 700)

4. `clearControlUrl(callId)` / `cleanupCallCaches(callId)` (lines 706–707)

5. `ensureSession()` / `initializeSession()` (lines 711–736) — ensures `therapeutic_sessions` row exists, updates with `start_time`, `end_time`, `duration_seconds`

6. `subscriptionService.trackUsageSession()` (line 762) — writes to `usage_sessions`

7. `enhancedTherapeuticTracker.processEndOfCall()` (line 778) — writes final assessment to `therapeutic_context` table (lines 393–400 of enhanced-therapeutic-tracker.ts)

8. `processEndOfCall()` (line 783) — original transcript processing

**Summary:** This is the critical lifecycle event. It persists all accumulated in-memory state to the database. Cannot be eliminated.

### `status-update` Handler

**File:** `server/routes/webhook-routes.ts`, lines 794–813

```typescript
case 'status-update': {
  const controlUrl = message?.call?.monitor?.controlUrl;
  if (controlUrl) {
    setControlUrl(callId, controlUrl, userId);  // In-memory Map, NOT database
  }
  await ensureSession(callId, userId, agentName);
  break;
}
```

**Summary:** Stores `controlUrl` in an in-memory Map (`callStates` in `call-state.ts`). Serves as a fallback path to capture `controlUrl` if `call-started` didn't have it. No database writes beyond session existence check.

### Migration Impact Assessment

| Event Type | Can Eliminate? | Reason |
|-----------|---------------|--------|
| `call-started` | **KEEP** | Session lifecycle — initializes session state, silence monitor |
| `conversation-update` | **PARTIALLY** — sensing layer can move to custom LLM endpoint; therapeutic tracker writes could too | Dual responsibility: therapeutic tracking (DB writes) + sensing layer (ephemeral guidance). Both could run inside the custom LLM endpoint since it receives every message. |
| `end-of-call-report` | **KEEP** | Critical lifecycle event — persists all accumulated state to DB |
| `status-update` | **ELIMINATE IF** controlUrl is no longer needed | Only purpose is `controlUrl` storage. If custom LLM endpoint replaces `controlUrl`-based injection, this handler becomes unnecessary. |
| `speech-update` | **ELIMINATE IF** guidance gating moves to custom LLM endpoint | Only purpose is tracking agent speaking state for guidance injection timing. |

---

## Question 2: Silence Monitor and controlUrl Dependency

### Silence Monitor Re-engagement Function

**File:** `server/services/sensing-layer/silence-monitor.ts`

**Trigger function:** `handleSilenceTimeout()` (lines 524–648)

**Flow:**
1. `setTimeout()` arms the timer (line 513) when user goes silent for 18–42 seconds (threshold varies by context)
2. `handleSilenceTimeout()` fires → calls `generateReEngagementMessage()` (tiers: Claude+RAG → Claude-only → template fallback)
3. Calls `injectSpokenReEngagement(callId, message)` (line 623)
4. Max 4 re-engagements per session (line 20: `MAX_RE_ENGAGEMENTS = 4`)

### `injectSpokenReEngagement()` — controlUrl Dependency

**File:** `server/services/sensing-layer/guidance-injector.ts`, lines 347–396

```typescript
export async function injectSpokenReEngagement(callId, message, endCallAfterSpoken = false) {
  const controlUrl = (getControlUrl(callId) || '').trim();
  // ...
  const response = await fetch(controlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'say',           // Forces agent to speak exact text
      content: message,
      endCallAfterSpoken: endCallAfterSpoken
    })
  });
}
```

**Critical detail:** Uses VAPI's `type: 'say'` command (not `add-message`). This bypasses the LLM entirely and forces the agent to speak exact text immediately. **This is fundamentally different from guidance injection.**

### All Injection Function Call Sites

#### `injectGuidance()` — 3 active call sites

| File | Line | Context |
|------|------|---------|
| `server/routes/webhook-routes.ts` | 247 | Cache hit: reuse cached guidance |
| `server/routes/webhook-routes.ts` | 301 | Main injection after sensing layer processes utterance |
| `server/services/sensing-layer/guidance-injector.ts` | 449 | `flushPendingGuidance()` — dequeues guidance blocked during agent speech |

#### `injectSpokenReEngagement()` — 1 active call site

| File | Line | Context |
|------|------|---------|
| `server/services/sensing-layer/silence-monitor.ts` | 623 | Called from `handleSilenceTimeout()` when user is silent too long |

#### `injectImmediateIntervention()` — **0 active call sites**

Defined at `guidance-injector.ts:295` but **never called anywhere in the codebase**. Dead code.

#### `injectSystemMessage()` — **0 active call sites**

Defined at `guidance-injector.ts:401` but **never called anywhere in the codebase**. Dead code.

### Server-Initiated Actions (No User Speech Required)

| Feature | Mechanism | Uses controlUrl? |
|---------|-----------|-----------------|
| **Silence Monitor** | `setTimeout()` in `silence-monitor.ts` | YES — `injectSpokenReEngagement()` via `type: 'say'` |
| **Pending Guidance Flush** | Triggered by `speech-update` webhook when agent stops speaking | YES — `injectGuidance()` via `type: 'add-message'` |
| **Session Cleanup** | `setInterval()` in `orchestration-service.ts` (lines 26–41) | NO — just removes stale in-memory sessions, no VAPI interaction |

**No other server-initiated features exist.** There are no background timers, cron jobs, or event-driven processes that proactively push content to VAPI besides the silence monitor.

### Complete controlUrl Dependency Map

Every feature that calls `controlUrl`:

1. **Real-time guidance injection** (`injectGuidance`) — triggered by `conversation-update` webhook → sensing layer → injects system message silently (`triggerResponseEnabled: false`)
2. **Silence re-engagement** (`injectSpokenReEngagement`) — triggered by silence timeout → forces agent to speak exact text (`type: 'say'`)
3. **Pending guidance flush** (`flushPendingGuidance` → `injectGuidance`) — triggered by `speech-update` webhook → dequeues guidance that was blocked during agent speech

### Migration Impact for controlUrl

With a custom LLM endpoint:
- **Guidance injection** (`injectGuidance`) → **ELIMINATED.** The custom LLM endpoint constructs the full response, so guidance becomes part of the prompt, not an injected side-channel.
- **Pending guidance flush** → **ELIMINATED.** No more guidance gating needed when the LLM endpoint controls the response directly.
- **Silence re-engagement** → **STILL NEEDS controlUrl** (or equivalent). The server must proactively make the agent speak when the user is silent. The custom LLM endpoint only fires when the user speaks. The `type: 'say'` command bypasses the LLM entirely, so this cannot be replaced by the custom LLM endpoint.

---

## Question 3: Agent System Prompt Source of Truth

### `server/prompts/` Directory

**File:** `server/prompts/master-pc-analyst.ts`
- Exports: `MASTER_PC_ANALYST_PROMPT`, `STREAMLINED_ANALYSIS_PROMPT`
- Purpose: Clinical therapeutic analysis using PCP/PCA frameworks — used for **post-session analysis**, not during active calls

**File:** `server/prompts/user-analysis-prompts.ts`
- Exports: `SESSION_SUMMARY_PROMPT`, `INTENT_ANALYSIS_PROMPT`, `CONCEPT_INSIGHTS_PROMPT`, `ANALYSIS_TYPES`
- Purpose: User-facing analysis (non-clinical language) — used for **post-session summaries**, not during active calls

**Neither file contains agent personality prompts for Sarah, Marcus, Mathew, or UNA.**

### Agent Personality Definitions — Source of Truth

**File:** `client/src/config/agent-configs.ts` (355 lines)

All four agents are defined in the `THERAPEUTIC_AGENTS` array:

| Agent | Lines | Key Personality Trait | Voice Provider | Model Temperature |
|-------|-------|----------------------|----------------|-------------------|
| **Sarah** | 226–253 | "Wise, maternal quality — like a trusted aunt" | ElevenLabs | 0.7 |
| **Marcus** | 255–282 | "Grounded, steady presence — done their own work" | ElevenLabs | 0.8 |
| **Mathew** | 284–317 | "Cerebral and direct — no hand-holding" | ElevenLabs | 0.9 |
| **UNA** | 319–349 | "Gentle, intuitive — feels her way into things" | ElevenLabs | 0.9 |

Each agent's `systemPrompt` field includes:
1. Agent-specific personality text
2. `${VOICE_MODEL_PROMPT}` — shared 128-line prompt (lines 41–169) defining how agents follow sensing layer guidance, handle silence, manage therapeutic posture
3. `${SESSION_CONTINUITY}` — shared session memory instructions (lines 175–186)

### Dynamic Prompt Construction

**Voice sessions** are built in `client/src/hooks/use-vapi.ts`, `startSession()` callback (lines 227–625):

```
Base agent systemPrompt (from agent-configs.ts)
  + Greeting generation instructions (lines 275–299)
  + Onboarding context (user's initial journey statements) (lines 301–330)
  + Last session context (lines 333–339)
  + Upload context (lines 342–375)
  + Memory context (PREVIOUS SESSION HISTORY) (lines 379–384)
  + First session introduction (lines 386–391)
  + Mid-call context tool description (lines 393–395)
  + User's first name (line 397)
```

**Text chat sessions** use a separate builder in `server/routes/chat-routes.ts`, `buildChatSystemPrompt()` (lines 36–71):
- Takes the same base `agentSystemPrompt` but wraps it in `TEXT CHAT MODE` instructions
- Adds memory context and session history
- **Used for text chat only** — called from `/api/chat/send-message` endpoint

### VAPI Assistant Configuration

**File:** `client/src/hooks/use-vapi.ts`, lines 451–603

```typescript
const assistantConfig = {
  name: `VASA-${selectedAgent.name}`,
  model: {
    provider: 'openai',
    model: selectedAgent.model.model,  // 'gpt-5.2'
    temperature: selectedAgent.model.temperature,
    messages: [
      { role: 'system', content: systemPrompt }  // Full constructed prompt
    ],
    maxTokens: 300,
    tools: [{ /* fetch_more_context function */ }]
  },
  voice: { /* ElevenLabs config from agent */ },
  serverUrl: '/api/vapi/webhook',
  serverMessages: ["assistant.started", "conversation-update", "end-of-call-report",
                    "status-update", "speech-update", "transcript"],
  transcriber: { provider: 'deepgram', model: 'flux-general-en' },
  metadata: { userId, agentName, agentId, ... }
};

await vapi.start(assistantConfig);  // Line 603
```

**Key finding:** Agents are **NOT pre-created in VAPI's dashboard.** The full assistant configuration (including system prompt) is constructed client-side and passed to `vapi.start()` as a transient config. No calls to `vapi.assistants.create` or `vapi.assistants.update` exist in the codebase.

### Webhook Payload — System Prompt Presence

The `conversation-update` webhook payload does **NOT** include the system prompt. The `message.conversation` array contains only `user` and `assistant` role messages. The system prompt lives only in VAPI's active memory from the initial `vapi.start()` call.

### Where Prompts Live — Summary

| Component | Location | Used For |
|-----------|----------|----------|
| Agent personalities (base) | `client/src/config/agent-configs.ts` | Voice + Text chat |
| VOICE_MODEL_PROMPT (shared) | `client/src/config/agent-configs.ts:41–169` | Voice sessions |
| SESSION_CONTINUITY (shared) | `client/src/config/agent-configs.ts:175–186` | Voice sessions |
| FIRST_SESSION_INTRODUCTION | `client/src/config/agent-configs.ts:194–219` | Voice sessions (new users) |
| Dynamic voice prompt assembly | `client/src/hooks/use-vapi.ts:269–397` | Voice sessions |
| Text chat prompt builder | `server/routes/chat-routes.ts:36–71` | Text chat only |
| Post-session analysis prompts | `server/prompts/*.ts` | Post-session analysis |
| Real-time guidance (injected) | `server/services/sensing-layer/guidance-injector.ts` | Active voice sessions via controlUrl |

### Migration Impact for System Prompts

For the custom LLM endpoint:
1. **Agent personality definitions** must be accessible server-side. Currently they live in `client/src/config/agent-configs.ts` — this file (or its data) needs to be importable from the server.
2. **Dynamic prompt assembly** currently happens client-side in `use-vapi.ts`. The custom LLM endpoint will need to replicate this assembly server-side, including memory context, session continuity, and onboarding data.
3. **Real-time sensing guidance** currently injected as side-channel system messages will instead be woven directly into the prompt context at each turn.
4. **VAPI dashboard has no prompts** — everything is code-driven, which is good for migration.

---

## Cross-Cutting Migration Summary

### What the Custom LLM Endpoint Replaces
- `processSensingLayerAsync()` — real-time guidance moves into prompt construction
- `injectGuidance()` — no longer needed; guidance is part of the response context
- `flushPendingGuidance()` — no longer needed
- `speech-update` webhook handler — guidance gating no longer needed
- `status-update` webhook handler — controlUrl no longer needed for guidance

### What Must Remain
- `call-started` webhook — session initialization, silence monitor start
- `end-of-call-report` webhook — session finalization, DB persistence of accumulated state
- **Silence monitor** — still needs controlUrl (or equivalent VAPI mechanism) for `type: 'say'` commands
- `enhancedTherapeuticTracker.processConversationUpdate()` — therapeutic movement tracking and DB writes (could move into custom LLM endpoint or stay as webhook handler)

### Open Question
The silence monitor's `injectSpokenReEngagement()` uses `type: 'say'` via controlUrl, which bypasses the LLM. If VAPI's custom LLM endpoint doesn't support server-initiated speech (only responding to user messages), the silence monitor will still need the controlUrl mechanism even after migration.
