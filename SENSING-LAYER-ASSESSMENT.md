# Sensing Layer Data Flow Assessment

> Generated 2026-03-06. Every claim references exact file and line number.

---

## 1. Entry Point — Where VAPI Sends Data Into the Backend

There are **two entry points** through which VAPI delivers user speech data to the sensing layer. Both are active, but they serve different roles:

### Entry Point A: Custom LLM Proxy (Primary — Synchronous Path)

- **File**: `server/routes/custom-llm-routes.ts`
- **Endpoint**: `POST /api/custom-llm/chat/completions` (line 23)
- **How it receives data**: VAPI is configured to use this server as a custom LLM. On every user turn, VAPI sends the full `messages` array (system + user + assistant turns), plus `metadata` containing `userId`, `agentName`, `sessionId`, and a `call` object with the `callId`.
- **Extraction** (lines 27-35):
  - `callId` from `req.body.call?.id`
  - `userId` from `req.body.metadata?.userId`
  - `agentName` from `req.body.metadata?.agentName`
  - `sessionId` from `req.body.metadata?.sessionId` (falls back to `callId`)
  - `userUtterance` = last message with `role === 'user'`
- **This is the primary sensing path** because it runs *before* the LLM response is generated. Guidance is injected into the system message before forwarding to OpenAI.

### Entry Point B: Webhook (Secondary — Asynchronous Path)

- **File**: `server/routes/webhook-routes.ts`
- **Endpoint**: `POST /api/vapi/webhook` (line 454)
- **Event types handled**:
  - `call-started` / `assistant.started` (line 533): Initializes session, stores `controlUrl`, initializes call state
  - `conversation-update` (line 585): Receives conversation/transcript data; processes through `enhancedTherapeuticTracker` and `processTranscript`, but **sensing layer processing was removed** from this path (see comment at line 644: *"Sensing layer processing is handled exclusively by the custom LLM endpoint"*)
  - `end-of-call-report` (line 687): Finalizes sensing session, triggers fragment extraction
  - `speech-update` (line 834): Tracks agent speaking state; flushes pending guidance when agent stops speaking
  - `status-update` (line 813): Extracts and stores `controlUrl`
  - `transcript` (lines 462, 498): Immediately returns 200 with no processing (partial Deepgram words — no actionable data)

**Critical note**: The webhook path at `conversation-update` *no longer* triggers `processSensingLayerAsync`. The comment at line 644 explicitly states sensing is handled by the custom LLM endpoint only. However, `processSensingLayerAsync` still exists in the file (line 204) and could be called if re-enabled.

---

## 2. The Sensing Pipeline Modules

The sensing layer lives in `server/services/sensing-layer/`. The main orchestrator is `SensingLayerService.processUtterance()` in `index.ts` (line 78).

### 2.1 Fast Sense (Fast Path)

- **File**: `server/services/sensing-layer/fast-sense.ts`
- **Function**: `fastSense()` (line 52)
- **Input**: `FastSenseInput` — `userId`, `callId`, `sessionId`, `utterance`, `exchangeCount`, `agentName`
- **Output**: `FastSenseResult` — `resonance` (matched narrative fragments), `isCriticalMoment` (boolean), `criticalMomentReason`, `guidanceInjection` (formatted string), `processingTimeMs`
- **What it does**:
  1. Queries narrative web for resonating fragments via `findResonatingFragments()` (line 70)
  2. Reads previous deep-path results from session state (lines 73-75)
  3. Detects critical moments via 4 checks (lines 78-122):
     - Constellation active + high similarity match (>0.7)
     - Register shift from Imaginary to Real (somatic indicators)
     - Previous movement was deepening with high CSS confidence (>0.7)
     - Explicit self-identification language
  4. Formats guidance injection string (line 125)
- **Failure behavior**: On any error, returns `emptyResult` with fallback guidance text: *"Sensing context unavailable. Follow therapeutic intuition."* (line 64). Never throws.

### 2.2 Narrative Web (Fragment Resonance)

