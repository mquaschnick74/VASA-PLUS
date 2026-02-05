# Investigation Report: Silence-Aware Re-engagement System

**Date:** 2026-02-05
**Branch:** `claude/investigate-silence-sensing-zfFjM`
**Status:** Investigation only — no code changes

---

## 1. Call State & Timing Infrastructure

**File:** `server/services/sensing-layer/call-state.ts`

### Does `CallState` store a timestamp for the last user utterance?

No, not directly. The `CallState` interface (lines 4-15) has:
- `createdAt: Date` — when the call state was created
- `conversationHistory` array — each entry has a `timestamp: Date`

There is **no dedicated `lastUserUtteranceAt` field**. The timestamp *can be derived* from `conversationHistory` by filtering for the last entry with `role: 'user'` and reading its `timestamp`. This is set via `new Date()` at the time `addToConversationHistory()` is called (line 98). This derivation requires iterating the array each time, so a dedicated field would be more efficient for a polling-based silence monitor.

**Gap:** A `lastUserUtteranceAt: Date` field on `CallState` would need to be added for O(1) timestamp access.

### Does it store the last guidance issued?

No. `CallState` (lines 4-15) has no guidance-related fields. The last guidance is stored in a *separate* in-memory store: the `SessionAccumulator` in `session-state.ts`, specifically `latestGuidance: TherapeuticGuidance | null` (line 42). There is also a `guidanceCache` Map in `webhook-routes.ts` (line 172) that caches the last guidance per callId with a timestamp.

### Existing cleanup/interval mechanisms

Two exist:
1. **Stale state cleanup** — `setInterval(cleanupStaleStates, 30 * 60 * 1000)` at line 155, runs every 30 minutes, removes entries older than 2 hours.
2. **Rate limiting map cleanup** — `cleanupCallCaches(callId)` in `webhook-routes.ts` (line 279), called at end-of-call.

Neither is suitable for silence monitoring. A silence monitor needs a **per-call timer** (setTimeout/setInterval per active call), not a global periodic sweep.

---

## 2. Conversation History Tracking

### Where is `addToConversationHistory()` called for user messages?

In `webhook-routes.ts`, inside the `conversation-update` case (lines 490-494):

```typescript
for (const msg of formattedConversation) {
  if (msg.role && msg.content) {
    addToConversationHistory(callId, msg.role, msg.content);
  }
}
```

This iterates **all** messages in each conversation-update (both user and assistant), not just the latest. VAPI sends the full conversation array, so the history accumulates duplicates. The history is capped at 50 entries (line 107).

### Can we reliably determine the timestamp of the last user message?

Yes, with a caveat. Each entry gets `timestamp: new Date()` at server receipt time (line 98), not VAPI-side speech time. For silence monitoring purposes, this is acceptable since we care about "time since the server last knew the user spoke."

### Is there any existing mechanism that tracks "time since last user speech"?

No. Nothing in the codebase computes or monitors elapsed time since the last user utterance. The rate limiter in `webhook-routes.ts` (line 168) tracks `lastProcessingTime` but that's time since last *sensing layer processing*, not last user speech.

---

## 3. Guidance Injection Capability

**File:** `server/services/sensing-layer/guidance-injector.ts`

### Can `injectGuidance()` be called at any time?

Yes. `injectGuidance()` (lines 24-80) is a standalone async function that:
1. Looks up `controlUrl` from call state
2. POSTs to the VAPI controlUrl
3. Returns a boolean

It has no dependencies on being called within a webhook handler.

### Does it set `triggerResponseEnabled: true`?

**No — this is a critical finding.** All three injection functions set `triggerResponseEnabled: false`:

- `injectGuidance()` — line 63: `triggerResponseEnabled: false`
- `injectImmediateIntervention()` — line 297: `triggerResponseEnabled: false`
- `injectSystemMessage()` — line 340: `triggerResponseEnabled: false`

For **silence re-engagement**, `triggerResponseEnabled: true` is **required** so the agent actually speaks unprompted.

### What happens if we call `injectGuidance()` while the agent is already speaking?

No collision protection exists in the current code. With `triggerResponseEnabled: true`, the agent may be interrupted depending on VAPI's interruptibility settings.

---

## 4. Sensing Layer State

**Files:** `server/services/sensing-layer/index.ts`, `server/services/sensing-layer/session-state.ts`

### Where is the last issued guidance stored?

Two places:

1. **`session-state.ts`** — `SessionAccumulator.latestGuidance` (line 42). Updated every turn in `updateSessionState()` (line 145). Accessible via `getSessionState(callId)?.latestGuidance`.

2. **`webhook-routes.ts`** — `guidanceCache` Map (line 172). Stores `{ guidance, timestamp, utteranceHash }` per callId.

For the silence monitor, `SessionAccumulator.latestGuidance` is the canonical source.

### Is there a `getLastGuidance(callId)` function?

No dedicated function exists. Access via:
```typescript
import { getSessionState } from './session-state';
const lastGuidance = getSessionState(callId)?.latestGuidance;
```

### Does `session-state.ts` track useful data?

Yes. The `SessionAccumulator` (lines 16-47) tracks:
- `latestGuidance` — last posture/urgency (needed for threshold calculation)
- `latestMovement` — movement assessment with `indicators.deepening`, `trajectory` (needed for "is user actively processing?")
- `latestRegister` — current register analysis
- `exchangeCount` — number of exchanges
- `startTime` — when the session started

All relevant to computing context-aware silence thresholds.

---

## 5. Integration Points

### Where should the silence monitor live?

**Recommended: New file `server/services/sensing-layer/silence-monitor.ts`**

The sensing layer directory has a clean modular structure:
```
sensing-layer/
  ├── call-state.ts          (data store)
  ├── session-state.ts       (session accumulation)
  ├── guidance-generator.ts  (guidance logic)
  ├── guidance-injector.ts   (VAPI communication)
  ├── movement-assessment.ts (movement tracking)
  ├── index.ts               (orchestrator)
  └── types.ts               (type definitions)
```

A new `silence-monitor.ts` fits this pattern. It would import from `call-state.ts`, `session-state.ts`, and `guidance-injector.ts`.

### Start/stop lifecycle

- **Start:** In `call-started` case (`webhook-routes.ts:404`), after `setControlUrl()` and `initializeCallSession()`
- **Stop:** In `end-of-call-report` case (`webhook-routes.ts:538`), alongside `clearControlUrl()` and `cleanupCallCaches()`
- **Reset timer:** Each time a user utterance arrives in `conversation-update` (line 488)

---

## 6. Edge Cases

### Agent mid-sentence when silence timer fires
With `triggerResponseEnabled: true`, the agent may cut off its own sentence. Mitigation: track "time since agent last spoke" using assistant message timestamps in `conversationHistory`. Only fire when *both* user and agent have been silent.

### Multiple silence timeouts queuing up
Use `setTimeout` (not `setInterval`) and re-arm only after confirmation. Track a `reEngagementCount` per call. Escalate messages (gentle → direct → session-ending). Cap at 2-3 re-engagements.

### User starts speaking as we inject re-engagement
VAPI turn-taking handles this — user speech interrupts agent. Design re-engagement messages to be gracefully interruptible (short, gentle opener).

### Preventing silence monitor during initial greeting
The agent speaks first on call start. The silence monitor should **not start timing until the first user utterance**. Either call `startMonitoring()` on first `conversation-update` with a user message, or add a `firstUserUtteranceReceived` flag.

### Silent call disconnection
If VAPI doesn't send `end-of-call-report`, the monitor keeps firing on a dead call. Set a maximum monitoring duration (e.g., 45 minutes) or maximum re-engagement count, after which the monitor self-terminates.

---

## Summary of Gaps

| Component | Status | Gap |
|---|---|---|
| Last user utterance timestamp | Derivable | Add `lastUserUtteranceAt` field to `CallState` for O(1) access |
| Last guidance (posture/urgency) | **Exists** | Accessible via `getSessionState(callId)?.latestGuidance` |
| Movement indicators (deepening) | **Exists** | Accessible via `getSessionState(callId)?.latestMovement` |
| `triggerResponseEnabled: true` | **Missing** | All injectors use `false`. Need a new injection path or parameter |
| Silence timer mechanism | **Missing** | Need per-call setTimeout management |
| Timer reset on user speech | **Missing** | Need hook in `conversation-update` handler |
| Start/stop lifecycle | **Missing** | Need hooks in `call-started` and `end-of-call-report` |
| Agent speaking state | **Missing** | No tracking of whether agent is currently speaking |
| Re-engagement escalation | **Missing** | No concept of graduated re-engagement |
| First utterance gate | **Missing** | No mechanism to delay monitoring until user first speaks |

## Key Risks

1. **`triggerResponseEnabled` is the most important change.** Without it, injected silence re-engagement messages won't cause the agent to speak.

2. **Timer management complexity.** Each active call needs its own timer that resets on every user utterance and stops on call end.

3. **Cost implications.** If the silence monitor calls `sensingLayer.processUtterance()` to generate context-aware re-engagement guidance, each silence event triggers a Claude API call. Consider generating re-engagement messages locally using already-stored `latestGuidance` and `latestMovement`.