- **File**: `server/services/sensing-layer/narrative-web.ts`
- **Key functions**:
  - `findResonatingFragments()` (line 176): Main entry called by fast-sense
  - `queryNarrativeWeb()` (line 98): Generates embedding via OpenAI `text-embedding-3-small`, then calls Supabase RPC `match_narrative_fragments` with threshold 0.3, limit 10
  - `getResonanceNetwork()` (line 129): Fetches resonance links between fragments (min strength 0.4)
  - `loadSessionNarrativeContext()` (line 297): Loads constellations and recent fragments at session start
- **Input**: userId + utterance string
- **Output**: `ResonanceResult` — `matchedFragments`, `activeLinks`, `constellationFragments`, `isConstellationActive`
- **Failure behavior**: Every function catches errors and returns empty arrays/results. Embedding failures return `[]` (line 94).

### 2.3 Session State (In-Memory Accumulator)

- **File**: `server/services/sensing-layer/session-state.ts`
- **Function**: `initializeSession()`, `getSessionState()`, `updateSessionState()`, etc.
- **Input**: callId, userId, sessionId
- **Output**: `SessionAccumulator` — accumulates register readings, significant moments, patterns, connections, CSS signals, state vector history
- **Purpose**: Avoids per-turn database writes. All data accumulates in memory and is persisted only at session end via `finalizeSession()`.
- **Failure behavior**: If session state doesn't exist when `processUtterance` is called, it creates one on-the-fly (index.ts lines 86-89).

### 2.4 Pattern Detection

- **File**: `server/services/sensing-layer/pattern-detection.ts`
- **Function**: `detectPatterns()` (exported)
- **Input**: `TurnInput` + `UserTherapeuticProfile`
- **Output**: `PatternDetectionResult` — `activePatterns[]`, `emergingPatterns[]`, `patternResonance[]`, `userExplicitIdentification`
- **How it works**: Uses Claude (Anthropic API, `claude-3-haiku`) for semantic pattern detection (line 20). Falls back for short utterances (<30 chars) or if `ANTHROPIC_API_KEY` is missing (line 28). Also does rule-based matching against existing user patterns.
- **Failure behavior**: If LLM call fails, falls back to rule-based matching only. Returns empty results for short utterances.

### 2.5 Register Analysis

- **File**: `server/services/sensing-layer/register-analysis.ts`
- **Function**: `analyzeRegister()` (exported)
- **Input**: `TurnInput` + `UserTherapeuticProfile`
- **Output**: `RegisterAnalysisResult` — `currentRegister` (Real/Imaginary/Symbolic), `registerDistribution`, `stucknessScore`, `fluidityScore`, `registerMovement`, `indicators`
- **How it works**: Purely algorithmic. Uses keyword matching against `REAL_MARKERS`, `IMAGINARY_MARKERS`, `SYMBOLIC_MARKERS` (lines 20-100+). No LLM calls. Calculates distribution scores, detects stuckness by comparing to register history.
- **Failure behavior**: Algorithmic — cannot fail unless inputs are undefined. Always returns a result.

### 2.6 Symbolic Mapping

- **File**: `server/services/sensing-layer/symbolic-mapping.ts`
- **Function**: `mapSymbolic()` (exported)
- **Input**: `TurnInput` + `UserTherapeuticProfile`
- **Output**: `SymbolicMappingResult` — `activeMappings[]`, `potentialConnections[]`, `awarenessShift`, `readyToSurface`, `generativeInsight`
- **How it works**: Uses Claude (Anthropic API) for semantic analysis (line 29). Detects metaphors, symbolic language, awareness shifts. Also performs rule-based matching against existing symbolic mappings and historical material.
- **Failure behavior**: Falls back for short utterances (<30 chars) or missing API key (line 37). LLM failure falls back to rule-based.

### 2.7 Movement Assessment

- **File**: `server/services/sensing-layer/movement-assessment.ts`
- **Function**: `assessMovement()` (exported)
- **Input**: `TurnInput` + `UserTherapeuticProfile`
- **Output**: `MovementAssessmentResult` — `trajectory`, `indicators` (deepening, integration, resistance, flooding, intellectualizing, looping), `sessionPosition`, `movementQuality`, `cssStage`, `cssStageConfidence`, `cssSignals[]`, `anticipation`
- **Architecture note** (lines 6-10): This module does NOT produce a CSS stage verdict per utterance. It produces `CSSSignal[]` that accumulate in session-state. Session-level CSS stage is assessed at milestone exchanges (every 5 exchanges).
- **How it works**: Keyword matching against `MOVEMENT_MARKERS` (lines 30-60+). No LLM calls.
- **Failure behavior**: Algorithmic — always returns a result.

### 2.8 State Vector (Coupling Engine)

- **File**: `server/services/sensing-layer/state-vector.ts`
- **Function**: `coupleStateVector()` (exported)
- **Input**: All four module outputs (patterns, register, symbolic, movement) + previous vectors + exchange count + session CSS stage
- **Output**: `TherapeuticStateVector` — `raw` (preserved unchanged), `coupled` (cross-module adjusted scores including `therapeuticMomentum`, `phaseTransitionProximity`, `symbolicActivation`), `velocity` (rates of change: `registerShiftRate`, `deepeningAcceleration`, `resistanceTrajectory`, `symbolicActivationRate`)
- **Purpose**: Models coupling between dimensions — register shifts influence movement scores, symbolic activation influences CSS stage, etc.
- **Failure behavior**: Pure computation on numeric inputs. Cannot fail unless inputs are malformed.

### 2.9 Guidance Generator

- **File**: `server/services/sensing-layer/guidance-generator.ts`
- **Function**: `generateGuidance()` (line 33)
- **Input**: `OrientationStateRegister` (coupled OSR) + `TurnInput`
- **Output**: `EnhancedTherapeuticGuidance` — `posture`, `registerDirection`, `strategicDirection`, `avoidances[]`, `framing`, `urgency`, `confidence`, `anticipationGuidance`, `symbolicContext`, `enhancedPosture`, `enhancedStrategicDirection`
- **How it works**:
  1. Always generates rule-based guidance first (line 46) — fast, deterministic
  2. Checks if situation is complex via `isComplexSituation()` (line 52) — triggers on flooding >0.5, awareness shift, high symbolic activation >0.8, pivotal CSS stages, strong resistance + stuckness, rich convergence, phase transition proximity >0.7
  3. If complex AND `ANTHROPIC_API_KEY` exists: calls Claude (`claude-3-haiku-20240307`) with 5-second timeout (lines 57-63). **Also fires RAG query concurrently** (line 522 in `generateEnhancedClaudeGuidance`)
  4. If Claude times out or fails: falls back to rule-based guidance (lines 66-72)
- **Failure behavior**: Always returns guidance. Claude failure gracefully falls back to rule-based. The rule-based path cannot fail.

### 2.10 Guidance Injector

- **File**: `server/services/sensing-layer/guidance-injector.ts`
- **Function**: `injectGuidance()` (line 40)
- **Input**: callId + guidance object + optional triggerResponse flag
- **Output**: boolean (success/failure)
- **How it works**: Sends guidance as a system message to VAPI via `controlUrl` POST request with `type: 'add-message'` (lines 88-101). Has deduplication (12-second window, line 13) and a speaking gate (won't inject while agent is speaking, queues instead, lines 59-63).
- **Failure behavior**: Returns false on: call not active (line 46), invalid controlUrl (line 53), agent speaking (queues instead, line 61), duplicate content (line 79), HTTP error (line 105), network error (line 120).

### 2.11 Fragment Extractor (Post-Session)

- **File**: `server/services/sensing-layer/fragment-extractor.ts`
- **Function**: `extractAndStoreFragments()` (exported)
- **Input**: userId, callId/sessionId, transcript (string or message array)
- **Output**: `{ fragmentCount, resonanceLinkCount }`
- **When called**: Fire-and-forget at end-of-call (webhook-routes.ts line 706)
- **How it works**: Uses Claude to extract up to 8 narrative fragments per session (line 12). Generates embeddings and stores in `narrative_fragments` table. Detects resonance links to existing fragments with similarity threshold 0.55 (line 13).
- **Failure behavior**: 30-second timeout (line 11). Catches all errors; logged but never throws.

### 2.12 Silence Monitor

- **File**: `server/services/sensing-layer/silence-monitor.ts`
- **Status**: **DISABLED** in current deployment (webhook-routes.ts line 577: comment says *"Disabled — custom LLM endpoint now handles therapeutic guidance injection pre-response"*)
- **What it would do**: Monitors silence duration, generates context-aware re-engagement messages via Claude, injects spoken messages via VAPI's "say" command.
- **Max re-engagements**: 4 (line 20)

### 2.13 Profile Writer (End-of-Session Persistence)

- **File**: `server/services/sensing-layer/profile-writer.ts`
- **Function**: `persistSessionProfile()` (exported)
- **Input**: userId + accumulated `SessionPatternRecord[]`, `SessionHistoricalRecord[]`, `SessionSymbolicRecord[]`
- **When called**: At session finalization (index.ts line 336)
- **What it does**: Writes accumulated session data to `user_patterns`, `user_historical_material`, and `symbolic_mappings` tables. Uses fuzzy matching to update existing patterns rather than creating duplicates.
- **Failure behavior**: Individual insert/update failures are logged but don't prevent other writes.

### 2.14 Call State (In-Memory Call Tracking)

- **File**: `server/services/sensing-layer/call-state.ts`
- **Purpose**: In-memory store for VAPI call control URLs, conversation history, exchange counts, agent speaking state, and sensing processing flags.
- **Key functions**: `trackVapiCall()` (line 31), `setControlUrl()` (line 85), `addToConversationHistory()` (line 160), `setAgentSpeakingState()` (line 249)
- **Cleanup**: Stale entries removed every 30 minutes (line 232), threshold 2 hours (line 80). Conversation history capped at 50 messages (line 184).

### 2.15 Knowledge Base (RAG Interface)

- See Section 3 below for detailed analysis.

---

## 3. RAG Retrieval

### When RAG is Triggered

RAG is triggered **only during complex situations** when the guidance generator calls Claude (guidance-generator.ts line 522, inside `generateEnhancedClaudeGuidance()`). It is NOT called on every turn.

The complexity check (`isComplexSituation()`, guidance-generator.ts line 164) triggers on:
- Flooding > 0.5
- Active awareness shift
- High symbolic activation (>0.8)
- Pivotal CSS stages (gesture_toward, completion, terminal) with confidence >0.5
- Strong resistance (>0.5) + high stuckness (>0.7)
- Strong symbolic connection (>0.7) + 3+ active patterns
- Phase transition proximity > 0.7

### The RAG Query Pipeline

1. **Query construction** (`buildRagQuery()`, knowledge-base.ts line 146):
   - Builds a pipe-delimited query from OSR components
   - Includes: first active pattern description, current register, stuckness flag, CSS stage name, anticipation timing phase, symbolic connection insight, movement trajectory
   - Fallback: `"therapeutic guidance PCA methodology"` (line 201)

2. **Document type selection** (`determineRelevantTypes()`, knowledge-base.ts line 214):
   - Always includes `protocol` and `guideline`
   - Includes `orientation` when: intervention timing is ready/approaching, symbolic connection is active, or register stuckness >0.5

3. **Tag selection** (`determineRelevantTags()`, knowledge-base.ts line 251):
   - Register name (lowercase)
   - CSS stage (underscores converted to hyphens)
   - Pattern types (lowercase, hyphenated)
   - Movement tag (`integration` if toward_mastery)
   - Symbolic tag (if connection exists)
   - Session position tags (session-opening, session-closing)

4. **Embedding generation** (`generateEmbedding()`, knowledge-base.ts line 32):
   - Model: `text-embedding-3-small`
   - Input truncated to 8000 chars (line 40)
   - 3-second timeout (line 36)

5. **Vector search** (`queryKnowledgeBase()`, knowledge-base.ts line 59):
   - Calls Supabase RPC `match_knowledge_chunks`
   - **Threshold**: 0.35 (passed from `getRelevantGuidance()` at line 311, overriding the function default of 0.7)
   - **Limit**: 4 chunks (line 310)
   - 5-second total timeout wrapping the entire query (line 68)
   - **SQL function** (supabase/functions/match_knowledge_chunks.sql line 15): Uses pgvector cosine distance, filters by types (via `metadata->>'type'`), tags (via `jsonb_array_elements_text(metadata->'tags')`), and optional user_id

6. **Context formatting** (`buildRetrievedContext()`, knowledge-base.ts line 122):
   - Formats chunks as markdown with type label, source, similarity percentage
   - Returns empty string if no chunks

### Where RAG Output Goes

The formatted RAG context string is inserted at the **top of the Claude prompt** in `generateEnhancedClaudeGuidance()` (guidance-generator.ts line 546):
```
You are a master psychodynamic therapist...
${retrievedContext}    <-- RAG content goes here

CURRENT UTTERANCE:
...
```

RAG runs as a **non-blocking concurrent promise** (line 522) while the OSR summary is prepared. The Claude call awaits the RAG result before proceeding.

### RAG is Also Triggered via Mid-Call Tool

A separate RAG path exists in the webhook tools handler (webhook-routes.ts line 394):
- **Endpoint**: `POST /api/vapi/tools`
- **Tool name**: `fetch_more_context`
- **Threshold**: 0.6 (higher than guidance generator's 0.35)
- **Limit**: 5 chunks
- This is a VAPI function-tool call that the voice model can invoke mid-conversation.

---

## 4. Guidance Injection

### Path A: Custom LLM Proxy (Inline Injection)

**File**: `server/routes/custom-llm-routes.ts`

Guidance is injected **directly into the messages array** before forwarding to OpenAI:

1. Fast-sense guidance string is captured (line 83): `guidanceInjection = fastResult.guidanceInjection`
2. If critical moment, deep-path guidance is appended (lines 107-113): posture, strategic direction, framing, avoidances
3. The injection is **appended to the system message** (lines 125-131):
   ```javascript
   const systemMessage = modifiedMessages.find((m: any) => m.role === 'system');
   if (systemMessage) {
     systemMessage.content = systemMessage.content + '\n\n' + guidanceInjection;
   }
   ```
4. If no system message exists, guidance is **silently skipped** (line 130: warning logged)
5. Modified messages are forwarded to OpenAI (line 136-142)

**Mechanism**: Appended to end of existing system message content with `\n\n` separator.

### Path B: VAPI Control URL (Async Injection)

**File**: `server/services/sensing-layer/guidance-injector.ts`

Used by the webhook path (`processSensingLayerAsync`) and potentially by the custom LLM's async deep processing:

1. Formats guidance as a structured system message (lines 129-184 or 189-311 for enhanced)
2. Sends POST to VAPI control URL (lines 88-101):
   ```json
   {
     "type": "add-message",
     "message": { "role": "system", "content": "..." },
     "triggerResponseEnabled": false
   }
   ```
3. The `triggerResponseEnabled: false` means VAPI adds the message to context but does NOT force an immediate response.

**Note on the async deep path** (custom-llm-routes.ts lines 159-181): After the response has already been streamed to the user, a fire-and-forget `sensingLayer.processUtterance()` runs. However, this guidance is NOT injected back via controlUrl — it only logs the result (line 176). The guidance from this async path is effectively **discarded** unless the webhook path's `processSensingLayerAsync` is re-enabled.

### Immediate Intervention Path

**File**: `server/services/sensing-layer/guidance-injector.ts`, line 316

`injectImmediateIntervention()` uses the same control URL but with higher-priority framing: `"[🚨 IMMEDIATE - PRIORITIZE THIS]"`. Currently only callable by the silence monitor (which is disabled) or directly.

### Spoken Re-Engagement Path

**File**: `server/services/sensing-layer/guidance-injector.ts`, line 368

`injectSpokenReEngagement()` uses VAPI's `type: 'say'` command instead of `add-message`. This forces the assistant to speak the exact text. Used exclusively by the silence monitor (currently disabled).

---

## 5. Custom LLM Proxy

### Is it Active?

**Yes.** The custom LLM proxy at `POST /api/custom-llm/chat/completions` is registered in the router and receives live traffic from VAPI.

### Full Request/Response Path

```
User speaks into microphone
    ↓
VAPI STT (Deepgram) transcribes speech to text
    ↓
VAPI sends POST to /api/custom-llm/chat/completions
    Body: { messages: [...], metadata: {userId, agentName, sessionId}, call: {id}, model, temperature, max_tokens }
    ↓
[Step 1] Extract metadata (custom-llm-routes.ts:27-35)
    callId, userId, agentName, sessionId, userUtterance
    ↓
[Step 2] Initialize session if first turn (custom-llm-routes.ts:44-67)
    - First turn: fire-and-forget initializeCallSession + loadSessionNarrativeContext
    - Recovery (later turn, no session): await both
    ↓
[Step 3] Fast Sense (custom-llm-routes.ts:72-85)
    - Queries narrative web for resonating fragments
    - Detects critical moments
    - Produces guidanceInjection string
    ↓
[Step 4] If critical moment: synchronous deep processing (custom-llm-routes.ts:88-114)
    - Runs full sensingLayer.processUtterance()
    - Appends deep analysis to guidanceInjection
    ↓
[Step 5] Inject guidance into system message (custom-llm-routes.ts:123-132)
    - Deep clone messages array
    - Find system message, append guidanceInjection
    ↓
[Step 6] Forward to OpenAI (custom-llm-routes.ts:136-154)
    - Model: req.body.model || 'gpt-4o'
    - Temperature: req.body.temperature ?? 0.7
    - Max tokens: req.body.max_tokens ?? 300
    - Streaming: true
    - SSE response streamed directly to VAPI
    ↓
[Step 7] Async deep processing (custom-llm-routes.ts:160-181)
    - Fire-and-forget sensingLayer.processUtterance()
    - Only runs if critical moment didn't already trigger deep path
    - Result is logged but NOT injected (no control URL POST)
    ↓
VAPI TTS (ElevenLabs) synthesizes LLM response to speech
    ↓
User hears therapeutic response
```

### The System Prompt in the Messages

VAPI sends the system prompt as the first message in the `messages` array. This is the `VOICE_MODEL_PROMPT` defined in `client/src/config/agent-configs.ts` (line 42). The sensing layer appends its guidance to this system message.

---

## 6. Failure Points

### 6.1 Session Initialization Race Condition

**Location**: `custom-llm-routes.ts:46-67`

On the first turn, session initialization and narrative context loading are **fire-and-forget** (lines 49, 52). If the first fast-sense query runs before initialization completes, `getSessionState()` returns null and fast-sense proceeds with no prior session context (fast-sense.ts lines 73-75: `latestRegister` and `latestMovement` will be null). This is by design — first turn has no prior state anyway.

**Risk**: If VAPI sends two requests very quickly (e.g., user speaks before greeting finishes), the second request could hit the recovery path (line 62) which awaits initialization, adding latency.

### 6.2 Narrative Context Cache Miss

**Location**: `custom-llm-routes.ts:52-58`

Narrative context is loaded fire-and-forget and cached by callId. If the cache hasn't populated yet when fast-sense queries `findResonatingFragments`, the narrative web query still runs against the database directly — the cache is for session-level context (constellations), not per-utterance resonance.

### 6.3 Missing controlUrl

**Location**: `webhook-routes.ts:554-561`

If the `call-started` webhook arrives without a `monitor.controlUrl` (VAPI assistant not configured for monitoring), the sensing layer generates guidance but **cannot inject it** via the control URL path. The custom LLM proxy path still works (it injects inline into messages).

**Fallback**: `status-update` events also extract controlUrl (webhook-routes.ts line 818-822), providing a second chance to capture it.

### 6.4 Guidance Injection Failures (Silent)

**Location**: `guidance-injector.ts:40-124`

Multiple conditions cause guidance to be silently dropped:
- Call not active (line 46): returns false
- Invalid controlUrl (line 53): returns false
- Agent currently speaking (line 59): queued, but only the latest guidance is kept (previous pending is overwritten by Map.set)
- Duplicate content within 12 seconds (line 79): skipped
- HTTP error from VAPI (line 105): logged, returns false
- Network error (line 120): logged, returns false

**Pending guidance overwrite**: Only one pending guidance per call is stored (line 61: `pendingGuidance.set(callId, guidance)`). If multiple guidances arrive while the agent speaks, only the last one is preserved.

### 6.5 OpenAI Forward Failure

**Location**: `custom-llm-routes.ts:182-207`

If OpenAI fails mid-stream (after headers sent), the proxy sends a graceful recovery message: *"I apologize, I experienced a brief interruption. Could you repeat what you just said?"* (line 193). If it fails before headers are sent, returns 500.

### 6.6 Sensing Layer Total Failure

**Location**: `custom-llm-routes.ts:116-120`

If the entire sensing try-block fails, `guidanceInjection` is set to empty string (line 119). The request continues to OpenAI **without any therapeutic guidance**. The voice model operates on its base system prompt only. This is logged but produces no visible error to the user.

### 6.7 Deep Path Default Guidance

**Location**: `index.ts:283-296`

If `processUtterance()` throws at any point, it returns a safe default:
```javascript
{ posture: 'hold', registerDirection: null, strategicDirection: 'Stay present...', avoidances: [], framing: null, urgency: 'low', confidence: 0.3 }
```

### 6.8 Rate Limiting in Webhook Path

**Location**: `webhook-routes.ts:188, 225-236`

The webhook path has a 5-second rate limit (`RATE_LIMIT_MS`). If multiple `conversation-update` events arrive within 5 seconds, only the first triggers processing. This is irrelevant while sensing is handled by the custom LLM path, but would matter if webhook processing is re-enabled.

### 6.9 Processing Lock (Webhook Path)

**Location**: `webhook-routes.ts:184, 219-223`

A synchronous lock prevents concurrent processing for the same call. If a previous processing is still running when a new webhook arrives, the new one is **silently skipped** (line 221).

### 6.10 Claude Timeout in Guidance Generator

**Location**: `guidance-generator.ts:57-63`

Claude call has a 5-second timeout. If it exceeds this, the rule-based guidance is used instead. The RAG query (part of the Claude path) has its own 5-second timeout (knowledge-base.ts:68). These are nested — if RAG takes 4.5 seconds and Claude takes 1 second, total is 5.5 seconds which exceeds the outer timeout.

### 6.11 Embedding Generation Failure

**Location**: `narrative-web.ts:82-96`, `knowledge-base.ts:32-53`

If OpenAI embedding generation fails (network, rate limit, etc.):
- Narrative web: returns empty array, fast-sense proceeds with no resonance data
- Knowledge base: throws, caught by the 5-second timeout wrapper, returns empty array

### 6.12 Missing System Message in Custom LLM

**Location**: `custom-llm-routes.ts:126-131`

If VAPI's message array has no `role: 'system'` message, guidance injection is **silently skipped** with only a console warning. The LLM operates without any therapeutic context.

### 6.13 Async Deep Path Results Discarded

**Location**: `custom-llm-routes.ts:159-181`

The async deep processing (Step 7) runs after the response is already streamed. The generated guidance is **only logged** (line 176) — it is not injected into the conversation via controlUrl. This means the deep analysis for non-critical turns is computed but **never reaches the voice model** for the current turn. It does, however, update session state (via `processUtterance`), which benefits subsequent turns via fast-sense's session state reads.

### 6.14 Profile Cache Staleness

**Location**: `index.ts:58, 94-101`

The user profile is cached per callId for the duration of the session. If a user's patterns are updated by a concurrent process (e.g., therapist portal), the sensing layer won't see the changes until the next session.

---

## 7. System Prompt Delivery

### Where the Therapeutic System Prompt is Stored

The voice model system prompt is defined as `VOICE_MODEL_PROMPT` in:
- **File**: `client/src/config/agent-configs.ts` (line 42)
- This is a client-side constant embedded in each agent configuration

Each therapeutic agent (Sarah, Marcus, Mathew, UNA) uses the same `VOICE_MODEL_PROMPT` but with different voice/model configurations.

### How It Is Loaded Per Session

When a VAPI call is initiated from the client:
1. The client's `use-vapi.ts` hook starts a call with a specific agent configuration
2. The agent's `systemPrompt` (= `VOICE_MODEL_PROMPT`) is sent to VAPI as part of the assistant configuration
3. VAPI includes this as the `role: 'system'` message in every request to the custom LLM endpoint

The system prompt is **not loaded from the database per session**. It is a static string compiled into the client bundle.

### Does the Sensing Layer Modify It Dynamically?

**Yes, on every turn.** The custom LLM proxy appends sensing data to the system message:

1. **Fast-sense guidance** (always appended when available): Contains register state, movement trajectory, resonating fragments, constellation status, critical moment alerts. Format starts with `[THERAPEUTIC CONTEXT - INTERNAL SENSING DATA - DO NOT REFERENCE DIRECTLY IN YOUR RESPONSE]` (fast-sense.ts line 165).

2. **Deep analysis** (appended only during critical moments): Contains posture, strategic direction, framing, avoidances (custom-llm-routes.ts lines 107-113).

The modification happens at `custom-llm-routes.ts:125-131`:
```javascript
systemMessage.content = systemMessage.content + '\n\n' + guidanceInjection;
```

The original system prompt is **never modified** — only the copy in `modifiedMessages` is changed. Each turn starts fresh with the original system prompt from VAPI's messages array.

### The Master PC Analyst Prompt

A separate, much longer prompt exists at `server/prompts/master-pc-analyst.ts` (line 3). This is the `MASTER_PC_ANALYST_PROMPT` used by `pca-master-analyst-service.ts` for offline transcript analysis — it is **NOT** used in the real-time voice pipeline. It defines the PCA/PCP framework, diagnostic structures, and CSS methodology for post-session analysis.

### The User Analysis Prompts

`server/prompts/user-analysis-prompts.ts` contains prompts for user-specific pattern recognition, register analysis, and symbolic mapping generation. These are used by `user-analysis-service.ts` for batch analysis — also **NOT** in the real-time voice pipeline.

---

## Summary: End-to-End Data Flow

```
USER SPEAKS → Microphone → VAPI (Deepgram STT)
    ↓
VAPI → POST /api/custom-llm/chat/completions
    ↓
[Extract metadata: callId, userId, utterance]
    ↓
[Initialize session if first turn (fire-and-forget)]
    ↓
[FAST SENSE: narrative web resonance + critical moment detection]
    ↓
[If critical: DEEP PATH synchronous]
    → detectPatterns (Claude + rules)
    → analyzeRegister (rules only)
    → mapSymbolic (Claude + rules)
    → assessMovement (rules only)
    → coupleStateVector (math)
    → generateGuidance (rules, or Claude + RAG if complex)
    ↓
[Append guidance to system message]
    ↓
[Forward to OpenAI gpt-4o with streaming]
    ↓
[Stream SSE response back to VAPI]
    ↓
VAPI → ElevenLabs TTS → Speaker → USER HEARS RESPONSE
    ↓
[Async: deep path processing (fire-and-forget, results update session state only)]
    ↓
[At end of call: finalize session → persist to DB → extract fragments]
```
